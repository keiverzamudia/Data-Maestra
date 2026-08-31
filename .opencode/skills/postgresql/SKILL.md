---
name: postgresql
description: Diseñar PostgreSQL para Data Master con integridad, auditoría, índices, constraints, UUID y migraciones seguras.
compatibility: opencode
---

# PostgreSQL

## Reglas
- PostgreSQL como fuente de verdad de la plataforma.
- UUID como identificador interno cuando sea conveniente.
- Códigos de negocio separados de IDs internos.
- Foreign keys explícitas.
- Unique constraints para evitar duplicados.
- Timestamps con timezone.
- Soft delete solamente cuando el dominio lo requiera.
- Índices sobre claves de búsqueda y relaciones.
- Nunca guardar secretos.

## Data Master
Debe existir separación entre:
- datos crudos de origen;
- datos normalizados;
- entidad maestra;
- mapping entre origen y maestro.

## Migraciones
- Toda modificación de esquema mediante migration.
- No editar manualmente producción.
- Migraciones reversibles cuando sea viable.
- Documentar migraciones destructivas.
