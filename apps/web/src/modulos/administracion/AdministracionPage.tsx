import * as React from 'react';
import { PageHeader, Button, Tabs } from '../../componentes/ui';
import { useCatalogos } from '../../hooks/useCatalogos';
import { useOrganizacion } from '../../hooks/useOrganizacion';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="card p16">
    <h3 className="h1" style={{ fontSize: 16 }}>{title}</h3>
    <div style={{ marginTop: 8 }}>{children}</div>
  </div>
);

export const AdminPage: React.FC = () => {
  const [tab, setTab] = React.useState(0);
  const { grupos, subgrupos, categorias, marcas, unidades } = useCatalogos();
  const { empresas, departamentos, usuarios, roles: rolesData } = useOrganizacion();
  const tabs = ['Usuarios', 'Roles', 'Empresas', 'Departamentos', 'Catálogos', 'Configuración'];

  return (
    <div className="stack">
      <PageHeader title="Administración" subtitle="Gestión del sistema" />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 0 && (
        <Section title="Usuarios">
          <table className="table">
            <thead><tr><th>Nombre</th><th>Usuario</th><th>Email</th><th>rolesData</th><th>Estado</th></tr></thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.displayName}</strong></td>
                  <td>{u.username}</td>
                  <td className="muted">{u.email}</td>
                  <td>{u.roleCodes.join(', ')}</td>
                  <td><span className={`badge ${u.active ? 'badge-green' : 'badge-red'}`}>{u.active ? 'Activo' : 'Inactivo'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {tab === 1 && (
        <Section title="rolesData y Permisos">
          <table className="table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Descripción</th></tr></thead>
            <tbody>
              {rolesData.map(r => (
                <tr key={r.id}>
                  <td><code>{r.code}</code></td>
                  <td><strong>{r.name}</strong></td>
                  <td className="muted">{r.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {tab === 2 && (
        <Section title="Empresas">
          <table className="table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Estado</th></tr></thead>
            <tbody>
              {empresas.map(c => (
                <tr key={c.id}>
                  <td><code>{c.code}</code></td>
                  <td><strong>{c.name}</strong></td>
                  <td><span className={`badge ${c.active ? 'badge-green' : 'badge-red'}`}>{c.active ? 'Activa' : 'Inactiva'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {tab === 3 && (
        <Section title="Departamentos">
          <table className="table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Empresa</th><th>Gerente</th></tr></thead>
            <tbody>
              {departamentos.map(d => (
                <tr key={d.id}>
                  <td><code>{d.code}</code></td>
                  <td><strong>{d.name}</strong></td>
                  <td>{empresas.find(c => c.id === d.companyId)?.name || '—'}</td>
                  <td>{usuarios.find(u => u.id === d.managerId)?.displayName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {tab === 4 && (
        <div className="stack">
          <Section title="Grupos">
            <div className="kpi-grid">
              {grupos.map(g => (
                <div key={g.id} className="kpi">
                  <div className="kpi-label">{g.code}</div>
                  <div className="kpi-value" style={{ fontSize: 14 }}>{g.name}</div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Subgrupos">
            <div className="kpi-grid">
              {subgrupos.map(s => (
                <div key={s.id} className="kpi">
                  <div className="kpi-label">{s.code}</div>
                  <div className="kpi-value" style={{ fontSize: 14 }}>{s.name}</div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Marcas">
            <div className="kpi-grid">
              {marcas.map(b => (
                <div key={b.id} className="kpi">
                  <div className="kpi-label">{b.normalizedName}</div>
                  <div className="kpi-value" style={{ fontSize: 14 }}>{b.name}</div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Unidades de Medida">
            <div className="kpi-grid">
              {unidades.map(u => (
                <div key={u.id} className="kpi">
                  <div className="kpi-label">{u.code}</div>
                  <div className="kpi-value" style={{ fontSize: 14 }}>{u.name}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {tab === 5 && (
        <Section title="Configuración">
          <div className="stack-sm">
            <div className="review-grid">
              <div><span className="muted small">Fuente de datos</span><br /><strong>MOCK</strong></div>
              <div><span className="muted small">Versión</span><br /><strong>0.1.0-phase-1.1</strong></div>
              <div><span className="muted small">Entorno</span><br /><strong>Desarrollo</strong></div>
              <div><span className="muted small">Backend</span><br /><strong>No conectado</strong></div>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
};
