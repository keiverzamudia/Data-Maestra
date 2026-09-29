/**
 * FASE 27 — Limpieza de la base local (SQLite dev).
 *
 * Elimina las tablas de funcionalidades retiradas en la reestructuración
 * multiempresa:
 *   - profit_company_config      (configuración de "Empresas Profit")
 *   - catalog_code_equivalence   (equivalencias de catálogo viejas)
 *   - corporate_sync_state       (estado de sincronización de catálogos)
 *
 * Idempotente: DROP TABLE IF EXISTS. No toca Profit ni el histórico de
 * matching (Almacén lo usa). Conserva usuarios, roles, catálogos y solicitudes.
 *
 * Uso (cwd = apps/api): node prisma/migrate-fase27-limpieza.js
 */
const { PrismaClient } = require('@prisma/client');

const TABLES = ['profit_company_config', 'catalog_code_equivalence', 'corporate_sync_state'];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const table of TABLES) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = ?`,
        table,
      );
      const existed = Number(rows[0]?.c ?? 0) > 0;
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}"`);
      console.log(`FASE 27 LIMPIEZA: ${table} → ${existed ? 'eliminada' : 'no existía'}`);
    }
    console.log('FASE 27 LIMPIEZA: OK');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('FASE 27 LIMPIEZA ERROR: ' + e.message);
  process.exit(1);
});
