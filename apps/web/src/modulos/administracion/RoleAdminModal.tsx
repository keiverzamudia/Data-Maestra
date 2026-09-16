import * as React from 'react';
import { Button, Alert, ConfirmDialog, Skeleton, ErrorState, Badge, SearchInput, Code, Select } from '../../componentes/ui';
import { apiRolesService, type RoleDetail } from '../../servicios/api/api-roles-service';
import { getRoleLabel, getRoleDescription, getPermissionLabel } from '../../utilidades/presentacion';

interface Props {
  roleCode: string;
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Consola de administración RBAC del rol (solo presentación; la lógica de
 * concesión/retiro y el modelo efectivo DENEGADO > CONCEDIDO > HEREDADO
 * pertenecen al backend y no cambian aquí).
 *
 * - Concedido al rol (+ CONCEDIDO): los usuarios del rol lo heredan.
 * - Sin conceder: el rol no lo otorga. Las excepciones por usuario
 *   (− DENEGADO / + CONCEDIDO) se gestionan en Personas y acceso.
 */
export const RoleAdminModal: React.FC<Props> = ({ roleCode, onClose, onChanged }) => {
  const [detail, setDetail] = React.useState<RoleDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState('');
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await apiRolesService.detalle(roleCode));
    } catch (err: any) {
      setDetail(null);
      setError(err?.message || 'No se pudo cargar el rol.');
    } finally {
      setLoading(false);
    }
  }, [roleCode]);

  React.useEffect(() => { void load(); }, [load]);

  const toggle = async (code: string, assigned: boolean) => {    if (saving) return;
    setSaving(code);
    setMsg(null);
    try {
      if (assigned) {
        await apiRolesService.quitar(roleCode, code);
        setMsg('Permiso quitado correctamente');
      } else {
        await apiRolesService.conceder(roleCode, code);
        setMsg('Permiso asignado correctamente');
      }
      await load();
      onChanged();
    } catch (err: any) {
      setMsg(null);
      setError(err?.message || 'No se pudo guardar. Reintenta.');
    } finally {
      setSaving(null);
    }
  };

  const saveView = async (view: string | null) => {
    if (saving) return;
    setSaving('vista');
    setMsg(null);
    try {
      await apiRolesService.vista(roleCode, view);
      setMsg(view ? 'Vista principal guardada.' : 'Vista principal restablecida a Mis solicitudes.');
      await load();
      onChanged();
    } catch (err: any) {
      setMsg(null);
      setError(err?.message || 'No se pudo guardar. Reintenta.');
    } finally {
      setSaving(null);
    }
  };

  const assigned = new Set(detail?.permissions.map(p => p.code) ?? []);
  const q = filter.trim().toLowerCase();
  const catalog = (detail?.catalog ?? []).filter(p => !q || p.code.toLowerCase().includes(q));

  const roleName = detail ? getRoleLabel(detail.code, detail.name) : 'Administrar rol';
  const roleDesc = detail ? (getRoleDescription(detail.code) || detail.description) : null;

  return (
    <div className="role-workspace">
      <div className="workspace-head">
        <Button variant="secondary" size="sm" onClick={onClose}>← Volver a roles</Button>
      </div>
      {loading && (
        <div className="stack-sm" aria-label="Cargando rol">
          <Skeleton height={16} width="40%" /><Skeleton height={60} /><Skeleton height={60} />
        </div>
      )}
      {!loading && error && !detail && <ErrorState title="No pudimos cargar el rol." desc={error} onRetry={() => void load()} />}
      {error && detail && <Alert tone="danger">{error}</Alert>}
      {detail && (
        <div className="stack">
          {saving && <span className="muted small">Guardando...</span>}
          {msg && <Alert tone="success">{msg}</Alert>}

          <section className="role-head" aria-label="Resumen del rol">
            <div className="eyebrow">Rol del sistema · Administración del rol</div>
            <h2 className="role-name">{roleName}</h2>
            <div className="block-mt-sm"><Code>{detail.code}</Code></div>
            {roleDesc && <p className="muted small">{roleDesc}</p>}
            <div className="role-stats">
              <div className="role-stat"><strong>{detail.users.length}</strong><span>usuario{detail.users.length === 1 ? '' : 's'}</span></div>
              <div className="role-stat"><strong>{detail.permissions.length}</strong><span>permiso{detail.permissions.length === 1 ? '' : 's'}</span></div>
            </div>
            <div className="block-mt-sm">
              <label>
                <span className="muted small">Vista principal (no otorga permisos)</span>
                <Select
                  value={detail.defaultView ?? ''}
                  onChange={e => void saveView(e.target.value || null)}
                  disabled={saving !== null}
                  aria-label="Vista principal del rol"
                >
                  <option value="">Mis solicitudes (por defecto)</option>
                  {(detail.availableViews ?? []).map(v => (
                    <option key={v.key} value={v.key}>{v.label}</option>
                  ))}
                </Select>
              </label>
            </div>
          </section>

          <section aria-label="Permisos del rol">
            <div className="perm-toolbar">
              <h3 className="subsection-title">Permisos del rol</h3>
              <Badge tone="blue">{detail.permissions.length} activos</Badge>
            </div>
            <div className="legend-bar" aria-label="Leyenda de estados de permiso">
              <span><strong>✓</strong> HEREDADO <span className="muted">— el usuario recibe lo concedido al rol</span></span>
              <span><strong>+</strong> CONCEDIDO <span className="muted">— otorgado a este rol</span></span>
              <span><strong>−</strong> DENEGADO <span className="muted">— excepción por usuario, en Personas y acceso</span></span>
            </div>
            <div className="block-mt-sm">
              <SearchInput value={filter} onChange={setFilter} placeholder="Buscar permiso..." />
            </div>
            {catalog.length === 0 && <p className="muted small block-mt-sm">Sin permisos para este filtro.</p>}
            <div className="perm-grid block-mt">
              {groupCatalog(catalog).map(g => (
                <div key={g.domain} className="card p16 perm-group">
                  <h4 className="perm-domain">{g.domain} <span className="muted">· {g.items.length} permiso{g.items.length === 1 ? '' : 's'}</span></h4>
                  <div className="stack-sm">
                    {g.items.map(p => {
                      const on = assigned.has(p.code);
                      return (
                        <div key={p.code} className="perm-row">
                          <div className="perm-main">
                            <div className="perm-name">{getPermissionLabel(p.code)}</div>
                            <div className="muted small"><span className="mono">{p.code}</span>{p.description ? ` — ${p.description}` : ''}</div>
                          </div>
                          <Badge tone={on ? 'green' : 'gray'}>{on ? '+ CONCEDIDO' : 'Sin conceder'}</Badge>
                          {on ? (
                            <Button size="sm" variant="ghost" disabled={!!saving} onClick={() => setConfirmRemove(p.code)}>
                              Retirar
                            </Button>
                          ) : (
                            <Button size="sm" variant="secondary" disabled={!!saving} onClick={() => void toggle(p.code, false)}>
                              Conceder
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="muted small block-mt">
              Prioridad efectiva: − DENEGADO sobre + CONCEDIDO sobre ✓ HEREDADO.
            </p>
          </section>

          <section aria-label="Usuarios con este rol">
            <h3 className="subsection-title">Usuarios con este rol ({detail.users.length})</h3>
            <div className="stack-sm block-mt-sm">
              {detail.users.length === 0 && <p className="muted small">Sin usuarios asignados.</p>}
              {detail.users.map(u => (
                <div key={u.username} className="user-row">
                  <strong>{u.displayName}</strong>
                  <span className="muted small mono">{u.username}</span>
                  <Badge tone={u.active ? 'green' : 'red'}>{u.active ? 'Activo' : 'Inactivo'}</Badge>
                  {(u.company || u.department) && (
                    <span className="muted small">{[u.company, u.department].filter(Boolean).join(' / ')}</span>
                  )}
                </div>
              ))}
              <p className="muted small">La asignación de usuarios se realiza desde Personas y acceso → Administrar.</p>
            </div>
          </section>

          <div className="workspace-foot">
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          </div>

          <ConfirmDialog
            open={confirmRemove !== null}
            title="Retirar permiso del rol"
            desc={confirmRemove ? `¿Retirar ${getPermissionLabel(confirmRemove)} del rol ${getRoleLabel(detail.code, detail.name)}? Los usuarios que lo heredaban dejarán de tenerlo (salvo override individual).` : undefined}
            confirmLabel="Retirar permiso"
            busy={!!saving}
            onCancel={() => setConfirmRemove(null)}
            onConfirm={() => {
              const code = confirmRemove;
              setConfirmRemove(null);
              if (code) void toggle(code, true);
            }}
          />
        </div>
      )}
    </div>
  );
};

const PERM_DOMAIN: Record<string, string> = {
  REQUEST: 'Solicitudes', WAREHOUSE: 'Almacén', ACCOUNTING: 'Contabilidad',
  WAREHOUSE_MANAGER: 'Aprobación Almacén', MANAGER: 'Gerencia', ADMIN: 'Administración',
  AUDIT: 'Auditoría', IMPORT: 'Importaciones', DASHBOARD: 'Panel',
};

function permDomain(code: string): string {
  const prefix = code.split('.')[0] ?? '';
  return PERM_DOMAIN[prefix] ?? 'Otros';
}

function groupCatalog(catalog: Array<{ code: string; description: string | null }>): Array<{ domain: string; items: Array<{ code: string; description: string | null }> }> {
  const groups = new Map<string, Array<{ code: string; description: string | null }>>();
  for (const p of catalog) {
    const d = permDomain(p.code);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d)!.push(p);
  }
  return [...groups.entries()].map(([domain, items]) => ({ domain, items }));
}
