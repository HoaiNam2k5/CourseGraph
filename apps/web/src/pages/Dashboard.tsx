import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, GraduationCap, Layers3, School } from 'lucide-react';
import { useResource } from '../api.js';
import type { Statistics } from '../types.js';
import { formatNumber } from '../types.js';
import { Empty, ErrorNotice, PageTitle, ProgressBar, SkeletonCards } from '../components/common.js';
import TrainingGraph from '../components/TrainingGraph.js';

export default function Dashboard({ go }: { go: (page: string) => void }) {
  const resource = useResource<Statistics>('/statistics');
  const title = <PageTitle eyebrow="KHÔNG GIAN ĐÀO TẠO" title="Nhìn thấy những kết nối." description="Khám phá môn học, chương trình đào tạo và các chuỗi tiên quyết trong mạng lưới." />;
  if (resource.error) return <>{title}<ErrorNotice message={resource.error} retry={resource.reload} /></>;
  if (resource.loading) return <>{title}<SkeletonCards layout="metrics" text="Đang tổng hợp mạng lưới…" /></>;
  const stats = resource.data;
  if (!stats) return <>{title}<Empty /></>;
  const metrics = [{ key: 'MonHoc', title: 'Môn học', icon: BookOpen, target: 'courses' }, { key: 'SinhVien', title: 'Sinh viên', icon: GraduationCap, target: 'students' }, { key: 'ChuongTrinhDaoTao', title: 'Chương trình', icon: Layers3, target: 'programs' }, { key: 'Khoa', title: 'Khoa đào tạo', icon: School, target: 'faculties' }];
  const maxFaculty = Math.max(1, ...stats.coursesByFaculty.map((item) => item.count));
  const visibleFaculties = stats.coursesByFaculty.slice(0, 6);
  return <>
    {title}
    <div className="metric-grid">{metrics.map(({ key, title, icon: Icon, target }) => <button className="metric-card" key={key} onClick={() => go(target)}><div className="metric-top"><span>{title}</span><span className="metric-icon" aria-hidden="true"><Icon size={19} /></span></div><MetricValue value={stats.counts[key] ?? 0} /><span className="metric-footer">Xem danh mục<ArrowRight size={15} /></span></button>)}</div>
    <div className="dashboard-grid">
      <section className="network-feature">
        <div className="network-feature-main">
          <div className="network-feature-intro">
            <h2>Mạng lưới đào tạo</h2>
            <p>{formatNumber(stats.relationshipCount)} liên kết giữa các bản ghi đào tạo.</p>
            <button className="button cream" onClick={() => go('graph')}>Mở mạng lưới<ArrowRight size={17} /></button>
          </div>
          <TrainingGraph placement="dashboard" />
        </div>
        <div className="feature-bottom"><span><i />Neo4j · Property Graph</span><span>{stats.relationsByType.length} loại quan hệ</span></div>
      </section>
      <section className="panel faculty-panel">
        <div className="section-heading">
          <div>
            <h2>Môn học theo khoa</h2>
            {visibleFaculties.length > 0 && <p className="faculty-coverage">Hiển thị {formatNumber(visibleFaculties.length)} trên {formatNumber(stats.coursesByFaculty.length)} khoa</p>}
          </div>
        </div>
        {visibleFaculties.length ? <div className="bar-list">{visibleFaculties.map((item) => <div className="bar-item" key={item.name}><div><span>{item.name}</span><strong>{item.count}</strong></div><ProgressBar max={maxFaculty} value={item.count} label={`${item.name}: ${item.count} môn`} /></div>)}</div> : <Empty />}
      </section>
    </div>
    <div className="dashboard-grid lower"><section className="panel"><div className="section-heading"><div><p className="eyebrow">NHỮNG NÚT NỀN TẢNG</p><h2>Môn có nhiều môn phụ thuộc</h2></div><button className="text-link" onClick={() => go('courses')}>Xem tất cả<ArrowRight size={14} /></button></div><div className="ranking-list">{stats.mostDependent.length ? stats.mostDependent.slice(0, 5).map((item, index) => <div className="ranking-row" key={item.id}><span className="ranking-index">0{index + 1}</span><div><strong>{item.name}</strong><small>{item.id}</small></div><span className="tag green">{item.count} môn</span></div>) : <p className="muted">Chưa có quan hệ tiên quyết.</p>}</div></section><section className="panel chain-panel"><p className="eyebrow">HỌC TẬP CÓ TRÌNH TỰ</p><h2>Chuỗi tiên quyết dài nhất</h2><p className="chain-number">{stats.longestChain.length}<span>liên kết</span></p><div className="chain-list">{stats.longestChain.courses.map((course, index) => <div key={`${course.id}-${index}`}><span className="chain-point" /><span><strong>{course.name}</strong><small>{course.id}</small></span></div>)}</div>{!stats.longestChain.courses.length && <p className="muted">Chưa có chuỗi tiên quyết.</p>}</section></div>
  </>;
}

function MetricValue({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? value : 0);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches || value === 0) {
      setDisplayed(value);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const finish = () => {
      cancelAnimationFrame(frame);
      setDisplayed(value);
    };
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 440);
      setDisplayed(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    preference.addEventListener('change', finish);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      preference.removeEventListener('change', finish);
    };
  }, [value]);

  return <strong><span className="sr-only">{formatNumber(value)}</span><span aria-hidden="true">{formatNumber(displayed)}</span></strong>;
}
