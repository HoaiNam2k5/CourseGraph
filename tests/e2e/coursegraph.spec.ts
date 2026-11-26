import { expect, test, type Page } from '@playwright/test';
import 'dotenv/config';
import path from 'node:path';

const username = process.env.ADMIN_USERNAME ?? 'admin';
const password = process.env.ADMIN_PASSWORD;
const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000';

async function login(page: Page) {
  test.skip(!password, 'ADMIN_PASSWORD must be configured in local .env.');
  await page.goto('/');
  await submitLogin(page, username, password!);
  await expect(page.getByRole('heading', { name: 'Nhìn thấy những kết nối.' })).toBeVisible();
}

async function submitLogin(page: Page, username: string, password: string) {
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Vào không gian học tập' }).click();
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
  await expect(page.getByText('Hiển thị 6 trên 10 khoa', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: /mở mạng lưới|khám phá mạng lưới/i })).toHaveCount(1);
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

test('a viewer signing in after an admin lands on the overview and can follow shared links', async ({ page }) => {
  await login(page);
  const viewer = { username: 'e2e-switch-viewer', password: 'CourseGraph-Switch-E2E-2026!', displayName: 'Người xem thử', role: 'VIEWER' };
  const session = await (await page.request.get('/api/auth/me')).json();
  const created = await page.request.post('/api/users', {
    headers: { Origin: origin, 'x-csrf-token': session.csrfToken as string },
    data: viewer,
  });
  expect([201, 409]).toContain(created.status());
  await page.getByRole('button', { name: 'Tài khoản & phân quyền', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tài khoản & quyền truy cập' })).toBeVisible();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/#overview$/);
  await page.goto('/#transfers');
  await submitLogin(page, viewer.username, viewer.password);
  await expect(page.getByRole('heading', { name: 'Nhìn thấy những kết nối.' })).toBeVisible();
  await expect(page).toHaveURL(/#overview$/);
  await expect(page.getByRole('button', { name: 'Tài khoản & phân quyền', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nhập xuất dữ liệu', exact: true })).toHaveCount(0);
  await page.goto('/#courses');
  await expect(page.getByRole('heading', { name: 'Môn học', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#courses$/);
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
  await page.getByRole('button', { name: 'Mạng lưới', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mạng lưới', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Loại mạng lưới', exact: true })).toHaveValue('MonHoc');
  const studentFilter = page.getByRole('button', { name: 'Trạng thái theo sinh viên' });
  const primaryControls = [
    page.getByRole('combobox', { name: 'Môn học trung tâm' }),
    page.getByRole('combobox', { name: 'Độ sâu liên kết' }),
    page.getByRole('button', { name: 'Mở toàn màn hình đồ thị' }),
    studentFilter,
  ];
  const controlBounds = await Promise.all(primaryControls.map((control) => control.boundingBox()));
  expect(controlBounds.map((box) => Math.round(box!.y))).toEqual(Array(4).fill(Math.round(controlBounds[0]!.y)));
  await expect(page.getByRole('searchbox', { name: 'Tìm sinh viên' })).toHaveCount(0);
  await studentFilter.click();
  const studentDialog = page.getByRole('dialog', { name: 'Trạng thái theo sinh viên' });
  await studentDialog.getByRole('combobox', { name: 'Sinh viên', exact: true }).selectOption('SV001');
  await studentDialog.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(studentFilter).toHaveText('Không áp dụng sinh viên');
  await expect(studentFilter).toBeFocused();
  await page.getByLabel('Môn học trung tâm').selectOption('MH005');
  await expect(page.locator('.graph-canvas canvas')).toBeVisible();
  await page.screenshot({ path: 'evidence/graph.png', fullPage: true });
  await page.getByRole('button', { name: 'Gợi ý học tập', exact: true }).click();
  const students = page.getByRole('combobox', { name: 'Sinh viên', exact: true });
  const search = page.getByRole('searchbox', { name: 'Tìm sinh viên' });
  await expect(page.locator('.student-picker .search-field')).toHaveCSS('height', '42px');
  const option = students.locator('option[value="SV001"]');
  await expect(option).toBeAttached();
  const name = (await option.textContent())!.split(' · ').at(-1)!;
  await search.fill(name.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase());
  await expect(option).toBeAttached();
  await search.fill('sv001');
  await expect(students.locator('option')).toHaveCount(2);
  await students.selectOption('SV001');
  await page.getByRole('button', { name: 'Xem môn có thể học', exact: true }).click();
  await expect(page.getByRole('heading', { name: /môn đủ điều kiện học/ })).toBeVisible();
  await page.screenshot({ path: 'evidence/recommendations.png', fullPage: true });
});

test('explore all network types and return to the course view on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole('button', { name: 'Mở điều hướng' }).click();
  await page.getByRole('button', { name: 'Mạng lưới', exact: true }).click();
  const view = page.getByRole('combobox', { name: 'Loại mạng lưới', exact: true });
  await expect(view).toHaveValue('MonHoc');
  await expect(view.locator('option')).toHaveCount(7);
  const courseCanvas = page.locator('.graph-explorer canvas');
  await expect(courseCanvas).toBeVisible();
  await expect.poll(() => courseCanvas.evaluate(canvas => Math.round(canvas.getBoundingClientRect().top + window.scrollY))).toBeLessThan(400);
  const filters = page.getByRole('button', { name: 'Bộ lọc', exact: true });
  await expect(filters).toHaveAttribute('aria-expanded', 'false');
  await filters.click();
  const studentFilter = page.getByRole('button', { name: 'Trạng thái theo sinh viên' });
  await studentFilter.click();
  const studentDialog = page.getByRole('dialog', { name: 'Trạng thái theo sinh viên' });
  const studentSearch = studentDialog.getByRole('searchbox', { name: 'Tìm sinh viên' });
  await expect(studentSearch).toHaveAttribute('placeholder', 'Tìm tên hoặc mã sinh viên…');
  await studentSearch.fill('sv001');
  const student = studentDialog.getByRole('combobox', { name: 'Sinh viên', exact: true });
  await expect(student.locator('option')).toHaveCount(2);
  await student.selectOption('SV001');
  await studentDialog.getByRole('button', { name: 'Áp dụng' }).click();
  await expect(studentFilter).toContainText('SV001');
  await filters.click();
  const detailTrigger = page.getByRole('button', { name: 'Xem chi tiết môn học' });
  await detailTrigger.click();
  const courseSheet = page.getByRole('dialog', { name: 'Thông tin môn học' });
  await expect(courseSheet).toBeVisible();
  await courseSheet.getByRole('combobox', { name: 'Chọn môn để xem chi tiết' }).selectOption('MonHoc:MH005');
  await expect(courseSheet.locator('.code-pill').filter({ hasText: 'MH005' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(courseSheet).toHaveCount(0);
  await expect(detailTrigger).toBeFocused();
  await view.selectOption('all');
  const explorer = page.getByRole('region', { name: 'Khám phá mạng lưới', exact: true });
  await expect(explorer.locator('canvas')).toBeVisible();
  await expect(explorer.getByRole('button', { name: /^Xem mạng lưới / })).toHaveCount(6);
  await explorer.getByRole('button', { name: /^Xem mạng lưới Sinh viên/ }).click();
  await expect(view).toHaveValue('SinhVien');
  const search = explorer.getByLabel('Tìm trong mạng lưới', { exact: true });
  await expect(explorer.locator('.search-field')).toHaveCSS('height', '42px');
  const searchPosition = () => search.evaluate((input) => {
    const bounds = input.getBoundingClientRect();
    return { top: Math.round(bounds.top + window.scrollY), left: bounds.left, right: bounds.right };
  });
  for (const [type, id] of [['SinhVien', 'SV001'], ['GiangVien', 'GV001'], ['Khoa', 'CNTT'], ['HocKy', 'HK001'], ['ChuongTrinhDaoTao', 'CT001']]) {
    await view.selectOption(type);
    const initialPosition = await searchPosition();
    await search.fill(id);
    const results = explorer.getByRole('region', { name: 'Kết quả tìm kiếm', exact: true });
    await expect(results).toBeVisible();
    const [resultsTop, canvasTop] = await Promise.all([
      results.evaluate((element) => element.getBoundingClientRect().top),
      explorer.locator('canvas').evaluate((canvas) => canvas.getBoundingClientRect().top),
    ]);
    expect(resultsTop).toBeLessThan(canvasTop);
    const row = explorer.getByRole('button', { name: /^Xem / }).filter({ hasText: id }).first();
    await expect(row).toBeVisible();
    await row.click();
    const details = explorer.getByRole('dialog', { name: 'Chi tiết nút' });
    await expect(details.getByRole('heading', { name: 'Liên kết trực tiếp', exact: true })).toBeVisible();
    if (id === 'HK001') {
      const expand = explorer.getByRole('button', { name: /^Mở rộng liên kết/ });
      const initialLabel = await expand.textContent();
      await expand.click();
      await expect(expand).not.toHaveText(initialLabel ?? '');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await details.getByRole('button', { name: 'Đóng chi tiết nút' }).click();
    await expect.poll(searchPosition).toEqual(initialPosition);
    await expect(explorer.getByRole('complementary', { name: 'Chi tiết mạng lưới' }).getByRole('button', { name: 'Quay lại tổng quan' })).toBeVisible();
  }
  await view.selectOption('MonHoc');
  await expect(page.getByRole('combobox', { name: 'Môn học trung tâm' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tìm và tô đường tiên quyết' })).toBeVisible();
});

test('quick search matches Vietnamese course names with or without accents', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Môn học', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Tìm môn học', exact: true });
  await expect(page.locator('.catalog-toolbar .search-field')).toHaveCSS('height', '42px');
  await expect(search).toHaveAttribute('placeholder', 'Tìm theo tên hoặc mã…');
  const results = page.locator('.data-table tbody tr');
  await search.fill('dữ liệu');
  await expect(results).toHaveCount(8);
  const accented = await results.allTextContents();
  await search.fill('du lieu');
  await expect(results).toHaveCount(8);
  expect(await results.allTextContents()).toEqual(accented);
  await page.getByRole('button', { name: 'Xóa từ khóa tìm kiếm', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await page.getByLabel('Sắp xếp danh mục').selectOption('MaMH:desc');
  await expect(results.first()).toContainText('MH050');
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await page.getByRole('combobox', { name: 'Số tín chỉ', exact: true }).selectOption('3');
  await expect(results.first()).toBeVisible();
  await expect.poll(async () => {
    const credits = await results.locator('.credit-pill').allTextContents();
    return credits.length > 0 && credits.every(credit => credit === '3');
  }).toBe(true);
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

test('manage a directed link from the mobile relationship list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const courseId = `E2ELINK${Date.now()}`;
  const session = await (await page.request.get('/api/auth/me')).json();
  const headers = { Origin: origin, 'x-csrf-token': session.csrfToken as string };
  const fixture = await page.request.post('/api/courses', {
    headers, data: { properties: { MaMH: courseId, TenMH: 'Môn thử liên kết', SoTC: 3, LoaiMon: 'Tự Chọn' } },
  });
  expect(fixture.status()).toBe(201);
  try {
    await page.getByRole('button', { name: 'Mở điều hướng' }).click();
    await page.getByRole('button', { name: 'Liên kết dữ liệu', exact: true }).click();
    const search = page.getByRole('searchbox', { name: 'Tìm liên kết' });
    await expect(page.locator('.links-toolbar .search-field')).toHaveCSS('height', '42px');
    await search.fill(courseId);
    await page.getByRole('combobox', { name: 'Loại liên kết', exact: true }).selectOption('TIEN_QUYET_CHO');
    await page.getByRole('button', { name: 'Thêm liên kết', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: /^Nguồn/ }).selectOption(courseId);
    await dialog.getByRole('combobox', { name: /^Đích/ }).selectOption('MH001');
    await dialog.getByRole('button', { name: 'Thêm liên kết', exact: true }).click();
    const oldLabel = `${courseId} TIEN_QUYET_CHO MH001`;
    await page.getByRole('button', { name: 'Sửa liên kết ' + oldLabel, exact: true }).click();
    await dialog.getByRole('combobox', { name: /^Đích/ }).selectOption('MH002');
    await dialog.getByRole('button', { name: /Lưu/ }).click();
    const remove = page.getByRole('button', { name: `Xóa liên kết ${courseId} TIEN_QUYET_CHO MH002`, exact: true });
    await expect(remove).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await remove.click();
    await dialog.getByRole('button', { name: 'Xóa liên kết', exact: true }).click();
    await expect(remove).toHaveCount(0);
    const listed = await page.request.get('/api/relationships?q=' + courseId);
    expect((await listed.json()).total).toBe(0);
  } finally {
    await page.request.delete('/api/courses/' + courseId + '?force=true', { headers });
  }
});

test('admin previews and imports the original seven CSV files without duplicates', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Nhập xuất dữ liệu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nhập và xuất dữ liệu', exact: true })).toBeVisible();
  const files = ['MonHoc.csv', 'SinhVien.csv', 'GiangVien.csv', 'Khoa.csv', 'HocKy.csv', 'ChuongTrinhDaoTao.csv', 'QuanHeLienKet.csv'];
  const picker = page.getByLabel('Chọn bộ 7 tệp CSV', { exact: true });
  const backup = page.locator('details.transfer-backup');
  await expect(backup).not.toHaveAttribute('open', '');
  await backup.getByText('Sao lưu cơ sở dữ liệu', { exact: true }).click();
  await expect(backup).toHaveAttribute('open', '');
  await expect(page.getByRole('heading', { name: 'Tệp CSV bắt buộc' })).toBeVisible();
  await picker.setInputFiles(path.resolve('CSV', files[0]));
  await expect(page.getByRole('alert')).toContainText('Cần chọn đủ 7 tệp cùng lúc');
  await expect(page.getByRole('button', { name: 'Kiểm tra dữ liệu', exact: true })).toBeDisabled();
  await picker.setInputFiles(files.map((filename) => path.resolve('CSV', filename)));
  await expect(page.getByText('Đã chọn 7/7 tệp CSV', { exact: true })).toBeVisible();
  await expect(page.locator('.csv-checklist li.ready')).toHaveCount(7);
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
