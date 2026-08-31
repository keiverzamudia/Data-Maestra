# FASE 4 — Conector Profit READ-ONLY y staging

Antes de escribir código de integración:
1. inspecciona el esquema real de Profit disponible en el entorno;
2. documenta tablas/campos confirmados;
3. no inventes nombres;
4. solicita acceso/credenciales si faltan.

Implementa un adapter READ-ONLY.

Pipeline:
Profit → Adapter → import_run → source_items.

Requisitos:
- idempotencia;
- múltiples empresas;
- logs;
- errores por fila;
- métricas de importación;
- no escribir en Profit.

Tests con fixture/simulador, no contra producción.
