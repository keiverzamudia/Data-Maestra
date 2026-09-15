# FASE 14J — Windows Auth + UX operativa de Registro en Profit

> Windows Authentication REAL funcionando. UX con 8 estados.
> **NO se ejecutó INSERT real.** Flag OFF.

## 1. Problema original

tedious v20 ignora `trustedConnection` (ELOGIN medido); NTLM exige password.
SSMS funciona porque es otro cliente.

## 2. Solución

Driver nativo `msnodesqlv8` (nueva dependencia, documentada: única vía
SSPI real en Node/Windows) + ODBC Driver 18, vía wrapper `mssql/
msnodesqlv8` (misma API: pool/request/input/recordset; `err.number`
propagado — el detector estricto 2627 no cambió).

## 3. Modos

`PROFIT_WRITE_AUTH=windows|sql` (default sql = conducta histórica).
Windows: sin USER/PASSWORD, identidad del proceso API. SQL: credenciales
explícitas obligatorias. Cambio futuro solo-configuración (§27).

## 4. Configuración

`.env.local`: AUTH=windows, SERVER/DATABASE Profit, flag OFF, sin secretos.
`APPLICATION_NAME`: el código no lo usa (node-mssql envía el suyo); no se agregó.

## 5. Flujo de estados UX

Config bloqueada (gris) · ESCRITURA DESHABILITADA · READY checklist sin
verde · confirmación textual §16 · REGISTRANDO honesto · éxito verde solo
con VERIFY + correlation + Ver detalle · error real + acción recomendada ·
incierto solo-VERIFY · NOT_FOUND explícito. Botón "Registrar en Profit",
diálogo "Confirmar registro".

## 6. Seguridad/auditoría/workflow

Sin cambios: gates, AuditEvent §24, actor humano, sin UPDATE/DELETE/DDL,
estados existentes. `testConnection` solo-SELECT (no habilita nada);
`write-status` extendido sin secretos. Campo origen: trazabilidad en DM
(campo1 con valores codificados desconocidos: no adecuado).

## 7. Pruebas y validación

- Backend 371/371 (modos auth, fail-closed, motor), frontend 153/153
  (8 estados, permisos, botón bloqueado), `tsc` OK, ambos builds OK.
- En vivo: API reiniciada (build OK, health 200), rutas con guardias,
  conexión Windows real como CORPOAGROCA\desarrollador02, FERMIS0662 libre,
  REQ-0055 APROBADO_FINAL, dry-run READY.

## 8. Primer INSERT

Pendiente solo de confirmación humana explícita (barrera vigente).
