-- FASE 25 — Configuración administrativa de empresas Profit (solo flags locales).
CREATE TABLE IF NOT EXISTS "profit_company_config" (
  "code" TEXT NOT NULL PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "is_standard" BOOLEAN NOT NULL DEFAULT false,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
