import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseNetwork, recommendCourses, shortestCoursePath, statistics } from '../../apps/api/src/domain.js';
import type { BusinessData, BusinessNode } from '../../packages/shared/src/data.js';

const course = (id: string): BusinessNode => ({ label: 'MonHoc', id, properties: { MaMH: id, TenMH: id, SoTC: 3, LoaiMon: 'Required' } });
const student: BusinessNode = { label: 'SinhVien', id: 'S', properties: { MaSV: 'S', HoTen: 'Student' } };
const fixture = (): BusinessData => ({
  nodes: ['A', 'B', 'C', 'D', 'ROOT'].map(course).concat(student),
  relationships: [
    { fromLabel: 'MonHoc', fromId: 'A', type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: 'B' },
    { fromLabel: 'MonHoc', fromId: 'B', type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: 'D' },
    { fromLabel: 'MonHoc', fromId: 'C', type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: 'D' },
  ],
});

test('new students receive root courses including courses with no prerequisites', () => {
  assert.deepEqual(recommendCourses(fixture(), 'S').items.map((node) => node.id).sort(), ['A', 'C', 'ROOT']);
});

test('all direct and indirect prerequisites must be completed, studying courses excluded', () => {
  const data = fixture();
  const complete = (id: string) => data.relationships.push({ fromLabel: 'SinhVien', fromId: 'S', type: 'DA_HOC', toLabel: 'MonHoc', toId: id });
  complete('B'); complete('C');
  assert.equal(recommendCourses(data, 'S').items.some((node) => node.id === 'D'), false, 'missing indirect ancestor A');
  complete('A');
  assert.equal(recommendCourses(data, 'S').items.some((node) => node.id === 'D'), true);
  data.relationships.push({ fromLabel: 'SinhVien', fromId: 'S', type: 'DANG_HOC', toLabel: 'MonHoc', toId: 'D' });
  assert.equal(recommendCourses(data, 'S').items.some((node) => node.id === 'D'), false);
});

test('graph IDs match edge endpoints, traversal deduplicates and path respects direction', () => {
  const data = fixture();
  const network = courseNetwork(data, 'B', 1);
  assert.equal(new Set(network.nodes.map((node) => node.id)).size, network.nodes.length);
  const ids = new Set(network.nodes.map((node) => node.id));
  network.edges.forEach((edge) => { assert.ok(ids.has(edge.from)); assert.ok(ids.has(edge.to)); });
  assert.deepEqual(shortestCoursePath(data, 'A', 'D').paths[0].courses.map((node) => node.id), ['A', 'B', 'D']);
  assert.equal(shortestCoursePath(data, 'D', 'A').paths.length, 0);
  assert.equal(statistics(data).longestChain.length, 2);
});

test('unknown student and course produce controlled errors', () => {
  assert.throws(() => recommendCourses(fixture(), 'missing'), /sinh viên/);
  assert.throws(() => courseNetwork(fixture(), 'missing'), /môn học/);
});

test('eligibility explanation includes distinct indirect missing prerequisites and honest historical status', () => {
  const data = fixture();
  for (const id of ['B', 'C']) data.relationships.push({ fromLabel: 'SinhVien', fromId: 'S', type: 'DA_HOC', toLabel: 'MonHoc', toId: id });
  data.relationships.push({ fromLabel: 'SinhVien', fromId: 'S', type: 'DANG_HOC', toLabel: 'MonHoc', toId: 'B' });
  const result = recommendCourses(data, 'S');
  const target = result.assessments.find((item) => item.course.id === 'D')!;
  assert.equal(target.status, 'blocked');
  assert.deepEqual(target.prerequisites.map((item) => item.id), ['A', 'B', 'C']);
  assert.deepEqual(target.missingPrerequisites.map((item) => item.id), ['A']);
  assert.equal(result.assessments.find((item) => item.course.id === 'B')!.status, 'completed', 'completed overrides studying even with historical missing prerequisites');
  assert.equal(result.assessments.length, 5);
});

test('filters change scope without changing academic status, including a program not enrolled in', () => {
  const data = fixture();
  data.nodes.push({ label: 'ChuongTrinhDaoTao', id: 'P', properties: {} }, { label: 'HocKy', id: 'HK', properties: {} });
  data.relationships.push({ fromLabel: 'ChuongTrinhDaoTao', fromId: 'P', type: 'BAO_GOM', toLabel: 'MonHoc', toId: 'ROOT' });
  let result = recommendCourses(data, 'S', { programId: 'P' });
  assert.equal(result.items.length, 0);
  assert.equal(result.assessments.length, 5);
  assert.equal(result.assessments.some((item) => item.inScope), false);
  assert.equal(result.assessments.find((item) => item.course.id === 'ROOT')!.status, 'eligible');
  data.relationships.push({ fromLabel: 'SinhVien', fromId: 'S', type: 'THEO_HOC', toLabel: 'ChuongTrinhDaoTao', toId: 'P' });
  result = recommendCourses(data, 'S', { programId: 'P' });
  assert.deepEqual(result.items.map((item) => item.id), ['ROOT']);
  assert.equal(result.assessments.find((item) => item.course.id === 'A')!.inScope, false);
  result = recommendCourses(data, 'S', { programId: 'P', semesterId: 'HK' });
  assert.equal(result.items.length, 0);
  assert.equal(result.assessments.find((item) => item.course.id === 'ROOT')!.status, 'eligible');
});
