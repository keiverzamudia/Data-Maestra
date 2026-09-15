# FASE 14K.6 — Segundo INSERT real: SUCCESS (FERMIS0662)

## Pre-flight

Health 200 (tras restart). Windows Auth funcional. KZAMU activo con
PROFIT.WRITE. REQ-0055 en ERROR_PROFIT (intento #1 preservado) con datos
completos. Destino SRVBDPROFITBK/AD_TRANS. Candidato FERMIS0662 libre
(COUNT 0, MAXSEQ 0661). Baseline `dbo.art`: 11.192.

## Recovery (sin escritura)

`requestProfitRetry` → READY (FERMIS0662 disponible) → APROBADO_FINAL con
nueva correlación `DM-PROFIT-20260913-000055`. Intento #1 intacto.

## Ejecución (autorización explícita del operador)

Flag temporal ON + restart → revalidación total vigente → UN
`createInProfit` (actor KZAMU): 1 intento, INSERTED, VERIFY
`CREATED_AND_VERIFIED` sin diferencias, 700 ms. Sin colisión, sin timeout,
sin reintentos.

## Verificación final

- `COUNT(FERMIS0662)` = 1 (único).
- CARRETA / FER / MIS / UND / UND / V / 1 / 01; `co_us_in` en blanco
  (decisión 14E.1); `fe_us_in` automática.
- Total `dbo.art` = 11.193 (+1 exacto). MAXSEQ 0662.
- Sin UPDATE/DELETE/DDL (el motor no posee esas rutas).
- Workflow: REGISTRADO_PROFIT. Auditoría: RETRY_REQUESTED + STARTED +
  SUCCEEDED (actor 818128eb, correlación nueva).
- Flag OFF + restart + health 200 (confirmado en archivo).
- Backend 383/383, frontend 157/157, `tsc` OK (ambos), ambos builds OK.

## Cierre

Ninguna operación adicional posterior al resultado.
