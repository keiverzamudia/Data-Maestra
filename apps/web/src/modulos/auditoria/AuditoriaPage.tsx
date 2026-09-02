import * as React from 'react';
import { auditService } from '../../servicios';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { PageHeader, SearchInput, Badge, EmptyState, Modal, Button } from '../../componentes/ui';
import type { AuditEvent } from '../../tipos';

export const AuditPage: React.FC = () => {
  const { usuarios } = useOrganizacion();
  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<AuditEvent | null>(null);

  React.useEffect(() => {
    auditService.getEvents().then(r => {
      setEvents(r.data);
      setLoading(false);
    });
  }, []);

  const filtered = search
    ? events.filter(e => e.action.toLowerCase().includes(search.toLowerCase()) || e.entityType.toLowerCase().includes(search.toLowerCase()))
    : events;

  const actionColors: Record<string, string> = {
    CREATE: 'green', APPROVE: 'blue', RETURN: 'yellow', REJECT: 'red',
    MERGE: 'blue', IMPORT_RUN: 'gray', UPDATE: 'yellow',
  };

  return (
    <div className="stack">
      <PageHeader title="Auditoría" subtitle="Registro de eventos del sistema" />

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por acción, entidad..." />

      {loading ? (
        <div className="empty">Cargando...</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No hay eventos" desc="No se encontraron eventos de auditoría" />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Módulo</th>
                <th>Entidad</th>
                <th>Acción</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ev => (
                <tr key={ev.id} className="clickable" onClick={() => setSelected(ev)}>
                  <td className="muted small">{new Date(ev.createdAt).toLocaleString('es-VE')}</td>
                  <td>{usuarios.find(u => u.id === ev.actorId)?.displayName || ev.actorId}</td>
                  <td>{ev.entityType}</td>
                  <td><code className="code" style={{ fontSize: 11, padding: '2px 6px' }}>{ev.entityId}</code></td>
                  <td><Badge tone={(actionColors[ev.action] as any) || 'gray'}>{ev.action}</Badge></td>
                  <td><Badge tone="green">OK</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Detalle de Evento">
        {selected && (
          <div className="stack-sm">
            <div className="review-grid">
              <div><span className="muted small">Fecha</span><br />{new Date(selected.createdAt).toLocaleString('es-VE')}</div>
              <div><span className="muted small">Correlation ID</span><br /><code>{selected.correlationId}</code></div>
              <div><span className="muted small">Usuario</span><br />{usuarios.find(u => u.id === selected.actorId)?.displayName || selected.actorId}</div>
              <div><span className="muted small">Entidad</span><br />{selected.entityType} — {selected.entityId}</div>
              <div><span className="muted small">Acción</span><br /><Badge tone={(actionColors[selected.action] as any) || 'gray'}>{selected.action}</Badge></div>
            </div>
            {selected.beforeData != null && (
              <div>
                <span className="muted small">Antes</span>
                <pre className="code" style={{ marginTop: 4 }}>{JSON.stringify(selected.beforeData as object, null, 2)}</pre>
              </div>
            )}
            {selected.afterData != null && (
              <div>
                <span className="muted small">Después</span>
                <pre className="code" style={{ marginTop: 4 }}>{JSON.stringify(selected.afterData as object, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
