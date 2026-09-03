# Mapa Contable Profit — Origen de cada dato

> READ-ONLY AD_TRANS. Solo SELECT.

## Servidor / Bases

| Elemento | Valor | Evidencia |
|---|---|---|
| Servidor | SRVBDPROFITBK | `sqlcmd -S SRVBDPROFITBK -d AD_TRANS -E OK` |
| Base investigada | AD_TRANS (22, 250 tablas) | `SELECT DB_NAME()` → AD_TRANS |
| Base comparada | AD_DIST (6), AD_CPAST (11 DBs) | `SELECT name FROM sys.databases WHERE name LIKE 'AD_%'` |

## Tablas centrales

| Tabla | Filas AD_TRANS | Clave | Contenido contable | Confirmado |
|---|---|---|---|---|
| `dbo.art` | 11192 | `co_art char(30) PK` | `dis_cen text` con `<DIS>{cN:cuenta}</DIS>` | Sí |
| `dbo.xart_cont` | ~2744 | `co_art varchar PK` | `cta1..cta8 varchar`, `nom_cta1..8 varchar` desglose | Sí |
| `dbo.cuentas` | ~38 | `cod_cta char` | Cuentas bancarias `0102` (no PUC) | Sí, descartada como PUC |
| `dbo.cat_art` | 7 | `co_cat` | Categorías artículo (no contable) | Sí |
| `dbo.par_emp` | 1 | `cod_emp` | `p_para1..10 = 0`, `dist_num=0` (no etiquetas c1..c10) | Sí |
| `dbo.spescena` | 0 | `co_art` | Vacía | Sí |
| `dbo.plan_fis` | 3 | — | Formas fiscales XML | Sí |

## Mapa c1..c10

| Pos | Nombre Profit | Código ejemplo | Descripción ejemplo | Tabla origen | Confirmado |
|---|---|---|---|---|---|
| c1 | **NO DETERMINADO** — literal `c1` | `1.1.04.03.01.010` | `Inventario repuestos maquinaria y equipo` | `art.dis_cen` + `xart_cont.cta1/nom_cta1` | Sí (código/descripción), **No** (etiqueta) |
| c2 | NO DETERMINADO | `1.1.04.01.01.001` | `Mercancias en tránsito` | `art.dis_cen` + `xart_cont.cta2` (681 usos) | Sí (uso) |
| c3 | NO DETERMINADO | `4.1.01.03.01.001` | — (639 usos) | `art.dis_cen` | Sí |
| c4 | NO DETERMINADO | — | — | `art.dis_cen` 0 usos | Sí (vacío) |
| c5 | NO DETERMINADO | — | — | 0 usos | Sí |
| c6 | NO DETERMINADO | — | — | 0 usos | Sí |
| c7 | NO DETERMINADO | `1.1.04.01.01.001` | `Mercancias en tránsito MP` | `xart_cont.cta7` 2066 usos | Sí |
| c8 | NO DETERMINADO | `7.1.10.02.01.002` | `7.1.10.02.01.002` (35 distintos) | `xart_cont.cta8` 1921 usos | Sí |
| c9 | NO DETERMINADO | `?` | 39 usos | `art.dis_cen` | Sí |
| c10 | NO DETERMINADO | — | 0 usos | — | Sí (vacío) |

> Etiqueta mostrada por Profit en ventana Información Contable (ej. `Distribución 1`) = **NO DETERMINADO** en DB. `par_emp.p_para*` = `0`, `spescena` vacía.

## Flujo de datos

```
Profit UI Selector (cuenta + descripción)
        ↓ (usuario elige)
art.dis_cen = "<DIS>{c1:1.2.05.02.05.001}{c7:1.1.04.01.01.001}</DIS>"  (text)
        ↓ (trigger/proceso Profit)
xart_cont.cta1 = "1.2.05.02.05.001", nom_cta1 = "Costo herramientas" (varchar)
        ↓ (Data-Maestra READ)
SELECT co_art, dis_cen FROM art + JOIN xart_cont USING co_art
```

## Catálogo de cuentas (origen)

| Origen | Códigos | Descripciones | Cantidad | Confirmado |
|---|---|---|---|---|
| `xart_cont.cta1..8` distintos | `1.1.04.03.01.010`, `1.2.05.02.05.001`, `7.1.10.02.01.002` | `nom_cta1` vinculado | 53 cta1, 35 cta8, 11 nom_cta1 únicos | Sí (usados) |
| Tabla maestro PUC completa | — | — | — | **NO DETERMINADO** — no hay `puc`/`plan_cuentas` con 1.1.04... |
| `cuentas.cod_cta` | `0102` | banco | 38 filas | Descartada como PUC |

**Recomendación Data-Maestra:** Usar `SELECT DISTINCT ctaN, nom_ctaN FROM xart_cont UNION SELECT parse dis_cen` como catálogo READ-ONLY. Buscar por `code` y `name` indistintamente; seleccionar uno resuelve otro.

## Serialización

```
<DIS>{c1:1.a.b.c}{c2:1.a.b}{c7:1.a}</DIS>
```
Orden `c1<c2<...<c10`, sin espacios, wrapper `<DIS></DIS>`, solo posiciones con cuenta.

## Dependencia empresa

`par_emp.dist_num=0`, `xart_cont` sin empresa → **NO DETERMINADO** variación por empresa. AD_TRANS solo tiene 1 `par_emp` fila.

## SQL clave

```sql
SELECT TOP 5 co_art, CAST(dis_cen AS VARCHAR(200)), cta1, nom_cta1
FROM dbo.art JOIN dbo.xart_cont USING co_art
SELECT COUNT(*) FROM art WHERE dis_cen LIKE '%{c1:%'
SELECT DISTINCT cta1, nom_cta1 FROM xart_cont
```
