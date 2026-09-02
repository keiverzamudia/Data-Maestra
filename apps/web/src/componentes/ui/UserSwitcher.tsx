import * as React from 'react';
import { useSession } from '../../contextos/SessionContext';

interface TestUser {
  id: string;
  name: string;
  role: string;
  department: string;
  roleCodes: string[];
}

const ROLE_LABELS: Record<string, string> = {
  REQUESTER: 'Solicitante',
  DEPARTMENT_MANAGER: 'Gerente',
  WAREHOUSE: 'Almacén',
  ACCOUNTING: 'Contabilidad',
  FINAL_REVIEWER: 'Revisión Final',
  MASTER_DATA_ADMIN: 'Admin MDM',
};

export const UserSwitcher: React.FC = () => {
  const { session, switchUser, loading } = useSession();
  const [users, setUsers] = React.useState<TestUser[]>([]);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/v1/auth/users')
      .then(r => r.json())
      .then(data => setUsers(data))
      .catch(() => {});
  }, []);

  if (users.length === 0) return null;

  return (
    <div style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 1000 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: '#0f172a',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 11,
          cursor: 'pointer',
          opacity: 0.85,
        }}
      >
        {loading ? 'Cambiando...' : `👤 ${session.name} (${ROLE_LABELS[session.roleCodes[0] ?? ''] ?? session.roleCodes[0] ?? '—'})`}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 36,
            right: 0,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: 260,
            padding: 8,
          }}
        >
          <div style={{ fontSize: 11, color: '#64748b', padding: '4px 8px', fontWeight: 600 }}>
            Cambiar usuario de prueba
          </div>
          {users.map(u => (
            <button
              key={u.id}
              onClick={() => { switchUser(u.id); setOpen(false); }}
              disabled={u.id === session.id || loading}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                border: 'none',
                borderRadius: 6,
                background: u.id === session.id ? '#eff6ff' : 'transparent',
                cursor: u.id === session.id ? 'default' : 'pointer',
                fontWeight: u.id === session.id ? 600 : 400,
                opacity: u.id === session.id ? 0.6 : 1,
              }}
            >
              <div style={{ fontSize: 13 }}>{u.name}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {ROLE_LABELS[u.roleCodes[0] ?? ''] ?? u.roleCodes[0] ?? '—'} — {u.department}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
