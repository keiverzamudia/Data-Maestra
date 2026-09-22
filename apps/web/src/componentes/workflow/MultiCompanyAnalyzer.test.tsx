// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MultiCompanyAnalyzer } from './MultiCompanyAnalyzer';
import { apiMultiCompanyService } from '../../servicios/api/api-multiempresa-service';

vi.mock('../../servicios/api/api-multiempresa-service', () => ({
  apiMultiCompanyService: { analyze: vi.fn(), insert: vi.fn(), companies: vi.fn() },
}));
vi.mock('../../contextos/SessionContext', () => ({
  useSession: () => ({ hasPermission: () => true, loading: false, authenticated: true }),
}));

const analizarMock = apiMultiCompanyService.analyze as any;
const insertMock = apiMultiCompanyService.insert as any;

const REQ: any = { id: 'req-9', status: 'CONTABILIDAD_APROBADA', requestNumber: 'REQ-9', requestedDescription: 'TORNILLO' };

const mkCompany = (company: string, status: string, extra: any = {}) => ({
  company,
  name: company,
  isStandard: company === 'AD_TRANS',
  enabled: true,
  status,
  checks: [{ key: 'REQUIRED_CATALOGS', ok: status === 'COMPATIBLE', detail: status === 'COMPATIBLE' ? 'Dependencias presentes.' : 'Falta subgrupo.' }],
  blockingReasons: status === 'COMPATIBLE' ? [] : ['REQUIRED_CATALOGS: Falta subgrupo.'],
  warnings: [],
  codeStatus: 'LIBRE',
  candidate: 'FERMIS0666',
  ...extra,
});

const ANALYSIS: any = {
  requestId: 'req-9',
  coArt: 'FERMIS0666',
  description: 'TORNILLO',
  companies: [
    mkCompany('AD_TRANS', 'COMPATIBLE'),
    mkCompany('AD_LUBSL', 'INCOMPATIBLE'),
    mkCompany('AD_ROMA', 'COMPATIBLE_WITH_WARNING', { warnings: ['El código ya existe: no se insertará de nuevo.'], codeStatus: 'OCUPADO' }),
  ],
  compatibleCount: 2,
  incompatibleCount: 1,
  analyzedAt: '2026-09-21T00:00:00.000Z',
};

function renderAnalyzer() {
  return render(<MemoryRouter><MultiCompanyAnalyzer request={REQ} /></MemoryRouter>);
}

describe('MultiCompanyAnalyzer', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => cleanup());

  it('oculto fuera de la puerta a Profit', () => {
    render(<MemoryRouter><MultiCompanyAnalyzer request={{ ...REQ, status: 'PENDIENTE_ALMACEN' }} /></MemoryRouter>);
    expect(screen.queryByText('Analizador de inserción multiempresa')).toBeNull();
  });

  it('analiza y preselecciona solo compatibles habilitadas', async () => {
    analizarMock.mockResolvedValue(structuredClone(ANALYSIS));
    renderAnalyzer();
    fireEvent.click(screen.getByText('Analizar compatibilidad'));
    expect(await screen.findByText(/empresas compatibles/)).toBeTruthy();
    expect((screen.getByLabelText('Seleccionar AD_TRANS') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Seleccionar AD_ROMA') as HTMLInputElement).checked).toBe(true);
    const lub = screen.getByLabelText('AD_LUBSL bloqueada') as HTMLInputElement;
    expect(lub.disabled).toBe(true);
    expect(lub.checked).toBe(false);
  });

  it('incompatible muestra motivo y no se puede seleccionar', async () => {
    analizarMock.mockResolvedValue(structuredClone(ANALYSIS));
    renderAnalyzer();
    fireEvent.click(screen.getByText('Analizar compatibilidad'));
    await screen.findByText(/empresas compatibles/);
    expect(screen.getAllByText(/Falta subgrupo/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('No se realizará ningún INSERT en esta empresa.').length).toBeGreaterThanOrEqual(1);
  });

  it('detalle expandible por empresa', async () => {
    analizarMock.mockResolvedValue(structuredClone(ANALYSIS));
    renderAnalyzer();
    fireEvent.click(screen.getByText('Analizar compatibilidad'));
    await screen.findByText(/empresas compatibles/);
    fireEvent.click(screen.getAllByText('▸ Ver detalles')[0]!);
    expect(screen.getByText('REQUIRED_CATALOGS')).toBeTruthy();
  });

  it('deselección y confirmación con resumen', async () => {
    analizarMock.mockResolvedValue(structuredClone(ANALYSIS));
    insertMock.mockResolvedValue({
      requestId: 'req-9', coArt: 'FERMIS0666', ok: true,
      results: [
        { company: 'AD_TRANS', outcome: 'INSERTADO', coArt: 'FERMIS0666', detail: 'ok', differences: [] },
      ],
    });
    renderAnalyzer();
    fireEvent.click(screen.getByText('Analizar compatibilidad'));
    await screen.findByText(/empresas compatibles/);
    fireEvent.click(screen.getByLabelText('Seleccionar AD_ROMA'));
    fireEvent.click(screen.getByText('Continuar'));
    expect(screen.getAllByText(/AD_TRANS/).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByText('Insertar en 1 empresa(s)'));
    await waitFor(() => expect(insertMock).toHaveBeenCalledWith('req-9', ['AD_TRANS']));
    expect(await screen.findByText('✓ Insertado correctamente')).toBeTruthy();
  });

  it('resultado parcial no afirma éxito total', async () => {
    analizarMock.mockResolvedValue(structuredClone(ANALYSIS));
    insertMock.mockResolvedValue({
      requestId: 'req-9', coArt: 'FERMIS0666', ok: false, errorCode: 'PROFIT_MULTI_INSERT_PARTIAL',
      results: [
        { company: 'AD_TRANS', outcome: 'INSERTADO', coArt: 'FERMIS0666', detail: 'ok', differences: [] },
        { company: 'AD_ROMA', outcome: 'ERROR', coArt: 'FERMIS0666', detail: 'Error de conexión', differences: [] },
      ],
    });
    renderAnalyzer();
    fireEvent.click(screen.getByText('Analizar compatibilidad'));
    await screen.findByText(/empresas compatibles/);
    fireEvent.click(screen.getByText('Continuar'));
    fireEvent.click(screen.getByText(/Insertar en/));
    expect(await screen.findByText('Resultado parcial.')).toBeTruthy();
    expect(screen.getByText(/Error de conexión/)).toBeTruthy();
  });
});

