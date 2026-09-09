import * as React from 'react';
import { Modal, Button, Select, Alert, ConfirmDialog, Skeleton, Field } from '../../componentes/ui';
import { apiUsuariosService, type AdminUser, type BulkAssignResult } from '../../servicios/api/api-usuarios-service';
import { apiRolesService } from '../../servicios/api/api-roles-service';
import type { Company, Department } from '../../tipos';

interface Props {
  users: AdminUser[];
  empresas: Company[];
  departamentos: Department[];
  onClose: () => void;
  onChanged: () => void;
}

/** 10J — Asignación masiva de un rol a los usuarios seleccionados. */
export const BulkAssignModal: React.FC<Props> = ({ users, empresas, departamentos, onClose, onChanged }) => {
  const [roles, setRoles] = React.useState<Array<{ code: string; name: string }>>([]);
  const [loadingRoles, setLoadingRoles] = React.useState(true);
  const [roleCode, setRoleCode] = React.useState('');
  const [companyId, setCompanyId] = React.useState('');
  const [departmentId, setDepartmentId] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<BulkAssignResult | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await apiRolesService.listar();
        if (!cancelled) setRoles(list.map(r => ({ code: r.code, name: r.name })));
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'No se pudieron cargar los roles.');
      } finally {
        if (!cancelled) setLoadingRoles(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedRole = roles.find(r => r.code === roleCode);
  const deptosDeEmpresa = companyId ? departamentos.filter(d => d.companyId === companyId) : [];
  const nameOf = (id: string) => users.find(u => u.id === id)?.displayName ?? id;

  const execute = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiUsuariosService.asignarRolMasivo({
        userIds: users.map(u => u.id),
        roleCode,
        companyId,
        departmentId: departmentId || null,
      });
      setResult(res);
      setConfirming(false);
      onChanged();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar. Reintenta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Asignar rol a ${users.length} usuario${users.length === 1 ? '' : 's'}`}>
      <div className="stack-sm">
        {loadingRoles && <Skeleton height={36} />}
        {error && <Alert tone="danger">{error}</Alert>}

        {!result && (
          <>
            <Field label="Rol" required>
              <Select value={roleCode} onChange={e => { setRoleCode(e.target.value); setConfirming(false); }} aria-label="Rol">
                <option value="">Seleccionar rol...</option>
                {roles.map(r => <option key={r.code} value={r.code}>{r.code} — {r.name}</option>)}
              </Select>
            </Field>
            {selectedRole && (
              <p className="muted small">Rol: <strong>{selectedRole.code}</strong> ({selectedRole.name}) → {users.length} usuario{users.length === 1 ? '' : 's'}: {users.slice(0, 5).map(u => u.displayName).join(', ')}{users.length > 5 ? '…' : ''}</p>
            )}
            <Field label="Empresa" required>
              <Select value={companyId} onChange={e => { setCompanyId(e.target.value); setDepartmentId(''); setConfirming(false); }} aria-label="Empresa">
                <option value="">Seleccionar empresa...</option>
                {empresas.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </Select>
            </Field>
            <Field label="Departamento" helper="Opcional. Solo departamentos de la empresa elegida.">
              <Select value={departmentId} onChange={e => { setDepartmentId(e.target.value); setConfirming(false); }} aria-label="Departamento" disabled={!companyId}>
                <option value="">Sin departamento</option>
                {deptosDeEmpresa.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
              </Select>
            </Field>

            {!confirming ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button disabled={!roleCode || !companyId || saving} onClick={() => setConfirming(true)}>Asignar rol</Button>
              </div>
            ) : null}
            <ConfirmDialog
              open={confirming}
              title="Asignar rol"
              desc={`¿Asignar el rol ${roleCode} a ${users.length} usuario${users.length === 1 ? '' : 's'}?`}
              confirmLabel="Confirmar"
              busy={saving}
              onCancel={() => setConfirming(false)}
              onConfirm={() => void execute()}
            />
          </>
        )}

        {result && (
          <div className="stack-sm">
            <Alert tone="success">
              Asignación completada — {result.total} usuario{result.total === 1 ? '' : 's'} procesado{result.total === 1 ? '' : 's'}
            </Alert>
            <p>✓ {result.assigned} asignados · ↔ {result.alreadyAssigned} ya tenían el rol · ✕ {result.failed} errores</p>
            {result.failed > 0 && (
              <ul>
                {result.results.filter(r => r.status === 'FAILED').map(r => (
                  <li key={r.userId}><strong>{nameOf(r.userId)}</strong> <span className="muted small">{r.message || 'Error'}</span></li>
                ))}
              </ul>
            )}
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          </div>
        )}
      </div>
    </Modal>
  );
};
