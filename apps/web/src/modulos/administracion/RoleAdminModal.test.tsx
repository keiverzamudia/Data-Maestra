// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { RoleAdminModal } from './RoleAdminModal';

vi.mock('../../servicios/api/api-roles-service', () => ({
  apiRolesService: {
    detalle: vi.fn(),
    conceder: vi.fn(),
    quitar: vi.fn(),
  },
}));

import { apiRolesService } from '../../servicios/api/api-roles-service';

const DETAIL = {
  code: 'ACCOUNTING',
  name: 'Contabilidad',
  description: null,
  permissions: [{ code: 'ACCOUNTING.APPROVE', description: 'Aprueba validación' }],
  catalog: [
    { code: 'ACCOUNTING.APPROVE', description: 'Aprueba validación' },
    { code: 'ACCOUNTING.VIEW', description: 'Consulta la cola' },
  ],
  users: [
    { displayName: 'Ana Pérez', username: 'aperez', active: true, company: 'Empresa 1', department: 'Contabilidad' },
  ],
};

describe('RoleAdminModal (consola RBAC)', () => {
  beforeEach(() => {
    (apiRolesService.detalle as any).mockResolvedValue(DETAIL);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('título es el rol con subtítulo, sin "Administrar rol —"', async () => {
    render(<RoleAdminModal roleCode="ACCOUNTING" onClose={() => {}} onChanged={() => {}} />);
    await waitFor(() => expect(screen.getAllByText('Contabilidad').length).toBeGreaterThan(0));
    expect(screen.getByText(/Administración del rol/)).toBeDefined();
    expect(screen.queryByText(/Administrar rol —/)).toBeNull();
  });

  it('muestra estado + CONCEDIDO y acción Conceder separados', async () => {
    render(<RoleAdminModal roleCode="ACCOUNTING" onClose={() => {}} onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText('+ CONCEDIDO')).toBeDefined());
    expect(screen.getByText('Sin conceder')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Conceder' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retirar' })).toBeDefined();
    // Sin checkboxes ambiguos
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('conceder llama al endpoint y muestra feedback', async () => {
    const onChanged = vi.fn();
    (apiRolesService.conceder as any).mockResolvedValue({ ok: true, created: true });
    render(<RoleAdminModal roleCode="ACCOUNTING" onClose={() => {}} onChanged={onChanged} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Conceder' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Conceder' }));
    await waitFor(() => expect(apiRolesService.conceder).toHaveBeenCalledWith('ACCOUNTING', 'ACCOUNTING.VIEW'));
    await waitFor(() => expect(screen.getByText('Permiso asignado correctamente')).toBeDefined());
    expect(onChanged).toHaveBeenCalled();
  });

  it('buscador filtra permisos dentro de la toolbar', async () => {
    render(<RoleAdminModal roleCode="ACCOUNTING" onClose={() => {}} onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText('+ CONCEDIDO')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('Buscar permiso...'), { target: { value: 'VIEW' } });
    await waitFor(() => expect(screen.queryByText('+ CONCEDIDO')).toBeNull());
    expect(screen.getByText('Sin conceder')).toBeDefined();
  });

  it('muestra usuarios reales y pie con Cerrar', async () => {
    const { container } = render(<RoleAdminModal roleCode="ACCOUNTING" onClose={() => {}} onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeDefined());
    expect(screen.getByText('Usuarios con este rol (1)')).toBeDefined();
    // Pie del workspace con Cerrar (además del volver del encabezado).
    expect(container.querySelector('.workspace-foot button')).not.toBeNull();
  });
});
