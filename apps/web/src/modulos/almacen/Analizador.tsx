import * as React from 'react';
import { apiMatchingService, type AnalyzerDraft, type AnalyzerResult, type EngineCandidate } from '../../servicios/api/api-matching-service';
import {
  getMatchClassificationLabel,
  getMatchDecisionLabel,
  getMatchEvidenceLabel,
  getMatchConflictLabel,
} from '../../utilidades/presentacion';
import { Button, Modal, ConfirmDialog, Alert, Skeleton, SectionCard, Badge, Select } from '../../componentes/ui';

type Estado = 'idle' | 'loading' | 'success' | 'empty' | 'insufficient' | 'error';

const COUNT_OPTIONS = [3, 5, 10, 20];

interface Props {
  requestId: string;
  /** Solo Almacén en PENDIENTE_ALMACEN puede decidir (el backend lo exige). */
  canDecide: boolean;
  /** Borrador del formulario (datos aún no guardados). null = sin datos. */
  draft: AnalyzerDraft | null;
  /** Incrementar para ejecutar inmediatamente (botón Validar artículo). */
  manualRun: number;
  /** Foto de referencia de la solicitud (solo referencia humana). */
  photoUri?: string | null;
  /** Retardo del auto-análisis en ms (tests). Por defecto 500. */
  debounceMs?: number;
  onChanged?: () => void;
  /** FASE 23.2 — notifica análisis en curso para deshabilitar Validar artículo. */
  onBusyChange?: (busy: boolean) => void;
}

function hasMinimumData(draft: AnalyzerDraft | null): boolean {
  if (!draft) return false;
  const fields = [
    draft.description, draft.partNumber, draft.brandCode, draft.unitCode,
    draft.application, draft.categoryCode, draft.groupCode, draft.subgroupCode,
  ];
  return fields.some((f) => (f ?? '').trim() !== '');
}

/**
 * FASE 23.1 — Analizador dentro de Almacén.
 * Presenta candidatos del backend (DeterministicMatchEngineV1); nunca
 * calcula score/similaridad/ranking en frontend. Auto con debounce 500ms,
 * ejecución manual inmediata, guardia contra respuestas tardías y contra
 * ejecuciones simultáneas.
 */
export const Analizador: React.FC<Props> = ({ requestId, canDecide, draft, manualRun, photoUri, debounceMs = 500, onChanged, onBusyChange }) => {
  const [estado, setEstado] = React.useState<Estado>('idle');
  const [result, setResult] = React.useState<AnalyzerResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<EngineCandidate | null>(null);
  const [confirm, setConfirm] = React.useState<{ candidate: EngineCandidate; decision: 'SAME' | 'DIFFERENT' } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [savedMsg, setSavedMsg] = React.useState<string | null>(null);
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = React.useState(5);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const reqRef = React.useRef(0);
  const runningRef = React.useRef(false);
  const lastManualRun = React.useRef(manualRun);
  const draftKey = JSON.stringify(draft ?? null);

  const ejecutar = React.useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    const n = ++reqRef.current;
    setEstado('loading');
    setError(null);
    setSavedMsg(null);
    onBusyChange?.(true);
    try {
      const r = await apiMatchingService.analizar(requestId, draft ?? {}, { limit: visibleCount });
      if (reqRef.current !== n) return;
      setResult(r);
      if (r.insufficient) {
        setEstado('insufficient');
      } else {
        setEstado(r.candidates.length > 0 ? 'success' : 'empty');
      }
    } catch {
      if (reqRef.current !== n) return;
      setError('No pudimos completar el análisis.');
      setEstado('error');
    } finally {
      runningRef.current = false;
      onBusyChange?.(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, draftKey, visibleCount]);

  React.useEffect(() => {
    setResult(null);
    setDetail(null);
    setConfirm(null);
    setDismissed(new Set());
    setEstado('idle');
    runningRef.current = false;
  }, [requestId]);

  React.useEffect(() => {
    if (manualRun !== lastManualRun.current) {
      lastManualRun.current = manualRun;
      void ejecutar();
      return;
    }
    if (!hasMinimumData(draft)) {
      setResult(null);
      setEstado('insufficient');
      return;
    }
    const t = setTimeout(() => {
      void ejecutar();
    }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ejecutar, manualRun, debounceMs]);

  const guardar = async () => {
    if (!confirm || saving) return;
    const decision = confirm.decision;
    const candidate = confirm.candidate;
    setSaving(true);
    try {
      await apiMatchingService.vincular(requestId, candidate.article, decision);
      setConfirm(null);
      setDetail(null);
      if (decision === 'DIFFERENT') {
        const key = `${candidate.article.companyCode}:${candidate.article.profitArticleCode}`;
        setDismissed((prev) => new Set(prev).add(key));
        setSavedMsg(null);
      } else {
        setSavedMsg(
          `Tu solicitud fue identificada con un artículo que ya existe en Profit. Código: ${candidate.article.profitArticleCode}. No es necesario crear un código nuevo.`,
        );
      }
      onChanged?.();
    } catch {
      setError('No pudimos guardar la decisión.');
    } finally {
      setSaving(false);
    }
  };

  const visible = (result?.candidates ?? []).filter(
    (c) => !dismissed.has(`${c.article.companyCode}:${c.article.profitArticleCode}`),
  );
  const allDismissed = estado === 'success' && visible.length === 0;

  return (
    <SectionCard
      title="Analizador"
      desc="Revisamos si ya existe este artículo antes de crear un código nuevo."
    >
      <div className="toolbar">
        <span className="muted small">Mostrar</span>
        <Select
          value={String(visibleCount)}
          onChange={(e) => setVisibleCount(Number(e.target.value))}
          aria-label="Cantidad de coincidencias a revisar"
        >
          {COUNT_OPTIONS.map((n) => (
            <option key={n} value={n}>{n} coincidencias</option>
          ))}
        </Select>
      </div>

      {estado === 'idle' || estado === 'loading' ? (
        <div className="stack-sm" aria-label="Analizando artículos existentes">
          <p className="muted small" role="status">Analizando artículos existentes...</p>
          <Skeleton height={16} width="40%" /><Skeleton height={60} /><Skeleton height={60} />
        </div>
      ) : estado === 'insufficient' ? (
        <p className="muted small">Completa la información del artículo para analizar coincidencias.</p>
      ) : estado === 'error' ? (
        <div className="stack-sm">
          <Alert tone="danger">No pudimos completar el análisis.</Alert>
          <div>
            <Button variant="secondary" size="sm" onClick={() => void ejecutar()}>Reintentar</Button>
          </div>
          <p className="muted small">Puedes continuar con el proceso normal.</p>
        </div>
      ) : estado === 'empty' ? (
        <div className="stack-sm">
          <p><strong>✓ Validación completada</strong></p>
          <p>No encontramos coincidencias relevantes. Puede continuar con la creación del nuevo artículo.</p>
        </div>
      ) : allDismissed ? (
        <div className="stack-sm">
          <p><strong>No encontramos otra coincidencia relevante.</strong></p>
          <p className="muted small">Puedes continuar con la creación del nuevo artículo.</p>
        </div>
      ) : (
        <div className="stack-sm">
          {savedMsg && <Alert tone="success">{savedMsg}</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}
          <p className="muted small" role="status">
            Encontramos un artículo existente que podría corresponder a tu solicitud.
          </p>
          {visible.map((c) => (
            <CandidateCard
              key={`${c.article.companyCode}:${c.article.profitArticleCode}`}
              candidate={c}
              canDecide={canDecide}
              saving={saving}
              expanded={expanded.has(`${c.article.companyCode}:${c.article.profitArticleCode}`)}
              onToggleEvidence={() => setExpanded((prev) => {
                const next = new Set(prev);
                const key = `${c.article.companyCode}:${c.article.profitArticleCode}`;
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })}
              onDetail={() => setDetail(c)}
              onDecide={(decision) => setConfirm({ candidate: c, decision })}
            />
          ))}
        </div>
      )}

      <Modal open={detail !== null} onClose={() => setDetail(null)} title="Artículo existente">
        {detail && <CandidateDetail candidate={detail} photoUri={photoUri} />}
        <div className="form-actions">
          <Button variant="secondary" onClick={() => setDetail(null)}>Cerrar</Button>
          {canDecide && detail && (
            <>
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => { setDetail(null); setConfirm({ candidate: detail, decision: 'DIFFERENT' }); }}
              >
                No es este
              </Button>
              <Button disabled={saving} onClick={() => { setDetail(null); setConfirm({ candidate: detail, decision: 'SAME' }); }}>
                Es el mismo
              </Button>
            </>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.decision === 'SAME' ? 'Confirmar: es el mismo' : 'Confirmar: no es este'}
        desc={
          confirm?.decision === 'SAME'
            ? `Estás indicando que esta solicitud corresponde al artículo existente ${confirm?.candidate.article.profitArticleCode}. La solicitud no debería generar un nuevo artículo para este caso. ¿Deseas confirmar?`
            : `Indicarás que ${confirm?.candidate.article.profitArticleCode} es diferente del artículo solicitado. La solicitud continuará con el flujo normal.`
        }
        confirmLabel={confirm?.decision === 'SAME' ? 'Confirmar: es el mismo' : 'Confirmar: no es este'}
        busy={saving}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void guardar()}
      >
        {saving && <p className="muted small" role="status">Guardando decisión...</p>}
      </ConfirmDialog>
    </SectionCard>
  );
};

const CandidateCard: React.FC<{
  candidate: EngineCandidate;
  canDecide: boolean;
  saving: boolean;
  expanded: boolean;
  onToggleEvidence: () => void;
  onDetail: () => void;
  onDecide: (d: 'SAME' | 'DIFFERENT') => void;
}> = ({ candidate, canDecide, saving, expanded, onToggleEvidence, onDetail, onDecide }) => {
  const c = candidate;
  return (
    <div className="card p16">
      <p className="muted small">🔎 Posible coincidencia</p>
      <p className="muted small">Código Profit</p>
      <p><strong className="mono">{c.article.profitArticleCode}</strong></p>
      {c.description && <p>{c.description}</p>}
      <p className="muted small">Empresa: {c.article.companyCode}</p>
      <div className="match-photo">
        {c.detail?.photo ? (
          <div>
            <p className="muted small">Foto del artículo existente (referencial)</p>
            <p className="mono small">{c.detail.photo}</p>
          </div>
        ) : (
          <p className="muted small">No existe foto disponible</p>
        )}
      </div>
      <p>
        <span className="muted small">Coincidencia: </span>
        <strong>{typeof c.score === 'number' ? `${c.score}%` : getMatchClassificationLabel(c.classification)}</strong>
      </p>
      <p><Badge tone={c.classification === 'HIGH' ? 'green' : c.classification === 'REVIEW' ? 'yellow' : 'gray'}>
        {getMatchClassificationLabel(c.classification)}
      </Badge></p>
      {c.priorDecision === 'SAME' && (
        <p className="muted small">Marcado previamente como el mismo artículo.</p>
      )}
      {c.priorDecision === 'DIFFERENT' && (
        <p className="muted small">Marcado previamente como diferente.</p>
      )}
      <div>
        <Button variant="ghost" size="sm" onClick={onToggleEvidence} aria-expanded={expanded}>
          {expanded ? '▾ Ocultar por qué aparece' : '▸ ¿Por qué aparece este artículo?'}
        </Button>
        {expanded && (
          <div className="stack-sm">
            {c.evidence.length > 0 && (
              <ul className="match-list" aria-label="Coincidencias">
                {c.evidence.map((e) => (
                  <li key={e}><span aria-hidden="true">✓ </span>{getMatchEvidenceLabel(e)}</li>
                ))}
              </ul>
            )}
            {c.conflicts.length > 0 && (
              <p className="muted small"><span aria-hidden="true">⚠ </span>Hay una diferencia que requiere revisión.</p>
            )}
          </div>
        )}
      </div>
      {c.explanation && <p className="muted small">{c.explanation}</p>}
      <div className="form-actions">
        <Button variant="secondary" size="sm" onClick={onDetail}>Ver detalles</Button>
        {canDecide && (
          <>
            <Button variant="secondary" size="sm" disabled={saving} onClick={() => onDecide('DIFFERENT')}>
              No es este
            </Button>
            <Button size="sm" disabled={saving} onClick={() => onDecide('SAME')}>
              Es el mismo
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

const CandidateDetail: React.FC<{ candidate: EngineCandidate; photoUri?: string | null }> = ({ candidate: c, photoUri }) => {
  const d = c.detail;
  const rows: Array<[string, string | undefined]> = [
    ['Código Profit', c.article.profitArticleCode],
    ['Empresa', c.article.companyCode],
    ['Descripción original', d?.originalDescription || c.description],
    ['Descripción normalizada', d?.normalizedDescription],
    ['Grupo', d?.category],
    ['Subgrupo', d?.subCategory],
    ['Marca', d?.brand],
    ['Unidad', d?.unit],
    ['Part Number', d?.partNumber],
    ['Aplicación', d?.application],
  ];
  return (
    <div className="stack-sm">
      {c.detail?.photo ? (
        <div>
          <p className="muted small">Foto del artículo existente (referencial)</p>
          <p className="mono small">{c.detail.photo}</p>
        </div>
      ) : null}
      {photoUri ? (
        <div>
          <p className="muted small">Foto de referencia (solicitud)</p>
          <img src={`/api/v1/uploads/${photoUri}`} alt="Foto de referencia de la solicitud" style={{ maxWidth: '100%' }} />
        </div>
      ) : (
        <p className="muted small">No existe foto disponible</p>
      )}
      {rows.map(([label, value]) => (
        value ? (
          <div key={label}>
            <p className="muted small">{label}</p>
            <p>{value}</p>
          </div>
        ) : null
      ))}
      <div>
        <p className="muted small">Coincidencia</p>
        <p><Badge tone={c.classification === 'HIGH' ? 'green' : c.classification === 'REVIEW' ? 'yellow' : 'gray'}>
          {getMatchClassificationLabel(c.classification)}
        </Badge></p>
      </div>
      {typeof c.score === 'number' && (
        <p className="muted small">Nivel de coincidencia: {c.score}/100 (referencial, no es una decisión).</p>
      )}
      {c.evidence.length > 0 && (
        <div>
          <p className="muted small">Evidencias</p>
          <ul className="match-list">
            {c.evidence.map((e) => (
              <li key={e}><span aria-hidden="true">✓ </span>{getMatchEvidenceLabel(e)}</li>
            ))}
          </ul>
        </div>
      )}
      {c.conflicts.length > 0 && (
        <div>
          <p className="muted small">Diferencias</p>
          <ul className="match-list">
            {c.conflicts.map((k) => (
              <li key={k}><span aria-hidden="true">⚠ </span>{getMatchConflictLabel(k)}</li>
            ))}
          </ul>
        </div>
      )}
      {c.explanation && (
        <div>
          <p className="muted small">Explicación</p>
          <p>{c.explanation}</p>
        </div>
      )}
      {c.priorDecision && (
        <p className="muted small">
          {c.priorDecision === 'SAME' ? 'Marcado previamente como el mismo artículo.' : 'Marcado previamente como diferente.'}
          {' '}({getMatchDecisionLabel(c.priorDecision)})
        </p>
      )}
    </div>
  );
};
