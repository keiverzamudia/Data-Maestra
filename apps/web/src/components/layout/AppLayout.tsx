import * as React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useSession } from '../../contexts/SessionContext';
import { useCompany } from '../../contexts/CompanyContext';
import { notificationService } from '../../services';
import { UserSwitcher } from '../ui/UserSwitcher';

const allNav = [
  { key: 'dashboard', to: '/', label: 'Dashboard', icon: '◧', permission: 'DASHBOARD.VIEW' },
  { key: 'requester', to: '/requester', label: 'Solicitante', icon: '◻', permission: 'REQUEST.CREATE' },
  { key: 'approvals', to: '/approvals', label: 'Aprobaciones', icon: '✔', permission: 'MANAGER.APPROVE' },
  { key: 'warehouse', to: '/warehouse', label: 'Clasificación', icon: '▭', permission: 'WAREHOUSE.CLASSIFY' },
  { key: 'accounting', to: '/accounting', label: 'Contabilidad', icon: '✓', permission: 'ACCOUNTING.APPROVE' },
  { key: 'imports', to: '/imports', label: 'Importaciones', icon: '↻', permission: 'IMPORT.RUN' },
  { key: 'audit', to: '/audit', label: 'Auditoría', icon: '≡', permission: 'AUDIT.VIEW' },
  { key: 'administration', to: '/admin', label: 'Administración', icon: '⚙', permission: 'ADMIN.MANAGE' },
];

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = React.useState(false);
  const [showNotif, setShowNotif] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const { companyId, setCompanyId, companies } = useCompany();
  const { session, hasPermission } = useSession();
  const navigate = useNavigate();
  const [notifs, setNotifs] = React.useState<any[]>([]);
  const [unread, setUnread] = React.useState(0);

  React.useEffect(() => {
    notificationService.list().then(setNotifs);
    notificationService.unreadCount().then(setUnread);
  }, []);

  const nav = allNav.filter(n => hasPermission(n.permission));

  const initials = session.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="layout">
      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-head">
          <span className="logo">{collapsed ? 'MD' : 'Master Data'}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setCollapsed(v => !v)}>{collapsed ? '»' : '«'}</button>
        </div>
        <nav className="nav">
          {nav.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}>
              <span className="nav-icon">{n.icon}</span>
              {!collapsed && <span>{n.label}</span>}
            </NavLink>
          ))}
        </nav>
        {!collapsed && (
          <div className="sidebar-footer">
            <div className="sidebar-user">
              <span className="avatar">{initials}</span>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{session.name}</div>
                <div className="sidebar-user-dept">{session.department.name}</div>
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
              {!collapsed && <span>{session.name}</span>}
            </div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
      <UserSwitcher />
    </div>
  );
};
