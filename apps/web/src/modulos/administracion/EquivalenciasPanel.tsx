import * as React from 'react';
import { useSession } from '../../contextos/SessionContext';
import {
  apiCorporateService,
  type CorporateCompany,
  type EquivalenceView,
  type EquivalenceSuggestion,
} from '../../servicios/api/api-corporate-service';
import {
  SectionCard, Button, Input, Select, Alert, Skeleton, ErrorState, DataTable, Badge, type DataColumn,
} from '../../componentes/ui';

/**
 * FASE 26 — Equivalencias de catálogo entre empresas.
 *
 * "01 HERRAMIENTAS (AD_TRANS) = 01A HERRAMIENTAS (AD_DISAY)".
 * El vínculo se registra a mano y queda auditado: el motor lo respeta antes
 * de decidir una inserción, de modo que nunca se crea un duplicado porque la
 * empresa usara otro código para lo mismo. Las sugerencias son solo lectura y
 * NUNCA se aplican solas.
 */
const CATALOGOS: Array<{ key: string; label: string }> = [
  { key: 'lin_art', label: 'Líneas (grupos)' },
  { key: 'sub_lin', label: 'Sublíneas (subgrupos)' },
  { key: 'unidades', label: 'Unidades' },
  { key: 'cat_art', label: 'Categorías' },
  { key: 'colores', label: 'Marcas' },
  { key: 'proceden', label: 'Procedencias' },
  { key: 'prov', label: 'Proveedores' },
  { key: 'tabulado', label: 'Tasas de impuesto' },
];

const FORM_VACIO = { catalogKey: 'lin_art', companyCode: '', standardCode: '', localCode: '', note: '' };

export const EquivalenciasPanel: React.FC = () => {
  const { hasPermission } = useSession();
  const canWrite = hasPermission('ADMIN.MANAGE');

  const [companies, setCompanies] = React.useState<CorporateCompany[]>([]);
  const [rows, setRows] = React.useState<EquivalenceView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<EquivalenceSuggestion[] | null>(null);
  const [suggesting, setSuggesting] = React.useState(false);
  const [form, setForm] = React.useState(FORM_VACIO);

  const destinos = React.useMemo(() => companies.filter((c) => !c.isStandard), [companies]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cs, eqs] = await Promise.all([
        apiCorporateService.companies(),
        apiCorporateService.equivalences(),
      ]);
      setCompanies(cs);
      setRows(eqs);
      setForm((f) => (f.companyCode ? f : { ...f, companyCode: cs.find((c) => !c.isStandard)?.code ?? '' }));
    } catch (err: any) {
      setError(err?.message || 'No pudimos cargar las equivalencias.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (saving || !canWrite) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiCorporateService.saveEquivalence({
        catalogKey: form.catalogKey,
        companyCode: form.companyCode,
        standardCode: form.standardCode.trim(),
        localCode: form.localCode.trim(),
        note: form.note.trim() || undefined,
      });
      setNotice(`Equivalencia guardada: ${form.standardCode.trim()} = ${form.localCode.trim()} en ${form.companyCode}.`);
      setForm({ ...FORM_VACIO, companyCode: form.companyCode, catalogKey: form.catalogKey });
      await load();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la equivalencia.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (row: EquivalenceView) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiCorporateService.deactivateEquivalence(row.id);
      setNotice(`Equivalencia desactivada: ${row.standardCode} en ${row.companyCode}. Ya no se aplicará.`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'No se pudo desactivar la equivalencia.');
    } finally {
      setSaving(false);
    }
  };

  const handleSuggest = async () => {
    if (suggesting || !form.companyCode) return;
    setSuggesting(true);
    setError(null);
    setNotice(null);
    try {
      const s = await apiCorporateService.suggestEquivalences(form.companyCode);
      setSuggestions(s);
      setNotice(s.length === 0
        ? 'No encontramos coincidencias por descripción en esta empresa.'
        : `${s.length} coincidencia(s) por descripción. Revise y confirme antes de guardar.`);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron buscar coincidencias.');
    } finally {
      setSuggesting(false);
    }
  };

  const columns: DataColumn<EquivalenceView>[] = [
    { key: 'cat', header: 'Catálogo', render: (r) => <span>{r.catalogLabel}</span> },
    { key: 'emp', header: 'Empresa', render: (r) => <strong className="mono">{r.companyCode}</strong> },
    { key: 'std', header: 'Código AD_TRANS', render: (r) => <strong className="mono">{r.standardCode}</strong> },
    { key: 'loc', header: 'Código local', render: (r) => <strong className="mono">{r.localCode}</strong> },
    {
      key: 'est', header: 'Estado',
      render: (r) => <Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Activa' : 'Inactiva'}</Badge>,
    },
    {
      key: 'act', header: 'Acción',
      render: (r) => (canWrite && r.active
        ? <Button variant="ghost" size="sm" disabled={saving} onClick={() => void handleDeactivate(r)}>Desactivar</Button>
        : <span className="muted small">—</span>),
    },
  ];

  return (
    <div className="stack-sm">
      <SectionCard
        title="Equivalencias de catálogo"
        desc="Cuando una empresa usa otro código para el mismo elemento, regístralo aquí. El motor lo respeta y no crea duplicados."
      >
        {notice && <Alert tone="info">{notice}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}

        {loading && (
          <div className="stack-sm" aria-label="Cargando equivalencias">
            <Skeleton height={16} width="30%" /><Skeleton height={40} />
          </div>
        )}
        {!loading && error && <ErrorState title="No pudimos cargar las equivalencias." onRetry={() => void load()} />}

        {!loading && !error && (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              emptyTitle="Sin equivalencias registradas"
              emptyDesc="Mientras no registres ninguna, el motor replica los códigos del estándar tal cual."
              caption="Equivalencias entre el código canónico de AD_TRANS y el código local de cada empresa."
            />

            {canWrite && (
              <>
                <div className="form-grid">
                  <label>
                    <span className="muted small">Empresa</span>
                    <Select value={form.companyCode} onChange={(e) => setForm({ ...form, companyCode: e.target.value })}>
                      <option value="">Selecciona…</option>
                      {destinos.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                    </Select>
                  </label>
                  <label>
                    <span className="muted small">Catálogo</span>
                    <Select value={form.catalogKey} onChange={(e) => setForm({ ...form, catalogKey: e.target.value })}>
                      {CATALOGOS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </Select>
                  </label>
                  <label>
                    <span className="muted small">Código en AD_TRANS</span>
                    <Input
                      className="mono"
                      value={form.standardCode}
                      onChange={(e) => setForm({ ...form, standardCode: e.target.value })}
                      placeholder="01"
                    />
                  </label>
                  <label>
                    <span className="muted small">Código en la empresa</span>
                    <Input
                      className="mono"
                      value={form.localCode}
                      onChange={(e) => setForm({ ...form, localCode: e.target.value })}
                      placeholder="01A"
                    />
                  </label>
                </div>
                <div className="toolbar">
                  <span className="muted small grow">
                    El vínculo es explícito y auditado. No se deduce de descripciones parecidas sin tu confirmación.
                  </span>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <Button variant="secondary" size="sm" onClick={() => void handleSuggest()} disabled={suggesting || saving || !form.companyCode}>
                      {suggesting ? 'Buscando…' : 'Buscar coincidencias'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void handleSave()}
                      disabled={saving || !form.companyCode || !form.standardCode.trim() || !form.localCode.trim()}
                    >
                      {saving ? 'Guardando…' : 'Guardar equivalencia'}
                    </Button>
                  </span>
                </div>
              </>
            )}

            {suggestions && suggestions.length > 0 && (
              <div className="card p16 stack-sm">
                <strong>Posibles equivalencias (revisar una por una)</strong>
                <DataTable
                  columns={[
                    { key: 'cat', header: 'Catálogo', render: (r: EquivalenceSuggestion) => <span>{r.catalogLabel}</span> },
                    { key: 'std', header: 'AD_TRANS', render: (r: EquivalenceSuggestion) => <strong className="mono">{r.standardCode}</strong> },
                    { key: 'stdDesc', header: 'Descripción', render: (r: EquivalenceSuggestion) => <span className="ellipsis">{r.standardDescription}</span> },
                    { key: 'loc', header: 'En la empresa', render: (r: EquivalenceSuggestion) => <strong className="mono">{r.localCode}</strong> },
                    {
                      key: 'act', header: 'Acción',
                      render: (r: EquivalenceSuggestion) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setForm((f) => ({ ...f, catalogKey: r.catalogKey, standardCode: r.standardCode, localCode: r.localCode }));
                            setSuggestions(null);
                          }}
                        >
                          Usar esta
                        </Button>
                      ),
                    },
                  ]}
                  rows={suggestions}
                  rowKey={(r) => `${r.catalogKey}|${r.standardCode}|${r.localCode}`}
                  caption="Coincidencias por descripción idéntica entre AD_TRANS y la empresa."
                />
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
};
