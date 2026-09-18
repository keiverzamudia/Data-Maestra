# FASE 20 — Motor de coincidencia de artículos

> Determinístico, explicable, conservador y auditable. Encuentra candidatos +
> explica por qué + permite decisión humana. NUNCA declara SAME. Sin IA,
> sin embeddings, sin servicios externos. Textos de usuario en español;
> códigos internos intactos.

## 1. Objetivo

`ArticleMatchEngine.findCandidates()` deja de ser contrato vacío:
`DeterministicMatchEngineV1` compara una solicitud/artículo contra
artículos disponibles usando múltiples señales normalizadas v2.

## 2. Arquitectura

`domain/match-engine.ts` (puro: comparación, score, clasificación, orden,
explicación) + `CandidateProvider` (el motor no conoce persistencia) +
`MatchingService.findCandidatesForRequest` (input, pool de perfiles,
preselección, decisiones previas, auditoría) + `POST /matching/candidatos`.
Frontend: tipos + `apiMatchingService.candidatos()` + etiquetas existentes.

## 3. Entrada

`ArticleMatchingInput` (FASE 18/19) + `profitArticleCode` desde
`RequestData.profitCode` cuando existe (permite autoexclusión y respeto a
decisiones previas). Sin descripción → se rechaza en español.

## 4. Normalización

v2 en ambos lados (descripción vía `tokenSet`; unidad vía canónicos;
resto por igualdad exacta de cadenas ya normalizadas o códigos Profit).

## 5. Preselección

Sobre perfiles locales (tope determinístico 200, ordenados por
empresa/código): pasa si comparte ≥1 token técnico, marca/modelo/parte
detectada, o ≥2 tokens comunes. Sin señales utilizables no se descarta
nada. Conservadora por diseño.

## 6. Comparación

Por pares input↔snapshot, campo a campo, con distinción
ausencia ≠ contradicción (solo se compara lo presente en ambos).

## 7. Evidencias

`PART_NUMBER_MATCH` 40, `MODEL_MATCH` 25, `BRAND_MATCH` 15,
`CATEGORY_MATCH` 8, `SUBCATEGORY_MATCH` 6, `UNIT_MATCH` 5,
`APPLICATION_MATCH` 5, `PURPOSE_MATCH` 5, `DESCRIPTION_SIMILARITY`
(Jaccard ≥ 0.5, 0–20). `PHOTO_SIMILARITY` no se emite (sin capacidad
visual; no se inventa).

## 8. Conflictos

Ambos presentes y distintos: `PART_NUMBER/MODEL/BRAND/UNIT_CONFLICT`
(críticos), `CATEGORY/APPLICATION_CONFLICT` (limitan igual). Cada uno
identifica qué dato A/B difiere (en evidencia estructurada; al usuario
solo explicación sencilla).

## 9. Score

Suma de evidencias, tope 100, `engineVersion: "v1"`, reproducible
(función pura de la entrada). Nunca decide solo.

## 10. Clasificación

Sin descripción → REVIEW. Con conflicto (cualquiera) → REVIEW. Sin
conflictos: ≥65 HIGH, ≥35 MEDIUM, ≥12 LOW, menor → REVIEW. Parte idéntica
sola (40) llega a MEDIUM como máximo; exige corroboración para HIGH.

## 11. Ordenamiento

Score desc → menos conflictos → clave `companyCode:profitArticleCode`
asc. Determinístico total (verificado por test de doble ejecución).

## 12. Decisiones humanas

`DIFFERENT` previa excluye la pareja; `SAME` previa se adjunta como
`priorDecision` (no como desconocida). No se borran ni sobrescriben; no
entrenan nada (pesos fijos documentados).

## 13. Información faltante

No penaliza: solo suma lo presente. La explicación indica lo no
confirmado ("No se pudo confirmar: la marca").

## 14. Determinismo

Sin azar, fechas ni I/O en el cálculo. Mismo orden/clasificación/
evidencias en ejecuciones repetidas (testeado).

## 15. Versionado

`ENGINE_VERSION = "v1"` en cada candidato y en auditoría
(`MATCH_CANDIDATES_CONSULTED` con `{ count, engineVersion }`, sin
descripciones ni secretos).

## 16. Explicabilidad

`explanation` en español por candidato ("Se muestra porque la marca
coincide, el modelo coincide… Requiere revisión porque… No se pudo
confirmar…"). Sin scores/confidence a la vista (solo códigos + etiquetas
ES del frontend).

## 17. Límites

Pool = perfiles locales (sin carga histórica masiva); tope 200;
categorías sin sistema de compatibilidad → REVIEW; foto no comparada;
pesos fijos v1 (mejorables con evidencia futura, documentar cambio).

## 18. Qué NO hace

Sin SAME automático, sin IA/embeddings/vectores/OCR, sin homologación/
sincronización/registro, sin maestros, sin cambios de workflow/RBAC/
pantallas, sin escritura Profit (solo lectura preexistente al crear
perfiles; el motor no llama a Profit).

## 19. Relación futura con Almacén

`POST /matching/candidatos` + `apiMatchingService.candidatos()` +
etiquetas ES listas. FASE 21 construye la UI del comprador.

## 20. Relación futura con data histórica

Mismo motor sobre snapshots de artículos históricos una vez perfilados
por la ruta FASE 18 §14; decisiones previas y auditoría ya contempladas.
