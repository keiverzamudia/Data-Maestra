/**
 * 10F — Backfill RolePermission. Idempotente, no destructivo.
 * Pobla role_permissions con los conjuntos reales por rol (misma matriz que
 * seed.js). Solo INSERTA las parejas faltantes; nunca borra ni modifica.
 * AUDITOR queda sin permisos (mismo comportamiento efectivo que el puente 10E).
 * Sin overrides individuales (10G).
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ROLE_PERMISSIONS = {
  REQUESTER: ['REQUEST.CREATE', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  DEPARTMENT_MANAGER: ['MANAGER.APPROVE', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  WAREHOUSE: ['WAREHOUSE.CLASSIFY', 'WAREHOUSE.VIEW', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  ACCOUNTING: ['ACCOUNTING.APPROVE', 'ACCOUNTING.VIEW', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  FINAL_REVIEWER: ['FINAL_REVIEW.APPROVE', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  MASTER_DATA_ADMIN: ['ADMIN.MANAGE', 'DASHBOARD.VIEW', 'AUDIT.VIEW', 'IMPORT.RUN', 'IMPORT.VIEW'],
};

async function main() {
  const report = { created: [], existing: 0, errores: [] };
  for (const [roleCode, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) {
      report.errores.push({ roleCode, motivo: 'rol no existe en BD' });
      continue;
    }
    for (const code of perms) {
      // La BD viva puede carecer de permisos del catálogo seed (solo INSERT,
      // nunca borra: el catálogo de 13 permisos es el contrato de controllers).
      let perm = await prisma.permission.findUnique({ where: { code } });
      if (!perm) {
        perm = await prisma.permission.create({ data: { code } });
        report.created.push(`permiso ${code}`);
      }
      const existing = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      });
      if (existing) {
        report.existing += 1;
        continue;
      }
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
      report.created.push(`${roleCode}→${code}`);
    }
  }
  // Verificación: MASTER_DATA_ADMIN debe otorgar ADMIN.MANAGE (evita lockout).
  const admin = await prisma.role.findUnique({
    where: { code: 'MASTER_DATA_ADMIN' },
    include: { rolePermissions: { include: { permission: { select: { code: true } } } } },
  });
  const adminPerms = (admin?.rolePermissions ?? []).map(rp => rp.permission.code);
  console.log('BACKFILL 10F:' + JSON.stringify(report));
  console.log('ADMIN_CHECK ADMIN.MANAGE presente:' + adminPerms.includes('ADMIN.MANAGE'));
  if (!adminPerms.includes('ADMIN.MANAGE')) process.exitCode = 1;
  await prisma.$disconnect();
}
main().catch(e => { console.error('BACKFILL ERROR: ' + e.message); process.exit(1); });
