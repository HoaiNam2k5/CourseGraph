import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, ApiError, download, errorMessage, useAllPages, useResource } from '../api.js';
import type { BusinessEdge, BusinessNode, Catalog, Entity, NodeDetail, PageResult, Relationship } from '../types.js';
import { formatNumber, nodeName } from '../types.js';
import { Empty, ErrorNotice, Loading, Modal, NodeCard, PageTitle } from '../components/common.js';

export function EntitiesPage({ entity, catalog, admin, onGraph }: { entity: Entity; catalog: Catalog; admin: boolean; onGraph: (courseId: string) => void }) {
  const [query, setQuery] = useState(''); const [debounced, setDebounced] = useState(''); const [page, setPage] = useState(1);
  const [form, setForm] = useState<BusinessNode | 'new' | null>(null); const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BusinessNode | null>(null); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  useEffect(() => { const timeout = window.setTimeout(() => { setDebounced(query); setPage(1); }, 250); return () => clearTimeout(timeout); }, [query]);
  useEffect(() => { setQuery(''); setDebounced(''); setPage(1); setSelected(null); setNotice(''); }, [entity.slug]);
  const resource = useResource<PageResult<BusinessNode>>(`/${entity.slug}?page=${page}&pageSize=12&q=${encodeURIComponent(debounced)}`);
  useEffect(() => { if (!resource.loading && resource.data) setPage((current) => Math.min(current, Math.max(1, Math.ceil(resource.data!.total / 12)))); }, [resource.loading, resource.data]);
  const columns = entity.fields.slice(0, 5);
  const changed = (message: string) => { setNotice(message); resource.reload(); };
  return <>
    <PageTitle eyebrow="DANH MỤC ĐÀO TẠO" title={entity.title} description={entity.slug === 'courses' ? 'Mỗi môn học là một điểm khởi đầu. Khám phá cách chúng kết nối với nhau.' : `Tra cứu và quản lý dữ liệu ${entity.title.toLocaleLowerCase('vi')}.`} actions={<>{admin && <button className="button secondary" onClick={() => { void download(`/exports/csv?label=${entity.label}`, entity.file).catch((cause: unknown) => setError(errorMessage(cause))); }}><ArrowDownToLine size={16} />Xuất CSV</button>}{admin && <button className="button primary" onClick={() => setForm('new')}><Plus size={18} />Thêm {entity.title.toLocaleLowerCase('vi')}</button>}</>} />
    {notice && <div className="notice success" role="status">{notice}</div>}{error && <ErrorNotice message={error} />}
    <section className="panel">
      <div className="table-toolbar"><label className="search-field"><Search size={18} /><input aria-label={`Tìm ${entity.title.toLocaleLowerCase('vi')}`} placeholder="Tìm theo mã, tên hoặc thuộc tính…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><span className="result-count">{resource.data ? `${formatNumber(resource.data.total)} bản ghi` : 'Đang tải…'}</span></div>
      {resource.error ? <ErrorNotice message={resource.error} retry={resource.reload} /> : resource.loading ? <Loading /> : !resource.data?.items.length ? <Empty title="Không tìm thấy bản ghi" /> : <>
        <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map((field) => <th key={field.key}>{field.label}</th>)}<th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{resource.data.items.map((node) => <tr key={node.id}>{columns.map((field, index) => <td key={field.key}>{index === 0 ? <span className="code-pill">{node.properties[field.key]}</span> : field.key === 'TenMH' || field.key === 'HoTen' ? <button className="text-link" onClick={() => setSelected(node.id)}>{node.properties[field.key]}</button> : field.key === 'LoaiMon' ? <span className={`tag ${String(node.properties[field.key]).includes('Bắt') ? 'green' : 'sand'}`}>{node.properties[field.key]}</span> : field.key === 'SoTC' ? <span className="credit-pill">{node.properties[field.key]}</span> : node.properties[field.key]}</td>)}<td><div className="row-actions"><button className="icon-button" title="Xem chi tiết" aria-label={`Chi tiết ${node.id}`} onClick={() => setSelected(node.id)}><Eye size={17} /></button>{admin && <><button className="icon-button" title="Chỉnh sửa" aria-label={`Sửa ${node.id}`} onClick={() => setForm(node)}><Pencil size={16} /></button><button className="icon-button danger" title="Xóa" aria-label={`Xóa ${node.id}`} onClick={() => setDeleting(node)}><Trash2 size={16} /></button></>}</div></td></tr>)}</tbody></table></div>
        <div className="table-footer"><span>Trang {page} / {Math.max(1, Math.ceil(resource.data.total / 12))}</span><div className="row-actions"><button className="button small secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ArrowLeft size={15} />Trước</button><button className="button small secondary" disabled={page * 12 >= resource.data.total} onClick={() => setPage((value) => value + 1)}>Sau<ArrowRight size={15} /></button></div></div>
      </>}
    </section>
    {entity.slug === 'courses' && <div className="context-strip"><span className="context-dot" /><p><strong>Đi từ môn học đến lộ trình.</strong> Mở chi tiết một môn để xem tiên quyết hoặc khám phá mạng lưới.</p></div>}
    {form && <EntityForm entity={entity} node={form === 'new' ? null : form} close={() => setForm(null)} saved={() => { setForm(null); changed('Đã lưu dữ liệu thành công.'); }} />}
    {deleting && <DeleteDialog entity={entity} node={deleting} close={() => setDeleting(null)} deleted={() => { setDeleting(null); changed('Đã xóa bản ghi.'); }} />}
    {selected && <DetailDialog entity={entity} id={selected} catalog={catalog} admin={admin} close={() => setSelected(null)} onGraph={(courseId) => { onGraph(courseId); setSelected(null); }} changed={() => changed('Đã cập nhật liên kết.')} />}
  </>;
}

function EntityForm({ entity, node, close, saved }: { entity: Entity; node: BusinessNode | null; close: () => void; saved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(entity.fields.map((field) => [field.key, String(node?.properties[field.key] ?? '')])));
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    const properties = Object.fromEntries(entity.fields.map((field) => [field.key, field.type === 'number' ? Number(values[field.key]) : values[field.key].trim()]));
    try { await api(`/${entity.slug}${node ? `/${encodeURIComponent(node.id)}` : ''}`, { method: node ? 'PATCH' : 'POST', body: JSON.stringify({ properties }) }); saved(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <Modal title={`${node ? 'Chỉnh sửa' : 'Thêm'} ${entity.title.toLocaleLowerCase('vi')}`} close={() => { if (!busy) close(); }}><form onSubmit={(event) => { void submit(event); }}><div className="form-grid">{entity.fields.map((field) => <label className={`field${field.key.startsWith('Ten') ? ' full' : ''}`} key={field.key}><span>{field.label}{field.required && <span className="required"> *</span>}</span><input name={field.key} type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : 'text'} value={field.type === 'date' ? values[field.key]?.slice(0, 10) : values[field.key]} required={field.required} min={field.type === 'number' ? 1 : undefined} max={field.key === 'SoTC' ? 30 : undefined} maxLength={field.type === 'number' ? undefined : 500} readOnly={Boolean(node && field.key === entity.key)} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} autoComplete="off" />{node && field.key === entity.key && <small>Mã định danh được giữ cố định.</small>}</label>)}</div>{error && <ErrorNotice message={error} />}<div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={close}>Hủy</button><button className="button primary" disabled={busy} type="submit">{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div></form></Modal>;
}

function DeleteDialog({ entity, node, close, deleted }: { entity: Entity; node: BusinessNode; close: () => void; deleted: () => void }) {
  const [error, setError] = useState(''); const [force, setForce] = useState(false); const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true); setError('');
    try { await api(`/${entity.slug}/${encodeURIComponent(node.id)}${force ? '?force=true' : ''}`, { method: 'DELETE' }); deleted(); }
    catch (cause) { setError(errorMessage(cause)); if (cause instanceof ApiError && cause.status === 409) setForce(true); }
    finally { setBusy(false); }
  }
  return <Modal title="Xác nhận xóa bản ghi" close={() => { if (!busy) close(); }}><div className="modal-body"><p>Bản ghi cần xóa: <strong>{nodeName(node)}</strong> <span className="code-pill">{node.id}</span>.</p><p>Dữ liệu đã xóa không thể hoàn tác trực tiếp.</p>{error && <ErrorNotice message={error} />}{force && <label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Tôi xác nhận xóa cả các liên kết của bản ghi này.</label>}</div><div className="modal-actions"><button className="button secondary" onClick={close} disabled={busy}>Giữ lại</button><button className="button destructive" onClick={() => { void remove(); }} disabled={busy || (force && !confirmed)}>{busy ? 'Đang xóa…' : force ? 'Xóa bản ghi và liên kết' : 'Xóa bản ghi'}</button></div></Modal>;
}

type CourseDetailTab = 'overview' | 'prerequisites' | 'dependents' | 'programs' | 'links';

function DetailDialog({ entity, id, catalog, admin, close, onGraph, changed }: { entity: Entity; id: string; catalog: Catalog; admin: boolean; close: () => void; onGraph: (courseId: string) => void; changed: () => void }) {
  const [activeId, setActiveId] = useState(id);
  const [tab, setTab] = useState<CourseDetailTab>('overview');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [courseNavigation, setCourseNavigation] = useState(false);
  const tabRoot = useId();
  const tabRefs = useRef<Partial<Record<CourseDetailTab, HTMLButtonElement | null>>>({});
  const resource = useResource<NodeDetail>(`/${entity.slug}/${encodeURIComponent(activeId)}`);
  const isCourse = entity.label === 'MonHoc';
  // useResource can retain the previous result while its URL changes.
  const detail = resource.data?.node.id === activeId && resource.data.node.label === entity.label ? resource.data : null;
  const programIds = useMemo(() => new Set((detail?.links ?? []).filter((edge) => edge.type === 'BAO_GOM' && edge.fromLabel === 'ChuongTrinhDaoTao' && edge.toLabel === 'MonHoc' && edge.toId === activeId).map((edge) => edge.fromId)), [detail, activeId]);
  const programs = useAllPages<BusinessNode>(isCourse && tab === 'programs' && detail && programIds.size ? '/programs' : null);
  const directPrerequisites = useMemo(() => new Set((detail?.links ?? []).filter((edge) => edge.type === 'TIEN_QUYET_CHO' && edge.fromLabel === 'MonHoc' && edge.toLabel === 'MonHoc' && edge.toId === activeId).map((edge) => edge.fromId)), [detail, activeId]);
  const directDependents = useMemo(() => new Set((detail?.links ?? []).filter((edge) => edge.type === 'TIEN_QUYET_CHO' && edge.fromLabel === 'MonHoc' && edge.toLabel === 'MonHoc' && edge.fromId === activeId).map((edge) => edge.toId)), [detail, activeId]);
  const tabs: { key: CourseDetailTab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Tổng quan' },
    { key: 'prerequisites', label: 'Toàn bộ tiên quyết', count: detail?.prerequisites.length ?? 0 },
    { key: 'dependents', label: 'Môn phụ thuộc', count: detail?.dependents.length ?? 0 },
    { key: 'programs', label: 'Chương trình', count: programIds.size },
    { key: 'links', label: 'Liên kết', count: detail?.links.length ?? 0 },
  ];

  useEffect(() => { setActiveId(id); setTab('overview'); setError(''); setCourseNavigation(false); }, [id, entity.slug]);
  useEffect(() => {
    if (courseNavigation && detail && !resource.loading) {
      tabRefs.current.overview?.focus();
      setCourseNavigation(false);
    }
  }, [courseNavigation, detail, resource.loading]);

  function openCourse(courseId: string) {
    if (busy || courseId === activeId) return;
    setError(''); setTab('overview'); setCourseNavigation(true); setActiveId(courseId);
  }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, current: CourseDetailTab) {
    const index = tabs.findIndex((item) => item.key === current);
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const target = tabs[next].key;
    setTab(target);
    tabRefs.current[target]?.focus();
    tabRefs.current[target]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  async function removeLink(edge: BusinessEdge) {
    setBusy(true); setError('');
    try { await api('/relationships', { method: 'DELETE', body: JSON.stringify(edge) }); resource.reload(); changed(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }

  const properties = detail && <dl className="property-grid">{entity.fields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{detail.node.properties[field.key]}</dd></div>)}</dl>;
  const links = detail && <DetailLinks detail={detail} catalog={catalog} admin={admin} busy={busy} error={error} removeLink={(edge) => { void removeLink(edge); }} saved={() => { resource.reload(); changed(); }} />;

  return <Modal title={`${entity.title} · ${activeId}`} close={close} wide>
    {resource.loading ? <Loading /> : resource.error ? <ErrorNotice message={resource.error} retry={resource.reload} /> : !detail ? <Loading text="Đang tải thông tin bản ghi…" /> : <div className={`modal-body${isCourse ? ' course-detail' : ''}`}>
      {isCourse ? <>
        <div className="course-detail-heading">
          <div><p className="eyebrow">HỒ SƠ MÔN HỌC</p><h3 className="detail-name">{nodeName(detail.node)}</h3><div className="course-detail-meta"><span className="code-pill">{detail.node.id}</span><span className="tag green">{detail.node.properties.SoTC} tín chỉ</span><span className="tag sand">{detail.node.properties.LoaiMon}</span></div></div>
          <button className="button primary" disabled={busy} onClick={() => onGraph(activeId)}>Khám phá mạng lưới<ArrowRight size={16} /></button>
        </div>
        <div className="course-detail-tabs" role="tablist" aria-label={`Thông tin môn ${activeId}`} aria-orientation="horizontal">
          {tabs.map((item) => <button key={item.key} ref={(element) => { tabRefs.current[item.key] = element; }} type="button" id={`${tabRoot}-tab-${item.key}`} role="tab" aria-selected={tab === item.key} aria-controls={`${tabRoot}-panel-${item.key}`} tabIndex={tab === item.key ? 0 : -1} onClick={() => setTab(item.key)} onKeyDown={(event) => navigateTabs(event, item.key)}>{item.label}{item.count !== undefined && <span className="course-tab-count">{formatNumber(item.count)}</span>}</button>)}
        </div>
        <section className="course-tab-panel" role="tabpanel" id={`${tabRoot}-panel-overview`} aria-labelledby={`${tabRoot}-tab-overview`} tabIndex={0} hidden={tab !== 'overview'}>
          <h4>Thông tin môn học</h4>{properties}<p className="muted course-detail-hint">Xem toàn bộ chuỗi tiên quyết, các môn phụ thuộc hoặc những chương trình đào tạo có môn học này trong các thẻ bên cạnh.</p>
        </section>
        <section className="course-tab-panel" role="tabpanel" id={`${tabRoot}-panel-prerequisites`} aria-labelledby={`${tabRoot}-tab-prerequisites`} tabIndex={0} hidden={tab !== 'prerequisites'}>
          <div className="section-heading"><h4>Toàn bộ môn cần hoàn thành trước</h4><span className="tag">{formatNumber(detail.prerequisites.length)} môn</span></div>
          <p className="muted">Bao gồm cả môn tiên quyết trực tiếp và gián tiếp trong toàn bộ chuỗi. Chọn mũi tên trên một môn để xem hồ sơ của môn đó.</p>
          {detail.prerequisites.length ? <div className="course-related-list">{detail.prerequisites.map((node) => <div className="course-related-item" key={node.id}><NodeCard node={node} action={busy ? undefined : () => openCourse(node.id)} /><span className={`tag ${directPrerequisites.has(node.id) ? 'green' : 'sand'}`}>{directPrerequisites.has(node.id) ? 'Trực tiếp' : 'Gián tiếp'}</span></div>)}</div> : <div role="status"><Empty title="Không có môn tiên quyết" description="Môn học này không yêu cầu môn tiên quyết trong dữ liệu hiện tại." /></div>}
        </section>
        <section className="course-tab-panel" role="tabpanel" id={`${tabRoot}-panel-dependents`} aria-labelledby={`${tabRoot}-tab-dependents`} tabIndex={0} hidden={tab !== 'dependents'}>
          <div className="section-heading"><h4>Các môn phụ thuộc</h4><span className="tag">{formatNumber(detail.dependents.length)} môn</span></div>
          <p className="muted">Bao gồm những môn phụ thuộc trực tiếp và gián tiếp vào môn hiện tại. Chọn một hồ sơ để tiếp tục tìm hiểu chuỗi học tập.</p>
          {detail.dependents.length ? <div className="course-related-list">{detail.dependents.map((node) => <div className="course-related-item" key={node.id}><NodeCard node={node} action={busy ? undefined : () => openCourse(node.id)} /><span className={`tag ${directDependents.has(node.id) ? 'green' : 'sand'}`}>{directDependents.has(node.id) ? 'Trực tiếp' : 'Gián tiếp'}</span></div>)}</div> : <div role="status"><Empty title="Chưa có môn phụ thuộc" description="Chưa có môn nào sử dụng môn học này làm tiên quyết trong dữ liệu hiện tại." /></div>}
        </section>
        <section className="course-tab-panel" role="tabpanel" id={`${tabRoot}-panel-programs`} aria-labelledby={`${tabRoot}-tab-programs`} tabIndex={0} hidden={tab !== 'programs'} aria-busy={tab === 'programs' && programIds.size > 0 && !programs.error && (programs.loading || !programs.data)}>
          <div className="section-heading"><h4>Chương trình đào tạo có môn học này</h4><span className="tag">{formatNumber(programIds.size)} chương trình</span></div>
          <p className="muted">Các chương trình dưới đây có môn {detail.node.id} trong danh sách đào tạo.</p>
          {!programIds.size ? <div role="status"><Empty title="Chưa thuộc chương trình nào" description="Môn học chưa được gắn vào chương trình đào tạo trong dữ liệu hiện tại." /></div> : programs.error ? <ErrorNotice message={programs.error} retry={programs.reload} /> : programs.loading || !programs.data ? <Loading text="Đang tải thông tin chương trình…" /> : <div className="course-program-list">{[...programIds].sort().map((programId) => {
            const program = programs.data!.items.find((node) => node.id === programId);
            return program ? <div className="course-program-item" key={programId}><NodeCard node={program} /><p className="muted">Bắt đầu năm {program.properties.NamBatDau} · {program.properties.ThoiGianDaoTao} năm đào tạo</p></div> : <div className="notice error" role="alert" key={programId}><span>Chưa tìm thấy thông tin chương trình <strong>{programId}</strong> trong danh mục đã tải.</span><button className="button small ghost" onClick={programs.reload}>Tải lại danh mục</button></div>;
          })}</div>}
        </section>
        <section className="course-tab-panel" role="tabpanel" id={`${tabRoot}-panel-links`} aria-labelledby={`${tabRoot}-tab-links`} tabIndex={0} hidden={tab !== 'links'}>{tab === 'links' && links}</section>
      </> : <><h3 className="detail-name">{nodeName(detail.node)}</h3>{properties}{links}</>}
    </div>}
  </Modal>;
}

function DetailLinks({ detail, catalog, admin, busy, error, removeLink, saved }: { detail: NodeDetail; catalog: Catalog; admin: boolean; busy: boolean; error: string; removeLink: (edge: BusinessEdge) => void; saved: () => void }) {
  return <>
    <div className="section-heading"><h3>Liên kết dữ liệu</h3><span className="tag">{detail.links.length} liên kết</span></div>{error && <ErrorNotice message={error} />}
    <div className="relationship-list">{detail.links.length ? detail.links.map((edge, index) => <div className="relationship-row" key={`${edge.type}-${edge.fromId}-${edge.toId}-${index}`}><span className="code-pill">{edge.fromId}</span><span className="relationship-type">{edge.type}<ArrowRight size={13} /></span><span className="code-pill">{edge.toId}</span>{admin && <button className="icon-button danger" disabled={busy} aria-label={`Xóa liên kết ${edge.fromId} ${edge.type} ${edge.toId}`} onClick={() => removeLink(edge)}><Trash2 size={14} /></button>}</div>) : <p className="muted">Bản ghi chưa có liên kết.</p>}</div>
    {admin && <RelationForm key={`${detail.node.label}:${detail.node.id}`} node={detail.node} catalog={catalog} saved={saved} />}
  </>;
}

function RelationForm({ node, catalog, saved }: { node: BusinessNode; catalog: Catalog; saved: () => void }) {
  const choices = useMemo(() => catalog.relationships.flatMap((definition) => {
    const result: { definition: Relationship; source: boolean; otherLabel: string }[] = [];
    if (definition.from === node.label) result.push({ definition, source: true, otherLabel: definition.to });
    if (definition.to === node.label) result.push({ definition, source: false, otherLabel: definition.from });
    return result;
  }), [catalog, node.label]);
  const [choice, setChoice] = useState('0'); const [peer, setPeer] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const selected = choices[Number(choice)]; const other = catalog.entities.find((item) => item.label === selected?.otherLabel);
  const resource = useAllPages<BusinessNode>(other ? `/${other.slug}` : null);
  if (!choices.length) return null;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!selected) return; setError(''); setBusy(true);
    const edge: BusinessEdge = { fromLabel: selected.definition.from, fromId: selected.source ? node.id : peer, type: selected.definition.type, toLabel: selected.definition.to, toId: selected.source ? peer : node.id };
    try { await api('/relationships', { method: 'POST', body: JSON.stringify(edge) }); setPeer(''); saved(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <form className="relation-form" onSubmit={(event) => { void submit(event); }}><h4>Thêm liên kết</h4><label className="field"><span>Loại liên kết</span><select value={choice} onChange={(event) => { setChoice(event.target.value); setPeer(''); }}>{choices.map((item, index) => <option key={index} value={index}>{item.definition.title} · {item.source ? 'từ bản ghi này' : 'đến bản ghi này'}</option>)}</select></label><label className="field"><span>{other?.title ?? 'Bản ghi liên quan'}</span><select value={peer} required onChange={(event) => setPeer(event.target.value)}><option value="">Chọn bản ghi…</option>{resource.data?.items.filter((item) => selected?.otherLabel !== node.label || item.id !== node.id).map((item) => <option key={item.id} value={item.id}>{item.id} · {nodeName(item)}</option>)}</select></label>{resource.error && <ErrorNotice message={resource.error} retry={resource.reload} />}{error && <ErrorNotice message={error} />}<button type="submit" className="button secondary" disabled={busy || !peer}><Plus size={15} />{busy ? 'Đang thêm…' : 'Thêm liên kết'}</button></form>;
}
