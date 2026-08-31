# Frontend Prototype — Fase 1.5

## 1. Objetivo
Construir un prototipo navegable del sistema MDM que permita validar UX/UI y flujo operativo sin depender de backend, base de datos ni Profit. El prototipo debe sentirse como una aplicación empresarial real usada diariamente.

## 2. Arquitectura Frontend

```
apps/web/src/
├── app/               — App.tsx (router), globals.css
├── components/
│   ├── ui/            — Button, Badge, Card, Modal, Tabs, etc.
│   └── layout/        — AppLayout (Sidebar + Header)
├── contexts/          — CompanyContext (multiempresa)
├── hooks/             — (reservado)
├── mock/              — companies, catalog, requests, master-items, source-items, extras
├── pages/             — Dashboard, Requests, RequestCreate, RequestDetail, Approvals, MasterItems, MasterItemDetail, SourceItems, Matching, DataQuality, Imports, Audit, Admin
├── services/mock/     — IRequestService + mock*Service (interfaz intercambiable)
└── types/             — interfaces TypeScript alineadas con arquitectura Fase 0
```

**Principio clave:** Los componentes nunca importan directamente los archivos `mock/*`. Consumen `services/mock/*`. Para conectar el backend basta reemplazar `MockRequestService` por `ApiRequestService` sin tocar las páginas.

```
Page → Service Interface → MockService (hoy) / ApiService (futuro)
```

## 3. Mock Services

| Servicio | Interfaz | Mock | Futuro |
|----------|----------|------|--------|
| Request | `IRequestService` | `mockRequestService` | `ApiRequestService` |
| Master | `mockMasterService` | — | `ApiMasterService` |
| Source | `mockSourceService` | — | `ApiSourceService` |
| Matching | `mockMatchingService` | — | `ApiMatchingService` |
| Quality | `mockQualityService` | — | `ApiQualityService` |
| Audit | `mockAuditService` | — | `ApiAuditService` |
| Import | `mockImportService` | — | `ApiImportService` |
| Notifications | `mockNotificationService` | — | `ApiNotificationService` |

Todos exponen métodos `list`, `getById`, `create`, `decide` con `delay(150ms)` para simular latencia.

### Cómo reemplazar MockService por ApiService
```ts
// services/mock/index.ts → services/api/index.ts
export const requestService: IRequestService =
  import.meta.env.VITE_USE_MOCK === 'true' ? mockRequestService : apiRequestService;
```

## 4. Rutas

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/` | Dashboard | KPIs, gráficos, actividad reciente |
| `/requests` | Requests | Tabla con filtros, búsqueda, paginación |
| `/requests/new` | RequestCreate | Formulario 6 pasos (básica → clasificación → técnica → atributos → revisión → envío) |
| `/requests/:id` | RequestDetail | Header + timeline workflow + 6 tabs + panel de acciones |
| `/approvals` | Approvals | Bandeja con filtros SLA (todas/urgentes/vencidas) |
| `/master-items` | MasterItems | Tabla M-YYYY-NNNNNN, búsqueda, filtros |
| `/master-items/:id` | MasterItemDetail | 6 tabs (info, atributos, mappings, aliases, versiones, auditoría) |
| `/source-items` | SourceItems | Tabla Profit mock, filtros por empresa |
| `/matching` | Matching | Lista candidatos + panel comparativo SOURCE vs MASTER |
| `/data-quality` | DataQuality | Cards por score (Excelente/Bueno/Revisión/Crítico) |
| `/imports` | Imports | Tabla import runs + detalle |
| `/audit` | Audit | Tabla eventos + panel before/after |
| `/admin` | Admin | 5 tabs (usuarios, roles, empresas, departamentos, config) |

## 5. Componentes Reutilizables

`Button` (primary/secondary/ghost/danger), `Input`, `Select`, `Textarea`, `Badge`, `StatusBadge`, `PriorityBadge`, `Card`, `KpiCard`, `PageHeader`, `Tabs`, `Modal`, `EmptyState`, `SearchInput`, `FilterBar`.

Layout: `AppLayout` con `Sidebar` colapsable (icon + label, active state) y `Header` (búsqueda global, selector empresa, notificaciones con badge, avatar usuario).

## 6. Datos Mock Realistas

No se usa "Item 1/2/3". Ejemplos reales:

- FILTRO DIESEL CUMMINS FS1012 (3936061)
- RODAMIENTO RÍGIDO DE BOLAS 6205 2RS
- CONTACTOR TRIFÁSICO 32A LC1D32
- BOMBA HIDRÁULICA 16CC
- CORREA TRAPEZOIDAL B-68
- ACEITE HIDRÁULICO ISO 68

Coherencia entre entidades:
- `M-2026-000001` mapea a 3 source items (FIL-001 Empresa A, 4587 Empresa B, FIL-D-55 Empresa C) demostrando homologación multiempresa.
- Requests usan los mismos part numbers que master items.
- Match candidates referencian source/master reales.

**Archivos mock:**
- `companies.ts` — 3 empresas, 6 departamentos, 6 usuarios, 7 roles
- `catalog.ts` — 5 grupos, 4 subgrupos, 3 categorías, 4 fabricantes, 4 marcas, 4 UoM
- `requests.ts` — 9 solicitudes cubriendo todos los estados (DRAFT→MASTER_ACTIVE)
- `master-items.ts` — 7 masters con qualityScore 45–96
- `source-items.ts` — 8 source items + 6 mappings + 4 importRuns + 3 matchCandidates
- `extras.ts` — 4 qualityResults, 6 auditEvents, 5 notifications

## 7. Funcionalidades Simuladas (MOCK)

- Navegación completa entre todas las páginas
- Filtros, búsqueda, paginación
- Creación de solicitud (formulario 6 pasos, validación visual, confirmación)
- Aprobación / rechazo / devolución con modal de confirmación
- Selector de empresa (filtra requests y source items)
- Notificaciones (contador, lista, marcar leído)
- Timeline de workflow (✓ completado, ● actual, ○ pendiente)
- Comparativo matching (matched/different fields, evidence, score)
- SLA visual (Vencida / 4h restantes / 36h restantes)
- Detalle de master (mappings, aliases, versiones)

Todas las acciones mutantes muestran `alert("... (mock)")` y no persisten.

## 8. Funcionalidades Reservadas para Backend

- Autenticación real, RBAC, guards, JWT
- Persistencia (PostgreSQL, Prisma migrations)
- Workflow engine transaccional (workflow_instances.current_step_id como fuente de verdad)
- Master code generation (M-YYYY-NNNNNN con secuencia)
- Profit Adapter (READ-ONLY), import idempotente
- Matching engine (normalization → data quality → scoring → evidence)
- Data Quality engine (rules, scoring, issues)
- Merge / Split transaccional con chain prevention
- Auditoría completa (correlationId, before/after)
- Concurrencia (optimistic locking, version)
- Búsqueda global server-side, paginación real

## 9. Cómo reemplazar MockService por ApiService

1. Crear `services/api/requestService.ts` que implemente `IRequestService` usando `fetch`/`axios` contra `GET /api/v1/requests`.
2. En `services/index.ts`:
   ```ts
   export const requestService = import.meta.env.VITE_USE_MOCK !== 'false' ? mockRequestService : apiRequestService;
   ```
3. No tocar páginas ni componentes. Solo el binding del servicio cambia.

## 10. Validación

```bash
pnpm install
pnpm --filter @master-data/web run build  # ✓ tsc -b && vite build (324 kB)
pnpm --filter @master-data/web run dev    # → http://localhost:5173
```

El frontend levanta sin Docker, sin PostgreSQL, sin NestJS. Solo `pnpm --filter @master-data/web run dev`.

## 11. Flujo de Validación Manual

1. `/` Dashboard
2. `/requests` → fila → `/requests/rq1` → tabs Workflow/Historial → acciones Aprobar/Devolver
3. `/requests/new` → 6 pasos → Enviar
4. `/approvals` → filtros → Revisar → modal
5. `/master-items` → `/master-items/mi1` → tabs Mappings/Aliases
6. `/matching` → seleccionar candidato → comparativo → Aceptar/Rechazar/Posponer
7. `/data-quality`, `/imports`, `/audit`, `/admin`
8. Cambiar empresa en header → datos filtrados
9. 🔔 Notificaciones

## 12. Decisiones UX

- **Densidad controlada:** tablas con ellipsis, paginación, filtros en FilterBar; no se sacrificó información pero se mantuvo legible.
- **Estados duales:** color + texto (badge) para daltonismo (no solo color).
- **Sidebar oscuro:** jerarquía visual clara, colapsable para ganar espacio.
- **Workflow timeline horizontal:** permite ver de un vistazo el progreso sin scroll.
- **Multiempresa como selector global:** cambio inmediato filtra todo el contexto, preparando el aislamiento real del backend.
- **Sin librería UI pesada:** componentes propios ligeros para control total y facilidad de reemplazo.
