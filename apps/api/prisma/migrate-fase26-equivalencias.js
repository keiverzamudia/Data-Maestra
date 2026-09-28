/**
 * FASE 26 — Migración de equivalencias de catálogos + estado de
 * sincronización (SQLite dev).
 *
 * - Idempotente: CREATE TABLE/INDEX IF NOT EXISTS. Re-ejecutar no cambia nada.
 * - Solo ADD: no altera ni borra datos existentes.
 * - NO toca tablas de Profit (read-only por diseño).
 *
 * Fuente única de verdad: prisma/migrations/20260925_fase26_equivalencias/migration.sql
 *
 * Uso: node prisma/migrate-fase26-equivalencias.js
 * (ejecutar con cwd = apps/api)
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const MIGRATION_SQL = path.join(
  __dirname,
  'migrations',
  '20260925_fase26_equivalencias',
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
      await prisma.$executeRawUnsafe(stmt);
      applied += 1;
    }

    const eq = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='catalog_code_equivalence'`,
    );
    const st = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='corporate_sync_state'`,
    );
    const ok = Number(eq[0].c) === 1 && Number(st[0].c) === 1;
    console.log(`MIGRACION FASE 26: ${applied} sentencia(s), equivalencias=${eq[0].c}, sync_state=${st[0].c}`);
    console.log(ok ? 'MIGRACION FASE 26: OK' : 'MIGRACION FASE 26: PENDIENTES (ver tablas faltantes)');
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('MIGRACION FASE 26 ERROR: ' + e.message);
  process.exit(1);
});
