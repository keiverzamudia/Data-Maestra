---
description: Ejecutar una fase del proyecto Data-Maestra
agent: desarrollador
---

# Comando /fase

Ejecuta la fase solicitada del proyecto Data-Maestra.

## Uso

```
/fase 7B
/fase 8A
```

## Instrucciones

1. Leer AGENTS.md completamente.
2. Leer documentación actual relevante (`docs/MANUAL_DESARROLLADOR.md`, `docs/MAPA_PROYECTO.md`).
3. Inspeccionar estado actual del código y la base de datos.
4. Determinar exactamente qué debe cambiar según el alcance solicitado.
5. Implementar únicamente el alcance solicitado — NO hacer refactors adicionales.
6. Ejecutar validaciones: tests, typecheck, build.
7. Si la tarea requiere API, comprobar health únicamente una vez.
8. Generar informe final con: archivos modificados, tests, validación.
9. **TERMINAR** — No ejecutar herramientas adicionales después del informe.

## Reglas

- No modificar lo que no se haya solicitado explícitamente.
- No crear documentación innecesaria.
- No iniciar/detener/reiniciar la API.
- Cuando las validaciones finales sean exitosas, no ejecutes ninguna herramienta adicional.
