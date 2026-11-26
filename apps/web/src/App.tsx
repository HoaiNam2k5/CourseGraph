import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, BookOpen, GraduationCap, LayoutDashboard, LogOut, Menu, Network, Settings2, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
import { api, errorMessage, setCsrfToken, useResource } from './api.js';
import type { Catalog, Session } from './types.js';
import { ConnectedMark, ErrorNotice, Loading } from './components/common.js';
import LoginGraph from './components/LoginGraph.js';
import Dashboard from './pages/Dashboard.js';
import { EntitiesPage } from './pages/Entities.js';
import Recommendations from './pages/Recommendations.js';
import Users from './pages/Users.js';
import Transfers from './pages/Transfers.js';
import Settings from './pages/Settings.js';
import ConnectionStatus from './components/ConnectionStatus.js';

const Graph = lazy(() => import('./pages/Graph.js'));
const mainNav = [{ id: 'overview', title: 'Tổng quan', icon: LayoutDashboard }, { id: 'courses', title: 'Môn học', icon: BookOpen }, { id: 'graph', title: 'Mạng lưới môn học', icon: Network }, { id: 'recommendations', title: 'Gợi ý học tập', icon: Sparkles }, { id: 'students', title: 'Sinh viên', icon: GraduationCap }];
const catalogIds = ['programs', 'faculties', 'semesters', 'lecturers'];
const pageTitles: Record<string, string> = { overview: 'Tổng quan', courses: 'Môn học', graph: 'Mạng lưới môn học', recommendations: 'Gợi ý học tập', students: 'Sinh viên', programs: 'Chương trình đào tạo', faculties: 'Khoa', semesters: 'Học kỳ', lecturers: 'Giảng viên', users: 'Tài khoản & phân quyền', transfers: 'Nhập xuất dữ liệu', settings: 'Đổi mật khẩu' };

export default function App() {
  const [session, setSession] = useState<Session | null>(null); const [initializing, setInitializing] = useState(true); const [authMessage, setAuthMessage] = useState('');
  const [page, setPage] = useState(() => location.hash.slice(1) || 'overview'); const [graphCourse, setGraphCourse] = useState(''); const [sidebarOpen, setSidebarOpen] = useState(false); const [actionError, setActionError] = useState('');
  const [graphStudent, setGraphStudent] = useState('');
  const catalog = useResource<Catalog>(session ? '/catalog' : null);
  useEffect(() => {
    let active = true;
    api<Session>('/auth/me').then((value) => { if (active) { setSession(value); setCsrfToken(value.csrfToken); } }).catch(() => undefined).finally(() => { if (active) setInitializing(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const unauthorized = () => { setSession(null); setCsrfToken(''); setAuthMessage('Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.'); };
    window.addEventListener('coursegraph:unauthorized', unauthorized);
    const route = () => setPage(location.hash.slice(1) || 'overview'); window.addEventListener('hashchange', route);
    return () => { window.removeEventListener('coursegraph:unauthorized', unauthorized); window.removeEventListener('hashchange', route); };
  }, []);
  function go(id: string) { location.hash = id; setPage(id); setSidebarOpen(false); setActionError(''); window.scrollTo({ top: 0 }); }
  function openGraph(id: string, studentId = '') { setGraphCourse(id); setGraphStudent(studentId); go('graph'); }
  async function logout() { setActionError(''); try { await api('/auth/logout', { method: 'POST' }); setSession(null); setCsrfToken(''); setAuthMessage(''); } catch (cause) { setActionError(errorMessage(cause)); } }
  if (initializing) return <div className="initial-screen"><ConnectedMark /><Loading text="Đang mở không gian học tập…" /></div>;
  if (!session) return <Login message={authMessage} loggedIn={(value) => { setCsrfToken(value.csrfToken); setSession(value); setAuthMessage(''); }} />;
  const admin = session.user.role === 'ADMIN'; const entity = catalog.data?.entities.find((item) => item.slug === page);
  const renderPage = () => {
    if (page === 'overview') return <Dashboard go={go} />;
    if (page === 'graph') return <Suspense fallback={<Loading text="Đang mở bản đồ…" />}><Graph initialCourse={graphCourse} initialStudent={graphStudent} /></Suspense>;
    if (page === 'recommendations') return <Recommendations onGraph={openGraph} />;
    if (page === 'users' && admin) return <Users currentUser={session.user} />;
    if (page === 'settings') return <Settings />;
    if (catalog.loading) return <Loading text="Đang lấy danh mục…" />;
    if (catalog.error) return <ErrorNotice message={catalog.error} retry={catalog.reload} />;
    if (page === 'transfers' && admin && catalog.data) return <Transfers catalog={catalog.data} />;
    if (entity && catalog.data) return <EntitiesPage key={entity.slug} entity={entity} catalog={catalog.data} admin={admin} onGraph={openGraph} />;
    return <section className="panel unavailable"><h1>Không tìm thấy trang</h1><p>Trang không tồn tại hoặc tài khoản chưa có quyền truy cập.</p><button className="button primary" onClick={() => go('overview')}>Về tổng quan</button></section>;
  };
  return <div className="app-shell"><a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Bỏ qua điều hướng</a>{sidebarOpen && <button className="sidebar-backdrop" aria-label="Đóng điều hướng" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}><a href="#overview" className="brand" aria-label="CourseGraph — Tổng quan"><ConnectedMark /><span>Course<span className="brand-light">Graph</span><small>MẠNG LƯỚI HỌC TẬP</small></span></a><button className="mobile-close icon-button" onClick={() => setSidebarOpen(false)} aria-label="Đóng điều hướng"><X size={20} /></button><div className="workspace-label"><span className="workspace-dot" />Không gian đào tạo</div><nav aria-label="Điều hướng chính"><p className="nav-section-label">KHÁM PHÁ</p>{mainNav.map(({ id, title, icon: Icon }) => <button key={id} className={`nav-item${page === id ? ' selected' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => { if (id === 'graph') { setGraphCourse(''); setGraphStudent(''); } go(id); }}><Icon size={18} /><span>{title}</span>{page === id && <span className="nav-selected-dot" />}</button>)}<p className="nav-section-label">DỮ LIỆU ĐÀO TẠO</p>{catalogIds.map((id) => <button key={id} className={`nav-item secondary-nav${page === id ? ' selected' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}><span className="nav-mini-line" /><span>{pageTitles[id]}</span></button>)}{admin && <><p className="nav-section-label">QUẢN TRỊ</p><button className={`nav-item${page === 'users' ? ' selected' : ''}`} onClick={() => go('users')}><ShieldCheck size={18} />Tài khoản & phân quyền</button><button className={`nav-item${page === 'transfers' ? ' selected' : ''}`} onClick={() => go('transfers')}><Upload size={18} />Nhập xuất dữ liệu</button></>}</nav><div className="sidebar-note"><Network size={19} /><p>Kiến thức kết nối.<br /><strong>Hành trình rõ ràng.</strong></p></div><div className="sidebar-user"><div className="avatar">{(session.user.displayName || session.user.username).slice(0, 1).toLocaleUpperCase('vi')}</div><button className="user-label" onClick={() => go('settings')} title="Đổi mật khẩu"><strong>{session.user.displayName || session.user.username}</strong><span>{admin ? 'Quản trị viên' : 'Người xem'}</span></button><button className="icon-button" onClick={() => { void logout(); }} aria-label="Đăng xuất" title="Đăng xuất"><LogOut size={18} /></button></div></aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button menu-button" aria-label="Mở điều hướng" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><span>Không gian đào tạo</span><span className="breadcrumb-slash">/</span><strong>{pageTitles[page] ?? 'CourseGraph'}</strong></div><div className="topbar-actions"><ConnectionStatus admin={admin} /><button className="icon-button" aria-label="Cài đặt tài khoản" onClick={() => go('settings')}><Settings2 size={18} /></button></div></header>
      <main id="main-content" className="main-content" tabIndex={-1}>
        {actionError && <ErrorNotice message={actionError} />}
        <div key={page} className="page-stage">{renderPage()}</div>
        <footer className="main-footer"><span>CourseGraph · Khám phá cách kiến thức kết nối</span><span>Đồ án NoSQL / 2026</span></footer>
      </main>
    </div>
  </div>;
}

function Login({ message, loggedIn }: { message: string; loggedIn: (session: Session) => void }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { loggedIn(await api<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } }
  return <main className="login-page">
    <section className="login-story">
      <a className="brand" href="#"><ConnectedMark /><span>Course<span className="brand-light">Graph</span><small>MẠNG LƯỚI HỌC TẬP</small></span></a>
      <div className="login-story-content">
        <p className="eyebrow">HIỂU KẾT NỐI. CHỌN ĐÚNG LỘ TRÌNH.</p>
        <h1>
          <span className="login-headline-line">Kiến thức không</span>{' '}
          <span className="login-headline-line">đứng một mình.</span>
        </h1>
        <p>Mỗi môn học mở ra những khả năng mới.<br />Kết nối chúng để nhìn thấy hành trình phía trước.</p>
      </div>
    </section>
    <section className="login-form-side" aria-labelledby="login-title">
      <div className="login-form-wrap">
        <h2 id="login-title">Chào mừng trở lại.</h2>
        <p className="login-intro">Đăng nhập để khám phá mạng lưới học tập.</p>
        {message && <div className="notice info" role="status">{message}</div>}
        <form onSubmit={(event) => { void submit(event); }}>
          <label className="field"><span>Tên đăng nhập</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Nhập tên đăng nhập" required autoFocus /></label>
          <label className="field"><span>Mật khẩu</span><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nhập mật khẩu" required /></label>
          <label className="checkbox-row"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />Hiện mật khẩu</label>
          {error && <ErrorNotice message={error} />}
          <button className="button primary login-submit" type="submit" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Vào không gian học tập'}<ArrowRight size={18} /></button>
        </form>
        <p className="login-help">Sử dụng tài khoản do quản trị viên cấp. Nếu chưa có tài khoản, liên hệ người quản trị hệ thống.</p>
      </div>
      <div className="login-form-footer"><span>CourseGraph / 2026</span><span>Dữ liệu kết nối. Lựa chọn sáng rõ.</span></div>
    </section>
    <div className="login-graph-side"><LoginGraph /></div>
  </main>;
}
