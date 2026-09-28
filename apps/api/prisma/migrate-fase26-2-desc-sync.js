/**
 * FASE 26.2 — Migración del interruptor "Las descripciones de AD_TRANS mandan"
 * (SQLite dev).
 *
 * - Idempotente: ALTER TABLE ADD COLUMN solo si no existe.
 * - Solo ADD con default false: sin el flag el comportamiento es idéntico al
 *   de la Fase 17/26 (fail-closed).
 * - NO toca tablas de Profit (read-only por diseño).
 *
 * Fuente única de verdad:
 *   prisma/migrations/20260928_fase26_2_desc_sync/migration.sql
 *
 * Uso: node prisma/migrate-fase26-2-desc-sync.js
 * (ejecutar con cwd = apps/api)
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const MIGRATION_SQL = path.join(
  __dirname,
  'migrations',
  '20260928_fase26_2_desc_sync',
  'migration.sql',
);

async function main() {
  const prisma = new PrismaClient();
  try {
    const raw = fs.readFileSync(MIGRATION_SQL, 'utf8');
    const statements = raw
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.replace(/--[^\n]*/g, '').trim().length > 0);

    let applied = 0;
    for (const stmt of statements) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS c FROM pragma_table_info('profit_company_config') WHERE name = 'allow_desc_sync'`,
      );
      if (Number(exists[0]?.c ?? 0) > 0) {
        console.log('MIGRACION FASE 26.2: columna ya presente, nada que hacer.');
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      await prisma.$executeRawUnsafe(stmt);
      applied += 1;
    }

    const check = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM pragma_table_info('profit_company_config') WHERE name = 'allow_desc_sync'`,
    );
    const ok = Number(check[0]?.c ?? 0) === 1;
    console.log(`MIGRACION FASE 26.2: ${applied} sentencia(s), allow_desc_sync=${check[0]?.c}`);
    console.log(ok ? 'MIGRACION FASE 26.2: OK' : 'MIGRACION FASE 26.2: PENDIENTES (ver columna faltante)');
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('MIGRACION FASE 26.2 ERROR: ' + e.message);
  process.exit(1);
});
