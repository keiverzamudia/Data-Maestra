# FASE 17.1 — Normalización de triggers de artículo (investigación + ajuste)

> Sin homologación real, sin INSERT/UPDATE/DELETE en Profit. Toda la evidencia
> de esta fase proviene de `SELECT` sobre `sys.triggers`, `sys.sql_modules`,
> `sys.foreign_keys` (metadata) y del código vigente. `PROFIT_WRITE_ENABLED`
> intacto (`false`). Probes temporales eliminados. Sin agent-browser.

## 1. Diferencias encontradas

### 1.1. Corrección a la medición anterior

La Fase 16 reportó "3 familias de texto" para `TrigI_art` y la Fase 17
bloqueaba por diferencia textual. Esa medición usaba
`OBJECT_DEFINITION(OBJECT_ID('[DB].dbo.[TrigI_art]'))`. Durante esta fase se
demostró que ese patrón **no es fiable entre bases**: `OBJECT_ID` sí
resuelve el nombre three-part, pero `OBJECT_DEFINITION` busca el ID en los
catálogos de **la base actual**, devolviendo la definición de **otro objeto
con el mismo ID** (las instalaciones Profit estándar asignan IDs idénticos:
en LUBSL devolvía `TrigIU_reng_ord`, en COR_A3 `TrigIU_reng_tcp`). El mismo
defecto existía en `triggerDefinition()` de Fase 17 y fue corregido aquí
(§5). Toda comparación cross-DB debe usar joins three-part a
`sys.sql_modules`, nunca `OBJECT_DEFINITION`/`OBJECT_NAME`/`COL_NAME`
(sus argumentos ID se resuelven en la base actual).

### 1.2. Definiciones reales (vía `sys.sql_modules`, hashes SHA-256)

| Empresa | TrigI_art (INSERT) | TrigU_art | TrigD_art | TrigD_artMce |
|---|---|---|---|---|
| AD_TRANS | 743 `98c5d459` | 848 `1178a858` | 740 `f5a75d85` | 674 `cfccb1fe` |
| AD_DIST | idéntico | idéntico | idéntico | idéntico |
| AD_SLS | idéntico | idéntico | idéntico | idéntico |
| AD_LUBSL | idéntico | idéntico | idéntico | idéntico |
| AD_ROMA | idéntico | idéntico | idéntico | idéntico |
| COR_A3 | 755 `83f83620` | 860 `1946df0e` | 754 `98733251` | 688 `73d533fb` |

### 1.3. Comportamiento de cada trigger (INSERT)

El `TrigI_art` estándar (09/05/2000) hace exactamente una cosa:

- compara `COUNT(*) FROM inserted` contra el join `unidades` por
  `unidades.co_uni = inserted.suni_venta`;
- si difieren: `RAISERROR 16` + `ROLLBACK TRANSACTION`.

Tablas que consulta: `inserted`, `unidades`. Columnas que modifica:
ninguna (no hay `UPDATE`, no escribe en otras tablas). Sin `IF/CASE`
adicionales, sin efectos secundarios, sin dependencias más allá de
`unidades`. Habilitado (`is_disabled = false`) en las 6.

COR_A3 (`83f83620`): **lógica idéntica** — misma validación, mismo
`RAISERROR`, mismo `ROLLBACK`. La única diferencia son 12 caracteres de
citado con corchetes y esquema (`CREATE TRIGGER [dbo].[TrigI_art] ON
[dbo].[art]` vs `CREATE TRIGGER TrigI_art ON dbo.art`), producto de la
herramienta de scripting, sin efecto semántico.

`TrigU_art`/`TrigD_art`/`TrigD_artMce` solo actúan en UPDATE/DELETE: no
intervienen en el INSERT de Data-Maestra (se documentan por completitud;
COR_A3 también difiere en ellos en la misma medida formal).

### 1.4. Integridad referencial formal

Las 6 empresas tienen las **mismas 9 FKs** desde `art` con los mismos
nombres: `FK_art_cat_art`, `FK_art_colores`, `FK_art_lin_art`,
`FK_art_proceden`, `FK_art_prov`, `FK_art_sub_lin (co_subl+co_lin)`,
`FK_art_tabulado`, `FK_art_unidades (uni_venta)`, `FK_art_unidades1
(suni_venta)`. La integridad que el trigger valida (`suni_venta` ∈
`unidades`) está además garantizada por `FK_art_unidades1` en las 6.

## 2. Clasificación de cada empresa (vs INSERT Data-Maestra)

El payload corporativo usa siempre `suni_venta = uni_venta` validada contra
`unidades` (preflight `REQUIRED_CATALOGS`), por lo que el trigger estándar
nunca lo rechaza y nunca lo modifica.

| Empresa | Clase | Motivo |
|---|---|---|
| AD_TRANS | COMPATIBLE (estándar) | Referencia; texto canónico |
| AD_DIST | A) COMPATIBLE | Byte-idéntico al estándar |
| AD_SLS | A) COMPATIBLE | Byte-idéntico al estándar |
| AD_LUBSL | A) COMPATIBLE | Byte-idéntico al estándar |
| AD_ROMA | A) COMPATIBLE | Byte-idéntico al estándar |
| COR_A3 | A) COMPATIBLE | Lógica idéntica; solo citado `[dbo].` |

- B) INCOMPATIBLE: ninguna empresa actual.
- C) REQUIERE NORMALIZACIÓN: ninguna (no hay nada que alinear; copiar la
  definición de AD_TRANS a COR_A3 sería cosmético y está prohibido sin
  necesidad — regla 8).
- D) REQUIERE DBA: ninguna por triggers. (Persisten las divergencias de
  `dis_cen`/catálogos ya documentadas en Fase 16, fuera de este alcance.)

## 3. Qué se puede normalizar automáticamente

Nada: no se requiere normalización. La regla implementada acepta texto
idéntico o idéntico salvo estilo de citado (`[]` y calificación `dbo.`);
cualquier otra diferencia de tokens sigue bloqueando y requeriría DBA.

## 4. Cambios realizados en Data-Maestra

1. `corporate-compare.ts`: nuevas funciones puras `normDef`,
   `normTrigDef`, `trigInsertCompatible()` (`IDENTICO`/`CITADO`/
   `DIFIERE`/`ILEGIBLE`). Ninguna deshabilita ni modifica triggers.
2. `corporate-homologation.service.ts`: `triggerDefinition()` reescrita con
   joins three-part a `sys.sql_modules` + `is_disabled` (corrige el defecto
   de `OBJECT_DEFINITION` cross-DB); check `TRIGGER_COMPAT` evalúa
   compatibilidad funcional; trigger deshabilitado/ausente/ilegible o
   lógica distinta → bloquea (fail-closed).
3. `test/homologacion-17.spec.ts`: fixture actualizado al nuevo patrón de
   lectura + bloque FASE 17.1 (9 casos).
4. Frontend: sin cambios (la UI ya muestra el detalle del preflight).

Payload del artículo, correlativo, SyncPlan, transacción, auditoría, RBAC,
flag y resto de Fase 17: **sin cambios**.

## 5. Cómo queda el preflight

`TRIGGER_COMPAT` por empresa: `LISTA` si el `TrigI_art` sobre `art` está
habilitado y su lógica equivale a la del estándar; `BLOQUEADA` en cualquier
otro caso (ausente, deshabilitado, ilegible o lógica distinta). El preflight
global mantiene: una empresa bloqueada = 0 escrituras en todas. Con la
evidencia actual, las 6 empresas resultan LISTA en este check.

## 6. Primera homologación segura (posterior, no en esta fase)

1. Comparar (`POST /corporate/compare`) y revisar el plan.
2. Preflight global (`POST /corporate/preflight`): exigir OK en las 6.
3. Con flag y `PROFIT.WRITE`, homologar catálogos; verificar idempotencia
   (segunda ejecución: 0 cambios).
4. Recién entonces, registro multiempresa del artículo.
