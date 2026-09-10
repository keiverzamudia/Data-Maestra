import * as React from 'react';
import { apiOrganizacionService } from '../servicios/api/api-organizacion-service';
import type { Company } from '../tipos';

interface CompanyContextType {
  companyId: string;
  setCompanyId: (id: string) => void;
  empresas: Company[];
  companies: Company[];
  loading: boolean;
}

const CompanyContext = React.createContext<CompanyContextType>({
  companyId: '',
  setCompanyId: () => {},
  empresas: [],
  companies: [],
  loading: true,
});

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companyId, setCompanyId] = React.useState('');
  const [empresas, setEmpresas] = React.useState<Company[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    apiOrganizacionService.getEmpresas().then(data => {
      if (!cancelled) {
        // 12I — el selector operativo solo ofrece empresas activas.
        const active = data.filter(c => c.active);
        setEmpresas(active);
        if (active.length > 0 && !companyId) {
          setCompanyId(active[0]!.id);
        }
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <CompanyContext.Provider value={{ companyId, setCompanyId, empresas, companies: empresas, loading }}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => React.useContext(CompanyContext);
