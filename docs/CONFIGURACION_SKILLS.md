# Configuración de Skills — Data-Maestra

## 1. Skills instaladas (16)

| Skill | Origen | Fecha | Tipo |
|-------|--------|-------|------|
| improve-codebase-architecture | mattpocock/skills@main | 2026-09-02 | Externa — reemplaza `architecture` |
| agent-browser | vercel-labs/agent-browser@main | 2026-09-02 | Externa |
| create-agent-tests | custom (spec fase) | 2026-09-02 | Externa/custom |
| diagnose | mattpocock/skills (diagnosing-bugs) @main | 2026-09-02 | Externa |
| backend-nestjs | local | — | Dominio |
| frontend-react | local | — | Dominio |
| master-data | local | — | Dominio |
| matching-engine | local | — | Dominio |
| postgresql | local | — | Dominio |
| database-migrations | local | — | Dominio |
| profit-integration | local | — | Dominio |
| workflow-approval | local | — | Dominio |
| security | local | — | Dominio |
| ui-ux | local | — | Dominio |
| code-review | local | — | Calidad |
| testing | local | — | Calidad |

## 2. Para qué sirve cada una

- **improve-codebase-architecture:** Detecta acoplamiento, módulos superficiales/grandes, fricción de navegación, testabilidad. Presenta HTML report + grilling.
- **agent-browser:** Automatización navegador real (open, snapshot, click, screenshot) vía `agent-browser` CLI Rust.
- **create-agent-tests:** Crea pruebas de aceptación ejecutables con estados PASS/FAIL/BLOCKED/ABORTED y evidencia browser/API/DB/logs.
- **diagnose:** Diagnóstico de bugs duros: feedback loop → reproduce → hipótesis → instrumenta → fix + regresión → cleanup.
- **backend-nestjs / frontend-react / postgresql / database-migrations:** Arquitectura técnica existente.
- **master-data / matching-engine / profit-integration / workflow-approval:** Dominio del negocio.

## 3. Específicas de Data-Maestra (12)

`backend-nestjs, frontend-react, master-data, matching-engine, postgresql, database-migrations, profit-integration, workflow-approval, security, ui-ux, code-review, testing` — conservadas sin cambios.

## 4. Externas/genéricas (4)

`improve-codebase-architecture, agent-browser, create-agent-tests, diagnose`

## 5. Reemplazo architecture

`architecture` (local 33 líneas, principios genéricos) → `improve-codebase-architecture` (71 líneas, mattpocock/skills, reporte HTML, deletion test, CONTEXT.md). Verificado: SKILL.md válido, sin dependencias rotas, OpenCode puede leerla. Eliminada `architecture` solo después de verificación.

## 6. Qué hace agent-browser

Ver §2. Usar `agent-browser skills get core` para workflow. Preferir sobre herramientas browser nativas. Requiere `npm i -g agent-browser`.

## 7. Qué hace create-agent-tests

Ver §2. Estados claros + evidencia verificable. Útil para flujos `DRAFT→PENDING_MANAGER`, `RETURN` de contabilidad, `Autoriza: María García`.

## 8. Qué hace diagnose

Diagnose loop 6 fases. Regla: no hipotetizar sin feedback loop rojo. Ver §2.

## 9. Qué skills NO se instalaron y por qué

- `tdd`, `setup-matt-pocock-skills`: duplican `testing`.
- `frontend-design`, `vercel-react-best-practices`, `webapp-testing`: duplican `frontend-react`/`ui-ux`/`create-agent-tests`/`agent-browser`.
- OWASP extras, `matt-pocock-skills` genéricos: duplican `security`/`code-review`.
- `skills adicionales OWASP` genérica: ya cubierto.

## 10. Cómo resolver conflictos

Ver `AGENTS.md §16 PRECEDENCIA DE SKILLS` (1-8). Skill externa nunca contradice regla específica de Data-Maestra. Prioridad conceptual: Dominio > Arquitectura > Calidad > Seguridad > UI > Navegador.

## 11. Orden de precedencia

1 Código → 2 Prisma/config → 3 Tests → 4 AGENTS.md → 5 Skills Data-Maestra → 6 Skills externas → 7 Docs actual → 8 Docs histórica.

## 12. Qué skill usar por tarea

| Tarea | Skill |
|-------|-------|
| Refactor arquitectura, detectar shallow modules | improve-codebase-architecture |
| Abrir página, click, screenshot, QA | agent-browser |
| Crear test de aceptación ejecutable | create-agent-tests |
| Bug que no reproduce a primera vista | diagnose |
| MDM, matching, Profit, workflow | master-data / matching-engine / profit-integration / workflow-approval |
| NestJS, React, PostgreSQL, migrations | backend-nestjs, frontend-react, postgresql, database-migrations |
| Review | code-review |
| Seguridad/RBAC | security |
