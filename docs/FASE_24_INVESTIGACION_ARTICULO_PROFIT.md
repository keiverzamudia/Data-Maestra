# FASE 24 (investigación) — Artículo Profit Plus 2K8: diagnóstico exacto

> FASE 1 de investigación. Cero cambios: solo SELECT, metadatos, lectura de
> código y comparación. Profit: INSERT = 0, UPDATE = 0, DELETE = 0.
> Data-Maestra: sin modificaciones (este documento es el único entregable).

## 1. Objetivo

Determinar por qué los artículos creados desde Data-Maestra
(`FERMIS0662`, `FERMIS0663`, `SOFSUM0196` en `AD_TRANS`) no muestran en la
pantalla de Artículos de Profit toda la información de un artículo
normal, y definir el payload correcto + reparación para FASE 2.

## 2. Artículos comparados

- Data-Maestra: `FERMIS0662` (CARRETA, tipo V), `FERMIS0663` (GANCHOS, tipo C),
  `SOFSUM0196` (cartelera, tipo C).
- Normales: `FERMIS0001/2/3` (misma línea FER/MIS), `094-7134-CAT`,
  `ACTEQU0022` (completo: modelo+ref+dis_cen), `VEHFIL049`.
- Comparación: `SELECT *` real de las 146 columnas (9 filas), más
  distribuciones globales (`COUNT/GROUP BY`) sobre 11.195 artículos.

## 3. Estructura de `AD_TRANS.dbo.art`

- **146 columnas**, PK `co_art` (char 30, CK `<>''`), `rowguid` unique.
- Defaults: casi todo `space(1)` / `0` / `getdate()`; `equi_uni1-3` default **1**;
  `fe_us_in` con hora; `fecha_reg`/`fec_prec_*`/`fec_cos_*` con `getdate()`.
- **10 FK**: `co_lin→lin_art`, `co_lin/co_subl→sub_lin`,
  `co_cat→cat_art`, `co_color→colores`, `procedenci→proceden`,
  `co_prov→prov`, `uni_venta/suni_venta→unidades`, `tipo_imp→tabulado`.
- **Triggers**: `TrigI_art` (INSERT: exige `suni_venta` ∈ `unidades`,
  si no ROLLBACK), `TrigU_art` (igual en UPDATE), `TrigD_art`/`TrigD_artMce`
  (bloquean DELETE con movimientos/descuentos). Ninguno autocompleta campos.
- **Checks**: `CK_art_CO_ART`, `CK_art_TIPO` (V/F/C/S/M/N/E),
  `CK_art_TIPO_IMP` (1-9).
- Catálogos verificados: `lin_art` 35, `sub_lin` 147, `cat_art` 24,
  `colores` 8, `proceden` 24 (`01`=NO APLICA), `unidades` 14,
  `tabulado` 9, `prov` con `GEN`=PROVEEDOR GENERICO.

## 4. Payload actual de Data-Maestra (15 columnas, verificado en código)

`profit-article.payload.ts` + `solicitud.service.ts buildProfitInput`:

| Campo | Valor enviado | Origen |
|---|---|---|
| co_art | prefijo línea+sublínea + seq 4 díg | asignado por motor |
| art_des | descripción | solicitud.requestedDescription |
| tipo | C/S/V/… | requestData.articleType |
| co_lin / co_subl | códigos | catálogos locales (code) |
| uni_venta / suni_venta | unidad | requestData.unitCode |
| tipo_imp | 1-9 | requestData.taxType |
| co_cat | código o **'01'** | categoría o default |
| co_color | código o **'01'** | requestData.brandCode o default |
| procedenci | siempre **'01'** | default (originCode jamás se setea) |
| co_prov | siempre **'GEN'** | default (providerCode jamás se setea) |
| tipo_cos | **ULCO** (ULOM si S) | default (costType jamás se setea) |
| dis_cen | `<DIS>{c1:}…</DIS>` o '' | accountingCodes validados |
| co_us_in | DM o '' | integración (ver §5.7) |

Nunca enviados: `originCode/providerCode/costType` (inputs muertos),
`modelo`, `ref`, `uni_compra`, `co_sucu`, `item`, precios, costos, stocks,
`campo1-8`, fechas de auditoría, sucursal.

## 5. Comparación real: diferencias confirmadas

### 5.1 `co_sucu` vacío (CAUSA 1 — visible en pantalla)
DM: vacío. Normales: `01` en 11.035/11.195 (98,6 %). La UI de Profit graba
la sucursal (`01`). Data-Maestra no la envía.

### 5.2 `uni_compra` vacío (CAUSA 2 — menor)
DM: vacío. Misma línea (FERMIS0001-3): `UND`. Global: vacío en 10.160/11.195
(práctica dividida). La UI suele replicar la unidad de venta en compra.

### 5.3 `modelo` y `ref` vacíos (CAUSA 3 — visibles en pantalla)
DM: vacíos (sin fuente: el input no los tiene). Normales completos los
llenan (`ACTEQU0022` modelo 063359/ref 088016). **RequestData SÍ tiene
`model`/`manufacturer`**, pero `buildProfitInput` no los envía. Dato
existente desperdiciado.

### 5.4 `tipo='V'` en FERMIS0662 (CAUSA 4 — verificar intención)
82/11.195 son `V`; todos los testigos son `C`. `V` es válido (CK) pero cambia
comportamiento: `pv_ObtenerArticulo` solo lista `tipo IN ('V','S')` en punto
de venta. Si la carreta es consumo/venta debe confirmarlo el dueño del dato;
el motor no debe cambiarlo solo.

### 5.5 `co_us_in` inconsistente (CAUSA 5 — auditoría)
`FERMIS0663`=`DM`; `FERMIS0662`/`SOFSUM0196`=vacío. El payload de 15 columnas
(incluye `co_us_in`) es posterior a los dos primeros inserts (eran 14).
Evidencia de evolución del payload, no de Profit.

### 5.6 `item` vacío (NO causa)
Vacío en 4.382/11.195 (39 %). Práctica dividida; no es anomalía.

### 5.7 `dis_cen` NO es el problema
DM lo trae completo (`<DIS>{c1:…}{c7:…}{c8:…}</DIS>`); varios normales lo
tienen vacío. Diferencia solo cosmética: Profit escribe `<DIS>\r{…}\r</DIS>`
con retornos; el parser (`deserializarDis`) acepta ambos. No asumir dis_cen.

### 5.8 Falsos sospechosos descartados con evidencia
- `equi_uni1-3=1`: es el **default**; los 0 de otros artículos los puso un
  proceso posterior. Correcto como está.
- `fe_us_mo/fe_us_el = creación`, `co_us_mo` vacío: correcto en artículos
  sin movimientos.
- Costos/stocks/precios/fechas en 0 o fecha de alta: correcto para un
  maestro nuevo (vienen de operaciones; §14 prohíbe copiarlos).
- `prec_vta 0.01` (963 arts.), `uni_compra` global: prácticas parciales, no
  norma.

## 6. Dónde vive cada dato de la pantalla Profit

| Pantalla | Tabla.campo |
|---|---|
| Código / Descripción | `art.co_art` / `art.des` |
| Tipo | `art.tipo` (CK V/F/C/S/M/N/E) |
| Modelo / Referencia | `art.modelo` / `art.ref` (char 20, default espacio) |
| Grupo / Subgrupo | `art.co_lin→lin_art` / `art.co_subl→sub_lin` |
| Categoría | `art.co_cat→cat_art` |
| Marca | `art.co_color→colores` (Profit usa colores como marca) |
| Proveedor / Procedencia | `art.co_prov→prov` / `art.procedenci→proceden` |
| Unidad (venta/compra) | `art.uni_venta`+`suni_venta` / `art.uni_compra` (+`unidades`) |
| Impuesto | `art.tipo_imp→tabulado` |
| Distribución contable | `art.dis_cen` serializado `<DIS>` (cuentas en `sccuenta`/contab) |
| Stock por almacén | **`st_almac`** (DM: 0 filas — correcto, lo crean los movimientos) |
| Stock global/costos/precios | `art.stock_*/cos_*/prec_*` (operativos; no copiar) |
| Fotos | `art.picture/imagen1/imagen2` (vacías en AD_TRANS) |
| Auditoría | `co_us_in/fe_us_in/co_us_mo/…/co_sucu` |
| Unidades alternativas | sin tabla (`saArtUnidad` solo referenciada en código comentado) |
| Punto de venta | `pv_ObtenerArticulo` filtra `tipo IN ('V','S')`, `anulado=0` |

## 7. Causa raíz

1. `co_sucu` no se envía (debió ser `01`).
2. `uni_compra` no se envía (replicar `uni_venta`).
3. `modelo`/`ref` no se envían (conectar `requestData.model` + agregar
   referencia al flujo; hoy el input ni los contempla).
4. `tipo='V'` en FERMIS0662 requiere confirmación funcional.
5. `co_us_in` vacío en 2/3 (payload viejo de 14 columnas; a futuro siempre DM).
6. Defaults siempre fijos (`procedenci 01`, `co_prov GEN`, `tipo_cos ULCO`)
   porque sus inputs nunca se alimentan — correcto como default, pero sin
   opción real a diferenciar.
7. Formato `dis_cen` sin `\r` (cosmético; parser lo acepta).

Nada de esto está en triggers (no autocompletan), ni en tablas relacionadas
(no requieren filas extra: basta el código FK), ni en costos/stocks
(operativos, no copiar).

## 8. Payload recomendado (FASE 2, sin aplicar)

Mantener las 15 + agregar: `co_sucu` ('01'), `uni_compra` (= uni_venta),
`modelo` (desde requestData.model), `ref` (nuevo dato del flujo o vacío
documentado), `co_us_in` siempre. `item`: vacío (práctica dividida, no tocar).
Precios/costos/stocks/fechas operativas: fuera. `fe_us_*`: defaults de Profit.

## 9. Reparación propuesta (3 artículos, FASE 2 explícita)

Solo `UPDATE` puntuales sobre `dbo.art` (con aprobación):
- 3 filas: `co_sucu='01'`, `uni_compra=uni_venta`.
- `FERMIS0663`/`SOFSUM0196`… (todos): `co_us_in='DM'` donde esté vacío
  (los 3: solo FERMIS0663 lo tiene).
- `modelo`/`ref` si el solicitante aporta el dato.
- `FERMIS0662`: confirmar `tipo` (V vs C) antes de tocar.
- No tocar: costos, stocks, precios, fechas, dis_cen (ya correcto),
  `rowguid`, auditoría histórica.

## 10. Riesgos

- `TrigU_art` valida `suni_venta` en UPDATE (existe y es válido: UND).
- UPDATE directo no dispara nada más (triggers de DELETE no aplican).
- `tipo` V→C cambiaría visibilidad en punto de venta: decisión funcional.
- `migrate`/código: FASE 2 no debe romper los 642 tests (payload puro y
  testeable en `profit-article.payload.ts`).

## 11. Plan exacto FASE 2

1. Extender `ProfitArticleInput` (co_sucu, uni_compra, modelo, ref) +
   `buildProfitArticlePayload` + statement (seguir 15→19 columnas fijas).
2. Alimentar desde `buildProfitInput` (requestData + sucursal `01`).
3. Tests unitarios del payload (puros, existentes como base).
4. Con aprobación explícita: UPDATEs de reparación (§9) + verificación
   SELECT posterior.
5. Revalidar: tests, typecheck, build. Profit INSERT/UPDATE/DELETE = 0
   durante el desarrollo (solo el UPDATE de reparación autorizado).

## 12. Validaciones de esta fase

- Tests backend/frontend existentes: (ver reporte; solo lectura de código).
- Typecheck: sin cambios de código, no aplica regressión.
- Profit: INSERT = 0, UPDATE = 0, DELETE = 0 (solo SELECT + metadatos).
