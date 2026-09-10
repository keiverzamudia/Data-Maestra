// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FinalReviewPage } from './RevisionFinalPage';
import { useSession } from '../../contextos/SessionContext';

vi.mock('../../servicios', () => ({
  finalReviewService: { getPendingReviews: vi.fn(), getReviewDetail: vi.fn(), approveReview: vi.fn(), rejectReview: vi.fn() },
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
const detailMock = finalReviewService.getReviewDetail as any;
const approveMock = finalReviewService.approveReview as any;

const FULL: any = {
  id: 'r1', requestNumber: 21, requestedDescription: 'BOMBA DE AGUA PARA MOTOR DIESEL INDUSTRIAL',
  purpose: 'Mantenimiento', requesterId: 'u1', departmentId: 'd1', companyId: 'c1',
  status: 'PENDIENTE_VALIDACION_MAESTRA', groupId: 'g1', subgroupId: 's1', unitId: 'uom1',
  masterCode: 'ABCDE-12345', accountingCodes: [{ code: '1.1', description: 'Inventario' }],
  createdAt: '2026-09-01T10:00:00.000Z',
  approvals: [
    { id: 'a1', stepCode: 'PENDIENTE_ALMACEN', actorId: 'u9', action: 'APPROVE', fromStatus: 'PENDIENTE_ALMACEN', toStatus: 'PENDIENTE_CONTABILIDAD', createdAt: '2026-09-02T10:00:00.000Z', actor: { id: 'u9', username: 'j.perez', displayName: 'JUAN PEREZ' } },
    { id: 'a2', stepCode: 'PENDIENTE_CONTABILIDAD', actorId: 'u8', action: 'APPROVE', fromStatus: 'PENDIENTE_CONTABILIDAD', toStatus: 'PENDIENTE_VALIDACION_MAESTRA', createdAt: '2026-09-03T10:00:00.000Z', actor: { id: 'u8', username: 'm.garcia', displayName: 'MARIA GARCIA' } },
  ],
};

describe('RevisionFinalPage 11C', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({ hasPermission: () => true });
    pendingMock.mockResolvedValue([structuredClone(FULL)]);
    detailMock.mockResolvedValue(structuredClone(FULL));
  });
  afterEach(() => cleanup());

  it('cierre sin checklist: trazabilidad real y Contabilidad validada', async () => {
    render(<MemoryRouter><FinalReviewPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    expect(await screen.findByText('Solicitud lista para aprobación final')).toBeTruthy();
    expect(screen.queryByText('Checklist de Validación Maestra')).toBeNull();
    expect(screen.queryByText(/Código Contable/)).toBeNull();
    expect(await screen.findByText((_, el) => el?.textContent === 'Por: JUAN PEREZ')).toBeTruthy();
    expect(screen.getByText((_, el) => el?.textContent === 'Por: MARIA GARCIA')).toBeTruthy();
    expect(screen.getByText(/Contabilidad ✓ VALIDADA/)).toBeTruthy();
    expect(screen.getByText('✓ Aprobar y pasar a Profit')).toBeTruthy();
  });

  it('aprobar muestra cierre sin afirmar registro en Profit', async () => {
    approveMock.mockResolvedValue({});
    render(<MemoryRouter><FinalReviewPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    fireEvent.click(await screen.findByText('✓ Aprobar y pasar a Profit'));
    fireEvent.click((await screen.findAllByText('✓ Aprobar y pasar a Profit')).pop()!);
    expect(await screen.findByText(/Aprobación final completada/)).toBeTruthy();
    expect(screen.getByText(/para continuar con su registro en Profit/)).toBeTruthy();
    expect(screen.queryByText(/Registrado en Profit/)).toBeNull();
  });

  it('no permite editar clasificación (read-only)', async () => {
    render(<MemoryRouter><FinalReviewPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    await screen.findByText('Solicitud lista para aprobación final');
    expect(screen.queryByLabelText(/Grupo/)).toBeNull();
    expect(screen.queryByText('Checklist de Validación Maestra')).toBeNull();
  });

  it('aprobar con confirmación y workflow visible', async () => {
    approveMock.mockResolvedValue({});
    render(<MemoryRouter><FinalReviewPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    fireEvent.click(await screen.findByText('✓ Aprobar y pasar a Profit'));
    expect(await screen.findAllByText('✓ Aprobar y pasar a Profit')).toBeTruthy();
    fireEvent.click(screen.getAllByText('✓ Aprobar y pasar a Profit').pop()!);
    expect(approveMock).toHaveBeenCalledWith('r1');
  });
});
