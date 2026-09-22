# Mantenimiento — Borrado de datos de prueba

Botón **Administración → Mantenimiento** (solo `ADMIN.MANAGE`) que limpia los
datos operativos de prueba en la SQLite local, para repetir el flujo sin
"basura". **Profit nunca se toca** (no hay INSERT/UPDATE/DELETE contra Profit).

## Qué borra (en orden seguro por FKs)

1. `workflow_history` — Historial de workflow
2. `workflow_task` — Tareas de workflow
3. `approval` — Aprobaciones
4. `request_article_decision` — Decisiones del analizador
5. `request_article_link` — Vínculos solicitud–Profit
6. `request_accounting_code` — Códigos contables
7. `notification` — Notificaciones
8. `request_data` — Datos de solicitud
9. `workflow_instance` — Instancias de workflow
10. `request` — Solicitudes
11. `audit_event` — Auditoría

Tras el borrado se registra `TEST_DATA_RESET_EXECUTED` (queda como primer
evento de auditoría, con conteos por tabla).

## Qué conserva

- **Sistema:** empresas, departamentos, usuarios, roles, permisos y sesiones
  (se puede seguir iniciando sesión).
- **Profit:** catálogos (`CatalogGroup/Subgroup/Category`, `Brand`,
  `UnitOfMeasure`, visibilidad, `ProfitCompanyConfig`), universo histórico de
  matching, master items e importaciones.

## Candados (deny-by-default)

1. `ALLOW_TEST_RESET=true` en `.env.local` (sin él → 403).
2. Nunca en `NODE_ENV=production`.
3. Confirmación escrita exacta `BORRAR TODO` (validada en backend).
4. RBAC `ADMIN.MANAGE` en ambos endpoints.
5. Sin el flag, la sección muestra "no disponible" y no ofrece el botón.

## Endpoints

- `GET /api/v1/maintenance/reset-preview` → `{ tables: [{table,label,count}], total }`.
- `POST /api/v1/maintenance/reset-test-data` `{ confirm: "BORRAR TODO" }` →
  `{ deleted, total, executedAt, actorId }`.

## Notas

- Operación local e irreversible sobre la SQLite de desarrollo.
- No hay contador de `requestNumber` que reiniciar (se genera por UUID).
- Los archivos en `apps/api/uploads/` referenciados por solicitudes borradas
  quedan huérfanos (no se eliminan automáticamente).
