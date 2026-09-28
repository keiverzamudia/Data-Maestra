// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EquivalenciasPanel } from './EquivalenciasPanel';
import { apiCorporateService } from '../../servicios/api/api-corporate-service';

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
}));
vi.mock('../../contextos/SessionContext', () => ({
  useSession: () => ({ hasPermission: (p: string) => p === 'ADMIN.MANAGE' }),
}));

const svc = apiCorporateService as any;

const COMPANIES = [
  { code: 'AD_TRANS', name: 'TRANSPORTE', rif: 'J1', isStandard: true, enabled: true, allowDescSync: false },
  { code: 'AD_DISAY', name: 'DISTRIBUIDORA', rif: 'J2', isStandard: false, enabled: true, allowDescSync: false },
];

const EQUIV: any[] = [
  {
    id: 'eq-1', catalogKey: 'lin_art', catalogLabel: 'Líneas', companyCode: 'AD_DISAY',
    standardCode: '01', localCode: '01A', active: true, note: null, createdBy: 'u1',
  },
];

describe('EquivalenciasPanel (FASE 26)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.companies.mockResolvedValue(structuredClone(COMPANIES));
    svc.equivalences.mockResolvedValue(structuredClone(EQUIV));
    svc.saveEquivalence.mockResolvedValue({});
    svc.deactivateEquivalence.mockResolvedValue({ id: 'eq-1', active: false });
    svc.suggestEquivalences.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it('lista las equivalencias registradas (AD_TRANS ↔ código local)', async () => {
    render(<MemoryRouter><EquivalenciasPanel /></MemoryRouter>);
    expect(await screen.findByText('Líneas')).toBeTruthy();
    expect(screen.getByText('AD_DISAY')).toBeTruthy();
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('01A')).toBeTruthy();
    expect(screen.getByText('Activa')).toBeTruthy();
  });

  it('guarda el vínculo que el usuario escribe', async () => {
    render(<MemoryRouter><EquivalenciasPanel /></MemoryRouter>);
    await screen.findByText('Líneas');
    fireEvent.change(screen.getByPlaceholderText('01'), { target: { value: '02' } });
    fireEvent.change(screen.getByPlaceholderText('01A'), { target: { value: '02B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar equivalencia' }));
    await waitFor(() => expect(svc.saveEquivalence).toHaveBeenCalledWith(
      expect.objectContaining({ catalogKey: 'lin_art', companyCode: 'AD_DISAY', standardCode: '02', localCode: '02B' }),
    ));
    expect(await screen.findByText(/Equivalencia guardada/)).toBeTruthy();
  });

  it('no guarda con códigos vacíos', async () => {
    render(<MemoryRouter><EquivalenciasPanel /></MemoryRouter>);
    await screen.findByText('Líneas');
    expect(screen.getByRole('button', { name: 'Guardar equivalencia' })).toHaveProperty('disabled', true);
  });

  it('desactiva una equivalencia y lo confirma', async () => {
    render(<MemoryRouter><EquivalenciasPanel /></MemoryRouter>);
    await screen.findByText('Activa');
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(svc.deactivateEquivalence).toHaveBeenCalledWith('eq-1'));
    expect(await screen.findByText(/Equivalencia desactivada/)).toBeTruthy();
  });

  it('las sugerencias nunca se aplican solas: hay que elegir una', async () => {
    svc.suggestEquivalences.mockResolvedValue([
      {
        catalogKey: 'lin_art', catalogLabel: 'Líneas', standardCode: '05', standardDescription: 'HERRAMIENTAS',
        localCode: '05A', localDescription: 'HERRAMIENTAS', reason: 'Misma descripción.',
      },
    ]);
    render(<MemoryRouter><EquivalenciasPanel /></MemoryRouter>);
    await screen.findByText('Líneas');
    fireEvent.click(screen.getByRole('button', { name: 'Buscar coincidencias' }));
    expect(await screen.findByText('05A')).toBeTruthy();
    expect(svc.saveEquivalence).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta' }));
    expect((screen.getByPlaceholderText('01') as HTMLInputElement).value).toBe('05');
    expect(svc.saveEquivalence).not.toHaveBeenCalled();
  });
});
