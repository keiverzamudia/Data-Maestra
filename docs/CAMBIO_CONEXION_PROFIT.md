# Cambio de Conexión Profit SQL Server — Guía Literal

> Para cambiar de `AD_DIST` a `AD_TRANS` (o cualquier otra BD Profit) al pie de la letra.

## 0. Hay DOS bases de datos distintas — No las confundas

| BD | Para qué | Dónde se configura | Provider | Archivo |
|---|---|---|---|---|
| **Data-Maestra** | Solicitudes, workflow, catálogo interno, usuarios | `DATABASE_URL` | SQLite dev `file:../data/dev.db` → Postgres prod | `apps/api/.env` línea 3, `apps/api/prisma/schema.prisma:8-11` `provider = "sqlite"` `url = env("DATABASE_URL")` |
| **Profit SQL Server** | Lectura de `dbo.art`, `lin_art`, `sub_lin`, `unidades` en `SRVBDPROFITBK` | `PROFIT_DB_*` | `mssql`/`tedious` via `ProfitAdapter` | `apps/api/src/modulos/profit/profit-adapter.service.ts:39-47` |

**Esta guía es SOLO para Profit.** No toques `DATABASE_URL` para cambiar `AD_DIST` → `AD_TRANS`.

---

## 1. Un único sitio donde se cambia Profit

```
Archivo: apps/api/.env.local   (desarrollo local, no se commitea)
         — si no existe, créalo copiando apps/api/.env
         — ConfigModule lo lee en apps/api/src/app.module.ts:22-24:
           envFilePath: [join(__dirname,'..','.env.local'), join(__dirname,'..','.env')]
         — .env.example línea 25-31 solo tiene placeholders comentados, nunca pongas credenciales ahí.
```

Variables **REALES** que lee `ProfitAdapterService.getConfig()` (`profit-adapter.service.ts:39-47`):

```ini
PROFIT_DB_SERVER=SRVBDPROFITBK        # host SQL Server (10.27.148.210)
PROFIT_DB_DATABASE=AD_DIST            # <— cambia aquí a AD_TRANS
PROFIT_DB_USER=                       # vacío = Windows Auth (actual). Si usas SQL Auth: dm_reader
PROFIT_DB_PASSWORD=                   # vacío si Windows Auth
PROFIT_ENV=production                 # production para AD_DIST, test para AD_TRANS
PROFIT_WRITE_ENABLED=false            # SIEMPRE false en este roadmap (hasta 9D autorizada)
```

**No inventes nombres.** Son exactamente `PROFIT_DB_SERVER`, `PROFIT_DB_DATABASE`, `PROFIT_DB_USER`, `PROFIT_DB_PASSWORD`, `PROFIT_ENV`, `PROFIT_WRITE_ENABLED`.

---

## 2. Ejemplo literal — AD_DIST → AD_TRANS

### Antes (hoy)
```ini
# apps/api/.env.local
DATABASE_URL="file:../data/dev.db"
PORT=3001
API_PREFIX=api/v1
PROFIT_DB_SERVER=SRVBDPROFITBK
PROFIT_DB_DATABASE=AD_DIST
PROFIT_DB_USER=
PROFIT_DB_PASSWORD=
PROFIT_ENV=production
PROFIT_WRITE_ENABLED=false
```

### Después (quieres AD_TRANS)
```ini
# apps/api/.env.local  — cambia SOLO la línea 6
PROFIT_DB_SERVER=SRVBDPROFITBK
PROFIT_DB_DATABASE=AD_TRANS
PROFIT_DB_USER=
PROFIT_DB_PASSWORD=
PROFIT_ENV=test
PROFIT_WRITE_ENABLED=false
```
> Cambiar `DATABASE` implica también cambiar `PROFIT_ENV` a `test` para que `assertReadOnly()` (`profit-adapter.service.ts:50-55`) no bloquee y quede claro que es entorno de prueba.

Si `AD_TRANS` requiere SQL Auth en lugar de Windows Auth:
```ini
PROFIT_DB_USER=dm_reader
PROFIT_DB_PASSWORD=TU_PASSWORD_EN_.env.local_NO_EN_GIT
```

---

## 3. Verificar que AD_TRANS existe ANTES de tocar código (solo SELECT)

Con Windows Auth (actual):
```powershell
sqlcmd -S SRVBDPROFITBK -E -Q "SELECT name FROM sys.databases WHERE name='AD_TRANS'" -h -1
# debe devolver: AD_TRANS

sqlcmd -S SRVBDPROFITBK -d AD_TRANS -E -Q "SELECT name FROM sys.tables WHERE name IN ('art','lin_art','sub_lin','unidades') ORDER BY name" -h -1
# debe devolver 4 filas: art, lin_art, sub_lin, unidades

sqlcmd -S SRVBDPROFITBK -d AD_TRANS -E -Q "SELECT COUNT(*) FROM dbo.lin_art" -h -1
# debe devolver ~38 (mismo catálogo que AD_DIST)

sqlcmd -S SRVBDPROFITBK -d AD_TRANS -E -Q "SELECT TOP 2 co_art, art_des FROM dbo.art ORDER BY co_art" -h -1
```

Con SQL Auth:
```powershell
sqlcmd -S SRVBDPROFITBK -d AD_TRANS -U dm_reader -P "xxx" -Q "SELECT 1"
```

Si no existe → **no lo crees desde la app**. Debe crearlo el DBA (backup/restore de AD_DIST o Generate Scripts schema-only + `dbo.art/lin_art/sub_lin/unidades/prov/colores` + PK/FK/índices/triggers + datos catálogos). Ver `docs/PROFIT_TEST_REQUISITOS_9A.md` futuro.

---

## 4. Aplicar el cambio (literal, sin atajos)

```powershell
# 1. Editar
notepad apps\api\.env.local
# cambia PROFIT_DB_DATABASE=AD_TRANS y PROFIT_ENV=test, guarda

# 2. Build (genera dist con ProfitModule ya compilado)
pnpm --filter @master-data/api build
# debe terminar sin error: "nest build"

# 3. Reiniciar API — OBLIGATORIO
#    La API es lazy (getPool() solo al primer query) pero ConfigService lee env al arrancar.
#    Sin reinicio sigue apuntando a AD_DIST aunque dist esté actualizado (visto en 7H uptime 63228s seguía 404).
.\scripts\api-restart.ps1
# hace: build → api-stop → api-start (desacoplada) → health
# Si haces manual: .\scripts\api-stop.ps1 ; .\scripts\api-start.ps1 ; .\scripts\api-health.ps1

# 4. Ver log que mapeó Profit
Get-Content apps\api\api.log -Tail 30 | Select-String "Profit|profit"
# debe aparecer: "Mapped {/api/v1/profit/groups, GET}" y "Mapped {/api/v1/profit/articles"
# si no aparece, el proceso sigue viejo — repite api-restart
```

> **AGENTS.md §12** prohíbe a OpenCode hacer `Start-Process`/`taskkill` del API; el reinicio lo ejecuta el usuario con el script.

---

## 5. Verificar sin escribir (solo READ)

```powershell
# health
Invoke-RestMethod http://localhost:3001/api/v1/health
# → {status:"ok"}

# Profit READ — con sesión con DASHBOARD.VIEW (u1 tiene permiso)
# primero cambia sesión
Invoke-RestMethod "http://localhost:3001/api/v1/auth/session?userId=u1"
# luego READ
Invoke-RestMethod http://localhost:3001/api/v1/profit/groups | Select-Object -First 5
# si AD_TRANS accesible y Windows Auth: 200 con 38 grupos
# si no configurado: 503 "Profit not configured" (correcto, no 404)
# antes de fix 7H daba 404 — tras restart debe dejar de dar 404

# Si da 503 aunque .env.local está bien → revisa que editaste apps/api/.env.local y no .env.example
```

También vía `sqlcmd` vs API: ambos deben ver mismos `co_lin`/`co_art`.

---

## 6. Qué NO tocar

- `apps/api/prisma/schema.prisma` y `DATABASE_URL` — no es Profit.
- `apps/api/src/modulos/profit/profit-adapter.service.ts` — ya es READ-ONLY, parametrizado `request.input(...)`, protección `PROFIT_WRITE_ENABLED=true + AD_DIST + production` bloquea escritura accidental. No agregues `INSERT/UPDATE`.
- `AD_DIST` nunca escribir hasta fase 10B autorizada.
- No crees `PROFIT_TEST`/`AD_TRANS` con `CREATE DATABASE`/`SELECT INTO` desde la app.
- No commitees `.env.local` con password (está en `.gitignore`).

---

## 7. Rollback literal

```ini
# apps/api/.env.local
PROFIT_DB_DATABASE=AD_DIST
PROFIT_ENV=production
PROFIT_WRITE_ENABLED=false
```
Luego repite **paso 4** (build + `.\scripts\api-restart.ps1`) y **paso 5**.

---

## 8. Mapa de archivos para no perderte

```
.env.example                  # placeholders comentados, no se usa en runtime
apps/api/.env                 # DATABASE_URL=file:../data/dev.db (Data-Maestra)
apps/api/.env.local           # <— AQUÍ cambias PROFIT_DB_DATABASE
apps/api/src/app.module.ts:22 # ConfigModule lee .env.local → .env
apps/api/src/modulos/profit/profit-adapter.service.ts:39 # getConfig() lee PROFIT_DB_*
apps/api/dist/modulos/profit/ # compila tras pnpm build
apps/api/api.log              # verifica Mapped /profit/*
scripts/api-restart.ps1       # script oficial de reinicio
```

> Tras cambiar `AD_DIST` → `AD_TRANS` y reiniciar, `GET /api/v1/profit/groups` debe dejar de ser 404. Si sigue 404, es que el proceso no se reinició o editaste el `.env` equivocado.
