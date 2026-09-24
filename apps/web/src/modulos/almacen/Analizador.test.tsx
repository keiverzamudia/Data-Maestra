// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within, act } from '@testing-library/react';
import { Analizador } from './Analizador';
import { apiMatchingService } from '../../servicios/api/api-matching-service';

vi.mock('../../servicios/api/api-matching-service', () => ({
  apiMatchingService: { analizar: vi.fn(), vincular: vi.fn(), buscarArticulo: vi.fn() },
}));

const analizarMock = apiMatchingService.analizar as any;
const vincularMock = apiMatchingService.vincular as any;
const buscarMock = apiMatchingService.buscarArticulo as any;

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
    buscarMock.mockResolvedValue({ companyCode: 'AD_TRANS', term: '', source: 'LOCAL', results: [] });
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
    expect(analizarMock).toHaveBeenCalledWith('req-1', { description: 'Filtro de aceite' }, { limit: 5, phase: 'INICIAL' });
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
    expect(screen.getByText('Puntaje:')).toBeTruthy();
    expect(screen.getByText('87/100')).toBeTruthy();
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
    await waitFor(() => expect(analizarMock).toHaveBeenLastCalledWith('req-1', DRAFT, { limit: 10, phase: 'INICIAL' }));
    fireEvent.click(screen.getByText('Ver detalles'));
    expect(await screen.findByText('Comparar coincidencia')).toBeTruthy();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('87/100')).toBeTruthy();
    expect(within(dialog).getByText(/puntaje del motor/)).toBeTruthy();
    expect(within(dialog).getByText(/no es una decisión/)).toBeTruthy();
  });

  it('15-16: Es el mismo confirma, vincula y explica cierre sin crear', async () => {
    analizarMock.mockResolvedValue(structuredClone(OK));
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    fireEvent.click(screen.getByText('Ver detalles'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Es este'));
    expect(await screen.findByText(/no debería generar un nuevo artículo/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar: es el mismo' }));
    await waitFor(() => expect(vincularMock).toHaveBeenCalledTimes(1));
    expect(vincularMock).toHaveBeenCalledWith('req-1', CAND.article, 'SAME');
    expect(await screen.findByText(/No es necesario crear un código nuevo/)).toBeTruthy();
  });

  it('17: No es este desde el detalle persiste y muestra el siguiente', async () => {
    const other = { ...CAND, article: { companyCode: 'AD_TRANS', profitArticleCode: 'FERMIS0710' } };
    analizarMock.mockResolvedValue({ input: {}, candidates: [CAND, other], insufficient: false, engineVersion: 'v1' });
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    fireEvent.click(screen.getByText('Ver detalles'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('No es este'));
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
    expect(screen.queryByText('Es este')).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: 'Coincidencia siguiente' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Coincidencia siguiente' }));
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
    fireEvent.click(within(dialog).getByText('Es este'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar: es el mismo' }));
    expect(screen.getByText('Guardando decisión...')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Procesando...' }) as HTMLButtonElement).disabled).toBe(true);
    resolveSave!({ id: 'l1', decision: 'SAME' });
    await waitFor(() => expect(screen.queryByText('Guardando decisión...')).toBeNull());
  });

  const TWO = () => ({
    input: {}, insufficient: false, engineVersion: 'v1',
    candidates: [
      structuredClone(CAND),
      { ...structuredClone(CAND), article: { companyCode: 'AD_TRANS', profitArticleCode: 'FERMIS0710' } },
    ],
  });

  it('carrusel: navega siguiente/anterior con posición y sin re-ejecutar', async () => {
    analizarMock.mockResolvedValue(TWO());
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    expect(screen.getByText('Coincidencia 1 de 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Coincidencia siguiente' }));
    expect(screen.getByText('FERMIS0710')).toBeTruthy();
    expect(screen.getByText('Coincidencia 2 de 2')).toBeTruthy();
    expect(screen.queryByText('FERMIS0662')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Coincidencia anterior' }));
    expect(screen.getByText('FERMIS0662')).toBeTruthy();
    expect(screen.getByText('Coincidencia 1 de 2')).toBeTruthy();
    expect(analizarMock).toHaveBeenCalledTimes(1);
  });

  it('carrusel: teclado avanza sin re-ejecutar', async () => {
    analizarMock.mockResolvedValue(TWO());
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    const card = screen.getByRole('group', { name: /Coincidencia: FERMIS0662/ });
    fireEvent.keyDown(card, { key: 'ArrowRight' });
    expect(screen.getByText('FERMIS0710')).toBeTruthy();
    expect(analizarMock).toHaveBeenCalledTimes(1);
  });

  it('descarte: sale del carrusel, va a bandeja y el siguiente se activa', async () => {
    analizarMock.mockResolvedValue(TWO());
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    fireEvent.click(screen.getByText('Descartar'));
    expect(screen.queryByText('FERMIS0662')).toBeNull();
    expect(screen.getByText('FERMIS0710')).toBeTruthy();
    expect(screen.getByText('Coincidencia 1 de 1')).toBeTruthy();
    expect(screen.getByText(/Descartados \(1\)/)).toBeTruthy();
    expect(vincularMock).not.toHaveBeenCalled();
  });

  it('recuperar: vuelve en su posición original sin duplicar', async () => {
    analizarMock.mockResolvedValue(TWO());
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    fireEvent.click(screen.getByText('Descartar'));
    fireEvent.click(screen.getByText('Ver descartados ▾'));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descartado FERMIS0662' }));
    expect(screen.getByText('Descartado: FERMIS0662')).toBeTruthy();
    fireEvent.click(screen.getByText('↩ Recuperar'));
    expect(screen.getByText('Coincidencia 1 de 2')).toBeTruthy();
    expect(screen.getAllByText('FERMIS0662')).toHaveLength(1);
    expect(vincularMock).not.toHaveBeenCalled();
  });

  it('descartado puede confirmarse Es este sin recuperar antes', async () => {
    analizarMock.mockResolvedValue(TWO());
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    fireEvent.click(screen.getByText('Descartar'));
    fireEvent.click(screen.getByText('Ver descartados ▾'));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descartado FERMIS0662' }));
    const trayDialog = screen.getByText('Descartado: FERMIS0662');
    expect(trayDialog).toBeTruthy();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Es este' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar: es el mismo' }));
    await waitFor(() => expect(vincularMock).toHaveBeenCalledWith('req-1', CAND.article, 'SAME'));
  });

  it('todos descartados: avisa y permite revisar sin perder nada', async () => {
    analizarMock.mockResolvedValue(TWO());
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    fireEvent.click(screen.getByText('Descartar'));
    fireEvent.click(screen.getByText('Descartar'));
    expect(screen.getByText('No quedan coincidencias activas.')).toBeTruthy();
    expect(screen.getByText(/Puedes revisar los descartados antes de continuar/)).toBeTruthy();
    expect(screen.getByText(/Descartados \(2\)/)).toBeTruthy();
    fireEvent.click(screen.getByText('Revisar descartados'));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar descartado FERMIS0710' }));
    fireEvent.click(screen.getByText('↩ Recuperar'));
    expect(screen.getByText('FERMIS0710')).toBeTruthy();
    expect(vincularMock).not.toHaveBeenCalled();
  });

  it('foto URL: muestra imagen con ampliar y descargar; descarga sin salir', async () => {
    const okFetch = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }));
    vi.stubGlobal('fetch', okFetch as any);
    const createUrl = vi.fn(() => 'blob:foto');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl } as any);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      analizarMock.mockResolvedValue({
        input: {}, insufficient: false, engineVersion: 'v1',
        candidates: [{ ...structuredClone(CAND), detail: { originalDescription: 'FILTRO', photo: '/api/v1/uploads/foto123.jpg' } }],
      });
      renderAnalyzer();
      await screen.findByAltText('Foto del artículo FERMIS0662');
      fireEvent.click(screen.getByText('Ampliar'));
      expect(await screen.findByAltText(/Foto ampliada del artículo existente/)).toBeTruthy();
      fireEvent.click(screen.getAllByText('Descargar foto')[0]!);
      await waitFor(() => expect(okFetch).toHaveBeenCalledWith('/api/v1/uploads/foto123.jpg'));
      expect(clickSpy).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      clickSpy.mockRestore();
    }
  });

  const COMPARE = () => ({
    input: {}, insufficient: false, engineVersion: 'v1',
    candidates: [
      {
        ...structuredClone(CAND),
        detail: {
          originalDescription: 'FILTRO DE ACEITE MOTOR CUMMINS',
          brand: 'CUMMINS',
          model: 'DT466',
          partNumber: 'LF9009',
          category: 'FER',
          subCategory: 'MIS',
          unit: 'UND',
          application: 'CAMION',
        },
      },
      { ...structuredClone(CAND), article: { companyCode: 'AD_TRANS', profitArticleCode: 'FERMIS0710' } },
    ],
  });

  it('comparador: muestra solicitud, Profit, score y razones', async () => {
    analizarMock.mockResolvedValue(COMPARE());
    renderAnalyzer({ draft: { description: 'Filtro de aceite', partNumber: 'LF9009' } });
    await screen.findByText('FERMIS0662');
    fireEvent.click(screen.getByText('Ver detalles'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Comparar coincidencia')).toBeTruthy();
    expect(within(dialog).getByText('Mi solicitud')).toBeTruthy();
    expect(within(dialog).getByText('Artículo existente en Profit')).toBeTruthy();
    expect(within(dialog).getByText('87/100')).toBeTruthy();
    expect(within(dialog).getByText('¿Por qué coinciden?')).toBeTruthy();
    expect(within(dialog).getByText('Coincidencia 1 de 2')).toBeTruthy();
    expect(within(dialog).getAllByText('No existe foto disponible')).toHaveLength(2);
  });

  it('comparador: navega sin cerrar y actualiza contenido', async () => {
    analizarMock.mockResolvedValue(COMPARE());
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    fireEvent.click(screen.getByText('Ver detalles'));
    const navDialog = await screen.findByRole('dialog');
    expect(within(navDialog).getByText('Comparar coincidencia')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Candidato siguiente' }));
    expect(within(navDialog).getByText('Coincidencia 2 de 2')).toBeTruthy();
    expect(screen.getByText('Comparar coincidencia')).toBeTruthy();
    expect(analizarMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Candidato anterior' }));
    expect(within(navDialog).getByText('Coincidencia 1 de 2')).toBeTruthy();
  });

  it('comparador: descartar avanza al siguiente sin cerrar', async () => {
    analizarMock.mockResolvedValue(COMPARE());
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    fireEvent.click(screen.getByText('Ver detalles'));
    await screen.findByText('Comparar coincidencia');
    const discardDialog = screen.getByRole('dialog');
    fireEvent.click(within(discardDialog).getByText('Descartar'));
    expect(within(discardDialog).getByText('Coincidencia 1 de 1')).toBeTruthy();
    expect(within(discardDialog).getByText('FERMIS0710')).toBeTruthy();
    expect(screen.getByText('Comparar coincidencia')).toBeTruthy();
    expect(vincularMock).not.toHaveBeenCalled();
  });

  it('comparador: Es este usa la lógica SAME existente', async () => {
    analizarMock.mockResolvedValue(COMPARE());
    renderAnalyzer();
    await screen.findByText('FERMIS0662');
    fireEvent.click(screen.getByText('Ver detalles'));
    await screen.findByText('Comparar coincidencia');
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Es este' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar: es el mismo' }));
    await waitFor(() => expect(vincularMock).toHaveBeenCalledWith('req-1', CAND.article, 'SAME'));
    expect(await screen.findByText(/No es necesario crear un código nuevo/)).toBeTruthy();
  });

  it('comparador: foto de solicitud contenida y diferencias neutras', async () => {
    analizarMock.mockResolvedValue(COMPARE());
    renderAnalyzer({ photoUri: 'sol123.jpg' });
    await screen.findByText('FERMIS0662');
    fireEvent.click(screen.getByText('Ver detalles'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByAltText('Foto de referencia de la solicitud')).toBeTruthy();
    fireEvent.click(within(dialog).getByText('▸ Ver más información'));
    expect(within(dialog).getByText(/diferente, no es error/)).toBeTruthy();
  });

  // ---- FASE P1: coherencia de etiquetas, universo y borrador ----

  it('P1: con puntaje 0 no se presenta como "Posible coincidencia"', async () => {
    analizarMock.mockResolvedValue({
      input: {},
      insufficient: false,
      engineVersion: 'v1',
      candidates: [{ ...structuredClone(CAND), score: 0, classification: 'REVIEW', evidence: [] }],
    });
    renderAnalyzer();
    expect(await screen.findByText('FERMIS0662')).toBeTruthy();
    expect(screen.getByText(/Sin coincidencia demostrada/)).toBeTruthy();
    expect(screen.queryByText(/🔎 Posible coincidencia/)).toBeNull();
    expect(screen.getByText('Puntaje:')).toBeTruthy();
    expect(screen.getByText('0/100')).toBeTruthy();
  });

  it('P1: con puntaje ≥ 12 sí se presenta como posible coincidencia', async () => {
    analizarMock.mockResolvedValue(structuredClone(OK));
    renderAnalyzer();
    expect(await screen.findByText('FERMIS0662')).toBeTruthy();
    expect(screen.getByText(/🔎 Posible coincidencia/)).toBeTruthy();
  });

  it('P1: avisa cuando el tope de perfiles silenció parte del universo', async () => {
    analizarMock.mockResolvedValue({
      ...structuredClone(OK),
      poolLimit: 500,
      poolTotal: 1200,
      poolTruncated: true,
    });
    renderAnalyzer();
    expect(await screen.findByText('FERMIS0662')).toBeTruthy();
    expect(screen.getByText(/hay 1200 en total/)).toBeTruthy();
  });

  it('P1: sin corte de universo no aparece el aviso', async () => {
    analizarMock.mockResolvedValue({ ...structuredClone(OK), poolTotal: 30, poolLimit: 500, poolTruncated: false });
    renderAnalyzer();
    expect(await screen.findByText('FERMIS0662')).toBeTruthy();
    expect(screen.queryByText(/hay .* en total/)).toBeNull();
  });

  it('P1: el Comparador muestra el Modelo del borrador (lado Mi solicitud)', async () => {
    analizarMock.mockResolvedValue(COMPARE());
    renderAnalyzer({ draft: { description: 'Filtro de aceite', model: 'DT999' } });
    await screen.findByText('FERMIS0662');
    fireEvent.click(screen.getByText('Ver detalles'));
    const dialog = await screen.findByRole('dialog');
    const solicitud = within(dialog).getByRole('region', { name: 'Mi solicitud' });
    const profit = within(dialog).getByRole('region', { name: 'Artículo existente en Profit' });
    expect(within(solicitud).getByText('Modelo')).toBeTruthy();
    expect(within(solicitud).getByText('DT999')).toBeTruthy();
    expect(within(profit).getByText('DT466')).toBeTruthy();
  });

  // ---- FASE P2: búsqueda en dos tiempos (INICIAL / COMPLETA) ----

  it('P2: el auto-análisis busca en fase INICIAL (solo descripción)', async () => {
    analizarMock.mockResolvedValue({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    renderAnalyzer();
    await waitFor(() => expect(analizarMock).toHaveBeenCalledTimes(1));
    expect(analizarMock.mock.calls[0]![2]).toMatchObject({ phase: 'INICIAL' });
    expect(screen.getByText(/Búsqueda inicial por descripción/)).toBeTruthy();
  });

  it('P2: Validar artículo con clasificación completa dispara la fase COMPLETA', async () => {
    analizarMock.mockResolvedValue({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    const { rerender } = renderAnalyzer();
    await waitFor(() => expect(analizarMock).toHaveBeenCalledTimes(1));
    rerender(
      <Analizador
        requestId="req-1" canDecide draft={DRAFT} manualRun={1} debounceMs={10}
        clasificacionCompleta
      />,
    );
    await waitFor(() => expect(analizarMock).toHaveBeenCalledTimes(2));
    expect(analizarMock.mock.calls[1]![2]).toMatchObject({ phase: 'COMPLETA' });
    expect(await screen.findByText(/Búsqueda completa/)).toBeTruthy();
    expect(screen.queryByText(/Completa grupo, subgrupo/)).toBeNull();
  });

  it('P2: sin clasificación completa no lanza la búsqueda COMPLETA y lo explica', async () => {
    analizarMock.mockResolvedValue({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    const { rerender } = renderAnalyzer();
    await waitFor(() => expect(analizarMock).toHaveBeenCalledTimes(1));
    rerender(
      <Analizador
        requestId="req-1" canDecide draft={DRAFT} manualRun={1} debounceMs={10}
        clasificacionCompleta={false}
      />,
    );
    // Solo la búsqueda inicial (automática): no hay una segunda llamada.
    await new Promise((r) => setTimeout(r, 60));
    expect(analizarMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Completa grupo, subgrupo, tipo de artículo y unidad Profit/)).toBeTruthy();
    expect(screen.getByText(/Búsqueda inicial por descripción/)).toBeTruthy();
    expect(screen.queryByText(/Búsqueda completa/)).toBeNull();
  });

  // ---- FASE P3: búsqueda manual de artículos en Profit ----

  it('P3: busca manualmente por código/descripción y muestra los resultados', async () => {
    analizarMock.mockResolvedValue({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    buscarMock.mockResolvedValue({
      companyCode: 'AD_TRANS',
      term: 'FERMIS0662',
      source: 'LOCAL',
      results: [{ companyCode: 'AD_TRANS', profitArticleCode: 'FERMIS0662', description: 'FILTRO DE ACEITE', brand: '01' }],
    });
    renderAnalyzer();
    await waitFor(() => expect(analizarMock).toHaveBeenCalledTimes(1));
    fireEvent.change(await screen.findByLabelText(/¿Ya existe\? Busca un artículo en Profit/), {
      target: { value: 'FERMIS0662' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en Profit' }));
    await waitFor(() => expect(buscarMock).toHaveBeenCalledWith('req-1', 'FERMIS0662'));
    expect(await screen.findByText(/Sí existe: 1 resultado en AD_TRANS \(universo local\)/)).toBeTruthy();
    expect(screen.getByText('FERMIS0662')).toBeTruthy();
    expect(screen.getByText(/FILTRO DE ACEITE/)).toBeTruthy();
    // Es solo informativa: no dispara análisis ni vínculos.
    expect(analizarMock).toHaveBeenCalledTimes(1);
    expect(vincularMock).not.toHaveBeenCalled();
  });

  it('P3: sin resultados avisa que el artículo no existe en Profit', async () => {
    analizarMock.mockResolvedValue({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    buscarMock.mockResolvedValue({ companyCode: 'AD_TRANS', term: 'TORNILLO XYZ', source: 'PROFIT', results: [] });
    renderAnalyzer();
    await waitFor(() => expect(analizarMock).toHaveBeenCalledTimes(1));
    fireEvent.change(await screen.findByLabelText(/¿Ya existe\? Busca un artículo en Profit/), {
      target: { value: 'TORNILLO XYZ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en Profit' }));
    expect(await screen.findByText(/No existe "TORNILLO XYZ" en AD_TRANS/)).toBeTruthy();
    expect(buscarMock).toHaveBeenCalledTimes(1);
  });

  it('P3: no consulta con menos de 2 caracteres y explica el motivo', async () => {
    analizarMock.mockResolvedValue({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    renderAnalyzer();
    await waitFor(() => expect(analizarMock).toHaveBeenCalledTimes(1));
    fireEvent.change(await screen.findByLabelText(/¿Ya existe\? Busca un artículo en Profit/), {
      target: { value: 'F' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en Profit' }));
    expect(await screen.findByText(/Escribe al menos 2 caracteres para buscar el artículo/)).toBeTruthy();
    expect(buscarMock).not.toHaveBeenCalled();
  });
});
