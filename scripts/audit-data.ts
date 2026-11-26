import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadBusinessData } from '../packages/shared/src/data.js';

const inputDirectory = path.resolve(process.argv[2] ?? 'CSV');
const { audit } = await loadBusinessData(inputDirectory);
await mkdir('evidence', { recursive: true });
await writeFile('evidence/data-audit.json', `${JSON.stringify(audit, null, 2)}\n`, 'utf8');

const candidates = (await readdir('.')).filter((name) => /\.(docx|pdf|dump)$/i.test(name));
const sourcePaths = [...audit.files.map(({ file }) => path.join(inputDirectory, file)), ...candidates].sort();
const files = await Promise.all(sourcePaths.map(async (file) => {
  const bytes = await readFile(file);
  return { file: path.relative(process.cwd(), file).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}));
const manifestPath = 'evidence/source-manifest.json';
try {
  const previous = JSON.parse(await readFile(manifestPath, 'utf8')) as { files: typeof files };
  for (const source of previous.files) {
    const current = files.find(({ file }) => file === source.file);
    if (!current || current.sha256 !== source.sha256) throw new Error(`Original source changed: ${source.file}. Preserve originals and review before updating manifest.`);
  }
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  await writeFile(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({ nodes: audit.uniqueNodes, relationships: audit.uniqueRelationships, duplicateNodeRows: audit.duplicateNodes, duplicateRelationshipRows: audit.duplicateRelationships, historicalWarnings: audit.warnings.historicalPrerequisiteCount, canonicalHash: audit.canonicalHash, originalSourcesVerified: files.length }, null, 2));
