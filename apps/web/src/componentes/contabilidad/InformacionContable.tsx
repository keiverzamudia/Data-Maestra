import * as React from 'react';
import type { ContabilidadPosition } from '../../utilidades/dis';

export type PositionKey = `c${ContabilidadPosition}`;

export interface ContabilidadEntry {
  position: PositionKey;
  code: string;
  description: string;
  /** 12C — cargada automáticamente desde el estándar del grupo (lin_art.dis_cen). */
  auto?: boolean;
}

export const POSITION_KEYS: PositionKey[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];

function positionNumber(key: PositionKey): ContabilidadPosition {
  return parseInt(key.slice(1), 10) as ContabilidadPosition;
}

interface Props {
  value: ContabilidadEntry[];
}

/**
 * Información Contable 12D — resumen de SOLO LECTURA del estándar del grupo en Profit.
 * Sin selector de posiciones, sin buscador, sin edición: lo incorrecto se corrige
 * en Profit y se recarga con "Verificar nuevamente". Mínimo 1 posición para aprobar.
 */
export const InformacionContable: React.FC<Props> = ({ value }) => {
  const ordered = React.useMemo(
    () => [...value].sort((a, b) => positionNumber(a.position) - positionNumber(b.position)),
    [value],
  );

  return (
    <div className="stack-sm">
      {ordered.length === 0 ? (
        <p className="muted small">Sin posiciones contables cargadas.</p>
      ) : (
        <div className="acct-grid">
          {ordered.map(e => (
            <div key={e.position} className="card p16 acct-card">
              <div className="acct-pos">C{e.position.slice(1).padStart(2, '0')}</div>
              <div className="muted small">Cuenta</div>
              <div className="acct-code">{e.code}</div>
              <div className="acct-desc">{e.description}</div>
              <div className="muted small acct-origin">✓ Desde estándar de Profit</div>
            </div>
          ))}
        </div>
      )}

      <p className="muted small">
        Información de solo lectura. Para modificarla, realice el cambio en Profit y luego
        utilice 'Verificar nuevamente'.
      </p>
    </div>
  );
};
