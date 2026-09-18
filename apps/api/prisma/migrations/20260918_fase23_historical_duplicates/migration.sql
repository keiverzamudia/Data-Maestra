-- FASE 23 (Detección histórica): relaciones no dirigidas y grupos conservadores.
-- Solo DDL local aditivo (SQLite). No toca Profit ni datos de negocio.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "historical_match_relations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pair_key" TEXT NOT NULL,
    "company_a_code" TEXT NOT NULL,
    "profit_a_code" TEXT NOT NULL,
    "company_b_code" TEXT NOT NULL,
    "profit_b_code" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "classification" TEXT NOT NULL,
    "evidences_json" TEXT NOT NULL,
    "conflicts_json" TEXT NOT NULL,
    "evidence_count" INTEGER NOT NULL DEFAULT 0,
    "conflict_count" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT NOT NULL,
    "engine_version" TEXT NOT NULL DEFAULT 'deterministic-v1',
    "coverage_a" TEXT,
    "coverage_b" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE_REVISION',
    "detected_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "historical_match_relations_pair_key_key" UNIQUE ("pair_key")
);
CREATE INDEX "historical_match_relations_classification_idx" ON "historical_match_relations"("classification");
CREATE INDEX "historical_match_relations_status_idx" ON "historical_match_relations"("status");
-- FASE 23 (conteos para ordenamiento/métricas sin parsear JSON en SQL).
ALTER TABLE "historical_match_relations" ADD COLUMN "evidence_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "historical_match_relations" ADD COLUMN "conflict_count" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "historical_match_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE_REVISION',
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "engine_version" TEXT NOT NULL DEFAULT 'deterministic-v1',
    "summary_json" TEXT,
    "detected_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "historical_match_group_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group_id" TEXT NOT NULL,
    "company_code" TEXT NOT NULL,
    "profit_article_code" TEXT NOT NULL,
    CONSTRAINT "historical_match_group_members_group_id_key" UNIQUE ("group_id", "company_code", "profit_article_code"),
    CONSTRAINT "historical_match_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "historical_match_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
