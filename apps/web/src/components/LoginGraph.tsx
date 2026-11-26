import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { BookOpen, GitBranch, GraduationCap, Layers3, RotateCcw, School } from 'lucide-react';

const graphWidth = 440;
const graphHeight = 235;
const nodeInset = 25;

const nodes = [
  { id: 'prerequisite', label: 'Tiên quyết', icon: GitBranch, description: 'Môn tiên quyết cần được hoàn thành trước khi học môn tiếp theo.' },
  { id: 'course', label: 'Môn học', icon: BookOpen, description: 'Môn học kết nối với môn tiên quyết, khoa, chương trình và kết quả học tập.' },
  { id: 'program', label: 'Chương trình', icon: Layers3, description: 'Chương trình đào tạo bao gồm các môn sinh viên cần tích lũy.' },
  { id: 'faculty', label: 'Khoa', icon: School, description: 'Mỗi môn học thuộc một khoa quản lý.' },
  { id: 'student', label: 'Sinh viên', icon: GraduationCap, description: 'Quan hệ “Đã học” nối sinh viên với các môn đã hoàn thành.' },
] as const;

type NodeId = typeof nodes[number]['id'];
type Point = { x: number; y: number };
type Positions = Record<NodeId, Point>;

const initialPositions: Positions = {
  prerequisite: { x: 90, y: 61 },
  course: { x: 218, y: 107 },
  program: { x: 350, y: 54 },
  faculty: { x: 105, y: 169 },
  student: { x: 349, y: 169 },
};

const links: readonly { from: NodeId; to: NodeId }[] = [
  { from: 'prerequisite', to: 'course' },
  { from: 'program', to: 'course' },
  { from: 'course', to: 'faculty' },
  { from: 'student', to: 'course' },
];

const keyboardOffsets: Record<string, Point | undefined> = {
  ArrowLeft: { x: -12, y: 0 },
  ArrowRight: { x: 12, y: 0 },
  ArrowUp: { x: 0, y: -12 },
  ArrowDown: { x: 0, y: 12 },
};

function withinGraph({ x, y }: Point): Point {
  return {
    x: Math.min(graphWidth - 60, Math.max(60, x)),
    y: Math.min(graphHeight - 52, Math.max(36, y)),
  };
}

function linkPath(from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= nodeInset * 2) return undefined;
  const insetX = dx / distance * nodeInset;
  const insetY = dy / distance * nodeInset;
  return `M ${from.x + insetX} ${from.y + insetY} L ${to.x - insetX} ${to.y - insetY}`;
}

export default function LoginGraph() {
  const id = useId();
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; node: NodeId; offset: Point } | null>(null);
  const [positions, setPositions] = useState(initialPositions);
  const [selected, setSelected] = useState<NodeId>('course');
  const [dragging, setDragging] = useState<NodeId | null>(null);
  const activeNode = nodes.find((node) => node.id === selected)!;

  function pointerPosition(event: PointerEvent): Point | null {
    const bounds = surface.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return null;
    return {
      x: (event.clientX - bounds.left) / bounds.width * graphWidth,
      y: (event.clientY - bounds.top) / bounds.height * graphHeight,
    };
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, node: NodeId) {
    if (!event.isPrimary || event.button !== 0) return;
    const point = pointerPosition(event);
    if (!point) return;
    const { x, y } = positions[node];
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, node, offset: { x: point.x - x, y: point.y - y } };
    setSelected(node);
    setDragging(node);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    const point = pointerPosition(event);
    if (!point) return;
    const next = withinGraph({ x: point.x - current.offset.x, y: point.y - current.offset.y });
    setPositions((previous) => ({ ...previous, [current.node]: next }));
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(null);
  }

  function moveWithKeys(event: KeyboardEvent<HTMLButtonElement>, node: NodeId) {
    const offset = keyboardOffsets[event.key];
    if (!offset) return;
    event.preventDefault();
    setSelected(node);
    setPositions((previous) => ({
      ...previous,
      [node]: withinGraph({ x: previous[node].x + offset.x, y: previous[node].y + offset.y }),
    }));
  }

  function reset() {
    drag.current = null;
    setDragging(null);
    setPositions(initialPositions);
    setSelected('course');
  }

  return <figure className="login-graph" aria-labelledby={`${id}-title`} aria-describedby={`${id}-hint`}>
    <header className="login-graph-header">
      <div>
        <h2 id={`${id}-title`}>Sơ đồ dữ liệu mẫu</h2>
        <p id={`${id}-hint`}>Chọn hoặc kéo nút. Dùng phím mũi tên để di chuyển.</p>
      </div>
      <button className="icon-button" type="button" onClick={reset} aria-label="Đặt lại sơ đồ" title="Đặt lại sơ đồ"><RotateCcw size={17} aria-hidden="true" /></button>
    </header>
    <div className="login-graph-surface" ref={surface}>
      <svg className="login-graph-links" viewBox={`0 0 ${graphWidth} ${graphHeight}`} aria-hidden="true">
        <defs>
          <marker id={`${id}-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="m1 1 6 3-6 3" /></marker>
          <marker id={`${id}-active-arrow`} className="active-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="m1 1 6 3-6 3" /></marker>
        </defs>
        {links.map(({ from, to }) => {
          const path = linkPath(positions[from], positions[to]);
          if (!path) return null;
          const active = from === selected || to === selected;
          return <g key={from + to} className={active ? 'link-active' : undefined}>
            <path className="login-graph-link" d={path} markerEnd={`url(#${id}-${active ? 'active-arrow' : 'arrow'})`} />
            {active && !dragging && <path key={selected} className="login-graph-flow" d={path} />}
          </g>;
        })}
      </svg>
      {nodes.map(({ id: node, label, icon: Icon }) => {
        const { x, y } = positions[node];
        return <button key={node} type="button" className={`login-graph-node${dragging === node ? ' dragging' : ''}`}
          aria-pressed={selected === node} style={{ left: `${x / graphWidth * 100}%`, top: `${y / graphHeight * 100}%` }}
          onClick={() => setSelected(node)} onKeyDown={(event) => moveWithKeys(event, node)}
          onPointerDown={(event) => startDrag(event, node)} onPointerMove={moveDrag} onPointerUp={endDrag}
          onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
          <span className="login-graph-node-icon"><Icon size={18} aria-hidden="true" /></span><span className="login-graph-node-label">{label}</span>
        </button>;
      })}
    </div>
    <figcaption aria-live="polite"><strong>{activeNode.label}</strong><span>{activeNode.description}</span></figcaption>
  </figure>;
}
