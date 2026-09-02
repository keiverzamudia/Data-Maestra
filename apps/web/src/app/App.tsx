import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CompanyProvider } from '../contextos/CompanyContext';
import { SessionProvider } from '../contextos/SessionContext';
import { AppLayout } from '../componentes/diseno/AppLayout';
import { PanelPage } from '../modulos/panel';
import { SolicitudesList, SolicitudCreate, SolicitudDetailPage } from '../modulos/solicitudes';
import { AlmacenList, AlmacenClassify } from '../modulos/almacen';
import { ContabilidadList } from '../modulos/contabilidad';
import { RevisionFinalPage } from '../modulos/revision-final';
import { AprobacionesPage } from '../modulos/aprobaciones';
import { ImportacionesPage } from '../modulos/importaciones';
import { AuditoriaPage } from '../modulos/auditoria';
import { AdministracionPage } from '../modulos/administracion';

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <CompanyProvider>
          <AppLayout>
            <Routes>
              <Route path="/" element={<PanelPage />} />

              {/* Solicitudes */}
              <Route path="/requester" element={<SolicitudesList />} />
              <Route path="/requester/new" element={<SolicitudCreate />} />
              <Route path="/requester/:id" element={<SolicitudDetailPage />} />

              {/* Almacen */}
              <Route path="/warehouse" element={<AlmacenList />} />
              <Route path="/warehouse/:id" element={<AlmacenClassify />} />

              {/* Aprobaciones */}
              <Route path="/approvals" element={<AprobacionesPage />} />

              {/* Contabilidad */}
              <Route path="/accounting" element={<ContabilidadList />} />

              {/* Revision Final */}
              <Route path="/final-review" element={<RevisionFinalPage />} />

              {/* Importaciones */}
              <Route path="/imports" element={<ImportacionesPage />} />

              {/* Auditoria */}
              <Route path="/audit" element={<AuditoriaPage />} />

              {/* Administracion */}
              <Route path="/admin" element={<AdministracionPage />} />

              {/* Legacy routes */}
              <Route path="/requests" element={<SolicitudesList />} />
              <Route path="/requests/new" element={<SolicitudCreate />} />
              <Route path="/requests/:id" element={<SolicitudDetailPage />} />
              <Route path="/matching" element={<ImportacionesPage />} />
              <Route path="/data-quality" element={<ImportacionesPage />} />
              <Route path="/master-items" element={<AdministracionPage />} />
              <Route path="/source-items" element={<ImportacionesPage />} />
            </Routes>
          </AppLayout>
        </CompanyProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
