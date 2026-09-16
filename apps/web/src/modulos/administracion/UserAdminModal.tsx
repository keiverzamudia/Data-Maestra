import * as React from 'react';
import { Drawer, Button, Select, Alert, ConfirmDialog, Skeleton, ErrorState, Field, Badge } from '../../componentes/ui';
import { apiUsuariosService, type AdminUserDetail } from '../../servicios/api/api-usuarios-service';
import type { Company, Department, Role } from '../../tipos';
import { getRoleLabel, getRoleDescription, getPermissionLabel } from '../../utilidades/presentacion';

interface Props {
  userId: string;
  empresas: Company[];
  departamentos: Department[];
  roles: Role[];
  onClose: () => void;
  onChanged: () => void;
}

/** 10H/19 — Administrar usuario: mismo modelo, presentación por bloques. */
export const UserAdminModal: React.FC<Props> = ({ userId, empresas, departamentos, roles, onClose, onChanged }) => {
  const [detail, setDetail] = React.useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [companyId, setCompanyId] = React.useState('');
  const [departmentId, setDepartmentId] = React.useState('');
  const [roleCode, setRoleCode] = React.useState('');
  const [permSearch, setPermSearch] = React.useState('');
  const [confirmDeactivate, setConfirmDeactivate] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiUsuariosService.detalle(userId);
      setDetail(d);
    } catch (err: any) {
      setDetail(null);
      setError(err?.message || 'No se pudo cargar el usuario.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    if (saving) return;
    setSaving(key);
    setMsg(null);
    try {
      await fn();
      setMsg(okMsg);
      await load();
      onChanged();
    } catch (err: any) {
      setMsg(null);
      setError(err?.message || 'No se pudo guardar. Reintenta.');
    } finally {
      setSaving(null);
    }
  };

  const deptosDeEmpresa = departmentId || companyId
    ? departamentos.filter(d => d.companyId === (companyId || departamentos.find(x => x.id === departmentId)?.companyId))
    : [];

  const overrideOf = (code: string) => detail?.permissionOverrides.find(o => o.permission.code === code)?.effect ?? null;

  const q = permSearch.trim().toLowerCase();
  const visiblePerms = React.useMemo(() => {
    const list = detail?.effectivePermissions ?? [];
    const filtered = q ? list.filter(p => p.code.toLowerCase().includes(q) || getPermissionLabel(p.code).toLowerCase().includes(q)) : list;
    const groups = new Map<string, typeof filtered>();
    for (const p of filtered) {
      const domain = p.code.includes('.') ? p.code.split('.')[0]! : 'General';
      const arr = groups.get(domain) ?? [];
      arr.push(p);
      groups.set(domain, arr);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [detail, q]);

  const effectiveRoles = detail?.roleCodes ?? [];

  return (
    <Drawer
      open
      onClose={onClose}
      title={detail ? `Administrar — ${detail.displayName}` : 'Administrar usuario'}
      subtitle={detail ? `Usuario ${detail.username} · ${detail.active ? 'Activo' : 'Inactivo'}` : undefined}
    >
      {loading && (
        <div className="stack-sm" aria-label="Cargando usuario">
          <Skeleton height={16} width="40%" /><Skeleton height={60} /><Skeleton height={60} />
        </div>
      )}
      {!loading && error && !detail && <ErrorState title="No pudimos cargar el usuario." desc={error} onRetry={() => void load()} />}
      {error && detail && <Alert tone="danger">{error}</Alert>}
      {detail && (
        <div className="stack">
          {saving && <span className="muted small">Guardando...</span>}
          {msg && <Alert tone="success">{msg}</Alert>}

          <section className="card p16" aria-label="Información">
            <h3 className="subsection-title">Información</h3>
            <dl className="info-grid">
              <div><dt>Nombre</dt><dd><strong>{detail.displayName}</strong></dd></div>
              <div><dt>Usuario</dt><dd><strong>{detail.username}</strong></dd></div>
              <div><dt>Código Profit</dt><dd><strong>{detail.profitCode || '—'}</strong></dd></div>
              <div>
                <dt>Estado</dt>
                <dd><Badge tone={detail.active ? 'green' : 'gray'}>{detail.active ? 'Activo' : 'Inactivo'}</Badge></dd>
              </div>
              <div><dt>Último ingreso</dt><dd>{detail.lastLoginAt ? new Date(detail.lastLoginAt).toLocaleString('es-VE') : '—'}</dd></div>
            </dl>
            {detail.profitCode && <p className="muted small">Identidad respaldada por Profit.</p>}
          </section>

          <section className="card p16" aria-label="Organización">
            <h3 className="subsection-title">Organización</h3>
            <h4 className="muted small">Asignaciones actuales</h4>
            {detail.userRoles.length === 0 && <p className="muted small">Sin empresa asignada.</p>}
            <div className="stack-sm">
              {detail.userRoles.map(m => (
                <div key={m.id} className="assign-row">
                  <div className="assign-main">
                    <strong>{m.company.code}</strong> <span className="muted small">{m.company.name}</span>
                    <div className="assign-chips">
                      <Badge tone="blue">{m.department ? m.department.code : 'Sin departamento'}</Badge>
                      <Badge>{getRoleLabel(m.role.code, m.role.name)}</Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" disabled={!!saving} aria-label={`Quitar asignación ${m.company.code} ${getRoleLabel(m.role.code, m.role.name)}`} onClick={() => void run(`rm-${m.id}`, () => apiUsuariosService.quitarRol(detail.id, { roleCode: m.role.code, companyId: m.company.id, departmentId: m.department?.id ?? null }), 'Guardado correctamente')}>
                    Quitar
                  </Button>
                </div>
              ))}
            </div>
            <h4 className="muted small block-mt-sm">Nueva asignación</h4>
            <div className="assign-form">
              <Field label="Empresa">
                <Select value={companyId} onChange={e => { setCompanyId(e.target.value); setDepartmentId(''); }} aria-label="Empresa">
                  <option value="">Empresa...</option>
                  {empresas.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </Select>
              </Field>
              <Field label="Departamento">
                <Select value={departmentId} onChange={e => setDepartmentId(e.target.value)} aria-label="Departamento" disabled={!companyId}>
                  <option value="">Sin departamento</option>
                  {deptosDeEmpresa.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                </Select>
              </Field>
              <Field label="Rol" required>
                <Select value={roleCode} onChange={e => setRoleCode(e.target.value)} aria-label="Rol">
                  <option value="">Rol...</option>
                  {roles.map(r => <option key={r.id} value={r.code}>{getRoleLabel(r.code, r.name)}</option>)}
                </Select>
              </Field>
              <Button size="sm" disabled={!!saving || !companyId || !roleCode} onClick={() => void run('assign', () => apiUsuariosService.asignarRol(detail.id, { roleCode, companyId, departmentId: departmentId || null }), 'Rol asignado correctamente')}>
                Asignar
              </Button>
            </div>
            {roleCode && getRoleDescription(roleCode) && (
              <p className="muted small">{getRoleDescription(roleCode)}</p>
            )}
          </section>

          <section className="card p16" aria-label="Roles">
            <h3 className="subsection-title">Roles</h3>
            <div className="chip-row">
              {effectiveRoles.length === 0 && <span className="muted small">—</span>}
              {effectiveRoles.map(c => <Badge key={c} tone="blue">{getRoleLabel(c)}</Badge>)}
            </div>
            <p className="muted small">Los roles se derivan de las asignaciones de organización.</p>
          </section>

          <section className="card p16" aria-label="Permisos individuales">
            <h3 className="subsection-title">Permisos individuales</h3>
            <div className="block-mt-sm">
              <input
                className="input"
                value={permSearch}
                onChange={e => setPermSearch(e.target.value)}
                placeholder="Buscar permiso..."
                aria-label="Buscar permiso"
              />
            </div>
            {visiblePerms.length === 0 && <p className="muted small block-mt-sm">Sin permisos para este filtro.</p>}
            {visiblePerms.map(([domain, perms]) => (
              <div key={domain} className="block-mt-sm">
                <h4 className="perm-domain">{domain}</h4>
                <div className="perm-table-wrap">
                  <table className="table perm-table">
                    <thead><tr><th>Permiso</th><th>Origen</th><th>Estado</th><th>Acción</th></tr></thead>
                    <tbody>
                      {perms.map(p => {
                        const ov = overrideOf(p.code);
                        return (
                          <tr key={p.code}>
                            <td>{getPermissionLabel(p.code)}</td>
                            <td>
                              <Badge tone={p.source === 'DENEGADO' ? 'red' : p.source === 'CONCEDIDO' ? 'green' : 'gray'}>
                                {p.source === 'HEREDADO' ? 'Heredado' : p.source === 'CONCEDIDO' ? 'Directo' : 'Denegado'}
                              </Badge>
                            </td>
                            <td>
                              <Badge tone={p.granted ? 'green' : 'gray'}>{p.granted ? 'Concedido' : 'No concedido'}</Badge>
                            </td>
                            <td>
                              <div className="perm-actions">
                                {ov && <Button size="sm" variant="secondary" disabled={!!saving} onClick={() => void run(`ov-${p.code}`, () => apiUsuariosService.quitarOverride(detail.id, p.code), 'Guardado correctamente')}>Sin override</Button>}
                                {ov !== 'GRANT' && <Button size="sm" variant="secondary" disabled={!!saving} onClick={() => void run(`ov-${p.code}`, () => apiUsuariosService.fijarOverride(detail.id, { permissionCode: p.code, effect: 'GRANT' }), 'Guardado correctamente')}>Conceder</Button>}
                                {ov !== 'DENY' && <Button size="sm" variant="secondary" disabled={!!saving} onClick={() => void run(`ov-${p.code}`, () => apiUsuariosService.fijarOverride(detail.id, { permissionCode: p.code, effect: 'DENY' }), 'Guardado correctamente')}>Denegar</Button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <p className="muted small">Prioridad: Denegado sobre Directo sobre Heredado.</p>
          </section>

          <section className="card p16" aria-label="Seguridad">
            <h3 className="subsection-title">Seguridad</h3>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {detail.active ? (
                <Button
                  variant="secondary"
                  disabled={!!saving}
                  onClick={() => setConfirmDeactivate(true)}
                >
                  Desactivar usuario
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  disabled={!!saving}
                  onClick={() => void run('active', () => apiUsuariosService.cambiarEstado(detail.id, true), 'Usuario activado correctamente')}
                >
                  Activar usuario
                </Button>
              )}
            </div>
            <ConfirmDialog
              open={confirmDeactivate}
              title="Desactivar usuario"
              desc={`¿Desactivar a ${detail.displayName}? El usuario no podrá iniciar nuevas sesiones. Se conservan roles, empresa, departamento y permisos.`}
              confirmLabel="Desactivar"
              busy={!!saving}
              onCancel={() => setConfirmDeactivate(false)}
              onConfirm={() => { setConfirmDeactivate(false); void run('active', () => apiUsuariosService.cambiarEstado(detail.id, false), 'Usuario desactivado correctamente'); }}
            />
            <p className="muted small" style={{ marginTop: 8 }}>Desactivar conserva roles, empresa, departamento y permisos. La contraseña se valida contra Profit.</p>
          </section>
        </div>
      )}
    </Drawer>
  );
};
