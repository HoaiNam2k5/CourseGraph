import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

let content = await readFile('.env', 'utf8');
const settings: Record<string, string> = {
  NEO4J_DATABASE: 'coursegraph-test-e2e', PORT: '3100',
  APP_ORIGIN: 'http://127.0.0.1:3100', JWT_SECRET: randomBytes(48).toString('base64url'),
};
for (const [key, value] of Object.entries(settings)) content = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
content = `${content.trimEnd()}\nNODE_ENV=test\n`;
await mkdir('.local', { recursive: true });
await writeFile('.local/e2e.env', content, { encoding: 'utf8', mode: 0o600 });
console.log('Prepared isolated E2E database coursegraph-test-e2e and app port3100; no secrets printed.');
