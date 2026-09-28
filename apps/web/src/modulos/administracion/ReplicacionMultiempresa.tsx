import * as React from 'react';
import { apiCorporateService, type CorporateSyncStateRow } from '../../servicios/api/api-corporate-service';
import {
  Page, Button, Alert, Skeleton, ErrorState, EmptyState, DataTable, type DataColumn,
} from '../../componentes/ui';
import { HelpButton } from '../../componentes/ayuda';
import { ProfitCompaniesSection } from './ProfitCompaniesSection';
import { HomologacionCorporativa } from './HomologacionCorporativa';
import { EquivalenciasPanel } from './EquivalenciasPanel';

type Tab = 'empresas' | 'catalogos' | 'equivalencias' | 'estado';

const TABS: Array<{ key: Tab; label: string; desc: string }> = [
  { key: 'catalogos', label: 'Replicar catálogos', desc: 'Elige las empresas y lleva los catálogos de AD_TRANS a todas con un solo clic.' },
  { key: 'equivalencias', label: 'Equivalencias', desc: 'Cuando una empresa usa otro código para lo mismo, regístralo aquí para no duplicar.' },
  { key: 'empresas', label: 'Empresas', desc: 'Habilita o deshabilita la inserción de artículos por empresa.' },
  { key: 'estado', label: 'Estado', desc: 'Última vez que cada empresa quedó al día con el estándar.' },
];

function fecha(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * FASE 26 — Módulo único de Replicación Multiempresa.
 *
 * Reúne en un solo lugar lo que antes estaba repartido: empresas, catálogos
 * y equivalencias. El flujo es siempre el mismo:
 *   1. replica los catálogos del estándar (AD_TRANS) a las empresas;
 *   2. registra las equivalencias de código que cada empresa usa;
 *   3. sube artículos con el MISMO código Profit en todas.
 *
 * Los artículos se registran desde la solicitud ya clasificada (paso
 * "Registrar en Profit" del workflow), porque necesitan grupo, subgrupo,
 * unidad, impuesto y la distribución contable ya aprobados.
 */
export const ReplicacionMultiempresa: React.FC = () => {
  const [tab, setTab] = React.useState<Tab>('catalogos');

  return (
    <Page
      title="Replicación Multiempresa"
      desc="Un solo lugar para llevar AD_TRANS a todas las empresas: catálogos, equivalencias de código y estado de sincronización."
      actions={<HelpButton helpKey="replicacion" />}
    >
      <div className="toolbar" role="tablist" aria-label="Secciones de replicación multiempresa">
        {TABS.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? 'primary' : 'secondary'}
            size="sm"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <p className="muted small">{TABS.find((t) => t.key === tab)?.desc}</p>

      {tab === 'catalogos' && <HomologacionCorporativa />}
      {tab === 'equivalencias' && <EquivalenciasPanel />}
      {tab === 'empresas' && <ProfitCompaniesSection />}
      {tab === 'estado' && <EstadoSincronizacion />}
    </Page>
  );
};

const EstadoSincronizacion: React.FC = () => {
  const [rows, setRows] = React.useState<CorporateSyncStateRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    apiCorporateService.syncState().then(
      (r) => { setRows(r); setLoading(false); },
      (err: any) => { setError(err?.message || 'No pudimos cargar el estado.'); setLoading(false); },
    );
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const columns: DataColumn<CorporateSyncStateRow>[] = [
    { key: 'c', header: 'Empresa', render: (r) => <strong className="mono">{r.company}</strong> },
    { key: 'k', header: 'Catálogo', render: (r) => <span>{r.catalogLabel}</span> },
    { key: 'd', header: 'Última sincronización', render: (r) => <span>{fecha(r.lastSyncAt)}</span> },
    {
      key: 'n', header: 'Aplicado',
      render: (r) => (
        <span className="muted small">
          {r.summary ? `${r.summary.inserts} creados · ${r.summary.updates} descripciones` : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="stack-sm">
      <Alert tone="info">
        Mientras haya diferencias pendientes, el botón «Homologar» solo sube lo que cambió. El estado solo
        registra empresas ya sincronizadas; para ver los cambios usa «Comparar».
      </Alert>
      <div className="toolbar">
        <span className="muted small grow">{rows ? `${rows.length} registro(s)` : ' '}</span>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>Actualizar</Button>
      </div>
      {loading && (
        <div className="stack-sm" aria-label="Cargando estado">
          <Skeleton height={16} width="30%" /><Skeleton height={40} />
        </div>
      )}
      {!loading && error && <ErrorState title="No pudimos cargar el estado." onRetry={load} />}
      {!loading && !error && rows && rows.length === 0 && (
        <EmptyState
          title="Todavía no hay sincronizaciones"
          desc="Cuando homologues catálogos por primera vez, aquí verás desde cuándo cada empresa está al día."
        />
      )}
      {!loading && !error && rows && rows.length > 0 && (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => `${r.company}|${r.catalog}`}
          caption="Última sincronización de catálogos por empresa."
        />
      )}
    </div>
  );
};
