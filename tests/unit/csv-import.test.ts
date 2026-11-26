import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { csvFileLimitBytes, csvFilenames, parseCsvImport } from '../../apps/api/src/transfers.js';
import { HttpError } from '../../apps/api/src/errors.js';

async function sourceFiles() {
  return Promise.all(csvFilenames.map(async (name) => ({ name, content: await readFile(path.join(process.cwd(), 'CSV', name), 'utf8') })));
}

const isStatus = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;

test('seven original CSVs normalize duplicate rows and preserve full source data', async () => {
  const result = await parseCsvImport({ files: await sourceFiles() });
  assert.equal(result.data.nodes.length, 210);
  assert.equal(result.data.relationships.length, 1568);
  assert.equal(result.audit.duplicateNodes, 10);
  assert.equal(result.audit.duplicateRelationships, 800);
  assert.equal(result.audit.nodesByLabel.HocKy, 10);
  assert.equal(result.audit.warnings.historicalPrerequisiteCount, 78);
  await assert.rejects(() => stat(result.audit.inputDirectory), { code: 'ENOENT' });
});

test('CSV upload rejects missing, duplicate, unknown and traversal filenames', async () => {
  const files = await sourceFiles();
  await assert.rejects(() => parseCsvImport({ files: files.slice(1) }));
  await assert.rejects(() => parseCsvImport({ files: [...files.slice(0, 6), files[0]] }), isStatus(400));
  for (const name of ['../MonHoc.csv', '..\\MonHoc.csv', 'other.csv', 'monhoc.csv', 'C:\\Windows\\MonHoc.csv']) {
    const malformed = files.map((file, index) => index === 0 ? { ...file, name } : file);
    await assert.rejects(() => parseCsvImport({ files: malformed }), isStatus(400));
  }
});

test('CSV schema errors, orphan references and cycles are rejected and cleaned up', async () => {
  const files = await sourceFiles();
  const changed = (name: string, transform: (content: string) => string) => files.map((file) => file.name === name ? { ...file, content: transform(file.content) } : file);
  const appendRow = (content: string, row: string) => { const newline = content.includes('\r\n') ? '\r\n' : '\n'; return `${content.trimEnd()}${newline}${row}${newline}`; };
  await assert.rejects(() => parseCsvImport({ files: changed('MonHoc.csv', () => 'MaMH,MaMH,SoTC,LoaiMon\n') }), isStatus(400));
  await assert.rejects(() => parseCsvImport({ files: changed('MonHoc.csv', () => '   \n') }), isStatus(400));
  await assert.rejects(() => parseCsvImport({ files: changed('QuanHeLienKet.csv', (content) => appendRow(content, '[MonHoc],MISSING,TIEN_QUYET_CHO,[MonHoc],MH001')) }), /Missing source/);
  await assert.rejects(() => parseCsvImport({ files: changed('QuanHeLienKet.csv', (content) => appendRow(content, '[MonHoc],MH001,TIEN_QUYET_CHO,[MonHoc],MH001')) }), /itself|cycle/);
  const malformed = changed('MonHoc.csv', (content) => `${content.trim()}\n"unterminated`);
  await assert.rejects(() => parseCsvImport({ files: malformed }), isStatus(400));
});

test('CSV limits use UTF-8 bytes and enforce per-file and total size', async () => {
  const files = await sourceFiles();
  await assert.rejects(() => parseCsvImport({ files: files.map((file, index) => index === 0 ? { ...file, content: 'é'.repeat(csvFileLimitBytes / 2 + 1) } : file) }), isStatus(413));
  const largeFiles = files.map((file) => ({ ...file, content: `${file.content.split(/\r?\n/)[0]}\n${'x'.repeat(1300000)}` }));
  await assert.rejects(() => parseCsvImport({ files: largeFiles }), isStatus(413));
});
