import * as React from 'react';
import { useSession } from '../../contextos/SessionContext';
import { apiAuthService, type LoginCandidate } from '../../servicios/api/api-auth-service';
import { Button, Input, Alert } from '../../componentes/ui';

interface Props {
  /** Gate lo usa cuando la sesión vigente exige cambio obligatorio. */
  forcedChange?: boolean;
}

/** Iconos propios del sistema (trazo actual, sin emojis como icono). */
const EyeIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.5 10.5 0 0 1 12 19c-6.5 0-10-7-10-7a17.6 17.6 0 0 1 4.06-4.94" />
    <path d="M9.9 4.24A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-2.16 3.19" />
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

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
  // FASE CIERRE VISUAL — asset oficial SAN LUIS (public/brand/isologo-san-luis.svg).
  // Si el archivo no existe, se muestra el wordmark textual. Nunca inventar logo.
  const [brandOk, setBrandOk] = React.useState(true);
  const [brandAzulOk, setBrandAzulOk] = React.useState(true);

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
    <div className="login-page">
      <aside className="login-brand" aria-label="Data-Maestra">
        {brandOk ? (
          <img src="/brand/isologo-san-luis.svg" alt="San Luis" className="brand-asset brand-asset-invert" onError={() => setBrandOk(false)} />
        ) : (
          <p className="login-sl">San Luis</p>
        )}
        <div className="login-brand-top">
          <span className="login-product">
            <span className="login-brand-name brand-display">Data-Maestra</span>
            <span className="login-brand-sub">Gestión de Datos Maestros</span>
          </span>
        </div>
        <h1 className="login-tagline">Gestión inteligente de datos maestros</h1>
        <p className="login-brand-desc">
          Plataforma corporativa para normalizar, homologar y aprobar artículos
          de todas las empresas antes de registrarlos en Profit.
        </p>
        <svg className="login-motif" viewBox="0 0 320 84" aria-hidden="true">
          <line x1="28" y1="30" x2="128" y2="30" className="motif-line" />
          <line x1="192" y1="30" x2="292" y2="30" className="motif-line" />
          <rect x="12" y="14" width="32" height="32" rx="6" className="motif-node" />
          <rect x="128" y="14" width="32" height="32" rx="6" className="motif-node motif-node-main" />
          <rect x="276" y="14" width="32" height="32" rx="6" className="motif-node" />
          <text x="28" y="62" textAnchor="middle" className="motif-cap">Origen</text>
          <text x="144" y="62" textAnchor="middle" className="motif-cap">Norma</text>
          <text x="292" y="62" textAnchor="middle" className="motif-cap">Maestro</text>
        </svg>
        <ul className="login-points">
          <li><strong>Normalización</strong><span>Estandariza descripciones y atributos.</span></li>
          <li><strong>Gobernanza</strong><span>Cada artículo pasa por aprobación responsable.</span></li>
          <li><strong>Validación</strong><span>Almacén y contabilidad verifican.</span></li>
          <li><strong>Trazabilidad</strong><span>Cada acción queda en auditoría.</span></li>
        </ul>
        <p className="login-brand-foot">Acceso corporativo</p>
      </aside>
      <main className="login-auth">
        <div className="login-form">
          {!mustChange ? (
            <div className="stack-sm">
              {brandAzulOk && (
                <img src="/brand/isologo-san-luis-azul.svg" alt="San Luis" className="brand-asset-sm" onError={() => setBrandAzulOk(false)} />
              )}
              <h2 className="login-title">Iniciar sesión</h2>
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
                  role="combobox"
                  aria-expanded={open && candidates.length > 0}
                  aria-controls="login-user-listbox"
                  aria-autocomplete="list"
                />
              </label>
              {searching && <span className="muted small" role="status">Buscando…</span>}
              {open && candidates.length > 0 && (
                <div className="card p16 login-suggest" role="listbox" id="login-user-listbox" aria-label="Usuarios encontrados">
                  {candidates.map(c => (
                    <button
                      key={c.id}
                      role="option"
                      aria-selected={selected?.id === c.id}
                      className="btn btn-ghost login-suggest-item"
                      onClick={() => { setSelected(c); setOpen(false); setSearchError(null); setError(null); }}
                    >
                      {c.displayName}
                    </button>
                  ))}
                </div>
              )}
              {!selected && !searching && !searchError && open && candidates.length === 0 && text.trim().length >= 2 && (
                <div className="card p16 login-suggest">
                  <span className="muted small">Sin resultados</span>
                </div>
              )}
              {!searching && searchError && (
                <Alert tone="danger">{searchError}</Alert>
              )}
              <label>
                <span className="muted small">Contraseña</span>
                <div className="pass-wrap">
                  <Input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
                    placeholder="Contraseña"
                    disabled={loading || !selected}
                  />
                  <button
                    type="button"
                    className="pass-toggle"
                    onClick={() => setShowPass(v => !v)}
                    disabled={loading}
                    aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showPass}
                    title={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPass ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </label>
              <Button onClick={handleLogin} disabled={loading || !selected || !password}>
                {loading ? 'Verificando…' : 'Iniciar sesión'}
              </Button>
              {error && <Alert tone="danger">{error}</Alert>}
              <p className="muted small">Acceso corporativo. Si es tu primer ingreso deberás cambiar tu contraseña.</p>
            </div>
          ) : !changed ? (
            <div className="stack-sm">
              <h2 className="login-title">{forcedChange ? changeTitle : 'Debes cambiar tu contraseña'}</h2>
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
              {error && <Alert tone="danger">{error}</Alert>}
            </div>
          ) : (
            <div className="stack-sm">
              <Alert tone="success">
                Contraseña actualizada correctamente. Tus sesiones fueron cerradas: ingresa de nuevo.
              </Alert>
              <Button onClick={resetToLogin}>Volver al login</Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
