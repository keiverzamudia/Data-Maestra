# FASE 26 — Equivalencias de catálogo y módulo único de replicación multiempresa

## 1. Problema

`AD_TRANS` es la empresa estándar y el origen de los catálogos (grupos,
sublíneas, marcas, unidades, categorías, procedencias, impuestos y
proveedores). El resto de empresas usa **su propio namespace de códigos**:

| Catálogo | AD_TRANS | AD_DIST | Consecuencia |
|---|---|---|---|
| `lin_art` | `01` = FLETES | `01` = COMBUSTIBLE | Mismo código, distinto significado |
| `lin_art` | `01` = HERRAMIENTAS | `01A` = HERRAMIENTAS | Mismo elemento, distinto código |

Hasta la Fase 25 el motor solo sabía comparar **por código**. Ante un código
distinto proponía insertar el canónico y generaba un **duplicado**; ante el
mismo código con otra descripción lo bloqueaba sin poder explicar por qué.

## 2. Decisión

El vínculo entre el código canónico y el código local se registra **a mano y
auditado**. Nunca se deduce de una descripción parecida.

### 2.1 Regla de resolución (siempre en este orden)

1. **Equivalencia registrada** → se usa el código local de esa empresa.
2. **Código estándar existente en la empresa** → se usa tal cual.
3. **Ninguno de los dos** → se replica el catálogo desde AD_TRANS y se usa el
   código estándar.
4. Si nada aplica → **falla cerrado**: no se escribe en ninguna empresa.

### 2.2 Qué es idéntico y qué se traduce

- **Idéntico en todas las bases:** `co_art` (código del artículo), `art_des`,
  `tipo`, `tipo_cos`, `dis_cen`, `co_us_in`, `co_sucu`, `modelo`, `ref`.
- **Traducido por empresa:** `co_lin`, `co_subl`, `uni_venta`, `suni_venta`,
  `tipo_imp`, `co_cat`, `co_color`, `procedenci`, `co_prov`.

El correlativo del artículo no cambia: sigue siendo
`co_lin + co_subl + 4 dígitos` reservado con `UPDLOCK/HOLDLOCK` sobre
AD_TRANS y validado libre en todas antes de escribir.

## 3. Modelo de datos

### 3.1 `catalog_code_equivalence`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | TEXT PK | uuid |
| `catalog_key` | TEXT | `lin_art`, `sub_lin`, `unidades`, `cat_art`, `colores`, `proceden`, `prov`, `tabulado` |
| `company_code` | TEXT | destino (nunca `AD_TRANS`) |
| `standard_code` | TEXT | código canónico de AD_TRANS |
| `local_code` | TEXT | código que usa esa empresa |
| `active` | BOOLEAN | desactivación lógica; el histórico queda en auditoría |
| `note` | TEXT NULL | justificación del vínculo |
| `created_by` | TEXT NULL | quién lo registró |

`UNIQUE (catalog_key, company_code, standard_code)` e índice por
`(company_code, catalog_key, local_code)`.

### 3.2 `corporate_sync_state`

`(company_code, catalog_key)` único con `last_sync_at`, `last_run_id`,
`summary` (JSON) y `updated_by`. Alimenta la pestaña **Estado**.

## 4. Cambios en el motor

### 4.1 Comparación (`corporate-compare.ts`)

- Nuevo estado `EQUIVALENTE` → operación `NO_ACTION` (segura): el destino ya
  lo tiene con otro código, no se inserta nada.
- Nuevo campo `destCode` en la diferencia: código que se usará en destino.
- `compareCatalogRows` acepta `equivalences` y `parentEquivalences`; el padre
  de `sub_lin` también se traduce antes de comparar, de modo que una sublínea
  colgada de la línea local se considera correcta.
- `FALTA_EN_DESTINO` con equivalencia ⇒ `INSERT` **con el código local**.
- `summarizePlan` cuenta `equivalentes` aparte.

### 4.2 Ejecución (`corporate-homologation.service.ts`)

- `compare()` resuelve con las equivalencias de cada empresa.
- `preflightCompany()` valida el payload **ya traducido** a esa empresa
  (`REQUIRED_CATALOGS` y `FK_DEPS`).
- `applyCatalogPlan()` inserta con `destCode` y traduce también el padre.
- `registerArticle()` arma un payload por empresa; la verificación previa al
  commit compara contra el payload de esa misma empresa.
- Tras una homologación exitosa se registra el estado de sincronización.

### 4.3 Inserción por empresa (`multi-company.service.ts`)

- `insertOneCompany()` resuelve el payload por empresa antes del `INSERT` y
  antes de la verificación.
- `catalogDescWarnings()` compara contra el código local real.

## 5. Endpoints

| Método | Ruta | Permiso | Escritura |
|---|---|---|---|
| GET | `/api/v1/corporate/equivalences?company=` | `DASHBOARD.VIEW` | no |
| POST | `/api/v1/corporate/equivalences/suggest` | `DASHBOARD.VIEW` | no (solo lectura Profit) |
| POST | `/api/v1/corporate/equivalences` | `ADMIN.MANAGE` | local + auditoría |
| POST | `/api/v1/corporate/equivalences/deactivate` | `ADMIN.MANAGE` | local + auditoría |
| GET | `/api/v1/corporate/sync-state?company=` | `DASHBOARD.VIEW` | no |

Acciones de auditoría: `CORPORATE_EQUIVALENCE_CREATED`,
`CORPORATE_EQUIVALENCE_UPDATED`, `CORPORATE_EQUIVALENCE_DEACTIVATED`.

Parámetros nuevos (FASE 26.3) en `POST /corporate/compare` y
`POST /corporate/homologate` — `CorporateCompaniesDto`:

- **`catalogs?: string[]`** — claves de catálogo. `[]` o ausente = sin filtro.
- **`items?: [{ company, catalog, code, parent? }]`** — filas seleccionadas.
  `parent` es obligatorio *de facto* para `sub_lin`: el `ValidationPipe` corre
  con `whitelist` + `forbidNonWhitelisted`, de modo que un campo no declarado
  devuelve 400.

## 6. Interfaz

`/admin/replicacion` → `ReplicacionMultiempresa.tsx` con cuatro pestañas:

1. **Replicar catálogos** — `HomologacionCorporativa` (selección de empresas,
   comparar, validar, homologar).
2. **Equivalencias** — `EquivalenciasPanel`: alta, deactivate y buscador de
   coincidencias por descripción idéntica. **Nunca se aplican solas**: hay que
   elegir una y guardar.
3. **Empresas** — `ProfitCompaniesSection` (extraído de
   `ProfitCompaniesAdmin`, que ahora solo lo envuelve en su `Page`).
4. **Estado** — última sincronización por empresa y catálogo.

## 7. Pruebas

| Archivo | Cobertura |
|---|---|
| `apps/api/test/equivalencias-26.spec.ts` (19) | Validación fail-closed, índice, resolución de payload, comparación/plan, servicio (CRUD, caché, sugerencias) |
| `apps/api/test/homologacion-17.spec.ts` → `FASE 26` (6) | Integración: `EQUIVALENTE` sin INSERT, creación del código local, mismo `co_art` con FKs traducidas, bloqueo sin cobertura, estado de sincronización |
| `apps/api/test/homologacion-17.spec.ts` → `FASE 26.3` (6) | Filtro por catálogo, `catalogs: []` = sin filtro, selección de ítems, ítem vacío, aprobación de un bloqueado tildado, y la selección **distinguiendo la línea del padre** |
| `apps/api/test/clave-compuesta-26-4.spec.ts` (12) | Identidad `(co_lin, co_subl)`: reproducción del emparejamiento erróneo, traducción de padre, INSERT del par, `WHERE` por par, `ORDER BY` determinista |
| `apps/api/test/desc-sync-26-2.spec.ts` (9) | Interruptor `allow_desc_sync`: plan con/sin flag, `compare()` por empresa, persistencia y auditoría |
| `apps/web/src/modulos/administracion/HomologacionCorporativa.test.tsx` (9) | Interruptor FASE 26.2, filtro de catálogos, casilla por fila con padre, contador, preselección y gate del botón Homologar |
| `apps/web/src/modulos/administracion/EquivalenciasPanel.test.tsx` (5) | Lista, alta, validaciones, desactivación, sugerencias no automáticas |
| `apps/web/src/modulos/administracion/ReplicacionMultiempresa.test.tsx` (4) | Pestañas del módulo |

Helper compartido: `apps/api/test/helpers/equivalences.ts`.

## 8. Migración

```powershell
cd apps/api
node prisma/migrate-fase26-equivalencias.js
pnpm db:generate
.\scripts\api-restart.ps1     # la persona usuaria reinicia la API
```

El script es idempotente (`CREATE TABLE/INDEX IF NOT EXISTS`).

> **No usar `prisma db push`**: la base de desarrollo tiene tablas y columnas
> que el esquema ya no declara; el push intentaría borrarlas.

## 9. Interruptor: "Las descripciones de AD_TRANS mandan" (FASE 26.2)

### 9.1 Problema

Con solo equivalencias, el plan seguía **bloqueado** cuando una empresa tenía
el **mismo código con otra descripción** en un catálogo de namespace local
(Líneas, Sublíneas, Categorías, Marcas, Procedencias, Proveedores). En
AD_LUBSL eso eran **107 filas**, y un solo bloqueo congela todo el plan:
`Homologar` no habilita y no se escribe nada.

### 9.2 Decisión

Flag por empresa `profit_company_config.allow_desc_sync` (default `false`):

- **`false` (default):** fail-closed, idéntico a la Fase 17. `BLOCKED`.
- **`true`:** esas filas pasan a `UPDATE_DESCRIPTION` (seguro), con razón
  explícita: *"Autorizado por la empresa (FASE 26.2): la descripción de
  AD_TRANS manda."*

Es una **decisión explícita del administrador**, registrada y auditada. No
cambia el comportamiento de los catálogos globales (Unidades, Tasas), que ya
eran seguros.

### 9.3 Dónde

| Pieza | Archivo |
|---|---|
| Columna | `apps/api/prisma/schema.prisma` → `ProfitCompanyConfig.allowDescSync` |
| Migración | `prisma/migrations/20260928_fase26_2_desc_sync/migration.sql` + `migrate-fase26-2-desc-sync.js` |
| Plan | `corporate-compare.ts` → `buildSyncPlanItem(diff, desc, { allowDescSync })` |
| Lectura del flag | `corporate-homologation.service.ts` → `compare()` |
| Persistencia | `multi-company.service.ts` → `saveCompanyConfig(code, enabled, actorId, allowDescSync?)` |
| UI | `HomologacionCorporativa.tsx` (interruptor) y `ProfitCompaniesSection.tsx` (columna) |

`saveCompanyConfig` **no resetea** el flag cuando no se envía en el body.

### 9.4 Pruebas

`apps/api/test/desc-sync-26-2.spec.ts` (9 tests): plan con/sin flag, `compare()`
por empresa, persistencia y auditoría.

## 10. Selección de catálogos e ítems (FASE 26.3)

### 10.1 Problema

El comparador devolvía un plan de toda la empresa de golpe. Con catálogos
reales eso significaba **decidir por bloqueo global**: si una sola fila no
tenía resolución, la homologación entera se negaba y no había forma de decir
*"migra esto, deja lo otro para después"*.

### 10.2 Decisión — la selección ES la revisión

| Envío | Significado |
|---|---|
| `items` **ausente** | Comportamiento previo: se migra todo lo no bloqueado. |
| `items: []` | No se migra nada (el llamador no ha revisado aún). |
| `items: [...]` | Solo esas filas; un BLOQUEADO **tildado** se aprueba. |

Dos reglas de seguridad:

1. Solo `DESCRIPCION_DIFERENTE` se puede aprobar tildándolo (pasa a
   `UPDATE_DESCRIPTION`). `DATOS_DIFERENTES` sigue bloqueado aunque se tildi:
   no se adivina.
2. La ejecutabilidad (`isPlanExecutable`) se calcula **después** de filtrar la
   selección: un bloqueo sin tildar no frena la migración de lo demás.

La identidad de una fila es `empresa|catálogo|código|padre` (ver §11).

### 10.3 Catálogos

`catalogs` acota la comparación a esas claves. **Un array vacío significa
"sin filtro"** (así lo envía la UI cuando no se tilda ningún catálogo); tratarlo
como filtro habría devuelto cero filas y la pantalla habría mostrado
*"Sin diferencias"*.

### 10.4 Dónde

| Pieza | Archivo |
|---|---|
| DTO | `dto/corporate.dto.ts` → `CorporateCompaniesDto.catalogs/items`, `CorporateItemSelectionDto.parent` |
| Plan | `corporate-homologation.service.ts` → `compare(..., { catalogs })`, `homologate(..., { catalogs, items })` |
| UI | `HomologacionCorporativa.tsx` → `CATALOG_OPTIONS`, casilla por fila, "Seleccionar todo", contador |

## 11. Identidad compuesta y correcciones (FASE 26.4)

### 11.1 El bug

`sub_lin` tiene por PK **el par `(co_lin, co_subl)`** — el mismo `co_subl` se
repite bajo líneas distintas (AD_DISAY: `ELE`×4, `CON`×5, `VEH`×4, `GEN`×4…).
El motor indexaba el destino **solo por `co_subl`** y se quedaba con la primera
fila. Consecuencias:

- filas ajenas se comparaban entre sí → falsos `DATOS_DIFERENTES` sobre
  descripciones idénticas (`CAM`/`CAMISAS`, `LIMPIEZA`/`LIMPIEZA`…);
- decenas de bloqueos artificiales que **impedían el alta de artículos**,
  porque `registerArticle()` exigía un plan ejecutable;
- el UPDATE de descripción filtraba solo por código → **reescribía todas las
  líneas que repitieran ese código** (corrupción de datos en destino);
- el INSERT tomaba la fila estándar equivocada (misma clave, otra línea);
- `FK_DEPS` leía la primera fila con ese `co_subl` → falsos *"pertenece a otra
  línea"*.

### 11.2 Correcciones

| # | Corrección |
|---|---|
| 1 | `compareCatalogRows` indexa por `padre\|código`; el padre del estándar se traduce por equivalencia antes de buscar. |
| 2 | Par ausente → `FALTA_EN_DESTINO` (INSERT aditivo; el PK no choca). `DATOS_DIFERENTES` solo cuando el estándar **no declara padre** (no hay dónde colgarlo). |
| 3 | `catalogUpdateDescForCompany` añade `AND co_lin = @c2` en catálogos jerárquicos. |
| 4 | `applyCatalogPlan` indexa lo estándar por `padre\|código` y traduce el padre al escribir. |
| 5 | `REQUIRED_CATALOGS` y `FK_DEPS` comprueban el **par**, y aceptan que el par esté pendiente de crear en la misma transacción (`planned.parent`). |
| 6 | `registerArticle` ya **no** exige los 8 catálogos limpios: solo que las 9 claves del artículo existan (lo garantiza el preflight). |
| 7 | Lectura ordenada por `co_lin, co_subl` (orden determinista con repetidos). |
| 8 | Selección FASE 26.3 identificada por `empresa\|catálogo\|código\|padre`. |
| 9 | UI: columna **Línea** y `rowKey` con padre (había claves React duplicadas). |

**Nota:** el padre de una equivalencia se registra en el catálogo dueño
(`sub_lin` → `lin_art`). Si la línea cambia de código entre empresas y no se
registra la equivalencia, la sublínea se propondrá como *nueva*; esa es la
conducta esperada: las equivalencias son explícitas, nunca se adivinan.

### 11.3 Pruebas

`apps/api/test/clave-compuesta-26-4.spec.ts` (12 tests) — puro, sin I/O.
`apps/api/test/homologacion-17.spec.ts` — fixture que reproduce el SQL real
(`ORDER BY` compuesto, `WHERE` por par, `SELECT DISTINCT` de líneas).

## 12. Invariantes que se mantienen

- Profit solo se escribe por el adapter dedicado, con `PROFIT_WRITE_ENABLED`,
  permiso `PROFIT.WRITE` y transacción global con reversión total.
- Sin equivalencias registradas el comportamiento es **idéntico** al de la
  Fase 17 (objeto identidad `NO_EQUIVALENCES`).
- Las empresas se descubren dinámicamente de `TEmpresas`; nada hardcodeado.
- La escritura en Profit solo se confirma después de la verificación por
  empresa: si una falla, no se escribe en ninguna.
