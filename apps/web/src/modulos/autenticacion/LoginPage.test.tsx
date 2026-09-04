// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { LoginPage } from './LoginPage';
import { apiAuthService } from '../../servicios/api/api-auth-service';
import { useSession } from '../../contextos/SessionContext';

vi.mock('../../servicios/api/api-auth-service', () => ({
  apiAuthService: {
    buscarUsuarios: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    session: vi.fn(),
    cambiarPassword: vi.fn(),
  },
}));

vi.mock('../../contextos/SessionContext', () => ({
  useSession: vi.fn(),
}));

const buscarMock = apiAuthService.buscarUsuarios as any;
const cambiarMock = apiAuthService.cambiarPassword as any;
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
    refreshMock.mockResolvedValue(true);
  });
  afterEach(() => cleanup());

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
    fireEvent.click(screen.getByText('Iniciar sesión'));
    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('u-1', 'Secreta123'));
  });

  it('login fallido muestra error genérico', async () => {
    loginMock.mockRejectedValue({ message: 'Usuario o contraseña incorrectos.' });
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Escribe tu nombre…'), { target: { value: 'KEI' } });
    fireEvent.click(await screen.findByText('KEIBER ZAMUDIA'));
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'mal' } });
    fireEvent.click(screen.getByText('Iniciar sesión'));
    expect(await screen.findByText('Usuario o contraseña incorrectos.')).toBeTruthy();
  });

  it('must-change muestra cambio obligatorio sin exponer id', async () => {
    loginMock.mockResolvedValue('must-change');
    cambiarMock.mockResolvedValue({ ok: true });
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Escribe tu nombre…'), { target: { value: 'KEI' } });
    fireEvent.click(await screen.findByText('KEIBER ZAMUDIA'));
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'Inicial123' } });
    fireEvent.click(screen.getByText('Iniciar sesión'));
    expect(await screen.findByText('Debes cambiar tu contraseña')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/u-1/);
  });

  it('cambio correcto usa sesión (sin userId) y vuelve al login', async () => {
    cambiarMock.mockResolvedValue({ ok: true });
    const { container } = render(<LoginPage forcedChange />);
    const view = within(container as HTMLElement);
    expect(await view.findByText('Debes cambiar tu contraseña')).toBeTruthy();
    const inputs = container.querySelectorAll('input[type="password"]');
    fireEvent.change(inputs[0]!, { target: { value: 'Inicial123' } });
    fireEvent.change(inputs[1]!, { target: { value: 'NuevaClave1' } });
    fireEvent.change(inputs[2]!, { target: { value: 'NuevaClave1' } });
    fireEvent.click(view.getByText('Cambiar contraseña'));
    await waitFor(() => expect(cambiarMock).toHaveBeenCalledWith('Inicial123', 'NuevaClave1'));
    expect(await view.findByText(/actualizada correctamente/)).toBeTruthy();
    expect(refreshMock).toHaveBeenCalled();
    fireEvent.click(view.getByText('Volver al login'));
    expect(view.getByText('Bienvenido')).toBeTruthy();
  });

  it('botón deshabilitado durante request', async () => {
    let resolveLogin!: (v: any) => void;
    loginMock.mockImplementation(() => new Promise(r => { resolveLogin = r; }));
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Escribe tu nombre…'), { target: { value: 'KEI' } });
    fireEvent.click(await screen.findByText('KEIBER ZAMUDIA'));
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Iniciar sesión'));
    expect(screen.getByText('Verificando…')).toBeTruthy();
    resolveLogin('ok');
  });
});
