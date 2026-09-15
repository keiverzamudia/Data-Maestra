// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SectionCard, StatCard, Code, DataTable, Pagination, Tabs, Button, EmptyState, Modal, type DataColumn } from './index';

function noop() {}

describe('Enterprise UI primitives', () => {
  afterEach(() => cleanup());

  it('SectionCard muestra título y contenido con encabezado uniforme', () => {
    render(<SectionCard title="Mi sección" desc="Descripción"><p>Contenido</p></SectionCard>);
    expect(screen.getByText('Mi sección')).toBeDefined();
    expect(screen.getByText('Contenido')).toBeDefined();
  });

  it('StatCard muestra valor y etiqueta', () => {
    render(<StatCard label="Pendientes" value={7} tone="warn" />);
    expect(screen.getByText('7')).toBeDefined();
    expect(screen.getByText('Pendientes')).toBeDefined();
  });

  it('Code usa monoespaciada para códigos técnicos', () => {
    const { container } = render(<Code>RVHCAR-00001</Code>);
    expect(container.querySelector('code.mono')?.textContent).toBe('RVHCAR-00001');
  });

  it('DataTable muestra filas, loading, vacío y error', () => {
    interface Row { id: string; name: string }
    const cols: DataColumn<Row>[] = [
      { key: 'n', header: 'Nombre', render: r => <strong>{r.name}</strong> },
    ];
    const { unmount } = render(<DataTable columns={cols} rows={[{ id: '1', name: 'FILTRO' }]} rowKey={r => r.id} />);
    expect(screen.getByText('FILTRO')).toBeDefined();
    unmount();

    render(<DataTable columns={cols} rows={[]} rowKey={r => (r as Row).id} emptyTitle="Sin datos" />);
    expect(screen.getByText('Sin datos')).toBeDefined();
    cleanup();

    render(<DataTable columns={cols} rows={[]} rowKey={r => (r as Row).id} loading />);
    expect(screen.getByRole('status', { name: /cargando datos/i })).toBeDefined();
    cleanup();

    render(<DataTable columns={cols} rows={[]} rowKey={r => (r as Row).id} error="Fallo" />);
    expect(screen.getByText('Fallo')).toBeDefined();
    cleanup();
  });

  it('DataTable propaga onRowClick con teclado y puntero', () => {
    interface Row { id: string; name: string }
    const cols: DataColumn<Row>[] = [{ key: 'n', header: 'Nombre', render: r => r.name }];
    const onRowClick = vi.fn();
    render(<DataTable columns={cols} rows={[{ id: '1', name: 'X' }]} rowKey={r => r.id} onRowClick={onRowClick} />);
    const row = screen.getByText('X').closest('tr')!;
    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it('Pagination navega y cambia tamaño de página', () => {
    const onPage = vi.fn();
    const onPageSize = vi.fn();
    render(<Pagination page={2} totalPages={5} total={100} pageSize={25} onPage={onPage} onPageSize={onPageSize} />);
    expect(screen.getByText(/Página 2 de 5/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(onPage).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(onPage).toHaveBeenCalledWith(3);
    fireEvent.change(screen.getByLabelText('Registros por página'), { target: { value: '50' } });
    expect(onPageSize).toHaveBeenCalledWith(50);
  });

  it('Pagination no se muestra con una sola página', () => {
    const { container } = render(<Pagination page={1} totalPages={1} onPage={noop} />);
    expect(container.textContent).toBe('');
  });

  it('Tabs expone tablist con selección y flechas de teclado', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={['A', 'B', 'C']} active={0} onChange={onChange} />);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeDefined();
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]!.getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(1);
    fireEvent.click(tabs[2]!);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('Button loading deshabilita, anuncia ocupado y conserva etiqueta', () => {
    render(<Button loading>Guardar</Button>);
    const btn = screen.getByRole('button', { name: /Guardar/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
  });

  it('EmptyState acepta icono y acción opcionales', () => {
    render(<EmptyState title="Sin datos" desc="Nada aquí" icon={<span>◔</span>} action={<button>Crear</button>} />);
    expect(screen.getByText('Sin datos')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Crear' })).toBeDefined();
  });

  it('Modal es dialógico modal con etiqueta', () => {
    render(<Modal open onClose={noop} title="Confirmar">Cuerpo</Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Confirmar' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Cuerpo')).toBeDefined();
  });
});
