---
name: security
description: Aplicar seguridad empresarial, RBAC, segregación de funciones, validación, auditoría y protección de credenciales.
compatibility: opencode
---

# Security

## Reglas
- Least privilege.
- RBAC.
- Validación server-side siempre.
- No confiar en permisos del frontend.
- No guardar passwords en logs.
- No devolver secretos en respuestas.
- Sanitizar archivos y validar MIME/tamaño.
- Rate limit en endpoints sensibles.
- Auditoría de aprobaciones y cambios de maestro.
- Protección contra IDOR verificando autorización sobre cada recurso.

## Segregación
El sistema debe poder impedir:
- autoaprobación;
- aprobar etapas no asignadas;
- modificar un maestro sin permiso;
- modificar configuraciones críticas sin permiso.

## Integración Profit
Las credenciales de lectura deben tener mínimo privilegio.
