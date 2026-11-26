import { lazy, Suspense, useState } from 'react';
import { entityDefinitions, type EntityLabel } from '../../../../packages/shared/src/catalog.js';
import { Loading, PageTitle } from '../components/common.js';
import CourseGraph from './Graph.js';
import './graph-mobile.css';

const NetworkExplorer = lazy(() => import('./NetworkExplorer.js'));

export default function NetworkPage({ initialCourse, initialStudent }: { initialCourse: string; initialStudent: string }) {
  const [view, setView] = useState<EntityLabel | 'all'>('MonHoc');

  return <div className="network-page">
    <PageTitle eyebrow="KHÁM PHÁ ĐỒ THỊ" title="Mạng lưới"
      description={view === 'MonHoc'
        ? 'Khám phá các chuỗi tiên quyết. Mũi tên đi từ môn cần học trước đến môn học sau.'
        : 'Tìm bản ghi và xem các liên kết trong mạng lưới đào tạo.'}
      actions={<label className="field compact">
        <span>Loại mạng lưới</span>
        <select value={view} onChange={(event) => setView(event.target.value as EntityLabel | 'all')}>
          {entityDefinitions.map(({ label, title }) => <option key={label} value={label}>{title}</option>)}
          <option value="all">Toàn bộ</option>
        </select>
      </label>} />
    {view === 'MonHoc'
      ? <CourseGraph initialCourse={initialCourse} initialStudent={initialStudent} />
      : <Suspense fallback={<Loading text="Đang mở mạng lưới…" />}>
          <NetworkExplorer view={view} onViewChange={setView} />
        </Suspense>}
  </div>;
}
