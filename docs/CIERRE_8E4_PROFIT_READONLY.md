# Cierre 8E.4 — Profit READ-ONLY + Información Contable (recuperación 8E.4-R incluida)

> Sin escrituras en Profit. Sin secretos en este documento.

## 1. Objetivo

Activar y validar la lectura real Data-Maestra → Profit con usuario SQL de solo
lectura, y validar la UI de Información Contable (c1..c10, DIS automático).

## 2. Estado previo encontrado (8E.4-R FASE 0)

- 8E.4 quedó interrumpida en `agent-browser open` (Chrome no instalado). Todo lo
  anterior estaba ejecutado: inspección, validación de config, pruebas Node
  directas (SUSER/DB/COUNT/TOP5/xart_cont), endpoints live 200, grep READ-ONLY.
- Scripts temporales ya eliminados (`tmp-check-8e4.js`, `tmp-check-codes.js`).
- `docs/CIERRE_8E4_PROFIT_READONLY.md` no existía. Creado en esta recuperación.
- Servicios levantados manualmente por el usuario (API 3001, front 5173).

## 3. Qué ya estaba ejecutado

Inspección adapter/controller/module/env, pruebas SELECT vía sqlcmd y Node con
las credenciales de `.env.local`, `GET /profit/accounts` y `/profit/categories`
200 en vivo, verificación READ-ONLY estática, validaciones parciales.

## 4. Qué estaba pendiente

Validación UI en navegador (FASE 8-11), tests/typecheck/build finales, health
final y este documento.

## 5. Conexión SQL Server

`SRVBDPROFITBK`, Windows Auth vía `sqlcmd -E` OK; tedious/Node requiere
autenticación SQL (ver `docs/DIAGNOSTICO_WINDOWS_AUTH_PROFIT_8E3.md`).

## 6. Usuario de lectura utilizado

**Discrepancia documentada:** la consigna suponía `dm_reader`/`AD_TRANS`, pero
`apps/api/.env.local` contiene `PROFIT_DB_USER=solicitudweb`,
`PROFIT_DB_DATABASE=AD_DIST` (password `[CONFIGURADA]`,
`PROFIT_WRITE_ENABLED=false`). No se modificaron credenciales; se validó la
realidad. Evidencia Node directa: `SUSER_SNAME() = solicitudweb`.

## 7. Base AD_TRANS

No es la base configurada. La configurada y validada es **AD_DIST**
(`DB_NAME() = AD_DIST`). La investigación 8D/8D.1 fue sobre AD_TRANS; AD_DIST
tiene la misma estructura (`xart_cont` con `cta1..cta8`, 1335 filas).

## 8. COUNT dbo.art

- AD_DIST (configurada): **1347** artículos, 1335 filas en `xart_cont`.
- AD_TRANS (referencia 8D): 11192 (verificado por el usuario vía sqlcmd).

## 9. xart_cont

Existe en AD_DIST con columnas `cta1..cta8` / `nom_cta1..nom_cta8`. La cuenta
conocida `1.1.02.01.01.003` vive en `cta2` (5 usos en AD_DIST).

## 10. ProfitAdapter

Lazy (`getPool`), usuario desde `ConfigService`, consultas parametrizadas
(`request.input`), paginado `OFFSET/FETCH`, solo SELECT. Sin cambios en 8E.4-R.

## 11. /profit/accounts

- `GET /profit/accounts?limit=10` → 200 (proceso con dist 8E, rutas mapeadas).
- `?limit=500&search=1.1.02.01.01.003` → 200 `[{code, description}]` exacto.
- `?limit=500&search=Diferencia%20en%20cambio` → 200 mismo registro.
- Respuesta cruda verificada: array JSON `[{code, description}]`.
- Sin mocks: datos de `AD_DIST.dbo.xart_cont` vía `UNION cta1..cta8`.

## 12. /profit/categories

`GET /profit/categories` → 200, 7 categorías reales (`002 ARTICULOS DE OFICINA`…).

## 13. DIS

`dis.utils.ts` (backend) y `utilidades/dis.ts` (espejo frontend) sin cambios;
18 tests PASS. Comportamiento validado en UI: c1, c7, c9, c10, no consecutivas,
orden c1→c10 independiente del orden de selección, sin espacios, wrapper
`<DIS>`, `c11` rechazado (tests), `q{C9}` desde catálogo disponible (no de
`cta9`), `<DIS></DIS>` ↔ vacío. Sin botón Copy ni edición manual.

## 14. UI Accounting (Edge + agent-browser)

- Navegador: Microsoft Edge (`--executable-path …\msedge.exe`), sin instalar nada.
- `GET /accounting` como Ana López (Contabilidad): lista 4 pendientes
  (REQ-0007/0011/0014/0041). Hallazgo menor: al cambiar de usuario sin recargar,
  `accounting/pending` devolvió 403 (sesión anterior) y la lista quedó en
  "Cargando..." (promise rechazada sin `catch`); tras recargar, 200 y tabla OK.
- REQ-0041 "prueba de informacion contable": sección **Información Contable**
  con tabs 01..10, `Carpeta 01`, buscador por código y por nombre, Código y
  Descripción vinculados, `Quitar cuenta`, `Formato contable para Profit` con
  DIS automático, sin Copy, sin textarea DIS, imagen referencial con preview.
- Prueba concreta: c1=`1.1.02.01.01.003`, c7=`1.1.04.01.01.001` (búsqueda por
  nombre "Mercanc"), c9=`1.1.04.03.01.002`, c10=`1.2.05.02.10.001` →
  `<DIS>{c1:…}{c7:…}{c9:…}{c10:…}</DIS>`. Quitar c1 → `<DIS>{c7:…}{c9:…}</DIS>`
  (sin `{c1:}`). Orden verificado seleccionando c9 después de c10 →
  `<DIS>{c9:…}{c10:…}</DIS>`.
- Aprobación como Contabilidad → `PENDING_FINAL_REVIEW`; en SQLite local
  (`dev.db`, Data-Maestra) quedaron 4 filas con `position` c1/c7/c9/c10 y pares
  código↔descripción correctos. Nada se escribió en Profit.
- Evidencia: screenshot `8e4-informacion-contable.png` (temp del agente).

## 15. Edge / agent-browser

`open`, `snapshot`, `click`, `fill`, `screenshot`, `console`, `network requests`
funcionaron con `--executable-path` a Edge. Red: `profit/accounts?limit=500`
→ 200 (×2), `profit/categories` → 200, `accounting/pending` → 403 solo con
sesión stale (ver §14), `auth/session?userId=u4` → 200.

## 16. Seguridad READ-ONLY

Grep en `modulos/profit/*.ts`: 0 coincidencias de
INSERT/UPDATE/DELETE/MERGE/ALTER/DROP/CREATE/TRUNCATE/`$executeRaw`/`$queryRaw`;
controller solo `@Get`. Resultado: **0 operaciones de escritura**.

## 17. Tests

`pnpm --filter @master-data/api test` → 13 suites, **124 passed**
(18 DIS + 12 accounting + 7 profit-adapter + 3 profit-accounts controller).

## 18. Typecheck

API `tsc --noEmit` PASS; web `tsc --noEmit` PASS.

## 19. Build

Web `tsc -b && vite build` PASS (145 módulos). API `nest build` PASS (8E).

## 20. Health

`GET /api/v1/health` → 200 (una vez, al final). API/front administrados por el
usuario; el agente no inició ni reinició procesos en 8E.4-R.

## 21. Problemas encontrados

1. Consigna suponía `dm_reader`/`AD_TRANS`/11192; realidad: `solicitudweb`/
   `AD_DIST`/1347. Resuelto documentando la realidad sin cambiar credenciales.
2. `ConvertTo-Json` en PowerShell mostró `{value,Count}` para un array; el JSON
   crudo es `[{code,description}]`. Solo artefacto de shell.
3. Lista en "Cargando..." tras cambio de usuario sin recarga (403 stale + falta
   de `catch`). Menor, fuera de 8E.4 (no modificado).
4. `xart_cont` puede traer el mismo código con distinta descripción
   (ej. `1.1.04.03.01.004` → dos nombres): calidad de datos Profit, visible tal
   cual en el selector. Documentado, no maquillado.

## 22. Problemas pendientes

- Alvalidar contra `AD_TRANS`/`dm_reader` si el DBA lo define como entorno
  oficial (hoy todo apunta a `AD_DIST`/`solicitudweb`).
- `catch` en carga de pendientes (hallazgo 3) para 8F si se desea.

## 23. Cambios realizados

- **Creados:** `docs/CIERRE_8E4_PROFIT_READONLY.md`. (Todo el código 8E/8E.1 ya
  existía; en 8E.4-R no se creó código.)
- **Modificados:** ninguno.
- **Eliminados:** ninguno (temporales ya eliminados en 8E.4).

## 24. Cambios NO realizados

Escritura Profit, usuarios/permisos SQL, Prisma/schema, workflow, Validación
Maestra, PENDING_MASTER/FINAL_APPROVED/PROFIT_*, outbox, imagen, centros de
costo, mocks, RBAC, reinstalls.

## 25. Conclusión

8E.4 puede considerarse **cerrada**: lectura real Node→Profit con SQL Auth
probada (SELECT), endpoints 200 con datos reales, UI validada en Edge de punta
a punta incluyendo c9/c10, eliminación, orden y persistencia con posición en
Data-Maestra, 0 escrituras en Profit, tests/typecheck/build/health en verde.
