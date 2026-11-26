import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadConfig } from '../apps/api/src/config.js';
import { createDriver } from '../apps/api/src/db/connection.js';
import { businessCounts, exportBusinessData } from '../apps/api/src/db/business.js';
import { canonicalBusinessHash, loadBusinessData } from '../packages/shared/src/data.js';

const config = loadConfig();
const driver = createDriver(config);
try {
  await driver.verifyConnectivity();
  const { data: source } = await loadBusinessData(path.join(process.cwd(), 'CSV'));
  const actual = await exportBusinessData(driver, config.database);
  const report = { generatedAt: new Date().toISOString(), database: config.database, nodes: actual.nodes.length, relationships: actual.relationships.length, counts: await businessCounts(driver, config.database), sourceHash: canonicalBusinessHash(source), actualHash: canonicalBusinessHash(actual), matchesSource: canonicalBusinessHash(source) === canonicalBusinessHash(actual) };
  await mkdir('evidence', { recursive: true });
  await writeFile('evidence/db-verification.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (!report.matchesSource) throw new Error('Database differs from source baseline');
} finally { await driver.close(); }
