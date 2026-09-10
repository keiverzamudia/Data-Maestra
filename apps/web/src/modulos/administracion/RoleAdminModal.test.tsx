// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { RoleAdminModal } from './RoleAdminModal';
import { apiRolesService } from '../../servicios/api/api-roles-service';

vi.mock('../../servicios/api/api-roles-service', () => ({
  apiRolesService: {
    listar: vi.fn(),
    detalle: vi.fn(),
    conceder: vi.fn(),
    quitar: vi.fn(),
  },
}));

const detalleMock = apiRolesService.detalle as any;
const concederMock = apiRolesService.conceder as any;
const quitarMock = apiRolesService.quitar as any;

const DETAIL = {
  code: 'REQUESTER',
  name: 'Solicitante',
  description: null,
  permissions: [{ code: 'REQUEST.VIEW', description: null }],
  catalog: [
    { code: 'REQUEST.CREATE', description: null },
    { code: 'REQUEST.VIEW', description: null },
  ],
  users: [{ displayName: 'Juan Pérez', username: 'j.perez', active: true, company: 'EMP-A', department: null }],
};

describe('RoleAdminModal 10I', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detalleMock.mockResolvedValue(structuredClone(DETAIL));
  });
  afterEach(() => cleanup());

  it('carga el detalle del rol', async () => {
    render(<RoleAdminModal roleCode="REQUESTER" onClose={() => {}} onChanged={() => {}} />);
    expect(await screen.findByText('Administrar rol — Solicitante')).toBeTruthy();
    expect(await screen.findByText('Juan Pérez')).toBeTruthy();
    expect(detalleMock).toHaveBeenCalledWith('REQUESTER');
  });

  it('muestra permisos asignados y permite asignar', async () => {
    const changed = vi.fn();
    render(<RoleAdminModal roleCode="REQUESTER" onClose={() => {}} onChanged={changed} />);
    await screen.findByText('Crear solicitudes');
    const box = screen.getByLabelText('Permiso Crear solicitudes') as HTMLInputElement;
    expect(box.checked).toBe(false);
    concederMock.mockResolvedValue({ ok: true, created: true });
    fireEvent.click(box);
    await waitFor(() => expect(concederMock).toHaveBeenCalledWith('REQUESTER', 'REQUEST.CREATE'));
    expect(changed).toHaveBeenCalled();
  });

  it('permite quitar un permiso asignado', async () => {
    render(<RoleAdminModal roleCode="REQUESTER" onClose={() => {}} onChanged={() => {}} />);
    await screen.findByText('Consultar solicitudes');
    const box = screen.getByLabelText('Permiso Consultar solicitudes') as HTMLInputElement;
    expect(box.checked).toBe(true);
    quitarMock.mockResolvedValue({ ok: true, removed: true });
    fireEvent.click(box);
    fireEvent.click(await screen.findByText('Retirar permiso'));
    await waitFor(() => expect(quitarMock).toHaveBeenCalledWith('REQUESTER', 'REQUEST.VIEW'));
  });

  it('muestra error de API', async () => {
    detalleMock.mockRejectedValueOnce(new Error('Fallo de red'));
    render(<RoleAdminModal roleCode="REQUESTER" onClose={() => {}} onChanged={() => {}} />);
    expect(await screen.findByText('Fallo de red')).toBeTruthy();
  });

  it('filtra permisos por búsqueda', async () => {
    render(<RoleAdminModal roleCode="REQUESTER" onClose={() => {}} onChanged={() => {}} />);
    await screen.findByText('Crear solicitudes');
    fireEvent.change(screen.getByPlaceholderText('Buscar permiso...'), { target: { value: 'create' } });
    expect(screen.queryByText('REQUEST.VIEW')).toBeNull();
    expect(screen.getByText('Crear solicitudes')).toBeTruthy();
  });
});
