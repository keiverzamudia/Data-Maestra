# Auditoría Actual — Data-Maestra

Fecha: 01 de septiembre de 2026
Modo: Solo lectura. Sin modificaciones.

---

## 1. ESTRUCTURA ACTUAL DEL PROYECTO

```
Data-Maestra/
├── AGENTS.md                          # Reglas para el agente OpenCode
├── README.md                          # README mínimo (32 líneas)
├── package.json                       # Root package.json (scripts de pnpm)
├── pnpm-workspace.yaml                # Define apps/* y packages/*
├── pnpm-lock.yaml                     # Lock file
├── tsconfig.base.json                 # Config TS compartida
├── docker-compose.yml                 # PostgreSQL (no utilizado actualmente)
├── .env.docker                        # Variables para Docker
├── .env.example                       # Variables de ejemplo
├── .gitignore
├── .prettierrc / .prettierignore
├── opencode.jsonc.v2                  # Config de OpenCode (no es opencode.json)
│
├── apps/
│   ├── api/                           # Backend NestJS
│   │   ├── src/
│   │   │   ├── main.ts               # Bootstrap
│   │   │   ├── app.module.ts         # Registro de módulos
│   │   │   ├── modules/              # 9 módulos de negocio
│   │   │   └── shared/               # 3 servicios compartidos
│   │   ├── test/                      # 4 archivos de test
│   │   ├── prisma/                    # schema.prisma + seed.js
│   │   ├── data/dev.db               # SQLite (405 KB)
│   │   ├── uploads/requests/          # 8 imágenes de prueba
│   │   ├── dist/                      # Build compilado
│   │   ├── .env                       # Variables de entorno
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   ├── nest-cli.json
│   │   └── vitest.config.ts
│   │
│   └── web/                           # Frontend React + Vite
│       ├── src/
│       │   ├── main.tsx               # Entry point
│       │   ├── app/                    # App.tsx + globals.css
│       │   ├── components/            # UI, workflow, layout
│       │   ├── modules/               # 9 módulos de pantalla
│       │   ├── services/              # api/ + mock/ + session.ts
│       │   ├── contexts/              # Session + Company
│       │   ├── contracts/             # Interfaces de servicios
│       │   ├── types/                 # Tipos TypeScript
│       │   ├── mock/                  # Datos mock (6 archivos)
│       │   └── utils/                 # image.ts (compresión)
│       ├── index.html
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       ├── .env                       # VITE_DATA_MODE=api
│       └── dist/                      # Build compilado
│
├── packages/
│   ├── shared/                        # Enums compartidos (solo enums.ts)
│   └── contracts/                     # Tipos de contrato API (solo health.ts)
│
├── db/
│   └── schema.sql                     # Schema PostgreSQL conceptual (no utilizado)
│
├── docs/                              # 20 archivos de documentación
├── prompts/                           # 13 prompts de fase (phase-00 a phase-12)
├── scripts/                           # 5 scripts PowerShell
└── uploads/requests/                  # 9 imágenes de prueba (root-level)
```

---

## 2. MÓDULOS BACKEND — ESTADO REAL

### 2.1 Módulos en `apps/api/src/modules/`

| Módulo | Archivos | Estado | Funcional |
|---|---|---|---|
| **health** | controller, service, module | Completo | ✅ Health + readiness check |
| **auth** | controller, service, module, rbac.guard, require-permission.decorator | Mock funcional | ⚠️ Users hardcoded en memoria |
| **requests** | controller, service, module, 3 DTOs | Funcional | ✅ CRUD + submit + approve + classify + photo + history |
| **warehouse** | controller, service, module | Funcional | ✅ Pending + classify + approve + return |
| **accounting** | controller, service, module | Funcional | ✅ Pending + approve (con códigos) + reject |
| **final-review** | controller, service, module | Funcional | ✅ Pending + approve + reject |
| **audit** | controller, service, module | Parcial | ⚠️ Solo lectura de eventos |
| **catalogs** | controller, service, module | Funcional | ✅ Lectura de grupos/subgrupos/categorías/marcas/unidades |
| **uploads** | controller, module | Funcional | ✅ Servir imágenes por nombre |

### 2.2 Servicios compartidos en `apps/api/src/shared/`

| Servicio | Archivos | Estado | Nota |
|---|---|---|---|
| **prisma** | prisma.service, prisma.module | Funcional | Global, connect/disconnect lifecycle |
| **workflow** | workflow.service, workflow.module | ⚠️ No integrado | Definido pero NO usado por RequestsService |
| **master-code** | master-code.service, master-code.module | ⚠️ No integrado | Definido pero NO usado por RequestsService |

### 2.3 Problemas específicos por módulo

**auth.service.ts:50** — `currentUserId` es `private currentUserId = 'u1'`. Variable global en memoria. TODAS las conexiones HTTP comparten el mismo usuario. Si User A cambia sesión, User B también se afecta.

**requests.service.ts:455-462** — `getNextStatus()` tiene las transiciones hardcodeadas. `WorkflowService` (shared/workflow) tiene la misma lógica pero no se usa. Duplicación.

**requests.service.ts:431-453** — `generateMasterCode()` está inline. `MasterCodeService` (shared/master-code) tiene la interfaz pero no se usa. Duplicación.

**requests.service.ts:296-376** — `classify()` cambia status de `PENDING_WAREHOUSE` a `WAREHOUSE_APPROVED` automáticamente. Esto hace que el endpoint `POST /requests/:id/classify` haga dos cosas: guardar datos Y cambiar estado.

**warehouse.controller.ts** — No existe endpoint `POST /warehouse/:id/reject`. El frontend (`api-warehouse-service.ts:29`) llama a este endpoint pero devolverá 404.

**warehouse.service.ts:71-84** — `approve()` valida que exista `requestData` con `groupId`, `subgroupId` y `masterCode`. Si no existen, lanza error 400.

**accounting.service.ts:69-77** — `approve()` permite avanzar sin códigos contables (acepta array vacío).

**final-review.service.ts:68-79** — `approve()` avanza a `APPROVED` pero NO crea el MasterItem. La fase 11 del workflow está incompleta.

**catalogs.controller.ts** — Sin `@UseGuards(RbacGuard)`. Los catálogos son accesibles sin autenticación.

**uploads.controller.ts** — Sin autenticación. Cualquiera puede servir archivos.

---

## 3. MÓDULOS FRONTEND — ESTADO REAL

### 3.1 Módulos en `apps/web/src/modules/`

| Módulo | Archivos | Estado | Nota |
|---|---|---|---|
| **dashboard** | DashboardPage.tsx | Mock | KPIs y gráficos desde datos mock |
| **requester** | RequesterList.tsx, RequestCreate.tsx, RequestDetailPage.tsx | Funcional | Crea y lista solicitudes vía API |
| **approvals** | ApprovalsPage.tsx | Parcial | Solo permite APROBAR, no rechazar/return |
| **warehouse** | WarehouseList.tsx, WarehouseClassify.tsx | Funcional | Clasificación + approve. Carga catálogos desde mock local |
| **accounting** | AccountingList.tsx | Funcional | Approve/reject con códigos contables. Carga users desde mock |
| **final-review** | FinalReviewPage.tsx | Funcional | Approve/reject. Carga users desde mock |
| **imports** | ImportsPage.tsx | Mock | Toda la funcionalidad es mock |
| **audit** | AuditPage.tsx | Funcional | Consume API real |
| **administration** | AdminPage.tsx | Mock | Tabs de admin pero todo con datos mock |

### 3.2 Servicios frontend en `apps/web/src/services/`

| Servicio | Estado | Nota |
|---|---|---|
| **api-client.ts** | Funcional | Retry con backoff para errores de red |
| **api-request-service.ts** | Funcional | CRUD + submit + approve + reject + return |
| **api-warehouse-service.ts** | Funcional | Pending + classify + approve + return + reject |
| **api-accounting-service.ts** | Funcional | Pending + approve + reject |
| **api-final-review-service.ts** | Funcional | Pending + approve + reject |
| **api-audit-service.ts** | Funcional | Eventos con filtros |
| **api-catalog-service.ts** | Funcional | Groups, subgroups, categories, brands, units |
| **api-session-service.ts** | Funcional | GET session |
| **index.ts** | Funcional | Switch mock/api según `VITE_DATA_MODE` |

### 3.3 Componentes UI

| Componente | Estado |
|---|---|
| Button, Input, Select, Textarea | ✅ Funcional |
| Badge, StatusBadge, PriorityBadge | ✅ Funcional |
| Card, KpiCard, PageHeader | ✅ Funcional |
| Tabs, Modal, EmptyState | ✅ Funcional |
| SearchInput, FilterBar | ✅ Funcional |
| ImageLightbox | ✅ Funcional |
| UserSwitcher | ✅ Funcional (dev tool) |

### 3.4 Componentes de Workflow

| Componente | Estado |
|---|---|
| WorkflowTimeline | ✅ Visualiza estados del workflow |
| RequestDetail | ✅ Detalle completo de solicitud |
| AnalyzerPanel | ✅ Muestra propuesta del analizador |
| MasterCodePreview | ✅ Preview del código master |

### 3.5 Contextos

| Contexto | Estado | Nota |
|---|---|---|
| SessionContext | Funcional | Fetch `/api/v1/auth/session` con retry, `hasPermission()`, `switchUser()` |
| CompanyContext | Mock | Solo holds companyId, no consume API |

### 3.6 Datos mock en `apps/web/src/mock/`

| Archivo | Contenido |
|---|---|
| catalog.ts | 5 grupos, 5 subgrupos, 4 categorías, 5 marcas, 4 unidades, 4 fabricantes |
| companies.ts | 3 empresas, 6 departamentos, 6 usuarios, 7 roles, usuario actual |
| requests.ts | 9 solicitudes mock con diferentes estados, 3 entradas de historial |
| master-items.ts | 7 master items mock con diferentes estados |
| source-items.ts | 3 sources, 8 source items, 6 source maps, 4 import runs, 3 match candidates, 2 analyzer proposals |
| extras.ts | 4 quality results, 6 audit events, 5 notifications, 1 import run extra |

---

## 4. BASE DE DATOS REAL

### 4.1 SQLite (dev.db) — 405 KB

Tablas Prisma (en `prisma/schema.prisma`):

| Tabla | Campos PK | Relaciones |
|---|---|---|
| companies | id (uuid) | → departments, requests, userRoles, auditEvents |
| users | id (uuid) | → userRoles, auditEvents, workflowTasks, workflowHistory, requests, approvals |
| roles | id (uuid) | → userRoles, rolePermissions |
| permissions | id (uuid) | → rolePermissions |
| user_roles | id (uuid) | → users, roles, companies. Unique: [userId, roleId, companyId] |
| role_permissions | [roleId, permissionId] | → roles, permissions |
| departments | id (uuid) | → company, requests. Unique: [companyId, code] |
| catalog_groups | id (uuid) | → subgroups, masterItems. code unique |
| catalog_subgroups | id (uuid) | → group, categories, masterItems. Unique: [groupId, code] |
| catalog_categories | id (uuid) | → subgroup, masterItems. Unique: [subgroupId, code] |
| brands | id (uuid) | → masterItems. normalizedName unique |
| units_of_measure | id (uuid) | → masterItems. code unique |
| master_items | id (uuid) | → group, subgroup, category, brand, unit, createdByUser. masterCode unique |
| requests | id (uuid) | → company, department, requester. requestNumber unique. Indexes: status, companyId, requesterId, createdAt |
| request_data | id (uuid) | → request (1:1). requestId unique |
| request_accounting_codes | id (uuid) | → request |
| workflow_instances | id (uuid) | → request (1:1). requestId unique |
| workflow_tasks | id (uuid) | → instance, assignedToUser. Unique: [instanceId, stepCode] |
| workflow_history | id (uuid) | → instance, actor |
| approvals | id (uuid) | → request, actor |
| audit_events | id (uuid) | → actor, actorCompany. Indexes: entityType+entityId, actorId, createdAt |

### 4.2 Schema SQL conceptual (db/schema.sql)

Este archivo define un schema PostgreSQL con:
- Enums (item_status, request_status, approval_action, etc.)
- Tablas adicionales no en Prisma: `organizations`, `sources`, `import_runs`, `source_items`, `master_item_source_map`, `item_aliases`, `match_candidates`
- Schema `profit_staging` para datos de Profit
- Schema `audit` separado

**NO está conectado a la implementación actual.** Es un diseño conceptual de Fase 0.

---

## 5. WORKFLOW REAL — TRANSICIONES

### 5.1 Transiciones implementadas en `requests.service.ts:getNextStatus()`

```
PENDING_MANAGER   → APPROVE → PENDING_WAREHOUSE
PENDING_MANAGER   → REJECT  → REJECTED
PENDING_MANAGER   → RETURN  → DRAFT

PENDING_WAREHOUSE → APPROVE → PENDING_ACCOUNTING
PENDING_WAREHOUSE → REJECT  → REJECTED
PENDING_WAREHOUSE → RETURN  → PENDING_MANAGER

PENDING_ACCOUNTING   → APPROVE → PENDING_FINAL_REVIEW
PENDING_ACCOUNTING   → REJECT  → REJECTED
PENDING_ACCOUNTING   → RETURN  → PENDING_WAREHOUSE

PENDING_FINAL_REVIEW → APPROVE → APPROVED
PENDING_FINAL_REVIEW → REJECT  → REJECTED
PENDING_FINAL_REVIEW → RETURN  → PENDING_ACCOUNTING

WAREHOUSE_APPROVED → APPROVE → PENDING_ACCOUNTING
WAREHOUSE_APPROVED → REJECT  → REJECTED
WAREHOUSE_APPROVED → RETURN  → PENDING_MANAGER
```

### 5.2 Transiciones en `shared/workflow/workflow.service.ts` (NO USADO)

Incluye additionally:
```
DRAFT → SUBMIT → PENDING_MANAGER
MANAGER_APPROVED → ROUTE → PENDING_WAREHOUSE
WAREHOUSE_APPROVED → ROUTE → PENDING_ACCOUNTING
ACCOUNTING_APPROVED → ROUTE → PENDING_FINAL_REVIEW
APPROVED → ACTIVATE → MASTER_ACTIVE
RETURNED → RESUBMIT → DRAFT
```

### 5.3 Transiciones que SÍ funcionan end-to-end (probadas)

```
DRAFT → SUBMIT → PENDING_MANAGER ✅
PENDING_MANAGER → APPROVE → PENDING_WAREHOUSE ✅
PENDING_WAREHOUSE → CLASSIFY → WAREHOUSE_APPROVED ✅ (cambia status + guarda datos)
PENDING_WAREHOUSE → APPROVE → PENDING_ACCOUNTING ✅ (con validación de clasificación)
PENDING_ACCOUNTING → APPROVE → PENDING_FINAL_REVIEW ✅
PENDING_FINAL_REVIEW → APPROVE → APPROVED ✅
```

### 5.4 Transiciones con problemas

| Transición | Problema |
|---|---|
| WAREHOUSE_APPROVED → APPROVE | Funciona pero es ambigua con PENDING_WAREHOUSE → APPROVE |
| PENDING_WAREHOUSE → REJECT | No existe endpoint `POST /warehouse/:id/reject` |
| APPROVED → ACTIVATE → MASTER_ACTIVE | No existe endpoint ni UI |
| RETURNED → RESUBMIT → DRAFT | No existe endpoint ni UI |

---

## 6. PERMISOS REALES

### 6.1 Definición en `auth.service.ts`

```typescript
REQUESTER:          ['REQUEST.CREATE', 'REQUEST.VIEW', 'DASHBOARD.VIEW']
DEPARTMENT_MANAGER: ['MANAGER.APPROVE', 'REQUEST.VIEW', 'DASHBOARD.VIEW']
WAREHOUSE:          ['WAREHOUSE.CLASSIFY', 'WAREHOUSE.VIEW', 'REQUEST.VIEW', 'DASHBOARD.VIEW']
ACCOUNTING:         ['ACCOUNTING.APPROVE', 'ACCOUNTING.VIEW', 'REQUEST.VIEW', 'DASHBOARD.VIEW']
FINAL_REVIEWER:     ['FINAL_REVIEW.APPROVE', 'REQUEST.VIEW', 'DASHBOARD.VIEW']
MASTER_DATA_ADMIN:  ['ADMIN.MANAGE', 'DASHBOARD.VIEW', 'AUDIT.VIEW', 'IMPORT.RUN', 'IMPORT.VIEW']
```

### 6.2 Permisos usados en controllers (con `@RequirePermission`)

| Controller | Endpoint | Permiso |
|---|---|---|
| requests | POST /requests | REQUEST.CREATE |
| requests | GET /requests | REQUEST.VIEW |
| requests | GET /requests/:id | REQUEST.VIEW |
| requests | POST /requests/:id/submit | REQUEST.CREATE |
| requests | POST /requests/:id/approve | MANAGER.APPROVE |
| requests | POST /requests/:id/classify | WAREHOUSE.CLASSIFY |
| requests | POST /requests/:id/photo | REQUEST.CREATE |
| requests | GET /requests/:id/history | REQUEST.VIEW |
| warehouse | GET /warehouse/pending | WAREHOUSE.VIEW |
| warehouse | GET /warehouse/:id | WAREHOUSE.VIEW |
| warehouse | POST /warehouse/:id/classify | WAREHOUSE.CLASSIFY |
| warehouse | POST /warehouse/:id/approve | WAREHOUSE.CLASSIFY |
| warehouse | POST /warehouse/:id/return | WAREHOUSE.CLASSIFY |
| accounting | GET /accounting/pending | ACCOUNTING.VIEW |
| accounting | GET /accounting/:id | ACCOUNTING.VIEW |
| accounting | POST /accounting/:id/approve | ACCOUNTING.APPROVE |
| accounting | POST /accounting/:id/reject | ACCOUNTING.APPROVE |
| final-review | GET /final-review/pending | FINAL_REVIEW.APPROVE |
| final-review | GET /final-review/:id | FINAL_REVIEW.APPROVE |
| final-review | POST /final-review/:id/approve | FINAL_REVIEW.APPROVE |
| final-review | POST /final-review/:id/reject | FINAL_REVIEW.APPROVE |
| audit | GET /audit/events | AUDIT.VIEW |

### 6.3 Endpoints SIN RBAC

| Endpoint | Riesgo |
|---|---|
| GET /auth/session | Cualquiera puede ver/cambiar sesión |
| GET /auth/users | Cualquiera puede listar usuarios |
| GET /catalogs/* | Cualquiera puede leer catálogos |
| GET /uploads/* | Cualquiera puede servir archivos |
| GET /health | OK — debe ser público |

---

## 7. API REAL — ENDPOINTS COMPLETOS

```
GET    /api/v1/health
GET    /api/v1/health/ready

GET    /api/v1/auth/session?userId=
GET    /api/v1/auth/users

POST   /api/v1/requests
GET    /api/v1/requests?companyId=&status=&search=
GET    /api/v1/requests/:id
POST   /api/v1/requests/:id/submit
POST   /api/v1/requests/:id/approve
POST   /api/v1/requests/:id/classify
POST   /api/v1/requests/:id/photo
GET    /api/v1/requests/:id/history

GET    /api/v1/warehouse/pending
GET    /api/v1/warehouse/:id
POST   /api/v1/warehouse/:id/classify
POST   /api/v1/warehouse/:id/approve
POST   /api/v1/warehouse/:id/return

GET    /api/v1/accounting/pending
GET    /api/v1/accounting/:id
POST   /api/v1/accounting/:id/approve
POST   /api/v1/accounting/:id/reject

GET    /api/v1/final-review/pending
GET    /api/v1/final-review/:id
POST   /api/v1/final-review/:id/approve
POST   /api/v1/final-review/:id/reject

GET    /api/v1/catalogs/groups
GET    /api/v1/catalogs/subgroups?groupId=
GET    /api/v1/catalogs/categories?subgroupId=
GET    /api/v1/catalogs/brands
GET    /api/v1/catalogs/units

GET    /api/v1/audit/events?entityType=&entityId=&actorId=

GET    /api/v1/uploads/requests/:filename

GET    /api/v1/docs (Swagger UI)
```

---

## 8. TESTS REALES

### 8.1 Archivos de test

| Archivo | Tests | Estado |
|---|---|---|
| `test/workflow.service.spec.ts` | 16 | ✅ Todos pasan |
| `test/requests.service.spec.ts` | 21 | ✅ Todos pasan |
| `test/catalogs.controller.spec.ts` | 4 | ✅ Todos pasan |
| `test/master-code.service.spec.ts` | 6 | ✅ Todos pasan |
| **Total** | **47** | **47/47 PASS** |

### 8.2 Tests que NO existen

- warehouse.service / warehouse.controller
- accounting.service / accounting.controller
- final-review.service / final-review.controller
- auth.service / auth.controller / rbac.guard
- audit.service / audit.controller
- uploads.controller
- health.service / health.controller
- Ningún test de frontend
- Ningún test E2E

---

## 9. DOCUMENTACIÓN REAL

### 9.1 Archivos en `docs/` (20 archivos)

| Archivo | Tamaño | Estado vs Código |
|---|---|---|
| architecture.md | 10 KB | ⚠️ Parcial — describe arquitectura conceptual |
| cleanup.md | 7 KB | ⚠️ Plan de limpieza de fase anterior |
| concurrency.md | 8 KB | ⚠️ Análisis conceptual, no refleja implementación actual |
| current-status.md | 6 KB | ⚠️ Desactualizado |
| decisions.md | 20 KB | ⚠️ Decisiones históricas, parcialmente aplicadas |
| frontend-prototype.md | 8 KB | ⚠️ Prototipo conceptual |
| future-architecture.md | 4 KB | ⚠️ Arquitectura futura deseada |
| local-development.md | 2 KB | ✅ Instrucciones de desarrollo |
| local-testing.md | 6 KB | ⚠️ Pruebas documentadas |
| local-workflow-testing.md | 4 KB | ⚠️ Pruebas de workflow |
| master-data-model.md | 17 KB | ⚠️ Modelo conceptual, no refleja Prisma actual |
| merge-split.md | 15 KB | ⚠️ Operaciones de merge/split no implementadas |
| phase-0-deliverables.md | 1 KB | ✅ Entregables de fase 0 |
| project-structure.md | 3 KB | ⚠️ Estructura documentada vs real |
| rbac.md | 1 KB | ⚠️ Roles documentados vs implementados |
| schema-review.md | 25 KB | ⚠️ Schema SQL conceptual vs Prisma actual |
| source-data-model.md | 9 KB | ⚠️ Modelo de sources no implementado |
| state-machines.md | 11 KB | ⚠️ States documentados vs implementados |
| USER-GUIDE.md | 5 KB | ⚠️ Guía de usuario |
| workflow-design.md | 12 KB | ⚠️ Diseño workflow vs implementación actual |

### 9.2 Archivos en `prompts/` (13 archivos)

Son prompts para guiar el desarrollo por fases. No son documentación del sistema.

### 9.3 `AGENTS.md` — Reglas del agente

Actualizado con reglas de API Runtime. Funcional.

### 9.4 `README.md` — 32 líneas

Mínimo. No describe la arquitectura ni cómo usar el sistema.

---

## 10. SCRIPTS REALES

| Script | Función | Estado |
|---|---|---|
| `scripts/api-restart.ps1` | Build + Stop + Start + Health | ✅ Funcional |
| `scripts/api-start.ps1` | Iniciar API desacoplada | ✅ Funcional |
| `scripts/api-stop.ps1` | Detener API en puerto 3001 | ✅ Funcional |
| `scripts/api-health.ps1` | Verificar health con polling | ✅ Funcional |
| `scripts/verify-local.ps1` | Verificación de prerequisitos | ✅ Funcional |

---

## 11. DEPENDENCIAS

### 11.1 apps/api (Backend)

**Runtime:**
- @nestjs/common, core, platform-express, config, serve-static, swagger
- @prisma/client
- class-transformer, class-validator
- reflect-metadata, rxjs

**Dev:**
- @nestjs/cli, schematics, testing
- prisma
- typescript, ts-node, tsconfig-paths
- vitest
- @types/express, @types/multer, @types/node

### 11.2 apps/web (Frontend)

**Runtime:**
- react, react-dom (v19)
- react-router-dom (v7)
- @tanstack/react-query (v5)
- react-hook-form, @hookform/resolvers
- zod

**Dev:**
- @vitejs/plugin-react
- typescript (5.7.3)
- vite (v6)
- vitest
- @testing-library/react, @testing-library/jest-dom
- jsdom
- eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh

### 11.3 packages/shared y packages/contracts

Ambos paquetes existen pero son mínimos:
- `shared`: Solo `enums.ts` (77 líneas de constantes)
- `contracts`: Solo `health.ts` (11 líneas, 2 interfaces)

**Ninguno es importado por apps/api o apps/web.** Son código huérfano.

---

## 12. INCONSISTENCIAS ENCONTRADAS

### 12.1 Nombres duplicados

| Problema | Detalle |
|---|---|
| `flattenRequestData()` | Definida 4 veces: requests.service.ts, warehouse.service.ts, accounting.service.ts, final-review.service.ts |
| Transiciones de workflow | Definidas 2 veces: requests.service.ts (hardcoded) y shared/workflow/workflow.service.ts (no usado) |
| Generación de master code | Definida 2 veces: requests.service.ts (inline) y shared/master-code/master-code.service.ts (no usado) |
| Datos de catálogos | Existen 2 fuentes: API real (`/api/v1/catalogs/*`) y mock local (`mock/catalog.ts`). Frontend usa mock local en WarehouseClassify |
| Datos de usuarios | Existen 2 fuentes: API real (`/api/v1/auth/users`) y mock local (`mock/companies.ts`). Frontend usa mock local en AccountingList y FinalReviewPage |
| `uploads/requests/` | Existe en 2 ubicaciones: `apps/api/uploads/requests/` (8 archivos) y `uploads/requests/` (9 archivos) |

### 12.2 Código no utilizado

| Archivo | Estado |
|---|---|
| `packages/shared/` | No importado por nadie |
| `packages/contracts/` | No importado por nadie (apps/web/src/contracts/ es independiente) |
| `shared/workflow/workflow.service.ts` | Exportado pero no usado por RequestsService |
| `shared/master-code/master-code.service.ts` | Exportado pero no usado por RequestsService |
| `api-session-service.ts` | Exportado pero apps/web/src/services/index.ts no lo exporta |
| `api-catalog-service.ts` | Exportado pero apps/web/src/services/index.ts no lo exporta |
| `services/session.ts` | Mock session — solo usado como fallback si API falla |
| `db/schema.sql` | Schema conceptual, no conectado a implementación |
| `opencode.jsonc.v2` | No es `opencode.jsonc` — OpenCode probablemente no lo detecta |

### 12.3 Datos de prueba en uploads

Hay 8-9 imágenes de prueba en uploads. Son binarios de prueba, no código.

---

## 13. CLASIFICACIÓN DE ARCHIVOS

### A. ACTIVO — Se usa actualmente

- `apps/api/src/` — Todo el código fuente del backend
- `apps/api/prisma/schema.prisma` — Esquema de base de datos
- `apps/api/prisma/seed.js` — Seed de datos
- `apps/api/data/dev.db` — Base de datos SQLite
- `apps/api/test/` — 4 archivos de test
- `apps/api/.env` — Variables de entorno
- `apps/api/vitest.config.ts` — Config de tests
- `apps/web/src/` — Todo el código fuente del frontend
- `apps/web/.env` — VITE_DATA_MODE=api
- `apps/web/vite.config.ts` — Config de Vite
- `scripts/` — 5 scripts PowerShell
- `AGENTS.md` — Reglas del agente
- `package.json` — Root package
- `pnpm-workspace.yaml` — Workspace config
- `tsconfig.base.json` — Config TS compartida

### B. NECESARIO DE INFRAESTRUCTURA

- `apps/api/package.json` — Dependencias del backend
- `apps/api/tsconfig.json` — Config TS del backend
- `apps/api/tsconfig.build.json` — Config build
- `apps/api/nest-cli.json` — Config NestJS CLI
- `apps/web/package.json` — Dependencias del frontend
- `apps/web/tsconfig.json` — Config TS del frontend
- `apps/web/tsconfig.node.json` — Config TS de Node para Vite
- `apps/web/index.html` — Entry HTML
- `.gitignore` — Ignorados de git
- `.prettierrc` / `.prettierignore` — Formateo
- `pnpm-lock.yaml` — Lock file
- `docker-compose.yml` — PostgreSQL (no usado actualmente pero existe)
- `.env.docker` — Variables Docker
- `.env.example` — Variables de ejemplo

### C. DOCUMENTACIÓN VIGENTE

- `AGENTS.md` — Reglas del agente (actualizado)
- `docs/local-development.md` — Instrucciones de desarrollo
- `docs/phase-0-deliverables.md` — Entregables fase 0

### D. OBSOLETO / DESACTUALIZADO

- `db/schema.sql` — Schema conceptual, no refleja Prisma actual
- `opencode.jsonc.v2` — Config con nombre incorrecto
- `docs/current-status.md` — Estado desactualizado
- `docs/schema-review.md` — Review de schema conceptual
- `docs/source-data-model.md` — Modelo no implementado
- `docs/merge-split.md` — Operaciones no implementadas
- `docs/future-architecture.md` — Arquitectura futura deseada
- `docs/concurrency.md` — Análisis conceptual
- `docs/master-data-model.md` — Modelo conceptual
- `docs/state-machines.md` — Máquinas de estado vs implementación actual
- `docs/workflow-design.md` — Diseño vs implementación actual
- `docs/rbac.md` — RBAC documentado vs implementado
- `docs/project-structure.md` — Estructura documentada vs real
- `docs/cleanup.md` — Plan de limpieza anterior
- `docs/decisions.md` — Decisiones históricas
- `docs/frontend-prototype.md` — Prototipo conceptual

### E. DUPLICADO

- `packages/shared/` — Enums duplicados con `apps/web/src/types/`
- `packages/contracts/` — Tipos duplicados con `apps/web/src/contracts/`
- `uploads/requests/` (root) — Duplica `apps/api/uploads/requests/`
- `apps/api/uploads/` — Duplica `uploads/requests/` (root)
- `flattenRequestData()` — 4 copias idénticas
- Transiciones workflow — 2 definiciones
- Generación master code — 2 definiciones
- Datos de catálogos — mock local vs API
- Datos de usuarios — mock local vs API

### F. EXPERIMENTAL / DE PRUEBA

- `apps/api/uploads/requests/` — Imágenes de prueba
- `uploads/requests/` — Imágenes de prueba
- `apps/web/src/mock/` — Datos mock completos (6 archivos)
- `apps/api/data/dev.db` — Base de datos con datos de prueba

### G. SOSPECHOSO

- `apps/web/src/services/session.ts` — Mock session, ¿se usa como fallback?
- `apps/web/src/services/api/api-session-service.ts` — Exportado pero ¿consumido?
- `apps/web/src/services/api/api-catalog-service.ts` — Exportado pero ¿consumido?
- `apps/web/vite.config.js` — Build output de vite.config.ts (¿debería estar en git?)
- `apps/web/tsconfig.node.tsbuildinfo` — Build info (¿debería estar en git?)

---

## 14. PROBLEMAS DE ARQUITECTURA

1. **Auth global in-memory** — `AuthService.currentUserId` es compartido entre todas las conexiones HTTP. Incompatible con producción.

2. **WorkflowService y MasterCodeService no integrados** — existen como código definido pero RequestsService tiene su propia implementación inline.

3. **Frontend depende de mock data** — WarehouseClassify, AccountingList, FinalReviewPage cargan datos de usuarios/catálogos desde archivos mock locales en vez de la API.

4. **packages/ huérfanos** — `shared` y `contracts` no son importados por nadie.

5. **Duplicación de flattenRequestData** — 4 copias idénticas en 4 archivos de servicio.

6. **CORS y uploads** — No hay autenticación en uploads ni en catálogos.

7. **No hay Docker funcional** — `docker-compose.yml` existe pero no se usa.

8. **request_number como string** — Prisma dice `String @unique`, schema SQL dice `bigint GENERATED ALWAYS AS IDENTITY`.

---

## 15. DEUDA TÉCNICA PRIORIZADA

1. Auth mock in-memory → Requiere JWT real
2. `flattenRequestData()` duplicado 4 veces → Extraer a shared
3. `WorkflowService` no integrado → Unificar con RequestsService
4. `MasterCodeService` no integrado → Unificar con RequestsService
5. Frontend mock data → Consumir API real
6. packages/ huérfanos → Evaluar eliminar o integrar
7. Sin tests de warehouse/accounting/final-review/auth/audit
8. Sin tests de frontend
9. `uploads/requests/` duplicado en 2 ubicaciones
10. Sin helmet, rate limiting

---

## 16. QUÉ NO DEBE TOCARSE

- `apps/api/src/main.ts` — Bootstrap estable
- `apps/api/src/app.module.ts` — Módulos registrados correctamente
- `apps/api/prisma/schema.prisma` — Esquema funcional
- `apps/web/src/components/ui/` — Componentes UI estables
- `apps/web/src/components/workflow/` — WorkflowTimeline, RequestDetail
- `apps/web/src/contexts/SessionContext.tsx` — Context funcional
- `apps/web/src/types/index.ts` — Tipos bien definidos
- `apps/web/src/utils/image.ts` — Compresión de imágenes funcional
- Tests existentes (47 pasando)
- Scripts api-restart/start/stop/health
- Seed data funcional
