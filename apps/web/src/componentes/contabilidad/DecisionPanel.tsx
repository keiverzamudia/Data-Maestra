import * as React from 'react';
import { Button, Textarea, Alert } from '../ui';

interface Props {
  ready: boolean;
  missing: number;
  saving: boolean;
  notes: string;
  onNotes: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  lastChange?: string | null;
}

/** 12G — Panel de decisión (ref. Stitch): observaciones + veredicto + acciones. */
export const DecisionPanel: React.FC<Props> = ({ ready, missing, saving, notes, onNotes, onApprove, onReject, lastChange }) => (
  <section className="card p16" aria-label="Decisión contable">
    <h3 className="h1" style={{ fontSize: 16 }}>Decisión Contable</h3>
    <div style={{ marginTop: 8 }}>
      <label className="muted small" htmlFor="acct-notes">Observaciones contables (opcional)</label>
      <Textarea
        id="acct-notes"
        rows={3}
        placeholder="Añada notas o referencias contables para la bitácora de la solicitud…"
        value={notes}
        onChange={e => onNotes(e.target.value)}
        disabled={saving}
      />
    </div>
    {!ready && (
      <div style={{ marginTop: 8 }}>
        <Alert tone="warning">
          ⚠ No puede aprobarse{missing > 0 ? ` — faltan ${missing} requisitos` : ''}. Revise el checklist.
        </Alert>
      </div>
    )}
    <div className="decision-actions" style={{ marginTop: 8 }}>
      <Button onClick={onApprove} disabled={saving || !ready} title={!ready ? 'Complete los requisitos del checklist' : undefined}>
        {saving ? 'Procesando…' : '✓ Aprobar Solicitud Contable'}
      </Button>
      <Button variant="danger" onClick={onReject} disabled={saving}>Rechazar</Button>
    </div>
    {lastChange && (
      <p className="muted small" style={{ marginTop: 8 }}>Último cambio: {lastChange}</p>
    )}
  </section>
);
