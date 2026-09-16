// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfitRegistrationPanel } from './ProfitRegistrationPanel';
import type { Request } from '../../tipos';

vi.mock('../../servicios/api/api-profit-registration-service', () => ({
  apiProfitRegistrationService: {
    writeStatus: vi.fn(),
    plan: vi.fn(),
    create: vi.fn(),
    verify: vi.fn(),
    attempts: vi.fn(),
    retry: vi.fn(),
  },
  RECONCILE_LABELS: {
    CREATED_AND_VERIFIED: { text: 'Creado y verificado', tone: 'green' },
  },
  profitErrorLabel: (c?: string) => c ?? 'Error desconocido',
  profitErrorAction: () => null,
  profitOpState: () => 'READY',
}));

vi.mock('../../servicios/api/api-corporate-service', () => ({
  apiCorporateService: { companies: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../contextos/SessionContext', () => ({
  useSession: vi.fn(),
}));

import { useSession } from '../../contextos/SessionContext';
import { apiProfitRegistrationService } from '../../servicios/api/api-profit-registration-service';

// REQ-0060: creada por u1, en CONTABILIDAD_APROBADA.
const REQ = {
  id: 'req-60', requestNumber: 60, companyId: 'c1', departmentId: 'd1', requesterId: 'u1',
  requestedDescription: 'TORNILLO', purpose: 'x', status: 'CONTABILIDAD_APROBADA', priority: 0,
  createdAt: '', updatedAt: '',
} as unknown as Request;

describe('FASE 18 — panel Profit sin PROFIT.WRITE', () => {
  beforeEach(() => {
    // Propietario (u1) SIN permiso Profit: solo REQUEST.VIEW.
    (useSession as any).mockReturnValue({
      hasPermission: (p: string) => p === 'REQUEST.VIEW',
      user: { displayName: 'Solicitante' },
      roleCodes: ['REQUESTER'],
    });
    (apiProfitRegistrationService.writeStatus as any).mockResolvedValue({ enabled: true, configured: true });
    (apiProfitRegistrationService.attempts as any).mockResolvedValue({ requestId: 'req-60', attempts: [], verifications: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('Caso 3: propietario sin PROFIT.WRITE no ve Preparar/Registrar (ve el detalle)', async () => {
    render(<MemoryRouter><ProfitRegistrationPanel request={REQ} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('TORNILLO')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Preparar registro' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar en Profit' })).toBeNull();
    expect(screen.getByText(/requieren autorización/)).toBeTruthy();
    expect(apiProfitRegistrationService.plan).not.toHaveBeenCalled();
  });

  it('Caso 6: misma autorización llegues desde donde llegues (sin bypass por origen)', () => {
    // El panel no recibe origen de navegación: actividad reciente y
    // Mis solicitudes rinden exactamente los mismos controles.
    render(<MemoryRouter><ProfitRegistrationPanel request={REQ} /></MemoryRouter>);
    return waitFor(() => expect(screen.getByText('TORNILLO')).toBeTruthy()).then(() => {
      expect(screen.queryByRole('button', { name: 'Preparar registro' })).toBeNull();
    });
  });
});
