---
name: backend-nestjs
description: Desarrollar backend NestJS TypeScript con módulos, casos de uso, DTOs, validación, guards, errores y pruebas.
compatibility: opencode
---

# Backend NestJS

## Estructura
Cada módulo debe poder organizarse como:
- presentation/controllers
- application/use-cases
- application/dtos
- domain/entities
- domain/services
- infrastructure/repositories
- infrastructure/adapters

## Reglas
- Controllers delgados.
- Casos de uso explícitos.
- DTOs para entrada/salida HTTP.
- Validación en frontera.
- Errores de dominio separados de errores HTTP.
- Inyección de dependencias.
- Transacciones para operaciones que cambien varias entidades.
- OpenAPI para contratos públicos.

## No hacer
- SQL en controllers.
- Acceso directo a Prisma desde controllers.
- Acceso a Profit desde controllers.
- Lógica de matching dentro de endpoints.
