// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MisSolicitudesPage } from './MisSolicitudesPage';

vi.mock('../../servicios', () => ({
  requestService: { list: vi.fn() },
}));
vi.mock('../../contextos/CompanyContext', () => ({
  useCompany: () => ({ companyId: 'c1', companies: [{ id: 'c1', name: 'E1' }] }),
}));
vi.mock('../../hooks/useOrganizacion', () => ({
  useOrganizacion: () => ({ departamentos: [{ id: 'd1', name: 'Ventas' }] }),
}));

import { requestService } from '../../servicios';
const listMock = requestService.list as any;

const ROW: any = {
  id: 'r1', requestNumber: 'REQ-0054', requestedDescription: 'GANCHOS',
  companyId: 'c1', departmentId: 'd1', requesterId: 'u9', status: 'CONTABILIDAD_APROBADA',
  masterCode: 'FERMIS-00001', profitCode: null,
  createdAt: '2026-09-10T10:00:00.000Z', updatedAt: '2026-09-11T10:00:00.000Z',
};

describe('MisSolicitudesPage 14L', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue({ data: [ROW], total: 1, filteredTotal: 1, page: 1, limit: 25 });
  });
  afterEach(() => cleanup());

  function renderPage() {
    return render(<MemoryRouter><MisSolicitudesPage /></MemoryRouter>);
  }

  it('pide mine=true (el backend fuerza el requesterId de la sesión)', async () => {
    renderPage();
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    for (const call of listMock.mock.calls) {
      expect(call[0].mine).toBe(true);
      expect(call[0].requesterId).toBeUndefined();
    }
    expect(await screen.findByText('GANCHOS')).toBeTruthy();
  });

  it('muestra columnas Master/Profit y resumen', async () => {
    renderPage();
    await screen.findByText('FERMIS-00001');
    expect(screen.getByText('Mis solicitudes')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('filtros y orden llegan al backend', async () => {
    renderPage();
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    const mainCalls = () => listMock.mock.calls.map((c: any[]) => c[0]).filter((p: any) => p.page !== undefined);
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'rechazadas' } });
    await waitFor(() => {
      const last = mainCalls()[mainCalls().length - 1];
      expect(last.bucket).toBe('rechazadas');
    });
    fireEvent.change(screen.getByLabelText('Ordenar'), { target: { value: 'antiguas' } });
    await waitFor(() => {
      const last = mainCalls()[mainCalls().length - 1];
      expect(last.sort).toBe('antiguas');
    });
    fireEvent.change(screen.getByPlaceholderText(/part number/), { target: { value: 'FERMIS' } });
    await waitFor(() => {
      const last = mainCalls()[mainCalls().length - 1];
      expect(last.search).toBe('FERMIS');
    });
  });

  it('CASO A/D: métricas personales sin "Con error" (nunca global)', async () => {
    listMock.mockImplementation((p: any) => {
      if (p.bucket === 'proceso') return Promise.resolve({ data: [], total: 0, filteredTotal: 0, page: 1, limit: 1 });
      if (p.bucket === 'completadas') return Promise.resolve({ data: [], total: 0, filteredTotal: 1, page: 1, limit: 1 });
      if (p.bucket === 'rechazadas') return Promise.resolve({ data: [], total: 0, filteredTotal: 0, page: 1, limit: 1 });
      return Promise.resolve({ data: [ROW], total: 1, filteredTotal: 1, page: 1, limit: 25 });
    });
    renderPage();
    await screen.findByText('GANCHOS');
    expect(screen.getByText('Total').parentElement?.textContent).toContain('1');
    expect(screen.queryByText('Con error')).toBeNull();
    expect(screen.queryByRole('option', { name: 'Con error' })).toBeNull();
    expect(screen.getAllByText('Rechazadas').length).toBeGreaterThan(0);
    for (const call of listMock.mock.calls) {
      expect(call[0].mine).toBe(true);
    }
  });
});
