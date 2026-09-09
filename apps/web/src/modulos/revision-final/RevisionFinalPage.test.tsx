// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FinalReviewPage } from './RevisionFinalPage';
import { useSession } from '../../contextos/SessionContext';

vi.mock('../../servicios', () => ({
  finalReviewService: { getPendingReviews: vi.fn(), approveReview: vi.fn(), rejectReview: vi.fn() },
}));
vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../../contextos/CompanyContext', () => ({ useCompany: () => ({ companyId: 'c1' }) }));
vi.mock('../../hooks/useCatalogos', () => ({
  useCatalogos: () => ({
    grupos: [{ id: 'g1', name: 'Repuestos' }],
    subgrupos: [{ id: 's1', name: 'Motor' }],
    categorias: [],
    marcas: [{ id: 'b1', name: 'Genérica' }],
    unidades: [],
  }),
}));
vi.mock('../../hooks/useOrganizacion', () => ({
  useOrganizacion: () => ({
    usuarios: [{ id: 'u1', displayName: 'Juan Pérez' }],
    departamentos: [{ id: 'd1', name: 'Mantenimiento' }],
  }),
}));

import { finalReviewService } from '../../servicios';
const pendingMock = finalReviewService.getPendingReviews as any;
const approveMock = finalReviewService.approveReview as any;

const FULL: any = {
  id: 'r1', requestNumber: 21, requestedDescription: 'BOMBA DE AGUA PARA MOTOR DIESEL INDUSTRIAL',
  purpose: 'Mantenimiento', requesterId: 'u1', departmentId: 'd1', companyId: 'c1',
  status: 'PENDIENTE_VALIDACION_MAESTRA', groupId: 'g1', subgroupId: 's1', unitId: 'uom1',
  masterCode: 'ABCDE-12345', accountingCodes: [{ code: '1.1', description: 'Inventario' }],
  createdAt: '2026-09-01T10:00:00.000Z',
};

describe('RevisionFinalPage 11C', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({ hasPermission: () => true });
    pendingMock.mockResolvedValue([structuredClone(FULL)]);
  });
  afterEach(() => cleanup());

  it('checklist con completos y contador', async () => {
    render(<MemoryRouter><FinalReviewPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    expect(await screen.findByText('Checklist de Validación Maestra')).toBeTruthy();
    expect(screen.getByText(/10 de 10 requisitos completos/)).toBeTruthy();
    expect(screen.getByText('Aprobar Definitivamente')).toBeTruthy();
  });

  it('faltantes bloquean aprobar y se diferencian', async () => {
    pendingMock.mockResolvedValueOnce([structuredClone({ ...FULL, groupId: undefined, masterCode: undefined })]);
    render(<MemoryRouter><FinalReviewPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    expect(await screen.findAllByText(/Faltan 2 requisitos/)).toBeTruthy();
    expect(screen.getAllByText('FALTANTE')).toHaveLength(2);
    expect((screen.getByText('Aprobar Definitivamente') as HTMLButtonElement).disabled).toBe(true);
  });

  it('no permite editar clasificación (read-only)', async () => {
    render(<MemoryRouter><FinalReviewPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    await screen.findByText('Checklist de Validación Maestra');
    expect(screen.queryByLabelText(/Grupo/)).toBeNull();
    expect(screen.getByText(/Validación solo lectura/)).toBeTruthy();
  });

  it('aprobar con confirmación y workflow visible', async () => {
    approveMock.mockResolvedValue({});
    render(<MemoryRouter><FinalReviewPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    fireEvent.click(await screen.findByText('Aprobar Definitivamente'));
    expect(await screen.findAllByText('Aprobar definitivamente')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Aprobar definitivamente').pop()!);
    expect(approveMock).toHaveBeenCalledWith('r1');
  });
});
