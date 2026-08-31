# Master Data Model

## Visión general

El modelo Master Data representa artículos homologados del sistema MDM. Un master item es una entidad independiente de cualquier código existente en Profit.

## Entidades principales

### master_items

```sql
CREATE TABLE mdm.master_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_code VARCHAR(40) NOT NULL UNIQUE,
  master_description TEXT NOT NULL,
  normalized_description TEXT NOT NULL,
  status mdm.item_status NOT NULL DEFAULT 'PENDING_REVIEW',
  
  -- Clasificación
  group_id UUID REFERENCES mdm.catalog_groups(id),
  subgroup_id UUID REFERENCES mdm.catalog_subgroups(id),
  category_id UUID REFERENCES mdm.catalog_categories(id),
  brand_id UUID REFERENCES mdm.brands(id),
  manufacturer_id UUID REFERENCES mdm.manufacturers(id),
  model_id UUID REFERENCES mdm.models(id),
  model_text VARCHAR(200),
  unit_id UUID REFERENCES mdm.units_of_measure(id),
  
  -- Datos técnicos
  part_number TEXT,
  application TEXT,
  
  -- Atributos (legacy, migrado a master_item_attribute_values)
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Calidad
  data_quality_score NUMERIC(5,2),
  
  -- Merge
  merged_into_id UUID REFERENCES mdm.master_items(id),
  merge_reason TEXT,
  
  -- Concurrencia
  version INTEGER NOT NULL DEFAULT 1,
  
  -- Auditoría
  created_by UUID REFERENCES mdm.users(id),
  created_by_company_id UUID REFERENCES mdm.companies(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
```

### Identidad

- `id`: UUID interno del MDM
- `master_code`: Código oficial del MDM, **derivado de la clasificación aprobada** (formato `<GROUP><SUBGROUP><SEQUENCE>`, ej `RVHCAR000001`)
- Nunca depende de `source_code` de Profit; `source_code` se conserva solo como dato de origen

### Master code — Generación basada en clasificación (Fase 0.1)

**Formato conceptual:** `<GROUP_CODE><SUBGROUP_CODE><SEQUENCE>`

| Componente | Descripción | Ejemplo |
|------------|-------------|---------|
| `GROUP_CODE` | Código del Grupo (ej `RVH` = Repuestos vehículos) | `RVH` |
| `SUBGROUP_CODE` | Código del Subgrupo (ej `CAR` = Carrocería) | `CAR` |
| `SEQUENCE` | Correlativo único dentro de la combinación grupo+subgrupo | `000001` |

Resultado: `RVH + CAR + 000001 = RVHCAR000001` (concepto heredado de Profit `RVHCAR0001` pero con longitud de correlativo configurable y generación controlada).

**Configuración:** La longitud del correlativo (ej 6 dígitos) es **configuración centralizada** (`system_config.master_code.sequence_length`), no hardcodeada. Opcionalmente formato con padding.

**Generación:** Secuencia por combinación grupo+subgrupo (o secuencia global con partición lógica). Implementación futura: `mdm.master_code_sequences(group_id, subgroup_id, last_value)` con `SELECT ... FOR UPDATE` o secuencia PostgreSQL por prefijo. Garantiza unicidad, concurrencia segura, no reutilización, trazabilidad. Ver `docs/concurrency.md`.

**Regla de integridad fundamental (derivada):**
```
master_item.group_id + master_item.subgroup_id + correlativo  →  master_code
```
La fuente de verdad es `group_id/subgroup_id`. El código es **representación derivada**. Nunca usar `master_code` para inferir clasificación. Constraint futuro: `CHECK (master_code LIKE group_code || subgroup_code || '%')` validado en application layer + DB.

**Reglas:**
- Secuencia por grupo+subgrupo (o global particionada), nunca se resetea por prefijo
- Gaps aceptados (rollback no libera código)
- Nunca reutilizado
- Desactivación no libera código
- Merge no elimina código
- **Si Almacén cambia grupo/subgrupo antes de activar:** el código se **recalcula** con el nuevo prefijo + nuevo correlativo; el código anterior se conserva en `master_item_versions` + auditoría
- Código no es definitivo hasta clasificación validada por Almacén

### Flujo de clasificación y código

```
DESCRIPCIÓN (ej "PARACHOQUE DELANTERO FOTON 45 TON")
    ↓
ANALIZADOR → propuesta {group:RVH, subgroup:CAR, brand:FOTON, application:"45 TON", confidence:94.5, evidence:[...]}
    ↓
ALMACÉN valida/corrige (puede aceptar RVH/CAR o cambiar a ABC/XYZ)
    ↓
CLASIFICACIÓN APROBADA → GENERACIÓN master_code = <GROUP_APROBADO><SUBGROUP_APROBADO><SEQUENCE>
```

> **Ejemplo crítico:** Si analizador propone `RVH/CAR → RVHCAR0001` y Almacén corrige a `ABC/XYZ`, el sistema **no** conserva `RVHCAR0001`. Recalcula `ABCXYZ<correlativo>`. Estado inconsistente `grupo=ABC, código=RVHCAR...` está prohibido por validación de dominio.

### Descripción como fuente semántica

La descripción (`original_description`) es la principal fuente para inferir tipo, grupo, subgrupo, categoría, marca, modelo, part number, aplicación, atributos. El **Analizador** produce **propuesta** con `confidence` y `evidence`; no modifica datos silenciosamente. Decisión final pertenece al workflow humano.

### Clasificación del artículo

Mínimo explícito: `Grupo + Subgrupo + Categoría`. Opcionales según categoría: `Marca, Fabricante, Modelo, Part Number, Unidad, Aplicación, Atributos técnicos`. Nunca asumir correcta solo por venir de Profit.

### Lifecycle

```
PENDING_REVIEW → ACTIVE → INACTIVE
PENDING_REVIEW → REJECTED
ACTIVE → MERGED
INACTIVE → ACTIVE (reactivación)
INACTIVE → MERGED
```

Ver `docs/state-machines.md` para la máquina de estados completa.

### Canonical master

Para encontrar el master activo de cualquier master_item:

```sql
CREATE OR REPLACE FUNCTION mdm.resolve_canonical(p_master_id UUID)
RETURNS UUID AS $$
DECLARE
  v_current UUID := p_master_id;
  v_next UUID;
BEGIN
  LOOP
    SELECT merged_into_id INTO v_next
    FROM mdm.master_items
    WHERE id = v_current;
    
    IF v_next IS NULL OR v_next = v_current THEN
      RETURN v_current;
    END IF;
    
    v_current := v_next;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

**Regla:** Si A→B y B→C, entonces A debe apuntar directamente a C. Nunca cadenas inconsistentes.

### Reclasificación

**A. Antes de activar:** grupo/subgrupo/categoría pueden cambiar; el sistema registra cambio, recalcula código si corresponde, mantiene `master_item_versions` + `audit.events`.

**B. Master ya ACTIVO:** requiere proceso controlado: permiso `master:reclassify`, genera `master_item_versions`, `audit.events` con before/after, registra clasificación anterior/nueva; determina si `master_code` debe cambiar preservando trazabilidad histórica. No implementado aún; solo regla.

### Almacén valida clasificación operativa

Analizador **propone**, Almacén **valida**. UI debe mostrar propuesta con check (`[ RVH ] ✓ Propuesto por analizador`) y detectar modificación para recalcular código. Almacén puede aceptar/cambiar grupo, subgrupo, categoría, corregir información, solicitar revisión.

### Contabilidad desacoplada

Contabilidad **no** infiere grupo/subgrupo/categoría/marca/modelo. Ninguna dependencia `Grupo contable → Grupo MDM`. Campos contables son información independiente consumida después de homologación.

### Analizador vs Matching vs Data Quality

- **Analizador:** estructura información desde descripción
- **Matching:** busca equivalentes entre Masters existentes
- **Data Quality:** evalúa completitud (descripción, grupo, subgrupo, marca, part number, atributos requeridos) pero **no decide clasificación**
- Decisión final siempre humana.

### Trazabilidad

Reconstruible: descripción Profit → propuesta analizador (grupo/subgrupo, confidence, evidence) → usuario Almacén + cambios → clasificación aprobada → código generado → cambios posteriores (quién/cuándo/por qué) vía `master_item_versions` + `audit.events` + `workflow_history`.

### Password Policy (seguridad, ver ADR-022)

Usuarios: mínimo 8 caracteres, ≥2 números, ≥1 especial; hash seguro (argon2/bcrypt) en application layer; DB nunca recibe contraseña en claro.

## Entidades de soporte

### brands

```sql
CREATE TABLE mdm.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  normalized_name VARCHAR(150) NOT NULL UNIQUE,
  manufacturer_id UUID REFERENCES mdm.manufacturers(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Entidad normalizada de marcas. `normalized_name` se genera con `TRIM(UPPER(...))`.

### manufacturers

```sql
CREATE TABLE mdm.manufacturers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  normalized_name VARCHAR(200) NOT NULL UNIQUE,
  country VARCHAR(100),
  website TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Entidad normalizada de fabricantes. Relacionada con brands.

### models

```sql
CREATE TABLE mdm.models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES mdm.brands(id),
  name VARCHAR(200) NOT NULL,
  normalized_name VARCHAR(200) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, normalized_name)
);
```

Modelos normalizados POR MARCA. No es un catálogo global rígido.

### Aliases

```sql
-- manufacturer_aliases
CREATE TABLE mdm.manufacturer_aliases (
  id UUID PRIMARY KEY,
  manufacturer_id UUID NOT NULL REFERENCES mdm.manufacturers(id),
  alias VARCHAR(200) NOT NULL,
  normalized_alias VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (normalized_alias)
);

-- brand_aliases
CREATE TABLE mdm.brand_aliases (
  id UUID PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES mdm.brands(id),
  alias VARCHAR(150) NOT NULL,
  normalized_alias VARCHAR(150) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (normalized_alias)
);

-- model_aliases
CREATE TABLE mdm.model_aliases (
  id UUID PRIMARY KEY,
  model_id UUID NOT NULL REFERENCES mdm.models(id),
  alias VARCHAR(200) NOT NULL,
  normalized_alias VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (normalized_alias)
);

-- item_aliases
CREATE TABLE mdm.item_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_item_id UUID NOT NULL REFERENCES mdm.master_items(id),
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  source VARCHAR(80),
  company_id UUID REFERENCES mdm.companies(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (master_item_id, normalized_alias)
);
```

Los aliases permiten que un mismo artículo sea encontrado por diferentes nombres.

## Atributos técnicos

### attribute_definitions

```sql
CREATE TABLE mdm.attribute_definitions (
  id UUID PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  data_type VARCHAR(30) NOT NULL,
  unit_of_measure_id UUID REFERENCES mdm.units_of_measure(id),
  validation_config JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Define qué atributos existen y su tipo de dato.

### category_attribute_links

```sql
CREATE TABLE mdm.category_attribute_links (
  id UUID PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES mdm.catalog_categories(id),
  attribute_id UUID NOT NULL REFERENCES mdm.attribute_definitions(id),
  required BOOLEAN NOT NULL DEFAULT false,
  default_value TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, attribute_id)
);
```

Define qué atributos aplica a cada categoría de producto.

### master_item_attribute_values

```sql
CREATE TABLE mdm.master_item_attribute_values (
  id UUID PRIMARY KEY,
  master_item_id UUID NOT NULL REFERENCES mdm.master_items(id) ON DELETE CASCADE,
  attribute_id UUID NOT NULL REFERENCES mdm.attribute_definitions(id),
  value_text TEXT,
  value_numeric NUMERIC,
  value_boolean BOOLEAN,
  value_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (master_item_id, attribute_id)
);
```

### Regla de consistencia

Solo UNA columna de valor puede ser NOT NULL según `data_type`:

```sql
CHECK (
  (value_text IS NOT NULL AND value_numeric IS NULL AND value_boolean IS NULL AND value_date IS NULL)
  OR (value_text IS NULL AND value_numeric IS NOT NULL AND value_boolean IS NULL AND value_date IS NULL)
  OR (value_text IS NULL AND value_numeric IS NULL AND value_boolean IS NOT NULL AND value_date IS NULL)
  OR (value_text IS NULL AND value_numeric IS NULL AND value_boolean IS NULL AND value_date IS NOT NULL)
)
```

## Relaciones

### master_item_source_map

```sql
CREATE TABLE mdm.master_item_source_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_item_id UUID NOT NULL REFERENCES mdm.master_items(id),
  source_item_id UUID NOT NULL REFERENCES profit_staging.source_items(id),
  relation_type VARCHAR(40) NOT NULL DEFAULT 'EQUIVALENT',
  confidence NUMERIC(5,2),
  company_id UUID REFERENCES mdm.companies(id),
  confirmed_by UUID REFERENCES mdm.users(id),
  confirmed_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (master_item_id, source_item_id)
);
```

Un master item puede tener MUCHOS source items. Un source item pertenece a UN solo master item activo.

### Unicidad de mapeo activo

```sql
CREATE UNIQUE INDEX uq_active_source_item_master
  ON mdm.master_item_source_map(source_item_id)
  WHERE active = true;
```

Garantiza que un source item no apunte a múltiples masters activos.

## Calidad de datos

### data_quality_rules

```sql
CREATE TABLE mdm.data_quality_rules (
  id UUID PRIMARY KEY,
  category_id UUID REFERENCES mdm.catalog_categories(id),
  field_name VARCHAR(100) NOT NULL,
  rule_type VARCHAR(50) NOT NULL,
  rule_config JSONB NOT NULL DEFAULT '{}',
  severity VARCHAR(20) NOT NULL DEFAULT 'ERROR',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### data_quality_results

```sql
CREATE TABLE mdm.data_quality_results (
  id UUID PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  overall_score NUMERIC(5,2) NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evaluator_version VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### data_quality_issues

```sql
CREATE TABLE mdm.data_quality_issues (
  id UUID PRIMARY KEY,
  result_id UUID NOT NULL REFERENCES mdm.data_quality_results(id),
  rule_id UUID NOT NULL REFERENCES mdm.data_quality_rules(id),
  field_name VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  actual_value TEXT,
  expected_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Versionado

### master_item_versions

```sql
CREATE TABLE mdm.master_item_versions (
  id UUID PRIMARY KEY,
  master_item_id UUID NOT NULL REFERENCES mdm.master_items(id),
  version INTEGER NOT NULL,
  master_code VARCHAR(40) NOT NULL,
  master_description TEXT NOT NULL,
  normalized_description TEXT NOT NULL,
  status mdm.item_status NOT NULL,
  group_id UUID,
  subgroup_id UUID,
  category_id UUID,
  brand_id UUID,
  manufacturer_id UUID,
  model_id UUID,
  model_text VARCHAR(200),
  unit_id UUID,
  part_number TEXT,
  application TEXT,
  attributes JSONB,
  data_quality_score NUMERIC,
  changed_by UUID NOT NULL REFERENCES mdm.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_reason TEXT,
  diff JSONB,
  UNIQUE (master_item_id, version)
);
```

### Qué genera versión

| Evento | ¿Genera versión? |
|--------|------------------|
| Crear master_item | SÍ (v1) |
| Modificar campos | SÍ (v2, v3...) |
| Cambiar status (sin cambios de datos) | NO |
| MERGE | SÍ (status MERGED) |
| SPLIT | SÍ (del original) |

## Merge y Split

Ver `docs/merge-split.md` para documentación completa.

### merge_history

```sql
CREATE TABLE mdm.merge_history (
  id UUID PRIMARY KEY,
  source_item_id UUID NOT NULL REFERENCES mdm.master_items(id),
  target_item_id UUID NOT NULL REFERENCES mdm.master_items(id),
  merge_type VARCHAR(50) NOT NULL,
  reason TEXT,
  performed_by UUID NOT NULL REFERENCES mdm.users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### split_history

```sql
CREATE TABLE mdm.split_history (
  id UUID PRIMARY KEY,
  original_item_id UUID NOT NULL REFERENCES mdm.master_items(id),
  new_item_id UUID NOT NULL REFERENCES mdm.master_items(id),
  split_type VARCHAR(50) NOT NULL,
  reason TEXT NOT NULL,
  performed_by UUID NOT NULL REFERENCES mdm.users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
