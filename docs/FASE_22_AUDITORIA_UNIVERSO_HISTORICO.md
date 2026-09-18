# FASE 22 — Auditoría y preparación del universo histórico

> Solo lectura en Profit + derivados locales. Sin matching histórico, sin
> homologación, sin escritura Profit. **Calidad del dato ≠ similitud.**

## 1. Objetivo

Base confiable del universo de artículos Profit (qué hay, cuántos, con qué
información, cuáles ya conoce Data-Maestra) para que FASE 23 detecte
posibles duplicados. No se decide nada.

## 2. Universo y origen

`HistoricalUniverseService`: descubrimiento dinámico vía TEmpresas
(`CorporateCompaniesService`, sin hardcodear las 6); lectura paginada
`[DB].dbo.art ORDER BY co_art OFFSET/FETCH` (columnas reales del adapter:
co_art, art_des, co_lin, co_subl, co_cat, co_color, uni_venta). Cada fila
conserva companyCode + código + original + normalizado + señales +
cobertura + fingerprint + origen. No se asume equivalencia entre compañías.

## 3. Identidad y original inmutable

Clave `companyCode + profitArticleCode` (upsert idempotente). El original
Profit nunca se sobrescribe: solo se deriva.

## 4. Normalización

`DeterministicNormalizerV2` sin cambios (si v2 no extrae algo, se registra
ausencia; nada se inventa).

## 5. Perfil

`ArticleNormalizationProfile` reutilizado + 3 columnas nulables
(`origin`, `coverage`, `fingerprint`; índice en fingerprint para
agrupación futura). `renormalizeProfile` preserva `origin` y recalcula
cobertura/fingerprint; `getOrCreateProfile` también los calcula al crear.

## 6. Cobertura

`assessCoverage` (puro): INSUFICIENTE (sin descripción utilizable),
BASICA (palabras sin señales), COMPARABLE (técnicos o ≥1 atributo), RICA
(técnicos + ≥2 atributos). Solo mide preparación para análisis.

## 7. Métricas

`GET resumen`: compañías descubiertas, total, por compañía, con/sin
descripción, con modelo/parte/marca/unidad, distribución de cobertura,
creados por DM (códigos) y vínculos precisos. Todo local.

## 8. Relaciones DM

- Creados por DM: `requestData.profitCode` no nulo (solo código; documentado).
- Vínculos precisos: `request_article_links` (empresa + código + decisión).
- Sin heurísticas sobre descripciones; sin convertir vinculados en maestros.

## 9. Multi-compañía

Métricas y consulta agregan/filtran por `companyCode`; identidad siempre
compuesta. Códigos iguales entre compañías siguen siendo distintos.

## 10. Escalabilidad

Lotes acotados (≤500 filas, ≤20 lotes/ejecución), un SELECT por lote + un
upsert por fila, sin N+1 (marcas una vez), sin O(n²). Escala a 1k/10k/100k
repitiendo ejecuciones idempotentes; documentado.

## 11. Fingerprints

`buildFingerprint` (técnicos ordenados + modelo/parte): solo preselección
FASE 23, nunca identidad. Persistido e indexado.

## 12. Qué NO hace

Sin grupos SAME/DIFFERENT históricos, sin scores/rankings/clusters/merges,
sin homologación/catálogos/dis_cen, sin migración masiva, sin UI de
revisión (diagnóstico vía API + tests).

## 13. Limitaciones

- Adapter lee la conexión configurada; el enrutamiento multi-empresa usa
  three-part como Fase 17 (misma credencial/servidor; documentado).
- Sin columnas dedicadas `co_marca`/`co_modelo` en las lecturas del
  adapter: marca = `co_color`, modelo/parte por señales (documentado).
- `dmCreatedByCode` es a nivel código (requestData no guarda empresa
  Profit); el vínculo preciso está en `request_article_links`.
- Proxy `hasTechnical` = modelo/parte/unidad estructurados (documentado).
- `prisma generate` falló una vez por lock del engine DLL (proceso en
  uso); tipos regenerados correctamente al reintentar. Deuda ambiental.
- `migrate dev` bloqueado por drift histórico del shadow DB
  (preexistente); migración SQL manual + `db execute`, patrón del repo.
