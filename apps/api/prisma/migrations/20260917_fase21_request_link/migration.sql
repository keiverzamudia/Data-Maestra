-- FASE 21 (Comprador Inteligente): vínculo solicitud → artículo Profit existente.
-- Solo DDL local aditivo (SQLite). No toca Profit ni datos de negocio.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "request_article_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "request_id" TEXT NOT NULL,
    "company_code" TEXT NOT NULL,
    "profit_article_code" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decided_by" TEXT,
    "decided_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "request_article_links_request_id_key" UNIQUE ("request_id"),
    CONSTRAINT "request_article_links_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "request_article_links_decision_idx" ON "request_article_links"("decision");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
