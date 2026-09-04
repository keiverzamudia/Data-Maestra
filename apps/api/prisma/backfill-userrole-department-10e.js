/**
 * 10E-A — Backfill UserRole.departmentId. Idempotente, no destructivo.
 * Solo asigna con evidencia inequívoca: Department.managerId === UserRole.userId
 * (el gerente pertenece a su departamento) + misma companyId.
 * u1 (REQUESTER) y u5 (MASTER_DATA_ADMIN) no dirigen ningún departamento:
 * quedan NULL como PENDIENTES documentados (no se inventa valor).
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const report = { asignados: [], pendientes: [], errores: [] };
  const roles = await prisma.userRole.findMany({ where: { departmentId: null } });
  for (const ur of roles) {
    const dept = await prisma.department.findFirst({
      where: { managerId: ur.userId, companyId: ur.companyId, active: true },
    });
    if (!dept) {
      report.pendientes.push({ userRoleId: ur.id, userId: ur.userId, roleId: ur.roleId, motivo: 'sin departamento gerenciado (sin evidencia inequívoca)' });
      continue;
    }
    await prisma.userRole.update({ where: { id: ur.id }, data: { departmentId: dept.id } });
    report.asignados.push({ userRoleId: ur.id, userId: ur.userId, departmentId: dept.id, codigo: dept.code });
  }
  // Verificación de integridad: companyId del rol === companyId del departamento
  const bad = await prisma.$queryRawUnsafe(
    `SELECT ur.id FROM user_roles ur JOIN departments d ON d.id = ur.department_id WHERE ur.department_id IS NOT NULL AND ur.company_id <> d.company_id`);
  console.log('BACKFILL 10E-A:' + JSON.stringify(report));
  console.log('INTEGRIDAD violaciones company/dept:' + JSON.stringify(bad));
  if (bad.length > 0) process.exitCode = 1;
  await prisma.$disconnect();
}
main().catch(e => { console.error('BACKFILL ERROR: ' + e.message); process.exit(1); });
