import * as React from 'react';
import { Page, Button, Input, Alert, Skeleton, ErrorState, EmptyState } from '../../componentes/ui';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { useSession } from '../../contextos/SessionContext';
import { apiUsuariosService, type AdminUser, type ProfitSyncResult } from '../../servicios/api/api-usuarios-service';
import { apiRolesService, type AdminRole } from '../../servicios/api/api-roles-service';
import { getRoleLabel, getRoleDescription } from '../../utilidades/presentacion';
import { UserAdminModal } from './UserAdminModal';
import { BulkAssignModal } from './BulkAssignModal';
import { RoleAdminModal } from './RoleAdminModal';
import { OrganizacionSection } from './OrganizacionSection';
import type { Company, Department, Role } from '../../tipos';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="card p16">
    <h3 className="h1" style={{ fontSize: 16 }}>{title}</h3>
    <div style={{ marginTop: 8 }}>{children}</div>
  </div>
);

function uniq(values: (string | null | undefined)[]): string {
  const out = Array.from(new Set(values.filter((v): v is string => !!v)));
  return out.length ? out.join(', ') : '—';
}

/** Sección Usuarios: datos reales de GET /usuarios + sync Profit. Solo ADMIN.MANAGE. */
const UsuariosSection: React.FC<{ empresas: Company[]; departamentos: Department[]; roles: Role[] }> = ({ empresas, departamentos, roles }) => {
  const { hasPermission } = useSession();
  const [text, setText] = React.useState('');
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [totals, setTotals] = React.useState({ total: 0, filteredTotal: 0, activeTotal: 0, inactiveTotal: 0 });
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(25);
  const [adminId, setAdminId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<ProfitSyncResult | null>(null);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const reqId = React.useRef(0);

  const canAdmin = hasPermission('ADMIN.MANAGE');

  const load = React.useCallback(async (search: string, pg: number, lim: number, my: number) => {
    try {
      const res = await apiUsuariosService.buscar(search.trim(), pg, lim);
      if (reqId.current === my) {
        setUsers(res.items);
        setTotals({ total: res.total, filteredTotal: res.filteredTotal, activeTotal: res.activeTotal, inactiveTotal: res.inactiveTotal });
        setError(null);
        // La selección solo cubre resultados visibles.
        setSelected(prev => new Set([...prev].filter(id => res.items.some(r => r.id === id))));
      }
    } catch (err: any) {
      if (reqId.current === my) {
        setUsers([]);
        setError(err?.message || 'No se pudieron cargar los usuarios.');
      }
    } finally {
      if (reqId.current === my) setLoading(false);
    }
  }, []);

  const refreshTable = React.useCallback(() => {
    const my = ++reqId.current;
    setLoading(true);
    void load(textRef.current, pageRef.current, limitRef.current, my);
  }, [load]);

  const textRef = React.useRef('');
  const pageRef = React.useRef(1);
  const limitRef = React.useRef(25);
  React.useEffect(() => { textRef.current = text; }, [text]);
  React.useEffect(() => { pageRef.current = page; }, [page]);
  React.useEffect(() => { limitRef.current = limit; }, [limit]);

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected(prev => {
      const all = users.every(u => prev.has(u.id)) && users.length > 0;
      return all ? new Set() : new Set(users.map(u => u.id));
    });
  };

  const selectedUsers = users.filter(u => selected.has(u.id));

  // Búsqueda server-side con debounce; descarta respuestas viejas.
  // La búsqueda reinicia a la página 1 sin alterar los totales globales.
  React.useEffect(() => {
    if (!canAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setPage(1);
    const my = ++reqId.current;
    const t = setTimeout(() => { void load(text, 1, limitRef.current, my); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, canAdmin, load]);

  const goPage = (pg: number) => {
    setPage(pg);
    setLoading(true);
    const my = ++reqId.current;
    void load(textRef.current, pg, limitRef.current, my);
  };

  const changeLimit = (lim: number) => {
    setLimit(lim);
    setPage(1);
    setLoading(true);
    const my = ++reqId.current;
    void load(textRef.current, 1, lim, my);
  };

  const totalPages = Math.max(Math.ceil(totals.filteredTotal / limit), 1);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const res = await apiUsuariosService.sincronizarProfit();
      setSyncResult(res);
      // Refrescar tabla tras sincronización exitosa.
      const my = ++reqId.current;
      await load(textRef.current, pageRef.current, limitRef.current, my);
    } catch (err: any) {
      setSyncError(err?.message || 'No se pudo sincronizar con Profit.');
    } finally {
      setSyncing(false);
    }
  };

  if (!canAdmin) {
    return (
      <Section title="Personas y acceso">
        <p className="muted">Sin permiso para administrar usuarios. Se requiere ADMIN.MANAGE.</p>
      </Section>
    );
  }

  return (
    <Section title="Personas y acceso">
      <div className="stack-sm">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Buscar usuario..."
            autoComplete="off"
            disabled={syncing}
            aria-label="Buscar usuario"
          />
          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? 'Sincronizando...' : 'Sincronizar usuarios desde Profit'}
          </Button>
        </div>
        {!loading && !error && (
          <div className="summary-strip" aria-label="Resumen de usuarios">
            <div className="summary-item"><div className="summary-num">{totals.total}</div><div className="summary-label">Total usuarios</div></div>
            <div className="summary-item"><div className="summary-num">{totals.activeTotal}</div><div className="summary-label">Activos</div></div>
            <div className="summary-item"><div className="summary-num">{totals.inactiveTotal}</div><div className="summary-label">Inactivos</div></div>
          </div>
        )}
        {!loading && !error && (text.trim() || totals.filteredTotal !== totals.total) && (
          <p className="muted small" role="status">Mostrando {users.length} de {totals.filteredTotal} resultados (total global: {totals.total} usuarios).</p>
        )}
        {syncResult && (
          <Alert tone="success">
            Sincronización completada — Creados: {syncResult.created} · Actualizados: {syncResult.updated} · Ausentes/inactivados: {syncResult.missing} · Errores: {syncResult.errors}
          </Alert>
        )}
        {syncError && (
          <Alert tone="danger">{syncError}</Alert>
        )}
        {loading && (
          <div className="stack-sm" aria-label="Cargando usuarios">
            <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} />
          </div>
        )}
        {!loading && error && (
          <ErrorState title="No pudimos cargar los usuarios." onRetry={refreshTable} />
        )}
        {!loading && !error && users.length === 0 && (
          <EmptyState title="Sin usuarios" desc="No se encontraron usuarios con los filtros actuales." />
        )}
        {!loading && !error && users.length > 0 && (
          <div className="card table-responsive">
          <table className="table">
            <thead><tr><th><input type="checkbox" checked={users.length > 0 && users.every(u => selected.has(u.id))} onChange={toggleAllVisible} aria-label="Seleccionar todos" /></th><th>Nombre</th><th>Código Profit</th><th>Organización</th><th>Estado</th><th>Rol</th><th>Acción</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={selected.has(u.id) ? 'row-selected' : ''}>
                  <td><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} aria-label={`Seleccionar ${u.displayName}`} /></td>
                  <td data-label="Nombre" className="cell-primary">{u.displayName}<br /><span className="cell-secondary">{u.username}</span></td>
                  <td data-label="Código Profit">{u.profitCode || '—'}</td>
                  <td data-label="Organización" className="cell-secondary">{uniq(u.userRoles.map(m => m.company?.code || m.company?.name))}{uniq(u.userRoles.map(m => m.department?.code || m.department?.name)) !== '—' ? ` / ${uniq(u.userRoles.map(m => m.department?.code || m.department?.name))}` : ''}</td>
                  <td data-label="Estado"><span className={`badge ${u.active ? 'badge-green' : 'badge-yellow'}`}>{u.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td data-label="Rol">{uniq(u.userRoles.map(m => (m.role ? getRoleLabel(m.role.code, m.role.name) : null)))}</td>
                  <td data-label="Acción"><Button size="sm" variant="secondary" onClick={() => setAdminId(u.id)}>Administrar</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {!loading && !error && totals.filteredTotal > 0 && (
          <div className="pager" role="navigation" aria-label="Paginación de usuarios">
            <label className="muted small">Por página
              <select className="input" value={limit} onChange={e => changeLimit(Number(e.target.value))} aria-label="Usuarios por página" style={{ width: 'auto', marginLeft: 6 }}>
                {[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <span className="muted small">Página {page} de {totalPages}</span>
            <Button size="sm" variant="secondary" onClick={() => goPage(page - 1)} disabled={page <= 1}>Anterior</Button>
            <Button size="sm" variant="secondary" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>Siguiente</Button>
          </div>
        )}
        {selected.size > 0 && (
          <div className="selection-bar" role="toolbar" aria-label="Acciones masivas">
            <span><strong>{selected.size}</strong> usuario{selected.size === 1 ? '' : 's'} seleccionado{selected.size === 1 ? '' : 's'}</span>
            <Button variant="secondary" onClick={() => setBulkOpen(true)}>Asignar rol</Button>
          </div>
        )}
        {adminId && (
          <UserAdminModal
            userId={adminId}
            empresas={empresas}
            departamentos={departamentos}
            roles={roles}
            onClose={() => setAdminId(null)}
            onChanged={refreshTable}
          />
        )}
        {bulkOpen && selectedUsers.length > 0 && (
          <BulkAssignModal
            users={selectedUsers}
            empresas={empresas}
            departamentos={departamentos}
            onClose={() => setBulkOpen(false)}
            onChanged={refreshTable}
          />
        )}
      </div>
    </Section>
  );
};

/** 10I — Sección Roles: datos reales de GET /roles. Solo ADMIN.MANAGE. */
const RolesSection: React.FC = () => {
  const { hasPermission } = useSession();
  const [roles, setRoles] = React.useState<AdminRole[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [adminCode, setAdminCode] = React.useState<string | null>(null);

  const canAdmin = hasPermission('ADMIN.MANAGE');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRoles(await apiRolesService.listar());
    } catch (err: any) {
      setRoles([]);
      setError(err?.message || 'No se pudieron cargar los roles.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!canAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [canAdmin, load]);

  if (!canAdmin) {
    return (
      <Section title="Roles y Permisos">
        <p className="muted">Sin permiso para administrar roles. Se requiere ADMIN.MANAGE.</p>
      </Section>
    );
  }

  return (
    <Section title="Roles y Permisos">
      <div className="stack-sm">
        {loading && (
          <div className="stack-sm" aria-label="Cargando roles">
            <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} />
          </div>
        )}
        {!loading && error && (
          <ErrorState title="No pudimos cargar los roles." onRetry={() => void load()} />
        )}
        {!loading && !error && roles.length === 0 && <EmptyState title="Sin roles" desc="No se encontraron roles en el sistema." />}
        {!loading && !error && roles.length > 0 && (
          <div className="card table-responsive">
          <table className="table">
            <thead><tr><th>Rol</th><th>Descripción</th><th>Usuarios</th><th>Permisos</th><th>Acciones</th></tr></thead>
            <tbody>
              {roles.map(r => (
                <tr key={r.code}>
                  <td data-label="Rol"><strong>{getRoleLabel(r.code, r.name)}</strong></td>
                  <td data-label="Descripción" className="muted small">{getRoleDescription(r.code) ?? r.description ?? '—'}</td>
                  <td data-label="Usuarios">{r.userCount} usuario{r.userCount === 1 ? '' : 's'}</td>
                  <td data-label="Permisos">{r.permissionCount} permiso{r.permissionCount === 1 ? '' : 's'}</td>
                  <td data-label="Acciones"><Button size="sm" variant="secondary" onClick={() => setAdminCode(r.code)}>Administrar</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {adminCode && (
          <RoleAdminModal roleCode={adminCode} onClose={() => setAdminCode(null)} onChanged={() => void load()} />
        )}
      </div>
    </Section>
  );
};
export type AdminSection = 'personas' | 'organizacion' | 'roles';

export const AdminPage: React.FC<{ section?: AdminSection }> = ({ section = 'personas' }) => {
  const { empresas, departamentos, usuarios, roles: rolesData } = useOrganizacion();
  const reloadOrg = () => {
    // useOrganizacion carga una vez; las secciones refrescan su estado local.
  };

  if (section === 'organizacion') {
    return (
      <OrganizacionSection empresas={empresas} departamentos={departamentos} usuarios={usuarios} onChanged={reloadOrg} />
    );
  }

  if (section === 'roles') {
    return (
      <Page title="Roles y permisos" desc="Roles del sistema con su descripción funcional y permisos.">
        <RolesSection />
      </Page>
    );
  }

  return (
    <Page title="Personas y acceso" desc="Personas, empresa, departamento, roles, permisos y acceso.">
      <UsuariosSection empresas={empresas} departamentos={departamentos} roles={rolesData} />
    </Page>
  );
};
