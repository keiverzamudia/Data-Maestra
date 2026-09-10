# FASE 14C — Diseño técnico de artículos + tipo desde Profit (SIN implementar)

> Preparatorio para futura escritura. Esta fase no escribe en Profit ni cambia código.
> Evidencia base: 14A (estructura y tipos), 14B (impuestos, triggers, contrato conceptual).

## 1. Tipo de artículo desde Profit (fuente maestra sin tabla)

`art.tipo` no tiene tabla catálogo. La fuente maestra es la restricción
`CK_art_TIPO` (`V/F/C/S/M/N/E`), legible vía metadata:

```sql
SELECT definition FROM sys.check_constraints WHERE name='CK_art_TIPO';
```

Diseño (futura fase): `ProfitAdapter.getArticleTypes()` = parsea el CHECK +
cruza con `SELECT tipo, COUNT(*) FROM art GROUP BY tipo` (uso real). Sincroniza a
tabla local `CatalogArticleType { code, label, description, inUse, sourceSystem='PROFIT',
sourceCode, syncedAt }`. Sin lista manual: si Profit agrega un valor al CHECK,
aparece solo. Etiquetas visibles ES en DM (Consumible/Servicio/Venta + reservados),
código interno intacto. MVP expone C/S/V.

## 2. Tipo predeterminado por línea + override por solicitud

- Default: `CatalogGroup.defaultArticleType` (derivado del tipo dominante de la
  línea, recalculable; ej. VEH→C) + `defaultTax`/`defaultCost` por línea.
- Override: la solicitud guarda `requestedArticleType`; Almacén puede cambiarlo
  dentro del dominio CHECK; validación: `tipo_imp` coherente (S→6 salvo justificación).
- Nunca imposición: V/C conviven en la misma línea (evidencia 14A).

## 3. Modelo del nuevo artículo (payload futuro)

Obligatorio DM: `co_art` (generado, único ≤30, pre-verificado con
`getArticle()`), `art_des`, `tipo`, `co_lin`, `co_subl`, `uni_venta=suni_venta`,
`tipo_imp`. Condicional: `co_cat` (`01`), `co_color` (`01`), `procedenci` (`01`),
`co_prov` (`GEN`), `tipo_cos` (ULCO/ULOM), `dis_cen` (estándar de línea o vacío).

## 4. Validación pre-escritura (dry-run obligatorio)

1. Catálogos existen (línea, sublínea compuesta, tasa, unidad). 2. `co_art`
   inexistente. 3. Dominio CHECK. 4. `suni_venta` ∈ unidades (trigger).
   Todo en modo simulación primero; luego transacción con idempotencia
   (`co_art` como clave natural + marca `sourceSystem='DATA-MAESTRA'` si se
   acuerda columna) y relectura de verificación (`fecha_reg, rowguid, xart_cont`).

## 5. Auditoría y permisos futuros

Acciones `PROFIT_ARTICLE_DRYRUN/PROFIT_ARTICLE_CREATED/FAILED` con payload (sin
secretos), permiso nuevo `PROFIT.WRITE` separado del READ, adapter de escritura
aislado del de lectura, rollback/compensación documentada, credencial con permiso
mínimo. Requiere fase explícita con pruebas sobre copia de Profit (skill
profit-integration, AGENTS.md §2).

## 6. Lo que NO incluye esta fase

Ningún cambio de schema, endpoints, UI, workflow, RBAC ni adapter. Solo diseño.
