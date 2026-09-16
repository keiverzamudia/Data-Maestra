-- FASE 19: permiso SOLICITUDES.VIEW_ALL (deny by default) + concesión solo a
-- MASTER_DATA_ADMIN. Idempotente, no destructivo. Solo DDL/DML local (SQLite).
INSERT INTO "permissions" ("id", "code")
SELECT lower(hex(randomblob(16))), 'SOLICITUDES.VIEW_ALL'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'SOLICITUDES.VIEW_ALL');
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r, "permissions" p
WHERE r."code" = 'MASTER_DATA_ADMIN' AND p."code" = 'SOLICITUDES.VIEW_ALL'
AND NOT EXISTS (
  SELECT 1 FROM "role_permissions" rp WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id"
);
