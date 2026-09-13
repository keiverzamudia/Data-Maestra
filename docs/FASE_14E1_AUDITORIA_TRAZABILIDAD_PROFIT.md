# FASE 14E.1 — Auditoría y trazabilidad Data-Maestra → Profit (SOLO ANÁLISIS)

> Cero escrituras. Solo SELECT + metadata sobre la base original + lectura de
> código DM. Sin cambios de código, sin cambios en Profit.

## 1. Cómo Profit identifica usuarios (evidencia)

- `dbo.art` tiene `co_us_in/fe_us_in, co_us_mo/fe_us_mo, co_us_el/fe_us_el`
  (char 6 + datetime) y `co_sucu` (char 6). **Todos con defaults**
  (espacio / fecha actual): un INSERT sin ellos crea la fila con identidad
  en blanco; nada los rellena solo.
- Los valores reales son códigos de la APLICACIÓN Profit (`ACAST`, `EAGU`,
  `CMEND`…): no existe tabla de usuarios en ningún esquema de `AD_TRANS`
  (solo `dbo`; sin `usu/users/opera`). El registro de usuarios vive fuera
  de esta base y no es validable desde aquí.
- Triggers `TrigI/U_art` (texto completo verificado): solo validan
  `suni_venta`; **cero uso** de `SYSTEM_USER/APP_NAME/HOST_NAME/SESSION_CONTEXT`.
- Sin tabla de auditoría de artículos (`flota_bitacora` es flota;
  `hist_plan` es planificación productiva).

## 2. Qué identidad ve SQL Server

Medido en la conexión real: login `solicitudweb`, app `node-mssql`,
host `SRVBDPROFITBK`. Es decir: **solo la cuenta técnica**. Ningún humano
de Profit o DM es visible a nivel SQL.

## 3. Respuestas al criterio (§18)

1. ¿Profit registra quién crea? A nivel fila, **solo si el escritor envía**
   `co_us_in/co_sucu`; si no, blanco. No hay bitácora de INSERTs de art.
2. ¿App o SQL? La **aplicación** (envía los códigos); SQL/triggers no
   aportan identidad.
3. ¿INSERT directo conserva identidad? **No automáticamente**: conserva
   exactamente lo enviado; la identidad SQL es la cuenta técnica.
4. ¿Qué identidad queda? La enviada en `co_us_in` (o blanco) + login técnico
   en logs del servidor (fuera de la tabla).
5. ¿Qué conserva DM? Todo: payload enviado, candidato, intentos, actor,
   aprobaciones, resultado, relectura, duración, correlationId.
6. ¿Relación solicitud↔co_art? En DM: `requestId + masterCode + co_art +
   correlationId` (Profit no tiene campo: no se modifica).
7. ¿Qué cuenta? **Técnica SQL dedicada** (`PROFIT_WRITE_*`): solo
   INSERT+SELECT sobre `dbo.art` (+SELECTs de validación), sin UPDATE/
   DELETE/DDL/admin. Jamás credenciales personales.
8–11. Eventos §12–§14 con `co_art`, intento, errorCode, mensaje sanitizado,
   duración y correlationId; colisión registra la cadena
   candidato→colisión→siguiente→final; timeout registra `INSERT_ATTEMPTED /
   RESULT_UNKNOWN` + `VERIFY` posterior (nunca "falló" a secas).

## 4. Prohibición de falsificar (§15) y decisión co_us_in

NO enviar códigos de usuarios humanos Profit. Decisión: dejar los defaults
(blanco) y que DM conserve la identidad. Opción futura (fase explícita):
crear en la UI de Profit un usuario técnico real (p. ej. `DMAESTRA`) y
enviar **ese** código —representa a la integración, no suplanta a nadie—.

## 5. Diseño DM (sin implementar: reutiliza AuditEvent)

Cadena `USER → REQUEST → APPROVALS → PROFIT_CREATE_RESULT → co_art` con
`correlationId` formato `DM-PROFIT-AAAAMMDD-NNNNNN` en `AuditEvent`
(`correlationId`, actor, `afterData` con payload+resultado; secretos jamás).
Aprobación y ejecución registradas por separado aunque sea la misma persona
(§10). Payload completo persistido = EXPECTED reconstruible (§11).
Resultados: `CREATED_AND_VERIFIED, CREATED_WITH_DIFFERENCES,
CODE_COLLISION_RESOLVED, BLOCKED, PROFIT_ERROR, RECONCILIATION_ERROR,
AMBIGUOUS_RESULT` (§12).

## 6. NO DETERMINADO read-only

Si la app Profit valida `co_us_in` contra su registro externo al grabar
desde UI (probable pero no observable sin escribir): NO DETERMINADO.
Tampoco observable: reacción de pantallas Profit ante `co_us_in` en blanco.
Para determinarlo haría falta entorno de prueba con escritura o
documentación funcional de Profit Plus 2K8.
