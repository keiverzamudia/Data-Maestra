# Implementación catálogo de cuentas Profit — Fase 8E.6

> Profit READ-ONLY. Sin agent-browser (requiere autorización del usuario).

## 1. Fuente anterior

`AD_DIST.dbo.xart_cont` (`UNION` de `cta1..cta8`/`nom_cta1..nom_cta8`,
`DISTINCT`): ~79 cuentas usadas por artículos. No era el catálogo maestro.

## 2. Problema

El selector mostraba aparentemente muy pocas cuentas: faltaban las ~410 del
plan nunca usadas por artículos.

## 3. Fuente nueva

`C_DIST.dbo.sccuenta` (ver `docs/INVESTIGACION_CATALOGO_CUENTAS_PROFIT_8E5.md`).

## 4. C_DIST

Base contable (`sc*`) de compañía única (`par_emp` 1 fila). Accesible con las
credenciales Profit configuradas (verificado `COUNT(*)=855` con ese usuario).

## 5. sccuenta

855 filas / 855 códigos distintos / 0 inactivas; `co_cue` (código),
`des_cue` (nombre), `detalle` (1 = imputable, 489), `inactivo` (estado),
`co_cuepadre` (jerarquía, 8 raíces).

## 6. Filtros

Por defecto `detalle = 1 AND inactivo = 0` (489 imputables activas).
Cabeceras (`detalle=0`) excluidas del selector.

## 7. Búsqueda

Server-side sobre `co_cue` y `des_cue`, parcial (`LIKE '%' + @search + '%'`
parametrizado), case-insensitive por collation existente (sin cambiarla).
Verificado en vivo: `1.1.04.03` → rama inventario; `Diferencia en cambio` →
`1.1.02.01.01.003`.

## 8. Paginación

`limit` (defecto 20, tope 100) + `offset` (`OFFSET @offset ROWS FETCH NEXT
@limit ROWS ONLY`), `ORDER BY co_cue` estable. Primer lote: 20 (no se cargan
489 al inicio). Respuesta compatible: array `[{code, description}]`
(`co_cue→code`, `des_cue→description`); `hasMore = longitud === límite`, sin
romper consumidores.

## 9. API

`GET /api/v1/profit/accounts?search=&limit=&offset=` → `ProfitController`
(clamps 1..100 / 0..10000) → `ProfitAdapter.getAccounts(limit, offset, search?)`
→ `C_DIST.dbo.sccuenta`. Solo GET.

## 10. Frontend

`InformacionContable` busca contra el servidor con debounce (300 ms) y carga
progresiva por scroll (`offset = resultados.length`); reintento ante error;
sin preload. `api-profit-service.getAccounts(search?, limit=20, offset=0)`.
Tabs c1..c10, vínculo código↔descripción, DIS automático y posiciones intactos.

## 11. Compatibilidad

c1..c10, serialización/deserialización, orden c1→c10, DIS automático, `c9`/`c10`
sin cambios (18 tests DIS intactos). Las entradas guardadas muestran su par
almacenado aunque el código ya no esté en el catálogo.

## 12. Cuentas históricas

`2.1.07.03.01.003`, `2.1.07.01.02.005`, `5.1.05.04.01.001`: usadas en
`xart_cont`, ausentes en `sccuenta` (hojas obsoletas). No se borran ni se
crean; las solicitudes existentes las visualizan desde sus filas guardadas;
las nuevas selecciones usan solo `detalle=1 AND inactivo=0`.

## 13. Tests

`profit-adapter.spec.ts` (fuente `sccuenta`, filtros, `OFFSET`, parametrización,
sin escritura) + `profit-accounts.controller.spec.ts` (delegación, defecto
20/0, tope 100, offset). Total API: 13 suites, **125 passed**. Typecheck API y
web PASS. Build API (`nest build`) y web (145 módulos) PASS.

## 14. Seguridad

Scan `modulos/profit`: 0 × INSERT/UPDATE/DELETE/MERGE/ALTER/DROP/CREATE/TRUNCATE
y 0 × `$executeRaw`/`$queryRaw`. Profit READ-ONLY; controller solo `@Get`.

## 15. Cambios

- Creados: este documento.
- Modificados: `profit-adapter.service.ts` (`getAccounts` → `sccuenta`),
  `profit.controller.ts` (`offset`, topes 20/100), `api-profit-service.ts`,
  `InformacionContable.tsx` (búsqueda server-side + scroll),
  `ContabilidadList.tsx` (sin preload), tests de adapter y controller,
  `MAPA_PROYECTO.md`, `IMPLEMENTACION_CONTABILIDAD_8E.md` (origen).
- Eliminados: ninguno (scripts temporales de diagnóstico eliminados tras uso).
- Nota: el endpoint en vivo requiere `.\scripts\api-restart.ps1` por el usuario
  (el agente no administra la API); el SQL nuevo se validó con el mismo
  driver/config vía script temporal SELECT-only, ya eliminado.
- Nota 8E.6.1: duplicados `Encountered two children with the same key`
  provenían solo del acumulador frontend (fuente y API verificadas sin
  duplicados); corregido con paginación por generación/offset en
  `InformacionContable.tsx` + `utilidades/account-pages.ts` (testeado).
  Ver `docs/CORRECCION_SELECTOR_CONTABLE_8E6_1.md`.
