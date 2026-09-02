# Plan FASE 4D-1 — Consolidación Técnica

Fecha: 01 de septiembre de 2026
Estado: ANÁLISIS COMPLETADO — ESPERANDO CONFIRMACIÓN

---

## 1. Elementos analizados

### Card

| Campo | Valor |
|---|---|
| Ubicación | `apps/web/src/componentes/ui/index.tsx:18` |
| Definición | `export const Card:React.FC<{children:React.ReactNode; className?:string}>` |
| Imports activos | **0** — Ningún archivo importa `Card` |
| Reexports | Solo en el barrel `componentes/ui/index.tsx` |
| Uso en tests | **0** |
| Uso dinámico | **0** (no hay `window.Card`, ni string references) |
| Documentación | Mencionado en `AUDITORIA_ACTUAL.md` como "funcional" |
| Decisión | **SEGURO_ELIMINAR** |

### FilterBar

| Campo | Valor |
|---|---|
| Ubicación | `apps/web/src/componentes/ui/index.tsx:42` |
| Definición | `export const FilterBar:React.FC<{children:React.ReactNode}>` |
| Imports activos | **0** — Ningún archivo importa `FilterBar` |
| Reexports | Solo en el barrel `componentes/ui/index.tsx` |
| Uso en tests | **0** |
| Uso dinámico | **0** |
| Documentación | Mencionado en `AUDITORIA_ACTUAL.md` como "funcional" |
| Decisión | **SEGURO_ELIMINAR** |

### MasterService

| Campo | Valor |
|---|---|
| Ubicación | `apps/web/src/contratos/index.ts:83` |
| Definición | `export interface MasterService { list(); getById(); }` |
| Imports activos | **0** — Ningún archivo importa `MasterService` |
| Reexports | Solo en el barrel `contratos/index.ts` |
| Uso en tests | **0** |
| Uso dinámico | **0** |
| Documentación | Mencionado en `PENDIENTES_LIMPIEZA.md` |
| Decisión | **SEGURO_ELIMINAR** |

### SourceService

| Campo | Valor |
|---|---|
| Ubicación | `apps/web/src/contratos/index.ts:100` |
| Definición | `export interface SourceService { list(); sources; sourceMaps; }` |
| Imports activos | **0** — Ningún archivo importa `SourceService` |
| Reexports | Solo en el barrel `contratos/index.ts` |
| Uso en tests | **0** |
| Uso dinámico | **0** |
| Documentación | Mencionado en `PENDIENTES_LIMPIEZA.md` |
| Decisión | **SEGURO_ELIMINAR** |

---

## 2. Resumen de eliminaciones

| Elemento | Ubicación | Referencias | Decisión |
|---|---|---|---|
| `Card` | `componentes/ui/index.tsx:18` | 0 imports | SEGURO_ELIMINAR |
| `FilterBar` | `componentes/ui/index.tsx:42` | 0 imports | SEGURO_ELIMINAR |
| `MasterService` | `contratos/index.ts:83` | 0 imports | SEGURO_ELIMINAR |
| `SourceService` | `contratos/index.ts:100` | 0 imports | SEGURO_ELIMINAR |

---

## 3. Cambios a realizar

### Archivo 1: `apps/web/src/componentes/ui/index.tsx`

Eliminar 2 exports muertos:
- Línea 18: `export const Card:...`
- Línea 42: `export const FilterBar:...`

Conservar todos los demás exports (PageHeader, Button, Input, Select, etc.)

### Archivo 2: `apps/web/src/contratos/index.ts`

Eliminar 2 interfaces muertas:
- Línea 83-88: `export interface MasterService { ... }`
- Línea 100-104: `export interface SourceService { ... }`

Conservar todas las demás interfaces (RequestService, WarehouseService, etc.)

---

## 4. Riesgo

| Riesgo | Probabilidad | Impacto |
|---|---|---|
| Romper funcionalidad | IMPOSIBLE | NINGUNO |
| Romper tests | IMPOSIBLE | NINGUNO |
| Romper typecheck | IMPOSIBLE | NINGUNO |
| Romper build | IMPOSIBLE | NINGUNO |

**Justificación:** Los 4 elementos tienen 0 imports activos, 0 tests, 0 uso dinámico. Solo existen como definiciones en barrel files que nadie consume.

---

## 5. Validaciones post-eliminación

1. Typecheck WEB
2. Typecheck API (no se modifica)
3. Tests (no se modifican)
4. Búsqueda de imports rotos
5. Health API (no se modifica)

---

## 6. Elementos NO eliminados

| Elemento | Razón |
|---|---|
| Todos los demás exports de `componentes/ui/` | Usados activamente por 12+ archivos |
| Todas las demás interfaces de `contratos/` | Usadas por servicios API y mock |

---

ESTADO: ESPERANDO CONFIRMACIÓN PARA EJECUTAR ELIMINACIONES
