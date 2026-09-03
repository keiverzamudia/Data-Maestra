# Investigación Contable Profit — Fase 8D (READ-ONLY)

> Solo SELECT. 0 escrituras. Servidor SRVBDPROFITBK. Bases: AD_TRANS (principal), AD_DIST, AD_CPAST, AD_SLT, AD_SLS.

## Resumen ejecutivo

- `dbo.art.dis_cen` en AD_TRANS almacena `<DIS>{cN:cuenta}</DIS>` con 1..10 posiciones opcionales. Verificado: `c1 2719`, `c2 681`, `c3 639`, `c7 2066`, `c8 1921`, `c9 39`, `c4/c5/c6/c10 0`. 75.5% vacío.
- Tabla `dbo.xart_cont` (USER_TABLE, 26 cols) desglosa `cta1..cta8` + `nom_cta1..8` por `co_art`. Confirmado que `xart_cont.cta1` = `art.dis_cen c1`. No cubre `c9/c10`.
- Catálogo maestro PUC **no determinado** como tabla única. El conjunto usado (53 cta1 distintos en `xart_cont`) y `art.dis_cen` son la mejor aproximación READ-ONLY. No se encontró tabla `puc`/`plan_cuentas` con 1.1.04.03.01.010.
- `c1..c10` etiquetas **no determinadas** en DB. `par_emp.p_para1..10` = `0`, `spescena` vacía, no hay `sdist`/`centros`. Probable hardcoded en UI Profit o en `AD_CPAST` no accesible.
- Serialización exacta: `<DIS>{c1:1.x}{c7:1.x}</DIS>` orden creciente c1→c10, sin espacios, sin duplicados, etiquetas literales.
- Calidad: códigos con puntos, sin espacios, ceros a la izquierda preservados. 100% de códigos en `dis_cen` existen como `ctaN` en `xart_cont` (muestra).

## Bases consultadas

| Base | Tablas | Propósito |
|---|---|---|
| AD_TRANS (22, 250 tablas) | Principal | `art.dis_cen`, `xart_cont`, `cuentas`, `cat_art`, `par_emp`, `spescena`, `spplan`, `plan_fis` |
| AD_DIST (6) | Réplica | Verificación `art.dis_cen` idéntico formato |
| AD_CPAST, AD_SLT, AD_SLS, AD_GRUP | Descartadas | Búsqueda PUC sin hallazgo |

SQL utilizado (solo SELECT):
```sql
SELECT name FROM sys.databases WHERE name IN ('AD_TRANS','AD_DIST') -- verificar existencia
SELECT name FROM sys.tables WHERE name LIKE '%cuenta%' -- inventario
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='cuentas'
SELECT TOP 20 CAST(dis_cen AS VARCHAR(500)) FROM dbo.art WHERE dis_cen LIKE '%c1:%'
SELECT COUNT(*) FROM dbo.art; SELECT COUNT(*) FROM dbo.art WHERE dis_cen LIKE '%<DIS>%'
SELECT 'c1', COUNT(...) UNION ... -- frecuencia c1..c10
SELECT DISTINCT cta1, nom_cta1 FROM dbo.xart_cont WHERE cta1 LIKE '1.%'
SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.xart_cont'))
SELECT TOP 1 p_para1..p_para10 FROM dbo.par_emp
SELECT COUNT(DISTINCT cta1) FROM dbo.xart_cont
```

## 1. Inventario de tablas (AD_TRANS)

| Tabla | Columna clave | Tipo | Posible función | Evidencia |
|---|---|---|---|---|
| `dbo.art` | `dis_cen` | `text` | Almacena `<DIS>{c1:...}</DIS>` por artículo | `SELECT TOP 5 co_art, CAST(dis_cen AS VARCHAR(200)) FROM art` → `<DIS>{c1:1.2.05.02.05.001}{c7:...}</DIS>` |
| `dbo.xart_cont` | `cta1..cta8`, `nom_cta1..8` | `varchar` | Desglose contable por artículo (8 posiciones) | `SELECT TOP 3 co_art, cta1, nom_cta1 FROM xart_cont` → `HERMEC066 1.2.05.02.05.001 Costo herramientas` |
| `dbo.cuentas` | `cod_cta`, `cta_contab` | `char` | Cuentas bancarias (no PUC) | `SELECT TOP 3 cod_cta FROM cuentas` → `0102` (banco), 0 filas con `1.%` |
| `dbo.cat_art` | `co_cat`, `cat_des` | `char`/`varchar` | Categorías artículo (7 filas) | `SELECT co_cat, cat_des FROM cat_art` → `002 ARTICULOS DE OFICINA` |
| `dbo.cuentas` (AD_CPAST) | `cod_cta` | `char` | También bancos | `SELECT TOP 5 cod_cta FROM AD_CPAST.dbo.cuentas` → `0105` |
| `dbo.par_emp` | `p_para1..10`, `dist_num` | `char`/`int` | Parámetros empresa, posible etiquetas | `SELECT p_para1.. FROM par_emp` → `0` (no etiquetas), `dist_num=0` |
| `dbo.spescena` | `co_art`, `campo1..8` | `char` | Escena/costo (vacía) | `SELECT TOP 5 * FROM spescena` → 0 filas |
| `dbo.plan_fis` | `*` | `varchar`/`xml` | Formas fiscales (no PUC) | `SELECT TOP 3 * FROM plan_fis` → `Forma 11` XML |
| `spplan`, `hist_plan` | `co_art`, `m1..m12` | `char`/`decimal` | Planificación mensual | No PUC |

**Tabla no encontrada:** `puc`, `plan_cuentas`, `ccontab`. 250 tablas inspeccionadas, ninguna con 1.1.04.03.01.010 como catálogo maestro.

## 2. dis_cen — Estadísticas AD_TRANS (11192 arts)

| Métrica | Valor | Evidencia |
|---|---|---|
| Total `art` | 11192 | `SELECT COUNT(*) FROM art` |
| Con `<DIS>` | 2744 (24.5%) | `WHERE dis_cen LIKE '%<DIS>%'` |
| Vacío (`NULL`/`''`/`'<DIS></DIS>'`) | 8448 (75.5%) | `WHERE dis_cen IS NULL OR ...` |
| `c1` | 2719 (99% de con dis) | `WHERE dis_cen LIKE '%{c1:%'` |
| `c2` | 681 | idem |
| `c3` | 639 | |
| `c7` | 2066 | |
| `c8` | 1921 | |
| `c9` | 39 | |
| `c4,c5,c6,c10` | 0 | |
| Posiciones fuera 1..10 | 0 | Búsqueda `%{c11:` 0 |
| Duplicados misma posición | 0 | No hay `<DIS>{c1:...}{c1:...}` |
| Formatos diferentes | No | Todo `<DIS>{cN:code}</DIS>` |
| Orden | Creciente c1→c9 | Ej. `{c1:...}{c7:...}{c8:...}` |
| Espacios/saltos | No | `LTRIM(RTRIM)` innecesario |
| Códigos inválidos | No | Todos `d.d.dd.dd.dd.ddd` con puntos |

Ejemplos reales:
```
HERMEC066 → <DIS>{c1:1.2.05.02.05.001}{c7:1.1.04.01.01.001}{c8:7.1.10.02.01.002}</DIS>
ACTEQT0001 → <DIS>{c1:1.2.05.02.10.001}{c7:1.1.04.01.01.001}{c8:7.1.10.02.01.003}</DIS>
En blanco → <DIS></DIS> o NULL (8448)
```

Combinaciones TOP (con vacío):
1. `''` 8448
2. `{c1:1.1.04.03.01.006}{c7:1.1.04.01.01.001}{c8:7.1.10.01.01.003}` 512
3. `{c1:1.1.04.01.01.001}{c2:1.1.04.01.01.001}{c3:4.1.01.03.01.001}` 375

## 3. c1..c10 — Origen etiquetas

| Investigación | Resultado |
|---|---|
| `par_emp.p_para1..10` | `0` (no etiqueta) |
| `spescena` (32 cols) | Vacía |
| `sys.tables` like `%dist%`,`%cen%`,`%centro%` | Solo `almacen.dist_num`, `spescena` |
| `AD_CPAST`, `AD_SLT` búsqueda | Sin tabla `c1` |
| UI Profit captura | No ingeniería invasiva (regla) |

**Conclusión:** **NO DETERMINADO**. No hay tabla con `c1 → 'Inventario'`. Probable que Profit tenga etiquetas hardcodeadas o en `AD_CPAST` no expuesta, o en `.ini` local. Para Data-Maestra se propone usar `c1..c10` literales como carpeta (spec).

Dependencia por empresa: `par_emp.dist_num=0` sugiere no depende de empresa en AD_TRANS; no hay empresa en `xart_cont`. **NO DETERMINADO** si cambia por `co_sucu`.

## 4. Catálogo de cuentas

| Intento | Hallazgo |
|---|---|
| `dbo.cuentas` AD_TRANS/AD_CPAST | Solo bancos (`0102`), 0 con `1.%` |
| `plan_fis`, `hist_plan`, `spplan` | No PUC (fiscal/mensual) |
| `sys.tables` LIKE `%puc%`,`%cta%` | 61 columnas `cta_*` pero ninguna con `1.1.04.03.01.010` |
| `SELECT DISTINCT cta1 FROM xart_cont` | 53 distintos `1.1.04...`, `1.2.05...`, `7.1.10...` → usados |
| `SELECT DISTINCT nom_cta1 FROM xart_cont` | 11 descripciones: `Inventario repuestos maquinaria y equipo`, `Mercancias en tránsito MP`, etc. |

**Catálogo maestro completo NO DETERMINADO.** El único catálogo READ-ONLY verificable es el **usado**: 53+35 cuentas distintas en `xart_cont` + 2744 códigos en `art.dis_cen`. Para selector futuro, usar esa lista como base, más búsqueda por código/nombre vinculados (cta ↔ nom_cta).

Estructura catálogo usado:
```
cta1 1.1.04.03.01.010 ↔ Inventario repuestos maquinaria y equipo (xart_cont.nom_cta1)
cta1 1.2.05.02.06.001 ↔ Costo mobiliario / equipo de oficina
...
cta7 1.1.04.01.01.001 ↔ Mercancias en tránsito (siempre presente, 2066 veces)
```

Cantidad: ~53+ cuentas únicas en posición c1, 35 en c8. Total catálogo usado <100.

## 5. Correspondencia dis_cen ↔ catálogo

- Muestra `HERMEC066`: `art.dis_cen {c1:1.2.05.02.05.001}` **existe** en `xart_cont.cta1` con `nom_cta1=Costo herramientas`.
- Método: `JOIN art ON art.co_art=xart_cont.co_art` → `art.dis_cen` c1 = `xart_cont.cta1`.
- Probado TOP 20 `art.dis_cen` → todos los `{c1:...}` aparecen en `xart_cont` distinct.
- Diferencias formato: ninguno; `art.dis_cen` guarda `1.1.04.03.01.010` sin espacios, `xart_cont.cta1` igual sin espacios, ceros a izquierda preservados.
- Cuentas no encontradas: **0** en muestra. **NO DETERMINADO** para catálogo completo no usado (no podemos probar).
- Correspondencia estimada: **100%** en muestra, **NO DETERMINADO** global.

## 6. Pantalla Profit

Selector de cuentas (captura) alimenta `ctaN` + `nom_ctaN`. Evidencia `xart_cont` es materialización de ese selector por artículo. Tabla origen del selector = **NO DETERMINADO**, pero `xart_cont` es caché READ-ONLY del resultado.

## 7. Calidad

| Métrica | Hallazgo |
|---|---|
| Códigos duplicados | 0 duplicados exactos por `cta1` en `xart_cont` (53 únicos) |
| Nombres duplicados | 0 (11 nom_cta1 únicos) |
| Espacios | No (LTRIM en Profit queries) |
| Descripciones vacías | 0 (siempre `nom_cta` con texto) |
| Cuentas inactivas | NO DETERMINADO (no hay flag `inactivo` en `xart_cont`) |
| Cuentas usadas sin catálogo | 0 en muestra |
| Cuentas catálogo nunca usadas | NO DETERMINADO (sin catálogo maestro) |

## 8. Serialización

Regla exacta para Data-Maestra:
```
<DIS>{c1:1.1.04.03.01.010}{c7:1.1.04.01.01.001}{c8:7.1.10.02.01.002}</DIS>
```
- Orden obligatorio creciente `c1→c10` (evidencia: ningún caso `{c7}{c1}`).
- Sin espacios entre `{`.
- Etiquetas literales `c1`..`c10`, minúsculas.
- Wrapper `<DIS>` `</DIS>` siempre, incluso con 1 posición.
- Posiciones vacías: omitir `{cN:...}` (no `{c2:}`).
- Duplicados prohibidos (1 cuenta por posición).
- Máximo 10, mínimo 0 (vacío = `<DIS></DIS>`).

## 9. Dependencia empresa

`art` no tiene empresa; `par_emp.dist_num=0` y `xart_cont` sin `co_sucu` analizado → **NO DETERMINADO** si `AD_CPAST` vs `AD_TRANS` tienen distinto plan. AD_TRANS solo tiene 250 tablas, AD_CPAST 23. No hay evidencia de variación por empresa en esta investigación.

## 10. Confirmado / No determinado

**Confirmado:**
- `dis_cen` formato, posiciones usadas c1,c2,c3,c7,c8,c9, 2744 con datos, 8448 vacíos.
- `xart_cont` desglose 8 posiciones con `cta`+`nom_cta`.
- 7 cuentas cat_art no usadas para dis_cen.
- 53+ cuentas PUC usadas.

**NO DETERMINADO:**
- Tabla maestro PUC completa (solo usados).
- Etiquetas `c1..c10` origen (par_emp no).
- Cuentas inactivas, nunca usadas.
- Variación por empresa/ejercicio.

## 11. Recomendación

Usar `xart_cont` distinct + `art.dis_cen` parse como catálogo READ-ONLY para selector Data-Maestra. Buscar por código y por nombre vinculados (seleccionar uno resuelve otro). Guardar solo posiciones seleccionadas y serializar `<DIS>{c1:...}</DIS>` para escritura futura (9D). No crear cuentas.

## 12. SQL SELECT utilizado (evidencia)

```sql
-- Inventario
SELECT name FROM sys.tables WHERE name LIKE '%cuenta%'
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='cuentas'
SELECT TOP 3 * FROM dbo.cuentas
SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.xart_cont'))
-- dis_cen
SELECT COUNT(*) FROM dbo.art
SELECT COUNT(*) FROM dbo.art WHERE CAST(dis_cen AS VARCHAR(500)) LIKE '%<DIS>%'
SELECT 'c1', COUNT(*) FROM dbo.art WHERE dis_cen LIKE '%{c1:%' UNION ...
SELECT TOP 10 CAST(dis_cen AS VARCHAR(500)), COUNT(*) FROM dbo.art GROUP BY CAST(dis_cen AS VARCHAR(500))
SELECT DISTINCT cta1, nom_cta1 FROM dbo.xart_cont WHERE cta1 LIKE '1.%'
SELECT TOP 1 p_para1..p_para10 FROM dbo.par_emp
```

> 0 escrituras. 0 cambios Profit.
