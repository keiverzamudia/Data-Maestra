import { Injectable } from '@nestjs/common';

export interface SessionUser {
  id: string;
  name: string;
  username: string;
  department: {
    id: string;
    code: string;
    name: string;
    managerId: string;
    managerName: string;
  };
  company: {
    id: string;
    name: string;
    code: string;
  };
  permissions: string[];
  roleCodes: string[];
}

export interface TestUser {
  id: string;
  name: string;
  role: string;
  department: string;
  roleCodes: string[];
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  REQUESTER: ['REQUEST.CREATE', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  DEPARTMENT_MANAGER: ['MANAGER.APPROVE', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  WAREHOUSE: ['WAREHOUSE.CLASSIFY', 'WAREHOUSE.VIEW', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  ACCOUNTING: ['ACCOUNTING.APPROVE', 'ACCOUNTING.VIEW', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  FINAL_REVIEWER: ['FINAL_REVIEW.APPROVE', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  MASTER_DATA_ADMIN: ['ADMIN.MANAGE', 'DASHBOARD.VIEW', 'AUDIT.VIEW', 'IMPORT.RUN', 'IMPORT.VIEW'],
};

const USERS: Record<string, { id: string; name: string; username: string; deptId: string; deptCode: string; deptName: string; managerId: string; managerName: string; roleCodes: string[] }> = {
  u1: { id: 'u1', name: 'Juan Pérez', username: 'j.perez', deptId: 'd1', deptCode: 'COMPRAS', deptName: 'Compras', managerId: 'u2', managerName: 'María García', roleCodes: ['REQUESTER'] },
  u2: { id: 'u2', name: 'María García', username: 'm.garcia', deptId: 'd1', deptCode: 'COMPRAS', deptName: 'Compras', managerId: 'u2', managerName: 'María García', roleCodes: ['DEPARTMENT_MANAGER'] },
  u3: { id: 'u3', name: 'Carlos Rodríguez', username: 'c.rodriguez', deptId: 'd2', deptCode: 'ALMACEN', deptName: 'Almacén', managerId: 'u3', managerName: 'Carlos Rodríguez', roleCodes: ['WAREHOUSE'] },
  u4: { id: 'u4', name: 'Ana López', username: 'a.lopez', deptId: 'd3', deptCode: 'CONTAB', deptName: 'Contabilidad', managerId: 'u4', managerName: 'Ana López', roleCodes: ['ACCOUNTING'] },
  u5: { id: 'u5', name: 'Luis Martínez', username: 'l.martinez', deptId: 'd3', deptCode: 'CONTAB', deptName: 'Contabilidad', managerId: 'u5', managerName: 'Luis Martínez', roleCodes: ['FINAL_REVIEWER', 'MASTER_DATA_ADMIN'] },
};

@Injectable()
export class AuthService {
  private currentUserId = 'u1';

  setCurrentUser(userId: string) {
    if (USERS[userId]) {
      this.currentUserId = userId;
    }
  }

  getCurrentUserId(): string {
    return this.currentUserId;
  }

  getTestUsers(): TestUser[] {
    return Object.values(USERS).map(u => ({
      id: u.id,
      name: u.name,
      role: u.roleCodes[0] ?? 'UNKNOWN',
      department: u.deptName,
      roleCodes: u.roleCodes,
    }));
  }

  getSession(): SessionUser {
    const u = USERS[this.currentUserId] ?? USERS.u1!;
    const permissions = new Set<string>();
    for (const role of u.roleCodes) {
      for (const perm of ROLE_PERMISSIONS[role] ?? []) {
        permissions.add(perm);
      }
    }

    return {
      id: u.id,
      name: u.name,
      username: u.username,
      department: {
        id: u.deptId,
        code: u.deptCode,
        name: u.deptName,
        managerId: u.managerId,
        managerName: u.managerName,
      },
      company: {
        id: 'c1',
        name: 'Empresa A — Distribuidora Central',
        code: 'EMP-A',
      },
      permissions: Array.from(permissions),
      roleCodes: u.roleCodes,
    };
  }
}
