# Mapa del Proyecto — Data-Maestra

"Si quiero cambiar X, ¿dónde voy?"

---

## Módulos de negocio

| Necesito modificar... | Frontend | Backend |
|----------------------|----------|---------|
| Solicitudes | `apps/web/src/modulos/solicitudes/` | `apps/api/src/modulos/solicitudes/` |
| Almacén (clasificación) | `apps/web/src/modulos/almacen/` | `apps/api/src/modulos/almacen/` |
| Contabilidad | `apps/web/src/modulos/contabilidad/` | `apps/api/src/modulos/contabilidad/` |
| Revisión final | `apps/web/src/modulos/revision-final/` | `apps/api/src/modulos/revision-final/` |
| Aprobaciones gerente | `apps/web/src/modulos/aprobaciones/` | (usa solicitudes) |
| Panel/dashboard | `apps/web/src/modulos/panel/` | `apps/api/src/modulos/panel/` |
| Importaciones | `apps/web/src/modulos/importaciones/` | `apps/api/src/modulos/importaciones/` |
| Auditoría | `apps/web/src/modulos/auditoria/` | `apps/api/src/modulos/auditoria/` |
| Administración | `apps/web/src/modulos/administracion/` | `apps/api/src/modulos/organizacion/` |
| Catálogos | `apps/web/src/hooks/useCatalogos.ts` | `apps/api/src/modulos/catalogos/` |
| Organización | `apps/web/src/hooks/useOrganizacion.ts` | `apps/api/src/modulos/organizacion/` |
| Notificaciones | `apps/web/src/componentes/diseno/AppLayout.tsx` | `apps/api/src/modulos/notificaciones/` |
| Auth/RBAC | `apps/web/src/contextos/SessionContext.tsx` | `apps/api/src/modulos/autenticacion/` |

---

## Archivos específicos

| Necesito modificar... | Archivo |
|----------------------|---------|
| Workflow (transiciones) | `apps/api/src/modulos/solicitudes/solicitud.service.ts` → `getNextStatus()` |
| MasterCode (generación) | `apps/api/src/modulos/solicitudes/solicitud.service.ts` → `generateMasterCode()` |
| Roles/permisos | `apps/api/src/modulos/autenticacion/autenticacion.service.ts` → `ROLE_PERMISSIONS` |
| Usuarios mock | `apps/api/src/modulos/autenticacion/autenticacion.service.ts` → `USERS` |
| Prisma schema | `apps/api/prisma/schema.prisma` |
| Seed de datos | `apps/api/prisma/seed.js` |
| Router frontend | `apps/web/src/app/App.tsx` |
| Navegación | `apps/web/src/componentes/diseno/AppLayout.tsx` → `allNav` |
| Estilos globales | `apps/web/src/app/globals.css` |
| Tipos TypeScript | `apps/web/src/tipos/index.ts` |
| Contratos servicios | `apps/web/src/contratos/index.ts` |
| Switch mock/api | `apps/web/src/servicios/index.ts` |
| Proxy API | `apps/web/vite.config.ts` |
| Config API | `apps/api/.env` |
| Config Web | `apps/web/.env` |

---

## Servicios frontend

| Servicio | API real | Mock |
|----------|----------|------|
| requestService | `servicios/api/api-request-service.ts` | `servicios/mock/request-service.ts` |
| warehouseService | `servicios/api/api-warehouse-service.ts` | `servicios/mock/warehouse-service.ts` |
| accountingService | `servicios/api/api-accounting-service.ts` | `servicios/mock/accounting-service.ts` |
| finalReviewService | `servicios/api/api-final-review-service.ts` | `servicios/mock/final-review-service.ts` |
| auditService | `servicios/api/api-audit-service.ts` | `servicios/mock/audit-service.ts` |
| apiCatalogoService | `servicios/api/api-catalogo-service.ts` | (sin mock) |
| apiOrganizacionService | `servicios/api/api-organizacion-service.ts` | (sin mock) |
| apiNotificacionService | `servicios/api/api-notificacion-service.ts` | (sin mock) |
| apiPanelService | `servicios/api/api-panel-service.ts` | (sin mock) |
| apiImportacionService | `servicios/api/api-importacion-service.ts` | (sin mock) |

---

## Tests

| Tipo | Ubicación | Comando |
|------|-----------|---------|
| Tests API | `apps/api/test/*.spec.ts` | `cd apps/api && npx vitest run` |
| Tests Web | (ninguno aún) | `cd apps/web && npx vitest run --passWithNoTests` |

---

## Búsqueda rápida

1. ¿Es frontend? → `apps/web/src/modulos/{modulo}/`
2. ¿Es backend? → `apps/api/src/modulos/{modulo}/`
3. ¿Es consulta a DB? → `*.service.ts`
4. ¿Es endpoint? → `*.controller.ts`
5. ¿Es tipo? → `apps/web/src/tipos/index.ts`
6. ¿Es servicio frontend? → `apps/web/src/servicios/api/`
7. ¿Es componente? → `apps/web/src/componentes/ui/`
8. ¿Es test? → `apps/api/test/`
