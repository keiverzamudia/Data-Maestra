import * as React from 'react';
import { Drawer } from '../ui';
import { WorkflowStepper } from '../workflow';
import { getHelp, type HelpEntry } from './help-content';
import type { RequestStatus } from '../../tipos';

/**
 * Sistema transversal de ayuda contextual (solo presentación).
 * Única implementación reutilizable: HelpButton + HelpDrawer + HelpFieldInfo.
 * El contenido vive en help-content.ts; aquí solo se presenta.
 */

function HelpSections({ entry }: { entry: HelpEntry }) {
  return (
    <div className="stack">
      <section aria-label="Qué es esta etapa">
        <h3 className="subsection-title">¿Qué es esta etapa?</h3>
        <p className="muted block-mt-sm">{entry.what}</p>
      </section>
      <section aria-label="Por qué está aquí">
        <h3 className="subsection-title">¿Por qué está aquí?</h3>
        <p className="muted block-mt-sm">{entry.whyHere}</p>
      </section>
      {entry.responsibility && (
        <section aria-label="Tu responsabilidad">
          <h3 className="subsection-title">Tu responsabilidad</h3>
          <p className="muted block-mt-sm">{entry.responsibility}</p>
        </section>
      )}
      <section aria-label="Qué debes hacer">
        <h3 className="subsection-title">¿Qué debes hacer?</h3>
        <ol className="help-steps block-mt-sm">
          {entry.steps.map(s => <li key={s}>{s}</li>)}
        </ol>
      </section>
      {entry.doNot.length > 0 && (
        <section aria-label="Qué no debes hacer">
          <h3 className="subsection-title">¿Qué no debes hacer?</h3>
          <ul className="help-donot block-mt-sm">
            {entry.doNot.map(s => <li key={s}>{s}</li>)}
          </ul>
        </section>
      )}
      {entry.sources.length > 0 && (
        <section aria-label="De dónde viene la información">
          <h3 className="subsection-title">¿De dónde viene la información?</h3>
          <dl className="help-sources block-mt-sm">
            {entry.sources.map(s => (
              <div key={s.label}>
                <dt>{s.label}</dt>
                <dd className="muted small">{s.desc}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section aria-label="Qué ocurre después">
        <h3 className="subsection-title">¿Qué ocurre después?</h3>
        <p className="muted block-mt-sm">{entry.next}</p>
        <p className="block-mt-sm"><strong>Responsable siguiente:</strong> {entry.nextOwner}</p>
      </section>
    </div>
  );
}

export const HelpDrawer: React.FC<{
  helpKey: string;
  status?: RequestStatus;
  onClose: () => void;
}> = ({ helpKey, status, onClose }) => {
  const entry = getHelp(helpKey);
  if (!entry) return null;
  return (
    <Drawer open onClose={onClose} title="Ayuda" subtitle={entry.title}>
      <div className="stack">
        <p className="muted">{entry.subtitle}</p>
        <section aria-label="Recorrido del flujo">
          <h3 className="subsection-title">Recorrido</h3>
          <div className="block-mt-sm">
            <WorkflowStepper status={status ?? entry.flowStatus} compact />
          </div>
        </section>
        <HelpSections entry={entry} />
      </div>
    </Drawer>
  );
};

/** Botón discreto "? Ayuda" para el encabezado de cada módulo. */
export const HelpButton: React.FC<{
  helpKey: string;
  status?: RequestStatus;
}> = ({ helpKey, status }) => {
  const [open, setOpen] = React.useState(false);
  const entry = getHelp(helpKey);
  if (!entry) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm help-btn"
        onClick={() => setOpen(true)}
        aria-label={`Ayuda: ${entry.title}`}
        title="Ayuda de esta etapa"
      >
        <span className="help-q" aria-hidden="true">?</span>
        <span className="help-label">Ayuda</span>
      </button>
      {open && <HelpDrawer helpKey={helpKey} status={status} onClose={() => setOpen(false)} />}
    </>
  );
};

/** Ayuda puntual de un campo (solo donde aporta valor real). */
export const HelpFieldInfo: React.FC<{
  label: string;
  what: string;
  origin: string;
  owner: string;
}> = ({ label, what, origin, owner }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        className="field-help-btn"
        onClick={() => setOpen(true)}
        aria-label={`Ayuda: ${label}`}
        title={`Ayuda: ${label}`}
      >
        <span aria-hidden="true">ⓘ</span>
      </button>
      {open && (
        <Drawer open onClose={() => setOpen(false)} title="Ayuda de campo" subtitle={label}>
          <div className="stack">
            <section aria-label="Para qué sirve">
              <h3 className="subsection-title">¿Para qué sirve?</h3>
              <p className="muted block-mt-sm">{what}</p>
            </section>
            <section aria-label="Origen">
              <h3 className="subsection-title">Origen</h3>
              <p className="muted block-mt-sm">{origin}</p>
            </section>
            <section aria-label="Responsable">
              <h3 className="subsection-title">Responsable</h3>
              <p className="muted block-mt-sm">{owner}</p>
            </section>
          </div>
        </Drawer>
      )}
    </>
  );
};
