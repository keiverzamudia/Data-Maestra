import * as React from 'react';
import { apiMatchingService, type AnalyzerDraft, type AnalyzerPhase, type AnalyzerResult, type EngineCandidate, type ProfitSearchHit, type ProfitSearchResult } from '../../servicios/api/api-matching-service';
import {
  getMatchClassificationLabel,
  getMatchDecisionLabel,
  getMatchEvidenceLabel,
  getMatchConflictLabel,
} from '../../utilidades/presentacion';
import { Button, Modal, ConfirmDialog, Alert, Skeleton, SectionCard, Badge, Select, Input } from '../../componentes/ui';

type Estado = 'idle' | 'loading' | 'success' | 'empty' | 'insufficient' | 'error';

/**
 * FASE P5 — resumen liviano que el Analizador publica a su contenedor para
 * la tarjeta de acceso lateral: estado del último análisis y cuánto queda
 * visible por revisar, desglosado por origen (motor vs. agregado a mano).
 */
export type AnalyzerSummary = {
  /** Estado efectivo (con las propuestas manuales ya consideradas). */
  estado: Estado;
  /** Candidatos devueltos por el motor en el último análisis. */
  engineTotal: number;
  /** Candidatos del motor aún visibles (no descartados ni triados). */
  visibleEngine: number;
  /** Propuestas manuales del usuario aún visibles. */
  visibleManual: number;
};

const COUNT_OPTIONS = [3, 5, 10, 20];

/**
 * FASE P1 — umbral mínimo para presentar un artículo como "posible
 * coincidencia". Debe reflejar el umbral LOW del motor v1 (match-engine:
 * ≥65 HIGH, ≥35 MEDIUM, ≥12 LOW). Por debajo, el motor no considera que
 * exista relación demostrable.
 */
const MATCH_MIN_SCORE = 12;

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
  /**
   * FASE P5 — publica un resumen vivo (estado + conteos) para que el
   * contenedor muestre la tarjeta de acceso sin re-ejecutar nada. Opcional:
   * no altera el contrato existente.
   */
  onSummaryChange?: (summary: AnalyzerSummary) => void;
  /**
   * FASE P2 — indica si los select de clasificación (grupo, subgrupo, tipo y
   * unidad) están completos. Solo entonces "Validar artículo" dispara la
   * búsqueda COMPLETA; con clasificación incompleta se explica el motivo.
   * Por defecto true para no romper usos aislados del componente.
   */
  clasificacionCompleta?: boolean;
}

const candidateKey = (c: EngineCandidate): string =>
  `${c.article.companyCode}:${c.article.profitArticleCode}`;

/** Una referencia Profit solo es imagen mostrable si resuelve a URL. */
const isPhotoUrl = (photo?: string | null): photo is string =>
  !!photo && /^(https?:|data:|blob:|\/)/i.test(photo.trim());

/** Descarga sin salir de Data-Maestra (fetch → blob → <a download>). */
const downloadPhoto = async (url: string, filename: string): Promise<void> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const photoFilename = (c: EngineCandidate): string => {
  const ref = c.detail?.photo ?? c.article.profitArticleCode;
  const base = ref.split('/').pop()?.split('?')[0]?.trim() || c.article.profitArticleCode;
  return /\.(jpe?g|png|webp|gif|bmp)$/i.test(base) ? base : `${base}.jpg`;
};
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
export const Analizador: React.FC<Props> = ({ requestId, canDecide, draft, manualRun, photoUri, debounceMs = 500, onChanged, onBusyChange, onSummaryChange, clasificacionCompleta = true }) => {
  const [estado, setEstado] = React.useState<Estado>('idle');
  const [result, setResult] = React.useState<AnalyzerResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<EngineCandidate | null>(null);
  const [confirm, setConfirm] = React.useState<{ candidate: EngineCandidate; decision: 'SAME' | 'DIFFERENT' } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [savedMsg, setSavedMsg] = React.useState<string | null>(null);
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  /**
   * Triage local del carrusel (ACTIVE ↔ DISCARDED): solo filtra la vista,
   * no persiste decisión ni toca SAME/DIFFERENT. Recuperable siempre.
   */
  const [triage, setTriage] = React.useState<Set<string>>(new Set());
  /** Posición del carrusel dentro de la lista activa (orden original). */
  const [index, setIndex] = React.useState(0);
  /** Foto ampliada en visor (galería de URLs resolubles). */
  const [viewer, setViewer] = React.useState<{ list: string[]; i: number } | null>(null);
  /** Candidato descartado abierto desde la bandeja. */
  const [trayOpen, setTrayOpen] = React.useState<EngineCandidate | null>(null);
  /** Bandeja de descartados expandida. */
  const [trayExpanded, setTrayExpanded] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const [visibleCount, setVisibleCount] = React.useState(5);
  // FASE P4 — propuestas manuales del usuario (persistidas en el backend):
  // sobreviven a "Validar artículo" y se recargan al cambiar de solicitud.
  const [manuales, setManuales] = React.useState<EngineCandidate[]>([]);
  /** Clave de la operación de propuesta en curso (un solo vuelo a la vez). */
  const [proponiendo, setProponiendo] = React.useState<string | null>(null);
  const [proponerMsg, setProponerMsg] = React.useState<string | null>(null);
  const [proponerError, setProponerError] = React.useState<string | null>(null);
  /** Invalida respuestas de propuestas de otra solicitud o fase. */
  const propRef = React.useRef(0);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  // FASE P2 — fase de la última búsqueda y aviso cuando no se puede completar.
  const [fase, setFase] = React.useState<AnalyzerPhase>('INICIAL');
  const [avisoFase, setAvisoFase] = React.useState<string | null>(null);
  const reqRef = React.useRef(0);
  const runningRef = React.useRef(false);
  const lastManualRun = React.useRef(manualRun);
  const faseRef = React.useRef<AnalyzerPhase>('INICIAL');
  const clasifRef = React.useRef(clasificacionCompleta);
  clasifRef.current = clasificacionCompleta;
  const draftKey = JSON.stringify(draft ?? null);

  /**
   * FASE P4 — carga (o re-puntúa) las propuestas guardadas de esta solicitud
   * con la fase que el motor acaba de usar: el puntaje de una propuesta se
   * mide con la MISMA regla que el de un candidato del análisis. Nunca tumba
   * el análisis: si falla, simplemente no se muestran propuestas.
   */
  const refrescarPropuestas = async () => {
    const n = ++propRef.current;
    try {
      const r = await apiMatchingService.listarPropuestas(requestId, draft ?? {}, faseRef.current);
      if (propRef.current !== n) return; // respuesta vieja de otra solicitud/fase
      setManuales(r?.candidates ?? []);
    } catch {
      // silencioso: las propuestas son complemento del análisis.
    }
  };

  /**
   * FASE P2 — ejecuta una búsqueda de la fase indicada.
   * INICIAL: solo descripción/propósito (automática, con debounce).
   * COMPLETA: todos los campos (solo a petición del usuario).
   */
  const ejecutar = React.useCallback(async (phase: AnalyzerPhase = 'INICIAL') => {
    if (runningRef.current) return;
    runningRef.current = true;
    const n = ++reqRef.current;
    setEstado('loading');
    setError(null);
    setSavedMsg(null);
    faseRef.current = phase;
    setFase(phase);
    onBusyChange?.(true);
    try {
      const r = await apiMatchingService.analizar(requestId, draft ?? {}, { limit: visibleCount, phase });
      if (reqRef.current !== n) return;
      setResult(r);
      // Nuevo análisis = nuevo conjunto navegable (conserva orden del motor).
      setTriage(new Set());
      setIndex(0);
      setTrayOpen(null);
      if (r.insufficient) {
        setEstado('insufficient');
      } else {
        setEstado(r.candidates.length > 0 ? 'success' : 'empty');
      }
      // FASE P4 — re-puntúa las propuestas con la fase recién ejecutada.
      void refrescarPropuestas();
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

  // FASE P3 — búsqueda manual en Profit (escape hatch del usuario).
  const [buscaTexto, setBuscaTexto] = React.useState('');
  const [buscaCargando, setBuscaCargando] = React.useState(false);
  const [buscaRes, setBuscaRes] = React.useState<ProfitSearchResult | null>(null);
  const [buscaError, setBuscaError] = React.useState<string | null>(null);

  /**
   * FASE P3 — consulta dirigida: primero universo local, luego Profit en vivo.
   * Solo informa si el artículo existe o no; no toca el análisis ni decide.
   */
  const buscarManual = async () => {
    const term = buscaTexto.trim();
    if (term.length < 2) {
      setBuscaError('Escribe al menos 2 caracteres para buscar el artículo.');
      setBuscaRes(null);
      return;
    }
    setBuscaCargando(true);
    setBuscaError(null);
    setBuscaRes(null);
    setProponerMsg(null);
    setProponerError(null);
    try {
      setBuscaRes(await apiMatchingService.buscarArticulo(requestId, term));
    } catch {
      setBuscaError('No pudimos consultar Profit con ese texto. Inténtalo de nuevo.');
    } finally {
      setBuscaCargando(false);
    }
  };

  /**
   * FASE P4 — "Agregar a coincidencias": el backend puntúa el hallazgo con
   * el mismo motor y lo guarda como propuesta persistida (no es SAME ni
   * mueve el workflow). El carrusel la muestra con su insignia manual.
   */
  const proponer = async (hit: ProfitSearchHit) => {
    if (proponiendo) return;
    const key = `${hit.companyCode}:${hit.profitArticleCode}`;
    setProponiendo(key);
    setProponerError(null);
    setProponerMsg(null);
    try {
      const c = await apiMatchingService.proponer(
        requestId,
        { companyCode: hit.companyCode, profitArticleCode: hit.profitArticleCode },
        draft ?? {},
        faseRef.current,
      );
      setManuales((prev) => (prev.some((x) => candidateKey(x) === key) ? prev : [...prev, c]));
      setProponerMsg(
        `${hit.profitArticleCode} se agregó a tus coincidencias. Revísalo en el carrusel y decide si es este.`,
      );
    } catch {
      setProponerError(
        `No pudimos agregar ${hit.profitArticleCode}. Puede que ya tenga una decisión registrada en esta solicitud.`,
      );
    } finally {
      setProponiendo(null);
    }
  };

  /**
   * FASE P4 — quita una propuesta guardada: el backend borra SOLO la fila
   * PROPUESTA (las decisiones SAME/DIFFERENT no se tocan en ningún caso).
   */
  const retirarPropuesta = async (c: EngineCandidate) => {
    if (proponiendo) return;
    const key = candidateKey(c);
    setProponiendo(key);
    setError(null);
    setProponerError(null);
    try {
      await apiMatchingService.retirarPropuesta(requestId, c.article);
      setManuales((prev) => prev.filter((x) => candidateKey(x) !== key));
      setSavedMsg(`${c.article.profitArticleCode} se quitó de tus coincidencias agregadas.`);
    } catch {
      setSavedMsg(null);
      setError(`No pudimos quitar ${c.article.profitArticleCode} de las coincidencias.`);
    } finally {
      setProponiendo(null);
    }
  };

  React.useEffect(() => {
    setResult(null);
    setDetail(null);
    setConfirm(null);
    setDismissed(new Set());
    setTriage(new Set());
    setIndex(0);
    setTrayOpen(null);
    setViewer(null);
    setManuales([]);
    setProponiendo(null);
    setProponerMsg(null);
    setProponerError(null);
    setEstado('idle');
    runningRef.current = false;
    // FASE P4 — carga las propuestas persistidas de ESTA solicitud.
    void refrescarPropuestas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  React.useEffect(() => {
    if (manualRun !== lastManualRun.current) {
      lastManualRun.current = manualRun;
      // FASE P2 — "Validar artículo" solo dispara la búsqueda COMPLETA cuando
      // los select de clasificación están completos; si no, se explica por qué
      // en lugar de lanzar una comparación a medio llenar.
      if (clasifRef.current) {
        setAvisoFase(null);
        void ejecutar('COMPLETA');
      } else {
        setAvisoFase(
          'Completa grupo, subgrupo, tipo de artículo y unidad Profit para comparar todos los campos. '
          + 'Por ahora solo comparamos la descripción.',
        );
      }
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
        setDismissed((prev) => new Set(prev).add(candidateKey(candidate)));
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

  /**
   * FASE P4 — el carrusel presenta el análisis del motor Y las propuestas
   * manuales del usuario, sin duplicados: si el motor también encontró un
   * artículo propuesto, manda la versión del motor (trae toda la evidencia
   * del recall). Las propuestas restantes entran con su insignia manual.
   */
  const engineCandidates = result?.candidates ?? [];
  const propuestas = manuales.filter(
    (c) => !engineCandidates.some((e) => candidateKey(e) === candidateKey(c)),
  );
  const todos = [...engineCandidates, ...propuestas];
  const visible = todos.filter(
    (c) => !dismissed.has(candidateKey(c)) && !triage.has(candidateKey(c)),
  );
  /** Descartados locales (triage) en orden original, recuperables. */
  const discarded = todos.filter(
    (c) => triage.has(candidateKey(c)) && !dismissed.has(candidateKey(c)),
  );
  /** Desglose honesto del contador: motor vs. agregadas por el usuario. */
  const visMotor = visible.filter((c) => !c.manual).length;
  const visManuales = visible.length - visMotor;
  /**
   * "empty" describe al MOTOR: si el usuario ya agregó propuestas hay algo
   * que revisar, así que se muestra el carrusel en vez del estado vacío.
   */
  const efectivo: Estado = estado === 'empty' && todos.length > 0 ? 'success' : estado;
  const allDismissed = efectivo === 'success' && visible.length === 0;
  /** Todo lo visible fue triage-descartado (nada persistido): recuperable. */
  const allTriaged = allDismissed && discarded.length > 0;
  const current = visible.length > 0 ? visible[Math.min(index, visible.length - 1)]! : null;

  /**
   * FASE P5 — informa a la tarjeta de acceso lateral el estado del análisis
   * y lo que queda visible. Depende de valores (no de identidades), así que
   * solo se emite cuando algo cambia de verdad: el contenedor puede guardar
   * el resumen con setState sin entrar en bucles de render.
   */
  React.useEffect(() => {
    onSummaryChange?.({
      estado: efectivo,
      engineTotal: engineCandidates.length,
      visibleEngine: visMotor,
      visibleManual: visManuales,
    });
  }, [onSummaryChange, efectivo, engineCandidates.length, visMotor, visManuales]);

  // La posición nunca sale del rango cuando la lista activa cambia.
  React.useEffect(() => {
    setIndex((i) => (visible.length === 0 ? 0 : Math.min(i, visible.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length]);

  /** Descarga de foto del candidato sin salir de Data-Maestra. */
  const handleDownload = async (c: EngineCandidate) => {
    const url = c.detail?.photo;
    if (!url || !isPhotoUrl(url) || downloading || saving) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadPhoto(url, photoFilename(c));
    } catch {
      setDownloadError('No pudimos descargar la foto. Puedes verla ampliada.');
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadUrl = async (url: string) => {
    if (!isPhotoUrl(url) || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadPhoto(url, url.split('/').pop()?.split('?')[0] || 'foto-articulo.jpg');
    } catch {
      setDownloadError('No pudimos descargar la foto.');
    } finally {
      setDownloading(false);
    }
  };

  /** Posición del comparador dentro de la lista activa (1-based). */
  const comparePosition = (c: EngineCandidate): number => {
    const i = visible.findIndex((x) => candidateKey(x) === candidateKey(c));
    return i < 0 ? 0 : i + 1;
  };

  const comparePrev = () => {
    setDetail((d) => {
      if (!d || visible.length === 0) return d;
      const i = visible.findIndex((x) => candidateKey(x) === candidateKey(d));
      const prev = i <= 0 ? visible[visible.length - 1]! : visible[i - 1]!;
      return prev;
    });
  };

  const compareNext = () => {
    setDetail((d) => {
      if (!d || visible.length === 0) return d;
      const i = visible.findIndex((x) => candidateKey(x) === candidateKey(d));
      const next = i < 0 || i >= visible.length - 1 ? visible[0]! : visible[i + 1]!;
      return next;
    });
  };

  /** Descartar desde el comparador: a bandeja y avanza sin cerrar. */
  const discardFromModal = () => {
    if (saving) return;
    setDetail((d) => {
      if (!d) return d;
      const key = candidateKey(d);
      setTriage((prev) => new Set(prev).add(key));
      const idx = visible.findIndex((x) => candidateKey(x) === key);
      const rest = visible.filter((x) => candidateKey(x) !== key);
      if (rest.length === 0) return null;
      return rest[Math.min(Math.max(idx, 0), rest.length - 1)]!;
    });
  };

  /** Descarte local: sale del carrusel, queda en bandeja, sin backend. */
  const discardLocal = (c: EngineCandidate) => {
    if (saving) return;
    setTriage((prev) => new Set(prev).add(candidateKey(c)));
  };

  /** Recuperar: vuelve al conjunto activo conservando orden/score. */
  const recover = (c: EngineCandidate) => {
    setTriage((prev) => {
      const next = new Set(prev);
      next.delete(candidateKey(c));
      return next;
    });
    if (trayOpen && candidateKey(trayOpen) === candidateKey(c)) setTrayOpen(null);
  };

  return (
    <SectionCard
      title="Analizador"
      desc="Compara el artículo con los existentes antes de crear uno nuevo."
      actions={
        <div className="analyzer-tools">
          {result && efectivo === 'success' && (
            <>
              {engineCandidates.length > 0 && (
                <span className="analyzer-count">
                  <b>{visMotor}</b> de <b>{engineCandidates.length}</b> del motor
                </span>
              )}
              {visManuales > 0 && (
                <span className="analyzer-count-manual">
                  + <b>{visManuales}</b> agregada{visManuales === 1 ? '' : 's'}
                </span>
              )}
            </>
          )}
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
      }
    >
      {/* Una sola línea de estado: fase, aviso de clasificación y tope de universo. */}
      <div className="status-line" role="status">
        {avisoFase && <p className="status-line-warn">{avisoFase}</p>}
        <p>
          {fase === 'COMPLETA'
            ? 'Búsqueda completa: comparamos descripción, clasificación y demás campos del artículo.'
            : 'Búsqueda inicial por descripción. Pulsa "Validar artículo" con la clasificación completa para comparar todos los campos.'}
        </p>
        {typeof result?.poolScanned === 'number' && (
          <p>
            {typeof result?.poolTotal === 'number'
              ? `Revisados ${result.poolScanned} de ${result.poolTotal} artículos del universo.`
              : `Revisados ${result.poolScanned} artículos del universo.`}
          </p>
        )}
        {result?.poolTruncated && (
          <details className="status-detail">
            <summary>No se pudo revisar el universo completo</summary>
            <p>
              Por seguridad solo se evaluó una parte
              {typeof result.poolTotal === 'number' ? ` (hay ${result.poolTotal} en total)` : ''}. Si no ves el
              artículo que buscas, pulsa "Validar artículo" con más datos del formulario.
            </p>
          </details>
        )}
      </div>

      {efectivo === 'idle' || efectivo === 'loading' ? (
        <div className="stack-sm" aria-label="Analizando artículos existentes">
          <p className="muted small" role="status">Analizando artículos existentes...</p>
          <Skeleton height={16} width="40%" /><Skeleton height={60} /><Skeleton height={60} />
        </div>
      ) : efectivo === 'insufficient' ? (
        <div className="analyzer-state">
          <p>Completa la información del artículo para analizar coincidencias.</p>
        </div>
      ) : efectivo === 'error' ? (
        <div className="stack-sm">
          <Alert tone="danger">No pudimos completar el análisis.</Alert>
          <div>
            <Button variant="secondary" size="sm" onClick={() => void ejecutar(faseRef.current)}>Reintentar</Button>
          </div>
          <p className="muted small">Puedes continuar con el proceso normal.</p>
        </div>
      ) : efectivo === 'empty' ? (
        <div className="analyzer-state analyzer-state-ok">
          <p><strong>✓ Validación completada</strong></p>
          <p>No encontramos coincidencias relevantes. Puede continuar con la creación del nuevo artículo.</p>
        </div>
      ) : allDismissed ? (
        allTriaged ? (
          <div className="analyzer-state">
            <p><strong>No quedan coincidencias activas.</strong></p>
            <p className="muted small">Puedes revisar los descartados antes de continuar.</p>
            <div>
              <Button variant="secondary" size="sm" onClick={() => setTrayExpanded(true)}>Revisar descartados</Button>
            </div>
            <DiscardTray
              discarded={discarded}
              expanded={trayExpanded}
              onToggle={() => setTrayExpanded((v) => !v)}
              onOpen={setTrayOpen}
            />
          </div>
        ) : (
          <div className="analyzer-state">
            <p><strong>No encontramos otra coincidencia relevante.</strong></p>
            <p className="muted small">Puedes continuar con la creación del nuevo artículo.</p>
          </div>
        )
      ) : (
        <div className="stack-sm">
          {savedMsg && <Alert tone="success">{savedMsg}</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}
          <p className="muted small" role="status">
            {visible.length === 1
              ? '1 coincidencia posible con lo que solicitaste.'
              : `${visible.length} coincidencias posibles con lo que solicitaste.`}
          </p>
          {current && (
            <CarouselCard
              key={candidateKey(current)}
              candidate={current}
              canDecide={canDecide}
              saving={saving || proponiendo !== null}
              expanded={expanded.has(candidateKey(current))}
              downloading={downloading}
              downloadError={downloadError}
              onToggleEvidence={() => setExpanded((prev) => {
                const next = new Set(prev);
                const key = candidateKey(current);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })}
              onDetail={() => setDetail(current)}
              onDiscard={() => discardLocal(current)}
              onDecide={(decision) => setConfirm({ candidate: current, decision })}
              onViewPhoto={(urls, i) => { setDownloadError(null); setViewer({ list: urls, i }); }}
              onDownloadPhoto={() => void handleDownload(current)}
              onRemoveProposal={() => void retirarPropuesta(current)}
            />
          )}
          <CarouselNav
            index={visible.length === 0 ? 0 : Math.min(index, visible.length - 1)}
            total={visible.length}
            onPrev={() => setIndex((i) => Math.max(0, i - 1))}
            onNext={() => setIndex((i) => Math.min(visible.length - 1, i + 1))}
            onGo={(i) => setIndex(i)}
          />
          <DiscardTray
            discarded={discarded}
            expanded={trayExpanded}
            onToggle={() => setTrayExpanded((v) => !v)}
            onOpen={setTrayOpen}
          />
        </div>
      )}

      {/* FASE P3 — búsqueda manual en Profit: escape hatch, solo informativa. */}
      <div className="search-block" aria-label="Búsqueda manual en Profit">
        <form
          className="search-form"
          onSubmit={(e) => { e.preventDefault(); void buscarManual(); }}
        >
          <label className="search-label" htmlFor="busqueda-profit">
            Buscar si ya existe en Profit
          </label>
          <div className="search-row">
            <Input
              id="busqueda-profit"
              value={buscaTexto}
              onChange={(e) => setBuscaTexto(e.target.value)}
              placeholder="Código o palabras clave (mínimo 2 caracteres)"
              maxLength={60}
              disabled={buscaCargando}
            />
            <Button type="submit" variant="secondary" size="sm" disabled={buscaCargando}>
              {buscaCargando ? 'Buscando...' : 'Buscar en Profit'}
            </Button>
          </div>
        </form>

        {buscaError && <Alert tone="danger">{buscaError}</Alert>}

        {buscaRes && buscaRes.results.length === 0 && (
          <Alert tone="warning">
            {buscaRes.source === 'PROFIT'
              ? <>No existe "{buscaRes.term}" en {buscaRes.companyCode}: la consulta directa a Profit no devolvió artículos que contengan todas esas palabras.</>
              : <>"{buscaRes.term}" no está en el universo local de {buscaRes.companyCode} (ningún artículo con todas esas palabras) y no se pudo consultar Profit directamente.</>}
          </Alert>
        )}

        {buscaRes && buscaRes.results.length > 0 && (
          <>
            <Alert tone="success">
              Sí existe: {buscaRes.results.length} resultado{buscaRes.results.length === 1 ? '' : 's'} en{' '}
              {buscaRes.companyCode}
              {buscaRes.source === 'LOCAL' ? ' (universo local)' : ' (consulta directa a Profit)'}.
            </Alert>
            {proponerMsg && <Alert tone="success">{proponerMsg}</Alert>}
            {proponerError && <Alert tone="danger">{proponerError}</Alert>}
            <ul className="manual-list">
              {buscaRes.results.map((r) => {
                const key = `${r.companyCode}:${r.profitArticleCode}`;
                const enFlujo = todos.some((c) => candidateKey(c) === key);
                return (
                  <li key={key} className="manual-row">
                    <div className="manual-row-info">
                      <span className="manual-row-code">{r.profitArticleCode}</span>
                      <span className="manual-row-desc">{r.description}</span>
                      {(r.brand || r.model) ? (
                        <span className="manual-row-meta muted small">
                          {[r.brand, r.model].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </div>
                    <div className="manual-row-action">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={proponiendo !== null || enFlujo}
                        onClick={() => void proponer(r)}
                      >
                        {proponiendo === key ? 'Agregando…' : enFlujo ? '✓ En coincidencias' : 'Agregar'}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <p className="search-note">
          Coinciden todas las palabras, en cualquier orden. Al agregar, el artículo se puntúa con el mismo
          motor y queda guardado como tu propuesta para esta solicitud (no decide nada por sí solo).
        </p>
      </div>

      <Modal open={detail !== null} onClose={() => setDetail(null)} title="Comparar coincidencia" wide>
        {detail && (
          <Comparador
            candidate={detail}
            draft={draft ?? {}}
            solicitudPhotos={photoUri ? [`/api/v1/uploads/${photoUri}`] : []}
            position={comparePosition(detail)}
            total={visible.length}
            canDecide={canDecide}
            saving={saving}
            downloading={downloading}
            onPrev={comparePrev}
            onNext={compareNext}
            onDiscard={discardFromModal}
            onSame={() => { setDetail(null); setConfirm({ candidate: detail, decision: 'SAME' }); }}
            onDifferent={() => { setDetail(null); setConfirm({ candidate: detail, decision: 'DIFFERENT' }); }}
            onViewPhoto={(urls, i) => { setDownloadError(null); setViewer({ list: urls, i }); }}
            onDownloadPhoto={(url) => void handleDownloadUrl(url)}
          />
        )}
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

      <Modal
        open={trayOpen !== null}
        onClose={() => setTrayOpen(null)}
        title={trayOpen ? `Descartado: ${trayOpen.article.profitArticleCode}` : 'Descartado'}
      >
        {trayOpen && (
          <div className="stack-sm">
            <p className="muted small">Este candidato fue descartado en la revisión, pero sigue disponible.</p>
            {trayOpen.description && <p>{trayOpen.description}</p>}
            {typeof trayOpen.score === 'number' && (
              <p><span className="muted small">Puntaje: </span><strong>{trayOpen.score}/100</strong></p>
            )}
          </div>
        )}
        <div className="form-actions">
          <Button variant="secondary" onClick={() => setTrayOpen(null)}>Cerrar</Button>
          {trayOpen && (
            <>
              <Button variant="secondary" disabled={saving} onClick={() => { recover(trayOpen); }}>
                ↩ Recuperar
              </Button>
              <Button
                variant="secondary"
                onClick={() => { const c = trayOpen; setTrayOpen(null); setDetail(c); }}
              >
                Ver detalle
              </Button>
              {canDecide && (
                <Button
                  variant="accent"
                  disabled={saving}
                  onClick={() => { const c = trayOpen; setTrayOpen(null); setConfirm({ candidate: c, decision: 'SAME' }); }}
                >
                  Es este
                </Button>
              )}
            </>
          )}
        </div>
      </Modal>

      <Modal open={viewer !== null} onClose={() => setViewer(null)} title="Foto del artículo">
        {viewer && viewer.list.length > 0 && (
          <div className="stack-sm">
            <img
              src={viewer.list[Math.min(viewer.i, viewer.list.length - 1)]}
              alt={`Foto ampliada del artículo existente (${viewer.i + 1} de ${viewer.list.length})`}
              className="carousel-viewer-img"
            />
            {viewer.list.length > 1 && (
              <div className="carousel-nav">
                <Button
                  variant="secondary" size="sm"
                  disabled={viewer.i <= 0}
                  onClick={() => setViewer((v) => (v ? { ...v, i: v.i - 1 } : v))}
                  aria-label="Foto anterior"
                >
                  ‹ Anterior
                </Button>
                <p className="muted small" role="status">{viewer.i + 1} / {viewer.list.length}</p>
                <Button
                  variant="secondary" size="sm"
                  disabled={viewer.i >= viewer.list.length - 1}
                  onClick={() => setViewer((v) => (v ? { ...v, i: v.i + 1 } : v))}
                  aria-label="Foto siguiente"
                >
                  Siguiente ›
                </Button>
              </div>
            )}
            <div className="form-actions">
              <Button
                variant="secondary"
                size="sm"
                disabled={downloading}
                onClick={() => {
                  const url = viewer.list[Math.min(viewer.i, viewer.list.length - 1)]!;
                  void downloadPhoto(url, url.split('/').pop()?.split('?')[0] || 'foto-articulo.jpg')
                    .catch(() => setDownloadError('No pudimos descargar la foto.'));
                }}
              >
                {downloading ? 'Descargando…' : 'Descargar foto'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setViewer(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </SectionCard>
  );
};

const CarouselCard: React.FC<{
  candidate: EngineCandidate;
  canDecide: boolean;
  saving: boolean;
  expanded: boolean;
  downloading: boolean;
  downloadError: string | null;
  onToggleEvidence: () => void;
  onDetail: () => void;
  onDiscard: () => void;
  onDecide: (d: 'SAME' | 'DIFFERENT') => void;
  onViewPhoto: (urls: string[], i: number) => void;
  onDownloadPhoto: () => void;
  /** FASE P4 — retira una propuesta manual guardada (si la hay). */
  onRemoveProposal?: () => void;
}> = ({ candidate, canDecide, saving, expanded, downloading, downloadError, onToggleEvidence, onDetail, onDiscard, onDecide, onViewPhoto, onDownloadPhoto, onRemoveProposal }) => {
  const c = candidate;
  const photoUrl = isPhotoUrl(c.detail?.photo) ? c.detail.photo : null;
  const touchX = React.useRef<number | null>(null);
  return (
    <div
      className="card p16 carousel-card"
      role="group"
      aria-roledescription="carrusel"
      aria-label={`Coincidencia: ${c.article.profitArticleCode}`}
      tabIndex={0}
      onKeyDown={(e) => {
        // La navegación por teclado vive en CarouselNav; aquí solo gestos táctiles.
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.currentTarget.parentElement?.querySelector<HTMLElement>(
          e.key === 'ArrowLeft' ? '[data-carousel="prev"]' : '[data-carousel="next"]',
        )?.click();
      }}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) < 40) return;
        e.currentTarget.parentElement?.querySelector<HTMLElement>(
          dx > 0 ? '[data-carousel="prev"]' : '[data-carousel="next"]',
        )?.click();
      }}
    >
      {/*
        FASE P1 — etiqueta honesta: antes decía "🔎 Posible coincidencia"
        incluso con puntaje 0. El umbral 12 es el del motor v1 (≥12 = LOW);
        por debajo el artículo sigue visible (para que el humano pueda
        descartarlo) pero sin presentarse como coincidencia.
      */}
      <div className="cand-head">
        <div className="cand-id">
          <p className={`cand-kicker${typeof c.score === 'number' && c.score >= MATCH_MIN_SCORE ? '' : ' cand-kicker-muted'}`}>
            {typeof c.score === 'number' && c.score >= MATCH_MIN_SCORE
              ? '🔎 Posible coincidencia'
              : 'Sin coincidencia demostrada (solo se lista para descartar)'}
          </p>
          <p className="muted small cand-code-label">Código Profit</p>
          <p className="cand-code">{c.article.profitArticleCode}</p>
        </div>
        <div className="cand-score">
          <p className="cand-score-line">
            <span className="muted small">Puntaje: </span>
            <strong>{typeof c.score === 'number' ? `${c.score}/100` : getMatchClassificationLabel(c.classification)}</strong>
          </p>
          <p className="cand-badges">
            <Badge tone={c.classification === 'HIGH' ? 'green' : c.classification === 'REVIEW' ? 'yellow' : 'gray'}>
              {getMatchClassificationLabel(c.classification)}
            </Badge>
            {c.manual && <Badge tone="gray">Agregada por ti</Badge>}
          </p>
        </div>
      </div>

      <div className="cand-grid">
        <div className="cand-photo">
          {photoUrl ? (
            <div className="stack-sm">
              <button
                type="button"
                className="carousel-photo-btn"
                onClick={() => onViewPhoto([photoUrl], 0)}
                aria-label={`Ampliar foto de ${c.article.profitArticleCode}`}
              >
                <img src={photoUrl} alt={`Foto del artículo ${c.article.profitArticleCode}`} loading="lazy" />
              </button>
              <div className="form-actions carousel-photo-actions">
                <Button variant="ghost" size="sm" onClick={() => onViewPhoto([photoUrl], 0)}>Ampliar</Button>
                <Button variant="ghost" size="sm" disabled={downloading || saving} onClick={onDownloadPhoto}>
                  {downloading ? 'Descargando…' : 'Descargar foto'}
                </Button>
              </div>
              {downloadError && <p className="muted small" role="alert">{downloadError}</p>}
            </div>
          ) : c.detail?.photo ? (
            <div className="cand-photo-empty">
              <span className="muted small">Foto del artículo existente (referencial)</span>
              <span className="mono small">{c.detail.photo}</span>
            </div>
          ) : (
            <p className="cand-photo-empty">No existe foto disponible</p>
          )}
        </div>

        <div className="cand-body">
          {c.description && <p className="cand-desc">{c.description}</p>}
          <p className="muted small">Empresa: {c.article.companyCode}</p>
          {c.priorDecision === 'SAME' && (
            <p className="muted small">Marcado previamente como el mismo artículo.</p>
          )}
          {c.priorDecision === 'DIFFERENT' && (
            <p className="muted small">Marcado previamente como diferente.</p>
          )}
          {c.explanation && <p className="muted small">{c.explanation}</p>}
          <div className="cand-evidence">
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
        </div>
      </div>

      <div className="cand-actions">
        <Button variant="ghost" size="sm" disabled={saving} onClick={onDiscard}>Descartar</Button>
        <Button variant="secondary" size="sm" onClick={onDetail}>Ver detalles</Button>
        {c.manual && onRemoveProposal && (
          <Button variant="ghost" size="sm" disabled={saving} onClick={onRemoveProposal}>
            Quitar
          </Button>
        )}
        {canDecide && (
          <Button variant="accent" size="sm" disabled={saving} onClick={() => onDecide('SAME')}>
            Es este
          </Button>
        )}
      </div>
    </div>
  );
};

const CarouselNav: React.FC<{
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onGo: (i: number) => void;
}> = ({ index, total, onPrev, onNext, onGo }) => {
  if (total === 0) return null;
  return (
    <div className="carousel-nav">
      <Button variant="secondary" size="sm" data-carousel="prev" disabled={index <= 0} onClick={onPrev} aria-label="Coincidencia anterior">
        ‹ Anterior
      </Button>
      <div className="carousel-dots" role="tablist" aria-label="Posición en coincidencias">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Ir a coincidencia ${i + 1} de ${total}`}
            className={`carousel-dot${i === index ? ' carousel-dot-active' : ''}`}
            onClick={() => onGo(i)}
          />
        ))}
      </div>
      <p className="muted small" role="status" aria-live="polite">Coincidencia {index + 1} de {total}</p>
      <Button variant="secondary" size="sm" data-carousel="next" disabled={index >= total - 1} onClick={onNext} aria-label="Coincidencia siguiente">
        Siguiente ›
      </Button>
    </div>
  );
};

const DiscardTray: React.FC<{
  discarded: EngineCandidate[];
  expanded: boolean;
  onToggle: () => void;
  onOpen: (c: EngineCandidate) => void;
}> = ({ discarded, expanded, onToggle, onOpen }) => (
  <div className="discard-tray">
    <div className="flex-between">
      <p className="muted small">
        <strong>Descartados ({discarded.length})</strong>
      </p>
      {discarded.length > 0 && (
        <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={expanded}>
          {expanded ? 'Ocultar descartados ▴' : 'Ver descartados ▾'}
        </Button>
      )}
    </div>
    {expanded && discarded.length > 0 && (
      <div className="discard-chips">
        {discarded.map((c) => (
          <button
            key={candidateKey(c)}
            type="button"
            className="discard-chip"
            onClick={() => onOpen(c)}
            aria-label={`Revisar descartado ${c.article.profitArticleCode}`}
            title="Abrir para recuperar, ver detalle o confirmar"
          >
            {c.article.profitArticleCode}
          </button>
        ))}
      </div>
    )}
  </div>
);

interface CompareField {
  key: string;
  label: string;
  sol?: string;
  pro?: string;
  evKind?: string;
  confKind?: string;
}

/**
 * Comparador de coincidencia: Mi solicitud vs Artículo en Profit +
 * ¿Por qué coinciden? (evidencias del motor, sin recalcular).
 * Referencia (art.ref) no se compara: en Data-Maestra "Referencia" y
 * "Part Number" son campos distintos del formulario (limitación
 * documentada, sin inventar equivalencias).
 */
const Comparador: React.FC<{
  candidate: EngineCandidate;
  draft: AnalyzerDraft;
  solicitudPhotos: string[];
  position: number;
  total: number;
  canDecide: boolean;
  saving: boolean;
  downloading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onDiscard: () => void;
  onSame: () => void;
  onDifferent: () => void;
  onViewPhoto: (urls: string[], i: number) => void;
  onDownloadPhoto: (url: string) => void;
}> = ({ candidate: c, draft, solicitudPhotos, position, total, canDecide, saving, downloading, onPrev, onNext, onDiscard, onSame, onDifferent, onViewPhoto, onDownloadPhoto }) => {
  const [showMore, setShowMore] = React.useState(false);
  const d = c.detail;
  const trim = (v?: string | null): string | undefined => {
    const t = (v ?? '').trim();
    return t ? t : undefined;
  };
  const fields: CompareField[] = [
    { key: 'descripcion', label: 'Descripción', sol: trim(draft.description), pro: trim(d?.originalDescription) ?? trim(c.description), evKind: 'DESCRIPTION_SIMILARITY' },
    { key: 'partNumber', label: 'Part Number', sol: trim(draft.partNumber), pro: trim(d?.partNumber), evKind: 'PART_NUMBER_MATCH', confKind: 'PART_NUMBER_CONFLICT' },
    // FASE P1 — el lado "Mi solicitud" ahora trae el Modelo del borrador
    // (viaja al motor desde la FASE P1); antes mostraba "—" fijo.
    { key: 'modelo', label: 'Modelo', sol: trim(draft.model), pro: trim(d?.model), evKind: 'MODEL_MATCH', confKind: 'MODEL_CONFLICT' },
    { key: 'marca', label: 'Marca', sol: trim(draft.brandCode), pro: trim(d?.brand), evKind: 'BRAND_MATCH', confKind: 'BRAND_CONFLICT' },
    { key: 'aplicacion', label: 'Aplicación', sol: trim(draft.application), pro: trim(d?.application), evKind: 'APPLICATION_MATCH', confKind: 'APPLICATION_CONFLICT' },
    { key: 'grupo', label: 'Grupo', sol: trim(draft.groupCode), pro: trim(d?.category), evKind: 'CATEGORY_MATCH', confKind: 'CATEGORY_CONFLICT' },
    { key: 'subgrupo', label: 'Subgrupo', sol: trim(draft.subgroupCode), pro: trim(d?.subCategory), evKind: 'SUBCATEGORY_MATCH', confKind: 'SUBCATEGORY_CONFLICT' },
    { key: 'unidad', label: 'Unidad', sol: trim(draft.unitCode), pro: trim(d?.unit), evKind: 'UNIT_MATCH', confKind: 'UNIT_CONFLICT' },
  ];
  const shown = fields.filter((f) => f.sol || f.pro);
  const markOf = (f: CompareField): 'ok' | 'diff' | null => {
    if (f.evKind && c.evidence.includes(f.evKind)) return 'ok';
    if (f.confKind && c.conflicts.includes(f.confKind)) return 'diff';
    return null;
  };
  const proPhotoUrl = isPhotoUrl(d?.photo) ? d.photo : null;
  const why = fields.filter((f) => f.evKind && c.evidence.includes(f.evKind) && (f.sol || f.pro));
  const extraEvidence = c.evidence.filter((e) => !fields.some((f) => f.evKind === e));

  return (
    <div>
      <div className="compare-head">
        <p className="muted small">
          Coincidencia {total > 0 ? position : 0} de {total}
        </p>
        {typeof c.score === 'number' && (
          <p><span className="compare-score">{c.score}/100</span> <span className="muted small">puntaje del motor (referencial, no es una decisión).</span></p>
        )}
        <p>
          <Badge tone={c.classification === 'HIGH' ? 'green' : c.classification === 'REVIEW' ? 'yellow' : 'gray'}>
            {getMatchClassificationLabel(c.classification)}
          </Badge>
        </p>
      </div>

      <div className="compare-grid">
        <section className="compare-panel" aria-label="Mi solicitud">
          <h4>Mi solicitud</h4>
          <p className="muted small">Datos proporcionados para crear el artículo</p>
          <div className="compare-photo">
            {solicitudPhotos.length > 0 ? (
              <img
                src={solicitudPhotos[0]}
                alt="Foto de referencia de la solicitud"
                onClick={() => onViewPhoto(solicitudPhotos, 0)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onViewPhoto(solicitudPhotos, 0); }}
                aria-label="Ampliar foto de la solicitud"
              />
            ) : (
              <span className="compare-photo-empty">No existe foto disponible</span>
            )}
          </div>
          {solicitudPhotos.length > 0 && (
            <div className="form-actions carousel-photo-actions">
              <Button variant="ghost" size="sm" onClick={() => onViewPhoto(solicitudPhotos, 0)}>Ampliar</Button>
              <Button variant="ghost" size="sm" disabled={downloading} onClick={() => onDownloadPhoto(solicitudPhotos[0]!)}>Descargar</Button>
            </div>
          )}
          {fields.slice(0, 5).map((f) => (
            (f.sol || (showMore && f.pro)) ? (
              <div className="compare-row" key={f.key}>
                <p className="compare-row-label">{f.label}</p>
                <p>{f.sol ?? '—'}</p>
              </div>
            ) : null
          ))}
        </section>

        <section className="compare-panel" aria-label="Artículo existente en Profit">
          <h4>Artículo existente en Profit</h4>
          <p className="muted small">Artículo encontrado en {c.article.companyCode}</p>
          <div className="compare-photo" aria-label="Foto del artículo existente">
            {proPhotoUrl ? (
              <img
                src={proPhotoUrl}
                alt={`Foto del artículo ${c.article.profitArticleCode}`}
                onClick={() => onViewPhoto([proPhotoUrl], 0)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onViewPhoto([proPhotoUrl], 0); }}
                aria-label="Ampliar foto del artículo existente"
              />
            ) : (
              <span className="compare-photo-empty">No existe foto disponible</span>
            )}
          </div>
          {proPhotoUrl && (
            <div className="form-actions carousel-photo-actions">
              <Button variant="ghost" size="sm" onClick={() => onViewPhoto([proPhotoUrl], 0)}>Ampliar</Button>
              <Button variant="ghost" size="sm" disabled={downloading} onClick={() => onDownloadPhoto(proPhotoUrl)}>Descargar</Button>
            </div>
          )}
          <div className="compare-row">
            <p className="compare-row-label">Código Profit</p>
            <p><strong className="mono">{c.article.profitArticleCode}</strong></p>
          </div>
          {fields.slice(0, 5).map((f) => (
            f.pro ? (
              <div className="compare-row" key={f.key}>
                <p className="compare-row-label">{f.label}</p>
                <p>{f.pro}</p>
              </div>
            ) : null
          ))}
        </section>
      </div>

      {(why.length > 0 || extraEvidence.length > 0 || c.explanation) && (
        <section className="compare-why" aria-label="Por qué coinciden">
          <h4>¿Por qué coinciden?</h4>
          <ul>
            {why.map((f) => (
              <li key={f.key}>
                <span aria-hidden="true">✓ </span>
                <strong>{f.label}</strong>
                {(f.sol || f.pro) && (
                  <span className="muted">: {[f.sol, f.pro].filter(Boolean).join(' ↔ ')}</span>
                )}
              </li>
            ))}
            {extraEvidence.map((e) => (
              <li key={e}><span aria-hidden="true">✓ </span>{getMatchEvidenceLabel(e)}</li>
            ))}
          </ul>
          {c.explanation && <p className="muted small">{c.explanation}</p>}
        </section>
      )}
      {c.conflicts.length > 0 && (
        <section aria-label="Diferencias">
          <h4 className="small">Diferencias</h4>
          <ul className="match-list">
            {c.conflicts.map((k) => (
              <li key={k}><span aria-hidden="true">— </span>{getMatchConflictLabel(k)} (diferente, no es error)</li>
            ))}
          </ul>
        </section>
      )}

      <div>
        <Button variant="ghost" size="sm" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
          {showMore ? '▾ Ocultar más información' : '▸ Ver más información'}
        </Button>
        {showMore && (
          <div className="stack-sm">
            {fields.slice(5).map((f) => (
              (f.sol || f.pro) ? (
                <div className="compare-row" key={f.key}>
                  <p className="compare-row-label">{f.label}</p>
                  <div className="compare-vals">
                    <p>{f.sol ?? '—'}</p>
                    <p>{f.pro ?? '—'}</p>
                  </div>
                  {markOf(f) === 'ok' && <p className="compare-mark-ok">✓ Coincide</p>}
                  {markOf(f) === 'diff' && <p className="muted small">— Diferente</p>}
                </div>
              ) : null
            ))}
            {shown.map((f) => {
              const m = markOf(f);
              if (!m) return null;
              return (
                <div className="compare-row" key={`m-${f.key}`}>
                  <p className="compare-row-label">{f.label}</p>
                  <div className="compare-vals">
                    <p>{f.sol ?? '—'}</p>
                    <p>{f.pro ?? '—'}</p>
                  </div>
                  {m === 'ok' && <p className="compare-mark-ok">✓ Coincide</p>}
                  {m === 'diff' && <p className="muted small">— Diferente</p>}
                </div>
              );
            })}
            {trim(draft.purpose) && (
              <div className="compare-row">
                <p className="compare-row-label">Propósito (solicitud)</p>
                <p>{trim(draft.purpose)}</p>
              </div>
            )}
            {c.priorDecision && (
              <p className="muted small">
                {c.priorDecision === 'SAME' ? 'Marcado previamente como el mismo artículo.' : 'Marcado previamente como diferente.'}
                {' '}({getMatchDecisionLabel(c.priorDecision)})
              </p>
            )}
          </div>
        )}
      </div>

      <div className="compare-foot">
        <div className="compare-foot-group">
          <Button variant="secondary" size="sm" disabled={total <= 1} onClick={onPrev} aria-label="Candidato anterior">
            ‹ Anterior
          </Button>
          <Button variant="secondary" size="sm" disabled={total <= 1} onClick={onNext} aria-label="Candidato siguiente">
            Siguiente ›
          </Button>
        </div>
        <div className="compare-foot-group">
          <Button variant="secondary" size="sm" disabled={saving} onClick={onDiscard}>Descartar</Button>
          {canDecide && (
            <>
              <Button variant="ghost" size="sm" disabled={saving} onClick={onDifferent}>No es este</Button>
              <Button variant="accent" size="sm" disabled={saving} onClick={onSame}>Es este</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
