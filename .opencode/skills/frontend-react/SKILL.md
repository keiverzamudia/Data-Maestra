---
name: frontend-react
description: Construir frontend React TypeScript modular, accesible y mantenible para solicitudes, aprobaciones, homologación y Data Master.
compatibility: opencode
---

# Frontend React

## Stack
React + TypeScript + Vite.
Preferir React Hook Form, Zod, TanStack Query y componentes reutilizables.

## Principios
- Separar páginas, features, componentes y servicios API.
- Server state con TanStack Query.
- Formularios con esquema de validación.
- No duplicar reglas de negocio del backend.
- Loading, empty, error y success states obligatorios.
- Confirmaciones para acciones destructivas o irreversibles.
- Accesibilidad y navegación por teclado.

## UX
Las bandejas de aprobación deben mostrar:
- estado;
- responsable actual;
- antigüedad;
- prioridad;
- coincidencias detectadas;
- historial;
- acciones permitidas según rol.

Los checks de Almacén/Contabilidad deben ser visualmente claros y no depender únicamente del color.
