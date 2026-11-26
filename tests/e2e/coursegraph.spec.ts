import { expect, test, type Page } from '@playwright/test';
import 'dotenv/config';
import path from 'node:path';

const username = process.env.ADMIN_USERNAME ?? 'admin';
const password = process.env.ADMIN_PASSWORD;
const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000';

async function login(page: Page) {
  test.skip(!password, 'ADMIN_PASSWORD must be configured in local .env.');
  await page.goto('/');
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Vào không gian học tập' }).click();
  await expect(page.getByRole('heading', { name: 'Nhìn thấy những kết nối.' })).toBeVisible();
}

test('login serves the favicon and supports selecting, moving and resetting the demo graph', async ({ page }) => {
  await page.goto('/');
  const favicon = page.locator('link[rel="icon"]');
  await expect(favicon).toHaveAttribute('href', '/favicon.svg');
  const iconFile = await page.request.get('/favicon.svg');
  expect(iconFile.ok()).toBe(true);
  expect(iconFile.headers()['content-type']).toContain('image/svg+xml');

  const graph = page.getByRole('figure', { name: 'Sơ đồ dữ liệu mẫu' });
  await expect(graph).toHaveCSS('border-top-width', '0px');
  await expect(graph).toHaveAccessibleDescription(/Dùng phím mũi tên/);
  await expect(graph.locator('.sr-only')).toContainText('Chọn hoặc kéo nút.');
  await expect(page.getByText(/Sử dụng tài khoản do quản trị viên cấp/)).toHaveCount(0);
  const student = graph.getByRole('button', { name: 'Sinh viên', exact: true });
  const position = () => student.evaluate((node) => ({ left: node.style.left, top: node.style.top }));
  const initialPosition = await position();
  await student.press('Enter');
  await expect(student).toHaveAttribute('aria-pressed', 'true');
  await expect(graph.getByText(/nối sinh viên với các môn đã hoàn thành/)).toBeVisible();
  await student.press('ArrowLeft');
  expect(await position()).not.toEqual(initialPosition);

  const edge = graph.locator('.login-graph-link').last();
  const beforeDrag = await edge.getAttribute('d');
  expect(beforeDrag).toMatch(/ Q /);
  const bounds = await student.boundingBox();
  expect(bounds).not.toBeNull();
  const { x, y, width, height } = bounds!;
  await page.mouse.move(x + width / 2, y + height / 2);
  await page.mouse.down();
  await page.mouse.move(x + width / 2 + 38, y + height / 2 - 24, { steps: 5 });
  await page.mouse.up();
  await expect(edge).not.toHaveAttribute('d', beforeDrag!);

  await graph.getByRole('button', { name: 'Đặt lại sơ đồ' }).click();
  expect(await position()).toEqual(initialPosition);
  await expect(graph.getByRole('button', { name: 'Môn học', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('admin reads real dashboard, catalog and signs out', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Database sẵn sàng', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'evidence/dashboard.png', fullPage: true });
  await page.getByRole('button', { name: 'Môn học', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Môn học', exact: true })).toBeVisible();
  await page.getByLabel('Tìm môn học').fill('MH005');
  await expect(page.getByRole('button', { name: 'Chi tiết MH005' })).toBeVisible();
  await page.getByRole('button', { name: 'Chi tiết MH005' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('tab', { name: /^Liên kết/ }).click();
  await expect(page.getByRole('heading', { name: 'Liên kết dữ liệu', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đóng hộp thoại' }).click();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chào mừng trở lại.' })).toBeVisible();
});

test('admin creates, edits and deletes a course through the UI', async ({ page }) => {
  await login(page);
  const id = `E2E${Date.now()}`;
  const sessionResponse = await page.request.get('/api/auth/me');
  const session = await sessionResponse.json() as { csrfToken: string };
  try {
    await page.getByRole('button', { name: 'Môn học', exact: true }).click();
    await page.getByRole('button', { name: 'Thêm môn học', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Mã môn', { exact: false }).fill(id);
    await dialog.getByLabel('Tên môn học', { exact: false }).fill('Môn kiểm thử giao diện');
    await dialog.getByLabel('Số tín chỉ', { exact: false }).fill('3');
    await dialog.getByLabel('Loại môn', { exact: false }).fill('Tự Chọn');
    await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(dialog).not.toBeVisible();
    const toast = page.locator('.success-toast');
    await expect(toast.getByRole('status')).toHaveText('Đã lưu dữ liệu thành công.');
    await expect(toast).toHaveCSS('position', 'fixed');
    await toast.getByRole('button', { name: 'Đóng thông báo' }).click();
    await expect(toast).toHaveCount(0);
    await page.getByLabel('Tìm môn học').fill(id);
    await page.getByRole('button', { name: `Sửa ${id}`, exact: true }).click();
    await dialog.getByLabel('Tên môn học', { exact: false }).fill('Môn kiểm thử đã chỉnh sửa');
    await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Môn kiểm thử đã chỉnh sửa', exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Xóa ${id}`, exact: true }).click();
    await dialog.getByRole('button', { name: 'Xóa bản ghi', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Không tìm thấy bản ghi', { exact: true })).toBeVisible();
  } finally {
    await page.request.delete(`/api/courses/${encodeURIComponent(id)}`, { headers: { Origin: origin, 'x-csrf-token': session.csrfToken } });
  }
});

test('graph and recommendations load from Neo4j', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Mạng lưới môn học', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mạng lưới môn học', exact: true })).toBeVisible();
  await page.getByLabel('Môn học trung tâm').selectOption('MH005');
  await expect(page.locator('.graph-canvas canvas')).toBeVisible();
  await page.screenshot({ path: 'evidence/graph.png', fullPage: true });
  await page.getByRole('button', { name: 'Gợi ý học tập', exact: true }).click();
  await page.getByLabel('Sinh viên', { exact: false }).selectOption('SV001');
  await page.getByRole('button', { name: 'Xem môn có thể học', exact: true }).click();
  await expect(page.getByRole('heading', { name: /môn đủ điều kiện học/ })).toBeVisible();
  await page.screenshot({ path: 'evidence/recommendations.png', fullPage: true });
});

test('mobile navigation and keyboard skip link remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole('button', { name: 'Mở điều hướng', exact: true }).click();
  await page.getByRole('button', { name: 'Môn học', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Môn học', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở điều hướng' })).toBeVisible();
  await page.screenshot({ path: 'evidence/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('admin previews and imports the original seven CSV files without duplicates', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Nhập xuất dữ liệu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nhập và xuất dữ liệu', exact: true })).toBeVisible();
  const files = ['MonHoc.csv', 'SinhVien.csv', 'GiangVien.csv', 'Khoa.csv', 'HocKy.csv', 'ChuongTrinhDaoTao.csv', 'QuanHeLienKet.csv'];
  const picker = page.getByLabel('Chọn bộ 7 file CSV', { exact: true });
  await picker.setInputFiles(path.resolve('CSV', files[0]));
  await expect(page.getByRole('alert')).toContainText('Cần chọn đủ 7 file cùng lúc');
  await expect(page.getByRole('button', { name: 'Kiểm tra dữ liệu', exact: true })).toBeDisabled();
  await picker.setInputFiles(files.map((filename) => path.resolve('CSV', filename)));
  await expect(page.getByText('Đã chọn 7/7 file CSV', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kiểm tra dữ liệu', exact: true })).toBeEnabled();
  const previewResponse = page.waitForResponse((response) => response.url().endsWith('/api/imports/csv/preview') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Kiểm tra dữ liệu', exact: true }).click();
  const preview = await previewResponse;
  expect(preview.status()).toBe(200);
  expect((await preview.json() as { summary: { nodes: number; relationships: number } }).summary).toEqual({ nodes: 210, relationships: 1568 });
  await expect(page.getByRole('heading', { name: 'Kết quả kiểm tra', exact: true })).toBeVisible();
  const commitResponse = page.waitForResponse((response) => /\/api\/imports\/[^/]+\/commit$/.test(response.url()) && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Xác nhận nhập dữ liệu', exact: true }).click();
  expect((await commitResponse).status()).toBe(200);
  await expect(page.getByText('Đã nhập dữ liệu. Bản ghi và liên kết trùng được giữ duy nhất.', { exact: true })).toBeVisible();
  const exported = await page.request.get('/api/exports/business-data');
  expect(exported.status()).toBe(200);
  const data = await exported.json() as { nodes: unknown[]; relationships: unknown[] };
  expect(data.nodes).toHaveLength(210);
  expect(data.relationships).toHaveLength(1568);
});
