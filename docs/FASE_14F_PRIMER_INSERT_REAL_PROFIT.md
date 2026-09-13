# FASE 14F — Primer INSERT real: ABORTADA en pre-flight (0 escrituras)

> No se ejecutó ningún INSERT. No se modificó código, config ni Profit.
> Criterio §28: configuración incompleta + permiso inexistente → DETENER.

## Pre-flight (evidencia)

| Gate | Resultado |
|---|---|
| §1 API con código 14E | OK — health 200, `POST /requests/:id/profit-plan` existe (401 sin auth), dist incluye el motor |
| §2 `PROFIT_WRITE_ENABLED=false` | OK al inicio (no se tocó) |
| §3 Destino de escritura | FALTA — no existen `PROFIT_WRITE_SERVER/DATABASE/USER/PASSWORD` en ningún `.env`; el motor lo rechaza por diseño (503) |
| §4 Cuenta técnica mínimo privilegio | NO CONFIRMABLE — no hay cuenta ni destino; crear logins sería DDL sobre Profit (fuera de alcance) |
| §5 Operador con `PROFIT.WRITE` | IMPOSIBLE — el permiso ni siquiera existe en la BD (seed de 14 permisos nunca re-ejecutado); otorgado a 0 roles, 0 usuarios |
| §6 Solicitud APROBADO_FINAL | Hay 5 candidatas (REQ-0055…REQ-0042), no seleccionada (inoficioso sin destino) |
| §7–§12 Dry-run/confirmación | NO EJECUTADOS (inoficioso; además requieren auth de operador) |

## Para desbloquear (acciones humanas/DBA, en orden)

1. DBA crea el login técnico SQL en `SRVBDPROFITBK` con GRANT `INSERT, SELECT`
   sobre `dbo.art` (+SELECTs de validación) y nada más; entregar credenciales
   por canal seguro.
2. Agregar a `apps/api/.env.local`: `PROFIT_WRITE_ENABLED=false` (ya está),
   `PROFIT_WRITE_SERVER/DATABASE/USER/PASSWORD`.
3. Re-ejecutar seed o crear permiso `PROFIT.WRITE` y otorgarlo al rol operador
   (ninguno hoy).
4. Usuario: `.\scripts\api-restart.ps1` y confirmar health 200.
5. Re-invocar esta fase: dry-run → confirmación humana → `=true` temporal →
   INSERT → VERIFY → `=false`.
