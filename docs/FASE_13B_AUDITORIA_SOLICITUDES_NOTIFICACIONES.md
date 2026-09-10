# FASE 13B — Auditoría de Solicitudes y Notificaciones

## 1. Estado inicial

- `GET /api/v1/requests?scope=activas` y `GET /api/v1/requests/resumen` devolvían
  **500** con sesión válida; sin sesión devuelven 401 (correcto).
- Frontend `/requester` sin datos como consecuencia del 500 (el envelope y el
  consumo ya eran compatibles; el origen era backend).

## 2. Error HTTP 500 — causa raíz exacta

`SolicitudesService.scopeWhere()` (historial) y el `include` de `findScoped()`
usaban la relación Prisma **`auditEvents` sobre `Request`**, que **no existe**
en el schema (`AuditEvent.requestId` existe como columna, pero `Request` no
declara la relación inversa; solo `User.auditEvents` y `Company.auditEvents`
existen). Prisma lanza error de validación → Nest responde 500.
Afectaba a ambos endpoints porque `resumen` también construye el scope historial.

## 3. Corrección realizada

`apps/api/src/modulos/solicitudes/solicitud.service.ts` (único archivo backend):

- `scopeWhere` → `buildScopeWhere` async: el historial resuelve la participación
  por clasificación en dos pasos (`auditEvent.findMany` → `id: { in }`).
- `findScoped`: eliminado `auditEvents` del `include`; las clasificaciones de la
  página se cargan con una sola consulta batch y se pasan a `participationOf`
  vía `classifiedAt`.
- `resumen`: usa el constructor async.
- Sin cambios de schema, sin migraciones, sin cambios de contrato ni de reglas.

`apps/api/test/solicitudes-13a.spec.ts`: mock actualizado al acceso en dos pasos.

Verificación en vivo contra `dev.db` (solo lectura, spec temporal eliminado):
usuario real → `resumen={activas:20, historial:41, completadas:19, rechazadas:2,
enProceso:20}`, `activas.total=20`, `historial.total=41`. Sin 500.

## 4. Visibilidad por rol

| Rol | Crear | Activas | Historial | Alcance |
|---|---|---|---|---|
| Solicitante | Sí | Propias no terminales | Propias + participadas | `requesterId` propio |
| Jefe depto. | Sí | PENDIENTE_GERENTE de sus deptos | Participadas + propias | `managerId` + participación |
| Almacén | Sí | Cola PENDIENTE_ALMACEN/ALMACEN_APROBADO | Participadas | Permiso por empresa, sin filtro de depto. origen |
| Contabilidad | Sí | Cola PENDIENTE_CONTABILIDAD | Participadas | Permiso por empresa |
| Validación | Sí | Cola PENDIENTE_VALIDACION_MAESTRA | Participadas | Permiso por empresa |
| Admin | Sí | Todo | Todo | `ADMIN.MANAGE` |

Filtros se intersectan (`AND`) con el scope; detalle/historial con `assertCanView`
(404 sin revelar existencia). Permisos efectivos con DENEGADO > CONCEDIDO > HEREDADO.

## 5. Flujo de notificaciones

| Transición | Destinatario | Exclusión | Motivo |
|---|---|---|---|
| SUBMIT → PENDIENTE_GERENTE | `managerId` del depto. | Actor | Responsable individual |
| APPROVE → PENDIENTE_ALMACEN | Cola `WAREHOUSE.CLASSIFY` en la empresa | Actor | Cola funcional global |
| APPROVE → PENDIENTE_CONTABILIDAD | Cola `ACCOUNTING.APPROVE` | Actor | Cola funcional global |
| APPROVE → PENDIENTE_VALIDACION_MAESTRA | Cola `FINAL_REVIEW.APPROVE` | Actor | Permiso real vigente |
| RETURN/REJECT | Solicitante (+ cola si aplica) | Actor | Con motivo y acción requerida |
| APPROVE → APROBADO_FINAL | Solicitante ("lista para registro en Profit") | Actor | Sin afirmar registro |

Creación en la misma transacción; emisión SSE post-commit; `dedupKey`
`(request,tipo,destinatario)` único.

## 6. SSE

- Conexión: `GET /notificaciones/stream` autenticado por cookie `dm_session`;
  sin sesión → 401 verificado en vivo. `Map<userId, Set>` en memoria, cleanup por
  unsubscribe, sin Redis.
- `Last-Event-ID`: reenvía no leídas posteriores; reconciliación por API +
  backoff con jitter en frontend; `readAt` + dedupe local por id.
- Persistencia: tabla `notifications` con `dedupKey` único; SSE caído no pierde
  datos (fuente de verdad = DB).

## 7. Pruebas

- Backend: **309/309** (30 archivos, incl. `solicitudes-13a` 9/9,
  `notificaciones-11g/12f`).
- Frontend: **122/122** (21 archivos).
- Typecheck API: OK. Typecheck web: OK.
- Build API: OK. Build web: OK.
- Health: OK (`{"status":"ok"}` post `api-restart.ps1`).
- Stream sin sesión: 401. Notificaciones sin sesión: 401.

## 8. Pruebas del flujo

| Paso | Estado | Notificación | Destinatario | Resultado |
|---|---|---|---|---|
| Scope activas/historial por rol | Operativo | — | — | 9/9 specs + vivo real |
| Detalle fuera de alcance | 404 | — | — | Specs |
| Transiciones → colas | Sin cambios | Post-commit | Colas por permiso | Specs 12F vigentes |
| Recorrido/Mi participación | Operativo | — | — | Tests frontend 7/7 |

## 9. Problemas no resueltos

Ninguno pendiente de esta auditoría. Nota menor (no bug): si se envían `status`
y `bucket` a la vez, `bucket` prevalece; el frontend nunca los combina.

## 10. Limitaciones de validación

Flujo multiusuario extremo a extremo y prueba visual no ejecutados (sin Browser
Control por instrucción; se validó con specs deterministas + consulta real
solo-lectura contra `dev.db`).

## 11. Recomendación siguiente

Nada bloqueante. Siguiente paso útil: validación manual del caso §30 con
sesiones reales por rol.
