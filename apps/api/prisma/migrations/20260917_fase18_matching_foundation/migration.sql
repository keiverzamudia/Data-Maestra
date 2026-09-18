-- FASE 18 (motor de coincidencia): perfiles de normalización y decisiones humanas.
-- Solo DDL local (SQLite). No toca Profit ni datos de negocio.
-- La descripción original se preserva; la normalizada es derivada versionada.
-- Las parejas de decisión se ordenan canónicamente y pairKey evita A-B/B-A.
CREATE TABLE "article_normalization_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company_code" TEXT NOT NULL,
    "profit_article_code" TEXT NOT NULL,
    "original_description" TEXT NOT NULL,
    "normalized_description" TEXT NOT NULL,
    "normalization_version" TEXT NOT NULL DEFAULT 'v1',
    "brand" TEXT,
    "model" TEXT,
    "part_number" TEXT,
    "category" TEXT,
    "sub_category" TEXT,
    "unit" TEXT,
    "application" TEXT,
    "photo_reference" TEXT,
    "normalized_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "article_normalization_profiles_company_code_profit_article_code_key" UNIQUE ("company_code", "profit_article_code")
);
CREATE INDEX "article_normalization_profiles_normalized_description_idx" ON "article_normalization_profiles"("normalized_description");

CREATE TABLE "article_match_decisions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "article_a_company" TEXT NOT NULL,
    "article_a_profit_code" TEXT NOT NULL,
    "article_b_company" TEXT NOT NULL,
    "article_b_profit_code" TEXT NOT NULL,
    "pair_key" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "evidence_json" TEXT,
    "decided_by" TEXT,
    "decided_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "article_match_decisions_pair_key_key" UNIQUE ("pair_key")
);
CREATE INDEX "article_match_decisions_decision_idx" ON "article_match_decisions"("decision");
