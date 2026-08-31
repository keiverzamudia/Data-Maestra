import * as React from 'react';
import type { SessionUser } from '../contracts';

interface SessionContextType {
  session: SessionUser;
  hasPermission: (p: string) => boolean;
  visibleModules: string[];
  switchUser: (userId: string) => Promise<void>;
  loading: boolean;
}

const DEFAULT_SESSION: SessionUser = {
  id: 'u1',
  name: 'Juan Pérez',
  username: 'j.perez',
  department: { id: 'd1', code: 'COMPRAS', name: 'Compras', managerId: 'u2', managerName: 'María García' },
  company: { id: 'c1', name: 'Empresa A — Distribuidora Central', code: 'EMP-A' },
  permissions: ['REQUEST.CREATE', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  roleCodes: ['REQUESTER'],
};

const SessionContext = React.createContext<SessionContextType>({
  session: DEFAULT_SESSION,
  hasPermission: () => false,
  visibleModules: [],
  switchUser: async () => {},
  loading: false,
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

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = React.useState<SessionUser>(DEFAULT_SESSION);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/v1/auth/session')
      .then(r => r.json())
      .then(data => setSession(data))
      .catch(() => {});
  }, []);

  const switchUser = React.useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/auth/session?userId=${userId}`);
      const data = await res.json();
      setSession(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const hasPermission = React.useCallback((p: string) => {
    return session.permissions.includes(p);
  }, [session.permissions]);

  const visibleModules = React.useMemo(() => getVisibleModules(session.permissions), [session.permissions]);

  return (
    <SessionContext.Provider value={{ session, hasPermission, visibleModules, switchUser, loading }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => React.useContext(SessionContext);
