# QA Real End-to-End — Fase 7G

> Observación sin corrección. Profit READ-ONLY. 2026-09-02.

## 1. Objetivo

Determinar si un usuario puede completar el flujo completo de una solicitud y detectar problemas reales de UI, navegación, datos, permisos, estados o integración frontend/backend.

Flujo probado: `DRAFT → PENDING_MANAGER → PENDING_WAREHOUSE → WAREHOUSE_APPROVED → PENDING_ACCOUNTING → (RETURN → PENDING_WAREHOUSE → re-clasify → re-approve) → PENDING_ACCOUNTING → PENDING_FINAL_REVIEW → APPROVED`. Incluye prueba obligatoria de rechazo de Contabilidad a Almacén, verificación de Unique constraint, historial, imagen, panel, permisos y navegación. No se modificó lógica de negocio durante la primera ejecución.

## 2. Entorno utilizado

| Componente | Valor |
|---|---|
| API | `http://localhost:3001/api/v1` — Health `200 {status:"ok", uptime:18955s}` (NestJS) |
| Frontend | `http://localhost:5173/` — Vite 200, React + React Router, TanStack Query |
| DB | SQLite `apps/api/data/dev.db` vía Prisma, 39 requests totales al 7G |
| Profit | SRVBDPROFITBK/AD_DIST READ-ONLY, ProfitAdapter lazy, no escritura |
| Usuarios probados | u1 Juan Pérez REQUESTER (Compras), u2 María García DEPARTMENT_MANAGER, u3 Carlos Rodríguez WAREHOUSE, u4 Ana López ACCOUNTING, u5 Luis Martínez FINAL_REVIEWER |
| Navegador real | `agent-browser` instalado pero `open http://localhost:5173/` timeout 120s — **BLOCKED** (ver §8). QA ejecutado vía API (`fetch`/`curl`) + inspección directa de código frontend/backend |
| Sistema | Windows win32, Node v24.18.0, pnpm workspaces |
| Fecha | 2026-09-02 23:47 VET |
| Solicitud QA | `REQ-0039` `15cce5ad-4adc-466d-a297-3c02812462d2` — `TORNILLO M8x30 ACERO INOX TEST 7G` |

Rutas frontend inspeccionadas: `/`, `/requester`, `/requester/new`, `/requester/:id`, `/warehouse`, `/warehouse/:id`, `/approvals`, `/accounting`, `/final-review`, `/imports`, `/audit`, `/admin` (ver `apps/web/src/app/App.tsx:22-54`). Navegación filtrada por `hasPermission` en `AppLayout.tsx:35`.

## 3. Flujo probado

```
u1 (REQUESTER)  POST /requests {requestedDescription, purpose, priority} → 201 DRAFT
                POST /requests/:id/submit → 200 PENDING_MANAGER

u2 (MANAGER)    POST /requests/:id/approve {APPROVE} → 200 PENDING_WAREHOUSE

u3 (WAREHOUSE)  POST /requests/:id/classify {groupId, subgroupId, unitId, model, partNumber, application} → 201 WAREHOUSE_APPROVED (masterCode 0101-00001)
                POST /warehouse/:id/approve → 200 PENDING_ACCOUNTING

u4 (ACCOUNTING) POST /accounting/:id/reject {} → 400 (motivo obligatorio)
                POST /accounting/:id/reject {comment:"Falta codigo contable 7G - devolver a almacen"} → 200 PENDING_WAREHOUSE
                Verificado: GET /warehouse/:id muestra approvals[RETURN] con comment, GET /requests/:id/history conserva RETURN

u3 (WAREHOUSE)  POST /warehouse/:id/classify {group 02/SERVICIO sub 02/FLETE ... PN-7G-002} → 201 (masterCode 0202-00001)
                POST /warehouse/:id/approve → 200 PENDING_ACCOUNTING (sin Unique constraint — PASS crítico)

u4 (ACCOUNTING) POST /accounting/:id/approve {accountingCodes:[{code:"1-001"}]} → 200 PENDING_FINAL_REVIEW

u5 (FINAL)      GET /final-review/pending → contiene REQ-0039
                GET /final-review/:id → 200 con accountingCodes
                POST /final-review/:id/approve → 200 APPROVED

Verificado: GET /requests/:id → status APPROVED currentStepCode APPROVED, history 7 entries completas, dashboard stats coherentes (pending 5, inApproval 8, completed 16, total 39).
```

## 4. Casos ejecutados

| # | Caso | Usuario | Endpoint / Pantalla | Resultado |
|---|---|---|---|---|
| 1 | Crear solicitud | u1 | `POST /requests` + `POST /submit` | **PASS** — 201 DRAFT → 200 PENDING_MANAGER. Campos derivados de sesión (companyId/departmentId no se envían, correcto). `GET /requests/:id` devuelve company/department/requester + workflowInstance PENDING_MANAGER. |
| 2 | Gerente aprueba | u2 | `POST /requests/:id/approve` | **PASS** — 200 PENDING_WAREHOUSE, task PENDING_MANAGER → COMPLETED, nueva task PENDING_WAREHOUSE. AlmacenList pendiente correcto. |
| 3 | Almacén clasifica | u3 | `POST /requests/:id/classify` (vía `/requests` alias) | **PASS** — 201 con `requestData` + `masterCode 0101-00001`. Pero `status=WAREHOUSE_APPROVED` con `currentStepCode=PENDING_WAREHOUSE` inconsistente (ver E-03). `GET /requests/:id` no expone `requestData` en root (solo vía classify response). |
| 4 | Almacén aprueba vía `/requests/:id/approve` | u3 | `POST /requests/:id/approve` | **PASS (negativo)** — 403 `MANAGER.APPROVE` requerido, correcto. Ruta correcta es `POST /warehouse/:id/approve`. |
| 5 | Almacén aprueba vía `/warehouse/:id/approve` | u3 | `POST /warehouse/:id/approve` | **PASS** — 200 PENDING_ACCOUNTING, nueva task PENDING_ACCOUNTING, history APPROVE. |
| 6 | Contabilidad rechaza sin comentario | u4 | `POST /accounting/:id/reject` {} | **PASS** — 400 `El motivo del rechazo es obligatorio`, correcto. |
| 7 | Contabilidad rechaza con comentario | u4 | `POST /accounting/:id/reject` {comment} | **PASS** — 200 PENDING_WAREHOUSE, task PENDING_ACCOUNTING → COMPLETED, PENDING_WAREHOUSE reactivado (PENDING, completedAt null). No Unique constraint. `GET /requests/:id/history` conserva RETURN con actor u4 y comment. `GET /warehouse/:id` expone `approvals[RETURN]` (ver E-05 sobre orden). |
| 8 | Almacén re-clasifica tras rechazo | u3 | `POST /warehouse/:id/classify` | **PASS** — 201 con group 02 SERVICIO, masterCode cambia 0101-00001 → 0202-00001, pero `requestData.masterCode` sigue `0101-00001` (stale, ver E-04). Guardado persiste. |
| 9 | Almacén re-aprueba tras rechazo | u3 | `POST /warehouse/:id/approve` | **PASS CRÍTICO** — 200 PENDING_ACCOUNTING sin `Unique constraint failed (instance_id, step_code)`. Reactivación correcta de task PENDING_ACCOUNTING (reopened PENDING, no duplicada). |
| 10 | Contabilidad aprueba con códigos | u4 | `POST /accounting/:id/approve` {codes} | **PASS** — 200 PENDING_FINAL_REVIEW, accountingCodes persistidos. |
| 11 | Validación Maestra / Aprobación Final | u5 | `GET /final-review/pending` + `GET /final-review/:id` + `POST /final-review/:id/approve` | **PASS workflow** — 200 APPROVED, task APPROVED creada. **FAIL UI** — no existe etapa “Validación Maestra” (ver E-01). |
| 12 | Imagen referencial | — | `POST /requests/:id/photo` (multer), `ReferencePhotoUri`, `ImageLightbox` | **PARCIAL** — Backend `ALLOWED_MIMES image/jpeg/png/webp 10MB` + `FileInterceptor dest uploads/requests` OK. Frontend `SolicitudCreate.tsx` preview/compress/drag/paste/validate correcto. `RequestDetail.tsx:61-77` y `AlmacenClassify.tsx:142-153` muestran `src=/api/v1/uploads/{uri}` con lightbox. No probado con upload real en 7G (referencePhotoUri null en REQ-0039). E-07. |
| 13 | Panel / Dashboard | u1/u5 | `GET /panel/stats`, `GET /panel/activity` | **PASS API** — stats `pending 5 inApproval 8 completed 16 total 39` coherentes con QA, activity lista REQ-0039 primero. **FAIL** — endpoints `/dashboard/stats` y `/dashboard/recent` 404 (documentación desactualizada). `PanelPage.tsx` usa `apiPanelService.getStats/getActivity` correctamente, KPIs y barras renderizan. |
| 14 | Navegación | todos | `/`, `/requester`, `/warehouse`, `/accounting`, `/final-review`, `/imports`, `/audit`, `/admin`, `/approvals` | **PASS API** — todos responden 200/403 según permiso. **BLOCKED UI** — agent-browser timeout impidió snapshot real. |
| 15 | Permisos RBAC | u1,u3 | `GET /warehouse/pending` como u1 → 403, `GET /accounting/pending` como u3 → 403, `POST /requests/:id/approve` como u1 → 403 | **PASS** — WAREHOUSE.VIEW / ACCOUNTING.VIEW / MANAGER.APPROVE enforced. |
| 16 | Profit READ-ONLY | — | `GET /profit/groups`, `GET /profit/articles` | **FAIL** — 404 `Cannot GET /api/v1/profit/groups` (ver E-02 CRÍTICO). ProfitModule registrado en AppModule pero ruta no expuesta (build desactualizado o prefix). |

## 5. Resultado por caso

- Ejecutados: 16 (10 flujo + 6 transversales)
- PASS: 10
- PASS (negativo, esperado): 2 (casos 4,6)
- PARCIAL: 1 (caso 12 imagen no probada E2E)
- FAIL: 2 (caso 11 UI Validación Maestra, caso 16 Profit 404)
- BLOCKED: 1 (navegación browser real E-09) + responsive E-10 BLOCKED

## 6. Errores encontrados

### CRÍTICO

**E-02 — Profit endpoints 404**
- Pantalla: todas (`/profit/groups`, `/profit/articles`)
- Usuario: cualquiera con DASHBOARD.VIEW (u1 probado)
- Pasos: `GET /api/v1/profit/groups` → 404, `GET /api/v1/profit/articles?limit=2` → 404 (verificado con `fetch` directo y `curl`). `ProfitController @Controller('profit')` + `@Get('groups')` existe en código, `ProfitModule` importado en `app.module.ts:17,40`. Swagger también 404.
- Esperado: 200 con `ProfitGroup[]` READ-ONLY (SRVBDPROFITBK/AD_DIST 38 grupos)
- Obtenido: `{"message":"Cannot GET /api/v1/profit/groups","statusCode":404}`
- Endpoint: `GET /api/v1/profit/groups`
- Archivo: `apps/api/src/modulos/profit/profit.controller.ts:8`, `app.module.ts:17`
- Hipótesis: `dist` desactualizado (no rebuild tras añadir ProfitModule) o `API_PREFIX` duplicado. Health `GET /api/v1/health` sí responde, por lo que prefijo global es `api/v1` pero Profit no registrado en runtime. Requiere `pnpm --filter @master-data/api build` + `scripts/api-restart.ps1` y re-verificar.
- Severidad: **CRÍTICO** — Fase 7E certificó ProfitAdapter COMPLETO pero runtime no lo expone.

### ALTO

**E-01 — “Validación Maestra” no existe como etapa UI**
- Pantalla: `WorkflowTimeline`, `FinalReviewPage`, navegación
- Pasos: Abrir `/final-review` → título “Aprobación Final”, `WorkflowTimeline` muestra `Solicitud → Gerente → Almacén → Contabilidad → Aprobado → Master` (ver `WorkflowTimeline.tsx:4-11`). No hay ruta `/master-validation`, no hay checklist Validación Maestra, no hay etiqueta “Validación Maestra”.
- Esperado (§9 del prompt + `AGENTS.md §7` + `DISEÑO_MASTER_PROFIT_7C §6-8`): Timeline `Validación Maestra` entre Contabilidad y Aprobación Final, pantalla solo-lectura con checklist verde/rojo (empresa, área, descripción ≥10, grupo, subgrupo, unidad, masterCode, código contable ≥1, imagen, aprobaciones previas, datos Profit), sin editar grupo/subgrupo/marca/unidad/código maestro, con botones “Devolver a Almacén / Devolver a Contabilidad” con comentario obligatorio.
- Obtenido: `stepOrder` solo 6 pasos terminando en `MASTER_ACTIVE` “Master”, `getStepIndex` mapea `PENDING_FINAL_REVIEW` a 3 (Contabilidad). `FinalReviewPage` (`RevisionFinalPage.tsx:14`) permite rechazar/aprobar pero sin checklist, sin distinción Master vs Final.
- Archivo: `apps/web/src/componentes/workflow/WorkflowTimeline.tsx:4-11`, `apps/web/src/modulos/revision-final/RevisionFinalPage.tsx`
- Severidad: **ALTO** — incumple §7 diagramado como DRAFT→…→APPROVED→MASTER_ACTIVE sin etapa intermedia, pero Fase 7C diseñó PENDING_MASTER.

**E-03 — Inconsistencia status vs currentStepCode tras classify**
- Pantalla: `GET /requests/:id` después de `POST /requests/:id/classify`
- Pasos: Clasificar → response `{status:"WAREHOUSE_APPROVED", ...}` pero `workflowInstance.currentStepCode:"PENDING_WAREHOUSE"` y `tasks: PENDING_WAREHOUSE PENDING`. Antes de classify status era `PENDING_WAREHOUSE`.
- Esperado: `WARDHOUSE_APPROVED` debería reflejarse en `currentStepCode` o viceversa (consistencia). Código `solicitud.service.ts` `classify` probablemente cambia status sin crear/completar task.
- Archivo: `apps/api/src/modulos/solicitudes/solicitud.service.ts:320 classify`
- Severidad: **ALTO** — UI timeline y bandejas filtran por status/stepCode, desincronía puede dejar solicitudes invisibles.

**E-04 — masterCode stale en re-clasificación**
- Pasos: Tras RETURN, re-clasificar con grupo 02 → response `{"masterCode":"0202-00001", "requestData":{"masterCode":"0101-00001"}}` (nuevo código en root, viejo en requestData).
- Esperado: ambos coinciden con el nuevo masterCode.
- Archivo: `apps/api/src/modulos/solicitudes/solicitud.service.ts` + `AlmacenService`
- Severidad: **ALTO** — riesgo de persistir código maestro obsoleto en DB.

### MEDIO

**E-05 — Observación de Contabilidad expuesta pero con orden frágil**
- Pantalla: `AlmacenClassify.tsx:114-131` filtra `approvals.find(a=>RETURN||REJECT)` (primer match, no último). Si hay múltiples RETURN, muestra el más antiguo, no el vigente. API sí devuelve orden cronológico pero frontend no usa `sort` ni `last`.
- Severidad: **MEDIO**

**E-06 — analyzerProposals import directo de mock**
- Pantalla: `AlmacenClassify.tsx:6` `import { analyzerProposals } from '../../mock/source-items'`
- Esperado: `useCatalogos` / `api-catalogo-service` (Phase 6D migró a API, pero classify aún importa mock directo sin fallback).
- Documentado en `MANUAL_DESARROLLADOR.md §11` como limitación conocida #8, pero sigue presente.
- Severidad: **MEDIO** — no afecta QA actual pero bloquea integración real Profit.

**E-07 — Imagen referencial no probada E2E**
- `POST /requests/:id/photo` con FormData no ejercitado (REQ-0039 tiene `referencePhotoUri:null`). Código soporta `multipart/form-data` 10MB, pero no se verificó preview en Warehouse/Contabilidad/Final tras upload real. Si no existe imagen, `RequestDetail` no renderiza card (correcto), pero no hay placeholder.
- Severidad: **MEDIO**

**E-08 — Endpoints obsoletos 404 no documentados**
- `GET /api/v1/dashboard/stats` y `/dashboard/recent` 404, `GET /api/v1/imports/runs` 404, `GET /api/v1/notifications` 404 (reales son `/panel/stats`, `/panel/activity`, `/importaciones`, `/notificaciones`). Frontend usa correctos vía `apiPanelService`, pero documentación/tests pueden referenciar viejos.
- Severidad: **MEDIO**

### BAJO

**E-09 — agent-browser timeout — navegación real BLOQUEADA**
- `npx agent-browser open http://localhost:5173/` timeout 120s repetido, `snapshot -i` igual, `session list` = No active sessions. `fetch http://localhost:5173/` sí 200. Causa probable: Chromium no instalado o `agent-browser install` pendiente, o proxy/CDP bloqueo en Windows.
- Evidencia: browser no disponible, QA UI fallback a inspección de código + API.
- Severidad: **BAJO** (entorno, no app)

**E-10 — Responsive no verificado**
- No se probó viewport reducido (desktop + móvil) por E-09. No hay evidencia de breakpoints en `AppLayout.tsx`/`globals.css` revisados brevemente.
- Severidad: **BAJO**

**E-11 — Profit SECRET no en .env.example validation**
- No verificado en esta fase, pero 7E dejó `PROFIT_DB_*` comentadas sin validación de fuga. No es bug funcional.
- Severidad: **BAJO**

## 7. Severidad

| Severidad | Cantidad | IDs |
|---|---|---|
| CRÍTICO | 1 | E-02 |
| ALTO | 3 | E-01, E-03, E-04 |
| MEDIO | 4 | E-05, E-06, E-07, E-08 |
| BAJO | 3 | E-09, E-10, E-11 |
| **Total** | **11** |  |

## 8. Evidencia disponible

- API: `curl` logs completos de REQ-0039 transiciones (DRAFT → APPROVED) con status/history/tasks JSON, capturados en logs de esta fase (ver §3). `GET /panel/stats → pending 5 inApproval 8 completed 16 total 39`, `GET /panel/activity` con REQ-0039 primero.
- DB: `SELECT COUNT lin_art 38`, `SELECT TOP 2 art` ok (no escritura AD_DIST).
- Logs: `apps/api/api.log` debe contener `Profit pool` solo si se accede a /profit (404 por eso no aparece).
- Browser: sin snapshot/screenshot por E-09; evidencia es API JSON + código fuente citado (`RequestDetail.tsx:61-77`, `AlmacenClassify.tsx:142-153`, `WorkflowTimeline.tsx:4-11`, `SolicitudCreate.tsx` preview 300px, `RevisionFinalPage.tsx` sin checklist).
- Prueba obligatoria contabilidad §8: 10/10 pasos verificados (§8.1-8.11) — comentario obligatorio 400, observación en Almacén, re-clasify, re-approve sin Unique constraint, historial conserva RETURN con `comment:"Falta codigo contable 7G - devolver a almacen"` y `actor:a.lopez`.
- Sin escritura Profit: `SELECT` solo sobre AD_DIST (`sys.databases`, `sys.tables`, `lin_art`), ningún `INSERT/UPDATE/DELETE`.

## 9. Pruebas automatizadas faltantes

Candidatas para `create-agent-tests` (estados PASS/FAIL/BLOCKED/ABORTED, evidencia browser/API/DB/logs):

| Prioridad | Test | Actores | Precondiciones | Pasos | Evidencia |
|---|---|---|---|---|---|
| **P0** | `workflow-completo` DRAFT→APPROVED | u1-u5 | DB vacía c1 | create→submit→manager approve→classify→warehouse approve→accounting approve→final approve | `GET /requests/:id` status APPROVED + `history` 6 entries |
| **P0** | `contabilidad-return-almacen` (obligatoria §8) | u3,u4 | REQ en PENDING_ACCOUNTING | reject sin comment 400 → reject con comment → PENDING_WAREHOUSE → warehouse ve observación → re-classify → re-approve sin Unique constraint → PENDING_ACCOUNTING | `GET /warehouse/:id` approvals[RETURN].comment + DB `workflow_tasks` no duplicada |
| **P0** | `almacen-persistencia` | u3 | REQ PENDING_WAREHOUSE | saveClassification → GET /requests/:id verifica groupId/unitId/masterCode | API + DB `request_data` |
| **P1** | `validacion-maestra-checklist` (cuando exista) | u5 | REQ PENDING_FINAL_REVIEW completo/incompleto | GET /final-review/:id → checklist rojo/verde, aprobar bloqueado si incompleto | snapshot + API |
| **P1** | `aprobacion-final-ultima-humana` | u5 | REQ PENDING_FINAL_REVIEW | approve → APPROVED, no PROFIT_* aún | `status APPROVED` + `currentStepCode APPROVED` |
| **P1** | `imagen-referencial-e2e` | u1,u3,u4,u5 | — | create con FormData photo → GET /uploads/requests/{uuid} 200 → visible en RequestDetail/AlmacenClassify/Contabilidad/Final con lightbox | `GET /uploads/...` 200 + snapshot img src |
| **P1** | `rbac-permisos` | u1-u5 | — | u1 GET /warehouse/pending 403, u3 GET /accounting/pending 403, u1 POST approve 403 | API 403 |
| **P2** | `panel-coherencia` | u1 | REQ-0039 APPROVED | GET /panel/stats total 39 completed 16, GET /panel/activity primero REQ-0039 | API JSON |
| **P2** | `profit-read-only` | u1 | Profit AD_DIST | GET /profit/groups 200, POST /profit/groups 405, no INSERT | API + sqlcmd SELECT only |
| **P2** | `responsive-viewport` | — | — | 1280px vs 375px: tablas, modales, botones visibles | agent-browser screenshot |

Actualmente no hay tests frontend (`apps/web` sin tests, `passWithNoTests`). `apps/api/test` cubre `profit-adapter.spec.ts` (6) + workflow UNIT, pero no hay test E2E de `RETURN→re-approve`.

## 10. Recomendaciones para 7H

**7H debe CORREGIR antes de 7C/8A, sin nueva funcionalidad:**

1. **E-02 P0:** Rebuild API (`pnpm --filter @master-data/api build`) + `scripts/api-restart.ps1` + verificar `GET /api/v1/profit/groups 200` y `GET /api/v1/docs` (Swagger). Si sigue 404, revisar `app.module.ts` import order o `main.ts` prefix. Bloquea validación Profit.
2. **E-01 P0:** Implementar “Validación Maestra” como etapa UI distinta: nueva ruta `/master-validation` (reusa `FINAL_REVIEWER` sin nuevo rol), checklist §9 con rojo/verde, Timeline con 7 pasos `Solicitud→Gerente→Almacén→Contabilidad→Validación Maestra→Aprobación Final→Profit`, sin edición. Actualizar `WorkflowTimeline.tsx:stepOrder` y `docs/DISEÑO_MASTER_PROFIT_7C`.
3. **E-03 P1:** Unificar `status` y `currentStepCode` en `classify` (o documentar que WAREHOUSE_APPROVED es status interno colapsado). Revisar `solicitud.service.ts:320`.
4. **E-04 P1:** Corregir re-clasificación para actualizar `request_data.master_code` atómicamente con el nuevo masterCode.
5. **E-05 P1:** Cambiar `approvals.find` a `approvals.filter(...).sort(...).at(-1)` en `AlmacenClassify.tsx:116`.
6. **E-09 P1:** `npx agent-browser install` y reintentar QA browser para validar responsive, modales, lightbox, navegación real.
7. Preparar `tests/agent/` con los 10 candidatos arriba usando `agent-browser` + `curl` + `sqlcmd` + `api.log`, estados PASS/FAIL/BLOCKED/ABORTED.
8. No escribir en AD_DIST, no añadir Profit WRITE, no modificar Prisma salvo fix E-03/E-04 si requiere migración documentada.

**Fuera de 7H:** Escritura Profit, estados PROFIT_*, outbox idempotente, mapping `co_cat/co_color/procedenci` quedan para 7F/8A.

---

*QA ejecutado sin modificar código de aplicación. Evidencia API JSON + inspección de código. Browser real BLOCKED por timeout, no por app.*
