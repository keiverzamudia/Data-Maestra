# FASE 14C-FORM — Maduración del formulario de artículo (implementada)

> Sin escritura a Profit. La futura escritura no debe descubrir faltantes post-aprobación.

## 1. Auditoría del formulario anterior (hallazgos)

- **El selector de tipo NO existía** (el encargo lo asumía implementado): sin UI,
  DTO, columna ni endpoint. Implementado desde Profit en esta fase.
- Unidad desde catálogo local (`PZA/LT/KG/M`), no Profit; opcional y sin validar.
- Sin `tipo_imp` (ni endpoint `tabulado`); sin `procedenci/prov/tipo_cos`.
- `POST /warehouse/:id/classify` sin DTO validado (`Record<string,unknown>`).
- Correcto y conservado: grupo/subgrupo Profit con validación compuesta,
  categoría/marca independientes, `co_imp` ausente, sin campos generados.

## 2. Clasificación de datos Profit (principio §2)

| Dato | Clase | Tratamiento |
|---|---|---|
| descripción | A (persona/solicitante) | Solo lectura en Almacén; normalizada en dry-run |
| tipo | A+B (Warehouse + Profit) | Selector desde `CK_art_TIPO` + uso; default de línea sugerido, override manual |
| grupo/subgrupo | B (Profit) | Selectores Profit, combinación compuesta validada |
| unidad venta | B (Profit) | Selector `dbo.unidades`, requerido, verificación viva (fail-closed) |
| tipo_imp | D (derivado) | Regla C/V→1, S→6; editable con advertencia (excepciones reales S→1/4/5) |
| categoría | A opcional | Independiente; `01 = NO APLICA` explícito, vacío ≠ NO APLICA |
| co_imp | F | No existe en el formulario |
| fecha_reg/rowguid/stocks | C | No visibles |
| fabricante/modelo/partN°/aplicación | A | Texto libre, sin cambios |

## 3. Implementado

- **Tipos desde Profit**: `GET /profit/article-types` (CHECK + uso),
  `GET /profit/groups/:code/default-type`, `GET /profit/tax-types`,
  `GET /profit/units` (ya existía, ahora consumido). Sin listas manuales, sin MP.
- **Formulario Almacén**: selector tipo (funcionales + reservados), default por
  línea con preservación de override (`articleTypeManual`), unidad Profit
  requerida, impuesto derivado/editable con advertencia, panel
  **«Datos listos para Profit»** y botón **«Validar artículo»** (dry-run real).
- **Backend**: `RequestData.articleType/articleTypeManual/taxType/unitCode`,
  `CatalogGroup.defaultArticleType` (columna, sin seed aún); DTO con dominios;
  `POST /warehouse/:id/validate` sin escritura; gate en approve exige
  tipo+unidad+impuesto (§23); auditoría CLASSIFIED ampliada.
- **Detalle**: muestra tipo (manual), unidad Profit e impuesto.

## 4. Matriz de responsabilidad (§21) y edición por estado (§20)

| Campo | Solicitante | Almacén | Contabilidad | Master/Final | Profit |
|---|---|---|---|---|---|
| descripción | captura | lectura | lectura | lectura | genera `co_art` (futuro) |
| tipo/grupo/subgrupo/unidad/impuesto | — | captura+edición | lectura | lectura | valida (trigger) |
| cuentas c1..c10 | — | — | captura | lectura | — |
| todo | — | — | — | solo revisión | — |

Editable solo en `PENDIENTE_ALMACEN`/`ALMACEN_APROBADO` (clasificación) y
`PENDIENTE_CONTABILIDAD` (cuentas). `PROCESANDO_PROFIT`+ bloqueado (futuro).

## 5. Verificación

- Backend: 323/323, typecheck OK. Web: 126/126, typecheck + build OK.
- Endpoints nuevos contra Profit real: PENDIENTE de reinicio de API por el
  usuario (`.\scripts\api-restart.ps1`), ya que el servicio en ejecución tiene
  el código anterior (AGENTS.md §12: el agente no reinicia).
