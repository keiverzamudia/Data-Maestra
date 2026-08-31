# Source Data Model

## Visión general

El modelo Source Data representa artículos importados desde sistemas externos (Profit Plus 2K8). Los datos se almacenan en `profit_staging` antes de ser procesados por el pipeline de normalización, calidad y matching.

## Arquitectura de integración

```
Profit (READ-ONLY)
    ↓
Profit Adapter
    ↓
Staging (source_items)
    ↓
Normalization
    ↓
Data Quality
    ↓
Matching
    ↓
Master Data
```

### Reglas

1. Profit NUNCA se modifica directamente
2. Los datos se copian a staging antes de procesar
3. El Adapter encapsula los detalles de Profit
4. Se registra `source_system` y `schema_version`

## Entidades

### sources

```sql
CREATE TABLE profit_staging.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES mdm.companies(id),
  source_system VARCHAR(100) NOT NULL,
  source_name VARCHAR(150) NOT NULL,
  connection_alias VARCHAR(150) NOT NULL,
  connection_config JSONB NOT NULL DEFAULT '{}',
  read_only BOOLEAN NOT NULL DEFAULT true,
  schema_version VARCHAR(100),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, source_name)
);
```

Representa una conexión a una fuente de datos (ej: Profit de Empresa A).

### import_runs

```sql
CREATE TABLE profit_staging.import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES profit_staging.sources(id),
  triggered_by UUID REFERENCES mdm.users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status VARCHAR(40) NOT NULL DEFAULT 'CREATED',
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  rows_unchanged INTEGER NOT NULL DEFAULT 0,
  rows_failed INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  execution_config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Registra cada ejecución de importación. Permite trazabilidad y métricas.

### source_items

```sql
CREATE TABLE profit_staging.source_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES profit_staging.sources(id),
  import_run_id UUID NOT NULL REFERENCES profit_staging.import_runs(id),
  
  -- Identificación en Profit
  source_record_id VARCHAR(200) NOT NULL,
  source_code VARCHAR(150),
  
  -- Datos
  original_description TEXT,
  normalized_description TEXT,
  source_data JSONB NOT NULL DEFAULT '{}',
  
  -- Integridad
  content_hash VARCHAR(64),
  
  -- Estado
  status VARCHAR(50) NOT NULL DEFAULT 'IMPORTED',
  
  -- Tracking temporal
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_changed_at TIMESTAMPTZ,
  
  -- Métricas
  import_count INTEGER NOT NULL DEFAULT 1,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (source_id, source_record_id)
);
```

### Source identity

**La identidad única de un source_item es `(source_id, source_record_id)`.**

| Campo | Descripción | ¿Único? |
|-------|-------------|----------|
| `id` | UUID interno del MDM | Sí (PK) |
| `source_id` | FK a sources | No |
| `source_record_id` | ID original en Profit | **Sí por source_id** |
| `source_code` | Código legible en Profit | No (puede ser NULL) |
| `source_data` | Todos los campos de Profit | No |

### content_hash

SHA-256 de `source_data`. Se usa para detectar cambios en re-importaciones.

```sql
-- Conceptual:
content_hash = SHA256(source_data::TEXT)
```

### Importación idempotente

```
1. Recibir registro de Profit
2. source_record_id = '001' (ID original)
3. Buscar: WHERE source_id = @current AND source_record_id = '001'
4. Si NO existe → INSERT con import_count = 1
5. Si existe Y content_hash igual → UPDATE last_seen_at, import_count += 1
6. Si existe Y content_hash diferente →
   a. INSERT en source_item_versions
   b. UPDATE source_items con nuevos datos
   c. Registrar changed_fields
```

### source_item_versions

```sql
CREATE TABLE profit_staging.source_item_versions (
  id UUID PRIMARY KEY,
  source_item_id UUID NOT NULL REFERENCES profit_staging.source_items(id),
  import_run_id UUID NOT NULL REFERENCES profit_staging.import_runs(id),
  version INTEGER NOT NULL,
  source_data JSONB NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  changed_fields JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_item_id, version)
);
```

Registra cada cambio en los datos de un source_item.

## Connection config

```json
{
  "host": "profit-server.local",
  "port": 1433,
  "database": "ProfitDB",
  "username": "readonly_user",
  "password_ref": "env:PROFIT_DB_PASSWORD",
  "driver": "mssql",
  "options": {
    "encrypt": true,
    "trustServerCertificate": false
  }
}
```

### Seguridad de credenciales

| Campo | ¿Se almacena? | Ejemplo |
|-------|---------------|---------|
| host | SÍ | `"profit-server.local"` |
| port | SÍ | `1433` |
| database | SÍ | `"ProfitDB"` |
| username | SÍ | `"readonly_user"` |
| password | **NO** | Referencia: `"env:PROFIT_DB_PASSWORD"` |
| token | **NO** | Referencia: `"vault:secret/profit/token"` |

**Nunca almacenar:** passwords, tokens, private keys, certificates en texto plano.

**Estrategia:** Environment variables para desarrollo, Secret Manager para producción.

## Pipeline de procesamiento

### 1. Importación (Profit → Staging)

```
Profit
  ↓
Profit Adapter (READ-ONLY)
  ↓
Calcular content_hash
  ↓
Buscar source_record_id
  ↓
INSERT o UPDATE en source_items
  ↓
Registrar en import_runs
```

### 2. Normalization (Staging → Normalized)

```
source_items.original_description
  ↓
TRIM, LOWER, remove accents
  ↓
Normalize abbreviations
  ↓
Normalize units
  ↓
source_items.normalized_description
```

Ver `docs/normalization.md` para detalles.

### 2b. Analizador de Descripción (Nuevo — Fase 0.1)

```
original_description: "PARACHOQUE DELANTERO FOTON 45 TON"
  ↓
Analizador (propuesta, no decisión)
  ↓
{
  proposed_classification: { group:"RVH", subgroup:"CAR", brand:"FOTON", application:"45 TON" },
  confidence: 94.5,
  evidence: ["PARACHOQUE→CARROCERIA","FOTON→marca","45 TON→aplicación"]
}
  ↓
Almacén valida/corrige → clasificación aprobada
  ↓
master_code = <GROUP_APROBADO><SUBGROUP_APROBADO><SEQUENCE> (ej RVHCAR000001)
```

Reglas: descripción es fuente semántica; analizador no modifica silenciosamente; decisión final humana. Ver `docs/master-data-model.md` y `docs/decisions.md` ADR-020.

### 3. Data Quality (Normalized → Scored)

```
source_items
  ↓
Evaluar reglas de calidad
  ↓
Calcular overall_score
  ↓
Registrar issues
  ↓
data_quality_results
```

Ver `docs/master-data-model.md` sección de Data Quality para detalles. **Data Quality NO decide clasificación**, solo evalúa completitud (descripción, grupo, subgrupo, categoría, marca, part number, atributos requeridos según categoría).

### 4. Matching (Scored → Candidates) — distinto de Analizador

> Analizador interpreta descripción; Matching busca equivalentes existentes. Human Decision decide si corresponde a Master existente o requiere nuevo Master.

```
source_items (normalized + scored)
  ↓
Comparar con master_items existentes
  ↓
Calcular score por candidato
  ↓
Generar evidencia
  ↓
match_candidates
```

Ver `docs/matching-engine.md` para detalles.

### 5. Human Decision (Candidates → Links)

```
match_candidates
  ↓
Revisión humana
  ↓
ACCEPTED / REJECTED / DEFERRED
  ↓
match_decisions
  ↓
master_item_source_map (si ACCEPTED)
```

### Contabilidad no clasifica — nota para pipeline

Contabilidad no consume ni infiere `master_item.group_id/subgroup_id`. El flujo `Normalization → Analizador → Data Quality → Matching → Master` se completa sin intervención contable. Lo contable es integración futura desacoplada.

## Relación con Master Data

> **source_code vs master_code:** `source_code` (ej `RVHCAR0001` de Profit) se conserva como dato de origen y **no** controla `master_code` (`RVHCAR000001` generado según clasificación aprobada). Identidad del Source sigue siendo `(source_id, source_record_id)`.

```sql
-- master_item_source_map conecta source_items con master_items
CREATE TABLE mdm.master_item_source_map (
  id UUID PRIMARY KEY,
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

### Regla de unicidad

Un source_item solo puede estar activamente mapeado a UN master item:

```sql
CREATE UNIQUE INDEX uq_active_source_item_master
  ON mdm.master_item_source_map(source_item_id)
  WHERE active = true;
```

## Multiempresa

- `sources.company_id` identifica la empresa de origen
- `source_items` heredan empresa de `sources`
- `master_item_source_map.company_id` registra la empresa del mapeo
- Nunca mezclar datos de diferentes empresas en una query
