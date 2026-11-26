import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directCourseRelations, graphPresentation } from '../../apps/web/src/graph-presentation.js';
import type { BusinessNode, GraphResult } from '../../apps/web/src/types.js';

const course = (id: string): BusinessNode => ({ id, label: 'MonHoc', properties: { MaMH: id, TenMH: id, SoTC: 3 } });
const graph: GraphResult = {
  nodes: ['A', 'B', 'C', 'X'].map((id) => ({ ...course(id), id: `MonHoc:${id}` })),
  edges: [{ id: 'AB', from: 'MonHoc:A', to: 'MonHoc:B', type: 'TIEN_QUYET_CHO' }, { id: 'BC', from: 'MonHoc:B', to: 'MonHoc:C', type: 'TIEN_QUYET_CHO' }], truncated: false,
};

test('graph status joins plain course keys and preserves directed chain emphasis', () => {
  const result = graphPresentation(graph, { selectedId: 'MonHoc:B', centerId: 'B', prerequisites: new Set(['A']), dependents: new Set(['C']), assessments: new Map([['A', { course: course('A'), status: 'completed', inScope: true, prerequisites: [], missingPrerequisites: [] }]]), path: null });
  assert.match(String(result.nodes.find((node) => node.id === 'MonHoc:A')!.label), /Đã hoàn thành/);
  assert.equal(result.edges.find((edge) => edge.id === 'AB')!.dashes, false);
  assert.deepEqual(result.edges.find((edge) => edge.id === 'BC')!.dashes, [7, 4]);
  assert.ok(Number(result.nodes.find((node) => node.id === 'MonHoc:X')!.opacity) < Number(result.nodes.find((node) => node.id === 'MonHoc:A')!.opacity));
});

test('path follows adjacent directed pairs, and direct sidebar relations exclude indirect ancestors', () => {
  const result = graphPresentation(graph, { selectedId: '', centerId: '', prerequisites: new Set(), dependents: new Set(), assessments: new Map(), path: { courses: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], length: 1 } });
  assert.ok(Number(result.edges.find((edge) => edge.id === 'AB')!.width) > Number(result.edges.find((edge) => edge.id === 'BC')!.width));
  const direct = directCourseRelations({ node: course('C'), prerequisites: [course('A'), course('B')], dependents: [], links: [{ fromLabel: 'MonHoc', fromId: 'B', type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: 'C' }] }, []);
  assert.deepEqual(direct.prerequisites.map((node) => node.id), ['B']);
  assert.deepEqual(direct.dependents, []);
});
