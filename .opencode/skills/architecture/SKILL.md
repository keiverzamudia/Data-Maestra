---
name: architecture
description: Mantener la arquitectura modular del sistema de Data Master con separación de responsabilidades, contratos y dependencias controladas.
compatibility: opencode
---

# Architecture Skill

## Principios
- Modular monolith antes que microservicios.
- Dependencias dirigidas hacia contratos estables.
- Presentation no contiene reglas de negocio.
- Application coordina casos de uso.
- Domain contiene invariantes.
- Infrastructure implementa persistencia e integraciones.
- Profit siempre detrás de un adapter.

## Reglas
- Cada módulo expone un API interno claro.
- No importar repositorios de otro módulo directamente.
- Evitar dependencias circulares.
- Preferir interfaces para integraciones externas.
- No mezclar DTOs HTTP con entidades de dominio.
- No usar `any` salvo justificación documentada.

## Antes de implementar
Crear un plan y señalar:
1. módulo;
2. capas afectadas;
3. dependencias;
4. cambios de DB;
5. riesgos;
6. pruebas.
