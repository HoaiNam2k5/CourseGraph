import type { Edge, Node } from 'vis-network';
import { entityDefinitions, relationshipDefinitions, type EntityLabel } from '../../../../packages/shared/src/catalog.js';
import type { BusinessEdge } from '../types.js';
import { formatNumber } from '../types.js';

export type NetworkView = EntityLabel | 'all';

export interface NetworkRecord {
  id: string;
  label: EntityLabel;
  name: string;
}

export interface NetworkSnapshot {
  nodes: NetworkRecord[];
  relationships: BusinessEdge[];
}

export type NetworkLink = {
  id: string;
  from: string;
  to: string;
  title: string;
};

export const recordKey = (record: NetworkRecord) => `${record.label}:${record.id}`;
export const otherEndpoint = (link: NetworkLink, key: string) => link.from === key ? link.to : link.from;

const categoryColors: Record<EntityLabel, { fill: string; stroke: string; text: string }> = {
  MonHoc: { fill: '#e4eee6', stroke: '#527a65', text: '#234c3d' },
  SinhVien: { fill: '#e4eef2', stroke: '#627e91', text: '#284e63' },
  GiangVien: { fill: '#f1e8dc', stroke: '#a27a50', text: '#6c4929' },
  Khoa: { fill: '#eef0dd', stroke: '#7b8350', text: '#4a522c' },
  HocKy: { fill: '#eee8f3', stroke: '#927da4', text: '#5b4570' },
  ChuongTrinhDaoTao: { fill: '#f6e5e4', stroke: '#a97673', text: '#733d3b' },
};

export const networkCategories = entityDefinitions.map((category) => ({ ...category, color: categoryColors[category.label] }));

const edgeTitle = new Map(relationshipDefinitions.map(({ from, to, type, title }) => [`${from}:${type}:${to}`, title]));

export function indexNetwork(snapshot: NetworkSnapshot) {
  const records = new Map(snapshot.nodes.map((record) => [recordKey(record), record]));
  const linksById = new Map<string, NetworkLink>();
  const incidents = new Map<string, NetworkLink[]>();
  const counts = new Map<EntityLabel, number>();
  const groupLinks = new Map<string, { from: EntityLabel; to: EntityLabel; count: number }>();
  for (const record of snapshot.nodes) counts.set(record.label, (counts.get(record.label) ?? 0) + 1);
  for (const edge of snapshot.relationships) {
    const from = `${edge.fromLabel}:${edge.fromId}`;
    const to = `${edge.toLabel}:${edge.toId}`;
    const source = records.get(from);
    const target = records.get(to);
    if (!source || !target) continue;
    const id = JSON.stringify([from, edge.type, to]);
    const link = { id, from, to, title: edgeTitle.get(`${source.label}:${edge.type}:${target.label}`) ?? edge.type };
    linksById.set(id, link);
    for (const key of new Set([from, to])) {
      const list = incidents.get(key);
      if (list) list.push(link);
      else incidents.set(key, [link]);
    }
    const groupKey = `${source.label}:${target.label}`;
    const group = groupLinks.get(groupKey);
    if (group) group.count++;
    else groupLinks.set(groupKey, { from: source.label, to: target.label, count: 1 });
  }
  return { records, linksById, incidents, counts, groupLinks };
}

type NetworkIndex = ReturnType<typeof indexNetwork>;
type Drawing = { nodes: Node[]; edges: Edge[] };

function colorFor(label: EntityLabel, center = false): NonNullable<Node['color']> {
  const palette = categoryColors[label];
  return {
    background: center ? palette.text : palette.fill,
    border: palette.stroke,
    hover: { background: center ? palette.text : palette.fill, border: palette.text },
    highlight: { background: center ? palette.text : palette.fill, border: palette.text },
  };
}

function directions<T extends { from: string; to: string }>(links: T[]) {
  const pairs = new Set(links.map(({ from, to }) => JSON.stringify([from, to])));
  return (link: T) => pairs.has(JSON.stringify([link.to, link.from]));
}

export function drawOverview(index: NetworkIndex): Drawing {
  const positions = [[-230, -105], [0, -144], [230, -105], [-230, 105], [0, 144], [230, 105]];
  const groups = [...index.groupLinks.values()];
  const hasReverse = directions(groups);
  return {
    nodes: networkCategories.map(({ label, title, color }, indexInOrder) => ({
      id: label,
      label: `${title}\n${formatNumber(index.counts.get(label) ?? 0)} bản ghi`,
      x: positions[indexInOrder][0],
      y: positions[indexInOrder][1],
      color: colorFor(label),
      font: { color: color.text, size: 17 },
      margin: { top: 10, bottom: 10, left: 15, right: 15 },
    })),
    edges: groups.map((group) => ({
      from: group.from,
      to: group.to,
      label: formatNumber(group.count),
      width: Math.min(4, 1 + Math.log10(group.count)),
      smooth: hasReverse(group) ? { enabled: true, type: 'curvedCW', roundness: 0.18 } : false,
    })),
  };
}

function compactName(name: string): string {
  return name.length > 25 ? `${name.slice(0, 24)}…` : name;
}

export function drawRecords(index: NetworkIndex, root: string, preview: NetworkRecord[], visible: Set<string>): Drawing {
  const links = [...visible].map((id) => index.linksById.get(id)).filter((link): link is NetworkLink => link !== undefined);
  const keys = root ? [...new Set([root, ...links.flatMap(({ from, to }) => [from, to])])] : preview.map(recordKey);
  const hasReverse = directions(links);
  const spread = Math.max(240, (keys.length - 1) * 36);
  return {
    nodes: keys.flatMap((key, number) => {
      const record = index.records.get(key);
      if (!record) return [];
      const center = key === root;
      const angle = (number - 1) * 2 * Math.PI / Math.max(1, keys.length - 1) - Math.PI / 2;
      return [{
        id: key,
        label: `${record.id}\n${compactName(record.name)}`,
        x: root ? center ? 0 : spread * Math.cos(angle) : (number % 3 - 1) * 218,
        y: root ? center ? 0 : spread * 0.68 * Math.sin(angle) : (Math.floor(number / 3) - 1) * 100,
        color: colorFor(record.label, center),
        font: { color: center ? '#ffffff' : categoryColors[record.label].text, size: 15 },
        margin: { top: 8, bottom: 8, left: 11, right: 11 },
      }];
    }),
    edges: links.map((link) => ({
      id: link.id,
      from: link.from,
      to: link.to,
      title: link.title,
      smooth: hasReverse(link) ? { enabled: true, type: 'curvedCW', roundness: 0.16 } : false,
    })),
  };
}
