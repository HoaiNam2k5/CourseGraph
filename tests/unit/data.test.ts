import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { entityDefinitions, relationshipDefinitions } from '../../packages/shared/src/catalog.js';
import { canonicalBusinessHash, DataValidationError, loadBusinessData, validateBusinessData, type BusinessData, type BusinessNode } from '../../packages/shared/src/data.js';
import { makeDemoBusinessData } from '../../scripts/demo-business-data.js';

const course = (id: string, title = id): BusinessNode => ({ label: 'MonHoc', id, properties: { MaMH: id, TenMH: title, SoTC: 3, LoaiMon: 'Bắt Buộc' } });
const fixture = (): BusinessData => ({ nodes: [course('A'), course('B'), course('C')], relationships: [{ fromLabel: 'MonHoc', fromId: 'A', type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: 'B' }] });

test('source normalizes to verified business baseline and retains historical warnings', async () => {
  const { data, audit } = await loadBusinessData('CSV');
  assert.equal(data.nodes.length, 210);
  assert.equal(data.relationships.length, 1568);
  assert.equal(audit.rawNodes, 220);
  assert.equal(audit.duplicateNodes, 10);
  assert.equal(audit.rawRelationships, 2368);
  assert.equal(audit.duplicateRelationships, 800);
  assert.equal(audit.nodesByLabel.HocKy, 10);
  assert.equal(audit.warnings.historicalPrerequisiteCount, 78);
  assert.equal(new Set(data.relationships.map(({ type }) => type)).size, 12);
  assert.equal(relationshipDefinitions.length, 14);
  assert.equal(audit.canonicalHash, canonicalBusinessHash(data));
  assert.equal(data.relationships.some((edge) => edge.type === 'TIEN_QUYET_CHO' && edge.fromId === 'MH005' && edge.toId === 'MH001'), false);
});

test('canonical hash does not depend on source order or property order', () => {
  const a = fixture();
  const b = structuredClone(a);
  b.nodes.reverse();
  b.nodes[0].properties = Object.fromEntries(Object.entries(b.nodes[0].properties).reverse());
  assert.equal(canonicalBusinessHash(a), canonicalBusinessHash(b));
  b.nodes[0].properties.TenMH = 'Changed';
  assert.notEqual(canonicalBusinessHash(a), canonicalBusinessHash(b));
});

test('public demo replaces personal records and preserves a valid graph without editing the source', async () => {
  const { data, audit } = await loadBusinessData('CSV');
  const demo = makeDemoBusinessData(data);
  assert.equal(demo.nodes.length, data.nodes.length);
  assert.equal(demo.relationships.length, data.relationships.length);
  const people = demo.nodes.filter(({ label }) => label === 'SinhVien' || label === 'GiangVien');
  assert.equal(people.length, audit.nodesByLabel.SinhVien + audit.nodesByLabel.GiangVien);
  for (const person of people) {
    assert.match(person.id, /^DEMO-(SV|GV)\d+$/);
    assert.match(String(person.properties.HoTen), /mẫu/);
    assert.match(String(person.properties.Email), /@example\.invalid$/);
    assert.equal(person.properties.SDT, '0000000000');
    if (person.label === 'SinhVien') assert.equal(person.properties.NgaySinh, '2005-01-01');
  }
  assert.deepEqual(demo.relationships.filter(({ type }) => type === 'TIEN_QUYET_CHO'), data.relationships.filter(({ type }) => type === 'TIEN_QUYET_CHO'));
  assert.equal(canonicalBusinessHash(data), audit.canonicalHash);
  assert.deepEqual(validateBusinessData(demo), demo);
});

test('identical nodes and edges deduplicate but conflicting business keys are rejected', () => {
  const data = fixture();
  data.nodes.push(structuredClone(data.nodes[0]));
  data.relationships.push(structuredClone(data.relationships[0]));
  const normalized = validateBusinessData(data);
  assert.equal(normalized.nodes.length, 3);
  assert.equal(normalized.relationships.length, 1);
  data.nodes.push(course('A', 'Conflicting title'));
  assert.throws(() => validateBusinessData(data), /Conflicting duplicate key/);
});

test('orphan endpoints, unpermitted labels/types/directions and unknown fields fail validation', () => {
  const orphan = fixture();
  orphan.relationships[0].toId = 'MISSING';
  assert.throws(() => validateBusinessData(orphan), /Missing destination/);
  const invalidType = fixture();
  invalidType.relationships[0].type = 'DELETE_ALL';
  assert.throws(() => validateBusinessData(invalidType), /not permitted/);
  const unknownLabel = fixture() as unknown as { nodes: { label: string }[]; relationships: unknown[] };
  unknownLabel.nodes[0].label = 'AppUser';
  assert.throws(() => validateBusinessData(unknownLabel), /Invalid label/);
  const unknownProperty = fixture();
  unknownProperty.nodes[0].properties.passwordHash = 'not-business-data';
  assert.throws(() => validateBusinessData(unknownProperty), /Unknown property/);
});

test('self prerequisites and multi-hop prerequisite cycles are rejected', () => {
  const self = fixture();
  self.relationships[0].toId = 'A';
  assert.throws(() => validateBusinessData(self), /cannot reference itself/);
  const cyclic = fixture();
  cyclic.relationships.push(
    { fromLabel: 'MonHoc', fromId: 'B', type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: 'C' },
    { fromLabel: 'MonHoc', fromId: 'C', type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: 'A' },
  );
  assert.throws(() => validateBusinessData(cyclic), /contains a cycle/);
});

test('invalid shapes, missing values, nonnumeric credits and mismatched ids are rejected', () => {
  assert.throws(() => validateBusinessData({}), DataValidationError);
  const data = fixture();
  data.nodes[0].properties.SoTC = '3';
  assert.throws(() => validateBusinessData(data), /finite integer/);
  data.nodes[0].properties.SoTC = 0;
  assert.throws(() => validateBusinessData(data), /between 1 and 30/);
  data.nodes[0].properties.SoTC = 3;
  data.nodes[0].id = 'different';
  assert.throws(() => validateBusinessData(data), /Must equal MaMH/);
  data.nodes[0].id = 'A';
  data.nodes[0].properties.TenMH = '  ';
  assert.throws(() => validateBusinessData(data), /Required value is empty/);
});

test('calendar-invalid dates are rejected rather than rolled into the next month', () => {
  const data: BusinessData = { nodes: [{ label: 'SinhVien', id: 'SV1', properties: { MaSV: 'SV1', HoTen: 'Test', NgaySinh: '2001-02-29', GioiTinh: 'Nam', Email: 'test@example.com', SDT: '0900000000', KhoaHoc: 'K1' } }], relationships: [] };
  assert.throws(() => validateBusinessData(data), /valid ISO date/);
  data.nodes[0].properties.NgaySinh = '2000-02-29';
  assert.equal(validateBusinessData(data).nodes.length, 1);
});

test('CSV malformed headers are reported with filename and line', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'coursegraph-csv-'));
  try {
    for (const definition of entityDefinitions) await writeFile(path.join(directory, definition.file), await readFile(path.join('CSV', definition.file)));
    await writeFile(path.join(directory, 'QuanHeLienKet.csv'), await readFile('CSV/QuanHeLienKet.csv'));
    await writeFile(path.join(directory, 'MonHoc.csv'), 'MaMH,WRONG,SoTC,LoaiMon\nA,Example,3,Required\n');
    await assert.rejects(loadBusinessData(directory), /MonHoc.csv:1: CSV headers/);
    await writeFile(path.join(directory, 'MonHoc.csv'), 'MaMH,WRONG,SoTC,LoaiMon\n');
    await assert.rejects(loadBusinessData(directory), /MonHoc.csv:1: CSV headers/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('long prerequisite chains validate without overflowing the call stack', () => {
  const data: BusinessData = { nodes: [], relationships: [] };
  for (let index = 0; index < 12_000; index++) {
    data.nodes.push(course(`M${index}`));
    if (index) data.relationships.push({ fromLabel: 'MonHoc', fromId: `M${index - 1}`, type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: `M${index}` });
  }
  assert.equal(validateBusinessData(data).relationships.length, 11_999);
  data.relationships.push({ fromLabel: 'MonHoc', fromId: 'M11999', type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: 'M0' });
  assert.throws(() => validateBusinessData(data), /contains a cycle/);
});
