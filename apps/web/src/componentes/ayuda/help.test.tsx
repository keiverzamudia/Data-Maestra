// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HelpButton, HelpDrawer, HelpFieldInfo, getHelp, helpKeys } from './index';

afterEach(() => cleanup());

describe('Ayuda contextual', () => {
  it('contenido centralizado: claves y etapas conocidas', () => {
    const keys = helpKeys();
    for (const k of ['dashboard', 'solicitudes', 'solicitud-create', 'almacen-classify', 'aprobacion-almacen', 'aprobaciones', 'contabilidad', 'roles', 'auditoria']) {
      expect(keys).toContain(k);
    }
    for (const k of keys) {
      const e = getHelp(k)!;
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.steps.length).toBeGreaterThan(0);
      expect(e.flowStatus).toBeTruthy();
    }
    expect(getHelp('inexistente')).toBeUndefined();
  });

  it('HelpButton renderiza discreto con aria y abre el drawer', () => {
    render(<HelpButton helpKey="almacen" />);
    const btn = screen.getByRole('button', { name: /Ayuda: / });
    expect(btn.getAttribute('title')).toBe('Ayuda de esta etapa');
    expect(screen.queryByText('¿Qué debes hacer?')).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByText('¿Qué debes hacer?')).toBeTruthy();
    expect(screen.getByText('¿Qué no debes hacer?')).toBeTruthy();
    expect(screen.getByText('¿Qué ocurre después?')).toBeTruthy();
  });

  it('HelpButton cierra con Escape y no altera acciones existentes', () => {
    render(
      <div>
        <HelpButton helpKey="contabilidad" />
        <button type="button">Aprobar clasificación</button>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ayuda: / }));
    expect(screen.getByText('¿De dónde viene la información?')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('¿De dónde viene la información?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Aprobar clasificación' })).toBeTruthy();
  });

  it('HelpButton con clave desconocida no renderiza nada', () => {
    const { container } = render(<HelpButton helpKey="no-existe" />);
    expect(container.textContent).toBe('');
  });

  it('HelpDrawer muestra recorrido y siguiente responsable', () => {
    render(<HelpDrawer helpKey="aprobaciones" onClose={() => {}} />);
    expect(screen.getByText('Recorrido')).toBeTruthy();
    expect(screen.getByText(/Almacén para su clasificación/)).toBeTruthy();
    expect(screen.getByText('Almacén.')).toBeTruthy();
  });

  it('HelpFieldInfo abre ayuda del campo con origen y responsable', () => {
    render(<HelpFieldInfo label="Grupo (Profit)" what="Clasificación principal." origin="Catálogo Profit." owner="Almacén." />);
    fireEvent.click(screen.getByRole('button', { name: 'Ayuda: Grupo (Profit)' }));
    expect(screen.getByText('¿Para qué sirve?')).toBeTruthy();
    expect(screen.getByText('Catálogo Profit.')).toBeTruthy();
    expect(screen.getByText('Almacén.')).toBeTruthy();
  });

  it('contenido no revela secretos ni infraestructura', () => {
    const blob = helpKeys().map(k => {
      const e = getHelp(k)!;
      return [e.what, e.whyHere, e.next, ...e.steps, ...e.doNot].join(' ');
    }).join(' ');
    expect(blob).not.toMatch(/password|secret|token|cookie|session|sql server|mssql|tedious|PROFIT_WRITE|hash/i);
  });
});
