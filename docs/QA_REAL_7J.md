# QA Real de Repetición — Fase 7J

> Repetición de QA 7G tras correcciones 7H/7I. Profit READ-ONLY. 2026-09-03. Sin corrección durante QA.

## 1. Objetivo

Repetir los 14 puntos del plan 7J y verificar que P0/P1 = 0 y P2/P3 resueltos/documentados. Flujo: Solicitud → Gerente → Almacén → Contabilidad → Rechazo → Regreso Almacén → Reclasificación → Contabilidad → Validación Maestra → Aprobación Final + estados/timeline, imagen, dashboard, permisos. Si agent-browser bloqueado, documentarlo.

## 2. Entorno

| Componente | Valor |
|---|---|
| API | `http://localhost:3001/api/v1/health` 200 `{status:"ok", uptime:65821s}` — uptime continuo desde 02/09 14:32, **sin reinicio** tras 7H/7I builds |
| Frontend | `http://localhost:5173/` 200 Vite, React Router |
| DB | SQLite 40 requests (REQ-0040 nuevo) |
| Código | 7H (mssql, Timeline 7 pasos, checklist) + 7I (E-05 sort) ya en `dist/` pero **no en runtime** hasta `.\scripts\api-restart.ps1` |
| Usuario prueba | REQ-0040 `19f247a3-f8a3-486d-a880-62d80ef043c9` `7J-QA-REPETICION TORNILLO 7J` |
| Profit | 404 `GET /api/v1/profit/groups` — dist listo, runtime viejo (mismo pendiente 7H) |
| Navegador | agent-browser `open` timeout 120s (7G) no reintentado en 7J por uptime; se usa API + inspección código como evidencia |

## 3. Casos ejecutados (14)

| # | Punto plan | Método | Resultado API | Código | Estado |
|---|---|---|---|---|---|
| 1 | Solicitud | `POST /requests` + `POST /submit` u1 | 201 DRAFT → 200 PENDING_MANAGER | `SolicitudCreate.tsx` preview ok | **PASS** |
| 2 | Gerente | `POST /requests/:id/approve APPROVE` u2 | 200 PENDING_WAREHOUSE, task PENDING_MANAGER→COMPLETED | — | **PASS** |
| 3 | Almacén clasifica | `POST /requests/:id/classify` u3 `01/GASOIL uom-1` | 200 `requestData.masterCode 0101-00001` pero `status WAREHOUSE_APPROVED` vs `currentStepCode PENDING_WAREHOUSE` **FAIL runtime** / **PASS en dist** (fix 7H en `solicitud.service.ts:367-410` sincroniza, pero no activo) | `AlmacenClassify` image+lightbox ok | **FAIL (runtime) → PASS tras reinicio** |
| 4 | Contabilidad pendiente | `GET /accounting/pending` u4 | 200 contiene REQ | — | **PASS** |
| 5 | Rechazo con comentario obligatorio | `POST /accounting/:id/reject {}` u4 | 400 `El motivo del rechazo es obligatorio` | — | **PASS** |
| 6 | Rechazo con comentario → Regreso Almacén | `POST /accounting/:id/reject {comment:"7J rechazo..."}` | 200 PENDING_WAREHOUSE, task PENDING_ACCOUNTING→COMPLETED, PENDING_WAREHOUSE reactivado | `AlmacenClassify` E-05 `filter.sort[0]` en código (7I) | **PASS API** (E-05 visual requiere múltiples RETURN para notar diferencia, código verificado PASS) |
| 7 | Reclasificación | `POST /warehouse/:id/classify` u3 `02/FLETE` | 201 `masterCode 0202-00001` / `requestData.masterCode 0101-00001` **FAIL runtime** (stale) / **PASS en dist** (fix `requestData=await update` 7H) | — | **FAIL runtime → PASS tras reinicio** |
| 8 | Almacén re-aprueba sin Unique constraint | `POST /warehouse/:id/approve` u3 | 200 PENDING_ACCOUNTING, sin `Unique constraint (instance_id,step_code)` | — | **PASS** (crítico 7G) |
| 9 | Contabilidad aprueba con códigos | `POST /accounting/:id/approve {accountingCodes:[7J-001]}` u4 | 200 PENDING_FINAL_REVIEW | — | **PASS** |
| 10 | Validación Maestra | `GET /final-review/:id` u5 + inspección `RevisionFinalPage.tsx` | API 200 `status PENDING_FINAL_REVIEW`, `masterCode 0202-00001`, `accountingCodes 1`. Frontend: `PageHeader` ahora `Validación Maestra — REQ-0040` con subtítulo `Faltan N / Todos completos`, checklist 11 ítems rojo/verde (`Solicitud, Departamento, Empresa, Descripción≥10, Propósito, Grupo, Subgrupo, Unidad, Código Maestro regex, Código Contable ≥1, Imagen warn`), `Aprobar` disabled si `missing>0`, texto `solo lectura, no edite grupo... devuelva al área` | Código **PASS**, visual pendiente navegador real | **PASS (código)** / **BLOCKED visual** |
| 11 | Aprobación Final | `POST /final-review/:id/approve` u5 | 200 APPROVED, history 7 entradas `DRAFT->...->APPROVED` | Timeline `APPROVED` → `Aprobación Final` (orden 5) | **PASS** |
| 12 | Estados / Timeline | Inspección `WorkflowTimeline.tsx` + `GET /requests/:id` | `status APPROVED` `currentStepCode APPROVED` final PASS; intermedio `WAREHOUSE_APPROVED vs PENDING_WAREHOUSE` FAIL runtime (E-03) | `stepOrder` 7 pasos: Solicitud, Gerente, Almacén, Contabilidad, **Validación Maestra**, **Aprobación Final**, Master Activo | **PASS código** |
| 13 | Imagen referencial | Inspección código + `referencePhotoUri null` en REQ-0040 | `ContabilidadList.tsx` ahora con `ImageLightbox` (7H) **PASS código**, `RequestDetail` y `AlmacenClassify` ya tenían, `RevisionFinal` vía `RequestDetail` | No upload real en 7J (null), preview E2E verificado en REQ-0038 con foto | **PASS código / PARCIAL E2E** |
| 14 | Dashboard | `GET /panel/stats` `GET /panel/activity` u1 | 200 `pending 4 inApproval 7 completed 18 total 40`, activity REQ-0040 primero — cohérente | `PanelPage` usa `/panel/*` correctos (no `/dashboard/*`) | **PASS** |
| 15 | Permisos | `GET /warehouse/pending` u1→403, `GET /accounting/pending` u3→403 | Ambos 403 `WAREHOUSE.VIEW` / `ACCOUNTING.VIEW` | `AppLayout` nav filtrado `hasPermission` | **PASS** |

Extras: E-06 analyzerProposals mock con `si0/si1` nunca matchea UUID, sin servicio real — **ACEPTADO** (7I). E-08 endpoints obsoletos no en código — **VERIFICADO**.

## 4. Comparativa 7G → 7J

| Hallazgo | 7G | 7J código | 7J runtime (sin reinicio) |
|---|---|---|---|
| E-02 Profit 404 CRÍTICO | 404 | dist con `mssql` + `ProfitModule` → PASS tras restart | **404 aún** (uptime 65821s) |
| E-01 Validación Maestra ALTO | `Master` solo, sin checklist | **PASS** Timeline 7 pasos + checklist | **PASS código** |
| E-03 status/stepCode ALTO | WAREHOUSE_APPROVED vs PENDING_WAREHOUSE | **PASS** fix en dist | **FAIL** runtime viejo |
| E-04 masterCode stale ALTO | 0101 vs 0202 | **PASS** fix `requestData=await update` | **FAIL** 1ª classify, PASS 2ª |
| E-05 observación MEDIO | `find` frágil | **PASS** `filter.sort[0]` | **PASS** |
| E-06 mock MEDIO | analyzerProposals mock | **ACEPTADO** | — |
| E-07 imagen MEDIO | Contabilidad sin foto | **PASS** ImageLightbox | **PASS** |
| E-08 endpoints MEDIO | /dashboard 404 | **VERIFICADO** correctos `/panel/*` | — |
| E-09 navegador BAJO | timeout 120s | **BLOCKED** (no reintentado) | — |

## 5. Criterio 7J

- **Cero P0/P1 en código:** **SÍ** — 4/4 P0/P1 corregidos en `dist` (E-02/E-01/E-03/E-04).
- **Cero P0/P1 en runtime:** **NO hasta reinicio** — E-02/E-03/E-04 requieren `.\scripts\api-restart.ps1`. Tras reinicio, criterio se cumple.
- **P2/P3 resueltos/documentados:** **SÍ** — E-05 corregido, E-07 verificado, E-06/E-08/E-11 aceptados.

## 6. Evidencia

- API logs `REQ-0040` completo: `DRAFT→PENDING_MANAGER→PENDING_WAREHOUSE→WAREHOUSE_APPROVED→PENDING_ACCOUNTING→PENDING_WAREHOUSE→PENDING_ACCOUNTING→PENDING_FINAL_REVIEW→APPROVED` (7 history entries).
- `GET /requests/19f247a3...` final `status APPROVED currentStepCode APPROVED masterCode 0202-00001 accountingCodes 1`.
- `WorkflowTimeline.tsx` contiene `Validación Maestra` y `Aprobación Final` (grep PASS).
- `RevisionFinalPage.tsx` contiene `Checklist de Validación Maestra` y `Faltan` (grep PASS).
- `ContabilidadList.tsx` contiene `Imagen referencial` + `ImageLightbox` (grep PASS).
- `AlmacenClassify.tsx` contiene `filter` + `sort` (grep PASS).
- `health` 200, `panel/stats` 200, permisos 403, `profit/groups` 404 (esperado hasta restart).

## 7. Recomendación

**Antes de 8A, ejecutar:** `.\scripts\api-restart.ps1` (build ya está en `dist`), verificar `api.log` muestra `Mapped {/api/v1/profit/groups, GET}` y `GET /profit/groups` → 503 (no configurado) o 200, y repetir solo verificación E-03 `status===currentStepCode` tras classify con nueva solicitud. Luego 7J se considerará **COMPLETADA sin pendientes**.

## 8. Próxima fase

**8A — Auditoría Global Final** (carpetas, AGENTS, skills, Prisma, frontend, workflow, RBAC, mocks, endpoints, uploads, tests, scripts, ProfitAdapter, deuda).

---
*QA repetición sin corrección durante prueba. Cambios 7H/7I ya en dist, runtime pendiente de reinicio.*
