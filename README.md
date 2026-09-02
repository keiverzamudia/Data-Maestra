# Data-Maestra

Plataforma web para gestionar y homologar artículos de múltiples empresas/instancias de Profit Plus 2K8.

## Stack

- Backend: Node.js + TypeScript + NestJS + Prisma + SQLite
- Frontend: React + TypeScript + Vite
- Testing: Vitest
- Monorepo: pnpm workspaces

## Inicio rápido

```bash
# Instalar dependencias
pnpm install

# Preparar base de datos
cd apps/api && npx prisma db push && npx prisma db seed && cd ../..

# Iniciar desarrollo
pnpm dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001
- Health: http://localhost:3001/api/v1/health
- Swagger: http://localhost:3001/docs

## Comandos

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Iniciar frontend + backend |
| `pnpm build` | Build completo |
| `pnpm test` | Ejecutar tests |
| `pnpm typecheck` | Verificar tipos |
| `pnpm lint` | Linting |

## Documentación

- **`docs/MANUAL_DESARROLLADOR.md`** — Manual completo del desarrollador
- **`docs/MAPA_PROYECTO.md`** — "¿Dónde está esto?"
- **`docs/FLUJO_DATOS.md`** — Flujo de datos y workflow
- **`docs/REGLAS_ARQUITECTURA.md`** — Reglas de arquitectura
- **`docs/GLOSARIO_PROYECTO.md`** — Glosario de términos
- **`docs/`** — Toda la documentación
- **`AGENTS.md`** — Reglas para OpenCode
