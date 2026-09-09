import * as React from 'react';
import { Drawer, Button, Input, Alert, ConfirmDialog, Skeleton, ErrorState, Field } from '../../componentes/ui';
import { apiRolesService, type RoleDetail } from '../../servicios/api/api-roles-service';

interface Props {
  roleCode: string;
  onClose: () => void;
  onChanged: () => void;
}

/** 10I — Drawer de administración de un rol (consistente con UserAdminModal). */
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

  const toggle = async (code: string, assigned: boolean) => {
    if (saving) return;
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

  const assigned = new Set(detail?.permissions.map(p => p.code) ?? []);
  const q = filter.trim().toLowerCase();
  const catalog = (detail?.catalog ?? []).filter(p => !q || p.code.toLowerCase().includes(q));

  return (
    <Drawer open onClose={onClose} title={detail ? `Administrar rol — ${detail.code}` : 'Administrar rol'}>
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
          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 15 }}>{detail.name}</h3>
            <div className="review-grid" style={{ marginTop: 8 }}>
              <div><span className="muted small">Código</span><br /><strong><code>{detail.code}</code></strong></div>
              <div><span className="muted small">Usuarios</span><br /><strong>{detail.users.length}</strong></div>
              <div><span className="muted small">Permisos</span><br /><strong>{detail.permissions.length}</strong></div>
            </div>
            {detail.description && <p className="muted small" style={{ marginTop: 8 }}>{detail.description}</p>}
          </div>
          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 15 }}>Permisos del rol</h3>
            <div style={{ marginTop: 8 }} className="stack-sm">
              <Field label="Buscar permiso">
                <Input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Buscar permiso..." autoComplete="off" aria-label="Buscar permiso" />
              </Field>
              {catalog.length === 0 && <p className="muted small">Sin permisos</p>}
              <table className="table">
                <thead><tr><th>Permiso</th><th>Descripción</th><th>Asignado</th></tr></thead>
                <tbody>
                  {catalog.map(p => {
                    const on = assigned.has(p.code);
                    return (
                      <tr key={p.code}>
                        <td data-label="Permiso"><code>{p.code}</code></td>
                        <td data-label="Descripción" className="muted small">{p.description || '—'}</td>
                        <td data-label="Asignado">
                          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={!!saving}
                              onChange={() => { if (on) setConfirmRemove(p.code); else void toggle(p.code, false); }}
                              aria-label={`Permiso ${p.code}`}
                            />
                            <span>{on ? '☑' : '☐'}</span>
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 15 }}>Usuarios con este rol ({detail.users.length})</h3>
            <div style={{ marginTop: 8 }} className="stack-sm">
              {detail.users.length === 0 && <p className="muted small">Sin usuarios asignados.</p>}
              {detail.users.map(u => (
                <div key={u.username} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{u.displayName}</strong>
                  <span className="muted small">{u.username}</span>
                  <span className={`badge ${u.active ? 'badge-green' : 'badge-red'}`}>{u.active ? 'Activo' : 'Inactivo'}</span>
                  {(u.company || u.department) && (
                    <span className="muted small">{[u.company, u.department].filter(Boolean).join(' / ')}</span>
                  )}
                </div>
              ))}
              <p className="muted small">La asignación de usuarios se realiza desde Usuarios → Administrar.</p>
            </div>
          </div>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          <ConfirmDialog
            open={confirmRemove !== null}
            title="Retirar permiso del rol"
            desc={confirmRemove ? `¿Retirar ${confirmRemove} del rol ${detail.code}? Los usuarios que lo heredaban dejarán de tenerlo (salvo override individual).` : undefined}
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
    </Drawer>
  );
};
