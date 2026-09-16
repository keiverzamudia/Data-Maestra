// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { RoleAdminModal } from './RoleAdminModal';
import { resolveHomeRoute } from '../../utilidades/vista-principal';

vi.mock('../../servicios/api/api-roles-service', () => ({
  apiRolesService: {
    detalle: vi.fn(),
    conceder: vi.fn(),
    quitar: vi.fn(),
    vista: vi.fn(),
  },
}));

import { apiRolesService } from '../../servicios/api/api-roles-service';

const DETAIL = {
  code: 'ACCOUNTING',
  name: 'Contabilidad',
  description: null,
  defaultView: null,
  availableViews: [
    { key: 'solicitudes', label: 'Mis solicitudes', route: '/solicitudes', permission: 'REQUEST.VIEW' },
    { key: 'accounting', label: 'Contabilidad', route: '/accounting', permission: 'ACCOUNTING.VIEW' },
  ],
  permissions: [{ code: 'ACCOUNTING.VIEW', description: null }],
  catalog: [{ code: 'ACCOUNTING.VIEW', description: null }],
  users: [],
};

describe('FASE 18 — vista principal en Roles y permisos', () => {
  beforeEach(() => {
    (apiRolesService.detalle as any).mockResolvedValue(structuredClone(DETAIL));
    (apiRolesService.vista as any).mockResolvedValue({ ok: true, defaultView: 'accounting' });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('Caso 10: cambiar la vista persiste en backend', async () => {
    const onChanged = vi.fn();
    render(<RoleAdminModal roleCode="ACCOUNTING" onClose={() => {}} onChanged={onChanged} />);
    const select = await screen.findByLabelText('Vista principal del rol');
    fireEvent.change(select, { target: { value: 'accounting' } });
    await waitFor(() => expect(apiRolesService.vista).toHaveBeenCalledWith('ACCOUNTING', 'accounting'));
    expect(onChanged).toHaveBeenCalled();
    expect(await screen.findByText('Vista principal guardada.')).toBeTruthy();
  });
});

describe('FASE 18 — resolveHomeRoute', () => {
  it('Caso 7: sin vista → Mis solicitudes', () => {
    expect(resolveHomeRoute(null, () => true)).toBe('/solicitudes');
    expect(resolveHomeRoute(undefined, () => true)).toBe('/solicitudes');
  });

  it('Caso 8: vista con permiso → su ruta', () => {
    expect(resolveHomeRoute({ route: '/accounting', permission: 'ACCOUNTING.VIEW' }, (p) => p === 'ACCOUNTING.VIEW')).toBe('/accounting');
  });

  it('Caso 9: vista sin permiso → fallback seguro', () => {
    expect(resolveHomeRoute({ route: '/accounting', permission: 'ACCOUNTING.VIEW' }, () => false)).toBe('/solicitudes');
  });
});
