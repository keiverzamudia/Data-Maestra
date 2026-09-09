import * as React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';
import { apiNotificacionService } from '../../servicios/api/api-notificacion-service';
import { visibleNav, NAV } from './navigation';

/** 11B — Miga de pan derivada de la navegación (solo presentación). */
const Breadcrumb: React.FC = () => {
  const { pathname } = useLocation();
  const crumbs: Array<{ label: string; to?: string }> = [{ label: 'Inicio', to: '/' }];
  for (const n of NAV) {
    if (n.to && (pathname === n.to || pathname.startsWith(n.to + '/')) && n.to !== '/') {
      crumbs.push({ label: n.label });
    }
    for (const c of n.children ?? []) {
      if (pathname === c.to || pathname.startsWith(c.to + '/')) {
        const parent = n.to ? null : n.label;
        if (parent) crumbs.push({ label: parent });
        crumbs.push({ label: c.label });
      }
    }
  }
  if (crumbs.length <= 1) return null;
  return (
    <nav className="breadcrumb" aria-label="Ubicación actual">
      {crumbs.map((c, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden="true"> / </span>}
          {c.to && i < crumbs.length - 1 ? <NavLink to={c.to}>{c.label}</NavLink> : <span className="breadcrumb-current">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
};

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = React.useState(false);
  const [showNotif, setShowNotif] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const { companyId, setCompanyId, companies } = useCompany();
  const { user, logout, hasPermission } = useSession();
  const navigate = useNavigate();
  const [notifs, setNotifs] = React.useState<any[]>([]);
  const [unread, setUnread] = React.useState(0);

  React.useEffect(() => {
    apiNotificacionService.getNotificaciones().then(setNotifs).catch(() => {});
    apiNotificacionService.getUnreadCount().then(setUnread).catch(() => {});
  }, []);

  const nav = visibleNav(hasPermission);

  const initials = (user?.displayName ?? '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="layout">
      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-head">
          <span className="logo">{collapsed ? 'MD' : 'Master Data'}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setCollapsed(v => !v)}>{collapsed ? '»' : '«'}</button>
        </div>
        <nav className="nav">
          {nav.length === 0 && !collapsed && (
            <div className="muted small" style={{ padding: 8 }}>Sin módulos disponibles</div>
          )}
          {nav.map(n => n.children ? (
            <div key={n.key} className="nav-group">
              {!collapsed && <div className="muted small" style={{ padding: '8px 8px 2px' }}>{n.label}</div>}
              {n.children.map(c => (
                <NavLink key={c.to} to={c.to} title={c.label} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}>
                  <span className="nav-icon" aria-hidden="true">{n.icon}</span>
                  {!collapsed && <span>{c.label}</span>}
                </NavLink>
              ))}
            </div>
          ) : (
            <NavLink key={n.to} to={n.to!} end={n.to === '/'} title={n.label} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}>
              <span className="nav-icon" aria-hidden="true">{n.icon}</span>
              {!collapsed && <span>{n.label}</span>}
            </NavLink>
          ))}
        </nav>
        {!collapsed && (
          <div className="sidebar-footer">
            <div className="sidebar-user">
              <span className="avatar">{initials}</span>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{user?.displayName ?? '—'}</div>
                <div className="sidebar-user-dept">
                  <button className="btn btn-ghost btn-sm" onClick={() => logout()}>Cerrar sesión</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>
      <div className="main">
        <header className="header">
          <div className="header-left">
            <input
              className="input header-search"
              placeholder="Búsqueda global (código, descripción, part number)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && search) navigate(`/warehouse?search=${encodeURIComponent(search)}`); }}
            />
          </div>
          <div className="header-right">
            <select className="input" value={companyId} onChange={e => setCompanyId(e.target.value)}>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn btn-ghost notif-btn" onClick={() => setShowNotif(v => !v)}>
              🔔 {unread > 0 && <span className="notif-badge">{unread}</span>}
            </button>
            {showNotif && (
              <div className="notif-panel">
                <div className="notif-head">
                  <strong>Notificaciones</strong>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowNotif(false)}>✕</button>
                </div>
                {notifs.map(n => (
                  <div key={n.id} className={`notif-item ${n.read ? '' : 'notif-unread'}`}>
                    <div className="notif-title">{n.title}</div>
                    <div className="muted small">{n.body}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="user-chip">
              <span className="avatar">{initials}</span>
              {!collapsed && <span>{user?.displayName ?? '—'}</span>}
            </div>
          </div>
        </header>
          <main className="content"><div className="page-container"><Breadcrumb />{children}</div></main>
      </div>
    </div>
  );
};
