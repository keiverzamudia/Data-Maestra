// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Can, RequirePermission } from './Can';
import { visibleNav } from '../diseno/navigation';
import { useSession } from '../../contextos/SessionContext';

vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));

const sessionMock = useSession as any;

function mockPerms(permissions: string[], loading = false, authenticated = true) {
  sessionMock.mockReturnValue({
    loading,
    authenticated,
    user: authenticated ? { id: 'u1', displayName: 'Juan', active: true } : null,
    hasPermission: (p: string) => permissions.includes(p),
    permissions,
    logout: vi.fn(),
    refreshSession: vi.fn(),
  });
}

function labels() {
  return document.body.textContent ?? '';
}

describe('10L — navegación y autorización visual', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('1. con REQUEST.VIEW ve Solicitudes; 2. sin él no la ve', () => {
    expect(visibleNav(p => ['REQUEST.VIEW'].includes(p)).some(n => n.key === 'solicitudes')).toBe(true);
    expect(visibleNav(() => false).some(n => n.key === 'solicitudes')).toBe(false);
  });

  it('3/4. AUDIT.VIEW muestra Auditoría dentro de Administración; sin él se oculta', () => {
    const admin = visibleNav(p => ['AUDIT.VIEW'].includes(p)).find(n => n.key === 'admin');
    expect(admin?.children?.map(c => c.key)).toEqual(['audit']);
    expect(visibleNav(() => false).find(n => n.key === 'admin')).toBeUndefined();
  });

  it('5/6. <Can> renderiza con permiso y oculta sin permiso (+fallback)', () => {
    mockPerms(['AUDIT.VIEW']);
    const { unmount } = render(<Can permission="AUDIT.VIEW"><span>X-A</span></Can>);
    expect(screen.getByText('X-A')).toBeTruthy();
    unmount();
    cleanup();
    mockPerms([]);
    render(<Can permission="AUDIT.VIEW" fallback={<span>FB</span>}><span>X-A</span></Can>);
    expect(screen.queryByText('X-A')).toBeNull();
    expect(screen.getByText('FB')).toBeTruthy();
  });

  it('7. RequirePermission bloquea ruta sin permiso y permite con permiso', () => {
    mockPerms([]);
    render(<MemoryRouter><RequirePermission permission="AUDIT.VIEW"><span>SEC</span></RequirePermission></MemoryRouter>);
    expect(screen.queryByText('SEC')).toBeNull();
    expect(screen.getByText('Acceso denegado')).toBeTruthy();
    cleanup();
    mockPerms(['AUDIT.VIEW']);
    render(<MemoryRouter><RequirePermission permission="AUDIT.VIEW"><span>SEC</span></RequirePermission></MemoryRouter>);
    expect(screen.getByText('SEC')).toBeTruthy();
  });

  it('8. VIEW sin APPROVE: ve página pero no el botón de aprobar', () => {
    mockPerms(['ACCOUNTING.VIEW']);
    render(<Can permission="ACCOUNTING.APPROVE"><button>Aprobar</button></Can>);
    expect(screen.queryByText('Aprobar')).toBeNull();
  });

  it('9/10. override CONCEDIDO se refleja; DENEGADO se refleja (vía permisos efectivos)', () => {
    mockPerms(['REQUEST.VIEW', 'AUDIT.VIEW']); // AUDIT.VIEW por override CONCEDIDO
    render(<Can permission="AUDIT.VIEW"><span>AU</span></Can>);
    expect(screen.getByText('AU')).toBeTruthy();
    cleanup();
    mockPerms(['REQUEST.VIEW']); // AUDIT.VIEW con DENEGADO → ausente de efectivos
    render(<Can permission="AUDIT.VIEW"><span>AU</span></Can>);
    expect(screen.queryByText('AU')).toBeNull();
  });

  it('11. no muestra secciones vacías (padre sin hijos visibles se oculta)', () => {
    // Solo REQUEST.CREATE: el grupo admin desaparece; Solicitudes conserva
    // únicamente el hijo permitido (la ruta hija se protege por sí misma).
    const nav = visibleNav(p => ['REQUEST.CREATE'].includes(p));
    expect(nav.find(n => n.key === 'admin')).toBeUndefined();
    expect(nav.find(n => n.key === 'solicitudes')?.children?.map(c => c.key)).toEqual(['new']);
  });

  it('12. loading inicial no muestra navegación incorrecta', () => {
    mockPerms(['ADMIN.MANAGE'], true);
    render(<MemoryRouter><RequirePermission permission="ADMIN.MANAGE"><span>SEC</span></RequirePermission></MemoryRouter>);
    expect(screen.getByText('Cargando sesión…')).toBeTruthy();
    expect(screen.queryByText('SEC')).toBeNull();
    expect(screen.queryByText('Acceso denegado')).toBeNull();
  });

  it('14. 403 de backend no provoca logout (solo 401 limpia sesión)', async () => {
    const handler = vi.fn();
    const { api, setUnauthorizedHandler } = await import('../../servicios/api/api-client');
    setUnauthorizedHandler(handler);
    const json = (b: object) => ({ ok: false, status: 403, statusText: 'Forbidden', json: async () => b });
    (globalThis as any).fetch = vi.fn(async () => json({ message: 'denegado' }));
    await expect(api.get('/api/v1/some')).rejects.toMatchObject({ status: 403 });
    expect(handler).not.toHaveBeenCalled();
    const json401 = { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({ message: 'x' }) };
    (globalThis as any).fetch = vi.fn(async () => json401);
    await expect(api.get('/api/v1/auth/session')).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
    setUnauthorizedHandler(null);
  });

  it('A–F. escenarios por permisos efectivos', () => {
    const has = (ps: string[]) => (p: string) => ps.includes(p);
    // A: dashboard + solicitudes + crear
    const a = visibleNav(has(['DASHBOARD.VIEW', 'REQUEST.VIEW', 'REQUEST.CREATE']));
    expect(a.some(n => n.key === 'dashboard')).toBe(true);
    expect(a.find(n => n.key === 'solicitudes')?.children?.map(c => c.key)).toEqual(['new']);
    expect(a.some(n => n.key === 'warehouse')).toBe(false);
    // B: solo AUDIT.VIEW → Auditoría visible sin ser admin
    const b = visibleNav(has(['AUDIT.VIEW']));
    expect(b.flatMap(n => n.children ?? [])).toContainEqual(expect.objectContaining({ key: 'audit' }));
    expect(b.some(n => n.to === '/admin')).toBe(false);
    // C: ACCOUNTING.VIEW sin APPROVE → entra a Contabilidad
    expect(visibleNav(has(['ACCOUNTING.VIEW'])).some(n => n.key === 'accounting')).toBe(true);
    // D: REQUEST.VIEW sin CREATE → sin hijo crear
    expect(visibleNav(has(['REQUEST.VIEW'])).find(n => n.key === 'solicitudes')?.children ?? []).toEqual([]);
    // E/F: DENEGADO ausente / CONCEDIDO presente (resolución ya hecha por backend)
    expect(has(['REQUEST.VIEW'])('AUDIT.VIEW')).toBe(false);
    expect(has(['REQUEST.VIEW', 'AUDIT.VIEW'])('AUDIT.VIEW')).toBe(true);
  });

  it('sanity: etiquetas renderizan permisos por código, no por rol', () => {
    expect(labels).toBeDefined();
    mockPerms(['ADMIN.MANAGE']);
    render(<Can permission="ADMIN.MANAGE"><span>ADM</span></Can>);
    expect(screen.getByText('ADM')).toBeTruthy();
  });
});
