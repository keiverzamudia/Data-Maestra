import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import * as React from 'react';
import { CompanyProvider } from '../contextos/CompanyContext';
import { SessionProvider, useSession } from '../contextos/SessionContext';
import { AppLayout } from '../componentes/diseno/AppLayout';
import { LoginPage } from '../modulos/autenticacion';
import { PanelPage } from '../modulos/panel';
import { SolicitudesList, SolicitudCreate, SolicitudDetailPage, MisSolicitudesPage, TodasSolicitudesPage } from '../modulos/solicitudes';
import { AlmacenList, AlmacenClassify } from '../modulos/almacen';
import { AprobacionAlmacenPage } from '../modulos/aprobacion-almacen';
import { ContabilidadList } from '../modulos/contabilidad';
import { AprobacionesPage } from '../modulos/aprobaciones';
import { ImportacionesPage } from '../modulos/importaciones';
import { AuditoriaPage } from '../modulos/auditoria';
import { AdministracionPage } from '../modulos/administracion';
import { RequirePermission } from '../componentes/auth/Can';
import { apiRolesService } from '../servicios/api/api-roles-service';
import { resolveHomeRoute } from '../utilidades/vista-principal';

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </BrowserRouter>
  );
}

// FASE 10E/15 — Puerta real: loading sin flash → sin sesión LoginPage →
// autenticado aplicación. La contraseña se valida contra Profit.
// CompanyProvider vive dentro (sus endpoints exigen JWT).
// FASE 20 — '/' es la única fuente de verdad de la vista principal: resuelve
// vía /roles/mi-vista en cada entrada (login, directo, recarga, sesión nueva).
// Con DASHBOARD.VIEW muestra el Dashboard Gerencial; sin él redirige al
// fallback personal (/solicitudes). Nunca deja pantalla prohibida en la raíz.
export function HomeIndex() {
  const { hasPermission } = useSession();
  const navigate = useNavigate();
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    apiRolesService.miVista().then(
      (v) => {
        if (cancelled) return;
        const dest = resolveHomeRoute(v, hasPermission);
        if (dest !== '/') navigate(dest, { replace: true });
        else setReady(true);
      },
      () => {
        if (!cancelled) navigate('/solicitudes', { replace: true });
      },
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!ready) return <div className="empty">Cargando…</div>;
  return <RequirePermission permission="DASHBOARD.VIEW"><PanelPage /></RequirePermission>;
}

function Gate() {
  const { loading, authenticated } = useSession();
  if (loading) {
    return <div className="empty">Cargando sesión…</div>;
  }
  if (!authenticated) {
    return <LoginPage />;
  }
  return (
    <CompanyProvider>
      <AppLayout>
        <Routes>
              <Route path="/" element={<HomeIndex />} />

              {/* Solicitudes */}
              <Route path="/solicitudes" element={<RequirePermission permission="REQUEST.VIEW"><MisSolicitudesPage /></RequirePermission>} />
              <Route path="/solicitudes/todas" element={<RequirePermission permission="SOLICITUDES.VIEW_ALL"><TodasSolicitudesPage /></RequirePermission>} />
              <Route path="/requester" element={<RequirePermission permission="REQUEST.VIEW"><SolicitudesList /></RequirePermission>} />
              <Route path="/requester/new" element={<RequirePermission permission="REQUEST.CREATE"><SolicitudCreate /></RequirePermission>} />
              <Route path="/requester/:id" element={<RequirePermission permission="REQUEST.VIEW"><SolicitudDetailPage /></RequirePermission>} />

              {/* Almacen */}
              <Route path="/warehouse" element={<RequirePermission permission="WAREHOUSE.VIEW"><AlmacenList /></RequirePermission>} />
              <Route path="/warehouse/:id" element={<RequirePermission permission="WAREHOUSE.VIEW"><AlmacenClassify /></RequirePermission>} />

              {/* Aprobación Almacén (15A: Encargado revisa lo clasificado) */}
              <Route path="/aprobacion-almacen" element={<RequirePermission permission="WAREHOUSE_MANAGER.VIEW"><AprobacionAlmacenPage /></RequirePermission>} />

              {/* Aprobaciones */}
              <Route path="/approvals" element={<RequirePermission permission="MANAGER.APPROVE"><AprobacionesPage /></RequirePermission>} />

              {/* Contabilidad (16A: última aprobación humana + pestaña Profit) */}
              <Route path="/accounting" element={<RequirePermission permission="ACCOUNTING.VIEW"><ContabilidadList /></RequirePermission>} />

              {/* Importaciones */}
              <Route path="/imports" element={<RequirePermission permission="IMPORT.VIEW"><ImportacionesPage /></RequirePermission>} />

              {/* Auditoria */}
              <Route path="/audit" element={<RequirePermission permission="AUDIT.VIEW"><AuditoriaPage /></RequirePermission>} />

              {/* Administracion */}
              <Route path="/admin" element={<RequirePermission permission="ADMIN.MANAGE"><AdministracionPage /></RequirePermission>} />
              <Route path="/admin/organizacion" element={<RequirePermission permission="ADMIN.MANAGE"><AdministracionPage section="organizacion" /></RequirePermission>} />
              <Route path="/admin/roles" element={<RequirePermission permission="ADMIN.MANAGE"><AdministracionPage section="roles" /></RequirePermission>} />
              <Route path="/admin/catalogos" element={<RequirePermission permission="ADMIN.MANAGE"><AdministracionPage section="catalogos" /></RequirePermission>} />
              <Route path="/admin/historico" element={<RequirePermission permission="ADMIN.MANAGE"><AdministracionPage section="historico" /></RequirePermission>} />

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
