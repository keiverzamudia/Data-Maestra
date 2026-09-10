import * as React from 'react';
import { Button, Skeleton, Alert } from '../ui';
import { copyText } from '../../utilidades/copy';
import type { ProfitGroupStandard } from '../../servicios/api/api-profit-service';

interface Props {
  groupName: string;
  groupCode: string;
  std: ProfitGroupStandard | null;
  stdLoading: boolean;
  stdError: string | null;
  verifiedAt: string | null;
  dis: string;
  onVerify: () => void;
}

/**
 * 12G — Panel del estándar contable (ref. Stitch): pills de sincronización,
 * tabla POSICIÓN/CUENTA/DESCRIPCIÓN/ORIGEN/ESTADO, bloque DIS con copiar,
 * estados configurado / no configurado / error diferenciados.
 */
export const AccountingStandardPanel: React.FC<Props> = ({ groupName, groupCode, std, stdLoading, stdError, verifiedAt, dis, onVerify }) => {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    if (await copyText(dis)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  const configured = !!std && std.configured;

  return (
    <section className="card p16" aria-label="Información contable Profit">
      <div className="acct-head">
        <div>
          <h3 className="h1" style={{ fontSize: 16 }}>Información Contable Profit</h3>
          <p className="muted small" style={{ marginTop: 4 }}>
            Estándar contable del grupo {groupName} ({groupCode}).
          </p>
        </div>
        <div className="acct-actions">
          {configured && <span className="pill pill-ok">✓ Sincronizado desde Profit</span>}
          <Button variant="secondary" size="sm" onClick={onVerify} disabled={stdLoading}>
            {stdLoading ? 'Verificando…' : '↻ Verificar en Profit'}
          </Button>
        </div>
      </div>
      {configured && verifiedAt && (
        <p className="muted small" style={{ marginTop: 4 }}>Última verificación: {verifiedAt}</p>
      )}

      {stdLoading && (
        <div className="stack-sm" style={{ marginTop: 12 }} aria-label="Consultando Profit">
          <span className="muted small" role="status">Verificando configuración contable…</span>
          <Skeleton height={16} width="60%" /><Skeleton height={40} />
        </div>
      )}

      {!stdLoading && stdError && (
        <div style={{ marginTop: 12 }} role="alert">
          <Alert tone="danger">
            <strong>⚠ No se pudo verificar Profit.</strong> No es posible determinar el estándar contable
            en este momento ({stdError}). No se afirma que el grupo esté vacío.
          </Alert>
          <div style={{ marginTop: 8 }}>
            <Button variant="secondary" size="sm" onClick={onVerify}>↻ Intentar nuevamente</Button>
          </div>
        </div>
      )}

      {!stdLoading && !stdError && std && !std.configured && (
        <div style={{ marginTop: 12 }} role="alert">
          <Alert tone="warning">
            <strong>⚠ Información contable no configurada.</strong> Este grupo no tiene información
            contable configurada en Profit. Para continuar:<br />
            1. Configure la información contable del grupo en Profit.<br />
            2. Regrese a esta pantalla.<br />
            3. Presione "Verificar en Profit".
          </Alert>
        </div>
      )}

      {!stdLoading && !stdError && configured && (
        <>
          <div className="card table-responsive" style={{ marginTop: 12 }}>
            <table className="acct-table">
              <thead><tr><th>Posición</th><th>Cuenta contable</th><th>Descripción</th><th>Origen</th><th>Estado</th></tr></thead>
              <tbody>
                {std.positions.map(p => (
                  <tr key={p.position}>
                    <td data-label="Posición"><span className="acct-pos">{p.position.toUpperCase()}</span></td>
                    <td data-label="Cuenta contable"><span className="acct-code">{p.code}</span></td>
                    <td data-label="Descripción">{p.description || '(fuera de catálogo)'}</td>
                    <td data-label="Origen" className="muted small">Estándar Profit</td>
                    <td data-label="Estado"><span className="pill pill-ok">● Configurada</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12 }}>
            <span className="muted small">Formato contable para Profit</span>
            <div className="code" style={{ marginTop: 4, wordBreak: 'break-all' }}>{dis}</div>
            <div style={{ marginTop: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => void copy()}>
                {copied ? '✓ Copiado' : '⧉ Copiar'}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
