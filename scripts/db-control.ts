import { loadConfig } from '../apps/api/src/config.js';
import { createDriver } from '../apps/api/src/db/connection.js';

const [action, database] = process.argv.slice(2);
if (!['stop', 'start', 'create'].includes(action) || !/^coursegraph(?:-(?:test|restore|source))?$/.test(database ?? '')) {
  throw new Error('Usage: db-control <stop|start|create> <coursegraph[-test|-restore|-source]>. Only project databases are allowed.');
}
const config = loadConfig();
if (config.neo4jUri !== 'bolt://127.0.0.1:17687') throw new Error('Maintenance is restricted to the isolated local instance on 17687.');
const driver = createDriver(config);
const session = driver.session({ database: 'system' });
try {
  const query = action === 'create'
    ? `CREATE DATABASE \`${database}\` IF NOT EXISTS WAIT 30 SECONDS`
    : `${action.toUpperCase()} DATABASE \`${database}\` WAIT 30 SECONDS`;
  const result = await session.run(query);
  if (result.records.some((record) => record.has('success') && record.get('success') === false)) throw new Error(`Database ${action} WAIT did not complete successfully.`);
  const status = await session.run('SHOW DATABASES YIELD name,currentStatus RETURN name,currentStatus');
  const record = status.records.find((item) => item.get('name') === database);
  const expected = action === 'stop' ? 'offline' : 'online';
  if (!record || record.get('currentStatus') !== expected) throw new Error(`Database ${database} is not ${expected}; maintenance action did not complete.`);
  console.log(`${action}: ${database} (${expected})`);
} finally { await session.close(); await driver.close(); }
