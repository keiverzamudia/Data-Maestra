import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';
import { apiPanelService } from '../../servicios/api/api-panel-service';
import { Can } from '../../componentes/auth/Can';
import { Page, EmptyState, ErrorState, Skeleton } from '../../componentes/ui';
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

function dotFor(status: string): string {
  if (/COMPLET|REGISTRAD|APROBADO_FINAL/.test(status)) return 'dot-ok';
  if (/DEVUELTO|RECHAZADO|ERROR/.test(status)) return 'dot-bad';
  if (/PENDIENTE/.test(status)) return 'dot-warn';
  return 'dot-info';
}

/** 11E — Dashboard operativo rediseñado: stat-cards, timeline y acciones por permiso. */
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
        <div className="stat-grid">
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
    <Page title="Dashboard" desc={`Bienvenido, ${user?.displayName ?? ''}. Esto es lo que está pasando ahora.`}>
      <section aria-label="Resumen">
        <h2 className="section-title">Resumen</h2>
        <div className="stat-grid">
          <div className="stat-card stat-info"><span className="stat-icon" aria-hidden="true">◻</span><div><div className="stat-num">{stats.totalRequests}</div><div className="stat-label">Solicitudes totales</div></div></div>
          <div className={`stat-card ${stats.pendingRequests > 0 ? 'stat-warn' : ''}`}><span className="stat-icon" aria-hidden="true">◷</span><div><div className="stat-num">{stats.pendingRequests}</div><div className="stat-label">Pendientes de atención</div></div></div>
          <div className="stat-card stat-info"><span className="stat-icon" aria-hidden="true">⇄</span><div><div className="stat-num">{stats.inApproval}</div><div className="stat-label">En aprobación</div></div></div>
          <div className="stat-card stat-ok"><span className="stat-icon" aria-hidden="true">✓</span><div><div className="stat-num">{stats.completedRequests}</div><div className="stat-label">Completadas</div></div></div>
          <div className={`stat-card ${stats.returnedRequests > 0 ? 'stat-bad' : ''}`}><span className="stat-icon" aria-hidden="true">↩</span><div><div className="stat-num">{stats.returnedRequests}</div><div className="stat-label">Devueltas</div></div></div>
          <Can permission="IMPORT.VIEW">
            <div className="stat-card"><span className="stat-icon" aria-hidden="true">↻</span><div><div className="stat-num">{stats.recentImports}</div><div className="stat-label">Importaciones recientes</div></div></div>
          </Can>
        </div>
      </section>

      <section aria-label="Acciones rápidas">
        <h2 className="section-title">Acciones rápidas</h2>
        <div className="action-grid">
          <Can permission="REQUEST.CREATE">
            <button type="button" className="action-card" onClick={() => navigate('/requester/new')}>
              <span className="action-icon" aria-hidden="true">＋</span>
              <span><strong>Crear solicitud</strong><br /><span className="muted small">Nuevo artículo a homologar</span></span>
            </button>
          </Can>
          <Can permission="REQUEST.VIEW">
            <button type="button" className="action-card" onClick={() => navigate('/requester')}>
              <span className="action-icon" aria-hidden="true">◻</span>
              <span><strong>Ver solicitudes</strong><br /><span className="muted small">{stats.pendingRequests} pendientes</span></span>
            </button>
          </Can>
          <Can permission="WAREHOUSE.VIEW">
            <button type="button" className="action-card" onClick={() => navigate('/warehouse')}>
              <span className="action-icon" aria-hidden="true">▭</span>
              <span><strong>Ir a Almacén</strong><br /><span className="muted small">Clasificación pendiente</span></span>
            </button>
          </Can>
          <Can permission="ACCOUNTING.VIEW">
            <button type="button" className="action-card" onClick={() => navigate('/accounting')}>
              <span className="action-icon" aria-hidden="true">✓</span>
              <span><strong>Ir a Contabilidad</strong><br /><span className="muted small">Aprobaciones contables</span></span>
            </button>
          </Can>
        </div>
      </section>

      <div className="grid2">
        <section className="card p16" aria-label="Actividad reciente">
          <h2 className="section-title">Actividad reciente</h2>
          {activity.length === 0 ? (
            <EmptyState title="Sin actividad reciente" desc="Las acciones aparecerán aquí" />
          ) : (
            <ol className="timeline-list">
              {activity.slice(0, 8).map(a => (
                <li key={a.id} className="timeline-item">
                  <button type="button" className="timeline-link" onClick={() => navigate(`/requester/${a.id}`)} aria-label={`Solicitud ${a.requestNumber}: ${a.description.slice(0, 60)}`}>
                    <span className={`timeline-dot ${dotFor(a.status)}`} aria-hidden="true" />
                    <span><strong>#{a.requestNumber}</strong> — {a.description.slice(0, 60)}</span>
                    <span className="muted small">por {a.actor} · {new Date(a.createdAt).toLocaleDateString('es-VE')}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card p16" aria-label="Resumen por estado">
          <h2 className="section-title">Por estado</h2>
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
        </section>
      </div>
    </Page>
  );
};
