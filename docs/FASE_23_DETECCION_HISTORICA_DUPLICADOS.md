# FASE 23 — Detección histórica de posibles duplicados

> DETECCIÓN ≠ DECISIÓN · CALIDAD ≠ SIMILITUD · FINGERPRINT ≠ IDENTIDAD.
> Solo lectura Profit + escritura local. Sin homologación, fusión,
> SAME/DIFFERENT automático, IA ni vectores.

## 1. Objetivo

Detectar pares/grupos de artículos históricos con señales suficientes
para revisión humana futura (FASE 24). Encontrar candidatos + explicar.

## 2. Entrada y universo

`ArticleNormalizationProfile` (FASE 22): identidad
`companyCode + profitArticleCode` (mismo código ≠ mismo artículo entre
compañías). Elegibles: coverage ≠ INSUFICIENTE; insuficientes se cuentan
y se excluyen de buckets.

## 3. Preselección (nunca N×N)

Buckets por `fingerprint` no vacío + cada token técnico; tope determinístico
por cubeta (defecto 60, truncate contado); semillas ordenadas con cursor
(`companyCode`, `profitArticleCode`) y tope; universo acotado a 20.000
filas livianas con bandera. Pares deduplicados por `pairKey` canónico;
auto-par excluido; parejas con decisión humana previa omitidas (contadas).

## 4. Fingerprints

Solo preselección. Igual fingerprint = candidatos a comparar, jamás identidad.

## 5. Buckets

Cubetas fingerprint/token con truncado determinístico y contador.

## 6. Motor

`DeterministicMatchEngineV1.comparePair` (extraído sin cambiar lógica;
`findCandidates` lo reutiliza — tests F20 intactos). Pesos/reglas F20
intactos.

## 7-8. Señales y conflictos

Los 9/6 de FASE 20. Ausencia ≠ conflicto. Conflicto crítico o no →
clasificación máxima REVIEW (conservador).

## 9. Coverage

Metadata persistida (`coverageA/B`); nunca se mezcla con clasificación.

## 10. Relaciones

`historical_match_relations` (pairKey único): códigos, empresas, score,
clasificación, evidencias/conflictos JSON, explicación ES, engineVersion
`v1`, coberturas, conteos, estado `PENDIENTE_REVISION`. Upsert idempotente
(CREATED/UPDATED).

## 11. Grupos y transitividad

Cliques maximales (Bron–Kerbosch con pivote, determinístico) sobre
aristas HIGH/MEDIUM sin conflictos; componentes >40 nodos no se expanden.
A↔B + B↔C con A↔C en conflicto → {A,B} y {B,C}, jamás {A,B,C} (testeado).
Id `grp:sha256(miembros)`; miembros reemplazados por transacción;
`PENDIENTE_REVISION`; sin estados CONFIRMED (FASE 24).

## 12. Multi-compañía

Pares intra e inter compañía; empresa siempre visible; sin compañía maestra.

## 13. Batch e idempotencia

`detectar({companyCode?, batchSize≤500, maxSeeds≤2000, maxBucketSize≤200,
cursor?})` → progreso `{seedsProcessed, pairsCompared, relationsCreated/
Updated/SkippedDecided, groupsCreated/Updated, bucketsTruncated,
insufficientProfiles, elapsedMs, nextCursor}` + auditoría
`HISTORICAL_DETECTION_RUN`. Reejecución = updates, cero duplicados.

## 14. API (`ADMIN.MANAGE`, validación ES, paginación 25/50/100)

- `GET /matching/historico/duplicados/resumen`
- `GET /matching/historico/duplicados/relaciones` (filtros: compañía,
  clasificación, con/sin conflictos, coverage, estado, código, texto;
  orden: score, classification, detectedAt, evidenceCount, conflictCount)
- `GET /matching/historico/duplicados/grupos`
- `GET /matching/historico/duplicados/articulos/:companyCode/:profitArticleCode`
- `POST /matching/historico/duplicados/detectar`

## 15. Frontend (`/admin/historico`, sección "Auditoría histórica")

Resumen real, tabla paginada con filtros/orden ("prioridad de revisión"),
detalle modal (artículos, coverage, evidencias, conflictos, explicación,
score referencial "no es una decisión", versión, estado). Sin botones
SAME/DIFFERENT/Unificar/Eliminar. Español total vía `presentacion.ts`.

## 16. Ejecución real (controlada, 2026-09-18)

Ingesta AD_TRANS 100 artículos (lectura Profit) + detección 100 semillas:
5 pares, 5 relaciones LOW sin conflictos, 0 grupos, 0.22 s. Reejecución:
100 skipped / 5 updated (idempotente). Ejemplo real: `AD_TRANS:094-7134-CAT
↔ AD_TRANS:178-6543-CAT` (score 34, marca+categoría+subcategoría+unidad;
sin part numbers → sin conflicto, LOW correcto y conservador).

## 17. Observaciones (revisión manual)

- Candidatos intra-compañía coherentes (misma marca/categoría/unidad).
- Sin conflictos espurios por ausencia (verificado).
- LOW sin conflictos no agrupa (correcto: evita grupos débiles).
- Auditoría de ejecución falla solo con actor inexistente (probe); con
  usuario real persiste (diseño: fallo de auditoría no aborta).

## 18. Limitaciones y deuda

- EPERM al regenerar cliente Prisma (DLL bloqueada por API en marcha;
  tipos generados OK; deuda ambiental conocida).
- Tablas creadas vía `db push` histórico + ALTER manual (sin journal de
  migraciones en dev; script canónico conservado).
- `dmCreatedByCode`-style: no aplica; trazabilidad DM vía links/State.
- Universo dev: 100 perfiles AD_TRANS (prueba controlada, no migración).
- Componentes >40 nodos sin expansión de cliques (documentado).
- Evolución a background job documentada en el servicio (cursor + topes).

## 19. Qué NO hace

Sin SAME/DIFFERENT/merge/unificación/homologación/eliminación/escritura
Profit/LLM/vectores/OCR/UI de revisión.
