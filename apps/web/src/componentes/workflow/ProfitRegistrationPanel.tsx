import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../contextos/SessionContext';
import { useCatalogos } from '../../hooks/useCatalogos';
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
import type { Request } from '../../tipos';

// 16A — visible en la puerta a Profit y estados técnicos (backend es la autoridad).
const VISIBLE_STATES = ['CONTABILIDAD_APROBADA', 'PROCESANDO_PROFIT', 'INSERTADO_PROFIT', 'ERROR_PROFIT'];

/**
 * Registro en Profit (14F/14J, solo presentación).
 * 16A — vive en la pestaña de Contabilidad; la escritura exige
 * CONTABILIDAD_APROBADA + PROFIT.WRITE + bandera (backend valida todo).
 * Semántica de color (§22): verde = operación real + verificada;
 * rojo = error real; ámbar = incierto; gris = deshabilitado.
 * READY/dry-run nunca usan verde.
 */
export const ProfitRegistrationPanel: React.FC<{ request: Request; onChanged?: () => void }> = ({ request, onChanged }) => {
  const { hasPermission, user, roleCodes } = useSession();
  const { grupos, subgrupos, unidades } = useCatalogos();
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
  }, [request.id, request.status]);

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
      const r = await apiProfitRegistrationService.create(request.id);
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
      const r: ProfitRetryResult = await apiProfitRegistrationService.retry(request.id);
      setRetryNote(`Recuperación lista: candidato ${r.candidate} (${r.available ? 'disponible' : 'ocupado'}). Requiere nueva confirmación.`);
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

  const groupName = grupos.find(g => g.id === request.groupId)?.name ?? request.groupId ?? '—';
  const subgroupName = subgrupos.find(s => s.id === request.subgroupId)?.name ?? request.subgroupId ?? '—';
  const unitName = unidades.find(u => u.id === request.unitId)?.name ?? request.unitCode ?? '—';
  const accCount = request.accountingCodes?.length ?? 0;
  const notConfigured = writeStatus && !writeStatus.configured;
  const writeBlocked = writeStatus && (!writeStatus.enabled || !writeStatus.configured);
  const opState = profitOpState({
    writeBlocked: !!writeBlocked,
    busy,
    plan,
    result,
    requestStatus: request.status,
  });
  const OP_LABEL: Record<string, string> = {
    DISABLED: 'ESCRITURA DESHABILITADA', READY: 'PREPARADO', VALIDATING: 'VALIDANDO',
    READY_TO_WRITE: 'LISTO PARA REGISTRAR', WRITING: 'REGISTRANDO', VERIFYING: 'VERIFICANDO',
    SUCCESS: 'REGISTRADO', FAILED: 'ERROR', UNKNOWN: 'RESULTADO INCIERTO', RETRY_REQUIRED: 'REQUIERE RECUPERACIÓN',
  };

  const readyChecks = plan ? [
    { label: 'Solicitud aprobada', ok: isFinal },
    { label: 'Datos completos', ok: !!plan.payload.art_des && !!plan.payload.co_lin && !!plan.payload.co_subl },
    { label: `Código Profit disponible (${plan.candidate})`, ok: plan.available },
    { label: `Conexión Profit disponible (${writeStatus?.server ?? '—'})`, ok: !!writeStatus?.connected },
    { label: 'Permiso de escritura disponible', ok: canWrite },
    { label: 'Dry-run READY', ok: plan.available },
  ] : [];

  return (
    <SectionCard
      title="Registro en Profit"
      desc="Creación controlada del artículo aprobado. Visible siempre; la escritura requiere permiso y bandera."
    >
      <div className="perm-toolbar">
        <span className="muted small">Estado operativo:</span>
        <Badge tone={opState === 'SUCCESS' ? 'green' : opState === 'FAILED' ? 'red' : opState === 'UNKNOWN' || opState === 'RETRY_REQUIRED' ? 'yellow' : 'gray'}>
          {OP_LABEL[opState]}
        </Badge>
      </div>
      {/* ESTADO 1 — configuración bloqueada / escritura deshabilitada */}
      {notConfigured && (
        <Alert tone="info">
          <strong>Escritura no disponible.</strong> Motivo: falta configuración
          de conexión. Acción: configurar conexión.
        </Alert>
      )}
      {writeStatus?.configured && !writeStatus.enabled && (
        <Alert tone="warning">
          <strong>🟡 REGISTRO PREPARADO.</strong> Los datos están validados y
          el artículo está listo para registrarse en Profit, pero la escritura
          está temporalmente deshabilitada.
          <br />Destino: {writeStatus.server ?? '—'} / {writeStatus.database ?? '—'}
          <br />Autenticación: {writeStatus.auth === 'windows' ? 'Windows integrada' : 'SQL'}
          <br />Conexión: {writeStatus.connected ? 'OK' : 'no comprobada'}
          <br />Permiso PROFIT.WRITE: {canWrite ? 'CONCEDIDO' : 'DENEGADO'}
          <br />Código Profit: {plan?.candidate ?? 'pendiente de dry-run'}
          <br />Disponibilidad: {plan ? (plan.available ? 'DISPONIBLE' : 'OCUPADO') : 'pendiente de dry-run'}
          <br />Dry-run: {plan ? 'READY_TO_WRITE' : 'pendiente'}
          <br />Para ejecutar una escritura real debe habilitarse temporalmente
          la escritura de Profit.
        </Alert>
      )}
      {!canWrite && (
        <Alert tone="danger">
          <strong>🔴 SIN PERMISO DE ESCRITURA.</strong> Contabilidad aprobada,
          pero tu usuario no posee el permiso PROFIT.WRITE y no puede registrar
          en Profit.
          <br />Usuario: {user?.displayName ?? '—'}
          <br />Roles: {roleCodes.length > 0 ? roleCodes.join(', ') : '—'}
          <br />Permiso: DENEGADO (efectivo)
          <br />Origen: RBAC efectivo (ningún rol asignado lo concede; el
          detalle de overrides está en Personas y acceso para administradores).
        </Alert>
      )}
      {canWrite && writeStatus?.configured && !writeStatus.enabled && (
        <Alert tone="info">
          <strong>🟡 LISTO — ESCRITURA TEMPORALMENTE DESHABILITADA.</strong> Tu
          usuario tiene permiso para registrar en Profit y la conexión está
          disponible, pero el motor de escritura está deshabilitado
          temporalmente.
        </Alert>
      )}
      {writeStatus?.configured && (
        <p className="muted small">
          Destino: {writeStatus.server ?? '—'} / {writeStatus.database ?? '—'} ·
          Auth: {writeStatus.auth === 'windows' ? 'Windows integrada' : 'SQL'} ·
          Conexión: {writeStatus.connected ? `OK${writeStatus.identity ? ` (${writeStatus.identity})` : ''}` : 'no comprobada'}
        </p>
      )}
      {request.status === 'PROCESANDO_PROFIT' && (
        <Alert tone="info">Estado: REGISTRANDO. Operación en curso; si no avanza, use la verificación posterior.</Alert>
      )}
      {request.status === 'INSERTADO_PROFIT' && (
        <Alert tone="success">Estado: REGISTRADO. Artículo verificado en Profit (detalle abajo).</Alert>
      )}
      {request.status === 'ERROR_PROFIT' && (
        <Alert tone="danger">Estado: ERROR. Error técnico (no es rechazo de negocio). Verifique primero; la recuperación es una nueva creación, nunca automática.</Alert>
      )}

      {/* Resumen previo §28 con datos ya aprobados (nada se vuelve a pedir). */}
      <div className="review-grid">
        <div><span className="muted small">Código Master</span><br /><strong className="mono">{request.masterCode || '—'}</strong></div>
        <div><span className="muted small">Código Profit previsto</span><br /><strong className="mono">{plan?.candidate ?? '—'}</strong></div>
        <div><span className="muted small">Descripción</span><br /><strong>{request.requestedDescription}</strong></div>
        <div><span className="muted small">Línea</span><br /><strong>{groupName}</strong></div>
        <div><span className="muted small">Sub-línea</span><br /><strong>{subgroupName}</strong></div>
        <div><span className="muted small">Unidad</span><br /><strong>{unitName}</strong></div>
        <div><span className="muted small">Contabilidad</span><br /><strong>{accCount > 0 ? `✓ Validada (${accCount})` : 'Sin información'}</strong></div>
        <div><span className="muted small">Estado Profit</span><br /><strong>{request.status === 'CONTABILIDAD_APROBADA' ? '✓ Listo para registrar' : request.status}</strong></div>
      </div>

      {isFinal && !plan && !result && (
        <div className="stack-sm block-mt">
          <p className="muted small">Ejecute primero la validación completa (dry-run, sin escritura).</p>
          <div className="action-bar" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
            <Button variant="secondary" onClick={runPrepare} disabled={busy !== null}>{busy === 'plan' ? 'Validando...' : 'Preparar registro'}</Button>
          </div>
        </div>
      )}

      {/* Recuperación de ERROR_PROFIT: revalida y re-encola, nunca escribe. */}
      {request.status === 'ERROR_PROFIT' && (
        <div className="stack-sm block-mt">
          <p className="muted small">
            El registro anterior falló por un error técnico. Puede preparar una
            recuperación: se revalidará todo y, solo si READY, volverá a
            CONTABILIDAD_APROBADA para una nueva confirmación. El historial se conserva.
          </p>
          {!canWrite && <Alert tone="warning">Requiere permiso PROFIT.WRITE.</Alert>}
          <div>
            <Button variant="secondary" onClick={runRetry} disabled={busy !== null || !canWrite}>
              {busy === 'retry' ? 'Preparando...' : 'Reintentar registro en Profit'}
            </Button>
          </div>
          {retryNote && <Alert tone="success">{retryNote}</Alert>}
        </div>
      )}

      {/* ESTADO 2 — listo para registrar (sin verde: READY ≠ registrado). */}
      {isFinal && plan && !result && (
        <div className="stack-sm block-mt">
          <p><strong>✓ LISTO PARA REGISTRAR EN PROFIT</strong></p>
          {readyChecks.map(c => (
            <div key={c.label} className="dryrun-check">
              <span aria-hidden>{c.ok ? '✓' : '✗'}</span>
              <span className={c.ok ? '' : 'muted'}>{c.label}</span>
            </div>
          ))}
          <div className="perm-toolbar">
            <span>Candidato: <Code>{plan.candidate}</Code></span>
            <Badge tone={plan.available ? 'blue' : 'yellow'}>{plan.available ? 'DISPONIBLE' : 'OCUPADO'}</Badge>
          </div>
          <div className="review-grid">
            <div><span className="muted small">Tipo</span><br /><strong>{plan.payload.tipo}</strong></div>
            <div><span className="muted small">Impuesto</span><br /><strong>{plan.payload.tipo_imp}</strong></div>
            <div><span className="muted small">Categoría / Color</span><br /><strong>{plan.payload.co_cat} / {plan.payload.co_color}</strong></div>
            <div><span className="muted small">Proveedor / Costo</span><br /><strong>{plan.payload.co_prov} / {plan.payload.tipo_cos}</strong></div>
          </div>
          {plan.warnings.map((w, i) => <Alert key={i} tone="info">{w}</Alert>)}
          {!canWrite && <Alert tone="warning">Requiere permiso PROFIT.WRITE. Su usuario: {user?.displayName ?? '—'}.</Alert>}
          <div className="action-bar">
            <Button variant="secondary" onClick={runPlan} disabled={busy !== null}>Revalidar</Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={busy !== null || !canWrite || !plan.available || !!writeBlocked}
              title={writeBlocked ? 'Escritura deshabilitada' : undefined}
            >
              {busy === 'create' ? 'Registrando...' : 'Registrar en Profit'}
            </Button>
          </div>
          {writeBlocked && (
            <p className="muted small">Botón deshabilitado mientras la escritura esté deshabilitada.</p>
          )}
          {!plan.available && (
            <p className="muted small">El candidato está ocupado: el motor avanzará al siguiente correlativo de la misma línea/sublinea.</p>
          )}
        </div>
      )}

      {/* Registrando: un solo estado honesto (el motor no reporta sub-pasos). */}
      {busy === 'create' && (
        <Alert tone="info">REGISTRANDO EN PROFIT... Revalidando solicitud, verificando código y registrando artículo.</Alert>
      )}

      {/* ESTADO 5 — éxito real y verificado (único verde permitido). */}
      {success && result && (
        <div className="stack-sm block-mt">
          <Alert tone="success">
            <strong>✓ ARTÍCULO REGISTRADO EN PROFIT</strong><br />
            Código Profit: <Code>{result.coArt}</Code><br />
            Descripción: {request.requestedDescription}<br />
            Código Master: <span className="mono">{request.masterCode || '—'}</span><br />
            Solicitud: #{request.requestNumber}<br />
            Destino: {writeStatus?.server ?? '—'} / {writeStatus?.database ?? '—'}<br />
            Verificación: ✓ Confirmado en Profit<br />
            {result.correlationId && <>Correlation ID: <Code>{result.correlationId}</Code><br /></>}
          </Alert>
          <div className="perm-toolbar">
            <span>Reconciliación:</span>
            <Badge tone={RECONCILE_LABELS[result.reconcile].tone}>{RECONCILE_LABELS[result.reconcile].text}</Badge>
          </div>
          <div>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/requester/${request.id}`)}>Ver detalle</Button>
          </div>
          {result.differences.length > 0 && (
            <Alert tone="warning">Diferencias Profit: {result.differences.join(', ')}.</Alert>
          )}
        </div>
      )}

      {/* ESTADO 6 — error real + acción recomendada. */}
      {result && !result.ok && !ambiguous && (
        <div className="stack-sm block-mt">
          <Alert tone="danger">
            <strong>✕ NO SE PUDO REGISTRAR EN PROFIT</strong><br />
            Solicitud: #{request.requestNumber} · Código: <Code>{result.coArt || '—'}</Code><br />
            Resultado: ERROR_PROFIT<br />
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
                  <span aria-hidden>{a.outcome === 'INSERTED' ? '✓' : a.outcome === 'COLLISION' ? '⇄' : '✗'}</span>
                  <div>
                    <Code>{a.candidate}</Code>
                    <span className="muted small"> — intento {a.attempt}: {a.outcome === 'INSERTED' ? 'insertado' : a.outcome === 'COLLISION' ? 'colisión, siguiente candidato' : `error${a.errorCode ? ` (${a.errorCode})` : ''}`}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div><Button variant="secondary" onClick={() => { setResult(null); setPlan(null); void runPlan(); }}>Verificar y reintentar</Button></div>
        </div>
      )}

      {/* ESTADO 7 — resultado incierto: solo VERIFY, jamás re-registro. */}
      {ambiguous && result && (
        <div className="stack-sm block-mt">
          <Alert tone="warning">
            <strong>⚠ RESULTADO PENDIENTE DE VERIFICACIÓN</strong><br />
            El sistema no pudo determinar con certeza si Profit completó la
            operación. NO volver a insertar automáticamente.
          </Alert>
          <div className="perm-toolbar">
            <span>Candidato: <Code>{result.coArt || '—'}</Code></span>
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
                  <div className="perm-name">Intento #{a.attempt} — {a.result === 'SUCCESS' ? 'ÉXITO' : a.result === 'FAILED' ? 'FALLIDO' : 'INCIERTO'}</div>
                  <div className="muted small">
                    {a.createdAt ? new Date(a.createdAt).toLocaleString('es-VE') : '—'}
                    {a.coArt ? <> · <Code>{a.coArt}</Code></> : null}
                    {a.errorCode ? <> · {a.errorCode}</> : null}
                    {a.collisions.length > 0 ? <> · colisiones: {a.collisions.join(' → ')}</> : null}
                    {a.correlationId ? <> · <span className="mono">{a.correlationId}</span></> : null}
                  </div>
                </div>
                <Badge tone={a.result === 'SUCCESS' ? 'green' : a.result === 'FAILED' ? 'red' : 'yellow'}>
                  {a.result === 'SUCCESS' ? '✓' : a.result === 'FAILED' ? '✗' : '?'} {a.result}
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
            <SearchInput value={verifyCoArt} onChange={setVerifyCoArt} placeholder="co_art a verificar..." />
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
        {/* ESTADO 8 — verificación fallida: distinguir no-encontrado de error. */}
        {verifyResult?.reconcile === 'NOT_FOUND' && (
          <Alert tone="danger"><strong>✕ ARTÍCULO NO VERIFICADO.</strong> No se encontró en Profit; esto no afirma que el INSERT fallara — use el historial de intentos.</Alert>
        )}
        {verifyResult && verifyResult.differences.length > 0 && (
          <p className="muted small">Diferencias: {verifyResult.differences.join(', ')}.</p>
        )}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {/* ESTADO 3 — confirmación textual (no sustituye los gates del backend). */}
      <ConfirmDialog
        open={confirmOpen}
        title="Registrar artículo en Profit"
        desc={plan ? `Estás a punto de registrar un artículo en Profit. Solicitud: ${request.requestNumber}. Artículo: ${plan.payload.art_des}. Código Profit: ${plan.candidate}. Línea: ${plan.payload.co_lin}. Sub-línea: ${plan.payload.co_subl}. Esta operación modificará la base de datos de Profit (UN INSERT, sin UPDATE ni DELETE). Para confirmar, escriba REGISTRAR EN PROFIT.` : undefined}
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
