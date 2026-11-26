import neo4j, { type Driver, type ManagedTransaction } from 'neo4j-driver';
import { entityByLabel, entityDefinitions, relationshipDefinitions, type EntityDefinition } from '../../../packages/shared/src/catalog.js';
import { validateBusinessData, type BusinessNode, type BusinessEdge } from '../../../packages/shared/src/data.js';
import { encodeProperties, graphWriteLock, plain, readTransaction, writeTransaction } from './db/connection.js';
import { HttpError } from './errors.js';

export function validateNode(definition: EntityDefinition, properties: unknown, expectedId?: string): BusinessNode {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new HttpError(400, 'Thông tin phải là một object.');
  const id = (properties as Record<string, unknown>)[definition.key];
  if (expectedId && id !== expectedId) throw new HttpError(400, 'Không thể thay đổi mã định danh.');
  const validated = validateBusinessData({ nodes: [{ label: definition.label, id, properties }], relationships: [] });
  return validated.nodes[0];
}

async function findNode(tx: ManagedTransaction, definition: EntityDefinition, id: string): Promise<BusinessNode | null> {
  const result = await tx.run(`MATCH (n:${definition.label} {${definition.key}:$id}) RETURN properties(n) AS properties`, { id });
  return result.records.length ? { id, label: definition.label, properties: plain(result.records[0].get('properties')) as BusinessNode['properties'] } : null;
}

export async function listEntities(driver: Driver, database: string, definition: EntityDefinition, options: { q: string; page: number; pageSize: number; facultyId?: string }) {
  return readTransaction(driver, database, async (tx) => {
    const searchable = definition.fields.filter((field) => field.type !== 'number').map((field) => `toLower(coalesce(toString(n.${field.key}),'')) CONTAINS toLower($q)`).join(' OR ');
    const facultyFilter = options.facultyId ? ' AND EXISTS { MATCH (n)-[:THUOC_KHOA]->(:Khoa {MaKhoa:$facultyId}) }' : '';
    const where = `($q='' OR ${searchable})${facultyFilter}`;
    const parameters = { q: options.q, facultyId: options.facultyId ?? null, skip: neo4j.int((options.page - 1) * options.pageSize), limit: neo4j.int(options.pageSize) };
    const counts = await tx.run(`MATCH (n:${definition.label}) WHERE ${where} RETURN count(n) AS total`, parameters);
    const result = await tx.run(`MATCH (n:${definition.label}) WHERE ${where} RETURN properties(n) AS properties ORDER BY n.${definition.key} SKIP $skip LIMIT $limit`, parameters);
    const items = result.records.map((record) => { const properties = plain(record.get('properties')) as BusinessNode['properties']; return { id: String(properties[definition.key]), label: definition.label, properties }; });
    return { items, total: Number(plain(counts.records[0].get('total'))), page: options.page, pageSize: options.pageSize };
  });
}

export async function entityDetail(driver: Driver, database: string, definition: EntityDefinition, id: string) {
  return readTransaction(driver, database, async (tx) => {
    const node = await findNode(tx, definition, id);
    if (!node) throw new HttpError(404, 'Không tìm thấy dữ liệu.');
    const result = await tx.run(`MATCH (n:${definition.label} {${definition.key}:$id})-[r]-(other) WHERE type(r) IN $types RETURN labels(startNode(r)) AS fromLabels,properties(startNode(r)) AS fromProperties,type(r) AS type,labels(endNode(r)) AS toLabels,properties(endNode(r)) AS toProperties`, { id, types: relationshipDefinitions.map((item) => item.type) });
    const links: BusinessEdge[] = [];
    for (const record of result.records) {
      const from = entityDefinitions.find((item) => (record.get('fromLabels') as string[]).includes(item.label));
      const to = entityDefinitions.find((item) => (record.get('toLabels') as string[]).includes(item.label));
      if (from && to) links.push({ fromLabel: from.label, fromId: String(record.get('fromProperties')[from.key]), type: record.get('type') as string, toLabel: to.label, toId: String(record.get('toProperties')[to.key]) });
    }
    const related = async (direction: 'prerequisites' | 'dependents'): Promise<BusinessNode[]> => {
      if (definition.label !== 'MonHoc') return [];
      const pattern = direction === 'prerequisites' ? '(other)-[:TIEN_QUYET_CHO*1..100]->(n)' : '(n)-[:TIEN_QUYET_CHO*1..100]->(other)';
      const rows = await tx.run(`MATCH (n:MonHoc {MaMH:$id}),(other:MonHoc) WHERE EXISTS { MATCH ${pattern} } RETURN properties(other) AS properties ORDER BY other.MaMH`, { id });
      return rows.records.map((record) => { const properties = plain(record.get('properties')) as BusinessNode['properties']; return { id: String(properties.MaMH), label: 'MonHoc', properties }; });
    };
    return { node, links, prerequisites: await related('prerequisites'), dependents: await related('dependents') };
  });
}

export async function createEntity(driver: Driver, database: string, definition: EntityDefinition, properties: unknown): Promise<BusinessNode> {
  const node = validateNode(definition, properties);
  return writeTransaction(driver, database, async (tx) => {
    await graphWriteLock(tx);
    if (await findNode(tx, definition, node.id)) throw new HttpError(409, 'Mã định danh đã tồn tại.');
    await tx.run(`CREATE (n:${definition.label}) SET n=$properties`, { properties: encodeProperties(node.properties) });
    return node;
  });
}

export async function updateEntity(driver: Driver, database: string, definition: EntityDefinition, id: string, properties: unknown): Promise<BusinessNode> {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new HttpError(400, 'Thông tin phải là một object.');
  return writeTransaction(driver, database, async (tx) => {
    await graphWriteLock(tx);
    const current = await findNode(tx, definition, id);
    if (!current) throw new HttpError(404, 'Không tìm thấy dữ liệu.');
    const node = validateNode(definition, { ...current.properties, ...properties }, id);
    await tx.run(`MATCH (n:${definition.label} {${definition.key}:$id}) SET n=$properties`, { id, properties: encodeProperties(node.properties) });
    return node;
  });
}

export async function deleteEntity(driver: Driver, database: string, definition: EntityDefinition, id: string, force: boolean): Promise<{ deleted: boolean; affectedRelationships: number }> {
  return writeTransaction(driver, database, async (tx) => {
    await graphWriteLock(tx);
    if (!await findNode(tx, definition, id)) throw new HttpError(404, 'Không tìm thấy dữ liệu.');
    const result = await tx.run(`MATCH (n:${definition.label} {${definition.key}:$id}) OPTIONAL MATCH (n)-[r]-() RETURN count(DISTINCT r) AS count`, { id });
    const count = Number(plain(result.records[0].get('count')));
    if (count && !force) throw new HttpError(409, 'Dữ liệu đang có liên kết. Xác nhận xóa kèm liên kết để tiếp tục.', { affectedRelationships: count });
    await tx.run(`MATCH (n:${definition.label} {${definition.key}:$id}) ${force ? 'DETACH DELETE' : 'DELETE'} n`, { id });
    return { deleted: true, affectedRelationships: count };
  });
}

type RelationshipInput = { fromLabel: string; fromId: string; type: string; toLabel: string; toId: string };

async function writeRelationship(tx: ManagedTransaction, input: RelationshipInput, action: 'create' | 'delete' | 'verify') {
  const definition = relationshipDefinitions.find((item) => item.from === input.fromLabel && item.type === input.type && item.to === input.toLabel);
  if (!definition) throw new HttpError(400, 'Loại, nhãn hoặc hướng liên kết không được phép.');
  const from = entityByLabel(definition.from)!;
  const to = entityByLabel(definition.to)!;
  if (!await findNode(tx, from, input.fromId) || !await findNode(tx, to, input.toId)) throw new HttpError(404, 'Không tìm thấy node nguồn hoặc đích.');
  const match = `MATCH (a:${from.label} {${from.key}:$fromId}),(b:${to.label} {${to.key}:$toId})`;
  const parameters = { fromId: input.fromId, toId: input.toId };
  const existing = await tx.run(`${match} RETURN EXISTS { MATCH (a)-[:${definition.type}]->(b) } AS exists`, parameters);
  const exists = Boolean(existing.records[0].get('exists'));
  if (action !== 'create') {
    if (!exists) throw new HttpError(404, 'Liên kết không tồn tại.');
    if (action === 'verify') return { exists: true };
    await tx.run(`${match} MATCH (a)-[r:${definition.type}]->(b) DELETE r`, parameters);
    return { deleted: true };
  }
  if (exists) throw new HttpError(409, 'Liên kết đã tồn tại.');
  if (definition.type === 'TIEN_QUYET_CHO') {
    if (input.fromId === input.toId) throw new HttpError(409, 'Môn học không thể là tiên quyết của chính nó.');
    const cycle = await tx.run(`${match} RETURN EXISTS { MATCH (b)-[:TIEN_QUYET_CHO*1..]->(a) } AS cycle`, parameters);
    if (cycle.records[0].get('cycle')) throw new HttpError(409, 'Liên kết này tạo chu trình tiên quyết.');
  }
  await tx.run(`${match} CREATE (a)-[:${definition.type}]->(b)`, parameters);
  return { created: true };
}

export function mutateRelationship(driver: Driver, database: string, input: RelationshipInput, remove = false) {
  return writeTransaction(driver, database, async (tx) => {
    await graphWriteLock(tx);
    return writeRelationship(tx, input, remove ? 'delete' : 'create');
  });
}

export function replaceRelationship(driver: Driver, database: string, previous: RelationshipInput, next: RelationshipInput) {
  return writeTransaction(driver, database, async (tx) => {
    await graphWriteLock(tx);
    const unchanged = previous.type === next.type && previous.fromLabel === next.fromLabel
      && previous.fromId === next.fromId && previous.toLabel === next.toLabel && previous.toId === next.toId;
    if (unchanged) {
      await writeRelationship(tx, previous, 'verify');
    } else {
      await writeRelationship(tx, previous, 'delete');
      await writeRelationship(tx, next, 'create');
    }
    return { updated: !unchanged };
  });
}

export async function updateCompletions(driver: Driver, database: string, studentId: string, courseIds: string[]) {
  const uniqueIds = [...new Set(courseIds)];
  return writeTransaction(driver, database, async (tx) => {
    await graphWriteLock(tx);
    if (!await findNode(tx, entityByLabel('SinhVien')!, studentId)) throw new HttpError(404, 'Không tìm thấy sinh viên.');
    const result = await tx.run('MATCH (m:MonHoc) WHERE m.MaMH IN $ids RETURN count(m) AS count', { ids: uniqueIds });
    if (Number(plain(result.records[0].get('count'))) !== uniqueIds.length) throw new HttpError(400, 'Danh sách chứa môn không tồn tại.');
    await tx.run('MATCH (:SinhVien {MaSV:$id})-[r:DA_HOC]->() DELETE r', { id: studentId });
    if (uniqueIds.length) await tx.run('MATCH (s:SinhVien {MaSV:$id}) UNWIND $ids AS courseId MATCH (m:MonHoc {MaMH:courseId}) MERGE (s)-[:DA_HOC]->(m) WITH s,m OPTIONAL MATCH (s)-[r:DANG_HOC]->(m) DELETE r', { id: studentId, ids: uniqueIds });
    return { updated: true, completedCount: uniqueIds.length };
  });
}
