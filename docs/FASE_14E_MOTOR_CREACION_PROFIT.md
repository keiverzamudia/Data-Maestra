# FASE 14E — Motor controlado de creación de artículos en Profit

> Implementado, protegido, SIN ejecutar ningún INSERT real.
> `PROFIT_WRITE_ENABLED=false`. Ninguna ruta puede insertar en este estado.

## 1. Arquitectura

```text
Controller (solicitudes)
  ↓ PROFIT.WRITE (create) / DASHBOARD.VIEW (plan)
SolicitudesService.planProfitCreation / createInProfit
  ↓ gates: APROBADO_FINAL + flag + payload válido
ProfitArticleCreationService (motor: payload, candidato, retry, verify)
  ↓ plan→lectura / escritura→INSERT
ProfitAdapterService (READ) · ProfitWriteAdapterService (solo INSERT+SELECT)
  ↓ SQL Server (mssql, parametrizeado)
```

Separación read/write total: pools, credenciales (`PROFIT_WRITE_*` sin
fallback) y clases independientes. Sin `updateArticle`/`deleteArticle`
(§1). Sin `any` en el payload.

## 2. Algoritmo y concurrencia

Prefijo `TRIM(línea)+TRIM(sublinea)` + 4 dígitos (0001–9999). Punto de
partida `MAX()` + filtro de existencia + INSERT como autoridad final.
Solo reintenta colisión exacta (2627 + `art_co_art`); 2601, 547, 50000,
timeouts y pérdidas de conexión siguen sus propias rutas. Mismo par
línea/sublinea siempre (§13). Límite 10 intentos
(`ERROR_CODE_ALLOCATION_EXHAUSTED`).

## 3. Idempotencia, relectura, reconciliación

SEND → VERIFY → RECONCILE con `co_art` como clave natural (sin IDENTITY).
Timeout/conexión perdida → VERIFY primero, jamás retry ciego. Relectura
campo a campo con tolerancia documentada en `dis_cen`. Resultados:
`CREATED_AND_VERIFIED | CREATED_WITH_DIFFERENCES | NOT_FOUND |
RECONCILIATION_ERROR`. Fila ajena nunca reclamada.

## 4. Seguridad y auditoría

Cuádruple gate (estado + permiso + flag + payload). `PROFIT.WRITE` existe
en seed sin otorgar (deny by default). Destino explícito requerido.
Auditoría `PROFIT_PLAN` / `PROFIT_CREATE_RESULT` (requestId, masterCode,
co_art, actor, timestamp, resultado, intentos, errorCode, duración; sin
secretos; errores sanitizados).

## 5. Archivos

Nuevos: `profit-article.payload.ts`, `profit-write.errors.ts`,
`profit-write.adapter.ts`, `profit-article-creation.service.ts`,
`test/profit-creation-14e.spec.ts`, este doc. Tocados: `profit.module.ts`,
`profit-adapter.service.ts` (+2 SELECTs), `solicitud.service.ts`
(orquestación + `brandCode`), `solicitud.controller.ts` (2 rutas),
`classify-request.dto.ts` (desc.), `flatten`, `schema.prisma`
(`RequestData.brandCode`), `seed.js` (permiso), `presentacion.ts` (etiqueta),
`refresh-persistence.spec.ts` (sin fabricante).

## 6. Validación

- Backend: 348/348. `tsc` OK, `nest build` OK. Web typecheck OK (1 etiqueta).
- 0 escrituras ejecutadas. API en ejecución aún con código anterior:
  pendiente `.\scripts\api-restart.ps1` por el usuario.
- Siguiente fase: PRIMER INSERT CONTROLADO contra Profit original
  (requiere flag + `PROFIT_WRITE_*` + otorgar `PROFIT.WRITE`).
