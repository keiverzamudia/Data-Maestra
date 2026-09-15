# FASE — Usuario de integración Profit (trazabilidad `co_us_in`)

> 14Q: `co_us_in = DM` configurado. 14Q.1: causa del 400 corregida
> (variable ausente en `.env.local` en vivo). Sin escrituras.

## 1. Problema y hallazgos de inspección

- `co_us_in`: `char(6) NOT NULL`, default espacio. Cabe `DM`.
- **Sin FK** desde `art.co_us_in` hacia nada (10 FKs verificadas: solo
  catálogos funcionales). Profit no exige existencia a nivel BD.
- **No existe tabla de usuarios** en AD_TRANS (solo esquema `dbo`; sin
  `usu/user/opera/vusu`). El registro de usuarios vive en la capa
  aplicación Profit, fuera de esta base. **No se inventó `DM`**: no se
  creó nada por SQL.
- Triggers no tocan identidad; `ClassifyRequestDto` no tiene `co_us_in`.

## 2. Diseño (compatible con lo hallado)

- `PROFIT_INTEGRATION_USER_CODE`: backend-only (env). El motor la lee vía
  ConfigService inyectado; el frontend no la ve ni la envía (el DTO no
  tiene el campo y el engine **sobrescribe** cualquier valor interno).
- Sin configurar (o mal formada, `^[A-Za-z0-9]{1,6}$`): plan e INSERT
  fallan en preflight con error operacional claro, cero SQL.
- Como no hay tabla que consultar, la "validación de existencia" es:
  configurado + bien formado; la creación del usuario `DM`/`DATA MAESTRA`
  queda como procedimiento del administrador en la app Profit.
- Payload 15.º campo (`char(6)`); VERIFY lo compara; auditoría guarda
  `integrationUser` (sin secretos). Actor humano intacto (sesión);
  SQL técnico intacto; funcional = código configurado. Sin mezclas.

## 3. Procedimiento administrador (Profit app, NO SQL)

1. Crear usuario código `DM`, nombre `DATA MAESTRA`, en gestión de
   usuarios de Profit Plus (nunca `INSERT` directo).
2. Fijar `PROFIT_INTEGRATION_USER_CODE=DM` en backend (secretos: ninguno,
   es un código, no una credencial).
3. Verificación read-only (no existe tabla que consultar; verificar
   uso real):
   `SELECT DISTINCT LTRIM(RTRIM(co_us_in)) AS u, COUNT(*) FROM
   AD_TRANS.dbo.art GROUP BY LTRIM(RTRIM(co_us_in)) ORDER BY 1;`
   además de confirmarlo en la UI de usuarios de Profit.

## 4. Código recomendado: `DM`

Corto, inequívoco, cabe en `char(6)`, coherente con códigos existentes
(`ACAST`, `EAGU`). Recomendado, no creado.

## 5. Validación (14Q)

- `PROFIT_INTEGRATION_USER_CODE=DM` fijado en `.env.local` (línea 31).
- Backend 399/399 (statement 15 cols, gates, DTO sin campo, actor,
  anti-`HACKER`, VERIFY, idempotencia, flag, permiso, superficie sin
  update/delete), `tsc` OK, `nest build` OK (vía restart), health 200.
- Hallazgo 14Q: el 3er parámetro con tipo inline rompía el DI de Nest
  (`Object` irresoluble, API no arrancaba); tipificado a `ConfigService`.
- Cero escrituras: FERMIS0662=1, SOFSUM0196=1, total 11.194, flag OFF.

## 6. Incidente 14Q.1 (400 en profit-plan)

- Síntoma: `POST profit-plan` → 400 con el mensaje del gate aunque la
  variable existía en el archivo durante 14Q.
- Causa exacta: la línea `PROFIT_INTEGRATION_USER_CODE=DM` **ya no estaba**
  en el `.env.local` en vivo (archivo terminaba en contenido 14J);
  `integrationUserCode()` recibió `undefined` → gate correcto, config
  ausente. Código verificado correcto; ningún cambio de lógica requerido.
- Fix: repuesta la línea + log de presencia (`warn` solo cuando bloquea,
  sin exponer valores) + restart. Cadena probada con servicios reales:
  plan OK, candidato FERMIS0663 disponible, payload con `co_us_in: "DM"`.
- Estado: FERMIS0662=1, FERMIS0663=0, total 11.194, cero filas con DM
  (correcto: ningún INSERT con DM aún). Flag: `true` (preexistente en
  vivo; 14Q.1 ordena mantenerlo, no tocarlo).

## Archivos

Modificados: `profit-article.payload.ts` (+campo/statement),
`profit-adapter.service.ts` (SELECT), `profit-article-creation.service.ts`
(config+gate+verify), `solicitud.service.ts` (auditoría),
`profit-creation-14e.spec.ts`, `profit-registration-14f2.spec.ts`.
Creados: este doc.
