# Reglas de compatibilidad multiempresa (FASE 25)

## Estados

| Estado | Significado |
|---|---|
| COMPATIBLE | Todos los checks críticos pasan. Seleccionable. |
| COMPATIBLE_WITH_WARNING | Insertable, pero con advertencias visibles. Seleccionable. |
| INCOMPATIBLE | Al menos un motivo bloqueante. No seleccionable, con motivo. |
| DESHABILITADA | Apagada en Administración. No seleccionable, no cuenta como incompatible. |

## Checks evaluados (del preflight corporativo, por empresa)

BLOQUEANTES (inserción insegura): `IN_DIRECTORY`, `VALID_NAME`,
`CONNECTION`, `SCHEMA`, `REQUIRED_TABLES`, `REQUIRED_COLUMNS`, `TRIGGERS`,
`TRIGGER_COMPAT`, `REQUIRED_CATALOGS` (grupo, subgrupo, categoría, marca,
unidad, impuesto, proveedor, procedencia), `FK_DEPS` (sublínea→línea),
`DEFAULTS_01_GEN`, `DISCEN_ACCOUNTS` (cuentas en `C_DIST.dbo.sccuenta`,
contexto contable compartido), `SEQUENCE_CONFLICT`, `WRITE_PERMISSION`.

NO BLOQUEANTES (advertencia): `CODE_CONFLICTS` (código ocupado → al
insertar se omite como `YA_EXISTE`, sin INSERT) y diferencias de
**descripción** de catálogo vs estándar (ej. misma `FER` con otro nombre).

## Diferencias reales encontradas (artículo tipo FERMIS0662)

- `AD_LUBSL`: falta línea `FER` y sublínea `FER/MIS` → INCOMPATIBLE.
- `COR_A3`: tiene `FER/MIS` pero faltan `cat_art 01` y `colores 01`
  (defaults) → INCOMPATIBLE.
- `AD_DIST`, `AD_ROMA`, `AD_SLS`, `AD_TRANS`: todos los códigos + cuentas
  dis_cen → COMPATIBLE.

No se asume que un código signifique lo mismo en otra empresa: la
existencia se comprueba y la descripción se compara (warning si difiere).
