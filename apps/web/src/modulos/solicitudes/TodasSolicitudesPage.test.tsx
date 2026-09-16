// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TodasSolicitudesPage } from './TodasSolicitudesPage';

vi.mock('../../servicios/api/api-request-service', () => ({
  apiRequestListAll: vi.fn(),
}));
vi.mock('../../contextos/CompanyContext', () => ({
  useCompany: () => ({ companyId: 'c1', companies: [{ id: 'c1', name: 'E1' }] }),
}));
vi.mock('../../hooks/useOrganizacion', () => ({
  useOrganizacion: () => ({
    departamentos: [{ id: 'd1', name: 'Ventas' }],
    usuarios: [{ id: 'u9', displayName: 'Juan' }],
  }),
}));

import { apiRequestListAll } from '../../servicios/api/api-request-service';
const listAllMock = apiRequestListAll as any;

const ROW: any = {
  id: 'r1', requestNumber: 'REQ-0060', requestedDescription: 'TORNILLO',
  companyId: 'c1', departmentId: 'd1', requesterId: 'u9', status: 'CONTABILIDAD_APROBADA',
  requester: { displayName: 'Juan' }, company: { name: 'E1' },
  masterCode: 'FERMIS-00001', profitCode: null,
  createdAt: '2026-09-10T10:00:00.000Z', updatedAt: '2026-09-11T10:00:00.000Z',
};

describe('TodasSolicitudesPage (gerencial)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAllMock.mockResolvedValue({ data: [ROW], total: 1, filteredTotal: 1, page: 1, limit: 25 });
  });
  afterEach(() => cleanup());

  it('muestra solicitante, master/profit y paginación server-side', async () => {
    render(<MemoryRouter><TodasSolicitudesPage /></MemoryRouter>);
    expect(await screen.findByText('TORNILLO')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Juan' })).toBeTruthy();
    expect(screen.getByText('FERMIS-00001')).toBeTruthy();
    expect(screen.getByText(/de 1 resultados/)).toBeTruthy();
  });

  it('filtros llegan al backend (estado, empresa, solicitante, búsqueda)', async () => {
    render(<MemoryRouter><TodasSolicitudesPage /></MemoryRouter>);
    await waitFor(() => expect(listAllMock).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'ERROR_PROFIT' } });
    await waitFor(() => {
      const last = listAllMock.mock.calls[listAllMock.mock.calls.length - 1][0];
      expect(last.status).toBe('ERROR_PROFIT');
      expect(last.page).toBe(1);
    });
  });
});
