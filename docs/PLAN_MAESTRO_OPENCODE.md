# PLAN MAESTRO DE EJECUCIÓN — DATA-MAESTRA
## Roadmap controlado para OpenCode — QA, MDM y Profit TEST

### Regla principal
OpenCode ejecuta **una sola fase por vez**. El usuario prueba el resultado y luego ordena explícitamente continuar.

Ciclo obligatorio:
1. Leer este plan y las fuentes de verdad.
2. Inspeccionar estado real.
3. Ejecutar únicamente la fase solicitada.
4. Validar.
5. Documentar.
6. Marcar COMPLETADA / BLOQUEADA / CON HALLAZGOS.
7. Detenerse.

Nunca asumir autorización para avanzar automáticamente.

### Fuentes de verdad
1. Código actual.
2. Prisma/schema/configuración actual.
3. Configuración actual.
4. Tests actuales.
5. Documentación vigente.
6. Este plan.
7. Documentación histórica solo como contexto.

### Reglas no negociables
- `AD_DIST` = PRODUCCIÓN.
- Nunca escribir en `AD_DIST` durante este roadmap hasta una fase explícitamente autorizada.
- Profit permanece READ-ONLY hasta una fase de escritura autorizada.
- Toda escritura futura comienza en `PROFIT_TEST`.
- No crear `PROFIT_TEST` sin autorización/DBA.
- No inventar tablas o columnas de Profit.
- No ejecutar servidores persistentes en foreground desde OpenCode.
- No hacer cambios fuera de la fase.
- Después del reporte final: DETENERSE.

---

# ESTADO ACTUAL

Completado:
- Fases 1–6: auditoría, limpieza, normalización y documentación.
- 7A: catálogos Profit.
- 7B: workflow/rechazo/autorización.
- 7C: diseño Validación Maestra + Profit.
- 7E: ProfitAdapter READ-ONLY.
- 7G: QA real E2E.

7G:
- 16 casos.
- 10 PASS.
- 2 PASS negativos esperados.
- 1 PARCIAL.
- 2 FAIL.
- 2 BLOCKED.
- 11 hallazgos.
- Documento: `docs/QA_REAL_7G.md`.

Hallazgos prioritarios:
- CRÍTICO: E-02 Profit 404.
- ALTO: E-01 Validación Maestra inexistente.
- ALTO: E-03 status/stepCode inconsistente.
- ALTO: E-04 masterCode stale.
- MEDIO: E-05 observación frágil.
- MEDIO: E-06 analyzerProposals mock directo.
- MEDIO: E-07 imagen no E2E.
- MEDIO: E-08 endpoints obsoletos.
- BAJO/BLOCKED: E-09 navegador, E-10 responsive, E-11.

---

# MAPA DE FASES

```text
7G  QA REAL                         COMPLETADA
 ↓
7H  CORRECCIÓN P0/P1               COMPLETADA
 ↓
7I  CORRECCIÓN P2/P3               COMPLETADA
 ↓
7J  QA REAL DE REPETICIÓN          PENDIENTE
 ↓
8A  AUDITORÍA GLOBAL FINAL         PENDIENTE
 ↓
8B  PLAN FUNCIONAL MDM             PENDIENTE
 ↓
8C  IMPLEMENTACIÓN MDM APROBADA    PENDIENTE
 ↓
9A  PREPARAR PROFIT_TEST           PENDIENTE
 ↓
9B  VALIDAR PROFIT_TEST READ       PENDIENTE
 ↓
9C  DISEÑAR ESCRITURA              PENDIENTE
 ↓
9D  ESCRITURA CONTROLADA TEST      PENDIENTE
 ↓
9E  QA PROFIT TEST E2E              PENDIENTE
 ↓
10A PREPARACIÓN PRODUCCIÓN          PENDIENTE
 ↓
10B GO-LIVE CONTROLADO              PENDIENTE
```

---

# FASE 7H — CORRECCIÓN P0/P1

Corregir únicamente E-02, E-01, E-03 y E-04 de `docs/QA_REAL_7G.md`.

## E-02 Profit 404
- Inspeccionar rutas/controller/module/prefijo.
- Verificar GET real.
- Mantener exclusivamente READ.
- No agregar escritura.

## E-01 Validación Maestra
Implementar la etapa definida en `docs/DISEÑO_MASTER_PROFIT_7C.md`:
- etiqueta `Validación Maestra`.
- etapa real.
- checklist.
- rojo=incompleto, verde=completo.
- requisitos y conteo.
- solo lectura/validación.
- no editar grupo, subgrupo, descripción, marca, unidad ni código maestro.
- devolver al área responsable si existe inconsistencia.

## E-03
Unificar la fuente de verdad entre `status`, `stepCode`, `WorkflowTask`, timeline y frontend.

## E-04
Demostrar causa del `masterCode` obsoleto y corregir persistencia/refresco.

Validar tests, typecheck, build, health y Profit READ-ONLY.

Crear `docs/CIERRE_7H.md`.

Detenerse.

---

# FASE 7I — CORRECCIÓN P2/P3

Resolver:
- E-05 observación.
- E-06 mock directo analyzerProposals, solo si existe alternativa real.
- E-07 imagen de referencia E2E/preview.
- E-08 endpoints obsoletos.
- E-11.

No inventar servicios ni funcionalidades.

Validar tests, typecheck, build y health.

Crear `docs/CIERRE_7I.md`.

Detenerse.

---

# FASE 7J — REPETIR QA REAL

Repetir desde navegador cuando sea posible:
1. Solicitud.
2. Gerente.
3. Almacén.
4. Contabilidad.
5. Rechazo con comentario.
6. Regreso a Almacén.
7. Reclasificación.
8. Contabilidad.
9. Validación Maestra.
10. Aprobación Final.
11. estados/timeline.
12. imagen.
13. dashboard.
14. permisos.

Si `agent-browser` queda bloqueado, documentarlo; no afirmar QA UI real.

Criterio:
- cero P0/P1.
- P2/P3 resueltos o aceptados/documentados.

Crear `docs/QA_REAL_7J.md`.

Detenerse.

---

# FASE 8A — AUDITORÍA GLOBAL FINAL

Auditar:
- carpetas/nombres.
- AGENTS.
- skills.
- documentación.
- Prisma.
- servicios.
- frontend.
- workflow.
- RBAC.
- mocks.
- endpoints.
- uploads.
- tests.
- scripts.
- env.
- ProfitAdapter.
- deuda técnica.

No agregar funcionalidades.

Crear `docs/AUDITORIA_FINAL_8A.md`.
Actualizar `docs/MAPA_PROYECTO.md`.

Debe quedar claro qué existe, funciona, es futuro o depende del DBA.

Detenerse.

---

# FASE 8B — PLAN FUNCIONAL MDM

Auditar:
- catálogo maestro.
- grupos/subgrupos.
- clasificación.
- códigos/descripciones.
- duplicados.
- búsqueda.
- matching.
- calidad.
- auditoría.
- importaciones.

Clasificar cada punto:
- existente funcional.
- incompleto.
- inexistente y necesario.
- futuro/no prioritario.

Crear `docs/PLAN_FUNCIONAL_MDM_8B.md`.

NO implementar automáticamente.

Detenerse.

---

# FASE 8C — IMPLEMENTACIÓN MDM

Solo después de aprobación explícita del plan 8B.

Implementar únicamente funcionalidades aprobadas:
- normalización.
- duplicados.
- matching.
- calidad.
- propuestas.
- aprobación.

Cada cambio debe incluir tests y documentación.

Detenerse por subfase.

---

# FASE 9A — PREPARAR PROFIT_TEST

Dependencia externa: DBA/usuario debe crear `AD_DIST_TEST` o `PROFIT_TEST`.

Preferir backup/restore completo de AD_DIST.

No crear la base automáticamente.

Verificar:
- servidor/base.
- tablas.
- PK/FK.
- índices.
- triggers.
- catálogos.
- permisos.

Crear `docs/PROFIT_TEST_REQUISITOS_9A.md`.

Detenerse.

---

# FASE 9B — PROFIT_TEST READ-ONLY

Usar configuración equivalente a:

```env
PROFIT_DB_SERVER=SRVBDPROFITBK
PROFIT_DB_DATABASE=PROFIT_TEST
PROFIT_ENV=test
PROFIT_WRITE_ENABLED=false
```

Validar conexión, artículos, grupos, subgrupos, unidades, detalles, errores y aislamiento.

Crear `docs/CIERRE_PROFIT_TEST_9B.md`.

Detenerse.

---

# FASE 9C — DISEÑO DE ESCRITURA

Antes de programar INSERT/UPDATE definir:
- mapping Data-Maestra → Profit.
- `co_art`.
- descripción.
- grupo/subgrupo.
- unidad.
- color/categoría/procedencia si aplica.
- campos obligatorios.
- unicidad.
- transacción/rollback.
- idempotencia.
- outbox.
- reintentos.
- auditoría.
- errores técnicos vs rechazo de negocio.

Estados:

```text
FINAL_APPROVED
 ↓
PROFIT_PROCESSING
 ↓
PROFIT_INSERTED
```

Error técnico:

```text
PROFIT_PROCESSING
 ↓
PROFIT_ERROR
```

`PROFIT_ERROR` no es rechazo de negocio.

Crear `docs/DISEÑO_ESCRITURA_PROFIT_9C.md`.

No implementar escritura.

Detenerse.

---

# FASE 9D — ESCRITURA CONTROLADA EN PROFIT_TEST

Solo con:
- `PROFIT_ENV=test`.
- `PROFIT_WRITE_ENABLED=true`.
- base inequívocamente PROFIT_TEST.
- protección contra AD_DIST.
- mapping aprobado.
- idempotencia.

Primera prueba: UN artículo.

Verificar:
1. solicitud aprobada.
2. outbox.
3. PROFIT_PROCESSING.
4. INSERT en PROFIT_TEST.
5. lectura posterior.
6. coincidencia.
7. PROFIT_INSERTED.
8. auditoría.
9. reintento sin duplicado.

Nunca AD_DIST.

Detenerse.

---

# FASE 9E — QA PROFIT_TEST E2E

Probar:
- artículo simple.
- opcionales.
- error.
- timeout.
- duplicado.
- reintento.
- idempotencia.
- rollback.
- auditoría.
- permisos.

Validar:
- error técnico → PROFIT_ERROR.
- rechazo de negocio → área responsable.
- no mezclar error técnico con rechazo.

Crear `docs/QA_PROFIT_TEST_9E.md`.

Detenerse.

---

# FASE 10A — PREPARACIÓN PRODUCCIÓN

No activar escritura.

Auditar:
- configuración.
- secretos.
- permisos.
- protección AD_DIST.
- logs.
- auditoría.
- backups.
- rollback.
- monitoreo.
- outbox.
- idempotencia.

Crear `docs/CHECKLIST_PRODUCCION_10A.md`.

Requiere aprobación explícita.

Detenerse.

---

# FASE 10B — GO-LIVE CONTROLADO

Solo después de aprobación explícita.

Requisitos:
- backup.
- ventana de cambio.
- rollback.
- mapping aprobado.
- usuario autorizado.
- doble confirmación de producción.
- escritura controlada.

Primera escritura real: UN artículo autorizado.

Verificar Profit, Data-Maestra, auditoría, outbox e idempotencia.

No ejecutar carga masiva sin autorización.

Detenerse.

---

# FORMATO OBLIGATORIO DE CIERRE

```text
FASE:
[ID]

ESTADO:
COMPLETADA / BLOQUEADA / CON HALLAZGOS

OBJETIVO:
[...]

REALIZADO:
[...]

ARCHIVOS CREADOS:
[...]

ARCHIVOS MODIFICADOS:
[...]

ARCHIVOS ELIMINADOS:
[...]

BASE DE DATOS:
[...]

PROFIT:
[...]

TESTS:
[...]

TYPECHECK:
[...]

BUILD:
[...]

HEALTH:
[...]

HALLAZGOS:
[...]

PENDIENTES:
[...]

PRÓXIMA FASE:
[...]

CAMBIOS DE CÓDIGO:
SI / NO

DETENIDO:
SI
```

# REGISTRO DE PROGRESO

| Fase | Estado | Evidencia |
|---|---|---|
| 7G | COMPLETADA | docs/QA_REAL_7G.md |
| 7H | PENDIENTE | — |
| 7I | PENDIENTE | — |
| 7J | PENDIENTE | — |
| 8A | PENDIENTE | — |
| 8B | PENDIENTE | — |
| 8C | PENDIENTE | — |
| 9A | PENDIENTE | — |
| 9B | PENDIENTE | — |
| 9C | PENDIENTE | — |
| 9D | PENDIENTE | — |
| 9E | PENDIENTE | — |
| 10A | PENDIENTE | — |
| 10B | PENDIENTE | — |

El usuario puede ordenar:
- `ejecuta la siguiente fase`
- `ejecuta 7H`
- `ejecuta 8A`
- `repite 7J`

Si una dependencia crítica está BLOQUEADA, no saltarla silenciosamente.

## Filosofía

```text
SISTEMA ENTENDIBLE
 ↓
SISTEMA ESTABLE
 ↓
QA REAL
 ↓
MDM COMPLETO
 ↓
PROFIT TEST
 ↓
ESCRITURA SEGURA
 ↓
PRODUCCIÓN
```

La seguridad de Profit tiene prioridad sobre la velocidad.
