# Flujo de inserción multiempresa (FASE 25)

## Orden

1. `Analizar compatibilidad` (solo lectura = DRY RUN).
2. Preselección automática de compatibles habilitadas (desmarcable).
3. Expandir `Ver detalles` por empresa (15 checks + motivos + warnings).
4. `Continuar` → resumen (artículo, empresas, conteo) + advertencia de
   irreversibilidad → `Insertar en N empresa(s)`.
5. Backend, por empresa y en orden: config → **revalidación fresca**
   (preflight del artículo) → `articleExists` (`YA_EXISTE`, sin INSERT) →
   INSERT parametrizado → verificación de lectura → auditoría.
6. Resultado por empresa (`INSERTADO` / `YA_EXISTE` /
   `OMITIDA_NO_COMPATIBLE` / `OMITIDA_DESHABILITADA` / `ERROR`).
   Éxito solo si todas terminan `INSERTADO` o `YA_EXISTE`; si no, parcial
   explícito (lo insertado queda insertado: sin rollback falso).

## Reglas

- Mismo `co_art` en todas (candidato universal del estándar + 1).
- Nunca un SQL para todas las bases: una operación por empresa.
- Flag `PROFIT_WRITE_ENABLED=false` bloquea antes de cualquier SQL;
  `PROFIT.WRITE` exigido; SAME vinculado bloquea (`Conflict`).
- Estado solicitud: `CONTABILIDAD_APROBADA` → `PROCESANDO_PROFIT` (claim
  atómico) → `INSERTADO_PROFIT` (todo ok) o `ERROR_PROFIT` (parcial/error);
  `profitCode` se guarda si al menos una empresa lo registró.
- DRY RUN de esta fase: análisis + tests con fakes; INSERT reales: 0.

## Permisos

| Operación | Permiso |
|---|---|
| Ver empresas / analizar | DASHBOARD.VIEW |
| Insertar | PROFIT.WRITE (+ flag) |
| Habilitar/deshabilitar, estándar | ADMIN.MANAGE |
