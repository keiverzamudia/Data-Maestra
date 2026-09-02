# Cobertura Actual de Tests — Data-Maestra

Fecha: 01 de septiembre de 2026

---

## Resumen

| Métrica | Valor |
|---|---|
| Total tests | 33 |
| Tests pasando | 33/33 |
| Archivos de test | 3 |
| Framework | Vitest |

---

## Tests existentes

### 1. `test/requests.service.spec.ts` — 21 tests

| Suite | Tests | Estado |
|---|---|---|
| create | 2 | ✅ |
| findAll | 4 | ✅ |
| findOne | 2 | ✅ |
| submit | 3 | ✅ |
| approve | 6 | ✅ |
| classify | 4 | ✅ |

**Cubre:** CRUD de solicitudes, submit, approve, classify, validaciones de estado.

### 2. `test/catalogs.controller.spec.ts` — 4 tests

| Suite | Tests | Estado |
|---|---|---|
| GET /catalogs/groups | 2 | ✅ |
| GET /catalogs/brands | 2 | ✅ |

**Cubre:** Lectura de catálogos (groups y brands).

### 3. `test/flatten-request-data.spec.ts` — 8 tests

| Suite | Tests | Estado |
|---|---|---|
| flattenRequestData | 8 | ✅ |

**Cubre:** Función de aplanamiento de requestData.

---

## COBERTURA PENDIENTE — No implementada

### Backend — Sin tests

| Módulo | Prioridad | Nota |
|---|---|---|
| warehouse.service | ALTA | Clasificación y approve con validación |
| accounting.service | ALTA | Approve con códigos contables |
| final-review.service | ALTA | Approve/reject final |
| auth.service | ALTA | Sesión, permisos, RBAC |
| rbac.guard | ALTA | Verificación de permisos |
| audit.service | MEDIA | Log y consulta de eventos |
| health.service | MEDIA | Health y readiness |
| uploads.controller | BAJA | Servir archivos |

### Frontend — Sin tests

| Componente | Prioridad |
|---|---|
| Todos los módulos | MEDIA |
| SessionContext | ALTA |
| api-client (retry logic) | MEDIA |

### E2E — Sin tests

| Flujo | Prioridad |
|---|---|
| DRAFT → APPROVED completo | ALTA |
| Rechazo desde manager | ALTA |
| Retorno desde almacén | ALTA |

---

## Notas

- Los tests de `workflow.service.spec.ts` y `master-code.service.spec.ts` fueron eliminados en Fase 3 junto con el código muerto.
- Los tests actuales usan mocks de Prisma (`vi.fn()`) — no dependen de DB real.
- No se han implementado tests artificiales para inflar números.
