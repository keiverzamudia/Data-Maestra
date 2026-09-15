# FASE 14O — Cierre y endurecimiento del motor Profit (SIN INSERT)

## 1-4. Driver y caminos oficiales

Inspección total de `apps/api/src`: solo `profit-driver.ts` y los dos
adapters tocan SQL. Único camino: adapters → wrapper msnodesqlv8 + ODBC 18.
Cero pools tedious (test guardián anti-regresión). SQL auth (Uid/Pwd) es el
camino de escritura; sin fallback a Windows (falla cerrado). Lectura con
credenciales explícitas. Config sin duplicados peligrosos ni secretos
expuestos.

## 5-9. Auth, flag, permiso, endpoints

SQL `solicitudweb` como identidad técnica. Flag default false, verificado
en archivo y exigible en cada escritura. PROFIT.WRITE existe, solo en
MASTER_DATA_ADMIN, KZAMU vigente. Las 5 rutas exigen auth + permiso +
validan estado/flag/payload (plan/attempts son lectura).

## 10-17. Máquina, idempotencia, UNKNOWN, retry, VERIFY, profitCode, correlación

Sin estados nuevos. Transiciones imposibles bloqueadas (lock + `updateMany`
atómico + gates). Idempotencia triple + `ALREADY_REGISTERED` sin duplicar.
UNKNOWN sin auto-retry, VERIFY decide, humano recupera vía retry-request
(revalida, nunca escribe). VERIFY obligatorio por adapter READ con CAST
vigente. `profitCode` solo tras VERIFY (+backfill documentado de REQ-0055).
CorrelationId `...-NNNNNN` verificado en ambas operaciones.

## 18-21. Auditoría, logs, errores, SQL

STARTED/SUCCEEDED/FAILED/RESULT_UNKNOWN/COLLISION/VERIFY/RETRY_* con actor
humano y correlación; cuenta técnica solo conexión; `co_us_in` en blanco.
Logs sin secretos (servidor/base/códigos de error). Clasificador estricto
(EREQUEST genérico ≠ timeout). `dis_cen` VARCHAR(8000) vigente.

## 23-28. Datos, regresión, health, flag

FERMIS0662=1, SOFSUM0196=1, total 11.194 (+2 autorizados). REQ-0055/0053
REGISTRADO con profitCode; REQ-0054 APROBADO intacta. Backend 392/392,
frontend 162/162, `tsc` OK, ambos builds OK, health 200, flag FALSE.
Cero escrituras en 14O. Sin cambios de workflow/RBAC/contabilidad/almacén/
VM/AF/SSE ni UI (no necesarios).
