# FASE 16 — Investigación completa del ecosistema de artículos en Profit Plus 2K8

> SOLO INVESTIGACIÓN. Cero INSERT/UPDATE/DELETE/DDL en Profit. Evidencia
> vía `SELECT`, `INFORMATION_SCHEMA`, `sys.*` (metadata) y lectura del
> código vigente. `PROFIT_WRITE_ENABLED` intacto. Sin agent-browser.
> Estándar corporativo: **AD_TRANS**. Las 6 empresas viven en el mismo
> SQL Server y responden con las credenciales actuales de Data-Maestra.

## 1. Resumen ejecutivo

- `AD_GRUP.dbo.TEmpresas` (sin PK, 3 columnas) lista 6 empresas y
  `cod_emp` == nombre de base en todos los casos (verificado).
- `dbo.art` es **estructuralmente idéntica** en las 6 (146 columnas,
  mismos 14 índices con PK `art_co_art`, mismos 4 triggers por nombre).
- El INSERT actual de DM (15 columnas parametrizadas) es reutilizable
  1:1 en cualquier empresa cambiando solo el calificador de base.
- **Pero los contenidos/catálogos difieren**: líneas por empresa
  (35/31/38/45/36/20), `dis_cen` de línea distinto (COR_A3/AD_ROMA/AD_SLS
  divergen; AD_LUBSL no tiene FER/SOF), `TrigI_art` con 3 textos
  distintos, y COR_A3 **no tiene** `cat 01` ni `color 01` (defaults de DM).
- `art_des` es sincronizable con seguridad (no está en PK/FK/únicos;
  triggers no la tocan). No hay identity ni autonumeración: el
  correlativo es `MAX()+1` y AD_TRANS es hoy el máximo global.
- Cuentas de `dis_cen` existen en `C_DIST.dbo.sccuenta` (verificado).
- Exclusiones: movimientos, stocks, costos históricos, documentos,
  auditoría y todo lo operacional/transaccional.

## 2. Arquitectura actual (Data-Maestra, archivos reales, sin modificar)

| Archivo | Módulo | Responsabilidad / método relevante |
|---|---|---|
| `api/src/modulos/profit/profit-driver.ts` | profit | `profitDriver()` — único driver (`mssql/msnodesqlv8` + ODBC 18). Prohibido tedious |
| `api/src/modulos/profit/profit-adapter.service.ts` | profit | Lecturas: `getArticle`, `getArticles`, `getGroups` (`dbo.lin_art`), `getSubgroups` (`dbo.sub_lin`), `getUnits`, `getTaxTypes` (`dbo.tabulado`), `getCategories` (`cat_art`), `getBrands` (`colores`), `getGroupStandard` (`lin_art.dis_cen`), `getUsers` (`MasterProfit VUSUARIOS`), `autenticarProfit` (`MasterProfit autenticar`) |
| `api/src/modulos/profit/profit-write.adapter.ts` | profit | Escritura vigilada: `assertAvailable` (flag), `maxSequenceFor`, `articleExists`, INSERT 15 columnas |
| `api/src/modulos/profit/profit-article-creation.service.ts` | profit | `plan()` (sin escritura), `allocateAndInsert()` (reintento colisión 2627), `verifyAndReconcile()`, `integrationUserCode()` (`DM`, backend-only) |
| `api/src/modulos/profit/profit-article.payload.ts` | profit | `ProfitArticleInput`, `buildProfitArticlePayload`, `buildInsertStatement`, `profitCandidate`, correlativo `MAX+1` tope 9999 |
| `api/src/modulos/profit/profit.controller.ts` | profit | Endpoints plan/create/verify/retry/write-status/attempts, catálogos |
| `api/src/modulos/contabilidad/dis.utils.ts` | contabilidad | `serializarDis` / `deserializarDis` (única construcción `<DIS>{cN:cta}</DIS>`) |
| `api/src/modulos/contabilidad/contabilidad.service.ts` | contabilidad | Validación contra `lin_art.dis_cen` en vivo; `RequestAccountingCode` c1/c7/c8 |
| `api/src/modulos/solicitudes/solicitud.service.ts` | solicitudes | `buildProfitInput` (incluye `disCen` serializado), `planProfitCreation`, `createInProfit` (gates + idempotencia + auditoría `PROFIT_*`) |
| `web/.../api-profit-registration-service.ts` | web | Cliente plan/create/verify/retry; **cuerpos vacíos: el frontend jamás envía `dis_cen`** |
| Flags/permisos | ambos | `PROFIT_WRITE_ENABLED`, `PROFIT.WRITE`, `PROFIT_INTEGRATION_USER_CODE`, auditoría `AuditEvent`, SSE intactos |

## 3. Empresas descubiertas (dinámico desde TEmpresas)

| cod_emp | nombre | rif |
|---|---|---|
| AD_LUBSL | LUBRICANTES SAN LUIS, C.A. | J302349532 |
| AD_TRANS | TRANSPORTE SAN LUIS DE LARA, C.A. ⭐ estándar | J305161925 |
| AD_DIST | DISTRIBUIDORA DE HIDROCARBUROS SAN LUIS, C.A. | J305334056 |
| COR_A3 | CORPORACION AGROPECUARIA VENEZOLANA, C.A | J402635060 |
| AD_SLS | SAN LUIS SUMINISTROS, C.A. | J502277960 |
| AD_ROMA | ALIMENTO ROMA, C.A. | J505655191 |

`TEmpresas`: heap **sin PK ni índices**, columnas `cod_emp varchar(50)`,
`nombre varchar(150)`, `rif varchar(20) NOT NULL`. Otras bases del
servidor (`AD_CPAST`, `AD_DISAY`, `AD_SLT`, `AD_finca`…) no están en
`TEmpresas` → no son destino. Inventario por empresa: ~220–252 tablas,
~100–111 procedimientos, 84–89 triggers, 19–28 vistas (difieren: cada
empresa tiene objetos propios).

## 4. AD_GRUP / TEmpresas

Ver §3. Comprobación técnica por base: las 6 responden consultas
three-part (`[DB].dbo.*`) con la conexión actual → `cod_emp` confirmado
como nombre exacto de base y accesibilidad total con las credenciales
vigentes. Sin empresas inaccesibles ni nombres divergentes.

## 5. Estructura de `art` (matriz resumida: idéntica ×6)

146 columnas, PK `art_co_art(co_art)` única + única `rowguid` + 12
índices no únicos (`iart_des`, `ico_lin`, `ico_subl,co_lin`, `itipo_imp`,
`iuni_venta`, …). Sin `identity`, sin computadas. Collation
`SQL_Latin1_General_CP1_CI_AS`. Defaults: `space(1)` (chars),
`((0))` (numéricos), `getdate()` (fechas). `dis_cen` es `text NOT NULL`.

EMPRESA | COLUMNAS | PK/ÍNDICES | DEFAULTS | OBSERVACIÓN
AD_TRANS..AD_ROMA (6) | 146 idénticas | 14 idénticos | idem | ✓ COMPATIBLE

Campos del INSERT actual (todos `NOT NULL`, todos con default seguro):
`co_art, art_des, tipo, co_lin, co_subl, uni_venta, suni_venta, tipo_imp,
co_cat, co_color, procedenci, co_prov, tipo_cos, dis_cen(text), co_us_in`.

## 6. Catálogos relacionados (estructura + comparación)

Estructura (AD_TRANS, representativa): `lin_art`(25c: `co_lin`,
`lin_des`, `dis_cen:text`, …), `sub_lin`(21c: `co_subl`, `subl_des`,
`co_lin`), `cat_art`(21c + `dis_cen`), `colores`(16c: `co_col`,
`des_col`), `unidades`(17c), `tabulado`(9c), `prov`(62c, con `dis_cen`
propio), `proceden`(16c: `cod_proc`). Catálogos extra con `co_art`:
`art_ext`, `art_nivel`, `ArtRef`, `cost_imp`, `xart*`, `kit`, `lote`.

Comparación TRANS vs resto (contenidos):

| Catálogo | TRANS | LUBSL | DIST | COR_A3 | SLS | ROMA |
|---|---|---|---|---|---|---|
| líneas | 35 | 31 | 38 | 45 | 36 | 20 |
| sublíneas | 147 | 78 | 179 | 269 | 140 | 73 |
| categorías | 24 | 30 | 7 | 28 | 86 | 2 |
| colores | 8 | 14 | 1 | 7 | 9 | 1 |
| unidades | 14 | 10 | 14 | 24 | 20 | 7 |
| tabulado | 9 | 9 | 9 | 9 | 9 | 9 |
| prov | 1873 | 255 | 995 | 2614 | 508 | 218 |
| FER/MIS | ✓ | ✖ falta | ✓ | ✓ | ✓ | ✓ |
| SOF/SUM | ✓ | ✖ falta | ✓ | ✓ | ✓ | ✓ |
| cat `01` | ✓ | ✓ | ✓ | ✖ falta | ✓ | ✓ |
| color `01` | ✓ | ✓ | ✓ | ✖ falta | ✓ | ✓ |
| prov `GEN` / UND / tabulado `1` | ✓ en las 6 |

Matriz CATÁLOGO: `lin_art`/`sub_lin`/`unidades`/`tabulado`/`prov` →
SINCRONIZABLE con validación (código idéntico, descripción homologable);
`colores`/`cat_art` → ⚠ validar `01` por empresa (falta en COR_A3);
tablas con `co_art` (`art_ext`, `xart_cont`, `cost_imp`, `kit`…)
→ ? solo si el negocio las incluye (hoy fuera del INSERT).

## 7. Relaciones directas e indirectas

- **FKs formales sí existen**. `art` depende de: `cat_art, colores,
  lin_art, proceden, prov, sub_lin, tabulado, unidades` (×2).
  Dependen de `art` (~43 hijas): todas las `reng_*` transaccionales,
  `kit/gene_kit/lote/aranc/spced/cost_imp/...`.
- **Indirectas**: `art→lin_art→dis_cen`; `art→prov→(co_seg/co_zon/…,
  con `dis_cen` propio)`; `art→tabulado` (impuesto); vistas
  `ArtMargenGanancias`, `vw_flota_articulos`; funciones
  `Articulo_Stock/Precio`, `articulo_almacen`; ~30 procedimientos tocan
  `art` (`pp_consis_art*`, `pp_val_*`, `pp_actualiza_stock`,
  `facturas/pedidos_ins_reng`, `articulos_eprofit`, …).
- Dependencias de `dis_cen`/`xart_cont`/`sub_lin`/`lin_art`: solo
  checks (`CK_lin_art_co_lin`, `CK_sub_lin_co_subl`),
  `fne_Articles_Stock`, `articulos_eprofit`. **Ningún procedimiento
  valida `dis_cen` del artículo** (0 dependencias de `dis_cen`).

## 8. dis_cen (profundo)

- Formato: texto `<DIS>{cN:cuenta}</DIS>` (con espacios/CR según quién
  lo escribió; el parser de DM lo tolera). `cN` = posición, cuenta =
  `co_cue` de `C_DIST.dbo.sccuenta` (existencia verificada para las 6
  cuentas de FER/SOF).
- No hay catálogo de centros separado: el "centro" es la propia cuenta.
- `lin_art.dis_cen` (estándar por línea) y `cat_art.dis_cen` y
  `prov.dis_cen` existen como columnas; el artículo copia el valor, no
  lo referencia.
- **Divergencia por empresa** (Fallo a la regla "idéntico en todas"):

| Empresa | FER | SOF |
|---|---|---|
| AD_TRANS / AD_DIST | 006/001/003 | 002/001/002 |
| AD_SLS | 006/001/003 | vacío |
| COR_A3 | **010**/001/**7.1.10.02.01.002** | 002/001/**sin c8** |
| AD_ROMA | vacío | c1=7.1.19.01.01.002, c7, sin c8 |
| AD_LUBSL | línea inexistente | línea inexistente |

- Homologar cuentas/centros/clasificaciones **antes** de sincronizar
  es obligatorio; `dis_cen` universal vs local es decisión de negocio
  (recomendación: universal DM con excepción visible).

## 9. Triggers

`art`: `TrigI_art` (INSERT), `TrigU_art`, `TrigD_art`, `TrigD_artMce`
en las 6. Texto **no idéntico** (longitudes I/U/D: 743/848/740 en
TRANS/DIST/SLS; 398/397/401 en LUBSL/ROMA; 380/382/396 en COR_A3).
`TrigI_art` de TRANS (año 2000) solo valida FK contra `unidades` y hace
ROLLBACK si falla; no genera filas. Riesgo: asumir inserción idéntica
sin comparar textos en Fase 17.

## 10. Stored procedures y funciones

Relacionados con artículos (~30 en TRANS): validación
(`pp_val_*`, `pp_consis_art*`), stock (`pp_actualiza_stock`,
`COMUN_actualiza_stock`), documentos (`facturas/pedidos_ins_reng`),
costos (`pp_CAL_COSTO`, `pp_recosteo`), eProfit (`articulos_eprofit`,
`pv_ObtenerArticulo`). Lectura vs escritura: la mayoría valida o mueve
stock/documentos; **ninguno crea artículos ni `dis_cen`**. No ejecutar
los de escritura; solo se leyó su existencia/nombre.

## 11. Constraints e índices

Checks de `art`: `CK_art_CO_ART (co_art<>'')`, `CK_art_TIPO`
(V/F/C/S/M/N/E), `CK_art_TIPO_IMP` (1–9), `CK` de línea/sublínea no
vacíos. PK/índices §5. Collation única. Sin FK hacia `dis_cen` ni
cuentas: **las cuentas de `dis_cen` no están restringidas por la BD**.

## 12. Correlativo

Sin `identity`, sin tabla de correlativos, sin trigger que numere:
`MAX(RIGHT(co_art,4)) + 1` por prefijo, tope 9999, reintento ante
colisión 2627. Evidencia `FERMIS%`: TRANS 0663 · COR_A3 0569 ·
DIST/SLS/ROMA 0555 · LUBSL 0. **TRANS es el estándar global del
correlativo**; el mismo código puede existir en varias empresas por
diseño (bases independientes) y debe ser el mismo por regla.

## 13. INSERT actual

15 columnas fijas parametrizadas (`profit-article.payload.ts`), valores
desde clasificación validada + defaults (`01/01/01/GEN/ULCO`),
`dis_cen` desde `serializarDis(RequestAccountingCode)`,
`co_us_in = DM` validado y backend-only, con locks, idempotencia por
estado, reintento de colisión y `verifyAndReconcile`. Catálogos que
necesita: lin/subl/unidad/tasa/categoría/color (+GEN/01/01).
Comparación vs ecosistema: cubre la fila maestra; no toca `xart_cont`,
`st_almac`, stocks, precios ni documentos (correcto: fuera de alcance).

## 14. Comparación TRANS vs empresas (resumen)

Estructura `art`/índices/triggers(nombres): ✓ COINCIDE ×6.
Contenidos de catálogos: ⚠ EXISTE PERO ES DIFERENTE (conteos,
descripciones y `dis_cen` por línea). `cat/color 01`: ✖ FALTA EN
COR_A3. `FER/SOF`: ✖ FALTA EN AD_LUBSL. Texto de triggers: ⚠
DIFERENTE (3 familias). `xart_cont`: ✖ FALTA en LUBSL/SLS/ROMA/COR_A3
(solo TRANS/DIST la tienen).

## 15. Qué significa "mismo dato" (matriz)

ENTIDAD | CAMPO | IGUAL | PUEDE CAMBIAR | NO SINCRONIZAR | JUSTIFICACIÓN
`art` | `co_art` | ✓ | | | PK universal, regla maestra
`art` | `art_des` | ✓ | | | seguro (§16), homologable
`art` | `co_lin/co_subl` | ✓ | | | FKs; pre-homologar existencia
`art` | `tipo/tipo_imp/uni_venta` | ✓ | | | dominios CHECK/tabul ado/unidades
`art` | `co_cat/co_color` | ✓ | | | validar `01` por empresa
`art` | `dis_cen` | ✓* | | | *decisión §8 (universal recomendado)
`art` | stocks/precios/costos/fechas | | | ✓ | operacionales por empresa
`art` | `co_us_in/fe_us_in/rowguid` | | | ✓ | generados por motor/BD
`lin_art` | `co_lin` | ✓ | | | código estable
`lin_art` | `lin_des` | ✓ | | | homologable, no está en FKs de art
`lin_art` | `dis_cen` | ✓* | | | *misma decisión que art.dis_cen

## 16. Seguridad de cambiar descripciones

`art_des`: fuera de PK, fuera de FKs (ninguna la referencia), índice
no único `iart_des`, triggers no la tocan, 0 procedimientos la validan
específicamente. **Sincronizar solo descripción es técnicamente seguro**.
(UPDATE directo futuro, con auditoría; nunca en esta fase.)

## 17. Árbol de homologación (orden por dependencias reales)

TEmpresas (descubrir) → `tabulado`/`unidades` (dominios, sin
dependencias) → `lin_art` (código) → `sub_lin` (depende de línea) →
`cat_art`/`colores`/`prov`/`proceden` (independientes; validar `GEN`,
`01`) → `lin_art.dis_cen`/`cat_art.dis_cen` (decisión §8) →
`art` (requiere todo lo anterior + correlativo universal) →
verificación por empresa. Fuera del árbol (fase posterior si acaso):
`xart_cont`, `st_almac`, precios, documentos.

## 18. INCLUIR / EXCLUIR

INCLUIR: fila `art` (15 columnas del INSERT), descripciones de
catálogos (`lin_des/subl_des`), `dis_cen` (según decisión §8).
EXCLUIR: movimientos y renglones (`reng_*`, facturas, pedidos),
stocks (`st_almac`, `stock_*`), costos/precios históricos, saldos,
documentos, auditoría Profit, `xart_cont`/`art_ext`/`kit`/`lote`
(salvo decisión posterior), campos generados (`rowguid`, fechas de
sistema), `co_us_in` de otros usuarios.

## 19. Empresa nueva y preflight

Nueva en `TEmpresas` → aparece sola (lectura dinámica + TTL corto);
para habilitarse necesita: accesible, `art` compatible, triggers
presentes, catálogos de la clasificación existentes. Preflight
todo-o-nada por empresa: conexión, base listada + nombre validado
`^[A-Z0-9_]{1,30}$`, schema hash, triggers, candidato libre,
FKs de catálogo, `cat/color 01` y `GEN` si aplican, secuencia local <
universal, política `dis_cen` explícita ante divergencia, permiso de
escritura. Una falla → cero escrituras en todas.

## 20. Riesgos y decisiones

Ver doc previo (§14 de FASE_16 multiempresa) + nuevos: triggers con
texto distinto, `cat/color 01` faltante en COR_A3, líneas faltantes en
AD_LUBSL, `TEmpresas` sin PK (duplicados posibles de `cod_emp`:
deduplicar por código), `dis_cen TEXT` (parametrizar como hoy).

## 21. Arquitectura conceptual Fase 17

`companies()` (TEmpresas + validación + caché) → `compare(company)`
(matriz §14) → `preflight(candidato, payload)` todo-o-nada →
`insertSequential` (mismo statement, calificador por empresa validada)
→ `verify` por empresa → auditoría `PROFIT_WRITE_*` con `cod_emp` →
selector UI (AD_TRANS por defecto). Reutilizar driver/pool/adapter;
tres-partes solo con nombres validados; valores siempre parametrizados.

## 22. Preguntas abiertas

1. ¿`dis_cen` universal o local por empresa? (negocio)
2. ¿`xart_cont` entra al alcance? (negocio; solo TRANS/DIST la tienen)
3. ¿Flag de escritura global o por empresa? (gobierno)
