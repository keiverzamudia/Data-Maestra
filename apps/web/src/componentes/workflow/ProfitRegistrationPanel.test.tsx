// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
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
    CREATED_WITH_DIFFERENCES: { text: 'Creado con diferencias', tone: 'yellow' },
    NOT_FOUND: { text: 'No encontrado', tone: 'red' },
    RECONCILIATION_ERROR: { text: 'Error de reconciliación', tone: 'red' },
  },
  profitErrorLabel: (c?: string) => c ?? 'Error desconocido',
  profitErrorAction: (c?: string) => (c ? `Acción para ${c}` : null),
  profitOpState: (a: any) => {
    if (a.writeBlocked) return 'DISABLED';
    if (a.busy === 'plan' || a.busy === 'retry') return 'VALIDATING';
    if (a.busy === 'create') return 'WRITING';
    if (a.busy === 'verify') return 'VERIFYING';
    if (a.result) {
      if (a.result.ok && a.result.reconcile === 'CREATED_AND_VERIFIED') return 'SUCCESS';
      if (!a.result.ok && a.result.errorCode === 'ERROR_PROFIT_AMBIGUOUS') return 'UNKNOWN';
      if (!a.result.ok) return 'FAILED';
    }
    if (a.requestStatus === 'ERROR_PROFIT') return 'RETRY_REQUIRED';
    if (a.plan && a.plan.available) return 'READY_TO_WRITE';
    return 'READY';
  },
}));

vi.mock('../../contextos/SessionContext', () => ({
  useSession: vi.fn(),
}));

vi.mock('../../hooks/useCatalogos', () => ({
  useCatalogos: () => ({ grupos: [], subgrupos: [], categorias: [], marcas: [], unidades: [] }),
}));

import { useSession } from '../../contextos/SessionContext';

import { apiProfitRegistrationService, profitOpState } from '../../servicios/api/api-profit-registration-service';

const REQ = {
  id: 'r1', requestNumber: 55, companyId: 'c1', departmentId: 'd1', requesterId: 'u1',
  requestedDescription: 'TORNILLO', purpose: 'x', status: 'CONTABILIDAD_APROBADA', priority: 0,
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
    (useSession as any).mockReturnValue({ hasPermission: (p: string) => p === 'PROFIT.WRITE', user: { displayName: 'Op' }, roleCodes: ['WAREHOUSE'] });
    (apiProfitRegistrationService.writeStatus as any).mockResolvedValue({ enabled: true, configured: true });
    (apiProfitRegistrationService.attempts as any).mockResolvedValue({ requestId: 'r1', attempts: [], verifications: [] });
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
    const { container } = render(<MemoryRouter><ProfitRegistrationPanel request={{ ...REQ, status: 'BORRADOR' } as Request} /></MemoryRouter>);
    expect(container.textContent).toBe('');
  });

  it('dry-run muestra candidato y permite registrar con confirmación', async () => {
    const onChanged = vi.fn();
    render(<MemoryRouter><ProfitRegistrationPanel request={REQ} onChanged={onChanged} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar registro' }));
    await waitFor(() => expect(screen.getAllByText('ACTEQT0001').length).toBeGreaterThan(0));
    expect(screen.getByText('✓ LISTO PARA REGISTRAR EN PROFIT')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar en Profit' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('creará el artículo en Profit');
    fireEvent.change(within(dialog).getByPlaceholderText('REGISTRAR EN PROFIT'), { target: { value: 'REGISTRAR EN PROFIT' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar registro' }));
    await waitFor(() => expect(apiProfitRegistrationService.create).toHaveBeenCalledWith('r1'));
    await screen.findByText('Creado y verificado');
    expect(onChanged).toHaveBeenCalled();
  });

  it('verificación posterior muestra reconciliación', async () => {
    (apiProfitRegistrationService.verify as any).mockResolvedValue({
      requestId: 'r1', coArt: 'ACTEQT0001', reconcile: 'NOT_FOUND', differences: [],
    });
    render(<MemoryRouter><ProfitRegistrationPanel request={REQ} /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Código Profit a verificar...'), { target: { value: 'ACTEQT0001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar en Profit' }));
    await waitFor(() => expect(apiProfitRegistrationService.verify).toHaveBeenCalledWith('r1', 'ACTEQT0001'));
    await screen.findByText('No encontrado');
  });

  it('con escritura deshabilitada muestra aviso y bloquea el botón', async () => {
    (apiProfitRegistrationService.writeStatus as any).mockResolvedValue({ enabled: false, configured: false, auth: 'sql', connected: false });
    render(<MemoryRouter><ProfitRegistrationPanel request={REQ} /></MemoryRouter>);
    await screen.findByText(/Registro en Profit no disponible/);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar registro' }));
    await waitFor(() => expect(screen.getAllByText('ACTEQT0001').length).toBeGreaterThan(0));
    const btn = screen.getByRole('button', { name: 'Registrar en Profit' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('READY muestra checklist sin verde y éxito real con correlation', async () => {
    (apiProfitRegistrationService.writeStatus as any).mockResolvedValue({
      enabled: true, configured: true, auth: 'windows', connected: true,
      server: 'SRVBDPROFITBK', database: 'AD_TRANS', identity: 'CORPOAGROCA\\x',
    });
    (apiProfitRegistrationService.create as any).mockResolvedValue({
      requestId: 'r1', correlationId: 'DM-PROFIT-20260913-000055', ok: true, coArt: 'ACTEQT0001',
      attempts: [{ attempt: 1, candidate: 'ACTEQT0001', existedBefore: false, outcome: 'INSERTED' }],
      reconcile: 'CREATED_AND_VERIFIED', differences: [],
    });
    render(<MemoryRouter><ProfitRegistrationPanel request={REQ} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar registro' }));
    await waitFor(() => expect(screen.getByText('✓ LISTO PARA REGISTRAR EN PROFIT')).toBeDefined());
    expect(screen.queryByText('Dry-run READY')).toBeNull();
    expect(screen.queryByText(/Servidor|autenticación|Dry-run/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar en Profit' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByPlaceholderText('REGISTRAR EN PROFIT'), { target: { value: 'REGISTRAR EN PROFIT' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar registro' }));
    await screen.findByText('✓ Registrado en Profit');
    expect(screen.queryByText('DM-PROFIT-20260913-000055')).toBeNull();
  });

  it('error muestra motivo y acción recomendada', async () => {
    (apiProfitRegistrationService.create as any).mockResolvedValue({
      requestId: 'r1', ok: false, coArt: 'ACTEQT0001', attempts: [],
      reconcile: 'RECONCILIATION_ERROR', differences: [],
      errorCode: 'ERROR_PROFIT_FK_VIOLATION', errorDetail: 'FK_art_unidades',
    });
    render(<MemoryRouter><ProfitRegistrationPanel request={REQ} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar registro' }));
    await waitFor(() => expect(screen.getAllByText('ACTEQT0001').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar en Profit' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByPlaceholderText('REGISTRAR EN PROFIT'), { target: { value: 'REGISTRAR EN PROFIT' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar registro' }));
    await screen.findByText('No fue posible registrar el artículo en Profit.');
    expect(screen.getByText(/Acción recomendada/)).toBeDefined();
  });

  it('incierto muestra resultado pendiente sin re-registro', async () => {
    (apiProfitRegistrationService.create as any).mockResolvedValue({
      requestId: 'r1', ok: false, coArt: 'ACTEQT0001', attempts: [],
      reconcile: 'NOT_FOUND', differences: [], errorCode: 'ERROR_PROFIT_AMBIGUOUS',
    });
    render(<MemoryRouter><ProfitRegistrationPanel request={REQ} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar registro' }));
    await waitFor(() => expect(screen.getAllByText('ACTEQT0001').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar en Profit' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByPlaceholderText('REGISTRAR EN PROFIT'), { target: { value: 'REGISTRAR EN PROFIT' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar registro' }));
    await screen.findByText('No se pudo confirmar el resultado del registro.');
  });

  it('confirmación exige texto exacto', async () => {
    render(<MemoryRouter><ProfitRegistrationPanel request={REQ} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar registro' }));
    await waitFor(() => expect(screen.getAllByText('ACTEQT0001').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar en Profit' }));
    const dialog = await screen.findByRole('alertdialog');
    expect((within(dialog).getByRole('button', { name: 'Confirmar registro' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByPlaceholderText('REGISTRAR EN PROFIT'), { target: { value: 'REGISTRAR' } });
    expect((within(dialog).getByRole('button', { name: 'Confirmar registro' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByPlaceholderText('REGISTRAR EN PROFIT'), { target: { value: 'REGISTRAR EN PROFIT' } });
    expect((within(dialog).getByRole('button', { name: 'Confirmar registro' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('historial muestra intentos previos sin reescribir', async () => {
    (apiProfitRegistrationService.attempts as any).mockResolvedValue({
      requestId: 'r1',
      attempts: [{
        attempt: 1, correlationId: 'DM-PROFIT-20260913-000055', createdAt: '2026-09-13T10:00:00.000Z',
        actorId: 'u1', masterCode: 'M', coArt: 'ACTEQT0001', result: 'FAILED',
        reconcile: 'RECONCILIATION_ERROR', errorCode: 'E1', durationMs: 5, collisions: [],
      }],
      verifications: [],
    });
    render(<MemoryRouter><ProfitRegistrationPanel request={REQ} /></MemoryRouter>);
    await screen.findByText('Intento #1 — NO REGISTRADO');
    expect(screen.queryByText('DM-PROFIT-20260913-000055')).toBeNull();
  });

  it('retry en ERROR_PROFIT revalida sin escribir', async () => {
    (apiProfitRegistrationService.retry as any).mockResolvedValue({
      requestId: 'r1', correlationId: 'C2', ready: true, candidate: 'ACTEQT0002',
      available: true, payload: {}, warnings: [],
    });
    const onChanged = vi.fn();
    render(<MemoryRouter><ProfitRegistrationPanel request={{ ...REQ, status: 'ERROR_PROFIT' } as Request} onChanged={onChanged} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar registro en Profit' }));
    await waitFor(() => expect(apiProfitRegistrationService.retry).toHaveBeenCalledWith('r1'));
    await screen.findByText(/Recuperación lista/);
    expect(onChanged).toHaveBeenCalled();
  });
});

describe('profitOpState', () => {
  const base = { plan: null, result: null, requestStatus: 'CONTABILIDAD_APROBADA' } as const;
  it('mapea estados operativos', () => {
    expect(profitOpState({ ...base, writeBlocked: true, busy: null })).toBe('DISABLED');
    expect(profitOpState({ ...base, writeBlocked: false, busy: 'plan' })).toBe('VALIDATING');
    expect(profitOpState({ ...base, writeBlocked: false, busy: 'create' })).toBe('WRITING');
    expect(profitOpState({ ...base, writeBlocked: false, busy: 'verify' })).toBe('VERIFYING');
    expect(profitOpState({ ...base, writeBlocked: false, busy: null })).toBe('READY');
    expect(profitOpState({
      ...base, writeBlocked: false, busy: null,
      plan: { candidate: 'X', available: true } as any,
    })).toBe('READY_TO_WRITE');
    expect(profitOpState({
      ...base, writeBlocked: false, busy: null,
      result: { ok: true, reconcile: 'CREATED_AND_VERIFIED' } as any,
    })).toBe('SUCCESS');
    expect(profitOpState({
      ...base, writeBlocked: false, busy: null,
      result: { ok: false, reconcile: 'NOT_FOUND', errorCode: 'ERROR_PROFIT_AMBIGUOUS' } as any,
    })).toBe('UNKNOWN');
    expect(profitOpState({
      ...base, writeBlocked: false, busy: null,
      result: { ok: false, reconcile: 'NOT_FOUND', errorCode: 'E' } as any,
    })).toBe('FAILED');
    expect(profitOpState({ ...base, writeBlocked: false, busy: null, requestStatus: 'ERROR_PROFIT' })).toBe('RETRY_REQUIRED');
  });
});

describe('ProfitRegistrationPanel estados 14L', () => {
  beforeEach(() => {
    (useSession as any).mockReturnValue({ hasPermission: (p: string) => p === 'PROFIT.WRITE', user: { displayName: 'Op' }, roleCodes: ['WAREHOUSE'] });
    (apiProfitRegistrationService.writeStatus as any).mockResolvedValue({ enabled: false, configured: true, auth: 'windows', connected: true, server: 'S', database: 'D' });
    (apiProfitRegistrationService.attempts as any).mockResolvedValue({ requestId: 'r1', attempts: [], verifications: [] });
  });
  afterEach(() => cleanup());

  it('registro deshabilitado muestra aviso corporativo sin tecnicismos', async () => {
    render(<MemoryRouter><ProfitRegistrationPanel request={REQ} /></MemoryRouter>);
    await screen.findByText(/Registro en Profit no disponible/);
    expect(screen.getByText(/temporalmente deshabilitado/)).toBeDefined();
    expect(screen.queryByText(/PROFIT.WRITE/)).toBeNull();
    expect(screen.queryByText(/Dry-run/)).toBeNull();
  });

  it('SIN PERMISO muestra mensaje corporativo sin detalle técnico', async () => {
    (useSession as any).mockReturnValue({ hasPermission: () => false, user: { displayName: 'Sin Perm' }, roleCodes: ['REQUESTER'] });
    (apiProfitRegistrationService.writeStatus as any).mockResolvedValue({ enabled: true, configured: true, auth: 'sql', connected: true });
    render(<MemoryRouter><ProfitRegistrationPanel request={REQ} /></MemoryRouter>);
    await screen.findByText(/Registro no disponible/);
    await screen.findByText(/no tiene autorización/);
    expect(screen.queryByText(/PROFIT.WRITE/)).toBeNull();
    expect(screen.queryByText(/DENEGADO/)).toBeNull();
  });

  it('oculto antes de la aprobación contable', () => {
    const { container } = render(<MemoryRouter><ProfitRegistrationPanel request={{ ...REQ, status: 'PENDIENTE_CONTABILIDAD' } as Request} /></MemoryRouter>);
    expect(container.textContent).toBe('');
  });
});
