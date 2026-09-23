// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
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
  },
}));

const detalleMock = apiUsuariosService.detalle as any;
const cambiarMock = apiUsuariosService.cambiarEstado as any;
const fijarMock = apiUsuariosService.fijarOverride as any;
const quitarOverrideMock = apiUsuariosService.quitarOverride as any;
const asignarMock = apiUsuariosService.asignarRol as any;
const quitarRolMock = apiUsuariosService.quitarRol as any;

const DETAIL: any = {
  id: 'u1',
  username: 'ABG',
  displayName: 'ABIGAIL GALLARDO',
  email: null,
  profitCode: 'ABG',
  active: true,
  lastLoginAt: '2026-09-10T13:00:00.000Z',
  userRoles: [
    {
      id: 'ur1',
      company: { id: 'c1', name: 'Empresa A — Distribuidora Central', code: 'EMP-A' },
      department: { id: 'd1', name: 'Almacén General', code: 'ALMACEN' },
      role: { code: 'WAREHOUSE', name: 'Almacén' },
    },
  ],
  permissionOverrides: [
    { effect: 'GRANT', permission: { code: 'PROFIT.WRITE' } },
    { effect: 'DENY', permission: { code: 'IMPORT.RUN' } },
  ],
  roleCodes: ['WAREHOUSE'],
  effectivePermissions: [
    { code: 'DASHBOARD.VIEW', source: 'HEREDADO', granted: true },
    { code: 'REQUEST.CREATE', source: 'HEREDADO', granted: true },
    { code: 'REQUEST.VIEW', source: 'HEREDADO', granted: true },
    { code: 'WAREHOUSE.CLASSIFY', source: 'HEREDADO', granted: true },
    { code: 'WAREHOUSE.VIEW', source: 'HEREDADO', granted: true },
    { code: 'PROFIT.WRITE', source: 'CONCEDIDO', granted: true },
    { code: 'IMPORT.RUN', source: 'DENEGADO', granted: false },
  ],
  permissionCatalog: [
    'DASHBOARD.VIEW',
    'REQUEST.CREATE',
    'REQUEST.VIEW',
    'WAREHOUSE.CLASSIFY',
    'WAREHOUSE.VIEW',
    'PROFIT.WRITE',
    'IMPORT.RUN',
  ],
};

const EMPRESAS: any = [
  { id: 'c1', name: 'Empresa A — Distribuidora Central', code: 'EMP-A', active: true },
];
const DEPTOS: any = [
  { id: 'd1', companyId: 'c1', name: 'Almacén General', code: 'ALMACEN', active: true },
];
const ROLES: any = [
  { id: 'r3', code: 'WAREHOUSE', name: 'Almacén' },
  { id: 'r8', code: 'WAREHOUSE_MANAGER', name: 'Encargado de Almacén' },
];

function renderModal() {
  return render(
    <UserAdminModal
      userId="u1"
      empresas={EMPRESAS}
      departamentos={DEPTOS}
      roles={ROLES}
      onClose={() => {}}
      onChanged={() => {}}
    />,
  );
}

describe('UserAdminModal — rediseño drawer Administrar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detalleMock.mockResolvedValue(structuredClone(DETAIL));
    cambiarMock.mockResolvedValue({});
    asignarMock.mockResolvedValue({ ok: true });
    quitarRolMock.mockResolvedValue({ ok: true });
    fijarMock.mockResolvedValue({ ok: true });
    quitarOverrideMock.mockResolvedValue({ ok: true });
  });
  afterEach(() => cleanup());

  it('cabecera con identidad Profit, asignaciones y matriz', async () => {
    renderModal();
    expect(await screen.findByText('Administrar — ABIGAIL GALLARDO')).toBeTruthy();
    expect(screen.getByText('Identidad respaldada por Profit Plus ERP')).toBeTruthy();
    expect(screen.getByText('Sincronizado')).toBeTruthy();
    expect(screen.getByText('Empresa A — Distribuidora Central')).toBeTruthy();
    expect(screen.getByText(/1 asignación/)).toBeTruthy();
    expect(screen.getByText(/Rol derivado de departamento: Almacén/)).toBeTruthy();
    expect(screen.getByText('Matriz de permisos individuales')).toBeTruthy();
    expect(screen.getByText('Restablecer al Rol')).toBeTruthy();
    // Plantilla oculta por decisión de diseño.
    expect(screen.queryByText('Aplicar Plantilla')).toBeNull();
  });

  it('contadores de matriz y chips de filtro con valores reales', async () => {
    renderModal();
    await screen.findByText('Matriz de permisos individuales');
    const chips = screen.getByLabelText('Resumen de permisos');
    expect(chips.textContent).toContain('Heredados del Rol');
    expect(chips.textContent).toContain('5');
    expect(chips.textContent).toContain('Concedidos Manual');
    expect(chips.textContent).toContain('Denegados / Bloqueados');
    expect(screen.getByText(/Sobrescritos \(2\)/)).toBeTruthy();
    expect(screen.getByText(/Todos \(7\)/)).toBeTruthy();
    expect(screen.getByText(/WAREHOUSE \(2\)/)).toBeTruthy();
  });

  it('Conceder/Denegar encola cambios y NO llama API hasta Guardar', async () => {
    renderModal();
    await screen.findByText('Matriz de permisos individuales');
    // REQUEST.VIEW está heredado → clic Denegar encola DENY
    const row = screen.getByText('Consultar solicitudes').closest('.admin-perm-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Denegar' }));
    expect(await screen.findByText(/1 cambio en matriz pendiente por guardar/)).toBeTruthy();
    expect(fijarMock).not.toHaveBeenCalled();
    expect(quitarOverrideMock).not.toHaveBeenCalled();
    // Guardar sí dispara la API
    fireEvent.click(screen.getByText('Guardar cambios en permisos'));
    await waitFor(() => expect(fijarMock).toHaveBeenCalledWith('u1', { permissionCode: 'REQUEST.VIEW', effect: 'DENY' }));
    await waitFor(() => expect(screen.queryByText(/pendiente por guardar/)).toBeNull());
  });

  it('Cancelar descarta pendientes sin llamar API', async () => {
    renderModal();
    await screen.findByText('Matriz de permisos individuales');
    const row = screen.getByText('Crear solicitudes').closest('.admin-perm-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Concedido' }));
    expect(await screen.findByText(/1 cambio en matriz pendiente por guardar/)).toBeTruthy();
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByText(/pendiente por guardar/)).toBeNull();
    expect(fijarMock).not.toHaveBeenCalled();
    expect(quitarOverrideMock).not.toHaveBeenCalled();
  });

  it('Restablecer al Rol encola CLEAR para todos los overrides existentes', async () => {
    renderModal();
    await screen.findByText('Matriz de permisos individuales');
    expect(screen.getByText(/Sobrescritos \(2\)/)).toBeTruthy();
    fireEvent.click(screen.getByText('Restablecer al Rol'));
    expect(await screen.findByText(/2 cambios en matriz pendientes por guardar/)).toBeTruthy();
    expect(quitarOverrideMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Guardar cambios en permisos'));
    await waitFor(() => expect(quitarOverrideMock).toHaveBeenCalledWith('u1', 'PROFIT.WRITE'));
    await waitFor(() => expect(quitarOverrideMock).toHaveBeenCalledWith('u1', 'IMPORT.RUN'));
  });

  it('asignar estructura con botón + llama asignarRol', async () => {
    renderModal();
    await screen.findByText('Añadir nueva asignación de estructura');
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText('Departamento'), { target: { value: 'd1' } });
    fireEvent.change(screen.getByLabelText('Rol primario'), { target: { value: 'WAREHOUSE_MANAGER' } });
    fireEvent.click(screen.getByLabelText('Asignar estructura'));
    await waitFor(() =>
      expect(asignarMock).toHaveBeenCalledWith('u1', {
        roleCode: 'WAREHOUSE_MANAGER',
        companyId: 'c1',
        departmentId: 'd1',
      }),
    );
  });

  it('quitar asignación llama quitarRol', async () => {
    renderModal();
    await screen.findByText(/1 asignación/);
    fireEvent.click(screen.getByLabelText(/Quitar asignación EMP-A/));
    await waitFor(() =>
      expect(quitarRolMock).toHaveBeenCalledWith('u1', {
        roleCode: 'WAREHOUSE',
        companyId: 'c1',
        departmentId: 'd1',
      }),
    );
  });

  it('drawer con secciones y desactivar pide confirmación', async () => {
    renderModal();
    expect(await screen.findByText('Administrar — ABIGAIL GALLARDO')).toBeTruthy();
    expect(screen.getByText('Seguridad')).toBeTruthy();
    fireEvent.click(screen.getByText('Desactivar usuario'));
    expect(await screen.findByText(/¿Desactivar a ABIGAIL GALLARDO\?/)).toBeTruthy();
    fireEvent.click(screen.getByText('Desactivar'));
    expect(cambiarMock).toHaveBeenCalledWith('u1', false);
  });

  it('FASE 15: sin restablecimiento local de contraseña', async () => {
    renderModal();
    expect(await screen.findByText('Administrar — ABIGAIL GALLARDO')).toBeTruthy();
    expect(screen.queryByText('Restablecer contraseña')).toBeNull();
    expect(screen.queryByText('Confirmar restablecimiento')).toBeNull();
  });

  it('error de carga con reintento', async () => {
    detalleMock.mockRejectedValueOnce(new Error('Fallo carga'));
    renderModal();
    expect(await screen.findByText('Fallo carga')).toBeTruthy();
    expect(screen.getByText('Reintentar')).toBeTruthy();
  });

  it('filtro Sobrescritos muestra solo overrides', async () => {
    renderModal();
    await screen.findByText('Matriz de permisos individuales');
    fireEvent.click(screen.getByText(/Sobrescritos \(2\)/));
    expect(screen.getByText('Crear artículos en Profit')).toBeTruthy();
    expect(screen.getByText('Ejecutar importaciones')).toBeTruthy();
    expect(screen.queryByText('Consultar solicitudes')).toBeNull();
    expect(screen.queryByText('Consultar panel principal')).toBeNull();
  });
});

// helper local (jsdom + RTL)
function within(el: HTMLElement) {
  return {
    getByRole: (role: string, opts?: { name?: string | RegExp }) => {
      const nodes = el.querySelectorAll('button, [role="button"]');
      const arr = Array.from(nodes) as HTMLElement[];
      const found = arr.find(n => {
        if (opts?.name === undefined) return true;
        const text = n.getAttribute('aria-label') || n.textContent || '';
        if (typeof opts.name === 'string') return text === opts.name || text.includes(opts.name);
        return opts.name.test(text);
      });
      if (!found) throw new Error(`within: no ${role} ${String(opts?.name)}`);
      return found;
    },
  };
}
