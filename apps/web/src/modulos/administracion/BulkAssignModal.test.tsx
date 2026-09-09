// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { BulkAssignModal } from './BulkAssignModal';
import { AdminPage as AdministracionPage } from './AdministracionPage';
import { apiUsuariosService } from '../../servicios/api/api-usuarios-service';
import { apiRolesService } from '../../servicios/api/api-roles-service';
import { useSession } from '../../contextos/SessionContext';

vi.mock('../../servicios/api/api-usuarios-service', () => ({
  apiUsuariosService: {
    buscar: vi.fn(),
    sincronizarProfit: vi.fn(),
    detalle: vi.fn(),
    asignarRolMasivo: vi.fn(),
  },
}));

vi.mock('../../servicios/api/api-roles-service', () => ({
  apiRolesService: { listar: vi.fn(), detalle: vi.fn(), conceder: vi.fn(), quitar: vi.fn() },
}));

vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));

vi.mock('../../hooks/useCatalogos', () => ({
  useCatalogos: () => ({ grupos: [], subgrupos: [], categorias: [], marcas: [], unidades: [] }),
}));

vi.mock('../../hooks/useOrganizacion', () => ({
  useOrganizacion: () => ({
    empresas: [{ id: 'c1', name: 'Empresa A', code: 'EMP-A', active: true }],
    departamentos: [],
    usuarios: [],
    roles: [],
    loading: false,
    error: null,
  }),
}));

const buscarMock = apiUsuariosService.buscar as any;
const masivoMock = apiUsuariosService.asignarRolMasivo as any;
const listarRolesMock = apiRolesService.listar as any;

const USERS = [
  { id: 'u1', username: 'j.perez', displayName: 'Juan Pérez', profitCode: null, active: true, mustChangePassword: false, lastLoginAt: null, userRoles: [] },
  { id: 'u2', username: 'm.garcia', displayName: 'María García', profitCode: null, active: true, mustChangePassword: false, lastLoginAt: null, userRoles: [] },
];

function mockAll() {
  (useSession as any).mockReturnValue({ hasPermission: () => true });
  buscarMock.mockResolvedValue(structuredClone(USERS));
  listarRolesMock.mockResolvedValue([{ code: 'WAREHOUSE', name: 'Almacén', description: null, userCount: 0, permissionCount: 0, permissions: [] }]);
}

describe('BulkAssignModal 10J', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAll(); });
  afterEach(() => cleanup());

  it('carga roles reales y confirma asignación con resultado', async () => {
    const changed = vi.fn();
    render(<BulkAssignModal users={structuredClone(USERS)} empresas={[{ id: 'c1', name: 'Empresa A', code: 'EMP-A', active: true }]} departamentos={[]} onClose={() => {}} onChanged={changed} />);
    await screen.findByText('WAREHOUSE — Almacén');
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'WAREHOUSE' } });
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'c1' } });
    masivoMock.mockResolvedValue({ correlationId: 'abc', total: 2, assigned: 1, alreadyAssigned: 1, failed: 0, results: [] });
    fireEvent.click(screen.getByText('Asignar rol'));
    fireEvent.click(screen.getByText('Confirmar'));
    // esperar llamada
    await waitFor(() => expect(masivoMock).toHaveBeenCalledWith({
      userIds: ['u1', 'u2'], roleCode: 'WAREHOUSE', companyId: 'c1', departmentId: null,
    }));
    expect(await screen.findByText(/Asignación completada/)).toBeTruthy();
    expect(changed).toHaveBeenCalled();
  });

  it('maneja error de API', async () => {
    masivoMock.mockRejectedValueOnce(new Error('Fallo masivo'));
    render(<BulkAssignModal users={structuredClone(USERS)} empresas={[{ id: 'c1', name: 'Empresa A', code: 'EMP-A', active: true }]} departamentos={[]} onClose={() => {}} onChanged={() => {}} />);
    await screen.findByText('WAREHOUSE — Almacén');
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'WAREHOUSE' } });
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByText('Asignar rol'));
    fireEvent.click(screen.getByText('Confirmar'));
    expect(await screen.findByText('Fallo masivo')).toBeTruthy();
  });
});

describe('Administración → Usuarios selección 10J', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAll(); });
  afterEach(() => cleanup());

  it('selección, contador y apertura del modal con refresco', async () => {
    render(<AdministracionPage />);
    await screen.findByText('Juan Pérez');
    // seleccionar uno
    fireEvent.click(screen.getByLabelText('Seleccionar Juan Pérez'));
    expect(await screen.findByText(/1 usuario seleccionado/)).toBeTruthy();
    // seleccionar todos
    fireEvent.click(screen.getByLabelText('Seleccionar todos'));
    expect(await screen.findByText(/2 usuarios seleccionados/)).toBeTruthy();
    // deseleccionar todos
    fireEvent.click(screen.getByLabelText('Seleccionar todos'));
    expect(screen.queryByText(/seleccionado/)).toBeNull();
    // re-seleccionar y abrir modal
    fireEvent.click(screen.getByLabelText('Seleccionar todos'));
    fireEvent.click(await screen.findByText(/Asignar rol \(2 usuarios seleccionados\)/));
    expect(await screen.findByText('Asignar rol a 2 usuarios')).toBeTruthy();
  });
});
