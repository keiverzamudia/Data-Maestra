# GUÍA MULTIEMPRESA PROFIT — Data-Maestra

> **Documento único y vigente.** Escrito desde cero a partir de: código actual,
> `schema.prisma`, configuración, tests y consultas **SELECT de solo lectura**
> contra Profit (2026-09-28). No se usó documentación previa.
>
> **Alcance de esta guía:** reestructurar el módulo multiempresa para crear
> artículos en todas las empresas Profit con el **mismo `co_art`**, resolver
> conflictos de catálogo creando códigos nuevos, y marcar el artículo como
> **activo/inactivo** por empresa desde la pestaña "Subir a Profit".

---

## 1. Reglas de negocio acordadas

1. **Profit es solo lectura** en investigación. La escritura ocurre únicamente
   por el adapter de escritura, con flag y permiso explícitos.
2. **`AD_TRANS` es el catálogo maestro (canónico).** Todo catálogo se compara
   contra AD_TRANS.
3. **Nunca borrar ni renombrar** un elemento existente en otra empresa. Si un
   código ya existe con otro significado, se crea uno **nuevo** (ej. `COM1`)
   y se registra internamente la equivalencia `COM1 (empresa) = COM (AD_TRANS)`.
4. **El sistema propone** el código nuevo (`COM1`, `COM2`, …) y **una persona
   lo confirma**. Nada se aplica en silencio.
5. **Mismo correlativo en todas las empresas:** se calcula el **máximo por
   prefijo (línea+subgrupo) entre las 7 empresas** y ese `co_art` se usa en
   todas. Si está ocupado en alguna, **falla cerrado** (no se escribe nada).
6. **Check por empresa en "Subir a Profit":**
   - Marcada → el artículo se crea **ACTIVO** (`art.anulado = 0`).
   - No marcada → el artículo se crea igual, pero **INACTIVO** (`art.anulado = 1`).
7. **Contabilidad (`dis_cen`) universal:** manda AD_TRANS, con **excepción
   visible por empresa** cuando el negocio lo justifique.
8. La empresa estándar y la lista de empresas se leen **dinámicamente** de
   `AD_GRUP.dbo.TEmpresas`. Nada hardcodeado.
9. Todo lo relevante se **audita**. La escritura en Profit es una
   **transacción global**: o se confirma todo o se revierte todo.

---

## 2. Evidencia real de Profit (2026-09-28)

Conexión: `SRVBDPROFITBK`, base `AD_TRANS`, usuario de lectura de Data-Maestra.
Todas las consultas fueron `SELECT`. **Cero escrituras.**

### 2.1 Empresas (`AD_GRUP.dbo.TEmpresas`)

| `cod_emp` | Nombre | RIF |
|---|---|---|
| AD_DISAY | DISTRIBUIDORA ARAGUANEY YARACUY, C.A | J501665761 |
| AD_DIST | DISTRIBUIDORA DE HIDROCARBUROS SAN LUIS, C.A. | J305334056 |
| AD_LUBSL | LUBRICANTES SAN LUIS, C.A. | J302349532 |
| AD_ROMA | ALIMENTO ROMA, C.A. | J505655191 |
| AD_SLS | SAN LUIS SUMINISTROS, C.A. | J502277960 |
| **AD_TRANS** | **TRANSPORTE SAN LUIS DE LARA, C.A. (estándar)** | J305161925 |
| COR_A3 | CORPORACION AGROPECUARIA VENEZOLANA, C.A | J402635060 |

> **Nota:** ahora son **7** empresas (apareció `AD_DISAY`). La lista se descubre
> en vivo; no debe haber ninguna constante con las empresas.

### 2.2 Tabla `art` (idéntica en las 7 empresas)

- **146 columnas** en las 7 bases (verificado).
- PK `art_co_art (co_art)` — `co_art` es `char(30)`.
- `rowguid` `uniqueidentifier` con default `newid()`.
- Sucursal `co_sucu` `char(6)`.
- `art_des` `varchar(120)`.
- **`anulado` `bit NOT NULL DEFAULT 0`** → es la bandera ACTIVO/INACTIVO.
- `tipo` `char(1)`, dominio por CHECK: **`V, F, C, S, M, N, E`**.
- `tipo_imp` `char(1)`, dominio `1..9` (ver `tabulado`).
- `dis_cen` `text NOT NULL` (formato `<DIS>{c1:cuenta}{c7:...}</DIS>`).
- Dominio de `anulado` en AD_TRANS: `False = 7.823`, `True = 3.374`.

### 2.3 Triggers (`TrigI_art`, `TrigU_art`)

Los 7 tienen los 4 triggers (`TrigI_art`, `TrigU_art`, `TrigD_art`,
`TrigD_artMce`). Longitud del cuerpo: `743/848` en todas, `755/860` en
`COR_A3`.

Definición real de `TrigI_art` (AD_TRANS, normalizada a una línea):

```sql
CREATE TRIGGER TrigI_art ON dbo.art FOR INSERT AS
  DECLARE @status char(10)
  SELECT @status='Succeeded'
  IF @status<>'Failed'
    BEGIN
      IF(SELECT COUNT(*) FROM inserted) !=
         (SELECT COUNT(*) FROM unidades, inserted WHERE unidades.co_uni = inserted.suni_venta)
        BEGIN
          RAISERROR ('Cannot add or change record. Referential integrity rules require a related record in table ''unidades''.',16,1)
          SELECT @status='Failed'
        END
    END
  IF @status='Failed' ROLLBACK TRANSACTION
```

**Conclusión:** el trigger **solo valida** que `suni_venta` exista en
`unidades`. **No** completa campos, **no** toca `anulado` ni `dis_cen`. Si
`suni_venta` no existe en la empresa destino → la transacción se revierte.

### 2.4 Catálogos por empresa (conteos reales)

| Empresa | `lin_art` | `sub_lin` | `cat_art` | `colores` | `unidades` | `tabulado` | `prov` |
|---|---|---|---|---|---|---|---|
| AD_TRANS | 35 | 147 | 24 | 8 | 14 | 9 | 1.873 |
| AD_DIST | 38 | 179 | 8 | 1 | 14 | 9 | 995 |
| AD_LUBSL | 32 | 79 | 31 | 14 | 11 | 9 | 256 |
| AD_ROMA | 21 | 74 | 3 | 1 | 8 | 9 | 218 |
| AD_SLS | 37 | 141 | 87 | 9 | 20 | 9 | 509 |
| COR_A3 | 46 | 270 | 29 | 8 | 25 | 9 | 2.615 |
| AD_DISAY | 41 | 185 | 8 | 2 | 15 | 9 | 169 |

- **`tabulado` (tipo de impuesto):** idéntico en las 7 → `1 TASA GENERAL`,
  `2 TASA A1`, `3 TASA A2`, `4 VENTAS EXENTAS`, `5 COMPRAS EXENTAS`,
  `6 EXENTOS`, `7 TASA A3`, `8 TASA A4`, `9 TASA A5`.
- **`unidades` (AD_TRANS):** `01 NO APLICA`, `CJ CAJA`, `GAL GALON`,
  `JGO JUEGO`, `KG KILOGRAMOS`, `LTS LITROS`, `MET METROS`, `ML ML`,
  `MTS METROS`, `PAQ PAQUETE`, `PAR PAR`, `SAC SACOS`, `TON TONELADAS`,
  `UND UNIDAD`.
- **`proceden` (procedencia):** `01 NO APLICA`, `SS SIN STOCK`, `IMP
  IMPORTACION`, plantas (`F-01`…`F-17`), etc.
- **`colores` (marca en Profit):** cantidades muy distintas por empresa.
- **`cat_art` (categoría):** muy distinto (AD_ROMA solo 3).
- `prov` (proveedor) tiene conteos muy dispares (169 a 2.615).

### 2.5 Colisiones reales en `lin_art` (AD_TRANS vs cada empresa)

Comparación de `lin_art` por código:

| Empresa | Solo en AD_TRANS | Solo en empresa | **Mismo código, otra descripción** | Iguales |
|---|---|---|---|---|
| AD_DIST | 7 | 10 | **7** | 21 |
| AD_LUBSL | 20 | 17 | **5** | 10 |
| AD_ROMA | 25 | 11 | **2** | 8 |
| AD_SLS | 16 | 18 | **6** | 13 |
| COR_A3 | 14 | 25 | **9** | 12 |
| AD_DISAY | 0 | 6 | **3** | 32 |

Ejemplos de **mismo código con distinto significado** (AD_TRANS vs AD_DIST):

| `co_lin` | AD_TRANS | AD_DIST |
|---|---|---|
| `01` | **FLETES** | **COMBUSTIBLE** |
| `ELE` | REPUESTOS ELECTRICOS | ELECTRICIDAD |
| `SEG` | SEGURIDAD INDUSTRIAL | SEGURIDAD |
| `02` | PEAJE FACTURACION | SERVICIO |
| `1001` | IMPUESTO | TRIBUTOS |
| `UNI` | UNIFORMES | UNIFORME |
| `VEH` | VEHICULOS | VEHICULO |

> Este es exactamente el caso `COM`/`COMBUSTIBLE` que motivó la
> reestructuración. **No se debe tocar la fila existente.**

### 2.6 Contabilidad `dis_cen` en líneas (`lin_art.dis_cen`)

En AD_TRANS solo algunas líneas traen `dis_cen`. Ejemplo real:

```
co_lin  = ADTVO   lin_des = ADITIVOS
dis_cen = <DIS> {c1:1.1.04.03.01.009}{c7:1.1.04.01.01.001}{c8:5.1.01.01.01.001} </DIS>
```

Formato: `<DIS>{cN:cuenta}</DIS>`. Las cuentas viven en
`C_DIST.dbo.sccuenta`. El artículo copia el valor; no lo referencia por FK.

### 2.7 Correlativo (`co_art`)

- **No hay `identity`** ni tabla de correlativos. El código es
  `<prefijo=línea+sublínea><4 dígitos>` (p. ej. `FERMIS0663`).
- Tope conocido: `9999` por prefijo.
- `MAX(RIGHT(co_art,4))` por prefijo, **difiere por empresa**:

| Prefijo | AD_TRANS | AD_DIST | AD_LUBSL | AD_ROMA | AD_SLS | COR_A3 | AD_DISAY |
|---|---|---|---|---|---|---|---|
| `FERMIS` | **0663** | 0555 | 0 | 0555 | 0555 | 0569 | 0555 |
| `SOFSUM` | **0196** | 0172 | 0 | 0027 | 0167 | 0179 | 0004 |

**Regla nueva:** el correlativo universal = **máximo entre las 7 empresas**
(en estos casos lo tiene AD_TRANS). Se usa el mismo `co_art` en todas.

---

## 3. Cómo se inserta HOY un artículo (código actual)

### 3.1 Payload — 20 columnas (`profit-article.payload.ts`, FASE 27)

`co_art, art_des, tipo, co_lin, co_subl, uni_venta, suni_venta, tipo_imp,
co_cat, co_color, procedenci, co_prov, tipo_cos, dis_cen, co_us_in, co_sucu,
uni_compra, modelo, ref, anulado`

Defaults actuales: `co_cat='01'`, `co_color='01'`, `procedenci='01'`,
`co_prov='GEN'`, `tipo_cos='ULCO'` (o `ULOM` si `tipo='S'`), `co_sucu='01'`,
`uni_compra=uni_venta`, `co_us_in` = usuario de integración (`PROFIT_INTEGRATION_USER_CODE`).
`anulado` (bit): `0` = ACTIVO, `1` = INACTIVO.

### 3.2 Piezas existentes que se reutilizan

| Pieza | Archivo | Rol |
|---|---|---|
| Driver único | `profit/profit-driver.ts` | `mssql/msnodesqlv8` + ODBC 18. Prohibido tedios. |
| Adapter lectura | `profit/profit-adapter.service.ts` | Catálogos, artículos, cuentas (`sccuenta`), `maxSequenceFor`. |
| Adapter escritura | `profit/profit-write.adapter.ts` | `PROFIT_WRITE_ENABLED`, INSERT, `runInGlobalTransaction`. |
| Payload | `profit/profit-article.payload.ts` | 19 columnas, prefijo, candidato, valida `tableRef`. |
| Motor | `profit/profit-article-creation.service.ts` | `plan`, `allocateAndInsert`, `verifyAndReconcile`. |
| Multiempresa | `profit/multi-company.service.ts` | `analyze` + `insertSelected` + `insertOneCompany`. |
| Homologación | `profit/corporate-homologation.service.ts` | `preflight` por empresa. |
| `dis_cen` | `contabilidad/dis.utils.ts` | `serializarDis` / `deserializarDis`. |

### 3.3 Flujo vigente tras FASE 27

```
Solicitud CONTABILIDAD_APROBADA
  → "Subir a Profit" (MultiCompanyAnalyzer)
  → POST /profit/multi-company/analyze  (solo lectura, DRY RUN)
  → usuario MARCA empresas (marcada = ACTIVO)
  → POST /profit/multi-company/insert { requestId, activeCompanies }
  → por CADA empresa: revalidar → INSERT → verificar
     · mismo co_art y correlativo universal en todas
     · marcadas: anulado=0 · resto: anulado=1
```

Cambios frente al flujo anterior:
- Ya no usa `profit_company_config`; las empresas salen de `TEmpresas`.
- El correlativo es el máximo por prefijo entre TODAS las empresas.
- Envía `anulado` (activo/inactivo por empresa).
- Se eliminaron las equivalencias antiguas y el estado de sincronización;
  el histórico de matching (FASE 22/23) se conserva porque lo usa Almacén.

### 3.4 Seguridad vigente (se conserva)

- `PROFIT_WRITE_ENABLED=false` por defecto.
- RBAC: lectura `DASHBOARD.VIEW`, escritura `PROFIT.WRITE`, admin `ADMIN.MANAGE`.
- Transacción global: si una empresa falla, **rollback total**.
- Verificación obligatoria post-INSERT por empresa.
- Auditoría en `audit_events`.

---

## 4. Diseño objetivo (Fase 2)

### 4.1 Modelo local nuevo (Prisma / SQLite dev)

> Se **eliminan** `profit_company_config`, `catalog_code_equivalence`,
> `corporate_sync_state` y todo `historical_match_*`. Se crean modelos
> simples y explícitos:

1. **`MasterCatalogEntry`** — el catálogo maestro (viene de AD_TRANS):
   `id, catalogKey, code, description, parentCode?, active, updatedAt`.
   `catalogKey ∈ {lin_art, sub_lin, cat_art, colores, unidades, tabulado, proceden}`.
2. **`CompanyCatalogCode`** — mapeo por empresa (la equivalencia nueva):
   `id, catalogKey, companyCode, masterCode, localCode, origin
   (SAME|NEW|EXISTING), active, note?, createdBy?, createdAt`.
   `UNIQUE(catalogKey, companyCode, masterCode)`.
3. **`CompanyCatalogProposal`** — propuestas `COM1/COM2…` pendientes de
   confirmación humana: `id, catalogKey, companyCode, masterCode, proposedCode,
   reason, status (PENDING|CONFIRMED|REJECTED), createdBy?, decidedBy?, decidedAt?`.
4. **`AccountingException`** — excepción de `dis_cen` por empresa:
   `id, companyCode, scope (ARTICLE|LINE), refCode, disCen, note, active,
   createdBy?, createdAt`.

### 4.2 Resolución de código por empresa (orden fail-closed)

Para cada clave de catálogo que el artículo necesita (`co_lin`, `co_subl`,
`co_cat`, `co_color`, `uni_venta`, `tipo_imp`, `procedenci`):

1. Existe mapeo en `CompanyCatalogCode` → se usa `localCode`.
2. El `masterCode` existe **libre** en la empresa (misma descripción) → se usa.
3. El `masterCode` existe con **otra descripción** → se crea una
   `CompanyCatalogProposal` (`COM1`, `COM2`, …) y **se detiene** hasta que una
   persona confirme (o se agregue el mapeo a mano).
4. No existe → se propone replicarlo (INSERT del maestro) y esperar confirmación.
5. Si falta cobertura para alguna clave → **no se escribe en ninguna empresa**.

### 4.3 Correlativo universal

1. `prefix = TRIM(co_lin) + TRIM(co_subl)` (maestro).
2. `maxSeq = MAX(MAX(RIGHT(co_art,4)) por empresa, para ese prefijo)`.
3. `coArt = prefix + padStart(maxSeq+1, 4)`.
4. Verificar que `coArt` **no exista en ninguna** empresa destino.
5. Si `> 9999` o existe en alguna → **falla cerrado**.

> `co_art` es idéntico en todas las empresas. No se traduce.

### 4.4 Activo / Inactivo

- `art.anulado = 0` para empresas **marcadas**.
- `art.anulado = 1` para empresas **no marcadas**.
- Se agrega `anulado` a las 19 columnas del payload (20 columnas).
- El valor se parametriza (`mssql.Bit(1)`), nunca interpolado.

### 4.5 `dis_cen` universal + excepción

1. Valor base: `dis_cen` serializado de la línea/grupo de AD_TRANS
   (`lin_art.dis_cen`) o de los códigos contables de la solicitud.
2. Si existe `AccountingException` para esa empresa → prevalece la excepción
   (visible en UI).
3. Validar que las cuentas existan en `C_DIST.dbo.sccuenta`; si no → aviso
   bloqueante.

### 4.6 Flujo UI "Subir a Profit" (contabilidad)

En `ProfitRegistrationPanel` (pestaña dentro del detalle de contabilidad):

1. Al abrir: `POST /profit/multi-company/analyze` (solo lectura) devuelve, por
   empresa: compatibilidad, correlativo propuesto, conflictos y propuestas.
2. Tabla con **check por empresa** (marcar = ACTIVO).
3. Panel de conflictos: por cada código en conflicto, propuesta `COM1…` +
   botón **Confirmar** (o cambiar manualmente).
4. Resumen: `co_art` universal, empresas activas e inactivas, advertencias.
5. Botón "Subir a Profit" con confirmación explícita.

### 4.7 Endpoints (borrador)

| Método | Ruta | Permiso | Escribe |
|---|---|---|---|
| GET | `/profit/companies` | `DASHBOARD.VIEW` | no (lee `TEmpresas`) |
| POST | `/profit/multi-company/analyze` | `DASHBOARD.VIEW` | no |
| GET | `/profit/multi-company/proposals` | `DASHBOARD.VIEW` | no |
| POST | `/profit/multi-company/proposals/confirm` | `ADMIN.MANAGE` | mapeo local + auditoría |
| POST | `/profit/multi-company/proposals/reject` | `ADMIN.MANAGE` | local + auditoría |
| GET | `/profit/multi-company/catalog` | `DASHBOARD.VIEW` | no |
| POST | `/profit/multi-company/insert` | `PROFIT.WRITE` + flag | Profit (transacción global) |

Acciones de auditoría: `PROFIT_CATALOG_PROPOSED`, `PROFIT_CATALOG_CONFIRMED`,
`PROFIT_CATALOG_REJECTED`, `PROFIT_MULTI_INSERT_*`, `PROFIT_COMPANY_INSERT_RESULT`,
`PROFIT_COMPANY_CONFIG_*` (eliminadas).

---

## 5. Plan de limpieza (borrar)

### 5.1 Código y UI a eliminar

- `profit/multi-company.service.ts`/`controller`/`dto` → **reescribir** (no borrar del todo).
- `profit/corporate-*.ts`: `corporate-catalogs`, `corporate-compare`,
  `corporate-equivalence`, `corporate-equivalence.service`,
  `corporate-homologation.service`, `corporate-companies.service` → se
  conserva lo que exista el motor único; el resto se retira.
- Web: `ProfitCompaniesAdmin`, `ProfitCompaniesSection`,
  `ReplicacionMultiempresa`, `EquivalenciasPanel`, `HomologacionCorporativa`,
  `AuditoriaHistorica`, `Analizador` (histórico) y sus tests.
- Módulos: `auditoria` histórica, `matching` histórico
  (`historical-duplicates`, `historical-universe`).

### 5.2 Base de datos local (SQLite `apps/api/data/dev.db`)

- Eliminar tablas: `profit_company_config`, `catalog_code_equivalence`,
  `corporate_sync_state`, `historical_match_relations`,
  `historical_match_groups`, `historical_match_group_members`.
- Purgar datos operativos: `request*`, `workflow_*`, `approval*`,
  `notification*` (equivalente al modo pruebas de
  `mantenimiento.service.ts`).
- Purgar `audit_events` (incluido), dejando **un único evento** que registre la
  purga (quién, cuándo, qué se borró).

### 5.3 Migraciones Prisma

- Retirar carpetas: `20260917_fase18_matching_foundation`,
  `20260917_fase19_matching_v2`, `20260918_fase22_historical_universe`,
  `20260918_fase23_historical_duplicates`, `20260921_fase25_company_config`,
  `20260925_fase26_equivalencias`, `20260928_fase26_2_desc_sync`.
- Scripts a retirar: `migrate-fase26-2-desc-sync.js`,
  `migrate-fase26-equivalencias.js`.
- Nueva migración versionada con los modelos nuevos. `pnpm db:generate`.
- **No usar `prisma db push`** (el esquema y la base tienen divergencias).

---

## 6. Invariantes que NO se rompen

1. Profit solo se escribe por el adapter, con `PROFIT_WRITE_ENABLED` y
   `PROFIT.WRITE`.
2. Valores siempre **parametrizados**; nombres de base validados
   (`^[A-Z0-9_]{1,30}$`) y citados.
3. Escritura en **transacción global**; cualquier fallo → rollback total.
4. Verificación post-INSERT obligatoria por empresa.
5. Sin equivalencia/propuesta resuelta → **no se escribe**.
6. `co_art` idéntico en todas; `anulado` solo varía por el check.
7. Nada de IFs por nombre de empresa en el dominio.

---

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Correlativo > 9999 | Bloquear y reportar. |
| Colisión de `co_art` en alguna empresa | Verificar las 7 antes de escribir; fail-closed. |
| `suni_venta` inexistente en destino (trigger) | Preflight: validar `unidades` por empresa antes del INSERT. |
| Código en conflicto no confirmado | Propuesta pendiente; no se escribe. |
| `dis_cen` con cuenta inexistente | Validar contra `C_DIST.dbo.sccuenta`. |
| `anulado` mal interpretado | Confirmado: `bit NOT NULL`, default 0 = activo. |
| Borrado destructivo | Respaldo/commit previo + dry-run + confirmación escrita + evento de purga. |
| API no disponible tras migración | Reinicio **manual** por el usuario (`scripts/api-restart.ps1`). |

---

## 8. Checklist de implementación (Fase 2)

- [ ] Respaldo/commit previo.
- [ ] Purga de datos locales + eliminación de tablas obsoletas.
- [ ] Modelos Prisma nuevos + migración versionada + `db:generate`.
- [ ] Backend: descubrimiento de empresas desde `TEmpresas`.
- [ ] Backend: resolución de códigos + propuestas + confirmación.
- [ ] Backend: correlativo universal entre empresas.
- [ ] Backend: payload 20 columnas (incluye `anulado`).
- [ ] Backend: inserción multiempresa con check activo/inactivo + verificación.
- [ ] Backend: `dis_cen` universal + excepciones.
- [ ] Frontend: check por empresa + panel de conflictos/confirmación.
- [ ] Eliminar módulos obsoletos + tests asociados.
- [ ] Tests nuevos (unitarios + integración) + typecheck + build.
- [ ] `GET http://localhost:3001/api/v1/health` = 200 (reinicio manual del usuario).
- [ ] Informe final.

---

## 9. Reutilización obligatoria (no reinventar)

`profit-driver.ts` · `profit-write.adapter.ts` (INSERT + transacción global) ·
`profit-article.payload.ts` · `profit-adapter.service.ts` (lecturas) ·
`dis.utils.ts` · `AuditoriaService` · guards RBAC (`JwtGuard`, `RbacGuard`,
`RequirePermission`) · `PrismaService`.

**No** crear un segundo driver SQL, ni consultas SQL en controllers, ni
escrituras fuera del adapter de escritura.

---

## 10. Estado de implementación (FASE 27)

### Hecho

- `docs/` vaciada; `AGENTS.md` §15/§16 apuntan a esta guía.
- Payload **20 columnas** con `anulado` (`bindProfitParams` para `bit`).
- Inserción en **todas** las empresas; **marcadas = ACTIVO**, resto = **INACTIVO**.
- **Correlativo universal** (máximo por prefijo entre empresas).
- Endpoints `analyze`/`insert { requestId, activeCompanies }`; DTO actualizado.
- UI "Subir a Profit (multiempresa)" con check = activar.
- Eliminados: modelos `ProfitCompanyConfig`, `CatalogCodeEquivalence`,
  `CorporateSyncState`; `corporate.controller.ts`,
  `corporate-equivalence.service.ts`, `dto/corporate.dto.ts`; páginas
  `ProfitCompaniesAdmin/Section`, `ReplicacionMultiempresa`,
  `EquivalenciasPanel`, `HomologacionCorporativa`; rutas/nav/ayuda asociadas.
- Base local: `DROP TABLE` de las 3 tablas (`prisma/migrate-fase27-limpieza.js`).
- **Conservado** el histórico de matching (FASE 22/23) porque lo usa Almacén.
- `CorporateHomologationService.preflight` se mantiene (motor de validación
  por empresa que usa la inserción multiempresa).

### Módulo MANEJO MULTIEMPRESA (implementado)

- **Pantalla** `/multiempresa` (menú *Trabajo*), navegada en niveles para que
  nada quede desbordado:
  1. Maestro (AD_TRANS) → sincronizar.
  2. **Empresas** → solo contadores; se elige una.
  3. **Catálogos de esa empresa** → se elige uno.
  4. **Detalle** → una página de 20 diferencias (IGUALES ocultos), buscador y
     paginación.
  5. **Conflictos por decidir** → casillas, código editable, *Confirmar
     seleccionadas* y *Aceptar todas* de ese catálogo.
- **Catálogos por defecto**: `lin_art`, `sub_lin`, `cat_art`, `colores`,
  `unidades`, `tabulado`. `prov` (1.873 filas) y `proceden` quedan **fuera**
  salvo "incluir proveedores": el artículo siempre usa GEN / 01.
- **Faltantes → se crean solos** con `autoCreate` (interruptor visible): inserta
  lo que no existe, **sin tocar ni borrar ninguna fila existente**, en
  transacción global y auditado.
- **Conflictos → decisión humana**: mismo código con otra descripción nunca se
  renombra; se propone el siguiente libre (`COM` → `COM1`, `01` → `011`).
- **Endpoints** `/api/v1/profit/multiempresa`: `GET status|master|proposals`,
  `POST master/sync|analyze|proposals/confirm|proposals/confirm-bulk|`
  `proposals/confirm-all|proposals/reject`. `analyze` acepta
  `{ company?, catalog?, catalogs?, includeProviders?, autoCreate?, limit?,
  offset? }` y devuelve contadores por empresa **y por catálogo** más **una
  sola página** de problemas.
- **Contabilidad**: si la solicitud no trae cuentas, se usa `lin_art.dis_cen`
  del maestro (universal, idéntico en todas las empresas).

### Pendiente

- Excepciones de `dis_cen` por empresa (hoy manda el valor del maestro).
- Reporte de "empresas bloqueadas por pendientes" dentro de "Subir a Profit".

### Verificación

- API: `typecheck` OK · `vitest` **818 passed / 3 skipped** (14 del módulo).
- Web: `typecheck` OK · `vitest` **308 passed**.
- `pnpm build` (API + Web) OK · API `GET /api/v1/health` = 200.
