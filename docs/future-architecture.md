# Arquitectura Futura

## Flujo General

```
Frontend (React)
    ↓ HTTP/REST
NestJS API
    ↓
Servicios de Aplicación
    ↓
Persistencia (Prisma)
    ↓
Base de Datos (SQLite dev / SQL Server prod)
```

---

## Entornos de Base de Datos

### Desarrollo

- **Base de datos:** SQLite (`apps/api/data/dev.db`)
- **Ventajas:** Sin instalación adicional, portátil, reinicio rápido
- **ORM:** Prisma con provider `sqlite`
- **Schema:** `apps/api/prisma/schema.prisma`
- **Seed:** `apps/api/prisma/seed.js`
- **Comandos:** `db:generate`, `db:push`, `db:seed`, `db:studio`

### Producción

- **Base de datos:** SQL Server
- **Ventajas:** Rendimiento, escalabilidad, compatibilidad con Profit
- **ORM:** Prisma con provider `sqlserver`
- **Migraciones:** Prisma Migrate con archivos de migración
- **Connection string:** Variable de entorno `DATABASE_URL`

### Profit (Externo)

- **Base de datos:** SQL Server existente (READ-ONLY)
- **Acceso:** Through `ProfitAdapter` exclusivamente
- **Política:** Nunca modificar tablas de Profit directamente

---

## Integración con Profit

```
Profit SQL Server (sistema externo, READ-ONLY)
    ↓
Profit Adapter (lectura)
    ↓
Staging MDM (copia de datos)
    ↓
Sanitización
    ↓
Data Quality
    ↓
Matching
    ↓
Master Data
    ↓
Aprobaciones (workflow)
    ↓
Profit Write Adapter (escritura futura)
    ↓
Profit SQL Server
```

---

## Principios

1. **Profit es externo** — El MDM NO depende directamente de las tablas internas de Profit
2. **Separación lógica** — El MDM puede coexistir en SQL Server con Profit pero con esquema propio
3. **Lectura primero** — Profit se lee; la escritura es una fase futura explícita
4. **Adaptadores** — Toda integración con Profit pasa por un adapter
5. **SQLite para desarrollo** — Sin fricción, sin servidor, reinicio instantáneo
6. **SQL Server para producción** — Compatibilidad con ecosistema Profit y requisitos empresariales

---

## Stack Futuro

| Capa | Tecnología |
|------|------------|
| Frontend | React + TypeScript + Vite |
| API | NestJS |
| ORM | Prisma |
| Dev DB | SQLite |
| Prod DB | SQL Server |
| Profit | SQL Server (externo) |
| Containerización | Docker Compose |
| Testing | Vitest + Playwright |

---

## Base de Datos

### Estrategia

- **Desarrollo local:** SQLite (sin instalación adicional)
- **Producción:** SQL Server
- **Profit:** SQL Server existente (externo, READ-ONLY)

### Separación

El MDM tiene su propia estructura de datos. Puede coexistir en SQL Server con Profit, pero debe existir separación lógica (esquema separado o base de datos separada).

### Migración entre entornos

El schema de Prisma define los modelos de forma independiente del proveedor. Para cambiar de SQLite a SQL Server:

1. Cambiar `provider` en `schema.prisma`: `sqlite` → `sqlserver`
2. Actualizar `DATABASE_URL` en `.env`
3. Ejecutar `db:generate` y `db:migrate`
4. Ejecutar `db:seed` para datos iniciales

---

## Módulos Futuros del Backend

| Módulo | Responsabilidad |
|--------|-----------------|
| `requester` | Crear y gestionar solicitudes |
| `warehouse` | Clasificar artículos |
| `accounting` | Revisar información contable |
| `workflow` | Motor de workflow configurable |
| `master-data` | CRUD de master items |
| `matching` | Motor de matching híbrido |
| `data-quality` | Reglas de calidad de datos |
| `import` | Pipeline de importación |
| `audit` | Logging de eventos |
| `admin` | Usuarios, roles, permisos |
| `profit-adapter` | Integración con Profit |
