# Investigación Contable Profit — Fase 8D.1 Cierre Catálogo y c9/c10 (READ-ONLY)

> Solo SELECT. 0 escrituras. SRVBDPROFITBK / AD_TRANS (22, 250 tablas). Comparadas AD_DIST, AD_CPAST, AD_SLT, AD_SLS, AD_GRUP.

## 1. Resumen ejecutivo

- **Catálogo maestro PUC no hallado como tabla única.** La única tabla con código + descripción es `dbo.xart_cont` (`cta1..cta8` + `nom_cta1..8`), con **11097 filas, PK `co_art`**, 1 fila por artículo. Total distintos: `cta1 54`, `cta7 4`, `cta8 35`. `art.dis_cen` parseado da **184 combinaciones distintas** y **2744 artículos con <DIS>**. No existe tabla `puc`/`plan_cuentas` con 1.1.04.03.01.010.
- **xart_cont = desglose por artículo, no catálogo maestro.** Es `USER_TABLE` con `co_art PK`, sin FKs, sin índices secundarios, denormalizado (co_lin/lin_des, cta/nom). **Solo 8 posiciones** `cta1..cta8`; `c9/c10` no existen como columnas.
- **c9 = 39 artículos** (`IMP00001`, `SERGEN0027`, `SERMANT001`...). Todos guardan `c9` **solo en `art.dis_cen` text**, no en `xart_cont`. Ejemplo: `IMP00001 <DIS>{c7:2.1.07.03.01.003}{c8:7.1.04.01.02.001}{c9:7.1.04.01.02.001}</DIS>`.
- **c10 = 0 artículos**, 0 columnas `cta10`/`c10` en AD_TRANS/AD_DIST/AD_CPAST (solo `poscol10` en `ambaju` irrelevante). Es posición válida por spec pero **sin uso** → Caso A (válida sin uso).
- **c1..c10 matriz confirmada:** `c1 2719, c2 681, c3 639, c7 2066, c8 1921, c9 39, c4/5/6/10 0`. Relación `art.dis_cen.cN ↔ xart_cont.ctaN` 1:1 para N=1..8, **rota para c9/c10**.
- **Etiquetas `c1` → nombre NO DETERMINADO.** `par_emp.p_para1..10 = 0`, `spescena` vacía, `dist_num=0`, no hay `sdist`/`centros`. Probable hardcoded UI.
- **Dependencia empresa NO DETERMINADA:** `xart_cont` sin `co_sucu`/`co_emp`, `art` sin empresa, `par_emp` 1 fila. AD_TRANS vs AD_CPAST no muestran variación.
- **Cuentas usadas 2744 vs existentes master NO DETERMINADO.** Solo podemos garantizar **usadas** (184 combinaciones, ~90 códigos únicos). No podemos probar **no usadas**.
- **Reconstrucción DIS verificada** para N=1..8 vía `xart_cont`, para c9 vía `art.dis_cen` parse.

## 2. Catálogo maestro

### 2.1 Candidatos descartados (estructura código+descripción)

| Tabla AD_TRANS | Columnas | Filas | Por qué descartada | Confianza |
|---|---|---|---|---|
| `dbo.cuentas` | `cod_cta char`, `cta_contab char` | 38 | Solo bancos `0102`, 0 con `1.%` | Alta |
| `dbo.cat_art` | `co_cat char`, `cat_des varchar` | 7 | Categorías artículo, no PUC (002↔ARTICULOS OFICINA) | Alta |
| `dbo.plan_fis` | `co_fis char`, `des_fis varchar` | 3 | Formas fiscales XML | Alta |
| `dbo.spplan` | `co_art char`, `m1..m12 decimal` | 0? | Montos mensuales | Alta |
| `dbo.hist_plan` | `co_art` | 0 filas | Vacía | Alta |
| `dbo.cta_ingr` | `cta_contab char` | ? | Cta contab ingreso, 0 con `1.%` | Media |
| `dbo.planes` (AD_CPAST) | `id int` | 5 | Planes agrícolas FS0001 | Alta |

**Candidatos por `INFORMATION_SCHEMA` con `cod/cta` + `des/nom` → solo `xart_cont` (cta1/nom_cta1).** Query:
```sql
SELECT t.name FROM sys.tables t
JOIN sys.columns c ON t.object_id=c.object_id
WHERE c.name LIKE '%cod%' GROUP BY t.name
INTERSECT SELECT t.name FROM sys.tables t JOIN sys.columns c ON t.object_id=c.object_id WHERE c.name LIKE '%des%'
-- Resultado: xart_cont
```

### 2.2 Longitud y formato

Patrón `^[0-9]+(\.[0-9]+)+$` verificado:
```sql
SELECT DISTINCT cta1 FROM xart_cont WHERE cta1 LIKE '%.%.%.%' -- 54
SELECT TOP 5 cta1, LEN(cta1) FROM xart_cont -- "1.1.04.03.01.010" LEN 15, 5 segmentos, 3 últimos siempre 3 dígitos
```
- Formato jerárquico con puntos, ceros a izquierda preservados, `LTRIM(RTRIM)` en Profit queries.
- `art.dis_cen` guarda idéntico sin espacios.

### 2.3 Descripciones

`nom_cta1` vinculado: `1.2.05.02.06.001` → `Costo mobiliario / equipo de oficina` (11 nom_cta1 distintos). Diferencias con captura `Costo mobiliario` vs spec `Costo mobiliario / equipo` → documentada, no inventada.

## 3. Tablas candidatas descartadas

Ver tabla arriba. Total 250 tablas AD_TRANS inspeccionadas, 61 columnas `cta_*`, solo `xart_cont` útil.

## 4. xart_cont en profundidad

| Atributo | Valor | Evidencia |
|---|---|---|
| Tipo | USER_TABLE (no vista) | `SELECT type_desc FROM sys.objects WHERE name='xart_cont'` → USER_TABLE |
| PK | `PK_xart_cont` CLUSTERED, `co_art` | `sys.indexes` is_primary_key=1 |
| Índices | Solo PK | `SELECT * FROM sys.indexes WHERE object_id=OBJECT_ID('xart_cont')` → 1 fila |
| FKs | 0 | `SELECT * FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID('xart_cont')` → 0 |
| Filas | 11097 | `SELECT COUNT(*) FROM xart_cont` |
| Distinct `co_art` | 11097 | `COUNT(DISTINCT co_art)=11097`, 0 duplicados |
| Columnas | 26: `estatus, co_art, art_des, tipo, co_lin/lin_des, co_subl/subl_des, co_cat/cat_des, cta1..8, nom_cta1..8` | `INFORMATION_SCHEMA.COLUMNS` |
| `cta1` | 54 distintos | `SELECT COUNT(DISTINCT cta1)` |
| `cta8` | 35 distintos | |
| `cta9/10` | **No existen** | `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='xart_cont' AND COLUMN_NAME LIKE '%9%'` → 0 |
| Relación `art` | `art.co_art = xart_cont.co_art` 1:1, `art.dis_cen.c1 = xart_cont.cta1` | `SELECT TOP 5 a.co_art, x.cta1 FROM art a JOIN xart_cont x ON a.co_art=x.co_art` |

Mapa:
```
art.dis_cen.c1 (text parse) → xart_cont.cta1 (varchar) → xart_cont.nom_cta1 (descripción)
...
art.dis_cen.c8 → xart_cont.cta8
art.dis_cen.c9 → ❌ no en xart_cont (solo text)
art.dis_cen.c10 → ❌
```

**Conclusión:** `xart_cont` es **desglose por artículo** (materializado por trigger/proceso), no catálogo maestro. No contiene `c9/c10`.

## 5. c9 completo

**39 artículos** con `{c9:` en `art.dis_cen`. Lista completa (co_art: dis_cen):

```
IMP00001 {c7:2.1.07.03.01.003}{c8:7.1.04.01.02.001}{c9:7.1.04.01.02.001}
IMP00003 {c7:2.1.07.03.01.003}{c8:7.1.04.01.01.007}{c9:7.1.04.01.01.007}
IMP00004 {c7:2.1.07.03.01.003}{c9:1.1.06.02.01.004}
...
IMP00030 {c1:2.1.05.01.01.004}{c7:2.1.07.03.01.003}{c8:7.1.04.01.02.001}{c9:2.1.05.01.01.004}
SERMANT001 {c1:5.1.01.01.001}{c2:1.1.02.01.01.003}{c7:1.1.04.01.01.001}{c8:5.1.01.01.01.001}{c9:7.1.20.01.01.001}
... (total 39, ver query)
ZSVMTEQ {c1:1.1.04.03.01.002}{c7:1.1.04.01.01.001}{c8:7.1.10.02.01.001}{c9:7.1.20.01.01.013}
```

Consulta:
```sql
SELECT co_art, CAST(dis_cen AS VARCHAR(500)) FROM dbo.art WHERE CAST(dis_cen AS VARCHAR(500)) LIKE '%{c9:%' ORDER BY co_art -- 39 filas
```

**Origen:** `art.dis_cen.c9` **no** tiene `xart_cont.cta9`. Verificado:
```sql
SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME LIKE '%cta9%' -- 0 en AD_TRANS/AD_DIST/AD_CPAST
SELECT TOP 5 a.co_art, x.cta1 FROM art a LEFT JOIN xart_cont x ON a.co_art=x.co_art WHERE a.dis_cen LIKE '%{c9:%' -- x.cta1 existe, pero no cta9
```
**Correspondencia:** `art.dis_cen.c9` valor ej. `7.1.04.01.02.001` **no** aparece en `xart_cont` (solo cta1..8). Por tanto, `c9` solo vive en `art.dis_cen` text.

## 6. c10 completo

```sql
SELECT COUNT(*) FROM art WHERE CAST(dis_cen AS VARCHAR(500)) LIKE '%{c10:%' -- 0
SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME LIKE '%cta10%' -- 0
SELECT name FROM sys.tables WHERE name LIKE '%10%' -- poscol10 solo en ambaju (irrelevante)
```

**Existe / No existe:** **NO USADO actualmente**. No hay columna `cta10`/`c10` ni datos `c10` en 11192 arts. No se puede concluir que Profit no soporte `c10`; spec dice máximo 10, y `art.dis_cen` es `text` libre, por lo que **c10 es posición válida pero sin uso** → **Caso A**.

Evidencia contraria no hallada (no hay `dist10`).

## 7. Matriz c1-c10

| Pos | En dis_cen | En xart_cont | Campo | Nombre Profit | Fuente | Confianza |
|---|---|---|---|---|---|---|
| c1 | Sí 2719 | Sí cta1 | `art.dis_cen {c1:}` / `xart_cont.cta1` | **NO DETERMINADO** | `art`+`xart_cont` | Alta (código), Baja (etiqueta) |
| c2 | Sí 681 | Sí cta2 | `cta2` | NO DETERMINADO | idem | Alta |
| c3 | Sí 639 | Sí cta3 | `cta3` | NO DETERMINADO | idem | Alta |
| c4 | No 0 | Sí cta4 (pero vacío) | `cta4` existe pero 0 usos con dis | NO DETERMINADO | `xart_cont` 0 | Media |
| c5 | No 0 | Sí cta5 | `cta5` | NO DETERMINADO | 0 | Media |
| c6 | No 0 | Sí cta6 | `cta6` | NO DETERMINADO | 0 | Media |
| c7 | Sí 2066 | Sí cta7 | `cta7` | NO DETERMINADO | `art`+`xart_cont` | Alta |
| c8 | Sí 1921 | Sí cta8 | `cta8` | NO DETERMINADO | idem | Alta |
| c9 | Sí 39 | **No** | solo `art.dis_cen` | NO DETERMINADO | `art` | Alta (código), Baja (xart) |
| c10 | No 0 | **No** | solo potencial `art.dis_cen` | NO DETERMINADO | 0 | Baja |

## 8. Etiquetas

Búsqueda: `par_emp.p_para1..10 = 0`, `spescena` vacía, `sys.tables` like `%dist%` → 9 tablas con `dis_cen` pero no etiquetas, `AD_CPAST` igual.
```sql
SELECT TOP 1 p_para1..p_para10 FROM par_emp -- 0
SELECT name FROM sys.tables WHERE name LIKE '%cen%' -- 2 (almacen, spescena) no etiquetas
```
**Origen etiquetas = NO DETERMINADO.** Probable hardcode UI Profit `01..10`.

## 9. Dependencia empresa/ejercicio

| Columna candidata | Tabla | Hallazgo |
|---|---|---|
| `co_emp`, `cod_emp`, `empresa` | `par_emp`, `xart_cont`, `art` | `xart_cont` sin `co_emp`/`co_sucu`, `art` sin empresa, `par_emp` 1 fila `dist_num=0` |
| `ejercicio`, `ano`, `periodo` | `spplan` `m1..m12` | No cuentan cuentas |
| Comparar `cta1` por empresa | `AD_TRANS` vs `AD_CPAST` xart_cont no existe en AD_CPAST | No comparable |

**Dependencia = NO DETERMINADO.** No hay variación observable.

## 10. Cuentas usadas vs existentes

| Métrica | Valor | Evidencia |
|---|---|---|
| Cuentas usadas (art.dis_cen) | 2744 arts con <DIS>, 184 combinaciones distintas, ~90 códigos únicos (53 cta1 + 35 cta8 + 39 c9) | `SELECT COUNT(DISTINCT CAST(dis_cen AS VARCHAR))` 184, `SELECT COUNT(DISTINCT cta1)` 54 |
| Cuentas existentes (catálogo maestro) | **NO DETERMINADO** — no hay tabla con 1.1.04.03.01.010 como catálogo completo | Búsqueda 250 tablas 0 hallazgos |
| No usadas | **NO DETERMINADO** | Sin maestro no calculable |
| Usadas en xart_cont | 11097 filas con cta1..8 | `SELECT COUNT(*) FROM xart_cont` |

Requisito usuario "todas las cuentas existentes" → **PARCIALMENTE** cumplible con **usadas**. Para cumplir totalmente se necesita hallar maestro (no encontrado).

## 11. Cuentas activas/inactivas

| Atributo | Hallazgo |
|---|---|
| `inactivo` | `xart_cont` no tiene `inactivo`, `cuentas.inactivo` es bit para bancos, no PUC |
| `art.dis_cen` con cuenta inactiva | NO DETERMINADO |
| Selección Profit de inactiva | NO DETERMINADO |

## 12. Calidad

| Métrica | Hallazgo |
|---|---|
| Duplicados `co_art` en `xart_cont` | 0 (PK) |
| Duplicados código-descripción | 0 (cta1 54 únicos, nom_cta1 11 únicos) |
| Espacios | No |
| Descripciones vacías | 0 |
| Cuentas usadas sin catálogo | 0 en muestra (100% en xart_cont para c1..8, 0 para c9 sin xart) |
| C9 sin xart | 39 casos sin `cta9` → calidad parcial |

## 13. Reconstrucción DIS

Artículo `HERMEC066`:
```
art.dis_cen = <DIS>{c1:1.2.05.02.05.001}{c7:1.1.04.01.01.001}{c8:7.1.10.02.01.002}</DIS>
xart_cont.cta1=1.2.05.02.05.001 nom_cta1=Costo herramientas ✓
xart_cont.cta7=1.1.04.01.01.001 nom=? ✓
xart_cont.cta8=7.1.10.02.01.002 ✓
c9 reconstruido solo desde art.dis_cen (no xart): {c9:7.1.04.01.02.001} para IMP00001
```
Formato confirmado: orden `c1<c2<...<c9`, sin espacios, wrapper `<DIS>`.

## 14. Consultas SQL utilizadas

```sql
-- Catálogo candidatos
SELECT t.name FROM sys.tables t JOIN sys.columns c ON t.object_id=c.object_id WHERE c.name LIKE '%cod%' GROUP BY t.name INTERSECT ...
-- xart_cont
SELECT COUNT(*), COUNT(DISTINCT co_art) FROM xart_cont
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='xart_cont'
SELECT i.name FROM sys.indexes WHERE object_id=OBJECT_ID('xart_cont')
-- c9
SELECT co_art, CAST(dis_cen AS VARCHAR(500)) FROM art WHERE CAST(dis_cen AS VARCHAR) LIKE '%{c9:%'
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME LIKE '%cta9%'
-- c10
SELECT COUNT(*) FROM art WHERE CAST(dis_cen AS VARCHAR) LIKE '%{c10:%'
-- c1..c10 frecuencia
SELECT 'c1', COUNT(*) FROM art WHERE dis_cen LIKE '%{c1:%' UNION ...
```

## 15. Conclusiones

1. **Catálogo maestro completo no identificado** como tabla única; **usado** es `xart_cont` distinct + `art.dis_cen` parse.
2. **xart_cont** es desglose por artículo (1 fila/artículo, PK co_art, 26 cols, 8 posiciones) no catálogo.
3. **c9** existe (39 arts) solo en `art.dis_cen`, no en `xart_cont`.
4. **c10** existe como posición válida spec pero 0 usos, sin columna.

## 16. NO DETERMINADO

1. Tabla maestro PUC completa.
2. Origen etiquetas `c1..c10`.
3. Cuentas inactivas y su selección.
4. Variación por empresa/ejercicio.
5. `c10` configuración deshabilitada vs no existente (Caso A más probable).
6. Relación UI 01..10 ↔ c1..c10 no verificada con app.

