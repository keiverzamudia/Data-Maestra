# FASE 14K.4 — Fix parámetro dis_cen (SIN INSERT, flag OFF)

## Error original

ODBC: "text/ntext/image no válidos para variables locales". `dbo.art.dis_cen`
es TEXT; el adapter declaraba el parámetro como `Text` y el driver lo
convierte en variable local TEXT, rechazada por SQL Server.

## Cambio (único permitido)

`profit-write.adapter.ts`: `dis_cen: { type: mssql.VarChar(8000), ... }`
(mismo valor funcional, conversión implícita a `text` válida). Columna
presente en el INSERT; ningún otro tipo/parámetro/valores tocados; sin
`Text` restante en bindings (solo comentarios).

## Prueba sin escritura (mismo driver)

`DECLARE @v VARCHAR(8000)=@d; SELECT CAST(@v AS TEXT)` → OK (`''`, LEN 0,
identidad Windows). Prueba el punto exacto del fallo sin tocar `dbo.art`.

## Payload y dry-run REQ-0055

Payload idéntico al validado (FERMIS0662/CARRETA/V/FER/MIS/UND/UND/
1/01/01/01/GEN/ULCO/`dis_cen:''`), candidato disponible, dry-run READY en
sustancia. Nota: el plan escribe su fila local `PROFIT_PLAN` (diseñado así;
cero escrituras en Profit).

## ERROR_PROFIT

Sin mecanismo de recuperación existente (`getNextWorkflowState` no contempla
salidas desde ERROR_PROFIT; `createInProfit` exige APROBADO_FINAL). No se
inventa ninguno: la recuperación requerirá decisión explícita futura.
REQ-0055 permanece en ERROR_PROFIT (no se tocó).

## Cero escrituras confirmadas

INSERT/UPDATE/DELETE/DDL = 0. FERMIS0662 = 0. Total `dbo.art` = 11.192.
Flag OFF (verificado en archivo). Health 200 post-restart.

## Validación

Backend 374/374, frontend 153/153, `tsc` OK (ambos), `nest build` OK (vía
restart), `vite build` OK.
