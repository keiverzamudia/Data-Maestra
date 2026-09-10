// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { OrganizacionSection } from './OrganizacionSection';
import { apiOrganizacionService } from '../../servicios/api/api-organizacion-service';
import { useSession } from '../../contextos/SessionContext';

vi.mock('../../servicios/api/api-organizacion-service', () => ({
  apiOrganizacionService: {
    getEmpresas: vi.fn(),
    getDepartamentos: vi.fn(),
    actualizarEmpresa: vi.fn(),
    crearEmpresa: vi.fn(),
    eliminarEmpresa: vi.fn(),
    vistaPreviaMigracion: vi.fn(),
    migrarEmpresa: vi.fn(),
    actualizarDepartamento: vi.fn(),
    crearDepartamento: vi.fn(),
  },
}));

vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));

const svc = apiOrganizacionService as any;

const EMPRESAS = [
  { id: 'cA', name: 'Empresa A', code: 'EMP-A', active: true, userCount: 2, departmentCount: 1 },
  { id: 'cB', name: 'Empresa B', code: 'EMP-B', active: true, userCount: 0, departmentCount: 1 },
];
const DEPTOS = [
  { id: 'dA1', companyId: 'cA', name: 'Almacén', code: 'ALM', active: true },
];
const USUARIOS: any[] = [
  { id: 'u1', username: 'j.perez', displayName: 'Juan Pérez', email: 'j@x.com', active: true, roleCodes: [], companyIds: [] },
];

function mockBase() {
  (useSession as any).mockReturnValue({ hasPermission: () => true });
  svc.getEmpresas.mockResolvedValue(structuredClone(EMPRESAS));
}

describe('Organización 12I — empresas', () => {
  beforeEach(() => { vi.clearAllMocks(); mockBase(); });
  afterEach(() => cleanup());

  function renderOrg() {
    render(<OrganizacionSection empresas={structuredClone(EMPRESAS)} departamentos={structuredClone(DEPTOS)} usuarios={USUARIOS} onChanged={() => {}} />);
  }

  it('lista con usuarios y departamentos por empresa', async () => {
    renderOrg();
    expect(await screen.findByText('Empresa A')).toBeTruthy();
    expect(screen.getByText('EMP-A')).toBeTruthy();
  });

  it('editar nombre conserva identidad y recarga', async () => {
    svc.actualizarEmpresa.mockResolvedValue({ id: 'cA', name: 'Distribuidora Central', code: 'EMP-A', active: true });
    svc.getEmpresas.mockResolvedValue([
      { id: 'cA', name: 'Distribuidora Central', code: 'EMP-A', active: true, userCount: 2, departmentCount: 1 },
      EMPRESAS[1],
    ]);
    renderOrg();
    fireEvent.click((await screen.findAllByText('Editar'))[0]!);
    fireEvent.change(await screen.findByLabelText('Nombre de la empresa'), { target: { value: 'Distribuidora Central' } });
    fireEvent.click(screen.getByText('Guardar cambios'));
    await screen.findByText('Distribuidora Central');
    expect(svc.actualizarEmpresa).toHaveBeenCalledWith('cA', { name: 'Distribuidora Central', code: 'EMP-A' });
    expect(svc.getEmpresas).toHaveBeenCalled();
  });

  it('código duplicado se rechaza en cliente sin llamar', async () => {
    renderOrg();
    fireEvent.click((await screen.findAllByText('Editar'))[1]!);
    fireEvent.change(await screen.findByLabelText('Código de la empresa'), { target: { value: 'emp-a' } });
    fireEvent.click(screen.getByText('Guardar cambios'));
    expect(await screen.findByText(/Ya existe una empresa con ese código/)).toBeTruthy();
    expect(svc.actualizarEmpresa).not.toHaveBeenCalled();
  });

  it('desactivar pide confirmación y recarga', async () => {
    svc.actualizarEmpresa.mockResolvedValue({ id: 'cA', active: false });
    renderOrg();
    const btns = await screen.findAllByText('Desactivar');
    fireEvent.click(btns[0]!);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByText('Desactivar'));
    await screen.findByText('Empresa A');
    expect(svc.actualizarEmpresa).toHaveBeenCalledWith('cA', { active: false });
    expect(svc.getEmpresas).toHaveBeenCalled();
  });

  it('migrar: preview, equivalencias, confirmación y resultado', async () => {
    svc.vistaPreviaMigracion.mockResolvedValue({
      from: { id: 'cA', name: 'Empresa A', code: 'EMP-A' },
      to: { id: 'cB', name: 'Empresa B', code: 'EMP-B' },
      users: 2,
      departments: [{ id: 'dA1', name: 'Almacén', code: 'ALM', memberships: 1 }],
      unmappedNote: '',
      historicalRequests: 5,
    });
    svc.getDepartamentos.mockResolvedValue([{ id: 'dB1', companyId: 'cB', name: 'Almacén B', code: 'ALM', active: true }]);
    svc.migrarEmpresa.mockResolvedValue({ ok: true, moved: 2, deduplicated: 0, users: 2, departmentsAffected: 1, historicalRequests: 5 });
    renderOrg();
    fireEvent.click((await screen.findAllByText('Migrar'))[0]!);
    fireEvent.change(await screen.findByLabelText('Empresa destino'), { target: { value: 'cB' } });
    expect(await screen.findByText((_, el) => el?.textContent === 'Usuarios a migrar')).toBeTruthy();
    // confirmación en dos pasos
    fireEvent.click(await screen.findByText('Revisar y confirmar'));
    fireEvent.click(await screen.findByText('Migrar y retirar empresa'));
    expect(svc.migrarEmpresa).toHaveBeenCalledWith({
      fromCompanyId: 'cA',
      toCompanyId: 'cB',
      departmentMap: { dA1: 'dB1' },
    });
    expect(await screen.findByText(/Migración completada/)).toBeTruthy();
  });

  it('retirar con dependencias muestra el mensaje del servidor', async () => {
    svc.eliminarEmpresa.mockRejectedValue(new Error('La empresa tiene referencias históricas y no puede eliminarse. Migre y retirar en su lugar.'));
    renderOrg();
    fireEvent.click((await screen.findAllByText('Retirar'))[0]!);
    const confirms = await screen.findAllByText('Retirar');
    fireEvent.click(confirms[confirms.length - 1]!);
    expect(await screen.findByText(/referencias históricas/)).toBeTruthy();
    expect(svc.eliminarEmpresa).toHaveBeenCalledWith('cA');
  });
});

describe('Organización 12I — departamentos', () => {
  beforeEach(() => { vi.clearAllMocks(); mockBase(); });
  afterEach(() => cleanup());

  function renderDepts() {
    render(<OrganizacionSection empresas={structuredClone(EMPRESAS)} departamentos={structuredClone(DEPTOS)} usuarios={USUARIOS} onChanged={() => {}} />);
    fireEvent.click(screen.getAllByText('Departamentos')[0]!);
  }

  it('crear departamento con empresa y responsable', async () => {
    svc.crearDepartamento.mockResolvedValue({ id: 'd2', companyId: 'cA', name: 'Logística', code: 'LOG', active: true });
    renderDepts();
    fireEvent.click(await screen.findByText('+ Nuevo departamento'));
    fireEvent.change(await screen.findByLabelText('Nombre del departamento'), { target: { value: 'Logística' } });
    fireEvent.change(await screen.findByLabelText('Código del departamento'), { target: { value: 'LOG' } });
    fireEvent.change(await screen.findByLabelText('Empresa del departamento'), { target: { value: 'cA' } });
    fireEvent.click(screen.getByText('Crear departamento'));
    expect(svc.crearDepartamento).toHaveBeenCalledWith({ name: 'Logística', code: 'LOG', companyId: 'cA', managerId: null });
    expect(await screen.findByText('Logística')).toBeTruthy();
  });

  it('desactivar pide confirmación', async () => {
    svc.actualizarDepartamento.mockResolvedValue({ id: 'dA1', active: false });
    renderDepts();
    fireEvent.click(await screen.findByText('Desactivar'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByText('Desactivar'));
    expect(svc.actualizarDepartamento).toHaveBeenCalledWith('dA1', { active: false });
  });
});
