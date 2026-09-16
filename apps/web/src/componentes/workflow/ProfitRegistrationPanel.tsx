import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../contextos/SessionContext';
import {
  SectionCard, Button, Alert, ConfirmDialog, Badge, SearchInput, Code, Input,
} from '../ui';
import {
  apiProfitRegistrationService,
  RECONCILE_LABELS,
  profitErrorLabel,
  profitErrorAction,
  profitOpState,
  type ProfitWriteStatus,
  type ProfitPlan,
  type ProfitCreationResult,
  type ProfitVerifyResult,
  type ProfitAttemptRecord,
  type ProfitRetryResult,
} from '../../servicios/api/api-profit-registration-service';
import { apiCorporateService, type CorporateCompany } from '../../servicios/api/api-corporate-service';
import type { Request } from '../../tipos';

// 16A — visible en la puerta a Profit y estados finales (backend es la autoridad).
const VISIBLE_STATES = ['CONTABILIDAD_APROBADA', 'PROCESANDO_PROFIT', 'INSERTADO_PROFIT', 'ERROR_PROFIT'];

/**
 * Registro en Profit (14F/14J/14R, solo presentación).
 * 14R — experiencia corporativa: el usuario ve estado, códigos y acciones.
 * Nada de infraestructura (servidor, base, auth, usuarios técnicos),
 * nada de jerga del motor (dry-run, candidato, correlation id, preflight).
 * Los detalles técnicos siguen en auditoría/backend para diagnóstico.
 * Semántica de color (§22): verde = operación real + verificada;
 * rojo = error real; ámbar = incierto; gris = deshabilitado.
 */
export const ProfitRegistrationPanel: React.FC<{ request: Request; onChanged?: () => void }> = ({ request, onChanged }) => {
  const { hasPermission } = useSession();
  const navigate = useNavigate();
  const [writeStatus, setWriteStatus] = React.useState<ProfitWriteStatus | null>(null);
  const [plan, setPlan] = React.useState<ProfitPlan | null>(null);
  const [result, setResult] = React.useState<ProfitCreationResult | null>(null);
  const [verifyCoArt, setVerifyCoArt] = React.useState('');
  const [verifyResult, setVerifyResult] = React.useState<ProfitVerifyResult | null>(null);
  const [busy, setBusy] = React.useState<'plan' | 'create' | 'verify' | 'retry' | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [attempts, setAttempts] = React.useState<ProfitAttemptRecord[]>([]);
  const [retryNote, setRetryNote] = React.useState<string | null>(null);
  // FASE 17 — destinos adicionales: el estándar siempre se incluye; si no se
  // elige ninguno, el registro es simple (comportamiento histórico).
  const [corpCompanies, setCorpCompanies] = React.useState<CorporateCompany[]>([]);
  const [corpSelected, setCorpSelected] = React.useState<Set<string>>(new Set());

  if (!VISIBLE_STATES.includes(request.status)) return null;
  const canWrite = hasPermission('PROFIT.WRITE');
  // 16A — puerta a Profit: Contabilidad aprobada (última aprobación humana).
  const isFinal = request.status === 'CONTABILIDAD_APROBADA';
  const ambiguous = !!result && !result.ok && result.errorCode === 'ERROR_PROFIT_AMBIGUOUS';
  const success = !!result && result.ok && result.reconcile === 'CREATED_AND_VERIFIED';

  React.useEffect(() => {
    let cancelled = false;
    apiProfitRegistrationService.writeStatus()
      .then(s => { if (!cancelled) setWriteStatus(s); })
      .catch(() => { if (!cancelled) setWriteStatus({ enabled: false, configured: false, auth: 'sql', connected: false }); });
    return () => { cancelled = true; };
  }, []);

  // El plan caduca si cambia la solicitud.
  React.useEffect(() => {
    setPlan(null);
    setResult(null);
    setVerifyResult(null);
    setError(null);
    setRetryNote(null);
    setConfirmText('');
    setCorpSelected(new Set());
  }, [request.id, request.status]);

  // Empresas destino disponibles cuando el registro está listo (solo lectura).
  React.useEffect(() => {
    if (!plan || !isFinal || result) return;
    let cancelled = false;
    apiCorporateService.companies()
      .then((list) => { if (!cancelled) setCorpCompanies(list.filter((c) => !c.isStandard)); })
      .catch(() => { if (!cancelled) setCorpCompanies([]); });
    return () => { cancelled = true; };
  }, [plan, isFinal, result]);

  const loadAttempts = React.useCallback(async () => {
    try {
      const h = await apiProfitRegistrationService.attempts(request.id);
      setAttempts(h.attempts);
    } catch {
      // El historial es informativo; no bloquea el módulo.
    }
  }, [request.id]);

  React.useEffect(() => { void loadAttempts(); }, [loadAttempts, request.status]);

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
    setConfirmText('');
    setBusy('create');
    setError(null);
    try {
      const r = corpSelected.size > 0
        ? await apiProfitRegistrationService.create(request.id, [...corpSelected])
        : await apiProfitRegistrationService.create(request.id);
      setResult(r);
      await loadAttempts();
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'No se pudo registrar en Profit.');
    } finally {
      setBusy(null);
    }
  };

  const runPrepare = async () => {
    await runPlan();
    await loadAttempts();
  };

  const runRetry = async () => {
    setBusy('retry');
    setError(null);
    setRetryNote(null);
    try {
      await apiProfitRegistrationService.retry(request.id);
      setRetryNote('Recuperación lista. Requiere nueva confirmación.');
      await loadAttempts();
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'No se pudo preparar la recuperación.');
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

  const accCount = request.accountingCodes?.length ?? 0;
  const serviceUp = !!writeStatus?.configured && !!writeStatus?.connected;
  const writeBlocked = writeStatus && (!writeStatus.enabled || !writeStatus.configured);
  const registeredCode = attempts.find(a => a.result === 'SUCCESS')?.coArt ?? result?.coArt ?? null;
  const opState = profitOpState({
    writeBlocked: !!writeBlocked,
    busy,
    plan,
    result,
    requestStatus: request.status,
  });
  // 14R — etiquetas para el usuario (los códigos internos del motor no se muestran).
  const OP_LABEL: Record<string, string> = {
    DISABLED: 'NO DISPONIBLE', READY: 'DISPONIBLE', VALIDATING: 'VERIFICANDO INFORMACIÓN',
    READY_TO_WRITE: 'LISTO PARA ENVIAR', WRITING: 'ENVIANDO A PROFIT', VERIFYING: 'CONFIRMANDO REGISTRO',
    SUCCESS: 'REGISTRADO', FAILED: 'NO REGISTRADO', UNKNOWN: 'POR CONFIRMAR', RETRY_REQUIRED: 'REQUIERE VERIFICACIÓN',
  };

  return (
    <SectionCard
      title="Registro en Profit"
      desc="El artículo aprobado se registrará en Profit con el código indicado."
    >
      <div className="perm-toolbar">
        <span className={`profit-dot${serviceUp ? ' profit-dot-ok' : ''}`} aria-hidden="true" />
        <span className="muted small" role="status">
          {serviceUp ? 'Profit disponible' : 'Profit no disponible'}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Badge tone={opState === 'SUCCESS' ? 'green' : opState === 'FAILED' ? 'red' : opState === 'UNKNOWN' || opState === 'RETRY_REQUIRED' ? 'yellow' : 'gray'}>
            {OP_LABEL[opState]}
          </Badge>
        </span>
      </div>

      {writeBlocked && (
        <Alert tone="info">
          <strong>Registro en Profit no disponible.</strong> El registro está
          temporalmente deshabilitado.
        </Alert>
      )}
      {!writeBlocked && !canWrite && (
        <Alert tone="warning">
          <strong>Registro no disponible.</strong> Tu usuario no tiene
          autorización para realizar este registro.
        </Alert>
      )}
      {request.status === 'PROCESANDO_PROFIT' && (
        <Alert tone="info">Enviando a Profit... Si no avanza, use la verificación posterior.</Alert>
      )}
      {request.status === 'INSERTADO_PROFIT' && (
        <Alert tone="success">
          <strong>✓ Registrado en Profit</strong>
          {registeredCode && <><br />Código Profit: <Code>{registeredCode}</Code></>}
        </Alert>
      )}
      {request.status === 'ERROR_PROFIT' && (
        <Alert tone="danger">No fue posible registrar el artículo en Profit. Verifique primero; la recuperación es una nueva creación, nunca automática.</Alert>
      )}

      {/* Héroe corporativo: Master → Profit. */}
      <div className="profit-hero" aria-label="Códigos del registro">
        <div>
          <span className="muted small">Código Master</span>
          <div className="mono profit-hero-code">{request.masterCode || '—'}</div>
        </div>
        <span className="profit-hero-arrow" aria-hidden="true">→</span>
        <div>
          <span className="muted small">Código Profit</span>
          <div className="mono profit-hero-code">{plan?.candidate ?? registeredCode ?? '—'}</div>
        </div>
      </div>
      <p className="muted small">{request.requestedDescription}</p>
      {accCount > 0 && (
        <p className="muted small">Contabilidad validada ({accCount}).</p>
      )}

      {isFinal && !plan && !result && (
        <div className="stack-sm block-mt">
          <p><strong>Listo para enviar a Profit</strong></p>
          <p className="muted small">Valide la información antes de registrar.</p>
          {canWrite ? (
            <div className="action-bar" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
              <Button variant="secondary" onClick={runPrepare} disabled={busy !== null}>{busy === 'plan' ? 'Validando...' : 'Preparar registro'}</Button>
            </div>
          ) : (
            <p className="muted small">La preparación y el registro en Profit requieren autorización. Usted puede seguir el estado de la solicitud.</p>
          )}
        </div>
      )}

      {/* Recuperación de ERROR_PROFIT: revalida y re-encola, nunca escribe. */}
      {request.status === 'ERROR_PROFIT' && (
        <div className="stack-sm block-mt">
          <p className="muted small">
            El registro anterior falló por un error técnico. Puede preparar una
            recuperación: se revalidará todo y, solo si está listo, volverá a
            Contabilidad aprobada para una nueva confirmación. El historial se conserva.
          </p>
          {!canWrite && <Alert tone="warning">Requiere autorización para registrar.</Alert>}
          <div>
            <Button variant="secondary" onClick={runRetry} disabled={busy !== null || !canWrite}>
              {busy === 'retry' ? 'Preparando...' : 'Reintentar registro en Profit'}
            </Button>
          </div>
          {retryNote && <Alert tone="success">{retryNote}</Alert>}
        </div>
      )}

      {isFinal && plan && !result && (
        <div className="stack-sm block-mt">
          <p><strong>✓ LISTO PARA REGISTRAR EN PROFIT</strong></p>
          <p className="muted small">Este artículo de Data-Maestra está listo para convertirse en este código de Profit.</p>
          {plan.warnings.map((w, i) => <Alert key={i} tone="info">{w}</Alert>)}
          {canWrite && corpCompanies.length > 0 && (
            <fieldset>
              <legend className="muted small">Empresas adicionales (el estándar siempre se incluye)</legend>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {corpCompanies.map((c) => (
                  <label key={c.code} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={corpSelected.has(c.code)}
                      onChange={() => setCorpSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.code)) next.delete(c.code);
                        else next.add(c.code);
                        return next;
                      })}
                      aria-label={`Registrar también en ${c.code}`}
                    />
                    <span><strong className="mono">{c.code}</strong></span>
                  </label>
                ))}
              </div>
              {corpSelected.size > 0 && (
                <p className="muted small">Se registrará el mismo código en {corpSelected.size + 1} empresa(s) en una sola operación. Si alguna falla, no se escribe en ninguna.</p>
              )}
            </fieldset>
          )}
          {canWrite ? (
            <div className="action-bar">
              <Button variant="secondary" onClick={runPlan} disabled={busy !== null}>Revalidar</Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={busy !== null || !plan.available || !!writeBlocked}
                title={writeBlocked ? 'Registro no disponible' : undefined}
              >
                {busy === 'create' ? 'Enviando...' : 'Registrar en Profit'}
              </Button>
            </div>
          ) : (
            <p className="muted small">El registro en Profit requiere autorización. Usted puede seguir el estado de la solicitud.</p>
          )}
          {writeBlocked && (
            <p className="muted small">Botón deshabilitado mientras el registro esté deshabilitado.</p>
          )}
          {!plan.available && (
            <p className="muted small">El código propuesto está ocupado: se usará el siguiente disponible.</p>
          )}
        </div>
      )}

      {busy === 'create' && (
        <Alert tone="info">Enviando a Profit... No cierre esta pantalla.</Alert>
      )}

      {/* Éxito real y verificado (único verde permitido). */}
      {success && result && (
        <div className="stack-sm block-mt">
          <Alert tone="success">
            <strong>✓ Registrado en Profit</strong><br />
            Código Profit: <Code>{result.coArt}</Code><br />
            Verificación: ✓ Confirmado en Profit
            {result.companies && result.companies.length > 1 && (
              <><br />Empresas: {result.companies.join(', ')}</>
            )}
          </Alert>
          <div className="perm-toolbar">
            <span>Resultado:</span>
            <Badge tone={RECONCILE_LABELS[result.reconcile].tone}>{RECONCILE_LABELS[result.reconcile].text}</Badge>
          </div>
          <div>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/requester/${request.id}`)}>Ver detalle</Button>
          </div>
          {result.differences.length > 0 && (
            <Alert tone="warning">Diferencias en Profit: {result.differences.join(', ')}.</Alert>
          )}
        </div>
      )}

      {/* Error real + acción recomendada. */}
      {result && !result.ok && !ambiguous && (
        <div className="stack-sm block-mt">
          <Alert tone="danger">
            <strong>No fue posible registrar el artículo en Profit.</strong><br />
            Motivo: {profitErrorLabel(result.errorCode)}
            {result.errorDetail ? ` — ${result.errorDetail}` : ''}
          </Alert>
          {profitErrorAction(result.errorCode) && (
            <p className="muted small">Acción recomendada: {profitErrorAction(result.errorCode)}</p>
          )}
          {result.attempts.length > 0 && (
            <div className="stack-sm">
              {result.attempts.map(a => (
                <div key={a.attempt} className="dryrun-check">
                  <span aria-hidden>{a.outcome === 'INSERTED' ? '✓' : '✗'}</span>
                  <div>
                    <Code>{a.candidate}</Code>
                    <span className="muted small"> — intento {a.attempt}: {a.outcome === 'INSERTED' ? 'registrado' : 'no registrado'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div><Button variant="secondary" onClick={() => { setResult(null); setPlan(null); void runPlan(); }}>Verificar y reintentar</Button></div>
        </div>
      )}

      {/* Resultado incierto: solo verificación, jamás re-registro. */}
      {ambiguous && result && (
        <div className="stack-sm block-mt">
          <Alert tone="warning">
            <strong>No se pudo confirmar el resultado del registro.</strong><br />
            No intentes registrarlo nuevamente sin verificar primero.
          </Alert>
          <div className="perm-toolbar">
            <span>Código Profit: <Code>{result.coArt || '—'}</Code></span>
          </div>
        </div>
      )}

      <div className="stack-sm block-mt">
        <h4 className="perm-domain">Historial de intentos</h4>
        {attempts.length === 0 ? (
          <p className="muted small">Sin intentos registrados para esta solicitud.</p>
        ) : (
          <div className="stack-sm">
            {attempts.map(a => (
              <div key={a.attempt} className="perm-row">
                <div className="perm-main">
                  <div className="perm-name">Intento #{a.attempt} — {a.result === 'SUCCESS' ? 'REGISTRADO' : a.result === 'FAILED' ? 'NO REGISTRADO' : 'POR CONFIRMAR'}</div>
                  <div className="muted small">
                    {a.createdAt ? new Date(a.createdAt).toLocaleString('es-VE') : '—'}
                    {a.coArt ? <> · <Code>{a.coArt}</Code></> : null}
                    {a.errorCode ? <> · {a.errorCode}</> : null}
                  </div>
                </div>
                <Badge tone={a.result === 'SUCCESS' ? 'green' : a.result === 'FAILED' ? 'red' : 'yellow'}>
                  {a.result === 'SUCCESS' ? '✓' : a.result === 'FAILED' ? '✗' : '?'} {a.result === 'SUCCESS' ? 'REGISTRADO' : a.result === 'FAILED' ? 'FALLIDO' : 'INCIERTO'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="stack-sm block-mt">
        <h4 className="perm-domain">Verificación posterior</h4>
        <div className="toolbar">
          <span className="grow">
            <SearchInput value={verifyCoArt} onChange={setVerifyCoArt} placeholder="Código Profit a verificar..." />
          </span>
          <Button variant="secondary" size="sm" onClick={runVerify} disabled={busy !== null || !verifyCoArt.trim() || !canWrite}>
            {busy === 'verify' ? 'Verificando...' : 'Verificar en Profit'}
          </Button>
        </div>
        {verifyResult && (
          <div className="perm-toolbar">
            <span><Code>{verifyResult.coArt}</Code></span>
            <Badge tone={RECONCILE_LABELS[verifyResult.reconcile].tone}>{RECONCILE_LABELS[verifyResult.reconcile].text}</Badge>
          </div>
        )}
        {verifyResult?.reconcile === 'NOT_FOUND' && (
          <Alert tone="danger"><strong>Artículo no verificado.</strong> No se encontró en Profit; esto no afirma que el registro fallara — revise el historial de intentos.</Alert>
        )}
        {verifyResult && verifyResult.differences.length > 0 && (
          <p className="muted small">Diferencias: {verifyResult.differences.join(', ')}.</p>
        )}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {/* Confirmación textual (no sustituye los gates del backend). */}
      <ConfirmDialog
        open={confirmOpen}
        title="Registrar artículo en Profit"
        desc={plan ? `Está a punto de registrar este artículo en Profit. Solicitud: ${request.requestNumber}. Código Profit: ${plan.candidate}.${corpSelected.size > 0 ? ` Mismo código en ${corpSelected.size + 1} empresas, en una sola operación (si alguna falla, no se escribe en ninguna).` : ''} Esta operación creará el artículo en Profit. Para confirmar, escriba REGISTRAR EN PROFIT.` : undefined}
        confirmLabel="Confirmar registro"
        busy={busy === 'create'}
        confirmDisabled={confirmText.trim() !== 'REGISTRAR EN PROFIT'}
        onCancel={() => { setConfirmOpen(false); setConfirmText(''); }}
        onConfirm={runCreate}
      >
        <Input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder="REGISTRAR EN PROFIT"
          aria-label="Confirmación textual"
          autoComplete="off"
        />
      </ConfirmDialog>
    </SectionCard>
  );
};
