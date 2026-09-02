# AUDITORÍA GLOBAL — FASE 6C

Fecha: 2026-09-01
Auditor: OpenCode (automático)
Estado: DOCUMENTACIÓN SOLAMENTE — Sin cambios de código

---

## 1. Estado Actual

| Aspecto | Estado |
|---------|--------|
| API (NestJS) | corriendo en puerto 3001 |
| Frontend (React/Vite) | corriendo en puerto 5173 |
| Base de datos | SQLite (`apps/api/data/dev.db`) |
| Tests API | 77/77 passing |
| Typecheck API | PASS |
| Typecheck WEB | PASS |
| Build API | PASS |
| Health check | PASS |
| Prisma migrations | 0 (usa `db push`) |
| Módulos backend | 13 + PrismaModule |
| Módulos frontend | 9 feature modules |
| Archivos backend (src/) | 48 |
| Archivos frontend (src/) | 63 |
| Documentos docs/ | 40 |
| Prompts | 13 (phase-00 a phase-12) |
| Skills OpenCode | 13 |

---

## 2. Stack Real Detectado

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Runtime | Node.js | >=20.0.0 |
| Package manager | pnpm | 9.15.4 |
| Backend framework | NestJS | ^10.4.0 |
| Frontend framework | React | ^19.0.0 |
| Build tool | Vite | ^6.0.0 |
| ORM | Prisma | ^6.3.0 |
| DB desarrollo | SQLite | file:../data/dev.db |
| DB producción (diseño) | PostgreSQL | 16-alpine (Docker) |
| Testing API | Vitest | ^2.1.0 |
| Testing WEB | Vitest + @testing-library/react | ^2.1.0 |
| TypeScript | TypeScript | ^5.7.3 |
| HTTP client frontend | fetch (via api-client.ts) | nativo |
| Formularios | react-hook-form + zod | ^7.54.0 / ^3.24.0 |
| State management | React Context + TanStack Query | ^5.62.0 |
| Routing | react-router-dom | ^7.1.0 |
| API docs | Swagger (@nestjs/swagger) | ^8.1.0 |
| Validación backend | class-validator + class-transformer | ^0.14.1 / ^0.5.1 |
| Linting | ESLint + Prettier | ^9.16.0 |
| Containerization | Docker Compose | v3.8 |

---

## 3. Estructura Raíz

```
Data-Maestra/
├── .env.docker              # Config Docker
├── .env.example             # Template de variables
├── .gitignore               # Ignora .env*, *.db, dist, node_modules
├── .opencode/               # Configuración OpenCode (skills, commands)
├── .prettierignore          # Exclusiones Prettier
├── .prettierrc              # Config Prettier
├── AGENTS.md                # Reglas para OpenCode (NO para desarrolladores)
├── README.md                # Readme principal
├── apps/                    # Monorepo apps
│   ├── api/                 # Backend NestJS
│   └── web/                 # Frontend React
├── db/                      # Schema SQL PostgreSQL (diseño Fase 0)
│   └── schema.sql           # 347 líneas — esquema lógico PostgreSQL
├── docker-compose.yml       # PostgreSQL 16
├── docs/                    # Documentación del proyecto (40 archivos)
├── node_modules/            # Dependencias raíz
├── package.json             # Scripts raíz
├── pnpm-lock.yaml           # Lock file
├── pnpm-workspace.yaml      # Workspaces: apps/*, packages/*
├── prompts/                 # 13 prompts de fases (phase-00 a phase-12)
├── scripts/                 # 5 scripts PowerShell
├── tsconfig.base.json       # TypeScript config compartida
└── uploads/                 # Uploads de solicitudes (9 archivos)
    └── requests/
```

---

## 4. Backend (apps/api)

### 4.1 Estructura

```
apps/api/
├── .env                     # SQLite, puerto 3001, API_PREFIX=api/v1
├── api.log                  # Logs stdout
├── api.err.log              # Logs stderr
├── data/
│   ├── .gitkeep
│   └── dev.db               # SQLite database
├── dist/                    # Build output (GENERADO — no editar)
├── nest-cli.json            # NestJS CLI config
├── package.json             # Dependencias y scripts
├── prisma/
│   ├── migrations/          # VACÍO — sin migraciones
│   ├── schema.prisma        # 461 líneas, 21 modelos
│   └── seed.js              # 144 líneas, datos de prueba
├── scripts/                 # Scripts internos del API
├── src/
│   ├── app.module.ts        # Root module — 14 feature modules
│   ├── main.ts              # Bootstrap — NestExpress, CORS, Swagger
│   ├── comun/               # Infraestructura compartida
│   │   ├── prisma/          # PrismaModule + PrismaService
│   │   └── utilidades/      # flatten-request-data.ts
│   └── modulos/             # 13 módulos de negocio
│       ├── almacen/         # Clasificación de almacén
│       ├── archivos/        # Upload de archivos (sin service)
│       ├── auditoria/       # Eventos de auditoría
│       ├── autenticacion/   # Auth + RBAC guard + decorator
│       ├── catalogos/       # Catálogos (grupos, marcas, unidades)
│       ├── contabilidad/    # Aprobación contable
│       ├── importaciones/   # Runs de importación
│       ├── notificaciones/  # Notificaciones
│       ├── organizacion/    # Empresas, departamentos, usuarios
│       ├── panel/           # Dashboard/estadísticas
│       ├── revision-final/  # Revisión final
│       ├── salud/           # Health check
│       └── solicitudes/     # Solicitudes + DTOs
├── test/                    # 9 archivos de tests
├── tsconfig.json            # TypeScript config (CommonJS)
├── tsconfig.build.json      # Build config (excluye tests)
└── vitest.config.ts         # Vitest config
```

### 4.2 Módulos Backend (13 + PrismaModule)

| Módulo | Archivos | Service | Controller | DTOs | Notas |
|--------|----------|---------|------------|------|-------|
| almacen | 3 | ✅ | ✅ | — | Clasificación + devolución |
| archivos | 2 | ❌ | ✅ | — | Solo controller, sin service |
| auditoria | 3 | ✅ | ✅ | — | AuditEvent queries |
| autenticacion | 5 | ✅ | ✅ | — | Incluye RBAC guard + decorator |
| catalogos | 3 | ✅ | ✅ | — | CRUD catálogos |
| contabilidad | 3 | ✅ | ✅ | — | RETURN en vez de REJECT |
| importaciones | 3 | ✅ | ✅ | — | ImportRun + SourceItem |
| notificaciones | 3 | ✅ | ✅ | — | Notification CRUD |
| organizacion | 3 | ✅ | ✅ | — | Companies/depts/users/roles |
| panel | 3 | ✅ | ✅ | — | Dashboard stats |
| revision-final | 3 | ✅ | ✅ | — | Revisión final |
| salud | 3 | ✅ | ✅ | — | Health check endpoint |
| solicitudes | 7 | ✅ | ✅ | 3 | approval, classify-request, create-request |

### 4.3 Archivos Generados (NO editar)

- `apps/api/dist/` — Build output de NestJS
- `apps/api/data/dev.db` — SQLite database (generada por Prisma)
- `apps/api/data/dev.db-journal` — WAL journal de SQLite
- `apps/api/data/dev.db-wal` — Write-ahead log
- `apps/api/data/dev.db-shm` — Shared memory file
- `apps/api/uploads/` — 12 archivos subidos (hash-named)

---

## 5. Frontend (apps/web)

### 5.1 Estructura

```
apps/web/
├── .env                     # VITE_DATA_MODE=api
├── dist/                    # Build output (GENERADO)
├── index.html               # Entry HTML
├── package.json             # Dependencias
├── src/
│   ├── main.tsx             # Entry point
│   ├── vite-env.d.ts        # Vite type definitions
│   ├── app/
│   │   ├── App.tsx          # Root component + router
│   │   └── globals.css      # Global styles
│   ├── componentes/
│   │   ├── diseno/          # AppLayout (sidebar, navbar)
│   │   ├── ui/              # ImageLightbox, UserSwitcher, index
│   │   └── workflow/        # AnalyzerPanel, MasterCodePreview, RequestDetail, WorkflowTimeline
│   ├── contextos/
│   │   ├── CompanyContext.tsx    # Company state (API)
│   │   └── SessionContext.tsx    # Session/auth state
│   ├── contratos/
│   │   └── index.ts         # 9 interfaces de servicio
│   ├── hooks/
│   │   ├── useCatalogos.ts  # Hook → apiCatalogoService
│   │   └── useOrganizacion.ts # Hook → apiOrganizacionService
│   ├── mock/                # Datos mock (3 archivos)
│   │   ├── extras.ts        # qualityResults, auditEvents, notifications
│   │   ├── requests.ts      # 9 requests de prueba
│   │   └── source-items.ts  # importRuns, matchCandidates, analyzerProposals
│   ├── modulos/             # 9 módulos de feature
│   │   ├── administracion/  # AdministracionPage
│   │   ├── almacen/         # AlmacenList + AlmacenClassify
│   │   ├── aprobaciones/    # AprobacionesPage
│   │   ├── auditoria/       # AuditoriaPage
│   │   ├── contabilidad/    # ContabilidadList
│   │   ├── importaciones/   # ImportacionesPage
│   │   ├── panel/           # PanelPage (dashboard)
│   │   ├── revision-final/  # RevisionFinalPage
│   │   └── solicitudes/     # SolicitudesList + SolicitudCreate + SolicitudDetailPage
│   ├── servicios/
│   │   ├── index.ts         # Mode switch (mock/api)
│   │   ├── api/             # 12 archivos — servicios API reales
│   │   └── mock/            # 6 archivos — servicios mock
│   ├── tipos/
│   │   └── index.ts         # 72 líneas — todos los tipos TypeScript
│   └── utilidades/
│       └── image.ts         # Utilidad de imágenes
├── tsconfig.json            # TypeScript config (ESNext/bundler)
├── tsconfig.node.json       # Vite config TypeScript
├── tsconfig.node.tsbuildinfo # Build info (GENERADO)
├── vite.config.ts           # Vite config
├── vite.config.js           # Compiled vite config (GENERADO)
└── vite.config.d.ts         # Type declaration (GENERADO)
```

### 5.2 Módulos Frontend (9)

| Módulo | Archivos | Servicio consumido | Mock disponible |
|--------|----------|-------------------|-----------------|
| administracion | 1 | — | — |
| almacen | 2 | warehouseService | ✅ |
| aprobaciones | 1 | requestService | ✅ |
| auditoria | 1 | auditService | ✅ |
| contabilidad | 1 | accountingService | ✅ |
| importaciones | 1 | apiImportacionService (directo) | ❌ |
| panel | 1 | apiPanelService (directo) | ❌ |
| revision-final | 1 | finalReviewService | ✅ |
| solicitudes | 3 | requestService | ✅ |

### 5.3 Servicios API (10)

| Servicio | Archivo | Endpoint consumes |
|----------|---------|-------------------|
| api-request-service | api-request-service.ts | /solicitudes |
| api-warehouse-service | api-warehouse-service.ts | /almacen |
| api-accounting-service | api-accounting-service.ts | /contabilidad |
| api-final-review-service | api-final-review-service.ts | /revision-final |
| api-audit-service | api-audit-service.ts | /auditoria |
| api-catalogo-service | api-catalogo-service.ts | /catalogos |
| api-organizacion-service | api-organizacion-service.ts | /organizacion |
| api-importacion-service | api-importacion-service.ts | /importaciones |
| api-notificacion-service | api-notificacion-service.ts | /notificaciones |
| api-panel-service | api-panel-service.ts | /panel |

### 5.4 Servicios Mock (5)

| Servicio | Archivo | Datos fuente |
|----------|---------|--------------|
| mockRequestService | request-service.ts | mock/requests.ts |
| mockWarehouseService | warehouse-service.ts | mock/requests.ts |
| mockAccountingService | accounting-service.ts | mock/requests.ts |
| mockFinalReviewService | final-review-service.ts | Array local vacío |
| mockAuditService | audit-service.ts | mock/extras.ts |

### 5.5 Archivos Generados (NO editar)

- `apps/web/dist/` — Build output de Vite
- `apps/web/vite.config.js` — Compilado de vite.config.ts
- `apps/web/vite.config.d.ts` — Tipos de vite.config.ts
- `apps/web/tsconfig.node.tsbuildinfo` — Build info

---

## 6. Base de Datos

### 6.1 SQLite (Desarrollo)

- **Ubicación:** `apps/api/data/dev.db`
- **Proveedor:** SQLite
- **Esquema:** `apps/api/prisma/schema.prisma` (461 líneas, 21 modelos)
- **Migraciones:** 0 (usa `prisma db push`)
- **Seed:** `apps/api/prisma/seed.js` (144 líneas)
- **Datos seed:** 3 empresas, 6 departamentos, 6 usuarios, 7 roles, 13 permisos, 9 user-roles, 5 grupos, 5 subgrupos, 4 categorías, 5 marcas, 4 unidades de medida

### 6.2 PostgreSQL (Producción — Diseño)

- **Ubicación:** `db/schema.sql` (347 líneas)
- **Esquemas:** `mdm`, `profit_staging`, `audit`
- **Enums:** 5 (item_status, request_status, approval_action, source_record_status, match_status)
- **Tablas:** 20+
- **Estado:** Diseño Fase 0 — NO implementado

### 6.3 Modelos Prisma (21)

| Modelo | Tabla | Descripción |
|--------|-------|-------------|
| Company | companies | Empresas |
| User | users | Usuarios |
| Role | roles | Roles |
| Permission | permissions | Permisos |
| UserRole | user_roles | Asignación usuario-rol-empresa |
| RolePermission | role_permissions | Asignación rol-permiso |
| Department | departments | Departamentos |
| CatalogGroup | catalog_groups | Grupos de catálogo |
| CatalogSubgroup | catalog_subgroups | Subgrupos |
| CatalogCategory | catalog_categories | Categorías |
| Brand | brands | Marcas |
| UnitOfMeasure | units_of_measure | Unidades de medida |
| MasterItem | master_items | Artículos maestros |
| Request | requests | Solicitudes |
| RequestData | request_data | Datos extendidos de solicitud |
| RequestAccountingCode | request_accounting_codes | Códigos contables |
| WorkflowInstance | workflow_instances | Instancias de workflow |
| WorkflowTask | workflow_tasks | Tareas de workflow |
| WorkflowHistory | workflow_history | Historial de workflow |
| Approval | approvals | Aprobaciones |
| AuditEvent | audit_events | Eventos de auditoría |
| ImportRun | import_runs | Runs de importación |
| SourceItem | source_items | Items de origen |
| Notification | notifications | Notificaciones |

### 6.4 Diferencias SQLite vs PostgreSQL (schema.sql)

| Aspecto | SQLite (Prisma) | PostgreSQL (schema.sql) |
|---------|-----------------|------------------------|
| Enums | String | ENUM types |
| UUID | String @default(uuid()) | uuid DEFAULT gen_random_uuid() |
| JSON | String | jsonb |
| Tabs | companies | mdm.companies + profit_staging + audit |
| Tablas extra en SQL | — | organizations, sources, master_item_source_map, item_aliases, match_candidates, workflow_tasks, data_quality_issues |
| Índices GIN | — | Sí (attributes, jsonb) |
| Índices parciales | — | Sí (uq_active_source_item_master) |

---

## 7. Documentación

### 7.1 Inventario Completo (40 archivos)

| # | Archivo | Propósito | Válido | Duplicado | Obsoleto | Recomendación |
|---|---------|-----------|--------|-----------|----------|---------------|
| 1 | README.md | Readme principal del proyecto | Sí | No | No | Conservar |
| 2 | AGENTS.md | Reglas para OpenCode | Sí | No | No | Conservar (solo OpenCode) |
| 3 | docs/README.md | Índice de documentación | Sí | Parcial con RAÍZ/README | No | Fusionar con README raíz |
| 4 | docs/MANUAL_DESARROLLADOR.md | Manual completo del dev | Sí | No | No | Conservar — doc principal |
| 5 | docs/MAPA_PARA_DESARROLLADOR.md | Mapa rápido "¿dónde voy?" | Sí | Parcial con MAPA_ARQUITECTURA | No | Fusionar con MAPA_ARQUITECTURA |
| 6 | docs/MAPA_ARQUITECTURA.md | Mapa de arquitectura | Sí | Parcial con MAPA_PARA | No | Fusionar con MAPA_PARA |
| 7 | docs/MAPA_CAMBIOS.md | Historial de cambios por fase | Sí | No | No | Conservar |
| 8 | docs/REGLAS_ARQUITECTURA.md | Reglas técnicas | Sí | Parcial con AGENTS.md | No | Mantener separado (dev vs AI) |
| 9 | docs/GLOSARIO_PROYECTO.md | Glosario de términos | Sí | No | No | Conservar |
| 10 | docs/FLUJO_DATOS.md | Diagrama de flujo de datos | Sí | No | No | Conservar |
| 11 | docs/WORKFLOW_ACTUAL.md | Estado actual del workflow | Sí | No | No | Conservar |
| 12 | docs/RBAC_ACTUAL.md | Estado actual de RBAC | Sí | No | No | Conservar |
| 13 | docs/MASTER_CODE_ACTUAL.md | Generación de master codes | Sí | No | No | Conservar |
| 14 | docs/MODE_DATOS_ACTUAL.md | Modo de datos actual | Sí | No | No | Conservar |
| 15 | docs/MOCKS_ACTUALES.md | Inventario de mocks | Sí | No | Actualizado Fase 5 | Conservar |
| 16 | docs/AUTH_ACTUAL.md | Estado de autenticación | Sí | No | No | Conservar |
| 17 | docs/COBERTURA_ACTUAL.md | Cobertura de tests | Sí | No | No | Conservar |
| 18 | docs/FUENTES_DATOS_ACTUALES.md | Fuentes de datos | Sí | No | No | Conservar |
| 19 | docs/ESTRUCTURA_PROYECTO.md | Estructura de carpetas | Sí | Parcial con AUDITORIA | No | Actualizar o eliminar |
| 20 | docs/architecture.md | Arquitectura (inglés) | No | Sí con MAPA_ARQUITECTURA | Sí | Candidato a eliminación |
| 21 | docs/local-development.md | Guía desarrollo local | Sí | No | No | Conservar |
| 22 | docs/local-testing.md | Guía testing local | Sí | No | No | Conservar |
| 23 | docs/local-workflow-testing.md | Guía testing de workflow | Sí | No | No | Conservar |
| 24 | docs/USER-GUIDE.md | Guía de usuario | Sí | No | No | Conservar |
| 25 | docs/phase-0-deliverables.md | Entregables Fase 0 | Sí | No | Completado | Conservar como historial |
| 26 | docs/PENDIENTES_LIMPIEZA.md | Lista de pendientes | Sí | No | No | Conservar |
| 27 | docs/LIMPIEZA_FASE_3.md | Reporte limpieza Fase 3 | Sí | No | Completado | Conservar como historial |
| 28 | docs/PLAN_FASE_4B_1.md | Plan reestructuración 4B | Sí | No | Completado | Conservar como historial |
| 29 | docs/PLAN_FASE_4D_1.md | Plan limpieza 4D | Sí | No | Completado | Conservar como historial |
| 30 | docs/PLAN_REESTRUCTURACION.md | Plan reestructuración general | Sí | No | Completado | Conservar como historial |
| 31 | docs/REESTRUCTURACION_FASE_4B_1.md | Reporte reestructuración 4B | Sí | No | Completado | Conservar como historial |
| 32 | docs/REESTRUCTURACION_FASE_4D_1B.md | Reporte limpieza 4D-1B | Sí | No | Completado | Conservar como historial |
| 33 | docs/VALIDACION_REESTRUCTURACION.md | Validación reestructuración | Sí | No | Completado | Conservar como historial |
| 34 | docs/AUDITORIA_ACTUAL.md | Auditoría inicial | Sí | No | Completado | Conservar como historial |
| 35 | docs/AUDITORIA_MANTENIBILIDAD_FASE_4D_2.md | Auditoría mantenibilidad | Sí | No | Completado | Conservar como historial |
| 36 | docs/AUDITORIA_MOCKS_5A.md | Auditoría de mocks | Sí | No | Completado | Conservar como historial |
| 37 | docs/MIGRACION_CATALOGOS_5B.md | Migración catálogos → API | Sí | No | Completado | Conservar como historial |
| 38 | docs/MIGRACION_USUARIOS_EMPRESAS_5C.md | Migración users → API | Sí | No | Completado | Conservar como historial |
| 39 | docs/MIGRACION_IMPORTACIONES_5D.md | Migración imports → API | Sí | No | Completado | Conservar como historial |
| 40 | docs/MIGRACION_5E_NOTIFICACIONES_PANEL.md | Migración notif/panel → API | Sí | No | Completado | Conservar como historial |
| 41 | docs/VALIDACION_FASE_6A.md | Validación Fase 6A | Sí | No | Completado | Conservar como historial |
| 42 | docs/CIERRE_FASE_5F.md | Cierre limpieza mocks | Sí | No | Completado | Conservar como historial |

### 7.2 Prompts (13)

| Archivo | Fase | Propósito |
|---------|------|-----------|
| prompts/phase-00.md | Fase 0 | Arquitectura y modelo |
| prompts/phase-01.md | Fase 1 | Bootstrap técnico |
| prompts/phase-02.md | Fase 2 | Identidad, usuarios, RBAC |
| prompts/phase-03.md | Fase 3 | Catálogos y organización |
| prompts/phase-04.md | Fase 4 | Conector Profit READ-ONLY |
| prompts/phase-05.md | Fase 5 | Normalización datos históricos |
| prompts/phase-06.md | Fase 6 | Data Master |
| prompts/phase-07.md | Fase 7 | Matching híbrido |
| prompts/phase-08.md | Fase 8 | Solicitudes y aprobación gerente |
| prompts/phase-09.md | Fase 9 | Almacén |
| prompts/phase-10.md | Fase 10 | Contabilidad |
| prompts/phase-11.md | Fase 11 | Control final y activación |
| prompts/phase-12.md | Fase 12 | Sincronización controlada |

### 7.3 Skills OpenCode (13)

| Skill | Propósito |
|-------|-----------|
| architecture | Principios arquitectónicos |
| backend-nestjs | Desarrollo NestJS |
| code-review | Revisión de código |
| database-migrations | Migraciones Prisma |
| frontend-react | Desarrollo React |
| master-data | Gestión de data master |
| matching-engine | Motor de matching |
| postgresql | PostgreSQL |
| profit-integration | Integración Profit |
| security | Seguridad |
| testing | Pruebas |
| ui-ux | UX |
| workflow-approval | Workflows |

---

## 8. Scripts

### 8.1 Scripts PowerShell (5)

| Script | Propósito | Uso |
|--------|-----------|-----|
| scripts/api-restart.ps1 | Build + Stop + Start + Health | Desarrollador |
| scripts/api-start.ps1 | Solo iniciar API | Desarrollador |
| scripts/api-stop.ps1 | Solo detener API | Desarrollador |
| scripts/api-health.ps1 | Verificar health | Desarrollador |
| scripts/verify-local.ps1 | Verificar entorno local | Desarrollador |

### 8.2 Scripts Internos API (en prisma/)

| Script | Propósito |
|--------|-----------|
| node prisma/seed.js | Seed de datos de prueba |

---

## 9. Configuración

### 9.1 Variables de Entorno

| Archivo | Puerto API | Puerto WEB | DB | VITE_DATA_MODE |
|---------|-----------|-----------|-----|----------------|
| apps/api/.env | 3001 | — | SQLite | — |
| apps/web/.env | — | 5173 | — | api |
| .env.example | 3000 | — | PostgreSQL | — |
| .env.docker | 3000 | — | PostgreSQL | — |

**Nota:** Existe discrepancia: `.env.example` dice puerto 3000, pero `apps/api/.env` usa 3001. El Vite proxy apunta a 3001.

### 9.2 Configuraciones Duplicadas/Generadas

| Archivo | Estado |
|---------|--------|
| apps/web/vite.config.js | GENERADO de vite.config.ts |
| apps/web/vite.config.d.ts | GENERADO de vite.config.ts |
| apps/web/tsconfig.node.tsbuildinfo | GENERADO por TypeScript |
| apps/api/dist/ | GENERADO por nest build |
| apps/web/dist/ | GENERADO por vite build |

---

## 10. Tests

### 10.1 Tests API (9 archivos, 77 tests)

| Archivo | Tests | Cubre |
|---------|-------|-------|
| requests.service.spec.ts | Múltiples | CRUD solicitudes, workflow |
| warehouse.service.spec.ts | Múltiples | Clasificación almacén |
| accounting.service.spec.ts | Múltiples | Aprobación contable |
| final-review.service.spec.ts | Múltiples | Revisión final |
| catalogs.controller.spec.ts | Múltiples | Catálogos |
| flatten-request-data.spec.ts | Múltiples | Utilidad flatten |
| refresh-persistence.spec.ts | Múltiples | Persistencia |
| e2e-workflow.spec.ts | Múltiples | Workflow completo |
| data-flow.spec.ts | 8 | Flujo de datos |

### 10.2 Tests Frontend

- **Configuración:** Vitest configurado en `apps/web/package.json`
- **Tests escritos:** 0 (apps/web no tiene archivos .spec.ts)
- **Dependencias de testing instaladas:** @testing-library/react, @testing-library/jest-dom, jsdom

---

## 11. Mocks Restantes

### 11.1 Mocks de Datos (3 archivos)

| Archivo | Contenido | Consumido por |
|---------|-----------|---------------|
| mock/requests.ts | 9 requests | servicios/mock/*.ts |
| mock/extras.ts | qualityResults, auditEvents, notifications | servicios/mock/audit-service.ts |
| mock/source-items.ts | importRuns, matchCandidates, analyzerProposals | AlmacenClassify.tsx (directo) |

### 11.2 Mocks de Servicios (5 archivos)

| Servicio | Implementa | Estado |
|----------|-----------|--------|
| mock/request-service.ts | RequestService | Mock funcional |
| mock/warehouse-service.ts | WarehouseService | Mock funcional |
| mock/accounting-service.ts | AccountingService | Mock funcional |
| mock/final-review-service.ts | FinalReviewService | Mock con array vacío |
| mock/audit-service.ts | AuditService | Mock funcional |

### 11.3 Problemas con Mocks

1. **AlmacenClassify.tsx** importa `analyzerProposals` directamente de `../../mock/source-items` — bypass del mode switch
2. **final-review-service.ts** usa array local vacío — nunca retorna datos
3. **6 servicios no tienen mock:** ImportService, MatchingService, QualityService, NotificationService
4. **2 interfaces sin implementación alguna:** MatchingService, QualityService (solo definidas en contratos)

---

## 12. Código Generado

| Ubicación | Tipo | Editable |
|-----------|------|----------|
| apps/api/dist/ | Build NestJS | NO |
| apps/web/dist/ | Build Vite | NO |
| apps/web/vite.config.js | Compilado TS → JS | NO |
| apps/web/vite.config.d.ts | Tipos generados | NO |
| apps/web/tsconfig.node.tsbuildinfo | Build info | NO |
| apps/api/data/dev.db | SQLite database | NO (se regenera con seed) |
| apps/api/data/dev.db-* | SQLite WAL/SHM | NO |
| node_modules/ | Dependencias | NO |
| .opencode/node_modules/ | Plugin OpenCode | NO |
| pnpm-lock.yaml | Lock file | NO (se regenera) |
| .opencode/package-lock.json | Lock OpenCode | NO |

---

## 13. Archivos Posiblemente Obsoletos

| Archivo | Razón | Prioridad |
|---------|-------|-----------|
| docs/architecture.md | Duplicado con MAPA_ARQUITECTURA.md (en inglés) | Alta |
| apps/web/vite.config.js | Generado de vite.config.ts | Baja |
| apps/web/vite.config.d.ts | Generado de vite.config.ts | Baja |
| apps/web/tsconfig.node.tsbuildinfo | Build info | Baja |
| db/schema.sql | Diseño PostgreSQL Fase 0 — desactualizado respecto a Prisma | Media |
| uploads/ (raíz) | Directorio duplicado con apps/api/uploads/ | Alta |

---

## 14. Duplicaciones

### 14.1 Documentación

| Duplicación | Archivos |
|-------------|----------|
| README raíz vs docs/README.md | README.md, docs/README.md |
| MAPA_ARQUITECTURA vs MAPA_PARA_DESARROLLADOR | docs/MAPA_ARQUITECTURA.md, docs/MAPA_PARA_DESARROLLADOR.md |
| architecture.md vs MAPA_ARQUITECTURA.md | docs/architecture.md (inglés), docs/MAPA_ARQUITECTURA.md (español) |

### 14.2 Código

| Duplicación | Archivos |
|-------------|----------|
| uploads/ duplicado | uploads/requests/ (9 archivos) vs apps/api/uploads/ (12 archivos) |
| vite.config compilado | vite.config.ts vs vite.config.js + vite.config.d.ts |

### 14.3 Contratos sin implementación

| Interfaz | Mock | API | Estado |
|----------|------|-----|--------|
| RequestService | ✅ | ✅ | Completo |
| WarehouseService | ✅ | ✅ | Completo |
| AccountingService | ✅ | ✅ | Completo |
| FinalReviewService | ✅ | ✅ | Completo |
| AuditService | ✅ | ✅ | Completo |
| ImportService | ❌ | ✅ | Sin mock |
| MatchingService | ❌ | ❌ | Sin implementación |
| QualityService | ❌ | ❌ | Sin implementación |
| NotificationService | ❌ | ✅ | Sin mock (consumido directo) |

---

## 15. Dependencias Internas

### 15.1 Backend — Patrón de dependencias

```
app.module.ts
├── ConfigModule (global)
├── PrismaModule (comun)
├── 13 feature modules
    └── Cada módulo: controller → service → prismaService
```

- No hay dependencias circulares entre módulos
- Todos los módulos usan PrismaModule inyectado
- Solo solicitudes tiene DTOs separados
- Solo autenticacion tiene guard y decorator

### 15.2 Frontend — Patrón de dependencias

```
App.tsx
├── CompanyContext → apiOrganizacionService
├── SessionContext → mock user
├── Router
    ├── modulos/* → servicios/index.ts (mode switch)
    ├── hooks/* → servicios/api/* (directo)
    ├── componentes/diseno/AppLayout → apiNotificacionService (directo)
    └── contextos/CompanyContext → apiOrganizacionService (directo)
```

**Problema:** 6 componentes importan servicios API directamente, sin pasar por el mode switch. Si VITE_DATA_MODE=mock, estos componentes fallarán.

---

## 16. Problemas de Nomenclatura

| Problema | Ubicación | Detalle |
|----------|-----------|---------|
| Nombre de módulo vs nombre de archivo | backend/solicitudes | El módulo se llama `solicitudes/` pero el archivo principal es `solicitud.module.ts` (singular) |
| Mezcla de convenciones | backend | La mayoría de módulos usan nombre plural (`almacen`, `catalogos`) pero el controller/service varía |
| `comun/` vs `shared/` | backend | Cambiado de shared a comun en Fase 4B — consistente |
| `modulos/` vs `modules/` | ambos | Cambiado de modules a modulos en Fase 4B — consistente |

---

## 17. Problemas de Organización

| Problema | Detalle |
|----------|---------|
| uploads/ duplicado | Archivos en uploads/ raíz Y en apps/api/uploads/ |
| db/schema.sql desactualizado | No refleja los 21 modelos Prisma actuales |
| docs/ con 40 archivos | Muchos son historial de fases completadas — podrían archivarse |
| Mock data en componentes | AlmacenClassify.tsx importa datos mock directamente |
| Servicios sin mode switch | 6 servicios importados directamente de api/ sin fallback mock |
| Sin packages/ compartidos | pnpm-workspace.yaml lista packages/* pero no existe |

---

## 18. Problemas de Comandos

| Comando | Problema |
|---------|----------|
| `pnpm test` | Falla si apps/web no tiene tests escritos |
| `pnpm typecheck` | No existe como script en package.json raíz |
| `pnpm lint` | Existe pero no se ha verificado su funcionamiento |
| `pnpm build` | Ejecuta build en paralelo — puede fallar si api necesita web o viceversa |
| `pnpm dev` | Ejecuta dev en paralelo — ambos servers arrancan juntos |
| Root .env.example | Dice PORT=3000 pero apps/api/.env usa PORT=3001 |

---

## 19. Riesgos

| Riesgo | Severidad | Detalle |
|--------|-----------|---------|
| db push sin migraciones | Alta | No hay historial de cambios de esquema |
| SQLite ≠ PostgreSQL | Media | Diferencias en tipos, enums, índices |
| Mocks sin fallback | Media | 6 componentes fallan en modo mock |
| uploads/ duplicado | Baja | Puede causar confusión |
| docs/ desactualizados | Baja | Documentación puede contradecir código |
| Sin tests frontend | Media | 0 tests en apps/web |
| vitest.config alias obsoletos | Baja | `@shared` y `@config` no existen |

---

## 20. Recomendaciones

### Prioridad Alta
1. Implementar migraciones Prisma para tener historial de esquema
2. Unificar uploads/ en una sola ubicación
3. Crear tests básicos para apps/web

### Prioridad Media
4. Completar matching engine (MatchingService) cuando se llegue a Fase 7
5. Completar quality service (QualityService) cuando se implemente
6. Hacer que los 6 componentes que importan api/* directamente pasen por el mode switch
7. Corregir vitest.config.ts alias obsoletos
8. Agregar `pnpm typecheck` a la raíz

### Prioridad Baja
9. Archivar documentación de fases completadas en docs/archived/
10. Fusionar README raíz con docs/README.md
11. Fusionar MAPA_ARQUITECTURA con MAPA_PARA_DESARROLLADOR
12. Eliminar docs/architecture.md (duplicado en inglés)
13. Corregir discrepancia de puertos en .env.example
14. Agregar eslint config a la raíz

---

## 21. Lista de Archivos Candidatos a Eliminación

| Archivo | Razón |
|---------|-------|
| docs/architecture.md | Duplicado en inglés de MAPA_ARQUITECTURA.md |
| apps/web/vite.config.js | Generado de vite.config.ts |
| apps/web/vite.config.d.ts | Generado de vite.config.ts |
| apps/web/tsconfig.node.tsbuildinfo | Build info generado |

---

## 22. Lista de Archivos Candidatos a Fusión

| Fusionar en | Archivos |
|-------------|----------|
| docs/MAPA_PROYECTO.md | docs/MAPA_ARQUITECTURA.md + docs/MAPA_PARA_DESARROLLADOR.md + docs/ESTRUCTURA_PROYECTO.md |
| README.md | README.md + docs/README.md |

---

## 23. Lista de Carpetas Candidatas a Reorganización

| Carpeta actual | Problema | Propuesta |
|----------------|----------|-----------|
| uploads/ (raíz) | Duplicada con apps/api/uploads/ | Mover a apps/api/uploads/ o eliminar raíz |
| docs/ (40 archivos) | Mezcla de activos e historial | Crear docs/archived/ para fases completadas |
| apps/api/test/ | Tests en directorio separado de src/ | Normal en NestJS — conservar |
| apps/web/src/mock/ | Datos mock mezclados con servicios | Mantener por ahora |
| apps/web/src/servicios/mock/ | Servicios mock separados de api/ | Mantener por ahora |

---

## 24. Hallazgos Críticos

1. **Sin migraciones Prisma** — El esquema se gestiona con `db push` sin historial versionado
2. **uploads/ duplicado** — Archivos de solicitudes en dos ubicaciones diferentes
3. **SQLite vs PostgreSQL** — El esquema Prisma (SQLite) difiere significativamente del esquema SQL (PostgreSQL)

## 25. Hallazgos Importantes

1. **6 componentes sin mode switch** — Importan servicios API directamente
2. **MatchingService y QualityService sin implementación** — Solo interfaces definidas
3. **0 tests en frontend** — Dependencias instaladas pero sin tests escritos
4. **final-review-service mock con array vacío** — Nunca retorna datos
5. **AlmacenClassify importa mock directamente** — Bypass del sistema de servicios
6. **vitest.config.ts con alias obsoletos** — `@shared` y `@config` no existen

## 26. Candidatos a Limpieza

| # | Archivo/Acción | Prioridad |
|---|----------------|-----------|
| 1 | Unificar uploads/ | Alta |
| 2 | Corregir vitest.config.ts alias | Baja |
| 3 | Eliminar docs/architecture.md | Baja |
| 4 | Eliminar archivos generados (vite.config.js, .d.ts, .tsbuildinfo) | Baja |

## 27. Candidatos a Fusión

| # | Fusión | Prioridad |
|---|--------|-----------|
| 1 | MAPA_ARQUITECTURA + MAPA_PARA + ESTRUCTURA → MAPA_PROYECTO | Media |
| 2 | README raíz + docs/README → README | Media |

## 28. Candidatos a Reorganización

| # | Reorganización | Prioridad |
|---|----------------|-----------|
| 1 | docs/ — Crear archived/ para historial | Media |
| 2 | uploads/ — Unificar ubicación | Alta |

---

*Fin de la auditoría — FASE 6C — Sin cambios de código*
