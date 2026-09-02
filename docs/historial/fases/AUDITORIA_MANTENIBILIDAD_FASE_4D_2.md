# Auditoría de Mantenibilidad — Fase 4D-2

Fecha: 01 de septiembre de 2026
Estado: COMPLETADA
Cambios de código: 0

---

## 1. RESUMEN EJECUTIVO

### Estado actual del proyecto

| Métrica | Valor |
|---|---|
| Tests | 69/69 PASS |
| Typecheck API | PASS |
| Typecheck WEB | PASS |
| Health | 200 |
| Estructura normalizada | Sí |
| Documentación creada | 8 archivos |
| Código muerto eliminado | Sí (FASE 3, 4A, 4D-1B) |
| Duplicación de lógica | Reducida (flattenRequestData unificado) |

### Mantenibilidad: ¿Puede un humano mantenerlo?

**Respuesta parcial: SÍ para el backend core. NO para el frontend en producción.**

El backend tiene una arquitectura razonablemente clara con separación controller→service→Prisma. Sin embargo, `solicitud.service.ts` es un "God Service" de 453 líneas con 7 responsabilidades.

El frontend tiene un problema estructural fundamental: **11 de 25 archivos importan datos mock directamente**, lo que significa que la aplicación NO funcionará con datos reales en producción sin refactorizaciones significativas.

---

## 2. PRUEBA "SIN IA" — ¿PUEDE UN HUMANO ENCONTRAR DÓNDE MODIFICAR?

| Pregunta | ¿Se puede responder? | Dónde |
|---|---|---|
| ¿Dónde modifico el formulario de solicitudes? | SÍ | `modulos/solicitudes/SolicitudCreate.tsx` |
| ¿Dónde modifico el workflow? | SÍ | `modulos/solicitudes/solicitud.service.ts` línea ~455 |
| ¿Dónde modifico los grupos? | PARCIAL | Backend: `modulos/catalogos/` + Prisma. Frontend: hardcodeado en mock |
| ¿Dónde agrego un grupo? | NO CLARO | DB: `prisma/schema.prisma`. Backend: `catalogos.service.ts`. Frontend: `mock/catalog.ts` (no hay servicio API) |
| ¿Dónde modifico usuarios? | PARCIAL | `autenticacion.service.ts` (mock). No hay DB real |
| ¿Dónde agrego un permiso? | SÍ | `autenticacion.service.ts` → `ROLE_PERMISSIONS` |
| ¿Dónde agrego un endpoint? | SÍ | Controller + service del módulo correspondiente |
| ¿Dónde agrego una consulta? | SÍ | Service del módulo correspondiente |
| ¿Dónde modifico una tabla? | SÍ | `prisma/schema.prisma` |
| ¿Dónde agrego un módulo? | SÍ | `modulos/{nombre}/` + `app.module.ts` |
| ¿Dónde modifico una página? | SÍ | `modulos/{modulo}/{Nombre}.tsx` |
| ¿Dónde agrego un componente reutilizable? | SÍ | `componentes/ui/` |
| ¿Dónde agrego un test? | SÍ | `apps/api/test/` |
| ¿Dónde cambio una regla de negocio? | PARCIAL | `solicitud.service.ts` (pero está en un archivo de 453 líneas) |

**Resultado: 11/15 preguntas respondidas. 4 con dificultad media.**

---

## 3. PROBLEMAS DE MANTENIBILIDAD

### CRÍTICO

| # | Problema | Ubicación | Evidencia | Impacto | Recomendación |
|---|---|---|---|---|---|
| 1 | **11 archivos importan mocks directamente** | Frontend (ver tabla abajo) | `import { groups } from '../../mock/catalog'` en 8+ archivos | La app NO funcionará en producción con datos reales | Crear servicios de catálogos, empresas, usuarios y reemplazar imports directos |
| 2 | **`solicitud.service.ts` es God Service** | `modulos/solicitudes/solicitud.service.ts` | 453 líneas, 7 responsabilidades | Difícil de mantener, testear, y modificar | Extraer: WorkflowEngine, NumberGenerator, MasterCodeGenerator |
| 3 | **Auth singleton con estado compartido** | `modulos/autenticacion/autenticacion.service.ts:50` | `private currentUserId = 'u1'` | Race condition: 2 usuarios concurrentes comparten identidad | JWT + request-scoped storage |
| 4 | **Path traversal en uploads** | `modulos/archivos/archivos.controller.ts` | `join(process.cwd(), 'uploads', filename)` sin sanitizar | Servir archivos arbitrarios del servidor | Sanitizar filename + auth guard |

### ALTO

| # | Problema | Ubicación | Recomendación |
|---|---|---|---|
| 5 | **AuditoriaService nunca se usa** | `modulos/auditoria/auditoria.service.ts` | `logEvent()` nunca es llamado. Todo el audit está inline en solicitud.service |
| 6 | **RBAC sin deny-by-default** | `modulos/autenticacion/rbac.guard.ts:19` | Si no hay `@RequirePermission`, el guard retorna `true` |
| 7 | **Contabilidad sin transacción** | `modulos/contabilidad/contabilidad.service.ts:69-77` | `createMany` códigos contables fuera de la transacción de approve |
| 8 | **Race conditions en generación** | `solicitud.service.ts:413,431` | `findFirst` + increment no es atómico |
| 9 | **ImportacionesPage 100% mock** | `modulos/importaciones/ImportacionesPage.tsx:2-3` | Importa mocks directamente, bypass total del service layer |
| 10 | **AdministracionPage 100% mock** | `modulos/administracion/AdministracionPage.tsx:3-4` | Sin servicio API, todo hardcodeado |

### MEDIO

| # | Problema | Ubicación | Recomendación |
|---|---|---|---|
| 11 | **`findName()` duplicado 3 veces** | ContabilidadList, RevisionFinalPage, RequestDetail | Extraer a utilidad compartida |
| 12 | **Master code generation duplicado 3 veces** | AlmacenClassify, ContabilidadList (×2) | Extraer a servicio o utilidad |
| 13 | **Navegación inconsistente** | SolicitudesList usa `window.location.href`, otros usan `useNavigate` | Unificar a react-router |
| 14 | **Sin error handling en 5+ async ops** | SolicitudesList, AlmacenList, AuditoriaPage, PanelPage | Agregar `.catch()` |
| 15 | **KPIs hardcodeados en dashboard** | PanelPage.tsx:14-17 | Crear endpoint de stats o servicio |

---

## 4. AUDITORÍA FRONTEND

### Separación de capas

| Página | Sigue Page→Service→API | Mock imports directos | Problema principal |
|---|---|---|---|
| SolicitudCreate | SÍ | No | fetch directo para foto |
| SolicitudesList | SÍ | No | Sin error handling |
| AlmacenClassify | PARCIAL | SÍ (catalog, source-items) | Catálogos desde mock |
| AlmacenList | PARCIAL | SÍ (companies) | Nombres desde mock |
| ContabilidadList | PARCIAL | SÍ (catalog, companies) | Nombres desde mock |
| RevisionFinalPage | PARCIAL | SÍ (catalog, companies) | Nombres desde mock |
| AprobacionesPage | SÍ | No | Sin rechazo, IDs crudos |
| PanelPage | SÍ | No | KPIs hardcodeados |
| ImportacionesPage | NO | SÍ (mock services) | 100% mock |
| AuditoriaPage | PARCIAL | SÍ (companies) | Nombres desde mock |
| AdministracionPage | NO | SÍ (catalog, companies) | 100% mock |

### Archivos que importan mocks directamente (11/25)

| Archivo | Mocks importados |
|---|---|
| AlmacenClassify.tsx | source-items, catalog |
| AlmacenList.tsx | companies |
| ContabilidadList.tsx | catalog, companies |
| RevisionFinalPage.tsx | catalog, companies |
| AuditoriaPage.tsx | companies |
| AdministracionPage.tsx | catalog, companies |
| ImportacionesPage.tsx | servicios/mock, source-items |
| CompanyContext.tsx | companies |
| RequestDetail.tsx | catalog, companies |
| MasterCodePreview.tsx | catalog |
| AnalyzerPanel.tsx | catalog |

---

## 5. AUDITORÍA BACKEND

### Separación de capas

| Módulo | Controller → Service → Prisma | Problemas |
|---|---|---|
| solicitudes | SÍ | God service (453 líneas, 7 responsabilidades) |
| almacen | SÍ (delegation) | `as any`, non-null assertions |
| contabilidad | SÍ | Transacción rota en códigos contables |
| revision-final | SÍ | Double DB fetch |
| auditoria | SÍ | Servicio nunca llamado (dead code) |
| catalogos | SÍ | Sin proteger con RBAC |
| salud | SÍ | Sin problemas |
| archivos | PARCIAL | Path traversal, sin auth |
| autenticacion | PARCIAL | Mock in-memory, race condition |

### `solicitud.service.ts` — Desglose de responsabilidades

| Responsabilidad | Líneas | Método |
|---|---|---|
| CRUD requests | ~60 | create, findAll, findOne |
| Workflow state machine | ~20 | getNextStatus |
| Workflow instance/task/history | ~80 | submit, approve |
| Approval records | ~15 | approve (inline) |
| Audit logging | ~30 | inline en cada método |
| Request number generation | ~15 | generateRequestNumber |
| Master code generation | ~25 | generateMasterCode |
| Classification | ~80 | classify |
| Photo upload | ~15 | savePhoto |
| History query | ~15 | getHistory |

---

## 6. AUDITORÍA DE DATOS

| Fuente | Tipo | Uso real |
|---|---|---|
| Prisma/SQLite | REAL | Persistencia de solicitudes, requestData, workflow, approvals, audit |
| API REST | REAL | CRUD de solicitudes, workflow, clasificación, aprobación |
| `mock/catalog.ts` | MOCK | Grupos, subgrupos, categorías, marcas, unidades (8+ archivos) |
| `mock/companies.ts` | MOCK | Usuarios, empresas, departamentos, roles (6+ archivos) |
| `mock/source-items.ts` | MOCK | Propuestas del analizador (1 archivo) |
| `mock/requests.ts` | MOCK | Datos de solicitudes (no usado directamente) |
| `mock/master-items.ts` | MOCK | Master items (no usado directamente) |
| `mock/extras.ts` | MOCK | Audit events, quality, notifications (3 mock services) |
| `servicios/mock/*.ts` | MOCK/FALLBACK | Servicios mock para modo offline |
| Dashboard KPIs | HARDCODE | Valores 0, strings literal |
| Actividad reciente | HARDCODE | Strings literal en JSX |
| `autenticacion.service.ts` | MOCK | Usuarios hardcodeados |

---

## 7. AUDITORÍA DE CATÁLOGOS

| Catálogo | Existe en DB | Existe API | Frontend usa API | Frontend usa mock |
|---|---|---|---|---|
| Grupos | SÍ (seed.js) | SÍ (`/catalogs/groups`) | NO | SÍ (8 archivos) |
| Subgrupos | SÍ (seed.js) | SÍ (`/catalogs/subgroups`) | NO | SÍ (5 archivos) |
| Categorías | SÍ (seed.js) | SÍ (`/catalogs/categories`) | NO | SÍ (3 archivos) |
| Marcas | SÍ (seed.js) | SÍ (`/catalogs/brands`) | NO | SÍ (5 archivos) |
| Unidades | SÍ (seed.js) | SÍ (`/catalogs/units`) | NO | SÍ (2 archivos) |

**Problema:** La API de catálogos EXISTE y FUNCIONA, pero el frontend NUNCA la consume. Todos los componentes importan directamente de `mock/catalog.ts`.

---

## 8. AUDITORÍA DE AUTH/RBAC

### Backend

| Componente | Estado |
|---|---|
| Usuarios | Mock hardcodeados (5 usuarios) |
| Sesión | Global in-memory (race condition) |
| Permisos | Hardcodeados en `ROLE_PERMISSIONS` |
| RBAC Guard | Funcional pero sin deny-by-default |
| Segregación de funciones | No implementada |

### Frontend

| Componente | Estado |
|---|---|
| SessionContext | Fetch API con fallback a DEFAULT_SESSION hardcodeado |
| CompanyContext | 100% mock |
| UserSwitcher | Widget de desarrollo, no para producción |
| hasPermission() | Funcional con datos mock |

---

## 9. AUDITORÍA DE TESTS

### Qué cubren (69 tests)

| Suite | Tests | Qué cubre |
|---|---|---|
| requests.service | 21 | CRUD, submit, approve, classify, validaciones de estado |
| warehouse.service | 11 | Approve con validación, return, errores |
| accounting.service | 9 | Approve, reject, códigos contables |
| final-review.service | 10 | Approve, reject, transiciones |
| flatten-request-data | 8 | Función de aplanamiento |
| e2e-workflow | 4 | Flujo completo DRAFT→APPROVED, reject, return |
| refresh-persistence | 2 | Persistencia de clasificación |
| catalogs.controller | 4 | Lectura de catálogos |

### Qué NO cubren (gaps críticos)

| Área | Estado |
|---|---|
| Auth/RBAC guard | 0 tests |
| Warehouse controller (HTTP) | 0 tests |
| Accounting controller (HTTP) | 0 tests |
| Final-review controller (HTTP) | 0 tests |
| Solicitudes controller (HTTP) | 0 tests |
| Auditoria service | 0 tests |
| Uploads controller | 0 tests |
| Health service | 0 tests |
| Race conditions | 0 tests |
| Concurrencia/doble aprobación | 0 tests |
| Permisos/RBAC | 0 tests |
| Frontend (todo) | 0 tests |

**Falsa sensación de seguridad:** Los 69 tests cubren services con mocks de Prisma. No cubren HTTP, no cubren RBAC, no cubren concurrencia, no cubren frontend.

---

## 10. AUDITORÍA DE DOCUMENTACIÓN

| Documento | Estado vs Código |
|---|---|
| `ESTRUCTURA_PROYECTO.md` | ✅ Correcto, refleja estructura actual |
| `MAPA_ARQUITECTURA.md` | ✅ Correcto |
| `REGLAS_ARQUITECTURA.md` | ✅ Correcto |
| `MAPA_CAMBIOS.md` | ✅ Correcto, rutas reales |
| `GLOSARIO_PROYECTO.md` | ✅ Correcto |
| `FLUJO_DATOS.md` | ✅ Correcto |
| `README.md` (docs/) | ✅ Correcto, índice navegable |
| `MANUAL_DESARROLLADOR.md` | ✅ Correcto, ejemplos reales |
| `WORKFLOW_ACTUAL.md` | ✅ Correcto |
| `MOCKS_ACTUALES.md` | ⚠️ Paths antiguos en algunas referencias |
| `FUENTES_DATOS_ACTUALES.md` | ⚠️ Paths antiguos |
| `PENDIENTES_LIMPIEZA.md` | ✅ Actualizado con eliminaciones |

---

## 11. PROBLEMA DE MANTENIBILIDAD #1: MOCKS

El problema más grande de mantenibilidad es la dependencia directa de mocks en componentes funcionales.

**Si mañana un desarrollador quiere cambiar cómo se muestran los grupos en Almacén, debe:**
1. Entender que `AlmacenClassify.tsx` importa de `../../mock/catalog`
2. Saber que la API real existe en `/catalogs/groups`
3. Reemplazar el import mock por un servicio API
4. Crear un servicio de catálogos en `servicios/api/`
5. Actualizar el barrel export
6. Verificar que no rompa nada

Esto NO es obvio para un desarrollador nuevo. La documentación dice "usar servicios", pero el código real importa mocks directamente.

---

## 12. ESTRUCTURA RECOMENDADA vs ACTUAL

### Actual (ya implementada)

```
modulos/solicitudes/     ✅ Claro
modulos/almacen/         ✅ Claro
modulos/contabilidad/    ✅ Claro
modulos/revision-final/  ✅ Claro
modulos/auditoria/       ✅ Claro
modulos/catalogos/       ✅ Claro
modulos/salud/           ✅ Claro
modulos/archivos/        ✅ Claro
modulos/autenticacion/   ✅ Claro
comun/prisma/            ✅ Claro
comun/utilidades/        ✅ Claro
```

### Recomendada (cambios menores, no reorganización)

La estructura actual ES correcta. Los problemas no están en las carpetas sino en:

1. **Servicios faltantes** — No hay servicios API para catálogos, empresas, usuarios
2. **Mocks importados directamente** — 11 archivos bypass el service layer
3. **God service** — `solicitud.service.ts` necesita descomposición
4. **Auth mock** — Necesita JWT real

**NO se recomienda reorganizar carpetas.** Se recomienda crear servicios faltantes y eliminar imports directos de mocks.

---

## 13. REGLAS DE ARQUITECTURA VALIDADAS

| Regla | ¿Se cumple? | Evidencia |
|---|---|---|
| R1: Cada módulo tiene su carpeta | SÍ | 9 módulos en `modulos/` |
| R2: Páginas no acceden a Prisma | SÍ | Frontend solo usa servicios |
| R3: Frontend consume vía servicios | PARCIAL | 4 páginas sí, 8 páginas importan mocks directamente |
| R4: Controllers delegan a services | SÍ | Todos los controllers |
| R5: Lógica de negocio en backend services | SÍ | `solicitud.service.ts` tiene toda la lógica |
| R6: Componentes UI reutilizables fuera de módulos | SÍ | `componentes/ui/` |
| R7: Mocks no ocultos en funcionalidad real | NO | 11 archivos importan mocks directamente |
| R8: Tests incluidos | PARCIAL | 69 tests de services, 0 de controllers, 0 de frontend |
| R9: No duplicar tipos ni lógica | PARCIAL | `findName()` y master code duplicados |
| R10: Documentación actualizada | SÍ | 8 documentos correctos |

---

## 14. LISTA DE CAMBIOS FUTUROS

### CRÍTICO (Producción bloqueada)

| # | Cambio | Archivos afectados |
|---|---|---|
| 1 | JWT auth + request-scoped session | autenticacion.service.ts,所有 controllers, rbac.guard.ts |
| 2 | Sanitizar filename en uploads | archivos.controller.ts |

### ALTO (Producción con limitaciones)

| # | Cambio | Archivos afectados |
|---|---|---|
| 3 | Crear servicio de catálogos API | Nuevo api-catalog-service.ts, 8+ archivos |
| 4 | Crear servicio de empresas API | Nuevo api-company-service.ts, 6+ archivos |
| 5 | Eliminar imports directos de mock | 11 archivos frontend |
| 6 | Descomponer solicitud.service.ts | solicitud.service.ts → 3-4 servicios |
| 7 | Wire AuditoriaService | auditoria.service.ts + solicitud.service.ts |
| 8 | Fix transacción contabilidad | contabilidad.service.ts |
| 9 | Agregar RBAC a catalogs controller | catalogos.controller.ts |
| 10 | Fix path traversal uploads | archivos.controller.ts |

### MEDIO (Calidad de código)

| # | Cambio | Archivos afectados |
|---|---|---|
| 11 | Extraer `findName()` a utilidad | 3 archivos |
| 12 | Extraer master code generation | 3 archivos |
| 13 | Unificar navegación a react-router | 2 archivos |
| 14 | Agregar error handling | 5+ archivos |
| 15 | RBAC deny-by-default | rbac.guard.ts |
| 16 | Agregar tests de controllers | Nuevos archivos |

### BAJO (Mejoras estéticas)

| # | Cambio |
|---|---|
| 17 | Reemplazar console.log por Logger |
| 18 | Agregar pagination real |
| 19 | Dashboard KPIs desde API |

---

## 15. CONCLUSIÓN

### Lo que está bien

- **Estructura de carpetas clara** — Un desarrollador puede encontrar módulos fácilmente
- **Separación backend** — Controllers delgados, services con lógica
- **Documentación completa** — 8 documentos actualizados
- **Tests de services** — 69 tests cubren lógica de negocio core
- **Workflow funcional** — DRAFT→APPROVED completo
- **RBAC funcional** — Guards y permisos implementados

### Lo que necesita trabajo

- **Mocks directos** — 11 archivos importan mocks, la app no funciona en producción
- **God service** — `solicitud.service.ts` demasiado grande
- **Auth mock** — Race condition, no producción
- **Tests incompletos** — 0 tests de controllers, 0 de frontend, 0 de RBAC
- **Seguridad** — Path traversal en uploads

### Veredicto de mantenibilidad

**Para un desarrollador nuevo:** La estructura es clara. Puede encontrar dónde está cada cosa. Pero al intentar hacer cambios, se encontrará con que muchos componentes dependen de mocks y la documentación no menciona esto explícitamente.

**Prioridad:** Crear servicios de catálogos/empresas y eliminar imports directos de mocks. Esto desbloqueará la capacidad real del sistema.

---

FASE 4D-2 — AUDITORÍA COMPLETADA

CAMBIOS DE CÓDIGO: 0
ARCHIVOS ELIMINADOS: 0
ARCHIVOS MOVIDOS: 0
ARCHIVOS MODIFICADOS: 0

DETENIDO. Esperando instrucciones.
