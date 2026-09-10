# FASE 13A — Solicitudes por rol + historial (implementado)

## Reglas de visibilidad (server-side, `GET /requests?scope=`)

- `activas`: propias no terminales + colas por permiso efectivo en cada empresa
  (`WAREHOUSE.CLASSIFY` → PENDIENTE_ALMACEN/ALMACEN_APROBADO,
  `ACCOUNTING.APPROVE` → PENDIENTE_CONTABILIDAD,
  `FINAL_REVIEW.APPROVE` → PENDIENTE_VALIDACION_MAESTRA,
  gerencia → PENDIENTE_GERENTE de departamentos con `managerId` propio).
  Admin (`ADMIN.MANAGE`): todo.
- `historial`: participación real (`approvals.actorId`, `audit CLASSIFIED`) o propio.
  Admin: todo.
- Filtros (bucket/proceso/completadas/rechazadas, search, requesterId,
  departmentId, companyId, fechas, page/limit 25-50-100) se intersectan con el
  scope (`AND`); jamás lo amplían. Envelope `{items, total, filteredTotal, page, limit}`.
- Detalle e historial (`GET /requests/:id`, `:id/history`): `assertCanView`
  (admin, propio, participante, gerente del depto, cola vigente); 404 si no.

## Participación, responsable y contadores

- `miParticipacion` por item (última acción propia: Aprobé/Devolví/Rechacé/
  Clasifiqué/Envié; 'Creé' si es propio sin acciones).
- Responsable actual = etiqueta del estado (colas generales, nunca usuario salvo
  evidencia en approvals). Siguiente etapa = área del `toStatus` propio.
- `GET /requests/resumen`: {activas, historial, completadas, rechazadas, enProceso}.

## Frontend

- `SolicitudesList`: tabs Activas/Historial, subtítulo por rol, resumen server-side,
  filtros (bucket, búsqueda, fechas; empresa/depto/solicitante solo admin),
  columna Mi participación, paginador, solo lectura implícita (sin acciones).
- `SolicitudDetailPage`: cabecera + responsable actual, recorrido con actores/
  fechas/comentarios, Mi participación, banner Solo lectura al transferir.
- Sin cambios: workflow, RBAC, SSE/notificaciones, contabilidad, Profit.

## Tests

- Backend `solicitudes-13a.spec.ts` (9): scopes por rol, transición pendiente→historial,
  cola general, contadores, paginación, 404 fuera de alcance.
- Frontend `SolicitudesList.test.tsx` (7): tabs, participación, filtros, detalle.
