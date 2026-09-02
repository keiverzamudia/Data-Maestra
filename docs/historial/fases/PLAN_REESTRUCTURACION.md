# Plan de Reestructuración — Data-Maestra

Fecha: 01 de septiembre de 2026
Basado en: AUDITORIA_ACTUAL.md

---

## Objetivo

Reorganizar el proyecto para que una persona pueda abrir las carpetas y entender dónde está cada cosa, sin necesitar preguntarle a una IA.

**Principios:**
- NO romper lo que funciona
- NO reescribir innecesariamente
- Eliminar lo obsoleto confirmado
- Unificar código duplicado
- Documentar la estructura real
- Mantener el flujo DRAFT → APPROVED intacto

---

## FASE A — ELIMINACIÓN DE HUÉRFANOS

### A1. Eliminar `packages/shared/`

**Archivos:**
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/index.ts`
- `packages/shared/src/enums.ts`

**Motivo:** No es importado por `apps/api/` ni `apps/web/`. Los enums están definidos independientemente en `apps/web/src/types/index.ts` y no se usan desde este paquete.

**Referencias encontradas:** Ninguna importación desde apps/ apunta a `@master-data/shared`.

**Seguro eliminar:** Sí. No hay dependencias.

### A2. Eliminar `packages/contracts/`

**Archivos:**
- `packages/contracts/package.json`
- `packages/contracts/tsconfig.json`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/health.ts`

**Motivo:** `apps/web/src/contracts/index.ts` es un archivo independiente que NO importa de `@master-data/contracts`. Las interfaces de `packages/contracts/` (solo `HealthCheckResponse` y `ReadinessCheckResponse`) no son usadas por nadie.

**Referencias encontradas:** Ninguna.

**Seguro eliminar:** Sí.

### A3. Eliminar `apps/uploads/` (root-level)

**Archivos:**
- `apps/uploads/requests/36572808...` (69 bytes)

**Motivo:** Directorio duplicado. La API usa `apps/api/uploads/requests/` (configurado en `UploadsController` y `RequestsService`). Este directorio en root es huérfano.

**Referencias encontradas:** Ninguna.

**Seguro eliminar:** Sí.

### A4. Eliminar `opencode.jsonc.v2`

**Archivos:**
- `opencode.jsonc.v2`

**Motivo:** OpenCode busca `opencode.json` o `opencode.jsonc`. Este archivo tiene extensión `.v2` y no es detectado. Es un archivo de configuración anterior.

**Seguro eliminar:** Sí. La configuración actual de OpenCode está en `.opencode/`.

---

## FASE B — UNIFICACIÓN DE CÓDIGO DUPLICADO

### B1. Extraer `flattenRequestData()` a archivo compartido

**ANTES:** 4 copias idénticas en:
- `apps/api/src/modules/requests/requests.service.ts` (línea 8)
- `apps/api/src/modules/warehouse/warehouse.service.ts` (línea 14)
- `apps/api/src/modules/accounting/accounting.service.ts` (línea 15)
- `apps/api/src/modules/final-review/final-review.service.ts` (línea 15)

**DESPUÉS:** 1 definición en:
- `apps/api/src/shared/utils/flatten-request-data.ts`

Los 4 servicios importan desde ahí.

**Impacto:** Solo cambio de import. Misma función. Tests no se afectan.

### B2. Integrar `WorkflowService` en `RequestsService`

**ANTES:**
- `shared/workflow/workflow.service.ts` tiene transiciones definidas
- `requests.service.ts:455` tiene transiciones hardcodeadas en `getNextStatus()`

**DESPUÉS:**
- `RequestsService` inyecta `WorkflowService`
- `getNextStatus()` delega a `WorkflowService.canTransition()` y la tabla de transiciones
- Se eliminan las transiciones hardcodeadas de `requests.service.ts`

**Impacto:** Misma lógica, un solo punto de mantenimiento. Tests de workflow existentes ya cubren `WorkflowService`.

### B3. Integrar `MasterCodeService` en `RequestsService`

**ANTES:**
- `shared/master-code/master-code.service.ts` tiene `generateMasterCode(groupCode, subgroupCode, sequence)`
- `requests.service.ts:431` tiene generación inline

**DESPUÉS:**
- `RequestsService` inyecta `MasterCodeService`
- `generateMasterCode()` en requests.service.ts delega al servicio compartido
- Se mantiene la lógica de secuencia (findFirst) en requests.service pero genera el código string via el servicio

**Impacto:** Misma lógica. Tests de `MasterCodeService` ya existen.

---

## FASE C — NORMALIZACIÓN DE CARPETAS BACKEND

### Estructura actual vs propuesta

```
ANTES:                                  DESPUÉS:
apps/api/src/                          apps/api/src/
├── main.ts                            ├── main.ts
├── app.module.ts                      ├── app.module.ts
├── modules/                           ├── modulos/
│   ├── accounting/                    │   ├── contabilidad/
│   │   ├── accounting.controller.ts   │   │   ├── contabilidad.controller.ts
│   │   ├── accounting.module.ts       │   │   ├── contabilidad.module.ts
│   │   └── accounting.service.ts      │   │   └── contabilidad.service.ts
│   ├── audit/                         │   ├── auditoria/
│   ├── auth/                          │   ├── autenticacion/
│   ├── catalogs/                      │   ├── catalogos/
│   ├── final-review/                  │   ├── revision-final/
│   ├── health/                        │   ├── salud/
│   ├── requests/                      │   ├── solicitudes/
│   │   ├── requests.controller.ts     │   │   ├── solicitud.controller.ts
│   │   ├── requests.service.ts        │   │   ├── solicitud.service.ts
│   │   ├── requests.module.ts         │   │   ├── solicitud.module.ts
│   │   └── dto/                       │   │   └── dto/
│   ├── uploads/                       │   ├── archivos/
│   └── warehouse/                     │   └── almacen/
│       ├── warehouse.controller.ts    │       ├── almacen.controller.ts
│       ├── warehouse.module.ts        │       ├── almacen.module.ts
│       └── warehouse.service.ts       │       └── almacen.service.ts
├── shared/                            └── compartido/
│   ├── master-code/                       ├── codigo-master/
│   ├── prisma/                            ├── prisma/
│   └── workflow/                          ├── workflow/
│                                          └── utilidades/
```

**IMPORTANTE:** Los nombres de módulos Prisma, rutas API y-tablas de BD NO cambian. Solo cambian los nombres de archivos y carpetas del código fuente.

**Nota sobre `requests/`:** El controller tiene rutas como `/requests/:id`. Si renombramos el controller a `solicitud.controller.ts`, las rutas de API siguen siendo `/requests/:id` porque el decorator `@Controller('requests')` define la ruta HTTP. El nombre del archivo no afecta las rutas.

### Conflictos potenciales y mitigación

| Cambio | Riesgo | Mitigación |
|---|---|---|
| Renombrar `requests/` a `solicitudes/` | Imports en test files | Actualizar imports en `test/requests.service.spec.ts` |
| Renombrar `warehouse/` a `almacen/` | Imports en module | Actualizar imports en `almacen.module.ts` |
| Renombrar archivos `*.controller.ts` | Decorators @Controller mantienen rutas HTTP | Los decorators definen rutas, no los nombres de archivo |

---

## FASE D — NORMALIZACIÓN DE CARPETAS FRONTEND

### Estructura actual vs propuesta

```
ANTES:                                  DESPUÉS:
apps/web/src/                          apps/web/src/
├── main.tsx                           ├── main.tsx
├── app/                               ├── app/
├── components/                        ├── componentes/
│   ├── layout/                        │   ├── diseno/
│   ├── ui/                            │   ├── ui/ (sin traducir)
│   └── workflow/                      │   └── workflow/ (sin traducir)
├── modules/                           ├── modulos/
│   ├── accounting/                    │   ├── contabilidad/
│   ├── administration/                │   ├── administracion/
│   ├── approvals/                     │   ├── aprobaciones/
│   ├── audit/                         │   ├── auditoria/
│   ├── dashboard/                     │   ├── panel/
│   ├── final-review/                  │   ├── revision-final/
│   ├── imports/                       │   ├── importaciones/
│   ├── requester/                     │   ├── solicitudes/
│   └── warehouse/                     │   └── almacen/
├── services/                          ├── servicios/
│   ├── api/                           │   ├── api/
│   └── mock/                          │   └── mock/
├── contexts/                          ├── contextos/
├── contracts/                         ├── contratos/
├── types/                             ├── tipos/
├── mock/                              ├── datos-prueba/
└── utils/                             └── utilidades/
```

### Notas sobre frontend

- `components/ui/` y `components/workflow/` NO se traducen porque son componentes técnicos genéricos
- Los módulos se traducen porque son conceptos de negocio
- `services/api/` y `services/mock/` se mantienen como subcarpetas porque son implementaciones alternativas del mismo contrato

---

## FASE E — LIMPIEZA DE DOCUMENTACIÓN OBSOLETA

### Archivos a ELIMINAR

| Archivo | Motivo |
|---|---|
| `docs/cleanup.md` | Plan de limpieza de fase anterior, ya no es relevante |
| `docs/current-status.md` | Estado desactualizado, será reemplazado por AUDITORIA_ACTUAL.md |
| `docs/schema-review.md` | Review de schema conceptual, no refleja Prisma actual |
| `docs/source-data-model.md` | Modelo no implementado, documenta fase futura |
| `docs/merge-split.md` | Operaciones no implementadas, documenta fase futura |
| `docs/future-architecture.md` | Arquitectura futura, no estado actual |
| `docs/concurrency.md` | Análisis conceptual de concurrencia |
| `docs/master-data-model.md` | Modelo conceptual, reemplazado por ARQUITECTURA.md |
| `docs/frontend-prototype.md` | Prototipo conceptual, ya no aplica |
| `docs/project-structure.md` | Estructura desactualizada, reemplazado por MAPA_DEL_SISTEMA.md |
| `docs/rbac.md` | RBAC documentado vs implementado, reemplazado por ARQUITECTURA.md |
| `docs/state-machines.md` | Máquinas de estado, reemplazado por ARQUITECTURA.md |
| `docs/workflow-design.md` | Diseño workflow, reemplazado por ARQUITECTURA.md |
| `docs/decisions.md` | Decisiones históricas, reemplazado por DECISIONES.md actualizado |
| `README.md` | Mínimo (32 líneas), será reescrito |

### Archivos a MANTENER

| Archivo | Motivo |
|---|---|
| `docs/architecture.md` | Referencia conceptual, se mantendrá como archivo histórico |
| `docs/local-development.md` | Instrucciones útiles de desarrollo |
| `docs/local-testing.md` | Instrucciones de pruebas |
| `docs/local-workflow-testing.md` | Pruebas de workflow |
| `docs/USER-GUIDE.md` | Guía de usuario |

### Archivos a CREAR

| Archivo | Contenido |
|---|---|
| `docs/ARQUITECTURA.md` | Arquitectura completa del sistema |
| `docs/MAPA_DEL_SISTEMA.md` | "Si quiero cambiar X, ¿dónde voy?" |
| `docs/MANUAL_DE_CAMBIOS.md` | Cómo hacer cambios comunes |
| `docs/DICCIONARIO_DEL_SISTEMA.md` | Términos del negocio |
| `docs/DEPENDENCIAS.md` | Inventario de dependencias |
| `docs/DECISIONES.md` | Decisiones de arquitectura (actualizado) |

---

## FASE F — LIMPIEZA DE PROMPTS

Los archivos en `prompts/` son prompts de fase para guiar el desarrollo. Se mantienen como referencia histórica pero se les agrega una nota al inicio indicando que son prompts históricos, no documentación vigente.

---

## FASE G — ACTUALIZACIÓN DE IMPORTS

### Backend

Cada vez que se renombra una carpeta o archivo, se actualizan:
1. `app.module.ts` — imports de módulos
2. Cada `*.module.ts` — imports de controllers, services, otros módulos
3. Cada `*.service.ts` — imports de Prisma, otros servicios
4. Cada `*.controller.ts` — imports de servicios, DTOs
5. `test/*.spec.ts` — imports de servicios/controller

### Frontend

1. `app/App.tsx` — imports de módulos
2. Cada `modulos/*/index.ts` — re-exports
3. `services/index.ts` — imports de servicios API y mock
4. Componentes — imports de contextos, servicios, tipos

### Búsqueda post-reorganización

Ejecutar búsqueda global de:
- `from '../modules/` → verificar que todas las rutas apuntan a carpetas correctas
- `from '../../modules/` → verificar imports de padres
- `from './` → verificar imports locales
- `require(` → verificar si hay requires dinámicos

---

## ORDEN DE EJECUCIÓN

| Fase | Descripción | Riesgo | Dependencias |
|---|---|---|---|
| A | Eliminar huérfanos | Bajo | Ninguna |
| B | Unificar código duplicado | Medio | Ninguna |
| C | Normalizar carpetas backend | Medio | Fase B (imports actualizados) |
| D | Normalizar carpetas frontend | Medio | Fase C (imports coherentes) |
| E | Limpiar documentación obsoleta | Bajo | Ninguna |
| F | Actualizar prompts | Bajo | Ninguna |
| G | Actualizar imports y validar | Alto | Fases C + D |

### Validación después de cada fase

| Fase | Typecheck API | Typecheck Web | Tests | Build |
|---|---|---|---|---|
| A | ✅ | ✅ | ✅ | ✅ |
| B | ✅ | — | ✅ | ✅ |
| C | ✅ | — | ✅ | ✅ |
| D | — | ✅ | — | ✅ |
| E | — | — | — | — |
| F | — | — | — | — |
| G | ✅ | ✅ | ✅ | ✅ |

---

## ESTIMACIÓN DE CAMBIOS

| Tipo | Cantidad estimada |
|---|---|
| Archivos eliminados | ~25 (packages/, docs/, uploads root, opencode.jsonc.v2) |
| Archivos renombrados (backend) | ~20 (controllers, services, modules) |
| Archivos renombrados (frontend) | ~25 (módulos, componentes, servicios) |
| Archivos creados | ~8 (documentación + utilidades) |
| Imports actualizados | ~50 (imports rotos tras renombrado) |
| Código eliminado | ~100 líneas (duplicaciones) |
| Código extraído | ~30 líneas (flattenRequestData) |

---

## LO QUE NO CAMBIA

- Rutas de API (`/api/v1/requests`, `/api/v1/warehouse`, etc.)
- Nombres de tablas en Prisma
- Nombres de columnas en la DB
- Nombres de paquetes npm
- Variables de entorno
- Configuración de Vite
- Configuración de TypeScript
- Test existentes (solo se actualizan imports)
- Scripts de PowerShell
- Datos en la DB
- flujo DRAFT → APPROVED
- RBAC existente
- Auth mock (se mantiene por ahora)
