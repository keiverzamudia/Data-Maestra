# FASE 14F — Registro controlado Data-Maestra → Profit (módulo completo)

> Implementado y validado. **NO se ejecutó INSERT real** (§46: solo preparar).
> Escritura bloqueada: flag false + permiso sin otorgar + sin destino.

## 1. Por qué no se veía el módulo (§2/§40)

El panel existía (14F.2) pero: solo se montaba en estados finales (correcto)
y el botón exigía `PROFIT.WRITE`, permiso que nadie posee → acción invisible
en la práctica. Además no había señal de escritura deshabilitada. Ahora el
panel es visible siempre en estados finales con estado explícito.

## 2. Módulo visible (§3–§4, §39–§41)

`ProfitRegistrationPanel` en detalle de solicitud y validación maestra
(APROBADO_FINAL/PROCESANDO/REGISTRADO/ERROR). Con flag off: banner
"ESCRITURA DESHABILITADA" + botón deshabilitado con motivo (§3). Resumen
previo §28 (Master, Profit previsto, descripción, línea, sublínia, unidad,
contabilidad, estado). Confirmación §26 textual. Post-resultado: cadena de
intentos, reconciliación, "Verificar y reintentar" manual (§43), y ante
incertidumbre solo VERIFY, sin re-registro (§44).

## 3. INSERT (14 columnas explícitas, parametrizeado)

`co_art, art_des, tipo, co_lin, co_subl, uni_venta, suni_venta, tipo_imp,
co_cat, co_color, procedenci, co_prov, tipo_cos, dis_cen`. Generados por
Profit (fecha_reg, rowguid, stocks, auditoría) no se envían; funcionales
siempre con valor DM real (§12). `co_art={LIN}{SUBL}{NNNN}`, sin guion,
independiente de `master_code` (§8–§9). Existencia por PK + 2627+art_co_art
(2601 solo si menciona co_art) → siguiente candidato, máx. 10 (§10, §36).
Trigger `suni_venta` validado antes; su error → controlado sin retry (§13).
FK compuesta (línea,sublínea), sublíneas no globales (§14–§15).

## 4. Origen DATA-MAESTRA (§17–§19, solo SELECT)

`campo1-8` (varchar 60, uso legacy ~1 % con valores codificados `F1/E2`,
semántica desconocida) y `atributo1-6` (bit) **no son claramente adecuados**:
NO se usan. `co_us_in` no se falsifica. Trazabilidad oficial en `AuditEvent`
DM con `DM-PROFIT-AAAAMMDD-NNNNNN` (derivado de requestNumber único).

## 5. Seguridad y workflow (§5–§6, §21, §25, §31–§32, §34–§35)

Backend exige APROBADO_FINAL + PROFIT.WRITE + flag + payload; idempotencia
por estado (REGISTRADO no re-inserta). Sin UPDATE/DELETE/ALTER/DROP/MERGE
(no existen los métodos). `GET /profit/write-status` solo lectura.
Conexión de escritura separada sin fallback (las reglas §1 prevalecen sobre
§31: reutilizar credenciales read-only está prohibido). Dry-run READY/
NOT_READY con motivo (§33). Estados §21 exactos; timeout → RESULT_UNKNOWN +
VERIFY (§22–§23). Auditoría §24 con actor, duración e intentos, sin secretos.

## 6. Validación

- Backend 357/357, web 137/137. `tsc` + `nest build` + `vite build` OK.
- Casos §47 cubiertos (bloqueos, colisión, FK, trigger, timeout,
  idempotencia, verificación, 403 por permiso en ruta).
- Primer INSERT real: NO ejecutado. Requiere (usuario): destino + cuenta +
  otorgar permiso + restart + dry-run + confirmación + flag temporal.
