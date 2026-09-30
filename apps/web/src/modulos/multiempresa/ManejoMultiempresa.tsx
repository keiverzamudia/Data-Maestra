import * as React from 'react';
import { useSession } from '../../contextos/SessionContext';
import { Page, SectionCard, Button, Alert, Badge, Input, EmptyState, ErrorState, Skeleton, ConfirmDialog } from '../../componentes/ui';
import {
  apiMultiempresaSyncService,
  type CatalogAnalysis,
  type CatalogDiffLine,
  type CatalogCount,
  type CompanyCatalogReport,
  type MultiEmpresaStatus,
  type ProposalView,
} from '../../servicios/api/api-multiempresa-sync-service';

const PAGE_SIZE = 20;

const REASON_TONE: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = { FALTA: 'yellow', CONFLICTO: 'red' };
const REASON_LABEL: Record<string, string> = {
  FALTA: 'No existe en la empresa',
  CONFLICTO: 'El código ya existe con otra descripción',
};
const STATE_TONE: Record<string, 'green' | 'yellow' | 'red' | 'gray' | 'blue'> = {
  IGUAL: 'green', FALTA: 'yellow', CONFLICTO: 'red', RESUELTO: 'blue', CREADO: 'blue',
};
const STATE_LABEL: Record<string, string> = {
  IGUAL: 'Igual', FALTA: 'Falta', CONFLICTO: 'Conflicto', RESUELTO: 'Resuelto', CREADO: 'Creado',
};

/** Catálogos fuera del alcance por defecto: generan ruido en los contadores. */
const DISCARDABLE = ['prov', 'proceden'];
const DISCARD_LABEL: Record<string, string> = { prov: 'Proveedores', proceden: 'Procedencias' };

/**
 * Fusiona un análisis recortado (una sola empresa, quizá un solo catálogo) con
 * el análisis acumulado. Sin esto, entrar a un catálogo borraba del estado
 * los contadores de las demás empresas y de los demás catálogos, y al volver
 * atrás solo se veía la última tarjeta consultada.
 */
function mergeAnalysis(prev: CatalogAnalysis | null, next: CatalogAnalysis): CatalogAnalysis {
  if (!prev) return next;
  const incoming = new Map(next.companies.map((c) => [c.company, c]));
  const merged = prev.companies.map((c) => incoming.get(c.company) ?? c);
  for (const c of next.companies) {
    if (!merged.some((m) => m.company === c.company)) merged.push(c);
  }
  return {
    ...prev,
    companies: merged,
    pendingProposals: next.pendingProposals,
    autoCreated: prev.autoCreated + next.autoCreated,
    analyzedAt: next.analyzedAt,
  };
}

/**
 * FASE 27 — MANEJO MULTIEMPRESA.
 *
 * Navegación en 3 niveles para que nada quede desbordado:
 *   1. Maestro (AD_TRANS) → copiar.
 *   2. Empresa → contadores.
 *   3. Catálogo de esa empresa → detalle paginado.
 *
 * Reglas: los que solo FALTAN se crean solos (nunca se toca una fila
 * existente); los CONFLICTOS exigen decisión humana (código nuevo COM1…).
 */
export const ManejoMultiempresa: React.FC = () => {
  const { hasPermission } = useSession();
  const canWrite = hasPermission('PROFIT.WRITE');

  const [status, setStatus] = React.useState<MultiEmpresaStatus | null>(null);
  const [analysis, setAnalysis] = React.useState<CatalogAnalysis | null>(null);
  const [company, setCompany] = React.useState<string | null>(null);
  const [catalog, setCatalog] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const [showIguales, setShowIguales] = React.useState(false);
  const [includeProviders, setIncludeProviders] = React.useState(false);
  const [autoCreate, setAutoCreate] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [confirmAll, setConfirmAll] = React.useState<null | { company: string; catalog?: string; n: number }>(null);

  const loadStatus = React.useCallback(async () => {
    setBusy('status');
    try {
      setStatus(await apiMultiempresaSyncService.status());
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el estado.');
    } finally {
      setBusy(null);
    }
  }, []);

  React.useEffect(() => { void loadStatus(); }, [loadStatus]);

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
    await loadStatus();
  });

  // Paso 2: contadores por empresa (sin detalle, para que la carga sea ligera).
  const analyzeCompanies = () => run('analyze', async () => {
    const r = await apiMultiempresaSyncService.analyze({ includeProviders, autoCreate: false, limit: 1 });
    setAnalysis(r);
    setCompany(null);
    setCatalog(null);
    setPage(0);
    setInfo(`Análisis terminado. ${r.pendingProposals} propuestas pendientes de decisión.`);
    await loadStatus();
  });

  // Paso 3: detalle de una empresa + catálogo, paginado. Se ACUMULA sobre el
  // análisis previo para no perder los contadores del resto de empresas.
  const analyzeSlice = (co: string, cat?: string, offset = 0) => run('slice', async () => {
    const r = await apiMultiempresaSyncService.analyze({
      company: co, catalog: cat, includeProviders, autoCreate, limit: PAGE_SIZE, offset,
    });
    setAnalysis((prev) => mergeAnalysis(prev, r));
    setCompany(co);
    setCatalog(cat ?? null);
    setPage(Math.floor(offset / PAGE_SIZE));
    if (r.autoCreated > 0) setInfo(`${r.autoCreated} elementos creados automáticamente en ${co}.`);
    await loadStatus();
  });

  /** Cambia de nivel: limpia búsqueda, página y casillas marcadas. */
  const resetSelection = () => {
    setPicked(new Set());
    setEdits({});
    setSearch('');
    setPage(0);
  };

  // Al elegir empresa se pide SU análisis completo (sin filtro de catálogo)
  // para que la lista de catálogos no venga del recorte anterior.
  const openCompany = (co: string) => {
    resetSelection();
    void analyzeSlice(co, undefined, 0);
  };

  const openCatalog = (cat: string) => {
    resetSelection();
    void analyzeSlice(company!, cat, 0);
  };

  // "Atrás": vuelve al nivel de catálogos repidiendo el análisis sin filtro.
  const backToCatalogs = () => {
    if (!company) return;
    resetSelection();
    setCatalog(null);
    void analyzeSlice(company, undefined, 0);
  };

  // Opción A: descartar las propuestas de catálogos fuera de alcance.
  const discardOutOfScope = () => run('discard', async () => {
    const r = await apiMultiempresaSyncService.discardCatalogs(DISCARDABLE);
    setInfo(
      r.rejected > 0
        ? `${r.rejected} propuestas descartadas (${r.catalogs.map((c) => DISCARD_LABEL[c] ?? c).join(', ')}). No se escribió nada en Profit.`
        : 'No había propuestas de esos catálogos por descartar.',
    );
    await loadStatus();
  });

  const currentReport: CompanyCatalogReport | undefined =
    analysis?.companies.find((c) => c.company === company);
  const currentCatalog: CatalogCount | undefined =
    currentReport?.catalogs.find((c) => c.key === catalog);

  const lines: CatalogDiffLine[] = React.useMemo(() => {
    const base = currentReport?.lines ?? [];
    return showIguales ? base : base.filter((l) => l.state !== 'IGUAL');
  }, [currentReport, showIguales]);

  const visible = React.useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return lines;
    return lines.filter(
      (l) => l.masterCode.toUpperCase().includes(q) || l.masterDescription.toUpperCase().includes(q)
        || (l.localExistingDescription ?? '').toUpperCase().includes(q),
    );
  }, [lines, search]);

  const pendingSlice = currentCatalog?.pending ?? 0;

  const confirmOne = (p: ProposalView) => run(`p:${p.id}`, async () => {
    const code = edits[p.id] ?? p.localCode;
    await apiMultiempresaSyncService.confirm(p.id, code || undefined);
    setInfo(`${p.companyCode} · ${p.catalogLabel}: creado "${code}" para "${p.masterDescription}".`);
    setPicked((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
    await loadStatus();
    if (company && catalog) await analyzeSlice(company, catalog, page * PAGE_SIZE);
  });

  const confirmPicked = () => run('bulk', async () => {
    const ids = [...picked];
    const overrides = edits;
    const r = await apiMultiempresaSyncService.confirmBulk(ids, overrides);
    setPicked(new Set());
    setEdits({});
    setInfo(
      r.errors.length === 0
        ? `${r.confirmed} propuestas confirmadas.`
        : `${r.confirmed} confirmadas, ${r.errors.length} con problema: ${r.errors.slice(0, 2).join(' | ')}`,
    );
    await loadStatus();
    if (company && catalog) await analyzeSlice(company, catalog, page * PAGE_SIZE);
  });

  const doConfirmAll = () => run('all', async () => {
    const c = confirmAll!;
    const r = await apiMultiempresaSyncService.confirmAll(c.company, c.catalog);
    setConfirmAll(null);
    setInfo(
      r.errors.length === 0
        ? `${c.company}: ${r.confirmed} elementos creados.`
        : `${c.company}: ${r.confirmed} creados, ${r.errors.length} con problema.`,
    );
    await loadStatus();
    if (company && catalog) await analyzeSlice(company, catalog, 0);
  });

  const pendingByCompany = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of status?.pending ?? []) m.set(p.companyCode, (m.get(p.companyCode) ?? 0) + p.pending);
    return m;
  }, [status]);

  /** Propuestas pendientes de catálogos fuera del alcance (ruido). */
  const discardablePending = React.useMemo(() => {
    let n = 0;
    for (const p of status?.pending ?? []) if (DISCARDABLE.includes(p.catalogKey)) n += p.pending;
    return n;
  }, [status]);

  return (
    <Page
      title="Manejo Multiempresa"
      desc="Lleva los catálogos del maestro (AD_TRANS) a las demás empresas. Si un código ya existe con otro significado, no se borra ni se renombra: se crea uno nuevo y tú lo confirmas."
      actions={<Button variant="secondary" onClick={() => void loadStatus()}>Actualizar</Button>}
    >
      <div className="stack-sm">
        {error && <Alert tone="danger">{error}</Alert>}
        {info && <Alert tone="success">{info}</Alert>}

        <SectionCard
          title="1. Catálogo maestro (AD_TRANS)"
          desc="Se copia desde Profit en modo solo lectura. Es la fuente de verdad de grupos, subgrupos, categorías, marcas, unidades e impuestos."
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
          title="2. Empresas"
          desc="Elige una empresa para ver sus catálogos. Aquí solo se muestran contadores, no listas gigantic."
        >
          <div className="flex-between" style={{ alignItems: 'flex-end' }}>
            <label className="stack-sm">
              <span className="muted small">Alcance</span>
              <span className="flex-between" style={{ gap: 12 }}>
                <label className="small">
                  <input type="checkbox" checked={includeProviders} onChange={(e) => setIncludeProviders(e.target.checked)} />
                  {' '}Incluir proveedores y procedencias
                </label>
                <label className="small">
                  <input type="checkbox" checked={autoCreate} onChange={(e) => setAutoCreate(e.target.checked)} />
                  {' '}Crear faltantes automáticamente
                </label>
              </span>
            </label>
            <Button onClick={() => void analyzeCompanies()} loading={busy === 'analyze'} disabled={Boolean(busy)}>
              Analizar empresas
            </Button>
          </div>
          {autoCreate && (
            <Alert tone="warning">
              <strong>Auto-creación activada.</strong> Al analizar, los elementos que solo <em>faltan</em> se crean en Profit
              (solo INSERT de filas que no existían; nunca se modifica ni borra nada). Los <em>conflictos</em> siguen
              requiriendo tu confirmación.
            </Alert>
          )}

          {!analysis ? (
            <p className="muted small">Pulsa «Analizar empresas» para ver el estado de cada una.</p>
          ) : (
            <div className="stack-sm">
              {analysis.companies.filter((c) => !c.isStandard).map((c) => (
                <button
                  key={c.company}
                  type="button"
                  className="card p16"
                  style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
                  onClick={() => openCompany(c.company)}
                  aria-pressed={company === c.company}
                >
                  <div className="flex-between">
                    <span>
                      <strong className="mono">{c.company}</strong>
                      <span className="muted small"> — {c.name}</span>
                    </span>
                    <span className="flex-between" style={{ gap: 8 }}>
                      <Badge tone="green">{c.counts.iguales} iguales</Badge>
                      <Badge tone="blue">{c.counts.resueltos} resueltos</Badge>
                      {c.counts.creados > 0 && <Badge tone="blue">{c.counts.creados} creados</Badge>}
                      <Badge tone="yellow">{c.counts.faltantes} faltantes</Badge>
                      <Badge tone="red">{c.counts.conflictos} conflictos</Badge>
                    </span>
                  </div>
                </button>
              ))}
              {pendingByCompany.size > 0 && (
                <>
                  <p className="muted small">
                    Pendientes de decisión: {[...pendingByCompany.entries()].map(([k, v]) => `${k} (${v})`).join(' · ')}
                  </p>
                  {discardablePending > 0 && (
                    <div className="flex-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <p className="muted small">
                        {discardablePending} de esas pendientes son de {DISCARDABLE.map((c) => DISCARD_LABEL[c] ?? c).join(' y ')},
                        que ya no entran en el alcance por defecto y solo inflan el contador.
                      </p>
                      <Button size="sm" variant="secondary" onClick={() => void discardOutOfScope()} loading={busy === 'discard'}>
                        Descartar esas {discardablePending} propuestas
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </SectionCard>

        {company && (
          <SectionCard
            title={`3. Catálogos de ${company}`}
            desc="Elige un catálogo para ver solo sus diferencias. Los IGUALES vienen ocultos."
            actions={catalog ? <Button size="sm" variant="ghost" onClick={() => void backToCatalogs()}>← Ver todos los catálogos</Button> : undefined}
          >
            {!catalog ? (
              currentReport ? (
                <div className="stack-sm">
                  {currentReport.catalogs.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className="card p16"
                      style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
                      onClick={() => openCatalog(c.key)}
                    >
                      <div className="flex-between">
                        <strong>{c.label}</strong>
                        <span className="flex-between" style={{ gap: 8 }}>
                          <Badge tone="green">{c.iguales} iguales</Badge>
                          <Badge tone="blue">{c.resueltos} resueltos</Badge>
                          {c.creados > 0 && <Badge tone="blue">{c.creados} creados</Badge>}
                          <Badge tone="yellow">{c.faltantes} faltantes</Badge>
                          <Badge tone="red">{c.conflictos} conflictos</Badge>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted small">Analiza las empresas para ver sus catálogos.</p>
              )
            ) : (
              <div className="stack-sm">
                <div className="flex-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <Input
                    placeholder="Buscar por código o descripción…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Buscar por código o descripción"
                    style={{ maxWidth: 320 }}
                  />
                  <label className="small">
                    <input type="checkbox" checked={showIguales} onChange={(e) => setShowIguales(e.target.checked)} />
                    {' '}Mostrar también los iguales
                  </label>
                  <Button
                    size="sm" variant="secondary"
                    onClick={() => void analyzeSlice(company, catalog ?? undefined, page * PAGE_SIZE)}
                    loading={busy === 'slice'}
                  >
                    Recalcular esta página
                  </Button>
                </div>

                <p className="muted small">
                  Página {page + 1} · mostrando {visible.length} de {currentReport?.totalProblems ?? 0} diferencias
                  {currentCatalog ? ` · catálogo: ${currentCatalog.label}` : ''}
                </p>

                {visible.length === 0 ? (
                  <EmptyState title="Sin diferencias en esta página" desc="Cambia de catálogo o recalcula para seguir viendo el resto." />
                ) : (
                  visible.map((l, i) => (
                    <div key={`${l.catalogKey}-${l.masterCode}-${i}`} className="card p16">
                      <div className="flex-between">
                        <span>
                          <Badge tone={STATE_TONE[l.state]}>{STATE_LABEL[l.state]}</Badge>{' '}
                          <span className="mono">{l.masterCode}</span> = {l.masterDescription}
                        </span>
                      </div>
                      <p className="muted small">{l.detail}</p>
                    </div>
                  ))
                )}

                <div className="flex-between" style={{ gap: 8 }}>
                  <Button
                    size="sm" variant="secondary"
                    disabled={page === 0 || busy !== null}
                    onClick={() => void analyzeSlice(company, catalog ?? undefined, Math.max(page - 1, 0) * PAGE_SIZE)}
                  >
                    ← Anterior
                  </Button>
                  <Button
                    size="sm" variant="secondary"
                    disabled={busy !== null || (page + 1) * PAGE_SIZE >= (currentReport?.totalProblems ?? 0)}
                    onClick={() => void analyzeSlice(company, catalog ?? undefined, (page + 1) * PAGE_SIZE)}
                  >
                    Siguiente →
                  </Button>
                </div>
              </div>
            )}
          </SectionCard>
        )}

        {company && catalog && (
          <SectionCard
            title={`4. Conflictos por decidir — ${company} · ${currentCatalog?.label ?? catalog}`}
            desc="Aquí decides tú. Marca las propuestas y confírmalas en bloque, o acéptalas todas de este catálogo."
          >
            {!canWrite && (
              <Alert tone="warning"><strong>Sin autorización.</strong> Puedes revisar, pero crear en Profit requiere el permiso de registro.</Alert>
            )}
            {/* El resultado se muestra AQUÍ, junto a la acción: arriba quedaba
                fuera de pantalla y un fallo parecía "no pasó nada". */}
            {error && <Alert tone="danger">{error}</Alert>}
            {info && <Alert tone="success">{info}</Alert>}

            {pendingSlice === 0 ? (
              <EmptyState title="No hay conflictos pendientes en este catálogo" desc="Todo lo de aquí está resuelto o es un faltante que ya se creó." />
            ) : (
              <>
                <div className="flex-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <span className="muted small">
                    {picked.size > 0 ? `${picked.size} seleccionada(s)` : `${pendingSlice} pendiente(s)`}
                  </span>
                  <span className="flex-between" style={{ gap: 8 }}>
                    <Button size="sm" onClick={() => void confirmPicked()} loading={busy === 'bulk'} disabled={!canWrite || picked.size === 0 || Boolean(busy)}>
                      Confirmar seleccionadas ({picked.size})
                    </Button>
                    <Button
                      size="sm" variant="secondary"
                      disabled={!canWrite || Boolean(busy)}
                      onClick={() => setConfirmAll({ company, catalog: catalog ?? undefined, n: pendingSlice })}
                    >
                      Aceptar todas ({pendingSlice})
                    </Button>
                  </span>
                </div>

                <ProposalList
                  company={company}
                  catalog={catalog}
                  picked={picked}
                  setPicked={setPicked}
                  edits={edits}
                  setEdits={setEdits}
                  canWrite={canWrite}
                  busy={busy}
                  onConfirm={confirmOne}
                />
              </>
            )}
          </SectionCard>
        )}

        {error && <ErrorState title="No pudimos completar la operación." onRetry={() => void loadStatus()} />}

        <ConfirmDialog
          open={confirmAll !== null}
          title="Aceptar todas las propuestas de este catálogo"
          desc={confirmAll
            ? `Se crearán ${confirmAll.n} elementos en Profit para ${confirmAll.company}${confirmAll.catalog ? ` · ${confirmAll.catalog}` : ''}. Las filas que ya existen con otro significado NO se modifican.`
            : undefined}
          confirmLabel="Sí, crear en Profit"
          busy={Boolean(busy)}
          onCancel={() => setConfirmAll(null)}
          onConfirm={() => void doConfirmAll()}
        />
      </div>
    </Page>
  );
};

/** Lista de propuestas PENDING de un empresa+catálogo, con selección. */
const ProposalList: React.FC<{
  company: string;
  catalog: string;
  picked: Set<string>;
  setPicked: React.Dispatch<React.SetStateAction<Set<string>>>;
  edits: Record<string, string>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  canWrite: boolean;
  busy: string | null;
  onConfirm: (p: ProposalView) => void;
}> = ({ company, catalog, picked, setPicked, edits, setEdits, canWrite, busy, onConfirm }) => {
  const [rows, setRows] = React.useState<ProposalView[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    setRows(null);
    apiMultiempresaSyncService.proposals(company, catalog)
      .then((r) => { if (alive) setRows(r.filter((x) => x.status === 'PENDING')); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [company, catalog]);

  if (rows === null) return <Skeleton height={80} />;
  if (rows.length === 0) return <EmptyState title="Sin propuestas abiertas en este catálogo" />;

  return (
    <div className="stack-sm">
      <Button
        size="sm" variant="ghost"
        onClick={() => setPicked((prev) => (prev.size === rows!.length ? new Set() : new Set(rows!.map((r) => r.id))))}
      >
        {picked.size === rows.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
      </Button>
      {rows.map((p) => (
        <div key={p.id} className="card p16">
          <div className="flex-between">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={picked.has(p.id)}
                disabled={!canWrite || busy !== null}
                onChange={() => setPicked((prev) => {
                  const n = new Set(prev);
                  if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                  return n;
                })}
                aria-label={`Seleccionar ${p.catalogLabel} ${p.masterCode}`}
              />
              <span>
                <Badge tone={REASON_TONE[p.reason] ?? 'gray'}>{REASON_LABEL[p.reason] ?? p.reason}</Badge>{' '}
                <strong>{p.catalogLabel}</strong>
              </span>
            </label>
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
                disabled={!canWrite || busy !== null}
                aria-label={`Código a crear en ${company} para ${p.catalogLabel} ${p.masterCode}`}
              />
            </label>
            <div className="flex-between" style={{ gap: 8 }}>
              <Button size="sm" onClick={() => onConfirm(p)} loading={busy === `p:${p.id}`} disabled={!canWrite || Boolean(busy)}>
                Confirmar
              </Button>
              <Button size="sm" variant="ghost" disabled={!canWrite || Boolean(busy)} onClick={() => setEdits((prev) => {
                const n = { ...prev };
                delete n[p.id];
                return n;
              })}>
                Restaurar
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
