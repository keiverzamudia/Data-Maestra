// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within, act } from '@testing-library/react';
import { Analizador } from './Analizador';
import { apiMatchingService } from '../../servicios/api/api-matching-service';

vi.mock('../../servicios/api/api-matching-service', () => ({
  apiMatchingService: { analizar: vi.fn(), vincular: vi.fn() },
}));

const analizarMock = apiMatchingService.analizar as any;
const vincularMock = apiMatchingService.vincular as any;

const CAND = {
  article: { companyCode: 'AD_TRANS', profitArticleCode: 'FERMIS0662' },
  description: 'FILTRO DE ACEITE MOTOR CUMMINS',
  confidence: 0.87,
  classification: 'HIGH',
  evidence: ['BRAND_MATCH', 'MODEL_MATCH', 'DESCRIPTION_SIMILARITY'],
  conflicts: ['PART_NUMBER_CONFLICT'],
  score: 87,
  explanation: 'Se muestra porque la marca coincide.',
  engineVersion: 'v1',
};

const DRAFT = { description: 'Filtro de aceite' };
const OK = { input: {}, candidates: [CAND], insufficient: false, engineVersion: 'v1' };

function renderAnalyzer(props: Partial<React.ComponentProps<typeof Analizador>> = {}) {
  return render(
    <Analizador requestId="req-1" canDecide draft={DRAFT} manualRun={0} debounceMs={10} {...props} />,
  );
}

describe('Analizador', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vincularMock.mockResolvedValue({ id: 'link-1', decision: 'SAME' });
  });
  afterEach(() => cleanup());

  it('1: aparece como Analizador y no como Comprador Inteligente', async () => {
    analizarMock.mockResolvedValue(structuredClone(OK));
    renderAnalyzer();
    expect(await screen.findByText('Analizador')).toBeTruthy();
    expect(screen.queryByText('Comprador Inteligente')).toBeNull();
    expect(screen.queryByText('Comprador inteligente')).toBeNull();
    expect(await screen.findByText('FERMIS0662')).toBeTruthy();
  });

  it('3-5: ejecuta automáticamente con debounce ante cambios del borrador', async () => {
    analizarMock.mockResolvedValue({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    const { rerender } = renderAnalyzer();
    await waitFor(() => expect(analizarMock).toHaveBeenCalledTimes(1));
    expect(analizarMock).toHaveBeenCalledWith('req-1', { description: 'Filtro de aceite' }, { limit: 5 });
    rerender(<Analizador requestId="req-1" canDecide draft={{ description: 'Filtro' }} manualRun={0} debounceMs={10} />);
    rerender(<Analizador requestId="req-1" canDecide draft={{ description: 'Filtro aceite' }} manualRun={0} debounceMs={10} />);
    rerender(<Analizador requestId="req-1" canDecide draft={{ description: 'Filtro aceite motor' }} manualRun={0} debounceMs={10} />);
    await waitFor(() => expect(analizarMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
    const last = analizarMock.mock.calls[analizarMock.mock.calls.length - 1];
    expect(last[1]).toEqual({ description: 'Filtro aceite motor' });
  });

  it('6: no ejecuta búsquedas prematuras sin datos mínimos', async () => {
    analizarMock.mockResolvedValue({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    renderAnalyzer({ draft: {} });
    expect(await screen.findByText('Completa la información del artículo para analizar coincidencias.')).toBeTruthy();
    expect(analizarMock).not.toHaveBeenCalled();
  });

  it('7-8: manualRun ejecuta inmediatamente con estado de análisis', async () => {
    analizarMock.mockResolvedValue({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    const { rerender } = renderAnalyzer();
    await waitFor(() => expect(analizarMock).toHaveBeenCalledTimes(1));
    analizarMock.mockReturnValueOnce(new Promise(() => {}));
    rerender(<Analizador requestId="req-1" canDecide draft={DRAFT} manualRun={1} debounceMs={10} />);
    expect(await screen.findByText('Analizando artículos existentes...')).toBeTruthy();
    await waitFor(() => expect(analizarMock).toHaveBeenCalledTimes(2));
  });

  it('9-10: candidatos ordenados con foto o aviso, evidencias colapsadas', async () => {
    analizarMock.mockResolvedValue(structuredClone(OK));
    renderAnalyzer();
    expect(await screen.findByText('FERMIS0662')).toBeTruthy();
    expect(screen.getByText('FILTRO DE ACEITE MOTOR CUMMINS')).toBeTruthy();
    expect(screen.getByText(/AD_TRANS/)).toBeTruthy();
    expect(screen.getByText('Coincidencia:')).toBeTruthy();
    expect(screen.getByText('87%')).toBeTruthy();
    expect(screen.getByText('No existe foto disponible')).toBeTruthy();
    expect(screen.queryByText('Marca coincidente')).toBeNull();
    fireEvent.click(screen.getByText(/¿Por qué aparece este artículo\?/));
    expect(screen.getByText('Marca coincidente')).toBeTruthy();
    expect(screen.getByText(/Hay una diferencia que requiere revisión/)).toBeTruthy();
  });

  it('11-12: selector de cantidad y detalle completo', async () => {
    analizarMock.mockResolvedValue(structuredClone(OK));
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    fireEvent.change(screen.getByLabelText('Cantidad de coincidencias a revisar'), { target: { value: '10' } });
    await waitFor(() => expect(analizarMock).toHaveBeenLastCalledWith('req-1', DRAFT, { limit: 10 }));
    fireEvent.click(screen.getByText('Ver detalles'));
    expect(await screen.findByText('Artículo existente')).toBeTruthy();
    expect(screen.getByText(/Nivel de coincidencia: 87\/100/)).toBeTruthy();
    expect(screen.getByText(/no es una decisión/)).toBeTruthy();
  });

  it('15-16: Es el mismo confirma, vincula y explica cierre sin crear', async () => {
    analizarMock.mockResolvedValue(structuredClone(OK));
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    fireEvent.click(screen.getByText('Ver detalles'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Es el mismo'));
    expect(await screen.findByText(/no debería generar un nuevo artículo/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar: es el mismo' }));
    await waitFor(() => expect(vincularMock).toHaveBeenCalledTimes(1));
    expect(vincularMock).toHaveBeenCalledWith('req-1', CAND.article, 'SAME');
    expect(await screen.findByText(/No es necesario crear un código nuevo/)).toBeTruthy();
  });

  it('17: No es este muestra el siguiente sin cerrar', async () => {
    const other = { ...CAND, article: { companyCode: 'AD_TRANS', profitArticleCode: 'FERMIS0710' } };
    analizarMock.mockResolvedValue({ input: {}, candidates: [CAND, other], insufficient: false, engineVersion: 'v1' });
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    const btns = screen.getAllByText('No es este');
    fireEvent.click(btns[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar: no es este' }));
    await waitFor(() => expect(vincularMock).toHaveBeenCalledWith('req-1', CAND.article, 'DIFFERENT'));
    expect(screen.queryByText('FERMIS0662')).toBeNull();
    expect(screen.getByText('FERMIS0710')).toBeTruthy();
  });

  it('18: sin coincidencias muestra validación completada exacta', async () => {
    analizarMock.mockResolvedValue({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    renderAnalyzer();
    expect(await screen.findByText('✓ Validación completada')).toBeTruthy();
    expect(screen.getByText('No encontramos coincidencias relevantes. Puede continuar con la creación del nuevo artículo.')).toBeTruthy();
  });

  it('19: error muestra reintentar sin tecnicismos', async () => {
    analizarMock.mockRejectedValueOnce(new Error('500 Prisma TypeError'));
    renderAnalyzer({ manualRun: 1 });
    expect(await screen.findByText('No pudimos completar el análisis.')).toBeTruthy();
    expect(screen.queryByText(/Prisma/)).toBeNull();
    expect(screen.queryByText(/500/)).toBeNull();
    analizarMock.mockResolvedValueOnce({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    fireEvent.click(screen.getByText('Reintentar'));
    expect(await screen.findByText('✓ Validación completada')).toBeTruthy();
  });

  it('sin permiso no muestra acciones de decisión', async () => {
    analizarMock.mockResolvedValue(structuredClone(OK));
    renderAnalyzer({ canDecide: false });
    expect(await screen.findByText('FERMIS0662')).toBeTruthy();
    expect(screen.queryByText('Es el mismo')).toBeNull();
    expect(screen.queryByText('No es este')).toBeNull();
  });

  it('decisiones previas se muestran sin inventar', async () => {
    analizarMock.mockResolvedValue({
      input: {}, insufficient: false, engineVersion: 'v1',
      candidates: [
        { ...CAND, priorDecision: 'SAME' },
        { ...CAND, article: { companyCode: 'AD_DIST', profitArticleCode: 'OTRO1' }, priorDecision: 'DIFFERENT' },
      ],
    });
    renderAnalyzer();
    expect(await screen.findByText('Marcado previamente como el mismo artículo.')).toBeTruthy();
    expect(screen.getByText('Marcado previamente como diferente.')).toBeTruthy();
  });

  it('race: respuesta vieja no sobrescribe búsqueda nueva', async () => {
    const resolvers: Array<(v: any) => void> = [];
    analizarMock.mockImplementation(() => new Promise((res) => { resolvers.push(res); }));
    const { rerender } = renderAnalyzer();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(resolvers).toHaveLength(1);
    rerender(<Analizador requestId="req-2" canDecide draft={DRAFT} manualRun={0} debounceMs={10} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(resolvers).toHaveLength(2);
    resolvers[1]!({ input: {}, candidates: [CAND], insufficient: false, engineVersion: 'v1' });
    expect(await screen.findByText('FERMIS0662')).toBeTruthy();
    resolvers[0]!({ input: {}, candidates: [{ ...CAND, article: { companyCode: 'X', profitArticleCode: 'VIEJO' } }], insufficient: false, engineVersion: 'v1' });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText('VIEJO')).toBeNull();
    expect(screen.getByText('FERMIS0662')).toBeTruthy();
  });

  it('23.2: onBusyChange notifica inicio y fin del análisis', async () => {
    let resolveRun!: (v: any) => void;
    analizarMock.mockImplementation(() => new Promise((res) => { resolveRun = res; }));
    const busy: boolean[] = [];
    renderAnalyzer({ onBusyChange: (b: boolean) => { busy.push(b); } });
    await waitFor(() => expect(busy).toEqual([true]));
    resolveRun!({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    await waitFor(() => expect(busy).toEqual([true, false]));
  });

  it('23.2: muestra foto del existente cuando hay referencia; aviso si no', async () => {
    analizarMock.mockResolvedValue({
      input: {}, insufficient: false, engineVersion: 'v1',
      candidates: [
        { ...structuredClone(CAND), detail: { originalDescription: 'FILTRO', photo: 'FOTOS/FILTRO.JPG' } },
        { ...structuredClone(CAND), article: { companyCode: 'AD_TRANS', profitArticleCode: 'OTRO1' }, detail: { originalDescription: 'OTRO' } },
      ],
    });
    renderAnalyzer();
    await screen.findByText('FOTOS/FILTRO.JPG');
    expect(await screen.findByText('No existe foto disponible')).toBeTruthy();
  });

  it('botones deshabilitados mientras guarda', async () => {
    analizarMock.mockResolvedValue(structuredClone(OK));
    let resolveSave: ((v: any) => void) | null = null;
    vincularMock.mockImplementationOnce(() => new Promise((res) => { resolveSave = res; }));
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    fireEvent.click(screen.getByText('Ver detalles'));
    const dialog = await screen.findByRole('dialog');
    console.log('BOTONES-MODAL: ' + within(dialog).getAllByRole('button').map((b) => `[${b.textContent}]`).join(','));
    fireEvent.click(within(dialog).getByText('Es el mismo'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar: es el mismo' }));
    expect(screen.getByText('Guardando decisión...')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Procesando...' }) as HTMLButtonElement).disabled).toBe(true);
    resolveSave!({ id: 'l1', decision: 'SAME' });
    await waitFor(() => expect(screen.queryByText('Guardando decisión...')).toBeNull());
  });
});
