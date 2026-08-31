# Local Testing — FASE 2.1

## Requisitos

- Node.js >= 20
- pnpm >= 9

## Instalación

```bash
pnpm install
```

## SQLite

```bash
# Generar cliente Prisma
pnpm --filter @master-data/api run db:generate

# Crear/actualizar base de datos
pnpm --filter @master-data/api run db:push

# Poblar datos de prueba
pnpm --filter @master-data/api run db:seed
```

Ubicación: `apps/api/data/dev.db`

## Iniciar Backend

```bash
pnpm --filter @master-data/api run dev
```

Puerto: 3001
Swagger: http://localhost:3001/docs

## Iniciar Frontend

```bash
pnpm --filter @master-data/web run dev
```

Puerto: 5173
URL: http://localhost:5173/

## URLs Disponibles

| URL | Descripción |
|-----|-------------|
| http://localhost:3001/api/v1/health | Health check |
| http://localhost:3001/api/v1/auth/session | Sesión mock |
| http://localhost:3001/api/v1/catalogs/groups | Catálogo de grupos |
| http://localhost:3001/api/v1/requests | Solicitudes |
| http://localhost:3001/api/v1/warehouse/pending | Almacén pendiente |
| http://localhost:3001/api/v1/accounting/pending | Contabilidad pendiente |
| http://localhost:3001/api/v1/audit/events | Eventos de auditoría |
| http://localhost:3001/docs | Swagger UI |

## Flujo de Prueba Manual

### 1. Crear solicitud

```bash
curl -X POST http://localhost:3001/api/v1/requests \
  -H "Content-Type: application/json" \
  -d '{"requestedDescription":"FILTRO HIDRAULICO PARKER","purpose":"Mantenimiento","priority":2}'
```

### 2. Enviar a gerente

```bash
curl -X POST http://localhost:3001/api/v1/requests/{ID}/submit
```

### 3. Aprobar gerente

```bash
curl -X POST http://localhost:3001/api/v1/requests/{ID}/approve \
  -H "Content-Type: application/json" \
  -d '{"action":"APPROVE"}'
```

### 4. Clasificar (almacén)

```bash
curl -X POST http://localhost:3001/api/v1/warehouse/{ID}/classify \
  -H "Content-Type: application/json" \
  -d '{"groupId":"g1","subgroupId":"sg1","categoryId":"cat1","brandId":"b4","unitId":"uom1"}'
```

### 5. Aprobar almacén

```bash
curl -X POST http://localhost:3001/api/v1/warehouse/{ID}/approve
```

### 6. Aprobar contabilidad

```bash
curl -X POST http://localhost:3001/api/v1/accounting/{ID}/approve \
  -H "Content-Type: application/json" \
  -d '{"accountingCodes":[{"code":"5010-01","description":"Repuestos"}]}'
```

### 7. Aprobación final

```bash
curl -X POST http://localhost:3001/api/v1/requests/{ID}/approve \
  -H "Content-Type: application/json" \
  -d '{"action":"APPROVE"}'
```

## Resetear Base de Datos

```bash
rm apps/api/data/dev.db
pnpm --filter @master-data/api run db:push
pnpm --filter @master-data/api run db:seed
```

## Errores Encontrados y Corregidos

1. **WarehouseService approve solo aceptaba PENDING_WAREHOUSE** — Corregido para aceptar también WAREHOUSE_APPROVED (después de classify)
2. **RequestsController usaba IDs hardcodeados** — Corregido para usar AuthService.getSession()

## Estado Final

| Verificación | Estado |
|-------------|--------|
| Build Backend | PASS |
| Build Frontend | PASS |
| SQLite | PASS |
| Prisma | PASS |
| Health API | PASS |
| Swagger | PASS |
| Crear solicitud | PASS |
| Persistencia | PASS |
| Almacén (clasificar + aprobar) | PASS |
| Contabilidad (aprobar con códigos) | PASS |
| Workflow (transiciones completas) | PASS |
| Errores HTTP (400, 404) | PASS |
| Tests unitarios (47) | PASS |

## Imágenes Referenciales

### Formatos Aceptados
- JPG/JPEG
- PNG
- WEBP

### Límites
- Tamaño máximo original: 10 MB
- Compresión: ancho/alto máximo 1600px, calidad 80%, formato WEBP
- Objetivo: 300 KB – 800 KB

### Funcionalidades
- **Upload**: Seleccionar archivo desde explorador
- **Ctrl+V**: Pegar imagen desde portapapeles
- **Drag & Drop**: Arrastrar imagen al área de carga
- **Preview**: Vista previa inmediata con info de compresión
- **Validación**: Rechaza archivos inválidos o >10 MB

### Almacenamiento
- Archivos: `apps/api/uploads/requests/<uuid>.webp`
- BD: `requests.reference_photo_uri` = `"requests/<uuid>.webp"`
- Endpoint: `POST /api/v1/requests/:id/photo` (multipart/form-data)
- Visualización: `GET /uploads/requests/<filename>.webp`

### Prueba
1. Crear solicitud con imagen
2. Verificar preview en formulario
3. Verificar imagen en detalle de solicitud
4. Verificar imagen en módulo Almacén (clasificar)
5. Reiniciar backend → imagen persiste

## Prueba Real de Persistencia y Workflow

### Diagnóstico Inicial (FASE 2.3)

**Problema reportado:** Las solicitudes desaparecían después de reiniciar.

**Causa raíz:** El frontend usaba servicios MOCK (datos en memoria JavaScript) para TODAS las operaciones. Los endpoints de la API existían y funcionaban, pero el frontend nunca los llamaba.

**Solución:** Crear un proveedor de servicios (`services/index.ts`) que permite alternar entre MOCK y API mediante la variable de entorno `VITE_DATA_MODE`.

### Configuración

- `apps/web/.env`: `VITE_DATA_MODE=api` → usa API real
- `apps/web/.env` con `VITE_DATA_MODE=mock` → usa datos en memoria (default)

### Flujo Verificado

```
Frontend → POST /api/v1/requests → Prisma → SQLite → API → Frontend
```

1. Crear solicitud → status: DRAFT
2. Submit → status: PENDING_MANAGER
3. Manager approve → status: PENDING_WAREHOUSE
4. Reiniciar backend → solicitud persiste
5. Aparece en /warehouse (pendiente de clasificación)
6. Clasificar → status: WAREHOUSE_APPROVED
7. Warehouse approve → status: PENDING_ACCOUNTING
8. Accounting approve → status: PENDING_FINAL_REVIEW
9. Final approve → status: APPROVED

### Persistencia Verificada

| Prueba | Resultado |
|--------|-----------|
| Crear solicitud via API | PASS |
| Listar solicitudes | PASS |
| Reiniciar backend → persiste | PASS |
| Reiniciar frontend → persiste | PASS |
| Workflow avanza correctamente | PASS |
| Solicitud aparece en Almacén | PASS |
| Clasificación genera código | PASS |
| Contabilidad puede aprobar | PASS |

### Operaciones que Siguen siendo MOCK

| Operación | Estado |
|-----------|--------|
| Importaciones | MOCK (sin backend) |
| Matching | MOCK (sin backend) |
| Data Quality | MOCK (sin backend) |
| Notificaciones | MOCK (sin backend) |
