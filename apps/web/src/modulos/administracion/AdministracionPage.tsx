import * as React from 'react';
import { Page, Button, Input, Alert, Skeleton, ErrorState, EmptyState, SectionCard, DataTable, Pagination, type DataColumn } from '../../componentes/ui';
import { HelpButton } from '../../componentes/ayuda';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { useSession } from '../../contextos/SessionContext';
import { apiUsuariosService, type AdminUser, type ProfitSyncResult } from '../../servicios/api/api-usuarios-service';
import { apiRolesService, type AdminRole } from '../../servicios/api/api-roles-service';
import { getRoleLabel, getRoleDescription } from '../../utilidades/presentacion';
import { UserAdminModal } from './UserAdminModal';
import { BulkAssignModal } from './BulkAssignModal';
import { RoleAdminModal } from './RoleAdminModal';
import { OrganizacionSection } from './OrganizacionSection';
import { CatalogosProfitAdmin } from './CatalogosProfitAdmin';
import { ProfitCompaniesAdmin } from './ProfitCompaniesAdmin';
import { AuditoriaHistorica } from './AuditoriaHistorica';
import type { Company, Department, Role } from '../../tipos';

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

  const allVisibleSelected = users.length > 0 && users.every(u => selected.has(u.id));

  const userColumns: DataColumn<AdminUser>[] = [
    { key: 'sel', header: '', label: 'Seleccionar', render: u => (
      <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} aria-label={`Seleccionar ${u.displayName}`} />
    ) },
    { key: 'nom', header: 'Nombre', label: 'Nombre', render: u => <>{u.displayName}<br /><span className="cell-secondary">{u.username}</span></> },
    { key: 'pc', header: 'Código Profit', label: 'Código Profit', render: u => u.profitCode || '—' },
    { key: 'org', header: 'Organización', label: 'Organización', render: u => <span className="cell-secondary">{uniq(u.userRoles.map(m => m.company?.code || m.company?.name))}{uniq(u.userRoles.map(m => m.department?.code || m.department?.name)) !== '—' ? ` / ${uniq(u.userRoles.map(m => m.department?.code || m.department?.name))}` : ''}</span> },
    { key: 'est', header: 'Estado', label: 'Estado', render: u => <span className={`badge ${u.active ? 'badge-green' : 'badge-yellow'}`}>{u.active ? 'Activo' : 'Inactivo'}</span> },
    { key: 'rol', header: 'Rol', label: 'Rol', render: u => <>{uniq(u.userRoles.map(m => (m.role ? getRoleLabel(m.role.code, m.role.name) : null)))}</> },
    { key: 'acc', header: 'Acción', label: 'Acción', render: u => <Button size="sm" variant="secondary" onClick={() => setAdminId(u.id)}>Administrar</Button> },
  ];

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
      <SectionCard title="Personas y acceso">
        <p className="muted">Sin permiso para administrar usuarios. Se requiere ADMIN.MANAGE.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Personas y acceso">
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
          <>
            <label className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Seleccionar visibles" />
              Seleccionar visibles ({users.length})
            </label>
            <DataTable<AdminUser>
              columns={userColumns}
              rows={users}
              rowKey={u => u.id}
              caption={`Mostrando ${users.length} de ${totals.filteredTotal} resultados (total global: ${totals.total} usuarios).`}
            />
          </>
        )}
        {!loading && !error && totals.filteredTotal > 0 && (
          <Pagination page={page} totalPages={totalPages} total={totals.filteredTotal} pageSize={limit} onPage={goPage} onPageSize={changeLimit} />
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
    </SectionCard>
  );
};

/** 10I — Sección Roles: datos reales de GET /roles. Solo ADMIN.MANAGE. */
const roleColumns = (onAdmin: (code: string) => void): DataColumn<AdminRole>[] => [
  { key: 'rol', header: 'Rol', label: 'Rol', render: r => <strong>{getRoleLabel(r.code, r.name)}</strong> },
  { key: 'desc', header: 'Descripción', label: 'Descripción', render: r => <span className="muted small">{getRoleDescription(r.code) ?? r.description ?? '—'}</span> },
  { key: 'usr', header: 'Usuarios', label: 'Usuarios', render: r => <>{r.userCount} usuario{r.userCount === 1 ? '' : 's'}</> },
  { key: 'per', header: 'Permisos', label: 'Permisos', render: r => <>{r.permissionCount} permiso{r.permissionCount === 1 ? '' : 's'}</> },
  { key: 'acc', header: 'Acciones', label: 'Acciones', render: r => <Button size="sm" variant="secondary" onClick={() => onAdmin(r.code)}>Administrar</Button> },
];

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
      <SectionCard title="Roles y Permisos">
        <p className="muted">Sin permiso para administrar roles. Se requiere ADMIN.MANAGE.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Roles y Permisos" desc="Roles del sistema con su descripción funcional y permisos.">
      {adminCode ? (
        <RoleAdminModal roleCode={adminCode} onClose={() => setAdminCode(null)} onChanged={() => void load()} />
      ) : (
      <div className="stack-sm">
        {loading && (
          <div className="stack-sm" aria-label="Cargando roles">
            <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} />
          </div>
        )}
        {!loading && error && (
          <ErrorState title="No pudimos cargar los roles." onRetry={() => void load()} />
        )}
        {!loading && !error && (
          <DataTable
            columns={roleColumns(setAdminCode)}
            rows={roles}
            rowKey={r => r.code}
            emptyTitle="Sin roles"
            emptyDesc="No se encontraron roles en el sistema."
            caption="Roles del sistema. Use Administrar para ver permisos y usuarios."
          />
        )}
      </div>
      )}
    </SectionCard>
  );
};
export type AdminSection = 'personas' | 'organizacion' | 'roles' | 'catalogos' | 'empresas' | 'historico';

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
      <Page title="Roles y permisos" desc="Roles del sistema con su descripción funcional y permisos." actions={<HelpButton helpKey="roles" />}>
        <RolesSection />
      </Page>
    );
  }

  if (section === 'catalogos') {
    return <CatalogosProfitAdmin />;
  }

  if (section === 'empresas') {
    return <ProfitCompaniesAdmin />;
  }

  if (section === 'historico') {
    return <AuditoriaHistorica />;
  }

  return (
    <Page title="Personas y acceso" desc="Personas, empresa, departamento, roles, permisos y acceso." actions={<HelpButton helpKey="personas" />}>
      <UsuariosSection empresas={empresas} departamentos={departamentos} roles={rolesData} />
    </Page>
  );
};
