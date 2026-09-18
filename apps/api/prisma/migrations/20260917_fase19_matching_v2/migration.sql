-- FASE 19 (normalizador semántico): tokens y señales v2 en el perfil.
-- Solo DDL local aditivo (SQLite, columnas nulables). No toca Profit ni datos.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
ALTER TABLE "article_normalization_profiles" ADD COLUMN "tokens_json" TEXT;
ALTER TABLE "article_normalization_profiles" ADD COLUMN "features_json" TEXT;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
