// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { SessionProvider, useSession } from './SessionContext';
import { apiAuthService } from '../servicios/api/api-auth-service';

vi.mock('../servicios/api/api-auth-service', () => ({
  apiAuthService: {
    buscarUsuarios: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    session: vi.fn(),
    cambiarPassword: vi.fn(),
  },
}));

const sessionMock = apiAuthService.session as any;
const loginMock = apiAuthService.login as any;
const logoutMock = apiAuthService.logout as any;

function Probe() {
  const s = useSession();
  return (
    <div>
      <span data-testid="loading">{String(s.loading)}</span>
      <span data-testid="auth">{String(s.authenticated)}</span>
      <span data-testid="user">{s.user?.displayName ?? 'none'}</span>
      <span data-testid="mcp">{String(s.mustChangePassword)}</span>
      <button onClick={() => s.login('u-1', 'x')}>go-login</button>
      <button onClick={() => s.logout()}>go-logout</button>
    </div>
  );
}

const FULL = {
  authenticated: true,
  user: { id: 'u-1', displayName: 'KEIBER ZAMUDIA', active: true },
  mustChangePassword: false,
  roleCodes: ['REQUESTER'],
  permissions: ['REQUEST.VIEW'],
  memberships: [],
  sessionId: 's1',
};

describe('SessionContext 10E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionMock.mockResolvedValue(FULL);
  });
  afterEach(() => cleanup());

  it('loading inicial y reconstruye sesión válida', async () => {
    render(<SessionProvider><Probe /></SessionProvider>);
    expect(screen.getByTestId('loading').textContent).toBe('true');
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('auth').textContent).toBe('true');
    expect(screen.getByTestId('user').textContent).toBe('KEIBER ZAMUDIA');
  });

  it('sin sesión queda no autenticado', async () => {
    sessionMock.mockRejectedValue({ status: 401, message: 'x' });
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('auth').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('mustChangePassword se expone', async () => {
    sessionMock.mockResolvedValue({ ...FULL, mustChangePassword: true });
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(screen.getByTestId('mcp').textContent).toBe('true'));
  });

  it('login delega y refresca; logout revoca y limpia', async () => {
    loginMock.mockResolvedValue({ authenticated: true, user: FULL.user, mustChangePassword: false });
    logoutMock.mockResolvedValue({ ok: true });
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    fireEvent.click(screen.getByText('go-login'));
    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('u-1', 'x'));
    fireEvent.click(screen.getByText('go-logout'));
    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('auth').textContent).toBe('false');
    });
  });
});
