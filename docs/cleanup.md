# Registro de Limpieza y Restructuración

---

## FASE 1.5 — Limpieza Inicial

**Fecha:** 2026-08-31
**Objetivo:** Preparar el proyecto para demostración técnica y funcional.

### Archivos Eliminados

#### 1. `apps/web/src/pages/` (13 archivos)

| Archivo | Líneas | Motivo |
|---------|--------|--------|
| `Admin.tsx` | 18 | Legacy — reemplazado por `modules/administration/AdminPage.tsx` |
| `Approvals.tsx` | 46 | Legacy — reemplazado por `modules/accounting/AccountingList.tsx` |
| `Audit.tsx` | 36 | Legacy — reemplazado por `modules/audit/AuditPage.tsx` |
| `Dashboard.tsx` | 78 | Legacy — reemplazado por `modules/dashboard/DashboardPage.tsx` |
| `DataQuality.tsx` | 24 | Legacy — funcionalidad integrada en `modules/imports/ImportsPage.tsx` |
| `Imports.tsx` | 20 | Legacy — reemplazado por `modules/imports/ImportsPage.tsx` |
| `MasterItemDetail.tsx` | 29 | Legacy — funcionalidad futura |
| `MasterItems.tsx` | 31 | Legacy — funcionalidad futura |
| `Matching.tsx` | 43 | Legacy — funcionalidad integrada en `modules/imports/ImportsPage.tsx` |
| `RequestCreate.tsx` | 117 | Legacy — reemplazado por `modules/requester/RequestCreate.tsx` |
| `RequestDetail.tsx` | 73 | Legacy — reemplazado por `modules/requester/RequestDetailPage.tsx` |
| `Requests.tsx` | 41 | Legacy — reemplazado por `modules/requester/RequesterList.tsx` |
| `SourceItems.tsx` | 26 | Legacy — funcionalidad futura |

**Justificación:** Estos archivos no son importados por ningún componente. `App.tsx` únicamente importa desde `modules/`. La carpeta `pages/` era el prototipo inicial que fue reemplazado por la arquitectura modular.

#### 2. Archivos de configuración generados

| Archivo | Motivo |
|---------|--------|
| `apps/web/vite.config.js` | Artefacto de compilación — se regenera automáticamente desde `vite.config.ts` |
| `apps/web/vite.config.d.ts` | Artefacto de tipado — se regenera automáticamente desde `vite.config.ts` |

**Justificación:** Estos archivos son generados por Vite/TypeScript y no deben versionarse. El fuente canonical es `vite.config.ts`.

### Impacto

- **Archivos eliminados:** 15
- **Líneas eliminadas:** ~603
- **Módulos afectados:** Ninguno
- **Rutas afectadas:** Ninguna
- **Componentes afectados:** Ninguno
- **Dependencias afectadas:** Ninguna

### Conservación

Todo lo siguiente fue conservado y verificado como activo:

- `modules/` — 7 módulos funcionales
- `components/` — UI reutilizable y componentes de workflow
- `services/mock/` — 10 servicios mock para demostración
- `contexts/` — SessionContext y CompanyContext
- `contracts/` — Interfaces de servicio
- `types/` — Tipos TypeScript
- `mock/` — Datos mock (catálogos, empresas, solicitudes, etc.)

---

## FASE 2A — Backend API con SQLite

**Fecha:** 2026-08-31
**Objetivo:** Crear la capa de persistencia y API REST funcional con NestJS y SQLite.

### Archivos Creados

#### 1. Prisma Schema (`apps/api/prisma/schema.prisma`)

- **Reescrito** completamente para soportar SQLite
- Modelos: MasterItem, SourceItem, Request, RequestItem, AuditLog, Company, Department, User, Group, SubGroup, Category, Brand, Unit, WorkflowState
- Relaciones definidas con Foreign Keys
- Enums para estados y tipos
- Generator y datasource configurados para SQLite

#### 2. Módulos NestJS

| Módulo | Archivos | Responsabilidad |
|--------|----------|-----------------|
| `auth` | `auth.module.ts`, `auth.controller.ts` | Autenticación y sesión mock |
| `catalogs` | `catalogs.module.ts`, `catalogs.controller.ts`, `catalogs.service.ts` | Catálogos: grupos, subgrupos, categorías, marcas, unidades, empresas |
| `requests` | `requests.module.ts`, `requests.controller.ts`, `requests.service.ts` | CRUD de solicitudes y workflow |
| `warehouse` | `warehouse.module.ts`, `warehouse.controller.ts`, `warehouse.service.ts` | Clasificación de artículos |
| `accounting` | `accounting.module.ts`, `accounting.controller.ts`, `accounting.service.ts` | Revisión contable |
| `audit` | `audit.module.ts`, `audit.controller.ts`, `audit.service.ts` | Eventos de auditoría |

#### 3. Servicios Compartidos

| Servicio | Archivo | Responsabilidad |
|----------|---------|-----------------|
| `WorkflowService` | `apps/api/src/shared/workflow.service.ts` | Motor de estados y transiciones del workflow |
| `MasterCodeService` | `apps/api/src/shared/master-code.service.ts` | Generación de códigos maestros (GRUPO+SUBGRUPO+CORRELATIVO) |

#### 4. Seed Data

- **Archivo:** `apps/api/prisma/seed.js`
- **Datos iniciales:** 3 empresas, 6 departamentos, 6 usuarios, 7 grupos, 6 subgrupos, 8 categorías, 8 marcas, 6 unidades
- **Ejecución:** `pnpm --filter @master-data/api run db:seed`

### Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `apps/api/src/app.module.ts` | Importación de todos los módulos (Auth, Catalogs, Requests, Warehouse, Accounting, Audit) |
| `apps/api/package.json` | Scripts: `db:generate`, `db:push`, `db:seed`, `db:studio`, `db:reset` |
| `apps/api/.env` | Variable `DATABASE_URL=file:./data/dev.db` para SQLite |
| `.gitignore` | Agregado `apps/api/data/` para ignorar la base de datos SQLite |

### Base de datos

- **Archivo:** `apps/api/data/dev.db`
- **Proveedor:** SQLite
- **Creación:** Via `pnpm --filter @master-data/api run db:push`
- **Poblado:** Via `pnpm --filter @master-data/api run db:seed`
- **Reinicio:** Eliminar `dev.db` y re-ejecutar `db:push` + `db:seed`

### Endpoints Disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/catalogs/grupos` | Lista de grupos |
| GET | `/api/v1/catalogs/subgrupos` | Lista de subgrupos |
| GET | `/api/v1/catalogs/categorias` | Lista de categorías |
| GET | `/api/v1/catalogs/marcas` | Lista de marcas |
| GET | `/api/v1/catalogs/unidades` | Lista de unidades |
| GET | `/api/v1/catalogs/empresas` | Lista de empresas |
| GET | `/api/v1/requests` | Listar solicitudes |
| POST | `/api/v1/requests` | Crear solicitud |
| GET | `/api/v1/requests/:id` | Detalle de solicitud |
| GET | `/api/v1/requests/:id/workflow` | Estado del workflow |
| GET | `/api/v1/master-items` | Listar master items |
| POST | `/api/v1/master-items` | Crear master item |
| GET | `/api/v1/master-items/:code` | Detalle por código |
| GET | `/api/v1/audit` | Eventos de auditoría |

### Impacto

- **Archivos creados:** 20+
- **Módulos backend:** 6 (Auth, Catalogs, Requests, Warehouse, Accounting, Audit)
- **Servicios compartidos:** 2 (Workflow, MasterCode)
- **Modelos Prisma:** 13
- **Endpoints REST:** 15
- **Base de datos:** SQLite local funcional

### Decisiones Técnicas

1. **SQLite para desarrollo** — Sin dependencia de servidor de base de datos, reinicio instantáneo
2. **Prisma como ORM** — Type-safe, migraciones, soporte multi-proveedor
3. **NestJS modular** — Separación por dominio, escalabilidad
4. **Seed data script** — Datos iniciales reproducibles
5. **Swagger automático** — Documentación interactiva en `/docs`
