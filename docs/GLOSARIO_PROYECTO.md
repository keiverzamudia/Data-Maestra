# Glosario del Proyecto — Data-Maestra

Fecha: 01 de septiembre de 2026

---

## Términos del negocio

| Término | Definición | Dónde se usa |
|---|---|---|
| **Solicitud** | Petición de un nuevo artículo por parte de un departamento | `modulos/solicitudes/` |
| **Clasificación** | Asignación de grupo, subgrupo, categoría, marca y unidad a un artículo | `modulos/almacen/` |
| **Aprobación** | Acción de validar o rechazar una solicitud en cada etapa | Todos los módulos de workflow |
| **Rechazo** | Decisión de no aprobar una solicitud (terminal) | `REJECTED` |
| **Retorno** | Devolución de una solicitud a una etapa anterior (no terminal) | `RETURNED` |
| **Master Code** | Código único generado para cada artículo homologado | `solicitud.service.ts:generateMasterCode()` |
| **Grupo** | Categoría superior de artículos (ej: RVH = Repuestos de Vehículos) | `modulos/catalogos/`, Prisma |
| **Subgrupo** | Subcategoría dentro de un grupo (ej: CAR = Carrocería) | `modulos/catalogos/`, Prisma |
| **Categoría** | Detalle específico dentro de un subgrupo | `modulos/catalogos/`, Prisma |
| **Marca** | Fabricante o marca del artículo | `modulos/catalogos/`, Prisma |
| **Unidad de medida** | Unidad comercial del artículo (pieza, litro, kg) | `modulos/catalogos/`, Prisma |
| **RequestData** | Datos de clasificación guardados para una solicitud | Prisma `request_data` |

---

## Términos del workflow

| Estado | Significado | Etapa |
|---|---|---|
| `DRAFT` | Borrador, editable por solicitante | Inicio |
| `PENDING_MANAGER` | Esperando aprobación gerencial | Gerente |
| `PENDING_WAREHOUSE` | Esperando clasificación de almacén | Almacén |
| `WAREHOUSE_APPROVED` | Clasificación completada | Almacén → Contabilidad |
| `PENDING_ACCOUNTING` | Esperando revisión contable | Contabilidad |
| `PENDING_FINAL_REVIEW` | Esperando revisión final | Revisión Final |
| `APPROVED` | Aprobado definitivamente | Final |
| `MASTER_ACTIVE` | Master item activo | Post-aprobación |
| `RETURNED` | Devuelto a etapa anterior | Cualquier etapa |
| `REJECTED` | Rechazado definitivamente | Cualquier etapa |

---

## Términos técnicos

| Término | Definición |
|---|---|
| **RBAC** | Role-Based Access Control — control de acceso basado en roles |
| **Permiso** | Cadena `AREA.ACCION` que controla acceso a endpoints (ej: `WAREHOUSE.CLASSIFY`) |
| **Role** | Conjunto de permisos asignado a un usuario (ej: `REQUESTER`, `WAREHOUSE`) |
| **Guard** | Middleware NestJS que verifica permisos antes de ejecutar un endpoint |
| **DTO** | Data Transfer Object — define la forma de los datos de entrada |
| **Prisma** | ORM que mapea tablas de DB a objetos TypeScript |
| **Flatten** | Aplanar datos anidados de Prisma a objetos planos para el frontend |
| **Mode switch** | Mecanismo `VITE_DATA_MODE` que alterna entre mock y API real |
| **Barrel export** | Archivo `index.ts` que re-exporta todos los componentes de una carpeta |

---

## Términos de la base de datos

| Tabla | Descripción |
|---|---|
| `requests` | Solicitudes de artículos |
| `request_data` | Datos de clasificación (1:1 con requests) |
| `request_accounting_codes` | Códigos contables asociados a una solicitud |
| `workflow_instances` | Instancias de workflow (1:1 con requests) |
| `workflow_tasks` | Tareas pendientes por etapa |
| `workflow_history` | Historial de transiciones |
| `approvals` | Registro de aprobaciones/rechazos |
| `audit_events` | Eventos de auditoría |
| `catalog_groups` | Grupos de catálogo |
| `catalog_subgroups` | Subgrupos de catálogo |
| `catalog_categories` | Categorías de catálogo |
| `brands` | Marcas |
| `units_of_measure` | Unidades de medida |
| `master_items` | Artículos maestros homologados |
| `companies` | Empresas |
| `departments` | Departamentos |
| `users` | Usuarios |
| `roles` | Roles del sistema |
| `permissions` | Permisos del sistema |
| `user_roles` | Asignación usuario-rol-empresa |
| `role_permissions` | Asignación rol-permiso |
