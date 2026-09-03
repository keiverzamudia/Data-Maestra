# Propuesta Contabilidad Data-Maestra — Fase 8D (solo diseño, no implementar)

> Propuesta futura de UI/flujo. NO crear código en 8D. Solo SELECT en Profit.

## Objetivo

Permitir a Contabilidad informar **máximo 10 posiciones** `c1..c10`, cada una con **una cuenta**, buscable por **código** y por **nombre**, vinculadas bidireccionalmente, guardando solo las seleccionadas y serializando exactamente `<DIS>{c1:...}{c7:...}</DIS>`.

## Flujo propuesto

```
Almacén clasifica → PENDING_ACCOUNTING
        ↓
Contabilidad abre tarjeta
        ↓
Ve: grupo/subgrupo/categoría + Validación Maestra checklist + imagen
        ↓
Sección "Distribución Contable" — 10 filas opcionales
┌─────────┬──────────────────────┬──────────────────────┐
│ Carpeta │ Cuenta             │  Acciones            │
│ c1 [▼]  │ [ 1.1.04.03.01.010 ▼] → Inventario repuestos... [x] │
│ c7 [▼]  │ [ 1.1.04.01.01.001 ▼] → Mercancias en tránsito  [x] │
│ + Agregar posición                                    │
└───────────────────────────────────────────────────────┘
        ↓
Aprobar → valida 1 cuenta por posición, sin duplicados, serializa <DIS>
        ↓
Si incompleto → Devolver a Almacén con comentario (misma UX 7G)
```

## Selector

| Requisito | Solución |
|---|---|
| Máximo 10 | Filas dinámicas `c1..c10` con `+ Agregar` deshabilitado en 10 |
| Cada posición una cuenta | `Select` carpeta `c1..c10` (literal, sin etiqueta DB hasta determinar) + `Combobox` cuenta |
| Buscar por código y nombre | `Combobox` con `filter` sobre `code` y `name` indistintamente. Ej. escribir `1.1.04` o `repuestos` encuentra `1.1.04.03.01.010 ↔ Inventario repuestos maquinaria` |
| Vinculado código↔descripción | Fuente `xart_cont` distinct: `cta1 1.1.04.03.01.010 ↔ nom_cta1 Inventario...`. Seleccionar código autocompleta nombre y viceversa (mismo objeto). No dos inputs separados |
| Solo cuentas existentes | Lista proviene de `SELECT DISTINCT cta, nom_cta FROM xart_cont` + parse `art.dis_cen` (53+35 cuentas verificadas). No `Crear cuenta`. Si Profit agrega cuenta nueva y aparece en `xart_cont`, aparece automáticamente tras refresh |
| Opcional | Filas vacías se omiten en serialización. `<DIS></DIS>` si ninguna |
| Validación | No duplicar carpeta (una `c1` por tarjeta), no duplicar cuenta en posiciones distintas (advertir), formato `d.d.dd.dd.dd.ddd` con puntos (regex, pero sin rechazar si Profit lo acepta) |

## Datos

| Campo Profit | Origen READ-ONLY | Uso Data-Maestra |
|---|---|---|
| `art.dis_cen` | `SELECT dis_cen FROM art WHERE co_art=?` | Lectura inicial para precargar filas (parse `<DIS>{cN:code}`) |
| `xart_cont.ctaN` / `nom_ctaN` | `SELECT DISTINCT cta1, nom_cta1 FROM xart_cont UNION ...` | Catálogo buscable. 53 cta1 + 35 cta8 etc. Mejor que `art.dis_cen` porque ya trae `nom_cta` |
| Etiqueta `c1` | **NO DETERMINADO** — usar literal `c1` en primera versión; cuando se determine tabla origen, reemplazar por `par_emp`/`spescena` si aparece | Mostrar `c1` en selector carpeta |
| Catálogo maestro completo | **NO DETERMINADO** — usar usados como aproximación; si se encuentra `puc` maestro, cambiar `FROM xart_cont` a `FROM puc` sin cambiar UI |

## Serialización (para 9D)

```ts
function serialize(positions: {c: 'c1'..'c10', code: string}[]): string {
  const sorted = positions.filter(p=>p.code).sort((a,b)=> parseInt(a.c.slice(1))-parseInt(b.c.slice(1)));
  // validar duplicados, 1 cuenta por posición
  return `<DIS>${sorted.map(p=>`{${p.c}:${p.code}}`).join('')}</DIS>`;
}
// Ej. [{c:'c1',code:'1.2.05.02.06.001'},{c:'c7',code:'1.1.04.01.01.001'}]
// → "<DIS>{c1:1.2.05.02.06.001}{c7:1.1.04.01.01.001}</DIS>"
```
Reglas: orden `c1..c10`, sin espacios, sin `{c2:}`, sin duplicados, wrapper `<DIS>`.

## Almacenamiento Data-Maestra (propuesta, no implementar en 8D)

- **Opción A (recomendada):** `RequestAccountingCode` ya existe (`requestId, code, description`). Extender con `position c1..c10` y guardar 1 fila por posición. Ventaja: ya tiene UI `ContabilidadList` con `codes` dinámicos. Solo añadir `position`.
- **Opción B:** Nuevo `request_dis_cen` con `dis_cen text` serializado + `positions jsonb`. Más fiel a Profit pero menos queryable.

Recomendada A para auditoría y búsqueda.

## Validación y errores

| Caso | UI |
|---|---|
| Buscar `2.1.03` no encuentra | `No hay coincidencias` (no crear) |
| Dejar `c1` vacío | No se serializa |
| Poner mismo código en `c1` y `c7` | Warning `Cuenta ya usada en c1` |
| Aprobar sin ninguna posición | Permitido (spec: no obligatorio llenar 10), pero checklist Validación Maestra puede marcar `⚠ Revisar` si empresa requiere mínimo |

## No hacer en 8D

- No importar cuentas a `CatalogCategory`.
- No crear `prisma` model ni migración.
- No endpoint `POST /accounting`.
- No React selector (solo esta propuesta).
- No `ProfitAdapter WRITE`.
- No distribución por centros de costo.
- No crear cuentas.

## Siguiente paso

**Fase 8E — Diseño Técnico** detallará endpoint `GET /profit/accounts`, `GET /accounting/:id` precarga, y `POST /accounting/:id/approve` con `positions` + serialización + auditoría.
