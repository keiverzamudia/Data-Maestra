# FASE 24.2 — Implementación de corrección del alta Profit + reparación

> Referencia: `docs/FASE_24_INVESTIGACION_ARTICULO_PROFIT.md` (Fase 1, fuente
> de verdad). Profit en esta fase: INSERT = 0, DELETE = 0, UPDATE = 3
> (puntuales, autorizados, en transacción).

## 1. Objetivo

Que los artículos creados desde Data-Maestra nazcan completos en
`AD_TRANS.dbo.art` y reparar los 3 existentes sin recrearlos.

## 2. Cambios de código

- `profit-article.payload.ts`: `ProfitArticleInput` + `ProfitArticlePayload`
  15→19 columnas (`co_sucu`, `uni_compra`, `modelo`, `ref`); builder con
  `co_sucu='01'`, `uni_compra=uni_venta`, modelo/ref con trim+slice(20) y
  vacío si ausentes; statement parametrizado (char/varchar, sin TEXT).
- `ClassifyRequestDto`: `model?`/`ref?` opcionales, `@MaxLength(20)`.
- `solicitud.service.ts`: `classify()` persiste model/ref;
  `buildProfitInput` los alimenta (`rd.model`, `rd.ref`).
- `profit-article-creation.service.ts`: VERIFY compara los 4 campos nuevos.
- `profit-adapter.service.ts`: `getArticleForVerify` los re-lee.
- `flatten-request-data.ts`: propaga `ref`.
- Prisma `RequestData.ref` + migración `20260918_fase242_request_ref`
  (aplicada a dev.db; `migrate deploy` no gestiona esa base — P3005
  preexistente). Cliente regenerado (tipos) y verificado en runtime con
  transacción+rollback.
- Frontend: `ClassificationData.model/ref`, inputs opcionales Modelo y
  Referencia en Almacén (maxLength 20, mismo estilo, deshabilitados en solo
  lectura), prefill, `buildPayload`; `Request.ref` en tipos.

## 3. Campos solicitados al usuario

Descripción, finalidad, tipo, grupo, subgrupo, categoría, marca, unidad,
part number, aplicación (existentes) + **modelo y referencia (opcionales,
máx. 20, nunca inventados)**.

## 4. Campos automáticos (Data-Maestra)

`co_sucu='01'`, `uni_compra=uni_venta`, `co_us_in=DM` (inyectado por el motor
desde `PROFIT_INTEGRATION_USER_CODE`; sin él no hay escritura — preflight).

## 5. Campos de Profit/SQL (no manipulados)

`fecha_reg`, `fe_us_*`, `rowguid`, costos, precios, stocks, `dis_cen`
(intacto, sin reserializar), `procedenci/co_prov/tipo_cos` (defaults
existentes conservados).

## 6. Reparación (2026-09-21T13:17:43Z, transacción única, COMMIT)

Solicitudes origen (REQ-0053/54/55): `model=null`, `ref=null` en las tres →
**modelo/ref intactos** (sin dato demostrable).

| Artículo | Antes | Después |
|---|---|---|
| FERMIS0662 | co_sucu '', uni_compra '', co_us_in '' | '01', 'UND', 'DM' |
| FERMIS0663 | co_sucu '', uni_compra '', co_us_in 'DM' | '01', 'UND', 'DM' (2 campos) |
| SOFSUM0196 | co_sucu '', uni_compra '', co_us_in '' | '01', 'UND', 'DM' |

Guardas por registro (existencia, código autorizado, valores esperados) +
verificación posterior: tipo, dis_cen, fechas, art_des, costos/precios/stocks
**sin cambios**. UPDATE = 3 sentencias (8 campos).

## 7. Validaciones

- Backend: 57 archivos, **658 PASS** (+3 skip live). Incluye spec nuevo
  `profit-payload-24-2` (8 tests: 6 casos §16 + sin fechas + recorte 20) y
  actualización de `profit-creation-14e` (19 cols) y `homologacion-17`.
- Frontend: 37 archivos, **240 PASS**.
- Typecheck API/Web: PASS. Build API/Web: PASS. Lint: sin configuración
  (no creado).
- Profit: INSERT = 0, DELETE = 0, UPDATE = 3.

## 8. Riesgos pendientes

- `tipo='V'` en FERMIS0662 conservado (decisión funcional pendiente).
- `prisma generate` completo bloqueado por EPERM mientras la API externa
  ejecuta (DLL cargada); tipos ya actualizados, regenerar con API detenida
  por el usuario si se requiere el binario.
- Working tree con cambios previos sin commit (fuera de fase).
