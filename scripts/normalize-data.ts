import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'csv-stringify/sync';
import { entityDefinitions } from '../packages/shared/src/catalog.js';
import { loadBusinessData } from '../packages/shared/src/data.js';

const inputDirectory = path.resolve(process.argv[2] ?? 'CSV');
const outputDirectory = path.resolve(process.argv[3] ?? 'data/normalized');
const { data, audit } = await loadBusinessData(inputDirectory);
await mkdir(outputDirectory, { recursive: true });
for (const definition of entityDefinitions) {
  const records = data.nodes.filter(({ label }) => label === definition.label).map(({ properties }) => properties);
  await writeFile(path.join(outputDirectory, definition.file), stringify(records, { header: true, columns: definition.fields.map(({ key }) => key), bom: true }), 'utf8');
}
const edges = data.relationships.map((edge) => ({ NhanNguon: edge.fromLabel, MaNguon: edge.fromId, LoaiQuanHe: edge.type, NhanDich: edge.toLabel, MaDich: edge.toId }));
await writeFile(path.join(outputDirectory, 'QuanHeLienKet.csv'), stringify(edges, { header: true, columns: ['NhanNguon', 'MaNguon', 'LoaiQuanHe', 'NhanDich', 'MaDich'], bom: true }), 'utf8');
await writeFile(path.join(outputDirectory, 'business-data.json'), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
await writeFile(path.join(outputDirectory, 'manifest.json'), `${JSON.stringify({ generatedAt: audit.generatedAt, nodes: audit.uniqueNodes, relationships: audit.uniqueRelationships, nodesByLabel: audit.nodesByLabel, relationshipsByType: audit.relationshipsByType, canonicalHash: audit.canonicalHash, sourceFiles: audit.files }, null, 2)}\n`, 'utf8');
console.log(`Normalized ${data.nodes.length} business nodes and ${data.relationships.length} relationships into ${outputDirectory}`);
console.log(`Canonical SHA256: ${audit.canonicalHash}`);
