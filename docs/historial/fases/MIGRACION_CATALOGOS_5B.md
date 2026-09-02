# Migración de Catálogos — Fase 5B

Fecha: 01 de septiembre de 2026
Estado: COMPLETADA

---

## 1. Resumen

Se migraron los 5 catálogos del frontend desde datos mock hacia la API real del backend.

| Catálogo | Antes | Después |
|---|---|---|
| Grupos | `mock/catalog.ts` | `GET /catalogs/groups` → Prisma |
| Subgrupos | `mock/catalog.ts` | `GET /catalogs/subgroups` → Prisma |
| Categorías | `mock/catalog.ts` | `GET /catalogs/categories` → Prisma |
| Marcas | `mock/catalog.ts` | `GET /catalogs/brands` → Prisma |
| Unidades | `mock/catalog.ts` | `GET /catalogs/units` → Prisma |

---

## 2. Archivos creados (2)

| Archivo | Propósito |
|---|---|
| `servicios/api/api-catalogo-service.ts` | Servicio API para los 5 catálogos |
| `hooks/useCatalogos.ts` | Hook React que carga catálogos desde la API |

---

## 3. Archivos modificados (8)

| Archivo | Cambio |
|---|---|
| `servicios/api/index.ts` | Agregado export de `apiCatalogoService` |
| `modulos/almacen/AlmacenClassify.tsx` | Reemplazado import mock por `useCatalogos()` |
| `modulos/contabilidad/ContabilidadList.tsx` | Reemplazado import mock por `useCatalogos()` |
| `modulos/revision-final/RevisionFinalPage.tsx` | Reemplazado import mock por `useCatalogos()` |
| `modulos/administracion/AdministracionPage.tsx` | Reemplazado import mock por `useCatalogos()` |
| `componentes/workflow/RequestDetail.tsx` | Reemplazado import mock por `useCatalogos()` |
| `componentes/workflow/MasterCodePreview.tsx` | Reemplazado import mock por `useCatalogos()` |
| `componentes/workflow/AnalyzerPanel.tsx` | Reemplazado import mock por `useCatalogos()` |

---

## 4. Endpoints utilizados

| Endpoint | Método | Consumido por |
|---|---|---|
| `GET /catalogs/groups` | apiCatalogoService.getGrupos() | useCatalogos() |
| `GET /catalogs/subgroups` | apiCatalogoService.getSubgrupos() | useCatalogos() |
| `GET /catalogs/categories` | apiCatalogoService.getCategorias() | useCatalogos() |
| `GET /catalogs/brands` | apiCatalogoService.getMarcas() | useCatalogos() |
| `GET /catalogs/units` | apiCatalogoService.getUnidades() | useCatalogos() |

---

## 5. Mocks todavía utilizados

| Mock | Consumido por |
|---|---|
| `mock/companies.ts` | AlmacenList, ContabilidadList, RevisionFinalPage, AuditoriaPage, AdministracionPage, CompanyContext, RequestDetail (usuarios y departamentos) |
| `mock/source-items.ts` | AlmacenClassify (analyzerProposals), ImportacionesPage |
| `mock/requests.ts` | Servicios mock (fallback mode switch) |
| `mock/extras.ts` | Servicios mock (fallback mode switch) |
| `mock/catalog.ts` | **0 consumidores** — candidato a eliminación en Fase 5F |
| `mock/master-items.ts` | **0 consumidores** — candidato a eliminación |

---

## 6. Cómo funciona ahora

```
Componente
  ↓ useCatalogos()
  ↓ React.useEffect → Promise.all
  ↓ apiCatalogoService.getGrupos/getSubgrupos/etc
  ↓ api.get('/api/v1/catalogs/...')
  ↓ HTTP GET
  ↓ NestJS CatalogosController
  ↓ CatalogosService
  ↓ Prisma.catalogGroup.findMany()
  ↓ PostgreSQL/SQLite
  ↓
  Datos reales en UI
```

---

## 7. Cómo agregar un nuevo catálogo

1. Crear modelo en `prisma/schema.prisma`
2. `npx prisma db push`
3. Agregar endpoint en `catalogos.controller.ts`
4. Agregar método en `catalogos.service.ts`
5. Agregar método en `servicios/api/api-catalogo-service.ts`
6. Agregar al hook `useCatalogos()` si es necesario
7. Consumir desde componentes

---

## 8. Cómo detectar si una pantalla usa API o mock

Buscar en el archivo:
- `useCatalogos()` → API real ✅
- `import { groups } from '../../mock/catalog'` → Mock ❌

---

## 9. Tests

- 69/69 tests existentes pasan ✅
- Tests de catálogos ya existían (`catalogs.controller.spec.ts`)

---

## 10. Validación

| Prueba | Estado |
|---|---|
| API typecheck | ✅ PASS |
| WEB typecheck | ✅ PASS |
| Tests | ✅ 69/69 |
| Health | ✅ 200 |
| Imports mock/catalog | ✅ 0 |

---

## 11. Estadística

**ANTES:**
- Imports directos a mocks de catálogos: **9**
- Catálogos mock: 5 (grupos, subgrupos, categorías, marcas, unidades)
- Catálogos reales: 0 consumidos

**DESPUÉS:**
- Imports directos a mocks de catálogos: **0**
- Catálogos mock: 5 (archivos existen pero sin consumidores)
- Catálogos reales: 5 consumidos vía API

**Diferencia:** 9 imports mock eliminados, 5 catálogos migrados a API real.

---

FASE 5B — COMPLETADA
