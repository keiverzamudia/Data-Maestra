import * as React from 'react';
import { useSession } from '../../contextos/SessionContext';
import {
  apiCorporateService,
  CORPORATE_STATE_LABELS,
  CORPORATE_OP_LABELS,
  type CorporateCompany,
  type CorporateCompareResult,
  type CorporatePreflight,
  type CorporatePlanItem,
} from '../../servicios/api/api-corporate-service';
import {
  Button, Alert, EmptyState, Skeleton, ErrorState, DataTable, ConfirmDialog, Badge, type DataColumn,
} from '../../componentes/ui';
import { HelpButton } from '../../componentes/ayuda';
import { apiMultiCompanyService } from '../../servicios/api/api-multiempresa-service';

/** FASE 26.3 — Catálogos homologables (clave → etiqueta). */
const CATALOG_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'lin_art', label: 'Líneas' },
  { key: 'sub_lin', label: 'Sublíneas' },
  { key: 'unidades', label: 'Unidades' },
  { key: 'cat_art', label: 'Categorías' },
  { key: 'colores', label: 'Marcas' },
  { key: 'proceden', label: 'Procedencias' },
  { key: 'prov', label: 'Proveedores' },
  { key: 'tabulado', label: 'Tasas de impuesto' },
];

/**
 * Homologación corporativa multiempresa (FASE 17).
 * Empresa estándar: AD_TRANS. Destinos: selección múltiple desde el
 * catálogo corporativo (si mañana aparece una empresa, aparece sola).
 * Comparar y Validar son solo lectura. Homologar exige PROFIT.WRITE y
 * ejecuta en transacción global: una empresa falla = cero escrituras.
 *
 * FASE 26.3 — Selección fina: catálogos (checkboxes) e ítems (checkbox por
 * fila + «Seleccionar todo»). La selección ES la revisión: lo tildado se
 * migra, lo demás no. Un BLOQUEADO tildado se aprueba.
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
  // FASE 26.2 — "Las descripciones de AD_TRANS mandan" en las seleccionadas.
  const [descSyncBusy, setDescSyncBusy] = React.useState(false);
  // FASE 26.3 — Selección de catálogos e ítems (la selección es la revisión).
  const [catalogs, setCatalogs] = React.useState<Set<string>>(new Set());
  const [items, setItems] = React.useState<Set<string>>(new Set());

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

  /**
   * FASE 26.2 — Autoriza (o retira) que las descripciones de AD_TRANS manden
   * en las empresas seleccionadas. Es una decisión explícita y auditada: sin
   * ella el plan sigue bloqueando esas filas.
   */
  const toggleDescSync = async (on: boolean) => {
    if (descSyncBusy || chosen.length === 0) return;
    setDescSyncBusy(true);
    setError(null);
    setNotice(null);
    try {
      for (const code of chosen) {
        const current = companies.find((c) => c.code === code);
        // eslint-disable-next-line no-await-in-loop
        await apiMultiCompanyService.saveConfig(code, current?.enabled ?? true, on);
      }
      setNotice(on
        ? `Autorizado: las descripciones de AD_TRANS mandan en ${chosen.length} empresa(s). Vuelve a Comparar.`
        : `Retirada la autorización en ${chosen.length} empresa(s).`);
      // El flag cambia el plan: invalidar cualquier comparación previa para que
      // no se pueda homologar con un plan congelado bajo una regla distinta.
      setCompare(null);
      setPreflight(null);
      setItems(new Set());
      loadCompanies();
    } catch (err: any) {
      setError(err?.message || 'No se pudo actualizar la autorización.');
    } finally {
      setDescSyncBusy(false);
    }
  };

  const chosen = [...selected];
  /**
   * FASE 26.3/26.4 — identidad de una fila: `empresa|catálogo|código|padre`.
   * El padre hace falta: sub_lin repite el mismo código bajo líneas distintas
   * y sin él una sola casilla marcaría todas las filas con ese código.
   */
  const itemKey = (company: string, catalog: string, code: string, parent?: string) =>
    `${company}|${catalog}|${code}|${String(parent ?? '').trim()}`;
  // FASE 26.2 — el interruptor refleja el estado real de las empresas elegidas.
  const selectedDescSync = chosen.length > 0
    && chosen.every((c) => companies.find((x) => x.code === c)?.allowDescSync === true);

  const runCompare = async () => {
    if (busy || chosen.length === 0) return;
    setBusy('compare');
    setError(null);
    setNotice(null);
    try {
      const r = await apiCorporateService.compare(chosen, [...catalogs]);
      setCompare(r);
      setDetailCompany(r.companies[0]?.company ?? '');
      // FASE 26.4 — preselecciona lo mismo que se migraba antes de la selección
      // (todo lo accionable y no bloqueado). Así un plan con bloqueos no deja el
      // botón muerto y el usuario puede añadir (o quitar) lo que revise.
      // Se excluyen los NO_ACTION: no están en la tabla de detalle, no se van a
      // escribir y solo inflarían el contador y el payload de la revisión.
      setItems(new Set(
        r.companies.flatMap((c) => c.items
          .filter((i) => i.operation !== 'NO_ACTION' && i.operation !== 'BLOCKED')
          .map((i) => itemKey(c.company, i.catalog, i.code, i.parent))),
      ));
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
      const r = await apiCorporateService.homologate(chosen, {
        catalogs: [...catalogs],
        items: selectedItemsPayload,
      });
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

  const toggleItem = (key: string) => {
    setItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  // Índice de TODAS las filas del plan por su clave de identidad.
  const itemsByKey = React.useMemo(() => {
    const m = new Map<string, CorporatePlanItem>();
    for (const c of compare?.companies ?? []) {
      for (const i of c.items) m.set(itemKey(c.company, i.catalog, i.code, i.parent), i);
    }
    return m;
  }, [compare]);
  /**
   * FASE 26.4 — la ejecutabilidad depende de la SELECCIÓN, no del plan
   * completo. Antes se usaba `compare.executable`: un único bloqueo en
   * cualquier catálogo dejaba el botón Homologar deshabilitado y la selección
   * de la FASE 26.3 era inalcanzable. Un BLOQUEADO por descripción tildado se
   * aprueba (FASE 26.3) y por tanto es ejecutable; el resto no.
   */
  const selectionExecutable = React.useMemo(
    () => [...items].every((k) => {
      const i = itemsByKey.get(k);
      if (!i) return true;
      return i.operation !== 'BLOCKED' || i.state === 'DESCRIPCION_DIFERENTE';
    }),
    [items, itemsByKey],
  );
  const allDetailKeys = React.useMemo(
    () => detailRows.map((i) => itemKey(detail!.company, i.catalog, i.code, i.parent)),
    [detailRows, detail],
  );
  const allItemsSelected = allDetailKeys.length > 0 && allDetailKeys.every((k) => items.has(k));
  const toggleAllItems = () => {
    setItems((prev) => {
      const next = new Set(prev);
      if (allItemsSelected) allDetailKeys.forEach((k) => next.delete(k));
      else allDetailKeys.forEach((k) => next.add(k));
      return next;
    });
  };
  const selectedItemsPayload = React.useMemo(
    () => [...items].map((k) => {
      const [company, catalog, code, parent] = k.split('|');
      return { company: company ?? '', catalog: catalog ?? '', code: code ?? '', parent: parent || undefined };
    }),
    [items],
  );

  const columns: DataColumn<(typeof detailRows)[number]>[] = [
    {
      key: 'sel', header: '', label: 'Migrar',
      render: (r) => {
        const key = itemKey(detail!.company, r.catalog, r.code, r.parent);
        return (
          <input
            type="checkbox"
            checked={items.has(key)}
            onChange={() => toggleItem(key)}
            aria-label={`Migrar ${r.catalog} ${r.parent ? `${r.parent}/` : ''}${r.code}`}
          />
        );
      },
    },
    { key: 'catalog', header: 'Catálogo', label: 'Catálogo', render: (r) => <span>{r.catalog}</span> },
    { key: 'code', header: 'Código', label: 'Código', render: (r) => <strong className="mono">{r.code}</strong> },
    // FASE 26.4 — el padre distingue sublíneas con el mismo código bajo otra
    // línea; sin esta columna dos filas idénticas en pantalla serían imposibles
    // de diferenciar al tildar.
    {
      key: 'parent', header: 'Línea', label: 'Línea',
      render: (r) => <span className="mono muted">{r.parent || '—'}</span>,
    },
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
                  {c.allowDescSync && <Badge tone="blue">AD_TRANS manda</Badge>}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {!loadingCompanies && !companiesError && destinos.length > 0 && (
          <div className="toolbar" style={{ marginTop: 8 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={selectedDescSync}
                disabled={descSyncBusy || chosen.length === 0}
                onChange={(e) => void toggleDescSync(e.target.checked)}
                aria-label="Las descripciones de AD_TRANS mandan en las empresas seleccionadas"
              />
              <span>Las descripciones de AD_TRANS mandan en las seleccionadas</span>
            </label>
            <span className="muted small">FASE 26.2</span>
          </div>
        )}

        {!loadingCompanies && !companiesError && destinos.length > 0 && (
          <fieldset>
            <legend className="muted small">Catálogos a comparar y migrar</legend>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {CATALOG_OPTIONS.map((c) => (
                <label key={c.key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={catalogs.has(c.key)}
                    onChange={() => {
                      setCatalogs((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.key)) next.delete(c.key);
                        else next.add(c.key);
                        return next;
                      });
                      setCompare(null);
                      setPreflight(null);
                    }}
                    aria-label={`Catálogo ${c.label}`}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
            <p className="muted small">
              {catalogs.size === 0
                ? 'Sin filtro: se comparan y migran todos los catálogos.'
                : `${catalogs.size} catálogo(s) seleccionado(s).`}
            </p>
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
              <Button size="sm" onClick={() => setConfirmHomologate(true)} disabled={busy !== null || chosen.length === 0 || !compare || items.size === 0 || !selectionExecutable}>
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
          {detailRows.length > 0 && (
            <div className="toolbar">
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={allItemsSelected}
                  onChange={toggleAllItems}
                  aria-label="Seleccionar todo"
                />
                <span>Seleccionar todo</span>
              </label>
              <span className="muted small grow">
                {allDetailKeys.filter((k) => items.has(k)).length} de {allDetailKeys.length} filas tildadas.
                La selección es la revisión: lo tildado se migra, lo demás no.
              </span>
            </div>
          )}
          {detailRows.length === 0 ? (
            <EmptyState title="Sin diferencias" desc={`${detail.company} coincide con el estándar corporativo.`} />
          ) : (
            <DataTable columns={columns} rows={detailRows} rowKey={(r) => `${r.catalog}|${r.parent ?? ''}|${r.code}`} caption="Diferencias contra el estándar." />
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmHomologate}
        title="Homologar catálogos"
        desc={`${selectedItemsPayload.length} fila(s) seleccionada(s) en ${chosen.length} empresa(s): se crearán los elementos faltantes y se actualizarán las descripciones tildadas dentro de una sola operación. Si alguna empresa falla, no se escribe en ninguna.`}
        confirmLabel="Homologar"
        busy={busy === 'homologate'}
        onCancel={() => setConfirmHomologate(false)}
        onConfirm={() => void runHomologate()}
      />
    </div>
  );
};
