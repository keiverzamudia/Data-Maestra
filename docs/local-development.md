# Data-Maestra — Desarrollo Local

## Requisitos

- Node.js >= 20
- pnpm >= 9

## Instalación

```bash
pnpm install
```

## Base de datos

SQLite ubicada en: `apps/api/data/dev.db`

Es persistente. NO borrar durante pruebas normales.

## Generar cliente Prisma

```bash
pnpm --filter @master-data/api run db:generate
```

Ejecutar solo una vez después de instalar dependencias o cambiar `schema.prisma`.

## Actualizar esquema

```bash
pnpm --filter @master-data/api run db:push
```

Ejecutar cuando se modifique `schema.prisma` y se quieran aplicar cambios a la DB.

## Poblar datos de prueba

```bash
pnpm --filter @master-data/api run db:seed
```

Crea: 1 empresa, 3 departamentos, 5 usuarios, 6 roles, catálogos.

## Iniciar todo (recomendado)

```bash
pnpm dev
```

Arranca simultáneamente:
- Frontend (Vite): http://localhost:5173
- Backend (NestJS): http://localhost:3001

## Iniciar individualmente

Backend:
```bash
pnpm --filter @master-data/api run dev
```

Frontend:
```bash
pnpm --filter @master-data/web run dev
```

## URLs

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3001 |
| Health | http://localhost:3001/api/v1/health |
| Swagger | http://localhost:3001/docs |

## Estructura de proxies

Vite (puerto 5173) redirige `/api/*` a NestJS (puerto 3001).

El frontend llama a `/api/v1/requests` y Vite lo envía a `http://localhost:3001/api/v1/requests`.

## Diagnóstico ECONNREFUSED

Si aparece `ECONNREFUSED` en consola de Vite, significa que el backend aún no está listo.

Verificar backend:
```powershell
Test-NetConnection localhost -Port 3001
Invoke-WebRequest http://localhost:3001/api/v1/health
```

Esperar a que NestJS termine de compilar y reintentar.

## Modo de datos

El frontend usa `VITE_DATA_MODE` en `apps/web/.env`:
- `api` = usa endpoints reales (SQLite)
- `mock` = usa datos en memoria

Actualmente configurado en `api`.

## Comandos útiles

```bash
# Ver datos en Prisma Studio
pnpm --filter @master-data/api run db:studio

# Resetear DB (borrar y recrear)
rm apps/api/data/dev.db
pnpm --filter @master-data/api run db:push
pnpm --filter @master-data/api run db:seed

# Build completo
pnpm build

# Tests
pnpm test
```
