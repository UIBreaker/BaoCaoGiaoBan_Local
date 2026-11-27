$ErrorActionPreference = 'Stop'

$mysqlFolder = 'mysql-8.4.13-winx64'
$mysqlExecutable = "$mysqlFolder\bin\mysqld.exe"
$utf8 = [Text.UTF8Encoding]::new($false)

function Select-BackupFolder {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = [Windows.Forms.FolderBrowserDialog]::new()
    try {
        $dialog.Description = 'Chọn thư mục .lan-trial đã sao lưu hoặc thư mục dự án chứa bản sao lưu đó.'
        $dialog.ShowNewFolderButton = $false
        if ($dialog.ShowDialog() -eq 'OK') { $dialog.SelectedPath }
    } finally {
        $dialog.Dispose()
    }
}

function Restore-LanBackup([string] $source, [string] $destination) {
    $nested = Join-Path $source '.lan-trial'
    if (Test-Path -LiteralPath $nested -PathType Container) { $source = $nested }
    if (Test-Path -LiteralPath $destination) {
        throw 'Máy này đã có thư mục .lan-trial. Hãy dùng một thư mục dự án mới để khôi phục bản sao lưu.'
    }

    foreach ($file in @('initialized', 'config.json', 'mysql-data\auto.cnf', 'mysql-data\ibdata1', 'mysql-data\mysql.ibd', $mysqlExecutable)) {
        if (!(Test-Path -LiteralPath (Join-Path $source $file) -PathType Leaf)) {
            throw "Bản sao lưu thiếu $file. Hãy chọn thư mục .lan-trial đầy đủ."
        }
    }
    $data = Join-Path $source 'mysql-data'
    if (!(Test-Path -LiteralPath (Join-Path $data 'hospital_report_lan_trial') -PathType Container)) {
        throw 'Bản sao lưu thiếu cơ sở dữ liệu hospital_report_lan_trial.'
    }
    if (Get-ChildItem -LiteralPath $data -Filter '*.pid' -File -Force) {
        throw 'Bản sao lưu còn tệp PID của MySQL. Hãy khởi động và tắt dự án đúng cách trên máy cũ, rồi sao chép lại.'
    }

    $config = Get-Content -LiteralPath (Join-Path $source 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($config.database -ne 'hospital_report_lan_trial' -or !$config.executable) {
        throw 'Cấu hình trong bản sao lưu không phải cấu hình MySQL của bản thử LAN.'
    }
    $config.executable = Join-Path $destination $mysqlExecutable
    $stage = Join-Path (Split-Path -Parent $destination) ('.lan-trial-restore-' + [Guid]::NewGuid())
    $stage = (New-Item -ItemType Directory -Path $stage).FullName
    try {
        foreach ($item in @('mysql-data', $mysqlFolder, 'initialized', 'test-accounts.json', 'department-accounts.json')) {
            $sourceItem = Join-Path $source $item
            if ($item -in @('test-accounts.json', 'department-accounts.json') -and !(Test-Path -LiteralPath $sourceItem)) { continue }
            Copy-Item -LiteralPath $sourceItem -Destination $stage -Recurse -Force
        }
        [IO.File]::WriteAllText((Join-Path $stage 'config.json'), ($config | ConvertTo-Json -Depth 10), $utf8)
        [IO.Directory]::Move($stage, $destination)
    } finally {
        if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    }
}

function Get-LanAddresses {
    foreach ($adapter in [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
        if ($adapter.OperationalStatus -ne 'Up' -or $adapter.NetworkInterfaceType -notin @('Ethernet', 'GigabitEthernet', 'FastEthernetT', 'FastEthernetFx', 'Wireless80211')) { continue }
        foreach ($entry in $adapter.GetIPProperties().UnicastAddresses) {
            $address = $entry.Address
            if ($address.AddressFamily -ne 'InterNetwork' -or [Net.IPAddress]::IsLoopback($address) -or
                $address.IPAddressToString -like '169.254.*' -or $address.Equals([Net.IPAddress]::Any)) { continue }
            [pscustomobject]@{
                Interface = $adapter.Name
                Id = $adapter.Id
                Address = $address.IPAddressToString
            }
        }
    }
}

function Select-LanAddress([string] $preferenceFile) {
    $addresses = @(Get-LanAddresses)
    if (!$addresses.Count) { throw 'Chưa tìm thấy IPv4 của mạng LAN. Hãy kết nối Wi-Fi hoặc cắm dây mạng rồi chạy lại.' }
    if ($addresses.Count -eq 1) { return $addresses[0] }

    if (Test-Path -LiteralPath $preferenceFile -PathType Leaf) {
        $saved = @(Get-Content -LiteralPath $preferenceFile -TotalCount 2)
        $preferred = @($addresses | Where-Object { $_.Id -eq $saved[0] })
        if ($preferred.Count -eq 1) { return $preferred[0] }
        if ($saved.Count -eq 2) {
            $previousAddress = $preferred | Where-Object Address -eq $saved[1]
            if ($previousAddress) { return $previousAddress }
        }
    }
    for ($index = 0; $index -lt $addresses.Count; $index++) {
        Write-Host ('{0}. {1} ({2})' -f ($index + 1), $addresses[$index].Interface, $addresses[$index].Address)
    }
    $choice = 0
    do {
        $answer = Read-Host 'Chọn số tương ứng với mạng bệnh viện'
    } until ([int]::TryParse($answer, [ref] $choice) -and $choice -ge 1 -and $choice -le $addresses.Count)
    return $addresses[$choice - 1]
}

function Start-LanReport {
    $project = Split-Path -Parent $PSScriptRoot
    Set-Location -LiteralPath $project
    if (!(Get-Command node.exe -ErrorAction SilentlyContinue) -or !(Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'Hãy cài Node.js 24 rồi mở lại Chạy Báo Cáo Giao Ban.'
    }
    $state = Join-Path $project '.lan-trial'
    $preferenceFile = Join-Path $state 'lan-interface.txt'
    if (!(Test-Path -LiteralPath (Join-Path $state 'initialized') -PathType Leaf)) {
        if (Test-Path -LiteralPath $state) {
            throw 'Thư mục .lan-trial hiện tại chưa khởi tạo xong. Hãy dùng một thư mục dự án mới để khôi phục bản sao lưu.'
        }
        Write-Host 'Lần đầu chạy. Hãy chọn bản sao lưu từ máy cũ.'
        $backup = Select-BackupFolder
        if (!$backup) { return }
        Write-Host 'Đang sao chép cơ sở dữ liệu và MySQL...'
        Restore-LanBackup $backup $state
    }
    $network = Select-LanAddress $preferenceFile
    [IO.File]::WriteAllLines($preferenceFile, [string[]] @($network.Id, $network.Address), $utf8)

    $installedClient = $false
    if (!(Test-Path -LiteralPath 'node_modules/.package-lock.json') -or !(Test-Path -LiteralPath 'node_modules/mysql2/package.json')) {
        & npm.cmd ci --ignore-scripts
        if ($LASTEXITCODE -ne 0) { throw 'Không cài được thư viện máy chủ. Kiểm tra Internet rồi chạy lại.' }
    }
    if (!(Test-Path -LiteralPath 'client/node_modules/.package-lock.json') -or !(Test-Path -LiteralPath 'client/node_modules/.bin/vite.cmd')) {
        & npm.cmd --prefix client ci --ignore-scripts
        if ($LASTEXITCODE -ne 0) { throw 'Không cài được thư viện giao diện. Kiểm tra Internet rồi chạy lại.' }
        $installedClient = $true
    }
    if ($installedClient -or !(Test-Path -LiteralPath 'client/dist/index.html')) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Không tạo được bản giao diện. Xem lỗi build ở trên.' }
    }

    Write-Host "Đang khởi động trên mạng $($network.Interface)."
    Write-Host 'Giữ cửa sổ này mở. Sau khi thấy dòng LAN web listening, các khoa truy cập:'
    Write-Host "http://$($network.Address):3017" -ForegroundColor Cyan
    & node.exe .\lan-trial\run.cjs start $network.Address
    if ($LASTEXITCODE -ne 0) { throw 'Dự án dừng do lỗi. Xem chi tiết ở trên và nhật ký .lan-trial\mysql.log.' }
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        Start-LanReport
    } catch {
        [Console]::Error.WriteLine($_.Exception.Message)
        exit 1
    }
}
