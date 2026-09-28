// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ProfitCompaniesAdmin } from './ProfitCompaniesAdmin';
import { apiMultiCompanyService } from '../../servicios/api/api-multiempresa-service';

vi.mock('../../servicios/api/api-multiempresa-service', () => ({
  apiMultiCompanyService: { companies: vi.fn(), saveConfig: vi.fn(), setStandard: vi.fn() },
}));

const companiesMock = apiMultiCompanyService.companies as any;
const saveMock = apiMultiCompanyService.saveConfig as any;
const standardMock = apiMultiCompanyService.setStandard as any;

const LIST = [
  { code: 'AD_TRANS', name: 'TRANSPORTE', isStandard: true, enabled: true },
  { code: 'AD_LUBSL', name: 'LUBRICANTES', isStandard: false, enabled: true },
  { code: 'AD_ROMA', name: 'ROMA', isStandard: false, enabled: false },
];

// HelpButton fuera del alcance: se mockea para aislar la tabla.
vi.mock('../../componentes/ayuda', () => ({ HelpButton: () => null }));

describe('ProfitCompaniesAdmin', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => cleanup());

  it('lista empresas con estándar y habilitadas', async () => {
    companiesMock.mockResolvedValue(structuredClone(LIST));
    render(<ProfitCompaniesAdmin />);
    expect(await screen.findByText('AD_TRANS')).toBeTruthy();
    expect(screen.getByText('Empresa estándar')).toBeTruthy();
    expect((screen.getByLabelText('Habilitar inserción en AD_ROMA') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Habilitar inserción en AD_LUBSL') as HTMLInputElement).checked).toBe(true);
  });

  it('deshabilitar llama al backend y recarga', async () => {
    companiesMock.mockResolvedValue(structuredClone(LIST));
    saveMock.mockResolvedValue({});
    render(<ProfitCompaniesAdmin />);
    await screen.findByText('AD_LUBSL');
    fireEvent.click(screen.getByLabelText('Habilitar inserción en AD_LUBSL'));
    await waitFor(() => expect(saveMock).toHaveBeenCalledWith('AD_LUBSL', false));
    expect(companiesMock).toHaveBeenCalledTimes(2);
  });

  it('autoriza que las descripciones de AD_TRANS mandan en una empresa (FASE 26.2)', async () => {
    let current = structuredClone(LIST);
    companiesMock.mockImplementation(async () => structuredClone(current));
    saveMock.mockImplementation(async (code: string, enabled: boolean, allowDescSync?: boolean) => {
      current = current.map((c) => (c.code === code ? { ...c, enabled, allowDescSync } : c));
      return current.find((c) => c.code === code);
    });
    render(<ProfitCompaniesAdmin />);
    await screen.findByText('AD_LUBSL');
    fireEvent.click(screen.getByLabelText('Las descripciones de AD_TRANS mandan en AD_LUBSL'));
    await waitFor(() => expect(saveMock).toHaveBeenCalledWith('AD_LUBSL', true, true));
    expect(await screen.findByText('Mandan')).toBeTruthy();
  });

  it('marcar estándar pide confirmación explícita', async () => {
    companiesMock.mockResolvedValue(structuredClone(LIST));
    standardMock.mockResolvedValue({});
    render(<ProfitCompaniesAdmin />);
    await screen.findByText('AD_LUBSL');
    fireEvent.click(screen.getAllByText('Marcar estándar')[0]!);
    expect(screen.getByText(/dejará de serlo/)).toBeTruthy();
    fireEvent.click(screen.getByText('Confirmar'));
    await waitFor(() => expect(standardMock).toHaveBeenCalledWith('AD_LUBSL'));
  });
});
