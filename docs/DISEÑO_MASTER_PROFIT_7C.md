# Diseño Master → Aprobación Final → Profit — Fase 7C

> Fase exclusivamente de investigación y diseño. No implementa código, Prisma, workflow ni Profit.

## 1. Resumen ejecutivo

Data-Maestra ya resuelve `DRAFT → APPROVED` vía gerencia → almacén (clasificación + masterCode) → contabilidad → revisión final. Falta cerrar el ciclo: una **Validación Maestra** que compruebe que el expediente está completo, una **Aprobación Final humana** que sea la última, y la **integración técnica con Profit** (`AD_DIST.dbo.art`) en modo `READ` luego `WRITE` controlado.

Este diseño propone reutilizar el rol existente `FINAL_REVIEWER` como responsable de Validación Maestra (≈ `PENDING_MASTER`) y de Aprobación Final (≈ `FINAL_APPROVED`), sin crear nuevo rol, y dejar `PROFIT_PROCESSING / PROFIT_INSERTED / PROFIT_ERROR` como estados técnicos de integración, sin re-aprobación humana después de `FINAL_APPROVED`.

Profit permanece **READ-ONLY** hasta fase explícita; la escritura requerirá `ProfitAdapter` aislado, idempotencia por `request.id` y auditoría completa.

## 2. Objetivo funcional

Solicitud → validación por área responsable → checklist maestro → aprobación final humana → registro técnico en Profit → trazabilidad. La aprobación final es la última decisión humana; Profit es solo propagación técnica idempotente con reintento.

## 3. Workflow actual (código)

**Fuente:** `apps/api/src/modulos/solicitudes/solicitud.service.ts:479` `getNextStatus` + `approve:184` + `classify:320` + `AlmacenService:57`, `ContabilidadService:77`, `RevisionFinalService:77`.

```
DRAFT --submit--> PENDING_MANAGER --APPROVE--> PENDING_WAREHOUSE --classify--> WAREHOUSE_APPROVED --APPROVE--> PENDING_ACCOUNTING --APPROVE--> PENDING_FINAL_REVIEW --APPROVE--> APPROVED
                                  |                       |                          |                              |
                                  +--RETURN--> DRAFT      +--RETURN--> PENDING_MANAGER +--RETURN--> PENDING_WAREHOUSE +--RETURN--> PENDING_ACCOUNTING
                                  +--REJECT--> REJECTED   +--REJECT--> REJECTED        +--REJECT--> REJECTED           +--REJECT--> REJECTED
```

Estados persistidos en `Request.status` (String) y `WorkflowInstance.currentStepCode` + `WorkflowTask[PENDING/COMPLETED]` con `@@unique([instanceId,stepCode])`. Fase 7B corrigió `APPROVE` a `find-or-reactivate` para evitar duplicado tras `RETURN` (ya aplicado a `RETURN` y `APPROVE`).

Divergencia vs `AGENTS.md:84` que lista `MANAGER_APPROVED, ACCOUNTING_APPROVED, MASTER_ACTIVE`: no existen en código; el código colapsa intermedios en `PENDING_*` y usa `WAREHOUSE_APPROVED` como único intermedio real.

## 4. Workflow objetivo

```
DRAFT → PENDING_MANAGER → PENDING_WAREHOUSE → WAREHOUSE_APPROVED → PENDING_ACCOUNTING → PENDING_MASTER → FINAL_APPROVED → PROFIT_PROCESSING → PROFIT_INSERTED
                                                                                                                ↘ PROFIT_ERROR (reintento)
```

`PENDING_MASTER` = Validación Maestra (reutiliza `FINAL_REVIEWER` sin nuevo rol). `FINAL_APPROVED` = última acción humana. `PROFIT_*` = estados técnicos sin rol humano, con transición automática.

`REJECTED` terminal desde cualquier `PENDING_*` (contabilidad hoy usa `RETURN` no `REJECT`). `RETURN` desde `PENDING_MASTER` debe devolver a `PENDING_WAREHOUSE` o `PENDING_ACCOUNTING` según requisito faltante.

## 5. Responsabilidades por etapa

| Etapa | Responsable | Escribe | Lee |
|-------|-------------|---------|-----|
| DRAFT | REQUESTER | descripción, propósito, imagen | catálogos |
| PENDING_MANAGER | DEPARTMENT_MANAGER | approve/return/reject | solicitud completa |
| PENDING_WAREHOUSE/WAREHOUSE_APPROVED | WAREHOUSE | `RequestData` grupo/subgrupo/categoría/marca/unidad/fabricante/modelo/partNumber/application + `masterCode` | analyzer proposal |
| PENDING_ACCOUNTING | ACCOUNTING | `RequestAccountingCode[]` | clasificación + masterCode |
| PENDING_MASTER | FINAL_REVIEWER (Master) | **solo valida**, no edita | todo + checklist |
| FINAL_APPROVED | FINAL_REVIEWER | aprueba definitivo | checklist completo |
| PROFIT_* | sistema (ProfitAdapter) | `dbo.art` | expediente aprobado |

## 6. Responsabilidad de Master

VALIDACIÓN MAESTRA, no edición. Comprueba existencia/completitud/consistencia de: empresa, área, solicitante, descripción, clasificación Almacén, código maestro, marca/unidad, información contable, imagen, auditoría y datos obligatorios de `dbo.art`. Si falta/inconsecuente, devuelve al área dueña; no corrige él.

## 7. Concepto de Validación Maestra

Pantalla de solo-lectura con checklist computable (ver §8) y dos acciones: **Devolver a Almacén / Devolver a Contabilidad** (con comentario obligatorio) y **Aprobar definitivamente** (solo habilitado si checklist 100% ✔). Sin formulario de edición.

## 8. Checklist propuesto

| # | Requisito | Origen | Criterio ✔ |
|---|-----------|--------|------------|
| 1 | Empresa | Request.companyId | existe y activa |
| 2 | Departamento | Request.departmentId | existe |
| 3 | Descripción | requestedDescription | ≥10 chars |
| 4 | Propósito | purpose | no vacío |
| 5 | Imagen | referencePhotoUri | opcional pero visible; si falta → ⚠ |
| 6 | Grupo | RequestData.groupId | no null |
| 7 | Subgrupo | RequestData.subgroupId | no null |
| 8 | Marca | RequestData.brandId | opcional según categoría |
| 9 | Unidad | RequestData.unitId | no null |
|10 | Código maestro | RequestData.masterCode | formato `CODE-00001` y grupo/subgrupo presentes |
|11 | Código contable | RequestAccountingCode[] | ≥1 registro |
|12 | Solicitante | Request.requesterId | existe |
|13 | Aprobaciones previas | Approval[] | gerente, almacén, contabilidad OK |
|14 | Datos Profit mapeables | Matriz §16 | obligatorios de `dbo.art` presentes |

Visual: `✓ COMPLETO` verde, `❌ FALTANTE` rojo, `⚠ REVISAR` ámbar. Header `Faltan N requisitos` o `Todos los requisitos están completos`.

## 9. Responsables de cada requisito

Grupo/Subgrupo/Categoría/Marca/Unidad/Fabricante/Modelo/PartNumber/Application/MasterCode → **Almacén**. Código contable / cuentas → **Contabilidad**. Descripción/Propósito/Imagen → **Solicitante**. La devolución de Master debe etiquetar responsable para que elRouter envíe notificación a ese rol.

## 10. Comportamiento de devolución

`Master → Almacén` reabre `PENDING_WAREHOUSE` (reactiva `WorkflowTask`), preserva clasificación previa para edición. `Master → Contabilidad` reabre `PENDING_ACCOUNTING`. El solicitante no recibe devolución directa de Master (solo si el error fue de descripción). Tras corrección, vuelve automáticamente a `PENDING_MASTER` sin pasar por gerencia.

## 11. Aprobación final

Gate: `faltantes === 0`. Botón `Aprobar definitivamente` solo habilitado entonces. Ejecuta `Approval {action: APPROVE, actorId: FINAL_REVIEWER}` → `FINAL_APPROVED` y registra `AuditEvent`. Después, un job `ProfitAdapter` toma `FINAL_APPROVED` y pasa a `PROFIT_PROCESSING`.

## 12. Estados visibles en español

| Interno | Visible |
|---------|---------|
| DRAFT | Borrador |
| PENDING_MANAGER | En Gerencia |
| PENDING_WAREHOUSE | En Almacén |
| WAREHOUSE_APPROVED | Clasificado |
| PENDING_ACCOUNTING | En Contabilidad |
| PENDING_MASTER | Validación Maestra |
| FINAL_APPROVED | Aprobado — Envío a Profit |
| PROFIT_PROCESSING | Registrando en Profit |
| PROFIT_INSERTED | Registrado en Profit |
| PROFIT_ERROR | Error Profit — Reintentar |
| REJECTED | Rechazado |
| RETURNED | Devuelto |

No renombrar enums en esta fase.

## 13. Indicador de progreso

Reemplazar Timeline actual (`WorkflowTimeline.tsx: stepOrder [DRAFT, Gerente, Almacén, Contabilidad, Aprobado, Master]`) por:

`✓ Solicitud → ✓ Gerencia → ✓ Almacén → ✓ Contabilidad → ● Validación Maestra → ○ Aprobación Final → ○ Profit`

Progreso `5/7` + porcentaje. Renombrar visual “Master” → “Validación Maestra” como exige fase. Mantener `WorkflowTimeline` como componente pero extender `stepOrder` con los nuevos internos.

## 14. Análisis de Profit

Servidor `SRVBDPROFITBK` / base `AD_DIST` no accesible en laboratorio actual (sin credenciales activas en `.env`). `.env.example` reserva `PROFIT_DB_HOST/PORT/DATABASE/USER/PASSWORD_REF` comentados. No se conectó. `AGENTS.md:2` exige `READ-ONLY` y `ProfitAdapter`. `catalogo_limpio.csv` (38 grupos / 179 subgrupos) ya importa vía `CatalogImportService` con `sourceSystem=PROFIT` — única integración real hoy.

Para 7D se debe habilitar `SELECT` sobre `AD_DIST` y documentar `connection string`.

## 15. dbo.art

No inspeccionado directamente por falta de conexión. Por `schema.sql` diseño y skills, se espera:

- `co_art` PK alfanumérico, `art_des` descripción, `co_lin` (grupo), `co_subl` (subgrupo), `co_color`, `co_cat`, `co_marca`, `co_unidad`, `stock`, `precio`, `cuenta contable`, `activo`.

**No determinado:** tipos exactos, NULL, defaults, FK, triggers. Debe investigarse en 7D con:

```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='art' AND TABLE_SCHEMA='dbo';
EXEC sp_help 'dbo.art'; SELECT * FROM sys.triggers WHERE parent_id=OBJECT_ID('dbo.art');
```

## 16. Tablas relacionadas

Probables (por naming Profit Plus 2K8): `dbo.lin_art` (líneas), `dbo.sub_lin`, `dbo.colores`, `dbo.marcas`, `dbo.unidad`, `dbo.art_emp` (existencia por empresa), `dbo.art_cuent`, `dbo.tab_aux`. Sin conexión no confirmado. `db/schema.sql` ya prevé `profit_staging.source_items`, `master_item_source_map`, `item_aliases` que no existen en Prisma — faltan por implementar.

## 17. Triggers

Desconocido. Asumir existentes para auditoría/inventario. Debe listar `sys.triggers` y evaluar si `INSERT dbo.art` dispara validaciones que pueden rechazar la operación → tratar como `PROFIT_ERROR`.

## 18. Código Profit co_art

No determinado. En `catalog-import` `co_art` no aparece; catálogos usan `co_lin`/`co_subl`. Hipótesis: `co_art` manual o consecutivo por empresa, único global. Requiere revisar `IDENTITY`, secuencias o procedimiento `sp_genera_co_art`. Mapear a `MasterItem.masterCode` vs `RequestData.masterCode` actual (`RVHCAU-00001`); decidir si `MasterCode` es `co_art` o alias interno.

## 19. Matriz Data-Maestra vs Profit

| Dato DM | Etapa | Tabla DM | Campo Profit (hipótesis) | Obligatorio Profit | Falta |
|---------|-------|----------|--------------------------|--------------------|-------|
| empresa | solicitud | Request.companyId | co_empresa / ad_dist | Sí | mapeo empresa Profit |
| descripción | solicitante | requestedDescription | art_des | Sí | — |
| grupo | almacén | RequestData.groupId → CatalogGroup.code | co_lin | Sí | validación catálogo |
| subgrupo | almacén | subgroupId | co_subl | Sí | validación |
| marca | almacén | brandId | co_marca | No | tabla marcas |
| unidad | almacén | unitId | co_unidad | Sí | equivalencia UOM |
| código maestro | almacén | masterCode | co_art | Sí | generación única |
| código contable | contabilidad | RequestAccountingCode.code | co_cuenta | Sí | plan cuentas |
| imagen | solicitante | referencePhotoUri | — | No | adjunto Profit? |
| estado | workflow | status | art_status? | — | — |

Sin `dbo.art` real, tabla incompleta — marcar “No determinado” donde falte evidencia.

## 20. Registro maestro final conceptual

```
Expediente FINAL_APPROVED
├── Solicitud {requestNumber, description, purpose, priority, imagen}
├── Origen {company, department, requester}
├── Clasificación Almacén {grupo, subgrupo, categoría, marca, unidad, fabricante, modelo, partNumber, application, masterCode}
├── Contabilidad {accountingCodes[]}
├── Validación {checklist, validador, fecha}
├── Auditoría {approvals[], workflowHistory[], auditEvents[]}
└── Integración {profitStatus, intentos, error}
```

Debe estar congelado (no editable) tras `FINAL_APPROVED`.

## 21. Integración propuesta

```
React → POST /requests/:id/approve (FINAL_REVIEW) → FINAL_APPROVED → outbox table profit_outbox {requestId, payload, status=PENDING}
Worker ProfitAdapter (READ replica) → SELECT dbo.art WHERE co_art=? (idempotencia) → si no existe INSERT dbo.art (solo tras fase escritura habilitada) → UPDATE outbox PROFIT_INSERTED / PROFIT_ERROR
```

Hoy solo existe `catalog-import.service.ts` como ejemplo de idempotencia; reutilizar patrón.

## 22. Estados de integración

`FINAL_APPROVED` (humano) → `PROFIT_PROCESSING` (job tomó registro) → `PROFIT_INSERTED` (COMMIT OK) / `PROFIT_ERROR` (time-out, FK, duplicado). `PROFIT_ERROR` permite `Reintentar` manual por `MASTER_DATA_ADMIN` y reintento automático con backoff.

## 23. Idempotencia

Clave natural: `request.id` (UUID DM) → campo `art_integracion_id` o tabla de correlación `master_item_source_map(requestId, co_art)`. Antes de `INSERT`, `SELECT EXISTS (SELECT 1 FROM dbo.art WHERE co_art = @masterCode OR ext_id = @requestId)`. Registrar en `profit_outbox` con `attempts, lastError, nextRetryAt`.

## 24. Manejo de errores

| Error | Estado | Acción |
|-------|--------|--------|
| SQL timeout / no responde | PROFIT_ERROR | reintento 3× backoff |
| FK inválida (grupo/subgrupo) | PROFIT_ERROR | devolver a Almacén |
| duplicado co_art | PROFIT_ERROR | marcar PROFIT_INSERTED si ya existe con mismo requestId |
| campo obligatorio null | PROFIT_ERROR | devolver a responsable |
| trigger rechaza | PROFIT_ERROR | log + auditoría |

## 25. Auditoría

Registrar: `Approval` gerente/almacén/contabilidad/master/final, `WorkflowHistory` cada transición (incluido RETURN con comment), `AuditEvent` `action=MASTER_VALIDATED / MASTER_RETURNED / FINAL_APPROVED / PROFIT_STARTED / PROFIT_SUCCESS / PROFIT_FAILED`. Conservar `diff` y `actorId`.

## 26. Imagen de referencia

Hoy: `multer` en `archivos.controller.ts` → `apps/api/uploads/requests/<uuid>.webp` (10MB, webp 1600px) → `Request.referencePhotoUri` → `GET /uploads/requests/<file>` vía Vite proxy + `ImageLightbox`. Visible en `RequestDetail` y `AlmacenClassify`. Propuesta: mantener misma ruta, mostrar thumbnail 250px en Contabilidad y Validación Maestra con lightbox, no adjuntar binario a Profit (guardar URL/referencia).

## 27. Riesgos

- Conectar a `SRVBDPROFITBK` sin credencial rompe `READ-ONLY`.
- `dbo.art` insuficiente sin tablas satélite → INSERT incompleto.
- Generación `masterCode` con race (ver §4 `generateMasterCode` sin lock).
- Workflow configurable prometido en `AGENTS.md:99` hoy es hard-coded `getNextStatus`.
- Escribir en Profit sin fase explícita viola §2.
- `PROFIT_PROCESSING` sin `PROFIT_ERROR` deja solicitudes colgadas.

## 28. Información faltante

- Esquema real `dbo.art` y tablas dependientes (sin conexión).
- Reglas `co_art` (manual vs consecutivo).
- Equipos/mapeo `Company → empresa Profit` (co_empresa).
- Plan de cuentas contable vs `RequestAccountingCode`.
- Política de reintento y ventana de mantenimiento Profit.

## 29. Recomendación de implementación por fases

**7D — Esquema & lectura:** Habilitar `SELECT` AD_DIST, documentar `dbo.art`, crear `ProfitAdapter` read-only, exponer checklist Master solo lectura.

**7E — Escritura controlada:** Añadir `PROFIT_*` estados, outbox, INSERT idempotente detrás de flag `PROFIT_WRITE_ENABLED`, test con `dryRun`.

**7F — Cierre:** Reemplazar visual “Master” por “Validación Maestra”, indicador 7 pasos, auditoría completa, borrar `mock` de Master.

