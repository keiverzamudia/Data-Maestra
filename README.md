# Master Data & Homologación de Artículos — OpenCode Starter Kit

Este paquete prepara un proyecto para homologar artículos provenientes de múltiples empresas/instancias de Profit Plus 2K8.

## Objetivo
- Importar/leer datos de Profit sin modificar el ERP durante la primera fase.
- Normalizar y homologar artículos.
- Crear un código maestro universal.
- Relacionar múltiples códigos Profit con un mismo artículo maestro.
- Implementar flujo de solicitud → gerente → almacén → contabilidad → control final.
- Mantener trazabilidad y auditoría.

## Stack objetivo
- Backend: Node.js + TypeScript + NestJS
- Frontend: React + TypeScript + Vite
- DB: PostgreSQL
- ORM: Prisma
- API: REST
- Validación: Zod en frontend / class-validator o DTO validation en backend
- Tests: Vitest/Jest + Playwright
- Monorepo: pnpm workspaces

## Regla de Fase 0
No crear lógica de negocio ni integración real con Profit. Solo arquitectura, documentación, modelo de datos, contratos y decisiones técnicas.

## Instalación
1. Extraer el contenido en la raíz del repositorio.
2. Revisar `AGENTS.md`.
3. Revisar `docs/architecture.md`.
4. Revisar `db/schema.sql`.
5. Ejecutar OpenCode desde la raíz.
6. Usar `prompts/phase-00.md` como primer prompt.
