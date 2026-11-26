import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import request from 'supertest';
import { createApp } from '../apps/api/src/app.js';
import { loadConfig } from '../apps/api/src/config.js';
import { createDriver } from '../apps/api/src/db/connection.js';

const config = loadConfig();
if (config.database !== 'coursegraph' || config.neo4jUri !== 'bolt://127.0.0.1:17687') throw new Error('Restore verification is restricted to the isolated project runtime.');
const restored = parse(await readFile('.local/restored.env', 'utf8'));
assert.equal(restored.NEO4J_DATABASE, 'coursegraph-restore');
assert.notEqual(restored.JWT_SECRET, config.jwtSecret);
const driver = createDriver(config);
try {
  const source = createApp({ config: { ...config, mode: 'test' }, driver });
  const issued = await request(source).post('/api/auth/login').set('Origin', config.appOrigin).send({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
  assert.equal(issued.status, 200);
  const cookies = issued.headers['set-cookie'] as unknown as string[];
  const cookie = cookies[0].split(';')[0];
  const targetConfig = { ...config, database: 'coursegraph-restore', mode: 'test' as const, appOrigin: restored.APP_ORIGIN };
  const oldSigner = createApp({ config: targetConfig, driver });
  const rotated = createApp({ config: { ...targetConfig, jwtSecret: restored.JWT_SECRET }, driver });
  const beforeRotation = await request(oldSigner).get('/api/auth/me').set('Cookie', cookie);
  const afterRotation = await request(rotated).get('/api/auth/me').set('Cookie', cookie);
  const fresh = await request(rotated).post('/api/auth/login').set('Origin', targetConfig.appOrigin).send({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
  assert.equal(beforeRotation.status, 200);
  assert.equal(afterRotation.status, 401);
  assert.equal(fresh.status, 200);
  const report = { generatedAt: new Date().toISOString(), database: targetConfig.database, oldSigningSecretAcceptsToken: beforeRotation.status, rotatedSecretRejectsOldToken: afterRotation.status, freshLogin: fresh.status, passed: true };
  await mkdir('evidence', { recursive: true });
  await writeFile('evidence/restore-auth-verification.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
} finally { await driver.close(); }
