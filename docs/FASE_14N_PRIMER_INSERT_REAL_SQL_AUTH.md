# FASE 14N — Primer INSERT real con SQL Authentication (solicitudweb)

## Pre-flight (todo verificado antes de escribir)

- Health 200 (restart con build fresco). Auth mode `sql` en código.
- Identidad por adapter REAL: `solicitudweb`, sin Windows. `HAS_PERMS_BY_NAME`
  INSERT=1, SELECT=1 sobre `dbo.art` (solo metadata, sin conceder nada).
- RBAC: KZAMU activo con PROFIT.WRITE efectivo (rol MASTER_DATA_ADMIN).
- Objetivo: REQ-0055 excluida; REQ-0054 excluida. Elegida REQ-0053
  (cartelera, SOFSUM-00001, APROBADO_FINAL, C/1/UND, SOF/SUM, cat 01).
- Candidato SOFSUM0196 (MAXSEQ 0195), COUNT=0. Payload validado campo a campo.
- Hallazgo y fix en camino: la rama sql del adapter creaba pool tedious
  (rompía el invariante 14K.2); unificada a wrapper+Uid/Pwd. Sin fallback.

## Ejecución (autorización de fase)

Flag temporal ON + restart → revalidación §21 vigente → UN `createInProfit`
(actor KZAMU): 1 intento INSERTED + VERIFY `CREATED_AND_VERIFIED`, 695 ms.
Sin colisión, sin timeout, sin reintentos.

## Verificación

- `COUNT(SOFSUM0196)`=1, único; cartelera/SOF/SUM/UND/UND/C/1/01/01/GEN;
  `co_us_in` en blanco (14E.1); total 11.192→11.194 (+2: los dos inserts
  autorizados 0662 y 0196).
- REQ-0053 REGISTRADO + profitCode persistido; REQ-0055 y FERMIS0662
  intactos; REQ-0054 intacta. Sin UPDATE/DELETE/DDL.
- Auditoría STARTED+SUCCEEDED (actor 818128eb, `DM-PROFIT-20260914-000053`).
- Flag OFF + restart + health 200 (confirmado en archivo).
- Backend 388/388, frontend 162/162, `tsc` OK (ambos), ambos builds OK.
