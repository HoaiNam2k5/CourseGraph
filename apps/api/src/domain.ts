import type { BusinessData, BusinessNode } from '../../../packages/shared/src/data.js';
import { HttpError } from './errors.js';

export interface CourseAssessment {
  course: BusinessNode;
  status: 'completed' | 'studying' | 'eligible' | 'blocked';
  inScope: boolean;
  prerequisites: BusinessNode[];
  missingPrerequisites: BusinessNode[];
}

export function recommendCourses(data: BusinessData, studentId: string, filters: { programId?: string; semesterId?: string } = {}) {
  if (!data.nodes.some((node) => node.label === 'SinhVien' && node.id === studentId)) throw new HttpError(404, 'Không tìm thấy sinh viên.');
  for (const [id, label] of [[filters.programId, 'ChuongTrinhDaoTao'], [filters.semesterId, 'HocKy']]) {
    if (id && !data.nodes.some((node) => node.label === label && node.id === id)) throw new HttpError(404, 'Không tìm thấy chương trình hoặc học kỳ được chọn.');
  }
  const completed = new Set(data.relationships.filter((edge) => edge.fromLabel === 'SinhVien' && edge.fromId === studentId && edge.type === 'DA_HOC').map((edge) => edge.toId));
  const studying = new Set(data.relationships.filter((edge) => edge.fromLabel === 'SinhVien' && edge.fromId === studentId && edge.type === 'DANG_HOC').map((edge) => edge.toId));
  const parents = new Map<string, string[]>();
  for (const edge of data.relationships.filter((edge) => edge.type === 'TIEN_QUYET_CHO')) parents.set(edge.toId, [...(parents.get(edge.toId) ?? []), edge.fromId]);
  const allPrerequisites = (id: string): Set<string> => {
    const found = new Set<string>();
    const queue = [...(parents.get(id) ?? [])];
    while (queue.length) {
      const current = queue.pop()!;
      if (found.has(current)) continue;
      found.add(current);
      queue.push(...(parents.get(current) ?? []));
    }
    return found;
  };
  const enrolledPrograms = new Set(data.relationships.filter((edge) => edge.fromId === studentId && edge.type === 'THEO_HOC').map((edge) => edge.toId));
  const inProgram = filters.programId ? new Set(data.relationships.filter((edge) => edge.fromId === filters.programId && edge.type === 'BAO_GOM').map((edge) => edge.toId)) : null;
  const enrolled = !filters.programId || enrolledPrograms.has(filters.programId);
  const open = filters.semesterId ? new Set(data.relationships.filter((edge) => edge.fromId === filters.semesterId && edge.type === 'MO_DANG_KY').map((edge) => edge.toId)) : null;
  const courses = data.nodes.filter((node) => node.label === 'MonHoc');
  const courseMap = new Map(courses.map((node) => [node.id, node]));
  const assessments: CourseAssessment[] = courses.map((course) => {
    const prerequisites = [...allPrerequisites(course.id)].sort().map((id) => courseMap.get(id)!).filter(Boolean);
    const missingPrerequisites = prerequisites.filter((node) => !completed.has(node.id));
    const status = completed.has(course.id) ? 'completed' : studying.has(course.id) ? 'studying' : missingPrerequisites.length ? 'blocked' : 'eligible';
    return { course, status, inScope: enrolled && (!inProgram || inProgram.has(course.id)) && (!open || open.has(course.id)), prerequisites, missingPrerequisites };
  });
  return {
    items: assessments.filter((item) => item.status === 'eligible' && item.inScope).map((item) => item.course),
    completedCount: completed.size,
    rule: enrolled ? 'DA_HOC được quy ước là hoàn thành đạt; xét toàn bộ tiên quyết trực tiếp và gián tiếp, loại môn đang học.' : 'Sinh viên không theo học chương trình đã chọn.',
    assessments,
  };
}

export function courseNetwork(data: BusinessData, courseId?: string, depth = 2): { nodes: BusinessNode[]; edges: { id: string; from: string; to: string; type: string }[]; truncated: boolean } {
  const courses = data.nodes.filter((node) => node.label === 'MonHoc');
  if (courseId && !courses.some((node) => node.id === courseId)) throw new HttpError(404, 'Không tìm thấy môn học.');
  const edges = data.relationships.filter((edge) => edge.type === 'TIEN_QUYET_CHO');
  const selected = new Set<string>(courseId ? [courseId] : courses.map((node) => node.id));
  if (courseId) {
    let frontier = [courseId];
    for (let level = 0; level < depth; level++) {
      const next = new Set<string>();
      for (const edge of edges) {
        if (frontier.includes(edge.fromId) && !selected.has(edge.toId)) next.add(edge.toId);
        if (frontier.includes(edge.toId) && !selected.has(edge.fromId)) next.add(edge.fromId);
      }
      next.forEach((id) => selected.add(id));
      frontier = [...next];
    }
  }
  const maxNodes = 150;
  const maxEdges = 500;
  const candidates = courses.filter((node) => selected.has(node.id));
  const limited = candidates.slice(0, maxNodes);
  const visible = new Set(limited.map((node) => node.id));
  const visibleEdges = edges.filter((edge) => visible.has(edge.fromId) && visible.has(edge.toId));
  return {
    nodes: limited.map((node) => ({ ...node, id: `MonHoc:${node.id}` })),
    edges: visibleEdges.slice(0, maxEdges).map((edge) => ({ id: `${edge.fromId}:${edge.type}:${edge.toId}`, from: `MonHoc:${edge.fromId}`, to: `MonHoc:${edge.toId}`, type: edge.type })),
    truncated: candidates.length > maxNodes || visibleEdges.length > maxEdges,
  };
}

export function shortestCoursePath(data: BusinessData, from: string, to: string): { paths: { courses: { id: string; name: string }[]; length: number }[]; truncated: boolean } {
  const courses = new Map(data.nodes.filter((node) => node.label === 'MonHoc').map((node) => [node.id, node]));
  if (!courses.has(from) || !courses.has(to)) throw new HttpError(404, 'Không tìm thấy môn bắt đầu hoặc kết thúc.');
  const adjacency = new Map<string, string[]>();
  data.relationships.filter((edge) => edge.type === 'TIEN_QUYET_CHO').forEach((edge) => adjacency.set(edge.fromId, [...(adjacency.get(edge.fromId) ?? []), edge.toId]));
  const queue: string[][] = [[from]];
  const visited = new Set([from]);
  while (queue.length) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    if (current === to) return { paths: [{ courses: path.map((id) => ({ id, name: String(courses.get(id)!.properties.TenMH) })), length: path.length - 1 }], truncated: false };
    for (const next of adjacency.get(current) ?? []) if (!visited.has(next)) { visited.add(next); queue.push([...path, next]); }
  }
  return { paths: [], truncated: false };
}

export function statistics(data: BusinessData) {
  const courses = data.nodes.filter((node) => node.label === 'MonHoc');
  const prerequisiteEdges = data.relationships.filter((edge) => edge.type === 'TIEN_QUYET_CHO');
  const counts = Object.fromEntries(['MonHoc', 'SinhVien', 'GiangVien', 'Khoa', 'HocKy', 'ChuongTrinhDaoTao'].map((label) => [label, data.nodes.filter((node) => node.label === label).length]));
  const types = [...new Set(data.relationships.map((edge) => edge.type))].sort();
  const indegree = new Map(courses.map((node) => [node.id, 0]));
  const adjacency = new Map<string, string[]>();
  const longest = new Map(courses.map((node) => [node.id, [node.id]]));
  for (const edge of prerequisiteEdges) {
    indegree.set(edge.toId, (indegree.get(edge.toId) ?? 0) + 1);
    adjacency.set(edge.fromId, [...(adjacency.get(edge.fromId) ?? []), edge.toId]);
  }
  const queue = courses.filter((node) => !indegree.get(node.id)).map((node) => node.id);
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      const candidate = [...(longest.get(current) ?? []), next];
      if (candidate.length > (longest.get(next)?.length ?? 0)) longest.set(next, candidate);
      indegree.set(next, indegree.get(next)! - 1);
      if (!indegree.get(next)) queue.push(next);
    }
  }
  const longestIds = [...longest.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const courseMap = new Map(courses.map((node) => [node.id, node]));
  return {
    counts, relationshipCount: data.relationships.length,
    relationsByType: types.map((type) => ({ type, count: data.relationships.filter((edge) => edge.type === type).length })),
    coursesByFaculty: data.nodes.filter((node) => node.label === 'Khoa').map((faculty) => ({ name: String(faculty.properties.TenKhoa), count: data.relationships.filter((edge) => edge.type === 'THUOC_KHOA' && edge.fromLabel === 'MonHoc' && edge.toId === faculty.id).length })),
    mostDependent: courses.map((node) => ({ id: node.id, name: String(node.properties.TenMH), count: prerequisiteEdges.filter((edge) => edge.fromId === node.id).length })).sort((a, b) => b.count - a.count).slice(0, 5),
    longestChain: { length: Math.max(0, longestIds.length - 1), courses: longestIds.map((id) => ({ id, name: String(courseMap.get(id)?.properties.TenMH ?? id) })) },
  };
}
