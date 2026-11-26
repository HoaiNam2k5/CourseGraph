import { ArrowRight, BookOpen, GraduationCap, Layers3, Network, School } from 'lucide-react';
import { useResource } from '../api.js';
import type { Statistics } from '../types.js';
import { formatNumber } from '../types.js';
import { ConnectedMark, Empty, ErrorNotice, Loading, PageTitle } from '../components/common.js';

export default function Dashboard({ go }: { go: (page: string) => void }) {
  const resource = useResource<Statistics>('/statistics');
  if (resource.loading) return <Loading text="Đang tổng hợp mạng lưới…" />;
  if (resource.error) return <ErrorNotice message={resource.error} retry={resource.reload} />;
  const stats = resource.data;
  if (!stats) return <Empty />;
  const metrics = [{ key: 'MonHoc', title: 'Môn học', icon: BookOpen, target: 'courses' }, { key: 'SinhVien', title: 'Sinh viên', icon: GraduationCap, target: 'students' }, { key: 'ChuongTrinhDaoTao', title: 'Chương trình', icon: Layers3, target: 'programs' }, { key: 'Khoa', title: 'Khoa đào tạo', icon: School, target: 'faculties' }];
  const maxFaculty = Math.max(1, ...stats.coursesByFaculty.map((item) => item.count));
  return <>
    <PageTitle eyebrow="KHÔNG GIAN ĐÀO TẠO" title="Nhìn thấy những kết nối." description="Từ từng môn học đến toàn bộ hành trình. Khám phá dữ liệu đào tạo qua một góc nhìn đồ thị." actions={<button className="button primary" onClick={() => go('graph')}><Network size={17} />Khám phá mạng lưới</button>} />
    <div className="metric-grid">{metrics.map(({ key, title, icon: Icon, target }) => <button className="metric-card" key={key} onClick={() => go(target)}><div className="metric-top"><span>{title}</span><Icon size={19} /></div><strong>{formatNumber(stats.counts[key] ?? 0)}</strong><span className="metric-footer">Xem danh mục<ArrowRight size={15} /></span></button>)}</div>
    <div className="dashboard-grid"><section className="network-feature"><div><p className="eyebrow">MỖI MÔN HỌC ĐỀU CÓ MỘT VỊ TRÍ</p><h2>Đừng chỉ xem danh sách.<br />Hãy xem cả mạng lưới.</h2><p>{formatNumber(stats.relationshipCount)} liên kết kết nối môn học, sinh viên và chương trình đào tạo trong cùng một hệ thống.</p><button className="button cream" onClick={() => go('graph')}>Mở bản đồ môn học<ArrowRight size={17} /></button></div><ConnectedMark large /><div className="feature-bottom"><span><i />Neo4j · Property Graph</span><span>{stats.relationsByType.length} loại quan hệ</span></div></section>
      <section className="panel faculty-panel"><div className="section-heading"><div><p className="eyebrow">PHÂN BỔ ĐÀO TẠO</p><h2>Môn học theo khoa</h2></div></div>{stats.coursesByFaculty.length ? <div className="bar-list">{stats.coursesByFaculty.slice(0, 6).map((item) => <div className="bar-item" key={item.name}><div><span>{item.name}</span><strong>{item.count}</strong></div><progress max={maxFaculty} value={item.count} aria-label={`${item.name}: ${item.count} môn`} /></div>)}</div> : <Empty />}</section></div>
    <div className="dashboard-grid lower"><section className="panel"><div className="section-heading"><div><p className="eyebrow">NHỮNG NÚT NỀN TẢNG</p><h2>Môn có nhiều môn phụ thuộc</h2></div><button className="text-link" onClick={() => go('courses')}>Xem tất cả<ArrowRight size={14} /></button></div><div className="ranking-list">{stats.mostDependent.length ? stats.mostDependent.slice(0, 5).map((item, index) => <div className="ranking-row" key={item.id}><span className="ranking-index">0{index + 1}</span><div><strong>{item.name}</strong><small>{item.id}</small></div><span className="tag green">{item.count} môn</span></div>) : <p className="muted">Chưa có quan hệ tiên quyết.</p>}</div></section><section className="panel chain-panel"><p className="eyebrow">HỌC TẬP CÓ TRÌNH TỰ</p><h2>Chuỗi tiên quyết dài nhất</h2><p className="chain-number">{stats.longestChain.length}<span>liên kết</span></p><div className="chain-list">{stats.longestChain.courses.map((course, index) => <div key={`${course.id}-${index}`}><span className="chain-point" /><span><strong>{course.name}</strong><small>{course.id}</small></span></div>)}</div>{!stats.longestChain.courses.length && <p className="muted">Chưa có chuỗi tiên quyết.</p>}</section></div>
  </>;
}
