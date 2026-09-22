import * as React from 'react';
import {
  Page, SectionCard, Button, Alert, Skeleton, ErrorState, Input,
  ConfirmDialog, DataTable, type DataColumn,
} from '../../componentes/ui';
import { HelpButton } from '../../componentes/ayuda';
import {
  apiMantenimientoService,
  type ResetPreview,
  type ResetResult,
  type ResetPreviewTable,
} from '../../servicios/api/api-mantenimiento-service';

const CONFIRM_TOKEN = 'BORRAR TODO';

/**
 * MODO PRUEBAS — Borrado de datos operativos (solo ADMIN.MANAGE).
 * Muestra qué se borrará (vista previa), exige confirmación escrita y ejecuta.
 * Conserva sistema, catálogos Profit, universo histórico, master items e
 * importaciones. Requiere ALLOW_TEST_RESET=true en el backend; si no, la
 * sección queda deshabilitada sin botón de borrado.
 */
export const MantenimientoSection: React.FC = () => {
  const [preview, setPreview] = React.useState<ResetPreview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [disabled, setDisabled] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ResetResult | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setListError(null);
    setDisabled(false);
    apiMantenimientoService.getResetPreview().then(
      (p) => { setPreview(p); setLoading(false); },
      (err: unknown) => {
        setPreview(null);
        setLoading(false);
        if (typeof err === 'object' && err !== null && (err as { status?: number }).status === 403) {
          setDisabled(true);
        } else {
          setListError('No pudimos cargar la vista previa del borrado.');
        }
      },
    );
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const runReset = async () => {
    setConfirmOpen(false);
    setConfirmText('');
    setSaving(true);
    setError(null);
    try {
      const r = await apiMantenimientoService.resetTestData(CONFIRM_TOKEN);
      setResult(r);
      await load();
    } catch (err: unknown) {
      const message = typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message?: unknown }).message)
        : null;
      setError(message || 'No se pudo ejecutar el borrado.');
    } finally {
      setSaving(false);
    }
  };

  const columns: Array<DataColumn<ResetPreviewTable>> = [
    { key: 'label', header: 'Tabla', label: 'Tabla', render: (r) => <strong>{r.label}</strong> },
    { key: 'count', header: 'Registros', label: 'Registros', render: (r) => <span className="mono">{r.count}</span> },
  ];

  const resultRows = result
    ? Object.entries(result.deleted).map(([table, count]) => ({ table, label: table, count }))
    : [];

  return (
    <Page
      title="Mantenimiento"
      desc="Zona de pruebas: borrado de datos operativos con resguardo."
      actions={<HelpButton helpKey="mantenimiento" />}
    >
      <SectionCard
        title="Borrar datos de prueba"
        desc="Elimina solicitudes, workflow, aprobaciones, notificaciones y auditoría. Conserva sistema, catálogos Profit, universo histórico, master items e importaciones."
      >
        <Alert tone="danger">
          <strong>Operación irreversible.</strong> Solo para ambiente de pruebas.
          Profit nunca se toca.
        </Alert>

        {loading && (
          <div className="card p16 stack-sm" aria-label="Cargando vista previa">
            <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} />
          </div>
        )}

        {!loading && disabled && (
          <Alert tone="warning">
            <strong>Función no disponible.</strong> El backend no tiene habilitado
            el borrado de pruebas (<span className="mono">ALLOW_TEST_RESET=true</span>).
          </Alert>
        )}

        {!loading && !disabled && listError && (
          <ErrorState title={listError} onRetry={load} />
        )}

        {!loading && !disabled && !listError && preview && (
          <div className="stack-sm">
            <p className="muted small">
              Se borrarán <strong>{preview.total}</strong> registro(s) en {preview.tables.length} tablas.
            </p>
            <DataTable<ResetPreviewTable>
              columns={columns}
              rows={preview.tables}
              rowKey={(r) => r.table}
              caption={`${preview.total} registros por borrar.`}
            />
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="action-bar" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
              <Button variant="danger" onClick={() => { setConfirmText(''); setResult(null); setConfirmOpen(true); }} disabled={saving}>
                {saving ? 'Borrando…' : 'Borrar datos de prueba'}
              </Button>
            </div>
          </div>
        )}

        {result && (
          <Alert tone="success">
            <strong>Borrado completado.</strong> {result.total} registro(s) eliminados
            el {new Date(result.executedAt).toLocaleString('es-VE')}.
          </Alert>
        )}

        {result && resultRows.length > 0 && (
          <DataTable<ResetPreviewTable>
            columns={columns}
            rows={resultRows}
            rowKey={(r) => r.table}
            caption={`Resultado del último borrado: ${result.total} registros.`}
          />
        )}
      </SectionCard>

      <ConfirmDialog
        open={confirmOpen}
        title="Borrar datos de prueba"
        desc="Esta acción eliminará todas las solicitudes, su workflow, aprobaciones, notificaciones y auditoría. No se puede deshacer. Para confirmar, escriba BORRAR TODO."
        confirmLabel="Confirmar borrado"
        busy={saving}
        confirmDisabled={confirmText.trim() !== CONFIRM_TOKEN}
        onCancel={() => { setConfirmOpen(false); setConfirmText(''); }}
        onConfirm={runReset}
      >
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="BORRAR TODO"
          aria-label="Confirmación escrita"
          autoComplete="off"
        />
      </ConfirmDialog>
    </Page>
  );
};
