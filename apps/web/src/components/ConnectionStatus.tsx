import { useEffect, useState } from 'react';
import { Database, ExternalLink, RefreshCw } from 'lucide-react';
import { useResource } from '../api.js';
import type { DatabaseConnection } from '../types.js';
import { ErrorNotice, Loading, Modal } from './common.js';

const deployments = { standalone: 'Neo4j chạy độc lập', desktop: 'Instance do Neo4j Desktop quản lý', remote: 'Máy chủ từ xa', unknown: 'Chưa khai báo kiểu triển khai' };

export default function ConnectionStatus({ admin }: { admin: boolean }) {
  const health = useResource<{ status: string; database: string }>('/health/ready');
  const [open, setOpen] = useState(false);
  useEffect(() => { const interval = window.setInterval(health.reload, 30000); return () => clearInterval(interval); }, [health.reload]);
  const text = health.loading && !health.data ? 'Đang kiểm tra' : health.error ? 'Database chưa sẵn sàng' : 'Database sẵn sàng';
  const content = <><i /><Database size={15} /><span>{text}</span></>;
  return <>{admin ? <button className={`health-badge health-button${health.error ? ' offline' : ''}`} aria-label="Xem kết nối database" title={text} onClick={() => setOpen(true)}>{content}</button> : <span className={`health-badge${health.error ? ' offline' : ''}`} title={text}>{content}</span>}{open && <ConnectionDialog close={() => setOpen(false)} refreshHealth={health.reload} />}</>;
}

function ConnectionDialog({ close, refreshHealth }: { close: () => void; refreshHealth: () => void }) {
  const connection = useResource<DatabaseConnection>('/system/connection');
  return <Modal title="Kết nối database" close={close}><div className="modal-body connection-details">
    <p className="muted">Thông tin kết nối của ứng dụng, dành cho quản trị viên.</p>
    {connection.loading ? <Loading text="Đang kiểm tra kết nối Neo4j…" /> : connection.error ? <ErrorNotice message={connection.error} retry={connection.reload} /> : connection.data && <>
      <div className="notice success"><Database size={18} /><span>Đã kết nối tới <strong>{connection.data.database}</strong>.</span></div>
      <dl className="property-grid"><div><dt>Database</dt><dd>{connection.data.database}</dd></div><div><dt>Triển khai</dt><dd>{deployments[connection.data.deployment]}</dd></div><div className="connection-uri"><dt>Địa chỉ Bolt</dt><dd><code>{connection.data.uri}</code></dd></div><div><dt>Kiểm tra lúc</dt><dd>{new Date(connection.data.checkedAt).toLocaleTimeString('vi-VN')}</dd></div></dl>
      {connection.data.deployment === 'standalone' && <div className="notice info"><span>Database này chạy độc lập. Trong Neo4j Desktop, thêm <strong>Remote connection</strong> bằng địa chỉ Bolt ở trên và chọn database <strong>{connection.data.database}</strong>. Nó sẽ không tự xuất hiện trong danh sách instance local.</span></div>}
      <details className="connection-help"><summary>Mở bằng Neo4j Desktop và Bloom</summary><ol><li>Trong Neo4j Desktop, vào Data services → Remote connections → Add connection.</li><li>Nhập địa chỉ Bolt ở trên và tài khoản Neo4j do quản trị viên cấu hình.</li><li>Chọn đúng database <strong>{connection.data.database}</strong>.</li></ol><p>Bloom phụ thuộc cách triển khai và giấy phép. Kết nối remote không tự cấp quyền dùng Bloom; xem hướng dẫn demo đi kèm dự án.</p><a href="https://neo4j.com/docs/desktop/current/operations/connections/" target="_blank" rel="noreferrer">Hướng dẫn kết nối Desktop <ExternalLink size={14} /></a></details>
      {connection.data.browserUrl ? <a className="button primary" href={connection.data.browserUrl} target="_blank" rel="noreferrer">Mở Neo4j Browser<ExternalLink size={16} /></a> : <p className="muted">Chưa cấu hình địa chỉ Neo4j Browser.</p>}
    </>}
  </div><div className="modal-actions"><button className="button secondary" disabled={connection.loading} onClick={() => { connection.reload(); refreshHealth(); }}><RefreshCw size={16} />Kiểm tra lại</button><button className="button primary" onClick={close}>Đóng</button></div></Modal>;
}
