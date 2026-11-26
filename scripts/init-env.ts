import { randomBytes } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';

let exists = false;
try { await access('.env'); exists = true; } catch { /* New installation. */ }
if (exists) {
  console.log('Existing .env preserved. No credentials were overwritten.');
} else {
  let content = await readFile('.env.example', 'utf8');
  for (const key of ['NEO4J_PASSWORD', 'JWT_SECRET', 'ADMIN_PASSWORD']) {
    content = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${randomBytes(key === 'JWT_SECRET' ? 48 : 24).toString('base64url')}`);
  }
  await writeFile('.env', content, { flag: 'wx', encoding: 'utf8', mode: 0o600 });
  console.log('Created private .env. Open it locally to view credentials; never commit this file.');
}
