---
name: diagnose
description: Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/failing/slow.
compatibility: opencode
---

# Diagnosing Bugs

A discipline for hard bugs. Skip phases only when explicitly justified. When exploring, read CONTEXT.md if exists and check ADRs.

## Phase 1: Build a feedback loop

A tight pass/fail signal for the bug (failing test, curl script, CLI, headless browser, trace replay, harness, fuzz, bisect). Tighten for speed, sharpness, determinism. Criterion: one command already run once, red-capable, deterministic, fast, agent-runnable.

## Phase 2: Reproduce + minimise

Run loop, confirm user symptom, minimise to smallest load-bearing repro.

## Phase 3: Hypothesise

Generate 3–5 ranked falsifiable hypotheses ("If X, then changing Y will..."), show to user.

## Phase 4: Instrument

One variable at a time. Tag logs `[DEBUG-xxxx]`. Debugger preferred over logs.

## Phase 5: Fix + regression test

Write regression test before fix if correct seam exists; otherwise note architecture gap (handoff to improve-codebase-architecture).

## Phase 6: Cleanup

Re-run loop (green), regression passes, remove [DEBUG-...], delete prototypes, state correct hypothesis in commit.

Note: If only diagnosis requested, stop after cause and propose fix — do not modify files without approval.

Source: https://github.com/mattpocock/skills/blob/main/skills/engineering/diagnosing-bugs/SKILL.md
