import { useState, type ChangeEvent } from 'react';
import { Archive, ArrowDownToLine, Check, CheckCheck, ChevronDown, Circle, FileJson, Files, History, Upload } from 'lucide-react';
import { api, csvFilename, download, errorMessage, useResource } from '../api.js';
import type { Catalog, ImportPreview, TransferEntry } from '../types.js';
import { Empty, ErrorNotice, Loading, PageTitle } from '../components/common.js';
import './admin-pages.css';

const requiredCsvNames = ['MonHoc.csv', 'SinhVien.csv', 'GiangVien.csv', 'Khoa.csv', 'HocKy.csv', 'ChuongTrinhDaoTao.csv', 'QuanHeLienKet.csv'];

export default function Transfers({ catalog }: { catalog: Catalog }) {
  const [filename, setFilename] = useState(''); const [content, setContent] = useState<unknown>(null); const [preview, setPreview] = useState<ImportPreview | null>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [label, setLabel] = useState('MonHoc');
  const [format, setFormat] = useState<'csv' | 'json'>('csv'); const [csvFiles, setCsvFiles] = useState<{ name: string; content: string }[]>([]); const [selectedNames, setSelectedNames] = useState<string[]>([]); const [inputVersion, setInputVersion] = useState(0);
  const history = useResource<{ items: TransferEntry[] }>('/transfers/history');
  const selected = new Set(selectedNames);
  const selectedCount = requiredCsvNames.filter((name) => selected.has(name)).length;
  function switchFormat(value: 'csv' | 'json') { setFormat(value); setContent(null); setCsvFiles([]); setSelectedNames([]); setFilename(''); setPreview(null); setError(''); setNotice(''); setInputVersion((version) => version + 1); }
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    setError(''); setNotice(''); setPreview(null); setContent(null); const file = event.target.files?.[0]; setFilename(file?.name ?? '');
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError('Tệp JSON vượt giới hạn 8 MB.'); return; }
    setBusy(true);
    try { const value: unknown = JSON.parse(await file.text()); setContent(value); }
    catch { setError('Tệp JSON không hợp lệ. Hãy chọn bản xuất dữ liệu nghiệp vụ của hệ thống.'); }
    finally { setBusy(false); }
  }
  async function chooseCsv(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []); const names = files.map((file) => file.name);
    setError(''); setNotice(''); setPreview(null); setCsvFiles([]); setSelectedNames(names);
    if (!files.length) return;
    const unknown = names.filter((name) => !requiredCsvNames.includes(name));
    if (unknown.length) { setError(`Tên tệp không hợp lệ: ${unknown.join(', ')}. Hãy giữ đúng tên các tệp CSV yêu cầu.`); return; }
    if (new Set(names).size !== names.length) { setError('Có tệp trùng tên. Mỗi loại CSV chỉ chọn một tệp.'); return; }
    const missing = requiredCsvNames.filter((name) => !names.includes(name));
    if (missing.length || files.length !== 7) { setError(`Cần chọn đủ 7 tệp cùng lúc. Còn thiếu: ${missing.join(', ')}.`); return; }
    const oversized = files.filter((file) => file.size > 2 * 1024 * 1024);
    if (oversized.length) { setError(`Mỗi CSV tối đa 2 MB. Tệp vượt giới hạn: ${oversized.map((file) => file.name).join(', ')}.`); return; }
    if (files.reduce((sum, file) => sum + file.size, 0) > 8 * 1024 * 1024) { setError('Tổng dung lượng các CSV phải nhỏ hơn hoặc bằng 8 MB.'); return; }
    setBusy(true);
    try { setCsvFiles(await Promise.all(files.map(async (file) => ({ name: file.name, content: await file.text() })))); }
    catch { setError('Không đọc được một số tệp. Vui lòng chọn lại bộ CSV UTF-8.'); }
    finally { setBusy(false); }
  }
  async function check() { setBusy(true); setError(''); try { setPreview(await api<ImportPreview>(format === 'csv' ? '/imports/csv/preview' : '/imports/preview', { method: 'POST', body: JSON.stringify(format === 'csv' ? { files: csvFiles } : { data: content }) })); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } }
  async function commit() { if (!preview) return; setBusy(true); setError(''); try { await api(`/imports/${encodeURIComponent(preview.id)}/commit`, { method: 'POST', body: JSON.stringify({ hash: preview.hash }) }); setPreview(null); setContent(null); setCsvFiles([]); setSelectedNames([]); setFilename(''); setInputVersion((version) => version + 1); setNotice('Đã nhập dữ liệu. Bản ghi và liên kết trùng được giữ duy nhất.'); history.reload(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } }
  async function exportFile(url: string, name: string) { setError(''); try { await download(url, name); setNotice('Đã tải bản xuất dữ liệu.'); history.reload(); } catch (cause) { setError(errorMessage(cause)); } }
  return <div className="admin-transfer">
    <PageTitle eyebrow="DỮ LIỆU & VẬN HÀNH" title="Nhập và xuất dữ liệu" description="Nhập theo bộ CSV hoặc bản JSON. Xem trước kết quả rồi xác nhận nhập." />
    {error && <ErrorNotice message={error} />}
    {notice && <div className="notice success" role="status">{notice}</div>}
    <div className="transfer-grid">
      <section className="panel transfer-panel transfer-import">
        <div className="section-heading"><h2>Nhập dữ liệu</h2><Upload size={21} aria-hidden="true" /></div>
        <fieldset className="import-format">
          <legend className="sr-only">Định dạng nhập dữ liệu</legend>
          <label className="checkbox-row"><input type="radio" name="import-format" value="csv" checked={format === 'csv'} onChange={() => switchFormat('csv')} disabled={busy} />Bộ 7 tệp CSV</label>
          <label className="checkbox-row"><input type="radio" name="import-format" value="json" checked={format === 'json'} onChange={() => switchFormat('json')} disabled={busy} />Tệp JSON</label>
        </fieldset>
        {format === 'csv' ? <div className="transfer-csv">
          <label className="file-drop">
            <Files size={25} aria-hidden="true" />
            <strong>{selectedCount ? `Đã chọn ${selectedCount}/${requiredCsvNames.length} tệp CSV` : 'Chọn đồng thời 7 tệp CSV'}</strong>
            <span>UTF-8 · Tối đa 2 MB mỗi tệp và 8 MB tổng cộng</span>
            <input key={`csv-${inputVersion}`} type="file" accept=".csv,text/csv" multiple onChange={(event) => { void chooseCsv(event); }} aria-label="Chọn bộ 7 tệp CSV" disabled={busy} />
          </label>
          <div className="csv-checklist">
            <div className="transfer-checklist-heading">
              <h3>Tệp CSV bắt buộc</h3>
              <span role="status" aria-atomic="true">{selectedCount}/{requiredCsvNames.length} tệp</span>
            </div>
            <ul>{requiredCsvNames.map((name) => {
              const ready = selected.has(name);
              return <li className={ready ? 'ready' : undefined} key={name}>
                {ready ? <Check size={15} strokeWidth={2.4} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
                <span>{name}</span>
                <span className="sr-only">{ready ? 'Đã chọn' : 'Chưa chọn'}</span>
              </li>;
            })}</ul>
          </div>
        </div> : <label className="file-drop">
          <FileJson size={25} aria-hidden="true" />
          <strong>{filename || 'Chọn tệp dữ liệu JSON'}</strong>
          <span>Tối đa 8 MB · Dữ liệu nghiệp vụ</span>
          <input key={`json-${inputVersion}`} type="file" accept=".json,application/json" onChange={(event) => { void choose(event); }} aria-label="Chọn tệp dữ liệu JSON" disabled={busy} />
        </label>}
        <button className="button secondary" disabled={busy || (format === 'csv' ? csvFiles.length !== requiredCsvNames.length : content === null)} onClick={() => { void check(); }}>
          <CheckCheck size={17} aria-hidden="true" />{busy ? 'Đang xử lý…' : 'Kiểm tra dữ liệu'}
        </button>
        {preview && <div className="import-preview">
          <h3>Kết quả kiểm tra</h3>
          <PreviewSummary value={preview.summary} />
          <div className="preview-warnings"><h4>Lưu ý dữ liệu</h4><WarningSummary value={preview.warnings} /></div>
          <p className="muted">Các bản ghi hoặc liên kết trùng chỉ được lưu một lần.</p>
          <button className="button primary" disabled={busy} onClick={() => { void commit(); }}><Upload size={16} aria-hidden="true" />Xác nhận nhập dữ liệu</button>
        </div>}
      </section>
      <div className="stack">
        <section className="panel transfer-panel">
          <div className="section-heading"><h2>Xuất dữ liệu</h2><ArrowDownToLine size={21} aria-hidden="true" /></div>
          <button className="button primary full-width" onClick={() => { void exportFile('/exports/business-data', 'coursegraph-business-data.json'); }}>
            <FileJson size={17} aria-hidden="true" />Tải toàn bộ dữ liệu JSON
          </button>
          <div className="export-row">
            <label className="field"><span>Danh mục CSV</span>
              <select value={label} onChange={(event) => setLabel(event.target.value)}>
                {catalog.entities.map((entity) => <option value={entity.label} key={entity.label}>{entity.title}</option>)}
                <option value="relationships">Liên kết</option>
              </select>
            </label>
            <button className="button secondary" onClick={() => { void exportFile(`/exports/csv?label=${encodeURIComponent(label)}`, csvFilename(label, catalog.entities)); }}>Tải CSV<ArrowDownToLine size={16} aria-hidden="true" /></button>
          </div>
        </section>
        <details className="panel transfer-backup">
          <summary><Archive size={18} aria-hidden="true" /><span>Sao lưu và khôi phục cơ sở dữ liệu</span><ChevronDown className="backup-chevron" size={17} aria-hidden="true" /></summary>
          <div className="transfer-backup-content">
            <p><strong>CSV và JSON.</strong> Trang này xuất dữ liệu đào tạo và nhập bổ sung vào cơ sở dữ liệu hiện có.</p>
            <p><strong>Neo4j cục bộ.</strong> Dùng lệnh vận hành của dự án để tạo bản dump và thử khôi phục trên cơ sở dữ liệu riêng. Tệp dump lưu dữ liệu ứng dụng và các tài khoản CourseGraph. Cấu hình triển khai và thông tin kết nối được quản lý riêng.</p>
            <p><strong>Neo4j Aura.</strong> Các thao tác sao lưu và khôi phục do Aura Console quản lý, tùy gói của cơ sở dữ liệu.</p>
          </div>
        </details>
      </div>
    </div>
    <section className="panel history-panel">
      <div className="section-heading"><h2>Lịch sử nhập xuất</h2><History size={21} aria-hidden="true" /></div>
      {history.loading ? <Loading /> : history.error ? <ErrorNotice message={history.error} retry={history.reload} /> : history.data?.items.length ? <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th scope="col">Thời gian</th><th scope="col">Thao tác</th><th scope="col">Trạng thái</th><th scope="col">Người thực hiện</th></tr></thead>
          <tbody>{history.data.items.map((item) => <tr key={item.id}>
            <td>{item.createdAt || item.timestamp ? new Date(item.createdAt ?? item.timestamp ?? '').toLocaleString('vi-VN') : '—'}</td>
            <td>{transferAction(item)}</td>
            <td><span className="tag green">{item.status ?? 'Hoàn thành'}</span></td>
            <td>{item.username ?? '—'}</td>
          </tr>)}</tbody>
        </table>
      </div> : <Empty title="Chưa có thao tác nhập xuất" description="Các thao tác mới sẽ xuất hiện tại đây." />}
    </section>
  </div>;
}

function transferAction(item: TransferEntry) {
  const kind = item.type ?? item.kind;
  if (kind === 'EXPORT') {
    return item.format && item.filename ? `Xuất ${item.format} · ${item.filename}` : 'Xuất dữ liệu';
  }
  return kind === 'IMPORT' || !kind ? 'Nhập dữ liệu' : kind;
}

function PreviewSummary({ value }: { value: unknown }) {
  if (typeof value !== 'object' || value === null) return <p>Dữ liệu đã được kiểm tra.</p>;
  const labels: Record<string, string> = { nodes: 'Thực thể', nodeCount: 'Thực thể', relationships: 'Liên kết', relationshipCount: 'Liên kết', courses: 'Môn học', warnings: 'Cảnh báo' };
  const items = Object.entries(value).filter(([, entry]) => typeof entry === 'number' || typeof entry === 'string');
  return <dl className="property-grid">{items.map(([key, entry]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd>{String(entry)}</dd></div>)}</dl>;
}
function WarningSummary({ value }: { value: unknown }) {
  if (Array.isArray(value)) return value.length ? <ul>{value.slice(0, 8).map((item: unknown, index) => <li key={index}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>)}{value.length > 8 && <li>Và {value.length - 8} lưu ý khác.</li>}</ul> : <p>Không có cảnh báo.</p>;
  if (typeof value === 'object' && value !== null) {
    const warning = value as { historicalPrerequisiteCount?: number; rule?: string };
    return <p>{warning.historicalPrerequisiteCount !== undefined ? `${warning.historicalPrerequisiteCount} bản ghi lịch sử cần đối chiếu điều kiện tiên quyết. Các bản ghi này được giữ nguyên.` : 'Vui lòng đối chiếu lịch sử học và quy ước dữ liệu demo.'}</p>;
  }
  return <p>Không có cảnh báo.</p>;
}
