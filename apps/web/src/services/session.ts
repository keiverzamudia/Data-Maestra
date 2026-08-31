import type { SessionUser } from '../contracts';
import { companies, departments, users } from '../mock/companies';

// Mock session - simulates a logged-in user
const currentUserId = 'u1';
const currentCompanyId = 'c1';

const user = users.find(u => u.id === currentUserId)!;
const company = companies.find(c => c.id === currentCompanyId)!;
const dept = departments.find(d => d.companyId === currentCompanyId && d.name === 'Compras')!;
const manager = users.find(u => u.id === dept.managerId)!;

export const mockSession: SessionUser = {
  id: user.id,
  name: user.displayName,
  username: user.username,
  department: {
    id: dept.id,
    code: dept.code,
    name: dept.name,
    managerId: dept.managerId!,
    managerName: manager.displayName,
  },
  company: {
    id: company.id,
    name: company.name,
    code: company.code,
  },
  permissions: [
    'REQUEST.CREATE',
    'REQUEST.VIEW',
    'WAREHOUSE.CLASSIFY',
    'WAREHOUSE.VIEW',
    'ACCOUNTING.APPROVE',
    'ACCOUNTING.VIEW',
    'IMPORT.RUN',
    'IMPORT.VIEW',
    'AUDIT.VIEW',
    'ADMIN.MANAGE',
    'DASHBOARD.VIEW',
  ],
  roleCodes: user.roleCodes,
};

// Permission check helper
export function hasPermission(permission: string): boolean {
  return mockSession.permissions.includes(permission);
}

// Get all visible modules based on permissions
export function getVisibleModules(): string[] {
  const modules: string[] = [];
  if (hasPermission('DASHBOARD.VIEW')) modules.push('dashboard');
  if (hasPermission('REQUEST.CREATE') || hasPermission('REQUEST.VIEW')) modules.push('requester');
  if (hasPermission('WAREHOUSE.CLASSIFY') || hasPermission('WAREHOUSE.VIEW')) modules.push('warehouse');
  if (hasPermission('ACCOUNTING.APPROVE') || hasPermission('ACCOUNTING.VIEW')) modules.push('accounting');
  if (hasPermission('IMPORT.RUN') || hasPermission('IMPORT.VIEW')) modules.push('imports');
  if (hasPermission('AUDIT.VIEW')) modules.push('audit');
  if (hasPermission('ADMIN.MANAGE')) modules.push('administration');
  return modules;
}
