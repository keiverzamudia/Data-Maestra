# FASE 14K.5 — Módulo Profit operativo definitivo (SIN INSERT, flag OFF)

## Cambios realizados

**Backend** (`apps/api/src/modulos/`):
- `profit/profit-article.payload.ts`: `buildInsertStatement()` puro (14
  columnas, `dis_cen` VARCHAR(8000), sin TEXT).
- `profit/profit-write.adapter.ts`: `insertArticle` usa el builder (mismo
  SQL/valores, binding por kinds).
- `profit/profit-article-creation.service.ts`: `ALREADY_REGISTERED`
  (existente con nuestros datos → éxito sin duplicar; ajeno → avanza).
- `solicitudes/solicitud.service.ts`: lock en memoria + transición atómica
  `updateMany(APROBADO_FINAL→PROCESANDO)` (409 si pierde); `requestProfitRetry`
  (ERROR_PROFIT → revalida → APROBADO_FINAL con nueva correlación, nunca
  escribe); `profitAttempts` (historial por correlationId + verificaciones).
- `solicitud.controller.ts`: `GET profit-attempts` (REQUEST.VIEW),
  `POST profit-retry` (PROFIT.WRITE).

**Frontend**: confirmación textual (`REGISTRAR EN PROFIT`), historial de
intentos, retry UI, botón Preparar registro, badge de estado operativo
(`profitOpState`: 10 estados), `ConfirmDialog` con hijos opcionales.

## Recovery / historial / idempotencia / timeout / colisión / VERIFY

- Recovery: retry-request valida todo y re-encola; sin él, ERROR_PROFIT es
  terminal para escritura. Intento #1 de REQ-0055 intacto.
- Historial inmutable por correlationId (intentos + colisiones + duración).
- Idempotencia: estado + transición atómica + lock + ALREADY_REGISTERED.
- Timeout: sin retry, VERIFY, UNKNOWN/RETRY_REQUIRED decide el humano.
- Colisión: solo 2627(+2601 acotado)+`art_co_art`; resto no avanza código.
- VERIFY obligatorio post-escritura, por adapter READ.
- Auditoría: STARTED/SUCCEEDED/FAILED/RESULT_UNKNOWN/COLLISION/VERIFY/
  RETRY_REQUESTED/RETRY_BLOCKED, sin secretos. Actor = humano (sesión;
  cuenta Windows solo conexión). Inactivos rechazados en sesión.

## UX / Windows Auth / Profit / REQ-0055 / flag

Panel operativo (artículo, códigos, validaciones, acciones, historial,
resultado, verify) con semáforo honesto; confirmación textual. Windows
(msnodesqlv8/ODBC18) y SQL preservados. REQ-0055 en ERROR_PROFIT sin tocar;
FERMIS0662 COUNT 0; total 11.192; flag OFF; health 200.

## Validación

Backend 383/383, frontend 157/157, `tsc` OK (ambos), ambos builds OK.

## Cómo recuperar un ERROR_PROFIT

Registro → Reintentar (revalida todo) → READY_TO_WRITE → nueva confirmación
textual → Registrar → VERIFY. Cada ciclo, nuevo correlationId e intento.

## Cómo ejecutar un INSERT real

`profit-retry` (si ERROR_PROFIT) o directo (si APROBADO_FINAL) → dry-run →
confirmación textual → `profit-create` → VERIFY. Requiere flag temporal,
permiso y sesión; todo auditado.
