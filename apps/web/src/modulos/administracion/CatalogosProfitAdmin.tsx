import * as React from 'react';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { apiCatalogConfigService, type CatalogTypeKey, type AdminCatalogView } from '../../servicios/api/api-catalog-config-service';
import {
  Page, Button, SearchInput, EmptyState, Alert, ConfirmDialog,
  Skeleton, ErrorState, DataTable, Pagination, Select, type DataColumn,
} from '../../componentes/ui';
import { HelpButton } from '../../componentes/ayuda';
import { HomologacionCorporativa } from './HomologacionCorporativa';

const TYPES: Array<{ key: CatalogTypeKey; label: string }> = [
  { key: 'GROUP', label: 'Grupos' },
  { key: 'SUBGROUP', label: 'Subgrupos' },
  { key: 'CATEGORY', label: 'Categorías' },
  { key: 'BRAND', label: 'Marcas' },
  { key: 'UNIT', label: 'Unidades' },
  { key: 'TAX', label: 'Impuestos' },
  { key: 'ARTICLE_TYPE', label: 'Tipos de artículo' },
];

const PAGE_SIZE = 50;

/**
 * Administración de catálogos Profit (FASE CAT): visibilidad local
 * (qué se muestra en Data-Maestra) sin modificar Profit.
 * Solo ADMIN.MANAGE (ruta protegida). Ocultar ≠ eliminar de Profit.
 */
export const CatalogosProfitAdmin: React.FC = () => {
  const { empresas } = useOrganizacion();
  const [section, setSection] = React.useState<'visibilidad' | 'homologacion'>('visibilidad');
  const [type, setType] = React.useState<CatalogTypeKey>('GROUP');
  const [companyId, setCompanyId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [view, setView] = React.useState<AdminCatalogView | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [initialVisible, setInitialVisible] = React.useState<Set<string>>(new Set());
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [confirmMode, setConfirmMode] = React.useState<'ALL' | 'SELECTED' | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = React.useCallback(() => {
    setLoading(true);
    setListError(null);
    apiCatalogConfigService.view(type, {
      companyId: companyId || undefined,
      search: debounced || undefined,
      page, limit: PAGE_SIZE,
    }).then(
      (v) => {
        setView(v);
        const vis = new Set(v.items.filter((i) => i.visible).map((i) => `${i.parentCode}|${i.code}`));
        setInitialVisible(vis);
        setChecked(new Set(vis));
        setLoading(false);
      },
      (err: any) => {
        setListError(err?.message || 'No pudimos cargar el catálogo.');
        setLoading(false);
      },
    );
  }, [type, companyId, debounced, page]);

  React.useEffect(() => { load(); }, [load]);

  const dirty = React.useMemo(() => {
    if (initialVisible.size !== checked.size) return true;
    for (const k of checked) if (!initialVisible.has(k)) return true;
    return false;
  }, [initialVisible, checked]);

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectPage = (on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const i of view?.items ?? []) {
        const k = `${i.parentCode}|${i.code}`;
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const toEnable = [...checked].filter((k) => !initialVisible.has(k));
      const toDisable = [...initialVisible].filter((k) => !checked.has(k));
      const toCodes = (keys: string[]) => keys.map((k) => {
        const sep = k.indexOf('|');
        return { parentCode: k.slice(0, sep) || undefined, code: k.slice(sep + 1) };
      });
      if (toEnable.length > 0) {
        await apiCatalogConfigService.setItems(type, toCodes(toEnable), true, companyId || undefined);
      }
      if (toDisable.length > 0) {
        await apiCatalogConfigService.setItems(type, toCodes(toDisable), false, companyId || undefined);
      }
      setNotice(`Configuración guardada: ${toEnable.length} habilitados, ${toDisable.length} deshabilitados.`);
      load();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  const handleMode = async () => {
    if (!confirmMode || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiCatalogConfigService.setMode(type, confirmMode, companyId || undefined);
      setConfirmMode(null);
      setNotice(`Modo cambiado a ${confirmMode === 'ALL' ? 'Mostrar todos' : 'Mostrar seleccionados'}.`);
      load();
    } catch (err: any) {
      setError(err?.message || 'No se pudo cambiar el modo.');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const r = await apiCatalogConfigService.sync(type);
      setNotice(`Sincronizado con Profit: ${r.total} elementos (${r.created} nuevos, ${r.unavailable} no disponibles).`);
      load();
    } catch (err: any) {
      setError(err?.message || 'No se pudo sincronizar con Profit.');
    } finally {
      setSyncing(false);
    }
  };

  const columns: DataColumn<AdminCatalogView['items'][number]>[] = [
    {
      key: 'sel', header: '', label: 'Visible',
      render: (r) => (
        <input
          type="checkbox"
          aria-label={`Visible ${r.code}`}
          checked={checked.has(`${r.parentCode}|${r.code}`)}
          onChange={() => toggle(`${r.parentCode}|${r.code}`)}
        />
      ),
    },
    { key: 'code', header: 'Código', label: 'Código', render: (r) => <strong className="mono">{r.code}</strong> },
    { key: 'desc', header: 'Descripción', label: 'Descripción', render: (r) => <span className="ellipsis">{r.description}</span> },
    ...(type === 'SUBGROUP'
      ? [{ key: 'parent', header: 'Grupo', label: 'Grupo', render: (r: AdminCatalogView['items'][number]) => <span className="mono">{r.parentCode || '—'}</span> }]
      : []),
    {
      key: 'est', header: 'Estado', label: 'Estado',
      render: (r) => (
        <span className="muted small">
          {!r.availableInProfit ? 'NO DISPONIBLE EN PROFIT' : r.isNew ? 'NUEVO' : r.visible ? 'Visible' : 'Oculto'}
        </span>
      ),
    },
  ];

  const totalPages = view ? Math.max(1, Math.ceil(view.total / view.limit)) : 1;

  return (
    <Page
      title="Catálogos Profit"
      desc="Visibilidad local: qué valores de Profit se muestran en Data-Maestra. Ocultar nunca elimina de Profit."
      actions={<HelpButton helpKey="catalogos" />}
    >
      <div className="toolbar" role="tablist" aria-label="Secciones de catálogos">
        <Button variant={section === 'visibilidad' ? 'primary' : 'secondary'} size="sm" onClick={() => setSection('visibilidad')}>
          Visibilidad
        </Button>
        <Button variant={section === 'homologacion' ? 'primary' : 'secondary'} size="sm" onClick={() => setSection('homologacion')}>
          Homologación corporativa
        </Button>
      </div>

      {section === 'homologacion' ? (
        <HomologacionCorporativa />
      ) : (
      <>
      {notice && <Alert tone="info">{notice}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="card p16 stack-sm">
        <div className="form-grid">
          <label>
            <span className="muted small">Catálogo</span>
            <Select value={type} onChange={(e) => { setType(e.target.value as CatalogTypeKey); setPage(1); }}>
              {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </label>
          <label>
            <span className="muted small">Empresa</span>
            <Select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setPage(1); }}>
              <option value="">Global (todas las empresas)</option>
              {empresas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
        </div>

        <div role="radiogroup" aria-label="Modo de visualización">
          <span className="muted small">Modo de visualización</span>
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <label>
              <input
                type="radio" name="cat-mode" checked={view?.mode === 'ALL'}
                onChange={() => setConfirmMode('ALL')} disabled={loading || saving}
              /> Mostrar todos
            </label>
            <label>
              <input
                type="radio" name="cat-mode" checked={view?.mode === 'SELECTED'}
                onChange={() => setConfirmMode('SELECTED')} disabled={loading || saving}
              /> Mostrar seleccionados
            </label>
          </div>
        </div>

        <div className="toolbar" role="search">
          <span className="grow">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por código o descripción..." />
          </span>
          <Button variant="secondary" size="sm" onClick={handleSync} disabled={syncing || loading}>
            {syncing ? 'Sincronizando…' : 'Sincronizar con Profit'}
          </Button>
        </div>
      </div>

      {loading && (
        <div className="card p16 stack-sm" aria-label="Cargando catálogo">
          <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} />
        </div>
      )}
      {!loading && listError && <ErrorState title="No pudimos cargar el catálogo." onRetry={load} />}
      {!loading && !listError && view && view.items.length === 0 && (
        <EmptyState title="Sin elementos" desc="Sincronice con Profit o ajuste la búsqueda." />
      )}
      {!loading && !listError && view && view.items.length > 0 && (
        <>
          <div className="toolbar">
            <span className="muted small">
              {checked.size} seleccionados · {view.total} elementos · fuente {view.source === 'PROFIT_LIVE' ? 'Profit en vivo' : 'snapshot local'}
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => selectPage(true)}>Seleccionar página</Button>
              <Button variant="secondary" size="sm" onClick={() => selectPage(false)}>Limpiar</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
                {saving ? 'Guardando…' : 'Guardar configuración'}
              </Button>
            </span>
          </div>
          <DataTable
            columns={columns}
            rows={view.items}
            rowKey={(r) => `${r.parentCode}|${r.code}`}
            caption={`${view.total} elementos.`}
          />
          {totalPages > 1 && (
            <Pagination page={view.page} totalPages={totalPages} total={view.total} pageSize={PAGE_SIZE} onPage={setPage} />
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmMode !== null}
        title="Cambiar modo de visualización"
        desc={confirmMode === 'ALL'
          ? 'Al activar Mostrar todos, todos los elementos activos de Profit quedarán disponibles para selección en Data-Maestra. La selección anterior se conserva.'
          : 'Al activar Mostrar seleccionados, solo los elementos marcados serán visibles. La selección se conserva.'}
        confirmLabel="Confirmar"
        busy={saving}
        onCancel={() => setConfirmMode(null)}
        onConfirm={() => void handleMode()}
      />
      </>
      )}
    </Page>
  );
};
