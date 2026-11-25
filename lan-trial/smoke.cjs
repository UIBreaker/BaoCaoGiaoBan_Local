const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const os = require('node:os');
const { chromium, devices, expect } = require('@playwright/test');
const trial = require('./config.cjs');
const { accountsFile } = require('./seed.cjs');

const [mode, ip, date] = process.argv.slice(2);
const origin = `http://${ip}:${trial.webPort}`;
const evidence = path.join(trial.state, 'smoke-result.json');
const imageName = 'anh-mo-phong-lan.png';
const patientName = 'CA MO PHONG LAN';

async function login(context, account) {
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByText('CHẠM ĐỂ BẮT ĐẦU', { exact: true }).click({ force: true });
  await page.getByPlaceholder('VD: Khnv hoặc noi.bvbl...').fill(account.username);
  await page.locator('input[type=password]').fill(account.password);
  await page.getByRole('button', { name: /đăng nhập hệ thống/i }).click();
  await expect(page).toHaveURL(`${origin}/${account.role === 'admin' ? 'admin' : 'report'}`);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  assert(token);
  return { page, token };
}

async function api(page, token, url) {
  const response = await page.request.get(`${origin}/api/${url}`, { headers: { Authorization: `Bearer ${token}` } });
  assert(response.ok(), `${url} returned HTTP ${response.status()}`);
  const body = await response.json();
  assert(body.success, `${url} unsuccessful`);
  return body.data;
}

async function newContext(browser, options, attemptedOutside, errors) {
  const context = await browser.newContext({
    ...options, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', serviceWorkers: 'block',
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    attemptedOutside.push(url.origin);
    return route.abort('internetdisconnected');
  });
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /content security policy/i.test(message.text())) errors.push(message.text());
    });
  });
  return context;
}

async function submit(page, department, withImage) {
  const dateInput = page.locator('input[type=date]');
  const reportLoaded = page.waitForResponse(response => response.url() === `${origin}/api/reports/${department}/${date}`);
  await page.goto(`${origin}/report`);
  await dateInput.waitFor();
  if (await dateInput.inputValue() !== date) await dateInput.fill(date);
  const load = await reportLoaded;
  assert(load.ok());
  const { data: previous } = await load.json();
  const next = page.getByRole('button', { name: /tiếp tục nhập số liệu chuyên môn/i });
  if (!previous) {
    const doctor = page.getByPlaceholder(/tên Bác sĩ trực chính/);
    await doctor.fill(`Bác sĩ mô phỏng ${department.toUpperCase()}`);
    await doctor.press('Enter');
  }

  const room = page.getByPlaceholder(/VD: Phòng cấp cứu/);
  if (!withImage) await expect(room).toHaveValue(/LAN đầu/);
  await room.fill(withImage ? `LAN đầu ${department}` : `LAN sau chỉnh sửa ${department}`);
  await next.click();
  if (withImage && department === 'noi') {
    const name = page.getByPlaceholder('VD: Nguyễn Văn A');
    if (!previous?.transferCases?.length) {
      await page.getByRole('button', { name: /thêm ca chuyển viện/i }).click();
    }
    await name.first().fill(patientName);
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#14532d';
      ctx.fillRect(0, 0, 96, 64);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('LAN TEST', 15, 35);
      return canvas.toDataURL().split(',')[1];
    });
    if (!(await page.getByAltText(imageName).count())) {
      await page.locator('input[type=file]:not([capture])').first()
        .setInputFiles({ name: imageName, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    }
    await expect(page.getByAltText(imageName).first()).toBeVisible();
  }

  await page.getByRole('button', { name: /nộp báo cáo giao ban ngay/i }).click();
  const submitted = page.waitForResponse(response => response.url() === `${origin}/api/reports` && response.request().method() === 'POST');
  await page.getByRole('button', { name: /đồng ý & nộp báo cáo/i }).click();
  const response = await submitted;
  const result = await response.json();
  assert(response.ok() && result.success, `Submit ${department}: HTTP ${response.status()} (${result.error || ''})`);
  console.log(`${department}: ${withImage ? (previous ? 'form submitted' : 'created') : 'edited and resubmitted'}.`);
}

async function inspect(admin, seedDate) {
  const { page, token } = admin;
  const status = await api(page, token, `admin/departments/${date}`);
  for (const code of ['noi', 'nhi']) assert.equal(status.find(item => item.departmentCode === code)?.status, 'submitted');
  const initial = await api(page, token, `admin/departments/${seedDate}`);
  assert.equal(initial.find(item => item.departmentCode === 'noi')?.status, 'draft');
  assert.equal(initial.find(item => item.departmentCode === 'nhi')?.status, 'submitted');
  const seedSlides = await api(page, token, `admin/presentation/${seedDate}`);
  assert.deepEqual(seedSlides.map(item => item.department_code), ['nhi']);
  await api(page, token, `admin/analytics/stats?range=day&date=${date}`);
  const db = await api(page, token, 'admin/database-stats');
  assert.equal(db.databaseName, trial.database);
  const accounts = await api(page, token, 'admin/accounts');
  assert(['lan.noi', 'lan.nhi', 'lan.khnv'].every(username => accounts.some(account => account.username === username)));

  const [year, month, day] = date.split('-');
  const formattedDate = `${day}/${month}/${year}`;
  await page.getByRole('button', { name: /mở lịch trạng thái báo cáo/i }).click();
  await page.getByLabel('Chọn năm').selectOption(year);
  await page.getByLabel('Chọn tháng').selectOption(String(Number(month)));
  await page.getByRole('button', { name: new RegExp(`^${formattedDate}: .*2/12 khoa đã nộp`) }).click();
  await expect(page.getByRole('heading', { name: 'Khoa Nội (thử)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /số liệu thống kê/i }).click();
  await expect(page.getByText('BÁO CÁO THỐNG KÊ & PHÂN TÍCH TOÀN VIỆN', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /báo cáo giao ban.*\/12/i }).click();
  const loaded = page.waitForResponse(response => response.url() === `${origin}/api/admin/presentation/${date}`);
  await page.getByRole('button', { name: 'Trình Chiếu Giao Ban', exact: true }).click();
  const response = await loaded;
  assert(response.ok());
  const { data } = await response.json();
  const report = data.find(item => item.department_code === 'noi');
  const image = report?.transfer_cases?.[0]?.images?.[0];
  assert.equal(report?.room, 'LAN sau chỉnh sửa noi');
  assert.equal(data.find(item => item.department_code === 'nhi')?.room, 'LAN sau chỉnh sửa nhi');
  assert.equal(report.transfer_cases[0].patient_name, patientName);
  assert.equal(image?.name, imageName);
  assert.match(image.url, /^data:image\/jpeg;base64,/);

  const slide = page.locator('.presentation-slide-next, .presentation-slide-prev');
  await page.getByText(/bỏ qua intro/i).click({ force: true });
  await expect(slide).toBeVisible({ timeout: 15000 });
  let found = false;
  let imageRendered = false;
  for (let index = 0; index < 45; index++) {
    found ||= (await slide.innerText()).includes(patientName);
    imageRendered ||= await slide.locator('img').evaluateAll(
      (images, expected) => images.some(img => img.src === expected && img.complete && img.naturalWidth > 0),
      image.url,
    );
    if (found && imageRendered) break;
    await page.keyboard.press('ArrowRight');
  }
  assert(found, 'The synthetic case must appear on a slide.');
  assert(imageRendered, 'The attachment must render on a slide.');
  await page.screenshot({ path: path.join(trial.state, `presentation-${mode}.png`) });
  console.log('Daily status, analytics and rendered presentation verified.');
  return { id: report.id, image: require('node:crypto').createHash('sha256').update(image.url).digest('hex') };
}

async function main() {
  assert(['flow', 'persist'].includes(mode) && net.isIPv4(ip) && /^\d{4}-\d{2}-\d{2}$/.test(date || ''),
    'Use node lan-trial/smoke.cjs flow|persist <this host IPv4> <test date YYYY-MM-DD>.');
  assert(Object.values(os.networkInterfaces()).flat().some(address => address?.address === ip), 'Supply an IPv4 address on this host.');
  await trial.enableApp(trial.readConfig());
  const fixtures = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
  assert.notEqual(date, fixtures.date, 'Choose a date other than the seed date.');

  const attemptedOutside = [];
  const errors = [];
  const browser = await chromium.launch({ args: ['--no-proxy-server', '--disable-background-networking'] });
  try {
    const desktopOptions = { viewport: { width: 1440, height: 900 } };
    const account = code => fixtures.accounts.find(item => item.department === code);
    if (mode === 'flow') {
      const desktop = await newContext(browser, desktopOptions, attemptedOutside, errors);
      const mobile = await newContext(browser, devices['Pixel 7'], attemptedOutside, errors);
      for (const [context, department] of [[desktop, 'noi'], [mobile, 'nhi']]) {
        const { page } = await login(context, account(department));
        await submit(page, department, true);
        await submit(page, department, false);
        await page.close();
      }
    }
    const adminContext = await newContext(browser, desktopOptions, attemptedOutside, errors);
    const result = await inspect(await login(adminContext, account('khnv')), fixtures.date);
    assert.deepEqual(attemptedOutside, [], 'External browser requests were attempted.');
    assert.deepEqual(errors, [], 'Browser errors while exercising the trial.');
    if (mode === 'flow') {
      fs.writeFileSync(evidence, JSON.stringify({ date, ...result }, null, 2));
    } else {
      assert.deepEqual({ date, ...result }, JSON.parse(fs.readFileSync(evidence, 'utf8')));
      console.log('Same report ID and image SHA-256 after restarting the services.');
    }
    console.log(`PASS ${mode}: browser allowed only ${origin}; zero external requests.`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
