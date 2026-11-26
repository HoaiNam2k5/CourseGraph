import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parse, CsvError } from 'csv-parse/sync';
import neo4j, { type Driver } from 'neo4j-driver';
import { z } from 'zod';
import { entityDefinitions } from '../../../packages/shared/src/catalog.js';
import { canonicalBusinessHash, loadBusinessData, type BusinessData } from '../../../packages/shared/src/data.js';
import { combineImportData, exportBusinessData } from './db/business.js';
import { writeTransaction } from './db/connection.js';
import { HttpError } from './errors.js';

export const csvFilenames = [...entityDefinitions.map((definition) => definition.file), 'QuanHeLienKet.csv'];
export const csvFileLimitBytes = 2 * 1024 * 1024;
export const csvTotalLimitBytes = 8 * 1024 * 1024;
const uploadSchema = z.object({ files: z.array(z.object({ name: z.string().min(1).max(80), content: z.string().min(1) }).strict()).length(7) }).strict();

export async function parseCsvImport(input: unknown): ReturnType<typeof loadBusinessData> {
  const { files } = uploadSchema.parse(input);
  const names = files.map((file) => file.name);
  if (new Set(names).size !== 7 || names.some((name) => !csvFilenames.includes(name)) || csvFilenames.some((name) => !names.includes(name))) throw new HttpError(400, 'Cần đúng 7 tên file CSV gốc, không trùng tên và không chứa đường dẫn.');
  let totalBytes = 0;
  for (const file of files) {
    const size = Buffer.byteLength(file.content, 'utf8');
    totalBytes += size;
    if (size > csvFileLimitBytes || totalBytes > csvTotalLimitBytes) throw new HttpError(413, 'CSV vượt giới hạn: mỗi file 2 MiB, tổng cộng 8 MiB.');
    const expected = file.name === 'QuanHeLienKet.csv' ? ['NhanNguon', 'MaNguon', 'LoaiQuanHe', 'NhanDich', 'MaDich'] : entityDefinitions.find((definition) => definition.file === file.name)!.fields.map((field) => field.key);
    let firstRow: unknown;
    try { firstRow = (parse(file.content, { bom: true, skip_empty_lines: true, trim: true, to: 1 }) as unknown[])[0]; }
    catch { throw new HttpError(400, `Header CSV không hợp lệ: ${file.name}.`); }
    if (!Array.isArray(firstRow) || firstRow.length !== expected.length || [...firstRow].sort().join('\u001f') !== [...expected].sort().join('\u001f')) throw new HttpError(400, `Header CSV không khớp schema: ${file.name}.`);
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'coursegraph-import-'));
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('coursegraph-import-')) throw new Error('Refusing to use a directory outside the private CSV import temp scope');
  try {
    // Filenames were matched against a literal whitelist before touching the filesystem.
    await Promise.all(files.map((file) => writeFile(path.join(directory, file.name), file.content, { encoding: 'utf8', flag: 'wx' })));
    return await loadBusinessData(directory);
  } catch (error) {
    if (error instanceof CsvError) throw new HttpError(400, 'Nội dung CSV không hợp lệ. Kiểm tra dấu phân cách, số cột và dấu nháy.');
    throw error;
  } finally {
    await rm(resolved, { recursive: true, force: true });
  }
}

export async function createImportPreview(driver: Driver, database: string, data: BusinessData, userId: string, warnings: string[] = []) {
  const current = await exportBusinessData(driver, database);
  combineImportData(current, data);
  const id = randomUUID();
  const hash = canonicalBusinessHash(data);
  await writeTransaction(driver, database, async (tx) => {
    await tx.run('MATCH (old:AppImport) WHERE old.expiresAt < $now DELETE old', { now: neo4j.int(Date.now()) });
    await tx.run('CREATE (:AppImport {id:$id,userId:$userId,hash:$hash,dataJson:$dataJson,expiresAt:$expiresAt,createdAt:$createdAt})', { id, userId, hash, dataJson: JSON.stringify(data), expiresAt: neo4j.int(Date.now() + 3600000), createdAt: new Date().toISOString() });
  });
  return { id, hash, summary: { nodes: data.nodes.length, relationships: data.relationships.length }, warnings: [...warnings, 'DA_HOC được quy ước là hoàn thành đạt; lịch sử thiếu tiên quyết không bị tự xóa.'] };
}
