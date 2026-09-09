import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CompanyProvider } from '../contextos/CompanyContext';
import { SessionProvider, useSession } from '../contextos/SessionContext';
import { AppLayout } from '../componentes/diseno/AppLayout';
import { LoginPage } from '../modulos/autenticacion';
import { PanelPage } from '../modulos/panel';
import { SolicitudesList, SolicitudCreate, SolicitudDetailPage } from '../modulos/solicitudes';
import { AlmacenList, AlmacenClassify } from '../modulos/almacen';
import { ContabilidadList } from '../modulos/contabilidad';
import { RevisionFinalPage } from '../modulos/revision-final';
import { AprobacionesPage } from '../modulos/aprobaciones';
import { ImportacionesPage } from '../modulos/importaciones';
import { AuditoriaPage } from '../modulos/auditoria';
import { AdministracionPage } from '../modulos/administracion';
import { RequirePermission } from '../componentes/auth/Can';

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </BrowserRouter>
  );
}

// FASE 10E — Puerta real: loading sin flash → sin sesión LoginPage →
// mustChangePassword cambio obligatorio → autenticado aplicación.
// CompanyProvider vive dentro (sus endpoints exigen JWT).
function Gate() {
  const { loading, authenticated, mustChangePassword } = useSession();
  if (loading) {
    return <div className="empty">Cargando sesión…</div>;
  }
  if (!authenticated) {
    return <LoginPage />;
  }
  if (mustChangePassword) {
    return <LoginPage forcedChange />;
  }
  return (
    <CompanyProvider>
      <AppLayout>
        <Routes>
              <Route path="/" element={<RequirePermission permission="DASHBOARD.VIEW"><PanelPage /></RequirePermission>} />

              {/* Solicitudes */}
              <Route path="/requester" element={<RequirePermission permission="REQUEST.VIEW"><SolicitudesList /></RequirePermission>} />
              <Route path="/requester/new" element={<RequirePermission permission="REQUEST.CREATE"><SolicitudCreate /></RequirePermission>} />
              <Route path="/requester/:id" element={<RequirePermission permission="REQUEST.VIEW"><SolicitudDetailPage /></RequirePermission>} />

              {/* Almacen */}
              <Route path="/warehouse" element={<RequirePermission permission="WAREHOUSE.VIEW"><AlmacenList /></RequirePermission>} />
              <Route path="/warehouse/:id" element={<RequirePermission permission="WAREHOUSE.VIEW"><AlmacenClassify /></RequirePermission>} />

              {/* Aprobaciones */}
              <Route path="/approvals" element={<RequirePermission permission="MANAGER.APPROVE"><AprobacionesPage /></RequirePermission>} />

              {/* Contabilidad */}
              <Route path="/accounting" element={<RequirePermission permission="ACCOUNTING.VIEW"><ContabilidadList /></RequirePermission>} />

              {/* Revision Final */}
              <Route path="/final-review" element={<RequirePermission permission="FINAL_REVIEW.APPROVE"><RevisionFinalPage /></RequirePermission>} />

              {/* Importaciones */}
              <Route path="/imports" element={<RequirePermission permission="IMPORT.VIEW"><ImportacionesPage /></RequirePermission>} />

              {/* Auditoria */}
              <Route path="/audit" element={<RequirePermission permission="AUDIT.VIEW"><AuditoriaPage /></RequirePermission>} />

              {/* Administracion */}
              <Route path="/admin" element={<RequirePermission permission="ADMIN.MANAGE"><AdministracionPage /></RequirePermission>} />

              {/* Legacy routes */}
              <Route path="/requests" element={<RequirePermission permission="REQUEST.VIEW"><SolicitudesList /></RequirePermission>} />
              <Route path="/requests/new" element={<RequirePermission permission="REQUEST.CREATE"><SolicitudCreate /></RequirePermission>} />
              <Route path="/requests/:id" element={<RequirePermission permission="REQUEST.VIEW"><SolicitudDetailPage /></RequirePermission>} />
              <Route path="/matching" element={<RequirePermission permission="IMPORT.VIEW"><ImportacionesPage /></RequirePermission>} />
              <Route path="/data-quality" element={<RequirePermission permission="IMPORT.VIEW"><ImportacionesPage /></RequirePermission>} />
              <Route path="/master-items" element={<RequirePermission permission="ADMIN.MANAGE"><AdministracionPage /></RequirePermission>} />
              <Route path="/source-items" element={<RequirePermission permission="IMPORT.VIEW"><ImportacionesPage /></RequirePermission>} />
            </Routes>
      </AppLayout>
    </CompanyProvider>
  );
}
