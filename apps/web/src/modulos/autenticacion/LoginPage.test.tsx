// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LoginPage } from './LoginPage';
import { apiAuthService } from '../../servicios/api/api-auth-service';
import { useSession } from '../../contextos/SessionContext';

vi.mock('../../servicios/api/api-auth-service', () => ({
  apiAuthService: {
    buscarUsuarios: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    session: vi.fn(),
  },
}));

vi.mock('../../contextos/SessionContext', () => ({
  useSession: vi.fn(),
}));

const buscarMock = apiAuthService.buscarUsuarios as any;
const loginMock = vi.fn();
const refreshMock = vi.fn();

function mockSession() {
  (useSession as any).mockReturnValue({
    login: loginMock,
    refreshSession: refreshMock,
    user: null,
  });
}

describe('LoginPage 10E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession();
    buscarMock.mockResolvedValue([{ id: 'u-1', displayName: 'KEIBER ZAMUDIA' }]);
    refreshMock.mockResolvedValue(true);  });
  afterEach(() => cleanup());

  it('composición empresarial: marca + formulario separados', async () => {
    const { container } = render(<LoginPage />);
    expect(screen.getByText('Data-Maestra')).toBeTruthy();
    expect(screen.getByText('Gestión inteligente de datos maestros')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(container.querySelector('.login-brand')).toBeTruthy();
    expect(container.querySelector('.login-auth')).toBeTruthy();
    // Sin SSO ni métricas inventadas.
    expect(document.body.textContent).not.toMatch(/Azure|Google|SSO|99\.9|Cluster/);
  });

  it('renderiza login y busca usuarios por nombre', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Escribe tu nombre…'), { target: { value: 'KEI' } });
    const opt = await screen.findByText('KEIBER ZAMUDIA');
    expect(opt).toBeTruthy();
    expect(buscarMock).toHaveBeenCalledWith('KEI');
    expect(document.body.textContent).not.toMatch(/KZAMU|profitCode/);
  });

  it('login correcto delega en el contexto', async () => {
    loginMock.mockResolvedValue('ok');
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Escribe tu nombre…'), { target: { value: 'KEI' } });
    fireEvent.click(await screen.findByText('KEIBER ZAMUDIA'));
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'Secreta123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('u-1', 'Secreta123'));
  });

  it('login fallido muestra error genérico', async () => {
    loginMock.mockRejectedValue({ message: 'Usuario o contraseña incorrectos.' });
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Escribe tu nombre…'), { target: { value: 'KEI' } });
    fireEvent.click(await screen.findByText('KEIBER ZAMUDIA'));
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'mal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByText('Usuario o contraseña incorrectos.')).toBeTruthy();
  });

  it('FASE 15: la contraseña se limpia después del intento (K) y no va a stores globales (J)', async () => {
    loginMock.mockRejectedValue({ message: 'Usuario o contraseña incorrectos.' });
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Escribe tu nombre…'), { target: { value: 'KEI' } });
    fireEvent.click(await screen.findByText('KEIBER ZAMUDIA'));
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'Secreta123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await screen.findByText('Usuario o contraseña incorrectos.');
    // Campo limpio: la contraseña no permanece en memoria de la vista.
    expect((screen.getByPlaceholderText('Contraseña') as HTMLInputElement).value).toBe('');
    expect(document.body.textContent).not.toContain('Secreta123');
  });

  it('botón deshabilitado durante request', async () => {
    let resolveLogin!: (v: any) => void;
    loginMock.mockImplementation(() => new Promise(r => { resolveLogin = r; }));
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Escribe tu nombre…'), { target: { value: 'KEI' } });
    fireEvent.click(await screen.findByText('KEIBER ZAMUDIA'));
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByText('Verificando…')).toBeTruthy();
    resolveLogin('ok');
  });
});
