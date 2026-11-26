import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage, useAllPages, useResource } from '../api.js';
import { Empty, ErrorNotice, Loading, Modal, PageTitle } from '../components/common.js';
import SearchField from '../components/SearchField.js';
import { entityTitles, formatNumber, nodeName, type BusinessEdge, type BusinessNode, type Catalog, type PageResult } from '../types.js';
import './relationships.css';

type LinkRow = BusinessEdge & { fromName: string; toName: string };
type LinkAction = { kind: 'add' } | { kind: 'edit' | 'delete'; edge: LinkRow };
const pageSize = 12;
const sortChoices = [
  ['from', 'asc', 'Nguồn A–Z'], ['from', 'desc', 'Nguồn Z–A'],
  ['to', 'asc', 'Đích A–Z'], ['to', 'desc', 'Đích Z–A'],
  ['type', 'asc', 'Loại A–Z'], ['type', 'desc', 'Loại Z–A'],
] as const;

function Endpoint({ name, label, id }: { name: string; label: string; id: string }) {
  return <div className="links-endpoint">
    <strong>{name}</strong><small>{entityTitles[label] ?? label} · {id}</small>
  </div>;
}

function linkTitle(catalog: Catalog, edge: BusinessEdge) {
  return catalog.relationships.find((item) => item.type === edge.type && item.from === edge.fromLabel && item.to === edge.toLabel)?.title ?? edge.type;
}

export default function Relationships({ catalog, admin }: { catalog: Catalog; admin: boolean }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [sortIndex, setSortIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<LinkAction | null>(null);
  const [notice, setNotice] = useState('');
  const [sort, order] = sortChoices[sortIndex];
  const params = new URLSearchParams({ q: search, page: String(page), pageSize: String(pageSize), sort, order });
  if (type) params.set('type', type);
  const resource = useResource<PageResult<LinkRow>>('/relationships?' + params);
  const total = resource.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const types = new Map(catalog.relationships.map((item) => [item.type, item.type === 'THUOC_KHOA' ? 'Thuộc khoa' : item.title]));

  useEffect(() => {
    if (query.trim() === search) return;
    const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(1); }, 220);
    return () => window.clearTimeout(timer);
  }, [query, search]);
  useEffect(() => {
    if (!resource.loading && !resource.error && resource.data?.page === page && page > lastPage) setPage(lastPage);
  }, [resource.loading, resource.error, resource.data, page, lastPage]);

  function saved(message: string) {
    setDialog(null);
    setNotice(message);
    resource.reload();
  }

  return <>
    <PageTitle eyebrow="DỮ LIỆU ĐÀO TẠO" title="Quản lý liên kết" description="Tra cứu quan hệ giữa các bản ghi trong mạng lưới đào tạo."
      actions={admin && <button className="button primary" onClick={() => { setNotice(''); setDialog({ kind: 'add' }); }}><Plus size={16} />Thêm liên kết</button>} />
    {notice && <p role="status" className="notice success">{notice}</p>}
    <section className="panel" aria-label="Danh sách liên kết">
      <div className="links-toolbar">
        <SearchField label="Tìm liên kết" maxLength={120} value={query} onQueryChange={setQuery} />
        <label className="field"><span>Loại liên kết</span>
          <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}>
            <option value="">Tất cả loại</option>
            {Array.from(types, ([key, title]) => <option value={key} key={key}>{title}</option>)}
          </select>
        </label>
        <label className="field"><span>Sắp xếp</span>
          <select value={sortIndex} onChange={(event) => { setSortIndex(Number(event.target.value)); setPage(1); }}>
            {sortChoices.map(([field, direction, title], index) => <option key={field + direction} value={index}>{title}</option>)}
          </select>
        </label>
      </div>
      {resource.error ? <ErrorNotice message={resource.error} retry={resource.reload} /> : resource.loading ? <Loading /> : <>
        <div className="links-summary" role="status">{formatNumber(total)} liên kết</div>
        {total === 0 ? <Empty title="Không tìm thấy liên kết" description="Thử đổi từ khóa hoặc loại liên kết." /> : <>
          <ul className="links-list">
            {resource.data?.items.map((edge) => <li className="links-row" key={JSON.stringify([edge.fromLabel, edge.fromId, edge.type, edge.toLabel, edge.toId])}>
              <Endpoint label={edge.fromLabel} id={edge.fromId} name={edge.fromName} />
              <span className="links-kind">{linkTitle(catalog, edge)}<ArrowRight size={15} aria-hidden="true" /></span>
              <Endpoint label={edge.toLabel} id={edge.toId} name={edge.toName} />
              {admin && <div className="links-actions">
                <button className="icon-button" aria-label={`Sửa liên kết ${edge.fromId} ${edge.type} ${edge.toId}`} title="Sửa liên kết" onClick={() => { setNotice(''); setDialog({ kind: 'edit', edge }); }}><Pencil size={16} /></button>
                <button className="icon-button danger" aria-label={`Xóa liên kết ${edge.fromId} ${edge.type} ${edge.toId}`} title="Xóa liên kết" onClick={() => { setNotice(''); setDialog({ kind: 'delete', edge }); }}><Trash2 size={16} /></button>
              </div>}
            </li>)}
          </ul>
          <div className="table-footer"><span>Trang {page} / {lastPage}</span><div className="row-actions">
            <button className="button small secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}><ArrowLeft size={15} />Trước</button>
            <button className="button small secondary" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>Sau<ArrowRight size={15} /></button>
          </div></div>
        </>}
      </>}
    </section>
    {admin && dialog && <LinkDialog action={dialog} catalog={catalog} close={() => setDialog(null)} saved={saved} />}
  </>;
}

function LinkDialog({ action, catalog, close, saved }: { action: LinkAction; catalog: Catalog; close: () => void; saved: (message: string) => void }) {
  const edge = action.kind === 'add' ? null : action.edge;
  const deleting = action.kind === 'delete';
  const dialogTitle = deleting ? 'Xóa liên kết' : edge ? 'Sửa liên kết' : 'Thêm liên kết';
  const [choice, setChoice] = useState(() => edge ? catalog.relationships.findIndex((item) => item.from === edge.fromLabel && item.to === edge.toLabel && item.type === edge.type) : 0);
  const [fromId, setFromId] = useState(edge?.fromId ?? '');
  const [toId, setToId] = useState(edge?.toId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const definition = catalog.relationships[choice];
  const from = catalog.entities.find((item) => item.label === definition?.from);
  const to = catalog.entities.find((item) => item.label === definition?.to);
  const sources = useAllPages<BusinessNode>(!deleting && from ? '/' + from.slug : null);
  const targets = useAllPages<BusinessNode>(!deleting && to && from !== to ? '/' + to.slug : null);
  const destinations = from === to ? sources : targets;
  const unchanged = edge && definition?.type === edge.type && from?.label === edge.fromLabel && to?.label === edge.toLabel && fromId === edge.fromId && toId === edge.toId;
  const ready = Boolean(fromId && toId && !unchanged && !sources.loading && !destinations.loading && !sources.error && !destinations.error);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || (!deleting && (!ready || !definition))) return;
    const previous: BusinessEdge | null = edge && { fromLabel: edge.fromLabel, fromId: edge.fromId, type: edge.type, toLabel: edge.toLabel, toId: edge.toId };
    const next: BusinessEdge | null = deleting ? null : { fromLabel: definition.from, fromId, type: definition.type, toLabel: definition.to, toId };
    const method = deleting ? 'DELETE' : edge ? 'PATCH' : 'POST';
    const payload = deleting ? previous : edge ? { previous, next } : next;
    setError(''); setBusy(true);
    try {
      await api('/relationships', { method, body: JSON.stringify(payload) });
      saved(deleting ? 'Đã xóa liên kết.' : edge ? 'Đã cập nhật liên kết.' : 'Đã thêm liên kết.');
    } catch (cause) {
      setError(errorMessage(cause)); setBusy(false);
    }
  }

  return <Modal title={dialogTitle} close={() => { if (!busy) close(); }}>
    <form onSubmit={(event) => { void submit(event); }}>
      <div className="modal-body">
        {deleting && edge ? <>
          <p>Xác nhận xóa liên kết giữa hai bản ghi sau?</p>
          <Endpoint name={edge.fromName} label={edge.fromLabel} id={edge.fromId} />
          <p className="links-confirm-kind">{linkTitle(catalog, edge)} <ArrowRight size={15} /></p>
          <Endpoint name={edge.toName} label={edge.toLabel} id={edge.toId} />
        </> : <fieldset className="links-fields" disabled={busy}>
          <label className="field"><span>Loại liên kết</span>
            <select value={choice} onChange={(event) => { setChoice(Number(event.target.value)); setFromId(''); setToId(''); setError(''); }}>
              {catalog.relationships.map((item, index) => <option key={index} value={index}>{item.title}</option>)}
            </select>
          </label>
          <label className="field"><span>Nguồn · {from?.title}</span>
            <select required value={fromId} disabled={sources.loading || Boolean(sources.error)} onChange={(event) => {
              setFromId(event.target.value);
              if (from === to && event.target.value === toId) setToId('');
            }}>
              <option value="">Chọn bản ghi nguồn…</option>
              {sources.data?.items.filter((node) => node.label === from?.label).map((node) => <option key={node.id} value={node.id}>{node.id} · {nodeName(node)}</option>)}
            </select>
          </label>
          <label className="field"><span>Đích · {to?.title}</span>
            <select required value={toId} disabled={destinations.loading || Boolean(destinations.error)} onChange={(event) => setToId(event.target.value)}>
              <option value="">Chọn bản ghi đích…</option>
              {destinations.data?.items.filter((node) => node.label === to?.label && !(from === to && node.id === fromId)).map((node) => <option key={node.id} value={node.id}>{node.id} · {nodeName(node)}</option>)}
            </select>
          </label>
          {sources.error && <ErrorNotice message={sources.error} retry={sources.reload} />}
          {destinations !== sources && destinations.error && <ErrorNotice message={destinations.error} retry={destinations.reload} />}
        </fieldset>}
        {error && <ErrorNotice message={error} />}
      </div>
      <div className="modal-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={close}>Hủy</button>
        <button className={deleting ? 'button destructive' : 'button primary'} disabled={busy || (!deleting && !ready)}>{busy ? 'Đang lưu…' : action.kind === 'edit' ? 'Lưu thay đổi' : dialogTitle}</button>
      </div>
    </form>
  </Modal>;
}
