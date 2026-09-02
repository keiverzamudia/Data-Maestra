# Cierre 7E — Profit

## Estado

**COMPLETADA**

Verificación READ-ONLY del ProfitAdapter sin escritura en Profit ni cambios de workflow/frontend/Prisma.

## ProfitAdapter

- **Ubicación:** `apps/api/src/modulos/profit/profit-adapter.service.ts` (248 líneas) + `profit.controller.ts` + `profit.module.ts`, exportado vía `AppModule`
- **Estado:** COMPLETO — driver `mssql@12.7` (tedious), lazy import, Pool max 5 / idle 30s / connectTimeout 5000 / requestTimeout 10000
- **Operaciones READ (6):**
  - `getArticle(co_art)` — `SELECT TOP 1 ... WHERE LTRIM(RTRIM(co_art))=@co_art` — IMPLEMENTADO
  - `getArticles(limit,search,co_lin)` — `SELECT TOP(@limit) ... LIKE '%' + @search + '%'` parametrizado — IMPLEMENTADO
  - `getGroup(co_lin)` / `getGroups()` → `dbo.lin_art` — IMPLEMENTADO
  - `getSubgroup(co_lin,co_subl)` / `getSubgroups(co_lin)` → `dbo.sub_lin` — IMPLEMENTADO
  - `getUnit(co_uni)` / `getUnits()` → `dbo.unidades` — IMPLEMENTADO
  - `getArticleWithDetails(co_art)` — combina article+group+subgroup+unit vía `Promise.all` — IMPLEMENTADO
- **DTO:** `ProfitArticle` (8 de 142 cols de `dbo.art`), `ProfitGroup`, `ProfitSubgroup`, `ProfitUnit`

## Read-Only

**PASS**

Búsqueda en `apps/api/src/modulos/profit/*` de `INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|CREATE|TRUNCATE` → 0 resultados. Solo `SELECT`. No existe `prisma.$executeRaw/$queryRaw` en el módulo. `assertReadOnly()` invocado en cada `query()`.

## SQL parametrizado

**PASS**

Todas las consultas usan `request.input(name, type, value)` con `mssql.VarChar(30/6/120)` y `mssql.Int`. Única concatenación `art_des LIKE '%' + @search + '%'` es parámetro seguro, no valor JS. No existe `WHERE co_art = '${...}'`.

## Conexión

**PASS**

- Lazy: `getPool()` solo en primer `query()`, `ConnectionPool(config).connect()` async, `poolPromise` cache, `pool.on('error')` reset
- Config `encrypt:false trustServerCertificate:true connectTimeout:5000 requestTimeout:10000 pool max:5 min:0 idle:30000`
- Windows Auth si no hay user/password
- `ServiceUnavailableException` si no configurado o timeout (`ETIMEOUT/EREQUEST`)
- **API independiente de Profit: PASS** — Nest arranca aunque Profit caiga; solo `/profit/*` devuelve 503

## Configuración

Variables reales en `profit-adapter.service.ts#getConfig()` vía `ConfigService`:

- `PROFIT_DB_SERVER` — servidor (ej. `SRVBDPROFITBK`)
- `PROFIT_DB_DATABASE` — base (`AD_DIST` / futuro `PROFIT_TEST`)
- `PROFIT_DB_USER` / `PROFIT_DB_PASSWORD` — opcionales, Windows Auth si vacíos
- `PROFIT_ENV` — `test` | `production` (default `production`)
- `PROFIT_WRITE_ENABLED` — `=== 'true'` habilita escritura futura

`.env.example` las tiene comentadas sin secretos. Protección:

```ts
if (writeEnabled && database.toUpperCase()==='AD_DIST' && env==='production') throw 'PROTECTION blocked'
```

7E siempre `false`, nunca escribe.

## AD_DIST

**Existe — verificado READ-ONLY vía `sqlcmd -S SRVBDPROFITBK -E`**

- `SELECT name FROM sys.databases WHERE name='AD_DIST'` → `AD_DIST` OK
- `sys.tables art, lin_art, sub_lin, unidades` → 4/4 existen
- `SELECT TOP 2 co_art FROM dbo.art` → `02GEN01 PROTECTOR DE VOLTAJE`, `ACTCOA0001 ESCRITORIO` OK
- `SELECT COUNT(*) FROM dbo.lin_art` → 38

## AD_DIST_TEST

**No existe — requiere DBA**

- `SELECT name FROM sys.databases WHERE name IN ('AD_DIST_TEST','PROFIT_TEST')` → 0 filas
- `LIKE '%TEST%'` solo devuelve `MasterProfit`, `MasterProfitPro` (no son clon de AD_DIST)
- **Acción requerida:** DBA debe crear `PROFIT_TEST` vía backup/restore de `AD_DIST` o Generate Scripts schema-only (`dbo.art, lin_art, sub_lin, unidades, prov, colores` + PK/FK/índices/triggers/defaults + datos catálogos). No crear copia parcial desde app.

## Endpoints

**6 GET, 0 escritura — PASS**

`profit.controller.ts` `@UseGuards(RbacGuard)` + `@RequirePermission('DASHBOARD.VIEW')`:

- `GET /profit/groups`
- `GET /profit/subgroups?co_lin=`
- `GET /profit/units`
- `GET /profit/articles?limit=&search=&co_lin=`
- `GET /profit/articles/:code`
- `GET /profit/articles/:code/details`

`POST|PUT|PATCH|DELETE` → 0 en módulo Profit.

## Tests

**6/6 PASS** — `pnpm --filter @master-data/api test -- profit-adapter.spec.ts` (Vitest 2.1.9, 17ms):

- not configured → ServiceUnavailable
- null handling (`rows[0] ?? null`)
- parameterized (`request.input(` presente)
- no-write (SELECT sin INSERT/UPDATE/DELETE)
- protection (`PROFIT_WRITE_ENABLED` + `PROTECTION`)
- timeouts (`connectTimeout` + `requestTimeout`)

## Typecheck

**PASS** — `pnpm --filter @master-data/api typecheck` → `tsc --noEmit` sin errores.

## Health

**PASS** — `GET http://localhost:3001/api/v1/health` → `200 { status: "ok", uptime: 7357s }` (2026-09-02T20:35:15Z).

## Pendientes

- Crear `PROFIT_TEST` mediante DBA (backup/restore o schema-only + catálogos)
- Definir mapeos pendientes `co_cat` / `co_color` / `procedenci` (DM aún no los captura)
- Definir estrategia de escritura futura (`PROFIT_WRITE_ENABLED` + `PROFIT_ENV=test` + segunda confirmación prod + outbox idempotente por `request.id`)
- No implementar escritura todavía (requiere fase explícita 7F/8A)
- No implementar Master/Validación Maestra ni estados `PENDING_MASTER/FINAL_APPROVED/PROFIT_*` en esta fase

## Próximo paso

**7F** — tras `PROFIT_TEST` disponible: probar ProfitAdapter contra `PROFIT_TEST`, añadir estados `PROFIT_PROCESSING/INSERTED/ERROR` con outbox idempotente, implementar checklist Master solo-lectura. Sin escribir en `AD_DIST`.

---
*Verificación sin `INSERT/UPDATE/DELETE` sobre `AD_DIST`. Complementa `docs/IMPLEMENTACION_PROFIT_ADAPTER_7E.md` (implementación) — este documento certifica estado final verificado.*
