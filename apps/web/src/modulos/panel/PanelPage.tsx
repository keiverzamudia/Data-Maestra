import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';
import { apiPanelService } from '../../servicios/api/api-panel-service';
import { Can } from '../../componentes/auth/Can';
import { Page, KpiCard, EmptyState, ErrorState, Skeleton } from '../../componentes/ui';

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

/** 11B — Dashboard operativo: qué está pasando y qué atender (datos reales). */
export const DashboardPage: React.FC = () => {
  const { user } = useSession();
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiPanelService.getStats(companyId),
      apiPanelService.getActivity(companyId),
    ]).then(([s, a]) => {
      setStats(s);
      setActivity(a);
      setLoading(false);
    }).catch(() => {
      setError('No pudimos cargar los datos del panel.');
      setLoading(false);
    });
  }, [companyId]);

  React.useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <Page title="Dashboard" desc="Resumen operativo de tus solicitudes y actividades pendientes.">
        <div className="kpi-grid">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} height={84} />)}
        </div>
        <div className="card p16"><Skeleton height={16} width="40%" /><Skeleton height={12} /><Skeleton height={12} /></div>
      </Page>
    );
  }

  if (error) {
    return (
      <Page title="Dashboard" desc={`Bienvenido, ${user?.displayName ?? ''}`}>
        <ErrorState title="No pudimos cargar los datos del panel." onRetry={loadData} />
      </Page>
    );
  }

  if (!stats) {
    return (
      <Page title="Dashboard" desc={`Bienvenido, ${user?.displayName ?? ''}`}>
        <EmptyState title="Sin datos disponibles" desc="Aún no hay información operativa para mostrar." />
      </Page>
    );
  }

  const maxBar = Math.max(stats.pendingRequests, stats.inApproval, stats.completedRequests, stats.returnedRequests, 1);

  return (
    <Page title="Dashboard" desc="Resumen operativo de tus solicitudes y actividades pendientes.">
      <div className="kpi-grid">
        <KpiCard label="Solicitudes Totales" value={stats.totalRequests} />
        <KpiCard label="Pendientes" value={stats.pendingRequests} tone={stats.pendingRequests > 0 ? 'kpi-yellow' : ''} />
        <KpiCard label="En Aprobación" value={stats.inApproval} />
        <KpiCard label="Completadas" value={stats.completedRequests} tone="text-green" />
        <KpiCard label="Devueltas" value={stats.returnedRequests} tone={stats.returnedRequests > 0 ? 'kpi-red' : ''} />
        <KpiCard label="Importaciones" value={stats.recentImports} />
      </div>

      <div className="card p16">
        <h3 className="h1" style={{ fontSize: 16 }}>Acciones rápidas</h3>
        <div className="action-grid" style={{ marginTop: 8 }}>
          <Can permission="REQUEST.CREATE">
            <a className="action-card" href="/requester/new">
              <span className="action-icon" aria-hidden="true">＋</span>
              <span><strong>Crear solicitud</strong><br /><span className="muted small">Nuevo artículo a homologar</span></span>
            </a>
          </Can>
          <Can permission="REQUEST.VIEW">
            <a className="action-card" href="/requester">
              <span className="action-icon" aria-hidden="true">◻</span>
              <span><strong>Ver solicitudes</strong><br /><span className="muted small">{stats.pendingRequests} pendientes</span></span>
            </a>
          </Can>
          <Can permission="WAREHOUSE.VIEW">
            <a className="action-card" href="/warehouse">
              <span className="action-icon" aria-hidden="true">▭</span>
              <span><strong>Ir a Almacén</strong><br /><span className="muted small">Clasificación pendiente</span></span>
            </a>
          </Can>
          <Can permission="ACCOUNTING.VIEW">
            <a className="action-card" href="/accounting">
              <span className="action-icon" aria-hidden="true">✓</span>
              <span><strong>Ir a Contabilidad</strong><br /><span className="muted small">Aprobaciones contables</span></span>
            </a>
          </Can>
        </div>
      </div>

      <div className="grid2">
        <div className="card p16">
          <h3 className="h1" style={{ fontSize: 16 }}>Actividad Reciente</h3>
          {activity.length === 0 ? (
            <EmptyState title="Sin actividad reciente" desc="Las acciones aparecerán aquí" />
          ) : (
            <ul className="list">
              {activity.slice(0, 8).map(a => (
                <li key={a.id} className="clickable" onClick={() => navigate(`/requester/${a.id}`)}>
                  <strong>#{a.requestNumber}</strong> — {a.description.slice(0, 50)}
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
    </Page>
  );
};
