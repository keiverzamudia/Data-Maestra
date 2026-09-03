# Implementación catálogos Profit — Fase 8F

> Selectores de clasificación directos desde Profit. READ-ONLY. Sin agent-browser.

## 1. Grupo

- Tabla: `AD_DIST.dbo.lin_art` (38 filas). Código `co_lin` (PK), descripción `lin_des`.
- API: `GET /profit/groups` (existente, reutilizado).

## 2. Subgrupo

- Tabla: `AD_DIST.dbo.sub_lin` (179 filas). PK compuesta `(co_subl, co_lin)`;
  `co_subl` NO es globalmente único (105 distintos; ej. `CON` en 7 grupos).
- API: `GET /profit/subgroups?co_lin=...` (existente, parámetro original conservado).

## 3. Relación Grupo/Subgrupo

- Real: compuesta `(co_lin, co_subl)` (PK + `FK_art_sub_lin`). Frontend filtra
  por grupo y resetea el subgrupo al cambiar de grupo; backend revalida la
  pareja y rechaza combinaciones inválidas (`Subgrupo X no pertenece al grupo Y`).

## 4. Categoría

- Tabla: `AD_DIST.dbo.cat_art` (7 filas, PK `co_cat`). Independiente (sin FK a
  grupo/subgrupo). API `GET /profit/categories` reutilizada; selector sin
  dependencia. Se eliminó la mezcla local con ids `profit-*`.

## 5. Marca

- La captura "Marca/Subgrupo" (01/NO APLICA, F01/GASOLINA…) corresponde a
  **`dbo.colores`** (`co_col`/`des_col`, FK `art.co_color → colores`,
  verificado). No existe tabla `marcas`; no se inventó ninguna.
- AD_DIST tiene 1 fila (`01 NO APLICA`); AD_TRANS tiene 8. API nueva
  `GET /profit/brands`. Selector independiente.

## 6. Tablas Profit reales

`lin_art(co_lin PK, lin_des)`, `sub_lin(co_subl,co_lin PK, subl_des)`,
`cat_art(co_cat PK, cat_des)`, `colores(co_col PK, des_col)`, `art`
(`co_lin/co_subl/co_cat/co_color` con FKs verificadas).

## 7. Campos Profit reales

Códigos `char` con padding (se usa `trim()` en ambos extremos); descripciones
`varchar`. Marca = `co_color` (no es fabricante; documentado en UI como
"Profit colores").

## 8. APIs

- `GET /profit/groups`, `GET /profit/subgroups?co_lin=`, `GET /profit/categories`
  (reutilizados), `GET /profit/brands` (nuevo). Todos GET con `DASHBOARD.VIEW`.
- `POST /warehouse/:id/classify` acepta además `groupCode/subgroupCode/
  categoryCode/categoryName/brandCode/brandName` (DTO backwards-compatible).

## 9. Frontend

- Nuevo hook `useProfitCatalogos(groupCode)`; `AlmacenClassify` trabaja con
  códigos Profit; prefill traduce IDs locales→códigos (catálogo local cubre
  los 38 grupos y 179 pares Profit); `MasterCodePreview` ahora por códigos;
  `ClassificationData` extendido (opcional). Unidad sigue local (fuera de alcance).

## 10. Persistencia

- Sin cambios de esquema (documentado por qué: `RequestData.*Id` son `String`
  sin FK; las filas guardan IDs y el historial/display no se tocan).
- `CatalogosService.resolveClassification()` (en transacción): grupo por código,
  subgrupo por (grupo, código), categoría por código global o provisión local
  bajo el subgrupo, marca por nombre normalizado o provisión local. Solo
  catálogo local; nunca Profit. Auditoría `CLASSIFIED` incluye códigos y
  `provisioned`.

## 11. Compatibilidad histórica

Verificada en vivo: REQ-0041 (IDs UUID) resuelve `SER`/`Foton` vía catálogos
locales intactos. Solicitudes viejas se muestran igual; las nuevas guardan IDs
resueltos de códigos Profit.

## 12. Tests

- API 135 passed: `catalog-resolve.spec.ts` (7: resolve, grupo inexistente,
  combo inválida, categoría reuse/provisión, marca reuse/provisión,
  classify-con-códigos + masterCode), adapter +1 (brands SQL/parámetros),
  controller +1 (delegación brands). Legacy por IDs intacto.
- Web 12 passed: `AlmacenClassify.test.tsx` (reseteo+filtrado al cambiar grupo,
  independencia categoría/marca), `account-pages` 10 intactos.

## 13. Seguridad

Scan `modulos/profit`: 0 × INSERT/UPDATE/DELETE/MERGE/ALTER/DROP/CREATE/
TRUNCATE/`$executeRaw`/`$queryRaw`; controller GET-only; parámetros con
`request.input`. READ-ONLY.

## 14. Decisiones

- Resolver a IDs locales en vez de persistir códigos: preserva historial,
  display y `generateMasterCode` sin migraciones.
- Provisión local perezosa (categoría/marca) en vez de sincronización: simple,
  auditada, solo cuando Profit trae algo que lo local no tiene.
- Marca ← colores (no fabricantes): respeta el modelo real aunque el nombre
  difiera; documentado en UI y aquí.
- Unidad fuera de alcance (sigue local).

## 15. Elementos NO determinados

- Etiquetas descriptivas de posiciones contables (otra fase).
- Si `C_DIST` u otra base debiera alimentar colores en vez de `AD_DIST`
  (se usa la base configurada del adapter).
