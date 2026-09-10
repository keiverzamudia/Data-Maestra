import * as React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';
import { useNotifications, timeAgo } from '../../hooks/useNotifications';
import { getRoleLabel } from '../../utilidades/presentacion';
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

/** 11E — Menú de usuario: identidad, contexto y cierre de sesión. */
const UserMenu: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { user, roleCodes } = useSession();
  const [open, setOpen] = React.useState(false);
  const initials = (user?.displayName ?? '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="user-menu" onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
      <button className="user-chip" onClick={() => setOpen(v => !v)} aria-haspopup="true" aria-expanded={open} aria-label="Menú de usuario">
        <span className="avatar">{initials}</span>
        <span className="user-menu-name">{user?.displayName ?? '—'}</span>
        <span aria-hidden="true" className="muted small">▾</span>
      </button>
      {open && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-head">
            <span className="avatar">{initials}</span>
            <div>
              <div><strong>{user?.displayName ?? '—'}</strong></div>
              {roleCodes.length > 0 && <div className="muted small">{roleCodes.map(c => getRoleLabel(c)).join(' · ')}</div>}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm user-menu-logout" role="menuitem" onClick={() => { setOpen(false); onLogout(); }}>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
};

/** 11F — Campana de notificaciones (SVG propio; sin emojis como icono). */
const BellIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

/** 12F — Campana en tiempo real (SSE + reconciliación, sin polling). */
const NotifBell: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const { notifs, unread, loading, error, toast, dismissToast, markOne, markAll } = useNotifications();

  const openNotif = async (id: string, link?: string) => {
    const dest = await markOne(id, link);
    if (dest) {
      setOpen(false);
      navigate(dest);
    }
  };

  return (
    <>
      <button className="btn btn-ghost notif-btn" onClick={() => setOpen(v => !v)} aria-label="Notificaciones" aria-expanded={open}>
        <BellIcon />{unread > 0 && <span className="notif-badge">{unread}</span>}
      </button>
      {toast && !open && (
        <div className="notif-toast" role="status">
          <div className="notif-title">{toast.title}</div>
          <div className="muted small">{toast.body}</div>
          <div className="notif-actions">
            {toast.link && <button className="btn btn-ghost btn-sm" onClick={() => { dismissToast(); setOpen(false); navigate(toast.link!); }}>Ver</button>}
            <button className="btn btn-ghost btn-sm" onClick={dismissToast} aria-label="Descartar aviso">✕</button>
          </div>
        </div>
      )}
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notificaciones">
          <div className="notif-head">
            <strong>Notificaciones{unread > 0 ? ` (${unread} sin leer)` : ''}</strong>
            <div style={{ display: 'flex', gap: 4 }}>
              {unread > 0 && <button className="btn btn-ghost btn-sm" onClick={() => void markAll()}>Marcar todas</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Cerrar notificaciones">✕</button>
            </div>
          </div>
          {loading && <div className="muted small" style={{ padding: 12 }}>Cargando…</div>}
          {!loading && error && <div className="muted small" style={{ padding: 12 }}>{error}</div>}
          {!loading && !error && notifs.length === 0 && <div className="muted small" style={{ padding: 12 }}>Sin notificaciones.</div>}
          {!loading && !error && notifs.slice(0, 20).map(n => (
            <div key={n.id} className={`notif-item ${n.readAt ? '' : 'notif-unread'}`}>
              <div className="notif-title">{!n.readAt && <span aria-hidden="true">🔵 </span>}{n.title}</div>
              <div className="muted small">{n.body}</div>
              <div className="muted small notif-meta">
                <span>{timeAgo(n.createdAt)}</span>
              </div>
              <div className="notif-actions">
                {!n.readAt && <button className="btn btn-ghost btn-sm" onClick={() => void openNotif(n.id)}>Marcar leída</button>}
                {n.link && <button className="btn btn-ghost btn-sm" onClick={() => void openNotif(n.id, n.link)}>Ver solicitud</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

const GROUP_LABEL: Record<string, string> = { operate: 'Operación', admin: 'Administración' };

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const { companyId, setCompanyId, companies } = useCompany();
  const { logout, hasPermission } = useSession();
  const navigate = useNavigate();

  const nav = visibleNav(hasPermission);
  const operate = nav.filter(n => n.key !== 'admin');
  const admin = nav.filter(n => n.key === 'admin');

  const renderEntry = (n: (typeof nav)[number]) => n.children ? (
    <div key={n.key} className="nav-group">
      {!collapsed && <div className="nav-section">{n.label}</div>}
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
  );

  return (
    <div className="layout">
      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">DM</span>
          {!collapsed && (
            <span className="brand-text">
              <span className="logo">Data-Maestra</span>
              <span className="brand-sub">Master Data Management</span>
            </span>
          )}
          <button className="btn btn-ghost btn-sm brand-toggle" onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? 'Expandir navegación' : 'Colapsar navegación'}>{collapsed ? '»' : '«'}</button>
        </div>
        <nav className="nav" aria-label="Navegación principal">
          {nav.length === 0 && !collapsed && (
            <div className="muted small" style={{ padding: 8 }}>Sin módulos disponibles</div>
          )}
          {operate.length > 0 && (
            <>
              {!collapsed && <div className="nav-section">{GROUP_LABEL.operate}</div>}
              {operate.map(renderEntry)}
            </>
          )}
          {admin.length > 0 && (
            <>
              {!collapsed && <div className="nav-section">{GROUP_LABEL.admin}</div>}
              {admin.map(renderEntry)}
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          {!collapsed && <div className="muted small sidebar-foot-note">Master Data Management</div>}
        </div>
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
              aria-label="Búsqueda global"
            />
          </div>
          <div className="header-right">
            <label className="header-company">
              <span className="muted small">Empresa</span>
              <select className="input" value={companyId} onChange={e => setCompanyId(e.target.value)} aria-label="Empresa">
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <NotifBell />
            <UserMenu onLogout={() => logout()} />
          </div>
        </header>
        <main className="content"><div className="page-container"><Breadcrumb />{children}</div></main>
      </div>
    </div>
  );
};
