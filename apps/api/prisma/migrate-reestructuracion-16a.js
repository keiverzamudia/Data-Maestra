/**
 * FASE 16A — Reestructuración: Contabilidad es la última aprobación humana.
 * Elimina PENDIENTE_VALIDACION_MAESTRA, APROBADO_FINAL y REGISTRADO_PROFIT del
 * flujo activo; introduce CONTABILIDAD_APROBADA e INSERTADO_PROFIT.
 * Retira el rol FINAL_REVIEWER y el permiso FINAL_REVIEW.APPROVE.
 *
 * - Idempotente: re-ejecutar reporta 0 cambios.
 * - NO toca audit_events (trail histórico inmutable, conserva valores antiguos).
 * - NO toca Profit. Solo SQLite local.
 * - workflow_tasks no admite renombre 1:1 (dos pasos viejos → uno nuevo y el
 *   unique (instance_id, step_code) lo impediría): por instancia se consolidan
 *   las tareas VM/AF en una sola CONTABILIDAD_APROBADA (PENDING si alguna
 *   estaba PENDING; si no, COMPLETED). El recorrido se conserva en history.
 * - RBAC: desactiva (active=false, sin borrar) las membresías FINAL_REVIEWER
 *   para preservar historial; elimina sus role_permissions, el rol y el permiso
 *   (la eliminación del permiso arrastra sus enlaces por FK en cascada).
 *
 * Uso: node prisma/migrate-reestructuracion-16a.js (ejecutar con cwd = apps/api)
 */
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');

const STATUS_MAP = {
  PENDIENTE_VALIDACION_MAESTRA: 'CONTABILIDAD_APROBADA',
  APROBADO_FINAL: 'CONTABILIDAD_APROBADA',
  REGISTRADO_PROFIT: 'INSERTADO_PROFIT',
};
const OLD_TASK_STEPS = ['PENDIENTE_VALIDACION_MAESTRA', 'APROBADO_FINAL'];
const OLD_VALUES = Object.keys(STATUS_MAP);

async function main() {
  const prisma = new PrismaClient();
  const report = {};
  const j = (rows) => JSON.stringify(rows, (k, v) => (typeof v === 'bigint' ? Number(v) : v));
  try {
    // 0. Consolidar workflow_tasks por instancia (evita violar el unique).
    const affected = await prisma.$queryRawUnsafe(
      `SELECT instance_id AS instanceId FROM workflow_tasks WHERE step_code IN ('${OLD_TASK_STEPS.join("','")}') GROUP BY instance_id`,
    );
    let consolidated = 0;
    for (const row of affected) {
      const tasks = await prisma.$queryRawUnsafe(
        `SELECT id, status FROM workflow_tasks WHERE instance_id = '${row.instanceId}' AND step_code IN ('${OLD_TASK_STEPS.join("','")}')`,
      );
      const finalStatus = tasks.some((t) => t.status === 'PENDING') ? 'PENDING' : 'COMPLETED';
      await prisma.$executeRawUnsafe(
        `DELETE FROM workflow_tasks WHERE instance_id = '${row.instanceId}' AND step_code IN ('${OLD_TASK_STEPS.join("','")}')`,
      );
      const now = new Date().toISOString();
      await prisma.$executeRawUnsafe(
        `INSERT INTO workflow_tasks (id, instance_id, step_code, status, completed_at, created_at) VALUES ('${randomUUID()}', '${row.instanceId}', 'CONTABILIDAD_APROBADA', '${finalStatus}', ${finalStatus === 'COMPLETED' ? `'${now}'` : 'NULL'}, '${now}')`,
      );
      consolidated += 1;
    }
    if (consolidated > 0) report['tasks consolidadas'] = consolidated;

    // 1. requests.status
    for (const [oldV, newV] of Object.entries(STATUS_MAP)) {
      const n = await prisma.$executeRawUnsafe(`UPDATE requests SET status = '${newV}' WHERE status = '${oldV}'`);
      if (Number(n) > 0) report[`requests.status ${oldV}->${newV}`] = Number(n);
    }
    // 2. workflow_instances.current_step_code
    for (const [oldV, newV] of Object.entries(STATUS_MAP)) {
      const n = await prisma.$executeRawUnsafe(
        `UPDATE workflow_instances SET current_step_code = '${newV}' WHERE current_step_code = '${oldV}'`,
      );
      if (Number(n) > 0) report[`instances.current_step_code ${oldV}->${newV}`] = Number(n);
    }
    // 3. workflow_history.from_step / to_step
    for (const col of ['from_step', 'to_step']) {
      for (const [oldV, newV] of Object.entries(STATUS_MAP)) {
        const n = await prisma.$executeRawUnsafe(`UPDATE workflow_history SET ${col} = '${newV}' WHERE ${col} = '${oldV}'`);
        if (Number(n) > 0) report[`history.${col} ${oldV}->${newV}`] = Number(n);
      }
    }
    // 4. approvals.step_code / from_status / to_status
    for (const col of ['step_code', 'from_status', 'to_status']) {
      for (const [oldV, newV] of Object.entries(STATUS_MAP)) {
        const n = await prisma.$executeRawUnsafe(`UPDATE approvals SET ${col} = '${newV}' WHERE ${col} = '${oldV}'`);
        if (Number(n) > 0) report[`approvals.${col} ${oldV}->${newV}`] = Number(n);
      }
    }

    // 5. RBAC: desactivar membresías FINAL_REVIEWER (preserva la fila histórica).
    const frRole = await prisma.role.findUnique({ where: { code: 'FINAL_REVIEWER' } });
    if (frRole) {
      const links = await prisma.userRole.findMany({ where: { roleId: frRole.id }, include: { user: { select: { username: true } } } });
      for (const l of links) {
        await prisma.userRole.update({ where: { id: l.id }, data: { active: false } });
      }
      if (links.length > 0) report['membresías FINAL_REVIEWER desactivadas'] = links.map((l) => l.user.username);
      const delRp = await prisma.rolePermission.deleteMany({ where: { roleId: frRole.id } });
      report['role_permissions FINAL_REVIEWER eliminados'] = delRp.count;
      await prisma.role.delete({ where: { id: frRole.id } });
      report['rol FINAL_REVIEWER eliminado'] = true;
    }
    const frPerm = await prisma.permission.findUnique({ where: { code: 'FINAL_REVIEW.APPROVE' } });
    if (frPerm) {
      await prisma.permission.delete({ where: { id: frPerm.id } });
      report['permiso FINAL_REVIEW.APPROVE eliminado'] = true;
    }

    // Verificación: 0 valores antiguos restantes + 0 duplicados + RBAC limpio.
    const asList = (arr) => arr.map((v) => `'${v}'`).join(',');
    const restRequests = await prisma.$queryRawUnsafe(`SELECT status, COUNT(*) c FROM requests WHERE status IN (${asList(OLD_VALUES)}) GROUP BY status`);
    const restTasks = await prisma.$queryRawUnsafe(`SELECT step_code, COUNT(*) c FROM workflow_tasks WHERE step_code IN (${asList(OLD_VALUES)}) GROUP BY step_code`);
    const restInst = await prisma.$queryRawUnsafe(`SELECT current_step_code, COUNT(*) c FROM workflow_instances WHERE current_step_code IN (${asList(OLD_VALUES)}) GROUP BY current_step_code`);
    const restHist = await prisma.$queryRawUnsafe(`SELECT from_step, to_step, COUNT(*) c FROM workflow_history WHERE from_step IN (${asList(OLD_VALUES)}) OR to_step IN (${asList(OLD_VALUES)}) GROUP BY from_step, to_step`);
    const restAppr = await prisma.$queryRawUnsafe(`SELECT step_code, from_status, to_status, COUNT(*) c FROM approvals WHERE step_code IN (${asList(OLD_VALUES)}) OR from_status IN (${asList(OLD_VALUES)}) OR to_status IN (${asList(OLD_VALUES)}) GROUP BY step_code, from_status, to_status`);
    const dupes = await prisma.$queryRawUnsafe(`SELECT instance_id, step_code, COUNT(*) c FROM workflow_tasks GROUP BY instance_id, step_code HAVING COUNT(*) > 1`);
    const restRole = await prisma.role.findUnique({ where: { code: 'FINAL_REVIEWER' } });
    const restPerm = await prisma.permission.findUnique({ where: { code: 'FINAL_REVIEW.APPROVE' } });

    console.log('MIGRACION 16A REPORTE:' + JSON.stringify(report, null, 0));
    console.log('RESTOS requests:' + j(restRequests));
    console.log('RESTOS tasks:' + j(restTasks));
    console.log('RESTOS instances:' + j(restInst));
    console.log('RESTOS history:' + j(restHist));
    console.log('RESTOS approvals:' + j(restAppr));
    console.log('DUPLICADOS tasks:' + j(dupes));
    console.log('RESTO rol:' + !!restRole + ' resto permiso:' + !!restPerm);
    const ok =
      restRequests.length === 0 && restTasks.length === 0 && restInst.length === 0 &&
      restHist.length === 0 && restAppr.length === 0 && dupes.length === 0 &&
      !restRole && !restPerm;
    console.log(ok ? 'MIGRACION 16A: OK' : 'MIGRACION 16A: PENDIENTES (ver restos arriba)');
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('MIGRACION 16A ERROR: ' + e.message);
  process.exit(1);
});
