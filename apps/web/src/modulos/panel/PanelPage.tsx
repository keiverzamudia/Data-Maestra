import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';
import { apiPanelService } from '../../servicios/api/api-panel-service';
import { useRequestContextSummary } from '../../hooks/useRequestContextSummary';
import { Can } from '../../componentes/auth/Can';
import { Page, EmptyState, ErrorState, Skeleton, StatCard, StatusBadge, Button, SectionCard } from '../../componentes/ui';
import { HelpButton } from '../../componentes/ayuda';

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

/** Filas de "Trabajo pendiente" solo para colas con permiso del usuario. */
function workRowsFromSummary(
  summary: { work: Record<string, number> } | null,
  hasPermission: (p: string) => boolean,
): WorkRow[] {
  if (!summary) return [];
  const rows: WorkRow[] = [];
  if (hasPermission('WAREHOUSE.VIEW') || hasPermission('WAREHOUSE.CLASSIFY')) {
    rows.push({ key: 'wh', label: 'Almacén', to: '/warehouse', count: summary.work.warehouse ?? 0 });
  }
  if (hasPermission('WAREHOUSE_MANAGER.VIEW') || hasPermission('WAREHOUSE_MANAGER.APPROVE')) {
    rows.push({
      key: 'wha',
      label: 'Aprobación Almacén',
      to: '/aprobacion-almacen',
      count: summary.work.warehouseApproval ?? 0,
    });
  }
  if (hasPermission('ACCOUNTING.VIEW') || hasPermission('ACCOUNTING.APPROVE')) {
    rows.push({ key: 'ac', label: 'Contabilidad', to: '/accounting', count: summary.work.accounting ?? 0 });
  }
  if (hasPermission('MANAGER.APPROVE')) {
    rows.push({
      key: 'ge',
      label: 'Aprobaciones',
      to: '/approvals',
      count: summary.work.approvals ?? 0,
    });
  }
  return rows;
}

/**
 * 11E/14H/FASE-counters — Dashboard con contadores contextuales reales.
 * Tarjetas + sección "Trabajo pendiente" consumen el MISMO resumen
 * (GET /requests/context-summary) que los badges del menú. Sin hardcodes.
 */
export const DashboardPage: React.FC = () => {
  const { user, hasPermission } = useSession();
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = React.useState(true);
  const [activityError, setActivityError] = React.useState<string | null>(null);
  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
    refresh: refreshSummary,
  } = useRequestContextSummary();

  const loadActivity = React.useCallback(() => {
    setActivityLoading(true);
    setActivityError(null);
    apiPanelService.getActivity(companyId).then(
      a => { setActivity(a); setActivityLoading(false); },
      () => { setActivityError('No pudimos cargar la actividad.'); setActivityLoading(false); },
    );
  }, [companyId]);

  React.useEffect(() => { loadActivity(); }, [loadActivity]);

  const loading = summaryLoading && !summary && activityLoading;

  const work = React.useMemo(
    () => workRowsFromSummary(summary as never, hasPermission),
    [summary, hasPermission],
  );

  if (loading) {
    return (
      <Page title="Dashboard Gerencial" desc="Resumen general de la operación de Data-Maestra.">
        <div className="stat-grid">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} height={84} />)}
        </div>
        <div className="card p16"><Skeleton height={16} width="40%" /><Skeleton height={12} /><Skeleton height={12} /></div>
      </Page>
    );
  }

  if (!summary && summaryError) {
    return (
      <Page title="Dashboard Gerencial" desc={`Bienvenido, ${user?.displayName ?? ''}`}>
        <ErrorState title="No pudimos cargar los contadores del panel." onRetry={refreshSummary} />
      </Page>
    );
  }

  if (!summary) {
    return (
      <Page title="Dashboard Gerencial" desc={`Bienvenido, ${user?.displayName ?? ''}`}>
        <EmptyState title="Sin datos disponibles" desc="Aún no hay información operativa para mostrar." />
      </Page>
    );
  }

  const d = summary.dashboard;

  return (
    <Page title="Dashboard Gerencial" desc="Resumen general de la operación de Data-Maestra." actions={<HelpButton helpKey="dashboard" />}>
      <section aria-label="Resumen">
        <h2 className="section-title">Resumen general</h2>
        <div className="stat-grid">
          <StatCard
            label="Trabajo pendiente"
            value={d.pending}
            sub="Solicitudes que requieren tu acción"
            tone={d.pending > 0 ? 'warn' : undefined}
          />
          <StatCard
            label="En aprobación"
            value={d.inApproval}
            sub="En flujo de aprobación en tu alcance"
            tone="info"
          />
          <StatCard label="Completadas" value={d.completed} sub="Registradas en Profit" tone="ok" />
          <StatCard
            label="Devueltas"
            value={d.returned}
            sub="Devueltas o rechazadas"
            tone={d.returned > 0 ? 'bad' : undefined}
          />
        </div>
      </section>

      <SectionCard
        title="Trabajo pendiente"
        desc="Bandejas departamentales que requieren tu acción o revisión inmediata."
        actions={summaryError ? <Button variant="secondary" size="sm" onClick={refreshSummary}>Reintentar</Button> : undefined}
      >
        {summaryError && work.length === 0 ? (
          <ErrorState title="No pudimos cargar los contadores." onRetry={refreshSummary} />
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

      <SectionCard title="Todas las solicitudes" desc="Universo completo de solicitudes del ámbito autorizado.">
        <Can permission="SOLICITUDES.VIEW_ALL">
          <Button variant="secondary" onClick={() => navigate('/solicitudes/todas')}>Ver todas las solicitudes</Button>
        </Can>
      </SectionCard>

      <div className="dash-duo">
        <section className="card p16" aria-label="Acciones rápidas">
          <h2 className="section-title">Acciones rápidas</h2>
          <div className="action-grid">
            <Can permission="REQUEST.CREATE">
              <button type="button" className="action-card" onClick={() => navigate('/requester/new')}>
                <span className="action-icon" aria-hidden="true">✚</span>
                <span className="action-text">
                  <strong>Crear solicitud</strong>
                  <span className="muted small">Registra un artículo nuevo</span>
                </span>
                <span aria-hidden="true" className="muted">›</span>
              </button>
            </Can>
            <Can permission="REQUEST.VIEW">
              <button type="button" className="action-card" onClick={() => navigate('/solicitudes')}>
                <span className="action-icon" aria-hidden="true">☰</span>
                <span className="action-text">
                  <strong>Mis solicitudes</strong>
                  <span className="muted small">Consulta tu historial</span>
                </span>
                <span aria-hidden="true" className="muted">›</span>
              </button>
            </Can>
          </div>
        </section>

        <section className="card p16" aria-label="Actividad reciente">
          <h2 className="section-title">Actividad reciente</h2>
          {activityLoading && (
            <div className="stack-sm" aria-label="Cargando actividad">
              <Skeleton height={36} /><Skeleton height={36} />
            </div>
          )}
          {!activityLoading && activityError && (
            <ErrorState title="No pudimos cargar la actividad." onRetry={loadActivity} />
          )}
          {!activityLoading && !activityError && activity.length === 0 && (
            <EmptyState title="Sin actividad reciente" desc="Las acciones aparecerán aquí" />
          )}
          {!activityLoading && !activityError && activity.length > 0 && (
            <div className="stack-sm">
              {activity.slice(0, 6).map(a => (
                <button
                  key={a.id}
                  type="button"
                  className="activity-row"
                  onClick={() => navigate(`/requester/${a.id}`)}
                  aria-label={`Ver solicitud ${a.requestNumber}: ${a.description.slice(0, 60)}`}
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
      </div>
    </Page>
  );
};
