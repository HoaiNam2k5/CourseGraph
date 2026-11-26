import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const origin = process.env.APP_ORIGIN;
if (origin !== 'http://127.0.0.1:3100') throw new Error('Browser smoke writes are restricted to the isolated E2E app on3100.');
if (!process.env.ADMIN_PASSWORD) throw new Error('Missing local admin credentials.');
const browser = await chromium.connectOverCDP(process.env.COURSEGRAPH_CDP_URL ?? 'http://127.0.0.1:19222');
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL: origin });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const results = [];
const clientErrors = [];
page.on('pageerror', (error) => clientErrors.push(error.message));
await mkdir('evidence/screenshots', { recursive: true });
async function capture(name) {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await page.screenshot({ path: `evidence/screenshots/${name}.png`, fullPage: true });
}
async function check(name, callback) {
  const started = Date.now();
  try {
    const outcome = await callback();
    const status = outcome === false ? 'skipped' : 'passed';
    results.push({ name, status, durationMs: Date.now() - started });
    console.log(`${status === 'passed' ? 'PASS' : 'SKIP'} ${name}`);
  }
  catch (error) {
    results.push({ name, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    await page.screenshot({ path: 'evidence/screenshots/browser-failure.png', fullPage: true, mask: [page.locator('input[type=password]')] }).catch(() => {});
    throw error;
  }
}
async function signIn(username = process.env.ADMIN_USERNAME ?? 'admin', password = process.env.ADMIN_PASSWORD) {
  await page.goto('/');
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Vào không gian học tập' }).click();
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeVisible();
}
async function session() { const response = await page.request.get('/api/auth/me'); assert.equal(response.status(), 200); return response.json(); }
try {
  await check('login, live database and dashboard', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Chào mừng trở lại.' })).toBeVisible();
    await capture('login');
    await signIn();
    await expect(page.getByRole('heading', { name: 'Nhìn thấy những kết nối.' })).toBeVisible();
    await expect(page.getByText('Database sẵn sàng', { exact: true })).toBeVisible();
    const stats = await page.request.get('/api/statistics');
    assert.equal((await stats.json()).counts.MonHoc, 50);
    await capture('dashboard');
  });
  await check('course create, edit, details and delete through browser', async () => {
    const id = `BROWSER${Date.now()}`;
    const auth = await session();
    try {
      await page.getByRole('button', { name: 'Môn học', exact: true }).click();
      await page.getByRole('button', { name: 'Thêm môn học', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Mã môn', { exact: false }).fill(id);
      await dialog.getByLabel('Tên môn học', { exact: false }).fill('Môn kiểm chứng giao diện');
      await dialog.getByLabel('Số tín chỉ', { exact: false }).fill('3');
      await dialog.getByLabel('Loại môn', { exact: false }).fill('Tự Chọn');
      await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click();
      await expect(dialog).not.toBeVisible();
      await page.getByLabel('Tìm môn học').fill(id);
      await page.getByRole('button', { name: `Sửa ${id}`, exact: true }).click();
      await dialog.getByLabel('Tên môn học', { exact: false }).fill('Môn đã chỉnh sửa qua trình duyệt');
      await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click();
      await expect(dialog).not.toBeVisible();
      await expect(page.getByRole('button', { name: 'Môn đã chỉnh sửa qua trình duyệt', exact: true })).toBeVisible();
      await page.getByRole('button', { name: `Chi tiết ${id}`, exact: true }).click();
      await page.getByRole('tab', { name: /^Liên kết/ }).click();
      await expect(page.getByRole('heading', { name: 'Liên kết dữ liệu', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Đóng hộp thoại' }).click();
      await page.getByRole('button', { name: `Xóa ${id}`, exact: true }).click();
      await dialog.getByRole('button', { name: 'Xóa bản ghi', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(page.getByText('Không tìm thấy bản ghi', { exact: true })).toBeVisible();
      await page.getByLabel('Tìm môn học').fill('');
      await expect(page.getByRole('button', { name: 'Chi tiết MH001', exact: true })).toBeVisible();
      await capture('courses');
    } finally { await page.request.delete(`/api/courses/${id}`, { headers: { Origin: origin, 'x-csrf-token': auth.csrfToken } }); }
  });
  await check('interactive graph and course recommendations', async () => {
    await page.getByRole('button', { name: 'Mạng lưới', exact: true }).click();
    await page.getByLabel('Môn học trung tâm').selectOption('MH005');
    await expect(page.locator('.graph-canvas canvas')).toBeVisible();
    await capture('graph');
    await page.getByRole('button', { name: 'Gợi ý học tập', exact: true }).click();
    await page.getByLabel('Sinh viên', { exact: false }).selectOption('SV001');
    await page.getByRole('button', { name: 'Xem môn có thể học', exact: true }).click();
    await expect(page.getByRole('heading', { name: '13 môn đủ điều kiện học', exact: true })).toBeVisible();
    await capture('recommendations');
  });
  await check('recommendations explain prerequisites, blocked courses and stale filters', async () => {
    const eligible = page.locator('.assessment-card').first();
    await eligible.getByText('Vì sao học được?', { exact: true }).click();
    await expect(eligible.getByText('Xét cả môn tiên quyết trực tiếp và gián tiếp.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Chưa đủ điều kiện/ }).click();
    const blocked = page.locator('.assessment-card.blocked').first();
    await blocked.getByText('Cần hoàn thành những môn nào?', { exact: true }).click();
    await expect(blocked.locator('.missing').first()).toBeVisible();
    await capture('recommendations-blocked');
    await page.getByLabel('Sinh viên', { exact: false }).selectOption('SV002');
    await expect(page.getByRole('status').filter({ hasText: 'Hồ sơ hoặc bộ lọc đã thay đổi' })).toBeVisible();
    await expect(page.locator('.assessment-card')).toHaveCount(0);
    await page.getByRole('button', { name: 'Xem môn có thể học', exact: true }).click();
    await expect(page.getByRole('heading', { name: /môn đủ điều kiện học/ })).toBeVisible();
    await page.locator('.assessment-card').first().getByRole('button', { name: /trên đồ thị/ }).click();
    await expect(page.locator('.graph-canvas canvas')).toBeVisible();
    await expect(page.getByLabel('Trạng thái theo sinh viên')).toHaveValue('SV002');
  });
  await check('graph side panel, student status, paths and fullscreen work together', async () => {
    await page.getByRole('button', { name: 'Mạng lưới', exact: true }).click();
    await page.getByLabel('Môn học trung tâm').selectOption('MH005');
    await page.getByLabel('Trạng thái theo sinh viên').selectOption('SV001');
    await page.getByLabel('Chọn môn để xem chi tiết').selectOption('MonHoc:MH005');
    const panel = page.getByRole('complementary', { name: 'Thông tin môn học đang chọn', exact: true });
    await expect(panel.locator('.graph-course-status')).toBeVisible();
    await expect(panel.getByRole('heading', { name: /Phụ thuộc trực tiếp/ })).toBeVisible();
    const stageBox = await page.locator('.graph-stage').boundingBox();
    const panelBox = await panel.boundingBox();
    assert.ok(panelBox.x >= stageBox.x + stageBox.width - 1, 'details alongside canvas on desktop');
    await capture('graph');
    await page.getByRole('button', { name: 'Mở toàn màn hình đồ thị', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Thoát toàn màn hình đồ thị', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Thoát toàn màn hình đồ thị', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mở toàn màn hình đồ thị', exact: true })).toBeVisible();
    await page.getByLabel('Môn học trung tâm').selectOption('');
    await page.getByLabel('Môn bắt đầu').selectOption('MH001');
    await page.getByLabel('Môn đích').selectOption('MH015');
    await page.getByRole('button', { name: 'Tìm và tô đường tiên quyết', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bỏ tô đường đi', exact: true })).toBeVisible();
    await expect(page.locator('.path-results')).toContainText('6 liên kết');
    await page.getByLabel('Môn đích').selectOption('MH002');
    await expect(page.getByRole('button', { name: 'Bỏ tô đường đi', exact: true })).toHaveCount(0);
    await expect(page.locator('.path-results')).toHaveCount(0);
  });
  await check('course tabs expose complete chains, programs and keyboard navigation', async () => {
    await page.getByRole('button', { name: 'Môn học', exact: true }).click();
    await page.getByLabel('Tìm môn học').fill('MH005');
    await page.getByRole('button', { name: 'Chi tiết MH005', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const overview = dialog.getByRole('tab', { name: 'Tổng quan', exact: true });
    await overview.focus();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('tab', { name: /^Toàn bộ tiên quyết/ })).toBeFocused();
    await expect(dialog.getByRole('tabpanel')).toContainText('Bao gồm cả môn tiên quyết trực tiếp và gián tiếp');
    await dialog.getByRole('tab', { name: /^Chương trình/ }).click();
    await expect(dialog.locator('.course-program-item').first()).toBeVisible();
    await capture('course-detail');
    await dialog.getByRole('tab', { name: /^Môn phụ thuộc/ }).click();
    const next = dialog.locator('.course-related-item .node-card .node-code').first();
    const nextId = await next.innerText();
    await dialog.locator('.course-related-item .node-card button').first().click();
    await expect(dialog.getByRole('tab', { name: 'Tổng quan', exact: true })).toHaveAttribute('aria-selected', 'true');
    await dialog.getByRole('button', { name: 'Khám phá mạng lưới', exact: true }).click();
    await expect(page.getByLabel('Môn học trung tâm')).toHaveValue(nextId);
  });
  await check('admin can inspect the actual connection without exposing credentials', async () => {
    await page.getByRole('button', { name: 'Xem kết nối database', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('coursegraph-test-e2e', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByRole('link', { name: /Mở Neo4j Browser/ })).toHaveAttribute('href', 'http://127.0.0.1:17474/browser/');
    assert.equal((await dialog.innerText()).includes(process.env.ADMIN_PASSWORD), false);
    assert.equal((await dialog.innerText()).includes(process.env.NEO4J_PASSWORD), false);
    await capture('connection');
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  });
  await check('CSV import preview, idempotent commit and JSON export', async () => {
    if (process.argv.includes('--skip-transfers')) return false;
    await page.getByRole('button', { name: 'Nhập xuất dữ liệu', exact: true }).click();
    const names = ['MonHoc', 'SinhVien', 'GiangVien', 'Khoa', 'HocKy', 'ChuongTrinhDaoTao', 'QuanHeLienKet'];
    await page.locator('input[type=file][multiple]').setInputFiles(names.map((name) => path.resolve('CSV', `${name}.csv`)));
    await page.getByRole('button', { name: 'Kiểm tra dữ liệu', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Kết quả kiểm tra', exact: true })).toBeVisible();
    await capture('transfers');
    await page.getByRole('button', { name: 'Xác nhận nhập dữ liệu', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Đã nhập dữ liệu' })).toBeVisible();
    const data = await page.request.get('/api/exports/business-data');
    const exported = await data.json();
    assert.equal(exported.nodes.length, 210); assert.equal(exported.relationships.length, 1568);
    await page.getByLabel('Danh mục CSV', { exact: false }).selectOption('relationships');
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tải CSV', exact: false }).click();
    assert.equal((await downloaded).suggestedFilename(), 'QuanHeLienKet.csv');
  });
  await check('student selectors include records beyond the first100', async () => {
    const auth = await session();
    const id = `ZZBROWSER${Date.now()}`;
    const headers = { Origin: origin, 'x-csrf-token': auth.csrfToken };
    const created = await page.request.post('/api/students', { headers, data: { properties: { MaSV: id, HoTen: 'Sinh viên kiểm chứng phân trang', NgaySinh: '2004-01-01', GioiTinh: 'Nam', Email: 'browser@example.edu', SDT: '0901234567', KhoaHoc: 'Demo' } } });
    assert.equal(created.status(), 201);
    try {
      await page.getByRole('button', { name: 'Gợi ý học tập', exact: true }).click();
      await page.getByLabel('Sinh viên', { exact: false }).selectOption(id);
      await page.getByRole('button', { name: 'Xem môn có thể học', exact: true }).click();
      await expect(page.getByRole('heading', { name: '10 môn đủ điều kiện học', exact: true })).toBeVisible();
    } finally { await page.request.delete(`/api/students/${id}`, { headers }); }
  });
  await check('viewer permissions enforced by UI and server', async () => {
    const auth = await session();
    const viewerName = `browser-${Date.now()}`;
    const viewerPassword = randomBytes(18).toString('base64url');
    const created = await page.request.post('/api/users', { headers: { Origin: origin, 'x-csrf-token': auth.csrfToken }, data: { username: viewerName, password: viewerPassword, displayName: 'Tài khoản kiểm thử chỉ xem', role: 'VIEWER', active: true } });
    assert.equal(created.status(), 201);
    await page.getByRole('button', { name: 'Tài khoản & phân quyền', exact: true }).click();
    await expect(page.getByText(viewerName, { exact: true })).toBeVisible();
    await capture('users');
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await signIn(viewerName, viewerPassword);
    await expect(page.getByRole('button', { name: 'Xem kết nối database', exact: true })).toHaveCount(0);
    assert.equal((await page.request.get('/api/system/connection')).status(), 403);
    await page.getByRole('button', { name: 'Môn học', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Môn học', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thêm môn học', exact: true })).toHaveCount(0);
    const viewer = await session();
    const denied = await page.request.post('/api/courses', { headers: { Origin: origin, 'x-csrf-token': viewer.csrfToken }, data: { properties: { MaMH: 'DENIED', TenMH: 'Must not write', SoTC: 3, LoaiMon: 'Test' } } });
    assert.equal(denied.status(), 403);
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await signIn();
  });
  await check('mobile navigation and horizontal overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Mở điều hướng', exact: true }).click();
    await page.getByRole('button', { name: 'Môn học', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Môn học', exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await capture('mobile');
    await page.getByRole('button', { name: 'Mở điều hướng', exact: true }).click();
    await page.getByRole('button', { name: 'Mạng lưới', exact: true }).click();
    await page.getByLabel('Môn học trung tâm').selectOption('MH005');
    await expect(page.getByLabel('Chọn môn để xem chi tiết')).toHaveValue('MonHoc:MH005');
    const stageBox = await page.locator('.graph-stage').boundingBox();
    const panelBox = await page.locator('.graph-course-panel').boundingBox();
    assert.ok(panelBox.y >= stageBox.y + stageBox.height - 1, 'details below canvas on mobile');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await capture('mobile-graph');
    await page.getByRole('button', { name: 'Mở điều hướng', exact: true }).click();
    await page.getByRole('button', { name: 'Gợi ý học tập', exact: true }).click();
    await page.getByLabel('Sinh viên', { exact: false }).selectOption('SV001');
    await page.getByRole('button', { name: 'Xem môn có thể học', exact: true }).click();
    await expect(page.locator('.assessment-card').first()).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await capture('mobile-recommendations');
  });
  await check('no uncaught browser JavaScript errors', async () => { assert.deepEqual(clientErrors, []); });
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
finally {
  await writeFile('evidence/browser-results.json', `${JSON.stringify({ generatedAt: new Date().toISOString(), origin, runner: 'Playwright CDP without worker subprocess', passed: results.filter((r) => r.status === 'passed').length, failed: results.filter((r) => r.status === 'failed').length, skipped: results.filter((r) => r.status === 'skipped').length, results }, null, 2)}\n`, 'utf8');
  await context.close(); await browser.close();
}
