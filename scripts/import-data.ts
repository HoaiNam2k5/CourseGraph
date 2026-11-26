import path from 'node:path';
import { loadConfig } from '../apps/api/src/config.js';
import { createDriver } from '../apps/api/src/db/connection.js';
import { ensureProjectDatabase, ensureSchema, importBusinessData } from '../apps/api/src/db/business.js';
import { canonicalBusinessHash, loadBusinessData } from '../packages/shared/src/data.js';
import { makeDemoBusinessData } from './demo-business-data.js';

const config = loadConfig();
const demo = process.argv.includes('--demo');
if (config.neo4jDeployment === 'remote' && !demo) {
  throw new Error('Use --demo to import the public demo dataset into a remote database.');
}
const driver = createDriver(config);
try {
  const { data, audit } = await loadBusinessData(path.join(process.cwd(), 'CSV'));
  const input = demo ? makeDemoBusinessData(data) : data;
  const sourceHash = demo ? canonicalBusinessHash(input) : audit.canonicalHash;
  await driver.verifyConnectivity({ database: config.database });
  if (config.neo4jDeployment === 'remote') await ensureSchema(driver, config.database);
  else await ensureProjectDatabase(driver, config.database);
  const result = await importBusinessData(driver, config.database, input);
  const matchesSource = result.hash === sourceHash;
  console.log(JSON.stringify({ database: config.database, ...result, sourceHash, matchesSource }, null, 2));
  if (!matchesSource) throw new Error('Database contains differences from the import baseline; inspect before continuing, no automatic deletion was performed');
} finally { await driver.close(); }
