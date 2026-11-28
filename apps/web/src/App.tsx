import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, BookOpen, GraduationCap, LayoutDashboard, LogOut, Menu, Network, Settings2, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
import { api, errorMessage, setCsrfToken, useResource } from './api.js';
import type { Catalog, Session } from './types.js';
import { ConnectedMark, ErrorNotice, Loading } from './components/common.js';
import TrainingGraph from './components/TrainingGraph.js';
import Dashboard from './pages/Dashboard.js';
import { EntitiesPage } from './pages/Entities.js';
import Recommendations from './pages/Recommendations.js';
import Users from './pages/Users.js';
import Relationships from './pages/Relationships.js';
import Transfers from './pages/Transfers.js';
import Settings from './pages/Settings.js';
import ConnectionStatus from './components/ConnectionStatus.js';

const NetworkPage = lazy(() => import('./pages/NetworkPage.js'));
const mainNav = [{ id: 'overview', title: 'Tổng quan', icon: LayoutDashboard }, { id: 'courses', title: 'Môn học', icon: BookOpen }, { id: 'graph', title: 'Mạng lưới', icon: Network }, { id: 'recommendations', title: 'Gợi ý học tập', icon: Sparkles }, { id: 'students', title: 'Sinh viên', icon: GraduationCap }];
const catalogIds = ['relationships', 'programs', 'faculties', 'semesters', 'lecturers'];
const adminPages = new Set(['users', 'transfers']);
const pageTitles: Record<string, string> = { overview: 'Tổng quan', relationships: 'Liên kết dữ liệu', courses: 'Môn học', graph: 'Mạng lưới', recommendations: 'Gợi ý học tập', students: 'Sinh viên', programs: 'Chương trình đào tạo', faculties: 'Khoa', semesters: 'Học kỳ', lecturers: 'Giảng viên', users: 'Tài khoản & phân quyền', transfers: 'Nhập xuất dữ liệu', settings: 'Đổi mật khẩu' };

function graphRoute(course: string, student: string, depth = '2') {
  const params = new URLSearchParams();
  if (course) params.set('course', course);
  if (student) params.set('student', student);
  if (depth !== '2') params.set('depth', depth);
  return params.size ? 'graph?' + params : 'graph';
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null); const [initializing, setInitializing] = useState(true); const [authMessage, setAuthMessage] = useState('');
  const [requestedRoute, setRequestedRoute] = useState(() => location.hash.slice(1) || 'overview');
  const [requestedPage, routeQuery] = requestedRoute.split('?', 2);
  const graphParams = new URLSearchParams(requestedPage === 'graph' ? routeQuery : '');
  const depth = graphParams.get('depth') ?? '';
  const [sidebarOpen, setSidebarOpen] = useState(false); const [actionError, setActionError] = useState('');
  const page = session?.user.role === 'VIEWER' && adminPages.has(requestedPage) ? 'overview' : requestedPage;
  const catalog = useResource<Catalog>(session ? '/catalog' : null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const menuClose = useRef<HTMLButtonElement>(null);
  const previousSidebarOpen = useRef(false);
  useLayoutEffect(() => {
    if (sidebarOpen) menuClose.current?.focus({ preventScroll: true });
    else if (previousSidebarOpen.current) menuToggle.current?.focus({ preventScroll: true });
    previousSidebarOpen.current = sidebarOpen;
  }, [sidebarOpen]);
  useEffect(() => {
    if (!sidebarOpen) return;
    const mobile = window.matchMedia('(max-width: 760px)');
    const onResize = () => { if (!mobile.matches) setSidebarOpen(false); };
    mobile.addEventListener('change', onResize);
    return () => mobile.removeEventListener('change', onResize);
  }, [sidebarOpen]);
  useEffect(() => {
    let active = true;
    api<Session>('/auth/me').then((value) => { if (active) { setSession(value); setCsrfToken(value.csrfToken); } }).catch(() => undefined).finally(() => { if (active) setInitializing(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const unauthorized = () => {
      history.replaceState(null, '', '#overview');
      setRequestedRoute('overview');
      setSession(null);
      setCsrfToken('');
      setSidebarOpen(false);
      setActionError('');
      setAuthMessage('Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.');
    };
    window.addEventListener('coursegraph:unauthorized', unauthorized);
    const route = () => setRequestedRoute(location.hash.slice(1) || 'overview'); window.addEventListener('hashchange', route);
    return () => { window.removeEventListener('coursegraph:unauthorized', unauthorized); window.removeEventListener('hashchange', route); };
  }, []);
  useEffect(() => {
    if (page === requestedPage) return;
    history.replaceState(null, '', '#overview');
    setRequestedRoute('overview');
    setSidebarOpen(false);
    window.scrollTo({ top: 0 });
  }, [page, requestedPage]);
  function go(id: string) { location.hash = id; setRequestedRoute(id); setSidebarOpen(false); setActionError(''); window.scrollTo({ top: 0 }); }
  function openGraph(id: string, studentId = '') { go(graphRoute(id, studentId)); }
  function changeGraphContext(course: string, student: string, graphDepth: string) {
    const next = graphRoute(course, student, graphDepth);
    history.replaceState(history.state, '', '#' + next);
    setRequestedRoute(next);
  }
  async function logout() {
    setActionError('');
    try {
      await api('/auth/logout', { method: 'POST' });
      history.replaceState(null, '', '#overview');
      setRequestedRoute('overview');
      setSidebarOpen(false);
      setSession(null);
      setCsrfToken('');
      setAuthMessage('');
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }
  if (initializing) return <div className="initial-screen"><ConnectedMark /><Loading text="Đang mở không gian học tập…" /></div>;
  if (!session) return <Login message={authMessage} loggedIn={(value) => { setCsrfToken(value.csrfToken); setSession(value); setAuthMessage(''); }} />;
  const admin = session.user.role === 'ADMIN'; const entity = catalog.data?.entities.find((item) => item.slug === page);
  const renderPage = () => {
    if (page === 'overview') return <Dashboard go={go} />;
    if (page === 'graph') return <Suspense fallback={<Loading text="Đang mở bản đồ…" />}><NetworkPage
      course={graphParams.get('course') ?? ''} student={graphParams.get('student') ?? ''}
      depth={/^[1-4]$/.test(depth) ? depth : '2'} onContextChange={changeGraphContext} /></Suspense>;
    if (page === 'recommendations') return <Recommendations accountId={session.user.id} onGraph={openGraph} />;
    if (page === 'users' && admin) return <Users currentUser={session.user} onDisplayNameChange={(displayName) => setSession((current) => current?.user.id === session.user.id ? { ...current, user: { ...current.user, displayName } } : current)} />;
    if (page === 'settings') return <Settings />;
    if (catalog.loading) return <Loading text="Đang lấy danh mục…" />;
    if (catalog.error) return <ErrorNotice message={catalog.error} retry={catalog.reload} />;
    if (page === 'relationships' && catalog.data) return <Relationships catalog={catalog.data} admin={admin} />;
    if (page === 'transfers' && admin && catalog.data) return <Transfers catalog={catalog.data} />;
    if (entity && catalog.data) return <EntitiesPage key={entity.slug} entity={entity} catalog={catalog.data} admin={admin} onGraph={openGraph} />;
    return <section className="panel unavailable"><h1>Không tìm thấy trang</h1><p>Trang không tồn tại hoặc tài khoản chưa có quyền truy cập.</p><button className="button primary" onClick={() => go('overview')}>Về tổng quan</button></section>;
  };
  return <div className="app-shell"><a className="skip-link" inert={sidebarOpen} href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Bỏ qua điều hướng</a>{sidebarOpen && <button className="sidebar-backdrop" aria-hidden="true" tabIndex={-1} onClick={() => setSidebarOpen(false)} />}
    <aside id="primary-sidebar" className={`sidebar${sidebarOpen ? ' open' : ''}`}
      role={sidebarOpen ? 'dialog' : undefined} aria-modal={sidebarOpen || undefined}
      aria-label={sidebarOpen ? 'Điều hướng' : undefined} onKeyDown={(event) => {
        if (sidebarOpen && event.key === 'Escape') { event.preventDefault(); setSidebarOpen(false); }
      }}><a href="#overview" onClick={() => setSidebarOpen(false)} className="brand" aria-label="CourseGraph — Tổng quan"><ConnectedMark /><span>Course<span className="brand-light">Graph</span><small>MẠNG LƯỚI HỌC TẬP</small></span></a><button ref={menuClose} className="mobile-close icon-button" onClick={() => setSidebarOpen(false)} aria-label="Đóng điều hướng"><X size={20} /></button><div className="workspace-label"><span className="workspace-dot" />Không gian đào tạo</div><nav aria-label="Điều hướng chính"><p className="nav-section-label">KHÁM PHÁ</p>{mainNav.map(({ id, title, icon: Icon }) => <button key={id} className={`nav-item${page === id ? ' selected' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}><Icon size={18} /><span>{title}</span>{page === id && <span className="nav-selected-dot" />}</button>)}<p className="nav-section-label">DỮ LIỆU ĐÀO TẠO</p>{catalogIds.map((id) => <button key={id} className={`nav-item secondary-nav${page === id ? ' selected' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}><span className="nav-mini-line" /><span>{pageTitles[id]}</span></button>)}{admin && <><p className="nav-section-label">QUẢN TRỊ</p><button className={`nav-item${page === 'users' ? ' selected' : ''}`} onClick={() => go('users')}><ShieldCheck size={18} />Tài khoản & phân quyền</button><button className={`nav-item${page === 'transfers' ? ' selected' : ''}`} onClick={() => go('transfers')}><Upload size={18} />Nhập xuất dữ liệu</button></>}</nav><p className="sidebar-note">Kết nối tri thức.</p><div className="sidebar-user"><div className="avatar">{(session.user.displayName || session.user.username).slice(0, 1).toLocaleUpperCase('vi')}</div><button className="user-label" onClick={() => go('settings')} title="Đổi mật khẩu"><strong>{session.user.displayName || session.user.username}</strong><span>{admin ? 'Quản trị viên' : 'Người xem'}</span></button><button className="icon-button" onClick={() => { void logout(); }} aria-label="Đăng xuất" title="Đăng xuất"><LogOut size={18} /></button></div></aside>
    <div className="workspace" inert={sidebarOpen}>
      <header className="topbar"><div className="breadcrumbs"><button ref={menuToggle} className="icon-button menu-button" aria-label="Mở điều hướng" aria-expanded={sidebarOpen} aria-controls="primary-sidebar" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><span>Không gian đào tạo</span><span className="breadcrumb-slash">/</span><strong>{pageTitles[page] ?? 'CourseGraph'}</strong></div><div className="topbar-actions"><ConnectionStatus admin={admin} /><button className="icon-button" aria-label="Cài đặt tài khoản" onClick={() => go('settings')}><Settings2 size={18} /></button></div></header>
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
          <span className="login-headline-line"><span className="login-headline-accent">Kiến thức</span></span>{' '}
          <span className="login-headline-line">không đứng một mình.</span>
        </h1>
        <p>Mỗi môn học mở ra những khả năng mới.<br />Kết nối chúng để nhìn thấy hành trình phía trước.</p>
      </div>
    </section>
    <section className="login-form-side" aria-labelledby="login-title">
      <div className="login-form-wrap">
        <h2 id="login-title">Chào mừng trở lại.</h2>
        {message && <div className="notice info" role="status">{message}</div>}
        <form onSubmit={(event) => { void submit(event); }}>
          <label className="field"><span>Tên đăng nhập</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Nhập tên đăng nhập" required autoFocus /></label>
          <label className="field"><span>Mật khẩu</span><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nhập mật khẩu" required /></label>
          <label className="checkbox-row"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />Hiện mật khẩu</label>
          {error && <ErrorNotice message={error} />}
          <button className="button primary login-submit" type="submit" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Vào không gian học tập'}<ArrowRight size={18} /></button>
        </form>
      </div>
      <div className="login-form-footer">CourseGraph / 2026</div>
    </section>
    <div className="login-graph-side"><TrainingGraph placement="login" /></div>
  </main>;
}
