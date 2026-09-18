# FASE 21 — Comprador Inteligente de Almacén

## 1. Objetivo
Convertir el motor FASE 20 en asistencia real dentro de Almacén: mostrar
posibles artículos existentes con explicación, y dejar decidir al humano.

## 2. Problema resuelto
Almacén clasificaba sin saber si el artículo ya existía → riesgo de
duplicados en Profit. Ahora ve candidatos explicables antes de aprobar.

## 3. Arquitectura
Solicitud → `POST /matching/candidatos` → v2 → preselección →
`DeterministicMatchEngineV1` (único, sin duplicar) → React presenta.
Decisión → `POST /matching/solicitudes/:id/vincular` → vínculo local +
auditoría. Frontend nunca calcula score/similaridad/ranking.

## 4. Integración con FASE 20
Reutiliza motor, contratos, etiquetas ES, `candidatos()`, decisiones y
auditoría `MATCH_CANDIDATES_CONSULTED`. Solo se amplió el contrato con
`description` del candidato (necesidad funcional real, §45).

## 5. Flujo funcional
Almacén abre solicitud → "Analizando artículos existentes..." → con
candidatos (tarjetas) / sin candidatos (continuar) / error (reintentar +
continuar, sin bloquear).

## 6. Consulta de candidatos
Una sola llamada por solicitud (sin polling), con guardia de
request-id contra respuestas tardías. Permiso: `REQUEST.VIEW`.

## 7. Estados UI
idle/loading/success/empty/error con skeleton discreto y mensajes en
español, sin tecnicismos.

## 8. Evidencias
Lista ✓ con etiquetas ES del backend tal cual (sin inventar).

## 9. Conflictos
Bloque ⚠ destacado + "Se detectó una diferencia que requiere revisión."
Ausencia ≠ conflicto (el backend no los genera; el frontend no deduce).

## 10. SAME
Botón → confirmación ("no debería generar un nuevo artículo") →
`vincular(SAME)` → mensaje + recarga. Botones deshabilitados guardando
("Guardando decisión..."); backend idempotente por `requestId` único.

## 11. DIFFERENT
Mismo patrón; mensaje "continuará con el flujo normal". No borra nada.

## 12. Persistencia
Nueva tabla `request_article_links` (`requestId` único, companyCode,
profitArticleCode, decision, decidedBy/At; migración
`20260917_fase21_request_link`). Sin MasterItem nuevo, sin homologación.
SAME en el registro (`runProfitCreation` y vía corporativa): reutiliza el
código (`profitCode`), marca `INSERTADO_PROFIT` y audita
`PROFIT_WRITE_SKIPPED_EXISTING` — cero INSERT adicionales.

## 13. RBAC
Consulta: `REQUEST.VIEW`. Vínculo: `WAREHOUSE.CLASSIFY` (backend,
`MatchingController.vincular`); UI oculta acciones sin permiso. Sin
permisos nuevos ni bypass.

## 14. Multiempresa
Se muestra `companyCode` del candidato; nada se deduce en frontend
(mismo código ≠ mismo artículo).

## 15. Auditoría
Reutilizada: `MATCH_CANDIDATES_CONSULTED` (conteo+versión),
`MATCH_REQUEST_LINKED` (empresa/código/decisión), más `PROFIT_*`
existente. Sin secretos.

## 16. Fotos
El motor ignora fotos (sin "coincidencia visual"); la pantalla de
Almacén ya muestra la imagen referencial para revisión humana.

## 17. Profit safety
Búsqueda grep del módulo matching: sin write-adapter ni INSERT/UPDATE/
DELETE. `INSERT = 0, UPDATE = 0, DELETE = 0` (tests incluidos).

## 18. Tests
Backend `matching-buyer-21.spec.ts` (7): vínculo, validaciones,
idempotencia, guard, SAME omite INSERT, DIFFERENT/sin vínculo continúan.
Frontend `CompradorInteligente.test.tsx` (10): estados, contenido,
detalle, confirmaciones, deshabilitado, permisos, previas, ES, race.

## 19. Limitaciones
Pool = perfiles locales; sin carga histórica masiva; sin UI de revisión
histórica (fase posterior).

## 20. Riesgos
Doble vínculo SAME→DIFFERENT sobrescribe (última decisión manda,
auditado). El vínculo no mueve estados del workflow.

## 21. Siguiente fase
Revisión histórica / gestión de duplicados existentes (fuera de alcance).
