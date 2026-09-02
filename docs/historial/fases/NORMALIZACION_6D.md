# NORMALIZACIÓN GLOBAL — FASE 6D

Fecha: 2026-09-02
Estado: COMPLETADA

---

## 1. Estado Inicial

- 42 archivos en docs/ mezclando documentación vigente e histórica
- 2 directorios uploads/ duplicados (raíz y apps/api/)
- vite.config.js y vite.config.d.ts rastreados en git (archivos generados)
- Vitest config con aliases obsoletos (@shared, @config)
- Sin comando typecheck en raíz
- `pnpm test` fallaba por apps/web sin tests
- Documentación MAPA_PARA_DESARROLLADOR.md 100% duplicada

---

## 2. Cambios Realizados

### Archivos Generados
- Eliminados de git tracking: `vite.config.js`, `vite.config.d.ts`
- Agregados a .gitignore
- `tsconfig.node.tsbuildinfo` ya estaba correctamente ignorado

### Uploads
- 3 archivos únicos copiados de `uploads/` (raíz) a `apps/api/uploads/`
- `uploads/` (raíz) agregado a .gitignore
- `uploads/` (raíz) eliminado de git tracking (archivos conservados en disco)
- Ubicación oficial: `apps/api/uploads/requests/`

### Vitest
- Eliminados aliases obsoletos `@shared` y `@config` de `apps/api/vitest.config.ts`
- Alias `@` conservado (vigente)

### Comandos
- Agregado `typecheck` a `package.json` raíz
- Agregado `typecheck` a `apps/api/package.json`
- Agregado `typecheck` a `apps/web/package.json`
- Agregado `--passWithNoTests` a test de `apps/web/package.json`

### .gitignore
- Agregada sección para archivos generados de Vite
- Agregada sección para uploads/ raíz

---

## 3. Archivos Eliminados

| Archivo | Razón |
|---------|-------|
| docs/MAPA_PARA_DESARROLLADOR.md | 100% duplicado con MAPA_PROYECTO.md |

---

## 4. Archivos Movidos a docs/historial/fases/

| Archivo | Fase original |
|---------|---------------|
| AUDITORIA_ACTUAL.md | 6C |
| AUDITORIA_GLOBAL_6C.md | 6C |
| AUDITORIA_MANTENIBILIDAD_FASE_4D_2.md | 4D-2 |
| AUDITORIA_MOCKS_5A.md | 5A |
| PLAN_REESTRUCTURACION.md | 4A |
| VALIDACION_REESTRUCTURACION.md | 4A |
| REESTRUCTURACION_FASE_4B_1.md | 4B-1 |
| REESTRUCTURACION_FASE_4D_1B.md | 4D-1B |
| LIMPIEZA_FASE_3.md | 3 |
| MIGRACION_CATALOGOS_5B.md | 5B |
| MIGRACION_USUARIOS_EMPRESAS_5C.md | 5C |
| MIGRACION_5E_NOTIFICACIONES_PANEL.md | 5E |
| MIGRACION_IMPORTACIONES_5D.md | 5D |
| CIERRE_FASE_5F.md | 5F |
| PLAN_FASE_4B_1.md | 4B-1 |
| PLAN_FASE_4D_1.md | 4D-1 |
| phase-0-deliverables.md | 0 |
| VALIDACION_FASE_6A.md | 6A |

---

## 5. Archivos Fusionados/Renombrados

| Antes | Después | Razón |
|-------|---------|-------|
| MAPA_REAL_PROYECTO_6C.md | MAPA_PROYECTO.md | Nombre más limpio |

---

## 6. Archivos Conservados en docs/

23 archivos de documentación vigente se mantienen en `docs/`.

---

## 7. Uploads Normalizados

| Aspecto | Antes | Después |
|---------|-------|---------|
| Ubicaciones | 2 (raíz + apps/api/) | 1 (apps/api/) |
| Archivos en raíz | 9 (rastreados) | 9 (en disco, ignorados) |
| Archivos en api/ | 8 | 12 (3 copiados de raíz) |
| Total únicos | 15 | 12 |

---

## 8. Documentación Normalizada

| Métrica | Antes | Después |
|---------|-------|---------|
| Archivos en docs/ | 42 | 23 |
| Documentación vigente | Mezclada | Separada |
| Documentación histórica | Mezclada | En historial/fases/ |
| Duplicados | 1 (MAPA_PARA) | 0 |

---

## 9. Configuración Normalizada

| Archivo | Cambio |
|---------|--------|
| .gitignore | +vite.config.js, +vite.config.d.ts, +uploads/ |
| vitest.config.ts | -aliases @shared, @config |
| package.json raíz | +typecheck script |
| apps/api/package.json | +typecheck script |
| apps/web/package.json | +typecheck script, +--passWithNoTests |

---

## 10. Scripts Normalizados

| Comando | Estado |
|---------|--------|
| `pnpm dev` | Funciona (ya existía) |
| `pnpm build` | Funciona (ya existía) |
| `pnpm test` | PASS — API 77/77, WEB 0/0 |
| `pnpm typecheck` | PASS — API + WEB |
| `pnpm lint` | Funciona (ya existía) |

---

## 11. Mocks Restantes

| Mock | Ubicación | Estado | Acción |
|------|-----------|--------|--------|
| mock/requests.ts | src/mock/ | Activo | Conservar |
| mock/extras.ts | src/mock/ | Activo | Conservar |
| mock/source-items.ts | src/mock/ | Activo (AlmacenClassify) | Conservar |
| servicios/mock/*.ts | src/servicios/mock/ | 5 servicios | Conservar |
| final-review-service mock | servicios/mock/ | Array vacío | Documentar como pendiente |

---

## 12. Prisma / Base de Datos

- Creado `docs/ESTRATEGIA_BASE_DATOS.md` con análisis completo
- Sin cambios en schema.prisma
- Sin migraciones creadas
- SQLite se mantiene para desarrollo

---

## 13. Riesgos Pendientes

1. Sin migraciones Prisma (usa db push)
2. SQLite ≠ PostgreSQL (diferencias en enums, json, índices)
3. AlmacenClassify importa mock directamente (sin API de proposals)
4. 6 componentes importan servicios API sin fallback mock
5. MatchingService y QualityService sin implementación
6. 0 tests en frontend

---

## 14. Trabajo Futuro

| Tarea | Fase sugerida |
|-------|---------------|
| Crear migración Prisma inicial | Antes de producción |
| Estrategia SQLite → PostgreSQL | Antes de producción |
| Tests básicos para apps/web | Próxima fase funcional |
| MatchingService (Fase 7) | Fase 7 |
| QualityService | Según roadmap |
| Unificar imports API con mode switch | Cuando se estabilice |

---

## 15. Documentación Antes

Cantidad de archivos: 42

## 16. Documentación Vigente

Cantidad: 23

## 17. Documentación Histórica

Cantidad: 18 (en historial/fases/)

## 18. Documentación Eliminada

Cantidad: 1 (MAPA_PARA_DESARROLLADOR.md — duplicado)

## 19. Documentación Fusionada

Ninguna (solo renombrada: MAPA_REAL_PROYECTO_6C → MAPA_PROYECTO)

## 20. Documentación Movida

18 archivos → docs/historial/fases/

## 21. Documentación que Contradecía el Código

Ninguna detectada después de la normalización.

## 22. Documentación que OpenCode Debe Considerar Vigente

- docs/README.md (portal de entrada)
- docs/MAPA_PROYECTO.md (mapa completo)
- docs/MANUAL_DESARROLLADOR.md (manual dev)
- docs/REGLAS_ARQUITECTURA.md (reglas)
- docs/WORKFLOW_ACTUAL.md (estados)
- docs/ESTRATEGIA_BASE_DATOS.md (estrategia DB)

---

## 23. Hallazgos No Resueltos

1. AlmacenClassify importa mock directamente — requiere nuevo endpoint
2. 6 componentes sin mode switch — requiere refactor de servicios
3. Sin tests frontend — requiere configuración de testing library

---

## 24. Candidatos para Futura Fase

| Tarea | Prioridad |
|-------|-----------|
| Crear tests básicos para apps/web | Alta |
| Migrar AlmacenClassify a mode switch | Media |
| Unificar imports API con mode switch | Media |
| MatchingService implementation | Fase 7 |
| QualityService implementation | Según roadmap |
| Migración SQLite → PostgreSQL | Producción |

---

*Normalización completada en FASE 6D — Sin cambios de lógica de negocio*
