import neo4j, { type Driver, type ManagedTransaction } from 'neo4j-driver';
import { businessLabels, entityByLabel, entityDefinitions, relationshipDefinitions } from '../../../../packages/shared/src/catalog.js';
import { canonicalBusinessHash, validateBusinessData, type BusinessData, type BusinessNode } from '../../../../packages/shared/src/data.js';
import { encodeProperties, graphWriteLock, plain, readTransaction, writeTransaction } from './connection.js';
import { HttpError } from '../errors.js';

export async function readBusinessData(tx: ManagedTransaction): Promise<BusinessData> {
  const rawRelationships = await tx.run('MATCH (a)-[r]->(b) WHERE any(label IN labels(a) WHERE label IN $labels) OR any(label IN labels(b) WHERE label IN $labels) RETURN labels(a) AS fromLabels,type(r) AS type,labels(b) AS toLabels,count(r) AS count', { labels: businessLabels });
  for (const record of rawRelationships.records) {
    const from = businessLabels.filter((label) => (record.get('fromLabels') as string[]).includes(label));
    const to = businessLabels.filter((label) => (record.get('toLabels') as string[]).includes(label));
    if (from.length !== 1 || to.length !== 1 || !relationshipDefinitions.some((definition) => definition.from === from[0] && definition.to === to[0] && definition.type === record.get('type'))) throw new HttpError(409, 'Database contains an unexpected business relationship type or endpoint-label direction; export must not silently omit it.');
  }
  const nodes: BusinessNode[] = [];
  for (const definition of entityDefinitions) {
    const duplicates = await tx.run(`MATCH (n:${definition.label}) WITH n.${definition.key} AS id,count(n) AS multiplicity WHERE multiplicity>1 RETURN id LIMIT 1`);
    if (duplicates.records.length) throw new HttpError(409, `Database has duplicate ${definition.label} business keys; verify the source before export/import.`);
    const result = await tx.run(`MATCH (n:${definition.label}) RETURN properties(n) AS properties ORDER BY n.${definition.key}`);
    for (const record of result.records) {
      const properties = plain(record.get('properties')) as Record<string, string | number>;
      nodes.push({ label: definition.label, id: String(properties[definition.key]), properties });
    }
  }
  const relationships: BusinessData['relationships'] = [];
  for (const definition of relationshipDefinitions) {
    const from = entityByLabel(definition.from)!;
    const to = entityByLabel(definition.to)!;
    const result = await tx.run(`MATCH (a:${from.label})-[r:${definition.type}]->(b:${to.label}) RETURN a.${from.key} AS fromId,b.${to.key} AS toId,count(r) AS multiplicity ORDER BY fromId,toId`);
    for (const record of result.records) {
      if (Number(plain(record.get('multiplicity'))) !== 1) throw new HttpError(409, `Database has duplicate physical ${definition.type} edges; normalization must not conceal multiplicity.`);
      relationships.push({ fromLabel: from.label, fromId: record.get('fromId') as string, type: definition.type, toLabel: to.label, toId: record.get('toId') as string });
    }
  }
  return validateBusinessData({ nodes, relationships });
}

export async function exportBusinessData(driver: Driver, database: string): Promise<BusinessData> {
  return writeTransaction(driver, database, async (tx) => {
    await graphWriteLock(tx);
    return readBusinessData(tx);
  });
}

export function combineImportData(current: BusinessData, incoming: BusinessData): BusinessData {
  const combined = new Map(current.nodes.map((node) => [`${node.label}:${node.id}`, node]));
  for (const node of incoming.nodes) {
    const key = `${node.label}:${node.id}`;
    const previous = combined.get(key);
    if (previous && canonicalBusinessHash({ nodes: [previous], relationships: [] }) !== canonicalBusinessHash({ nodes: [node], relationships: [] })) throw new HttpError(409, `Import conflicts with existing properties for ${key}; edit explicitly or import into an empty database.`);
    combined.set(key, node);
  }
  return validateBusinessData({ nodes: [...combined.values()], relationships: [...current.relationships, ...incoming.relationships] });
}

export async function importBusinessData(driver: Driver, database: string, input: BusinessData, importedBy = 'script', preview?: { id: string; userId: string }): Promise<{ nodes: number; relationships: number; hash: string }> {
  const data = validateBusinessData(input);
  return writeTransaction(driver, database, async (tx) => {
    await graphWriteLock(tx);
    if (preview) {
      const records = await tx.run('MATCH (p:AppImport {id:$id,userId:$userId}) RETURN properties(p) AS preview', { ...preview });
      if (!records.records.length) throw new HttpError(404, 'Không tìm thấy bản xem trước import.');
      const item = plain(records.records[0].get('preview')) as { hash: string; expiresAt: number; resultJson?: string };
      if (item.resultJson) return JSON.parse(item.resultJson) as { nodes: number; relationships: number; hash: string };
      if (item.expiresAt < Date.now()) throw new HttpError(409, 'Bản xem trước đã hết hạn.');
      if (item.hash !== canonicalBusinessHash(data)) throw new HttpError(409, 'Nội dung import không khớp bản xem trước.');
    }
    const current = await readBusinessData(tx);
    // Validate the union, so cycles using existing edges cannot bypass preview validation.
    combineImportData(current, data);
    for (const definition of entityDefinitions) {
      const rows = data.nodes.filter((node) => node.label === definition.label).map((node) => ({ id: node.id, properties: encodeProperties(node.properties) }));
      if (rows.length) await tx.run(`UNWIND $rows AS row MERGE (n:${definition.label} {${definition.key}:row.id}) SET n=row.properties`, { rows });
    }
    for (const definition of relationshipDefinitions) {
      const from = entityByLabel(definition.from)!;
      const to = entityByLabel(definition.to)!;
      const rows = data.relationships.filter((edge) => edge.fromLabel === definition.from && edge.type === definition.type && edge.toLabel === definition.to).map((edge) => ({ fromId: edge.fromId, toId: edge.toId }));
      if (rows.length) await tx.run(`UNWIND $rows AS row MATCH (a:${from.label} {${from.key}:row.fromId}),(b:${to.label} {${to.key}:row.toId}) MERGE (a)-[:${definition.type}]->(b)`, { rows });
    }
    const resulting = await readBusinessData(tx);
    await tx.run("CREATE (:AppTransfer {id:randomUUID(),kind:'IMPORT',username:$username,createdAt:$createdAt,nodeCount:$nodes,relationshipCount:$relationships})", { username: importedBy, createdAt: new Date().toISOString(), nodes: neo4j.int(data.nodes.length), relationships: neo4j.int(data.relationships.length) });
    const summary = { nodes: resulting.nodes.length, relationships: resulting.relationships.length, hash: canonicalBusinessHash(resulting) };
    if (preview) await tx.run('MATCH (p:AppImport {id:$id,userId:$userId}) SET p.resultJson=$resultJson,p.committedAt=$committedAt REMOVE p.dataJson', { ...preview, resultJson: JSON.stringify(summary), committedAt: new Date().toISOString() });
    return summary;
  });
}

export async function ensureSchema(driver: Driver, database: string): Promise<void> {
  const session = driver.session({ database });
  try {
    for (const definition of entityDefinitions) await session.run(`CREATE CONSTRAINT unique_${definition.label.toLowerCase()} IF NOT EXISTS FOR (n:${definition.label}) REQUIRE n.${definition.key} IS UNIQUE`);
    for (const [name, label, property] of [['appuser_id', 'AppUser', 'id'], ['appuser_username', 'AppUser', 'username'], ['app_lock_name', 'AppGraphLock', 'name'], ['app_import_id', 'AppImport', 'id']]) {
      await session.run(`CREATE CONSTRAINT ${name} IF NOT EXISTS FOR (n:${label}) REQUIRE n.${property} IS UNIQUE`);
    }
  } finally { await session.close(); }
  await writeTransaction(driver, database, async (tx) => { await graphWriteLock(tx); });
}

export async function ensureProjectDatabase(driver: Driver, database: string): Promise<void> {
  if (!/^coursegraph(?:-(?:test|restore)(?:-[a-z0-9]+)?)?$/.test(database)) throw new Error('Only an isolated coursegraph database can be provisioned by this script');
  const session = driver.session({ database: 'system' });
  try { await session.run(`CREATE DATABASE \`${database}\` IF NOT EXISTS WAIT 30 SECONDS`); } finally { await session.close(); }
  await ensureSchema(driver, database);
}

export async function businessCounts(driver: Driver, database: string): Promise<Record<string, number>> {
  return readTransaction(driver, database, async (tx) => {
    const result = await tx.run('MATCH (n) UNWIND labels(n) AS label WITH label WHERE label IN $labels RETURN label,count(*) AS count', { labels: businessLabels });
    return Object.fromEntries(result.records.map((record) => [record.get('label') as string, Number(plain(record.get('count')))]));
  });
}
