import * as React from 'react';
import { useSession } from '../../contexts/SessionContext';
import { requestService } from '../../services';
import { PageHeader, KpiCard, StatusBadge } from '../../components/ui';
import type { DashboardStats, Request } from '../../types';

export const DashboardPage: React.FC = () => {
  const { session } = useSession();
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [recentRequests, setRecentRequests] = React.useState<Request[]>([]);

  React.useEffect(() => {
    requestService.list({ companyId: session.company.id }).then(({ data }) => {
      const pendingRequests = data.filter(r => ['PENDING_MANAGER', 'PENDING_WAREHOUSE'].includes(r.status)).length;
      const inApproval = data.filter(r => ['PENDING_ACCOUNTING', 'PENDING_FINAL_REVIEW'].includes(r.status)).length;
      const returnedRequests = data.filter(r => r.status === 'RETURNED').length;
      const completedRequests = data.filter(r => ['APPROVED', 'MASTER_ACTIVE'].includes(r.status)).length;

      setStats({
        pendingRequests,
        inApproval,
        returnedRequests,
        completedRequests,
        activeMasterItems: 0,
        pendingHomologation: 0,
        pendingSourceItems: 0,
        pendingMatches: 0,
        qualityIssues: 0,
        recentImports: 0,
      });

      setRecentRequests(data.slice(0, 5));
    });
  }, [session.company.id]);

  if (!stats) return <div className="empty">Cargando...</div>;

  return (
    <div className="stack">
      <PageHeader title="Dashboard" subtitle={`Bienvenido, ${session.name}`} />

      <div className="kpi-grid">
        <KpiCard label="Solicitudes Pendientes" value={stats.pendingRequests} tone={stats.pendingRequests > 0 ? 'kpi-yellow' : ''} />
        <KpiCard label="En Aprobación" value={stats.inApproval} />
        <KpiCard label="Aprobaciones Contables" value={stats.returnedRequests} tone={stats.returnedRequests > 0 ? 'kpi-red' : ''} />
        <KpiCard label="Masters Activos" value={stats.activeMasterItems} tone="text-green" />
        <KpiCard label="Matches Pendientes" value={stats.pendingMatches} tone={stats.pendingMatches > 0 ? 'kpi-yellow' : ''} />
        <KpiCard label="Errores de Calidad" value={stats.qualityIssues} tone={stats.qualityIssues > 0 ? 'kpi-red' : ''} />
        <KpiCard label="Importaciones Recientes" value={stats.recentImports} />
      </div>

      <div className="grid2">
        <div className="card p16">
          <h3 className="h1" style={{ fontSize: 16 }}>Solicitudes Recientes</h3>
          <table className="table" style={{ marginTop: 8 }}>
            <thead><tr><th>N°</th><th>Descripción</th><th>Estado</th><th>Fecha</th></tr></thead>
            <tbody>
              {recentRequests.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.requestNumber}</strong></td>
                  <td className="ellipsis">{r.requestedDescription}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="muted small">{new Date(r.createdAt).toLocaleDateString('es-VE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p16">
          <h3 className="h1" style={{ fontSize: 16 }}>Actividad Reciente</h3>
          <ul className="list">
            <li>Solicitud REQ-1001 creada por Juan Pérez</li>
            <li>REQ-1002 clasificada por Carlos Rodríguez</li>
            <li>REQ-1003 aprobada por Ana López</li>
            <li>Importación Profit A completada: 1250 registros</li>
            <li>Match candidato MC-2 pendiente de revisión</li>
          </ul>
        </div>
      </div>

      <div className="card p16">
        <h3 className="h1" style={{ fontSize: 16 }}>Resumen por Estado</h3>
        <div className="bar-chart">
          {[
            { label: 'Solicitudes pendientes', value: stats.pendingRequests, max: 10 },
            { label: 'En aprobación', value: stats.inApproval, max: 10 },
            { label: 'Completadas', value: stats.completedRequests, max: 10 },
            { label: 'Devueltas', value: stats.returnedRequests, max: 10 },
          ].map(item => (
            <div key={item.label} className="bar-row">
              <span className="bar-label">{item.label}</span>
              <div className="bar"><div className="bar-fill" style={{ width: `${(item.value / item.max) * 100}%` }} /></div>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
