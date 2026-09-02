import * as React from 'react';
import { useSession } from '../../contextos/SessionContext';
import { apiPanelService } from '../../servicios/api/api-panel-service';
import { PageHeader, KpiCard, StatusBadge, EmptyState, Button } from '../../componentes/ui';
import type { Request } from '../../tipos';

interface DashboardStats {
  pendingRequests: number;
  inApproval: number;
  returnedRequests: number;
  completedRequests: number;
  totalRequests: number;
  recentImports: number;
  activeMasterItems: number;
  pendingHomologation: number;
  pendingSourceItems: number;
  pendingMatches: number;
  qualityIssues: number;
}

interface ActivityItem {
  id: string;
  requestNumber: string;
  description: string;
  status: string;
  actor: string;
  createdAt: string;
}

export const DashboardPage: React.FC = () => {
  const { session } = useSession();
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiPanelService.getStats(session.company.id),
      apiPanelService.getActivity(session.company.id),
    ]).then(([s, a]) => {
      setStats(s);
      setActivity(a);
      setLoading(false);
    }).catch((err) => {
      console.error('Dashboard error:', err);
      setError('No fue posible cargar los datos del panel.');
      setLoading(false);
    });
  }, [session.company.id]);

  React.useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="empty">Cargando...</div>;

  if (error) {
    return (
      <div className="stack">
        <PageHeader title="Dashboard" subtitle={`Bienvenido, ${session.name}`} />
        <div className="card p16">
          <div className="alert" style={{ background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>
            {error}
          </div>
          <Button size="sm" style={{ marginTop: 12 }} onClick={loadData}>Reintentar</Button>
        </div>
      </div>
    );
  }

  if (!stats) return <div className="empty">Sin datos disponibles</div>;

  const maxBar = Math.max(stats.pendingRequests, stats.inApproval, stats.completedRequests, stats.returnedRequests, 1);

  return (
    <div className="stack">
      <PageHeader title="Dashboard" subtitle={`Bienvenido, ${session.name}`} />

      <div className="kpi-grid">
        <KpiCard label="Solicitudes Totales" value={stats.totalRequests} />
        <KpiCard label="Pendientes" value={stats.pendingRequests} tone={stats.pendingRequests > 0 ? 'kpi-yellow' : ''} />
        <KpiCard label="En Aprobación" value={stats.inApproval} />
        <KpiCard label="Completadas" value={stats.completedRequests} tone="text-green" />
        <KpiCard label="Devueltas" value={stats.returnedRequests} tone={stats.returnedRequests > 0 ? 'kpi-red' : ''} />
        <KpiCard label="Importaciones" value={stats.recentImports} />
      </div>

      <div className="grid2">
        <div className="card p16">
          <h3 className="h1" style={{ fontSize: 16 }}>Actividad Reciente</h3>
          {activity.length === 0 ? (
            <EmptyState title="Sin actividad reciente" desc="Las acciones aparecerán aquí" />
          ) : (
            <ul className="list">
              {activity.map(a => (
                <li key={a.id}>
                  <strong>{a.requestNumber}</strong> — {a.description.slice(0, 50)}
                  <span className="muted small" style={{ marginLeft: 8 }}>
                    por {a.actor} · {new Date(a.createdAt).toLocaleDateString('es-VE')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p16">
          <h3 className="h1" style={{ fontSize: 16 }}>Resumen por Estado</h3>
          <div className="bar-chart">
            {[
              { label: 'Pendientes', value: stats.pendingRequests },
              { label: 'En aprobación', value: stats.inApproval },
              { label: 'Completadas', value: stats.completedRequests },
              { label: 'Devueltas', value: stats.returnedRequests },
            ].map(item => (
              <div key={item.label} className="bar-row">
                <span className="bar-label">{item.label}</span>
                <div className="bar"><div className="bar-fill" style={{ width: `${(item.value / maxBar) * 100}%` }} /></div>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
