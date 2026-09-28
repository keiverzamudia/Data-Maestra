-- FASE 26 — Equivalencias de catálogos entre empresas (AD_TRANS canónico).
-- Solo ADD: no altera datos existentes ni toca tablas de Profit.
CREATE TABLE IF NOT EXISTS "catalog_code_equivalence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "catalog_key" TEXT NOT NULL,
  "company_code" TEXT NOT NULL,
  "standard_code" TEXT NOT NULL,
  "local_code" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "created_by" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "catalog_code_equivalence_catalog_key_company_code_standard_code_key"
  ON "catalog_code_equivalence"("catalog_key", "company_code", "standard_code");

CREATE INDEX IF NOT EXISTS "catalog_code_equivalence_company_code_catalog_key_local_code_idx"
  ON "catalog_code_equivalence"("company_code", "catalog_key", "local_code");

-- FASE 26 — Estado de sincronización de catálogos por empresa/católogo.
CREATE TABLE IF NOT EXISTS "corporate_sync_state" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "company_code" TEXT NOT NULL,
  "catalog_key" TEXT NOT NULL,
  "last_sync_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_run_id" TEXT NOT NULL,
  "summary" TEXT,
  "updated_by" TEXT,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "corporate_sync_state_company_code_catalog_key_key"
  ON "corporate_sync_state"("company_code", "catalog_key");
