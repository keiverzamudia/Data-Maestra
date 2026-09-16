-- FASE 18: vista principal por rol (clave de ROLE_VIEWS; NULL = fallback a Mis solicitudes).
-- Solo DDL local (SQLite). No toca Profit ni datos de negocio.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
ALTER TABLE "roles" ADD COLUMN "defaultView" TEXT;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
