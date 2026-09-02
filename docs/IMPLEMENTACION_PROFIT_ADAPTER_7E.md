# Implementación Profit Adapter 7E — READ-ONLY

## 1. Arquitectura

```
Data-Maestra (SQLite via Prisma) ──→ ProfitAdapter ──→ SQL Server AD_DIST (READ-ONLY)
     │                                              └─→ PROFIT_TEST (futuro, misma interfaz)
     └─→ Prisma (separado, sin modelos Profit)
```

`ProfitAdapter` está aislado en `apps/api/src/modulos/profit/profit-adapter.service.ts` detrás de `ProfitModule`. No toca controllers de workflow/solicitudes/frontend/Prisma.

## 2. Conexión

- Driver: `mssql@12.7` (tedious) con `ConnectionPool`, `Windows Auth` si no hay user/password.
- Lazy: `getPool()` solo en primer `query()`, no bloquea `NestFactory.create()`. App arranca aunque Profit caiga.
- Host verificado: `SRVBDPROFITBK / AD_DIST / dbo` → `sqlcmd -S SRVBDPROFITBK -d AD_DIST -E` OK (10.27.148.210).
- Pool: `max 5, idle 30s, connectTimeout 5000ms, requestTimeout 10000ms`.

## 3. Configuración

`.env.example` placeholders:

```
PROFIT_DB_SERVER=
PROFIT_DB_DATABASE=
PROFIT_DB_USER=
PROFIT_DB_PASSWORD=
PROFIT_ENV=test
PROFIT_WRITE_ENABLED=false
```

`PROFIT_ENV` distingue `test` vs `production` sin cambiar código. `ProfitModule` lee `ConfigService`, no hardcodea.

## 4. ProfitAdapter — Operaciones READ-ONLY

Ubicación: `apps/api/src/modulos/profit/profit-adapter.service.ts` + `profit.controller.ts` + `profit.module.ts`.

| Método | SQL (param) | Tabla |
|--------|-------------|-------|
| `getArticle(co_art)` | `SELECT TOP1 co_art,art_des,co_lin,co_subl,co_cat,co_color,uni_venta,stock_act FROM dbo.art WHERE LTRIM(RTRIM(co_art))=@co_art` | art |
| `getArticles(limit,search,co_lin)` | `SELECT TOP(@limit) ... WHERE art_des LIKE @search AND co_lin=@co_lin` | art |
| `getGroup(co_lin)` / `getGroups()` | `SELECT co_lin,lin_des FROM dbo.lin_art` | lin_art |
| `getSubgroup(co_lin,co_subl)` / `getSubgroups(co_lin)` | `SELECT co_lin,co_subl,subl_des FROM dbo.sub_lin` | sub_lin |
| `getUnit(co_uni)` / `getUnits()` | `SELECT co_uni,des_uni FROM dbo.unidades` | unidades |
| `getArticleWithDetails(co_art)` | combina 4 anteriores (Promise.all) | — |

Sin `create/update/delete`. Interfaz futura puede añadirse como `// TODO` sin implementar.

## 5. Consultas — DTO

`ProfitArticle {co_art, art_des, co_lin, co_subl, co_cat, co_color, uni_venta, stock_act}` — solo 8 de 142 columnas. `ProfitGroup/Subgroup/Unit` análogas.

## 6. Seguridad

- Parámetros: `request.input(name, type, value)` — nunca concatenación. Tests verifican `request.input(` presente.
- Secretos: nunca en Git/docs/logs; `.env.example` vacío.
- `PROFIT_WRITE_ENABLED=false` por defecto.

## 7. Timeouts

`connectTimeout:5000`, `requestTimeout:10000`, `pool.idleTimeoutMillis:30000`. Documentados en §2.

## 8. Errores

`ServiceUnavailableException` si no configurado, timeout, o query falla. No oculta error real, no inventa fallback. Logs: `Profit pool error / query failed` sin credenciales.

Si Profit cae, Data-Maestra sigue: adapter solo falla en endpoints `/profit/*`, no en bootstrap.

## 9. Test / Producción

Mismo código, distinta config:

```
TEST: PROFIT_DB_DATABASE=PROFIT_TEST, PROFIT_ENV=test, PROFIT_WRITE_ENABLED=false
PROD: PROFIT_DB_DATABASE=AD_DIST, PROFIT_ENV=production, PROFIT_WRITE_ENABLED=false
```

## 10. Protección contra escritura

```ts
assertReadOnly() { if (writeEnabled && database.toUpperCase()==='AD_DIST' && env==='production') throw }
```

Fase 7E nunca pone `PROFIT_WRITE_ENABLED=true`. Todo queda `false`.

## 11. Profit-Test

- **Existe:** NO (0 filas en `sys.databases` like `%TEST%`).
- **Requiere DBA:** backup/restore de AD_DIST o generate scripts schema-only para `dbo.art, lin_art, sub_lin, unidades, prov, colores` + PK/FK/índices/triggers/defaults + datos mínimos catálogos. Clasificación: NECESARIO tablas ant., RECOMENDADO índices/triggers, OPCIONAL resto 500 tablas.
- No se creó copia parcial (regla §8).

## 12. Campos pendientes

- **co_art:** candidato = `MasterCode` (RVHCAU-00001) vs Profit `co_art` char30; PENDIENTE validar regla generación Profit (no IDENTITY).
- **co_cat:** obligatorio (char6, FK cat_art) — DM no tiene catálogo; PENDIENTE crear `CatalogCategory` mapeo.
- **co_color:** obligatorio (char6) — DM no lo captura; PENDIENTE decidir si derivado o catálogo.
- **procedenci:** char6, NOT NULL, FK procedencias — DM no lo posee; PENDIENTE.

## 13. Próximos pasos

7F: crear `PROFIT_TEST`, probar `ProfitAdapter` contra él, añadir estados `PROFIT_PROCESSING/INSERTED/ERROR`, outbox idempotente por `request.id`, y checklist Master sin escritura.
