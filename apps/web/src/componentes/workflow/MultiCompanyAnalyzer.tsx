import * as React from 'react';
import { useSession } from '../../contextos/SessionContext';
import { SectionCard, Button, Alert, Badge, ConfirmDialog, Skeleton } from '../ui';
import {
  apiMultiCompanyService,
  type CompatibilityAnalysis,
  type CompanyCompatibility,
  type MultiInsertResult,
} from '../../servicios/api/api-multiempresa-service';
import type { Request } from '../../tipos';

type Fase = 'idle' | 'loading' | 'results' | 'inserting' | 'done';

const STATUS_TONE: Record<CompanyCompatibility['status'], 'green' | 'yellow' | 'red' | 'gray'> = {
  COMPATIBLE: 'green',
  COMPATIBLE_WITH_WARNING: 'yellow',
  INCOMPATIBLE: 'red',
  DESHABILITADA: 'gray',
};

const STATUS_LABEL: Record<CompanyCompatibility['status'], string> = {
  COMPATIBLE: '✓ Compatible',
  COMPATIBLE_WITH_WARNING: '⚠ Compatible con advertencia',
  INCOMPATIBLE: '✕ No disponible',
  DESHABILITADA: '🔒 Deshabilitada',
};

const OUTCOME_TONE: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  INSERTADO: 'green',
  YA_EXISTE: 'yellow',
  OMITIDA_NO_COMPATIBLE: 'red',
  OMITIDA_DESHABILITADA: 'gray',
  ERROR: 'red',
};

const OUTCOME_LABEL: Record<string, string> = {
  INSERTADO: '✓ Insertado correctamente',
  YA_EXISTE: 'El artículo ya existe. No se realizó INSERT.',
  OMITIDA_NO_COMPATIBLE: 'Omitida: dejó de ser compatible. No se realizó la inserción.',
  OMITIDA_DESHABILITADA: 'Omitida: deshabilitada. No se realizó la inserción.',
  ERROR: '✕ Error',
};

/**
 * FASE 25 — Analizador de inserción multiempresa (solo presentación).
 * Solo lectura hasta la confirmación explícita; la inserción revalida
 * cada empresa en el backend. No duplica matching ni workflow.
 */
export const MultiCompanyAnalyzer: React.FC<{ request: Request; onChanged?: () => void }> = ({ request, onChanged }) => {
  const { hasPermission } = useSession();
  const [fase, setFase] = React.useState<Fase>('idle');
  const [analysis, setAnalysis] = React.useState<CompatibilityAnalysis | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [result, setResult] = React.useState<MultiInsertResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (request.status !== 'CONTABILIDAD_APROBADA' && request.status !== 'PROCESANDO_PROFIT' && request.status !== 'INSERTADO_PROFIT' && request.status !== 'ERROR_PROFIT') {
    return null;
  }
  const canWrite = hasPermission('PROFIT.WRITE');
  const isFinal = request.status === 'CONTABILIDAD_APROBADA';

  const runAnalyze = async () => {
    setFase('loading');
    setError(null);
    setResult(null);
    try {
      const a = await apiMultiCompanyService.analyze(request.id);
      setAnalysis(a);
      // Preselección: compatibles + habilitadas (el usuario puede desmarcar).
      setSelected(new Set(a.companies.filter((c) => c.enabled && (c.status === 'COMPATIBLE' || c.status === 'COMPATIBLE_WITH_WARNING')).map((c) => c.company)));
      setFase('results');
    } catch (err: any) {
      setError(err?.message || 'No se pudo analizar la compatibilidad.');
      setFase('idle');
    }
  };

  const runInsert = async () => {
    setConfirmOpen(false);
    setFase('inserting');
    setError(null);
    try {
      const r = await apiMultiCompanyService.insert(request.id, [...selected]);
      setResult(r);
      setFase('done');
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'No se pudo ejecutar la inserción.');
      setFase('results');
    }
  };

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const selectable = (c: CompanyCompatibility) =>
    c.enabled && (c.status === 'COMPATIBLE' || c.status === 'COMPATIBLE_WITH_WARNING');

  return (
    <SectionCard
      title="Analizador de inserción multiempresa"
      desc="Determina en qué empresas Profit puede crearse este artículo antes de insertar. Solo lectura hasta su confirmación."
    >
      {fase === 'idle' && (
        <div className="stack-sm">
          <p className="muted small">Analiza la compatibilidad del artículo aprobado en cada empresa Profit.</p>
          <div>
            <Button variant="secondary" onClick={runAnalyze}>Analizar compatibilidad</Button>
          </div>
        </div>
      )}

      {fase === 'loading' && (
        <div className="stack-sm" aria-label="Analizando empresas">
          <p className="muted small" role="status">Analizando empresas...</p>
          <Skeleton height={16} width="40%" /><Skeleton height={40} /><Skeleton height={40} />
        </div>
      )}

      {(fase === 'results' || fase === 'inserting' || fase === 'done') && analysis && (
        <div className="stack-sm">
          <p>
            <strong className="mono">{analysis.coArt ?? '—'}</strong>
            <span className="muted small"> — {analysis.description}</span>
          </p>
          <p className="muted small" role="status">
            {analysis.compatibleCount} empresas compatibles · {analysis.incompatibleCount} no disponibles
          </p>
          <div className="stack-sm" role="group" aria-label="Empresas Profit">
            {analysis.companies.map((c) => (
              <div key={c.company} className="card p16">
                <div className="flex-between">
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selected.has(c.company)}
                      disabled={!selectable(c) || !canWrite || fase !== 'results'}
                      onChange={() => toggle(c.company)}
                      aria-label={selectable(c) ? `Seleccionar ${c.company}` : `${c.company} bloqueada`}
                    />
                    <span>
                      <strong className="mono">{c.company}</strong>
                      {c.isStandard && <span className="muted small"> — Empresa estándar</span>}
                      <span className="muted small"> — {c.name}</span>
                    </span>
                  </label>
                  <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                </div>
                {c.codeStatus === 'OCUPADO' && (
                  <p className="muted small">El código {c.candidate} ya existe aquí: no se insertará de nuevo.</p>
                )}
                {c.blockingReasons.length > 0 && (
                  <div className="stack-sm">
                    <p className="muted small"><strong>Motivos:</strong></p>
                    <ul className="match-list">
                      {c.blockingReasons.map((m, i) => <li key={i}>• {m}</li>)}
                    </ul>
                    <p className="muted small">No se realizará ningún INSERT en esta empresa.</p>
                  </div>
                )}
                {c.warnings.length > 0 && (
                  <ul className="match-list">
                    {c.warnings.map((w, i) => <li key={i}><span aria-hidden="true">⚠ </span>{w}</li>)}
                  </ul>
                )}
                {c.checks.length > 0 && (
                  <div>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.company)) next.delete(c.company);
                        else next.add(c.company);
                        return next;
                      })}
                      aria-expanded={expanded.has(c.company)}
                    >
                      {expanded.has(c.company) ? '▾ Ocultar detalles' : '▸ Ver detalles'}
                    </Button>
                    {expanded.has(c.company) && (
                      <ul className="match-list" aria-label={`Chequeos de ${c.company}`}>
                        {c.checks.map((k) => (
                          <li key={k.key}>
                            <span aria-hidden="true">{k.ok ? '✓ ' : '✕ '}</span>
                            <strong className="mono small">{k.key}</strong>
                            <span className="muted small"> — {k.detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {fase === 'results' && (
            <div className="stack-sm">
              {!canWrite && (
                <Alert tone="warning"><strong>Sin autorización.</strong> La inserción requiere el permiso de registro en Profit.</Alert>
              )}
              <div className="action-bar">
                <Button variant="secondary" onClick={runAnalyze}>Reanalizar</Button>
                <Button
                  disabled={selected.size === 0 || !canWrite}
                  onClick={() => setConfirmOpen(true)}
                >
                  Continuar
                </Button>
              </div>
            </div>
          )}

          {fase === 'inserting' && (
            <Alert tone="info">Insertando en Profit... No cierre esta pantalla.</Alert>
          )}

          {fase === 'done' && result && (
            <div className="stack-sm">
              <p><strong>Resultado</strong></p>
              {result.results.map((r) => (
                <div key={r.company} className="card p16">
                  <div className="flex-between">
                    <span><strong className="mono">{r.company}</strong></span>
                    <Badge tone={OUTCOME_TONE[r.outcome] ?? 'gray'}>{r.outcome}</Badge>
                  </div>
                  <p className="muted small">{OUTCOME_LABEL[r.outcome] ?? r.outcome}{r.detail && r.outcome === 'ERROR' ? ` — ${r.detail}` : ''}</p>
                  {r.differences.length > 0 && (
                    <p className="muted small">Diferencias: {r.differences.join(', ')}.</p>
                  )}
                </div>
              ))}
              {!result.ok && (
                <Alert tone="warning"><strong>Resultado parcial.</strong> Revise cada empresa: lo insertado quedó insertado; no se afirma reversión alguna.</Alert>
              )}
            </div>
          )}
        </div>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar inserción multiempresa"
        desc={analysis ? `Artículo ${analysis.coArt ?? ''} en ${selected.size} empresa(s): ${[...selected].join(', ')}. Se creará un registro por empresa con el mismo código. Esta operación no puede deshacerse automáticamente.` : undefined}
        confirmLabel={`Insertar en ${selected.size} empresa(s)`}
        busy={fase === 'inserting'}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={runInsert}
      />
    </SectionCard>
  );
};
