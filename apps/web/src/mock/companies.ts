import type { Company, Department, User, Role } from '../types';
export const companies: Company[] = [
  { id: 'c1', name: 'Empresa A — Distribuidora Central', code: 'EMP-A', active: true },
  { id: 'c2', name: 'Empresa B — Logística Norte', code: 'EMP-B', active: true },
  { id: 'c3', name: 'Empresa C — Servicios Industriales', code: 'EMP-C', active: true },
];
export const departments: Department[] = [
  { id: 'd1', companyId: 'c1', name: 'Compras', code: 'COMPRAS', managerId: 'u2', active: true },
  { id: 'd2', companyId: 'c1', name: 'Almacén', code: 'ALMACEN', managerId: 'u3', active: true },
  { id: 'd3', companyId: 'c1', name: 'Contabilidad', code: 'CONTAB', managerId: 'u4', active: true },
  { id: 'd4', companyId: 'c2', name: 'Operaciones', code: 'OPER', managerId: 'u2', active: true },
  { id: 'd5', companyId: 'c2', name: 'Almacén', code: 'ALM-B', managerId: 'u3', active: true },
  { id: 'd6', companyId: 'c3', name: 'Mantenimiento', code: 'MANT', managerId: 'u5', active: true },
];
export const users: User[] = [
  { id: 'u1', username: 'j.perez', displayName: 'Juan Pérez', email: 'j.perez@empresa.com', active: true, roleCodes: ['REQUESTER'], companyIds: ['c1'] },
  { id: 'u2', username: 'm.garcia', displayName: 'María García', email: 'm.garcia@empresa.com', active: true, roleCodes: ['DEPARTMENT_MANAGER'], companyIds: ['c1','c2'] },
  { id: 'u3', username: 'c.rodriguez', displayName: 'Carlos Rodríguez', email: 'c.rodriguez@empresa.com', active: true, roleCodes: ['WAREHOUSE'], companyIds: ['c1','c2'] },
  { id: 'u4', username: 'a.lopez', displayName: 'Ana López', email: 'a.lopez@empresa.com', active: true, roleCodes: ['ACCOUNTING'], companyIds: ['c1'] },
  { id: 'u5', username: 'l.martinez', displayName: 'Luis Martínez', email: 'l.martinez@empresa.com', active: true, roleCodes: ['FINAL_REVIEWER','MASTER_DATA_ADMIN'], companyIds: ['c1','c2','c3'] },
  { id: 'u6', username: 's.admin', displayName: 'Super Admin', email: 'admin@empresa.com', active: true, roleCodes: ['SUPER_ADMIN'], companyIds: ['c1','c2','c3'] },
];
export const roles: Role[] = [
  { id: 'r1', code: 'REQUESTER', name: 'Solicitante', description: 'Crea solicitudes' },
  { id: 'r2', code: 'DEPARTMENT_MANAGER', name: 'Gerente', description: 'Aprueba solicitudes del departamento' },
  { id: 'r3', code: 'WAREHOUSE', name: 'Almacén', description: 'Clasifica artículos' },
  { id: 'r4', code: 'ACCOUNTING', name: 'Contabilidad', description: 'Valida información contable' },
  { id: 'r5', code: 'FINAL_REVIEWER', name: 'Revisión Final', description: 'Control de calidad final' },
  { id: 'r6', code: 'MASTER_DATA_ADMIN', name: 'Admin MDM', description: 'Gestiona master data' },
  { id: 'r7', code: 'AUDITOR', name: 'Auditor', description: 'Solo lectura' },
];
export const currentUser: User = users[0]!;
