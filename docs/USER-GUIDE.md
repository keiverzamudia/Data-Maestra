# Data-Maestra — Guía de Usuario

## Visión General

Data-Maestra es una plataforma para gestionar y homologar artículos de múltiples empresas. Permite crear solicitudes de nuevos artículos, clasificarlos, aprobarlos y mantener un catálogo maestro unificado.

## Módulos

### 1. Dashboard (`/`)

**Para qué sirve:** Vista resumen del sistema.

**Qué muestra:**
- Solicitudes pendientes
- Solicitudes en aprobación
- Solicitudes devueltas
- Solicitudes completadas
- Actividad reciente

**Quién lo usa:** Todos los usuarios.

---

### 2. Solicitante (`/requester`)

**Para qué sirve:** Crear y gestionar solicitudes de artículos nuevos.

**Qué usuario lo usa:** Solicitante (departamento de Compras).

**Acciones:**
- **Crear solicitud:** Descripción del artículo + prioridad + propósito + imagen referencial
- **Enviar:** La solicitud pasa al Gerente para aprobación
- **Ver detalle:** Historial, estado, clasificación si existe

**Reglas:**
- El usuario, empresa y departamento se obtienen de la sesión automáticamente
- La descripción es la entrada principal del Analyzer
- La imagen referencial es opcional (JPG, PNG, WEBP, máx 10 MB)

---

### 3. Clasificación (`/warehouse`)

**Para qué sirve:** Clasificar artículos según catálogos del almacén.

**Qué usuario lo usa:** Almacén (clasificador).

**Qué muestra:**
- Solicitudes pendientes de clasificación
- Descripción original del solicitante
- Imagen referencial si existe
- Propuesta del Analyzer (grupo, subgrupo, marca, confianza)

**Acciones:**
- **Seleccionar grupo** (ej: RVH = Repuestos de Vehículos)
- **Seleccionar subgrupo** (ej: CAR = Carrocería)
- **Seleccionar categoría, marca, unidad**
- **Código se genera automáticamente:** GRUPO + SUBGRUPO + CORRELATIVO (ej: RVHCAR000001)
- **Aprobar:** La solicitud pasa a Contabilidad
- **Devolver:** La solicitud regresa al solicitante

**Reglas:**
- Si cambia grupo o subgrupo, el código se recalcula automáticamente
- El código NO se introduce manualmente
- Contabilidad NO puede modificar la clasificación

---

### 4. Contabilidad (`/accounting`)

**Para qué sirve:** Revisar clasificaciones y agregar información contable.

**Qué usuario lo usa:** Contabilidad.

**Qué muestra:**
- Solicitudes clasificadas pendientes de revisión
- Clasificación realizada por Almacén (grupo, subgrupo, marca)
- Código master propuesto

**Acciones:**
- **Revisar** la clasificación de Almacén
- **Agregar uno o más códigos contables** (ej: 5010-01 = Repuestos vehículos)
- **Aprobar:** La solicitud pasa a Revisión Final
- **Rechazar:** La solicitud se rechaza

**Reglas:**
- Contabilidad NO clasifica el artículo
- Contabilidad NO cambia grupo, subgrupo, categoría ni marca
- Contabilidad solamente revisa, agrega códigos y aprueba/rechaza

---

### 5. Importaciones (`/imports`)

**Para qué sirve:** Importar datos desde Profit y procesarlos.

**Estado actual:** MOCK (sin backend real)

**Pipeline visual:**
1. Importación desde Profit
2. Sanitización
3. Normalización
4. Data Quality
5. Matching
6. Homologación

---

### 6. Auditoría (`/audit`)

**Para qué sirve:** Registro de eventos del sistema.

**Qué muestra:**
- Fecha y hora
- Usuario que realizó la acción
- Tipo de entidad afectada
- Acción realizada (crear, aprobar, rechazar, devolver, etc.)
- Datos antes/después del cambio

**Quién lo usa:** Auditoría, administradores.

---

### 7. Administración (`/admin`)

**Para qué sirve:** Gestión de configuración del sistema.

**Qué muestra:**
- Usuarios
- Roles
- Empresas
- Departamentos
- Catálogos (grupos, subgrupos, categorías, marcas, unidades)
- Configuración

---

## Workflow de Solicitudes

```
SOLICITANTE crea solicitud
        ↓ DRAFT
    [Enviar]
        ↓ PENDING_MANAGER
GERENTE aprueba
        ↓ PENDING_WAREHOUSE
ALMACÉN clasifica + aprueba
        ↓ PENDING_ACCOUNTING
CONTABILIDAD aprueba con códigos
        ↓ PENDING_FINAL_REVIEW
REVISIÓN FINAL aprueba
        ↓ APPROVED
```

### Estados posibles

| Estado | Descripción |
|--------|-------------|
| DRAFT | Borrador, editable |
| PENDING_MANAGER | Esperando aprobación del gerente |
| PENDING_WAREHOUSE | En almacén para clasificación |
| WAREHOUSE_APPROVED | Clasificación completada |
| PENDING_ACCOUNTING | En contabilidad para revisión |
| PENDING_FINAL_REVIEW | Esperando revisión final |
| APPROVED | Aprobado, listo para activar |
| RETURNED | Devuelto para corrección |
| REJECTED | Rechazado |

---

## Sesión Mock

Actualmente el sistema usa una sesión mock:
- **Usuario:** Juan Pérez (j.perez)
- **Empresa:** Empresa A — Distribuidora Central
- **Departamento:** Compras
- **Permisos:** Todos los módulos

No hay autenticación real. Todos los usuarios ven todos los módulos.

---

## Imágenes Referenciales

- Formatos: JPG, PNG, WEBP
- Tamaño máximo: 10 MB
- Compresión automática a WEBP (~300-800 KB)
- Soporta Ctrl+V (pegar desde portapapeles)
- Se guarda en `apps/api/uploads/requests/`
