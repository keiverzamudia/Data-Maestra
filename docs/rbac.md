# Roles y permisos

## Roles iniciales

- SUPER_ADMIN
- REQUESTER
- DEPARTMENT_MANAGER
- WAREHOUSE
- ACCOUNTING
- MASTER_DATA_ADMIN
- FINAL_REVIEWER
- AUDITOR

## Permisos

### Solicitudes
- request:create
- request:view:own
- request:view:department
- request:edit
- request:submit
- request:approve
- request:reject
- request:return

### Almacén
- warehouse:view
- warehouse:review
- warehouse:edit
- warehouse:approve
- warehouse:return

### Contabilidad
- accounting:view
- accounting:review
- accounting:edit
- accounting:approve
- accounting:return

### Master Data
- master:view
- master:create
- master:edit
- master:merge
- master:split
- master:approve
- master:deactivate

### Matching
- matching:view
- matching:review
- matching:confirm
- matching:reject
- matching:configure

### Profit
- profit:source:view
- profit:import
- profit:sync
- profit:write

`profit:write` debe estar deshabilitado en las primeras fases.

### Administración
- users:manage
- roles:manage
- catalogs:manage
- workflows:manage
- settings:manage
- audit:view

## Segregación de funciones

Reglas configurables:
- requester no puede aprobar su propia solicitud;
- manager solo aprueba solicitudes de su departamento;
- accounting no puede cambiar clasificación operativa de almacén salvo permiso;
- final reviewer valida que el expediente esté completo;
- auditor es read-only.
