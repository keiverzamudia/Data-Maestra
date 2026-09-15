-- FASE 15: eliminar contraseña local. La autenticación es contra
-- MasterProfit.dbo.autenticar(); users ya no guarda password_hash,
-- must_change_password ni password_changed_at.
-- Solo DDL local (SQLite). No toca Profit ni datos de negocio.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "profit_code" TEXT,
    "last_login_at" DATETIME
);
INSERT INTO "new_users" ("id", "username", "display_name", "email", "active", "created_at", "profit_code", "last_login_at")
    SELECT "id", "username", "display_name", "email", "active", "created_at", "profit_code", "last_login_at" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_profit_code_key" ON "users"("profit_code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
