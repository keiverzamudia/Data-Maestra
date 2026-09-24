// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Combobox } from './index';

const OPTIONS = [
  { value: 'RVH', label: 'RVH — REPUESTOS' },
  { value: 'MEC', label: 'MEC — MECANICO' },
  { value: 'CON', label: 'CON — CONTACTORES' },
];

afterEach(() => cleanup());

describe('Combobox', () => {
  it('muestra la etiqueta seleccionada y filtra al escribir', () => {
    render(<Combobox options={OPTIONS} value="MEC" onChange={() => {}} ariaLabel="Grupo" />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input.value).toBe('MEC — MECANICO');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'mec' } });
    expect(screen.queryByText('RVH — REPUESTOS')).toBeNull();
    expect(screen.getByText('MEC — MECANICO')).toBeTruthy();
  });

  it('filtra por código o descripción sin tildes', () => {
    render(<Combobox options={[{ value: 'ELE', label: 'ELE — ELÉCTRICO' }]} value="" onChange={() => {}} ariaLabel="Grupo" />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'electrico' } });
    expect(screen.getByText('ELE — ELÉCTRICO')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'ELÉ' } });
    expect(screen.getByText('ELE — ELÉCTRICO')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('Sin coincidencias')).toBeTruthy();
  });

  it('clic selecciona y notifica el valor', () => {
    const onChange = vi.fn();
    render(<Combobox options={OPTIONS} value="" onChange={onChange} ariaLabel="Grupo" />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'con' } });
    fireEvent.mouseDown(screen.getByText('CON — CONTACTORES'));
    expect(onChange).toHaveBeenCalledWith('CON');
  });

  it('texto sin coincidencia revierte al salir', () => {
    const onChange = vi.fn();
    render(<Combobox options={OPTIONS} value="RVH" onChange={onChange} ariaLabel="Grupo" />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'basura' } });
    fireEvent.blur(input);
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('RVH — REPUESTOS');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('teclado: Enter confirma el resaltado y la flecha lo mueve', () => {
    const onChange = vi.fn();
    render(<Combobox options={OPTIONS} value="" onChange={onChange} ariaLabel="Grupo" />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    // Resaltado inicial = primera opción (RVH); Enter la confirma.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('RVH');
    // Con la lista completa, una flecha abajo llega a MEC y Enter la confirma.
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('MEC');
  });

  it('Escape revierte y deshabilitado no abre', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Combobox options={OPTIONS} value="MEC" onChange={onChange} ariaLabel="Grupo" />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'xxx' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('MEC — MECANICO');
    rerender(<Combobox options={OPTIONS} value="" onChange={onChange} ariaLabel="Grupo" disabled />);
    expect((screen.getByRole('combobox') as HTMLInputElement).disabled).toBe(true);
  });
});
