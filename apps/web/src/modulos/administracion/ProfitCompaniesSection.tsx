import * as React from 'react';
import {
  SectionCard, Button, Alert, Skeleton, ErrorState,
  DataTable, Badge, type DataColumn,
} from '../../componentes/ui';
import {
  apiMultiCompanyService,
  type ProfitCompanyConfigView,
} from '../../servicios/api/api-multiempresa-service';

/**
 * FASE 25 — Empresas Profit para inserción (solo flags locales).
 * El descubrimiento es dinámico (TEmpresas); aquí se habilita/deshabilita
 * y se marca la estándar. Cuerpo reutilizable: la página de administración y
 * el módulo único de Replicación Multiempresa comparten esta misma sección.
 */
export const ProfitCompaniesSection: React.FC = () => {
  const [rows, setRows] = React.useState<ProfitCompanyConfigView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [confirmStandard, setConfirmStandard] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    apiMultiCompanyService.companies().then(
      (list) => { setRows(list); setLoading(false); },
      () => { setError('No pudimos cargar las empresas Profit.'); setLoading(false); },
    );
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const toggle = async (code: string, enabled: boolean) => {
    setSaving(code);
    setError(null);
    try {
      await apiMultiCompanyService.saveConfig(code, enabled);
      await load();
    } catch {
      setError(`No pudimos actualizar ${code}.`);
    } finally {
      setSaving(null);
    }
  };

  /** FASE 26.2 — Autoriza que las descripciones de AD_TRANS manden en una empresa. */
  const toggleDescSync = async (code: string, allowDescSync: boolean) => {
    setSaving(code);
    setError(null);
    try {
      await apiMultiCompanyService.saveConfig(code, rows.find((r) => r.code === code)?.enabled ?? true, allowDescSync);
      await load();
    } catch {
      setError(`No pudimos actualizar la autorización de ${code}.`);
    } finally {
      setSaving(null);
    }
  };

  const setStandard = async (code: string) => {
    setConfirmStandard(null);
    setSaving(code);
    setError(null);
    try {
      await apiMultiCompanyService.setStandard(code);
      await load();
    } catch {
      setError(`No pudimos marcar ${code} como estándar.`);
    } finally {
      setSaving(null);
    }
  };

  const columns: Array<DataColumn<ProfitCompanyConfigView>> = [
    {
      key: 'code', header: 'Empresa',
      render: (r) => (
        <span>
          <strong className="mono">{r.code}</strong>
          <span className="muted small"> — {r.name}</span>
        </span>
      ),
    },
    {
      key: 'standard', header: 'Estándar',
      render: (r) => (r.isStandard
        ? <Badge tone="blue">Empresa estándar</Badge>
        : <Button variant="ghost" size="sm" disabled={saving !== null} onClick={() => setConfirmStandard(r.code)}>Marcar estándar</Button>),
    },
    {
      key: 'enabled', header: 'Inserción',
      render: (r) => (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={r.enabled}
            disabled={saving !== null}
            onChange={() => void toggle(r.code, !r.enabled)}
            aria-label={`Habilitar inserción en ${r.code}`}
          />
          <Badge tone={r.enabled ? 'green' : 'gray'}>{r.enabled ? 'Habilitada' : 'Deshabilitada'}</Badge>
        </label>
      ),
    },
    {
      // FASE 26.2 — "Las descripciones de AD_TRANS mandan" en esta empresa.
      key: 'desc', header: 'Descripciones AD_TRANS',
      render: (r) => (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={r.allowDescSync === true}
            disabled={saving !== null}
            onChange={() => void toggleDescSync(r.code, r.allowDescSync !== true)}
            aria-label={`Las descripciones de AD_TRANS mandan en ${r.code}`}
          />
          <Badge tone={r.allowDescSync ? 'blue' : 'gray'}>{r.allowDescSync ? 'Mandan' : 'Bloqueadas'}</Badge>
        </label>
      ),
    },
  ];

  return (
    <SectionCard title="Empresas Profit" desc="La lista proviene de AD_GRUP.dbo.TEmpresas. Aquí solo se habilita/deshabilita la inserción y se marca la empresa estándar.">
      {loading && (
        <div className="stack-sm" aria-label="Cargando empresas">
          <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} />
        </div>
      )}
      {!loading && error && <ErrorState title="No pudimos cargar las empresas." onRetry={() => void load()} />}
      {!loading && !error && (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.code}
          emptyTitle="Sin empresas"
          emptyDesc="No se descubrieron empresas en Profit."
          caption="Empresas Profit para inserción multiempresa."
        />
      )}
      {confirmStandard && (
        <Alert tone="warning">
          <strong>Marcar {confirmStandard} como empresa estándar.</strong> La estándar actual dejará de serlo.
          <div className="action-bar">
            <Button variant="secondary" size="sm" onClick={() => setConfirmStandard(null)}>Cancelar</Button>
            <Button size="sm" disabled={saving !== null} onClick={() => void setStandard(confirmStandard)}>Confirmar</Button>
          </div>
        </Alert>
      )}
    </SectionCard>
  );
};
