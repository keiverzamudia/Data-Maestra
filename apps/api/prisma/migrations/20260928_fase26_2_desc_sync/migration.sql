-- FASE 26.2 — Interruptor por empresa: "Las descripciones de AD_TRANS mandan".
-- Solo ADD de una columna con default false (fail-closed: sin el flag el
-- comportamiento es idéntico al de la Fase 17/26).
ALTER TABLE "profit_company_config" ADD COLUMN "allow_desc_sync" BOOLEAN NOT NULL DEFAULT false;
