# FASE 18 — Modelo de normalización e identidad de artículos

> Fundación del futuro motor de coincidencia. NO implementa el motor, NO
> homologa, NO registra artículos, NO toca Profit en escritura.
> Alcance verificado: `git status` muestra solo archivos de esta fase
> (más trabajo previo en curso de Fases 17.x, no modificado).

## 1. Problema

Almacén necesita saber, ante una solicitud, si el artículo ya existe
(evitando duplicados en Profit) o si es realmente nuevo; y a futuro se
quiere auditar la data histórica (duplicados, equivalencias, mala
clasificación, datos incompletos). No existía un dominio que represente
identidad Profit, normalización versionada ni decisiones humanas.

## 2. Objetivo

Fundación técnica: dominio + persistencia + contratos + 3 endpoints base,
reutilizando ProfitAdapter, TEmpresas, Request/RequestData, auditoría y RBAC.

## 3. Conceptos

- **Artículo Profit**: registro operacional en UNA empresa. Identidad mínima
  `companyCode + profitArticleCode` (`AD_TRANS:FERMIS0662`). El código solo
  NO es global: `AD_DIST:FERMIS0662` es otro registro hasta decisión posterior.
- **Perfil de normalización**: representación auxiliar versionada (`v1`) con
  descripción original preservada + normalizada y campos estructurados
  disponibles. No reemplaza ni modifica Profit.
- **Decisión de coincidencia**: acto humano `SAME | DIFFERENT | REVIEW`,
  auditable. `SAME` NO crea maestro, NO modifica nada: solo registra.
- **Evidencia futura**: `DESCRIPTION_SIMILARITY`, `BRAND_MATCH`,
  `MODEL_MATCH`, `PART_NUMBER_MATCH`, `CATEGORY_MATCH`, `SUBCATEGORY_MATCH`,
  `APPLICATION_MATCH`, `PURPOSE_MATCH`, `PHOTO_SIMILARITY`, `UNIT_MATCH` y
  conflictos `BRAND/MODEL/PART_NUMBER/CATEGORY/UNIT/APPLICATION_CONFLICT`.

## 4. Identificador

`ProfitArticleId { companyCode, profitArticleCode }`,
`formatArticleId` (`AD_TRANS:FERMIS0662`), `sameArticle` exige ambas partes,
`pairKey`/`normalizePair` hacen A-B ≡ B-A (unicidad a nivel BD).

## 5. Modelo de datos (reutilizado + creado)

- Reutilizados sin cambios: `ProfitArticle` (adapter), `Request` +
  `RequestData` (descripción, propósito, foto, clasificación), `Company`
  (código), `AuditEvent` (vía `AuditoriaService`), `MasterItem`
  (ya tiene `normalizedDescription`; el perfil es por empresa, no duplica).
- Creados (`20260917_fase18_matching_foundation`, DDL SQLite local):
  `article_normalization_profiles` (único `[companyCode, profitArticleCode]`,
  índice en `normalizedDescription`) y `article_match_decisions`
  (`pairKey` único, índice en `decision`; `evidenceJson` como texto para
  extensión futura sin Json insurer).
- Sin Json/columnas especulativas; tipos SQLite soportados por Prisma 6.

## 6. Normalizador

`normalizeText` v1 determinístico e idempotente: trim → NFD sin acentos →
mayúsculas → puntuación/separadores a espacio → colapsar espacios.
Vacío/null → `''` sin lanzar. Versión `v1` persistida en cada perfil.

## 7. Contrato ArticleMatchingInput

`{ companyCode, profitArticleCode?, description, purpose?, photoReference?,
brand?, model?, partNumber?, category?, subCategory?, unit?, application? }`.
Tolera ausencias. `buildInputFromRequest` mapea desde `Request` actual
(`brandCode ?? manufacturer` → brand; `model` sin fuente en `RequestData`:
se deja indefinido y documentado, no inventado; `company.code` como
mapeo provisional explícito).

## 8. Contrato ArticleMatchEngine

`findCandidates(input): Promise<MatchCandidate[]>` con `{ article,
confidence 0..1, classification HIGH|MEDIUM|LOW|REVIEW, evidence[],
conflicts[] }`. Solo interfaz en esta fase.

## 9. Decisiones humanas

`registerDecision` normaliza A/B, es idempotente (repetir devuelve la
existente), audita `MATCH_DECISION_REGISTERED` sin secretos. Estados
`SAME | DIFFERENT | REVIEW`.

## 10. Evidencias

Tipos listos (§3); persistencia futura vía `evidenceJson` (documentado,
sin usar aún).

## 11. Relación futura con Solicitudes

`buildInputFromRequest(requestId, companyCodeOverride?)` — sin cambiar
formulario ni workflow; sin candidatos automáticos todavía.

## 12. Relación futura con Almacén

`MatchingService.findCandidatesForRequest()` (exportado por el módulo):
hoy devuelve `{ input, candidates: [], engine: 'NOT_IMPLEMENTED' }`; el
motor se conecta sin cambiar la firma. Sin UI de comprador.

## 13. Relación futura con data histórica

Ruta: `ProfitAdapter.getArticle` → `ArticleMatchingInput` →
`getOrCreateProfile` (lectura Profit + upsert local). Sin proceso masivo.

## 14. Qué NO hace esta fase

Sin motor/IA/embeddings/vectores/OCR/imágenes avanzadas, sin UI de
comprador, sin maestros definitivos, sin homologación/sincronización/
registro, sin cambios de workflow/RBAC/estados, sin migración masiva.

## 15. Evolución hacia FASE 19, 20, 21 y 23

- FASE 19 (normalización de texto): ampliar reglas v1 → v2 con versionado
  y re-normalización por versión (el campo ya existe).
- FASE 20+: implementar `ArticleMatchEngine` sobre estos contratos.
- FASE 21/23: `ClassificationIssueKind` listo
  (`CLASSIFICATION_SUSPECT`, `MISSING_DATA`, `CONFLICTING_DATA`,
  `DUPLICATE_CANDIDATE`); detección histórica reutilizando la ruta §13.
