# Fase 0 — Entregables

OpenCode debe terminar Fase 0 con estos artefactos, sin lógica de negocio:

1. Architecture Decision Records (ADR):
   - modular monolith;
   - NestJS;
   - React;
   - PostgreSQL;
   - Prisma;
   - Profit adapter;
   - read-only inicial;
   - workflow configurable;
   - master item + source mapping;
   - matching híbrido.

2. Diagrama de arquitectura.

3. Diagrama ER.

4. Máquina de estados.

5. Matriz RBAC.

6. Contrato de integración Profit:
   - entradas;
   - salidas;
   - errores;
   - idempotencia;
   - read-only.

7. Contrato del matching:
   - input;
   - output;
   - score;
   - evidence;
   - algorithm_version.

8. Modelo de datos revisado.

9. Convenciones de nombres.

10. Plan de Fase 1.

11. Lista de preguntas bloqueantes sobre Profit.

## Condición de salida

No avanzar a Fase 1 hasta que:
- el modelo maestro esté aprobado;
- el workflow esté aprobado;
- los roles estén aprobados;
- la integración Profit tenga contrato;
- no existan ambigüedades críticas sin registrar.
