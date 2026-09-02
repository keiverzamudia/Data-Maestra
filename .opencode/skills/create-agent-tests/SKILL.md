---
name: create-agent-tests
description: Create executable acceptance tests for agents with clear states PASS, FAIL, BLOCKED, ABORTED and verifiable evidence via browser, API, DB and logs. Use when the user needs to verify Data-Maestra flows, create regression tests, or validate UI/API behavior.
compatibility: opencode
---

# Create Agent Tests

Create **executable acceptance tests** that an agent can run and report with unambiguous states.

## States

- **PASS** — All assertions green, evidence captured
- **FAIL** — Assertion red, reproducible, evidence shows mismatch
- **BLOCKED** — Cannot run (missing env, data, permission, service down)
- **ABORTED** — Test aborted by user or timeout, incomplete

## Evidence

Every verdict must include verifiable evidence from at least one of:

- **Browser** — `agent-browser` snapshot + screenshot + console
- **API** — `curl` request + response status/body
- **DB** — `SELECT` result via Prisma or sqlcmd
- **Logs** — `api.log` / `api.err.log` relevant lines

## Process

1. **Scope** — Identify the flow (e.g., `PENDING_MANAGER → APPROVE → PENDING_WAREHOUSE`), the entry URL, and the actor (`u2` Gerente, `u3` Almacén, etc.)
2. **Design** — Write a markdown test file under `tests/agent/<feature>.md` or `apps/api/test/<feature>.agent.spec.ts` with: `Preconditions`, `Steps`, `Expected`, `Evidence`
3. **Implement** — Provide runnable script (Playwright, `agent-browser` sequence, or `curl` + `sqlcmd`) that an agent can execute via `bash`
4. **Run** — Execute once, capture evidence, assign PASS/FAIL/BLOCKED/ABORTED
5. **Report** — Append result table to the test file: `| Run | Status | Evidence |`

## Template

```md
# Agent Test: Aprobar solicitud como Gerente

**Actors:** u2 María García (DEPARTMENT_MANAGER) — company c1
**Preconditions:** Solicitud REQ-0036 en PENDING_MANAGER, DB has managerId u2 for d1

**Steps:**
1. `agent-browser open http://localhost:5173/approvals`
2. Snapshot → click @eRef of REQ-0036 Ver
3. Assert `Autoriza: María García` visible
4. Click Aprobar → assert `Status: PENDING_WAREHOUSE`
5. API `GET /requests/:id` → `status=PENDING_WAREHOUSE`
6. DB `SELECT status FROM requests WHERE id=:id` = PENDING_WAREHOUSE

**Verdict:** PASS if all 6 green else FAIL. BLOCKED if health !=200.
```

## Rules

- Prefer real Data-Maestra data (use `seed.js` users, REQ-* examples)
- Tag tests with `agent:` prefix for discovery (`agent: approvals`, `agent: warehouse-approve`)
- Never mock the behavior under test; only mock Profit if unavailable
- For Data-Maestra, always verify via **two evidences** (e.g., browser screenshot + API JSON)

## Data-Maestra flows to cover

- `DRAFT → PENDING_MANAGER` (solicitante creates)
- `PENDING_MANAGER → PENDING_WAREHOUSE` (gerente approves) — verify `Autoriza`
- `PENDING_WAREHOUSE → WAREHOUSE_APPROVED → PENDING_ACCOUNTING` (almacén)
- `PENDING_ACCOUNTING → RETURN → PENDING_WAREHOUSE` (contabilidad devuelve)
- `PENDING_WAREHOUSE → APPROVE` after RETURN (no duplicate WorkflowTask)

No modificar producción. Si PROFIT_DB no disponible, mark BLOCKED with reason.
