# Cierre Fase 5F — Limpieza Final

Fecha: 01 de septiembre de 2026
Estado: COMPLETADA

---

## 1. Baseline

| Prueba | Valor |
|---|---|
| Tests | 69/69 PASS |
| API typecheck | PASS |
| WEB typecheck | PASS |
| Health | 200 |

---

## 2. Mocks auditados

| Categoría | Cantidad |
|---|---|
| Total archivos mock auditados | 6 |
| Total servicios mock auditados | 10 |
| Huérfanos eliminados | 3 archivos + 4 servicios |
| Temporales conservados | 6 servicios |
| Datos conservados (fallback) | 3 archivos |
| Auth (no tocar) | autenticacion.service.ts |

---

## 3. Mocks eliminados

### Archivos de datos eliminados

| Archivo | Motivo | Reemplazo |
|---|---|---|
| `mock/catalog.ts` | 0 consumidores | `apiCatalogoService` + `useCatalogos()` |
| `mock/companies.ts` | 0 consumidores | `apiOrganizacionService` + `useOrganizacion()` |
| `mock/master-items.ts` | 0 consumidores | Ninguno (huérfano total) |

### Servicios mock eliminados

| Archivo | Motivo | Reemplazo |
|---|---|---|
| `servicios/mock/notification-service.ts` | AppLayout usa API real | `apiNotificacionService` |
| `servicios/mock/import-service.ts` | No estaba en mode switch | `apiImportacionService` |
| `servicios/mock/matching-service.ts` | No estaba en mode switch | Pendiente (sin API) |
| `servicios/mock/quality-service.ts` | No estaba en mode switch | Pendiente (sin API) |

### Exports muertos eliminados de archivos mock

| Archivo | Export eliminado | Consumidores |
|---|---|---|
| `mock/requests.ts` | `workflowHistory`, `workflowSteps` | 0 |
| `mock/source-items.ts` | `sources`, `sourceItems`, `sourceMaps` | 0 |
| `mock/extras.ts` | `importRunsExtra` | 0 |

### Tipos muertos eliminados

| Tipo | Motivo |
|---|---|
| `CompanyId` | Alias sin uso |
| `UserId` | Alias sin uso |
| `WorkflowTask` | Definido pero nunca importado |
| `ItemAlias` | Definido pero nunca importado |
| `DashboardStats` | Definido 3 veces, interfaces locales lo reemplazan |

### Código muerto eliminado

| Elemento | Motivo |
|---|---|
| `notificationService` de `servicios/index.ts` | Ya no tiene consumidores |
| Import de `NotificationService` de contratos | Ya no necesario |
| Import de `mockNotificationService` | Servicio eliminado |

---

## 4. Mocks que permanecen

### Mocks de datos (3 archivos)

| Archivo | Consumidores | Razón |
|---|---|---|
| `mock/requests.ts` | 5 servicios mock (fallback mode switch) | Fallback para VITE_DATA_MODE=mock |
| `mock/source-items.ts` | `analyzerProposals` → AlmacenClassify, + 2 servicios mock | analyzerProposals no tiene API real |
| `mock/extras.ts` | 3 servicios mock (audit, notification, quality) | Fallback para VITE_DATA_MODE=mock |

### Servicios mock (5 servicios)

| Servicio | Consumido por | Razón |
|---|---|---|
| `mock/request-service.ts` | `servicios/index.ts` mode switch | Fallback |
| `mock/warehouse-service.ts` | `servicios/index.ts` mode switch | Fallback |
| `mock/accounting-service.ts` | `servicios/index.ts` mode switch | Fallback |
| `mock/final-review-service.ts` | `servicios/index.ts` mode switch | Fallback (bug: array vacío) |
| `mock/audit-service.ts` | `servicios/index.ts` mode switch | Fallback |

### Auth mock

| Archivo | Razón |
|---|---|
| `autenticacion.service.ts` | Auth mock in-memory — NO TOCAR en esta fase |

---

## 5. Fallbacks

| Servicio | Mock | API | Modo switch |
|---|---|---|---|
| requestService | mockRequestService | apiRequestService | ✅ |
| warehouseService | mockWarehouseService | apiWarehouseService | ✅ |
| accountingService | mockAccountingService | apiAccountingService | ✅ |
| finalReviewService | mockFinalReviewService | apiFinalReviewService | ✅ |
| auditService | mockAuditService | apiAuditService | ✅ |
| notificationService | (eliminado) | apiNotificacionService | UI directo |
| importService | (eliminado) | apiImportacionService | UI directo |

---

## 6. Hardcode restante

| Ubicación | Tipo | Estado |
|---|---|---|
| `autenticacion.service.ts` | Usuarios/roles/permisos | AUTH mock — NO TOCAR |
| `SessionContext.tsx:12` | DEFAULT_SESSION | Fallback si API falla |
| `AppLayout.tsx:8-18` | Navegación (allNav) | Configuración UI |
| `PanelPage.tsx` | KPIs 0 para master items | Features no implementadas |

---

## 7. Arquitectura final

```
Frontend
  ↓
servicios/api/ (servicios reales)
  ↓
hooks/ (useCatalogos, useOrganizacion)
  ↓
Controller NestJS
  ↓
Service NestJS
  ↓
Prisma
  ↓
SQLite (dev) / PostgreSQL (prod)
```

Modo mock disponible via `VITE_DATA_MODE=mock` como fallback de desarrollo.

---

## 8. Fuente de verdad de datos

| Dominio | Fuente | Estado |
|---|---|---|
| Catálogos | Prisma → API → useCatalogos() | ✅ REAL |
| Empresas | Prisma → API → useOrganizacion() | ✅ REAL |
| Departamentos | Prisma → API → useOrganizacion() | ✅ REAL |
| Usuarios (visualización) | Prisma → API → useOrganizacion() | ✅ REAL |
| Solicitudes | Prisma → API → requestService | ✅ REAL |
| Clasificación | Prisma → API → warehouseService | ✅ REAL |
| Contabilidad | Prisma → API → accountingService | ✅ REAL |
| Revisión Final | Prisma → API → finalReviewService | ✅ REAL |
| Auditoría | Prisma → API → auditService | ✅ REAL |
| Importaciones | Prisma → API → importacionService | ✅ REAL |
| Notificaciones | Prisma → API → notificacionService | ✅ REAL |
| Panel/Dashboard | Prisma → API → panelService | ✅ REAL |
| Auth/Sesión | MOCK in-memory | ⚠️ MOCK |
| Analyzer proposals | MOCK | ⚠️ MOCK (sin API) |

---

## 9. Tests

| Métrica | Valor |
|---|---|
| Tests antes de 5F | 69 |
| Tests después de 5F | 69 |
| Tests eliminados | 0 |
| Tests agregados | 0 |

---

## 10. Typechecks

| Prueba | Estado |
|---|---|
| API typecheck | ✅ PASS |
| WEB typecheck | ✅ PASS |

---

## 11. Health

| Prueba | Estado |
|---|---|
| Health API | ✅ 200 |

---

## 12. Riesgos restantes

| Riesgo | Severidad |
|---|---|
| Auth mock in-memory (race condition) | CRÍTICO — requiere JWT real |
| `analyzerProposals` mock en AlmacenClassify | MEDIO — sin API real |
| `final-review-service.ts` bug (array vacío) | BAJO — solo en modo mock |
| Sin tests de RBAC | MEDIO |
| Sin tests de controllers | MEDIO |

---

## 13. Deuda técnica restante

1. Auth mock → necesita JWT real para producción
2. `analyzerProposals` → necesita endpoint de matching/IA
3. `final-review-service.ts` → bug con array vacío en modo mock
4. Sin tests de integración HTTP
5. Sin tests de frontend
6. `flattenRequestData()` usa `any` type
7. Race conditions en generación de request number y master code

---

## 14. Elementos deliberadamente NO modificados

- Auth/RBAC (mock in-memory intencional)
- Workflow (funcional, no tocar)
- Solicitudes (funcional)
- Almacén (funcional)
- Contabilidad (funcional)
- Revisión Final (funcional)
- Generación de masterCode (funcional)
- Tests existentes (69/69)
- Prisma schema (excepto adds de Fase 5D/5E)

---

FASE 5F FINALIZADA. DETENIDO. Esperando instrucciones.
