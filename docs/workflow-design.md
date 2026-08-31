# Workflow Configurable

## Fuente de verdad

```
workflow_instances.current_step_id
        ↓
workflow_steps.code (ej: 'PENDING_MANAGER')
        ↓
requests.status (PROYECCIÓN, nunca fuente de verdad)
```

### Regla fundamental

`requests.status` se actualiza SOLO como resultado de una transición de workflow exitosa, dentro de la misma transacción. Nunca se actualiza independientemente.

### Garantía de consistencia

Si `workflow_instances.current_step_id` apunta a un `workflow_steps.code = 'PENDING_WAREHOUSE'`, entonces `requests.status` DEBE ser `'PENDING_WAREHOUSE'` después de COMMIT.

Si existe inconsistencia, indica un bug en la lógica de transición.

## Tablas del workflow

### workflow_definitions

```sql
CREATE TABLE mdm.workflow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Define qué workflows existen en el sistema. Ejemplo: `WORKFLOW_NUEVO_ARTICULO`.

### workflow_versions

```sql
CREATE TABLE mdm.workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES mdm.workflow_definitions(id),
  version INTEGER NOT NULL,
  definition JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES mdm.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, version)
);
```

Histórico de definiciones. Cada cambio en la estructura del workflow crea una nueva versión. La primera versión es implícita.

### workflow_steps

```sql
CREATE TABLE mdm.workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES mdm.workflow_definitions(id),
  code VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  step_order INTEGER NOT NULL,
  
  -- Asignación
  assignment_strategy VARCHAR(50) NOT NULL,
  required_role_id UUID REFERENCES mdm.roles(id),
  required_permission VARCHAR(120),
  
  -- Ámbito
  department_scope VARCHAR(50) NOT NULL DEFAULT 'REQUEST_DEPARTMENT',
  
  -- SLA
  sla_hours INTEGER,
  
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, code),
  UNIQUE (workflow_id, step_order)
);
```

Define los pasos de cada workflow. El `code` es el valor que se proyecta en `requests.status`.

### workflow_transitions

```sql
CREATE TABLE mdm.workflow_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES mdm.workflow_definitions(id),
  from_step_id UUID NOT NULL REFERENCES mdm.workflow_steps(id),
  action VARCHAR(50) NOT NULL,
  to_step_id UUID REFERENCES mdm.workflow_steps(id),
  requires_comment BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, from_step_id, action)
);
```

Define qué transiciones son válidas desde cada paso. `to_step_id = NULL` indica transición terminal.

### workflow_instances

```sql
CREATE TABLE mdm.workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES mdm.requests(id),
  workflow_id UUID NOT NULL REFERENCES mdm.workflow_definitions(id),
  current_step_id UUID NOT NULL REFERENCES mdm.workflow_steps(id),
  version INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  UNIQUE (request_id)
);
```

Una instancia activa por solicitud. `current_step_id` es la fuente de verdad del estado actual.

### workflow_tasks

```sql
CREATE TABLE mdm.workflow_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES mdm.workflow_instances(id),
  step_id UUID NOT NULL REFERENCES mdm.workflow_steps(id),
  assigned_to UUID REFERENCES mdm.users(id),
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  due_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instance_id, step_id)
);
```

Tareas pendientes por paso. Un paso puede tener múltiples tareas (ej: cola de almacén).

### workflow_history

```sql
CREATE TABLE mdm.workflow_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES mdm.workflow_instances(id),
  task_id UUID REFERENCES mdm.workflow_tasks(id),
  from_step_id UUID REFERENCES mdm.workflow_steps(id),
  to_step_id UUID REFERENCES mdm.workflow_steps(id),
  action VARCHAR(50) NOT NULL,
  actor_id UUID NOT NULL REFERENCES mdm.users(id),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Historial completo de transiciones. Cada acción registra: de dónde, a dónde, quién, cuándo, comentario.

## Assignment strategies

### FIXED_ROLE

```yaml
assignment_strategy: FIXED_ROLE
required_role_id: UUID del rol
department_scope: ALL
```

Asigna a cualquier usuario con el rol especificado. Ejemplo: `FINAL_REVIEWER`.

### DEPARTMENT_HEAD

```yaml
assignment_strategy: DEPARTMENT_HEAD
department_scope: REQUEST_DEPARTMENT
```

Asigna al gerente del departamento que originó la solicitud. Ver sección "Department head" para detalles.

### DEPARTMENT_ROLE

```yaml
assignment_strategy: DEPARTMENT_ROLE
required_role_id: UUID del rol
department_scope: REQUEST_DEPARTMENT
```

Asigna a un usuario con el rol especificado DENTRO del departamento de la solicitud. Ejemplo: cualquier usuario con rol `WAREHOUSE` en el departamento de la solicitud.

### QUEUE

```yaml
assignment_strategy: QUEUE
required_role_id: UUID del rol
department_scope: FIXED
```

Crea una tarea en cola. Cualquier usuario con el rol y ámbito correcto puede reclamarla. Ejemplo: cola de almacén.

## Department scope

### REQUEST_DEPARTMENT

El departamento se toma de `requests.department_id`. Es el departamento que originó la solicitud.

### FIXED

El departamento se define en la configuración del paso. No depende de la solicitud.

### ALL

No hay restricción de departamento. Cualquier departamento puede participar.

## Department head

### Cómo se determina

```sql
-- Conceptual (NO implementar aún):
SELECT u.id
FROM mdm.users u
JOIN mdm.user_roles ur ON ur.user_id = u.id
JOIN mdm.roles r ON r.id = ur.role_id
WHERE r.code = 'DEPARTMENT_MANAGER'
AND ur.company_id = @request_company_id
AND ur.active = true
AND u.active = true
-- Verificar que el departamento del manager coincida
-- con requests.department_id
LIMIT 1;
```

### Casos especiales

| Situación | Comportamiento |
|-----------|----------------|
| No existe manager | Error controlado. La transición no se ejecuta. Se registra en audit. |
| Múltiples managers | Tomar el primero activo. Registrar advertencia en audit. |
| Manager inactivo | Excluir de la búsqueda. Si no queda ninguno, error controlado. |
| Manager sin el rol requerido | No califica. Buscar siguiente. |
| Manager es el solicitante | Regla de segregación: verificar si está permitido. |

### Regla de segregación

Si la política indica "requester no puede aprobar su propia solicitud", se valida:

```sql
-- Conceptual:
IF @task.assigned_to = @request.requester_id THEN
  RAISE EXCEPTION 'Self-approval not allowed';
END IF;
```

Esta validación es CONFIGURABLE. No todas las políticas lo requieren.

## SLA

### Configuración

```yaml
sla_hours: 48  # Tiempo límite en horas
```

### Cálculo de due_at

```sql
-- Conceptual:
due_at = task.created_at + (sla_hours || ' hours')::INTERVAL
```

### Expiración

Cuando `now() > due_at`:
1. La tarea pasa a estado `EXPIRED`
2. Se envía notificación al asignado y su manager
3. La tarea puede ser reclamada por otro usuario con el mismo rol
4. Se registra en audit

### Escalación (futuro)

No implementar en Fase 0. Diseñar para soportar:
- Notificación a manager después de X horas
- Reasignación automática después de Y horas
- Notificación a admin después de Z horas

## Concurrencia

### Evitar transiciones duplicadas

```sql
-- Conceptual:
BEGIN;

-- 1. Bloquear la instancia de workflow
SELECT * FROM mdm.workflow_instances
WHERE id = @instance_id
FOR UPDATE;

-- 2. Validar que el paso actual sigue siendo el esperado
IF @current_step_id != @expected_step_id THEN
  ROLLBACK;
  RAISE EXCEPTION 'CONCURRENCY_CONFLICT';
END IF;

-- 3. Validar que la transición es válida
IF NOT EXISTS (
  SELECT 1 FROM mdm.workflow_transitions
  WHERE workflow_id = @workflow_id
  AND from_step_id = @current_step_id
  AND action = @action
) THEN
  ROLLBACK;
  RAISE EXCEPTION 'INVALID_TRANSITION';
END IF;

-- 4. Ejecutar transición
UPDATE mdm.workflow_instances
SET current_step_id = @to_step_id,
    version = version + 1,
    updated_at = now()
WHERE id = @instance_id;

-- 5. Registrar historial
INSERT INTO mdm.workflow_history (...);

-- 6. Crear/actualizar task
INSERT INTO mdm.workflow_tasks (...);

-- 7. Sincronizar requests.status
UPDATE mdm.requests
SET status = @new_step_code
WHERE id = @request_id;

-- 8. Audit
INSERT INTO audit.events (...);

COMMIT;
```

Si cualquier operación falla, se ejecuta ROLLBACK completo.

## Transacción completa

### Secuencia

```
BEGIN
  ↓
  SELECT FOR UPDATE (workflow_instances)
  ↓
  Validar versión actual
  ↓
  Validar transición válida
  ↓
  Validar reglas de negocio
  ↓
  UPDATE workflow_instances (current_step_id, version)
  ↓
  INSERT workflow_history
  ↓
  INSERT/UPDATE workflow_tasks
  ↓
  UPDATE requests.status (proyección)
  ↓
  INSERT audit.events
  ↓
COMMIT
```

### Rollback

Si CUALQUIER operación falla:

```
ROLLBACK
  ↓
  No se modifica nada
  ↓
  Se retorna error al usuario
  ↓
  Se reintenta o se informa
```

## Clasificación y Analizador en el Workflow (Fase 0.1)

### Pipeline con analizador

```
CREATED (DRAFT)
  ↓ submit
ANALYZING — Analizador interpreta descripción (ej "PARACHOQUE DELANTERO FOTON 45 TON" → {group:RVH, subgroup:CAR, brand:FOTON, confidence:94.5, evidence:[...]})
  ↓
PENDING_MANAGER → MANAGER_APPROVED
  ↓
PENDING_WAREHOUSE / WAREHOUSE_REVIEW — Almacén ve propuesta con check [ RVH ] ✓ Propuesto por analizador
  ↓ (si cambia grupo/subgrupo)
RECLASSIFICATION → CODE_RECALCULATION → recalcula master_code = <NUEVO_GRUPO><NUEVO_SUBGRUPO><SEQUENCE> (ej RVHCAR0001 → MECIND0001)
  ↓ accept
CLASSIFICATION_APPROVED
  ↓
MATCHING (busca equivalentes; distinto de analizador)
  ↓
MASTER_LINK o MASTER_CREATION → APPROVED → MASTER_ACTIVE
```

**Reglas:**
- Descripción es fuente semántica; analizador solo **propone** con `confidence/evidence`; decisión final humana.
- Almacén es quien **valida** clasificación operativa; puede aceptar/cambiar grupo, subgrupo, categoría, corregir datos.
- `Data Quality` solo evalúa completitud, no clasifica. `Contabilidad` no infiere grupo/subgrupo.
- Si Almacén cambia grupo/subgrupo, el código **debe** recalcularse; estado `grupo=ABC código=RVHCAR...` es inconsistencia prohibida (validación de dominio).
- Master Code es derivado: `group_id + subgroup_id + correlativo → master_code` (ver ADR-019).

### UX futura

```
Descripción: PARACHOQUE DELANTERO FOTON 45 TON
Análisis automático: ✓ Alta confianza
Grupo:    [ RVH ] Repuestos de vehículos
Subgrupo: [ CAR ] Carrocería
Código propuesto: RVHCAR0001  →  [ Aceptar ] [ Cambiar ]
Al cambiar a MEC/IND → código live recalcula a MECIND0001
```
Validación en dominio además de frontend.

## Regla fundamental

```
No puede existir:
  workflow_instances.current_step_id ≠ requests.status

después de una transacción exitosa.
```

Si se detecta inconsistencia:
1. Es un BUG
2. Se debe corregir inmediatamente
3. Se debe registrar en audit
4. Se debe investigar la causa raíz
