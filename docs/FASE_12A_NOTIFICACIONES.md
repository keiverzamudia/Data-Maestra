# FASE 12A — Notificaciones: auditoría + diseño SSE (sin implementar)

## 1. Estado actual (11G, verificado en código)

`USUARIO actúa → transición (submit/approve) → notifyRequestStep en la misma tx →
notification persistida (userId, requestId, type=step, link) → frontend polling 60s +
carga inicial → campana → markAsRead/markAllAsRead.`

- Persistencia: `notifications(user_id, request_id, title, body, type, read, link, created_at)`
  con índices `(userId)`, `(userId, read)`, `(requestId)`. Fuente de verdad: SÍ.
- Destinatarios: gerente individual / colas por permiso de acción en la empresa
  (`WAREHOUSE.CLASSIFY`, `ACCOUNTING.APPROVE`, `FINAL_REVIEW.APPROVE`), solicitante en
  RETURN/REJECT/final; actor excluido; `DENEGADO > CONCEDIDO > HEREDADO`. Sin broadcast global.
- Lectura aislada: todo filtra por `user.id` de sesión; ajena → 404. `RbacGuard` sin permiso
  declarado admite cualquier sesión autenticada (correcto aquí: son datos propios).
- `WorkflowTask.assignedTo` siempre null (colas por rol, por diseño; no cambiar).

## 2. Por qué no funciona "en vivo" (causas con evidencia)

1. **No existe canal push**: solo carga al montar + `setInterval(60s)`. Aviso de hasta 60s tarde.
2. Polling ciego: corre con pestaña oculta (desperdicio) y sin backoff ante fallos de red.
3. Contador y lista se refrescan juntos, pero dos pestañas solo convergen en el siguiente ciclo.
4. Antes de 11G `create` nunca se llamaba (campana vacía estructural); hoy solo `submit`/`approve`
   emiten (`classify` no cambia de cola: documentado, sin emisión).

## 3. Diseño SSE (propuesta, NO implementar)

- Backend NestJS `@Sse('notificaciones/stream')` con `JwtGuard` (la cookie HttpOnly viaja en
  `EventSource` same-origin). Sin Redis/RabbitMQ/Kafka.
- Registro en memoria: `Map<userId, Set<Subject>>`; al crear `Notification` (ya en tx),
  `subject[userId].next(evento)` tras commit. Reintento de entrega: al conectar, el cliente
  envía `Last-Event-ID`; el servidor reenvía no leídas (`GET` existente como reconciliación).
- Frontend: UNA conexión por pestaña en `AppLayout` (no por componente); `EventSource` con
  reconexión con backoff (base 1s, máx 30s, jitter) + `visibilitychange` (pausar oculto, reanudar
  con reconciliación). Multi-pestaña: documentar `BroadcastChannel` como mejora posterior, no v1.
- Fallback: polling 60s permanece como recuperación. Orden de consumo: SSE → error → backoff →
  reconciliación por API. Nunca duplicar: id de evento = `notification.id`; cliente ignora
  repetidos (Set de últimos 200).
- Seguridad: `userId` siempre de sesión, nunca de query; sin broadcast; sin datos sensibles en
  `title/body` (ya: solo `#REQ`, paso y comentario funcional del flujo); rate-limit de
  reconexiones en servidor (ventana por usuario).
- Consumo: 1 conexión idle por pestaña + heartbeat 25s; sin re-render salvo evento propio.

## 4. Riesgos

- Reinicio del API pierde el registro en memoria → reconciliación por API lo cubre (pérdida
  de inmediatez, no de datos).
- `EventSource` es unidireccional (suficiente: lectura usa PATCH existentes).
- Proxies corporativos que matan SSE → fallback polling automático.
