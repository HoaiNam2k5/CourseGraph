import assert from 'node:assert/strict';
import test from 'node:test';
import { facetValues, queryCatalog } from '../../apps/web/src/catalog-search.js';
import type { BusinessNode } from '../../apps/web/src/types.js';

const course = (id: string, name: string, credits: number, category = 'Bắt buộc'): BusinessNode => ({
  id, label: 'MonHoc', properties: { MaMH: id, TenMH: name, SoTC: credits, LoaiMon: category },
});
const nodes = [
  course('MH010', 'Đồ án dữ liệu', 12),
  course('MH002', 'Cơ sở Dữ Liệu', 3),
  course('MH015', 'Thực hành dữ liệu', 3, 'Tự chọn'),
];

test('search finds accented or unaccented Vietnamese across fields and combines exact facets', () => {
  const facets = { SoTC: '3', LoaiMon: 'Bắt buộc' };
  for (const query of ['DU LIEU', 'Dữ liệu', 'bắt buộc MH002']) {
    assert.deepEqual(queryCatalog(nodes, query, facets, 'MaMH', false).map(node => node.id), ['MH002']);
  }
  assert.equal(queryCatalog(nodes, 'do an', {}, 'MaMH', false)[0].id, 'MH010');
});

test('catalog sort compares numbers numerically, resolves ties by code and preserves source order', () => {
  assert.deepEqual(facetValues(nodes, 'SoTC'), ['3', '12']);
  assert.deepEqual(queryCatalog(nodes, '', {}, 'SoTC', true).map(node => node.id), ['MH010', 'MH002', 'MH015']);
  assert.deepEqual(queryCatalog(nodes, '', {}, 'SoTC', false).map(node => node.id), ['MH002', 'MH015', 'MH010']);
  assert.deepEqual(nodes.map(node => node.id), ['MH010', 'MH002', 'MH015']);
});
