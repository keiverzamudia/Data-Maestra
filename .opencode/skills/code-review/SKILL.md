---
name: code-review
description: Revisar cambios por arquitectura, seguridad, calidad, rendimiento, pruebas y cumplimiento de las reglas del proyecto.
compatibility: opencode
---

# Code Review

## Orden
1. errores funcionales;
2. violaciones arquitectónicas;
3. seguridad;
4. integridad de datos;
5. concurrencia/idempotencia;
6. rendimiento;
7. tests;
8. mantenibilidad.

## Checklist
- ¿Se respeta AGENTS.md?
- ¿El cambio invade otro módulo?
- ¿Se modificó Profit accidentalmente?
- ¿Hay SQL inseguro?
- ¿Faltan constraints?
- ¿Falta auditoría?
- ¿Falta autorización?
- ¿Hay tests?
- ¿Se documentó una decisión importante?

No modificar código durante una revisión salvo que el usuario lo solicite explícitamente.
