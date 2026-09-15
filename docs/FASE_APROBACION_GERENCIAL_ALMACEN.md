# FASE 15A — Aprobación Gerencial de Almacén (Encargado de Almacén)

## 1. Objetivo

Después de que Almacén complete la clasificación, la solicitud pasa por una
aprobación independiente del **Encargado de Almacén** antes de Contabilidad.
El módulo operativo de Almacén no desaparece ni cambia de propósito.

## 2. Hallazgo de inspección (decisión de diseño)

`ALMACEN_APROBADO` ya existía como estado intermedio, pero **no** representaba
una aprobación: `WAREHOUSE` (con `WAREHOUSE.CLASSIFY`) podía pasar directo
`PENDIENTE_ALMACEN → PENDIENTE_CONTABILIDAD` (bypass total), `classify()` no
notificaba a nadie y la cola `ALMACEN_APROBADO` pertenecía al mismo permiso.
Por tanto no se crearon estados duplicados: se reutilizó `ALMACEN_APROBADO`
como cola del Encargado y se cerró el bypass. Sin tablas nuevas, sin
transiciones nuevas, sin cambios al modelo.

## 3. Rol y permisos

- Rol `WAREHOUSE_MANAGER` (id `r8`, nombre visible «Encargado de Almacén»):
  revisa, valida, aprueba, devuelve/rechaza. No clasifica.
- Permisos: `WAREHOUSE_MANAGER.VIEW` (cola/detalle), `WAREHOUSE_MANAGER.APPROVE`
  (decisión). Matriz del rol: VIEW + APPROVE + `REQUEST.VIEW` + `DASHBOARD.VIEW`
  (sin `WAREHOUSE.CLASSIFY`: separación conceptual total).
- Integrado en: seed (`prisma/seed.js`), backfill idempotente
  (`prisma/backfill-role-permissions-10f.js`, crea rol+permisos si faltan),
  guards (`JwtGuard→RbacGuard`, backend autoridad final), `SessionContext`,
  `Can`/`RequirePermission`, `navigation.ts`, `presentacion.ts`.
- `MASTER_DATA_ADMIN` conserva su acceso administrativo sin cambios.

## 4. Flujo

ANTES:
`PENDIENTE_ALMACEN —APPROVE(WAREHOUSE.CLASSIFY)→ PENDIENTE_CONTABILIDAD`
(classify() dejaba `ALMACEN_APROBADO` como efecto lateral sin notificar).

DESPUÉS:
`PENDIENTE_ALMACEN —APPROVE→ ALMACEN_APROBADO —APPROVE(WAREHOUSE_MANAGER.APPROVE)→ PENDIENTE_CONTABILIDAD`
`RETURN`/`REJECT` sin cambios (`→ PENDIENTE_GERENTE` / `→ RECHAZADO`).

## 5. Transición y endpoints

- `workflow-states.ts`: solo cambió `PENDIENTE_ALMACEN.APPROVE → ALMACEN_APROBADO`.
- Nuevo módulo `aprobacion-almacen` (service/controller/module, registrado en
  `app.module.ts`). Endpoints (todos `JwtGuard+RbacGuard`):
  - `GET /warehouse-approval/pending` (`WAREHOUSE_MANAGER.VIEW`, filtra empresa)
  - `GET /warehouse-approval/:id` (`WAREHOUSE_MANAGER.VIEW`, 404 fuera de
    cola/empresa: no fuga información)
  - `POST /warehouse-approval/:id/approve` (`WAREHOUSE_MANAGER.APPROVE`)
  - `POST /warehouse-approval/:id/return` (motivo obligatorio)
  - `POST /warehouse-approval/:id/reject` (motivo obligatorio)
- Las transiciones las ejecuta `SolicitudesService.approve` (mismo
  `approval`/`workflowHistory`/`workflowTask`/`auditEvent`/notificación/SSE).
- `AlmacenService.approve` ahora solo acepta `PENDIENTE_ALMACEN`; en
  `ALMACEN_APROBADO` lanza `ForbiddenException` (cierra el bypass).
- `classify()` al promover notifica a la cola del Encargado (mecanismo 11G/12F
  + SSE post-commit).
- `QUEUE_PERMISSION[ALMACEN_APROBADO] = WAREHOUSE_MANAGER.APPROVE`
  (visibilidad server-side y panel automáticos);
  `STEP_QUEUE_PERMISSION` y mensaje de cola actualizados igual.

## 6. Auditoría

Reutiliza `AuditEvent`: `CLASSIFIED` (existente) + `APPROVE`/`RETURN`/`REJECT`
con `before/after` de estado, actor, empresa y correlación. Sin segunda auditoría.

## 7. Notificaciones SSE

Sin sistema nuevo: `classify()` crea notificaciones `ALMACEN_APROBADO` para el
rol (respeta `DENEGADO`, excluye al actor, `dedupKey`, P2002) y `approve()`
notifica a Contabilidad como antes. Emisión post-commit vía `SseService`.

## 8. Frontend (`/aprobacion-almacen`, grupo Trabajo)

- Tabla `DataTable`: N°/Descripción/Solicitante/Área/Fecha/Prioridad/
  Código Master/Estado + **[Revisar]** (abre detalle, nunca aprueba).
- Detalle: stepper + estado + aviso de pendiente + datos + clasificación
  (solo lectura vía `RequestDetail`) + «Clasificado por» (auditoría
  `CLASSIFIED`) + Recorrido + `[Volver] [Devolver] [Rechazar] [Aprobar solicitud]`
  (acciones tras `Can WAREHOUSE_MANAGER.APPROVE`; aprobar/devolver/rechazar con
  confirmación y motivo obligatorio donde corresponde).
- `SolicitudDetailPage`: `ALMACEN_APROBADO` ahora enlaza a Aprobación Almacén;
  `WorkflowStepper`/etapa renombrados a «Aprobación Almacén»; dashboard agrega
  fila de trabajo pendiente (sin KPIs nuevos). Mock de Almacén alineado al
  flujo nuevo. `StatusBadge` conserva la etiqueta de estado (decisión:
  minimizar radio de cambio; el texto explicativo vive en `WorkflowStatusInfo`).

## 9. Seguridad y concurrencia

Backend valida usuario activo, permiso efectivo, rol, empresa, estado y
transición. Doble aprobación secuencial → `NotFoundException` controlado
(verificado en vivo). Ventana de carrera exacta concurrente: igual que el resto
de endpoints del workflow (pre-check + transacción; documentado, sin mecanismo
paralelo nuevo).

## 10. Pruebas

- Backend: `test/aprobacion-almacen-15a.spec.ts` (16: cola, detalle 404,
  aprobación, gates de completitud, return/reject con motivo, guards por
  metadata, cadena de transiciones, notificaciones con DENEGADO, SSE en
  classify) + actualización de `workflow-states-8g`, `warehouse.service.spec`
  (bloqueo 403) y `requests.service.spec` (nuevo destino). Suite: 415/416 en
  corrida completa con 1 fallo identificado y corregido (test de tarea
  `APPROVE` con destino anterior), re-verificado 102/102 en lote workflow.
- Frontend: `AprobacionAlmacenPage.test.tsx` (7) + `navigation.test.ts` (+1) +
  `presentacion.test.ts` (+2 casos). Suite: **170/170 (27 archivos)**.
- Typecheck: backend PASS, frontend PASS. Builds: `nest build` PASS (vía
  restart), `vite build` PASS (179 módulos).
- Health: `GET /api/v1/health` → 200 (`API READY`).
- Prueba viva (servicios reales, SQLite dev + backfill ejecutado): REQ-0017
  `PENDIENTE_ALMACEN → classify → ALMACEN_APROBADO → (Almacén bloqueado 403) →
  approve → PENDIENTE_CONTABILIDAD → (doble 404) → cola Contabilidad OK →
  auditoría/historial/notificaciones OK` (11/11). Gate de completitud
  verificado (bloquea sin tipo/unidad/impuesto).

## 11. Criterios de aceptación

Todos cumplidos: rol + permisos integrados al RBAC; Almacén intacto en
propósito; cola propia solo con `ALMACEN_APROBADO` de la empresa; tabla sin
aprobación directa; `Revisar` abre detalle; aprobación con confirmación en
detalle; backend valida todo; sin doble aprobación; llega a Contabilidad y su
cola la recibe; SSE/auditoría/historial/Mis Solicitudes intactos; sin tablas ni
endpoints de negocio duplicados; Profit/autenticación/RBAC/workflow existente
sin rupturas. Riesgo residual: carrera concurrente exacta (misma que el resto
del workflow). **FASE COMPLETADA.**
