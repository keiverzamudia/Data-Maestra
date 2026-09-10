import * as React from 'react';
import { Alert } from '../ui';

export type CheckStatus = 'ok' | 'missing' | 'blocked' | 'error' | 'pending';

export interface CheckEvidence {
  label: string;
  status: CheckStatus;
  value?: string;
  verification?: string;
  origin?: string;
  result?: string;
}

const META: Record<CheckStatus, { cls: string; mark: string; state: string }> = {
  ok: { cls: 'check-ok', mark: '✓', state: 'COMPLETO' },
  missing: { cls: 'check-missing', mark: '✕', state: 'FALTANTE' },
  blocked: { cls: 'check-warn', mark: '⚠', state: 'BLOQUEADO' },
  error: { cls: 'check-missing', mark: '❌', state: 'ERROR' },
  pending: { cls: '', mark: '○', state: 'VERIFICANDO' },
};

/** 12F/12G — evidencia expandible accesible (botón + región). */
export const CheckEvidenceItem: React.FC<{ item: CheckEvidence }> = ({ item }) => {
  const [open, setOpen] = React.useState(false);
  const meta = META[item.status];
  return (
    <div className={`check ${meta.cls}`}>
      <button
        type="button"
        className="check-head"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={`${item.label}: ${meta.state}. Ver verificación`}
      >
        <span className="check-mark" aria-hidden="true">{meta.mark}</span>
        <span className="check-label">{item.label}</span>
        <span className="check-state">{meta.state}</span>
      </button>
      {item.value && <div className="check-value">{item.value}</div>}
      {open && (
        <div className="check-detail">
          {item.verification && <div><span className="muted small">Verificación: </span>{item.verification}</div>}
          {item.result && <div><span className="muted small">Resultado: </span>{item.result}</div>}
          {item.origin && <div><span className="muted small">Origen: </span>{item.origin}</div>}
        </div>
      )}
      <button type="button" className="btn btn-ghost btn-sm check-toggle" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        {open ? 'Ocultar' : 'Verificación'}
      </button>
    </div>
  );
};

interface Props {
  checks: CheckEvidence[];
  ready: boolean;
  missing: number;
  loading: boolean;
}

/** 12G — Checklist lateral (ref. Stitch): progreso + acordeones + veredicto. */
export const ValidationChecklist: React.FC<Props> = ({ checks, ready, missing, loading }) => {
  const done = checks.filter(c => c.status === 'ok').length;
  const pct = checks.length === 0 ? 0 : Math.round((done / checks.length) * 100);
  return (
    <section className="card p16" aria-label="Checklist de validación">
      <div className="acct-head">
        <h3 className="h1" style={{ fontSize: 16 }}>Checklist de Validación</h3>
        <span className="pill pill-ok">{done} / {checks.length} OK</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="muted small">Requisitos contables</span>
          <span className="muted small"><strong>{pct}% Cumplido</strong></span>
        </div>
        <div className="check-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de validación">
          <div style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="checklist" style={{ marginTop: 12 }}>
        {checks.map(item => (
          <CheckEvidenceItem key={item.label} item={item} />
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <Alert tone={ready ? 'success' : 'danger'}>
          {ready
            ? '✓ Solicitud lista para aprobación contable.'
            : loading
              ? 'Verificando estándar en Profit…'
              : `✕ Faltan ${missing} requisitos obligatorios.`}
        </Alert>
      </div>
    </section>
  );
};
