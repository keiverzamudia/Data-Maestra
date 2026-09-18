# FASE 23.2 — Cierre funcional del Analizador de Almacén y cobertura AD_TRANS

## 1. Objetivo

Cerrar las 8 brechas de FASE 23.1 para que el Analizador pueda probarse
funcionalmente contra un universo amplio y real de AD_TRANS, sin escribir
nada en Profit (INSERT = 0, UPDATE = 0, DELETE = 0).

## 2. Brechas corregidas

1. **Snapshot limitado (100)**: ingesta por lotes idempotente + `startOffset`
   reanudable → universo **11.194/11.195** artículos AD_TRANS (una fila con
   `co_art` vacío se omite). Límite 500 conservado como tope de
   *evaluación*, no del universo.
2. **SAME no resolvía**: `AlmacenService.approve` lanza `SAME_LINKED`
   (Conflict) con vínculo SAME vigente; la UI muestra banner
   "Solicitud resuelta con artículo existente" y oculta
   "Aprobar Clasificación". Sin estado nuevo: el workflow existente lo
   expresa (la solicitud no avanza a creación).
3. **Guard de creación**: ya existía en `runProfitCreation` y
   `runCorporateProfitCreation` (`linkedExistingArticle` →
   `PROFIT_WRITE_SKIPPED_EXISTING`, `profitCode` reutilizado, sin INSERT).
   Verificado con tests; no se cambió su comportamiento.
4. **Historial**: nueva tabla `request_article_decisions`
   (única por tripleta solicitud/empresa/código). A→DIFFERENT,
   B→DIFFERENT, C→SAME coexisten; `RequestArticleLink` conserva la última
   decisión como estado vigente. Migración
   `20260918_fase232_request_decisions` (aplicada a `dev.db` por SQL manual;
   `migrate deploy` no gestiona esta base — P3005 preexistente).
5. **Exclusión de descartados**: `runAnalysis` excluye TODOS los pares
   DIFFERENT del historial y marca todos los SAME (`priorDecision`).
6. **Idempotencia SAME**: upserts por tripleta + vínculo; doble confirmación
   no duplica; frontend con `saving`; backend sin doble resolución.
7. **Borrador honesto**: señales reales (descripción, propósito,
   grupo→categoría, subgrupo→subcategoría, marca, unidad, parte, aplicación).
   `categoryCode` (co_cat sin ranura en perfiles), `taxType` (no identifica
   artículos) y `articleType` (perfiles sin tipo) se documentan como
   excluidos — motor FASE 20 intacto, nada inventado.
8. **Foto existente**: investigado en `dbo.art`: `picture` (image, 0/11195),
   `imagen1`/`imagen2` (varchar(60), siempre un espacio). La ingesta conserva
   `photoReference` solo con contenido real (hoy todo null); el Analizador la
   muestra cuando existe y dice "No existe foto disponible" si no.
9. **onChanged + Validar**: `onChanged` recarga la solicitud tras decidir;
   `onBusyChange` deshabilita "Validar artículo" ("Analizando…") durante la
   ejecución; `handleValidate` ignora pulsaciones en curso.

## 3. Flujo SAME final

PENDIENTE_ALMACÉN → Analizador → "Es el mismo" → vínculo + historial +
auditoría → banner + aprobación bloqueada (`SAME_LINKED`) → aunque llegara a
`createInProfit`, el registro se omite reutilizando el código
(`INSERTADO_PROFIT` + `profitCode`, sin INSERT). DIFFERENT posterior sobre el
mismo par libera el bloqueo (última decisión manda).

## 4. Fuente de datos

Analizador → `POST /matching/analizar` → `analyzeDraft` (universo AD_TRANS)
→ `listProfiles(500, 'AD_TRANS')` → preselección → `DeterministicMatchEngineV1`
→ ranking → N visibles. Candidatos = perfiles locales ingeridos de AD_TRANS.

## 5. Cobertura AD_TRANS (reales)

- Antes: 100. Ahora: **11.194 de 11.195** (verificado por SELECT).
- Distribución: RICA 5.212+ / COMPARABLE 4.780+ / INSUFICIENTE 7.
- Lotes: 500×20 + reanudación `startOffset=10000`. Foto: 0 con referencia.
- Referencia verificada: `094-7134-CAT` "PIN PISTON CATERPILLAR 320"
  (RME/MAQ/01/01/UND).

## 6. Pruebas reales ejecutadas

- `test/matching-live-adtrans-23-2.spec.ts` (solo con `PROFIT_LIVE=1`):
  conteo 11.195, referencia existente, fotos vacías, motor v1 contra 60
  descripciones reales (Caso A encuentra `094-7134-CAT` primero; Caso G con
  score claramente menor), ingesta real 800 + 10.000 + cola 1.195.
- Nuevos specs mock: `matching-analyzer-23-2` (8 tests: historial múltiple,
  exclusión, idempotencia, draft, foto) y `almacen-same-guard-23-2`
  (bloqueo SAME_LINKED, DIFFERENT no bloquea).
- Frontend: `onBusyChange`, foto/aviso, banner resuelto, Validar
  deshabilitado en curso (Analizador 16/16, AlmacenClassify 18/18).

## 7. Validación

- Backend: 56 archivos, 650 PASS + 3 skip (live sin flag).
- Frontend: 37 archivos, 240 PASS.
- Typecheck API/Web: PASS. Build API/Web: PASS. Lint: sin configuración
  (reportado, no creado).
- Profit: INSERT = 0, UPDATE = 0, DELETE = 0 (matching sin escrituras;
  verificación por grep + tests).

## 8. Límites conocidos

- Tope de evaluación 500 candidatos por análisis (universo completo aparte).
- 7 perfiles INSUFICIENTE (sin tokens ni señales).
- Fotos existentes inexistentes en AD_TRANS hoy.
- `categoryCode`/`taxType`/`articleType` fuera del motor (documentado).
- Working tree con cambios previos sin commit (fuera de esta fase).
