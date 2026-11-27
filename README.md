# Báo cáo giao ban Bình Long — Bản thử LAN

Checkout này được xuất có chọn lọc từ commit `07476dc` của `hospital-report-system` trên nhánh `codex/ux-bugfix`. Điểm gốc của checkout là `b6cd058` trên nhánh `codex/lan-trial`. Chỉ dùng tài khoản và dữ liệu mô phỏng. Bản thử phục vụ React/Vite và API Express cùng địa chỉ LAN. MySQL Community **8.4.13** chạy riêng trên máy đó.

## Chạy trên Windows

### Chạy bằng một nút và mang dữ liệu sang máy khác

1. **Trên máy cũ**, nếu dự án đang chạy, mở một cửa sổ PowerShell khác và chạy `node .\lan-trial\run.cjs stop` từ thư mục dự án. Đợi cửa sổ chạy web kết thúc. Sau đó sao chép **cả thư mục `.lan-trial`**, gồm `mysql-data`, `config.json`, `initialized` và thư mục MySQL đã giải nén `mysql-8.4.13-winx64`. Giữ bản sao lưu ở nơi riêng tư vì nó chứa cả dữ liệu và mật khẩu.
2. **Trên máy mới**, cài Node.js 24, tải và giải nén dự án từ GitHub, rồi bấm đúp **`Chay Bao Cao Giao Ban.cmd`**. Chọn thư mục `.lan-trial` đã sao lưu hoặc thư mục dự án chứa nó. Lần đầu cần Internet để npm tải thư viện nếu máy chưa có sẵn. Nút tự khôi phục dữ liệu, cập nhật đường dẫn MySQL và build giao diện khi cần.
3. Nếu có nhiều địa chỉ IPv4, chọn mạng bệnh viện theo danh sách. Sau khi cửa sổ hiện `LAN web listening`, mở địa chỉ được hiển thị và đăng nhập bằng tài khoản cũ. Các khoa dùng cùng địa chỉ nếu mạng bệnh viện cho phép TCP `3017`.
4. Những lần sau, bấm đúp nút để chạy với dữ liệu đã có. Giữ cửa sổ mở khi các khoa cần truy cập. Dùng lệnh `stop` ở bước 1 để tắt trước khi sao lưu tiếp.

Báo cáo đã nộp, hình ảnh và tài khoản được khôi phục theo thời điểm sao lưu. Hai máy lưu dữ liệu riêng sau khi chuyển. Nếu thư mục dự án trên máy mới đã chứa một bản `.lan-trial`, hãy giải nén mã nguồn vào một thư mục khác để khôi phục.

### Chạy bằng PowerShell

Mở PowerShell trong thư mục gốc của checkout. Dùng Node.js 24 và gói ZIP MySQL Community 8.4 cho Windows. Trong checkout đã bàn giao, MySQL giải nén tại `.lan-trial/mysql-8.4.13-winx64`. Nếu dựng trên máy khác, tải và giải nén gói MySQL Community trước khi ngắt Internet. [MySQL Community Server cho Windows](https://dev.mysql.com/downloads/mysql/8.4.html?os=3)

```powershell
npm ci --ignore-scripts
npm --prefix client ci --ignore-scripts
npm run build

# Chỉ chạy init một lần với gói MySQL riêng cho bản thử.
$mysqld = Join-Path $PWD '.lan-trial\mysql-8.4.13-winx64\bin\mysqld.exe'
node .\lan-trial\run.cjs init $mysqld

# Dùng IPv4 của card mạng nối vào LAN cần thử.
Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, IPAddress
npm start -- 192.168.1.9
```

Mở [http://192.168.1.9:3017](http://192.168.1.9:3017) trên thiết bị cùng LAN. Đổi `192.168.1.9` theo IPv4 thực tế của máy chạy web. Nếu LAN có VLAN, Wi-Fi cách ly máy khách hoặc Firewall Windows chặn kết nối, IT cần cho phép TCP `3017` từ subnet thử đến máy chủ. MySQL chỉ nghe `127.0.0.1:33317`.

Khi đã cài gói và build, giữ nguyên `.lan-trial` rồi dùng các lệnh dưới đây để xác minh, nạp lại fixture còn thiếu hoặc khởi động lại. `seed` giữ các báo cáo và tài khoản đã có. Dùng cửa sổ PowerShell khác cho `check`, `seed` và `stop` trong khi `start` đang chạy.

```powershell
node .\lan-trial\run.cjs check
node .\lan-trial\run.cjs seed
node .\lan-trial\run.cjs stop
npm start -- 192.168.1.9
```

## Tài khoản và dữ liệu mô phỏng

`init` sinh mật khẩu riêng cho `lan.noi`, `lan.nhi` và `lan.khnv`, rồi lưu trong `.lan-trial/test-accounts.json` cùng ngày dữ liệu mẫu. Xem tệp này tại máy chủ thử để lấy mật khẩu. Ca trực giả của Khoa Nội có trạng thái `draft`, Khoa Nhi có trạng thái `submitted`. Chọn đúng ngày ghi trong tệp để xem ca mẫu. Chọn ngày khác để thử tạo báo cáo mới.

Dùng `lan.khnv` để xem trạng thái nộp, thống kê và trình chiếu. Cơ sở dữ liệu, cấu hình, khóa ký và ảnh nén đã lưu vào báo cáo nằm trong `.lan-trial/`, thư mục Git bỏ qua.

Tạo tài khoản khoa bổ sung bằng API quản trị có sẵn. Ví dụ dưới đây dùng mã khoa Ngoại tổng hợp `ngoai_th`. Chọn một khoa có biểu mẫu và chưa có tài khoản khoa trong DB thử.

```powershell
$lan = 'http://192.168.1.9:3017'
$khnv = (Get-Content .lan-trial/test-accounts.json -Raw | ConvertFrom-Json).accounts |
  Where-Object username -eq 'lan.khnv'
$session = Invoke-RestMethod "$lan/api/auth/login" -Method Post -ContentType 'application/json' -Body (
  @{ username = $khnv.username; password = $khnv.password } | ConvertTo-Json
)
$password = Read-Host 'Mật khẩu mới của tài khoản thử' -MaskInput
Invoke-RestMethod "$lan/api/admin/accounts" -Method Post -ContentType 'application/json' -Headers (
  @{ Authorization = "Bearer $($session.data.token)" }
) -Body (@{
  username = 'lan.ngoai'; password = $password; department_code = 'ngoai_th'
  department_name = 'Khoa Ngoại tổng hợp (thử)'; role = 'department'
} | ConvertTo-Json) | Select-Object success
```

## MySQL và kiểm tra đích

- `database/schema.sql` tạo ba bảng gốc `users`, `reports`, `transfer_cases`. Trình khởi tạo thay tên schema cố định bằng `hospital_report_lan_trial` trước khi áp dụng. `lan-trial/schema-extension.sql` dùng định nghĩa từ `fix_case_tables.js`, `setup_all_tables.js` và các trường controller yêu cầu. Schema gốc thiếu `reports.nurse_name`, `reports.overtime_staff`, `transfer_cases.images` và DDL cho các bảng ca bệnh còn lại và nhân sự. Giữ phần bổ sung riêng cho lần dựng này.
- `server/src/config/db.js` bổ sung cột, khóa và các bảng audit/hệ thống/biểu mẫu theo migration trong mã nguồn. Nhánh LAN báo lỗi migration ngoài lỗi cột, index hoặc tên khóa đã tồn tại. Một số bảng changelog và thùng rác được tạo theo yêu cầu bởi controller gốc.
- `run.cjs` gọi `mysqld.exe --no-defaults` với datadir `.lan-trial/mysql-data` và địa chỉ loopback cố định. Trước khi chạy DDL hoặc bật Express, trình khởi động đối chiếu UUID trong `auto.cnf`, đường dẫn datadir, cổng, bind address và schema. Migration của app, seed và kiểm thử dùng tài khoản chỉ được cấp quyền trong `hospital_report_lan_trial`. Cấu hình lấy từ `.lan-trial/config.json`; có biến DB, JWT hoặc SMTP kế thừa thì dừng trước khi kết nối. Tệp cấu hình và mật khẩu được sinh cục bộ. Bản thử không dùng Aiven production, Vercel, dữ liệu thật hay đồng bộ.
- `authController.js` đọc tài khoản khoa từ `users` và tài khoản mở rộng từ `system_users`. `reportController.js` ghi `reports` và bảng ca bệnh trong một giao dịch. Ảnh được nén tại trình duyệt và lưu dưới dạng data URL trong JSON của cột `images` (`LONGTEXT`). `adminController.js` cung cấp trạng thái theo ngày và chỉ lấy báo cáo đã nộp cho trình chiếu. `analyticsController.js` tổng hợp số liệu theo kỳ. Tài nguyên giao diện và thư viện xuất PDF được phục vụ cùng web LAN. Gửi email kho lưu trữ bị tắt ở bản này.

## Kiểm thử

Playwright dùng Chromium cài sẵn. Nếu thiếu trình duyệt, tải trước khi ngắt Internet bằng `npx playwright install chromium`. Test dùng địa chỉ IPv4 của máy chủ và chặn mọi URL tài nguyên trình duyệt khác ngoài origin LAN. Chọn ngày mô phỏng khác ngày fixture.

```powershell
npm test -- flow 192.168.1.9 2026-11-23
node .\lan-trial\run.cjs stop
# Ở cửa sổ dịch vụ, chạy lại npm start -- 192.168.1.9
npm test -- persist 192.168.1.9 2026-11-23
```

Kết quả ngày **25/11/2026** trên máy dựng, địa chỉ Wi-Fi `192.168.1.9:3017`:

| Bài thử | Kết quả |
| --- | --- |
| Chromium máy tính và Pixel 7 giả lập | Hai khoa đăng nhập, tạo, mở lại, sửa và nộp phiếu ngày 23/11/2026. Khoa Nội đính kèm ảnh PNG mô phỏng. |
| KHNV | Lịch báo cáo hiện 2/12 khoa đã nộp. Tab thống kê và trình chiếu mở được. Ca chuyển viện và ảnh xuất hiện trên slide. |
| Trình duyệt chỉ được truy cập origin LAN | Cả `flow` và `persist` đều ghi nhận 0 yêu cầu ra ngoài. |
| Tắt và khởi động lại web cùng MySQL | Phiếu Khoa Nội vẫn có cùng ID `5` và ảnh có cùng SHA-256. Slide hiển thị lại ảnh từ DB thử. |
| Chặn sai cấu hình | `check` dừng khi có `DATABASE_URL` mô phỏng trỏ ngoài. Nạp trực tiếp DB pool cũng dừng nếu chưa qua bước xác minh. |

Ảnh kiểm tra được lưu trong `.lan-trial/presentation-flow.png` và `.lan-trial/presentation-persist.png`. Nhật ký MySQL ở `.lan-trial/mysql.log`. Khi chạy nền, xem thêm `.lan-trial/web.log` và `.lan-trial/web-errors.log`.

### Nghiệm thu còn lại tại Trung tâm

Thử tại Trung tâm bằng laptop và điện thoại thật trên cùng LAN. Đầu tiên mở trang khi WAN còn hoạt động. Ngắt uplink Internet và giữ Wi‑Fi/Ethernet, tắt dữ liệu di động trên điện thoại, mở mới trang để loại cache, rồi đăng nhập khoa → tạo báo cáo ngày thử → thêm ảnh giả ở **Ca chuyển viện** → nộp → mở lại và sửa. Đăng nhập KHNV → chọn đúng ngày → kiểm tra trạng thái **Đã nộp**, thống kê và mở **Trình chiếu giao ban**. Khởi động lại web và MySQL với cùng thư mục `.lan-trial`, sau đó xác minh báo cáo, số liệu và ảnh vẫn mở được. Bước này xác nhận kết nối từ thiết bị thứ hai và WAN thực sự đã ngắt.

## Tệp thay đổi so với điểm gốc `b6cd058`

- `lan-trial/config.cjs`, `run.cjs`, `schema-extension.sql`, `seed.cjs`, `smoke.cjs` — cấu hình, khởi tạo, dữ liệu giả và kiểm thử.
- `package.json`, `server/server.js`, `server/src/app.js`, `server/src/config/db.js` — lệnh build/chạy/test, xác minh DB và phục vụ web cùng API.
- `server/src/controllers/{adminController,authController,reportController,userManageController}.js`, `server/src/middleware/auth.js`, `server/src/routes/adminRoutes.js` — báo cáo theo khoa, tài khoản thử, ký JWT, trình chiếu, thống kê DB và tắt email.
- `client/index.html`, `client/src/{App.jsx,index.css}`, `client/src/services/uploadService.js`, `client/src/pages/ReportPage.jsx`, `client/src/components/common/{DepartmentPrintView,MedicalPrintView}.jsx`, `client/src/components/admin/tabs/DatabaseTab.jsx` — tài nguyên và ảnh nội bộ, hiển thị báo cáo đã lưu và thông tin DB thử.
- `README.md` — hướng dẫn bàn giao. Quy tắc bỏ qua `.lan-trial/` và theo dõi DDL đã được lưu trong `.gitignore` ngay từ commit gốc của checkout.
