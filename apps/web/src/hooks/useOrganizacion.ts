import * as React from 'react';
import { apiOrganizacionService } from '../servicios/api/api-organizacion-service';
import type { Company, Department, User, Role } from '../tipos';

interface OrganizacionState {
  empresas: Company[];
  departamentos: Department[];
  usuarios: User[];
  roles: Role[];
  loading: boolean;
  error: string | null;
}

export function useOrganizacion(companyId?: string) {
  const [state, setState] = React.useState<OrganizacionState>({
    empresas: [],
    departamentos: [],
    usuarios: [],
    roles: [],
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [empresas, departamentos, usuarios, roles] = await Promise.all([
          apiOrganizacionService.getEmpresas(),
          apiOrganizacionService.getDepartamentos(companyId),
          apiOrganizacionService.getUsuarios(companyId),
          apiOrganizacionService.getRoles(),
        ]);

        if (!cancelled) {
          setState({ empresas, departamentos, usuarios, roles, loading: false, error: null });
        }
      } catch (err: any) {
        if (!cancelled) {
          setState(prev => ({ ...prev, loading: false, error: err?.message || 'Error al cargar datos de organización' }));
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [companyId]);

  return state;
}
