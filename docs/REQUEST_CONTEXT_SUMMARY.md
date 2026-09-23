# Request Context Summary — Contadores contextuales

Fuente única de contadores para **Dashboard**, **menú lateral** y la sección **Trabajo pendiente**.

## Endpoint

```
GET /api/v1/requests/context-summary
```

- **Auth:** JWT (cookie `dm_session`). Sin `RequirePermission`: cualquier sesión autenticada recibe solo su alcance.
- **Identidad:** el backend usa `@CurrentUser()` (`user.id`). El frontend **nunca** envía `userId`, `companyId`, `departmentId` ni `role` para decidir qué contar.
- **Fuente de datos:** SQLite / Prisma local del workflow de Data-Maestra. **No consulta Profit ni `TEmpresas`.**

## Respuesta

```ts
interface RequestContextSummary {
  work: {
    total: number;                     // colas accionables únicas (suma sin doble conteo)
    approvals: number;                 // PENDIENTE_GERENTE en alcance gerencial
    warehouse: number;                 // PENDIENTE_ALMACEN con permiso de almacén
    warehouseApproval: number;         // ALMACEN_APROBADO con permiso de encargado
    accounting: number;                // accountingApproval + accountingProfitRegistration
    accountingApproval: number;        // PENDIENTE_CONTABILIDAD
    accountingProfitRegistration: number; // CONTABILIDAD_APROBADA | PROCESANDO_PROFIT | ERROR_PROFIT
    managementApproval: number;        // alias de approvals (cola de gerencia)
  };
  dashboard: {
    pending: number;      // Trabajo pendiente (= work.total)
    inApproval: number;   // etapas humanas de aprobación en el alcance
    completed: number;    // INSERTADO_PROFIT en el historial del usuario
    returned: number;     // DEVUELTO + RECHAZADO en el historial del usuario
  };
}
```

## 1. Qué significa cada contador

| Contador | Estado(s) | Significado |
|---|---|---|
| `work.approvals` / `managementApproval` | `PENDIENTE_GERENTE` | Misma cola que la pestaña `/approvals` (alcance del visor). |
| `work.warehouse` | `PENDIENTE_ALMACEN` | Cola de clasificación de Almacén. |
| `work.warehouseApproval` | `ALMACEN_APROBADO` | Cola del Encargado de Almacén. |
| `work.accountingApproval` | `PENDIENTE_CONTABILIDAD` | Pendientes de aprobación contable. |
| `work.accountingProfitRegistration` | `CONTABILIDAD_APROBADA`, `PROCESANDO_PROFIT`, `ERROR_PROFIT` | Pendientes de Registro Profit (26R). **Separado** de la aprobación. |
| `work.accounting` | suma de los dos anteriores | Total accionable del módulo Contabilidad. |
| `work.total` | — | Suma de las colas; los estados son disjuntos → sin doble conteo. |
| `dashboard.pending` | = `work.total` | Tarjeta **Trabajo pendiente** (antes "Pendientes de atención"). |
| `dashboard.inApproval` | `PENDIENTE_GERENTE`, `PENDIENTE_ALMACEN`, `ALMACEN_APROBADO`, `PENDIENTE_CONTABILIDAD` | En flujo de aprobación **dentro del alcance** del usuario. |
| `dashboard.completed` | `INSERTADO_PROFIT` | Finalización **exitosa** (no mezcla CONTABILIDAD_APROBADA). |
| `dashboard.returned` | `DEVUELTO`, `RECHAZADO` | Estados no exitosos (devolución o rechazo). |

## 2. Cómo se determina el alcance

Reutiliza `SolicitudesService.getViewer()` + `buildScopeWhere()` (mismas reglas de visibilidad 13A):

1. **Permisos efectivos** por empresa (`UserRole → Role → RolePermission` + overrides, DENEGADO > CONCEDIDO > HEREDADO).
2. **Membresías** (`companyId` activos del usuario).
3. **Departamentos dirigidos** (`Department.managerId = userId`) para la cola de gerencia.
4. **Admin** (`ADMIN.MANAGE`): universo global **solo si además tiene el permiso de la cola** en al menos una empresa.

Reglas por cola:

- **Almacén / Aprobación Almacén / Contabilidad:** solo se cuentan en empresas donde el usuario tiene el permiso VIEW/APPROVE correspondiente. Sin ese permiso en ninguna empresa → `0` (aunque sea admin).
- **Aprobaciones (gerencia):** `activas ∩ PENDIENTE_GERENTE` — idéntico a `findScoped({ status: 'PENDIENTE_GERENTE' })`.
- Sin permisos de bandeja → todos los contadores de `work` en `0` y los módulos no aparecen en el menú (frontend filtra por permisos).

## 3. Cómo se evita contar dos veces

- Cada solicitud tiene **un solo** `status`.
- Las colas de `work` usan estados **disjuntos**.
- `work.total = approvals + warehouse + warehouseApproval + accounting` (verificado en tests).
- `dashboard.completed` / `returned` usan `groupBy(status)` sobre el WHERE de historial: cada fila cuenta una sola vez.

## 4. Actualización por SSE

- El SSE existente de notificaciones (`/api/v1/notificaciones/stream`) emite al recibir una transición.
- `useNotifications` despacha `window.dispatchEvent(new CustomEvent('dm:counters-refresh'))`.
- `useRequestContextSummary` escucha ese evento y recarga **una** request del summary.
- Sin polling agresivo; sin segundo sistema de realtime.

## 5. Consumidores frontend

| Consumidor | Archivo |
|---|---|
| Cliente API | `apps/web/src/servicios/api/api-request-summary-service.ts` |
| Hook | `apps/web/src/hooks/useRequestContextSummary.ts` |
| Badge menú | `apps/web/src/componentes/diseno/MenuBadge.tsx` |
| Menú | `apps/web/src/componentes/diseno/AppLayout.tsx` |
| Dashboard | `apps/web/src/modulos/panel/PanelPage.tsx` |
| Tipos | `apps/web/src/tipos/index.ts` → `RequestContextSummary` |

Estados de `MenuBadge`: `loading → …`, `error → —`, `0 → 0` neutro, `N > 0 → N` con énfasis.

## 6. Permisos que intervienen en visibilidad de módulos (frontend)

| Módulo / badge | Permiso de entrada (nav) |
|---|---|
| Aprobaciones | `MANAGER.APPROVE` |
| Almacén | `WAREHOUSE.VIEW` |
| Aprobación Almacén | `WAREHOUSE_MANAGER.VIEW` |
| Contabilidad | `ACCOUNTING.VIEW` |
| Dashboard | `DASHBOARD.VIEW` |

Los badges **no** aparecen para módulos sin permiso (regla de `visibleNav`).

## 7. Rendimiento

- **1 request** de summary por sesión/contexto (menú + Dashboard comparten el hook con dedupe en vuelo).
- Dashboard: 1 summary + 1 activity (antes: stats + activity + N requests por bandeja del trabajo pendiente).
- Backend: conteos con `Promise.all` + un `groupBy` sobre historial. Índices existentes de `requests.status`, `companyId`, `requesterId`.
- **0** llamadas a Profit / `TEmpresas` / `CorporateCompaniesService.listCompanies()`.

## 8. Notas de diseño

- **"Pendientes de atención"** → renombrada a **"Trabajo pendiente"** (métrica contextual, no global).
- **Contabilidad** mantiene la separación 26R: aprobación vs Registro Profit. El badge del menú muestra el **total accionable**; el detalle en Dashboard/página separa ambas colas cuando se expone.
- **"Mis solicitudes"** no lleva badge (histórico personal, no trabajo pendiente).
- La entrada de menú del ZIP **"Aprobaciones de gerencia"** corresponde en el sistema actual a **"Aprobaciones"** (`/approvals`); no se inventó una segunda entrada.
