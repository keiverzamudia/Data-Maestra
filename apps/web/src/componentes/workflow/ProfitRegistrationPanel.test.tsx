// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ProfitRegistrationPanel } from './ProfitRegistrationPanel';
import type { Request } from '../../tipos';

vi.mock('../../servicios/api/api-profit-registration-service', () => ({
  apiProfitRegistrationService: {
    plan: vi.fn(),
    create: vi.fn(),
    verify: vi.fn(),
  },
  RECONCILE_LABELS: {
    CREATED_AND_VERIFIED: { text: 'Creado y verificado', tone: 'green' },
    CREATED_WITH_DIFFERENCES: { text: 'Creado con diferencias', tone: 'yellow' },
    NOT_FOUND: { text: 'No encontrado', tone: 'red' },
    RECONCILIATION_ERROR: { text: 'Error de reconciliación', tone: 'red' },
  },
  profitErrorLabel: (c?: string) => c ?? 'Error desconocido',
}));

vi.mock('../../contextos/SessionContext', () => ({
  useSession: () => ({ hasPermission: (p: string) => p === 'PROFIT.WRITE', user: { displayName: 'Op' } }),
}));

import { apiProfitRegistrationService } from '../../servicios/api/api-profit-registration-service';

const REQ = {
  id: 'r1', requestNumber: 55, companyId: 'c1', departmentId: 'd1', requesterId: 'u1',
  requestedDescription: 'TORNILLO', purpose: 'x', status: 'APROBADO_FINAL', priority: 0,
  createdAt: '', updatedAt: '',
} as unknown as Request;

const PLAN = {
  requestId: 'r1',
  payload: {
    co_art: 'ACTEQT0001', art_des: 'TORNILLO', tipo: 'C', co_lin: 'ACT', co_subl: 'EQT',
    uni_venta: 'UND', suni_venta: 'UND', tipo_imp: '1', co_cat: '01', co_color: '01',
    procedenci: '01', co_prov: 'GEN', tipo_cos: 'ULCO', dis_cen: '',
  },
  candidate: 'ACTEQT0001', available: true, nextSequence: 1, warnings: [],
};

describe('ProfitRegistrationPanel', () => {
  beforeEach(() => {
    (apiProfitRegistrationService.plan as any).mockResolvedValue(PLAN);
    (apiProfitRegistrationService.create as any).mockResolvedValue({
      requestId: 'r1', ok: true, coArt: 'ACTEQT0001',
      attempts: [{ attempt: 1, candidate: 'ACTEQT0001', existedBefore: false, outcome: 'INSERTED' }],
      reconcile: 'CREATED_AND_VERIFIED', differences: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('oculto en estados no finales', () => {
    const { container } = render(<ProfitRegistrationPanel request={{ ...REQ, status: 'BORRADOR' } as Request} />);
    expect(container.textContent).toBe('');
  });

  it('dry-run muestra candidato y permite registrar con confirmación', async () => {
    const onChanged = vi.fn();
    render(<ProfitRegistrationPanel request={REQ} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /dry-run/i }));
    await waitFor(() => expect(screen.getByText('ACTEQT0001')).toBeDefined());
    expect(screen.getByText('DISPONIBLE')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar en Profit' }));
    await screen.findByText('Registrar artículo en Profit');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }));
    await waitFor(() => expect(apiProfitRegistrationService.create).toHaveBeenCalledWith('r1'));
    await screen.findByText('Creado y verificado');
    expect(onChanged).toHaveBeenCalled();
  });

  it('verificación posterior muestra reconciliación', async () => {
    (apiProfitRegistrationService.verify as any).mockResolvedValue({
      requestId: 'r1', coArt: 'ACTEQT0001', reconcile: 'NOT_FOUND', differences: [],
    });
    render(<ProfitRegistrationPanel request={REQ} />);
    fireEvent.change(screen.getByPlaceholderText('co_art a verificar...'), { target: { value: 'ACTEQT0001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    await waitFor(() => expect(apiProfitRegistrationService.verify).toHaveBeenCalledWith('r1', 'ACTEQT0001'));
    await screen.findByText('No encontrado');
  });
});
