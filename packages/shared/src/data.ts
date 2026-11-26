import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { businessLabels, entityByLabel, entityDefinitions, relationshipDefinitions, type EntityDefinition, type EntityLabel } from './catalog.js';

export interface BusinessNode {
  label: EntityLabel;
  id: string;
  properties: Record<string, string | number>;
}

export interface BusinessEdge {
  fromLabel: EntityLabel;
  fromId: string;
  type: string;
  toLabel: EntityLabel;
  toId: string;
}

export interface BusinessData {
  nodes: BusinessNode[];
  relationships: BusinessEdge[];
}

export interface DataIssue { path: string; message: string }

export class DataValidationError extends Error {
  readonly issues: DataIssue[];
  constructor(issues: DataIssue[]) {
    super(issues.slice(0, 12).map((issue) => `${issue.path}: ${issue.message}`).join('; '));
    this.name = 'DataValidationError';
    this.issues = issues;
  }
}

export interface AuditFile {
  file: string;
  sha256: string;
  bytes: number;
  rawRows: number;
  uniqueRows: number;
  duplicates: number;
}

export interface HistoricalWarning { studentId: string; courseId: string; missingPrerequisites: string[] }

export interface DataAudit {
  generatedAt: string;
  inputDirectory: string;
  rawNodes: number;
  uniqueNodes: number;
  duplicateNodes: number;
  rawRelationships: number;
  uniqueRelationships: number;
  duplicateRelationships: number;
  nodesByLabel: Record<string, number>;
  relationshipsByType: Record<string, number>;
  files: AuditFile[];
  canonicalHash: string;
  warnings: {
    rule: string;
    historicalPrerequisiteCount: number;
    historicalPrerequisiteViolations: HistoricalWarning[];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function edgeIdentity(edge: BusinessEdge): string {
  return [edge.fromLabel, edge.fromId, edge.type, edge.toLabel, edge.toId].join('\u001f');
}

function sortData(data: BusinessData): BusinessData {
  return {
    nodes: [...data.nodes].sort((a, b) => `${a.label}\u001f${a.id}`.localeCompare(`${b.label}\u001f${b.id}`, 'en')),
    relationships: [...data.relationships].sort((a, b) => edgeIdentity(a).localeCompare(edgeIdentity(b), 'en')),
  };
}

export function canonicalBusinessHash(data: BusinessData): string {
  return createHash('sha256').update(stable(sortData(data)), 'utf8').digest('hex');
}

function validateProperties(properties: Record<string, unknown>, definition: EntityDefinition, location: string, issues: DataIssue[]): Record<string, string | number> {
  const normalized: Record<string, string | number> = {};
  const fields = new Set(definition.fields.map(({ key }) => key));
  for (const key of Object.keys(properties)) {
    if (!fields.has(key)) issues.push({ path: `${location}.${key}`, message: 'Unknown property' });
  }
  for (const field of definition.fields) {
    const raw = properties[field.key];
    const currentPath = `${location}.${field.key}`;
    if (field.type === 'number') {
      if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw)) {
        issues.push({ path: currentPath, message: 'Must be a finite integer' });
        continue;
      }
      const [min, max] = field.key === 'NamBatDau' ? [1900, 2200] : field.key === 'SoTC' ? [1, 30] : [1, 20];
      if (raw < min || raw > max) issues.push({ path: currentPath, message: `Must be between ${min} and ${max}` });
      normalized[field.key] = raw;
      continue;
    }
    if (typeof raw !== 'string') {
      issues.push({ path: currentPath, message: 'Must be a string' });
      continue;
    }
    const value = raw.trim();
    if (field.required && !value) issues.push({ path: currentPath, message: 'Required value is empty' });
    if (value.length > 500) issues.push({ path: currentPath, message: 'Maximum length is 500 characters' });
    if (field.key === definition.key && !/^[A-Za-z0-9_-]{1,80}$/.test(value)) issues.push({ path: currentPath, message: 'Invalid business key' });
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) issues.push({ path: currentPath, message: 'Invalid email address' });
    if (field.type === 'date') {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) issues.push({ path: currentPath, message: 'Must be a valid ISO date (YYYY-MM-DD)' });
    }
    normalized[field.key] = value;
  }
  return normalized;
}

function detectPrerequisiteCycle(edges: BusinessEdge[], issues: DataIssue[]): void {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges.filter(({ type }) => type === 'TIEN_QUYET_CHO')) {
    if (!adjacency.has(edge.fromId)) adjacency.set(edge.fromId, []);
    adjacency.get(edge.fromId)!.push(edge.toId);
  }
  const completed = new Set<string>();
  const visiting = new Set<string>();
  for (const start of adjacency.keys()) {
    if (completed.has(start)) continue;
    const stack = [{ id: start, next: 0 }];
    visiting.add(start);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const destinations = adjacency.get(frame.id) ?? [];
      if (frame.next >= destinations.length) {
        completed.add(frame.id);
        visiting.delete(frame.id);
        stack.pop();
        continue;
      }
      const destination = destinations[frame.next++];
      if (visiting.has(destination)) {
        issues.push({ path: 'relationships', message: 'Prerequisite graph contains a cycle' });
        return;
      }
      if (!completed.has(destination)) {
        visiting.add(destination);
        stack.push({ id: destination, next: 0 });
      }
    }
  }
}

export function validateBusinessData(input: unknown): BusinessData {
  const issues: DataIssue[] = [];
  if (!isRecord(input) || !Array.isArray(input.nodes) || !Array.isArray(input.relationships)) throw new DataValidationError([{ path: 'data', message: 'Expected nodes and relationships arrays' }]);
  if (input.nodes.length > 100_000 || input.relationships.length > 500_000) throw new DataValidationError([{ path: 'data', message: 'Import exceeds local application limits' }]);
  const nodes = new Map<string, BusinessNode>();
  input.nodes.forEach((raw: unknown, index: number) => {
    const location = `nodes[${index}]`;
    if (!isRecord(raw) || typeof raw.label !== 'string' || !businessLabels.includes(raw.label as EntityLabel) || typeof raw.id !== 'string' || !isRecord(raw.properties)) {
      issues.push({ path: location, message: 'Invalid label, id or properties' });
      return;
    }
    const definition = entityByLabel(raw.label)!;
    const properties = validateProperties(raw.properties, definition, `${location}.properties`, issues);
    const id = raw.id.trim();
    if (id !== properties[definition.key]) issues.push({ path: `${location}.id`, message: `Must equal ${definition.key}` });
    const node: BusinessNode = { label: definition.label, id, properties };
    const key = `${node.label}\u001f${node.id}`;
    const existing = nodes.get(key);
    if (existing && stable(existing.properties) !== stable(node.properties)) issues.push({ path: location, message: `Conflicting duplicate key ${node.label}:${node.id}` });
    else nodes.set(key, node);
  });
  const relationships = new Map<string, BusinessEdge>();
  input.relationships.forEach((raw: unknown, index: number) => {
    const location = `relationships[${index}]`;
    if (!isRecord(raw) || !['fromLabel', 'fromId', 'type', 'toLabel', 'toId'].every((key) => typeof raw[key] === 'string')) {
      issues.push({ path: location, message: 'Relationship must contain five string fields' });
      return;
    }
    const definition = relationshipDefinitions.find((item) => item.from === raw.fromLabel && item.type === raw.type && item.to === raw.toLabel);
    if (!definition) {
      issues.push({ path: location, message: 'Relationship label/type/direction is not permitted' });
      return;
    }
    const edge: BusinessEdge = { fromLabel: definition.from, fromId: (raw.fromId as string).trim(), type: definition.type, toLabel: definition.to, toId: (raw.toId as string).trim() };
    if (!nodes.has(`${edge.fromLabel}\u001f${edge.fromId}`)) issues.push({ path: `${location}.fromId`, message: `Missing source ${edge.fromLabel}:${edge.fromId}` });
    if (!nodes.has(`${edge.toLabel}\u001f${edge.toId}`)) issues.push({ path: `${location}.toId`, message: `Missing destination ${edge.toLabel}:${edge.toId}` });
    if (edge.type === 'TIEN_QUYET_CHO' && edge.fromId === edge.toId) issues.push({ path: location, message: 'Prerequisite cannot reference itself' });
    relationships.set(edgeIdentity(edge), edge);
  });
  detectPrerequisiteCycle([...relationships.values()], issues);
  if (issues.length) throw new DataValidationError(issues);
  return sortData({ nodes: [...nodes.values()], relationships: [...relationships.values()] });
}

function historicalWarnings(data: BusinessData): HistoricalWarning[] {
  const prerequisites = new Map<string, string[]>();
  const completions = new Map<string, Set<string>>();
  for (const edge of data.relationships) {
    if (edge.type === 'TIEN_QUYET_CHO') prerequisites.set(edge.toId, [...(prerequisites.get(edge.toId) ?? []), edge.fromId]);
    if (edge.type === 'DA_HOC') {
      if (!completions.has(edge.fromId)) completions.set(edge.fromId, new Set());
      completions.get(edge.fromId)!.add(edge.toId);
    }
  }
  const warnings: HistoricalWarning[] = [];
  for (const [studentId, completed] of completions) for (const courseId of completed) {
    const missingPrerequisites = (prerequisites.get(courseId) ?? []).filter((id) => !completed.has(id)).sort();
    if (missingPrerequisites.length) warnings.push({ studentId, courseId, missingPrerequisites });
  }
  return warnings.sort((a, b) => `${a.studentId}:${a.courseId}`.localeCompare(`${b.studentId}:${b.courseId}`, 'en'));
}

export async function loadBusinessData(inputDir: string): Promise<{ data: BusinessData; audit: DataAudit }> {
  const nodes: BusinessNode[] = [];
  const relationships: BusinessEdge[] = [];
  const files: AuditFile[] = [];
  for (const definition of entityDefinitions) {
    const bytes = await readFile(path.join(inputDir, definition.file));
    const expectedColumns = definition.fields.map(({ key }) => key);
    const records = parseCsvRecords(bytes, expectedColumns, definition.file);
    for (const [index, record] of records.entries()) {
      if (Object.keys(record).sort().join(',') !== [...expectedColumns].sort().join(',')) throw new DataValidationError([{ path: `${definition.file}:${index + 2}`, message: 'CSV headers do not match entity schema' }]);
      const properties: Record<string, string | number> = {};
      for (const field of definition.fields) properties[field.key] = field.type === 'number' ? (record[field.key] === '' ? NaN : Number(record[field.key])) : record[field.key];
      nodes.push({ label: definition.label, id: record[definition.key], properties });
    }
    const uniqueRows = new Set(records.map(stable)).size;
    files.push({ file: definition.file, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, rawRows: records.length, uniqueRows, duplicates: records.length - uniqueRows });
  }
  const bytes = await readFile(path.join(inputDir, 'QuanHeLienKet.csv'));
  const records = parseCsvRecords(bytes, ['NhanNguon', 'MaNguon', 'LoaiQuanHe', 'NhanDich', 'MaDich'], 'QuanHeLienKet.csv');
  const edgeColumns = ['NhanNguon', 'MaNguon', 'LoaiQuanHe', 'NhanDich', 'MaDich'].sort().join(',');
  for (const [index, record] of records.entries()) {
    if (Object.keys(record).sort().join(',') !== edgeColumns) throw new DataValidationError([{ path: `QuanHeLienKet.csv:${index + 2}`, message: 'CSV headers do not match relationship schema' }]);
    relationships.push({ fromLabel: record.NhanNguon.replace(/^\[|\]$/g, '') as EntityLabel, fromId: record.MaNguon, type: record.LoaiQuanHe, toLabel: record.NhanDich.replace(/^\[|\]$/g, '') as EntityLabel, toId: record.MaDich });
  }
  const uniqueRows = new Set(records.map(stable)).size;
  files.push({ file: 'QuanHeLienKet.csv', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, rawRows: records.length, uniqueRows, duplicates: records.length - uniqueRows });
  const data = validateBusinessData({ nodes, relationships });
  const warnings = historicalWarnings(data);
  const nodesByLabel = Object.fromEntries(entityDefinitions.map(({ label }) => [label, data.nodes.filter((node) => node.label === label).length]));
  const relationshipTypes = [...new Set(relationshipDefinitions.map(({ type }) => type))].sort();
  const relationshipsByType = Object.fromEntries(relationshipTypes.map((type) => [type, data.relationships.filter((edge) => edge.type === type).length]));
  return {
    data,
    audit: {
      generatedAt: new Date().toISOString(), inputDirectory: path.resolve(inputDir),
      rawNodes: nodes.length, uniqueNodes: data.nodes.length, duplicateNodes: nodes.length - data.nodes.length,
      rawRelationships: relationships.length, uniqueRelationships: data.relationships.length, duplicateRelationships: relationships.length - data.relationships.length,
      nodesByLabel, relationshipsByType, files, canonicalHash: canonicalBusinessHash(data),
      warnings: { rule: 'Demo convention: DA_HOC means completed. Missing historical prerequisites are warnings, not deleted records. DANG_KY links a student to a semester, not a course.', historicalPrerequisiteCount: warnings.length, historicalPrerequisiteViolations: warnings },
    },
  };
}

function parseCsvRecords(bytes: Buffer, columns: string[], filename: string): Record<string, string>[] {
  let headerSeen = false;
  const records = parse(bytes, {
    columns: (header: string[]) => {
      headerSeen = true;
      if ([...header].sort().join(',') !== [...columns].sort().join(',')) throw new DataValidationError([{ path: `${filename}:1`, message: 'CSV headers do not match schema' }]);
      return header;
    },
    bom: true, skip_empty_lines: true, trim: true,
  }) as Record<string, string>[];
  if (!headerSeen) throw new DataValidationError([{ path: `${filename}:1`, message: 'CSV header is missing' }]);
  return records;
}
