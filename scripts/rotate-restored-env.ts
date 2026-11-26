import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

let content = await readFile('.env', 'utf8');
const replacements: Record<string, string> = {
  NEO4J_DATABASE: 'coursegraph-restore',
  JWT_SECRET: randomBytes(48).toString('base64url'),
  PORT: '3001',
  APP_ORIGIN: 'http://127.0.0.1:3001',
};
for (const [key, value] of Object.entries(replacements)) {
  const expression = new RegExp(`^${key}=.*$`, 'm');
  if (!expression.test(content)) throw new Error(`Missing configuration key ${key}; refusing partial restore environment.`);
  content = content.replace(expression, `${key}=${value}`);
}
await mkdir('.local', { recursive: true });
await writeFile('.local/restored.env', content, { encoding: 'utf8', mode: 0o600 });
console.log('Isolated restore environment created with a new JWT signing secret; values not printed.');
