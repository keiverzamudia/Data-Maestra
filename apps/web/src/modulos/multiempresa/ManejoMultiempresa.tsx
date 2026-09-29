import * as React from 'react';
import { useSession } from '../../contextos/SessionContext';
import { Page, SectionCard, Button, Alert, Badge, Input, EmptyState, ErrorState, Skeleton, ConfirmDialog } from '../../componentes/ui';
import {
  apiMultiempresaSyncService,
  type CatalogAnalysis,
  type MultiEmpresaStatus,
  type ProposalView,
} from '../../servicios/api/api-multiempresa-sync-service';

const REASON_TONE: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  FALTA: 'yellow',
  CONFLICTO: 'red',
};

const REASON_LABEL: Record<string, string> = {
  FALTA: 'No existe en la empresa',
  CONFLICTO: 'El código ya existe con otra descripción',
};

const STATE_TONE: Record<string, 'green' | 'yellow' | 'red' | 'gray' | 'blue'> = {
  IGUAL: 'green',
  FALTA: 'yellow',
  CONFLICTO: 'red',
  RESUELTO: 'blue',
};

/**
 * FASE 27 — MANEJO MULTIEMPRESA.
 *
 * Flujo en 3 pasos, sin adivinar nunca:
 *   1. Copiar el catálogo maestro (AD_TRANS).
 *   2. Analizar cada empresa y generar las propuestas (COM1…) de lo que falta
 *      o de lo que choca.
 *   3. Una persona confirma cada propuesta: se crea el elemento en esa empresa
 *      y queda registrado el vínculo con el maestro.
 */
export const ManejoMultiempresa: React.FC = () => {
  const { hasPermission } = useSession();
  const canWrite = hasPermission('PROFIT.WRITE');
  const [status, setStatus] = React.useState<MultiEmpresaStatus | null>(null);
  const [analysis, setAnalysis] = React.useState<CatalogAnalysis | null>(null);
  const [proposals, setProposals] = React.useState<ProposalView[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [confirmAll, setConfirmAll] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setBusy('load');
    setError(null);
    try {
      const [s, p] = await Promise.all([
        apiMultiempresaSyncService.status(),
        apiMultiempresaSyncService.proposals(),
      ]);
      setStatus(s);
      setProposals(p);
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el estado.');
    } finally {
      setBusy(null);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || 'La operación falló.');
    } finally {
      setBusy(null);
    }
  };

  const syncMaster = () => run('master', async () => {
    const r = await apiMultiempresaSyncService.syncMaster();
    setInfo(`Catálogo maestro sincronizado: ${r.total} elementos de AD_TRANS.`);
    await load();
  });

  const analyze = () => run('analyze', async () => {
    const r = await apiMultiempresaSyncService.analyze();
    setAnalysis(r);
    setInfo(`Análisis terminado. ${r.pendingProposals} propuestas pendientes de tu decisión.`);
    await load();
  });

  const confirmOne = (p: ProposalView) => run(`p:${p.id}`, async () => {
    const code = edits[p.id] ?? p.localCode;
    await apiMultiempresaSyncService.confirm(p.id, code || undefined);
    setInfo(`${p.companyCode} · ${p.catalogLabel}: creado "${code}" para "${p.masterDescription}".`);
    setEdits((prev) => { const n = { ...prev }; delete n[p.id]; return n; });
    await load();
  });

  const rejectOne = (p: ProposalView) => run(`p:${p.id}`, async () => {
    await apiMultiempresaSyncService.reject(p.id);
    setInfo(`${p.companyCode} · ${p.catalogLabel}: propuesta rechazada. No se creó nada en Profit.`);
    await load();
  });

  const doConfirmAll = () => run(`all:${confirmAll}`, async () => {
    const company = confirmAll!;
    const r = await apiMultiempresaSyncService.confirmAll(company);
    setConfirmAll(null);
    setInfo(
      r.errors.length === 0
        ? `${company}: ${r.confirmed} elementos creados.`
        : `${company}: ${r.confirmed} creados, ${r.errors.length} con problema: ${r.errors.slice(0, 3).join(' | ')}`,
    );
    await load();
  });

  const pending = proposals.filter((p) => p.status === 'PENDING');
  const decided = proposals.filter((p) => p.status !== 'PENDING');
  const byCompany = React.useMemo(() => {
    const m = new Map<string, ProposalView[]>();
    for (const p of pending) {
      const arr = m.get(p.companyCode) ?? [];
      arr.push(p);
      m.set(p.companyCode, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pending]);

  const problems = (analysis?.companies ?? []).filter((c) => !c.isStandard && (c.counts.conflictos > 0 || c.counts.faltantes > 0));

  return (
    <Page
      title="Manejo Multiempresa"
      desc="Lleva los catálogos del maestro (AD_TRANS) a las demás empresas de TEmpresas. Si un código ya existe con otro significado, no se borra ni se renombra: se crea uno nuevo y tú lo confirmas."
      actions={busy === 'load' ? <Skeleton width={160} /> : <Button variant="secondary" onClick={() => void load()}>Actualizar</Button>}
    >
      <div className="stack-sm">
        {error && <Alert tone="danger">{error}</Alert>}
        {info && <Alert tone="success">{info}</Alert>}

        <SectionCard
          title="1. Catálogo maestro (AD_TRANS)"
          desc="Se copia desde Profit en modo solo lectura. Es la fuente de verdad de grupos, subgrupos, categorías, marcas, unidades, impuestos, procedencias y proveedores."
        >
          <div className="flex-between">
            <p>
              <strong>{status?.masterTotal ?? 0}</strong> <span className="muted small">elementos en el maestro</span>
            </p>
            <Button onClick={() => void syncMaster()} loading={busy === 'master'} disabled={Boolean(busy)}>
              Sincronizar maestro
            </Button>
          </div>
        </SectionCard>

        <SectionCard
          title="2. Analizar empresas"
          desc="Compara el maestro contra cada empresa y deja preparedas las propuestas de lo que falta o de lo que choca. Nada se escribe en Profit en este paso."
        >
          <div className="flex-between">
            <p className="muted small">
              {status?.pending?.length
                ? status.pending.map((x) => `${x.companyCode}: ${x.pending} pendiente(s)`).join(' · ')
                : 'Sin propuestas pendientes.'}
            </p>
            <Button onClick={() => void analyze()} loading={busy === 'analyze'} disabled={Boolean(busy)}>
              Analizar empresas
            </Button>
          </div>

          {analysis && (
            <div className="stack-sm">
              <p className="muted small">Maestro: {analysis.standard} · {analysis.masterTotal} elementos.</p>
              {problems.length === 0 ? (
                <Alert tone="success">Todas las empresas están alineadas con el maestro.</Alert>
              ) : (
                problems.map((c) => (
                  <div key={c.company} className="card p16">
                    <div className="flex-between">
                      <span>
                        <strong className="mono">{c.company}</strong>
                        <span className="muted small"> — {c.name}</span>
                      </span>
                      <span className="flex-between" style={{ gap: 8 }}>
                        <Badge tone="green">{c.counts.iguales} iguales</Badge>
                        <Badge tone="blue">{c.counts.resueltos} resueltos</Badge>
                        <Badge tone="yellow">{c.counts.faltantes} faltantes</Badge>
                        <Badge tone="red">{c.counts.conflictos} conflictos</Badge>
                      </span>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setExpanded((prev) => {
                        const n = new Set(prev);
                        if (n.has(c.company)) n.delete(c.company); else n.add(c.company);
                        return n;
                      })}
                      aria-expanded={expanded.has(c.company)}
                    >
                      {expanded.has(c.company) ? '▾ Ocultar detalle' : '▸ Ver detalle'}
                    </Button>
                    {expanded.has(c.company) && (
                      <ul className="match-list">
                        {c.lines.filter((l) => l.state !== 'IGUAL').map((l, i) => (
                          <li key={`${l.catalogKey}-${l.masterCode}-${i}`}>
                            <Badge tone={STATE_TONE[l.state]}>{l.state}</Badge>{' '}
                            <strong>{l.catalogLabel}</strong> · <span className="mono">{l.masterCode}</span> = {l.masterDescription}
                            <div className="muted small">{l.detail}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="3. Confirmar propuestas"
          desc="Cada fila propone un código. Al confirmar se crea el elemento en esa empresa y queda registrado el vínculo con el maestro. Requiere permiso de registro en Profit."
        >
          {!canWrite && (
            <Alert tone="warning"><strong>Sin autorización.</strong> Puedes revisar las propuestas, pero no crearlas en Profit.</Alert>
          )}

          {pending.length === 0 ? (
            <EmptyState title="No hay propuestas pendientes" desc="Cuando analices, aquí verás lo que falta o choca en cada empresa." />
          ) : (
            byCompany.map(([company, items]) => (
              <div key={company} className="card p16 stack-sm">
                <div className="flex-between">
                  <strong className="mono">{company}</strong>
                  <Button
                    size="sm" variant="secondary"
                    disabled={!canWrite || Boolean(busy)}
                    onClick={() => setConfirmAll(company)}
                  >
                    Confirmar todas ({items.length})
                  </Button>
                </div>
                {items.map((p) => (
                  <div key={p.id} className="card p16">
                    <div className="flex-between">
                      <span>
                        <Badge tone={REASON_TONE[p.reason] ?? 'gray'}>{REASON_LABEL[p.reason] ?? p.reason}</Badge>{' '}
                        <strong>{p.catalogLabel}</strong>
                      </span>
                    </div>
                    <p className="muted small">
                      Maestro: <span className="mono">{p.masterCode}</span> = {p.masterDescription}
                    </p>
                    <p className="muted small">{p.detail}</p>
                    <div className="flex-between" style={{ gap: 8, alignItems: 'flex-end' }}>
                      <label className="stack-sm" style={{ flex: 1 }}>
                        <span className="muted small">Código a crear en {company}</span>
                        <Input
                          value={edits[p.id] ?? p.localCode}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          disabled={!canWrite || Boolean(busy)}
                          aria-label={`Código a crear en ${company} para ${p.catalogLabel} ${p.masterCode}`}
                        />
                      </label>
                      <div className="flex-between" style={{ gap: 8 }}>
                        <Button size="sm" onClick={() => void confirmOne(p)} loading={busy === `p:${p.id}`} disabled={!canWrite || Boolean(busy)}>
                          Confirmar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void rejectOne(p)} disabled={!canWrite || Boolean(busy)}>
                          Rechazar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}

          {decided.length > 0 && (
            <details>
              <summary className="muted small">Historial de decisiones ({decided.length})</summary>
              <ul className="match-list">
                {decided.slice(0, 50).map((p) => (
                  <li key={p.id}>
                    <Badge tone={p.status === 'CONFIRMED' ? 'green' : 'gray'}>{p.status}</Badge>{' '}
                    <span className="mono">{p.companyCode}</span> · {p.catalogLabel} ·{' '}
                    <span className="mono">{p.masterCode}</span> → <span className="mono">{p.localCode}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </SectionCard>

        {error && <ErrorState title="No pudimos completar la operación." onRetry={() => void load()} />}

        <ConfirmDialog
          open={confirmAll !== null}
          title="Confirmar todas las propuestas"
          desc={confirmAll ? `Se crearán en Profit los ${pending.filter((p) => p.companyCode === confirmAll).length} elementos propuestos para ${confirmAll}. Las filas existentes con otro significado NO se modifican. Esta acción escribe en Profit.` : undefined}
          confirmLabel="Sí, crear en Profit"
          busy={Boolean(busy)}
          onCancel={() => setConfirmAll(null)}
          onConfirm={() => void doConfirmAll()}
        />
      </div>
    </Page>
  );
};
