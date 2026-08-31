# Architecture Decision Records

## ADR-001 Workflow como fuente de verdad

- **ID:** ADR-001
- **Título:** workflow_instances es la fuente de verdad del estado
- **Contexto:** El sistema necesita gestionar solicitudes que pasan por múltiples pasos de aprobación. El estado actual de una solicitud debe ser consultable rápidamente.
- **Problema:** Si `requests.status` y `workflow_instances.current_step_id` son fuentes independientes, pueden desincronizarse.
- **Decisión:** `workflow_instances.current_step_id` es la fuente de verdad. `requests.status` es una proyección/cache que se sincroniza transaccionalmente.
- **Alternativas consideradas:**
  - Mantener ambas fuentes independientes (rechazado: riesgo de inconsistencia)
  - Eliminar `requests.status` (rechazado: impacto en queries existentes)
- **Justificación:** Garantiza consistencia. Las queries rápidas usan `requests.status` pero la lógica de negocio opera sobre `workflow_instances`.
- **Consecuencias:** Toda transición de workflow debe sincronizar `requests.status` dentro de la misma transacción.
- **Estado:** APROBADO

## ADR-002 Assignment strategy

- **ID:** ADR-002
- **Título:** Estrategias de asignación configurables en workflow_steps
- **Contexto:** Los pasos del workflow necesitan asignarse a diferentes tipos de usuarios según el contexto.
- **Problema:** `required_role_id` solo expresa "usuario con este rol". No puede expresar "gerente del departamento de la solicitud".
- **Decisión:** Agregar `assignment_strategy` y `department_scope` a `workflow_steps`.
- **Alternativas consideradas:**
  - Hardcodear lógica por departamento (rechazado: no escalable)
  - Solo usar roles globales (rechazado: no cubre department head)
- **Justificación:** Permite configurar asignación sin modificar código.
- **Consecuencias:** Requiere lógica de resolución en el motor de workflow.
- **Estado:** APROBADO

## ADR-003 Multiempresa

- **ID:** ADR-003
- **Título:** Roles siempre scoped por empresa
- **Contexto:** Múltiples empresas comparten la misma instancia del sistema.
- **Problema:** Sin `company_id` en `user_roles`, un rol en una empresa implica permisos en todas.
- **Decisión:** `user_roles.company_id` es NOT NULL. Roles siempre están definidos por empresa.
- **Alternativas consideradas:**
  - Roles globales con filtros en aplicación (rechazado: frágil)
  - Multi-tenant con schemas separados (rechazado: complejidad innecesaria)
- **Justificación:** Aislamiento fuerte a nivel de DB. Imposible conceptualmente mezclar permisos.
- **Consecuencias:** Un usuario necesita asignaciones separadas por empresa.
- **Estado:** APROBADO

## ADR-004 Source identity

- **ID:** ADR-004
- **Título:** Identidad del source item = (source_id, source_record_id)
- **Contexto:** Artículos de Profit se importan a staging para procesamiento posterior.
- **Problema:** `source_code` no es único globalmente. No queda claro cuál es la identidad real.
- **Decisión:** La identidad única es `(source_id, source_record_id)`. `source_code` es solo un código legible.
- **Alternativas consideradas:**
  - Usar `source_code` como identidad (rechazado: no es único entre empresas)
  - Usar `id` UUID como única identidad (rechazado: no permite idempotencia)
- **Justificación:** Permite importaciones idempotentes y distinguir artículos de diferentes empresas con el mismo código.
- **Consecuencias:** La lógica de importación debe usar `(source_id, source_record_id)` para buscar duplicados.
- **Estado:** APROBADO

## ADR-005 Master code — Generación original (SUPERSEDED por ADR-019 en Fase 0.1)

- **ID:** ADR-005
- **Título:** Generación de master_code con secuencia global PostgreSQL
- **Contexto:** Cada artículo maestro necesita un código único permanente.
- **Problema:** No existía estrategia definida para generar códigos únicos concurrentes.
- **Decisión (Fase 0):** Formato `M-YYYY-NNNNNN`. Secuencia PostgreSQL global via `nextval()`.
- **Actualización Fase 0.1:** Este ADR queda **SUPERSEDED** por **ADR-019** que define `<GROUP><SUBGROUP><SEQUENCE>` (ej `RVHCAR000001`) derivado de clasificación aprobada. Se conserva por trazabilidad histórica.
- **Alternativas consideradas:**
  - UUID como master code (rechazado: no legible para humanos)
  - Secuencia por año (rechazado: complejidad de concurrencia)
  - ULID (rechazado: más complejo sin beneficio claro)
- **Justificación:** Simple, atómico, seguro ante concurrencia. Gaps aceptados.
- **Consecuencias:** Gaps en la secuencia son normales. Código nunca se reutiliza.
- **Estado:** SUPERSEDED por ADR-019

## ADR-006 Merge

- **ID:** ADR-006
- **Título:** Resolución de cadenas antes de merge
- **Contexto:** Múltiples master items pueden representar el mismo producto y deben fusionarse.
- **Problema:** Si A→B y luego B→C, A queda apuntando a B (MERGED). Cadena inconsistente.
- **Decisión:** Antes de mergear B→C, todos los items que apuntan a B deben pasar a C. Nunca cadenas inconsistentes.
- **Alternativas consideradas:**
  - Permitir cadenas y resolver en queries (rechazado: complejo, propenso a errores)
  - Resolver solo en aplicación (rechazado: sin garantía de DB)
- **Justificación:** Garantiza que `merged_into_id` siempre apunte a un item ACTIVE o NULL.
- **Consecuencias:** Merge es una operación más costosa pero correcta.
- **Estado:** APROBADO

## ADR-007 Split

- **ID:** ADR-007
- **Título:** Split crea un nuevo master item
- **Contexto:** Un source item puede haber sido incorrectamente vinculado a un master item.
- **Problema:** No existía definición formal de split. Podría interpretarse como reversión de merge.
- **Decisión:** Split crea un nuevo master item. No revierte un merge existente.
- **Alternativas consideradas:**
  - Revertir merge (rechazado: pierde historial y trazabilidad)
  - Desactivar mapeo sin crear nuevo master (rechazado: no resuelve el problema)
- **Justificación:** Preserva el historial completo. El merge original se conserva.
- **Consecuencias:** Split requiere crear nuevo master, transferir datos, y documentar la operación.
- **Estado:** APROBADO

## ADR-008 Attribute value integrity

- **ID:** ADR-008
- **Título:** CHECK constraint en valores de atributos
- **Contexto:** Los atributos técnicos almacenan valores en columnas tipadas (`value_text`, `value_numeric`, etc.).
- **Problema:** Podía existir `value_text = "10"` junto a `value_numeric = 20` en el mismo registro.
- **Decisión:** CHECK constraint que garantiza solo una columna de valor NOT NULL según `data_type`.
- **Alternativas consideradas:**
  - Validar solo en aplicación (rechazado: sin garantía de DB)
  - Usar una sola columna JSONB (rechazado: pierde tipado)
- **Justificación:** Integridad a nivel de DB. Previene bugs de aplicación.
- **Consecuencias:** INSERT/UPDATE debe ser correcto. El constraint rechaza datos inválidos.
- **Estado:** APROBADO

## ADR-009 request_data temporal

- **ID:** ADR-009
- **Título:** Mantener request_data hasta validar attribute_definitions
- **Contexto:** Se proponía eliminar `request_data` a favor de `request_attribute_values`.
- **Problema:** `attribute_definitions` es nuevo y no está probado. Puede haber información que no encaje.
- **Decisión:** Mantener `request_data` temporalmente. Migrar en Fase 7+.
- **Alternativas consideradas:**
  - Eliminar ahora (rechazado: riesgo de perder flexibilidad)
  - Nunca eliminar (rechazado: duplicación innecesaria)
- **Justificación:** Permite validar el modelo de atributos antes de comprometerse.
- **Consecuencias:** Doble soporte temporal. Migración requerida en Fase 7+.
- **Estado:** APROBADO

## ADR-010 Matching vs Data Quality

- **ID:** ADR-010
- **Título:** Separación estricta entre Matching y Data Quality
- **Contexto:** El sistema necesita evaluar calidad de datos Y detectar duplicados.
- **Problema:** Si están acoplados, es difícil testing, mantenimiento y evolución.
- **Decisión:** Separación estricta: Normalization → Data Quality → Matching → Human Decision.
- **Alternativas consideradas:**
  - Combinar en un solo pipeline (rechazado: acoplamiento excesivo)
  - Matching primero, DQ después (rechazado: matching con datos incompletos)
- **Justificación:** Responsabilidades claras. Cada componente es testeable independientemente.
- **Consecuencias:** Contratos de entrada/salida formales para cada componente.
- **Estado:** APROBADO

## ADR-011 Polymorphic Data Quality

- **ID:** ADR-011
- **Título:** Data Quality con entity_type/entity_id polimórfico
- **Contexto:** Se necesita evaluar calidad de datos para diferentes tipos de entidades.
- **Problema:** ¿Crear tablas separadas por tipo de entidad o usar relación polimórfica?
- **Decisión:** `data_quality_results` con `entity_type` y `entity_id`.
- **Alternativas consideradas:**
  - Tablas separadas por tipo (rechazado: duplicación, queries complejas)
  - Relaciones fuertes por tipo (rechazado: sin beneficio significativo)
- **Justificación:** Simple, flexible, permite evaluar cualquier entidad sin crear tablas.
- **Consecuencias:** Sin FK enforcement a nivel de DB para `entity_id`. Validar en aplicación.
- **Estado:** APROBADO

## ADR-012 Profit Adapter

- **ID:** ADR-012
- **Título:** Profit siempre detrás de un Adapter
- **Contexto:** Profit Plus 2K8 es el ERP de múltiples empresas.
- **Problema:** Sin abstracción, cambios en Profit rompen la aplicación.
- **Decisión:** Profit siempre se accede a través de un Adapter. READ-ONLY en las primeras fases.
- **Alternativas consideradas:**
  - Conexión directa (rechazado: acoplamiento total)
  - API intermedia (rechazado: más componentes, más puntos de fallo)
- **Justificación:** Aislamiento completo. El Adapter encapsula los detalles de Profit.
- **Consecuencias:** Requiere mantener el Adapter actualizado con el esquema de Profit.
- **Estado:** APROBADO

## ADR-013 Secrets

- **ID:** ADR-013
- **Título:** Secretos nunca en texto plano
- **Contexto:** La integración con Profit requiere credenciales de conexión.
- **Problema:** Almacenar secretos en DB expone credenciales en texto plano.
- **Decisión:** `connection_config` almacena referencias (`password_ref`), no valores. Usar env vars o secret manager.
- **Alternativas consideradas:**
  - Almacenar en DB con encriptación (rechazado: clave maestra en la app)
  - Almacenar en texto plano (rechazado: riesgo de seguridad)
- **Justificación:** Cumplimiento de seguridad. Separación de secretos de datos.
- **Consecuencias:** Requiere infraestructura de secret manager en producción.
- **Estado:** APROBADO

## ADR-014 Audit

- **ID:** ADR-014
- **Título:** Auditoría completa con correlation_id
- **Contexto:** Toda acción relevante debe poder reconstruirse completamente.
- **Problema:** `audit.events` faltaban campos críticos para reconstrucción.
- **Decisión:** Campos completos: `correlation_id`, `request_id`, `actor_ip`, `actor_company_id`.
- **Alternativas consideradas:**
  - Auditoría básica sin correlation (rechazado: imposible agrupar eventos)
  - Auditoría en aplicación solamente (rechazado: sin garantía de DB)
- **Justificación:** Permite reconstruir quién, qué, cuándo, desde dónde, sobre qué.
- **Consecuencias:** Impacto mínimo en performance. Logging completo en cada operación.
- **Estado:** APROBADO

## ADR-015 Versioning

- **ID:** ADR-015
- **Título:** Versionado selectivo, no en cada cambio
- **Contexto:** Se necesita historial de cambios para master items, solicitudes y source items.
- **Problema:** ¿Versionar en cada cambio o solo en cambios significativos?
- **Decisión:** Versionado selectivo. Snapshots en cambios de datos, no en cambios de status menores.
- **Alternativas consideradas:**
  - Versionar cada cambio (rechazado: explosión de datos)
  - No versionar (rechazado: sin historial)
- **Justificación:** Balance entre trazabilidad y almacenamiento.
- **Consecuencias:** Algunos cambios solo se registran en audit, no en versiones.
- **Estado:** APROBADO

## ADR-016 Optimistic Locking

- **ID:** ADR-016
- **Título:** Optimistic locking en tablas críticas
- **Contexto:** Múltiples usuarios pueden modificar los mismos registros simultáneamente.
- **Problema:** Sin locking, dos updates pueden sobreescribirse (lost update).
- **Decisión:** `version INTEGER NOT NULL DEFAULT 1` en 5 tablas críticas.
- **Alternativas consideradas:**
  - Pessimistic locking (SELECT FOR UPDATE) (rechazado: más complejo, deadlocks)
  - Sin locking (rechazado: lost updates)
- **Justificación:** Simple, eficiente, prefiere reintentar sobre bloquear.
- **Consecuencias:** Aplicación debe manejar conflictos de concurrencia.
- **Estado:** APROBADO

## ADR-017 Indexing strategy

- **ID:** ADR-017
- **Título:** ~50 índices nuevos para queries comunes
- **Contexto:** El esquema actual tiene índices insuficientes para queries de producción.
- **Problema:** Full table scans en queries de bandejas, multiempresa, matching, auditoría.
- **Decisión:** ~50 índices nuevos documentados en schema-review.md.
- **Alternativas consideradas:**
  - Agregar índices bajo demanda (rechazado: impacto en producción desde el inicio)
  - Índices mínimos (rechazado: performance insuficiente)
- **Justificación:** Performance desde el inicio. Queries de bandejas son críticas.
- **Consecuencias:** Escritura ligeramente más lenta. Índices se crean en Fase 1.
- **Estado:** APROBADO

## ADR-018 Soft delete

- **ID:** ADR-018
- **Título:** Soft delete con deleted_at en master_items
- **Contexto:** Los master items no deben eliminarse físicamente si fueron utilizados en transacciones.
- **Problema:** ¿Usar status INACTIVE o agregar deleted_at?
- **Decisión:** Ambos. `status = INACTIVE` para desactivación lógica. `deleted_at` para soft delete de mantenimiento.
- **Alternativas consideradas:**
  - Solo status (rechazado: no permite excluir de queries generales)
  - Solo deleted_at (rechazado: pierde semántica de INACTIVE)
- **Justificación:** Flexibilidad. INACTIVE es un estado de negocio. deleted_at es para limpieza.
- **Consecuencias:** Queries generales deben filtrar `WHERE deleted_at IS NULL`.
- **Estado:** APROBADO

## ADR-019 Master Code basado en Grupo + Subgrupo + Correlativo (Fase 0.1)

- **ID:** ADR-019
- **Título:** Master Code = GROUP_CODE + SUBGROUP_CODE + SEQUENCE
- **Contexto:** Profit Plus usa códigos como `RVHCAR0001` (RVH=Grupo, CAR=Subgrupo, 0001=correlativo). El MDM debe conservar el concepto de forma controlada y auditable.
- **Problema:** Formato anterior `M-YYYY-NNNNNN` no reflejaba clasificación; el código debe ser consistente con `group_id/subgroup_id` aprobados y recalcularse si Almacén corrige clasificación.
- **Decisión:** `master_code = <GROUP_CODE><SUBGROUP_CODE><SEQUENCE>` (ej `RVHCAR000001`). Longitud del correlativo centralizada en `system_config.master_code.sequence_length` (no hardcodeada). Fuente de verdad es `master_item.group_id/subgroup_id`; código es derivado. Validación `group+subgroup+correlativo → master_code`, nunca la inversa.
- **Formato:** `RVH`(grupo) + `CAR`(subgrupo) + `000001`(secuencia 6 dígitos configurables) = `RVHCAR000001`
- **Generación:** Secuencia por combinación grupo+subgrupo (`mdm.master_code_sequences(group_id,subgroup_id,last_value)` con `FOR UPDATE`) o secuencia global particionada; garantiza unicidad, concurrencia segura, no reutilización, trazabilidad.
- **Concurrencia:** `SELECT ... FOR UPDATE` por prefijo; gaps aceptados; ver `docs/concurrency.md`.
- **Cambios de clasificación:** Antes de activar: Almacén puede cambiar grupo/subgrupo → código se recalcula con nuevo prefijo + nuevo correlativo; historial en `master_item_versions` + `audit.events`. Después de activar: reclasificación requiere proceso controlado con permisos, versión y auditoría (no implementado aún, solo regla).
- **Trazabilidad:** Todo cambio registra descripción Profit → propuesta analizador → revisión Almacén → clasificación aprobada → código generado → cambios posteriores.
- **Relación con source_code:** `source_code` (ej `RVHCAR0001` de Profit) se conserva como dato de origen y no controla `master_code`. Identidad Source sigue siendo `(source_id, source_record_id)`.
- **Consecuencias:** Requiere constraint futuro `CHECK (master_code LIKE group_code || subgroup_code || '%')` validado en dominio + DB.
- **Estado:** APROBADO — supersede ADR-005

## ADR-020 Clasificación semántica mediante descripción + validación humana (Fase 0.1)

- **ID:** ADR-020
- **Título:** Descripción como fuente semántica, analizador propone, Almacén valida
- **Contexto:** La descripción (`PARACHOQUE DELANTERO FOTON 45 TON`) es la principal fuente para inferir grupo, subgrupo, marca, modelo, aplicación, atributos.
- **Problema:** Tratamiento previo de descripción como texto decorativo perdía información; faltaba regla sobre quién decide clasificación.
- **Decisión:** Pipeline: `Descripción → Analizador (propone grupo/subgrupo/categoría/marca/modelo/aplicación con confidence/evidence) → Almacén valida/corrige → Clasificación aprobada → master_code`. `Data Quality` solo evalúa completitud, no clasifica. `Matching` solo busca equivalentes, no clasifica.
- **Ejemplo:** `{"description":"PARACHOQUE DELANTERO FOTON 45 TON","proposed_classification":{"group":"RVH","subgroup":"CAR","brand":"FOTON","application":"45 TON"},"confidence":94.5,"evidence":["PARACHOQUE→CARROCERIA","FOTON→marca"]}` — decisión final humana vía workflow.
- **UI:** Debe mostrar propuesta con check (`[ RVH ] ✓ Propuesto por analizador`) y recalcular código inmediatamente si cambia grupo/subgrupo (ej `RVHCAR0001 → MECIND0001`).
- **Alternativas:** Clasificación automática sin validación (rechazado: riesgo de error), grupo contable como fuente (rechazado: ver ADR-021).
- **Consecuencias:** Requiere tabla futura `analyzer_proposals` (o campo JSON en request) + auditoría de cambios.
- **Estado:** APROBADO

## ADR-021 Contabilidad desacoplada de la clasificación MDM (Fase 0.1)

- **ID:** ADR-021
- **Título:** Contabilidad no infiere grupo/subgrupo/catálogo; integración desacoplada
- **Contexto:** Tentación de usar grupo contable para inferir grupo MDM.
- **Problema:** Acoplamiento contable→MDM impediría homologación sin contabilidad y crearía dependencias falsas.
- **Decisión:** Contabilidad **no** participa en inferencia de grupo/subgrupo/categoría/marca/modelo. Campos contables son información independiente. `Matching`, `Normalization`, `Analyzer`, `Data Quality`, `Classification` no usan datos contables. Flujo de homologación se completa sin intervención contable. Integración contable futura consume Master Data ya homologado de forma desacoplada.
- **Alternativas:** Mapeo automático grupo MDM ↔ grupo contable (rechazado: crear dependencia prematura).
- **Consecuencias:** Módulo contable separado; no bloquear solicitudes por falta de datos contables.
- **Estado:** APROBADO

## ADR-022 Password Policy (Fase 0.1)

- **ID:** ADR-022
- **Título:** Política de contraseñas — 8 caracteres, 2 números, 1 especial, hash seguro
- **Contexto:** Seguridad de usuarios del MDM.
- **Problema:** Ausencia de política formal documentada.
- **Decisión:** Mínimo 8 caracteres, al menos 2 números, al menos 1 carácter especial. Hash seguro (argon2id/bcrypt) en application layer; validación en capa de aplicación; DB nunca recibe contraseña en claro.
- **Alternativas:** 6 caracteres solo alfanumérico (rechazado: débil), almacenar hash simple sin salt (rechazado).
- **Consecuencias:** Requiere validador en `auth` module + tests; no confundir con lógica de clasificación/contabilidad.
- **Estado:** APROBADO
