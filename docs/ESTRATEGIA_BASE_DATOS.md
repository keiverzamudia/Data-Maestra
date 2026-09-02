# Estrategia de Base de Datos — Data-Maestra

> Documento vigente — Estado actual y decisiones pendientes.

---

## Situación Actual

| Aspecto | Estado |
|---------|--------|
| Motor actual (desarrollo) | SQLite |
| Archivo | `apps/api/data/dev.db` |
| Schema | `apps/api/prisma/schema.prisma` (461 líneas, 21 modelos) |
| Migraciones | **Ninguna** — se usa `prisma db push` |
| Seed | `apps/api/prisma/seed.js` |
| Motor diseño (producción) | PostgreSQL 16 (Docker Compose) |
| Schema diseño | `db/schema.sql` (347 líneas) |

---

## Diferencias Clave: SQLite vs PostgreSQL

| Aspecto | SQLite (Prisma actual) | PostgreSQL (db/schema.sql) |
|---------|----------------------|---------------------------|
| Enums | String | ENUM types |
| UUID | `String @default(uuid())` | `uuid DEFAULT gen_random_uuid()` |
| JSON | String | jsonb |
| Schemas | Sin esquemas | `mdm`, `profit_staging`, `audit` |
| Tablas extra | — | `organizations`, `sources`, `master_item_source_map`, `item_aliases`, `match_candidates`, `workflow_tasks`, `data_quality_issues` |
| Índices GIN | No disponibles | Sí (jsonb) |
| Índices parciales | No disponibles | Sí |
| DECIMAL | Real | `@db.Decimal` |

---

## Riesgos

1. **Sin migraciones**: No hay historial de cambios de esquema. Si se rompe el esquema, no hay forma de saber qué cambió.
2. **`db push` puede perder datos**: En producción, `db push` puede eliminar columnas/tablas sin previo aviso.
3. **SQLite no tiene enums**: Los estados se almacenan como strings, sin validación a nivel de DB.
4. **Diferencias sutiles**: Funciones de fecha, comportamiento de strings, límites de tamaño.

---

## Qué Debemos Resolver (Futura Fase)

| Prioridad | Tarea | Fase sugerida |
|-----------|-------|---------------|
| Alta | Crear primera migración Prisma desde el esquema actual | Antes de producción |
| Alta | Definir estrategia de migración SQLite → PostgreSQL | Antes de producción |
| Alta | Decidir si se mantiene SQLite para desarrollo o se usa PostgreSQL local | Antes de producción |
| Media | Agregar enums a Prisma cuando se migre a PostgreSQL | Con migración |
| Media | Sincronizar db/schema.sql con schema.prisma | Con migración |
| Baja | Agregar tablas faltantes (aliases, source_map, match_candidates) | Según roadmap |

---

## Decisión Actual

- **Desarrollo**: SQLite con `db push` (aceptable para prototipado)
- **Producción**: PostgreSQL (requiere migraciones antes de desplegar)
- **No cambiar en esta fase**: Mantener SQLite hasta que se defina la estrategia de migración

---

*Documento creado en FASE 6D — Sin cambios de esquema*
