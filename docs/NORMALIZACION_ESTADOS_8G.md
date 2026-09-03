# FASE 8G — Normalización de estados del workflow a español

Fecha: 2026-09-03
Estado: FINALIZADA — PASS

## 1. Estados anteriores → nuevos

| Antes (inglés) | Ahora (español) |
|---|---|
| DRAFT | BORRADOR |
| PENDING_MANAGER | PENDIENTE_GERENTE |
| PENDING_WAREHOUSE | PENDIENTE_ALMACEN |
| WAREHOUSE_APPROVED | ALMACEN_APROBADO |
| PENDING_ACCOUNTING | PENDIENTE_CONTABILIDAD |
| PENDING_FINAL_REVIEW | PENDIENTE_VALIDACION_MAESTRA |
| PENDING_MASTER | PENDIENTE_VALIDACION_MAESTRA |
| APPROVED | APROBADO_FINAL |
| FINAL_APPROVED | APROBADO_FINAL |
| RETURNED | DEVUELTO |
| REJECTED | RECHAZADO |
| PROFIT_PROCESSING | PROCESANDO_PROFIT |
| PROFIT_INSERTED | REGISTRADO_PROFIT |
| PROFIT_ERROR | ERROR_PROFIT |

Aclaraciones (estados que NO existían en código ni datos):
- `PENDING_MASTER` y `FINAL_APPROVED` nunca se implementaron; el paso real de
  revisión final era `PENDING_FINAL_REVIEW` y el final real era `APPROVED`.
  Se normalizan al español correspondiente sin cambiar semántica.
- `PROFIT_*` no existían; se crean como constantes sin transiciones (8G no
  implementa Validación Maestra completa ni escritura en Profit).
- `MASTER_ACTIVE` nunca lo produjo el backend y no estaba en datos; se retiró
  del union frontend, del timeline y del filtro "completadas" del panel
  (completadas = `APROBADO_FINAL`). Ver pendientes.
- `MANAGER_APPROVED` / `ACCOUNTING_APPROVED` eran intermedios muertos (solo en
  tipos frontend y un mock); se eliminaron.

## 2. Secuencia oficial

```
BORRADOR → PENDIENTE_GERENTE → PENDIENTE_ALMACEN → ALMACEN_APROBADO
→ PENDIENTE_CONTABILIDAD → PENDIENTE_VALIDACION_MAESTRA → APROBADO_FINAL
→ PROCESANDO_PROFIT → REGISTRADO_PROFIT
```

Rama técnica: `PROCESANDO_PROFIT → ERROR_PROFIT` (sin reintento automático en 8G).

## 3. Retornos (comportamiento conservado, solo renombrado)

```
PENDIENTE_GERENTE → RETURN → BORRADOR
PENDIENTE_ALMACEN → RETURN → PENDIENTE_GERENTE
ALMACEN_APROBADO → RETURN → PENDIENTE_GERENTE
PENDIENTE_CONTABILIDAD → RETURN → PENDIENTE_ALMACEN (observación obligatoria)
PENDIENTE_VALIDACION_MAESTRA → RETURN → PENDIENTE_CONTABILIDAD
Cualquier pendiente → REJECT → RECHAZADO
```

WorkflowTask al devolver: se reactiva la tarea existente del paso destino
(`instanceId + stepCode` UNIQUE); no se duplica. `currentStepCode`, history y
approval conservan el registro.

## 4. ERROR_PROFIT

- Exclusivamente técnico. NO es rechazo de negocio.
- NO devuelve automáticamente a Almacén ni a Contabilidad.
- Sin reintentos automáticos en 8G.
- En el timeline se muestra como insignia ámbar separada
  ("Error en Profit (técnico, no es rechazo)").

## 5. Estrategia de migración

- Base: SQLite dev (`apps/api/data/dev.db`). PostgreSQL no tocado.
- Backup previo: `apps/api/data/dev.db.pre-8g.bak` (reversibilidad).
- Script: `apps/api/prisma/migrate-workflow-states-8g.js`
  (`node prisma/migrate-workflow-states-8g.js` con cwd = `apps/api`).
  - Idempotente: solo `UPDATE ... WHERE valor_antiguo`; 2.ª ejecución = 0 cambios.
  - Tablas: `requests.status`, `workflow_instances.current_step_code`,
    `workflow_tasks.step_code`, `workflow_history.from_step/to_step`,
    `approvals.step_code/from_status/to_status`.
  - NO toca `created_at/updated_at` (UPDATE directo de columnas de estado).
  - NO duplica WorkflowTask (renombre in situ, UNIQUE conservado, mapeo 1:1).
  - NO toca `audit_events.beforeData/afterData` (trail histórico inmutable).
  - NO toca `workflow_tasks.status` (PENDING/COMPLETED es otro dominio).
- Esquema Prisma: solo cambió el default `Request.status` `"DRAFT"` → `"BORRADOR"`.
  No se requirió `db push` ni `generate` (columna sigue `String`; además `generate`
  falla con EPERM si la API está en ejecución — DLL en uso).
- Resultado: 41 solicitudes migradas (6 BORRADOR, 3 PENDIENTE_ALMACEN,
  3 ALMACEN_APROBADO, 3 PENDIENTE_CONTABILIDAD, 5 PENDIENTE_VALIDACION_MAESTRA,
  19 APROBADO_FINAL, 2 RECHAZADO), 147 tasks, instances/history/approvals
  migrados. Restos antiguos: 0. Duplicados: 0. Idempotencia verificada.

## 6. Tablas afectadas

`requests`, `workflow_instances`, `workflow_tasks`, `workflow_history`, `approvals`.

## 7. Archivos principales afectados

Backend:
- `apps/api/src/modulos/solicitudes/workflow-states.ts` (NUEVO: fuente canónica,
  `WORKFLOW_STATES`, `WORKFLOW_SEQUENCE`, `WORKFLOW_STATE_MIGRATION`,
  `getNextWorkflowState`, `isTerminalWorkflowState`)
- `apps/api/src/modulos/solicitudes/solicitud.service.ts` (consume la fuente
  canónica; se eliminó el `getNextStatus` privado duplicado)
- `apps/api/src/modulos/almacen/almacen.service.ts`
- `apps/api/src/modulos/contabilidad/contabilidad.service.ts`
- `apps/api/src/modulos/revision-final/revision-final.service.ts`
- `apps/api/src/modulos/panel/panel.service.ts` (filtros; completadas = APROBADO_FINAL)
- `apps/api/prisma/schema.prisma` (default BORRADOR)
- `apps/api/prisma/migrate-workflow-states-8g.js` (NUEVO)

Frontend:
- `apps/web/src/tipos/index.ts` (`RequestStatus`)
- `apps/web/src/componentes/workflow/WorkflowTimeline.tsx` (8 pasos + DEVUELTO/
  RECHAZADO especiales + insignia ERROR_PROFIT)
- `apps/web/src/componentes/ui/index.tsx` (`StatusBadge` con etiquetas naturales)
- `apps/web/src/modulos/aprobaciones/AprobacionesPage.tsx`
- `apps/web/src/modulos/solicitudes/SolicitudCreate.tsx`
- `apps/web/src/modulos/almacen/AlmacenClassify.tsx` (+ test)
- `apps/web/src/mock/requests.ts`, `apps/web/src/mock/extras.ts`
- `apps/web/src/servicios/mock/{request,warehouse,accounting,final-review}-service.ts`
  (mock accounting APPROVE → PENDIENTE_VALIDACION_MAESTRA como el backend real;
  mock request-service APPROVE gerente → PENDIENTE_ALMACEN)

Tests:
- `apps/api/test/workflow-states-8g.spec.ts` (NUEVO, 8 tests)
- 9 specs actualizados al vocabulario español.

Docs:
- `docs/NORMALIZACION_ESTADOS_8G.md` (NUEVO, este archivo)
- `docs/MANUAL_DESARROLLADOR.md` (§9 workflow, §12 contabilidad)
- `docs/FLUJO_DATOS.md` (flujo workflow + clasificación)
- `docs/GLOSARIO_PROYECTO.md` (términos del workflow)

## 8. Pruebas realizadas

- `pnpm --filter @master-data/api test`: 15 archivos, 143 tests, PASS
  (incl. `workflow-states-8g.spec.ts`: 10 estados, secuencia, retornos, terminales,
  mapa de migración, rama técnica ERROR_PROFIT).
- `pnpm --filter @master-data/api run typecheck`: PASS
- `pnpm --filter @master-data/web run typecheck`: PASS
- `pnpm --filter @master-data/web test`: 2 archivos, 12 tests, PASS
- `pnpm --filter @master-data/web run build`: PASS
- Migración: OK, 0 restos, 0 duplicados, idempotente (2.ª corrida vacía).
- Búsqueda estados antiguos: 0 referencias funcionales en `apps/api/src`
  (solo mapa de migración + comentarios en `workflow-states.ts`) y en
  `apps/web/src` (solo 1 comentario en tipos). Docs históricos intactos.
- `GET /api/v1/health`: pendiente de verificación (ver §10).

## 9. Profit

- PROFIT WRITES = 0. READ-ONLY = PASS.
- No se creó ni modificó ningún endpoint `/profit`.
- No se tocó `ProfitAdapter` (no tenía referencias de estados).
- `PROFIT_WRITE_ENABLED` sin cambios. AD_DIST / AD_TRANS / C_DIST intactos.

## 10. Pendientes descubiertos

1. Verificar `GET http://localhost:3001/api/v1/health` (si no responde, el usuario
   debe ejecutar `.\scripts\api-restart.ps1`; la API en ejecución usa el `dist/`
   compilado anterior y la DLL de Prisma bloquea `db:generate`).
2. `MASTER_ACTIVE` retirado: si a futuro se necesita estado post-Profit distinto de
   `REGISTRADO_PROFIT`, diseñarlo en su fase (había filtro de panel + paso de
   timeline que lo referenciaban sin que el backend lo produjera).
3. Anomalía de datos preexistente (fuera de alcance 8G): 1 fila en
   `workflow_tasks` con `status = 'PENDING_ACCOUNTING'` (columna de estado de
   tarea, no step_code; la migración no la tocó).
4. `audit_events` históricos conservan JSON con estados en inglés (inmutable por
   diseño); solo los registros nuevos usan español.
