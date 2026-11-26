import type { Edge, Node } from 'vis-network';
import type { BusinessNode, CourseAssessment, GraphResult, NodeDetail, PathResult } from './types.js';
import { nodeName } from './types.js';

export const assessmentStyle: Record<CourseAssessment['status'], { label: string; background: string; border: string }> = {
  completed: { label: 'Đã hoàn thành', background: '#dcebe1', border: '#2b6b5b' },
  studying: { label: 'Đang học', background: '#f4dfc2', border: '#aa6538' },
  eligible: { label: 'Đủ điều kiện', background: '#eff6f0', border: '#437d68' },
  blocked: { label: 'Chưa đủ điều kiện', background: '#f5f4eb', border: '#9b8970' },
};

export const rawCourseId = (node: BusinessNode): string => String(node.properties.MaMH ?? node.id.replace(/^MonHoc:/, ''));
export const rawGraphId = (id: string): string => id.replace(/^MonHoc:/, '');

export interface GraphHighlight {
  selectedId: string;
  centerId: string;
  prerequisites: ReadonlySet<string>;
  dependents: ReadonlySet<string>;
  assessments: ReadonlyMap<string, CourseAssessment>;
  path: PathResult['paths'][number] | null;
}

export function graphPresentation(graph: GraphResult, state: GraphHighlight): { nodes: Node[]; edges: Edge[] } {
  const selected = rawGraphId(state.selectedId);
  const pathNodes = new Set(state.path?.courses.map((course) => course.id) ?? []);
  const pathEdges = new Set(state.path?.courses.slice(1).map((course, index) => `${state.path!.courses[index].id}\u001f${course.id}`) ?? []);
  const pathActive = pathNodes.size > 0;
  return {
    nodes: graph.nodes.map((node): Node => {
      const id = rawCourseId(node); const assessment = state.assessments.get(id); const status = assessment ? assessmentStyle[assessment.status] : undefined;
      const isSelected = node.id === state.selectedId; const isCenter = id === state.centerId;
      const isPrerequisite = state.prerequisites.has(id); const isDependent = state.dependents.has(id); const inPath = pathNodes.has(id);
      const emphasized = pathActive ? inPath || isSelected : !selected || isSelected || isPrerequisite || isDependent;
      const border = inPath ? '#aa6538' : isSelected ? '#153f37' : isPrerequisite ? '#2b6b5b' : isDependent || isCenter ? '#aa6538' : status?.border ?? '#78998c';
      const borderWidth = isSelected ? 4 : inPath ? 3.5 : isPrerequisite || isDependent ? 2.5 : isCenter ? 2.5 : 1.4;
      return {
        id: node.id, label: `${id}\n${nodeName(node)}${status ? `\n${status.label}` : ''}`, shape: 'box',
        margin: { top: 12, right: 12, bottom: 12, left: 12 }, widthConstraint: { maximum: 170 },
        color: { background: status?.background ?? '#f5f4eb', border, highlight: { background: status?.background ?? '#e4eee6', border } },
        borderWidth, borderWidthSelected: borderWidth, chosen: false, opacity: emphasized ? 1 : 0.36,
        font: { face: 'Segoe UI', size: 14, color: '#193e35', multi: false },
      };
    }),
    edges: graph.edges.map((edge): Edge => {
      const from = rawGraphId(edge.from); const to = rawGraphId(edge.to);
      const prerequisite = state.prerequisites.has(from) && (to === selected || state.prerequisites.has(to));
      const dependent = (from === selected || state.dependents.has(from)) && state.dependents.has(to);
      const inPath = pathEdges.has(`${from}\u001f${to}`);
      const emphasized = pathActive ? inPath : !selected || prerequisite || dependent;
      const color = inPath ? '#aa6538' : prerequisite ? '#2b6b5b' : dependent ? '#aa6538' : '#78998c';
      return {
        id: edge.id, from: edge.from, to: edge.to, arrows: 'to',
        color: { color, highlight: color, hover: color, opacity: emphasized ? 1 : 0.2, inherit: false },
        width: inPath ? 4 : prerequisite || dependent ? 2.8 : 1.3,
        dashes: !inPath && dependent ? [7, 4] : false, chosen: false,
        smooth: { enabled: true, type: 'cubicBezier', roundness: 0.15 },
      };
    }),
  };
}

export function directCourseRelations(detail: NodeDetail, courses: BusinessNode[]): { prerequisites: BusinessNode[]; dependents: BusinessNode[] } {
  const known = new Map([...courses, ...detail.prerequisites, ...detail.dependents, detail.node].map((node) => [rawCourseId(node), node]));
  const id = rawCourseId(detail.node);
  const links = detail.links.filter((edge) => edge.type === 'TIEN_QUYET_CHO' && edge.fromLabel === 'MonHoc' && edge.toLabel === 'MonHoc');
  const nodes = (ids: string[]) => [...new Set(ids)].sort().map((key): BusinessNode => known.get(key) ?? { id: key, label: 'MonHoc', properties: { MaMH: key, TenMH: key } });
  return {
    prerequisites: nodes(links.filter((edge) => edge.toId === id).map((edge) => edge.fromId)),
    dependents: nodes(links.filter((edge) => edge.fromId === id).map((edge) => edge.toId)),
  };
}
