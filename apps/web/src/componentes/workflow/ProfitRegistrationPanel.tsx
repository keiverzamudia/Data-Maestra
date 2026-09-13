import * as React from 'react';
import { useSession } from '../../contextos/SessionContext';
import {
  SectionCard, Button, Alert, ConfirmDialog, Skeleton, Badge, SearchInput, Code,
} from '../ui';
import {
  apiProfitRegistrationService,
  RECONCILE_LABELS,
  profitErrorLabel,
  type ProfitPlan,
  type ProfitCreationResult,
  type ProfitVerifyResult,
} from '../../servicios/api/api-profit-registration-service';
import type { Request } from '../../tipos';

const VISIBLE_STATES = ['APROBADO_FINAL', 'PROCESANDO_PROFIT', 'REGISTRADO_PROFIT', 'ERROR_PROFIT'];

/**
 * Registro controlado en Profit (14F.2, solo presentación).
 * Flujo: dry-run → confirmación humana → creación → verificación.
 * La escritura real sigue bloqueada por flag + permiso PROFIT.WRITE.
 */
export const ProfitRegistrationPanel: React.FC<{ request: Request; onChanged?: () => void }> = ({ request, onChanged }) => {
  const { hasPermission, user } = useSession();
  const [plan, setPlan] = React.useState<ProfitPlan | null>(null);
  const [result, setResult] = React.useState<ProfitCreationResult | null>(null);
  const [verifyCoArt, setVerifyCoArt] = React.useState('');
  const [verifyResult, setVerifyResult] = React.useState<ProfitVerifyResult | null>(null);
  const [busy, setBusy] = React.useState<'plan' | 'create' | 'verify' | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!VISIBLE_STATES.includes(request.status)) return null;
  const canWrite = hasPermission('PROFIT.WRITE');
  const isFinal = request.status === 'APROBADO_FINAL';

  // El plan caduca si cambia la solicitud.
  React.useEffect(() => {
    setPlan(null);
    setResult(null);
    setVerifyResult(null);
    setError(null);
  }, [request.id, request.status]);

  const runPlan = async () => {
    setBusy('plan');
    setError(null);
    try {
      setPlan(await apiProfitRegistrationService.plan(request.id));
    } catch (err: any) {
      setError(err?.message || 'No se pudo validar el artículo.');
    } finally {
      setBusy(null);
    }
  };

  const runCreate = async () => {
    setConfirmOpen(false);
    setBusy('create');
    setError(null);
    try {
      const r = await apiProfitRegistrationService.create(request.id);
      setResult(r);
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'No se pudo registrar en Profit.');
    } finally {
      setBusy(null);
    }
  };

  const runVerify = async () => {
    if (!verifyCoArt.trim()) return;
    setBusy('verify');
    setError(null);
    try {
      setVerifyResult(await apiProfitRegistrationService.verify(request.id, verifyCoArt.trim()));
    } catch (err: any) {
      setError(err?.message || 'No se pudo verificar en Profit.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard
      title="Registro en Profit"
      desc="Creación controlada del artículo aprobado. La escritura real requiere permiso y bandera habilitada."
    >
      {request.status === 'PROCESANDO_PROFIT' && (
        <Alert tone="info">Registro en curso. Si esta pantalla no avanza, use la verificación posterior.</Alert>
      )}
      {request.status === 'REGISTRADO_PROFIT' && (
        <Alert tone="success">Artículo registrado en Profit. Use la verificación posterior para re-confirmar cualquier código.</Alert>
      )}
      {request.status === 'ERROR_PROFIT' && (
        <Alert tone="danger">Error técnico en el registro (no es rechazo de negocio). La recuperación es una nueva creación.</Alert>
      )}

      {isFinal && !plan && !result && (
        <div className="stack-sm">
          <p className="muted small">Ejecute primero la validación completa (dry-run, sin escritura).</p>
          <div><Button variant="secondary" onClick={runPlan} disabled={busy !== null}>{busy === 'plan' ? 'Validando...' : 'Validar artículo (dry-run)'}</Button></div>
        </div>
      )}

      {isFinal && plan && !result && (
        <div className="stack-sm">
          <div className="perm-toolbar">
            <span>Candidato: <Code>{plan.candidate}</Code></span>
            <Badge tone={plan.available ? 'green' : 'yellow'}>{plan.available ? 'DISPONIBLE' : 'OCUPADO'}</Badge>
          </div>
          <div className="review-grid">
            <div><span className="muted small">Descripción</span><br /><strong>{plan.payload.art_des}</strong></div>
            <div><span className="muted small">Tipo</span><br /><strong>{plan.payload.tipo}</strong></div>
            <div><span className="muted small">Línea / Sublínea</span><br /><strong>{plan.payload.co_lin} / {plan.payload.co_subl}</strong></div>
            <div><span className="muted small">Unidad</span><br /><strong>{plan.payload.uni_venta}</strong></div>
            <div><span className="muted small">Impuesto</span><br /><strong>{plan.payload.tipo_imp}</strong></div>
            <div><span className="muted small">Categoría / Color</span><br /><strong>{plan.payload.co_cat} / {plan.payload.co_color}</strong></div>
          </div>
          {plan.warnings.map((w, i) => <Alert key={i} tone="info">{w}</Alert>)}
          {!canWrite && <Alert tone="warning">Requiere permiso PROFIT.WRITE para registrar. Su usuario: {user?.displayName ?? '—'}.</Alert>}
          <div className="action-bar">
            <Button variant="secondary" onClick={runPlan} disabled={busy !== null}>Revalidar</Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={busy !== null || !canWrite || !plan.available}>
              {busy === 'create' ? 'Registrando...' : 'Registrar en Profit'}
            </Button>
          </div>
          {!plan.available && (
            <p className="muted small">El candidato está ocupado: el motor avanzará al siguiente correlativo de la misma línea/sublinea.</p>
          )}
        </div>
      )}

      {result && (
        <div className="stack-sm">
          <div className="perm-toolbar">
            <span>Resultado: <Code>{result.coArt || '—'}</Code></span>
            <Badge tone={RECONCILE_LABELS[result.reconcile].tone}>{RECONCILE_LABELS[result.reconcile].text}</Badge>
          </div>
          {result.attempts.length > 0 && (
            <div className="stack-sm">
              {result.attempts.map(a => (
                <div key={a.attempt} className="dryrun-check">
                  <span aria-hidden>{a.outcome === 'INSERTED' ? '✓' : a.outcome === 'COLLISION' ? '⇄' : '✗'}</span>
                  <div>
                    <Code>{a.candidate}</Code>
                    <span className="muted small"> — intento {a.attempt}: {a.outcome === 'INSERTED' ? 'insertado' : a.outcome === 'COLLISION' ? 'colisión, siguiente candidato' : `error${a.errorCode ? ` (${a.errorCode})` : ''}`}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {result.differences.length > 0 && (
            <Alert tone="warning">Diferencias Profit: {result.differences.join(', ')}.</Alert>
          )}
          {result.errorCode && (
            <Alert tone="danger">{profitErrorLabel(result.errorCode)}{result.errorDetail ? ` — ${result.errorDetail}` : ''}</Alert>
          )}
        </div>
      )}

      <div className="stack-sm block-mt">
        <h4 className="perm-domain">Verificación posterior</h4>
        <div className="toolbar">
          <span className="grow">
            <SearchInput value={verifyCoArt} onChange={setVerifyCoArt} placeholder="co_art a verificar..." />
          </span>
          <Button variant="secondary" size="sm" onClick={runVerify} disabled={busy !== null || !verifyCoArt.trim() || !canWrite}>
            {busy === 'verify' ? 'Verificando...' : 'Verificar'}
          </Button>
        </div>
        {verifyResult && (
          <div className="perm-toolbar">
            <span><Code>{verifyResult.coArt}</Code></span>
            <Badge tone={RECONCILE_LABELS[verifyResult.reconcile].tone}>{RECONCILE_LABELS[verifyResult.reconcile].text}</Badge>
          </div>
        )}
        {verifyResult && verifyResult.differences.length > 0 && (
          <p className="muted small">Diferencias: {verifyResult.differences.join(', ')}.</p>
        )}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <ConfirmDialog
        open={confirmOpen}
        title="Registrar artículo en Profit"
        desc={plan ? `Se creará ${plan.candidate} (${plan.payload.art_des}) en Profit. Operación controlada y auditada; ante colisión el motor avanza al siguiente correlativo.` : undefined}
        confirmLabel="Confirmar registro"
        busy={busy === 'create'}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={runCreate}
      />
    </SectionCard>
  );
};
