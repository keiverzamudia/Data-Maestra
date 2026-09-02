# Auditoría de Skills Actuales — Data-Maestra

Fecha: 2026-09-02 • 13 SKILL.md analizados en `.opencode/skills` — solo lectura, sin modificaciones

---

## 1. architecture

**Objetivo:** Mantener arquitectura modular del sistema Data Master con separación de responsabilidades, contratos y dependencias controladas.

**Cuándo activarse:** Antes de crear/editar cualquier módulo, capa, dependencia o integración. Obligatorio en fase de planificación.

**Reglas principales:**
- Modular monolith, dependencias hacia contratos estables
- Presentation sin negocio; Application coordina casos de uso; Domain invariantes; Infrastructure persistencia
- Profit siempre detrás de adapter
- Cada módulo expone API interno, sin circulares, sin `any` injustificado, sin mezclar DTOs con entidades

**Herramientas/procesos que controla:** Definición de módulos/capas, contratos, adapter de integraciones, plan previo (módulo, capas, dependencias, DB, riesgos, pruebas)

**Qué problemas cubre:** Acoplamiento, fuga de responsabilidades, dependencias circulares, integración directa a Profit, contratos inestables

**Capacidades que parecen faltar:** No define versionado de contratos, no detalla estrategia de modularización física (pnpm workspaces `apps/*` vs `packages/*`), no cubre observabilidad (logs/metrics) por capa

---

## 2. backend-nestjs

**Objetivo:** Desarrollar backend NestJS TypeScript con módulos, casos de uso, DTOs, validación, guards, errores y pruebas.

**Cuándo activarse:** Al crear/editar controllers, use-cases, DTOs, guards, módulos NestJS

**Reglas principales:**
- Controllers delgados, casos de uso explícitos, DTOs frontera, validación en frontera, errores dominio ≠ HTTP, DI, transacciones, OpenAPI
- No SQL en controllers, no Prisma directo en controllers, no acceso Profit desde controllers, no matching en endpoints

**Herramientas/procesos que controla:** Estructura `presentation/application/domain/infrastructure`, NestJS modules, DTO validation, guards, transacciones

**Qué problemas cubre:** Fat controllers, validación tardía, mezcla de capas, endpoints con lógica de negocio

**Capacidades que parecen faltar:** No menciona `ConfigModule`, `PrismaModule` pattern actual del proyecto, no cubre manejo de `WorkflowTask` idempotencia ni generación de `masterCode`, no detalla paginación/filtros REST

---

## 3. code-review

**Objetivo:** Revisar cambios por arquitectura, seguridad, calidad, rendimiento, pruebas y cumplimiento de AGENTS.md

**Cuándo activarse:** Tras cualquier diff, antes de merge, como checklist externo

**Reglas principales:**
- Orden: funcionales → arquitectura → seguridad → integridad → concurrencia/idempotencia → rendimiento → tests → mantenibilidad
- Checklist AGENTS.md, invasión de módulo, modificación accidental de Profit, SQL inseguro, falta de constraints/auditoría/autorización/tests

**Herramientas/procesos que controla:** Review checklist, no modifica código salvo pedido explícito

**Qué problemas cubre:** Regresiones, violaciones de `AGENTS.md`, seguridad, deuda de tests

**Capacidades que parecen faltar:** No define severidad (critical/major/minor), no automatiza revisión (lint), no cubre revisión de frontend ni de docs

---

## 4. database-migrations

**Objetivo:** Gestionar evolución segura del esquema PostgreSQL mediante Prisma migrations y revisión de impacto

**Cuándo activarse:** Antes de `prisma db push` / `migrate`, al añadir `sourceSystem/sourceCode` o nuevos campos

**Reglas principales:**
- Toda modificación requiere migration, revisar índices/FK, impacto datos, evitar destructivo en un paso, expand-and-contract, documentar riesgo, seed solo catálogo no sensible

**Herramientas/procesos que controla:** Prisma migrations, revisión de impacto, estrategia expand-and-contract

**Qué problemas cubre:** Pérdida de datos, `DROP TABLE` en prod, migración sin auditoría

**Capacidades que parecen faltar:** No menciona `db push` sin historial usado actualmente (SQLite dev), no diferencia SQLite dev vs PostgreSQL prod, no cubre `sourceSystem` nullable + unique parcial

---

## 5. frontend-react

**Objetivo:** Construir frontend React TypeScript modular, accesible y mantenible para solicitudes, aprobaciones, homologación y Data Master

**Cuándo activarse:** Al crear/editar páginas, features, componentes, servicios API, hooks

**Reglas principales:**
- Stack Vite + Hook Form + Zod + TanStack Query; separar páginas/features/componentes/servicios; server state con Query; validación con esquema; no duplicar reglas backend; loading/empty/error/success obligatorios; confirmar acciones destructivas

**Herramientas/procesos que controla:** Estructura frontend, formularios, bandejas (estado, responsable, antigüedad, prioridad, coincidencias), checks visuales sin depender solo de color

**Qué problemas cubre:** Duplicación de lógica, UX inconsistente, formularios sin validación, bandejas incompletas

**Capacidades que parecen faltar:** No detalla `VITE_DATA_MODE` switch, `useOrganizacion` sin `companyId`, `managerId` resolución, manejo de `referencePhotoUri` / `ImageLightbox`, no cubre `react-router` ni `CompanyContext`

---

## 6. master-data

**Objetivo:** Aplicar principios de MDM para artículos homologados, códigos maestros, alias, atributos y relaciones con múltiples fuentes

**Cuándo activarse:** Al diseñar `master_item`, códigos `original→maestro`, alias, atributos, mapping fuente-maestro

**Reglas principales:**
- Distinguir código/descripción original vs normalizada vs maestra; 1 maestro ↔ N fuentes; invariantes: no doble puntero activo, no duplicado por mayúsculas, no fusión sin trazabilidad; estados ACTIVE/INACTIVE/MERGED/PENDING_REVIEW/REJECTED

**Herramientas/procesos que controla:** Diseño de entidad central `master_item`, mapping, invariantes

**Qué problemas cubre:** Duplicados triviales, doble maestro activo, fusiones sin historial

**Capacidades que parecen faltar:** No detalla `sourceSystem/sourceCode` actual (PROFIT), no cubre `masterCode` generación `RVHCAU-00001`, no menciona `CatalogGroup/Subgroup` como origen del código

---

## 7. matching-engine

**Objetivo:** Diseñar matching híbrido y explicable para detectar artículos equivalentes sin fusionar falsos positivos

**Cuándo activarse:** Al implementar pipeline de normalización → exact → fabricante → atributos → fuzzy → exclusión → score

**Reglas principales:**
- Pesos configurables en DB (no hardcodeados); ejemplo 40% part number, 15% marca/modelo, etc. (hipótesis); alta/media/baja confianza; nunca afirmar igualdad solo por texto; explicabilidad campo a campo

**Herramientas/procesos que controla:** Pipeline 8 pasos, scoring, revisión humana

**Qué problemas cubre:** Falsos positivos, fusión automática por similitud, falta de explicabilidad

**Capacidades que parecen faltar:** No hay código de matching implementado aún; no detalla integración con `catalogo_limpio.csv` (38/179), no cubre entrenamiento/calibración con datos reales Profit

---

## 8. postgresql

**Objetivo:** Diseñar PostgreSQL para Data Master con integridad, auditoría, índices, constraints, UUID y migraciones seguras

**Cuándo activarse:** Al diseñar tablas, FK, índices, UUID vs códigos de negocio, separación staging/normalizado/maestro

**Reglas principales:**
- PostgreSQL fuente de verdad; UUID interno, códigos negocio separados; FK explícitas, unique, timestamptz, soft delete condicional, índices; separación datos crudos/normalizados/maestro/mapping

**Herramientas/procesos que controla:** Diseño relacional, constraints, índices, migraciones reversibles

**Qué problemas cubre:** Integridad referencial, duplicados, búsqueda lenta, secretos en DB

**Capacidades que parecen faltar:** Proyecto usa SQLite dev (`file:../data/dev.db`) — skill asume PostgreSQL; no cubre divergencia SQLite/PostgreSQL (GIN, partial indexes), no menciona `source_system` nullable

---

## 9. profit-integration

**Objetivo:** Aislar integración con Profit Plus 2K8 mediante adapters, lectura segura, staging y contratos independientes del esquema legacy

**Cuándo activarse:** Antes de tocar `dbo.art`, `lin_art`, `sub_lin`, `unidades` o cualquier `PROFIT_DB_*`

**Reglas principales:**
- Fase1 READ-ONLY; arquitectura Frontend→API→Profit App Service→ProfitAdapter→fuente; no asumir tablas; inspeccionar esquema real primero; staging antes de homologar; escritura futura con adapter separado, idempotencia, dry-run, auditoría, rollback

**Herramientas/procesos que controla:** Adapter pattern, perfiles por empresa, `source_company_id`, staging, validación de escritura

**Qué problemas cubre:** Modificación accidental de AD_DIST, mezcla de empresas, contrato acoplado a legacy, escritura sin permiso

**Capacidades que parecen faltar:** Ya cubierto por `PROFIT_TEST` de 7D pero skill no detalla `PROFIT_WRITE_ENABLED` protección, timeouts 5s/10s, ni endpoints `GET /profit/*` implementados en 7E

---

## 10. security

**Objetivo:** Aplicar seguridad empresarial, RBAC, segregación de funciones, validación, auditoría y protección de credenciales

**Cuándo activarse:** Al tocar auth, `rbac.guard.ts`, `require-permission`, `Approval.actorId`, upload de imágenes, rate limit

**Reglas principales:**
- Least privilege, RBAC, server-side validation, no confiar en frontend, no logear passwords, no devolver secretos, sanitizar MIME/tamaño, IDOR check, segregar autoaprobación/etapa no asignada/modificación sin permiso; credenciales Profit mínimo privilegio

**Herramientas/procesos que controla:** Guards, decorators, validación, auditoría de aprobaciones

**Qué problemas cubre:** IDOR, autoaprobación, escalada de privilegios, credenciales expuestas

**Capacidades que parecen faltar:** No cubre caso específico `department.managerId = null` → `Autoriza: —`, no detalla `UserRole` por `companyId`, no menciona `referencePhotoUri` / `/uploads` protección

---

## 11. testing

**Objetivo:** Diseñar pruebas unitarias, integración y E2E para garantizar que módulos y workflows no se rompan

**Cuándo activarse:** Al añadir funcionalidad sin pruebas, antes de marcar Definition of Done

**Reglas principales:**
- Pirámide unit (reglas/casos) → integration (DB/adapter) → E2E (workflows críticos); casos: creación, aprobación/rechazo/devolución, segregación, duplicado códigos, mapping Profit→master, merge, score, auditoría, permisos; fixtures sintéticos, sin credenciales reales, sin destructivo sobre Profit

**Herramientas/procesos que controla:** Vitest, E2E (Playwright futuro), fixtures

**Qué problemas cubre:** Regresión de workflow, falta de cobertura de `RETURN` → duplicado `WorkflowTask`, `findOne` sin `managerId`

**Capacidades que parecen faltar:** No menciona `vitest` con `pnpm --filter`, `mssql` mocking con `request.input`, no cubre `catalog-import` idempotencia ni `ProfitAdapter` timeout tests

---

## 12. ui-ux

**Objetivo:** Diseñar UX para bandejas, modales, formularios y aprobaciones empresariales con claridad, trazabilidad y prevención de errores

**Cuándo activarse:** Al diseñar bandejas, modales de revisión, formularios de clasificación

**Reglas principales:**
- Bandejas muestran código, artículo, solicitante, departamento, estado, fecha, responsable, prioridad; modal orden: original→normalizada→sugerencia maestro→editables→validaciones→historial→acciones; no ocultar info crítica, confirmar irreversibles, texto además de color, responsive

**Herramientas/procesos que controla:** Layout de bandejas y modales

**Qué problemas cubre:** Información oculta, acciones irreversibles sin confirmación, dependencia solo de color, inconsistencia de estados

**Capacidades que parecen faltar:** No detalla `WorkflowTimeline` 5/7 pasos, `Autoriza: —` vs `María García`, `AnalyzerPanel` confidence, `ImageLightbox` compressed webp

---

## 13. workflow-approval

**Objetivo:** Diseñar workflows de solicitudes y aprobaciones configurables por etapas, departamentos, roles y reglas de segregación

**Cuándo activarse:** Al tocar `solicitud.service.getNextStatus`, `WorkflowInstance/Task/History`, `Approval`, transiciones

**Reglas principales:**
- Configurable, estados explícitos, transiciones controladas, auditoría por transición, rechazo no elimina, devolución con motivo, segregación configurable, no aprobar fuera de orden

**Herramientas/procesos que controla:** Entidades `workflow_definition/step/instance`, `approval`, `approval_action`, `assignment`

**Qué problemas cubre:** Workflow hardcodeado, falta de auditoría, devolución sin motivo, aprobación fuera de orden

**Capacidades que parecen faltar:** No documenta `WAREHOUSE_APPROVED` intermedio, no detalla `PENDING_MASTER/FINAL_APPROVED/PROFIT_*` de 7C, no cubre reactivación `WorkflowTask` tras `RETURN` (ya implementado en 7B)

---

## Tabla final

| Skill | Cobertura | Posibles solapamientos | Capacidades faltantes |
|-------|-----------|------------------------|-----------------------|
| architecture | Alta — modular monolith, capas, adapter | backend-nestjs (capas), postgresql (separación), profit-integration (adapter) | Versionado contratos, pnpm workspaces `apps/*`, observabilidad |
| backend-nestjs | Alta — NestJS módulos, DTOs, guards | architecture (capas), code-review (checklist) | `WorkflowTask` reactivación, `masterCode` race, paginación |
| code-review | Media — checklist 8 pasos | Todas (es transversal) | Severidad, automatización, frontend/docs |
| database-migrations | Media — Prisma migrations | postgresql (migraciones) | `db push` sin historial actual, `sourceSystem` nullable |
| frontend-react | Media — React/Vite/Query | ui-ux (bandejas), security (validación) | `VITE_DATA_MODE` switch, `managerId` resolución, `ImageLightbox` |
| master-data | Alta — MDM invariantes | matching-engine (duplicados), postgresql (mapping) | `sourceSystem=PROFIT`, `masterCode` generación |
| matching-engine | Baja — diseño sin código | master-data (duplicados) | Integración con `catalogo_limpio.csv`, calibración |
| postgresql | Media — integridad, UUID, FK | database-migrations, architecture | SQLite dev divergencia |
| profit-integration | Alta — READ-ONLY, adapter, staging | architecture (adapter), security (credenciales) | `PROFIT_WRITE_ENABLED` protección, timeouts, `GET /profit/*` |
| security | Alta — RBAC, IDOR, segregación | workflow-approval (segregación), profit-integration (credenciales) | `managerId=null` → `—`, `/uploads` auth |
| testing | Media — pirámide, casos críticos | code-review (falta de tests) | `mssql` mock, `catalog-import` idempotencia, RETURN tests |
| ui-ux | Media — bandejas/modales | frontend-react (bandejas) | Timeline 7 pasos, `Autoriza` display |
| workflow-approval | Alta — estados, transiciones, auditoría | security (segregación), testing (E2E) | `WAREHOUSE_APPROVED`, `PENDING_MASTER`, reactivación task |

> Solo se creó `docs/AUDITORIA_SKILLS_ACTUALES.md`. Sin cambios en código, config, DB, workflow ni otros documentos.
