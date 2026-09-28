// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomologacionCorporativa } from './HomologacionCorporativa';
import { apiCorporateService } from '../../servicios/api/api-corporate-service';
import { apiMultiCompanyService } from '../../servicios/api/api-multiempresa-service';

vi.mock('../../servicios/api/api-corporate-service', () => ({
  apiCorporateService: { companies: vi.fn(), compare: vi.fn(), preflight: vi.fn(), homologate: vi.fn() },
  CORPORATE_STATE_LABELS: { IGUAL: 'Igual', FALTA_EN_DESTINO: 'Nuevo en destino', DESCRIPCION_DIFERENTE: 'Descripción por actualizar', DATOS_DIFERENTES: 'Requiere revisión', NO_COMPATIBLE: 'Bloqueado', EQUIVALENTE: 'Equivalente en destino', ERROR: 'Error' },
  CORPORATE_OP_LABELS: { NO_ACTION: 'Sin acción', INSERT: 'Crear', UPDATE_DESCRIPTION: 'Actualizar descripción', BLOCKED: 'Bloqueado' },
}));
vi.mock('../../servicios/api/api-multiempresa-service', () => ({
  apiMultiCompanyService: { companies: vi.fn(), saveConfig: vi.fn(), setStandard: vi.fn() },
}));
vi.mock('../../contextos/SessionContext', () => ({
  useSession: () => ({ hasPermission: (p: string) => p === 'PROFIT.WRITE' }),
}));

const companiesMock = apiCorporateService.companies as any;
const compareMock = apiCorporateService.compare as any;
const homologateMock = apiCorporateService.homologate as any;
const saveConfigMock = apiMultiCompanyService.saveConfig as any;

const COMPANIES = [
  { code: 'AD_TRANS', name: 'TRANSPORTE', rif: 'J1', isStandard: true, enabled: true, allowDescSync: false },
  { code: 'AD_DIST', name: 'DISTRIBUIDORA', rif: 'J2', isStandard: false, enabled: true, allowDescSync: false },
  { code: 'AD_SLS', name: 'SUMINISTROS', rif: 'J3', isStandard: false, enabled: true, allowDescSync: false },
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

/**
 * FASE 26.4 — dos sublíneas con el MISMO código bajo líneas distintas.
 * Sin el padre en la identidad serían una sola casilla y una sola clave React.
 */
const COMPARE_SUB: any = {
  standard: 'AD_TRANS',
  executable: true,
  companies: [
    {
      company: 'AD_DIST',
      isStandard: false,
      summary: { iguales: 0, faltantes: 2, descripcionesDiferentes: 0, bloqueados: 0, errores: 0, total: 2 },
      items: [
        { catalog: 'Sublíneas', code: 'MIS', parent: 'FER', standardValue: 'Misceláneo', destValue: null, state: 'FALTA_EN_DESTINO', operation: 'INSERT', reason: '', safe: true },
        { catalog: 'Sublíneas', code: 'MIS', parent: 'OTRA', standardValue: 'Otros MISC', destValue: null, state: 'FALTA_EN_DESTINO', operation: 'INSERT', reason: '', safe: true },
      ],
    },
  ],
};

/**
 * FASE 26.4 — plan con bloqueos reales: `executable: false` en el plan
 * completo NO debe dejar el botón Homologar muerto (ese era el bug).
 */
const COMPARE_BLOQUEADO: any = {
  standard: 'AD_TRANS',
  executable: false,
  companies: [
    {
      company: 'AD_DIST',
      isStandard: false,
      summary: { iguales: 0, faltantes: 1, descripcionesDiferentes: 0, bloqueados: 2, errores: 0, total: 3 },
      items: [
        { catalog: 'Líneas', code: 'FER', standardValue: 'Ferretería', destValue: null, state: 'FALTA_EN_DESTINO', operation: 'INSERT', reason: '', safe: true },
        { catalog: 'Líneas', code: 'VEH', standardValue: 'VEHICULOS', destValue: 'VEHICULO', state: 'DESCRIPCION_DIFERENTE', operation: 'BLOCKED', reason: '', safe: false },
        { catalog: 'Sublíneas', code: 'MIS', parent: '', standardValue: 'Misceláneo', destValue: null, state: 'DATOS_DIFERENTES', operation: 'BLOCKED', reason: '', safe: false },
      ],
    },
  ],
};

describe('HomologacionCorporativa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    companiesMock.mockResolvedValue(structuredClone(COMPANIES));
    compareMock.mockResolvedValue(structuredClone(COMPARE));
    homologateMock.mockResolvedValue({ ok: true, inserts: 1, updates: 0, companies: ['AD_DIST'] });
  });
  afterEach(() => cleanup());

  const seleccionarDestino = async () => {
    render(<MemoryRouter><HomologacionCorporativa /></MemoryRouter>);
    await screen.findByText('AD_DIST');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Destino AD_DIST' }));
  };

  it('muestra estándar y destinos dinámicos (sin hardcodear)', async () => {
    render(<MemoryRouter><HomologacionCorporativa /></MemoryRouter>);
    expect(await screen.findByText(/Empresa estándar: AD_TRANS/)).toBeTruthy();
    expect(screen.getByText('AD_DIST')).toBeTruthy();
    expect(screen.getByText('AD_SLS')).toBeTruthy();
    expect(screen.queryByText('AD_LSLS')).toBeNull();
  });

  it('el interruptor FASE 26.2 aplica la autorización a las seleccionadas', async () => {
    companiesMock.mockResolvedValue(structuredClone(COMPANIES));
    saveConfigMock.mockResolvedValue({});
    render(<MemoryRouter><HomologacionCorporativa /></MemoryRouter>);
    await screen.findByText('AD_DIST');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Destino AD_DIST' }));
    fireEvent.click(screen.getByLabelText('Las descripciones de AD_TRANS mandan en las empresas seleccionadas'));
    await waitFor(() => expect(saveConfigMock).toHaveBeenCalledWith('AD_DIST', true, true));
    expect(await screen.findByText(/Autorizado: las descripciones de AD_TRANS mandan/)).toBeTruthy();
  });

  it('el interruptor FASE 26.2 queda deshabilitado sin empresas seleccionadas', async () => {
    companiesMock.mockResolvedValue(structuredClone(COMPANIES));
    render(<MemoryRouter><HomologacionCorporativa /></MemoryRouter>);
    await screen.findByText('AD_DIST');
    expect(screen.getByLabelText('Las descripciones de AD_TRANS mandan en las empresas seleccionadas')).toHaveProperty('disabled', true);
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

  // ------------------------------------------------ FASE 26.3 — catálogos
  it('FASE 26.3: elegir un catálogo limita la comparación a ese catálogo', async () => {
    compareMock.mockResolvedValue(structuredClone(COMPARE_SUB));
    await seleccionarDestino();
    fireEvent.click(screen.getByLabelText('Catálogo Sublíneas'));
    expect(screen.getByText('1 catálogo(s) seleccionado(s).')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(await screen.findByText(/Elementos nuevos: 2/)).toBeTruthy();
    expect(compareMock).toHaveBeenCalledWith(['AD_DIST'], ['sub_lin']);
  });

  it('FASE 26.3: sin catálogos elegidos se comparan todos', async () => {
    await seleccionarDestino();
    expect(screen.getByText('Sin filtro: se comparan y migran todos los catálogos.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    await screen.findByText(/Elementos nuevos: 1/);
    expect(compareMock).toHaveBeenCalledWith(['AD_DIST'], []);
  });

  // --------------------------------------- FASE 26.4 — selección con padre
  it('FASE 26.4: dos sublíneas con el mismo código tienen casilla y fila propias', async () => {
    compareMock.mockResolvedValue(structuredClone(COMPARE_SUB));
    await seleccionarDestino();
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    await screen.findByText(/Listo para sincronizar/);

    // La línea padre es lo que distingue una fila de la otra.
    const ferBox = screen.getByRole('checkbox', { name: 'Migrar Sublíneas FER/MIS' });
    const otraBox = screen.getByRole('checkbox', { name: 'Migrar Sublíneas OTRA/MIS' });
    expect(ferBox).not.toBe(otraBox);
    expect(screen.getByText('FER')).toBeTruthy();
    expect(screen.getByText('OTRA')).toBeTruthy();

    // Lo no bloqueado queda preseleccionado (comportamiento previo).
    expect(screen.getByText(/2 de 2 filas tildadas/)).toBeTruthy();
    fireEvent.click(ferBox);
    expect(screen.getByText(/1 de 2 filas tildadas/)).toBeTruthy();
  });

  it('FASE 26.4: homologar envía SOLO lo tildado, identificado por su padre', async () => {
    compareMock.mockResolvedValue(structuredClone(COMPARE_SUB));
    await seleccionarDestino();
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    await screen.findByText(/Listo para sincronizar/);

    // Quito FER: queda tildada solo la que cuelga de OTRA.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Migrar Sublíneas FER/MIS' }));
    expect(screen.getByText(/1 de 2 filas tildadas/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Homologar' }));
    const dialog = await screen.findByRole('alertdialog');
    // El diálogo de confirmación dice exactamente cuántas filas se van a aprobar.
    expect(within(dialog).getByText(/1 fila\(s\) seleccionada\(s\)/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Homologar' }));

    await waitFor(() => expect(homologateMock).toHaveBeenCalledTimes(1));
    expect(homologateMock.mock.calls[0][0]).toEqual(['AD_DIST']);
    expect(homologateMock.mock.calls[0][1].items).toEqual([
      { company: 'AD_DIST', catalog: 'Sublíneas', code: 'MIS', parent: 'OTRA' },
    ]);
  });

  // ---------------------------------- FASE 26.4 — el gate usa la selección
  it('FASE 26.4: con bloqueos en el plan el botón sigue habilitado', async () => {
    compareMock.mockResolvedValue(structuredClone(COMPARE_BLOQUEADO));
    await seleccionarDestino();
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    await screen.findByText(/requieren revisión/);

    // Solo lo no bloqueado se preselecciona…
    expect(screen.getByText(/1 de 3 filas tildadas/)).toBeTruthy();
    // …y el botón se habilita con la SELECCIÓN, no con el plan completo.
    expect(screen.getByRole('button', { name: 'Homologar' })).toHaveProperty('disabled', false);

    // Un BLOQUEADO por descripción tildado se aprueba → sigue ejecutable.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Migrar Líneas VEH' }));
    expect(screen.getByText(/2 de 3 filas tildadas/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Homologar' })).toHaveProperty('disabled', false);

    // Un DATOS_DIFERENTES NO se puede aprobar → el botón se apaga.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Migrar Sublíneas MIS' }));
    expect(screen.getByText(/3 de 3 filas tildadas/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Homologar' })).toHaveProperty('disabled', true);
  });
});
