// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomologacionCorporativa } from './HomologacionCorporativa';
import { apiCorporateService } from '../../servicios/api/api-corporate-service';

vi.mock('../../servicios/api/api-corporate-service', () => ({
  apiCorporateService: { companies: vi.fn(), compare: vi.fn(), preflight: vi.fn(), homologate: vi.fn() },
  CORPORATE_STATE_LABELS: { IGUAL: 'Igual', FALTA_EN_DESTINO: 'Nuevo en destino', DESCRIPCION_DIFERENTE: 'Descripción por actualizar', DATOS_DIFERENTES: 'Requiere revisión', NO_COMPATIBLE: 'Bloqueado', ERROR: 'Error' },
  CORPORATE_OP_LABELS: { NO_ACTION: 'Sin acción', INSERT: 'Crear', UPDATE_DESCRIPTION: 'Actualizar descripción', BLOCKED: 'Bloqueado' },
}));
vi.mock('../../contextos/SessionContext', () => ({
  useSession: () => ({ hasPermission: (p: string) => p === 'PROFIT.WRITE' }),
}));

const companiesMock = apiCorporateService.companies as any;
const compareMock = apiCorporateService.compare as any;

const COMPANIES = [
  { code: 'AD_TRANS', name: 'TRANSPORTE', rif: 'J1', isStandard: true },
  { code: 'AD_DIST', name: 'DISTRIBUIDORA', rif: 'J2', isStandard: false },
  { code: 'AD_SLS', name: 'SUMINISTROS', rif: 'J3', isStandard: false },
];

const COMPARE: any = {
  standard: 'AD_TRANS',
  executable: true,
  companies: [
    {
      company: 'AD_DIST',
      isStandard: false,
      summary: { iguales: 10, faltantes: 1, descripcionesDiferentes: 1, bloqueados: 0, errores: 0, total: 12 },
      items: [
        { catalog: 'Líneas', code: 'FER', standardValue: 'Ferretería', destValue: null, state: 'FALTA_EN_DESTINO', operation: 'INSERT', reason: '', safe: true },
        { catalog: 'Líneas', code: 'SOF', standardValue: 'Software', destValue: 'SOFTWARE', state: 'DESCRIPCION_DIFERENTE', operation: 'UPDATE_DESCRIPTION', reason: '', safe: true },
      ],
    },
  ],
};

describe('HomologacionCorporativa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    companiesMock.mockResolvedValue(structuredClone(COMPANIES));
    compareMock.mockResolvedValue(structuredClone(COMPARE));
  });
  afterEach(() => cleanup());

  it('muestra estándar y destinos dinámicos (sin hardcodear)', async () => {
    render(<MemoryRouter><HomologacionCorporativa /></MemoryRouter>);
    expect(await screen.findByText(/Empresa estándar: AD_TRANS/)).toBeTruthy();
    expect(screen.getByText('AD_DIST')).toBeTruthy();
    expect(screen.getByText('AD_SLS')).toBeTruthy();
    expect(screen.queryByText('AD_LSLS')).toBeNull();
  });

  it('comparar muestra resumen empresarial y detalle', async () => {
    render(<MemoryRouter><HomologacionCorporativa /></MemoryRouter>);
    await screen.findByText('AD_DIST');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Destino AD_DIST' }));
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(await screen.findByText(/Elementos nuevos: 1/)).toBeTruthy();
    expect(screen.getByText(/Listo para sincronizar/)).toBeTruthy();
    expect(screen.getByText('FER')).toBeTruthy();
    expect(screen.getByText('Crear')).toBeTruthy();
  });
});
