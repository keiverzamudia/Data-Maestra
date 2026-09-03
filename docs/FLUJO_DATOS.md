# Flujo de Datos — Data-Maestra

---

## Flujo Frontend → Backend → DB

```
1. Usuario interactúa con la UI
   (apps/web/src/modulos/{modulo}/{Nombre}.tsx)

2. Componente llama al servicio
   (apps/web/src/servicios/api/api-{nombre}-service.ts)

3. Servicio hace fetch a la API
   (apps/web/src/servicios/api/api-client.ts)

4. HTTP request llega al controller
   (apps/api/src/modulos/{modulo}/*.controller.ts)

5. Guard RBAC verifica permisos
   (apps/api/src/modulos/autenticacion/rbac.guard.ts)

6. Controller delega al service
   (apps/api/src/modulos/{modulo}/*.service.ts)

7. Service ejecuta lógica de negocio
   - Valida estados
   - Aplica reglas
   - Genera códigos

8. Service consulta/modifica DB via Prisma
   (apps/api/src/comun/prisma/prisma.service.ts)

9. Prisma ejecuta SQL en SQLite

10. Respuesta sube por la cadena:
    DB → Prisma → Service → Controller → HTTP → Servicio → Componente → UI
```

---

## Flujo del Workflow

### Flujo principal (happy path)

```
Solicitante crea solicitud
    ↓ BORRADOR
Solicitante envía (submit)
    ↓ PENDIENTE_GERENTE
Gerente aprueba
    ↓ PENDIENTE_ALMACEN
Almacén clasifica (classify)
    ↓ ALMACEN_APROBADO
Almacén aprueba (approve)
    ↓ PENDIENTE_CONTABILIDAD
Contabilidad aprueba con códigos
    ↓ PENDIENTE_VALIDACION_MAESTRA
Revisión final aprueba
    ↓ APROBADO_FINAL
```

### Retorno (devolución)

```
Gerente devuelve → BORRADOR
Almacén devuelve → PENDIENTE_GERENTE
Contabilidad devuelve → PENDIENTE_ALMACEN
Revisión final devuelve → PENDIENTE_CONTABILIDAD
```

### Rechazo

```
Cualquier aprobador rechaza → RECHAZADO (terminal)
```

---

## Qué ocurre en cada transición

Cuando se ejecuta una transición (APPROVE, RETURN, REJECT):

1. **request.status** se actualiza al nuevo estado
2. **workflowTask** actual se cierra (status: COMPLETED, completedAt: now)
3. **workflowTask** del paso destino se crea o reactiva (status: PENDING)
4. **workflowInstance.currentStepCode** se actualiza
5. **workflowHistory** registra: fromStep, toStep, action, actorId, comment
6. **approval** registra: stepCode, action, fromStatus, toStatus, comment
7. **auditEvent** registra: action, beforeData, afterData

Para RETURN específicamente:
- Si ya existe una workflowTask para el paso destino, se reactiva (no se crea duplicada)
- Si no existe, se crea nueva

---

## Flujo de Clasificación

```
1. Almacén selecciona grupo + subgrupo

2. Frontend envía:
   POST /api/v1/almacen/:id/classify
   { groupId, subgroupId, categoryId, brandId, unitId, ... }

3. Backend guarda en request_data
   y genera masterCode (groupCode + subgroupCode + secuencia)

4. Almacén aprueba:
   POST /api/v1/almacen/:id/approve

5. Backend avanza a PENDIENTE_CONTABILIDAD

6. Contabilidad ve los datos en:
   GET /api/v1/contabilidad/pending
```

---

## Fuente de datos por pantalla

| Pantalla | Datos principales | Fuente |
|----------|-------------------|--------|
| Dashboard | KPIs, actividad | apiPanelService + hardcodeados |
| Solicitudes | Lista solicitudes | apiRequestService (mode switch) |
| Crear solicitud | Formulario | apiRequestService |
| Detalle solicitud | Datos + timeline | apiRequestService |
| Aprobaciones | Pendientes gerente | apiRequestService |
| Almacén | Pendientes clasificación | apiWarehouseService |
| Clasificar | Catálogos + solicitud | apiCatalogoService + apiWarehouseService |
| Contabilidad | Pendientes revisión | apiAccountingService |
| Revisión final | Pendientes aprobación | apiFinalReviewService |
| Importaciones | Runs de importación | apiImportacionService |
| Auditoría | Eventos | apiAuditService |
| Administración | Usuarios/roles/empresas | apiOrganizacionService |
| Notificaciones | Contador no leídas | apiNotificacionService |

---

## Mocks restantes

| Mock | Consumido por | API equivalente |
|------|---------------|-----------------|
| mock/requests.ts | servicios/mock/*.ts | /api/v1/solicitudes |
| mock/source-items.ts | AlmacenClassify (analyzerProposals) | (sin API) |
| mock/extras.ts | servicios/mock/audit-service.ts | (sin API) |
| servicios/mock/*.ts | servicios/index.ts (modo mock) | Varios |
