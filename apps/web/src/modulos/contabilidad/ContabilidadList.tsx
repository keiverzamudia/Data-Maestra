import * as React from 'react';
import { Can } from '../../componentes/auth/Can';
import { useCompany } from '../../contextos/CompanyContext';
import { accountingService } from '../../servicios';
import { useCatalogos } from '../../hooks/useCatalogos';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { Button, SearchInput, StatusBadge, EmptyState, Modal, Textarea, Alert, ConfirmDialog, ErrorState, Skeleton } from '../../componentes/ui';
import { Page } from '../../componentes/ui';
import { WorkflowStepper } from '../../componentes/workflow';
import {
  RequestSummary, AccountingStandardPanel, ValidationChecklist, DecisionPanel,
  type ContabilidadEntry, type CheckEvidence, type CheckStatus,
} from '../../componentes/contabilidad';
import { apiProfitService, type ProfitGroupStandard } from '../../servicios/api/api-profit-service';
import { serializarDis } from '../../utilidades/dis';
import type { Request } from '../../tipos';

function findName(list: { id: string; name: string }[], id?: string) {
  return list.find(x => x.id === id)?.name || '—';
}


export const AccountingList: React.FC = () => {
  const { companyId } = useCompany();
  const { grupos, subgrupos, categorias, marcas } = useCatalogos();
  const { usuarios, departamentos } = useOrganizacion(companyId);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Request | null>(null);
  const [entries, setEntries] = React.useState<ContabilidadEntry[]>([]);
  // 12C — estándar del grupo desde Profit (lin_art.dis_cen), consultado en vivo.
  const [std, setStd] = React.useState<ProfitGroupStandard | null>(null);
  const [stdLoading, setStdLoading] = React.useState(false);
  const [stdError, setStdError] = React.useState<string | null>(null);
  // 12D — confirmación visible de la última verificación en vivo.
  const [stdUpdated, setStdUpdated] = React.useState(false);
  // 12G — fecha de la última verificación exitosa del estándar.
  const [verifiedAt, setVerifiedAt] = React.useState<string | null>(null);
  // 12E — detalle con trazabilidad (approvals); carga aparte del listado.
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [rejectModal, setRejectModal] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  // 12G — observaciones opcionales de la decisión (se guardan como comentario).
  const [notes, setNotes] = React.useState('');

  const loadList = React.useCallback(() => {
    setLoading(true);
    setListError(null);
    accountingService.getPendingApprovals(companyId).then(
      r => {
        setRequests(r);
        setLoading(false);
      },
      () => {
        setRequests([]);
        setListError('No pudimos cargar las clasificaciones pendientes.');
        setLoading(false);
      },
    );
  }, [companyId]);

  React.useEffect(() => { loadList(); }, [loadList]);

  const loadStandard = React.useCallback(async (req: Request) => {
    const groupCode = grupos.find(g => g.id === req.groupId)?.code?.trim();
    setStd(null);
    setStdError(null);
    setStdUpdated(false);
    setVerifiedAt(null);
    setEntries([]);
    if (!groupCode) {
      return;
    }
    setStdLoading(true);
    try {
      const res = await apiProfitService.getGroupStandard(groupCode);
      setStd(res);
      if (res.configured) {
        setStdUpdated(true);
        setVerifiedAt(new Date().toLocaleString('es-VE'));
        setEntries(res.positions.map(p => ({
          position: p.position as ContabilidadEntry['position'],
          code: p.code,
          description: p.description || '(cuenta fuera de catálogo Profit)',
          auto: true,
        })));
      }
    } catch (err: any) {
      setStdError(err?.message || 'No se pudo consultar Profit.');
    } finally {
      setStdLoading(false);
    }
  }, [grupos]);

  const openDetail = (r: Request) => {
    setSelected(r);
    setError(null);
    setNotes('');
    setDetailLoading(true);
    // Detalle con aprobaciones (trazabilidad real); si falla, se usa la fila.
    accountingService.getAccountingDetail(r.id).then(
      d => {
        setSelected(d);
        setDetailLoading(false);
        void loadStandard(d);
      },
      () => {
        setDetailLoading(false);
        void loadStandard(r);
      },
    );
  };

  const filtered = search
    ? requests.filter(r => r.requestedDescription.toLowerCase().includes(search.toLowerCase()))
    : requests;

  const handleApprove = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      await accountingService.approveAccounting(
        selected.id,
        entries.map(e => ({ code: e.code, description: e.description, position: e.position })),
        notes.trim() || undefined,
      );
      setSelected(null);
      setEntries([]);
      setNotes('');
      accountingService.getPendingApprovals(companyId).then(setRequests);
      accountingService.getPendingApprovals(companyId).then(setRequests);
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
      accountingService.getPendingApprovals(companyId).then(setRequests);
    } catch (err: any) {
      setError(err?.message || 'Error al rechazar la solicitud.');
    } finally {
      setSaving(false);
    }
  };

  if (selected) {
    const requester = usuarios.find(u => u.id === selected.requesterId);
    const dept = departamentos.find(d => d.id === selected.departmentId);
    const groupName = findName(grupos, selected.groupId);
    const groupCode = grupos.find(g => g.id === selected.groupId)?.code?.trim() || '—';
    const subName = findName(subgrupos, selected.subgroupId);
    const stdCheck: CheckStatus = stdError ? 'error' : stdLoading ? 'pending' : !std ? 'pending' : std.configured ? 'ok' : 'blocked';
    const posList = entries.map(e => e.position.toUpperCase()).join(', ');
    const masterCode = selected.masterCode || (selected.groupId && selected.subgroupId
      ? `${grupos.find(g => g.id === selected.groupId)?.code || ''}${subgrupos.find(s => s.id === selected.subgroupId)?.code || ''}000001`
      : '—');
    const checks: CheckEvidence[] = [
      {
        label: 'Grupo', status: selected.groupId ? 'ok' : 'missing',
        value: `${groupName} (${groupCode})`,
        verification: 'El grupo corresponde a la clasificación aprobada por Almacén.',
        origin: 'Clasificación de Almacén',
        result: selected.groupId ? 'Validación correcta' : 'Faltante',
      },
      {
        label: 'Subgrupo', status: selected.subgroupId ? 'ok' : 'missing',
        value: subName,
        verification: 'El subgrupo está informado; la combinación grupo/subgrupo fue validada al clasificar en Almacén.',
        origin: 'Clasificación de Almacén',
        result: selected.subgroupId ? 'Validación correcta' : 'Faltante',
      },
      {
        label: 'Código Master', status: !!selected.masterCode && /^[A-Z0-9]+-[0-9]{5}$/.test(selected.masterCode) ? 'ok' : 'missing',
        value: selected.masterCode ?? '—',
        verification: 'Existe un código Master propuesto para la solicitud.',
        origin: 'Clasificación recibida de Almacén.',
        result: selected.masterCode ? 'Validación correcta' : 'Faltante',
      },
      {
        label: 'Estándar Profit', status: stdCheck,
        value: std && std.configured ? 'Configurado' : groupName,
        verification: `Profit contiene un estándar contable para el grupo ${groupName}.`,
        origin: 'Profit · lin_art.dis_cen',
        result: stdError ? 'No fue posible verificar Profit.'
          : stdLoading || !std ? 'Consultando…'
          : std.configured ? `${std.positions.length} posiciones` : 'No configurado',
      },
      {
        label: 'Posiciones contables', status: entries.length >= 1 ? 'ok' : stdCheck === 'ok' ? 'missing' : stdCheck,
        value: entries.length >= 1 ? `${entries.length} — ${posList}` : 'Sin posiciones cargadas',
        verification: 'Se encontró al menos una posición contable válida en el estándar del grupo.',
        origin: 'Profit',
        result: entries.length >= 1 ? `${entries.length} posiciones encontradas` : undefined,
      },
    ];
    const missing = checks.filter(c => c.status !== 'ok').length;
    const ready = missing === 0 && !stdLoading;
    const dis = (() => {
      try {
        return serializarDis(entries.map(e => ({ position: parseInt(e.position.slice(1), 10) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, code: e.code })));
      } catch {
        return '<DIS></DIS>';
      }
    })();
    const lastApproval = (selected.approvals ?? []).filter(a => a.action === 'APPROVE').slice(-1)[0];
    const lastChange = lastApproval
      ? `${lastApproval.actor?.displayName ?? '—'} · ${new Date(lastApproval.createdAt).toLocaleString('es-VE')}`
      : null;

    return (
      <Page
        title={`Aprobación Contable — ${selected.requestNumber}`}
        desc={selected.requestedDescription}
        actions={<span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{detailLoading && <span className="muted small">Cargando trazabilidad…</span>}<Button variant="secondary" onClick={() => setSelected(null)}>Volver</Button></span>}
      >
        {/* CAPA 1 — cabecera con estado y acciones */}
        <section className="card p16" aria-label="Cabecera de solicitud">
          <div className="acct-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 className="acct-title">Aprobación Contable — {selected.requestNumber}</h2>
              <StatusBadge status={selected.status} />
            </div>
            <div className="acct-actions">
              <Can permission="ACCOUNTING.APPROVE">
                <Button variant="danger" size="sm" onClick={() => setRejectModal(true)} disabled={saving}>✕ Rechazar</Button>
                <Button size="sm" onClick={() => setConfirmApprove(true)} disabled={saving || !ready} title={!ready ? 'Complete los requisitos del checklist' : undefined}>
                  {saving ? 'Procesando…' : '✓ Aprobar Solicitud'}
                </Button>
              </Can>
            </div>
          </div>
          <p className="muted small" style={{ marginTop: 4 }}>{selected.requestedDescription} · Esta solicitud requiere validación del estándar de cuentas contables.</p>
        </section>

        {/* CAPA 2 — stepper compacto */}
        <section className="card p16" aria-label="Progreso del workflow">
          <WorkflowStepper status={selected.status} compact />
        </section>

        {/* CAPA 3+4 — workspace 65/35 */}
        <div className="acct-workspace">
          <div className="stack">
            <RequestSummary
              masterCode={masterCode}
              description={selected.requestedDescription}
              requester={requester?.displayName || '—'}
              department={dept?.name || usuarios.find(u => u.id === selected.requesterId)?.displayName || '—'}
              group={`${groupName} (${groupCode})`}
              subgroup={subName}
              category={findName(categorias, selected.categoryId)}
              brand={findName(marcas, selected.brandId)}
              unit={selected.unitId}
              partNumber={selected.partNumber}
              approvals={selected.approvals}
              photoUri={selected.referencePhotoUri}
              onOpenPhoto={() => setLightboxOpen(true)}
              lightboxOpen={lightboxOpen}
              onClosePhoto={() => setLightboxOpen(false)}
            />

            <AccountingStandardPanel
              groupName={groupName}
              groupCode={groupCode}
              std={std}
              stdLoading={stdLoading}
              stdError={stdError}
              verifiedAt={verifiedAt}
              dis={dis}
              onVerify={() => void loadStandard(selected)}
            />
            {error && <Alert tone="danger">{error}</Alert>}
          </div>

          <div className="stack">
            <ValidationChecklist checks={checks} ready={ready} missing={missing} loading={stdLoading} />
            <DecisionPanel
              ready={ready}
              missing={missing}
              saving={saving}
              notes={notes}
              onNotes={setNotes}
              onApprove={() => setConfirmApprove(true)}
              onReject={() => setRejectModal(true)}
              lastChange={lastChange}
            />
          </div>
        </div>

        <ConfirmDialog
          open={confirmApprove}
          title="Aprobar revisión contable"
          desc="¿Aprobar esta solicitud? Pasará a Validación Maestra con los códigos contables indicados."
          confirmLabel="Aprobar"
          busy={saving}
          onCancel={() => setConfirmApprove(false)}
          onConfirm={() => { setConfirmApprove(false); void handleApprove(); }}
        />

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
      </Page>
    );
  }


  return (
    <Page
      title="Contabilidad"
      desc={loading ? 'Revisa y aprueba las clasificaciones desde el punto de vista contable.' : `${filtered.length} clasificación${filtered.length === 1 ? '' : 'es'} por revisar.`}
    >
      <div className="toolbar" role="search">
        <span className="grow"><SearchInput value={search} onChange={setSearch} placeholder="Buscar por descripción..." /></span>
      </div>

      {loading && (
        <div className="card p16 stack-sm" aria-label="Cargando clasificaciones">
          <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} />
        </div>
      )}
      {!loading && listError && <ErrorState title="No pudimos cargar las clasificaciones pendientes." onRetry={loadList} />}
      {!loading && !listError && filtered.length === 0 && (
        <EmptyState title="No hay clasificaciones pendientes" desc="Todas las clasificaciones han sido procesadas" />
      )}
      {!loading && !listError && filtered.length > 0 && (
        <div className="card table-responsive">
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
                  <td data-label="N°"><strong>#{r.requestNumber}</strong></td>
                  <td data-label="Descripción" className="ellipsis">{r.requestedDescription}</td>
                  <td data-label="Grupo">{findName(grupos, r.groupId)}</td>
                  <td data-label="Subgrupo">{findName(subgrupos, r.subgroupId)}</td>
                  <td data-label="Marca">{findName(marcas, r.brandId)}</td>
                  <td data-label="Código Master">
                    <span className="master-code-display" style={{ fontSize: 12 }}>
                      {r.masterCode || (r.groupId && r.subgroupId
                        ? `${grupos.find(g => g.id === r.groupId)?.code || ''}${subgrupos.find(s => s.id === r.subgroupId)?.code || ''}000001`
                        : '—')}
                    </span>
                  </td>
                  <td data-label="Solicitante">{usuarios.find(u => u.id === r.requesterId)?.displayName || '—'}</td>
                  <td data-label="Acción">
                    <Button size="sm" onClick={() => openDetail(r)}>Revisar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
};
