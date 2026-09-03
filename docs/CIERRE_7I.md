# CIERRE 7I — Corrección P2/P3

## FASE: 7I
## ESTADO: COMPLETADA

## OBJETIVO
Resolver únicamente E-05, E-06, E-07, E-08 y E-11 de `docs/QA_REAL_7G.md` sin inventar servicios ni funcionalidades.

## REALIZADO

### E-05 Observación frágil — MEDIO — CORREGIDO
- **Archivo:** `apps/web/src/modulos/almacen/AlmacenClassify.tsx:114-117`
- **Antes:** `request.approvals!.find((a)=>RETURN||REJECT)` — devolvía el primer match (más antiguo). Si Contabilidad rechazaba 2 veces, mostraba la observación obsoleta, no la vigente.
- **Después:** `filter(...).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0]` — filtra RETURN/REJECT con comment y ordena descendente, toma el más reciente. Comentario indica `E-05 fix: último RETURN/REJECT`.
- **Validación:** QA 7G caso 7 mostraba `comment:"Falta codigo contable 7G"` como primero; tras fix seguirá mostrando el último aunque existan múltiples. No rompe flujo, solo corrige orden.

### E-06 analyzerProposals mock directo — MEDIO — DOCUMENTADO / ACEPTADO
- **Archivo:** `apps/web/src/modulos/almacen/AlmacenClassify.tsx:6` + `apps/web/src/mock/source-items.ts:16` + `AnalyzerPanel.tsx`
- **Inspección:** `analyzerProposals` es `Record<string,{groupCode,subgroupCode,...}>` con solo 2 entradas `si0/si1` (ejemplo PARACHOQUE FOTON). `WarehouseClassify` hace `id ? analyzerProposals[id] : null` donde `id` es UUID de Request (ej. `15cce5ad...`), nunca coincide con `si0`, por lo que siempre `null` y `AnalyzerPanel` no se renderiza en flujo real. No existe servicio `analyzer`/`matching` real en `apps/api/src/modulos` (14 módulos: almacen, auditoria, autenticacion, catalogos, contabilidad, importaciones, notificaciones, organizacion, panel, profit, revision-final, salud, solicitudes, archivos) ni en `apps/web/src/servicios/api`. `matching-engine` skill existe pero sin implementación.
- **Decisión:** No existe alternativa real. Per PLAN_MAESTRO 7I: `solo si existe alternativa real`. Se deja mock con TODO implícito para futura fase 8C (matching). No se elimina para no romper importación, y no se inventa endpoint falso. Marcado como **ACEPTADO/DOCUMENTADO** — deuda conocida `MANUAL §11` ya lo listaba como limitación.

### E-07 Imagen de referencia E2E/preview — MEDIO — VERIFICADO (ya corregido en 7H-patch)
- **Verificación:** `ContabilidadList.tsx` ya había sido corregido previo a 7I (pre-7H patch solicitado por usuario): `ImageLightbox` + `lightboxOpen` + card `Imagen referencial` con `src=/api/v1/uploads/${referencePhotoUri}` y `border 1px`, idéntico a `AlmacenClassify.tsx:142-154` y `RequestDetail.tsx:61-77`. `RevisionFinalPage` vía `RequestDetail` ya muestra imagen con lightbox. `SolicitudCreate.tsx` hace `POST /requests/:id/photo` con `FormData photo` (multer `ALLOWED_MIMES jpg/png/webp 10MB` en `solicitud.controller.ts:99-104`, dest `uploads/requests`). `flattenRequestData` preserva `referencePhotoUri`, por lo que `GET /warehouse/:id` y `GET /accounting/:id` lo exponen.
- **E2E no probado con upload real en 7G** (REQ-0039 `referencePhotoUri:null`), pero preview E2E está completo en código. No se requirió cambio adicional en 7I; se verificó `GET /api/v1/uploads/requests/...` vía Vite proxy.

### E-08 Endpoints obsoletos — MEDIO — VERIFICADO / SIN CAMBIO CÓDIGO
- **Búsqueda:** `Get-ChildItem apps -Recurse -Filter *.ts | Select-String "dashboard"` encontró solo `DASHBOARD.VIEW` (permiso RBAC, no endpoint) y `PanelController` usa `panel`. `api-panel-service.ts` usa `/api/v1/panel/stats` y `/panel/activity` correctos. `api-importacion-service.ts` usa `/api/v1/importaciones/runs`, `api-notificacion-service.ts` usa `/api/v1/notificaciones` correctos. No hay código que llame a `/dashboard/stats`, `/dashboard/recent`, `/imports/runs` o `/notifications` en inglés.
- **Origen del 404 en QA 7G:** Tester probó manualmente `GET /dashboard/stats` y `GET /imports/runs` — rutas que nunca existieron, correcta es `/panel/stats`. Documentación histórica `QA_REAL_7G.md:139` listó esos 404 como hallazgo, no bug de app.
- **Acción:** No se modifica código (endpoints ya son `/panel/*` en español). Se documenta como **verificado**; `docs/MAPA_PROYECTO.md` y `MANUAL` referencian correctamente `Panel/dashboard` como módulo, no endpoint obsoleto.

### E-11 — BAJO — VERIFICADO
- **Hallazgo QA:** `Profit SECRET no en .env.example validation` — `.env.example` mantiene `PROFIT_DB_*` comentados sin secretos (`# PROFIT_DB_SERVER=`), correcto. No se loguean credenciales (`profit-adapter.service.ts:103` log `user=***` solo). BAJO, sin cambio.

## ARCHIVOS CREADOS
- `docs/CIERRE_7I.md` (este)

## ARCHIVOS MODIFICADOS
- `apps/web/src/modulos/almacen/AlmacenClassify.tsx` — E-05 (3 líneas: filter+sort)
- (sin cambios para E-06/E-07/E-08/E-11 — verificados/documentados)

## ARCHIVOS ELIMINADOS
- (ninguno)

## BASE DE DATOS
- Sin cambios. `AD_DIST` sin escritura READ-ONLY.

## PROFIT
- READ-ONLY. Sin escritura. `mssql` ya instalado en 7H, dist con ProfitModule. **Pendiente reinicio** igual que 7H: `.\scripts\api-restart.ps1` para exponer `GET /profit/groups` (404 hasta restart, luego 503 si no configurado).

## TESTS
- `pnpm --filter @master-data/api test` → **11 passed, 99 passed**, 0 failed (E-05 no afecta unit tests; mock de analyzer no testeado).

## TYPECHECK
- `api typecheck` PASS, `web typecheck` PASS

## BUILD
- `api build` PASS, `web build` PASS (141 modules, 339kB)

## HEALTH
- `GET http://localhost:3001/api/v1/health` → 200 `{status:"ok", uptime:64024s}` 2026-09-03T12:19Z (uptime continuo, sin reinicio desde 7H). `GET /profit/groups` aún 404 hasta restart — documentado en 7H y persiste.

## HALLAZGOS
- E-05 resuelto. E-07 ya resuelto en 7H-patch, re-verificado. E-08/E-11 no eran bugs de código. E-06 aceptado como deuda futura 8C.

## PENDIENTES
- Reinicio API para validar E-02 Profit (7H) en runtime.
- **7J — QA Real de Repetición** (criterio: cero P0/P1, P2/P3 resueltos/documentados) — debe probar solicitud→gerente→almacén→contabilidad→rechazo→reclasificación→contabilidad→Validación Maestra (checklist) → Aprobación Final con imagen en cada etapa.

## PRÓXIMA FASE
**7J — Repetir QA Real** (14 puntos del plan: solicitud, gerente, almacén, contabilidad, rechazo, regreso, reclasificación, contabilidad, Validación Maestra, Aprobación Final, estados/timeline, imagen, dashboard, permisos). Si agent-browser bloqueado, documentarlo.

## CAMBIOS DE CÓDIGO
SI — 1 archivo (AlmacenClassify) con fix mínimo E-05; resto verificado/documentado sin código nuevo inventado.

## DETENIDO
SI — esperar orden explícita para 7J.
