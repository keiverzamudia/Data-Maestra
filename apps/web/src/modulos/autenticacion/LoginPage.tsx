import * as React from 'react';
import { useSession } from '../../contextos/SessionContext';
import { apiAuthService, type LoginCandidate } from '../../servicios/api/api-auth-service';
import { PageHeader, Button, Input } from '../../componentes/ui';

interface Props {
  /** Gate lo usa cuando la sesión vigente exige cambio obligatorio. */
  forcedChange?: boolean;
}

/**
 * FASE 10E — Login real de aplicación (sin JWT en JS; cookie HttpOnly).
 * Autocomplete muestra solo displayName; el id queda interno.
 * Tras cambio correcto las sesiones se revocan y se vuelve al login.
 */
export const LoginPage: React.FC<Props> = ({ forcedChange }) => {
  const { login, refreshSession, user } = useSession();
  const [text, setText] = React.useState('');
  const [candidates, setCandidates] = React.useState<LoginCandidate[]>([]);
  const [selected, setSelected] = React.useState<LoginCandidate | null>(null);
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [showPass, setShowPass] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Cambio obligatorio
  const [mustChange, setMustChange] = React.useState(!!forcedChange);
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [changed, setChanged] = React.useState(false);
  const reqId = React.useRef(0);

  // Autocomplete server-side con debounce; descarta respuestas viejas.
  // Sin filtrado en frontend: los candidatos son siempre los del servidor.
  React.useEffect(() => {
    if (selected || text.trim().length < 2) {
      setCandidates([]);
      setOpen(false);
      setSearchError(null);
      if (text.trim().length < 2) setSearching(false);
      return;
    }
    setSearching(true);
    const my = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const rows = await apiAuthService.buscarUsuarios(text.trim());
        if (reqId.current === my) {
          setCandidates(rows);
          setSearchError(null);
          setOpen(true);
        }
      } catch {
        if (reqId.current === my) {
          setCandidates([]);
          setSearchError('No se pudo buscar. Reintenta.');
          setOpen(false);
        }
      } finally {
        if (reqId.current === my) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [text, selected]);

  const resetToLogin = () => {
    setMustChange(false);
    setChanged(false);
    setCurrent('');
    setNext('');
    setConfirm('');
    setPassword('');
    setError(null);
    setSearchError(null);
    setSelected(null);
    setText('');
  };

  const handleLogin = async () => {
    if (!selected || loading) return;
    setLoading(true);
    setError(null);
    try {
      const st = await login(selected.id, password);
      if (st === 'must-change') {
        setCurrent(password);
        setMustChange(true);
      }
      // Si 'ok', el Gate muestra la aplicación automáticamente.
    } catch (err: any) {
      setError(err?.message || 'Usuario o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = async () => {
    if (loading) return;
    if (next !== confirm) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    if (next.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiAuthService.cambiarPassword(current, next);
      // Las sesiones quedan revocadas: revalidar lleva al login.
      await refreshSession();
      // NOTA: mustChange se mantiene true hasta el próximo login con sesión
      // válida; si se pusiera false aquí, la condición de vista mostraría el
      // login en lugar del mensaje de éxito.
      setChanged(true);
    } catch (err: any) {
      setError(err?.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  // En modo cambio forzado la identidad viene de la sesión (nunca del input).
  const changeTitle = user ? `Cambio obligatorio — ${user.displayName}` : 'Debes cambiar tu contraseña';

  return (
    <div className="login-wrap">
      <div className="card p16 login-card">
        <PageHeader title="Data-Maestra" subtitle="Gestión inteligente de datos maestros" />
        {!mustChange ? (
          <div className="stack-sm">
            <h3 className="h1" style={{ fontSize: 16 }}>Bienvenido</h3>
            <p className="muted small">Ingresa con tu usuario corporativo</p>
            <label>
              <span className="muted small">Usuario</span>
              <Input
                value={selected ? selected.displayName : text}
                onChange={e => { setText(e.target.value); setSelected(null); }}
                onFocus={() => candidates.length && setOpen(true)}
                placeholder="Escribe tu nombre…"
                autoComplete="off"
                disabled={loading}
              />
            </label>
            {searching && <span className="muted small">Buscando…</span>}
            {open && candidates.length > 0 && (
              <div className="card p16" style={{ marginTop: -4 }}>
                {candidates.map(c => (
                  <button
                    key={c.id}
                    className="btn btn-ghost"
                    style={{ display: 'block', width: '100%', textAlign: 'left' }}
                    onClick={() => { setSelected(c); setOpen(false); setSearchError(null); setError(null); }}
                  >
                    {c.displayName}
                  </button>
                ))}
              </div>
            )}
            {!selected && !searching && !searchError && open && candidates.length === 0 && text.trim().length >= 2 && (
              <div className="card p16" style={{ marginTop: -4 }}>
                <span className="muted small">Sin resultados</span>
              </div>
            )}
            {!searching && searchError && (
              <div className="alert" style={{ background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>{searchError}</div>
            )}
            <label>
              <span className="muted small">Contraseña</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
                  placeholder="Contraseña"
                  disabled={loading || !selected}
                />
                <Button variant="secondary" onClick={() => setShowPass(v => !v)} disabled={loading}>
                  {showPass ? 'Ocultar' : 'Ver'}
                </Button>
              </div>
            </label>
            <Button onClick={handleLogin} disabled={loading || !selected || !password}>
              {loading ? 'Verificando…' : 'Iniciar sesión'}
            </Button>
            {error && <div className="alert" style={{ background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>{error}</div>}
            <p className="muted small">Acceso corporativo. Si es tu primer ingreso deberás cambiar tu contraseña.</p>
          </div>
        ) : !changed ? (
          <div className="stack-sm">
            <h3 className="h1" style={{ fontSize: 16 }}>{forcedChange ? changeTitle : 'Debes cambiar tu contraseña'}</h3>
            <p className="muted small">Debes cambiar tu contraseña antes de continuar.</p>
            <label>
              <span className="muted small">Contraseña actual</span>
              <Input type="password" value={current} onChange={e => setCurrent(e.target.value)} disabled={loading} />
            </label>
            <label>
              <span className="muted small">Nueva contraseña (mínimo 8 caracteres)</span>
              <Input type="password" value={next} onChange={e => setNext(e.target.value)} disabled={loading} />
            </label>
            <label>
              <span className="muted small">Confirmar nueva contraseña</span>
              <Input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleChange(); }}
                disabled={loading}
              />
            </label>
            <Button onClick={handleChange} disabled={loading || !current || !next || !confirm}>
              {loading ? 'Actualizando…' : 'Cambiar contraseña'}
            </Button>
            {error && <div className="alert" style={{ background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>{error}</div>}
          </div>
        ) : (
          <div className="stack-sm">
            <div className="alert" style={{ background: '#dcfce7', borderColor: '#86efac', color: '#166534' }}>
              Contraseña actualizada correctamente. Tus sesiones fueron cerradas: ingresa de nuevo.
            </div>
            <Button onClick={resetToLogin}>Volver al login</Button>
          </div>
        )}
      </div>
    </div>
  );
};
