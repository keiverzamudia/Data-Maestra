import * as React from 'react';
import { Page, Button, Input, Alert, EmptyState, Drawer, Field, ConfirmDialog } from '../../componentes/ui';
import { useSession } from '../../contextos/SessionContext';
import { apiOrganizacionService } from '../../servicios/api/api-organizacion-service';
import type { Company, Department, User } from '../../tipos';

interface Props {
  empresas: Company[];
  departamentos: Department[];
  usuarios: User[];
  onChanged?: () => void;
}

/** 12I — Departamentos: listar, crear, editar (nombre/responsable/estado). Empresa inmutable. */
export const DepartamentosSection: React.FC<Props> = ({ empresas, departamentos, usuarios, onChanged }) => {
  const { hasPermission } = useSession();
  const [rows, setRows] = React.useState(departamentos);
  const [creating, setCreating] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [companyId, setCompanyId] = React.useState('');
  const [managerId, setManagerId] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [toggleId, setToggleId] = React.useState<string | null>(null);

  React.useEffect(() => { setRows(departamentos); }, [departamentos]);

  const canAdmin = hasPermission('ADMIN.MANAGE');
  const editing = rows.find(d => d.id === editId) ?? null;
  const managers = usuarios.filter(u => u.active);
  const activeCompanies = empresas.filter(c => c.active);

  const openEdit = (d: Department) => {
    setEditId(d.id);
    setName(d.name);
    setCode(d.code);
    setCompanyId(d.companyId);
    setManagerId(d.managerId ?? '');
    setSaveError(null);
  };

  const openCreate = () => {
    setCreating(true);
    setName('');
    setCode('');
    setCompanyId(activeCompanies[0]?.id ?? '');
    setManagerId('');
    setSaveError(null);
  };

  const save = async () => {
    if (saving) return;
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();
    if (trimmedName.length < 2 || trimmedName.length > 120) {
      setSaveError('El nombre debe tener entre 2 y 120 caracteres.');
      return;
    }
    if (creating && (trimmedCode.length < 2 || trimmedCode.length > 20)) {
      setSaveError('El código debe tener entre 2 y 20 caracteres.');
      return;
    }
    if (creating && !companyId) {
      setSaveError('Seleccione la empresa.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (creating) {
        const created = await apiOrganizacionService.crearDepartamento({
          name: trimmedName,
          code: trimmedCode,
          companyId,
          managerId: managerId || null,
        });
        setRows(prev => [...prev, created]);
        setCreating(false);
      } else if (editing) {
        const updated = await apiOrganizacionService.actualizarDepartamento(editing.id, {
          name: trimmedName,
          managerId: managerId || null,
        });
        setRows(prev => prev.map(d => (d.id === editing.id ? { ...d, name: updated.name, managerId: updated.managerId ?? undefined } : d)));
        setEditId(null);
      }
      onChanged?.();
    } catch (err: any) {
      setSaveError(err?.message || 'No se pudo guardar el departamento.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (d: Department, active: boolean) => {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await apiOrganizacionService.actualizarDepartamento(d.id, { active });
      setRows(prev => prev.map(x => (x.id === d.id ? { ...x, active: updated.active } : x)));
      setToggleId(null);
      onChanged?.();
    } catch (err: any) {
      setSaveError(err?.message || 'No se pudo cambiar el estado.');
    } finally {
      setSaving(false);
    }
  };

  if (!canAdmin) {
    return (
      <Page title="Departamentos" desc="Estructura por empresa.">
        <p className="muted">Sin permiso para administrar departamentos. Se requiere ADMIN.MANAGE.</p>
      </Page>
    );
  }

  const formOpen = creating || !!editing;

  return (
    <div className="stack-sm">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button onClick={openCreate} disabled={saving}>+ Nuevo departamento</Button>
      </div>
      {rows.length > 0 && (
        <div className="summary-strip" aria-label="Resumen de departamentos">
          <div className="summary-item"><div className="summary-num">{rows.length}</div><div className="summary-label">Departamentos</div></div>
          <div className="summary-item"><div className="summary-num">{rows.filter(d => d.active).length}</div><div className="summary-label">Activos</div></div>
          <div className="summary-item"><div className="summary-num">{new Set(rows.map(d => d.companyId)).size}</div><div className="summary-label">Empresas</div></div>
        </div>
      )}
      {saveError && !formOpen && <Alert tone="danger">{saveError}</Alert>}
      {rows.length === 0 ? (
        <EmptyState title="Sin departamentos" desc="No hay departamentos registrados." />
      ) : (
        <div className="card table-responsive">
          <table className="table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Empresa</th><th>Responsable</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {rows.map(d => (
                <tr key={d.id}>
                  <td data-label="Código"><code>{d.code}</code></td>
                  <td data-label="Nombre"><strong>{d.name}</strong></td>
                  <td data-label="Empresa" className="cell-secondary">{empresas.find(c => c.id === d.companyId)?.name || '—'}</td>
                  <td data-label="Responsable" className="cell-secondary">{usuarios.find(u => u.id === d.managerId)?.displayName || '—'}</td>
                  <td data-label="Estado"><span className={`badge ${d.active ? 'badge-green' : 'badge-yellow'}`}>{d.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td data-label="Acciones">
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <Button size="sm" variant="secondary" onClick={() => openEdit(d)}>Editar</Button>
                      <Button size="sm" variant="secondary" onClick={() => setToggleId(d.id)} disabled={saving}>
                        {d.active ? 'Desactivar' : 'Activar'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Drawer open={formOpen} onClose={() => { setCreating(false); setEditId(null); }} title={creating ? 'Nuevo departamento' : editing ? `Editar — ${editing.name}` : 'Departamento'}>
        <div className="stack-sm">
          {editing && (
            <div className="card p16">
              <span className="muted small">Código (no editable)</span><br /><code>{editing.code}</code>
              <span className="muted small" style={{ display: 'block', marginTop: 8 }}>Empresa (no editable)</span>
              <strong>{empresas.find(c => c.id === editing.companyId)?.name || '—'}</strong>
            </div>
          )}
          {creating && (
            <Field label="Empresa" required helper="No podrá cambiarse después.">
              <select className="input" value={companyId} onChange={e => setCompanyId(e.target.value)} disabled={saving} aria-label="Empresa del departamento">
                <option value="">Seleccionar empresa...</option>
                {activeCompanies.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
              </select>
            </Field>
          )}
          <Field label="Nombre del departamento" required>
            <Input value={name} onChange={e => setName(e.target.value)} disabled={saving} aria-label="Nombre del departamento" />
          </Field>
          {creating && (
            <Field label="Código" required helper="Único dentro de la empresa. No podrá cambiarse.">
              <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} disabled={saving} aria-label="Código del departamento" placeholder="MANT" />
            </Field>
          )}
          <Field label="Responsable" helper="Opcional. Solo usuarios activos.">
            <select className="input" value={managerId} onChange={e => setManagerId(e.target.value)} disabled={saving} aria-label="Responsable del departamento">
              <option value="">Sin responsable</option>
              {managers.map(u => (
                <option key={u.id} value={u.id}>{u.displayName}</option>
              ))}
            </select>
          </Field>
          {saveError && <Alert tone="danger">{saveError}</Alert>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : creating ? 'Crear departamento' : 'Guardar cambios'}</Button>
            <Button variant="secondary" onClick={() => { setCreating(false); setEditId(null); }} disabled={saving}>Cancelar</Button>
          </div>
        </div>
      </Drawer>
      <ConfirmDialog
        open={toggleId !== null}
        title={rows.find(d => d.id === toggleId)?.active ? 'Desactivar departamento' : 'Activar departamento'}
        desc={rows.find(d => d.id === toggleId)?.active
          ? 'El departamento dejará de estar disponible para nuevas asignaciones. El historial se conserva.'
          : 'El departamento volverá a estar disponible.'}
        confirmLabel={rows.find(d => d.id === toggleId)?.active ? 'Desactivar' : 'Activar'}
        busy={saving}
        onCancel={() => setToggleId(null)}
        onConfirm={() => {
          const d = rows.find(x => x.id === toggleId);
          if (d) void toggleActive(d, !d.active);
        }}
      />
    </div>
  );
};
