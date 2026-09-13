# FASE 14F.2 — Módulo completo de registro controlado en Profit

> Funcionalidad completa con escritura real bloqueada (`PROFIT_WRITE_ENABLED=false`,
> permiso sin otorgar, sin destino configurado). 0 INSERT/UPDATE/DELETE.

## Flujo implementado

`APROBADO_FINAL → dry-run (plan) → confirmación humana → PROCESANDO_PROFIT →
INSERT → VERIFY → REGISTRADO_PROFIT | ERROR_PROFIT` (+ `profit-verify` posterior,
solo lectura, sin cambiar estados; la recuperación es una nueva creación).

## Backend

- `POST /requests/:id/profit-plan` (DASHBOARD.VIEW): payload + candidato +
  disponibilidad + warnings, sin escribir (lecturas por adapter READ).
- `POST /requests/:id/profit-create` (PROFIT.WRITE): gates + transiciones +
  auditoría `PROFIT_CREATE_RESULT` (§20, sin secretos).
- `POST /requests/:id/profit-verify` (PROFIT.WRITE): reconciliación de un
  co_art contra lo esperado + auditoría `PROFIT_VERIFY`.
- `RequestData.brandCode` (migración aplicada) para `co_color`.
- Permiso `PROFIT.WRITE`: fila creada en seed y en BD dev, **sin otorgar**.

## Frontend

- `api-profit-registration-service` (plan/create/verify + etiquetas ES).
- `ProfitRegistrationPanel` (Enterprise): dry-run, candidato+payload,
  confirmación explícita, cadena de intentos (colisión→siguiente), badges de
  reconciliación, errores en español, verificación posterior. Montado en
  detalle de solicitud y validación maestra (solo estados finales).
- Botón de registro oculto sin `PROFIT.WRITE` (backend re-valida).

## Validación

- Backend 354/354 (orquestación: gates, fail-fast sin cambiar estado,
  transiciones, verify). Web 136/136 (panel: 3). `tsc` + `nest build` +
  `vite build` OK.
- Siguiente (14F.3): destino + cuenta + otorgar permiso + restart usuario →
  dry-run → confirmación → INSERT → VERIFY → flag off.
