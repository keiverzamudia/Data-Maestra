/**
 * FASE 8G — Migración de estados del workflow inglés → español (SQLite dev).
 *
 * - Idempotente: solo actualiza filas que aún tengan valores antiguos.
 *   Re-ejecutar reporta 0 cambios.
 * - No crea ni elimina filas: UPDATE ... WHERE valor_antiguo.
 * - No toca createdAt/updatedAt (UPDATE directo de columnas de estado).
 * - No duplica WorkflowTask: los step_code se renombran in situ, el unique
 *   (instanceId, stepCode) se conserva porque el mapeo es 1:1.
 * - NO toca audit_events.beforeData/afterData (trail histórico inmutable).
 * - NO toca workflow_tasks.status (PENDING/COMPLETED es otro dominio).
 * - NO toca Profit. Solo SQLite local.
 *
 * Uso: node prisma/migrate-workflow-states-8g.js
 * (ejecutar con cwd = apps/api)
 */
const { PrismaClient } = require('@prisma/client');

const MIGRATION = {
  DRAFT: 'BORRADOR',
  PENDING_MANAGER: 'PENDIENTE_GERENTE',
  PENDING_WAREHOUSE: 'PENDIENTE_ALMACEN',
  WAREHOUSE_APPROVED: 'ALMACEN_APROBADO',
  PENDING_ACCOUNTING: 'PENDIENTE_CONTABILIDAD',
  PENDING_FINAL_REVIEW: 'PENDIENTE_VALIDACION_MAESTRA',
  PENDING_MASTER: 'PENDIENTE_VALIDACION_MAESTRA',
  FINAL_APPROVED: 'APROBADO_FINAL',
  APPROVED: 'APROBADO_FINAL',
  RETURNED: 'DEVUELTO',
  REJECTED: 'RECHAZADO',
  PROFIT_PROCESSING: 'PROCESANDO_PROFIT',
  PROFIT_INSERTED: 'REGISTRADO_PROFIT',
  PROFIT_ERROR: 'ERROR_PROFIT',
};

const OLD_VALUES = Object.keys(MIGRATION);
const asList = (arr) => arr.map((v) => `'${v}'`).join(',');

async function main() {
  const prisma = new PrismaClient();
  const report = {};
  try {
    // 1. requests.status
    for (const [oldV, newV] of Object.entries(MIGRATION)) {
      const n = await prisma.$executeRawUnsafe(
        `UPDATE requests SET status = '${newV}' WHERE status = '${oldV}'`,
      );
      if (n > 0) report[`requests.status ${oldV}->${newV}`] = n;
    }
    // 2. workflow_instances.current_step_code
    for (const [oldV, newV] of Object.entries(MIGRATION)) {
      const n = await prisma.$executeRawUnsafe(
        `UPDATE workflow_instances SET current_step_code = '${newV}' WHERE current_step_code = '${oldV}'`,
      );
      if (n > 0) report[`instances.current_step_code ${oldV}->${newV}`] = n;
    }
    // 3. workflow_tasks.step_code
    for (const [oldV, newV] of Object.entries(MIGRATION)) {
      const n = await prisma.$executeRawUnsafe(
        `UPDATE workflow_tasks SET step_code = '${newV}' WHERE step_code = '${oldV}'`,
      );
      if (n > 0) report[`tasks.step_code ${oldV}->${newV}`] = n;
    }
    // 4. workflow_history.from_step / to_step
    for (const col of ['from_step', 'to_step']) {
      for (const [oldV, newV] of Object.entries(MIGRATION)) {
        const n = await prisma.$executeRawUnsafe(
          `UPDATE workflow_history SET ${col} = '${newV}' WHERE ${col} = '${oldV}'`,
        );
        if (n > 0) report[`history.${col} ${oldV}->${newV}`] = n;
      }
    }
    // 5. approvals.step_code / from_status / to_status
    for (const col of ['step_code', 'from_status', 'to_status']) {
      for (const [oldV, newV] of Object.entries(MIGRATION)) {
        const n = await prisma.$executeRawUnsafe(
          `UPDATE approvals SET ${col} = '${newV}' WHERE ${col} = '${oldV}'`,
        );
        if (n > 0) report[`approvals.${col} ${oldV}->${newV}`] = n;
      }
    }

    // Verificación: 0 valores antiguos restantes
    const j = (rows) => JSON.stringify(rows, (k, v) => (typeof v === 'bigint' ? Number(v) : v));
    const restRequests = await prisma.$queryRawUnsafe(
      `SELECT status, COUNT(*) c FROM requests WHERE status IN (${asList(OLD_VALUES)}) GROUP BY status`,
    );
    const restTasks = await prisma.$queryRawUnsafe(
      `SELECT step_code, COUNT(*) c FROM workflow_tasks WHERE step_code IN (${asList(OLD_VALUES)}) GROUP BY step_code`,
    );
    const restInst = await prisma.$queryRawUnsafe(
      `SELECT current_step_code, COUNT(*) c FROM workflow_instances WHERE current_step_code IN (${asList(OLD_VALUES)}) GROUP BY current_step_code`,
    );
    const restHist = await prisma.$queryRawUnsafe(
      `SELECT from_step, to_step, COUNT(*) c FROM workflow_history WHERE from_step IN (${asList(OLD_VALUES)}) OR to_step IN (${asList(OLD_VALUES)}) GROUP BY from_step, to_step`,
    );
    const restAppr = await prisma.$queryRawUnsafe(
      `SELECT step_code, from_status, to_status, COUNT(*) c FROM approvals WHERE step_code IN (${asList(OLD_VALUES)}) OR from_status IN (${asList(OLD_VALUES)}) OR to_status IN (${asList(OLD_VALUES)}) GROUP BY step_code, from_status, to_status`,
    );
    // Integridad: sin duplicados (instance_id, step_code)
    const dupes = await prisma.$queryRawUnsafe(
      `SELECT instance_id, step_code, COUNT(*) c FROM workflow_tasks GROUP BY instance_id, step_code HAVING COUNT(*) > 1`,
    );

    console.log('MIGRACION 8G REPORTE:' + JSON.stringify(report, null, 0));
    console.log('RESTOS requests:' + j(restRequests));
    console.log('RESTOS tasks:' + j(restTasks));
    console.log('RESTOS instances:' + j(restInst));
    console.log('RESTOS history:' + j(restHist));
    console.log('RESTOS approvals:' + j(restAppr));
    console.log('DUPLICADOS tasks:' + j(dupes));
    const ok =
      restRequests.length === 0 &&
      restTasks.length === 0 &&
      restInst.length === 0 &&
      restHist.length === 0 &&
      restAppr.length === 0 &&
      dupes.length === 0;
    console.log(ok ? 'MIGRACION 8G: OK' : 'MIGRACION 8G: PENDIENTES (ver restos arriba)');
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('MIGRACION 8G ERROR: ' + e.message);
  process.exit(1);
});
