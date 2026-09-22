import * as React from 'react';
import {
  Page, SectionCard, Button, Alert, Skeleton, ErrorState,
  DataTable, Badge, type DataColumn,
} from '../../componentes/ui';
import { HelpButton } from '../../componentes/ayuda';
import {
  apiMultiCompanyService,
  type ProfitCompanyConfigView,
} from '../../servicios/api/api-multiempresa-service';

/**
 * FASE 25 — Empresas Profit para inserción (solo flags locales).
 * El descubrimiento es dinámico (TEmpresas); aquí se habilita/deshabilita
 * y se marca la estándar. Ruta protegida con ADMIN.MANAGE.
 */
export const ProfitCompaniesAdmin: React.FC = () => {
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
  ];

  return (
    <Page title="Empresas Profit" desc="Empresas descubiertas en Profit y su disponibilidad para inserción de artículos." actions={<HelpButton helpKey="empresas-profit" />}>
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
    </Page>
  );
};

