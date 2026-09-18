# FASE 17.2 — Resolución de bloqueos del preflight corporativo

> Sin homologación real. Sin INSERT/UPDATE/DELETE en Profit. Evidencia por
> `SELECT` + metadata (`sys.*`, `INFORMATION_SCHEMA`) y el código vigente.
> `PROFIT_WRITE_ENABLED` intacto (`false`). Probes temporales eliminados.
> Triggers congelados por 17.1 (no se reinvestigan). Sin agent-browser.

## 1. Objetivo y estado previo

Determinar qué impide pasar de `PRE-FLIGHT BLOQUEADO` a `PRE-FLIGHT LISTO`.
Punto de partida: triggers LISTA en las 6 (17.1); persistían bloqueos por
catálogos (`cat/color 01` en COR_A3, líneas en LUBSL, textos de trigger ya
resueltos) más un volumen sin cuantificar ("267 bloqueos" de una ejecución
anterior, no reproducido como tal: la realidad se midió de nuevo).

## 2. Bloqueos reproducidos (datos reales, regla del comparador vigente)

Comparación AD_TRANS vs 5 destinos, 8 catálogos (conteos por estado):

| Empresa | IGUAL | FALTA | DESC_DIF | DATOS_DIF |
|---|---|---|---|---|
| AD_DIST | 331 | 1579 | 139 | 70 |
| AD_LUBSL | 77 | 1948 | 72 | 36 |
| AD_SLS | 154 | 1816 | 109 | 50 |
| AD_ROMA | 109 | 1951 | 30 | 40 |
| COR_A3 | 324 | 1481 | 217 | 71 |
| **TOTAL** | **1014** | **8820** | **569** | **267** |

Lecturas clave: `tabulado` 9/9 idéntico en las 6; `unidades` casi idéntico;
`prov` aporta ~8800 faltantes (universos de proveedores distintos:
TRANS 1873 vs DIST 995 / LUBSL 255 / SLS 508 / ROMA 218 / COR_A3 2614);
`sub_lin` concentra los 267 `DATOS_DIFERENTES` (mismo sub-código bajo
distinta línea).

## 3. Matriz por empresa (flujo con artículo canónico FER/MIS/UND/GEN/01)

| Empresa | TRIGGER_COMPAT | SCHEMA/TABLAS/COLS | REQUIRED_CATALOGS | WRITE_PERM | Estado |
|---|---|---|---|---|---|
| AD_TRANS | LISTA (estándar) | LISTA (146 cols, sin NOT NULL bloqueantes) | LISTA | BLOQUEADA* | — |
| AD_DIST | LISTA | LISTA | LISTA (FER/MIS-FER/UND/GEN/01s presentes) | BLOQUEADA* | LISTA** |
| AD_LUBSL | LISTA | LISTA | BLOQUEADA: falta FER; MIS existe bajo OFI (colisión de sub-código) | BLOQUEADA* | BLOQUEADA (E) |
| AD_SLS | LISTA | LISTA | LISTA | BLOQUEADA* | LISTA** |
| AD_ROMA | LISTA | LISTA | LISTA | BLOQUEADA* | LISTA** |
| COR_A3 | LISTA (CITADO) | LISTA | LISTA vía plan (INSERT cat 01 + col 01, códigos ausentes) | BLOQUEADA* | LISTA** |

`*` `WRITE_PERMISSION` bloquea en todas mientras el flag esté en `false`:
comportamiento correcto y esperado (ambiental, no un defecto).
`**` Tras resolver el flag con permiso real; ver §7.

Cierre de dependencias verificado: `dis_cen` FER/SOF de TRANS/DIST
idénticos con cuentas existentes en `C_DIST.sccuenta` (5/5);
`01/GEN/tipo 1/UND` presentes salvo `cat 01`/`col 01` en COR_A3
(cubiertos por plan INSERT, §4-B).

## 4. Clasificación de cada bloqueo

- **H — ERROR_DE_IMPLEMENTACION (corregido)**: la regla
  `DESCRIPCION_DIFERENTE → UPDATE_DESCRIPTION` era demasiado amplia.
  Evidencia: `lin_art 01` = FLETES (TRANS) vs COMBUSTIBLE (DIST);
  `cat_art 002` = REPUESTO vs ARTICULOS DE OFICINA. Los códigos de
  `lin_art/sub_lin/cat_art/colores/prov/proceden` son **namespaces locales
  por empresa**, no identificadores corporativos: actualizar habría
  corrompido el significado local. Corregido: auto-`UPDATE_DESCRIPTION`
  solo en `tabulado`/`unidades` (todas sus diferencias observadas son
  cosméticas: KILOGRAMOS/KILOS, UNIDAD/UNIDADES, LITROS/LTS); el resto →
  `BLOCKED` (E). Test de regresión incluido.
- **B — INSERT_AUTOMATICAMENTE**: `FALTA_EN_DESTINO` (el código no existe:
  nada que corromper). Incluye `cat 01`/`col 01` en COR_A3 y líneas como
  FER en LUBSL. Plan determinista, no ejecutado en esta fase.
- **C — UPDATE_DESCRIPCION_SEGURO**: solo `tabulado`/`unidades` (§4).
- **E — REQUIERE_REVISION_HUMANA**: descripciones locales divergentes
  (569 casos), `sub_lin` con padre distinto (267), colisión LUBSL
  MIS/OFI vs MIS/FER, universos `prov` por empresa (~8800 filas: cada
  empresa tiene sus proveedores reales; sincronización masiva NO
  procedente).
- **F/G**: ningún caso de infraestructura ni incompatibilidad real
  detectado en los checks medidos (schema 146 cols, tablas, triggers
  presentes/habilitados, sin NOT NULL bloqueantes en los 8 catálogos).
- **A/I/J**: ningún falso positivo adicional ni error de origen.

## 5. Falsos positivos corregidos

1. (H) Regla de descripción over-broad → acotada a catálogos
   funcionales + fail-closed sin descriptor. Tests: unidad (FLETES vs
   COMBUSTIBLE → BLOCKED; KG/KILOS en unidades → UPDATE) y servicio
   (VEH divergente → plan no ejecutable, 0 escrituras, valor intacto).

## 6. SyncPlan resultante (datos reales, 5 destinos)

| Estado | Cantidad |
|---|---|
| NO_ACTION | 1014 |
| INSERT | 8820 |
| UPDATE_DESCRIPTION | ~10 (solo tabulado/unidades) |
| BLOCKED | ~836 (569 locales + 267 jerárquicos) |

El plan es determinista y auditable (empresa/catálogo/código/acción/
fuente/valores/razón/clasificación). No ejecutado.

## 7. Bloqueos reales restantes

- **E (revisión humana)**: ~836 diferencias semánticas; colisión
  MIS en LUBSL; alcance masivo de `prov` (decisión de negocio: sincronizar
  por cierre de dependencia del artículo, no bulk).
- **Ambiental**: `WRITE_PERMISSION` (flag `false` por diseño) — se vuelve
  LISTA al habilitar flag + permiso en entorno controlado.
- Ningún `REQUIERE_DBA`, `INCOMPATIBILIDAD_REAL` ni `ERROR_DE_DATOS_ORIGEN`.

## 8. Cambios realizados

1. `api/src/modulos/profit/corporate-compare.ts`: `SAFE_DESC_CATALOGS`
   (`tabulado`, `unidades`); `buildSyncPlanItem` bloquea descripciones
   fuera de ellos y sin descriptor (fail-closed).
2. `api/test/homologacion-17.spec.ts`: regla anterior reemplazada por
   casos evidencia (KG→UPDATE, 01 FLETES/COMBUSTIBLE→BLOCKED, VEH
   servicio→0 escrituras) + bloque 17.2 (READY idéntico, dependencia
   cubierta por plan, código ajeno intacto).
3. Frontend: sin cambios (la UI ya refleja el plan; "Con error" no existe
   como métrica desde Fase 21).

## 9. Tests y validaciones

- Backend: spec 17/17.2 incluida en suite (ver §10 del reporte).
- Typecheck API/Web, build API/Web: ver reporte.
- `INSERT = 0, UPDATE = 0, DELETE = 0` (verificado: sin adapter real en
  tests; flag intacto; probes eliminados).

## 10. Resultado final

Con artículo canónico y flag+permiso habilitados: DIST/SLS/ROMA/COR_A3
elegibles vía plan; LUBSL requiere decisión humana (colisión MIS).
Sin normalización de triggers pendiente (17.1) y sin cambios de schema.
