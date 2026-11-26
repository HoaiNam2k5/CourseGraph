import { useState, type ChangeEvent } from 'react';
import { ArrowDownToLine, CheckCheck, FileJson, Files, History, Upload } from 'lucide-react';
import { api, csvFilename, download, errorMessage, useResource } from '../api.js';
import type { Catalog, ImportPreview, TransferEntry } from '../types.js';
import { Empty, ErrorNotice, Loading, PageTitle } from '../components/common.js';

const requiredCsvNames = ['MonHoc.csv', 'SinhVien.csv', 'GiangVien.csv', 'Khoa.csv', 'HocKy.csv', 'ChuongTrinhDaoTao.csv', 'QuanHeLienKet.csv'];

export default function Transfers({ catalog }: { catalog: Catalog }) {
  const [filename, setFilename] = useState(''); const [content, setContent] = useState<unknown>(null); const [preview, setPreview] = useState<ImportPreview | null>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [label, setLabel] = useState('MonHoc');
  const [format, setFormat] = useState<'csv' | 'json'>('csv'); const [csvFiles, setCsvFiles] = useState<{ name: string; content: string }[]>([]); const [selectedNames, setSelectedNames] = useState<string[]>([]); const [inputVersion, setInputVersion] = useState(0);
  const history = useResource<{ items: TransferEntry[] }>('/transfers/history');
  function switchFormat(value: 'csv' | 'json') { setFormat(value); setContent(null); setCsvFiles([]); setSelectedNames([]); setFilename(''); setPreview(null); setError(''); setNotice(''); setInputVersion((version) => version + 1); }
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    setError(''); setNotice(''); setPreview(null); setContent(null); const file = event.target.files?.[0]; setFilename(file?.name ?? '');
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError('File quá lớn. Vui lòng chọn file JSON nhỏ hơn 8 MB.'); return; }
    try { const value: unknown = JSON.parse(await file.text()); setContent(value); } catch { setError('File chưa phải JSON hợp lệ. Hãy chọn bản xuất dữ liệu nghiệp vụ của hệ thống.'); }
  }
  async function chooseCsv(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []); const names = files.map((file) => file.name);
    setError(''); setNotice(''); setPreview(null); setCsvFiles([]); setSelectedNames(names);
    if (!files.length) return;
    const unknown = names.filter((name) => !requiredCsvNames.includes(name));
    if (unknown.length) { setError(`Tên file không hợp lệ: ${unknown.join(', ')}. Hãy giữ đúng tên các file CSV yêu cầu.`); return; }
    if (new Set(names).size !== names.length) { setError('Có file trùng tên. Mỗi loại CSV chỉ chọn một file.'); return; }
    const missing = requiredCsvNames.filter((name) => !names.includes(name));
    if (missing.length || files.length !== 7) { setError(`Cần chọn đủ 7 file cùng lúc. Còn thiếu: ${missing.join(', ')}.`); return; }
    const oversized = files.filter((file) => file.size > 2 * 1024 * 1024);
    if (oversized.length) { setError(`Mỗi CSV tối đa 2 MB. File vượt giới hạn: ${oversized.map((file) => file.name).join(', ')}.`); return; }
    if (files.reduce((sum, file) => sum + file.size, 0) > 8 * 1024 * 1024) { setError('Tổng dung lượng các CSV phải nhỏ hơn hoặc bằng 8 MB.'); return; }
    setBusy(true);
    try { setCsvFiles(await Promise.all(files.map(async (file) => ({ name: file.name, content: await file.text() })))); }
    catch { setError('Không đọc được một số file. Vui lòng chọn lại bộ CSV UTF-8.'); }
    finally { setBusy(false); }
  }
  async function check() { setBusy(true); setError(''); try { setPreview(await api<ImportPreview>(format === 'csv' ? '/imports/csv/preview' : '/imports/preview', { method: 'POST', body: JSON.stringify(format === 'csv' ? { files: csvFiles } : { data: content }) })); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } }
  async function commit() { if (!preview) return; setBusy(true); setError(''); try { await api(`/imports/${encodeURIComponent(preview.id)}/commit`, { method: 'POST', body: JSON.stringify({ hash: preview.hash }) }); setPreview(null); setContent(null); setCsvFiles([]); setSelectedNames([]); setFilename(''); setInputVersion((version) => version + 1); setNotice('Đã nhập dữ liệu. Bản ghi và liên kết trùng được giữ duy nhất.'); history.reload(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } }
  async function exportFile(url: string, name: string) { setError(''); try { await download(url, name); setNotice('Đã tải bản xuất dữ liệu.'); history.reload(); } catch (cause) { setError(errorMessage(cause)); } }
  return <>
    <PageTitle eyebrow="DỮ LIỆU & VẬN HÀNH" title="Nhập và xuất dữ liệu" description="Kiểm tra trước khi ghi. Xuất dữ liệu nghiệp vụ để lưu trữ hoặc chuyển sang môi trường khác." />
    {error && <ErrorNotice message={error} />}{notice && <div className="notice success" role="status">{notice}</div>}
    <div className="transfer-grid"><section className="panel transfer-panel">
      <div className="section-heading"><div><p className="eyebrow">ĐƯA DỮ LIỆU VÀO HỆ THỐNG</p><h2>Nhập dữ liệu nghiệp vụ</h2></div><Upload size={23} /></div>
      <p className="muted">Chọn bộ CSV gốc hoặc bản JSON đã xuất. Hệ thống kiểm tra thuộc tính, liên kết và chu trình; các dòng giống hệt nhau được chuẩn hóa trước khi nhập.</p>
      <fieldset className="import-format"><legend className="sr-only">Định dạng nhập dữ liệu</legend><label className="checkbox-row"><input type="radio" name="import-format" value="csv" checked={format === 'csv'} onChange={() => switchFormat('csv')} disabled={busy} />Bộ 7 file CSV</label><label className="checkbox-row"><input type="radio" name="import-format" value="json" checked={format === 'json'} onChange={() => switchFormat('json')} disabled={busy} />Bản dữ liệu JSON</label></fieldset>
      {format === 'csv' ? <>
        <label className="file-drop"><Files size={32} /><strong>{selectedNames.length ? `Đã chọn ${selectedNames.length}/7 file CSV` : 'Chọn đồng thời 7 file CSV'}</strong><span>UTF-8 · Mỗi file tối đa 2 MB · Tổng tối đa 8 MB</span><input key={`csv-${inputVersion}`} type="file" accept=".csv,text/csv" multiple onChange={(event) => { void chooseCsv(event); }} aria-label="Chọn bộ 7 file CSV" disabled={busy} /></label>
        <div className="csv-checklist"><strong>Các file bắt buộc</strong><ul>{requiredCsvNames.map((name) => <li className={selectedNames.includes(name) ? 'ready' : ''} key={name}><span aria-hidden="true">{selectedNames.includes(name) ? '✓' : '○'}</span>{name}</li>)}</ul></div>
      </> : <label className="file-drop"><FileJson size={32} /><strong>{filename || 'Chọn file dữ liệu JSON'}</strong><span>Giới hạn 8 MB · Không bao gồm tài khoản</span><input key={`json-${inputVersion}`} type="file" accept=".json,application/json" onChange={(event) => { void choose(event); }} aria-label="Chọn file dữ liệu JSON" disabled={busy} /></label>}
      <button className="button secondary" disabled={busy || (format === 'csv' ? csvFiles.length !== 7 : content === null)} onClick={() => { void check(); }}><CheckCheck size={17} />{busy ? 'Đang xử lý…' : 'Kiểm tra dữ liệu'}</button>
      {preview && <div className="import-preview"><h3>Kết quả kiểm tra</h3><PreviewSummary value={preview.summary} /><div className="preview-warnings"><h4>Lưu ý dữ liệu</h4><WarningSummary value={preview.warnings} /></div><p className="muted">Xác nhận để ghi đúng nội dung vừa kiểm tra. Dữ liệu có cùng mã hoặc cùng liên kết được nhập theo quy tắc không tạo trùng.</p><button className="button primary" disabled={busy} onClick={() => { void commit(); }}><Upload size={16} />Xác nhận nhập dữ liệu</button></div>}
    </section>
      <div className="stack"><section className="panel transfer-panel"><div className="section-heading"><div><p className="eyebrow">LƯU MỘT BẢN DỮ LIỆU</p><h2>Xuất dữ liệu</h2></div><ArrowDownToLine size={23} /></div><p className="muted">Bản JSON chứa đầy đủ thực thể và liên kết nghiệp vụ. CSV phù hợp để kiểm tra từng danh mục.</p><button className="button primary full-width" onClick={() => { void exportFile('/exports/business-data', 'coursegraph-business-data.json'); }}><FileJson size={17} />Tải toàn bộ dữ liệu JSON</button><div className="export-row"><label className="field"><span>Danh mục CSV</span><select value={label} onChange={(event) => setLabel(event.target.value)}>{catalog.entities.map((entity) => <option value={entity.label} key={entity.label}>{entity.title}</option>)}<option value="relationships">Liên kết</option></select></label><button className="button secondary" onClick={() => { void exportFile(`/exports/csv?label=${encodeURIComponent(label)}`, csvFilename(label, catalog.entities)); }}>Tải CSV<ArrowDownToLine size={16} /></button></div></section><section className="operation-note"><h3>Sao lưu toàn bộ database</h3><p>Xuất dữ liệu nghiệp vụ giúp chuyển dữ liệu giữa các môi trường. Bản sao lưu database đầy đủ còn chứa tài khoản ứng dụng và các cấu hình dữ liệu liên quan.</p><p>Thực hiện sao lưu và khôi phục bằng bộ script vận hành đi kèm. Luôn thử khôi phục trên instance riêng trước khi thay thế môi trường chính.</p></section></div></div>
    <section className="panel history-panel"><div className="section-heading"><div><p className="eyebrow">THEO DÕI THAO TÁC</p><h2>Lịch sử nhập xuất</h2></div><History size={23} /></div>{history.loading ? <Loading /> : history.error ? <ErrorNotice message={history.error} retry={history.reload} /> : history.data?.items.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Thời gian</th><th>Thao tác</th><th>Trạng thái</th><th>Người thực hiện</th></tr></thead><tbody>{history.data.items.map((item) => <tr key={item.id}><td>{item.createdAt || item.timestamp ? new Date(item.createdAt ?? item.timestamp ?? '').toLocaleString('vi-VN') : '—'}</td><td>{item.type ?? item.kind ?? 'Nhập dữ liệu'}</td><td><span className="tag green">{item.status ?? 'Hoàn thành'}</span></td><td>{item.username ?? '—'}</td></tr>)}</tbody></table></div> : <Empty title="Chưa có thao tác nhập xuất" description="Các thao tác mới sẽ xuất hiện tại đây." />}</section>
  </>;
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
