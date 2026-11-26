import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../apps/api/src/app.js';
import { loadConfig } from '../../apps/api/src/config.js';
import { createDriver, writeTransaction } from '../../apps/api/src/db/connection.js';
import { ensureProjectDatabase, ensureSchema, exportBusinessData, importBusinessData } from '../../apps/api/src/db/business.js';
import { seedAdmin } from '../../apps/api/src/auth.js';
import { entityDefinitions } from '../../packages/shared/src/catalog.js';
import { canonicalBusinessHash, type BusinessData, type BusinessNode } from '../../packages/shared/src/data.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { csvFilenames } from '../../apps/api/src/transfers.js';

const config = loadConfig({ mode: 'test', database: process.env.NEO4J_TEST_DATABASE ?? 'coursegraph-test', appOrigin: 'http://127.0.0.1:3000' });
if (!/^coursegraph-test(?:-[a-z0-9]+)?$/.test(config.database)) throw new Error('Integration tests require an isolated coursegraph-test database');
const driver = createDriver(config);
const app = createApp({ config, driver });
const password = 'CourseGraph-Test-123!';
const course = (id: string): BusinessNode => ({ label: 'MonHoc', id, properties: { MaMH: id, TenMH: `Course ${id}`, SoTC: 3, LoaiMon: 'Required' } });
const student = (id: string): BusinessNode => ({ label: 'SinhVien', id, properties: { MaSV: id, HoTen: `Student ${id}`, NgaySinh: '2001-01-01', GioiTinh: 'Other', Email: `${id.toLowerCase()}@example.com`, SDT: '0900000000', KhoaHoc: 'K1' } });
const fixture: BusinessData = {
  nodes: ['A', 'B', 'C', 'D', 'ROOT', 'OUTSIDE'].map(course).concat([
    student('S1'), student('NEW'),
    { label: 'ChuongTrinhDaoTao', id: 'P1', properties: { MaChuongTrinh: 'P1', TenChuongTrinh: 'Program', NamBatDau: 2026, ThoiGianDaoTao: 4 } },
    { label: 'HocKy', id: 'HK1', properties: { MaHK: 'HK1', TenHK: 'Semester 1', NamHoc: '2026-2027' } },
  ]),
  relationships: [
    { fromLabel: 'MonHoc', fromId: 'A', type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: 'B' },
    { fromLabel: 'MonHoc', fromId: 'B', type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: 'D' },
    { fromLabel: 'MonHoc', fromId: 'C', type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: 'D' },
    { fromLabel: 'SinhVien', fromId: 'S1', type: 'DA_HOC', toLabel: 'MonHoc', toId: 'A' },
    { fromLabel: 'SinhVien', fromId: 'S1', type: 'DA_HOC', toLabel: 'MonHoc', toId: 'B' },
    { fromLabel: 'SinhVien', fromId: 'S1', type: 'DANG_HOC', toLabel: 'MonHoc', toId: 'C' },
    { fromLabel: 'SinhVien', fromId: 'S1', type: 'THEO_HOC', toLabel: 'ChuongTrinhDaoTao', toId: 'P1' },
    { fromLabel: 'ChuongTrinhDaoTao', fromId: 'P1', type: 'BAO_GOM', toLabel: 'MonHoc', toId: 'D' },
    { fromLabel: 'ChuongTrinhDaoTao', fromId: 'P1', type: 'BAO_GOM', toLabel: 'MonHoc', toId: 'ROOT' },
    { fromLabel: 'HocKy', fromId: 'HK1', type: 'MO_DANG_KY', toLabel: 'MonHoc', toId: 'ROOT' },
  ],
};
type Session = { cookie: string; csrfToken: string; user: { id: string; role: string } };
let admin: Session;

async function signIn(username = 'admin', inputPassword = password): Promise<Session> {
  const response = await request(app).post('/api/auth/login').set('Origin', config.appOrigin).send({ username, password: inputPassword }).expect(200);
  const header = response.headers['set-cookie'] as unknown as string[];
  assert.ok(header.some((value) => value.includes('HttpOnly') && value.includes('SameSite=Strict')));
  return { cookie: header.map((value) => value.split(';')[0]).join('; '), csrfToken: response.body.csrfToken as string, user: response.body.user as Session['user'] };
}

function get(url: string, session = admin) { return request(app).get(url).set('Cookie', session.cookie); }
function mutate(method: 'post' | 'patch' | 'put' | 'delete', url: string, body: object, session = admin) {
  return request(app)[method](url).set('Origin', config.appOrigin).set('Cookie', session.cookie).set('x-csrf-token', session.csrfToken).send(body);
}

describe('CourseGraph real Neo4j integration', { concurrency: false }, () => {
  before(async () => { await driver.verifyConnectivity(); await ensureProjectDatabase(driver, config.database); });
  beforeEach(async () => {
    await writeTransaction(driver, config.database, async (tx) => { await tx.run('MATCH (n) DETACH DELETE n'); });
    await importBusinessData(driver, config.database, fixture, 'test-fixture');
    await seedAdmin(driver, config.database, 'admin', password);
    admin = await signIn();
  });
  after(async () => {
    await writeTransaction(driver, config.database, async (tx) => { await tx.run('MATCH (n) DETACH DELETE n'); });
    await driver.close();
  });

  test('health, auth, catalog, pagination and parameterized search use actual Neo4j', async () => {
    await request(app).get('/api/health/live').expect(200);
    await request(app).get('/api/health/ready').expect(200);
    await request(app).get('/api/courses').expect(401);
    const me = await get('/api/auth/me').expect(200);
    assert.equal(me.body.user.role, 'ADMIN');
    assert.equal(JSON.stringify(me.body).includes('passwordHash'), false);
    const catalog = await get('/api/catalog').expect(200);
    assert.equal(catalog.body.entities.length, 6);
    const list = await get('/api/courses?page=2&pageSize=2').expect(200);
    assert.equal(list.body.total, 6); assert.equal(list.body.items.length, 2);
    const injection = await get(`/api/courses?q=${encodeURIComponent("' OR 1=1 //")}`).expect(200);
    assert.equal(injection.body.total, 0);
    await get('/api/courses?pageSize=10001').expect(400);
    const detail = await get('/api/courses/D').expect(200);
    assert.deepEqual(detail.body.prerequisites.map((node: BusinessNode) => node.id).sort(), ['A', 'B', 'C']);
  });

  test('relationship listing filters valid directions, folds Vietnamese and pages across the full result', async () => {
    await request(app).get('/api/relationships').expect(401);
    await mutate('patch', '/api/courses/D', { properties: { TenMH: 'Đồ thị dữ liệu' } }).expect(200);
    await writeTransaction(driver, config.database, async (tx) => {
      await tx.run("MATCH (s:SinhVien {MaSV:'S1'}), (m:MonHoc {MaMH:'A'}) CREATE (m)-[:DA_HOC]->(s)");
    });
    await mutate('post', '/api/users', { username: 'reader', password, displayName: 'Reader', role: 'VIEWER' }).expect(201);
    const reader = await signIn('reader');
    const list = await get('/api/relationships', reader).expect(200);
    assert.equal(list.body.total, fixture.relationships.length);
    const results = await get('/api/relationships?type=TIEN_QUYET_CHO&q=do%20thi%20du%20lieu&sort=from&order=desc&pageSize=1', reader).expect(200);
    assert.equal(results.body.total, 2);
    assert.deepEqual(results.body.items, [{
      fromLabel: 'MonHoc', fromId: 'C', fromName: 'Course C', type: 'TIEN_QUYET_CHO',
      toLabel: 'MonHoc', toId: 'D', toName: 'Đồ thị dữ liệu',
    }]);
    const byTitle = await get('/api/relationships?q=tien%20quyet%20cho&sort=from&order=desc&page=2&pageSize=1', reader).expect(200);
    assert.equal(byTitle.body.total, 3);
    assert.equal(byTitle.body.items[0].fromId, 'B');
    const empty = await get('/api/relationships?q=absent&page=2&pageSize=1', reader).expect(200);
    assert.deepEqual(empty.body, { items: [], page: 2, pageSize: 1, total: 0 });
    await get('/api/relationships?sort=invalid', reader).expect(400);
    await get('/api/relationships?type=UNKNOWN', reader).expect(400);
    await mutate('delete', '/api/relationships', fixture.relationships[0], reader).expect(403);
  });

  test('all six entity types support CRUD and validate immutable keys and dates', async () => {
    for (const definition of entityDefinitions) {
      const id = `TEST_${definition.label}`;
      const properties = Object.fromEntries(definition.fields.map((field) => [field.key, field.key === definition.key ? id : field.type === 'number' ? (field.key === 'NamBatDau' ? 2026 : 3) : field.type === 'date' ? '2000-01-01' : field.type === 'email' ? 'test@example.com' : `Test ${field.key}`]));
      await mutate('post', `/api/${definition.slug}`, { properties }).expect(201);
      await mutate('post', `/api/${definition.slug}`, { properties }).expect(409);
      await get(`/api/${definition.slug}/${id}`).expect(200);
      const editable = definition.fields.find((field) => field.key !== definition.key && field.type === 'string')!;
      await mutate('patch', `/api/${definition.slug}/${id}`, { properties: { [editable.key]: 'Updated' } }).expect(200);
      await mutate('patch', `/api/${definition.slug}/${id}`, { properties: { [definition.key]: 'CHANGED' } }).expect(400);
      await mutate('delete', `/api/${definition.slug}/${id}`, {}).expect(200);
      await get(`/api/${definition.slug}/${id}`).expect(404);
    }
    await mutate('post', '/api/students', { properties: { ...student('BAD_DATE').properties, NgaySinh: '2000-02-31' } }).expect(400);
  });

  test('CSRF and Origin reject writes including byte-length-mismatched Unicode tokens', async () => {
    await request(app).post('/api/courses').set('Cookie', admin.cookie).set('Origin', config.appOrigin).send({ properties: course('BAD').properties }).expect(403);
    await request(app).post('/api/courses').set('Cookie', admin.cookie).set('Origin', config.appOrigin).set('x-csrf-token', 'é'.repeat(48)).send({ properties: course('BAD').properties }).expect(403);
    await request(app).post('/api/auth/login').set('Origin', 'https://evil.invalid').send({ username: 'admin', password }).expect(403);
    await request(app).post('/api/courses').set('Cookie', admin.cookie).set('Origin', 'https://evil.invalid').set('x-csrf-token', admin.csrfToken).send({ properties: course('BAD').properties }).expect(403);
  });

  test('viewer cannot write, role changes and disabled accounts revoke existing JWTs', async () => {
    const created = await mutate('post', '/api/users', { username: 'viewer', password, displayName: 'Viewer', role: 'VIEWER' }).expect(201);
    const viewer = await signIn('viewer');
    await get('/api/courses', viewer).expect(200);
    await get('/api/users', viewer).expect(403);
    await mutate('post', '/api/courses', { properties: course('DENIED').properties }, viewer).expect(403);
    await mutate('patch', `/api/users/${created.body.id}`, { active: false }).expect(200);
    await get('/api/courses', viewer).expect(401);
    await request(app).post('/api/auth/login').set('Origin', config.appOrigin).send({ username: 'viewer', password }).expect(401);
    await mutate('patch', `/api/users/${admin.user.id}`, { active: false }).expect(409);
    await mutate('patch', `/api/users/${admin.user.id}`, { role: 'VIEWER' }).expect(409);
    await mutate('patch', `/api/users/${created.body.id}`, { active: true, role: 'ADMIN' }).expect(200);
    await get('/api/auth/me', viewer).expect(401);
    const promoted = await signIn('viewer');
    await get('/api/users', promoted).expect(200);
    await mutate('post', `/api/users/${created.body.id}/reset-password`, { password: 'Reset-Password-123!' }).expect(200);
    await get('/api/auth/me', promoted).expect(401);
    await signIn('viewer', 'Reset-Password-123!');
  });

  test('logout, password changes and auth-secret rotation invalidate issued tokens', async () => {
    const old = admin;
    await mutate('post', '/api/auth/logout', {}).expect(200);
    await get('/api/auth/me', old).expect(401);
    admin = await signIn();
    await mutate('post', '/api/auth/change-password', { currentPassword: password, newPassword: 'Replacement-Pass-123!' }).expect(200);
    await get('/api/auth/me').expect(401);
    const fresh = await signIn('admin', 'Replacement-Pass-123!');
    const rotatedApp = createApp({ driver, config: { ...config, jwtSecret: 'rotated-generation-'.repeat(4) } });
    await request(rotatedApp).get('/api/auth/me').set('Cookie', fresh.cookie).expect(401);
  });

  test('relationships prevent self-loops, duplicates, missing nodes and generic-route cycle bypass', async () => {
    await mutate('post', '/api/prerequisites', { fromId: 'A', toId: 'A' }).expect(409);
    await mutate('post', '/api/prerequisites', { fromId: 'A', toId: 'B' }).expect(409);
    await mutate('post', '/api/prerequisites', { fromId: 'D', toId: 'A' }).expect(409);
    await mutate('post', '/api/prerequisites', { fromId: 'MISSING', toId: 'A' }).expect(404);
    await mutate('post', '/api/relationships', { fromLabel: 'MonHoc', fromId: 'D', type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: 'A' }).expect(409);
    await mutate('post', '/api/relationships', { fromLabel: 'MonHoc', fromId: 'A', type: 'DANG_KY', toLabel: 'MonHoc', toId: 'B' }).expect(400);
    await mutate('delete', '/api/courses/A', {}).expect(409);
    await mutate('delete', '/api/courses/A?force=true', {}).expect(200);
    const data = await exportBusinessData(driver, config.database);
    assert.equal(data.relationships.some((edge) => edge.fromId === 'A' || edge.toId === 'A'), false);
  });

  test('editing a link keeps the original on failure and updates both endpoints atomically', async () => {
    const previous = fixture.relationships[0];
    const next = { ...previous, fromId: 'ROOT', toId: 'A' };
    await mutate('patch', '/api/relationships', { previous, next: fixture.relationships[1] }).expect(409);
    await mutate('patch', '/api/relationships', { previous, next: previous }).expect(200, { updated: false });
    await mutate('patch', '/api/relationships', { previous, next }).expect(200, { updated: true });
    await mutate('patch', '/api/relationships', { previous, next }).expect(404);
    const detail = await get('/api/courses/ROOT').expect(200);
    assert.ok(detail.body.links.some((edge: typeof next) => edge.type === next.type && edge.toId === 'A'));
  });

  test('concurrent opposite prerequisite writes serialize so only one succeeds', async () => {
    for (const id of ['X', 'Y']) await mutate('post', '/api/courses', { properties: course(id).properties }).expect(201);
    const results = await Promise.all([
      mutate('post', '/api/prerequisites', { fromId: 'X', toId: 'Y' }),
      mutate('post', '/api/prerequisites', { fromId: 'Y', toId: 'X' }),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  });

  test('recommendations include roots/new students and enforce all prerequisites, curriculum, semester', async () => {
    const roots = await get('/api/students/NEW/recommendations').expect(200);
    assert.deepEqual(roots.body.items.map((node: BusinessNode) => node.id).sort(), ['A', 'C', 'OUTSIDE', 'ROOT']);
    const partial = await get('/api/students/S1/recommendations').expect(200);
    const assessments = partial.body.assessments as { course: BusinessNode; status: string; inScope: boolean; prerequisites: BusinessNode[]; missingPrerequisites: BusinessNode[] }[];
    assert.deepEqual(assessments.find((item) => item.course.id === 'D')!.missingPrerequisites.map((node) => node.id), ['C']);
    assert.equal(assessments.find((item) => item.course.id === 'C')!.status, 'studying');
    assert.equal(partial.body.items.some((node: BusinessNode) => node.id === 'D'), false);
    assert.equal(partial.body.items.some((node: BusinessNode) => node.id === 'C'), false);
    await mutate('put', '/api/students/S1/completions', { courseIds: ['A', 'B', 'C'] }).expect(200);
    const complete = await get('/api/students/S1/recommendations?programId=P1').expect(200);
    assert.deepEqual(complete.body.items.map((node: BusinessNode) => node.id).sort(), ['D', 'ROOT']);
    const semester = await get('/api/students/S1/recommendations?programId=P1&semesterId=HK1').expect(200);
    assert.deepEqual(semester.body.items.map((node: BusinessNode) => node.id), ['ROOT']);
    assert.equal(semester.body.assessments.find((item: { course: BusinessNode }) => item.course.id === 'D').status, 'eligible');
    assert.equal(semester.body.assessments.find((item: { course: BusinessNode }) => item.course.id === 'D').inScope, false);
    await mutate('put', '/api/students/S1/completions', { courseIds: ['B', 'C'] }).expect(200);
    const missingAncestor = await get('/api/students/S1/recommendations').expect(200);
    assert.equal(missingAncestor.body.items.some((node: BusinessNode) => node.id === 'D'), false, 'A is an indirect prerequisite even when direct parents B and C are complete');
    await get('/api/students/MISSING/recommendations').expect(404);
  });

  test('connection details require admin and strip URI credentials and metadata', async () => {
    const isolatedApp = createApp({ driver, config: loadConfig({ ...config, neo4jUri: 'bolt://privateuser:privatepw@127.0.0.1:17687?secret=bad#fragment', neo4jDeployment: 'standalone', neo4jBrowserUrl: 'http://127.0.0.1:17474/browser/' }) });
    await request(isolatedApp).get('/api/system/connection').expect(401);
    const response = await request(isolatedApp).get('/api/system/connection').set('Cookie', admin.cookie).expect(200);
    assert.equal(response.body.uri, 'bolt://127.0.0.1:17687');
    assert.equal(response.body.database, config.database);
    assert.equal(response.body.deployment, 'standalone');
    assert.equal(response.body.browserUrl, 'http://127.0.0.1:17474/browser/');
    assert.equal(JSON.stringify(response.body).includes('private'), false);
    assert.equal(JSON.stringify(response.body).includes(config.neo4jPassword), false);
    await mutate('post', '/api/users', { username: 'connviewer', password, displayName: 'Connection viewer', role: 'VIEWER' }).expect(201);
    const viewer = await signIn('connviewer');
    await request(isolatedApp).get('/api/system/connection').set('Cookie', viewer.cookie).expect(403);
    assert.throws(() => loadConfig({ ...config, neo4jBrowserUrl: 'javascript:alert(1)' }));
  });

  test('graph, shortest paths and stats match actual fixture data', async () => {
    const graph = await get('/api/graph?courseId=B&depth=1').expect(200);
    const ids = new Set(graph.body.nodes.map((node: BusinessNode) => node.id));
    graph.body.edges.forEach((edge: { from: string; to: string }) => { assert.ok(ids.has(edge.from)); assert.ok(ids.has(edge.to)); });
    const paths = await get('/api/paths?from=A&to=D').expect(200);
    assert.equal(paths.body.paths[0].length, 2);
    const stats = await get('/api/statistics').expect(200);
    assert.equal(stats.body.counts.MonHoc, 6);
    assert.equal(stats.body.relationshipCount, fixture.relationships.length);
    assert.equal(stats.body.longestChain.length, 2);
  });

  test('import is idempotent, previews are user-bound and conflicts never silently overwrite', async () => {
    const baseline = canonicalBusinessHash(await exportBusinessData(driver, config.database));
    const preview = await mutate('post', '/api/imports/preview', { data: fixture }).expect(200);
    await mutate('post', '/api/users', { username: 'anotheradmin', password, displayName: 'Another admin', role: 'ADMIN' }).expect(201);
    const otherAdmin = await signIn('anotheradmin');
    await mutate('post', `/api/imports/${preview.body.id}/commit`, {}, otherAdmin).expect(404);
    const first = await mutate('post', `/api/imports/${preview.body.id}/commit`, {}).expect(200);
    const second = await mutate('post', `/api/imports/${preview.body.id}/commit`, {}).expect(200);
    assert.equal(first.body.hash, baseline); assert.deepEqual(second.body, first.body);
    const conflicting = structuredClone(fixture);
    conflicting.nodes[0].properties.TenMH = 'Unexpected replacement';
    await mutate('post', '/api/imports/preview', { data: conflicting }).expect(409);
    await assert.rejects(() => importBusinessData(driver, config.database, conflicting), /conflicts/);
    assert.equal(canonicalBusinessHash(await exportBusinessData(driver, config.database)), baseline);
    const malformed = structuredClone(fixture);
    malformed.relationships.push({ fromLabel: 'MonHoc', fromId: 'MISSING', type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: 'A' });
    await mutate('post', '/api/imports/preview', { data: malformed }).expect(400);
    const cycle = structuredClone(fixture);
    cycle.relationships = [{ fromLabel: 'MonHoc', fromId: 'D', type: 'TIEN_QUYET_CHO', toLabel: 'MonHoc', toId: 'A' }];
    await mutate('post', '/api/imports/preview', { data: cycle }).expect(400);
  });

  test('physical duplicate edges fail verification and exports omit credentials', async () => {
    const exported = await get('/api/exports/business-data').expect(200);
    assert.equal(exported.body.nodes.length, fixture.nodes.length);
    assert.equal(JSON.stringify(exported.body).includes('passwordHash'), false);
    await get('/api/exports/csv?label=MonHoc').expect('Content-Type', /csv/).expect(200);
    const history = await get('/api/transfers/history').expect(200);
    assert.ok(history.body.items.some((item: { kind: string }) => item.kind === 'EXPORT'));
    await writeTransaction(driver, config.database, async (tx) => { await tx.run("MATCH (a:MonHoc {MaMH:'A'}),(b:MonHoc {MaMH:'B'}) CREATE (a)-[:TIEN_QUYET_CHO]->(b)"); });
    await assert.rejects(() => exportBusinessData(driver, config.database), /duplicate physical/);
    await get('/api/exports/business-data').expect(409);
  });

  test('unexpected relationship directions and types fail verification instead of being omitted', async () => {
    await writeTransaction(driver, config.database, async (tx) => { await tx.run("MATCH (a:MonHoc {MaMH:'A'}),(b:MonHoc {MaMH:'B'}) CREATE (a)-[:DANG_KY]->(b)"); });
    await assert.rejects(() => exportBusinessData(driver, config.database), /unexpected business relationship/);
    await writeTransaction(driver, config.database, async (tx) => { await tx.run('MATCH ()-[r:DANG_KY]->() DELETE r'); await tx.run("MATCH (a:MonHoc {MaMH:'A'}),(b:MonHoc {MaMH:'B'}) CREATE (a)-[:UNKNOWN_RELATION]->(b)"); });
    await assert.rejects(() => exportBusinessData(driver, config.database), /unexpected business relationship/);
    await get('/api/exports/business-data').expect(409);
  });

  test('raw duplicate business-key nodes fail verification even if properties are identical', async () => {
    const session = driver.session({ database: config.database });
    let duplicateElementId: string | undefined;
    try {
      await session.run('DROP CONSTRAINT unique_monhoc IF EXISTS');
      const result = await session.run("MATCH (a:MonHoc {MaMH:'A'}) CREATE (duplicate:MonHoc) SET duplicate=properties(a) RETURN elementId(duplicate) AS id");
      duplicateElementId = result.records[0].get('id') as string;
      await assert.rejects(() => exportBusinessData(driver, config.database), /duplicate MonHoc business keys/);
    } finally {
      if (duplicateElementId) await session.run('MATCH (n:MonHoc) WHERE elementId(n)=$id DETACH DELETE n', { id: duplicateElementId });
      await session.close();
      await ensureSchema(driver, config.database);
    }
  });

  test('unreachable database returns readiness503 without stopping liveness', async () => {
    const offlineDriver = createDriver({ ...config, neo4jUri: 'bolt://127.0.0.1:1' });
    const offlineApp = createApp({ config, driver: offlineDriver });
    try {
      await request(offlineApp).get('/api/health/live').expect(200);
      await request(offlineApp).get('/api/health/ready').expect(503);
    } finally { await offlineDriver.close(); }
  });

  test('literal seven-CSV preview normalizes originals, rejects unsafe filenames and commits idempotently', async () => {
    // Clear only this explicitly isolated test database, then import the original source set.
    await writeTransaction(driver, config.database, async (tx) => { await tx.run('MATCH (n) WHERE NOT n:AppUser DETACH DELETE n'); });
    const files = await Promise.all(csvFilenames.map(async (name) => ({ name, content: await readFile(path.join(process.cwd(), 'CSV', name), 'utf8') })));
    const preview = await mutate('post', '/api/imports/csv/preview', { files }).expect(200);
    assert.equal(preview.body.summary.nodes, 210);
    assert.equal(preview.body.summary.relationships, 1568);
    assert.ok(preview.body.warnings.some((warning: string) => warning.includes('800')));
    await mutate('post', `/api/imports/${preview.body.id}/commit`, {}).expect(200);
    const secondPreview = await mutate('post', '/api/imports/csv/preview', { files }).expect(200);
    const secondCommit = await mutate('post', `/api/imports/${secondPreview.body.id}/commit`, {}).expect(200);
    assert.equal(secondCommit.body.nodes, 210); assert.equal(secondCommit.body.relationships, 1568);
    await mutate('post', '/api/imports/csv/preview', { files: files.map((file, index) => index === 0 ? { ...file, name: '../MonHoc.csv' } : file) }).expect(400);
    await mutate('post', '/api/imports/csv/preview', { files: [...files.slice(0, 6), files[0]] }).expect(400);
    await mutate('post', '/api/imports/csv/preview', { files: files.slice(1) }).expect(400);
    await mutate('post', '/api/imports/csv/preview', { files: files.map((file, index) => index === 0 ? { ...file, content: 'x'.repeat(2 * 1024 * 1024 + 1) } : file) }).expect(413);
  });

  test('body-parser oversized payload returns413 instead of a generic500', async () => {
    await request(app).post('/api/imports/csv/preview').set('Origin', config.appOrigin).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrfToken).send({ files: [], padding: 'x'.repeat(10 * 1024 * 1024 + 1) }).expect(413);
  });
});
