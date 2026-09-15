import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';
import { apiPanelService } from '../../servicios/api/api-panel-service';
import { requestService, warehouseService, warehouseApprovalService, accountingService } from '../../servicios';
import { Can } from '../../componentes/auth/Can';
import { Page, EmptyState, ErrorState, Skeleton, StatCard, StatusBadge, Button, SectionCard } from '../../componentes/ui';
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

interface WorkRow {
  key: string;
  label: string;
  to: string;
  count: number;
}

/** 11E/14H — Dashboard como centro de resumen (no bandeja). */
export const DashboardPage: React.FC = () => {
  const { user, hasPermission } = useSession();
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const [work, setWork] = React.useState<WorkRow[] | null>(null);
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

  // Trabajo pendiente con conteos reales (solo bandejas permitidas; sin números falsos).
  React.useEffect(() => {
    let cancelled = false;
    const jobs: Array<Promise<WorkRow | null>> = [];
    if (hasPermission('WAREHOUSE.VIEW')) {
      jobs.push(
        warehouseService.getPendingRequests(companyId).then(
          r => ({ key: 'wh', label: 'Almacén', to: '/warehouse', count: r.length }),
          () => null,
        ),
      );
    }
    // 15A — contador de la cola del Encargado (sin KPIs nuevos).
    if (hasPermission('WAREHOUSE_MANAGER.VIEW')) {
      jobs.push(
        warehouseApprovalService.getPendingApprovals(companyId).then(
          r => ({ key: 'wha', label: 'Aprobación Almacén', to: '/aprobacion-almacen', count: r.length }),
          () => null,
        ),
      );
    }
    if (hasPermission('ACCOUNTING.VIEW')) {
      jobs.push(
        accountingService.getPendingApprovals(companyId).then(
          r => ({ key: 'ac', label: 'Contabilidad', to: '/accounting', count: r.length }),
          () => null,
        ),
      );
    }
    if (hasPermission('MANAGER.APPROVE')) {
      jobs.push(
        requestService.list({ companyId: companyId || undefined, status: 'PENDIENTE_GERENTE' }).then(
          r => ({ key: 'ge', label: 'Aprobaciones de gerencia', to: '/approvals', count: r.filteredTotal ?? r.total }),
          () => null,
        ),
      );
    }
    if (jobs.length === 0) {
      setWork([]);
      return;
    }
    Promise.all(jobs).then(rows => {
      if (!cancelled) setWork(rows.filter((r): r is WorkRow => r !== null));
    });
    return () => { cancelled = true; };
  }, [companyId, hasPermission]);

  React.useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <Page title="Dashboard" desc="Resumen de tu operación.">
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
    <Page title="Dashboard" desc={`Bienvenido, ${user?.displayName ?? ''}. Resumen de tu operación.`}>
      <section aria-label="Resumen">
        <h2 className="section-title">Resumen</h2>
        <div className="stat-grid">
          <StatCard label="Pendientes de atención" value={stats.pendingRequests} tone={stats.pendingRequests > 0 ? 'warn' : undefined} />
          <StatCard label="En aprobación" value={stats.inApproval} tone="info" />
          <StatCard label="Completadas" value={stats.completedRequests} tone="ok" />
          <StatCard label="Devueltas" value={stats.returnedRequests} tone={stats.returnedRequests > 0 ? 'bad' : undefined} />
        </div>
      </section>

      <SectionCard title="Trabajo pendiente" desc="Bandejas que requieren tu acción.">
        {work === null ? (
          <div className="stack-sm" aria-label="Cargando trabajo pendiente">
            <Skeleton height={36} /><Skeleton height={36} />
          </div>
        ) : work.length === 0 ? (
          <EmptyState title="Sin pendientes" desc="No tienes bandejas con trabajo asignado." />
        ) : (
          <div className="stack-sm">
            {work.map(w => (
              <button key={w.key} type="button" className="work-row" onClick={() => navigate(w.to)}>
                <span className="work-label">{w.label}</span>
                <span className={`badge ${w.count > 0 ? 'badge-yellow' : 'badge-green'}`}>{w.count} pendiente{w.count === 1 ? '' : 's'}</span>
                <span aria-hidden="true" className="muted">›</span>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid2">
        <section className="card p16" aria-label="Actividad reciente">
          <h2 className="section-title">Actividad reciente</h2>
          {activity.length === 0 ? (
            <EmptyState title="Sin actividad reciente" desc="Las acciones aparecerán aquí" />
          ) : (
            <div className="stack-sm">
              {activity.slice(0, 6).map(a => (
                <button
                  key={a.id}
                  type="button"
                  className="activity-row"
                  onClick={() => navigate(`/requester/${a.id}`)}
                  aria-label={`Solicitud ${a.requestNumber}: ${a.description.slice(0, 60)}`}
                >
                  <span className="activity-main">
                    <span><strong>#{a.requestNumber}</strong> — {a.description.slice(0, 60)}</span>
                    <span className="muted small">{a.actor} · {new Date(a.createdAt).toLocaleDateString('es-VE')}</span>
                  </span>
                  <StatusBadge status={a.status} />
                </button>
              ))}
              <div>
                <Button variant="secondary" size="sm" onClick={() => navigate('/solicitudes')}>Ver mis solicitudes</Button>
              </div>
            </div>
          )}
        </section>

        <section className="card p16" aria-label="Resumen por estado">
          <h2 className="section-title">Resumen por estado</h2>
          <div className="stack-sm">
            {[
              { label: 'Pendientes', value: stats.pendingRequests },
              { label: 'En aprobación', value: stats.inApproval },
              { label: 'Completadas', value: stats.completedRequests },
              { label: 'Devueltas', value: stats.returnedRequests },
            ].map(item => (
              <div key={item.label} className="state-row">
                <span>{item.label}</span>
                <span className="mini-bar" aria-hidden="true"><span style={{ width: `${(item.value / maxBar) * 100}%` }} /></span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section aria-label="Acciones rápidas">
        <h2 className="section-title">Acciones rápidas</h2>
        <div className="quick-actions">
          <Can permission="REQUEST.CREATE">
            <Button variant="secondary" size="sm" onClick={() => navigate('/requester/new')}>Crear solicitud</Button>
          </Can>
          <Can permission="REQUEST.VIEW">
            <Button variant="secondary" size="sm" onClick={() => navigate('/solicitudes')}>Mis solicitudes</Button>
          </Can>
        </div>
      </section>
    </Page>
  );
};
