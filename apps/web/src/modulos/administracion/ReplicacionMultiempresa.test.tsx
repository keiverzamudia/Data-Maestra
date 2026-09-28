// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReplicacionMultiempresa } from './ReplicacionMultiempresa';
import { apiCorporateService } from '../../servicios/api/api-corporate-service';
import { apiMultiCompanyService } from '../../servicios/api/api-multiempresa-service';

vi.mock('../../servicios/api/api-corporate-service', () => ({
  apiCorporateService: {
    companies: vi.fn(),
    compare: vi.fn(),
    preflight: vi.fn(),
    homologate: vi.fn(),
    equivalences: vi.fn(),
    suggestEquivalences: vi.fn(),
    saveEquivalence: vi.fn(),
    deactivateEquivalence: vi.fn(),
    syncState: vi.fn(),
  },
  CORPORATE_STATE_LABELS: { IGUAL: 'Igual', FALTA_EN_DESTINO: 'Nuevo en destino', DESCRIPCION_DIFERENTE: 'Descripción por actualizar', DATOS_DIFERENTES: 'Requiere revisión', NO_COMPATIBLE: 'Bloqueado', EQUIVALENTE: 'Equivalente en destino', ERROR: 'Error' },
  CORPORATE_OP_LABELS: { NO_ACTION: 'Sin acción', INSERT: 'Crear', UPDATE_DESCRIPTION: 'Actualizar descripción', BLOCKED: 'Bloqueado' },
}));
vi.mock('../../servicios/api/api-multiempresa-service', () => ({
  apiMultiCompanyService: { companies: vi.fn(), saveConfig: vi.fn(), setStandard: vi.fn() },
}));
vi.mock('../../contextos/SessionContext', () => ({
  useSession: () => ({ hasPermission: (p: string) => p === 'ADMIN.MANAGE' || p === 'PROFIT.WRITE' }),
}));

const corp = apiCorporateService as any;
const multi = apiMultiCompanyService as any;

const COMPANIES = [
  { code: 'AD_TRANS', name: 'TRANSPORTE', rif: 'J1', isStandard: true, enabled: true, allowDescSync: false },
  { code: 'AD_DIST', name: 'DISTRIBUIDORA', rif: 'J2', isStandard: false, enabled: true, allowDescSync: false },
];

describe('ReplicacionMultiempresa (FASE 26)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    corp.companies.mockResolvedValue(structuredClone(COMPANIES));
    corp.equivalences.mockResolvedValue([]);
    corp.syncState.mockResolvedValue([
      { company: 'AD_DIST', catalog: 'lin_art', catalogLabel: 'Líneas', lastSyncAt: '2026-09-25T15:00:00.000Z', lastRunId: 'DM-CORP-1', summary: { inserts: 3, updates: 0 } },
    ]);
    multi.companies.mockResolvedValue([{ code: 'AD_TRANS', name: 'TRANSPORTE', isStandard: true, enabled: true }, { code: 'AD_DIST', name: 'DISTRIBUIDORA', isStandard: false, enabled: true }]);
  });
  afterEach(() => cleanup());

  it('arranca en la pestaña de replicar catálogos con selección de empresas', async () => {
    render(<MemoryRouter><ReplicacionMultiempresa /></MemoryRouter>);
    expect(await screen.findByText(/Empresa estándar: AD_TRANS/)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Destino AD_DIST' })).toBeTruthy();
  });

  it('la pestaña Equivalencias abre la administración de vínculos', async () => {
    render(<MemoryRouter><ReplicacionMultiempresa /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: 'Equivalencias' }));
    expect(await screen.findByText(/Equivalencias de catálogo/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar equivalencia' })).toBeTruthy();
  });

  it('la pestaña Empresas muestra la habilitación por empresa', async () => {
    render(<MemoryRouter><ReplicacionMultiempresa /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: 'Empresas' }));
    expect(await screen.findByText(/Empresas Profit/)).toBeTruthy();
    expect(screen.getByLabelText('Habilitar inserción en AD_DIST')).toBeTruthy();
  });

  it('la pestaña Estado muestra desde cuándo cada empresa está al día', async () => {
    render(<MemoryRouter><ReplicacionMultiempresa /></MemoryRouter>);
    fireEvent.click(screen.getByRole('tab', { name: 'Estado' }));
    expect(await screen.findByText('Líneas')).toBeTruthy();
    expect(screen.getByText('3 creados · 0 descripciones')).toBeTruthy();
  });
});
