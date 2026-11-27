import { useId, useState, type FormEvent } from 'react';
import { ArrowRight, BookOpenCheck, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { useAllPages, useResource } from '../api.js';
import type { BusinessNode, CourseAssessment, RecommendationResult } from '../types.js';
import { nodeName } from '../types.js';
import { Empty, ErrorNotice, NodeCard, PageTitle, ProgressBar, SkeletonCards } from '../components/common.js';
import StudentPicker from '../components/StudentPicker.js';

type RecommendationFilters = { student: string; program: string; semester: string };
type RecommendationState = {
  form: RecommendationFilters;
  submitted: RecommendationFilters | null;
  view: 'eligible' | 'blocked';
};

function initialRecommendationState(accountId: string): RecommendationState {
  const saved = history.state?.recommendations as (RecommendationState & { accountId: string }) | undefined;
  return saved?.accountId === accountId ? saved : {
    form: { student: '', program: '', semester: '' }, submitted: null, view: 'eligible',
  };
}

export default function Recommendations({ accountId, onGraph }: { accountId: string; onGraph: (id: string, studentId?: string) => void }) {
  const students = useAllPages<BusinessNode>('/students');
  const programs = useAllPages<BusinessNode>('/programs');
  const semesters = useAllPages<BusinessNode>('/semesters');
  const [state, setState] = useState(() => initialRecommendationState(accountId));
  const { form, submitted, view } = state;
  const { student, program, semester } = form;
  const params = new URLSearchParams();
  if (submitted?.program) params.set('programId', submitted.program);
  if (submitted?.semester) params.set('semesterId', submitted.semester);
  const query = submitted ? `/students/${encodeURIComponent(submitted.student)}/recommendations?${params}` : null;
  const result = useResource<RecommendationResult>(query);
  const groupId = useId();
  const dirty = !submitted || submitted.student !== student || submitted.program !== program || submitted.semester !== semester;
  const eligible = result.data?.assessments?.filter((item) => item.inScope && item.status === 'eligible') ?? [];
  const blocked = result.data?.assessments?.filter((item) => item.inScope && item.status === 'blocked') ?? [];
  const shown = view === 'eligible' ? eligible : blocked;
  const selectedStudent = students.data?.items.find((item) => item.id === submitted?.student);
  function updateState(next: RecommendationState) {
    // Keep the filters on this history entry, and fetch results again when the user returns.
    history.replaceState({ ...history.state, recommendations: { ...next, accountId } }, '');
    setState(next);
  }
  function updateFilter(key: keyof RecommendationFilters, value: string) {
    updateState({ ...state, form: { ...form, [key]: value } });
  }
  function setView(view: RecommendationState['view']) {
    updateState({ ...state, view });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!student) return;
    updateState({ ...state, submitted: form, view: 'eligible' });
    if (!dirty) result.reload();
  }
  return <>
    <PageTitle eyebrow="LỘ TRÌNH HỌC TẬP" title="Bước học tiếp theo" description="Biết môn nào có thể học, hiểu vì sao đủ điều kiện và còn cần hoàn thành những gì." />
    <section className="panel recommendation-form"><div className="section-heading"><div><h2>Chọn hồ sơ học tập</h2><p className="muted">Bộ lọc chương trình và học kỳ là tùy chọn.</p></div><Sparkles size={25} /></div>
      <form onSubmit={submit}><div className="form-grid three recommendation-filters">
        <StudentPicker students={students.data?.items ?? []} value={student} onChange={(id) => updateFilter('student', id)} required />
        <label className="field"><span>Chương trình đào tạo</span><select value={program} onChange={(event) => updateFilter('program', event.target.value)}><option value="">Không giới hạn chương trình</option>{programs.data?.items.map((node) => <option value={node.id} key={node.id}>{nodeName(node)}</option>)}</select></label>
        <label className="field"><span>Học kỳ mở môn</span><select value={semester} onChange={(event) => updateFilter('semester', event.target.value)}><option value="">Tất cả học kỳ</option>{semesters.data?.items.map((node) => <option value={node.id} key={node.id}>{nodeName(node)} · {node.properties.NamHoc}</option>)}</select></label>
      </div>{[students, programs, semesters].some((resource) => resource.error) && <ErrorNotice message="Chưa tải được đầy đủ danh mục." retry={() => { students.reload(); programs.reload(); semesters.reload(); }} />}
        <div className="form-bottom"><p className="muted">Xét toàn bộ tiên quyết; loại môn đã hoàn thành và đang học.</p><button type="submit" className="button primary" disabled={result.loading || !student}>Xem môn có thể học<ArrowRight size={17} /></button></div>
      </form>
    </section>
    <div className="notice info"><BookOpenCheck size={19} /><span>Trong dữ liệu demo, <strong>DA_HOC</strong> được quy ước là hoàn thành đạt. Kết quả này dùng để tra cứu điều kiện học.</span></div>
    {result.loading ? <SkeletonCards layout="recommendations" text="Đang kiểm tra điều kiện tiên quyết…" /> : result.error ? <ErrorNotice message={result.error} retry={result.reload} /> : result.data && submitted ? dirty ? <div className="notice warning" role="status">Hồ sơ hoặc bộ lọc đã thay đổi. Bấm “Xem môn có thể học” để cập nhật kết quả.</div> : !Array.isArray(result.data.assessments) ? <section><ErrorNotice message="Ứng dụng cần được khởi động lại để tải chức năng giải thích tiên quyết mới." /><h2>{result.data.items.length} môn đủ điều kiện học</h2><div className="recommendation-grid">{result.data.items.map((node) => <NodeCard key={node.id} node={node} action={() => onGraph(node.id, submitted.student)} />)}</div></section> : <section className="recommendation-results" aria-label="Kết quả kiểm tra tiên quyết">
      <div className="section-heading"><div><p className="eyebrow">{selectedStudent ? `${submitted.student} · ${nodeName(selectedStudent)}` : submitted.student}</p><h2>{result.data.items.length} môn đủ điều kiện học</h2></div><span className="tag green">Đã hoàn thành {result.data.completedCount} môn</span></div>
      <div className="result-switch" role="group" aria-label="Lọc kết quả điều kiện học"><button className={view === 'eligible' ? 'active' : ''} aria-pressed={view === 'eligible'} aria-controls={groupId} onClick={() => setView('eligible')}><CheckCircle2 size={17} />Đủ điều kiện <span>{eligible.length}</span></button><button className={view === 'blocked' ? 'active' : ''} aria-pressed={view === 'blocked'} aria-controls={groupId} onClick={() => setView('blocked')}><Circle size={17} />Chưa đủ điều kiện <span>{blocked.length}</span></button></div>
      <p className="muted results-caption">{view === 'eligible' ? 'Mở từng thẻ để xem điều kiện đã đáp ứng.' : 'Các môn dưới đây thuộc bộ lọc đã chọn và còn thiếu tiên quyết. Môn đang học chưa được tính là hoàn thành.'}</p>
      <div id={groupId}>{shown.length ? <div className="recommendation-grid">{shown.map((item) => <AssessmentCard key={item.course.id} item={item} onGraph={() => onGraph(item.course.id, submitted.student)} />)}</div> : <Empty title={view === 'eligible' ? 'Chưa có môn phù hợp' : 'Không có môn thiếu tiên quyết trong bộ lọc'} description={!result.data.assessments.some((item) => item.inScope) ? result.data.rule.includes('không theo học') ? result.data.rule : 'Không có môn thuộc chương trình và học kỳ đã chọn.' : 'Môn đã hoàn thành và môn đang học được loại khỏi hai danh sách này.'} />}</div>
    </section> : <div className="selection-hint"><div className="hint-line" /><BookOpenCheck size={32} /><h3>Một lộ trình bắt đầu từ những gì đã học.</h3><p>Chọn sinh viên để khám phá môn học tiếp theo.</p></div>}
  </>;
}

function AssessmentCard({ item, onGraph }: { item: CourseAssessment; onGraph: () => void }) {
  const missing = new Set(item.missingPrerequisites.map((node) => node.id));
  const fulfilled = item.prerequisites.length - missing.size;
  return <article className={`assessment-card ${item.status}`}>
    <div className="assessment-heading"><span className="node-code">{item.course.id}</span><span className={`tag ${item.status === 'eligible' ? 'green' : 'sand'}`}>{item.status === 'eligible' ? 'Đủ điều kiện' : `Thiếu ${missing.size} môn`}</span></div>
    <h3>{nodeName(item.course)}</h3><p className="assessment-meta">{item.course.properties.SoTC} tín chỉ · {item.course.properties.LoaiMon}</p>
    <p className="assessment-progress">{item.prerequisites.length ? `Đã hoàn thành ${fulfilled}/${item.prerequisites.length} môn tiên quyết` : 'Môn nền tảng · Không yêu cầu tiên quyết'}</p>
    {item.prerequisites.length > 0 && <ProgressBar max={item.prerequisites.length} value={fulfilled} tone={item.status === 'blocked' ? 'amber' : 'forest'} label={`Tiến độ tiên quyết của ${item.course.id}`} />}
    <details className="assessment-explanation"><summary>{item.status === 'eligible' ? 'Vì sao học được?' : 'Cần hoàn thành những môn nào?'}</summary><p>Xét cả môn tiên quyết trực tiếp và gián tiếp.</p>{item.prerequisites.length ? <ul>{item.prerequisites.map((node) => <li key={node.id} className={missing.has(node.id) ? 'missing' : 'fulfilled'}>{missing.has(node.id) ? <Circle size={15} /> : <CheckCircle2 size={15} />}<span><strong>{node.id}</strong> · {nodeName(node)}<small>{missing.has(node.id) ? 'Chưa hoàn thành' : 'Đã hoàn thành'}</small></span></li>)}</ul> : <p>Có thể bắt đầu học môn này mà không cần hoàn thành môn khác trước.</p>}</details>
    <button className="text-link assessment-graph" onClick={onGraph} aria-label={`Xem ${item.course.id} trên đồ thị`}>Xem trên đồ thị<ArrowRight size={16} /></button>
  </article>;
}
