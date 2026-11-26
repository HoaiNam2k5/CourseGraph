export interface User { id: string; username: string; displayName: string; role: 'ADMIN' | 'VIEWER'; active: boolean }
export interface Session { user: User; csrfToken: string }
export interface Field { key: string; label: string; type: 'string' | 'number' | 'date' | 'email'; required: boolean }
export interface Entity { label: string; key: string; file: string; slug: string; title: string; fields: Field[] }
export interface Relationship { type: string; from: string; to: string; title: string }
export interface Catalog { entities: Entity[]; relationships: Relationship[] }
export interface BusinessNode { id: string; label: string; properties: Record<string, string | number> }
export interface BusinessEdge { fromLabel: string; fromId: string; type: string; toLabel: string; toId: string }
export interface NodeDetail { node: BusinessNode; links: BusinessEdge[]; prerequisites: BusinessNode[]; dependents: BusinessNode[] }
export interface PageResult<T> { items: T[]; total: number; page: number; pageSize: number }
export interface GraphResult { nodes: BusinessNode[]; edges: { id: string; from: string; to: string; type: string }[]; truncated: boolean }
export interface PathResult { paths: { courses: { id: string; name: string }[]; length: number }[]; truncated: boolean }
export interface CourseAssessment {
  course: BusinessNode;
  status: 'completed' | 'studying' | 'eligible' | 'blocked';
  inScope: boolean;
  prerequisites: BusinessNode[];
  missingPrerequisites: BusinessNode[];
}
export interface RecommendationResult { items: BusinessNode[]; completedCount: number; rule: string; assessments: CourseAssessment[] }
export interface DatabaseConnection { database: string; uri: string; browserUrl: string | null; deployment: 'standalone' | 'desktop' | 'remote' | 'unknown'; checkedAt: string }
export interface Statistics {
  counts: Record<string, number>; relationshipCount: number;
  relationsByType: { type: string; count: number }[];
  coursesByFaculty: { name: string; count: number }[];
  mostDependent: { id: string; name: string; count: number }[];
  longestChain: { length: number; courses: { id: string; name: string }[] };
}
export interface ImportPreview { id: string; hash: string; summary: unknown; warnings: unknown }
export interface TransferEntry { id: string; type?: string; kind?: string; status?: string; createdAt?: string; timestamp?: string; username?: string; nodeCount?: number; relationshipCount?: number }
export const entityTitles: Record<string, string> = { MonHoc: 'Môn học', SinhVien: 'Sinh viên', GiangVien: 'Giảng viên', Khoa: 'Khoa', HocKy: 'Học kỳ', ChuongTrinhDaoTao: 'Chương trình' };
export const nodeName = (node: BusinessNode): string => String(node.properties.TenMH ?? node.properties.HoTen ?? node.properties.TenKhoa ?? node.properties.TenChuongTrinh ?? node.properties.TenHK ?? node.id);
export const formatNumber = (value: number): string => new Intl.NumberFormat('vi-VN').format(value);
