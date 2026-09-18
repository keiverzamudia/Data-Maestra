-- FASE 23.2 — Historial de decisiones del Analizador por solicitud.
-- RequestArticleLink sigue siendo el estado vigente (última decisión);
-- esta tabla conserva cada decisión SAME/DIFFERENT sin sobrescribir.
CREATE TABLE IF NOT EXISTS "request_article_decisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "request_id" TEXT NOT NULL,
  "company_code" TEXT NOT NULL,
  "profit_article_code" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "decided_by" TEXT,
  "decided_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "request_article_decisions_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "requests" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "request_article_decisions_triple_unique"
  ON "request_article_decisions" ("request_id", "company_code", "profit_article_code");

CREATE INDEX IF NOT EXISTS "request_article_decisions_request_id_idx"
  ON "request_article_decisions" ("request_id");
