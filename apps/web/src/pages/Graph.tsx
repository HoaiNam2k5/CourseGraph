import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { DataSet } from 'vis-data';
import { Network, type Edge, type Node } from 'vis-network';
import { ArrowRight, Expand, Maximize2, Minimize2, Minus, Plus, Route, X } from 'lucide-react';
import { api, errorMessage, useAllPages, useResource } from '../api.js';
import type { BusinessNode, GraphResult, NodeDetail, PathResult, RecommendationResult } from '../types.js';
import { nodeName } from '../types.js';
import { assessmentStyle, directCourseRelations, graphPresentation, rawCourseId, rawGraphId } from '../graph-presentation.js';
import { Empty, ErrorNotice, Loading } from '../components/common.js';

const motion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 200, easingFunction: 'easeInOutQuad' as const };

function fitGraph(instance: Network) {
  // Fit synchronously so the extra margin uses the fitted scale.
  instance.fit({ animation: false });
  instance.moveTo({ scale: instance.getScale() * 0.93, animation: false });
}

export default function GraphPage({ initialCourse = '', initialStudent = '' }: { initialCourse?: string; initialStudent?: string }) {
  const [course, setCourse] = useState(initialCourse); const [student, setStudent] = useState(initialStudent); const [depth, setDepth] = useState('2');
  const [hierarchical, setHierarchical] = useState(false); const [selectedId, setSelectedId] = useState('');
  const [activePath, setActivePath] = useState<PathResult['paths'][number] | null>(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false); const [expandedFallback, setExpandedFallback] = useState(false); const [fullscreenHint, setFullscreenHint] = useState('');
  const courses = useAllPages<BusinessNode>('/courses'); const students = useAllPages<BusinessNode>('/students');
  const graph = useResource<GraphResult>(`/graph?depth=${depth}${course ? `&courseId=${encodeURIComponent(course)}` : ''}`);
  const selectedRawId = rawGraphId(selectedId);
  const detail = useResource<NodeDetail>(selectedRawId ? `/courses/${encodeURIComponent(selectedRawId)}` : null);
  const assessment = useStudentAssessment(student);
  const container = useRef<HTMLDivElement>(null); const frame = useRef<HTMLElement>(null); const network = useRef<Network | null>(null);
  const [nodes] = useState(() => new DataSet<Node>()); const [edges] = useState(() => new DataSet<Edge>());
  const currentDetail = detail.data?.node.id === selectedRawId ? detail.data : null;
  const selected = graph.data?.nodes.find((node) => node.id === selectedId) ?? currentDetail?.node ?? null;
  const studentAssessments = useMemo(() => new Map((assessment.data?.assessments ?? []).map((item) => [rawCourseId(item.course), item])), [assessment.data]);
  const selectedAssessment = studentAssessments.get(selectedRawId);
  const direct = useMemo(() => currentDetail ? directCourseRelations(currentDetail, courses.data?.items ?? []) : { prerequisites: [], dependents: [] }, [currentDetail, courses.data]);
  const graphKey = `${course}|${depth}|${graph.data?.nodes.map((node) => node.id).join(',') ?? ''}|${graph.data?.edges.map((edge) => edge.id).join(',') ?? ''}`;
  const highlightPath = useCallback((path: PathResult['paths'][number] | null) => setActivePath(path), []);
  const fullscreen = nativeFullscreen || expandedFallback;
  useEffect(() => { setCourse(initialCourse); setSelectedId(initialCourse ? `MonHoc:${initialCourse}` : ''); }, [initialCourse]);
  useEffect(() => { setStudent(initialStudent); }, [initialStudent]);

  useEffect(() => {
    const viewport = container.current;
    if (!viewport) return;
    const instance = new Network(viewport, { nodes, edges }, { autoResize: true, layout: { randomSeed: 14 }, physics: false, interaction: { hover: true, keyboard: { enabled: false }, zoomView: true, dragView: true }, edges: { selectionWidth: 0 } });
    network.current = instance;
    instance.on('selectNode', (event: { nodes: (string | number)[] }) => { setSelectedId(String(event.nodes[0] ?? '')); setActivePath(null); });
    instance.on('deselectNode', () => setSelectedId(''));
    instance.on('hoverNode', () => viewport.classList.add('node-hovered'));
    instance.on('blurNode', () => viewport.classList.remove('node-hovered'));
    return () => {
      instance.destroy();
      viewport.classList.remove('node-hovered');
      if (network.current === instance) network.current = null;
    };
  }, [nodes, edges]);

  useEffect(() => {
    const instance = network.current; if (!instance || !graph.data || graph.loading) return;
    const base = graphPresentation(graph.data, { selectedId: '', centerId: course, prerequisites: new Set(), dependents: new Set(), assessments: new Map(), path: null });
    edges.clear(); nodes.clear(); nodes.add(base.nodes); edges.add(base.edges);
    const visible = new Set(graph.data.nodes.map((node) => node.id));
    setSelectedId((previous) => visible.has(previous) ? previous : visible.has(`MonHoc:${course}`) ? `MonHoc:${course}` : '');
    const usePhysics = !hierarchical && Boolean(motion());
    const stopPhysics = () => { instance.setOptions({ physics: false }); fitGraph(instance); };
    if (usePhysics) instance.once('stabilized', stopPhysics);
    instance.setOptions({ layout: { hierarchical: hierarchical ? { enabled: true, direction: 'LR', sortMethod: 'directed', nodeSpacing: 115, levelSeparation: 240 } : false }, physics: { enabled: usePhysics, stabilization: { iterations: 120 }, barnesHut: { gravitationalConstant: -4400, springLength: 200, springConstant: 0.025 } } });
    fitGraph(instance);
    return () => instance.off('stabilized', stopPhysics);
  }, [graph.data, graph.loading, hierarchical, course, nodes, edges]);

  useEffect(() => {
    if (!graph.data || graph.loading || !network.current) return;
    const presentation = graphPresentation(graph.data, { selectedId, centerId: course, prerequisites: new Set(currentDetail?.prerequisites.map(rawCourseId) ?? []), dependents: new Set(currentDetail?.dependents.map(rawCourseId) ?? []), assessments: studentAssessments, path: activePath });
    nodes.update(presentation.nodes); edges.update(presentation.edges);
    network.current.selectNodes(selectedId && nodes.get(selectedId) ? [selectedId] : []);
  }, [graph.data, graph.loading, selectedId, course, currentDetail, studentAssessments, activePath, nodes, edges]);

  useEffect(() => {
    const change = () => { setNativeFullscreen(document.fullscreenElement === frame.current); requestAnimationFrame(() => { const instance = network.current; if (instance) { instance.redraw(); fitGraph(instance); } }); };
    document.addEventListener('fullscreenchange', change); return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  useEffect(() => {
    if (!expandedFallback) return;
    const oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setExpandedFallback(false); }
      if (event.key === 'Tab') {
        const controls = [...(frame.current?.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), summary, a[href], [tabindex="0"]') ?? [])].filter((element) => element.offsetParent !== null);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !frame.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !frame.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', escape); requestAnimationFrame(() => { const instance = network.current; if (instance) { instance.redraw(); fitGraph(instance); } });
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', escape); previousFocus?.focus(); requestAnimationFrame(() => network.current?.redraw()); };
  }, [expandedFallback]);
  async function toggleFullscreen() {
    setFullscreenHint(''); if (expandedFallback) { setExpandedFallback(false); return; }
    if (document.fullscreenElement === frame.current) { await document.exitFullscreen().catch(() => setFullscreenHint('Chưa thoát được toàn màn hình. Nhấn Escape để thoát.')); return; }
    try { if (!document.fullscreenEnabled || !frame.current?.requestFullscreen) throw new Error('unsupported'); await frame.current.requestFullscreen(); }
    catch { setExpandedFallback(true); setFullscreenHint('Đã mở rộng khung trong trang vì trình duyệt chưa cho phép toàn màn hình. Nhấn Escape hoặc nút thu gọn để trở lại.'); }
  }
  function selectNode(id: string) {
    setSelectedId(id); setActivePath(null);
    if (graph.data?.nodes.some((node) => node.id === id)) { network.current?.selectNodes([id]); network.current?.focus(id, { scale: 1, animation: motion() }); }
    else if (id) setCourse(rawGraphId(id));
  }
  const zoom = (factor: number) => { const instance = network.current; if (instance) instance.moveTo({ scale: instance.getScale() * factor, animation: motion() }); };
  const pathOutsideCount = activePath?.courses.filter((item) => !graph.data?.nodes.some((node) => rawCourseId(node) === item.id)).length ?? 0;

  return <>
    <section ref={frame} className={`panel graph-panel graph-explorer${expandedFallback ? ' graph-expanded-fallback' : ''}`} aria-label="Không gian khám phá mạng lưới">
      <div className="graph-toolbar">
        <label className="field compact"><span>Môn học trung tâm</span><select value={course} onChange={(event) => { setCourse(event.target.value); setSelectedId(event.target.value ? `MonHoc:${event.target.value}` : ''); setActivePath(null); }}><option value="">Tất cả môn học</option>{courses.data?.items.map((node) => <option value={node.id} key={node.id}>{node.id} · {nodeName(node)}</option>)}</select></label>
        <label className="field compact depth-field"><span>Độ sâu liên kết</span><select value={depth} onChange={(event) => setDepth(event.target.value)}>{[1, 2, 3, 4].map((value) => <option value={value} key={value}>{value} cấp</option>)}</select></label>
        <label className="field compact graph-student-field"><span>Trạng thái theo sinh viên</span><select value={student} onChange={(event) => setStudent(event.target.value)}><option value="">Không áp dụng sinh viên</option>{students.data?.items.map((node) => <option value={node.id} key={node.id}>{node.id} · {nodeName(node)}</option>)}</select></label>
        <label className="checkbox-row"><input type="checkbox" checked={hierarchical} onChange={(event) => setHierarchical(event.target.checked)} />Theo cấp bậc</label>
        <button className="button secondary small graph-fullscreen-toggle" aria-label={fullscreen ? 'Thoát toàn màn hình đồ thị' : 'Mở toàn màn hình đồ thị'} aria-pressed={fullscreen} onClick={() => { void toggleFullscreen(); }}>{fullscreen ? <Minimize2 size={16} /> : <Expand size={16} />}{fullscreen ? 'Thu gọn' : 'Toàn màn hình'}</button>
      </div>
      {courses.error && <ErrorNotice message={courses.error} retry={courses.reload} />}{students.error && <ErrorNotice message={students.error} retry={students.reload} />}
      {fullscreenHint && <div className="notice info" role="status">{fullscreenHint}</div>}
      {assessment.loading && <div className="graph-assessment-notice" role="status">Đang kiểm tra trạng thái học tập; màu trạng thái sẽ xuất hiện khi tải xong.</div>}{assessment.error && <ErrorNotice message={assessment.error} retry={assessment.reload} />}
      <div className="graph-status-legend" aria-label="Chú giải trạng thái và liên kết">
        {student && Object.entries(assessmentStyle).map(([key, value]) => <span key={key}><i className={`status-dot status-${key}`} />{value.label}</span>)}
        <span><i className="chain-line upstream" />Chuỗi cần học trước</span><span><i className="chain-line downstream" />Chuỗi phụ thuộc phía sau</span>
        {activePath && <span><i className="chain-line path" />Đường đi đang tìm<button className="icon-button" onClick={() => setActivePath(null)} aria-label="Bỏ tô đường đi"><X size={13} /></button></span>}
      </div>
      <div className="graph-workbench"><div className="graph-stage">
        <div ref={container} className="graph-canvas" role="img" aria-label={`Đồ thị gồm ${graph.data?.nodes.length ?? 0} môn học và ${graph.data?.edges.length ?? 0} liên kết tiên quyết. Dùng danh sách bên cạnh để chọn môn và đọc chi tiết.`} />
        {graph.loading && <div className="graph-overlay"><Loading text="Đang dựng mạng lưới…" /></div>}{graph.error && <div className="graph-overlay"><ErrorNotice message={graph.error} retry={graph.reload} /></div>}{!graph.loading && !graph.error && !graph.data?.nodes.length && <div className="graph-overlay"><Empty title="Chưa có môn học trong mạng lưới" /></div>}
        <div className="graph-controls"><button className="icon-button" aria-label="Phóng to đồ thị" onClick={() => zoom(1.2)}><Plus size={18} /></button><button className="icon-button" aria-label="Thu nhỏ đồ thị" onClick={() => zoom(0.8)}><Minus size={18} /></button><button className="icon-button" aria-label="Căn vừa đồ thị" onClick={() => { if (network.current) fitGraph(network.current); }}><Maximize2 size={18} /></button></div>
        <div className="graph-legend"><span><i className="legend-line" />Mũi tên: tiên quyết → môn học sau</span></div>
      </div><aside className="selection-panel graph-course-panel" aria-label="Thông tin môn học đang chọn">
        <div className="section-heading"><h2>Thông tin môn học</h2></div>
        <label className="field"><span>Chọn môn để xem chi tiết</span><select value={graph.data?.nodes.some((node) => node.id === selectedId) ? selectedId : ''} onChange={(event) => selectNode(event.target.value)}><option value="">Chọn trên đồ thị hoặc tại đây…</option>{graph.data?.nodes.map((node) => <option value={node.id} key={node.id}>{rawCourseId(node)} · {nodeName(node)}</option>)}</select></label>
        {selected ? <><span className="code-pill">{rawCourseId(selected)}{rawCourseId(selected) === course ? ' · Trung tâm' : ''}</span><h3 className="detail-name">{nodeName(selected)}</h3><dl className="property-grid"><div><dt>Số tín chỉ</dt><dd>{selected.properties.SoTC ?? '—'}</dd></div><div><dt>Loại môn</dt><dd>{selected.properties.LoaiMon ?? '—'}</dd></div></dl>
          {selectedAssessment && <div className={`graph-course-status status-${selectedAssessment.status}`}><strong>{assessmentStyle[selectedAssessment.status].label}</strong><span>{student}</span></div>}
          {student && !selectedAssessment && !assessment.loading && !assessment.error && <p className="muted">Chưa có đánh giá học tập cho môn này.</p>}
          {selectedAssessment && selectedAssessment.missingPrerequisites.length > 0 && <div className="graph-missing"><h4>{selectedAssessment.status === 'blocked' ? 'Cần hoàn thành thêm' : 'Lịch sử tiên quyết cần đối chiếu'}</h4><CourseButtons nodes={selectedAssessment.missingPrerequisites} choose={selectNode} /></div>}
          {detail.loading || !currentDetail ? detail.error ? <ErrorNotice message={detail.error} retry={detail.reload} /> : <Loading text="Đang đọc liên kết môn học…" /> : <>
            <div className="graph-relation-section"><h4>Tiên quyết trực tiếp <span>{direct.prerequisites.length}</span></h4>{direct.prerequisites.length ? <CourseButtons nodes={direct.prerequisites} choose={selectNode} /> : <p className="muted">Không có tiên quyết trực tiếp.</p>}</div>
            <div className="graph-relation-section"><h4>Phụ thuộc trực tiếp <span>{direct.dependents.length}</span></h4>{direct.dependents.length ? <CourseButtons nodes={direct.dependents} choose={selectNode} /> : <p className="muted">Không có môn phụ thuộc trực tiếp.</p>}</div>
            <details className="graph-transitive"><summary>Toàn bộ môn tiên quyết · {currentDetail.prerequisites.length}</summary><CourseButtons nodes={currentDetail.prerequisites} choose={selectNode} /></details><details className="graph-transitive"><summary>Các môn phụ thuộc · {currentDetail.dependents.length}</summary><CourseButtons nodes={currentDetail.dependents} choose={selectNode} /></details>
          </>}
        </> : <div className="graph-selection-hint"><Route size={27} /><p>Chọn một môn để xem chi tiết và tô rõ chuỗi học trước / học sau ngay trong đồ thị.</p>{!student && <small>Chọn thêm sinh viên để xem trạng thái của từng môn.</small>}</div>}
      </aside></div>
      <div className="graph-footer"><span>{graph.data?.nodes.length ?? 0} môn học · {graph.data?.edges.length ?? 0} liên kết{student ? ` · ${student}` : ''}</span><span>Kéo để di chuyển · Cuộn để phóng to{fullscreen ? ' · Escape để thoát' : ''}</span></div>
      {graph.data?.truncated && <div className="notice warning">Mạng lưới đang được giới hạn để dễ quan sát. Thông tin liên kết trong bảng bên cạnh được đọc riêng từ database, không chỉ từ phần đồ thị đang hiển thị.</div>}
    </section>
    {pathOutsideCount > 0 && <div className="notice warning">Có {pathOutsideCount} môn của đường đi nằm ngoài phần đồ thị hiện tại. Chọn “Tất cả môn học” rồi tìm lại để xem đầy đủ đường đi.</div>}
    <PathFinder courses={courses.data?.items ?? []} graphKey={graphKey} ready={Boolean(graph.data) && !graph.loading && !graph.error} onHighlight={highlightPath} />
  </>;
}

function useStudentAssessment(studentId: string) {
  const [state, setState] = useState<{ studentId: string; data: RecommendationResult | null; loading: boolean; error: string }>({ studentId: '', data: null, loading: false, error: '' });
  const [version, setVersion] = useState(0); const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    let active = true; if (!studentId) { setState({ studentId: '', data: null, loading: false, error: '' }); return; }
    setState({ studentId, data: null, loading: true, error: '' });
    api<RecommendationResult>(`/students/${encodeURIComponent(studentId)}/recommendations`).then((data) => {
      if (!Array.isArray(data.assessments)) throw new Error('Ứng dụng cần được khởi động lại để tải chức năng đánh giá học tập mới.');
      if (active) setState({ studentId, data, loading: false, error: '' });
    }).catch((cause: unknown) => { if (active) setState({ studentId, data: null, loading: false, error: errorMessage(cause) }); });
    return () => { active = false; };
  }, [studentId, version]);
  const current = state.studentId === studentId ? state : { data: null, error: '', loading: Boolean(studentId) };
  return { ...current, reload };
}

function CourseButtons({ nodes, choose }: { nodes: BusinessNode[]; choose: (id: string) => void }) {
  if (!nodes.length) return <p className="muted">Không có môn học.</p>;
  return <ul className="graph-course-links">{nodes.map((node) => <li key={node.id}><button type="button" onClick={() => choose(`MonHoc:${rawCourseId(node)}`)}><span>{rawCourseId(node)}</span><strong>{nodeName(node)}</strong><ArrowRight size={13} /></button></li>)}</ul>;
}

function PathFinder({ courses, graphKey, ready, onHighlight }: { courses: BusinessNode[]; graphKey: string; ready: boolean; onHighlight: (path: PathResult['paths'][number] | null) => void }) {
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [result, setResult] = useState<PathResult | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const requestVersion = useRef(0);
  const invalidate = useCallback(() => { requestVersion.current++; setResult(null); setError(''); setBusy(false); onHighlight(null); }, [onHighlight]);
  useEffect(() => { invalidate(); }, [graphKey, invalidate]); useEffect(() => () => { requestVersion.current++; }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!ready) return; const request = ++requestVersion.current; setBusy(true); setError(''); setResult(null); onHighlight(null);
    try { const next = await api<PathResult>(`/paths?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); if (request === requestVersion.current) { setResult(next); onHighlight(next.paths[0] ?? null); } }
    catch (cause) { if (request === requestVersion.current) setError(errorMessage(cause)); } finally { if (request === requestVersion.current) setBusy(false); }
  }
  return <section className="panel path-panel graph-pathfinder"><div className="section-heading"><div><p className="eyebrow">ĐƯỜNG ĐI TRONG ĐỒ THỊ</p><h2>Hai môn kết nối thế nào?</h2></div><Route size={23} /></div><form onSubmit={(event) => { void submit(event); }}><div className="inline-fields"><label className="field"><span>Môn bắt đầu</span><select value={from} required onChange={(event) => { invalidate(); setFrom(event.target.value); }}><option value="">Chọn môn…</option>{courses.map((node) => <option key={node.id} value={node.id}>{node.id} · {nodeName(node)}</option>)}</select></label><ArrowRight size={20} /><label className="field"><span>Môn đích</span><select value={to} required onChange={(event) => { invalidate(); setTo(event.target.value); }}><option value="">Chọn môn…</option>{courses.map((node) => <option key={node.id} value={node.id}>{node.id} · {nodeName(node)}</option>)}</select></label></div><button className="button secondary" disabled={busy || !ready} type="submit">{busy ? 'Đang tìm…' : 'Tìm và tô đường tiên quyết'}</button></form>{error && <ErrorNotice message={error} />}{result && (result.paths.length ? <div className="path-results">{result.paths.map((path, index) => <div key={index}><span className="tag green">{path.length} liên kết</span><p>{path.courses.map((course) => `${course.id} · ${course.name}`).join(' → ')}</p><button className="text-link" onClick={() => onHighlight(path)}>Tô đường này trong đồ thị<ArrowRight size={14} /></button></div>)}{result.truncated && <p className="muted">Danh sách đường đi đã được giới hạn.</p>}</div> : <p className="notice warning">Không có đường tiên quyết theo chiều từ môn bắt đầu đến môn đích.</p>)}</section>;
}
