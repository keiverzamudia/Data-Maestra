import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CompanyProvider } from '../contexts/CompanyContext';
import { SessionProvider } from '../contexts/SessionContext';
import { AppLayout } from '../components/layout/AppLayout';
import { DashboardPage } from '../modules/dashboard';
import { RequesterList, RequestCreate, RequestDetailPage } from '../modules/requester';
import { WarehouseList, WarehouseClassify } from '../modules/warehouse';
import { AccountingList } from '../modules/accounting';
import { ApprovalsPage } from '../modules/approvals';
import { ImportsPage } from '../modules/imports';
import { AuditPage } from '../modules/audit';
import { AdminPage } from '../modules/administration';

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <CompanyProvider>
          <AppLayout>
            <Routes>
              <Route path="/" element={<DashboardPage />} />

              {/* Requester module */}
              <Route path="/requester" element={<RequesterList />} />
              <Route path="/requester/new" element={<RequestCreate />} />
              <Route path="/requester/:id" element={<RequestDetailPage />} />

              {/* Warehouse / Classification module */}
              <Route path="/warehouse" element={<WarehouseList />} />
              <Route path="/warehouse/:id" element={<WarehouseClassify />} />

              {/* Manager approvals */}
              <Route path="/approvals" element={<ApprovalsPage />} />

              {/* Accounting module */}
              <Route path="/accounting" element={<AccountingList />} />

              {/* Imports / Pipeline */}
              <Route path="/imports" element={<ImportsPage />} />

              {/* Audit */}
              <Route path="/audit" element={<AuditPage />} />

              {/* Administration */}
              <Route path="/admin" element={<AdminPage />} />

              {/* Legacy routes */}
              <Route path="/requests" element={<RequesterList />} />
              <Route path="/requests/new" element={<RequestCreate />} />
              <Route path="/requests/:id" element={<RequestDetailPage />} />
              <Route path="/matching" element={<ImportsPage />} />
              <Route path="/data-quality" element={<ImportsPage />} />
              <Route path="/master-items" element={<AdminPage />} />
              <Route path="/source-items" element={<ImportsPage />} />
            </Routes>
          </AppLayout>
        </CompanyProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
