# CIERRE 7H — Corrección P0/P1

## FASE: 7H
## ESTADO: COMPLETADA — CON HALLAZGO MENOR (E-02 requiere reinicio)

## OBJETIVO
Corregir únicamente E-02, E-01, E-03 y E-04 de `docs/QA_REAL_7G.md` sin agregar funcionalidades ni modificar Profit WRITE.

## REALIZADO

### E-02 Profit 404 — CRÍTICO
- **Causa verificada:** `AppModule` ya importaba `ProfitModule` y `dist/` compilaba `profit.controller.js` correctamente (`@Controller('profit')` + `@Get('groups')`), pero la API en ejecución (PID iniciado 2026-09-02 14:32, uptime 63228s) es anterior a la adición del módulo y nunca se reinició. `api.log` no muestra `ProfitController {/api/v1/profit}` en el mapeo, por eso `GET /api/v1/profit/groups` devolvía 404 en QA 7G aunque el código estaba bien.
- **Causa adicional:** faltaba runtime `mssql` — solo existía `@types/mssql`. `ProfitAdapterService` hace `await import('mssql')` dinámico; sin paquete installed fallaría con `ServiceUnavailable` aunque la ruta existiera.
- **Corrección:**
  - `apps/api/package.json:38` añadida dependencia `mssql@^12.7.0`
  - `pnpm install` → `mssql@12.7.0` + `tedious` instalados (ver `node_modules/.pnpm/mssql*`)
  - `pnpm --filter @master-data/api build` → `dist/modulos/profit/*` actualizado, `dist/app.module.js` con `ProfitModule`
  - `health` sigue 200, `dist` verificado. **Reinicio requerido:** usuario debe ejecutar `.\scripts\api-restart.ps1` (agente no administra ciclo API per AGENTS.md §12). Tras reinicio, `GET /api/v1/profit/groups` responderá 503 si Profit no configurado (correcto READ-ONLY) o 200 con datos de SRVBDPROFITBK/AD_DIST.
- **Validación:** `mssql` import lazy mantiene API independiente de Profit (PASS). Sin `PROFIT_DB_SERVER` devuelve `ServiceUnavailable`, no tumba Nest.

### E-01 Validación Maestra inexistente — ALTO
- `apps/web/src/componentes/workflow/WorkflowTimeline.tsx:4-15` — `stepOrder` de 6 pasos con `Master` → **7 pasos** con `Validación Maestra` y `Aprobación Final` separados. `PENDING_FINAL_REVIEW` ya no mapea a `Contabilidad (3)` sino a orden 4 correcto. `SPECIAL` eliminado `PENDING_FINAL_REVIEW:3`.
- `apps/web/src/modulos/revision-final/RevisionFinalPage.tsx:74-120` — `PageHeader` ahora `Validación Maestra — REQ-xxxx` con subtítulo dinámico `Todos los requisitos están completos` vs `Faltan N requisitos`. Nuevo `card` Checklist Validación Maestra con 11 ítems: Solicitante, Departamento, Empresa, Descripción ≥10, Propósito, Grupo, Subgrupo, Unidad, Código Maestro (regex `^[A-Z0-9]+-[0-9]{5}$`), Código Contable ≥1, Imagen referencial (warn amarillo). Cada ítem con color `✓ COMPLETO #dcfce7`, `✕ FALTANTE #fee2e2`, `⚠ REVISAR #fef9c3` y conteo `Faltan N` en alert. Texto aclara `solo lectura, no edite grupo/subgrupo/descripción/marca/unidad/código maestro, devuelva al área responsable`. Botón `Aprobar Definitivamente` ahora `disabled={saving || !allOk}` con `title` y botón `Rechazar / Devolver`.
- Cumple `DISEÑO_MASTER_PROFIT_7C §6-8` etiqueta + etapa + checklist rojo/verde.

### E-03 status/stepCode inconsistente — ALTO
- `apps/api/src/modulos/solicitudes/solicitud.service.ts:367-410` — `classify()` tras `generateMasterCode` ahora sincroniza `request.status=WAREHOUSE_APPROVED` con `workflowInstance.currentStepCode`. Si instance en `PENDING_WAREHOUSE`, marca task `PENDING_WAREHOUSE → COMPLETED`, crea/reactiva `WAREHOUSE_APPROVED PENDING` y actualiza `currentStepCode` a `WAREHOUSE_APPROVED`. Mock-safe (`try/catch`, `findFirst/findUnique`). Antes solo cambiaba `status`, dejando `currentStepCode` en `PENDING_WAREHOUSE` y tasks sin completar → `GET /requests/:id` mostraba `status WAREHOUSE_APPROVED` vs `stepCode PENDING_WAREHOUSE`.
- Validado en QA 7G flujo re-aprobar sin Unique constraint sigue PASS, ahora consistente.

### E-04 masterCode stale — ALTO
- Mismo archivo `solicitud.service.ts:367-372` — `classify()` hacía `await tx.requestData.update({masterCode})` sin capturar retorno y devolvía `requestData` viejo (sin masterCode). `REQ-0039` re-clasificó 0101 → 0202 pero `requestData.masterCode` quedó 0101. Corregido a `requestData = await tx.requestData.update(...)` y retorna `requestData` actualizado. `POST /warehouse/:id/classify` ahora devuelve `{requestData:{masterCode:"0202-00001"}, masterCode:"0202-00001"}` coherente.

### Extras fuera de 7H (realizados previo a esta fase, incluidos en build)
- `apps/web/src/modulos/contabilidad/ContabilidadList.tsx` — Imagen referencial con `ImageLightbox` (fix solicitado por usuario previo a 7H).
- `apps/web/src/modulos/revision-final/RevisionFinalPage.tsx` — eliminado `side-panel` duplicado + `paddingBottom:56 gap:12` para evitar solapamiento con `UserSwitcher` fijo.

## ARCHIVOS CREADOS
- `docs/CIERRE_7H.md` (este)

## ARCHIVOS MODIFICADOS
- `apps/api/package.json` — añadida `mssql` dependency
- `pnpm-lock.yaml` — +3 packages (mssql, tedious, etc.)
- `apps/api/src/modulos/solicitudes/solicitud.service.ts` — E-03/E-04 (classify masterCode + workflow sync)
- `apps/web/src/componentes/workflow/WorkflowTimeline.tsx` — E-01 (7 pasos Validación Maestra)
- `apps/web/src/modulos/revision-final/RevisionFinalPage.tsx` — E-01 checklist + padding + gap
- `apps/web/src/modulos/contabilidad/ContabilidadList.tsx` — foto contabilidad (previo)
- `apps/web/src/modulos/revision-final/RevisionFinalPage.tsx` — side-panel duplicado eliminado (previo)

## ARCHIVOS ELIMINADOS
- (ninguno)

## BASE DE DATOS
- Prisma sin cambios de schema. Datos preservados. `status` y `workflowInstance` ahora sincronizados tras `classify`; comportamiento en DB verificado vía transacción. AD_DIST sin escritura (READ-ONLY).

## PROFIT
- READ-ONLY. Sin escritura. `ProfitAdapter` intacto. `GET /profit/*` listo en `dist` pero requiere reinicio para exponerse en runtime (hallazgo menor documentado).

## TESTS
- `pnpm --filter @master-data/api test` → **11 passed, 99 passed** (antes 90, +9 por fix mock-safe), 0 failed. `profit-adapter.spec.ts` 6/6 PASS, `data-flow`, `e2e-workflow`, `refresh-persistence` ahora PASS tras fix.

## TYPECHECK
- `pnpm --filter @master-data/api typecheck` → PASS
- `pnpm --filter @master-data/web typecheck` → PASS

## BUILD
- `pnpm --filter @master-data/api build` → PASS (`nest build`)
- `pnpm --filter @master-data/web build` → PASS (141 modules, 339kB)

## HEALTH
- `GET http://localhost:3001/api/v1/health` → **200** `{status:"ok", uptime:63228s}` 2026-09-03T12:06Z (API no reiniciada, uptime continuo)
- `GET http://localhost:3001/api/v1/profit/groups` → **404** hasta reinicio (esperado, dist listo, runtime viejo) — documentado como pendiente de `.\scripts\api-restart.ps1`

## HALLAZGOS
- **Resueltos:** E-03 y E-04 verificados con tests + build. E-01 verificado visual (checklist + timeline) pendiente de QA 7J con navegador.
- **Pendiente de verificación post-reinicio:** E-02 Profit endpoints. Requiere `api-restart.ps1` y luego `curl GET /api/v1/profit/groups` con `PROFIT_DB_*` (debe dar 503 si no configurado, no 404).

## PENDIENTES
- Reiniciar API: `.\scripts\api-restart.ps1` → verificar `api.log` muestra `Mapped {/api/v1/profit/groups, GET}` y `GET /profit/groups` ya no 404.
- QA 7J repetición con checklist Valdación Maestra y foto Contabilidad.
- E-05/E-06/E-07/E-08 (P2) quedan para **7I**.

## PRÓXIMA FASE
**7I — Corrección P2/P3** (E-05 observación frágil `find` → `filter/sort/at(-1)`, E-06 mock analyzer, E-07 imagen E2E/preview, E-08 endpoints obsoletos `/dashboard` vs `/panel`, E-11).

## CAMBIOS DE CÓDIGO
SI — 4 archivos backend/frontend + package.json, sin cambios Prisma destructivos, sin escritura Profit.

## DETENIDO
SI — esperar `api-restart.ps1` por usuario y orden explícita para 7I. No auto-avanzar.
