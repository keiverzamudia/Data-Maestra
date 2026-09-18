// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuditoriaHistorica } from './AuditoriaHistorica';
import { apiDuplicatesService } from '../../servicios/api/api-duplicates-service';

vi.mock('../../servicios/api/api-duplicates-service', () => ({
  apiDuplicatesService: { resumen: vi.fn(), relaciones: vi.fn(), grupos: vi.fn(), articulo: vi.fn() },
}));

const resumenMock = apiDuplicatesService.resumen as any;
const relacionesMock = apiDuplicatesService.relaciones as any;

const RESUMEN = {
  historicalArticles: 10,
  analyzed: 8,
  insufficient: 2,
  relations: 3,
  groups: 1,
  withConflicts: 1,
  withoutConflicts: 2,
  byClassification: [{ classification: 'HIGH', count: 2 }, { classification: 'REVIEW', count: 1 }],
};

const REL = {
  id: 'r1',
  pairKey: 'AD_DIST:B1|AD_TRANS:A1',
  companyACode: 'AD_DIST',
  profitACode: 'B1',
  companyBCode: 'AD_TRANS',
  profitBCode: 'A1',
  score: 87,
  classification: 'HIGH',
  evidencesJson: JSON.stringify(['MODEL_MATCH', 'DESCRIPTION_SIMILARITY']),
  conflictsJson: '[]',
  explanation: 'Se muestra porque el modelo coincide.',
  engineVersion: 'v1',
  coverageA: 'RICA',
  coverageB: 'RICA',
  status: 'PENDIENTE_REVISION',
};

describe('AuditoriaHistorica', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resumenMock.mockResolvedValue(structuredClone(RESUMEN));
    relacionesMock.mockResolvedValue({ items: [], total: 0, page: 1, limit: 25 });
  });
  afterEach(() => cleanup());

  function renderPage() {
    return render(<MemoryRouter><AuditoriaHistorica /></MemoryRouter>);
  }

  it('carga resumen con datos reales (sin % seguro)', async () => {
    renderPage();
    expect(await screen.findByText('Auditoría histórica')).toBeTruthy();
    expect(await screen.findByText('10')).toBeTruthy();
    expect(screen.queryByText(/85% seguro/)).toBeNull();
    expect(screen.queryByText(/duplicados confirmados/)).toBeNull();
  });

  it('tabla paginada con columnas y filtros', async () => {
    relacionesMock.mockResolvedValue({ items: [REL], total: 1, page: 1, limit: 25 });
    renderPage();
    expect(await screen.findByText('AD_DIST:B1')).toBeTruthy();
    expect(screen.getByText('AD_TRANS:A1')).toBeTruthy();
    expect(screen.getAllByText('Coincidencia alta').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('87')).toBeTruthy();
    expect(screen.getAllByText('Sin conflictos').length).toBeGreaterThanOrEqual(1);
    fireEvent.change(screen.getByLabelText('Filtrar por clasificación'), { target: { value: 'HIGH' } });
    expect(await screen.findByText('AD_DIST:B1')).toBeTruthy();
    const last = relacionesMock.mock.calls[relacionesMock.mock.calls.length - 1][0];
    expect(last.classification).toBe('HIGH');
  });

  it('detalle muestra evidencias, conflictos, coverage y versión sin botones de decisión', async () => {
    relacionesMock.mockResolvedValue({ items: [{ ...REL, conflictsJson: JSON.stringify(['BRAND_CONFLICT']) }], total: 1, page: 1, limit: 25 });
    renderPage();
    fireEvent.click(await screen.findByText('AD_DIST:B1'));
    expect(await screen.findByText('Detalle de posible duplicado')).toBeTruthy();
    expect(screen.getAllByText(/Modelo coincidente/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Conflicto de marca/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Score de coincidencia/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Versión del motor: v1/)).toBeTruthy();
    expect(screen.queryByText('Es el mismo artículo')).toBeNull();
    expect(screen.queryByText('Es diferente')).toBeNull();
    expect(screen.queryByText('Unificar')).toBeNull();
    expect(screen.queryByText('Eliminar')).toBeNull();
  });

  it('estado vacío y manejo de error en español', async () => {
    renderPage();
    expect(await screen.findByText('Sin relaciones')).toBeTruthy();
    relacionesMock.mockRejectedValueOnce(new Error('TypeError: x is not a function'));
    render(<MemoryRouter><AuditoriaHistorica /></MemoryRouter>);
    expect(await screen.findByText('No pudimos cargar las relaciones.')).toBeTruthy();
    expect(screen.queryByText(/TypeError/)).toBeNull();
    expect(screen.queryByText(/500/)).toBeNull();
  });

  it('multi-compañía visible en filas y detalle', async () => {
    relacionesMock.mockResolvedValue({ items: [REL], total: 1, page: 1, limit: 25 });
    renderPage();
    await screen.findByText('AD_DIST:B1');
    fireEvent.click(screen.getByText('AD_DIST:B1'));
    expect(await screen.findByText('Detalle de posible duplicado')).toBeTruthy();
    expect(screen.getAllByText('AD_DIST:B1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('AD_TRANS:A1').length).toBeGreaterThanOrEqual(1);
  });
});
