import * as React from 'react';
import { Page, Button, Input, Tabs, Alert, Skeleton, ErrorState, EmptyState } from '../../componentes/ui';
import { useCatalogos } from '../../hooks/useCatalogos';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { useSession } from '../../contextos/SessionContext';
import { apiUsuariosService, type AdminUser, type ProfitSyncResult } from '../../servicios/api/api-usuarios-service';
import { apiRolesService, type AdminRole } from '../../servicios/api/api-roles-service';
import { UserAdminModal } from './UserAdminModal';
import { BulkAssignModal } from './BulkAssignModal';
import { RoleAdminModal } from './RoleAdminModal';
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

  const load = React.useCallback(async (search: string, my: number) => {
    try {
      const rows = await apiUsuariosService.buscar(search.trim());
      if (reqId.current === my) {
        setUsers(rows);
        setError(null);
        // La selección solo cubre resultados visibles.
        setSelected(prev => new Set([...prev].filter(id => rows.some(r => r.id === id))));
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
    void load(textRef.current, my);
  }, [load]);

  const textRef = React.useRef('');
  React.useEffect(() => { textRef.current = text; }, [text]);

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
  React.useEffect(() => {
    if (!canAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const my = ++reqId.current;
    const t = setTimeout(() => { void load(text, my); }, 300);
    return () => clearTimeout(t);
  }, [text, canAdmin, load]);

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
      await load(text, my);
    } catch (err: any) {
      setSyncError(err?.message || 'No se pudo sincronizar con Profit.');
    } finally {
      setSyncing(false);
    }
  };

  if (!canAdmin) {
    return (
      <Section title="Usuarios">
        <p className="muted">Sin permiso para administrar usuarios. Se requiere ADMIN.MANAGE.</p>
      </Section>
    );
  }

  return (
    <Section title="Usuarios">
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
          {selected.size > 0 && (
            <Button variant="secondary" onClick={() => setBulkOpen(true)}>
              Asignar rol ({selected.size} usuario{selected.size === 1 ? '' : 's'} seleccionado{selected.size === 1 ? '' : 's'})
            </Button>
          )}
        </div>
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
            <thead><tr><th><input type="checkbox" checked={users.length > 0 && users.every(u => selected.has(u.id))} onChange={toggleAllVisible} aria-label="Seleccionar todos" /></th><th>Nombre</th><th>Usuario</th><th>Código Profit</th><th>Empresa</th><th>Departamento</th><th>Estado</th><th>Cambio de contraseña</th><th>Rol</th><th>Acción</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={selected.has(u.id) ? 'row-selected' : ''}>
                  <td><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} aria-label={`Seleccionar ${u.displayName}`} /></td>
                  <td data-label="Nombre"><strong>{u.displayName}</strong></td>
                  <td data-label="Usuario">{u.username}</td>
                  <td data-label="Código Profit">{u.profitCode || '—'}</td>
                  <td data-label="Empresa">{uniq(u.userRoles.map(m => m.company?.code || m.company?.name))}</td>
                  <td data-label="Departamento">{uniq(u.userRoles.map(m => m.department?.code || m.department?.name))}</td>
                  <td data-label="Estado"><span className={`badge ${u.active ? 'badge-green' : 'badge-yellow'}`}>{u.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td data-label="Cambio de contraseña">{u.mustChangePassword ? 'Pendiente' : 'Al día'}</td>
                  <td data-label="Rol">{uniq(u.userRoles.map(m => m.role?.code))}</td>
                  <td data-label="Acción"><Button size="sm" variant="secondary" onClick={() => setAdminId(u.id)}>Administrar</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
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
                  <td data-label="Rol"><strong><code>{r.code}</code></strong><br /><span className="muted small">{r.name}</span></td>
                  <td data-label="Descripción" className="muted small">{r.description || '—'}</td>
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

export const AdminPage: React.FC = () => {
  const [tab, setTab] = React.useState(0);
  const { grupos, subgrupos, categorias, marcas, unidades } = useCatalogos();
  const { empresas, departamentos, usuarios, roles: rolesData } = useOrganizacion();
  const tabs = ['Usuarios', 'Roles', 'Empresas', 'Departamentos', 'Catálogos', 'Configuración'];

  return (
    <Page title="Administración" desc="Gestiona usuarios, roles y permisos del sistema.">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 0 && <UsuariosSection empresas={empresas} departamentos={departamentos} roles={rolesData} />}

      {tab === 1 && (
        <RolesSection />
      )}

      {tab === 2 && (
        <Section title="Empresas">
          {empresas.length === 0 ? (
            <EmptyState title="Sin empresas" desc="No hay empresas registradas." />
          ) : (
          <div className="card table-responsive">
          <table className="table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Estado</th></tr></thead>
            <tbody>
              {empresas.map(c => (
                <tr key={c.id}>
                  <td data-label="Código"><code>{c.code}</code></td>
                  <td data-label="Nombre"><strong>{c.name}</strong></td>
                  <td data-label="Estado"><span className={`badge ${c.active ? 'badge-green' : 'badge-yellow'}`}>{c.active ? 'Activa' : 'Inactiva'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          )}
        </Section>
      )}

      {tab === 3 && (
        <Section title="Departamentos">
          {departamentos.length === 0 ? (
            <EmptyState title="Sin departamentos" desc="No hay departamentos registrados." />
          ) : (
          <div className="card table-responsive">
          <table className="table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Empresa</th><th>Gerente</th></tr></thead>
            <tbody>
              {departamentos.map(d => (
                <tr key={d.id}>
                  <td data-label="Código"><code>{d.code}</code></td>
                  <td data-label="Nombre"><strong>{d.name}</strong></td>
                  <td data-label="Empresa">{empresas.find(c => c.id === d.companyId)?.name || '—'}</td>
                  <td data-label="Gerente">{usuarios.find(u => u.id === d.managerId)?.displayName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          )}
        </Section>
      )}

      {tab === 4 && (
        <div className="stack">
          <Section title="Grupos">
            <div className="kpi-grid">
              {grupos.map(g => (
                <div key={g.id} className="kpi">
                  <div className="kpi-label">{g.code}</div>
                  <div className="kpi-value" style={{ fontSize: 14 }}>{g.name}</div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Subgrupos">
            <div className="kpi-grid">
              {subgrupos.map(s => (
                <div key={s.id} className="kpi">
                  <div className="kpi-label">{s.code}</div>
                  <div className="kpi-value" style={{ fontSize: 14 }}>{s.name}</div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Marcas">
            <div className="kpi-grid">
              {marcas.map(b => (
                <div key={b.id} className="kpi">
                  <div className="kpi-label">{b.normalizedName}</div>
                  <div className="kpi-value" style={{ fontSize: 14 }}>{b.name}</div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Unidades de Medida">
            <div className="kpi-grid">
              {unidades.map(u => (
                <div key={u.id} className="kpi">
                  <div className="kpi-label">{u.code}</div>
                  <div className="kpi-value" style={{ fontSize: 14 }}>{u.name}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {tab === 5 && (
        <Section title="Configuración">
          <div className="stack-sm">
            <div className="review-grid">
              <div><span className="muted small">Fuente de datos</span><br /><strong>API real</strong></div>
              <div><span className="muted small">Entorno</span><br /><strong>Desarrollo</strong></div>
              <div><span className="muted small">Backend</span><br /><strong>Conectado</strong></div>
            </div>
          </div>
        </Section>
      )}
    </Page>
  );
};
