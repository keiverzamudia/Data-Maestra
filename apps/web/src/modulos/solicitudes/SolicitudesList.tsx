import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Can } from '../../componentes/auth/Can';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { requestService } from '../../servicios';
import { Page, Button, StatusBadge, SearchInput, EmptyState, ErrorState, Skeleton, Select, Tabs } from '../../componentes/ui';
import type { Request } from '../../tipos';

type Scope = 'activas' | 'historial';
type Bucket = '' | 'proceso' | 'completadas' | 'rechazadas';

const BUCKETS: Array<{ value: Bucket; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'proceso', label: 'En proceso' },
  { value: 'completadas', label: 'Completadas' },
  { value: 'rechazadas', label: 'Rechazadas / Canceladas' },
];

function scopeSubtitle(has: (p: string) => boolean): string {
  if (has('ADMIN.MANAGE')) return 'Todas las solicitudes';
  if (has('WAREHOUSE.CLASSIFY')) return 'Cola de Almacén';
  if (has('ACCOUNTING.APPROVE')) return 'Cola de Contabilidad';
  if (has('FINAL_REVIEW.APPROVE')) return 'Cola de Validación Maestra';
  if (has('MANAGER.APPROVE')) return 'Solicitudes de mi departamento';
  return 'Mis solicitudes';
}

/** 13A — Solicitudes por rol: activas (cola propia) + historial (participación real). */
export const RequesterList: React.FC = () => {
  const { companyId, companies } = useCompany();
  const { usuarios, departamentos } = useOrganizacion(companyId);
  const { hasPermission, user } = useSession();
  const navigate = useNavigate();
  const [scope, setScope] = React.useState<Scope>('activas');
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [resumen, setResumen] = React.useState({ activas: 0, historial: 0, completadas: 0, rechazadas: 0, enProceso: 0 });
  const [search, setSearch] = React.useState('');
  const [bucket, setBucket] = React.useState<Bucket>('');
  const [requesterId, setRequesterId] = React.useState('');
  const [departmentId, setDepartmentId] = React.useState('');
  const [filterCompanyId, setFilterCompanyId] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(25);
  const [totalPages, setTotalPages] = React.useState(1);
  const [filteredTotal, setFilteredTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const isAdmin = hasPermission('ADMIN.MANAGE');
  const subtitle = scope === 'activas' ? scopeSubtitle(hasPermission) : 'Solicitudes en las que participé';

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, counts] = await Promise.all([
        requestService.list({
          companyId: filterCompanyId || undefined,
          search: search.trim() || undefined,
          scope,
          bucket: bucket || undefined,
          requesterId: requesterId || undefined,
          departmentId: departmentId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page,
          limit,
        }),
        requestService.resumen(),
      ]);
      setRequests(list.data);
      setFilteredTotal(list.filteredTotal ?? list.total);
      setTotalPages(Math.max(Math.ceil((list.filteredTotal ?? list.total) / (list.limit ?? limit)), 1));
      setResumen(counts);
    } catch {
      setRequests([]);
      setError('No pudimos cargar las solicitudes.');
    } finally {
      setLoading(false);
    }
  }, [search, scope, bucket, requesterId, departmentId, filterCompanyId, dateFrom, dateTo, page, limit]);

  React.useEffect(() => {
    const t = setTimeout(() => { void load(); }, 300);
    return () => clearTimeout(t);
  }, [load]);

  const changeScope = (s: Scope) => {
    setScope(s);
    setPage(1);
    setBucket('');
  };

  const nameOf = (id: string) => usuarios.find(u => u.id === id)?.displayName ?? '—';
  const deptOf = (id: string) => departamentos.find(d => d.id === id)?.name ?? '—';
  const companyOf = (id: string) => companies.find(c => c.id === id)?.name ?? '—';

  return (
    <Page
      title="Solicitudes"
      desc={subtitle}
      actions={<Can permission="REQUEST.CREATE"><a href="/requester/new"><Button>+ Nueva solicitud</Button></a></Can>}
    >
      <Tabs tabs={['Solicitudes activas', 'Historial']} active={scope === 'activas' ? 0 : 1} onChange={i => changeScope(i === 0 ? 'activas' : 'historial')} />

      {!loading && !error && (
        <div className="summary-strip" aria-label="Resumen de solicitudes">
          {scope === 'activas' ? (
            <>
              <div className="summary-item"><div className="summary-num">{resumen.activas}</div><div className="summary-label">Pendientes</div></div>
              <div className="summary-item"><div className="summary-num">{resumen.enProceso}</div><div className="summary-label">En proceso</div></div>
            </>
          ) : (
            <>
              <div className="summary-item"><div className="summary-num">{resumen.historial}</div><div className="summary-label">En historial</div></div>
              <div className="summary-item"><div className="summary-num">{resumen.completadas}</div><div className="summary-label">Completadas</div></div>
              <div className="summary-item"><div className="summary-num">{resumen.rechazadas}</div><div className="summary-label">Rechazadas</div></div>
            </>
          )}
        </div>
      )}

      <div className="toolbar" role="search">
        <span className="grow"><SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Buscar por descripción o número..." /></span>
        <Select value={bucket} onChange={e => { setBucket(e.target.value as Bucket); setPage(1); }} aria-label="Filtrar por estado">
          {BUCKETS.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
        </Select>
        {isAdmin && (
          <>
            <Select value={filterCompanyId} onChange={e => { setFilterCompanyId(e.target.value); setPage(1); }} aria-label="Filtrar por empresa">
              <option value="">Todas las empresas</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={departmentId} onChange={e => { setDepartmentId(e.target.value); setPage(1); }} aria-label="Filtrar por departamento">
              <option value="">Todos los departamentos</option>
              {departamentos.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <Select value={requesterId} onChange={e => { setRequesterId(e.target.value); setPage(1); }} aria-label="Filtrar por solicitante">
              <option value="">Todos los solicitantes</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.displayName}</option>)}
            </Select>
          </>
        )}
        <input type="date" className="input" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} aria-label="Fecha desde" style={{ width: 'auto' }} />
        <input type="date" className="input" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} aria-label="Fecha hasta" style={{ width: 'auto' }} />
      </div>

      {loading && (
        <div className="card p16 stack-sm" aria-label="Cargando solicitudes">
          <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} /><Skeleton height={40} />
        </div>
      )}
      {!loading && error && <ErrorState title="No pudimos cargar las solicitudes." onRetry={() => void load()} />}
      {!loading && !error && requests.length === 0 && (
        <EmptyState
          title={scope === 'activas' ? 'Sin pendientes' : 'Sin historial'}
          desc={scope === 'activas' ? 'No tienes solicitudes por atender.' : 'Aún no participaste en solicitudes con estos filtros.'}
        />
      )}
      {!loading && !error && requests.length > 0 && (
        <>
          <p className="muted small" role="status">Mostrando {requests.length} de {filteredTotal} resultados.</p>
          <div className="card table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Descripción</th>
                  <th>Solicitante</th>
                  <th>Departamento</th>
                  {isAdmin && <th>Empresa</th>}
                  <th>Estado</th>
                  {scope === 'historial' && <th>Mi participación</th>}
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id} className="clickable" onClick={() => navigate(`/requester/${r.id}`)}>
                    <td data-label="N°"><strong>#{r.requestNumber}</strong></td>
                    <td data-label="Descripción" className="ellipsis">{r.requestedDescription}</td>
                    <td data-label="Solicitante">{nameOf(r.requesterId)}</td>
                    <td data-label="Departamento">{deptOf(r.departmentId)}</td>
                    {isAdmin && <td data-label="Empresa" className="cell-secondary">{companyOf(r.companyId)}</td>}
                    <td data-label="Estado"><StatusBadge status={r.status} /></td>
                    {scope === 'historial' && (
                      <td data-label="Mi participación">
                        {r.requesterId === user?.id && !r.miParticipacion ? (
                          <span>✓ Solicité</span>
                        ) : r.miParticipacion ? (
                          <span>✓ {r.miParticipacion.accion}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    )}
                    <td data-label="Fecha" className="muted small">{new Date(r.createdAt).toLocaleDateString('es-VE')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager" role="navigation" aria-label="Paginación de solicitudes">
            <label className="muted small">Por página
              <select className="input" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }} aria-label="Solicitudes por página" style={{ width: 'auto', marginLeft: 6 }}>
                {[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <span className="muted small">Página {page} de {totalPages}</span>
            <Button size="sm" variant="secondary" onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page <= 1}>Anterior</Button>
            <Button size="sm" variant="secondary" onClick={() => setPage(p => Math.min(p + 1, totalPages))} disabled={page >= totalPages}>Siguiente</Button>
          </div>
        </>
      )}
    </Page>
  );
};
