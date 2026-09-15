# FASE 14K.0 — Fix timeout de VERIFY (sin INSERT, flag OFF)

## Causa exacta

Doble hallazgo:

1. **Bug real y latente**: el SQL de VERIFY aplicaba `RTRIM()` sobre
   `dis_cen`, que es `text` → SQL Server responde `Argument data type text
   is invalid for argument 1 of rtrim function`. La verificación JAMÁS
   podía tener éxito (ni con flag ON). Reproducido con código productivo:
   `RECONCILIATION_ERROR` por `relectura no disponible`.
2. **Defecto de disponibilidad**: VERIFY leía por el pool de escritura, que
   exige flag ON. Con flag OFF (estado actual y obligatorio), verificar era
   imposible por diseño. El mensaje reportado (`Profit query error:
   operation timed out...`) no corresponde a ningún path actual (grep
   exhaustivo en dependencias y código propio; capas medidas sanas:
   tedious 90/8/7 ms, msnodesqlv8 69/35/15 ms, sin bloqueos en
   `sys.dm_exec_requests`); se trató como síntoma, no como diagnóstico.

## Archivos afectados

- `apps/api/src/modulos/profit/profit-adapter.service.ts`: nuevo
  `getArticleForVerify()` (solo lectura, pool READ) con
  `CAST(ISNULL(dis_cen,'') AS VARCHAR(MAX))`.
- `apps/api/src/modulos/profit/profit-article-creation.service.ts`:
  `verifyAndReconcile()` lee por el adapter READ (misma base/destino);
  el flag gobierna únicamente el INSERT.
- `apps/api/src/modulos/profit/profit-write.adapter.ts`: mismo fix
  `CAST` en su lector (latente, misma causa).
- `apps/api/test/profit-creation-14e.spec.ts`: fakes con
  `getArticleForVerify`.

## Driver / timeout

tedious (READ) y msnodesqlv8+ODBC18 (WRITE) sin cambios; timeouts
10 s/15 s intactos (sin aumentos arbitrarios); sin retries nuevos.

## Consulta VERIFY

`SELECT TOP 1` con TRIM por PK `co_art` (seek) + reconciliación campo a
campo en el motor. Liviana por construcción.

## Evidencia de prueba (código productivo, solo SELECT)

`verifyAndReconcile('FERMIS0662', payload REQ-0055)` → `NOT_FOUND`,
`[]` diferencias, 3.5 s en frío (incluye conexión). FERMIS0662 sigue
disponible. Flag OFF durante toda la fase.

## Confirmaciones

1. VERIFY funciona (vía READ, sin flag). 2. Windows Auth real intacta.
3. FERMIS0662 disponible. 4. Flag false. 5-8. Sin INSERT/UPDATE/DELETE/
cambios en Profit. 9. Backend 371/371, panel 7/7, `tsc` OK, `nest build`
OK. 10. Health 200.

## Estado final

Rebuild listo en `dist`; la API en ejecución aún corre el build previo
(reinicio = acción del usuario). Sin cambios de workflow/RBAC/contabilidad/
almacén/VM/AF/SSE. Semáforo UI intacto (verde solo con VERIFY real).
