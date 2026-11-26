import { loadConfig } from '../apps/api/src/config.js';
import { createDriver } from '../apps/api/src/db/connection.js';
import { ensureProjectDatabase, ensureSchema } from '../apps/api/src/db/business.js';
import { seedAdmin } from '../apps/api/src/auth.js';

const config = loadConfig();
const driver = createDriver(config);
try {
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('Set ADMIN_PASSWORD in private .env (10-128 characters)');
  if (config.neo4jDeployment === 'remote') await ensureSchema(driver, config.database);
  else await ensureProjectDatabase(driver, config.database);
  const result = await seedAdmin(driver, config.database, username, password);
  console.log(JSON.stringify({ ...result, database: config.database, note: result.created ? 'Credentials are in the private .env; password not printed.' : 'Existing account preserved; password was not reset.' }, null, 2));
} finally { await driver.close(); }
