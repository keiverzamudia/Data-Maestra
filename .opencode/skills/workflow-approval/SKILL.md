---
name: workflow-approval
description: Diseñar workflows de solicitudes y aprobaciones configurables por etapas, departamentos, roles y reglas de segregación.
compatibility: opencode
---

# Workflow Approval

## Flujo inicial
Solicitante → Gerente → Almacén → Contabilidad → Control Final.

## Reglas
- Workflow configurable.
- Estados explícitos.
- Transiciones controladas.
- Cada transición genera auditoría.
- Rechazo no elimina.
- Devolución debe indicar motivo.
- Puede requerirse comentario.
- Separación de funciones configurable.
- No permitir aprobar una etapa fuera de orden salvo permiso especial.

## Entidades conceptuales
- workflow_definition
- workflow_step
- workflow_instance
- approval
- approval_action
- assignment
