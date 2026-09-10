import * as React from 'react';
import { Page, Button, Tabs, Alert, EmptyState, Drawer, ConfirmDialog } from '../../componentes/ui';
import { apiOrganizacionService } from '../../servicios/api/api-organizacion-service';
import { DepartamentosSection } from './DepartamentosSection';
import { CompanyModal } from './CompanyModal';
import { MigrateModal } from './MigrateModal';
import type { Company, Department, User } from '../../tipos';

interface Props {
  empresas: Company[];
  departamentos: Department[];
  usuarios: User[];
  onChanged: () => void;
}

/** 12I — Organización: Empresas y Departamentos con gestión completa. */
export const OrganizacionSection: React.FC<Props> = ({ empresas, departamentos, usuarios, onChanged }) => {
  const [tab, setTab] = React.useState(0);
  const [rows, setRows] = React.useState<Company[]>(empresas);
  const [companyModal, setCompanyModal] = React.useState<Company | null | 'new'>(null);
  const [migrateId, setMigrateId] = React.useState<string | null>(null);
  const [toggleId, setToggleId] = React.useState<string | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { setRows(empresas); }, [empresas]);

  const reload = async () => {
    try {
      setRows(await apiOrganizacionService.getEmpresas());
      onChanged();
    } catch {
      /* conserva lista actual */
    }
  };

  const toggleActive = async (c: Company) => {
    setBusy(true);
    setError(null);
    try {
      await apiOrganizacionService.actualizarEmpresa(c.id, { active: !c.active });
      setToggleId(null);
      await reload();
    } catch (err: any) {
      setError(err?.message || 'No se pudo cambiar el estado.');
    } finally {
      setBusy(false);
    }
  };

  const removeCompany = async (c: Company) => {
    setBusy(true);
    setError(null);
    try {
      await apiOrganizacionService.eliminarEmpresa(c.id);
      setDeleteId(null);
      await reload();
    } catch (err: any) {
      setError(err?.message || 'No se pudo retirar la empresa. Si tiene dependencias, migre primero.');
    } finally {
      setBusy(false);
    }
  };

  const migrating = migrateId ? rows.find(c => c.id === migrateId) ?? null : null;
  const toggling = toggleId ? rows.find(c => c.id === toggleId) ?? null : null;
  const deleting = deleteId ? rows.find(c => c.id === deleteId) ?? null : null;

  return (
    <Page title="Organización" desc="Empresas y departamentos del sistema.">
      <Tabs tabs={['Empresas', 'Departamentos']} active={tab} onChange={setTab} />

      {tab === 0 && (
        <div className="stack-sm">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button onClick={() => setCompanyModal('new')} disabled={busy}>+ Nueva empresa</Button>
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          {rows.length === 0 ? (
            <EmptyState title="Sin empresas" desc="No hay empresas registradas." />
          ) : (
            <div className="card table-responsive">
              <table className="table">
                <thead><tr><th>Nombre</th><th>Código</th><th>Estado</th><th>Usuarios</th><th>Departamentos</th><th>Acciones</th></tr></thead>
                <tbody>
                  {rows.map(c => (
                    <tr key={c.id}>
                      <td data-label="Nombre" className="cell-primary">{c.name}</td>
                      <td data-label="Código"><code>{c.code}</code></td>
                      <td data-label="Estado"><span className={`badge ${c.active ? 'badge-green' : 'badge-yellow'}`}>{c.active ? 'Activa' : 'Inactiva'}</span></td>
                      <td data-label="Usuarios">{c.userCount ?? '—'}</td>
                      <td data-label="Departamentos">{c.departmentCount ?? '—'}</td>
                      <td data-label="Acciones">
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <Button size="sm" variant="secondary" onClick={() => setCompanyModal(c)} disabled={busy}>Editar</Button>
                          <Button size="sm" variant="secondary" onClick={() => setToggleId(c.id)} disabled={busy}>
                            {c.active ? 'Desactivar' : 'Activar'}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setMigrateId(c.id)} disabled={busy || !c.active}>Migrar</Button>
                          <Button size="sm" variant="secondary" onClick={() => setDeleteId(c.id)} disabled={busy}>Retirar</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Drawer open={companyModal !== null} onClose={() => setCompanyModal(null)} title={companyModal === 'new' ? 'Nueva empresa' : `Editar — ${companyModal?.name ?? ''}`}>
            {companyModal !== null && (
              <CompanyModal
                company={companyModal === 'new' ? null : companyModal}
                empresas={rows}
                onClose={() => setCompanyModal(null)}
                onSaved={() => void reload()}
              />
            )}
          </Drawer>
          <Drawer open={!!migrating} onClose={() => setMigrateId(null)} title={migrating ? `Migrar — ${migrating.name}` : 'Migrar empresa'}>
            {migrating && (
              <MigrateModal from={migrating} empresas={rows} onClose={() => setMigrateId(null)} onDone={() => void reload()} />
            )}
          </Drawer>
          <ConfirmDialog
            open={toggling !== null}
            title={toggling?.active ? 'Desactivar empresa' : 'Activar empresa'}
            desc={toggling?.active
              ? `“${toggling?.name}” dejará de estar disponible para nuevas asignaciones. El historial se conserva.`
              : `“${toggling?.name}” volverá a estar disponible.`}
            confirmLabel={toggling?.active ? 'Desactivar' : 'Activar'}
            busy={busy}
            onCancel={() => setToggleId(null)}
            onConfirm={() => { if (toggling) void toggleActive(toggling); }}
          />
          <ConfirmDialog
            open={deleting !== null}
            title="Retirar empresa"
            desc={`Se eliminará “${deleting?.name}” solo si no tiene usuarios, departamentos, solicitudes ni auditoría. Si tiene dependencias, migre primero.`}
            confirmLabel="Retirar"
            busy={busy}
            onCancel={() => setDeleteId(null)}
            onConfirm={() => { if (deleting) void removeCompany(deleting); }}
          />
        </div>
      )}

      {tab === 1 && (
        <DepartamentosSection empresas={empresas} departamentos={departamentos} usuarios={usuarios} onChanged={onChanged} />
      )}
    </Page>
  );
};
