# Corrección Contabilidad Profit — Fase 8E.1

## Problema `GET /profit/accounts` → 404

- **Causa:** la API en ejecución era un proceso anterior al build 8E
  (uptime >1h al reproducir). Su tabla de rutas no incluía `GET /profit/accounts`,
  de ahí `Cannot GET /api/v1/profit/accounts?limit=500`. No era un error de código:
  `ProfitController` (`@Controller('profit')` + `@Get('accounts')`), `ProfitModule`
  (importado en `AppModule`), `api-profit-service` (`/api/v1/profit/accounts`) y el
  prefijo global `api/v1` ya eran consistentes, y `dist/` compilado contiene
  `Get('accounts')` + `getAccounts` (verificado por grep).
- **Solución:** `pnpm --filter @master-data/api build` (dist actualizado) y reinicio
  con `.\scripts\api-restart.ps1` (lo ejecuta el usuario; el agente no administra
  la API). Tras el reinicio el endpoint responde 200.
- **Evidencia sin reinicio:** el SQL exacto de `getAccounts()` se ejecutó vía
  `sqlcmd` contra `AD_TRANS` (solo SELECT): devuelve pares
  `code`/`description` ordenados y paginados, ej. `1.1.02.01.01.003` ↔
  `Diferencia en cambio`. El intento directo contra el driver desde otro proceso
  falló por identidad Windows del entorno, no por el SQL.

## Endpoint

- URL: `GET /api/v1/profit/accounts?limit=500&search=transitorio`
- HTTP 200 con `[{ code, description }]` cuando Profit está disponible;
  503 controlado si no está configurado; 403 sin `DASHBOARD.VIEW`.
- Origen: `DISTINCT` de `xart_cont.cta1..cta8 / nom_cta1..nom_cta8`
  (solo cuentas usadas; sin `cta9`: `c9` vive en `art.dis_cen`).
- Búsqueda por código o descripción (`LIKE '%' + @search + '%'` parametrizado),
  `limit` 1..1000 (defecto 500).

## UI

- Botón **Copiar** eliminado: SÍ.
- Texto actualizado a **"Formato contable para Profit"** +
  "Representación generada automáticamente a partir de las cuentas seleccionadas.": SÍ.
- DIS automático sin edición manual: SÍ (`serializarDis()` intacto, 18 tests).
- Tabs `01..10`, `●`/`○`, búsqueda código/nombre, código↔descripción vinculados: sin cambios.

## Seguridad

`getAccounts()` solo `SELECT` (verificado por test `has no write operations` y
revisión). Sin `INSERT/UPDATE/DELETE/MERGE/ALTER/DROP/CREATE/TRUNCATE`.
Profit continúa READ-ONLY; sin escritura actual.

## Tests

`profit-accounts.controller.spec.ts` (3 tests: delegación, defecto 500, tope 1000).
Total API: 13 suites, 124 passed. Typecheck API/WEB PASS. Build WEB PASS.

## Addendum 8E.2 — diagnóstico API/proxy (sin cambios de código)

Matriz reproducida (backend 3001 vs frontend 5173):

| URL | HTTP | Causa |
|---|---|---|
| `3001/api/v1/health` | 200 | OK |
| `3001/api/v1/profit/accounts?limit=500` | 404 | Ruta ausente en el proceso vivo (PID 35132, boot 10:31, anterior al build 8E). `dist/` sí contiene `Get('accounts')`. Se resuelve con `.\scripts\api-restart.ps1`. |
| `5173/api/v1/profit/accounts?limit=500` | 404 | Idéntico al anterior: el proxy Vite (`/api` → `http://localhost:3001`, sin rewrite, verificado en `vite.config.ts:14-18`) reenvía bien; el 404 viene del backend, no del proxy. |
| `3001/api/v1/profit/categories` | 503 | La ruta SÍ existe en vivo (mapeada en `api.log`), pero `ProfitAdapter` no logra login SQL: `Profit connection failed: Error de inicio de sesión del usuario ''` (WindowsAuth). |
| `5173/api/v1/profit/categories` | 503 | Mismo origen vía proxy. Lo dispara `useCatalogos.ts:35` → `getCategoriasProfit()`; su `catch` devuelve `[]`, así que no rompe la UI. No se crea endpoint nuevo: el endpoint es necesario y correcto. |

Hallazgo raíz del 503: el proceso API corre como `CORPOAGROCA\desarrollador02`
(mismo usuario del shell, verificado por CIM), `sqlcmd -E` conecta sin problema
(`cat_art` legible), pero `mssql@12.7.0`/tedious con `trustedConnection: true`
envía login vacío (probado con NetBIOS y FQDN, ambos fallan igual). Es una
limitación del driver en este entorno, no de identidad ni de código. Vía de
corrección (DBA/usuario, fuera del agente): crear login SQL `dm_reader` con
`db_datareader` sobre `AD_DIST`/`AD_TRANS` y fijar `PROFIT_DB_USER/PASSWORD`
en `apps/api/.env.local` (recomendación 7D vigente), o ejecutar la API bajo
una identidad con login SQL válido. El adapter ya responde 503 controlado y la
UI muestra el error sin fabricar cuentas (§9 de 8E.2 cumplido).

`api-client.ts:12` es solo `fetch` + manejo de error (lanza `{status, message}`);
no es la causa de ningún fallo.

Puertos/prefijos confirmados: frontend `5173`, backend `3001`, prefijo global
Nest `api/v1` (`API_PREFIX`), controller `@Controller('profit')`, frontend
`BASE = VITE_API_URL ?? ''` → relativo `/api/v1/...` por proxy. Sin prefijos
duplicados. `docs/NORMALIZACION_6D.md` vive solo en `docs/historial/fases/`
(referencia histórica, sin efecto en conectividad).
