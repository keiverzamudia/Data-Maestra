# FASE 16A — Reestructuración: Contabilidad es la última aprobación humana

> **"Contabilidad es la última aprobación humana."**

## 1. Flujo anterior

```
BORRADOR → PENDIENTE_GERENTE → PENDIENTE_ALMACEN → ALMACEN_APROBADO
→ PENDIENTE_CONTABILIDAD → PENDIENTE_VALIDACION_MAESTRA → APROBADO_FINAL
→ PROCESANDO_PROFIT → REGISTRADO_PROFIT (ERROR_PROFIT rama técnica)
```
Con módulo `revision-final` (cola `PENDIENTE_VALIDACION_MAESTRA`),
rol `FINAL_REVIEWER` + permiso `FINAL_REVIEW.APPROVE`, y Profit como
módulo standalone (`/profit/registro`, `RegistroProfitPage`).

## 2. Flujo nuevo

```
BORRADOR → PENDIENTE_GERENTE → PENDIENTE_ALMACEN → ALMACEN_APROBADO
→ PENDIENTE_CONTABILIDAD → CONTABILIDAD_APROBADA
→ PROCESANDO_PROFIT → INSERTADO_PROFIT (ERROR_PROFIT rama técnica)
```
Devolución Contabilidad → `PENDIENTE_ALMACEN` (ya era así, se conserva).
Rechazo → `RECHAZADO` (se conserva). Lo posterior a `CONTABILIDAD_APROBADA`
es exclusivamente técnico (motor Profit, sin APPROVE).

## 3. Estados eliminados / conservados

- Eliminados del flujo activo: `PENDIENTE_VALIDACION_MAESTRA`,
  `APROBADO_FINAL`, `REGISTRADO_PROFIT` (fuera de `WORKFLOW_STATES`,
  secuencia, transiciones y terminales).
- Nuevos: `CONTABILIDAD_APROBADA` (puerta a Profit, no terminal),
  `INSERTADO_PROFIT` (terminal, solo tras INSERT + VERIFY).
- Conservados: `BORRADOR`, `PENDIENTE_GERENTE`, `PENDIENTE_ALMACEN`,
  `ALMACEN_APROBADO`, `PENDIENTE_CONTABILIDAD`, `PROCESANDO_PROFIT`,
  `ERROR_PROFIT`, `DEVUELTO`, `RECHAZADO`.
- Terminales: `BORRADOR`, `INSERTADO_PROFIT`, `RECHAZADO`.

## 4. Responsabilidades

Almacén prepara/clasifica → Encargado revisa/aprueba → Contabilidad valida
todo (grupo, subgrupo, master, estándar Profit, posiciones, códigos) y es la
última aprobación humana → el mismo usuario registra en Profit desde la
pestaña integrada. Sin `FINAL_REVIEWER` operativo.

## 5. RBAC

- Eliminados: rol `FINAL_REVIEWER`, permiso `FINAL_REVIEW.APPROVE`
  (seed + backfill; ya no se crean).
- Viven: `ACCOUNTING`/`ACCOUNTING.VIEW`/`ACCOUNTING.APPROVE` + `PROFIT.WRITE`
  independiente. Flujo completo exige ambos en el mismo usuario; sin
  `PROFIT.WRITE` se aprueba pero el panel muestra denegación explícita
  («Contabilidad aprobada. No tiene permiso para registrar en Profit.»).
- Migración viva: membresía `FINAL_REVIEWER` de ASANDR desactivada
  (`active=false`, fila preservada), enlaces y rol eliminados, permiso
  eliminado (cascada). Sin overrides huérfanos (no existían).

## 6. Transición Contabilidad → Profit

`ContabilidadService.approve` delega `APPROVE` (destino automático
`CONTABILIDAD_APROBADA`); el frontend permanece en el workspace y abre la
pestaña Profit. Aprobar NO escribe en Profit. Gates de escritura intactos con
nuevo estado: `CONTABILIDAD_APROBADA` + `PROFIT.WRITE` + flag + payload +
`co_us_in=DM`; éxito → `INSERTADO_PROFIT`; retry re-encola a
`CONTABILIDAD_APROBADA`. Motor (driver, VERIFY, idempotencia, retry, locks,
colisiones, correlation ID, auditoría) sin cambios.

## 7. Pestañas

Detalle de Contabilidad: `[Información] [Contabilidad(✓)] [Registro en
Profit(🔒)]` (componente `Tabs` reutilizado, responsive por CSS global).
Profit bloqueada hasta `CONTABILIDAD_APROBADA` con mensaje explícito;
después renderiza `ProfitRegistrationPanel` existente (mismos estados
READY/WRITE/VERIFY/SUCCESS/ERROR/UNKNOWN/RETRY). Acciones de aprobar solo
visibles en `PENDIENTE_CONTABILIDAD`. `onChanged` recarga detalle y lista.

## 8. Seguridad

Backend autoridad en todo: guards por permiso efectivo, validación de estado
(`CONTABILIDAD_APROBADA` para Profit, 400 en otro caso), empresa, flag,
idempotencia y claim atómico. Sin bypass por URL (rutas eliminadas) ni por
tabs (el panel revalida; el backend decide).

## 9. Profit

Driver `msnodesqlv8`/ODBC18, `solicitudweb`/`AD_TRANS`/`dbo.art`, `co_us_in`
desde `PROFIT_INTEGRATION_USER_CODE=DM` (backend-only), `KZAMU` actor
funcional: todo intacto. **Cero escrituras de esta fase.**

## 10. Auditoría

Histórica intacta (eventos conservan valores antiguos). Nueva: `APPROVE`
hacia `CONTABILIDAD_APROBADA`, `PROFIT_WRITE_*`/`PROFIT_VERIFY`/
`PROFIT_RETRY_*`/`CODE_COLLISION_RESOLVED` con actor real y correlación.
Sin `ACCOUNTING_APPROVED` nuevo: el `APPROVE` existente es el equivalente.

## 11. SSE

Sistema intacto. `classify` → Encargado; Encargado → Contabilidad;
Contabilidad devuelve → Almacén; Contabilidad aprueba → solicitante
(notificación directa, sin cola humana nueva). Sin eventos VM/AF.

## 12. Migración (`prisma/migrate-reestructuracion-16a.js`, idempotente)

BD viva: 4 `PENDIENTE_VALIDACION_MAESTRA` → `CONTABILIDAD_APROBADA`,
26 `APROBADO_FINAL` → `CONTABILIDAD_APROBADA`,
3 `REGISTRADO_PROFIT` → `INSERTADO_PROFIT` (incluye REQ-0053/REQ-0055:
solo cambia el estado; códigos y auditorías intactos), 34 tareas de
workflow consolidadas por instancia (sin violar el unique), 0 restos,
0 duplicados. Resultado: `MIGRACION 16A: OK`.

## 13. Compatibilidad histórica

Solicitudes en `PROCESANDO_PROFIT`/`ERROR_PROFIT` conservan estado y
recuperación. `ERROR_PROFIT` re-encola a `CONTABILIDAD_APROBADA`.
Documentos de `docs/historial/` y fases pasadas no se reescriben;
vigentes actualizados (`MANUAL_DESARROLLADOR`, `MAPA_PROYECTO`,
`FLUJO_DATOS`, `GLOSARIO_PROYECTO`).

## 14. Limpieza (§27/§44)

Eliminados: módulo backend `revision-final`, páginas `RevisionFinalPage` y
`RegistroProfitPage` (+ tests), servicios final-review (api/mock),
`FinalReviewService`, rutas `/validacion-maestra`, `/aprobacion-final`,
`/final-review`, `/profit/registro`, 3 entradas de navegación, CTAs y jobs
del dashboard, spec `final-review.service.spec`. `StageTrace` reorientado a
Almacén/Contabilidad/Profit (lo usa `RequestSummary`).
