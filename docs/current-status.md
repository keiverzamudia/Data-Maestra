# Estado Actual del Proyecto

## IMPLEMENTADO ✓

### Interfaz Visual
- Layout principal con sidebar colapsable
- Header con búsqueda global, selector de empresa, notificaciones
- Navegación por módulos con permisos

### Módulos Funcionales (datos MOCK)
- **Dashboard** — KPIs, solicitudes recientes, actividad
- **Solicitante** — Lista, creación con wizard, detalle
- **Clasificación** — Bandeja, clasificación con Analyzer, generación de código
- **Contabilidad** — Revisión, aprobación/rechazo, códigos contables
- **Importaciones** — Pipeline visual (Import → Sanitización → DQ → Matching)
- **Auditoría** — Eventos con before/after
- **Administración** — Usuarios, roles, empresas, departamentos, catálogos

### Workflow Visual
- Timeline de estados del workflow
- Transiciones: crear → gerente → almacén → contabilidad → revisión final → activo
- Devolución y rechazo con motivo

### Analyzer Visual
- Propuesta semántica basada en descripción
- Score de confianza
- Evidencia de clasificación

### Generación de Código Master
- Vista previa del código (GRUPO + SUBGRUPO + CORRELATIVO)
- Recalculo automático al cambiar grupo/subgrupo

### Sesión Mock
- Usuario, empresa, área, jefe de área
- Permisos por rol (simula RBAC)
- Selector de empresa

### Datos Mock
- 3 empresas, 6 departamentos, 6 usuarios, 7 roles
- 9 solicitudes en diferentes estados
- 7 master items
- 8 source items
- Catálogo de grupos, subgrupos, categorías, marcas, unidades
- Notificaciones, eventos de auditoría, resultados de calidad

### Base de datos SQLite local
- Archivo: `apps/api/data/dev.db`
- Esquema Prisma definido para SQLite
- Datos iniciales via seed (empresas, departamentos, grupos, etc.)

### Prisma ORM configurado
- Schema en `apps/api/prisma/schema.prisma`
- Modelos: MasterItem, SourceItem, Request, AuditLog, Company, Department, User, Group, SubGroup, Category, Brand, Unit
- Client generado para SQLite

### NestJS API con endpoints
- Módulos: Auth, Catalogs, Requests, Warehouse, Accounting, Audit
- Servicios compartidos: WorkflowService, MasterCodeService
- Endpoints REST funcionales
- Documentación Swagger en `/docs`

### Seed data
- Script: `apps/api/prisma/seed.js`
- Datos iniciales: empresas, departamentos, usuarios, catálogos
- Poblado automático al ejecutar `pnpm --filter @master-data/api run db:seed`

---

## PENDIENTE

### Backend
- Autenticación real (JWT + refresh tokens)
- RBAC completo con permisos por acción
- Validación avanzada de reglas de negocio

### Integraciones
- Profit Adapter (lectura)
- Profit Write Adapter (escritura)
- SQL Server connection (producción)

### Matching
- Algoritmo real de matching
- Configuración de umbrales
- Decisión automática vs revisión humana

### Data Quality
- Reglas reales de calidad
- Validación de campos
- Scoring automático

### IA / Analyzer
- Análisis semántico real de descripciones
- Clasificación automática con IA
- Extracción de atributos

### Integración Final
- Conexión frontend ↔ backend
- Datos reales desde base de datos
- Workflow real con persistencia

### Frontend
- Consumo de API real (reemplazar mocks)
- Formularios conectados a endpoints
- Estado management con React Query

---

## API Endpoints Disponibles

### Health
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check general |

### Catálogos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/v1/catalogs/grupos` | Lista de grupos |
| GET | `/api/v1/catalogs/subgrupos` | Lista de subgrupos |
| GET | `/api/v1/catalogs/categorias` | Lista de categorías |
| GET | `/api/v1/catalogs/marcas` | Lista de marcas |
| GET | `/api/v1/catalogs/unidades` | Lista de unidades |
| GET | `/api/v1/catalogs/empresas` | Lista de empresas |

### Solicitudes
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/v1/requests` | Listar solicitudes |
| POST | `/api/v1/requests` | Crear solicitud |
| GET | `/api/v1/requests/:id` | Detalle de solicitud |
| GET | `/api/v1/requests/:id/workflow` | Estado del workflow |

### Master Items
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/v1/master-items` | Listar master items |
| POST | `/api/v1/master-items` | Crear master item |
| GET | `/api/v1/master-items/:code` | Detalle por código |

### Auditoría
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/v1/audit` | Eventos de auditoría |

Documentación interactiva completa: http://localhost:3001/docs

---

## Qué es MOCK vs REAL

| Componente | Estado |
|------------|--------|
| Datos de solicitudes | MOCK (frontend) / REAL (backend seed) |
| Datos de master items | MOCK (frontend) / REAL (backend seed) |
| Datos de source items | MOCK |
| Catálogos (grupos, marcas, etc.) | MOCK (frontend) / REAL (backend seed) |
| Sesión de usuario | MOCK |
| Permisos | MOCK |
| Notificaciones | MOCK |
| Eventos de auditoría | REAL (backend) |
| Resultados de calidad | MOCK |
| Matching | MOCK |
| Importaciones | MOCK |
| Generación de código master | REAL (backend) |
| Base de datos | REAL (SQLite) |
| API endpoints | REAL (NestJS) |

---

## Cómo Ejecutar

```bash
# Instalar dependencias
pnpm install

# Configurar base de datos
pnpm --filter @master-data/api run db:generate
pnpm --filter @master-data/api run db:push
pnpm --filter @master-data/api run db:seed

# Ejecutar backend
pnpm --filter @master-data/api run dev

# Ejecutar frontend (en otra terminal)
pnpm --filter @master-data/web run dev

# Abrir en navegador
http://localhost:5173/
```
