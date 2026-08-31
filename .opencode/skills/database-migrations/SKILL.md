---
name: database-migrations
description: Gestionar evolución segura del esquema PostgreSQL mediante Prisma migrations y revisión de impacto.
compatibility: opencode
---

# Database Migrations

## Reglas
- Toda modificación del esquema requiere migration.
- Revisar índices y foreign keys.
- Revisar impacto sobre datos existentes.
- Evitar cambios destructivos en una sola migración cuando exista riesgo.
- Preferir expand-and-contract para cambios complejos.
- Documentar migraciones con riesgo.
- Seed solo con datos de catálogo no sensibles.

## No hacer
- `DROP TABLE` en producción.
- borrar columnas sin estrategia;
- modificar datos históricos sin auditoría.
