---
name: testing
description: Diseñar pruebas unitarias, integración y E2E para garantizar que módulos y workflows no se rompan.
compatibility: opencode
---

# Testing

## Pirámide
- Unit tests para reglas y casos de uso.
- Integration tests para DB/adapters.
- E2E para workflows críticos.

## Casos críticos
- creación de solicitud;
- aprobación/rechazo;
- devolución;
- segregación de funciones;
- duplicado de códigos;
- mapping Profit → master;
- merge de artículos;
- score de matching;
- auditoría;
- permisos.

## Regla
Una funcionalidad no está terminada si carece de pruebas apropiadas.

## Fixtures
Usar datos sintéticos.
Nunca usar credenciales reales.
No ejecutar tests destructivos sobre Profit.
