# Diseño Profit-Test y Profit Adapter READ-ONLY — Fase 7D

> Solo investigación READ-ONLY. No se modificó Profit, Prisma, workflow ni código.

## 1. Objetivo

Investigar AD_DIST (SRVBDPROFITBK) para diseñar un entorno PROFIT-TEST estructuralmente compatible y un ProfitAdapter aislado que permita a Data-Maestra validar artículos antes de escribir en Profit.

## 2. Entorno analizado

- Servidor: `SRVBDPROFITBK.corpoagroca.local (10.27.148.210)` — HECHO VERIFICADO (ping OK, DNS OK)
- Base: `AD_DIST` — HECHO VERIFICADO (sqlcmd -E conecta)
- Esquema: `dbo` — HECHO VERIFICADO
- Cliente: `sqlcmd` (ODBC 170) + Windows Integrated Auth — HECHO VERIFICADO
- Credenciales: no requeridas para READ-ONLY; vars `.env.example` `PROFIT_DB_*` comentadas como FUTURE — HECHO VERIFICADO

## 3. Conexión

```powershell
sqlcmd -S SRVBDPROFITBK -d AD_DIST -E -Q "SELECT TOP 5 name FROM sys.tables WHERE type='U'"
# OK 5 filas: ajuste, almacen, ambaju, ambart, ambcierre
```

Estado: **READ-ONLY operativo**. No se intentó escritura. Recomendación: crear login `dm_reader` con `db_datareader` sobre `AD_DIST` y futuro `PROFIT_TEST`.

## 4. dbo.art — Columnas

142 columnas. Principales (HECHO VERIFICADO vía `INFORMATION_SCHEMA.COLUMNS`):

| Columna | Tipo | Nulo | Default | Nota |
|---------|------|------|---------|------|
| co_art | char(30) | NO | space(1) | **PK** |
| art_des | varchar(120) | NO | space(1) | descripción |
| co_lin | char(6) | NO | space(1) | FK → sub_lin |
| co_cat | char(6) | NO | space(1) | categoría |
| co_subl | char(6) | NO | space(1) | FK → sub_lin |
| co_color | char(6) | NO | space(1) | FK → colores |
| item | char(10) | NO | | |
| ref, modelo | char(20) | NO | | |
| co_prov | char(10) | NO | | FK → prov |
| uni_venta, uni_compra | char(6) | NO | | FK → unidades |
| stock_*, prec_vta*, prec_agr*, ult_cos_un, cos_pro_un, etc. | decimal/smalldatetime | NO | ((0)) / getdate() | inventarios y costos |
| anulado, compuesto, manj_ser, fisico | bit | NO | ((0)) | flags |
| tipo | char(1) | NO | | |
| co_us_in/fe_us_in, co_us_mo/fe_us_mo | char(6)/datetime | NO | space / getdate() | auditoría |
| rowguid | uniqueidentifier | NO | newid() | |
| row_id | timestamp | NO | | |
| imagen1/2, picture, campo1-8 | varchar(60)/image | NO/Y | | |

Todas NO NULL salvo `picture`. Defaults son `space(1)` o `((0))` o `getdate()`.

## 5. Tablas relacionadas

**HECHO VERIFICADO:**

| Tabla | Clave | Relación con art |
|-------|-------|------------------|
| lin_art | co_lin PK | lin_art.co_lin = art.co_lin |
| sub_lin | (co_lin, co_subl) PK | sub_lin.(co_lin,co_subl)=art.(co_lin,co_subl) |
| colores | (pendiente) | art.co_color |
| prov | co_prov PK | art.co_prov → prov.co_prov |
| unidades | co_uni PK | art.uni_venta → unidades.co_uni |
| cat_art | co_cat | art.co_cat |
| reng_* (reng_ace, reng_aju, reng_com...) | co_art FK | 15+ tablas hijo FKart → reng.*.co_art |

Otras tablas Profit detectadas: `ajuste, almacen, ambaju` etc. (500+ tablas en AD_DIST).

## 6. Relaciones

- `FK_art_sub_lin` composite: art(co_lin,co_subl) → sub_lin(co_lin,co_subl) — HECHO VERIFICADO
- `FK_art_prov`: art.co_prov → prov.co_prov
- Inverso: `FK_reng_com_art`, `FK_kit_art`, `FK_lote_art` etc.: `reng_com.co_art → art.co_art` — 18 FKs hijo

## 7. Grupos

`dbo.lin_art`: `co_lin char(6) PK`, `lin_des varchar(60)`. Ejemplo TOP5: `01 COMBUSTIBLE, 02 SERVICIO, 03 MORA FLETE, 1001 TRIBUTOS, ACT ACTIVOS`. Coincide exactamente con `CatalogGroup` importado (38 grupos, HECHO VERIFICADO). `co_lin` con padding espacios en Profit (char6), Data-Maestra guarda trim (`01`).

## 8. Subgrupos

`dbo.sub_lin`: `(co_lin, co_subl) PK`, `subl_des`. Ejemplo: `01/01 GASOIL, 02/02 FLETE`. HECHO VERIFICADO que subgrupo depende de grupo (clave compuesta). Inconsistencia Profit: `CatalogSubgroup @@unique([groupId,code])` modela correctamente la dependencia.

## 9. Unidades

Tabla `dbo.unidades`: `co_uni char`, `des_uni varchar`. TOP5: `01 NO APLICA, CJ CAJA, GAL GALON, JGO JUEGO, KG KILOS`. HECHO VERIFICADO. Mapea a `UnitOfMeasure` (DM) y `uni_venta/uni_compra` en art.

## 10. Artículos — Muestra

```sql
SELECT TOP 5 co_art, art_des, co_lin, co_subl, uni_venta FROM dbo.art ORDER BY co_art
```
HECHO VERIFICADO:
- `02GEN01 | PROTECTOR DE VOLTAJE | RME/EQU | UND`
- `ACTCOA0001 | ESCRITORIO | ACT/MOB | UND`

Patrón `co_art` alfanumérico 7-11 chars, ligado a grupo (primeros 3 chars suelen ser co_lin). No es IDENTITY.

## 11. Campos obligatorios

**HECHO VERIFICADO (NOT NULL sin default útil):**

Obligatorios reales: `co_art` (PK), `art_des`, `co_lin`, `co_subl`, `co_cat`, `co_color`. Todos NOT NULL con default space(1) → Profit aceptará space pero semánticamente obligatorios (FK fallará si `co_lin` no existe en lin_art).

**Opcionales con default 0/space:** stocks, precios, costos, comentario, ubicación, modelo, ref → permiten INSERT mínimo con solo 6 campos clave.

**Desconocido:** `tipo`, `procedenci`, `co_cat` valores válidos — PENDIENTE.

## 12. Matriz Data-Maestra → Profit

| Data-Maestra | Profit | Obligatorio | Transformación | Observación |
|--------------|--------|-------------|----------------|-------------|
| requestNumber | — | No | — | solo DM |
| requestedDescription | art_des | **SÍ** | trim 120 char | art_des NOT NULL |
| CatalogGroup.code | co_lin | **SÍ** | trim/pad char6 | FK lin_art |
| CatalogSubgroup.code | co_subl | **SÍ** | trim/pad char6 | FK sub_lin composite |
| CatalogCategory.code | co_cat | **SÍ** | char6 | no mapeado aún en DM→Profit |
| Brand.name | — | No | lookup colores/marcas | co_color ? |
| UnitOfMeasure.code | uni_venta | **SÍ** | char6 | FK unidades |
| MasterItem.masterCode | co_art | **SÍ** | char30 | PK, debe ser único |
| RequestAccountingCode | — | No | tabla cuentas | no en dbo.art |
| referencia imagen | imagen1/2 | No | varchar60 | opcional |
| stock/precio | stock_act, prec_vta1 | No | decimal | default 0 |

**HECHO VERIFICADO:** 6 campos mínimos para INSERT válido.

## 13. Información faltante

- **A. Ya disponible:** descripción, grupo, subgrupo, unidad, masterCode, empresa, departamento
- **B. Transformación:** char padding (`01` → `01    `), varchar trim
- **C. Debe agregarse al formulario:** `co_cat` (categoría Profit), `co_color`, `procedenci`, `alm_prin`
- **D. Derivado:** `co_art` desde `masterCode` (HECHO VERIFICADO: ambos alfanuméricos)
- **E. Catálogo:** colores, cat_art, procedencias — no en DM
- **F. No se conoce:** `tipo` (char1), `tipo_imp`, `compuesto` semántica

## 14. Diseño ProfitAdapter

```typescript
interface ProfitAdapter {
  getArt(co_art: string): Promise<Art | null> // SELECT
  getLinArts(): Promise<LinArt[]>             // SELECT
  getSubLins(co_lin?: string): Promise<SubLin[]>
  getUnidades(): Promise<Unidad[]>
  validarArticulo(payload: ArtPayload): { ok: boolean; errors: string[] } // solo valida, no escribe
  // escritura futura detrás de flag:
  // crearArticulo(payload, opts:{dryRun:boolean}): Promise<{co_art}>
}
```
Responsabilidades: aislar `mssql`/`tedious`, mapear char padding, manejar collation `Latin1_General_CI_AS_KS_WS` vs `SQL_Latin1_General_CP1_CI_AS`, cache catálogos, exponer `READ-ONLY` por defecto. Archivo sugerido: `apps/api/src/comun/profit/profit-adapter.ts` tras 7D.

## 15. Diseño Profit-Test

Base `PROFIT_TEST` estructuralmente idéntica a `AD_DIST` pero vacía salvo catálogos y un artículo de ejemplo.

**NECESARIO:** dbo.art (142 cols + PK `art_co_art` CLUSTERED + 13 índices nonclustered), dbo.lin_art, dbo.sub_lin, dbo.unidades, dbo.prov, dbo.colores, triggers `TrigI_art/TrigU_art/TrigD_art/TrigD_artMce`.

**RECOMENDADO:** tablas hijo `reng_com, kit, lote` para probar FK cascade.

**OPCIONAL:** 500 tablas restantes.

**DESCONOCIDO:** procedimientos `sp_*` que generan `co_art`.

## 16. Estrategia de copia

| Opción | Seguridad | Esfuerzo | Recomendación |
|--------|-----------|----------|---------------|
| A. Backup/restore AD_DIST → PROFIT_TEST | Alta (copia exacta) | Medio (requiere DBA, 50GB) | **RECOMENDADA** para fidelidad |
| B. Copia estructural (Generate Scripts) | Media (solo esquema) | Bajo | **RECOMENDADA** si AD_DIST muy grande (script `Tasks → Generate Scripts → Schema only`) |
| C. Clonado DB (DBCC CLONEDATABASE) | Media | Bajo | Opcional en SQL 2014+ |
| D. BACPAC export/import | Media | Medio | Alternativa |

NO ejecutar aún. Requiere DBA.

## 17. Test vs Producción

```ini
# .env.test
PROFIT_ENV=test
PROFIT_DB_SERVER=SRVBDPROFITBK
PROFIT_DB_DATABASE=PROFIT_TEST
PROFIT_DB_USER=dm_reader_test
PROFIT_WRITE_ENABLED=true   # solo TEST

# .env.production
PROFIT_ENV=production
PROFIT_DB_SERVER=SRVBDPROFITBK
PROFIT_DB_DATABASE=AD_DIST
PROFIT_WRITE_ENABLED=false  # nunca true en prod sin aprobación
```

Adapter lee `PROFIT_ENV` para elegir pool.

## 18. Protección contra escritura accidental

- `PROFIT_WRITE_ENABLED` debe ser `false` por defecto; escritura solo si `=== 'true'` **y** `PROFIT_ENV==='test'`.
- Producción requiere segunda variable `PROFIT_PROD_WRITE_CONFIRM=YES` + check runtime.
- Adapter `crearArticulo` debe lanzar si `!PROFIT_WRITE_ENABLED`.
- Pipeline CI debe bloquear `PROFIT_ENV=production` + `WRITE_ENABLED=true`.

## 19. Idempotencia

Clave DM `request.id` → columna Profit `co_art` o tabla correlación `dbo.dm_request_map(requestId unique, co_art)`. Antes de INSERT: `IF EXISTS (SELECT 1 FROM dbo.art WHERE co_art=@co_art) SELECT` → si existe con mismo `requestId` retorna `PROFIT_INSERTED`, si existe con distinto `requestId` error duplicado.

## 20. PROFIT_PROCESSING

Estado técnico automático tras `FINAL_APPROVED`. Job `ProfitSyncJob` cada 5min toma `FINAL_APPROVED` → `PROFIT_PROCESSING` → `SELECT` idempotencia → `INSERT` → `PROFIT_INSERTED`.

## 21. PROFIT_ERROR

Tabla `profit_outbox {requestId PK, status, attempts int, lastError nvarchar(max), nextRetryAt, createdAt}`. Estados: `PROFIT_ERROR` guarda `ERROR_NUMBER(), ERROR_MESSAGE()`, reintento backoff 3×.

## 22. Transacciones

DM (SQLite) y Profit (SQL Server) son dos transacciones distribuidas **sin 2PC**. Patrón **outbox**: commit DM `FINAL_APPROVED` + outbox en misma transacción Prisma; luego job Profit con transacción separada. Garantía at-least-once, no exactly-once. Timeout → `PROFIT_ERROR` + reintento.

## 23. Seguridad

- Usuario `dm_reader` = `db_datareader` en `AD_DIST` y `PROFIT_TEST`.
- Usuario `dm_writer_test` = `db_datawriter` solo en `PROFIT_TEST`.
- Secretos en `PROFIT_DB_PASSWORD_REF` (Key Vault), nunca en repo.
- Logs nunca imprimen `co_art` completo si es sensible.

## 24. Riesgos

- Collation mismatch causa `add` error en queries con concatenación.
- Triggers `TrigI_art` pueden rechazar INSERT por validación no documentada.
- `co_art` no es IDENTITY → riesgo duplicado.
- 142 columnas con defaults `space(1)` ocultan campos obligatorios reales.
- FK `art→sub_lin` exige que grupo/subgrupo existan previamente.

## 25. Decisiones pendientes antes de 7E

1. Confirmar `co_cat` y `co_color` obligatorios y su catálogo.
2. Decidir mapeo `MasterCode → co_art` (¿mismo valor?).
3. Aprobar creación de `PROFIT_TEST` vía DBA.
4. Habilitar `PROFIT_WRITE_ENABLED` solo en TEST.
5. Definir `art_des` max 120 vs DM descripción sin límite.

## 26. Recomendación para 7E

Ejecutar **A** (backup/restore) o **B** (script schema) para `PROFIT_TEST`, implementar `ProfitAdapter` READ-ONLY con los 5 métodos SELECT, exponer checklist Master solo lectura, añadir `proof` de idempotencia sin escritura.

---
*Teams: SRVBDPROFITBK AD_DIST accessible READ-ONLY via Windows Auth. HECHO VERIFICADO vs INFERENCIA claramente separados.*

