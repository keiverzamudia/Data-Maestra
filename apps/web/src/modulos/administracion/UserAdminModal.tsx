import * as React from 'react';
import { Drawer, Button, Select, Alert, ConfirmDialog, Skeleton, ErrorState, Field } from '../../componentes/ui';
import { apiUsuariosService, type AdminUserDetail } from '../../servicios/api/api-usuarios-service';
import type { Company, Department, Role } from '../../tipos';

interface Props {
  userId: string;
  empresas: Company[];
  departamentos: Department[];
  roles: Role[];
  onClose: () => void;
  onChanged: () => void;
}

const sourceLabel: Record<string, string> = { HEREDADO: '✓ HEREDADO', CONCEDIDO: '+ CONCEDIDO', DENEGADO: '− DENEGADO' };

/** 10H — Panel de administración de un usuario (drawer vía Modal). */
export const UserAdminModal: React.FC<Props> = ({ userId, empresas, departamentos, roles, onClose, onChanged }) => {
  const [detail, setDetail] = React.useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [companyId, setCompanyId] = React.useState('');
  const [departmentId, setDepartmentId] = React.useState('');
  const [roleCode, setRoleCode] = React.useState('');
  const [confirmReset, setConfirmReset] = React.useState(false);
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

  return (
    <Drawer open onClose={onClose} title={detail ? `Administrar — ${detail.displayName}` : 'Administrar usuario'}>
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

          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 15 }}>1. Información</h3>
            <div className="review-grid" style={{ marginTop: 8 }}>
              <div><span className="muted small">Nombre</span><br /><strong>{detail.displayName}</strong></div>
              <div><span className="muted small">Usuario</span><br /><strong>{detail.username}</strong></div>
              <div><span className="muted small">Código Profit</span><br /><strong>{detail.profitCode || '—'}</strong></div>
              <div><span className="muted small">Estado</span><br /><strong>{detail.active ? 'Activo' : 'Inactivo'}</strong></div>
              <div><span className="muted small">Cambio de contraseña</span><br /><strong>{detail.mustChangePassword ? 'Pendiente' : 'Al día'}</strong></div>
              <div><span className="muted small">Último ingreso</span><br /><strong>{detail.lastLoginAt ? new Date(detail.lastLoginAt).toLocaleString('es-VE') : '—'}</strong></div>
            </div>
            {detail.profitCode && <p className="muted small" style={{ marginTop: 8 }}>Identidad respaldada por Profit (nombre, usuario y código se sincronizan).</p>}
          </div>

          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 15 }}>2. Organización</h3>
            <div style={{ marginTop: 8 }} className="stack-sm">
              {detail.userRoles.length === 0 && <p className="muted small">Sin empresa asignada.</p>}
              {detail.userRoles.map(m => (
                <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span><strong>{m.company.code}</strong> <span className="muted small">{m.company.name}</span></span>
                  <span className="muted small">· {m.department ? `${m.department.code}` : 'Sin departamento'}</span>
                  <span className="muted small">· {m.role.code}</span>
                  <Button size="sm" variant="secondary" disabled={!!saving} onClick={() => void run(`rm-${m.id}`, () => apiUsuariosService.quitarRol(detail.id, { roleCode: m.role.code, companyId: m.company.id, departmentId: m.department?.id ?? null }), 'Guardado correctamente')}>
                    Quitar
                  </Button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
                    {roles.map(r => <option key={r.id} value={r.code}>{r.code}</option>)}
                  </Select>
                </Field>
                <Button size="sm" disabled={!!saving || !companyId || !roleCode} onClick={() => void run('assign', () => apiUsuariosService.asignarRol(detail.id, { roleCode, companyId, departmentId: departmentId || null }), 'Rol asignado correctamente')}>
                  Asignar
                </Button>
              </div>
            </div>
          </div>

          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 15 }}>3. Roles</h3>
            <p style={{ marginTop: 8 }}><strong>{detail.roleCodes.length ? detail.roleCodes.join(', ') : '—'}</strong></p>
            <p className="muted small">Los roles se asignan y quitan desde la sección Organización (cada asignación lleva su empresa y departamento).</p>
          </div>

          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 15 }}>4. Permisos</h3>
            <div style={{ marginTop: 8 }} className="stack-sm">
              <table className="table">
                <thead><tr><th>Permiso</th><th>Origen</th><th>Estado efectivo</th><th>Acción</th></tr></thead>
                <tbody>
                  {detail.effectivePermissions.map(p => {
                    const ov = overrideOf(p.code);
                    return (
                      <tr key={p.code}>
                        <td><code>{p.code}</code></td>
                        <td>{sourceLabel[p.source]}</td>
                        <td>{p.granted ? 'Concedido' : 'No concedido'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
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
              <p className="muted small">Los permisos heredados no se modifican directamente. Prioridad: − DENEGADO sobre + CONCEDIDO sobre ✓ HEREDADO.</p>
            </div>
          </div>

          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 15 }}>5. Seguridad</h3>
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
              {!confirmReset ? (
                <Button variant="danger" disabled={!!saving} onClick={() => setConfirmReset(true)}>
                  Restablecer contraseña
                </Button>
              ) : (
                <Button variant="danger" disabled={!!saving} onClick={() => { setConfirmReset(false); void run('reset', () => apiUsuariosService.restablecerPassword(detail.id), 'Contraseña restablecida. El usuario deberá cambiarla al iniciar sesión.'); }}>
                  Confirmar restablecimiento
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
            <p className="muted small" style={{ marginTop: 8 }}>Desactivar conserva roles, empresa, departamento y permisos. Restablecer vuelve al flujo de contraseña inicial y revoca las sesiones del usuario.</p>
          </div>
        </div>
      )}
    </Drawer>
  );
};
