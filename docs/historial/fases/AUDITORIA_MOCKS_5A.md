# FASE 5A — Auditoría de Mocks

Fecha: 01 de septiembre de 2026
Estado: COMPLETADA (solo lectura)
Cambios de código: 0

---

## 1. Estado general

Data-Maestra tiene una arquitectura backend sólida con 32 endpoints reales y 20 tablas en Prisma. Sin embargo, el frontend depende directamente de mocks en 13 archivos, lo que impide que la aplicación funcione con datos reales en producción.

| Métrica | Valor |
|---|---|
| Endpoints backend | 32 (22 con RBAC, 10 sin protección) |
| Tablas Prisma | 20 |
| Archivos que importan mocks directamente | 13 |
| Servicios API reales | 5 (requests, warehouse, accounting, final-review, audit) |
| Servicios API faltantes | 7 (catalogs, companies, users, notifications, imports, quality, matching) |
| Mocks de producción | 6 archivos de datos + 10 servicios mock |
| Mocks de test | 0 (los tests usan mocks de Prisma inline) |

---

## 2. Estructura encontrada

### Frontend

```
apps/web/src/
├── mock/                    → 6 archivos de datos mock
├── servicios/
│   ├── index.ts             → Switch mock/api (VITE_DATA_MODE)
│   ├── api/                 → 6 servicios HTTP reales
│   └── mock/                → 10 servicios mock
├── modulos/                 → 9 módulos de pantalla
├── componentes/             → UI reutilizable
├── contextos/               → Session, Company
├── contratos/               → Interfaces de servicios
├── tipos/                   → Definiciones TypeScript
└── utilidades/              → Funciones utilitarias
```

### Backend

```
apps/api/src/
├── modulos/
│   ├── solicitudes/         → CRUD + workflow (8 endpoints)
│   ├── almacen/             → Clasificación (5 endpoints)
│   ├── contabilidad/        → Aprobación contable (4 endpoints)
│   ├── revision-final/      → Revisión final (4 endpoints)
│   ├── auditoria/           → Audit events (1 endpoint)
│   ├── catalogos/           → Catálogos (5 endpoints)
│   ├── salud/               → Health (2 endpoints)
│   ├── archivos/            → Uploads (1 endpoint)
│   └── autenticacion/       → Auth mock (2 endpoints)
└── comun/
    ├── prisma/              → Conexión DB
    └── utilidades/          → flattenRequestData
```

---

## 3. Resumen ejecutivo

### El problema central

El frontend tiene **dos capas de datos paralelas**:

1. **Capa real:** Servicios API que hacen `fetch` a endpoints NestJS → Prisma → DB
2. **Capa mock:** Archivos con arrays hardcodeados que se importan directamente en componentes

La capa real funciona para solicitudes, almacén, contabilidad, revisión final y auditoría.

La capa mock domina para: catálogos, usuarios, empresas, notificaciones, importaciones, matching, quality.

### Flujo actual (con mocks)

```
Componente
  ↓ import { groups } from '../../mock/catalog'   ← MOCK DIRECTO
  ↓ import { users } from '../../mock/companies'   ← MOCK DIRECTO
  ↓ warehouseService.getPendingRequests()          ← API REAL
  ↓
Mezcla de datos reales y falsos en la misma pantalla
```

### Flujo deseado

```
Componente
  ↓ catalogoService.getGrupos()                   ← API REAL
  ↓ usuarioService.getUsuarios()                  ← API REAL
  ↓ warehouseService.getPendingRequests()         ← API REAL
  ↓
Todos los datos vienen de la misma fuente
```

---

## 4. Mocks encontrados

### 4.1 Archivos de datos mock (`mock/`)

| ID | Archivo | Contenido | Consumidores |
|---|---|---|---|
| MOCK-001 | `mock/catalog.ts` | 5 grupos, 5 subgrupos, 4 categorías, 5 marcas, 4 unidades, 4 fabricantes, buildMasterCode() | 8 componentes |
| MOCK-002 | `mock/companies.ts` | 3 empresas, 6 departamentos, 6 usuarios, 7 roles, currentUser | 7 componentes + 1 contexto |
| MOCK-003 | `mock/requests.ts` | 9 solicitudes, 3 historiales, 7 workflow steps | 3 servicios mock |
| MOCK-004 | `mock/source-items.ts` | 3 sources, 9 source items, 6 source maps, 4 import runs, 3 match candidates, analyzerProposals | 3 servicios mock + 1 componente |
| MOCK-005 | `mock/master-items.ts` | 7 master items | **0 consumidores (huérfano)** |
| MOCK-006 | `mock/extras.ts` | 4 quality results, 6 audit events, 5 notifications, 1 import run | 3 servicios mock |

### 4.2 Servicios mock (`servicios/mock/`)

| ID | Archivo | Exporta | Datos que usa |
|---|---|---|---|
| MOCK-007 | `servicios/mock/request-service.ts` | `mockRequestService` | mock/requests.ts |
| MOCK-008 | `servicios/mock/warehouse-service.ts` | `mockWarehouseService` | mock/requests.ts |
| MOCK-009 | `servicios/mock/accounting-service.ts` | `mockAccountingService` | mock/requests.ts |
| MOCK-010 | `servicios/mock/final-review-service.ts` | `mockFinalReviewService` | **Array vacío [] (bug)** |
| MOCK-011 | `servicios/mock/audit-service.ts` | `mockAuditService` | mock/extras.ts |
| MOCK-012 | `servicios/mock/notification-service.ts` | `mockNotificationService` | mock/extras.ts |
| MOCK-013 | `servicios/mock/quality-service.ts` | `mockQualityService` | mock/extras.ts |
| MOCK-014 | `servicios/mock/matching-service.ts` | `mockMatchingService` | mock/source-items.ts |
| MOCK-015 | `servicios/mock/import-service.ts` | `mockImportService` | mock/source-items.ts |

### 4.3 Datos hardcodeados en componentes

| ID | Ubicación | Datos |
|---|---|---|
| HC-001 | `contextos/SessionContext.tsx:12` | `DEFAULT_SESSION` — usuario u1 hardcodeado como fallback |
| HC-002 | `modulos/panel/PanelPage.tsx:14-17` | KPIs = 0 (activeMasterItems, pendingHomologation, etc.) |
| HC-003 | `modulos/panel/PanelPage.tsx:72-78` | "Actividad Reciente" — strings literal |
| HC-004 | `modulos/administracion/AdministracionPage.tsx:143-147` | Config del sistema hardcodeada |

---

## 5. Mocks de producción

Estos son los mocks que la aplicación usa en modo `VITE_DATA_MODE=api` (el modo actual):

### Mocks que BYPASEAN el mode switch

| Mock | Archivo que lo importa | Problema |
|---|---|---|
| `mock/catalog.ts` | 8 archivos | Importación directa, sin pasar por servicios |
| `mock/companies.ts` | 7 archivos + CompanyContext | Importación directa |
| `mock/source-items.ts` | ImportacionesPage + AlmacenClassify | Importación directa |
| `mock/extras.ts` | 3 servicios mock | Solo vía servicios mock |

### Servicios mock que SÍ respetan el mode switch

| Servicio | Modo API | Modo Mock |
|---|---|---|
| requestService | api-request-service | mockRequestService |
| warehouseService | api-warehouse-service | mockWarehouseService |
| accountingService | api-accounting-service | mockAccountingService |
| finalReviewService | api-final-review-service | mockFinalReviewService |
| auditService | api-audit-service | mockAuditService |

### Servicios que SIEMPRE son mock (no hay API)

| Servicio | Estado |
|---|---|
| notificationService | **SIEMPRE MOCK** — hardcodeado en servicios/index.ts |
| importService | **NO EXISTE** como servicio API |
| qualityService | **NO EXISTE** como servicio API |
| matchingService | **NO EXISTE** como servicio API |

---

## 6. Mocks de tests

Los tests de backend usan mocks de Prisma (`vi.fn()`) inline en cada archivo de test. No usan los archivos de `mock/` ni `servicios/mock/`.

| Test | Mock usado |
|---|---|
| requests.service.spec.ts | Prisma mock inline |
| warehouse.service.spec.ts | Prisma mock inline + RequestsService mock |
| accounting.service.spec.ts | Prisma mock inline + RequestsService mock |
| final-review.service.spec.ts | Prisma mock inline + RequestsService mock |
| catalogs.controller.spec.ts | CatalogsService mock |
| flatten-request-data.spec.ts | Datos inline |
| e2e-workflow.spec.ts | Prisma mock completo |
| refresh-persistence.spec.ts | Prisma mock completo |

**Conclusión:** Los mocks de `mock/` y `servicios/mock/` NO son usados por tests. Son exclusivamente de producción/desarrollo.

---

## 7. Datos hardcodeados

| Ubicación | Tipo | Contenido | Riesgo |
|---|---|---|---|
| `autenticacion.service.ts:40-46` | Usuarios | 5 usuarios hardcodeados | CRÍTICO — no hay DB |
| `autenticacion.service.ts:31-38` | Permisos | 6 roles con permisos | ALTO — no configurable |
| `autenticacion.service.ts:50` | Sesión | `currentUserId = 'u1'` global | CRÍTICO — race condition |
| `SessionContext.tsx:12-20` | Fallback | DEFAULT_SESSION | MEDIO — oculta errores de auth |
| `PanelPage.tsx:14-17` | KPIs | Valores = 0 | BAJO — dashboard mock |
| `PanelPage.tsx:72-78` | Actividad | Strings literal | BAJO — dashboard mock |
| `AdministracionPage.tsx:143-147` | Config | "Fuente de datos: MOCK" | BAJO — admin mock |

---

## 8. Catálogos

| Catálogo | Tabla Prisma | Endpoint API | Servicio Backend | Servicio Frontend | Frontend usa API | Frontend usa mock |
|---|---|---|---|---|---|---|
| Grupos | `catalog_groups` | `GET /catalogs/groups` | `CatalogosService` | **NO EXISTE** | NO | SÍ (8 archivos) |
| Subgrupos | `catalog_subgroups` | `GET /catalogs/subgroups` | `CatalogosService` | **NO EXISTE** | NO | SÍ (5 archivos) |
| Categorías | `catalog_categories` | `GET /catalogs/categories` | `CatalogosService` | **NO EXISTE** | NO | SÍ (3 archivos) |
| Marcas | `brands` | `GET /catalogs/brands` | `CatalogosService` | **NO EXISTE** | NO | SÍ (5 archivos) |
| Unidades | `units_of_measure` | `GET /catalogs/units` | `CatalogosService` | **NO EXISTE** | NO | SÍ (2 archivos) |
| Empresas | `companies` | **NO EXISTE** | **NO EXISTE** | **NO EXISTE** | NO | SÍ (7 archivos) |
| Departamentos | `departments` | **NO EXISTE** | **NO EXISTE** | **NO EXISTE** | NO | SÍ (6 archivos) |
| Usuarios | `users` | `GET /auth/users` (mock) | `AutenticacionService` (mock) | **NO EXISTE** | NO | SÍ (7 archivos) |
| Roles | `roles` | **NO EXISTE** | **NO EXISTE** | **NO EXISTE** | NO | SÍ (1 archivo) |

**Conclusión:** La API de catálogos EXISTE y FUNCIONA, pero el frontend NUNCA la consume. Todos los componentes importan directamente de `mock/catalog.ts`.

---

## 9. Usuarios

| Aspecto | Estado actual |
|---|---|
| Almacenamiento | Mock in-memory en `autenticacion.service.ts` |
| Modelo Prisma | `users` existe en schema |
| Datos en DB | Seed crea 5 usuarios |
| Endpoint real | `GET /auth/session` (devuelve mock, no DB) |
| Servicio backend | `AutenticacionService` — no usa Prisma |
| Servicio frontend | `SessionContext` — fetch a API, fallback a DEFAULT_SESSION |
| Autenticación | Ninguna — query param `?userId=` |
| Asignación de roles | Hardcodeada en `ROLE_PERMISSIONS` |
| RBAC | Funcional pero con datos mock |

**Lo que falta para producción:**
1. JWT middleware
2. Request-scoped session
3. Servicio de usuarios desde DB
4. Login/logout real
5. Asignación de roles desde DB

---

## 10. Importaciones

| Aspecto | Estado |
|---|---|
| Pantalla | `modulos/importaciones/ImportacionesPage.tsx` |
| Datos | 100% mock |
| Servicio API | **NO EXISTE** |
| Servicio mock | `mockImportService` |
| Tablas Prisma | `import_runs` existe en schema SQL conceptual, NO en Prisma actual |
| Backend endpoints | **NO EXISTEN** |
| Funcionalidad real | Placeholder — simula importación pero no persiste |

**Conclusión:** Importaciones es un placeholder completo. No hay backend, no hay DB, no hay funcionalidad real.

---

## 11. Notificaciones

| Aspecto | Estado |
|---|---|
| Pantalla | Notificaciones en `AppLayout.tsx` |
| Datos | Mock hardcodeado en `mock/extras.ts` (5 notificaciones) |
| Servicio mock | `mockNotificationService` |
| Servicio API | **NO EXISTE** |
| Endpoint | **NO EXISTE** |
| Tabla Prisma | **NO EXISTE** |
| Persistencia | **NO** |
| Eventos | **NO EXISTEN** |

**Clasificación:** MOCK — No hay ninguna implementación real.

---

## 12. Endpoints reales

### Inventario completo (32 endpoints)

| # | Método | Ruta | Guard | Permiso | Consumido por frontend |
|---|---|---|---|---|---|
| 1 | GET | `/health` | No | — | health check |
| 2 | GET | `/health/ready` | No | — | health check |
| 3 | GET | `/auth/session` | No | — | SessionContext |
| 4 | GET | `/auth/users` | No | — | UserSwitcher |
| 5 | GET | `/catalogs/groups` | No | — | **NINGUNO** |
| 6 | GET | `/catalogs/subgroups` | No | — | **NINGUNO** |
| 7 | GET | `/catalogs/categories` | No | — | **NINGUNO** |
| 8 | GET | `/catalogs/brands` | No | — | **NINGUNO** |
| 9 | GET | `/catalogs/units` | No | — | **NINGUNO** |
| 10 | GET | `/uploads/requests/:filename` | No | — | RequestDetail |
| 11 | POST | `/requests` | SÍ | REQUEST.CREATE | SolicitudCreate |
| 12 | GET | `/requests` | SÍ | REQUEST.VIEW | SolicitudesList |
| 13 | GET | `/requests/:id` | SÍ | REQUEST.VIEW | SolicitudDetailPage |
| 14 | POST | `/requests/:id/submit` | SÍ | REQUEST.CREATE | SolicitudCreate |
| 15 | POST | `/requests/:id/approve` | SÍ | MANAGER.APPROVE | AprobacionesPage |
| 16 | POST | `/requests/:id/classify` | SÍ | WAREHOUSE.CLASSIFY | AlmacenClassify |
| 17 | POST | `/requests/:id/photo` | SÍ | REQUEST.CREATE | SolicitudCreate |
| 18 | GET | `/requests/:id/history` | SÍ | REQUEST.VIEW | RequestDetail |
| 19 | GET | `/warehouse/pending` | SÍ | WAREHOUSE.VIEW | AlmacenList |
| 20 | GET | `/warehouse/:id` | SÍ | WAREHOUSE.VIEW | AlmacenClassify |
| 21 | POST | `/warehouse/:id/classify` | SÍ | WAREHOUSE.CLASSIFY | AlmacenClassify |
| 22 | POST | `/warehouse/:id/approve` | SÍ | WAREHOUSE.CLASSIFY | AlmacenClassify |
| 23 | POST | `/warehouse/:id/return` | SÍ | WAREHOUSE.CLASSIFY | AlmacenClassify |
| 24 | GET | `/accounting/pending` | SÍ | ACCOUNTING.VIEW | ContabilidadList |
| 25 | GET | `/accounting/:id` | SÍ | ACCOUNTING.VIEW | ContabilidadList |
| 26 | POST | `/accounting/:id/approve` | SÍ | ACCOUNTING.APPROVE | ContabilidadList |
| 27 | POST | `/accounting/:id/reject` | SÍ | ACCOUNTING.APPROVE | ContabilidadList |
| 28 | GET | `/final-review/pending` | SÍ | FINAL_REVIEW.APPROVE | RevisionFinalPage |
| 29 | GET | `/final-review/:id` | SÍ | FINAL_REVIEW.APPROVE | RevisionFinalPage |
| 30 | POST | `/final-review/:id/approve` | SÍ | FINAL_REVIEW.APPROVE | RevisionFinalPage |
| 31 | POST | `/final-review/:id/reject` | SÍ | FINAL_REVIEW.APPROVE | RevisionFinalPage |
| 32 | GET | `/audit/events` | SÍ | AUDIT.VIEW | AuditoriaPage |

**Endpoints consumidos por frontend:** 22/32
**Endpoints sin consumo:** 10 (health×2, auth×2, catalogs×5, uploads×1)
**Endpoints de catálogos sin consumo:** 5 (grupos, subgrupos, categorías, marcas, unidades)

---

## 13. Endpoints faltantes

| Dominio | Endpoint necesario | Tabla Prisma | Estado |
|---|---|---|---|
| Empresas | `GET /companies` | `companies` | **NO EXISTE** |
| Departamentos | `GET /departments` | `departments` | **NO EXISTE** |
| Usuarios (admin) | `GET /admin/users` | `users` | **NO EXISTE** |
| Roles | `GET /admin/roles` | `roles` | **NO EXISTE** |
| Notificaciones | `GET /notifications` | — | **NO EXISTE** |
| Notificaciones | `GET /notifications/unread-count` | — | **NO EXISTE** |
| Importaciones | `GET /imports/runs` | — | **NO EXISTE** |
| Importaciones | `POST /imports/start` | — | **NO EXISTE** |
| Data Quality | `GET /quality/results` | — | **NO EXISTE** |
| Matching | `GET /matching/candidates` | — | **NO EXISTE** |
| Matching | `POST /matching/decide` | — | **NO EXISTE** |
| Dashboard | `GET /dashboard/stats` | — | **NO EXISTE** |

---

## 14. Servicios existentes

### Backend (NestJS)

| Módulo | Servicio | Estado |
|---|---|---|
| solicitudes | `SolicitudesService` | ✅ Completo |
| almacen | `AlmacenService` | ✅ Funcional |
| contabilidad | `ContabilidadService` | ✅ Funcional |
| revision-final | `RevisionFinalService` | ✅ Funcional |
| auditoria | `AuditoriaService` | ⚠️ Funcional pero nunca llamado |
| catalogos | `CatalogosService` | ✅ Funcional |
| salud | `SaludService` | ✅ Funcional |
| archivos | `ArchivosController` | ⚠️ Sin service |
| autenticacion | `AutenticacionService` | ⚠️ Mock in-memory |

### Frontend API

| Servicio | Estado |
|---|---|
| `api-request-service.ts` | ✅ Funcional |
| `api-warehouse-service.ts` | ✅ Funcional |
| `api-accounting-service.ts` | ✅ Funcional |
| `api-final-review-service.ts` | ✅ Funcional |
| `api-audit-service.ts` | ✅ Funcional |
| `api-session-service.ts` | ⚠️ Exportado pero no consumido |
| `api-catalog-service.ts` | ⚠️ Exportado pero no consumido |

### Frontend Mock

| Servicio | Estado |
|---|---|
| `mockRequestService` | ⚠️ Fallback |
| `mockWarehouseService` | ⚠️ Fallback |
| `mockAccountingService` | ⚠️ Fallback |
| `mockFinalReviewService` | ⚠️ Bug: usa array vacío |
| `mockAuditService` | ⚠️ Fallback |
| `mockNotificationService` | ⚠️ Única implementación |
| `mockQualityService` | ⚠️ Única implementación |
| `mockMatchingService` | ⚠️ Única implementación |
| `mockImportService` | ⚠️ Única implementación |

---

## 15. Fuente única de verdad

| Dominio | Fuente correcta | Fuente actual en frontend | Discrepancia |
|---|---|---|---|
| Solicitudes | Prisma → API | API (con mode switch) | ✅ OK |
| Clasificación | Prisma → API | API (con mode switch) | ✅ OK |
| Contabilidad | Prisma → API | API (con mode switch) | ✅ OK |
| Revisión Final | Prisma → API | API (con mode switch) | ✅ OK |
| Auditoría | Prisma → API | API (con mode switch) | ✅ OK |
| **Catálogos** | Prisma → API | **mock/catalog.ts** | ❌ DUPLICADO |
| **Empresas** | Prisma → API | **mock/companies.ts** | ❌ DUPLICADO |
| **Usuarios** | Prisma → API | **mock/companies.ts** | ❌ DUPLICADO |
| **Roles** | Prisma → API | **mock/companies.ts** | ❌ DUPLICADO |
| **Notificaciones** | No existe | **mock/extras.ts** | ❌ SOLO MOCK |
| **Importaciones** | No existe | **mock/source-items.ts** | ❌ SOLO MOCK |
| **Data Quality** | No existe | **mock/extras.ts** | ❌ SOLO MOCK |
| **Matching** | No existe | **mock/source-items.ts** | ❌ SOLO MOCK |
| **Dashboard stats** | No existe | Hardcodeado | ❌ SOLO MOCK |
| **Master Items** | Prisma (tabla existe) | **mock/master-items.ts** | ❌ DUPLICADO |

---

## 16. Dependencias mock → módulo

| Mock | Módulos que lo dependen |
|---|---|
| `mock/catalog.ts` | AlmacenClassify, AlmacenList, ContabilidadList, RevisionFinalPage, AuditoriaPage, AdministracionPage, RequestDetail, MasterCodePreview, AnalyzerPanel |
| `mock/companies.ts` | CompanyContext, AlmacenList, ContabilidadList, RevisionFinalPage, AuditoriaPage, AdministracionPage, RequestDetail |
| `mock/source-items.ts` | AlmacenClassify (analyzerProposals), ImportacionesPage (sourceItems) |
| `mock/requests.ts` | servicios/mock/request-service, warehouse-service, accounting-service |
| `mock/extras.ts` | servicios/mock/audit-service, notification-service, quality-service |
| `mock/master-items.ts** | **NINGUNO (huérfano)** |

---

## 17. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Eliminar `mock/catalog.ts` sin servicio API | CIERTA | CRÍTICO — 9 pantallas pierden datos | Crear servicio de catálogos primero |
| Eliminar `mock/companies.ts` sin servicio API | CIERTA | CRÍTICO — 7 pantallas pierden datos | Crear servicio de empresas/usuarios primero |
| Eliminar servicios mock sin reemplazo | CIERTA | CRÍTICO — mode switch no funciona | Crear endpoints faltantes primero |
| `final-review-service.ts` con array vacío | CIERTA | ALTO — revisión final no muestra datos mock | Fix antes de eliminar mock |
| Auth singleton race condition | ALTA | CRÍTICO en producción | JWT antes de producción |
| `master-items.ts` huérfano | SEGURA | BAJO — nadie lo usa | Eliminar directamente |

---

## 18. Dead code relacionado

| Archivo | Estado | Decisión |
|---|---|---|
| `mock/master-items.ts` | 0 imports | **SEGURO PARA ELIMINAR** |
| `mock/requests.ts` | Solo usado por servicios mock | CONSERVAR hasta eliminar servicios mock |
| `mock/source-items.ts` | Solo usado por servicios mock + 2 componentes | CONSERVAR hasta migrar |
| `mock/extras.ts` | Solo usado por servicios mock | CONSERVAR hasta eliminar servicios mock |
| `servicios/mock/final-review-service.ts` | Array vacío (bug) | **SEGURO PARA ELIMINAR** (ya hay API real) |
| `servicios/mock/request-service.ts` | Fallback mode switch | CONSERVAR hasta modo offscreen |
| `servicios/mock/warehouse-service.ts` | Fallback mode switch | CONSERVAR hasta modo offscreen |
| `servicios/mock/accounting-service.ts` | Fallback mode switch | CONSERVAR hasta modo offscreen |
| `servicios/mock/audit-service.ts` | Fallback mode switch | CONSERVAR hasta modo offscreen |
| `servicios/mock/notification-service.ts` | Única implementación | NO ELIMINAR — no hay API |
| `servicios/mock/quality-service.ts` | Única implementación | NO ELIMINAR — no hay API |
| `servicios/mock/matching-service.ts` | Única implementación | NO ELIMINAR — no hay API |
| `servicios/mock/import-service.ts` | Única implementación | NO ELIMINAR — no hay API |

---

## 19. Matriz de migración

| ID | Mock | Tipo | Uso | Fuente real | Endpoint | Servicio | Riesgo | Acción |
|---|---|---|---|---|---|---|---|---|
| MOCK-001 | `mock/catalog.ts` | Producción | 9 componentes | SÍ (API existe) | `/catalogs/*` | `CatalogosService` | ALTO | **Migrar en Fase 5B** |
| MOCK-002 | `mock/companies.ts` | Producción | 7 componentes + 1 contexto | SÍ (tabla existe) | **NO EXISTE** | **NO EXISTE** | CRÍTICO | **Crear API en Fase 5C** |
| MOCK-003 | `mock/requests.ts` | Fallback | 3 servicios mock | SÍ (API funciona) | `/requests/*` | `SolicitudesService` | BAJO | Mantener como fallback |
| MOCK-004 | `mock/source-items.ts` | Producción parcial | 2 componentes + 3 servicios | NO | **NO EXISTE** | **NO EXISTE** | ALTO | Crear API en Fase 5D |
| MOCK-005 | `mock/master-items.ts` | Huérfano | 0 | SÍ (tabla existe) | **NO EXISTE** | **NO EXISTE** | BAJO | **Eliminar directamente** |
| MOCK-006 | `mock/extras.ts` | Producción parcial | 3 servicios mock | NO | **NO EXISTE** | **NO EXISTE** | MEDIO | Crear APIs en Fase 5E |
| MOCK-007-009 | Servicios mock request/warehouse/accounting | Fallback | mode switch | SÍ | SÍ | SÍ | BAJO | Mantener como fallback |
| MOCK-010 | `servicios/mock/final-review-service.ts` | Bug | mode switch | SÍ | SÍ | SÍ | BAJO | **Eliminar — ya hay API** |
| MOCK-011 | `servicios/mock/audit-service.ts` | Fallback | mode switch | SÍ | SÍ | SÍ | BAJO | Mantener como fallback |
| MOCK-012 | `servicios/mock/notification-service.ts` | Único | AppLayout | NO | **NO EXISTE** | **NO EXISTE** | MEDIO | Crear API en Fase 5E |
| MOCK-013 | `servicios/mock/quality-service.ts` | Único | ImportacionesPage | NO | **NO EXISTE** | **NO EXISTE** | MEDIO | Crear API en Fase 5D |
| MOCK-014 | `servicios/mock/matching-service.ts` | Único | ImportacionesPage | NO | **NO EXISTE** | **NO EXISTE** | MEDIO | Crear API en Fase 5D |
| MOCK-015 | `servicios/mock/import-service.ts` | Único | ImportacionesPage | NO | **NO EXISTE** | **NO EXISTE** | MEDIO | Crear API en Fase 5D |

---

## 20. Archivos que NO deben eliminarse

| Archivo | Razón |
|---|---|
| `mock/catalog.ts` | Hasta crear servicio API de catálogos |
| `mock/companies.ts` | Hasta crear servicio API de empresas/usuarios |
| `mock/requests.ts` | Fallback para modo offline |
| `mock/source-items.ts` | Hasta crear API de importaciones |
| `mock/extras.ts` | Hasta crear APIs de notifications/quality |
| Todos los `servicios/mock/*.ts` | Fallback para modo offline |

---

## 21. Archivos candidatos a eliminación directa

| Archivo | Razón | Riesgo |
|---|---|---|
| `mock/master-items.ts` | 0 imports, huérfano completo | BAJO |
| `servicios/mock/final-review-service.ts` | Array vacío, API real ya existe | BAJO |

---

## 22. Plan recomendado de Fase 5B+

### Fase 5B — Catálogos reales

**Objetivo:** Conectar frontend con API real de catálogos.

**Archivos afectados:**
- Nuevo: `servicios/api/api-catalogo-service.ts`
- Modificar: `servicios/index.ts` (agregar catalogoService)
- Modificar: 9 componentes que importan `mock/catalog`
- Eliminar: imports directos de `mock/catalog`

**Tablas:** `catalog_groups`, `catalog_subgroups`, `catalog_categories`, `brands`, `units_of_measure`

**Endpoints:** Ya existen (5 endpoints en `catalogos.controller.ts`)

**Servicios backend:** Ya existe `CatalogosService`

**Riesgo:** MEDIO — Los endpoints existen, solo falta conectar el frontend

**Pruebas:** Verificar que cada módulo carga datos reales de catálogos

**Criterio de aceptación:** Ningún componente importa `mock/catalog` directamente

### Fase 5C — Usuarios y empresas reales

**Objetivo:** Crear servicios API para usuarios, empresas, departamentos y conectar frontend.

**Archivos afectados:**
- Nuevo: `modulos/administracion/administracion.controller.ts` (extender)
- Nuevo: `modulos/administracion/administracion.service.ts` (extender)
- Nuevo: `servicios/api/api-usuario-service.ts`
- Nuevo: `servicios/api/api-empresa-service.ts`
- Modificar: 7+ componentes que importan `mock/companies`
- Modificar: `contextos/CompanyContext.tsx`

**Tablas:** `companies`, `departments`, `users`, `roles`

**Endpoints:** Crear `GET /companies`, `GET /departments`, `GET /admin/users`, `GET /admin/roles`

**Servicios backend:** Crear o extender `AdministracionService`

**Riesgo:** ALTO — Múltiples pantallas afectadas, auth depende de esto

**Pruebas:** Verificar que sesión, company switch, y listas muestran datos reales

**Criterio de aceptación:** Ningún componente importa `mock/companies` directamente

### Fase 5D — Importaciones y matching

**Objetivo:** Crear funcionalidad real de importación y matching (o decidir si es MVP futuro).

**Archivos afectados:**
- Nuevo: módulo `importaciones/` completo en backend
- Nuevo: servicios API para imports, quality, matching
- Modificar: `ImportacionesPage.tsx`

**Tablas:** Crear tablas de importación y matching

**Riesgo:** ALTO — Funcionalidad completa nueva

**Nota:** Esta fase puede diferirse si importaciones no es prioritario para MVP.

### Fase 5E — Notificaciones y dashboard

**Objetivo:** Crear endpoints de notificaciones y dashboard stats.

**Archivos afectados:**
- Nuevo: módulo `notificaciones/` en backend
- Nuevo: `GET /dashboard/stats`
- Modificar: `AppLayout.tsx` (notificaciones)
- Modificar: `PanelPage.tsx` (KPIs)

**Tablas:** Crear tabla `notifications`

**Riesgo:** MEDIO — Funcionalidad complementaria

### Fase 5F — Limpieza final de mocks

**Objetivo:** Eliminar todos los mocks de producción que ya tienen reemplazo real.

**Archivos a eliminar:**
- `mock/catalog.ts` (reemplazado en 5B)
- `mock/companies.ts` (reemplazado en 5C)
- `mock/master-items.ts` (huérfano)
- `servicios/mock/final-review-service.ts` (bug, API real existe)

**Archivos a mantener:**
- `mock/requests.ts` (fallback offline)
- `mock/source-items.ts` (hasta Fase 5D)
- `mock/extras.ts` (hasta Fase 5E)
- Todos los servicios mock (fallback offline)

---

## 23. Pruebas necesarias por fase

| Fase | Pruebas |
|---|---|
| 5B (Catálogos) | Verificar que WarehouseClassify, ContabilidadList, RevisionFinalPage cargan grupos/marcas/unidades desde API |
| 5C (Usuarios) | Verificar que CompanyContext, AlmacenList, AuditoriaPage muestran nombres reales |
| 5D (Importaciones) | Verificar que ImportacionesPage muestra datos reales |
| 5E (Notificaciones) | Verificar que AppLayout muestra notificaciones reales |
| 5F (Limpieza) | Typecheck + tests + health después de eliminar mocks |

---

## 24. Criterios de aceptación

### Para considerar la migración completa:

1. Ningún componente importa directamente de `mock/catalog.ts`
2. Ningún componente importa directamente de `mock/companies.ts`
3. `VITE_DATA_MODE=api` funciona sin imports de mock
4. Todos los datos visibles en pantallas vienen de API
5. Los mocks solo existen como fallback para `VITE_DATA_MODE=mock`
6. No hay datos hardcodeados en componentes (excepto config de desarrollo)
7. 69+ tests pasan
8. Typecheck API y WEB pasan
9. Health responde 200

---

## 25. Conclusión

### Estado actual del sistema

El backend tiene una arquitectura sólida con 32 endpoints y 20 tablas. El workflow funciona correctamente. El RBAC está implementado.

El frontend tiene un problema estructural: **13 archivos importan mocks directamente**, creando una dependencia que impide el uso en producción.

### El camino a seguir

1. **Fase 5B** (CATÁLOGOS) — La más rápida y de mayor impacto. Los endpoints ya existen.
2. **Fase 5C** (USUARIOS/EMPRESAS) — Requiere crear endpoints nuevos.
3. **Fase 5D** (IMPORTACIONES) — Opcional para MVP, requiere backend nuevo.
4. **Fase 5E** (NOTIFICACIONES) — Complementaria.
5. **Fase 5F** (LIMPIEZA) — Eliminar mocks reemplazados.

### Prioridad absoluta

**Fase 5B (Catálogos)** es la fase de mayor impacto con menor riesgo. Los 5 endpoints de catálogos ya existen y funcionan. Solo falta crear el servicio frontend y reemplazar 9 imports directos de mock.

---

FASE 5A — AUDITORÍA COMPLETADA

CAMBIOS DE CÓDIGO: 0
ARCHIVOS ELIMINADOS: 0
ARCHIVOS MOVIDOS: 0
ARCHIVOS RENOMBRADOS: 0
TABLAS MODIFICADAS: 0
ENDPOINTS MODIFICADOS: 0
FUNCIONALIDAD MODIFICADA: 0
DOCUMENTACIÓN CREADA/ACTUALIZADA: docs/AUDITORIA_MOCKS_5A.md

DETENIDO. Esperando autorización para Fase 5B.
