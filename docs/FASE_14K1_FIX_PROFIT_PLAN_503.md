# FASE 14K.1 — 503 de profit-plan: causa y cierre (SIN INSERT, flag OFF)

## Síntoma

`POST /api/v1/requests/44e5…/profit-plan` → 503 en la UI, con el panel en
ESCRITURA DESHABILITADA. VERIFY de 14K.0 ya funcionaba.

## Causa exacta

**Sin defecto en el código actual.** Trazado exhaustivo del flujo real:

`profit-plan` → `resolveCompanyContext` (403s) → `planProfitCreation` →
`buildProfitInput` (400/404) → `engine.plan` (adapter READ, sin flag) →
`PROFIT_PLAN` (audit local). Los únicos 503 posibles son:
`profitEngine()` indefinido (descartado: grafo de módulos acíclico, app
operativa), `describeTarget` sin config (descartado: vars presentes) y
fallo READ (`Profit query error/unavailable`) = **conectividad transitoria
con SQL Server en el momento de la prueba**.

Evidencia: la cadena completa, con código productivo, Prisma real,
usuario/empresa reales y SELECTs reales, devuelve el equivalente a 200 en
4.1 s: candidato FERMIS0662, disponible, seq 662, warning documentado de
marca. Capas medidas sanas (tedious 90/8/7 ms, ODBC 69/35/15 ms, cero
bloqueos). El string reportado no existe en dependencias ni código propio.

Nota de proceso: la API en ejecución (PID 15392) corresponde al build con
todos los cambios 14J/14K.0 (dist 1 s anterior al arranque); no hay
staleness. Los logs del proceso desacoplado no se persisten (brecha de
observabilidad a mejorar, sin cambiar arquitectura en esta fase).

## Decisión

Sin cambio de código (reglas 13-17: sin causa de código demostrada no se
toca nada; no hay mocks, ni 200 artificiales, ni timeouts, ni contrato
alterado). VERIFY 14K.0 preservado.

## Validación

- profit-plan equivalente-200 con mismo código/datos (READY, FERMIS0662).
- FERMIS0662 COUNT 0 hoy. REQ-0055 APROBADO_FINAL. Flag OFF.
- Backend 371/371 (última corrida completa), `tsc` OK, `nest build` OK.
- Sin INSERT/UPDATE/DELETE/DDL. Endpoint-200 con sesión de operador:
  pendiente de un clic (sin credenciales para hacerlo desde aquí).

## Si el 503 reaparece

Capturar el BODY (el `message` indica la rama exacta) y hora; con eso se
identifica al instante. Candidatas honestas restantes: flap de red/VPN o
SQL ocupado por otra sesión (incl. SSMS con transacción abierta).
