import * as React from 'react';
import { useSession } from '../../contextos/SessionContext';
import {
  apiCorporateService,
  CORPORATE_STATE_LABELS,
  CORPORATE_OP_LABELS,
  type CorporateCompany,
  type CorporateCompareResult,
  type CorporatePreflight,
} from '../../servicios/api/api-corporate-service';
import {
  Button, Alert, EmptyState, Skeleton, ErrorState, DataTable, ConfirmDialog, Badge, type DataColumn,
} from '../../componentes/ui';
import { HelpButton } from '../../componentes/ayuda';

/**
 * Homologación corporativa multiempresa (FASE 17).
 * Empresa estándar: AD_TRANS. Destinos: selección múltiple desde el
 * catálogo corporativo (si mañana aparece una empresa, aparece sola).
 * Comparar y Validar son solo lectura. Homologar exige PROFIT.WRITE y
 * ejecuta en transacción global: una empresa falla = cero escrituras.
 */
export const HomologacionCorporativa: React.FC = () => {
  const { hasPermission } = useSession();
  const canWrite = hasPermission('PROFIT.WRITE');
  const [companies, setCompanies] = React.useState<CorporateCompany[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loadingCompanies, setLoadingCompanies] = React.useState(true);
  const [companiesError, setCompaniesError] = React.useState<string | null>(null);
  const [compare, setCompare] = React.useState<CorporateCompareResult | null>(null);
  const [preflight, setPreflight] = React.useState<CorporatePreflight | null>(null);
  const [busy, setBusy] = React.useState<'compare' | 'preflight' | 'homologate' | null>(null);
  const [confirmHomologate, setConfirmHomologate] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [detailCompany, setDetailCompany] = React.useState('');

  const standard = React.useMemo(() => companies.find((c) => c.isStandard) ?? null, [companies]);
  const destinos = React.useMemo(() => companies.filter((c) => !c.isStandard), [companies]);

  const loadCompanies = React.useCallback(() => {
    setLoadingCompanies(true);
    setCompaniesError(null);
    apiCorporateService.companies().then(
      (list) => {
        setCompanies(list);
        setLoadingCompanies(false);
      },
      (err: any) => {
        setCompaniesError(err?.message || 'No pudimos cargar las empresas.');
        setLoadingCompanies(false);
      },
    );
  }, []);

  React.useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setCompare(null);
    setPreflight(null);
    setNotice(null);
    setError(null);
  };

  const chosen = [...selected];

  const runCompare = async () => {
    if (busy || chosen.length === 0) return;
    setBusy('compare');
    setError(null);
    setNotice(null);
    try {
      const r = await apiCorporateService.compare(chosen);
      setCompare(r);
      setDetailCompany(r.companies[0]?.company ?? '');
      const totals = r.companies.reduce(
        (acc, c) => ({
          iguales: acc.iguales + c.summary.iguales,
          faltantes: acc.faltantes + c.summary.faltantes,
          descripciones: acc.descripciones + c.summary.descripcionesDiferentes,
          bloqueados: acc.bloqueados + c.summary.bloqueados,
        }),
        { iguales: 0, faltantes: 0, descripciones: 0, bloqueados: 0 },
      );
      setNotice(
        `Empresas seleccionadas: ${r.companies.length} · Elementos nuevos: ${totals.faltantes} · ` +
        `Descripciones a actualizar: ${totals.descripciones} · Bloqueos: ${totals.bloqueados} · ` +
        (r.executable ? 'Resultado: Listo para sincronizar.' : 'Resultado: Hay elementos que requieren revisión.'),
      );
    } catch (err: any) {
      setError(err?.message || 'No se pudo comparar.');
    } finally {
      setBusy(null);
    }
  };

  const runPreflight = async () => {
    if (busy || chosen.length === 0) return;
    setBusy('preflight');
    setError(null);
    try {
      const r = await apiCorporateService.preflight(chosen);
      setPreflight(r);
      if (!r.ok) {
        setError('No se realizó ninguna escritura porque una de las empresas no superó la validación.');
      } else {
        setNotice('Validación superada en todas las empresas seleccionadas.');
      }
    } catch (err: any) {
      setError(err?.message || 'No se pudo validar.');
    } finally {
      setBusy(null);
    }
  };

  const runHomologate = async () => {
    setConfirmHomologate(false);
    if (busy || chosen.length === 0) return;
    setBusy('homologate');
    setError(null);
    try {
      const r = await apiCorporateService.homologate(chosen);
      if (r.ok) {
        setNotice(`Homologación completada: ${r.inserts} elementos creados, ${r.updates} descripciones actualizadas.`);
        setCompare(null);
        setPreflight(null);
      } else {
        setError(r.errorDetail || 'No se realizó ninguna escritura.');
      }
    } catch (err: any) {
      setError(err?.message || 'No se realizó ninguna escritura.');
    } finally {
      setBusy(null);
    }
  };

  const detail = compare?.companies.find((c) => c.company === detailCompany) ?? null;
  const detailRows = React.useMemo(
    () => (detail?.items ?? []).filter((i) => i.operation !== 'NO_ACTION'),
    [detail],
  );

  const columns: DataColumn<(typeof detailRows)[number]>[] = [
    { key: 'catalog', header: 'Catálogo', label: 'Catálogo', render: (r) => <span>{r.catalog}</span> },
    { key: 'code', header: 'Código', label: 'Código', render: (r) => <strong className="mono">{r.code}</strong> },
    { key: 'std', header: 'Valor estándar', label: 'Valor estándar', render: (r) => <span className="ellipsis">{r.standardValue || '—'}</span> },
    { key: 'dest', header: 'Valor destino', label: 'Valor destino', render: (r) => <span className="ellipsis">{r.destValue || '—'}</span> },
    {
      key: 'state', header: 'Estado', label: 'Estado',
      render: (r) => <Badge tone={r.operation === 'BLOCKED' ? 'red' : r.operation === 'NO_ACTION' ? 'gray' : 'blue'}>{CORPORATE_STATE_LABELS[r.state]}</Badge>,
    },
    { key: 'action', header: 'Acción', label: 'Acción', render: (r) => <span className="muted small">{CORPORATE_OP_LABELS[r.operation]}</span> },
  ];

  return (
    <div className="stack-sm">
      <div className="card p16 stack-sm">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong>Empresa estándar: {standard ? `${standard.code}` : '…'}</strong>
          {standard && <Badge tone="green">Estándar corporativo</Badge>}
          <span className="grow" />
          <HelpButton helpKey="homologacion" />
        </div>
        {standard && <p className="muted small">{standard.name}</p>}

        {loadingCompanies && (
          <div className="stack-sm" aria-label="Cargando empresas">
            <Skeleton height={16} width="30%" /><Skeleton height={40} />
          </div>
        )}
        {!loadingCompanies && companiesError && (
          <ErrorState title="No pudimos cargar las empresas." onRetry={loadCompanies} />
        )}
        {!loadingCompanies && !companiesError && destinos.length === 0 && (
          <EmptyState title="Sin empresas destino" desc="Solo está registrada la empresa estándar." />
        )}
        {!loadingCompanies && !companiesError && destinos.length > 0 && (
          <fieldset>
            <legend className="muted small">Empresas destino</legend>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {destinos.map((c) => (
                <label key={c.code} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(c.code)}
                    onChange={() => toggle(c.code)}
                    aria-label={`Destino ${c.code}`}
                  />
                  <span><strong className="mono">{c.code}</strong> <span className="muted small">{c.name}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="toolbar">
          <span className="muted small">{selected.size} empresa(s) seleccionada(s)</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={() => void runCompare()} disabled={busy !== null || chosen.length === 0}>
              {busy === 'compare' ? 'Comparando…' : 'Comparar'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void runPreflight()} disabled={busy !== null || chosen.length === 0}>
              {busy === 'preflight' ? 'Validando…' : 'Validar'}
            </Button>
            {canWrite && (
              <Button size="sm" onClick={() => setConfirmHomologate(true)} disabled={busy !== null || chosen.length === 0 || !compare?.executable}>
                {busy === 'homologate' ? 'Homologando…' : 'Homologar'}
              </Button>
            )}
          </span>
        </div>
        {!canWrite && (
          <p className="muted small">La homologación requiere permiso de escritura corporativa. La comparación y validación son de solo lectura.</p>
        )}
      </div>

      {notice && <Alert tone="info">{notice}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      {preflight && (
        <div className="card p16 stack-sm">
          <strong>Validación global</strong>
          <DataTable
            columns={[
              { key: 'c', header: 'Empresa', label: 'Empresa', render: (r: { company: string }) => <strong className="mono">{r.company}</strong> },
              {
                key: 's', header: 'Resultado', label: 'Resultado',
                render: (r: { ok: boolean }) => <Badge tone={r.ok ? 'green' : 'red'}>{r.ok ? 'Lista' : 'Bloqueada'}</Badge>,
              },
              {
                key: 'f', header: 'Motivo', label: 'Motivo',
                render: (r: { checks: CorporatePreflight['companies'][number]['checks'] }) => (
                  <span className="muted small">
                    {r.checks.filter((k) => !k.ok).map((k) => k.detail).join(' · ') || 'Sin observaciones.'}
                  </span>
                ),
              },
            ]}
            rows={preflight.companies}
            rowKey={(r) => r.company}
            caption="Resultado de la validación por empresa."
          />
        </div>
      )}

      {compare && detail && (
        <div className="card p16 stack-sm">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>Detalle de diferencias</strong>
            <span className="grow" />
            {compare.companies.map((c) => (
              <Button
                key={c.company}
                variant={c.company === detailCompany ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setDetailCompany(c.company)}
              >
                {c.company} ({c.summary.faltantes + c.summary.descripcionesDiferentes + c.summary.bloqueados})
              </Button>
            ))}
          </div>
          <p className="muted small">
            Iguales: {detail.summary.iguales} · Nuevos: {detail.summary.faltantes} ·
            Descripciones: {detail.summary.descripcionesDiferentes} · Bloqueados: {detail.summary.bloqueados}
          </p>
          {detailRows.length === 0 ? (
            <EmptyState title="Sin diferencias" desc={`${detail.company} coincide con el estándar corporativo.`} />
          ) : (
            <DataTable columns={columns} rows={detailRows} rowKey={(r) => `${r.catalog}|${r.code}`} caption="Diferencias contra el estándar." />
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmHomologate}
        title="Homologar catálogos"
        desc={`Se crearán los elementos faltantes y se actualizarán las descripciones en ${chosen.length} empresa(s) dentro de una sola operación. Si alguna empresa falla, no se escribe en ninguna.`}
        confirmLabel="Homologar"
        busy={busy === 'homologate'}
        onCancel={() => setConfirmHomologate(false)}
        onConfirm={() => void runHomologate()}
      />
    </div>
  );
};
