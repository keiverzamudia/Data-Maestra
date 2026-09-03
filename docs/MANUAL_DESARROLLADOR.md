# Manual del Desarrollador — Data-Maestra

---

## 1. Qué es Data-Maestra

Sistema web para gestionar y homologar artículos de múltiples empresas/instancias de Profit Plus 2K8.

**Flujo principal:**
1. Un solicitante crea una solicitud para un artículo nuevo
2. Un gerente aprueba la solicitud
3. Almacén clasifica el artículo (grupo, subgrupo, marca, modelo)
4. Contabilidad agrega códigos contables y aprueba
5. Revisión final aprueba definitivamente
6. Se genera un código master único

**Stack:**
- Backend: Node.js + TypeScript + NestJS + Prisma + SQLite (desarrollo)
- Frontend: React + TypeScript + Vite + TanStack Query + React Hook Form + Zod
- Testing: Vitest (API), Vitest + @testing-library/react (WEB, sin tests aún)
- DB diseño: PostgreSQL 16 (Docker Compose)

---

## 2. Arquitectura general

Modular monolith con separación por módulos y capas:

```
Frontend (React)
    ↓ fetch() via servicios/api/
API (NestJS Controller)
    ↓ Guard RBAC
Service (Lógica de negocio)
    ↓ Prisma Client
SQLite / PostgreSQL
```

**Regla fundamental:** La fuente de verdad para modificar el sistema es:
1. Código actual
2. Schema Prisma actual
3. Configuración actual
4. Tests actuales
5. Este manual
6. Documentación histórica solo como referencia

---

## 3. Estructura de carpetas

```
Data-Maestra/
├── apps/
│   ├── api/                    Backend NestJS
│   │   ├── src/
│   │   │   ├── main.ts         Bootstrap, CORS, Swagger
│   │   │   ├── app.module.ts   Registro de módulos
│   │   │   ├── comun/          Código compartido
│   │   │   │   ├── prisma/     Conexión a DB
│   │   │   │   └── utilidades/ flattenRequestData
│   │   │   └── modulos/        13 módulos de negocio
│   │   ├── prisma/
│   │   │   ├── schema.prisma   Modelo de datos (24 modelos)
│   │   │   └── seed.js         Datos de prueba
│   │   ├── test/               9 archivos de tests
│   │   └── data/dev.db         SQLite database
│   │
│   └── web/                    Frontend React
│       └── src/
│           ├── app/            App.tsx (router), globals.css
│           ├── modulos/        9 módulos de pantalla
│           ├── componentes/    Componentes reutilizables
│           ├── contextos/      SessionContext, CompanyContext
│           ├── servicios/      Capa de comunicación
│           │   ├── api/        10 servicios API reales
│           │   └── mock/       5 servicios mock (fallback)
│           ├── hooks/          useCatalogos, useOrganizacion
│           ├── tipos/          Definiciones TypeScript
│           ├── contratos/      Interfaces de servicios
│           └── mock/           Datos mock
│
├── docs/                       Documentación
├── scripts/                    Scripts PowerShell
├── prompts/                    Prompts históricos de fases
└── .opencode/                  Configuración OpenCode
```

---

## 4. Backend — Módulos

| Módulo | Ubicación | Función |
|--------|-----------|---------|
| solicitudes | `apps/api/src/modulos/solicitudes/` | CRUD solicitudes + workflow + masterCode |
| almacen | `apps/api/src/modulos/almacen/` | Clasificar artículos |
| contabilidad | `apps/api/src/modulos/contabilidad/` | Revisión contable + RETURN a almacén |
| revision-final | `apps/api/src/modulos/revision-final/` | Aprobación definitiva |
| auditoria | `apps/api/src/modulos/auditoria/` | Eventos de auditoría |
| catalogos | `apps/api/src/modulos/catalogos/` | Grupos, subgrupos, categorías, marcas, unidades |
| organizacion | `apps/api/src/modulos/organizacion/` | Empresas, departamentos, usuarios, roles |
| importaciones | `apps/api/src/modulos/importaciones/` | Runs de importación |
| notificaciones | `apps/api/src/modulos/notificaciones/` | Notificaciones |
| panel | `apps/api/src/modulos/panel/` | Dashboard/estadísticas |
| salud | `apps/api/src/modulos/salud/` | Health check |
| archivos | `apps/api/src/modulos/archivos/` | Upload/serve imágenes |
| autenticacion | `apps/api/src/modulos/autenticacion/` | Auth mock + RBAC guard |

Cada módulo tiene: `{nombre}.controller.ts`, `{nombre}.service.ts`, `{nombre}.module.ts`.
Solo solicitudes tiene `dto/` con 3 DTOs.

**Excepción:** El módulo `archivos` no tiene service propio. La lógica de upload/serve está directamente en el controller (`archivos.controller.ts`). Usa `multer` para recibir archivos y `serve-static` para servirlos desde `apps/api/uploads/requests/`.

---

## 5. Frontend — Módulos

| Módulo | Ubicación | Pantalla |
|--------|-----------|----------|
| solicitudes | `apps/web/src/modulos/solicitudes/` | SolicitudesList, SolicitudCreate, SolicitudDetailPage |
| almacen | `apps/web/src/modulos/almacen/` | AlmacenList, AlmacenClassify |
| contabilidad | `apps/web/src/modulos/contabilidad/` | ContabilidadList |
| revision-final | `apps/web/src/modulos/revision-final/` | RevisionFinalPage |
| aprobaciones | `apps/web/src/modulos/aprobaciones/` | AprobacionesPage |
| panel | `apps/web/src/modulos/panel/` | PanelPage |
| importaciones | `apps/web/src/modulos/importaciones/` | ImportacionesPage |
| auditoria | `apps/web/src/modulos/auditoria/` | AuditoriaPage |
| administracion | `apps/web/src/modulos/administracion/` | AdministracionPage |

---

## 6. Base de datos

**Schema:** `apps/api/prisma/schema.prisma` (24 modelos, 461 líneas)
**Motor:** SQLite (`apps/api/data/dev.db`)
**Seed:** `apps/api/prisma/seed.js` (3 empresas, 6 departamentos, 6 usuarios, 7 roles, 13 permisos)

**Modelos principales:**
- Company, Department, User, Role, Permission, UserRole, RolePermission
- CatalogGroup, CatalogSubgroup, CatalogCategory, Brand, UnitOfMeasure
- MasterItem, Request, RequestData, RequestAccountingCode
- WorkflowInstance, WorkflowTask, WorkflowHistory, Approval
- AuditEvent, ImportRun, SourceItem, Notification

**Comandos:**
```bash
pnpm --filter @master-data/api run db:generate   # Generar cliente Prisma
pnpm --filter @master-data/api run db:push       # Aplicar cambios de schema
pnpm --filter @master-data/api run db:seed       # Poblar datos de prueba
pnpm --filter @master-data/api run db:studio     # Abrir Prisma Studio
```

---

## 7. Autenticación

**Estado actual:** Mock in-memory.

- Usuarios hardcodeados en `apps/api/src/modulos/autenticacion/autenticacion.service.ts`
- No hay JWT, no hay tokens
- La sesión se cambia via `GET /auth/session?userId=u1`
- RBAC funciona con permisos mock

**Nota sobre usuarios:** El seed crea 6 usuarios (u1-u6), pero el mock de autenticación solo tiene 5 hardcodeados (u1-u5). El usuario u6 (s.admin, Super Admin) existe en la base de datos pero no está en el array USERS del auth service. Si se intenta usar u6 via el UserSwitcher, no funcionará correctamente.

**Archivos:**
- `apps/api/src/modulos/autenticacion/autenticacion.service.ts` — Usuarios, roles, permisos
- `apps/api/src/modulos/autenticacion/rbac.guard.ts` — Guard RBAC
- `apps/api/src/modulos/autenticacion/require-permission.decorator.ts` — Decorador
- `apps/web/src/contextos/SessionContext.tsx` — Estado de sesión frontend
- `apps/web/src/componentes/ui/UserSwitcher.tsx` — Selector de usuario (desarrollo)

---

## 8. Roles y permisos

| Rol | Permisos |
|-----|----------|
| REQUESTER | REQUEST.CREATE, REQUEST.VIEW, DASHBOARD.VIEW |
| DEPARTMENT_MANAGER | MANAGER.APPROVE, REQUEST.VIEW, DASHBOARD.VIEW |
| WAREHOUSE | WAREHOUSE.CLASSIFY, WAREHOUSE.VIEW, REQUEST.VIEW, DASHBOARD.VIEW |
| ACCOUNTING | ACCOUNTING.APPROVE, ACCOUNTING.VIEW, REQUEST.VIEW, DASHBOARD.VIEW |
| FINAL_REVIEWER | FINAL_REVIEW.APPROVE, REQUEST.VIEW, DASHBOARD.VIEW |
| MASTER_DATA_ADMIN | ADMIN.MANAGE, DASHBOARD.VIEW, AUDIT.VIEW, IMPORT.RUN, IMPORT.VIEW |
| AUDITOR | (definido en seed, sin uso activo) |

**Controllers protegidos:** solicitudes, almacen, contabilidad, revision-final, auditoria
**Controllers sin guard:** auth, catalogos, salud, archivos

---

## 9. Workflow — Flujo completo

**Archivo único de verdad:** `apps/api/src/modulos/solicitudes/workflow-states.ts` — `getNextWorkflowState()` (+ `apps/api/src/modulos/solicitudes/solicitud.service.ts` lo consume)

> FASE 8G: estados normalizados a español. Ver `docs/NORMALIZACION_ESTADOS_8G.md`.

### Estados

| Estado | Significado | Terminal |
|--------|-------------|----------|
| BORRADOR | Borrador | Sí (no admite acciones hasta SUBMIT) |
| PENDIENTE_GERENTE | Esperando gerente | No |
| PENDIENTE_ALMACEN | Esperando almacén | No |
| ALMACEN_APROBADO | Clasificación completada | No |
| PENDIENTE_CONTABILIDAD | Esperando contabilidad | No |
| PENDIENTE_VALIDACION_MAESTRA | Esperando validación maestra | No |
| APROBADO_FINAL | Aprobado | Sí |
| PROCESANDO_PROFIT | Registrando en Profit (futuro, sin lógica aún) | No |
| REGISTRADO_PROFIT | Registrado en Profit (futuro, sin lógica aún) | No |
| ERROR_PROFIT | Error técnico Profit (futuro; no es rechazo) | No |
| DEVUELTO | Devuelto | No |
| RECHAZADO | Rechazado | Sí |

### Flujo principal

```
BORRADOR → [SUBMIT] → PENDIENTE_GERENTE
PENDIENTE_GERENTE → [APPROVE] → PENDIENTE_ALMACEN
PENDIENTE_ALMACEN → [CLASSIFY] → ALMACEN_APROBADO
ALMACEN_APROBADO → [APPROVE] → PENDIENTE_CONTABILIDAD
PENDIENTE_CONTABILIDAD → [APPROVE] → PENDIENTE_VALIDACION_MAESTRA
PENDIENTE_VALIDACION_MAESTRA → [APPROVE] → APROBADO_FINAL
```

### Retorno (devolución)

```
PENDIENTE_GERENTE → [RETURN] → BORRADOR
PENDIENTE_ALMACEN → [RETURN] → PENDIENTE_GERENTE
ALMACEN_APROBADO → [RETURN] → PENDIENTE_GERENTE
PENDIENTE_CONTABILIDAD → [RETURN] → PENDIENTE_ALMACEN
PENDIENTE_VALIDACION_MAESTRA → [RETURN] → PENDIENTE_CONTABILIDAD
```

### Rechazo

```
Cualquier estado pendiente → [REJECT] → RECHAZADO
```

### Comportamiento de WorkflowTask al devolver una solicitud

Cuando una solicitud hace RETURN hacia un paso anterior:

1. La tarea del paso actual se cierra correctamente (status: COMPLETED, completedAt: now).
2. Si ya existe una WorkflowTask para la combinación instanceId + stepCode del paso destino, esa tarea se **reutiliza/reactiva**.
3. La tarea reutilizada queda: status = PENDING, completedAt = null.
4. Si no existe una tarea para ese paso destino, se crea una nueva.
5. Nunca debe existir más de una WorkflowTask para la misma combinación instanceId + stepCode (restricción UNIQUE).
6. workflowInstance.currentStepCode se actualiza al paso destino.
7. workflowHistory conserva el registro de la devolución.
8. approval conserva el registro de la acción y comentario.

**Ejemplo:** PENDIENTE_CONTABILIDAD → RETURN → PENDIENTE_ALMACEN

La solicitud puede haber pasado anteriormente por Almacén, por lo que ya puede existir una WorkflowTask con instanceId + PENDIENTE_ALMACEN. En ese caso NO se crea una segunda tarea. Se reactiva la existente. Esta regla evita una violación de la restricción única (instance_id, step_code).

---

## 10. Solicitudes

**Backend:**
- `apps/api/src/modulos/solicitudes/solicitud.controller.ts` — Endpoints
- `apps/api/src/modulos/solicitudes/solicitud.service.ts` — Lógica (workflow, masterCode, CRUD)
- `apps/api/src/modulos/solicitudes/dto/create-request.dto.ts` — DTO creación
- `apps/api/src/modulos/solicitudes/dto/classify-request.dto.ts` — DTO clasificación
- `apps/api/src/modulos/solicitudes/dto/approval.dto.ts` — DTO aprobación

**Frontend:**
- `apps/web/src/modulos/solicitudes/SolicitudesList.tsx` — Lista
- `apps/web/src/modulos/solicitudes/SolicitudCreate.tsx` — Crear
- `apps/web/src/modulos/solicitudes/SolicitudDetailPage.tsx` — Detalle

**Servicios:**
- `apps/web/src/servicios/api/api-request-service.ts` — API → `/api/v1/solicitudes`
- `apps/web/src/servicios/mock/request-service.ts` — Mock fallback

---

## 11. Almacén

**Backend:**
- `apps/api/src/modulos/almacen/almacen.controller.ts`
- `apps/api/src/modulos/almacen/almacen.service.ts` — getPending, classify, approve, return, reject

**Frontend:**
- `apps/web/src/modulos/almacen/AlmacenList.tsx` — Bandeja pendientes
- `apps/web/src/modulos/almacen/AlmacenClassify.tsx` — Formulario clasificación

**Nota:** AlmacenClassify importa `analyzerProposals` directamente de `mock/source-items.ts` (sin API real).

---

## 12. Contabilidad

**Backend:**
- `apps/api/src/modulos/contabilidad/contabilidad.controller.ts`
- `apps/api/src/modulos/contabilidad/contabilidad.service.ts` — getPending, approve, reject (RETURN)

**IMPORTANTE:** El rechazo contable usa `RETURN` → `PENDIENTE_ALMACEN` (devuelve a almacén, no rechaza). El comentario es obligatorio al rechazar.

**Frontend:**
- `apps/web/src/modulos/contabilidad/ContabilidadList.tsx`

---

## 13. Revisión Final

**Backend:**
- `apps/api/src/modulos/revision-final/revision-final.controller.ts`
- `apps/api/src/modulos/revision-final/revision-final.service.ts`

**Frontend:**
- `apps/web/src/modulos/revision-final/RevisionFinalPage.tsx`

---

## 14. Código maestro

**Archivo:** `apps/api/src/modulos/solicitudes/solicitud.service.ts` — `generateMasterCode()`

**Formato:** `{groupCode}{subgroupCode}-{secuencia}` (ej: `RVHCAR-00001`)

**Algoritmo:**
1. Buscar `catalogGroup` por ID → code
2. Buscar `catalogSubgroup` por ID → code
3. Buscar último `masterItem` con mismo groupId+subgroupId → secuencia
4. Incrementar +1, formatear a 5 dígitos

**Riesgo:** Sin protección contra race condition.

---

## 15. Catálogos

**Backend:**
- `apps/api/src/modulos/catalogos/catalogos.controller.ts` — Endpoints: groups, subgroups, categories, brands, units, import
- `apps/api/src/modulos/catalogos/catalogos.service.ts` — Lectura de catálogos
- `apps/api/src/modulos/catalogos/catalog-import.service.ts` — Importación idempotente desde fuentes externas

**Frontend:**
- `apps/web/src/hooks/useCatalogos.ts` — Hook que carga desde API
- `apps/web/src/servicios/api/api-catalogo-service.ts` → `/api/v1/catalogos`

**Modelo de datos:**
- `CatalogGroup`: code, name, active, sourceSystem, sourceCode
- `CatalogSubgroup`: groupId, code, name, active, sourceSystem, sourceCode
- `sourceSystem` = 'PROFIT' para registros provenientes de Profit
- `sourceCode` = código original de Profit
- Los registros locales (no Profit) tienen sourceSystem = null

**Importación:** `POST /api/v1/catalogs/import` con body `{ rows: [...] }`. Idempotente.

---

## 16. Organización

**Backend:**
- `apps/api/src/modulos/organizacion/organizacion.controller.ts` — companies, departments, users, roles
- `apps/api/src/modulos/organizacion/organizacion.service.ts`

**Frontend:**
- `apps/web/src/hooks/useOrganizacion.ts` — Hook que carga desde API
- `apps/web/src/servicios/api/api-organizacion-service.ts` → `/api/v1/organizacion`
- `apps/web/src/contextos/CompanyContext.tsx` — Empresa seleccionada

---

## 17. Cómo se comunica Frontend ↔ API

```
Componente → servicios/index.ts (switch mock/api)
                ↓
         servicios/api/api-{nombre}-service.ts
                ↓
         api-client.ts (fetch con VITE_API_URL)
                ↓
         http://localhost:3001/api/v1/{endpoint}
                ↓
         Vite proxy /api → localhost:3001
                ↓
         Controller → Service → Prisma → DB
```

**Proxy:** `apps/web/vite.config.ts` redirige `/api` a `http://localhost:3001`

---

## 18. Localizar endpoints

```
¿Qué endpoint necesito?
→ Buscar en apps/api/src/modulos/{modulo}/*.controller.ts
→ Los endpoints están en decoradores @Get, @Post, @Put, @Delete
→ El prefijo global es api/v1 (configurado en main.ts)
```

---

## 19. Localizar pantallas

```
¿Qué pantalla necesito modificar?
→ Buscar en apps/web/src/modulos/{modulo}/
→ El router está en apps/web/src/app/App.tsx
→ La navegación está en apps/web/src/componentes/diseno/AppLayout.tsx
```

---

## 20. Localizar un servicio

```
¿Qué servicio frontend necesito?
→ API real: apps/web/src/servicios/api/api-{nombre}-service.ts
→ Mock: apps/web/src/servicios/mock/{nombre}-service.ts
→ Contratos: apps/web/src/contratos/index.ts
→ Switch: apps/web/src/servicios/index.ts
```

---

## 21. Localizar un modelo Prisma

```
¿Qué tabla necesito modificar?
→ apps/api/prisma/schema.prisma
→ Buscar model {Nombre}
→ Después ejecutar: pnpm --filter @master-data/api run db:push
```

---

## 22. Agregar/modificar un campo

1. Modificar `apps/api/prisma/schema.prisma` (agregar campo al modelo)
2. Ejecutar `pnpm --filter @master-data/api run db:push`
3. Actualizar el service que usa ese modelo
4. Actualizar el DTO si aplica
5. Actualizar el frontend (tipos + componente)
6. Ejecutar tests: `cd apps/api && npx vitest run`

---

## 23. Modificar una transición del workflow

1. Abrir `apps/api/src/modulos/solicitudes/solicitud.service.ts`
2. Buscar `getNextStatus()` (línea ~463)
3. Modificar el mapa de transiciones
4. Agregar test en `apps/api/test/requests.service.spec.ts`
5. Verificar que el frontend maneje el nuevo estado
6. Actualizar `docs/MANUAL_DESARROLLADOR.md` sección Workflow

---

## 24. Modificar permisos

1. Definir permiso en `apps/api/src/modulos/autenticacion/autenticacion.service.ts`
   - Agregar a `ROLE_PERMISSIONS` para el rol correspondiente
2. Aplicar en controller: `@RequirePermission('MODULO.ACCION')`
3. Verificar en frontend: `useSession().hasPermission('MODULO.ACCION')`

---

## 25. Modificar un catálogo

1. Modificar modelo en `apps/api/prisma/schema.prisma`
2. Ejecutar `pnpm --filter @master-data/api run db:push`
3. Actualizar `apps/api/prisma/seed.js` con datos iniciales
4. Actualizar endpoints en `apps/api/src/modulos/catalogos/catalogos.service.ts`
5. Actualizar `apps/web/src/hooks/useCatalogos.ts` si cambian los campos

---

## 26. Modificar una pantalla

1. Encontrar el componente en `apps/web/src/modulos/{modulo}/`
2. Si necesita datos: usar servicio de `apps/web/src/servicios/api/`
3. Si necesita permisos: usar `useSession().hasPermission()`
4. Si necesita catálogos: usar `useCatalogos()`
5. Si necesita organización: usar `useOrganizacion()`
6. Después ejecutar: `cd apps/web && npx tsc --noEmit`

---

## 27. Cómo ejecutar el proyecto

```bash
# Instalar dependencias
pnpm install

# Preparar DB
cd apps/api && npx prisma db push && npx prisma db seed && cd ../..

# Iniciar todo
pnpm dev

# URLs
# Frontend: http://localhost:5173
# API: http://localhost:3001
# Health: http://localhost:3001/api/v1/health
# Swagger: http://localhost:3001/docs
```

---

## 28. Cómo ejecutar tests

```bash
# Tests API (79 tests)
cd apps/api && npx vitest run

# Tests Web (sin tests aún, usa --passWithNoTests)
cd apps/web && npx vitest run --passWithNoTests

# Desde raíz
pnpm test
```

---

## 29. Cómo ejecutar typecheck

```bash
# API
cd apps/api && npx tsc --noEmit

# Web
cd apps/web && npx tsc --noEmit

# Desde raíz
pnpm typecheck
```

---

## 30. Cómo hacer build

```bash
# Build completo
pnpm build

# Solo API
cd apps/api && npx nest build

# Solo Web
cd apps/web && npx vite build
```

---

## 31. Cómo diagnosticar errores

| Error | Causa | Solución |
|-------|-------|----------|
| ECONNREFUSED en Vite | Backend no está listo | Esperar a que NestJS compile |
| 404 en /api/v1/... | Endpoint no existe o mal escrito | Verificar controller |
| Unique constraint failed | workflowTask duplicado en RETURN | Verificar lógica de RETURN en solicitud.service.ts |
| TypeError en tests | Mock incompleto | Agregar función faltante al mock |
| Prisma error | Schema desactualizado | Ejecutar `db:push` |

---

## 32. Qué es real vs mock

| Componente | Estado |
|------------|--------|
| Workflow completo | REAL |
| CRUD solicitudes | REAL |
| Clasificación almacén | REAL |
| Aprobación contable | REAL |
| Revisión final | REAL |
| MasterCode generation | REAL |
| Catálogos (grupos, etc.) | REAL (API) |
| Organización (empresas, etc.) | REAL (API) |
| Notificaciones | REAL (API) |
| Importaciones | REAL (API) |
| Panel/dashboard | REAL (API) |
| Auditoría | REAL |
| Auth/RBAC | MOCK (guard funciona, datos mock) |
| analyzerProposals | MOCK (sin API) |
| Selector de usuario | MOCK (desarrollo) |

---

## 33. Limitaciones conocidas

1. **Auth mock:** La sesión es global, no por request. Cualquier persona puede cambiar de usuario.
2. **Sin migraciones:** Se usa `db push` sin historial versionado.
3. **SQLite ≠ PostgreSQL:** Diferencias en enums, json, índices.
4. **analyzerProposals:** Sin API real, importado directamente de mock.
5. **6 componentes importan API directamente:** Sin fallback mock (CompanyContext, AppLayout, PanelPage, ImportacionesPage, useCatalogos, useOrganizacion).
6. **Sin tests frontend:** Dependencias instaladas pero sin tests escritos.
7. **MasterCode sin race condition protection.**
8. **Almacén Classify importa mock directamente** en vez de usar mode switch.

---

## 34. Qué NO modificar sin revisar

| Archivo | Por qué |
|---------|---------|
| `apps/api/prisma/schema.prisma` | Cambios requieren db push y actualización de services |
| `apps/api/src/modulos/solicitudes/solicitud.service.ts` | Contiene workflow, masterCode, y lógica central |
| `apps/api/src/modulos/autenticacion/autenticacion.service.ts` | Usuarios/roles hardcodeados, futura migración a DB |
| `apps/web/src/tipos/index.ts` | Tipos compartidos, cambios rompen toda la app |
| `apps/web/src/contratos/index.ts` | Interfaces de servicios, afecta mock y API |
| `apps/web/src/componentes/ui/` | UI genérica, cambios afectan toda la app |
| `apps/web/vite.config.ts` | Proxy y configuración de dev |