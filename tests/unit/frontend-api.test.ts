import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, csvFilename, errorMessage, loadAllPages } from '../../apps/web/src/api.js';

afterEach(() => mock.restoreAll());

test('selectors retrieve a student beyond the first 100 records and retain filters', async () => {
  const calls: string[] = [];
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost'); calls.push(String(input));
    assert.equal(url.searchParams.get('q'), 'SV');
    assert.equal(url.searchParams.get('pageSize'), '100');
    const page = Number(url.searchParams.get('page'));
    const items = Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({ id: `SV${(page - 1) * 100 + index + 1}` }));
    return Response.json({ items, total: 101, page, pageSize: 100 });
  });
  const result = await loadAllPages<{ id: string }>('/students?q=SV&page=7&pageSize=12');
  assert.equal(calls.length, 2);
  assert.equal(result.items.length, 101);
  assert.equal(result.items.at(-1)?.id, 'SV101');
});

test('empty later pages produce an actionable error instead of silently hiding options', async () => {
  let page = 0;
  mock.method(globalThis, 'fetch', async () => Response.json({ items: ++page === 1 ? [{ id: 'SV001' }] : [], total: 101, page, pageSize: 100 }));
  await assert.rejects(loadAllPages('/students'), (error: unknown) => error instanceof ApiError && error.status === 409);
});

test('CSV exports retain the canonical filenames required by seven-file import', () => {
  assert.equal(csvFilename('relationships', []), 'QuanHeLienKet.csv');
  assert.equal(csvFilename('ChuongTrinhDaoTao', [{ label: 'ChuongTrinhDaoTao', file: 'ChuongTrinhDaoTao.csv' }]), 'ChuongTrinhDaoTao.csv');
});

test('field and CSV validation errors show bounded path/message hints as plain text', () => {
  const error = new ApiError('Invalid data.', 400, [
    { path: ['properties', 'Email'], message: 'Invalid email address' },
    { path: 'MonHoc.csv:4.SoTC', message: 'Must be a positive integer' },
    { path: ['irrelevant'], payload: { secret: 'must-not-be-rendered' } },
  ]);
  const message = errorMessage(error);
  assert.match(message, /properties\.Email: Invalid email address/);
  assert.match(message, /MonHoc\.csv:4\.SoTC: Must be a positive integer/);
  assert.doesNotMatch(message, /secret|must-not-be-rendered/);
  const bounded = errorMessage(new ApiError('Invalid.', 400, Array.from({ length: 20 }, (_, index) => ({ path: `field${index}`, message: 'x'.repeat(1000) }))));
  assert.ok(bounded.length < 2200);
  assert.equal((bounded.match(/field\d+:/g) ?? []).length, 5);
  assert.equal(errorMessage(new ApiError('Unavailable.', 503, null)), 'Unavailable.');
});
