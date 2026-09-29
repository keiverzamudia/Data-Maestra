/**
 * FASE 27 — Tablas del módulo MANEJO MULTIEMPRESA (SQLite dev).
 *
 * Idempotente: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
 * No toca Profit (solo lectura) ni el histórico de matching.
 *
 * Uso (cwd = apps/api): node prisma/migrate-fase27-multiempresa.js
 */
const { PrismaClient } = require('@prisma/client');

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "master_catalog_entry" (
     "id" TEXT NOT NULL PRIMARY KEY,
     "catalog_key" TEXT NOT NULL,
     "code" TEXT NOT NULL,
     "description" TEXT NOT NULL,
     "parent_code" TEXT,
     "active" BOOLEAN NOT NULL DEFAULT true,
     "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "master_catalog_entry_catalog_key_code_key" ON "master_catalog_entry"("catalog_key", "code")`,
  `CREATE INDEX IF NOT EXISTS "master_catalog_entry_catalog_key_active_idx" ON "master_catalog_entry"("catalog_key", "active")`,

  `CREATE TABLE IF NOT EXISTS "company_catalog_code" (
     "id" TEXT NOT NULL PRIMARY KEY,
     "catalog_key" TEXT NOT NULL,
     "company_code" TEXT NOT NULL,
     "master_code" TEXT NOT NULL,
     "local_code" TEXT NOT NULL,
     "origin" TEXT NOT NULL DEFAULT 'MASTER',
     "active" BOOLEAN NOT NULL DEFAULT true,
     "note" TEXT,
     "created_by" TEXT,
     "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "company_catalog_code_catalog_key_company_code_master_code_key" ON "company_catalog_code"("catalog_key", "company_code", "master_code")`,
  `CREATE INDEX IF NOT EXISTS "company_catalog_code_company_code_catalog_key_idx" ON "company_catalog_code"("company_code", "catalog_key")`,

  `CREATE TABLE IF NOT EXISTS "company_catalog_proposal" (
     "id" TEXT NOT NULL PRIMARY KEY,
     "catalog_key" TEXT NOT NULL,
     "company_code" TEXT NOT NULL,
     "master_code" TEXT NOT NULL,
     "master_description" TEXT NOT NULL,
     "local_code" TEXT NOT NULL,
     "reason" TEXT NOT NULL,
     "detail" TEXT NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'PENDING',
     "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "decided_at" DATETIME,
     "decided_by" TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS "company_catalog_proposal_status_company_code_idx" ON "company_catalog_proposal"("status", "company_code")`,
  `CREATE INDEX IF NOT EXISTS "company_catalog_proposal_company_code_catalog_key_idx" ON "company_catalog_proposal"("company_code", "catalog_key")`,
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const stmt of STATEMENTS) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.$executeRawUnsafe(stmt);
    }
    const names = ['master_catalog_entry', 'company_catalog_code', 'company_catalog_proposal'];
    for (const n of names) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = ?`,
        n,
      );
      if (Number(rows[0]?.c ?? 0) === 0) throw new Error(`no se pudo crear ${n}`);
    }
    console.log('MIGRACION FASE 27 MULTIEMPRESA: OK (3 tablas)');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('MIGRACION FASE 27 MULTIEMPRESA ERROR: ' + e.message);
  process.exit(1);
});
