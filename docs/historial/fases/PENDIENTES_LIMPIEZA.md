# Pendientes de Limpieza — Data-Maestra

Fecha: 01 de septiembre de 2026
Estado: Solo documentación — NO se ha eliminado nada

---

## CRÍTICO

Ninguno.

---

## ALTO

| # | Archivo | Problema | Estado |
|---|---|---|---|
| ~~1~~ | ~~`componentes/ui/index.tsx` — `Card`~~ | ~~Exportado pero nunca importado~~ | ✅ ELIMINADO (FASE 4D-1B) |
| ~~2~~ | ~~`componentes/ui/index.tsx` — `FilterBar`~~ | ~~Exportado pero nunca importado~~ | ✅ ELIMINADO (FASE 4D-1B) |
| ~~3~~ | ~~`contratos/index.ts` — `MasterService`~~ | ~~Interface definida pero nunca consumida~~ | ✅ ELIMINADO (FASE 4D-1B) |
| ~~4~~ | ~~`contratos/index.ts` — `SourceService`~~ | ~~Interface definida pero nunca consumida~~ | ✅ ELIMINADO (FASE 4D-1B) |

---

## MEDIO

| # | Archivo | Problema | Quién lo usa | Riesgo | Recomendación |
|---|---|---|---|---|---|
| 5 | `apps/api/src/main.ts:48-49` | `console.log` en producción | Startup | BAJO | Reemplazar con `Logger.log()` NestJS |
| 6 | `modulos/importaciones/ImportacionesPage.tsx` | Importa mocks directamente sin pasar por servicios | Módulo importaciones | BAJO | Unificar acceso via servicios |
| 7 | `servicios/api/index.ts` | No re-exporta `apiFinalReviewService` | Consistencia | BAJO | Agregar re-export |
| 8 | `modulos/solicitudes/solicitud.service.ts:455` | Transiciones workflow hardcodeadas | Solicitudes | BAJO | Considerar extraer a config si crece |

---

## BAJO

| # | Archivo | Problema | Riesgo | Recomendación |
|---|---|---|---|---|
| 9-16 | `docs/*.md` (8 archivos) | Referencian paths antiguos (modules/, shared/, etc.) | INFORMACIONAL | Actualizar paths en documentación |

---

## RESUMEN

| Severidad | Cantidad |
|---|---|
| CRÍTICO | 0 |
| ALTO | 4 |
| MEDIO | 4 |
| BAJO | 8 |
| **Total** | **16** |

Ninguno de estos elementos afecta la funcionalidad actual. Son mejoras de calidad de código que pueden abordarse en fases futuras.
