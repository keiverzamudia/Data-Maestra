# FASE CAT — Administración de catálogos Profit + fuente única

## 1. Objetivo

Controlar qué valores de Profit están disponibles en Data-Maestra sin
modificar Profit, y eliminar la inconsistencia selector/validador
(caso AGR). Solo visibilidad local: VISIBLE / NO VISIBLE.

## 2. Causa exacta del error AGR

- Selector: `useProfitCatalogos` → `GET /api/v1/profit/groups` →
  `ProfitAdapter.getGroups()` → `SELECT co_lin, lin_des FROM dbo.lin_art`
  (Profit en vivo; AGR existe).
- Validador: `CatalogosService.resolveClassification/checkClassification`
  → `prisma.catalogGroup.findUnique({code})` (tablas locales con seed demo
  RVH/MEC/ELE/HID/TRA; AGR ausente) → "Grupo Profit inexistente en
  catálogo local: AGR".
- MasterCode (`group.code+subgroup.code+seq`) dependía de la fila local,
  por eso tampoco podía generarse para AGR.

## 3. Solución

`CatalogosService` es la fuente única: existencia en Profit
(`ProfitAdapter`) + visibilidad (`CatalogVisibilityService`) — la misma
fuente que los selectores. Al validar, espeja grupo/subgrupo en tablas
locales (`sourceSystem='PROFIT'`), por lo que MasterCode e historial
funcionan con códigos reales. Mensajes precisos §61 (no existe /
deshabilitado / Profit caído).

## 4. Arquitectura final

```
PROFIT (solo lectura)
  → ProfitAdapter (getGroups/Subgroups/Categories/Brands/Units/TaxTypes/ArticleTypes)
  → CatalogVisibilityService (modos + snapshot + efectivo + sync + auditoría)
  → CatalogosService (validación unificada resolve/check/unit/tax/artype)
  → Almacén / Encargado / Contabilidad / Profit-write
```
Selectores: `GET /api/v1/catalogs/effective/*` (hook `useProfitCatalogos`
con `companyId`). Resolución de nombres históricos: `/catalogs/*` sin
filtrar + filas locales persistentes (nunca se borran).

## 5. Catálogos

Grupo (`lin_art`), Subgrupo (`sub_lin`, regla padre), Categoría
(`cat_art`), Marca (`colores`), Unidad (`unidades`), Impuesto
(`tabulado`), Tipo (`CK_art_TIPO` + uso en `art`). Cuentas contables
(`sccuenta`) fuera de alcance (solo Contabilidad, sin cambios).

## 6. ALL / SELECTED

Por tipo y ámbito (global `''` o empresa; específico prevalece).
SELECTED sin fila = oculto + `isNew`. Cambio de modo con confirmación,
sin borrar selección. Subgrupo exige padre visible (§16-17).

## 7. Multiempresa

`companyId ''` = global. Matrices de prueba: config de A no afecta a B.
Empresa inexistente → 400. Alcance validado contra la empresa de la
solicitud (`request.companyId`).

## 8. Sincronización

`POST /catalog-config/:type/sync` (ADMIN.MANAGE): lee Profit, crea
actualiza snapshot (`description`, `availableInProfit`,
`synchronizedAt`), marca ausentes como no disponibles SIN borrar, y
espeja grupos/subgrupos locales. Reporta `{total, created, updated,
unavailable}`. En SELECTED lo nuevo queda no seleccionado (`decided`).
Caché efectivo 60 s en memoria (invalida en cambios; GROUP invalida
SUBGROUP). Sin Redis.

## 9. Auditoría (AuditEvent existente)

`CATALOG_VISIBILITY_MODE_CHANGED`, `CATALOG_ITEM_ENABLED`,
`CATALOG_ITEM_DISABLED`, `CATALOG_SYNCED` (entityType
`CatalogVisibility`, actor, empresa, before/after).

## 10. RBAC

Admin: `ADMIN.MANAGE` (metadata verificada en tests). Efectivo:
`DASHBOARD.VIEW` (todos los roles operativos lo tienen). Sin roles ni
permisos nuevos. Manipulación directa sin permiso → 403 del guard.

## 11. Almacén y validación

Almacén consume el efectivo (mismo hook + `companyId`); borrador,
finalizar, MasterCode e historial intactos. `validateClassification`
usa la misma fuente (unidad/tipo/impuesto con visibilidad; Profit caído
→ advertencia, no bloqueo). Contabilidad/Encargado/Profit-write sin
cambios.

## 12. Cero escrituras Profit

Fase SELECT-only contra Profit (adapter intacto). Verificación:
`dbo.art` COUNT intacto, FERMIS0662/SOFSUM0196 intactos.

## 13. Incidencia operativa y cierre (2026-09-14/15)

`prisma generate --no-engine` produjo un cliente Accelerate incompatible
y el restart dejó la API detenida (health FAIL). Revertido con generate
completo (motor SQLite + modelos nuevos verificados) y restart manual
autorizado: **Health 200**.

Evidencia viva post-restart: sync GROUP real (`total=35`, `source=
PROFIT_LIVE`); AGR→`INSUMOS AGRICOLA` en efectivo; HER bajo AGR;
`resolveClassification(AGR,HER)` OK con `master=AGRHER-00001` en
REQ-0044 (sigue `PENDIENTE_ALMACEN`, borrador parcial preservado);
SELECTED solo AGR; ocultar AGR → efectivo sin AGR y rechazo preciso
("existe en Profit pero está deshabilitado"); histórico intacto;
restaurado ALL+AGR (`total=35`). Profit: TOTAL 11195 (= valor previo),
FERMIS0662=1, SOFSUM0196=1 — cero escrituras de la fase.
