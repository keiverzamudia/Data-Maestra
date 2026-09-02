# Validación de Reestructuración — Data-Maestra

Fecha: 01 de septiembre de 2026
Basado en: AUDITORIA_ACTUAL.md + PLAN_REESTRUCTURACION.md
Modo: Solo lectura. Sin modificaciones.

---

## 1. RESUMEN EJECUTIVO

Se validaron exhaustivamente las eliminaciones, renombres y cambios propuestos en el PLAN_REESTRUCTURACION.md.

**Resultado:** El plan original requiere correcciones significativas. Se identificaron:

- **3 archivos seguros para eliminar** (código)
- **6 docs con referencias vivas** que requieren limpieza previa
- **5 renombres de ALTO RIESGO** que afectan 19+ archivos cada uno
- **7 exports muertos** en frontend (apiSessionService, apiCatalogService, etc.)
- **4 servicios mock no consumidos**
- **Código duplicado real**: flattenRequestData (4 copias), transiciones (2 definiciones), masterCode (2 implementaciones)

---

## 2. ELIMINACIONES SEGURAS (SEGURO_ELIMINAR)

### 2.1 Código

| Archivo | Referencias code | Referencias docs | Veredicto |
|---|---|---|---|
| `packages/shared/` | 0 imports en código | Solo en docs a eliminar | ✅ SEGURO_ELIMINAR |
| `packages/contracts/` | 0 imports en código | Solo en docs a eliminar | ✅ SEGURO_ELIMINAR |
| `opencode.jsonc.v2` | 0 referencias | Solo en docs | ✅ SEGURO_ELIMINAR |
| `apps/uploads/` (root) | 0 referencias | Solo en docs | ✅ SEGURO_ELIMINAR |

**Evidencia:** Búsqueda global de `@master-data/shared`, `@master-data/contracts`, `packages/shared`, `packages/contracts` devolvió 0 imports en archivos `.ts/.tsx/.js`.

### 2.2 Documentación (sin referencias vivas)

| Archivo | Referencias vivas | Veredicto |
|---|---|---|
| `docs/cleanup.md` | 0 | ✅ SEGURO_ELIMINAR |
| `docs/current-status.md` | 0 | ✅ SEGURO_ELIMINAR |
| `docs/future-architecture.md` | 0 | ✅ SEGURO_ELIMINAR |
| `docs/frontend-prototype.md` | 0 | ✅ SEGURO_ELIMINAR |
| `docs/project-structure.md` | 0 | ✅ SEGURO_ELIMINAR |
| `docs/workflow-design.md` | 0 (solo cross-ref de docs a eliminar) | ✅ SEGURO_ELIMINAR |

---

## 3. ELIMINACIONES QUE REQUIEREN REVISIÓN (REQUIERE_REVISIÓN)

### 3.1 Documentos con referencias vivas

| Archivo | Referenciado por | Tipo de ref | Acción requerida |
|---|---|---|---|
| `docs/concurrency.md` | `docs/architecture.md:354` | `"Ver docs/concurrency.md para detalles"` | Actualizar architecture.md antes de eliminar |
| `docs/master-data-model.md` | `docs/architecture.md:147` | `"Ver docs/master-data-model.md § Master Code"` | Actualizar architecture.md antes de eliminar |
| `docs/decisions.md` | `docs/architecture.md:160` | `"ver docs/decisions.md ADR-022"` | Actualizar architecture.md antes de eliminar |
| `docs/rbac.md` | `.opencode/commands/phase-0.md:14` | Referencia directa | Actualizar command antes de eliminar |
| `docs/rbac.md` | `prompts/phase-00.md:11` | Referencia directa | Actualizar prompt antes de eliminar |
| `docs/rbac.md` | `prompts/phase-02.md:3` | Referencia directa | Actualizar prompt antes de eliminar |
| `docs/state-machines.md` | `.opencode/commands/phase-0.md:13` | Referencia directa | Actualizar command antes de eliminar |
| `docs/state-machines.md` | `prompts/phase-00.md:10` | Referencia directa | Actualizar prompt antes de eliminar |
| `docs/schema-review.md` | `docs/decisions.md:235` | Cross-ref (doc a eliminar) | OK — ambos se eliminan juntos |
| `docs/source-data-model.md` | `docs/schema-review.md:388` | Cross-ref (doc a eliminar) | OK — ambos se eliminan juntos |
| `docs/merge-split.md` | `docs/schema-review.md:391` | Cross-ref (doc a eliminar) | OK — ambos se eliminan juntos |

**Conclusión:** 6 archivos de docs requieren que SE ACTUALICEN sus referencias ANTES de eliminar los docs obsoletos.

---

## 4. ELIMINACIONES PELIGROSAS / NO_ELIMINAR

Ninguno de los archivos propuestos para eliminación es peligroso. Todos los archivos de código activo se conservan.

---

## 5. MOVIMIENTOS SEGUROS (Backend — BAJO riesgo)

| Carpeta/Archivo | Antes | Después | Archivos afectados | Riesgo |
|---|---|---|---|---|
| accounting/ | `modules/accounting/` | `modulos/contabilidad/` | 4 (app.module + 3 internos) | BAJO |
| final-review/ | `modules/final-review/` | `modulos/revision-final/` | 4 | BAJO |
| audit/ | `modules/audit/` | `modulos/auditoria/` | 4 | BAJO |
| health/ | `modules/health/` | `modulos/salud/` | 4 | BAJO |
| uploads/ | `modules/uploads/` | `modulos/archivos/` | 4 | BAJO |

**Evidencia:** Solo son importados por `app.module.ts` (1 referencia cada uno).

---

## 6. MOVIMIENTOS CON RIESGO (Backend — MEDIO/ALTO)

| Carpeta/Archivo | Antes | Después | Archivos afectados | Riesgo |
|---|---|---|---|---|
| requests/ | `modules/requests/` | `modulos/solicitudes/` | **8** (app.module + 5 cross-module + 1 test + DTOs) | ALTO |
| warehouse/ | `modules/warehouse/` | `modulos/almacen/` | **4** (app.module + 3 internos) | MEDIO |
| auth/ | `modules/auth/` | `modulos/autenticacion/` | **12** (app.module + 6 cross-module + 5 internos) | ALTO |
| catalogs/ | `modules/catalogs/` | `modulos/catalogos/` | **3** (app.module + 1 test + 1 interno) | BAJO |
| shared/ | `shared/` | `compartido/` | **19** (app.module + 13 module imports + 2 tests + tsconfig) | ALTO |

**Problemas específicos:**

- `auth/` es importado por TODOS los controllers de negocio (requests, warehouse, accounting, final-review, audit). Renombrar afecta 12 archivos.
- `shared/` es importado por TODOS los services. Renombrar afecta 19 archivos.
- `requests/` es importado por warehouse, accounting, final-review modules. Renombrar afecta 8 archivos.
- `shared/` tiene un path alias `@shared/*` en `tsconfig.json` que también debe actualizarse.

---

## 7. MOVIMIENTOS SEGUROS (Frontend — BAJO riesgo)

| Carpeta/Archivo | Antes | Después | Archivos afectados | Riesgo |
|---|---|---|---|---|
| accounting/ | `modules/accounting/` | `modulos/contabilidad/` | 2 (App.tsx + index) | BAJO |
| administration/ | `modules/administration/` | `modulos/administracion/` | 2 | BAJO |
| approvals/ | `modules/approvals/` | `modulos/aprobaciones/` | 2 | BAJO |
| audit/ | `modules/audit/` | `modulos/auditoria/` | 2 | BAJO |
| dashboard/ | `modules/dashboard/` | `modulos/panel/` | 2 | BAJO |
| final-review/ | `modules/final-review/` | `modulos/revision-final/` | 2 | BAJO |
| imports/ | `modules/imports/` | `modulos/importaciones/` | 2 | BAJO |
| requester/ | `modules/requester/` | `modulos/solicitudes/` | 2 | BAJO |
| warehouse/ | `modules/warehouse/` | `modulos/almacen/` | 2 | BAJO |
| contracts/ | `contracts/` | `contratos/` | 1 (0 imports directos) | BAJO |
| types/ | `types/` | `tipos/` | 1 (0 imports directos) | BAJO |
| utils/ | `utils/` | `utilidades/` | 2 (1 import en RequestCreate) | BAJO |

**Evidencia:** Los 9 módulos frontend solo son importados por `App.tsx` (1 referencia cada uno).

---

## 8. MOVIMIENTOS CON RIESGO (Frontend — ALTO)

| Carpeta/Archivo | Antes | Después | Archivos afectados | Riesgo |
|---|---|---|---|---|
| components/ | `components/` | `componentes/` | **15** (13 modules + App + 1 component) | ALTO |
| contexts/ | `contexts/` | `contextos/` | **12** (9 modules + 2 components + App) | ALTO |
| mock/ | `mock/` | `datos-prueba/` | **22** (13 modules + 6 mock services + 3 components) | ALTO |
| services/ | `services/` | `servicios/` | **12** (11 modules + App) | ALTO |

**Problemas específicos:**

- `mock/` es importado por 22 archivos. Es la carpeta más referenciada del frontend.
- `contexts/` es importado por 12 archivos (todos los módulos que usan sesión).
- `components/` es importado por 15 archivos (todos los módulos).
- `services/` es importado por 12 archivos.

---

## 9. CÓDIGO DUPLICADO

### 9.1 flattenRequestData — 4 copias IDÉNTICAS

| Ubicación | Líneas | Contenido |
|---|---|---|
| `requests.service.ts` | 8-24 | Identical |
| `warehouse.service.ts` | 14-30 | Identical |
| `accounting.service.ts` | 15-31 | Identical |
| `final-review.service.ts` | 15-31 | Identical |

**Veredicto:** Extraer a `shared/utils/flatten-request-data.ts`. Misma función, 4 copias exactas.

### 9.2 Transiciones de workflow — 2 definiciones

| Ubicación | Estado | Diferencia |
|---|---|---|
| `requests.service.ts:455-462` | ACTIVO (se usa) | `PENDING_MANAGER → APPROVE → PENDING_WAREHOUSE` |
| `shared/workflow/workflow.service.ts:48-59` | MUERTO (no se usa) | `PENDING_MANAGER → APPROVE → MANAGER_APPROVED` |

**Diferencia crítica:** WorkflowService tiene estados intermedios (MANAGER_APPROVED, WAREHOUSE_APPROVED, ACCOUNTING_APPROVED) que el código activo omite. Si se integra WorkflowService, el flujo cambiaría.

**Veredicto:** NO integrar WorkflowService tal cual. El código activo (requests.service) tiene un flujo simplificado que funciona. WorkflowService debe reescribirse o eliminarse.

### 9.3 Generación de masterCode — 2 implementaciones

| Ubicación | Estado | Formato | DB lookup |
|---|---|---|---|
| `requests.service.ts:431-453` | ACTIVO | `{GRP}{SUB}-00001` (5 dígitos, guión) | Sí (findFirst en masterItem) |
| `shared/master-code/master-code.service.ts` | MUERTO | `{GRP}{SUB}000001` (6 dígitos, sin guión) | No (toma sequence como param) |

**Diferencia crítica:** MasterCodeService produce códigos con formato diferente (6 dígitos, sin guión). Si se integra, los master codes existentes serían inconsistentes.

**Veredicto:** NO integrar MasterCodeService tal cual. debe reajustarse el formato o eliminarse.

---

## 10. CÓDIGO MUERTO

### 10.1 Backend

| Archivo | Estado | Evidencia |
|---|---|---|
| `shared/workflow/workflow.service.ts` | MUERTO | 0 imports desde controllers/services |
| `shared/workflow/workflow.module.ts` | MUERTO | Solo registrado en app.module, no consumido |
| `shared/master-code/master-code.service.ts` | MUERTO | 0 imports desde controllers/services |
| `shared/master-code/master-code.module.ts` | MUERTO | Solo registrado en app.module, no consumido |

### 10.2 Frontend

| Archivo | Estado | Evidencia |
|---|---|---|
| `services/session.ts` | MUERTO | 0 imports (SessionContext lo reemplaza) |
| `services/api/api-session-service.ts` | MUERTO | Exportado pero 0 consumers |
| `services/api/api-catalog-service.ts` | MUERTO | Exportado pero 0 consumers (modules usan mock local) |
| `services/mock/master-service.ts` | MUERTO | Exportado pero 0 consumers |
| `services/mock/source-service.ts` | MUERTO | Exportado pero 0 consumers |
| `services/mock/notification-service.ts` | PARCIAL | Exportado, 1 consumer (AppLayout), siempre mock |
| `mock/extras.ts` | MUERTO | 0 imports desde módulos (contiene datos no utilizados) |

---

## 11. CÓDIGO PARCIALMENTE IMPLEMENTADO

| Componente | Estado | Detalle |
|---|---|---|
| `ImportsPage.tsx` | PARCIAL | Hardcodea `mockImportService`, `mockQualityService`, `mockMatchingService` — bypass del mode switch |
| `AdminPage.tsx` | PARCIAL | Tabs de admin con datos mock, no consume API real |
| `DashboardPage.tsx` | PARCIAL | KPIs calculados desde datos mock |
| `ApprovalsPage.tsx` | PARCIAL | Solo permite APROBAR, no REJECT/RETURN |
| `WarehouseList.tsx` | PARCIAL | Muestra `request.requesterId` como texto en vez de nombre |
| `notificationService` | PARCIAL | Siempre mock, nunca consume API |

---

## 12. AUTH MOCK — ANÁLISIS CRÍTICO

**ESTADO ACTUAL:**
- `auth.service.ts:50` — `private currentUserId = 'u1'` es una variable de instancia del singleton
- `auth.controller.ts` — `GET /auth/session?userId=` cambia el usuario global
- `auth.service.ts:72-100` — `getSession()` retorna usuario hardcodeado con permisos hardcodeados
- TODOS los controllers llaman `this.authService.getSession()` para obtener usuario actual
- `rbac.guard.ts:23` — `authService.getSession()` para verificar permisos

**ARCHIVOS QUE DEPENDEN:**
13 archivos importan AuthService o llaman getSession():
- requests.controller.ts (4 llamadas)
- warehouse.controller.ts (3 llamadas)
- accounting.controller.ts (2 llamadas)
- final-review.controller.ts (2 llamadas)
- auth.controller.ts (1 llamada)
- rbac.guard.ts (1 llamada)

**PROBLEMA:**
Variable global compartida entre TODAS las conexiones HTTP concurrentes. Si User A cambia sesión via `?userId=u2`, TODOS los usuarios ven a User B.

**RIESGO:** CRÍTICO para producción. Aceptable solo para desarrollo local con un solo usuario a la vez.

**SOLUCIÓN FUTURA RECOMENDADA:**
1. JWT con claims de usuario
2. Middleware que extraiga userId del token por request
3. Request-scoped service en vez de singleton
4. Eliminar `setCurrentUser()` y el endpoint de switching

**NO IMPLEMENTAR TODAVÍA** — solo documentar.

---

## 13. WORKFLOW SERVICE — ANÁLISIS

**ESTADO:** Muerto. Registrado en app.module pero 0 imports desde business logic.

**TRANSICIONES DIVERGENTES:**
- WorkflowService: PENDING_MANAGER → APPROVE → MANAGER_APPROVED → ROUTE → PENDING_WAREHOUSE
- requests.service: PENDING_MANAGER → APPROVE → PENDING_WAREHOUSE (directo)

**DECISIÓN:** NO integrar. El flujo actual funciona y fue probado. WorkflowService debe eliminarse o reescribirse completamente.

---

## 14. MASTER CODE SERVICE — ANÁLISIS

**ESTADO:** Muerto. Registrado en app.module pero 0 imports desde business logic.

**FORMATO DIVERGENTE:**
- MasterCodeService: `{GRP}{SUB}000001` (6 dígitos, sin guión)
- requests.service: `{GRP}{SUB}-00001` (5 dígitos, con guión)

**DECISIÓN:** NO integrar. Debe eliminarse o reajustarse su formato para coincidir con el código activo.

---

## 15. FLATTEN REQUEST DATA — ANÁLISIS

**ESTADO:** 4 copias idénticas funcionando activamente.

**UBICACIÓN ÓPTIMA PROPUESTA:**
`apps/api/src/shared/utils/flatten-request-data.ts`

**RIESGO DE CENTRALIZAR:** Bajo. Es una función pura sin dependencias. Solo cambia el path de import.

---

## 16. MOCK DATA DEL FRONTEND — ANÁLISIS

### QUÉ ES MOCK (datos hardcodeados)

| Archivo | Contenido | Consumido por |
|---|---|---|
| `mock/catalog.ts` | 5 grupos, 5 subgrupos, 4 categorías, 5 marcas, 4 unidades | WarehouseClassify, AccountingList, FinalReviewPage, AdminPage, RequestDetail, MasterCodePreview, AnalyzerPanel |
| `mock/companies.ts` | 3 empresas, 6 deptos, 6 usuarios, 7 roles | AccountingList, FinalReviewPage, AdminPage, WarehouseList |
| `mock/requests.ts` | 9 solicitudes mock | DashboardPage (posiblemente) |
| `mock/master-items.ts` | 7 master items | No consumido directamente |
| `mock/source-items.ts` | Sources, source items, match candidates | ImportsPage |
| `mock/extras.ts` | Quality results, audit events, notifications | No consumido directamente |

### QUÉ ES REAL (consume API)

| Servicio | Consumido por |
|---|---|
| `requestService` | RequesterList, RequestCreate, RequestDetailPage, ApprovalsPage, DashboardPage |
| `warehouseService` | WarehouseList, WarehouseClassify |
| `accountingService` | AccountingList |
| `finalReviewService` | FinalReviewPage |
| `auditService` | AuditPage |
| `notificationService` | AppLayout (siempre mock) |

### QUÉ BYPASEA EL MODE SWITCH

| Módulo | Import directo | Problema |
|---|---|---|
| `ImportsPage.tsx:2` | `import { mockImportService, mockQualityService, mockMatchingService } from '../../services/mock'` | Nunca funcionará con API real |
| `WarehouseClassify.tsx:6` | `import { groups, subgroups, categories, brands, units } from '../../mock/catalog'` | Catálogos siempre mock |
| `AccountingList.tsx:5-6` | `import { groups, subgroups, categories, brands } from '../../mock/catalog'` + `import { users, departments } from '../../mock/companies'` | Datos siempre mock |
| `FinalReviewPage.tsx:4-5` | Mismo patrón que AccountingList | Datos siempre mock |

### QUÉ DEBE CONSERVARSE PARA DESARROLLO

- `services/mock/*` — Todos los mock services (útiles para `VITE_DATA_MODE=mock`)
- `mock/catalog.ts` — Solo si se quiere modo offline
- `mock/companies.ts` — Solo si se quiere modo offline
- `services/index.ts` — El switch mock/api es valioso para desarrollo

### QUÉ DEBE ELIMINARSE (completamente muerto)

- `services/session.ts` — 0 imports
- `mock/extras.ts` — 0 imports desde módulos

### QUÉ NO DEBE TOCARSE

- `services/api/*` — Servicios API reales
- `services/index.ts` — El switch mock/api
- `contexts/SessionContext.tsx` — Context real que consume API

---

## 17. PACKAGES HUÉRFANOS

### packages/shared

- Contenido: Solo `enums.ts` (77 líneas de constantes)
- Imports: 0 desde apps/api o apps/web
- workspace ref: `pnpm-workspace.yaml` lo incluye via `packages/*`
- **Veredicto:** Código abandonado. Seguro eliminar.

### packages/contracts

- Contenido: Solo `health.ts` (11 líneas, 2 interfaces)
- Imports: 0 desde apps/api o apps/web
- workspace ref: `pnpm-workspace.yaml` lo incluye via `packages/*`
- **Veredicto:** Código abandonado. Seguro eliminar.

---

## 18. UPLOADS DUPLICADOS

| Ubicación | Archivos | Quién lo usa |
|---|---|---|
| `apps/api/uploads/requests/` | 8 imágenes | `UploadsController` + `RequestsService` |
| `uploads/requests/` (root) | 9 imágenes | **Nadie** |

**Veredicto:** `uploads/requests/` (root) es huérfano. `apps/api/uploads/requests/` es el directorio activo.

---

## 19. DOCUMENTACIÓN OBSOLETA — ANÁLISIS

| Archivo | Tamaño | Estado | Refs vivas | Acción |
|---|---|---|---|---|
| `cleanup.md` | 7 KB | Plan de limpieza anterior | 0 | ELIMINAR |
| `current-status.md` | 6 KB | Estado desactualizado | 0 | ELIMINAR |
| `schema-review.md` | 25 KB | Schema conceptual | 0 (solo cross-refs de docs a eliminar) | ELIMINAR |
| `source-data-model.md` | 9 KB | Modelo no implementado | 0 (solo cross-refs) | ELIMINAR |
| `merge-split.md` | 15 KB | Operaciones no implementadas | 0 (solo cross-refs) | ELIMINAR |
| `future-architecture.md` | 4 KB | Arquitectura futura | 0 | ELIMINAR |
| `concurrency.md` | 8 KB | Análisis conceptual | 1 (architecture.md:354) | ACTUALIZAR ref, luego ELIMINAR |
| `master-data-model.md` | 17 KB | Modelo conceptual | 1 (architecture.md:147) | ACTUALIZAR ref, luego ELIMINAR |
| `frontend-prototype.md` | 8 KB | Prototipo conceptual | 0 | ELIMINAR |
| `project-structure.md` | 3 KB | Estructura desactualizada | 0 | ELIMINAR |
| `rbac.md` | 1 KB | RBAC documentado | 3 (commands + prompts) | ACTUALIZAR refs, luego ELIMINAR |
| `state-machines.md` | 11 KB | Máquinas de estado | 2 (commands + prompts) | ACTUALIZAR refs, luego ELIMINAR |
| `workflow-design.md` | 12 KB | Diseño workflow | 0 (solo cross-refs) | ELIMINAR |
| `decisions.md` | 20 KB | Decisiones históricas | 1 (architecture.md:160) | ACTUALIZAR ref, luego ELIMINAR |

**Conclusión:** 8 docs pueden eliminarse directo. 6 docs requieren que se actualicen sus referencias en architecture.md y prompts ANTES de eliminarlos.

---

## 20. ESTRUCTURA RECOMENDADA (CORREGIDA)

### Cambios vs plan original

| Plan original | Corrección | Motivo |
|---|---|---|
| Renombrar `shared/` a `compartido/` | **ELIMINAR shared/** en vez de renombrar | workflow y master-code están muertos. Prisma y utils se mudan a `modulos/comunes/` |
| Renombrar `auth/` a `autenticacion/` | **CONSERVAR auth/** | 12 archivos afectados, riesgo alto, poco beneficio |
| Renombrar `components/` a `componentes/` | **CONSERVAR components/** | 15 archivos afectados, riesgo alto, poco beneficio |
| Renombrar `contexts/` a `contextos/` | **CONSERVAR contexts/** | 12 archivos afectados, riesgo alto |
| Renombrar `mock/` a `datos-prueba/` | **CONSERVAR mock/** | 22 archivos afectados, riesgo alto |
| Renombrar todos los archivos `*.controller.ts` | **NO renombrar archivos individuales** | Los decorators `@Controller('requests')` definen rutas HTTP, no los nombres de archivo |

### Estructura final recomendada

```
apps/api/src/
├── main.ts
├── app.module.ts
├── modulos/
│   ├── solicitudes/        (era requests/)
│   ├── almacen/            (era warehouse/)
│   ├── contabilidad/       (era accounting/)
│   ├── revision-final/     (era final-review/)
│   ├── auditoria/          (era audit/)
│   ├── catalogos/          (era catalogs/)
│   ├── salud/              (era health/)
│   └── archivos/           (era uploads/)
├── auth/                   (SE MANTINE — renombrar es ALTO riesgo)
├── comun/                  (era shared/, sin workflow/master-code muertos)
│   ├── prisma/
│   └── utilidades/         (nuevo: flatten-request-data.ts)
└── test/

apps/web/src/
├── main.tsx
├── app/
├── components/             (SE MANTINE — renombrar es ALTO riesgo)
├── modulos/
│   ├── solicitudes/        (era requester/)
│   ├── almacen/            (era warehouse/)
│   ├── contabilidad/       (era accounting/)
│   ├── revision-final/     (era final-review/)
│   ├── auditoria/          (era audit/)
│   ├── aprobaciones/       (era approvals/)
│   ├── panel/              (era dashboard/)
│   ├── importaciones/      (era imports/)
│   └── administracion/     (era administration/)
├── services/               (SE MANTINE — renombrar es ALTO riesgo)
├── contexts/               (SE MANTINE — renombrar es ALTO riesgo)
├── mock/                   (SE MANTINE — renombrar es ALTO riesgo)
├── contracts/              (SE MANTINE)
├── types/                  (SE MANTINE)
└── utils/                  (SE MANTINE)
```

---

## 21. ORDEN EXACTO DE EJECUCIÓN CORREGIDO

### Fase 1: Eliminación segura (riesgo BAJO)

1. Eliminar `packages/shared/`
2. Eliminar `packages/contracts/`
3. Eliminar `apps/uploads/` (root)
4. Eliminar `opencode.jsonc.v2`

### Fase 2: Extraer código duplicado

5. Crear `apps/api/src/shared/utils/flatten-request-data.ts`
6. Actualizar imports en los 4 servicios

### Fase 3: Limpiar código muerto backend

7. Eliminar `shared/workflow/` (workflow.service.ts + workflow.module.ts)
8. Eliminar `shared/master-code/` (master-code.service.ts + master-code.module.ts)
9. Actualizar `app.module.ts` (quitar imports de WorkflowModule y MasterCodeModule)
10. Eliminar tests: `test/workflow.service.spec.ts` y `test/master-code.service.spec.ts`

### Fase 4: Limpiar código muerto frontend

11. Eliminar `services/session.ts`
12. Eliminar `services/api/api-session-service.ts`
13. Eliminar `services/api/api-catalog-service.ts`
14. Eliminar `services/mock/master-service.ts`
15. Eliminar `services/mock/source-service.ts`
16. Eliminar `mock/extras.ts`
17. Actualizar barrel exports (`services/api/index.ts`, `services/mock/index.ts`)

### Fase 5: Actualizar documentación referenciada

18. Actualizar `docs/architecture.md` — quitar refs a concurrency.md, master-data-model.md, decisions.md
19. Actualizar `.opencode/commands/phase-0.md` — quitar refs a rbac.md, state-machines.md
20. Actualizar `prompts/phase-00.md` — quitar refs a rbac.md, state-machines.md
21. Actualizar `prompts/phase-02.md` — quitar ref a rbac.md

### Fase 6: Eliminar documentación obsoleta

22. Eliminar los 14 docs obsoletos

### Fase 7: Renombrar carpetas backend (módulos de negocio)

23. Renombrar `modules/requests/` → `modulos/solicitudes/`
24. Renombrar `modules/warehouse/` → `modulos/almacen/`
25. Renombrar `modules/accounting/` → `modulos/contabilidad/`
26. Renombrar `modules/final-review/` → `modulos/revision-final/`
27. Renombrar `modules/audit/` → `modulos/auditoria/`
28. Renombrar `modules/catalogs/` → `modulos/catalogos/`
29. Renombrar `modules/health/` → `modulos/salud/`
30. Renombrar `modules/uploads/` → `modulos/archivos/`
31. Actualizar imports en `app.module.ts`, tests y cross-module imports

### Fase 8: Renombrar carpetas frontend (módulos)

32. Renombrar los 9 módulos frontend
33. Actualizar imports en `App.tsx`

### Fase 9: Validación

34. Typecheck API
35. Typecheck Web
36. Tests
37. Build
38. Health
39. Búsqueda de imports rotos

---

## 22. RIESGOS Y MEDIDAS DE PROTECCIÓN

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Imports rotos tras renombrado | ALTO | ALTO | Búsqueda global post-cambio, typecheck |
| Tests rotos | MEDIO | MEDIO | Ejecutar tests después de cada fase |
| Rutas API rotas | BAJO | ALTO | Los decorators @Controller mantienen rutas |
| Perdida de funcionalidad | BAJO | ALTO | Tests + health check post-cambio |
| Auth mock roto | BAJO | MEDIO | No se modifica auth en esta reestructuración |
| Documentación huérfana | MEDIO | BAJO | Actualizar refs antes de eliminar |

---

## 23. HALLAZGOS CRÍTICOS ADICIONALES

### 23.1 El plan original subestima la complejidad

El plan original propone ~45 renombres. La validación revela:
- 5 renombres son de ALTO RIESGO (19+ archivos cada uno)
- Renombrar `shared/`, `auth/`, `components/`, `contexts/`, `mock/` no justifica el riesgo
- Los renombres de módulos de negocio (requests→solicitudes, etc.) son de BAJO riesgo

### 23.2 Código muerto más extenso de lo esperado

- 2 servicios backend completos muertos (workflow, master-code)
- 5 servicios frontend muertos/muertos en funcionamiento
- 2 archivos mock muertos
- tests completos para código muerto

### 23.3 El mock data está más integrado de lo esperado

- 7 archivos de módulos importan directamente de `mock/catalog` en vez de usar la API
- 2 archivos importan directamente de `mock/companies`
- ImportsPage hardcodea mocks sin pasar por el mode switch
- Si se quiere que el frontend funcione 100% con API real, hay que actualizar estos imports

---

FASE 2 — VALIDACIÓN COMPLETADA
