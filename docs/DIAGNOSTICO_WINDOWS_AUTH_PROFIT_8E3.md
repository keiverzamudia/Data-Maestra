# Diagnóstico Windows Auth Node → SQL Server — Fase 8E.3 (solo investigación)

> Sin cambios de negocio, sin escrituras en Profit, sin usuarios nuevos, sin cambios de UI/workflow/schema/endpoints.

## 1. Problema

`ProfitAdapter` (Node.js/NestJS, `mssql`) no logra autenticarse contra
`SRVBDPROFITBK` con Windows Authentication y devuelve
`Profit unavailable: Error de inicio de sesión del usuario ''`,
mientras `sqlcmd -S SRVBDPROFITBK -E` funciona con el mismo usuario de Windows.

## 2. Evidencia sqlcmd (control positivo, solo SELECT)

```powershell
sqlcmd -S SRVBDPROFITBK -E -Q "SELECT SUSER_SNAME() AS LoginActual;" -h -1
# → CORPOAGROCA\desarrollador02

sqlcmd -S SRVBDPROFITBK -d AD_TRANS -E -Q "SELECT COUNT(*) AS TotalArticulos FROM dbo.art;" -h -1
# → 11192

sqlcmd -S SRVBDPROFITBK -d AD_TRANS -E -Q "SET NOCOUNT ON; SELECT TOP 3 co_art FROM dbo.art ORDER BY co_art;" -h -1
# → HERMEC066 / .RVHMIS0336 / 094-7134-CAT
```

Conclusión: `Windows → SRVBDPROFITBK → AD_TRANS → dbo.art = FUNCIONA`.

## 3. Usuario Windows detectado

- `whoami` en el shell: `corpoagroca\desarrollador02`.
- `SUSER_SNAME()` vía sqlcmd: `CORPOAGROCA\desarrollador02`.
- Dueño del proceso API (puerto 3001, CIM `Win32_Process.GetOwner`): `desarrollador02 / CORPOAGROCA`
  (misma identidad; no es un problema de cuenta de servicio distinta).
- `apps/api/api.err.log` (PID 35132): `Connecting to Profit SRVBDPROFITBK/AD_DIST
  (user=WindowsAuth)` seguido de `Profit connection failed: Error de inicio de
  sesión del usuario ''`, repetido en cada intento.

## 4. Versión Node

`v24.18.0` (`node --version` en el workspace).

## 5. Versión mssql

`12.7.0` (`apps/api/package.json:34`, confirmado en instalado).

## 6. Versión tedious

`20.0.0` (dependencia transitiva de `mssql@12.7.0`,
`node_modules/.pnpm/tedious@20.0.0`). Es el driver real en uso
(`mssql/lib/tedious/connection-pool.js` → `new tds.Connection(...)`).

## 7. msnodesqlv8

**Ausente.** No existe en `node_modules/.pnpm` (`*msnodesql*` → vacío).
`mssql` trae carpeta de driver `lib/msnodesqlv8`, pero el paquete nativo no
está instalado. No se instaló nada en esta fase.

## 8. Configuración actual del ProfitAdapter

`apps/api/src/modulos/profit/profit-adapter.service.ts:77-106`:

```ts
const config: any = {
  server,            // SRVBDPROFITBK (de PROFIT_DB_SERVER)
  database,          // AD_DIST / AD_TRANS (de PROFIT_DB_DATABASE)
  options: {
    encrypt: false,
    trustServerCertificate: true,
    connectTimeout: 5000,
    requestTimeout: 10000,
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 5000,
  requestTimeout: 10000,
};
if (user && password) { config.user = user; config.password = password; }
else { config.options.trustedConnection = true; }   // ← rama activa hoy (.env.local sin user)
```

`.env.local`: `PROFIT_DB_USER=` y `PROFIT_DB_PASSWORD=` vacíos → siempre rama
`trustedConnection`.

## 9. Pruebas realizadas

| # | Prueba | Resultado |
|---|---|---|
| 1 | `sqlcmd -E` SUSER_SNAME / COUNT / TOP 3 | OK (`CORPOAGROCA\desarrollador02`, 11192) |
| 2 | API viva `GET /profit/categories` | 503 por fallo de login (logs) |
| 3 | Node directo `new mssql.ConnectionPool({server:'SRVBDPROFITBK', trustedConnection:true})` | FAIL: `Error de inicio de sesión del usuario ''` |
| 4 | Ídem con `SRVBDPROFITBK.corpoagroca.local` (hipótesis SPN/Kerberos) | FAIL idéntico |
| 5 | Inspección `tedious@20` fuente instalada | `trustedConnection` aparece 0 veces en `lib/` |
| 6 | Inspección `mssql@12.7.0/lib/tedious/connection-pool.js:20-37` | Siempre envía `authentication:{type:'default'|'ntlm', options:{userName:undefined,…}}` |

No se creó script temporal: la evidencia era concluyente sin él
(prueba 3 reproduce el fallo; prueba 1 es el control positivo).

## 10. Resultados

- sqlcmd/ODBC con SSPI nativo: autenticación correcta como
  `CORPOAGROCA\desarrollador02`, lectura `dbo.art` verificada.
- Toda ruta Node → tedious con `trustedConnection: true`: login vacío, 100%
  reproducible, independiente del nombre de servidor.

## 11. Causa raíz

**tedious no tiene inicio de sesión único de Windows (SSO) con las
credenciales del proceso.** Evidencia en el código instalado:

1. `trustedConnection` no existe en `tedious@20` (`grep` en `lib/*.js` → 0
   coincidencias): la opción que fija el adapter es **silenciosamente ignorada**.
2. `mssql@12.7.0/lib/tedious/connection-pool.js:20` solo usa NTLM si
   `config.domain !== undefined`; en nuestro caso envía
   `authentication.type = 'default'` con `userName: undefined` → tedious manda
   login SQL vacío → SQL Server responde `Error de inicio de sesión del
   usuario ''`. Coincidencia exacta con el error observado.
3. El NTLM de tedious es puro JS (`lib/ntlm*.js`) y **exige**
   `options.domain/userName/password` explícitos (`connection.js:315-323`,
   lanza `TypeError` si faltan): no puede usar la identidad del proceso.
4. `sqlcmd -E` sí funciona porque ODBC usa SSPI nativo del SO.

En resumen: el adapter pide "Windows Auth" con una bandera que el driver no
implementa; el driver cae a login SQL vacío.

## 12. Alternativas evaluadas

| ID | Alternativa | Evidencia | Veredicto |
|---|---|---|---|
| A | Mantener tedious y "corregir configuración" | tedious@20 exige `domain/userName/password` para NTLM; no hay SSO | **No viable** sin credenciales explícitas |
| B | NTLM explícita (`domain`+`user`+`password` en config; mssql la mapea a `type:'ntlm'`) | Soportado por `connection-pool.js:20` y `connection.js:315` | Viable solo con cuenta de servicio dedicada en variables de entorno; **no usar la contraseña personal ni pedirla en chat** |
| C | `msnodesqlv8` (ODBC nativo → Windows Auth real como sqlcmd) | Paquete ausente; requiere ODBC Driver + compilación nativa en Windows | Viable pero con riesgo de instalación; documentado abajo, **no instalado** |
| D | Login SQL solo-lectura `dm_reader` | El adapter ya soporta rama `user/password`; `db_datareader`; recomendación 7D y skill `security` (mínimo privilegio) | **Recomendada** |
| E | Otra | No hay SSO en tedious; Kerberos directo no está expuesto por mssql | Ninguna |

## 13. Alternativa recomendada

**D) `dm_reader` SQL de solo lectura**, por: cero cambios de código (rama
`user && password` ya existe y está testeada), cero dependencias nativas,
mínimo privilegio, credencial rotatable sin tocar cuentas personales, y es la
recomendación vigente de Fase 7D.

Segunda opción: **C) `msnodesqlv8`** si se exige Windows Auth sin secretos
(misma vía ODBC que sqlcmd, ya probada como control positivo).

## 14. Pasos necesarios para implementarla (D, por DBA/usuario; NO ejecutar en 8E.3)

```sql
-- Solo SELECT de verificación previa (DBA):
USE AD_TRANS; GO
-- 1. Crear login + usuario solo-lectura (DBA, fuera del agente):
-- CREATE LOGIN dm_reader WITH PASSWORD = '<generada-por-DBA>';
-- USE AD_TRANS; CREATE USER dm_reader FOR LOGIN dm_reader;
-- ALTER ROLE db_datareader ADD MEMBER dm_reader;
```

```ini
# apps/api/.env.local (usuario, nunca en git):
PROFIT_DB_USER=dm_reader
PROFIT_DB_PASSWORD=<secreto-del-DBA>
PROFIT_ENV=test
PROFIT_WRITE_ENABLED=false
```

```powershell
.\scripts\api-restart.ps1
Invoke-RestMethod http://localhost:3001/api/v1/profit/accounts?limit=5
# esperado: 200 con [{code, description}], ej. 1.1.02.01.01.003 ↔ Diferencia en cambio
```

Para **C** (si se elige): `pnpm --filter @master-data/api add msnodesqlv8`
(requiere Microsoft ODBC Driver 17/18 + herramientas de compilación; riesgo:
fallo de build nativo en Windows), luego `driver: 'msnodesqlv8'` y
`connectionString`/`trustedConnection` según docs del paquete instalado.
**No ejecutado en esta fase.**

## 15. Riesgos

- D: gestión del secreto (usar `.env.local`/secret manager, nunca repo ni chat);
  el login debe ser `db_datareader` como máximo.
- C: instalación nativa puede fallar sin ODBC Driver/build tools; acopla el
  despliegue a Windows.
- B: credencial personal caduca y viola mínimo privilegio; solo aceptable con
  cuenta de servicio.
- Ninguna alternativa modifica Profit: todas son READ-ONLY.

## 16. Confirmación de no escrituras en Profit

En 8E.3 solo se ejecutó: `SELECT SUSER_SNAME()`, `SELECT DB_NAME()` implícito,
`SELECT COUNT(*) FROM dbo.art`, `SELECT TOP 3 co_art FROM dbo.art`,
intentos de **conexión** (login, sin queries de escritura) y lecturas de
`node_modules`/código. Cero `INSERT/UPDATE/DELETE/MERGE/ALTER/DROP/CREATE/
TRUNCATE`, cero logins/usuarios creados, cero cambios de permisos, cero
cambios en `AD_TRANS`/`AD_DIST`, cero cambios en Data-Maestra (código, Prisma,
workflow, frontend, endpoints).
