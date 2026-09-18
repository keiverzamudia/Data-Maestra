-- FASE 22 (universo histórico): origen, cobertura y fingerprint de preselección.
-- Solo DDL local aditivo (SQLite, columnas nulables). No toca Profit ni datos.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
ALTER TABLE "article_normalization_profiles" ADD COLUMN "origin" TEXT;
ALTER TABLE "article_normalization_profiles" ADD COLUMN "coverage" TEXT;
ALTER TABLE "article_normalization_profiles" ADD COLUMN "fingerprint" TEXT;
CREATE INDEX IF NOT EXISTS "article_normalization_profiles_fingerprint_idx" ON "article_normalization_profiles"("fingerprint");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
