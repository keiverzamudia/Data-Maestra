import * as React from 'react';
import { Drawer, Button, Select, Alert, ConfirmDialog, Skeleton, ErrorState, Field, Badge } from '../../componentes/ui';
import { apiUsuariosService, type AdminUserDetail, type PermissionSource } from '../../servicios/api/api-usuarios-service';
import type { Company, Department, Role } from '../../tipos';
import { getRoleLabel, getRoleDescription, getPermissionLabel, getPermissionDescription } from '../../utilidades/presentacion';

interface Props {
  userId: string;
  empresas: Company[];
  departamentos: Department[];
  roles: Role[];
  onClose: () => void;
  onChanged: () => void;
}

/** Cambio de override aún NO aplicado (batch en cliente). */
type PendingOverride = 'GRANT' | 'DENY' | 'CLEAR';

type PermFilter = 'todos' | 'sobrescritos' | string;

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0]!)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function domainOf(code: string): string {
  return code.includes('.') ? code.split('.')[0]! : 'General';
}

/**
 * 10H/19/rediseño — Drawer "Administrar" alineado a la referencia visual:
 * cabecera + identidad Profit, tarjetas de asignación, matriz de permisos
 * con chips/contadores y guardado en lote (batch en cliente con API existente).
 * No cambia RBAC, roles, overrides ni estructura de datos del backend.
 */
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
  const [permFilter, setPermFilter] = React.useState<PermFilter>('todos');
  const [pending, setPending] = React.useState<Map<string, PendingOverride>>(new Map());
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

  const runImmediate = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    if (saving) return;
    setSaving(key);
    setMsg(null);
    setError(null);
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

  const queueOverride = (code: string, effect: PendingOverride) => {
    setPending(prev => {
      const next = new Map(prev);
      if (effect === 'CLEAR') {
        // CLEAR solo tiene sentido si había (o habrá) un override.
        next.set(code, 'CLEAR');
      } else {
        next.set(code, effect);
      }
      return next;
    });
  };

  const baseOverride = (code: string): string | null =>
    detail?.permissionOverrides.find(o => o.permission.code === code)?.effect ?? null;

  /** Override efectivo proyectado (local + guardado). */
  const projectedOverride = (code: string): string | null => {
    const p = pending.get(code);
    if (p === 'CLEAR') return null;
    if (p) return p;
    return baseOverride(code);
  };

  const pendingCount = pending.size;

  const discardPending = React.useCallback(() => {
    setPending(new Map());
    setError(null);
    setMsg(null);
  }, []);

  const queueResetToRole = React.useCallback(() => {
    if (!detail) return;
    setPending(prev => {
      const next = new Map(prev);
      for (const o of detail.permissionOverrides) {
        next.set(o.permission.code, 'CLEAR');
      }
      return next;
    });
  }, [detail]);

  const flushBatch = React.useCallback(async () => {
    if (!detail || pending.size === 0 || saving) return;
    setSaving('batch');
    setMsg(null);
    setError(null);
    try {
      const entries = [...pending.entries()];
      for (const [code, effect] of entries) {
        if (effect === 'CLEAR') {
          // Solo borrar si existía override en el servidor.
          const exists = detail.permissionOverrides.some(o => o.permission.code === code);
          if (exists) await apiUsuariosService.quitarOverride(detail.id, code);
        } else {
          await apiUsuariosService.fijarOverride(detail.id, { permissionCode: code, effect });
        }
      }
      setPending(new Map());
      setMsg('Permisos actualizados correctamente.');
      await load();
      onChanged();
    } catch (err: any) {
      setError(err?.message || 'No se pudieron guardar los permisos. Reintenta.');
    } finally {
      setSaving(null);
    }
  }, [detail, pending, saving, load, onChanged]);

  const deptosDeEmpresa = departmentId || companyId
    ? departamentos.filter(d => d.companyId === (companyId || departamentos.find(x => x.id === departmentId)?.companyId))
    : [];

  // ── Contadores de la matriz (derivados del detalle, sin hardcode) ──
  const stats = React.useMemo(() => {
    const list = detail?.effectivePermissions ?? [];
    let heredados = 0;
    let concedidos = 0;
    let denegados = 0;
    for (const p of list) {
      if (p.source === 'HEREDADO') heredados += 1;
      else if (p.source === 'CONCEDIDO') concedidos += 1;
      else if (p.source === 'DENEGADO') denegados += 1;
    }
    return { heredados, concedidos, denegados, total: list.length };
  }, [detail]);

  const filterChips = React.useMemo(() => {
    const list = detail?.effectivePermissions ?? [];
    const byDomain = new Map<string, number>();
    for (const p of list) {
      const d = domainOf(p.code);
      byDomain.set(d, (byDomain.get(d) ?? 0) + 1);
    }
    const sobrescritos = detail?.permissionOverrides.length ?? 0;
    return {
      domains: [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      sobrescritos,
      total: list.length,
    };
  }, [detail]);

  const q = permSearch.trim().toLowerCase();
  const matrixGroups = React.useMemo(() => {
    const list = detail?.effectivePermissions ?? [];
    let filtered = list;
    if (q) {
      filtered = filtered.filter(
        p =>
          p.code.toLowerCase().includes(q) ||
          getPermissionLabel(p.code).toLowerCase().includes(q),
      );
    }
    if (permFilter === 'sobrescritos') {
      filtered = filtered.filter(p => !!baseOverride(p.code) || pending.has(p.code));
    } else if (permFilter !== 'todos') {
      filtered = filtered.filter(p => domainOf(p.code) === permFilter);
    }
    const groups = new Map<string, typeof filtered>();
    for (const p of filtered) {
      const domain = domainOf(p.code);
      const arr = groups.get(domain) ?? [];
      arr.push(p);
      groups.set(domain, arr);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, q, permFilter, pending]);

  const effectiveRoles = detail?.roleCodes ?? [];

  const identitySubtitle = detail
    ? `Usuario ${detail.username}${detail.profitCode ? ` · Código Profit: ${detail.profitCode}` : ''}${detail.lastLoginAt ? ` · Último ingreso: ${new Date(detail.lastLoginAt).toLocaleString('es-VE')}` : ''}`
    : undefined;

  return (
    <Drawer
      open
      onClose={() => { if (pendingCount > 0) discardPending(); onClose(); }}
      title={detail ? `Administrar — ${detail.displayName}` : 'Administrar usuario'}
      subtitle={identitySubtitle}
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
          {saving && saving !== 'batch' && <span className="muted small">Guardando...</span>}
          {msg && <Alert tone="success">{msg}</Alert>}

          {/* ── Cabecera + identidad Profit ── */}
          <section className="admin-head" aria-label="Identidad">
            <span className="admin-avatar" aria-hidden="true">{initialsOf(detail.displayName)}</span>
            <div className="admin-head-main">
              <h4 className="admin-title">{detail.displayName}</h4>
              <div className="admin-meta">
                <Badge tone={detail.active ? 'green' : 'gray'}>{detail.active ? 'Activo' : 'Inactivo'}</Badge>
                <span>Usuario {detail.username}</span>
                {detail.profitCode && <span className="mono">{detail.profitCode}</span>}
              </div>
            </div>
          </section>

          {detail.profitCode && (
            <div className="admin-identity" role="note" aria-label="Identidad respaldada por Profit">
              <span className="admin-identity-icon" aria-hidden="true">✓</span>
              <div className="admin-identity-body">
                <div className="admin-identity-title">Identidad respaldada por Profit Plus ERP</div>
                <p className="admin-identity-desc">
                  Credenciales maestras centralizadas. La contraseña se valida contra Profit y nunca se muestra aquí.
                </p>
              </div>
              <span className="admin-identity-status">Sincronizado</span>
            </div>
          )}

          {/* ── Organización y roles asignados ── */}
          <section className="admin-section" aria-label="Organización y roles asignados">
            <div className="admin-section-head">
              <h4 className="admin-section-title">Organización y roles asignados</h4>
              <span className="admin-section-aside">
                {detail.userRoles.length} asignación{detail.userRoles.length === 1 ? '' : 'es'}
                {detail.userRoles.length > 0 ? ' · primaria primero' : ''}
              </span>
            </div>
            {detail.userRoles.length === 0 && <p className="muted small">Sin empresa asignada.</p>}
            <div className="stack-sm">
              {detail.userRoles.map(m => (
                <div key={m.id} className="admin-assign-card">
                  <div className="admin-assign-main">
                    <div className="admin-assign-line">
                      <span className="admin-assign-code">{m.company.code}</span>
                      <span className="admin-assign-name">{m.company.name}</span>
                      <Badge tone="blue">{m.department ? m.department.code : getRoleLabel(m.role.code, m.role.name)}</Badge>
                    </div>
                    <p className="admin-assign-hint">
                      {m.department
                        ? `Rol derivado de departamento: ${getRoleLabel(m.role.code, m.role.name)}`
                        : `Rol asignado: ${getRoleLabel(m.role.code, m.role.name)}`}
                      {m.department ? ` · ${m.department.name}` : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!saving}
                    aria-label={`Quitar asignación ${m.company.code} ${getRoleLabel(m.role.code, m.role.name)}`}
                    onClick={() => void runImmediate(`rm-${m.id}`, () => apiUsuariosService.quitarRol(detail.id, { roleCode: m.role.code, companyId: m.company.id, departmentId: m.department?.id ?? null }), 'Asignación quitada correctamente')}
                  >
                    Quitar
                  </Button>
                </div>
              ))}
            </div>

            <h5 className="admin-section-title" style={{ marginTop: 16, marginBottom: 8 }}>
              Añadir nueva asignación de estructura
            </h5>
            <div className="admin-add-grid">
              <Field label="Empresa">
                <Select value={companyId} onChange={e => { setCompanyId(e.target.value); setDepartmentId(''); }} aria-label="Empresa">
                  <option value="">Empresa...</option>
                  {empresas.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </Select>
              </Field>
              <Field label="Departamento">
                <Select value={departmentId} onChange={e => setDepartmentId(e.target.value)} aria-label="Departamento" disabled={!companyId}>
                  <option value="">Seleccionar departamento...</option>
                  {deptosDeEmpresa.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                </Select>
              </Field>
              <Field label="Rol primario" required>
                <Select value={roleCode} onChange={e => setRoleCode(e.target.value)} aria-label="Rol primario">
                  <option value="">Rol automático...</option>
                  {roles.map(r => <option key={r.id} value={r.code}>{getRoleLabel(r.code, r.name)}</option>)}
                </Select>
              </Field>
              <Button
                className="admin-add-btn"
                disabled={!!saving || !companyId || !roleCode}
                aria-label="Asignar estructura"
                title="Asignar"
                onClick={() => void runImmediate('assign', () => apiUsuariosService.asignarRol(detail.id, { roleCode, companyId, departmentId: departmentId || null }), 'Asignación creada correctamente')}
              >
                +
              </Button>
            </div>
            {roleCode && getRoleDescription(roleCode) && (
              <p className="muted small" style={{ marginTop: 8 }}>{getRoleDescription(roleCode)}</p>
            )}
          </section>

          {/* ── Roles derivados ── */}
          <section className="admin-section" aria-label="Roles">
            <div className="admin-section-head">
              <h4 className="admin-section-title">Roles</h4>
              <span className="admin-section-aside">Derivados de las asignaciones</span>
            </div>
            <div className="chip-row">
              {effectiveRoles.length === 0 && <span className="muted small">—</span>}
              {effectiveRoles.map(c => <Badge key={c} tone="blue">{getRoleLabel(c)}</Badge>)}
            </div>
          </section>

          {/* ── Matriz de permisos individuales ── */}
          <section className="admin-section" aria-label="Matriz de permisos individuales">
            <div className="admin-perm-head">
              <div>
                <div className="admin-section-eyebrow">Matriz de permisos individuales</div>
                <p>Control fino de accesos, excepciones y capacidades operativas específicas.</p>
              </div>
              <div className="admin-perm-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!!saving || detail.permissionOverrides.length === 0}
                  onClick={queueResetToRole}
                  title={detail.permissionOverrides.length === 0 ? 'Sin sobrescrituras que restablecer' : 'Encola la limpieza de todos los overrides'}
                >
                  Restablecer al Rol
                </Button>
              </div>
            </div>

            <div className="admin-stat-chips" aria-label="Resumen de permisos">
              <span className="admin-stat-chip">Heredados del Rol <strong>{stats.heredados}</strong></span>
              <span className="admin-stat-chip grant">Concedidos Manual <strong>{stats.concedidos}</strong></span>
              <span className="admin-stat-chip deny">Denegados / Bloqueados <strong>{stats.denegados}</strong></span>
            </div>
            <p className="muted small" style={{ marginTop: 6 }}>
              Prioridad: Denegado sobre Directo sobre Heredado.
              {pendingCount > 0 && <> · <strong>{pendingCount}</strong> cambio{pendingCount === 1 ? '' : 's'} pendiente{pendingCount === 1 ? '' : 's'} en esta sesión.</>}
            </p>

            <div className="admin-search">
              <input
                className="input"
                value={permSearch}
                onChange={e => setPermSearch(e.target.value)}
                placeholder="Filtrar permisos o descripción..."
                aria-label="Filtrar permisos"
              />
            </div>

            <div className="admin-filter-chips" role="group" aria-label="Filtros de permisos">
              <button
                type="button"
                className={`admin-filter-chip ${permFilter === 'todos' ? 'active' : ''}`}
                onClick={() => setPermFilter('todos')}
              >
                Todos ({filterChips.total})
              </button>
              {filterChips.domains.map(([domain, n]) => (
                <button
                  key={domain}
                  type="button"
                  className={`admin-filter-chip ${permFilter === domain ? 'active' : ''}`}
                  onClick={() => setPermFilter(domain)}
                >
                  {domain} ({n})
                </button>
              ))}
              <button
                type="button"
                className={`admin-filter-chip warn ${permFilter === 'sobrescritos' ? 'active' : ''}`}
                onClick={() => setPermFilter('sobrescritos')}
              >
                Sobrescritos ({filterChips.sobrescritos})
              </button>
            </div>

            {matrixGroups.length === 0 && (
              <p className="muted small" style={{ marginTop: 16 }}>Sin permisos para este filtro.</p>
            )}

            {matrixGroups.map(([domain, perms]) => (
              <div key={domain}>
                <div className="admin-domain">
                  <h5 className="admin-domain-label">Dominio: {domain}</h5>
                  <span className="admin-domain-count">{perms.length} permiso{perms.length === 1 ? '' : 's'} en este grupo</span>
                </div>
                {perms.map(p => {
                  const base = baseOverride(p.code);
                  const projected = projectedOverride(p.code);
                  const isPending = pending.has(p.code);
                  const desc = getPermissionDescription(p.code);
                  const sourceTone: 'gray' | 'green' | 'red' =
                    p.source === 'DENEGADO' ? 'red' : p.source === 'CONCEDIDO' ? 'green' : 'gray';
                  const sourceLabel =
                    p.source === 'HEREDADO' ? 'Heredado' : p.source === 'CONCEDIDO' ? 'Concedido' : 'Denegado';
                  return (
                    <div key={p.code} className={`admin-perm-row ${isPending ? 'pending-change' : ''}`}>
                      <div className="admin-perm-body">
                        <div className="admin-perm-row-top">
                          <span className="admin-perm-name">{getPermissionLabel(p.code)}</span>
                          <Badge tone={sourceTone}>{sourceLabel}</Badge>
                          {base && <Badge tone={base === 'GRANT' ? 'green' : 'red'}>{base === 'GRANT' ? 'Sobrescrito + Concedido' : 'Sobrescrito − Denegado'}</Badge>}
                          {isPending && <Badge tone="yellow">Pendiente</Badge>}
                        </div>
                        <p className="admin-perm-desc">{desc ?? p.code}</p>
                      </div>
                      <div className="admin-perm-controls">
                        {!projected && <span className="admin-auto-tag">Auto (Rol)</span>}
                        <div className="admin-toggle" role="group" aria-label={`Acción para ${getPermissionLabel(p.code)}`}>
                          <button
                            type="button"
                            className={projected === 'GRANT' ? 'on-ok' : ''}
                            disabled={!!saving}
                            aria-pressed={projected === 'GRANT'}
                            onClick={() => {
                              if (projected === 'GRANT') {
                                // vuelta a herencia (CLEAR) solo si hay cambio real
                                if (base || pending.has(p.code)) queueOverride(p.code, 'CLEAR');
                              } else {
                                queueOverride(p.code, 'GRANT');
                              }
                            }}
                          >
                            Concedido
                          </button>
                          <button
                            type="button"
                            className={projected === 'DENY' ? 'on-bad' : ''}
                            disabled={!!saving}
                            aria-pressed={projected === 'DENY'}
                            onClick={() => {
                              if (projected === 'DENY') {
                                if (base || pending.has(p.code)) queueOverride(p.code, 'CLEAR');
                              } else {
                                queueOverride(p.code, 'DENY');
                              }
                            }}
                          >
                            Denegar
                          </button>
                        </div>
                        {projected && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!!saving || !isPending}
                            title="Volver al estado heredado del rol (pendiente hasta guardar)"
                            onClick={() => queueOverride(p.code, 'CLEAR')}
                          >
                            Heredar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>

          {/* ── Seguridad ── */}
          <section className="admin-section" aria-label="Seguridad">
            <div className="admin-section-head">
              <h4 className="admin-section-title">Seguridad</h4>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {detail.active ? (
                <Button variant="secondary" disabled={!!saving} onClick={() => setConfirmDeactivate(true)}>
                  Desactivar usuario
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  disabled={!!saving}
                  onClick={() => void runImmediate('active', () => apiUsuariosService.cambiarEstado(detail.id, true), 'Usuario activado correctamente')}
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
              onConfirm={() => {
                setConfirmDeactivate(false);
                void runImmediate('active', () => apiUsuariosService.cambiarEstado(detail.id, false), 'Usuario desactivado correctamente');
              }}
            />
            <p className="muted small" style={{ marginTop: 8 }}>
              Desactivar conserva roles, empresa, departamento y permisos. La contraseña se valida contra Profit.
            </p>
          </section>

          {/* ── Barra de guardado en lote ── */}
          {pendingCount > 0 && (
            <div className="admin-batch-bar" role="status" aria-live="polite">
              <span className="admin-batch-msg">
                {pendingCount} cambio{pendingCount === 1 ? '' : 's'} en matriz pendiente{pendingCount === 1 ? '' : 's'} por guardar
              </span>
              <div className="admin-batch-actions">
                <Button variant="secondary" size="sm" disabled={!!saving} onClick={discardPending}>
                  Cancelar
                </Button>
                <Button size="sm" disabled={!!saving} onClick={() => void flushBatch()}>
                  {saving === 'batch' ? 'Guardando…' : 'Guardar cambios en permisos'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
};
