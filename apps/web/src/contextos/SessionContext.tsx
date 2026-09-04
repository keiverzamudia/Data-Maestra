import * as React from 'react';
import { apiAuthService, type SessionMembership } from '../servicios/api/api-auth-service';
import { setUnauthorizedHandler } from '../servicios/api/api-client';

export interface AuthUser {
  id: string;
  displayName: string;
  active: boolean;
}

interface SessionContextType {
  user: AuthUser | null;
  memberships: SessionMembership[];
  permissions: string[];
  roleCodes: string[];
  loading: boolean;
  authenticated: boolean;
  mustChangePassword: boolean;
  login: (userId: string, password: string) => Promise<'ok' | 'must-change'>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  hasPermission: (p: string) => boolean;
  visibleModules: string[];
}

// FASE 10E: única fuente de identidad frontend. Sin DEFAULT_SESSION,
// sin switchUser, sin fetch a /auth/session?userId (eliminados).
// La sesión vive en cookie HttpOnly; aquí solo estado derivado del backend.
const SessionContext = React.createContext<SessionContextType>({
  user: null,
  memberships: [],
  permissions: [],
  roleCodes: [],
  loading: true,
  authenticated: false,
  mustChangePassword: false,
  login: async () => 'ok',
  logout: async () => {},
  refreshSession: async () => false,
  hasPermission: () => false,
  visibleModules: [],
});

function getVisibleModules(permissions: string[]): string[] {
  const modules: string[] = [];
  if (permissions.includes('DASHBOARD.VIEW')) modules.push('dashboard');
  if (permissions.includes('REQUEST.CREATE') || permissions.includes('REQUEST.VIEW')) modules.push('requester');
  if (permissions.includes('WAREHOUSE.CLASSIFY') || permissions.includes('WAREHOUSE.VIEW')) modules.push('warehouse');
  if (permissions.includes('ACCOUNTING.APPROVE') || permissions.includes('ACCOUNTING.VIEW')) modules.push('accounting');
  if (permissions.includes('IMPORT.RUN') || permissions.includes('IMPORT.VIEW')) modules.push('imports');
  if (permissions.includes('AUDIT.VIEW')) modules.push('audit');
  if (permissions.includes('ADMIN.MANAGE')) modules.push('administration');
  return modules;
}

const EMPTY = { user: null as AuthUser | null, memberships: [] as SessionMembership[], permissions: [] as string[], roleCodes: [] as string[], mustChangePassword: false };

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = React.useState(EMPTY);
  const [loading, setLoading] = React.useState(true);

  const clearLocal = React.useCallback(() => {
    setState(EMPTY);
  }, []);

  const refreshSession = React.useCallback(async (): Promise<boolean> => {
    try {
      const s = await apiAuthService.session();
      if (!s?.authenticated || !s.user) {
        clearLocal();
        return false;
      }
      setState({
        user: { id: s.user.id, displayName: s.user.displayName, active: s.user.active },
        memberships: s.memberships ?? [],
        permissions: s.permissions ?? [],
        roleCodes: s.roleCodes ?? [],
        mustChangePassword: s.mustChangePassword,
      });
      return true;
    } catch {
      clearLocal();
      return false;
    }
  }, [clearLocal]);

  // 401 global → limpiar sin loops (api-client llama aquí).
  React.useEffect(() => {
    setUnauthorizedHandler(() => clearLocal());
    return () => setUnauthorizedHandler(null);
  }, [clearLocal]);

  // Arranque: resolver sesión antes de mostrar nada (sin flash).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshSession();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshSession]);

  const login = React.useCallback(async (userId: string, password: string): Promise<'ok' | 'must-change'> => {
    const res = await apiAuthService.login(userId, password);
    const ok = await refreshSession();
    if (!ok) return 'ok';
    return res.mustChangePassword ? 'must-change' : 'ok';
  }, [refreshSession]);

  const logout = React.useCallback(async () => {
    try {
      await apiAuthService.logout();
    } catch {}
    clearLocal();
  }, [clearLocal]);

  const hasPermission = React.useCallback((p: string) => {
    return state.permissions.includes(p);
  }, [state.permissions]);

  const visibleModules = React.useMemo(() => getVisibleModules(state.permissions), [state.permissions]);

  return (
    <SessionContext.Provider
      value={{
        user: state.user,
        memberships: state.memberships,
        permissions: state.permissions,
        roleCodes: state.roleCodes,
        loading,
        authenticated: state.user !== null,
        mustChangePassword: state.mustChangePassword,
        login,
        logout,
        refreshSession,
        hasPermission,
        visibleModules,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => React.useContext(SessionContext);
