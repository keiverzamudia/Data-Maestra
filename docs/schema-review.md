# Schema Review — Fase 0

## 1. Objetivo

Esta revisión busca validar la consistencia, integridad, aislamiento multiempresa, workflow, master data, source data, matching, auditoría y concurrencia del diseño antes de modificar `db/schema.sql`.

La revisión cubre 19 categorías de análisis y establece decisiones arquitectónicas que deben reflejarse en el esquema de base de datos.

## 2. Problemas encontrados

### 2.1 Workflow como fuente de verdad

- **Problema original:** `requests.status` y `workflow_instances.current_step_code` eran independientes. Podían desincronizarse sin detección.
- **Riesgo:** Estados inconsistentes entre la solicitud y el workflow real. El usuario ve un estado que no refleja la realidad.
- **Decisión:** `workflow_instances.current_step_id` es la fuente de verdad. `requests.status` es una proyección/cache.
- **Solución propuesta:** Sincronización transaccional. Toda transición de workflow actualiza `workflow_instances`, y solo después se actualiza `requests.status` dentro de la misma transacción.
- **Impacto en schema:** `workflow_instances` requiere `current_step_id` como FK a `workflow_steps`. `requests.status` se mantiene como VARCHAR para queries rápidas pero se sincroniza desde el workflow.
- **Impacto en aplicación:** Toda lógica de transición debe operar sobre `workflow_instances`, nunca directamente sobre `requests.status`.
- **Estado:** DECIDIDO

### 2.2 Aprobaciones por departamento

- **Problema original:** `workflow_steps.required_role_id` no expresaba "gerente del departamento de la solicitud".
- **Riesgo:** No se podía configurar un paso que dependiera del departamento que originó la solicitud.
- **Decisión:** Agregar `assignment_strategy` y `department_scope` a `workflow_steps`.
- **Solución propuesta:** Cuatro estrategias de asignación: `FIXED_ROLE`, `DEPARTMENT_HEAD`, `DEPARTMENT_ROLE`, `QUEUE`. Tres ámbitos de departamento: `REQUEST_DEPARTMENT`, `FIXED`, `ALL`.
- **Impacto en schema:** Nuevas columnas en `workflow_steps`.
- **Impacto en aplicación:** Lógica de resolución de asignación en el motor de workflow.
- **Estado:** DECIDIDO

### 2.3 Multiempresa

- **Problema original:** `user_roles` no tenía `company_id`. Un rol en una empresa implicaba permisos en todas.
- **Riesgo:** Violación de segregación de funciones. Datos de una empresa expuestos a otra.
- **Decisión:** `user_roles.company_id` es NOT NULL. Roles siempre están Scoped por empresa.
- **Solución propuesta:** Reemplazar la tabla `user_roles` existente con una que incluya `company_id`. Agregar `actor_company_id` a `audit.events`.
- **Impacto en schema:** Modificación de `user_roles`, nuevas columnas en `audit.events`.
- **Impacto en aplicación:** Toda query de permisos debe filtrar por `company_id`.
- **Estado:** DECIDIDO

### 2.4 Identidad de source_item

- **Problema original:** `source_code` no era único globalmente. No quedaba claro cuál era la identidad real.
- **Riesgo:** Importaciones duplicadas, confusión entre artículos de diferentes empresas.
- **Decisión:** La identidad es `(source_id, source_record_id)`. `source_code` es solo un código legible, no identificador.
- **Solución propuesta:** `UNIQUE(source_id, source_record_id)` como constraint. `source_record_id` almacena el ID original en Profit.
- **Impacto en schema:** Rename de `source_item_id` a `source_record_id` en `source_items`. Constraint UNIQUE.
- **Impacto en aplicación:** La lógica de importación debe usar `(source_id, source_record_id)` para buscar duplicados.
- **Estado:** DECIDIDO

### 2.5 Generación de master_code (Actualizado Fase 0.1 — GROUP+SUBGROUP+correlativo)

- **Problema original:** No existía estrategia definida para generar códigos maestros únicos.
- **Actualización Fase 0.1:** Formato cambia de `M-YYYY-NNNNNN` a `<GROUP><SUBGROUP><SEQUENCE>` (ej `RVHCAR000001` = `RVH`(Repuestos vehículos) + `CAR`(Carrocería) + `000001`). Longitud del correlativo centralizada en configuración, no hardcodeada. Ver `docs/master-data-model.md` § Master Code y ADR-019.
- **Riesgo:** Códigos duplicados, inconsistencia entre concurrentes, código inconsistente con clasificación si Almacén corrige grupo/subgrupo.
- **Decisión:** `master_code` derivado de `master_item.group_id/subgroup_id` aprobados. Secuencia **por prefijo grupo+subgrupo** con `SELECT ... FOR UPDATE`.
- **Solución propuesta:** Tabla `mdm.master_code_sequences(group_id, subgroup_id, last_value)` o secuencias particionadas; `CHECK (master_code LIKE group_code || subgroup_code || '%')` validado en dominio + DB; recálculo automático si Almacén cambia grupo/subgrupo antes de activar.
- **Impacto en schema:** Secuencia por prefijo + constraint de consistencia + `system_config` para longitud; `master_code` se genera tras `CLASSIFICATION_APPROVED`, no al crear.
- **Impacto en aplicación:** Generación tras validación de Almacén; si cambia clasificación, recalcular código y versionar.
- **Estado:** ACTUALIZADO Fase 0.1

### 2.6 Merge

- **Problema original:** No existía prevención de cadenas de merge. Las referencias no se resolvían correctamente.
- **Riesgo:** Cadenas A→B→C sin resolver. Master items huérfanos. Source maps rotos.
- **Decisión:** Antes de mergear B→C, todos los items que apuntan a B deben pasar a C. Nunca cadenas inconsistentes.
- **Solución propuesta:** Resolución de referencias antes del merge. `merge_history` y `merge_transfers` documentan cada paso.
- **Impacto en schema:** Nuevas tablas `merge_history`, `merge_transfers`. CHECK constraint en `master_items.merged_into_id`.
- **Impacto en aplicación:** Lógica de merge con resolución de dependencias.
- **Estado:** DECIDIDO

### 2.7 Split

- **Problema original:** No existía definición formal de split.
- **Riesgo:** Operaciones de separación inconsistentes. Pérdida de datos.
- **Decisión:** Split crea un nuevo master item. No revierte un merge existente.
- **Solución propuesta:** `split_history` y `split_transfers` documentan la operación. Source maps se reasignan al nuevo master.
- **Impacto en schema:** Nuevas tablas `split_history`, `split_transfers`.
- **Impacto en aplicación:** Lógica de split con transferencia de datos.
- **Estado:** DECIDIDO

### 2.8 Consistencia de atributos

- **Problema original:** `master_item_attribute_values` permitía valores en múltiples columnas simultáneamente.
- **Riesgo:** Datos inconsistentes. `value_text = "10"` junto a `value_numeric = 20`.
- **Decisión:** CHECK constraint que garantiza solo una columna de valor NOT NULL según `data_type`.
- **Solución propuesta:** Constraint CHECK en la tabla de valores de atributos.
- **Impacto en schema:** CHECK constraint en `master_item_attribute_values` y `request_attribute_values`.
- **Impacto en aplicación:** Validación de tipo antes de INSERT/UPDATE.
- **Estado:** DECIDIDO

### 2.9 request_data

- **Problema original:** Se proponía eliminar `request_data` a favor de `request_attribute_values`.
- **Riesgo:** `attribute_definitions` es nuevo y no está probado. Puede haber información que no encaje.
- **Decisión:** Mantener `request_data` temporalmente. Validar `attribute_definitions` primero.
- **Solución propuesta:** Migrar a `request_attribute_values` en Fase 7+ cuando el modelo esté validado.
- **Impacto en schema:** `request_data` se mantiene en Fase 0-6.
- **Impacto en aplicación:** Doble soporte temporal hasta la migración.
- **Estado:** DECIDIDO (postergado)

### 2.10 Matching

- **Problema original:** Matching estaba acoplado a normalización y data quality.
- **Riesgo:** Responsabilidades mezcladas. Dificultad para testing y mantenimiento.
- **Decisión:** Separación estricta: Normalization → Data Quality → Matching → Human Decision.
- **Solución propuesta:** Contratos de entrada/salida documentados para cada componente.
- **Impacto en schema:** Tablas separadas para configuración de matching, decisiones humanas.
- **Impacto en aplicación:** Pipelines separados con interfaces claras.
- **Estado:** DECIDIDO

### 2.11 Data Quality

- **Problema original:** No existía capa explícita de evaluación de calidad.
- **Riesgo:** Datos incompletos o incorrectos llegan al matching sin detección.
- **Decisión:** Capa de Data Quality entre Normalization y Matching. Evaluación por entidad.
- **Solución propuesta:** `data_quality_rules`, `data_quality_results`, `data_quality_issues` con `entity_type`/`entity_id`.
- **Impacto en schema:** 3 nuevas tablas.
- **Impacto en aplicación:** Pipeline de evaluación post-normalización.
- **Estado:** DECIDIDO

### 2.12 Integración Profit

- **Problema original:** No existía separación clara entre Profit y el MDM.
- **Riesgo:** Acoplamiento con esquema legacy. Cambios en Profit rompiendo la aplicación.
- **Decisión:** Profit siempre detrás de un Adapter. Nunca asumir nombres de tablas/campos.
- **Solución propuesta:** Arquitectura Profit → Adapter → Staging → Normalization → Matching → Master.
- **Impacto en schema:** `profit_staging.sources` con `source_system` y `connection_config`.
- **Impacto en aplicación:** Adapter como capa de abstracción completa.
- **Estado:** DECIDIDO

### 2.13 Credenciales

- **Problema original:** `connection_config` podía contener secretos en texto plano.
- **Riesgo:** Exposición de credenciales en base de datos.
- **Decisión:** Secretos nunca en texto plano. Usar environment variables o secret manager.
- **Solución propuesta:** Campo `password_ref` que referencia env var o vault path.
- **Impacto en schema:** `connection_config` almacena referencias, no valores.
- **Impacto en aplicación:** Resolución de secretos en tiempo de ejecución.
- **Estado:** DECIDIDO

### 2.14 Auditoría

- **Problema original:** `audit.events` faltaban campos críticos para reconstrucción completa.
- **Riesgo:** No se podía responder: quién, qué, cuándo, desde dónde, sobre qué.
- **Decisión:** Campos completos: `correlation_id`, `request_id`, `actor_ip`, `actor_company_id`.
- **Solución propuesta:** Enriquecer `audit.events` con todos los campos necesarios.
- **Impacto en schema:** 4 nuevas columnas en `audit.events`.
- **Impacto en aplicación:** Logging completo en cada operación relevante.
- **Estado:** DECIDIDO

### 2.15 Versionado

- **Problema original:** No existía claridad sobre qué generaba snapshot vs solo audit.
- **Riesgo:** Histórico incompleto. Imposibilidad de reconstruir estados pasados.
- **Decisión:** Versionado selectivo. Snapshots en cambios de datos, no en cambios de status menores.
- **Solución propuesta:** `master_item_versions`, `request_versions`, `source_item_versions` con reglas claras.
- **Impacto en schema:** 3 tablas de versionado.
- **Impacto en aplicación:** Lógica de versionado en cada operación de escritura.
- **Estado:** DECIDIDO

### 2.16 Concurrencia

- **Problema original:** No existía optimistic locking en tablas críticas.
- **Riesgo:** Lost updates bajo concurrencia. Pérdida de datos.
- **Decisión:** `version INTEGER NOT NULL DEFAULT 1` en 5 tablas críticas.
- **Solución propuesta:** UPDATE con WHERE version = @expected. Reintentar si affected_rows = 0.
- **Impacto en schema:** Columna `version` en `master_items`, `requests`, `match_candidates`, `workflow_instances`, `workflow_tasks`.
- **Impacto en aplicación:** Validación de versión en cada UPDATE.
- **Estado:** DECIDIDO

### 2.17 Índices

- **Problema original:** 18+ índices faltantes para queries comunes.
- **Riesgo:** Full table scans. Performance degradada con datos reales.
- **Decisión:** ~50 índices nuevos cubriendo queries de bandejas, multiempresa, matching, auditoría.
- **Solución propuesta:** Índices documentados en esta revisión. Crear en Fase 1.
- **Impacto en schema:** ~50 CREATE INDEX.
- **Impacto en aplicación:** Queries más rápidas. Escritura ligeramente más lenta.
- **Estado:** DECIDIDO (pendiente de implementar)

### 2.18 Constraints

- **Problema original:** Faltaban constraints de integridad en múltiples tablas.
- **Riesgo:** Datos inválidos. Relaciones rotas. Estados inconsistentes.
- **Decisión:** ~20 constraints nuevos: CHECK, UNIQUE, NOT NULL.
- **Solución propuesta:** Constraints documentados en esta revisión. Crear en Fase 1.
- **Impacto en schema:** ~20 constraints.
- **Impacto en aplicación:** Rechazo de datos inválidos a nivel de DB.
- **Estado:** DECIDIDO (pendiente de implementar)

### 2.19 Resultado y cambios de schema

- **Problema original:** El esquema actual tenía múltiples deficiencias estructurales.
- **Riesgo:** Sistema inestable, datos inconsistentes, imposibilidad de extender.
- **Decisión:** Reescritura completa de `db/schema.sql` incorporando todas las correcciones.
- **Solución propuesta:** Nuevo esquema con ~55 tablas, 12 enums, ~50 índices, ~20 constraints.
- **Impacto en schema:** Reescritura completa.
- **Impacto en aplicación:** Migración completa. Requiere Fase 1.
- **Estado:** DECIDIDO (pendiente de implementar)

## 3. Decisiones finales

| # | Decisión | Justificación |
|---|----------|---------------|
| 1 | `workflow_instances.current_step_id` es fuente de verdad | Consistencia garantizada |
| 2 | `requests.status` es proyección | Queries rápidas sin romper integridad |
| 3 | `workflow_steps.assignment_strategy` | Flexibilidad sin hardcodear |
| 4 | `user_roles.company_id` NOT NULL | Aislamiento multiempresa |
| 5 | Source identity = `(source_id, source_record_id)` | Identidad real en Profit |
| 6 | Master code = GROUP+SUBGROUP+correlativo (ej RVHCAR000001), secuencia por prefijo, recálculo si Almacén cambia grupo | Derivado de clasificación aprobada, no reutilizable |
| 7 | Merge resuelve cadenas antes de ejecutar | Prevención de inconsistencias |
| 8 | Split crea nuevo master, no revierte merge | Trazabilidad completa |
| 9 | CHECK en attribute_values | Integridad de tipos |
| 10 | Mantener request_data temporalmente | Validar attribute_definitions primero |
| 11 | Matching separado de Data Quality | Responsabilidades claras |
| 12 | entity_type/entity_id para Data Quality | Suficiente y flexible |
| 13 | Profit siempre externo via Adapter | Arquitectura limpia |
| 14 | Secretos via env/vault, nunca en DB | Seguridad |
| 15 | Audit completo con correlation_id | Reconstrucción total |
| 16 | Versionado selectivo | No en cada cambio menor |
| 17 | Optimistic locking en 5 tablas | Prevenir lost updates |
| 18 | ~50 índices + ~20 constraints | Performance e integridad |

## 4. Cambios previstos en schema.sql

### 4.1 Nuevas tablas (30)

| # | Tabla | Propósito |
|---|-------|-----------|
| 1 | `mdm.manufacturers` | Lookup normalizado de fabricantes |
| 2 | `mdm.manufacturer_aliases` | Aliases de fabricantes |
| 3 | `mdm.brand_aliases` | Aliases de marcas |
| 4 | `mdm.models` | Modelos normalizados por marca |
| 5 | `mdm.model_aliases` | Aliases de modelos |
| 6 | `mdm.attribute_definitions` | Catálogo de definiciones de atributos |
| 7 | `mdm.category_attribute_links` | Atributos requeridos por categoría |
| 8 | `mdm.master_item_attribute_values` | Valores de atributos del master |
| 9 | `mdm.request_attribute_values` | Valores de atributos de solicitud |
| 10 | `mdm.data_quality_rules` | Reglas de calidad de datos |
| 11 | `mdm.data_quality_results` | Resultados de evaluación |
| 12 | `mdm.data_quality_issues` | Problemas encontrados |
| 13 | `mdm.matching_configs` | Configuración de matching |
| 14 | `mdm.matching_field_weights` | Pesos por campo |
| 15 | `mdm.matching_thresholds` | Umbrales de decisión |
| 16 | `mdm.match_decision_reasons` | Razones configurables |
| 17 | `mdm.match_decisions` | Decisiones humanas sobre candidatos |
| 18 | `mdm.workflow_definitions` | Definición de workflows |
| 19 | `mdm.workflow_versions` | Versiones de workflows |
| 20 | `mdm.workflow_steps` | Pasos del workflow |
| 21 | `mdm.workflow_transitions` | Transiciones permitidas |
| 22 | `mdm.workflow_tasks` | Tareas pendientes |
| 23 | `mdm.workflow_history` | Historial de transiciones |
| 24 | `mdm.merge_history` | Registro de fusiones |
| 25 | `mdm.merge_transfers` | Detalle de transferencias post-merge |
| 26 | `mdm.split_history` | Registro de separaciones |
| 27 | `mdm.split_transfers` | Detalle de transferencias post-split |
| 28 | `mdm.master_item_versions` | Versionado de master items |
| 29 | `mdm.request_versions` | Versionado de solicitudes |
| 30 | `profit_staging.source_item_versions` | Historial de cambios en source items |

### 4.2 Tablas modificadas (14)

| Tabla | Cambios |
|-------|---------|
| `mdm.master_items` | +manufacturer_id FK, +model_id FK, +model_text, +version, +data_quality_score, +merge_reason, +created_by_company_id FK, +deleted_at |
| `mdm.requests` | +version |
| `mdm.user_roles` | +id PK, +company_id NOT NULL FK, +granted_by, +granted_at, +expires_at, +active |
| `mdm.departments` | company_id NOT NULL, +manager_id FK, +description, +created_at, +updated_at |
| `mdm.brands` | +manufacturer_id FK, +created_at, +updated_at |
| `mdm.workflow_instances` | +workflow_id FK, ~current_step_code→current_step_id FK, +version, +completed_at, +deadline_at |
| `mdm.approvals` | ~step_code→step_id FK, +correlation_id |
| `mdm.match_candidates` | +config_id FK, +matched_fields, +different_fields, +algorithm_version, +version, +created_at, +updated_at |
| `mdm.master_item_source_map` | +created_at, +updated_at, +company_id FK |
| `mdm.item_aliases` | +company_id FK, UNIQUE(master_item_id, normalized_alias) |
| `profit_staging.sources` | +source_system, +connection_config, +updated_at |
| `profit_staging.import_runs` | +triggered_by FK, +rows_unchanged, +rows_skipped, +execution_config, status→import_run_status ENUM |
| `profit_staging.source_items` | import_run_id NOT NULL, +content_hash, +last_changed_at, +import_count, +updated_at, rename source_item_id→source_record_id |
| `audit.events` | +correlation_id, +request_id FK, +actor_ip, +actor_company_id FK |

### 4.3 Enums nuevos (4)

| Enum | Valores |
|------|---------|
| `mdm.import_run_status` | CREATED, RUNNING, COMPLETED, COMPLETED_WITH_ERRORS, FAILED, CANCELLED |
| `mdm.relation_type` | EQUIVALENT, SIMILAR, SUPERSEDED, COMPONENT_OF, ACCESSORY_OF |
| `mdm.match_decision_action` | ACCEPTED, REJECTED, DEFERRED |
| `mdm.data_quality_severity` | ERROR, WARNING, INFO |

### 4.4 Enum eliminado (1)

| Enum | Razón |
|------|-------|
| `mdm.request_status` | Reemplazado por `workflow_steps.code` |

**NOTA:** NO eliminar físicamente `request_status` todavía hasta verificar que ningún código, query, endpoint, frontend, test o migración dependa de él. Mantener como referencia hasta la migración completa.

### 4.5 Tabla eliminada (1)

| Tabla | Razón |
|-------|-------|
| `mdm.request_data` | Reemplazada por `requests` + `request_attribute_values` (migración en Fase 7+) |

**NOTA:** NO eliminar físicamente `request_data` en esta fase. Se mantiene hasta validar `attribute_definitions`.

## 5. Índices

Ver documentación completa en `docs/concurrency.md` sección de índices.

Resumen: ~50 índices nuevos cubriendo queries de bandejas de trabajo, multiempresa, matching, auditoría, versionado y atributos.

## 6. Constraints

Ver documentación completa en esta misma sección (revisión 2.18).

Resumen: ~20 constraints nuevos incluyendo CHECK, UNIQUE, NOT NULL.

## 7. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Complejidad del workflow configurable | Media | Alto | Empezar simple, extender gradualmente |
| Performance con muchas versiones | Media | Medio | Particionar tablas de versiones si es necesario |
| Migración de request_data | Alta | Medio | Validar attribute_definitions primero |
| Concurrencia en master_code | Baja | Alto | PostgreSQL sequence es atómica |
| Cadenas de merge no detectadas | Media | Alto | Validación en application layer |

## 8. Decisiones pendientes

| # | Pregunta | Estado |
|---|----------|--------|
| 1 | ¿request_data se elimina en Fase 0 o se posterga? | **POSTERGAR** — Validar attribute_definitions primero |
| 2 | ¿workflow_versions se crea siempre o solo en cambios? | **Solo en cambios** — Primera versión implícita |
| 3 | ¿data_quality_score se cachea o calcula en tiempo real? | **Cacheado** — Calcular al importar/modificar |
| 4 | ¿Notificaciones in-app o email? | **In-app primero** — Email en fase posterior |
| 5 | ¿Retención de audit? | **Configurable** — Implementar retention_days |
| 6 | ¿Soft delete en master_items? | **SÍ** — deleted_at para queries limpias |

## 9. Reglas que NO deben violarse

Estas reglas son invariantes arquitectónicas. Cualquier implementación que las viole debe ser rechazada.

1. **workflow_instances es la fuente de verdad del estado.** Nunca actualizar `requests.status` independientemente de `workflow_instances.current_step_id`.

2. **requests.status es una proyección.** Se actualiza SOLO como resultado de una transición de workflow exitosa, dentro de la misma transacción.

3. **Source item se identifica por (source_id, source_record_id).** `source_code` NO es identificador. No asumir unicidad de `source_code` globalmente.

4. **Roles pertenecen a una empresa mediante user_roles.** Un usuario con rol WAREHOUSE en Empresa A NO tiene permisos en Empresa B. `user_roles.company_id` es NOT NULL.

5. **Profit nunca es modificado directamente.** Todas las operaciones pasan por el Profit Adapter. Profit es READ-ONLY en las primeras fases.

6. **Merge nunca debe producir cadenas inconsistentes.** Si A→B y B→C, entonces A debe apuntar directamente a C. Verificar antes de cada merge.

7. **Split nunca revierte un merge.** Split crea un nuevo master item. El merge original se conserva en el historial.

8. **Secretos nunca se almacenan en texto plano.** `connection_config` almacena referencias (`password_ref`), no valores. Usar environment variables o secret manager.

9. **Operaciones críticas deben ser transaccionales.** Merge, split, transiciones de workflow, y aprobaciones deben ejecutarse dentro de una transacción con rollback.

10. **Tablas críticas utilizan optimistic locking.** `master_items`, `requests`, `match_candidates`, `workflow_instances`, `workflow_tasks` tienen columna `version`. Validar en cada UPDATE.

11. **Master code nunca se reutiliza; es derivado de grupo+subgrupo.** `master_code = <GROUP><SUBGROUP><SEQUENCE>`; secuencia por prefijo; gaps aceptados; recálculo obligatorio si cambia clasificación antes de activar; nunca `grupo=ABC código=RVHCAR...`.

13. **Descripción es fuente semántica; Analizador solo propone, Almacén valida.** `Data Quality` y `Matching` no deciden clasificación.

14. **Contabilidad no clasifica.** No inferir grupo/subgrupo desde datos contables.

15. **Password policy:** 8 caracteres, ≥2 números, ≥1 especial, hash seguro, nunca en claro.

16. **Todo cambio de clasificación/código queda en versions + audit.events** (quién/cuándo/por qué).

12. **Atributos respetan data_type.** Solo una columna de valor puede ser NOT NULL según `attribute_definitions.data_type`.

### Fase 0.1 — Adenda

- Nuevo pipeline: `Profit → Source → Normalización → Analizador (propone) → Data Quality (evalúa) → Clasificación propuesta → Almacén valida → Código generado (GROUP+SUBGROUP+correlativo) → Matching → Master`
- Reclasificación: antes de activar (recálculo directo), después de activar (proceso controlado con versión/auditoría)
- Impactos previstos en `schema.sql`: `mdm.master_code_sequences`, `analyzer_proposals` (o JSON en request), constraint `CHECK master_code LIKE group_code||subgroup_code||'%'`, `system_config.master_code_sequence_length`, validación de consistencia en dominio; **no modificar schema.sql en esta fase** (ver §4).

## Cross-document consistency check (Fase 0.1)

| Área | Documento | Estado |
|------|-----------|--------|
| Workflow source of truth | workflow-design.md | OK |
| Multiempresa | architecture.md | OK |
| Master identity (GROUP+SUBGROUP+correlativo, derivado) | master-data-model.md | OK — Fase 0.1 |
| Source identity | source-data-model.md | OK |
| Analizador vs Matching vs Data Quality | architecture.md / source-data-model.md | OK — Fase 0.1 |
| Contabilidad desacoplada | architecture.md / master-data-model.md | OK — Fase 0.1 |
| Merge/Split | merge-split.md | OK |
| Concurrency (secuencia por prefijo) | concurrency.md | OK — Fase 0.1 |
| State machines (ANALYZING/RECLASSIFICATION/CODE_RECALCULATION) | state-machines.md | OK — Fase 0.1 |
| ADRs (019/020/021/022) | decisions.md | OK — Fase 0.1 |
| Password policy | decisions.md / master-data-model.md | OK — Fase 0.1 |
