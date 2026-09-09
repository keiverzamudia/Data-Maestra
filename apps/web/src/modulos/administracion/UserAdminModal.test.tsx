// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { UserAdminModal } from './UserAdminModal';
import { apiUsuariosService } from '../../servicios/api/api-usuarios-service';

vi.mock('../../servicios/api/api-usuarios-service', () => ({
  apiUsuariosService: {
    detalle: vi.fn(),
    cambiarEstado: vi.fn(),
    asignarRol: vi.fn(),
    quitarRol: vi.fn(),
    fijarOverride: vi.fn(),
    quitarOverride: vi.fn(),
    restablecerPassword: vi.fn(),
  },
}));

const detalleMock = apiUsuariosService.detalle as any;
const cambiarMock = apiUsuariosService.cambiarEstado as any;

const DETAIL: any = {
  id: 'u1', username: 'j.perez', displayName: 'Juan Pérez', email: null,
  profitCode: 'KZAMU', active: true, mustChangePassword: false,
  lastLoginAt: null, userRoles: [], permissionOverrides: [],
  roleCodes: ['REQUESTER'], effectivePermissions: [], permissionCatalog: [],
};

describe('UserAdminModal 11D', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detalleMock.mockResolvedValue(structuredClone(DETAIL));
  });
  afterEach(() => cleanup());

  it('drawer con secciones y desactivar pide confirmación', async () => {
    cambiarMock.mockResolvedValue({});
    render(
      <UserAdminModal userId="u1" empresas={[]} departamentos={[]} roles={[]} onClose={() => {}} onChanged={() => {}} />,
    );
    expect(await screen.findByText('Administrar — Juan Pérez')).toBeTruthy();
    expect(screen.getByText('5. Seguridad')).toBeTruthy();
    fireEvent.click(screen.getByText('Desactivar usuario'));
    expect(await screen.findByText(/¿Desactivar a Juan Pérez\?/)).toBeTruthy();
    fireEvent.click(screen.getByText('Desactivar'));
    expect(cambiarMock).toHaveBeenCalledWith('u1', false);
  });

  it('error de carga con reintento', async () => {
    detalleMock.mockRejectedValueOnce(new Error('Fallo carga'));
    render(
      <UserAdminModal userId="u1" empresas={[]} departamentos={[]} roles={[]} onClose={() => {}} onChanged={() => {}} />,
    );
    expect(await screen.findByText('Fallo carga')).toBeTruthy();
    expect(screen.getByText('Reintentar')).toBeTruthy();
  });
});
