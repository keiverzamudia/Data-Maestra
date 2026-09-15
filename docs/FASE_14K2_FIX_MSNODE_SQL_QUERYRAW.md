# FASE 14K.2 — Fix incompatibilidad msnodesqlv8/queryRaw (SIN INSERT, flag OFF)

## Síntoma

`POST profit-plan` y `GET profit/categories` → 503 con
`Profit query error: connection.queryRaw is not a function`; luego timeouts
en cascada. (El write-status OK previo era real: `testConnection` usa el
pool wrapper correctamente.)

## Causa técnica

`mssql` registra el driver activo en un global compartido (`base.driver`):
`mssql/lib/tedious/index.js` y `mssql/lib/msnodesqlv8/index.js` lo
sobrescriben al importarse. Y `pool.request()` crea
`new shared.driver.Request(...)`: la clase del ÚLTIMO driver importado en
el proceso, no la del pool. Al convivir tedious (adapter READ) con el
wrapper (adapter WRITE, importado después), los pools tedious empezaron a
crear Requests del wrapper, que llaman `connection.queryRaw`, inexistente
en conexiones tedious → TypeError. Las conexiones mal liberadas degradaron
los pools hasta los timeouts posteriores. Las pruebas internas 14K.0 no lo
vieron porque cada script importaba un solo driver.

## Solución (abstracción única, §REGLA DE DISEÑO)

- Nuevo `profit-driver.ts`: único punto de acceso al driver
  (msnodesqlv8 + ODBC 18). Ambos adapters (READ con SQL auth Uid/Pwd,
  WRITE con windows/sql según `PROFIT_WRITE_AUTH`) lo usan
  exclusivamente; **ningún archivo del módulo importa tedious pelado**
  (verificado por test guardián).
- Negocio sin cambios: mismo SQL parametrizado, mismos tipos, mismos
  timeouts, mismos contratos y errores. Sin retries nuevos.
- Modos preservados: windows (proceso API) y sql (credenciales explícitas).

## Pruebas READ obligatorias (código real, API reiniciada, health 200)

- `DB_NAME/SUSER_SNAME`: AD_TRANS / CORPOAGROCA\desarrollador02.
- `COUNT co_art='FERMIS0662'`: 0 → DISPONIBLE.
- categories: 200-equivalente, 24 cats.
- profit-plan REQ-0055: READY (FERMIS0662, seq 662, warning documentado).
- VERIFY FERMIS0662: NOT_FOUND (fix 14K.0 intacto, CAST vigente).
- Flag OFF verificado. Cero INSERT/UPDATE/DELETE/DDL.

## Validación

Backend 373/373, frontend 153/153, `tsc` OK (ambos), `nest build` OK (vía
restart), `vite build` OK. Cambios: `profit-driver.ts` (nuevo),
`profit-adapter.service.ts`, `profit-write.adapter.ts` (`types()` unificado),
test guardián de driver único.
