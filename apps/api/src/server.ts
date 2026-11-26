import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDriver } from './db/connection.js';

const config = loadConfig();
const driver = createDriver(config);
const app = createApp({ config, driver });
try { await driver.verifyConnectivity(); console.log('Neo4j driver connected; readiness endpoint checks the target database.'); }
catch { console.error('Neo4j not ready at startup; the application will report readiness 503 until connectivity recovers.'); }
const server = app.listen(config.port, config.host, () => { console.log(`CourseGraph listening at http://${config.host}:${config.port}`); });
server.on('error', (error) => { console.error('Server failed to listen:', error.message); void driver.close(); process.exitCode = 1; });
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  server.close(() => { void driver.close().then(() => { process.exitCode = 0; }); });
  setTimeout(() => { server.closeAllConnections(); void driver.close(); }, 10000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
