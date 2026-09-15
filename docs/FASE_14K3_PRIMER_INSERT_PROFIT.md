# FASE 14K.3 — Primer INSERT real: FAILED (causa identificada, sin efectos)

## 1-7. Contexto y pre-flight

REQ-0055/CARRETA/FERMIS-00001 → FERMIS0662, APROBADO_FINAL, dry-run READY,
Windows integrada, SRVBDPROFITBK/AD_TRANS, KZAMU con PROFIT.WRITE, flag
temporal ON tras confirmación explícita. Todo verificado dos veces.

## 8-10. INSERT y resultado

UN solo intento vía `createInProfit` (motor real, actor KZAMU): el INSERT
falló en SQL Server con error determinista ODBC —"los tipos text/ntext/
image no son válidos para las variables locales"— porque el parámetro
`dis_cen` se declaraba `Text` en el wrapper msnodesqlv8. Cero reintentos
(no era colisión ni timeout). **Nada fue insertado.**

## 11. VERIFY y workflow

`COUNT(FERMIS0662)=0`, total `dbo.art` intacto (11.192), MAXSEQ 0661.
REQ-0055 → ERROR_PROFIT (correcto). Auditoría: STARTED + resultado
(ver §12). Sin UPDATE/DELETE/DDL.

## 12. Clasificación y correcciones aplicadas

El motor marcó AMBIGUO por `code=EREQUEST` genérico (falso incierto) y el
correlationId salió `...-000000` (`Number('REQ-0055')` es NaN). Corregido:
EREQUEST sin evidencia de timeout → UNKNOWN (no VERIFY engañoso);
correlationId extrae dígitos finales (`...-000055`); parámetro `dis_cen`
a `VarChar(8000)` (conversión implícita a `text` válida). Sin re-ejecución.

## 13-15. Flag, validación, cierre

Flag OFF + restart + health 200 confirmados. Backend 374/374, frontend
153/153, `tsc` OK (ambos), ambos builds OK. Cambios: 3 archivos fuente +
tests. Para el próximo intento autorizado solo falta la confirmación: el
código ya contiene el fix (pendiente de prueba viva).
