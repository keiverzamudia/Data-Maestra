# AGENTS.md — Master Data & Homologación de Artículos

## 1. Propósito

Este proyecto es una plataforma web para gestionar y homologar artículos de múltiples empresas/instancias de Profit Plus 2K8.

El sistema debe permitir:
1. importar/leer artículos desde Profit;
2. normalizar datos;
3. detectar posibles duplicados;
4. crear y mantener un artículo maestro;
5. relacionar códigos originales de cada empresa con el artículo maestro;
6. gestionar solicitudes nuevas mediante un workflow de aprobación;
7. completar información por departamentos;
8. mantener auditoría completa.

## 2. Regla crítica: Profit es un sistema externo

Durante las primeras fases:
- Profit es READ-ONLY.
- No ejecutar INSERT, UPDATE ni DELETE sobre Profit.
- No modificar tablas de Profit.
- No asumir nombres de tablas/campos de Profit sin evidencia real.
- La integración debe estar aislada detrás de un `ProfitAdapter`.
- Cualquier futura escritura en Profit requerirá una fase explícita, pruebas, permisos y aprobación.

## 3. Arquitectura

Usar un modular monolith con separación por módulos y capas:

- Presentation: controllers, DTOs, HTTP.
- Application: casos de uso y servicios.
- Domain: entidades, reglas e invariantes.
- Infrastructure: repositorios, Prisma, SQL Server/Profit adapter, almacenamiento externo.

No colocar lógica de negocio en controllers.
No colocar consultas SQL en controllers.
No importar módulos internos de otro módulo saltándose sus contratos públicos.

## 4. Stack

- Node.js
- TypeScript strict
- NestJS
- React + TypeScript + Vite
- PostgreSQL
- Prisma
- pnpm workspaces
- REST
- OpenAPI
- Vitest/Jest
- Playwright
- Docker Compose para desarrollo

## 5. Data Master

Un `master_item` representa la entidad homologada.

Un master item puede tener:
- muchos códigos de origen;
- muchos alias;
- muchos atributos;
- múltiples relaciones con Profit;
- historial de cambios.

Nunca eliminar físicamente un master item que haya sido utilizado en transacciones o relaciones históricas. Preferir estados como ACTIVE, INACTIVE, MERGED, REJECTED.

## 6. Matching

El matching debe ser híbrido:
1. normalización determinística;
2. coincidencia exacta;
3. coincidencia por atributos;
4. similitud textual/fuzzy;
5. opcionalmente IA/LLM como apoyo;
6. decisión final según reglas configurables y/o revisión humana.

Nunca fusionar automáticamente artículos únicamente porque sus descripciones son parecidas.

Los umbrales de confianza deben ser configurables.

## 7. Workflow

El flujo inicial previsto es:

DRAFT
→ PENDING_MANAGER
→ MANAGER_APPROVED
→ PENDING_WAREHOUSE
→ WAREHOUSE_APPROVED
→ PENDING_ACCOUNTING
→ ACCOUNTING_APPROVED
→ PENDING_FINAL_REVIEW
→ APPROVED
→ MASTER_ACTIVE

Debe existir rechazo/devolución sin borrar la solicitud.

El workflow debe ser configurable para poder agregar departamentos sin reescribir la aplicación.

## 8. Auditoría

Toda acción relevante debe generar audit log:
- creación;
- modificación;
- aprobación;
- rechazo;
- devolución;
- homologación;
- fusión;
- separación;
- importación;
- cambios de configuración;
- cambios de permisos.

Guardar usuario, fecha/hora, entidad, entidad_id, acción y diff cuando sea posible.

## 9. Seguridad

- RBAC.
- Validación de entrada.
- Protección contra SQL injection.
- No exponer credenciales.
- Secretos solamente mediante variables de entorno/secret manager.
- No registrar contraseñas, tokens ni credenciales de Profit.
- Principio de mínimo privilegio.
- Separar permisos de lectura y escritura.
- El usuario nunca puede aprobar su propia solicitud si las reglas de segregación de funciones lo prohíben.

## 10. Calidad

Toda funcionalidad debe incluir pruebas apropiadas.

Definition of Done:
- código tipado;
- validación;
- tests;
- documentación;
- migración si aplica;
- logs;
- manejo de errores;
- revisión de seguridad;
- no romper módulos existentes.

## 11. Fase 0

Fase 0 es exclusivamente de arquitectura y modelo.

NO crear:
- controllers funcionales;
- servicios de negocio;
- queries de Profit reales;
- lógica de matching;
- endpoints de negocio;
- UI funcional;
- sincronización real.

Sí se permite crear:
- documentación;
- diagramas Mermaid;
- estructura de carpetas;
- contratos/interfaces;
- esquema de DB;
- enums;
- ADRs;
- archivos de configuración base;
- ejemplos no ejecutables;
- tests de validación del esquema si son necesarios.

## 12. API RUNTIME — DO NOT MANAGE FROM AGENT

OpenCode **NO** debe iniciar, detener, reiniciar ni reconstruir la API automáticamente durante una tarea normal.

OpenCode **NO** debe ejecutar:
- `node apps/api/dist/main.js`
- `pnpm --filter @master-data/api dev`
- `nest start`
- `nest start --watch`
- `Start-Process ... node ...`
- `Start-Process ... -NoNewWindow`
- `taskkill /IM node.exe`
- `Stop-Process` sobre procesos Node sin identificación precisa
- Cualquier comando inline para administrar el ciclo de vida de la API

### Estado normal

La API debe considerarse un servicio externo al agente.

Antes de realizar pruebas que necesiten backend, OpenCode solamente debe verificar:

```
GET http://localhost:3001/api/v1/health
```

Si devuelve HTTP 200:
- **CONTINUAR INMEDIATAMENTE**
- NO reiniciar la API
- NO reconstruir la API
- NO detener la API
- NO ejecutar ningún proceso Node

### Si health falla

Si `http://localhost:3001/api/v1/health` NO devuelve HTTP 200:

- NO intentar solucionar automáticamente el problema iniciando Node
- NO ejecutar Start-Process
- NO ejecutar comandos background
- NO intentar matar procesos Node
- Detener la tarea y reportar:

```
API NO DISPONIBLE.

Ejecute manualmente:
.\scripts\api-restart.ps1

Cuando el health responda HTTP 200, indique a OpenCode que continúe.
```

### Verificación rápida

Después de cualquier cambio de código que afecte el backend:
1. Verificar `GET http://localhost:3001/api/v1/health`
2. Si responde 200, continuar
3. Si no responde, reportar y esperar

### Importante

El agente **NUNCA** debe esperar un proceso de servidor.
El agente **SOLO** puede ejecutar comprobaciones HTTP que terminen.
El servidor debe ser iniciado por el usuario o por un mecanismo externo al agente.
El objetivo de esta regla es evitar que una herramienta shell/background mantenga bloqueado el ciclo de razonamiento de OpenCode.

### Scripts disponibles (para uso del USUARIO, no del agente)

| Script | Uso |
|---|---|
| `scripts/api-restart.ps1` | Build + Stop + Start + Health |
| `scripts/api-start.ps1` | Solo iniciar API desacoplada |
| `scripts/api-stop.ps1` | Solo detener API en puerto 3001 |
| `scripts/api-health.ps1` | Solo verificar health |

### Debugging

Logs de la API:
- `apps/api/api.log` — stdout
- `apps/api/api.err.log` — stderr

## 13. Regla para OpenCode

Antes de modificar archivos:
1. leer AGENTS.md;
2. leer la documentación relevante;
3. identificar módulo afectado;
4. proponer plan;
5. ejecutar cambios pequeños;
6. verificar;
7. informar archivos modificados y decisiones.

No hacer refactors masivos no solicitados.
No introducir dependencias innecesarias.
No cambiar el stack sin justificarlo.

## 14. REGLA DE FINALIZACIÓN DE TAREAS

El agente debe considerar una tarea TERMINADA cuando:

1. Los cambios solicitados fueron implementados.
2. Los tests requeridos fueron ejecutados.
3. Typecheck/build/lint requeridos fueron ejecutados.
4. Si la tarea requiere API, health responde HTTP 200.
5. No quedan errores conocidos relacionados con la tarea.
6. Se puede entregar el informe final.

Cuando todos los criterios anteriores estén cumplidos:

- NO ejecutar más herramientas.
- NO volver a inspeccionar archivos.
- NO buscar problemas adicionales.
- NO hacer refactors adicionales.
- NO ejecutar otro test innecesariamente.
- NO reiniciar la API.
- NO volver a comprobar health repetidamente.
- NO intentar mejorar el código fuera del alcance.
- NO iniciar una nueva fase.
- NO continuar analizando la tarea.
- NO crear cambios adicionales.
- Entregar inmediatamente el informe final.
- TERMINAR LA EJECUCIÓN DEL AGENTE.

Especialmente:

Si una herramienta devuelve:

    API READY
    Health OK
    HTTP 200

y las demás validaciones de la tarea ya fueron completadas:

NO ejecutar ninguna herramienta adicional.

Ese resultado debe considerarse una señal de finalización.

## 15. FUENTES DE VERDAD DEL PROYECTO

Para determinar cómo funciona actualmente el sistema, utilizar este orden:

1. Código actual
2. Schema Prisma actual
3. Configuración actual
4. Tests actuales
5. Documentación vigente (`docs/MANUAL_DESARROLLADOR.md`, `docs/MAPA_PROYECTO.md`)
6. Documentación histórica (`docs/historial/fases/`) solamente como referencia

Los documentos en `docs/historial/fases/` NO representan necesariamente el comportamiento actual del sistema.
OpenCode no debe usar documentación histórica para implementar cambios actuales salvo que el usuario lo solicite explícitamente.
