import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../contextos/SessionContext';
import { accountingService } from '../../servicios';
import { useCatalogos } from '../../hooks/useCatalogos';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { PageHeader, Button, SearchInput, StatusBadge, EmptyState, Modal, Input, Textarea } from '../../componentes/ui';
import { WorkflowTimeline } from '../../componentes/workflow';
import type { AccountingCode } from '../../contratos';
import type { Request } from '../../tipos';

function findName(list: { id: string; name: string }[], id?: string) {
  return list.find(x => x.id === id)?.name || '—';
}

export const AccountingList: React.FC = () => {
  const { session } = useSession();
  const { grupos, subgrupos, categorias, marcas } = useCatalogos();
  const { usuarios, departamentos } = useOrganizacion(session.company.id);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Request | null>(null);
  const [codes, setCodes] = React.useState<AccountingCode[]>([{ code: '', description: '' }]);
  const [rejectModal, setRejectModal] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const navigate = useNavigate();

  React.useEffect(() => {
    setLoading(true);
    accountingService.getPendingApprovals(session.company.id).then(r => {
      setRequests(r);
      setLoading(false);
    });
  }, [session.company.id]);

  const filtered = search
    ? requests.filter(r => r.requestedDescription.toLowerCase().includes(search.toLowerCase()))
    : requests;

  const addCode = () => setCodes([...codes, { code: '', description: '' }]);
  const removeCode = (i: number) => setCodes(codes.filter((_, idx) => idx !== i));
  const updateCode = (i: number, field: keyof AccountingCode, value: string) => {
    setCodes(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };

  const handleApprove = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      await accountingService.approveAccounting(selected.id, codes.filter(c => c.code));
      setSelected(null);
      setCodes([{ code: '', description: '' }]);
      accountingService.getPendingApprovals(session.company.id).then(setRequests);
    } catch (err: any) {
      setError(err?.message || 'Error al aprobar la solicitud contable.');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      await accountingService.rejectAccounting(selected.id, rejectReason);
      setSelected(null);
      setRejectModal(false);
      setRejectReason('');
      accountingService.getPendingApprovals(session.company.id).then(setRequests);
    } catch (err: any) {
      setError(err?.message || 'Error al rechazar la solicitud.');
    } finally {
      setSaving(false);
    }
  };

  if (selected) {
    const requester = usuarios.find(u => u.id === selected.requesterId);
    const dept = departamentos.find(d => d.id === selected.departmentId);

    return (
      <div className="stack">
        <PageHeader
          title={`Aprobación Contable — ${selected.requestNumber}`}
          action={<Button variant="secondary" onClick={() => setSelected(null)}>Volver</Button>}
        />

        <WorkflowTimeline status={selected.status} />

        <div className="grid2">
          <div className="stack">
            <div className="card p16">
              <h3 className="h1" style={{ fontSize: 16 }}>Clasificación de Almacén</h3>
              <div className="review-grid" style={{ marginTop: 8 }}>
                <div><span className="muted small">Descripción</span><br /><strong>{selected.requestedDescription}</strong></div>
                <div><span className="muted small">Solicitante</span><br /><strong>{requester?.displayName || '—'}</strong></div>
                <div><span className="muted small">Grupo</span><br /><strong>{findName(grupos, selected.groupId)}</strong></div>
                <div><span className="muted small">Subgrupo</span><br /><strong>{findName(subgrupos, selected.subgroupId)}</strong></div>
                <div><span className="muted small">Categoría</span><br /><strong>{findName(categorias, selected.categoryId)}</strong></div>
                <div><span className="muted small">Marca</span><br /><strong>{findName(marcas, selected.brandId)}</strong></div>
                {selected.partNumber && <div><span className="muted small">Part Number</span><br /><strong>{selected.partNumber}</strong></div>}
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>⚠ La clasificación fue realizada por Almacén. Contabilidad NO puede modificar grupo, subgrupo, categoría ni marca.</p>
            </div>

            <div className="card p16">
              <h3 className="h1" style={{ fontSize: 16 }}>Información Contable</h3>
              <p className="muted small" style={{ marginTop: 4, marginBottom: 12 }}>
                Agregue uno o más códigos de información contable.
              </p>

              {codes.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
                  <label style={{ flex: 1 }}>
                    <span className="muted small">Código</span>
                    <Input placeholder="Ej: 5010-01" value={c.code} onChange={e => updateCode(i, 'code', e.target.value)} />
                  </label>
                  <label style={{ flex: 2 }}>
                    <span className="muted small">Descripción</span>
                    <Input placeholder="Ej: Repuestos vehículos" value={c.description} onChange={e => updateCode(i, 'description', e.target.value)} />
                  </label>
                  {codes.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeCode(i)}>✕</Button>
                  )}
                </div>
              ))}

              <Button variant="ghost" size="sm" onClick={addCode}>+ Agregar código</Button>
            </div>

            <div className="form-actions">
              <Button variant="danger" onClick={() => setRejectModal(true)} disabled={saving}>Rechazar</Button>
              <Button onClick={handleApprove} disabled={saving || !codes.some(c => c.code)}>{saving ? 'Procesando...' : 'Aprobar'}</Button>
            </div>

            {error && (
              <div className="alert" style={{ marginTop: 8, background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>
                {error}
              </div>
            )}
          </div>

          <div className="side-panel">
            <div className="card p16">
              <span className="muted small">Código Master Propuesto</span>
              <div className="master-code-display" style={{ marginTop: 4 }}>
                {selected.masterCode || (selected.groupId && selected.subgroupId
                  ? `${grupos.find(g => g.id === selected.groupId)?.code || ''}${subgrupos.find(s => s.id === selected.subgroupId)?.code || ''}000001`
                  : '—')}
              </div>
            </div>
          </div>
        </div>

        <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Rechazar Clasificación">
          <div className="stack-sm">
            <p className="muted">Indique el motivo del rechazo:</p>
            <Textarea
              placeholder="Ejemplo: Código contable incorrecto, información incompleta..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
            />
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setRejectModal(false)} disabled={saving}>Cancelar</Button>
              <Button variant="danger" onClick={handleReject} disabled={saving || !rejectReason.trim()}>{saving ? 'Rechazando...' : 'Rechazar'}</Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader title="Contabilidad" subtitle="Clasificaciones pendientes de aprobación contable" />

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por descripción..." />

      {loading ? (
        <div className="empty">Cargando...</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No hay clasificaciones pendientes" desc="Todas las clasificaciones han sido procesadas" />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Descripción</th>
                <th>Grupo</th>
                <th>Subgrupo</th>
                <th>Marca</th>
                <th>Código Master</th>
                <th>Solicitante</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.requestNumber}</strong></td>
                  <td className="ellipsis">{r.requestedDescription}</td>
                  <td>{findName(grupos, r.groupId)}</td>
                  <td>{findName(subgrupos, r.subgroupId)}</td>
                  <td>{findName(marcas, r.brandId)}</td>
                  <td>
                    <span className="master-code-display" style={{ fontSize: 12 }}>
                      {r.masterCode || (r.groupId && r.subgroupId
                        ? `${grupos.find(g => g.id === r.groupId)?.code || ''}${subgrupos.find(s => s.id === r.subgroupId)?.code || ''}000001`
                        : '—')}
                    </span>
                  </td>
                  <td>{usuarios.find(u => u.id === r.requesterId)?.displayName || '—'}</td>
                  <td>
                    <Button size="sm" onClick={() => { setSelected(r); setCodes([{ code: '', description: '' }]); }}>Revisar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
