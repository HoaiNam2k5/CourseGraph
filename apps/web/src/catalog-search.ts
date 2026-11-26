import { foldSearchText } from '../../../packages/shared/src/search.js';
import type { BusinessNode } from './types.js';

const collator = new Intl.Collator('vi', { numeric: true });

export const catalogFacetKeys: Record<string, string[]> = {
  courses: ['LoaiMon', 'SoTC'],
  students: ['KhoaHoc', 'GioiTinh'],
  lecturers: ['HocVi'],
  programs: ['NamBatDau', 'ThoiGianDaoTao'],
  faculties: ['TenKhoa'],
  semesters: ['NamHoc'],
};

export function facetValues(nodes: BusinessNode[], key: string) {
  const values = nodes.map(node => String(node.properties[key] ?? '')).filter(Boolean);
  return Array.from(new Set(values)).sort(collator.compare);
}

export function queryCatalog(nodes: BusinessNode[], query: string, filters: Record<string, string>, sortKey: string, descending: boolean) {
  const words = foldSearchText(query).split(/\s+/).filter(Boolean);
  const facets = Object.entries(filters).filter(([, value]) => value !== '');
  const matches = nodes.filter(node => {
    if (facets.some(([key, value]) => String(node.properties[key]) !== value)) return false;
    if (!words.length) return true;
    const text = foldSearchText(Object.values(node.properties).join(' '));
    return words.every(word => text.includes(word));
  });
  return matches.sort((left, right) => {
    const order = collator.compare(String(left.properties[sortKey] ?? ''), String(right.properties[sortKey] ?? ''));
    return (descending ? -order : order) || collator.compare(left.id, right.id);
  });
}
