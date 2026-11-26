import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../apps/api/src/config.js';
import { createDriver } from '../apps/api/src/db/connection.js';
import { exportBusinessData } from '../apps/api/src/db/business.js';
import { canonicalBusinessHash } from '../packages/shared/src/data.js';

const [database, output, compare] = process.argv.slice(2);
if (!/^coursegraph(?:-(?:test|restore|source))?$/.test(database ?? '') || !output) throw new Error('Usage: snapshot-database <project-db> <output.json> [compare-manifest.json]');
const config = loadConfig();
const driver = createDriver(config);
try {
  const data = await exportBusinessData(driver, database);
  const report = {
    createdAt: new Date().toISOString(), database,
    nodes: data.nodes.length, relationships: data.relationships.length,
    canonicalHash: canonicalBusinessHash(data),
    nodesByLabel: Object.fromEntries([...new Set(data.nodes.map((node) => node.label))].sort().map((label) => [label, data.nodes.filter((node) => node.label === label).length])),
  };
  if (compare) {
    const expected = JSON.parse((await readFile(compare, 'utf8')).replace(/^\uFEFF/, '')) as typeof report;
    if (expected.canonicalHash !== report.canonicalHash || expected.nodes !== report.nodes || expected.relationships !== report.relationships) throw new Error('Restored database does not match backup manifest.');
  }
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, verifiedAgainstBackup: Boolean(compare) }, null, 2));
} finally { await driver.close(); }
