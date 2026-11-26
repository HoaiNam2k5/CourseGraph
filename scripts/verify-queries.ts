import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { loadConfig } from '../apps/api/src/config.js';
import { createDriver, plain, readTransaction } from '../apps/api/src/db/connection.js';

const config = loadConfig();
const driver = createDriver(config);
const results: { file: string; index: number; rows: number; durationMs: number; sample: unknown[] }[] = [];
try {
  for (const file of ['basic.cypher', 'advanced.cypher']) {
    const contents = await readFile(`database/queries/${file}`, 'utf8');
    const queries = contents.replace(/^\s*\/\/.*$/gm, '').split(';').map((part) => part.trim()).filter(Boolean);
    for (const [index, statement] of queries.entries()) {
      if (!statement.startsWith('MATCH ')) throw new Error(`Only reviewed MATCH queries are executed by this verifier: ${file}:${index + 1}`);
      const started = performance.now();
      const result = await readTransaction(driver, config.database, (tx) => tx.run(statement));
      results.push({ file, index: index + 1, rows: result.records.length, durationMs: Math.round((performance.now() - started) * 100) / 100, sample: result.records.slice(0, 3).map((record) => plain(record.toObject())) });
    }
  }
  await mkdir('evidence', { recursive: true });
  await writeFile('evidence/query-results.json', `${JSON.stringify({ generatedAt: new Date().toISOString(), database: config.database, queriesPassed: results.length, results }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ passed: results.length, results: results.map(({ sample: _sample, ...item }) => item) }, null, 2));
} finally { await driver.close(); }
