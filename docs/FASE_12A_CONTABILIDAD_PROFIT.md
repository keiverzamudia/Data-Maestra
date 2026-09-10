# FASE 12A — Investigación contable Profit (READ-ONLY)

> 0 escrituras. Solo SELECT. Servidor `SRVBDPROFITBK`, base `AD_TRANS` (+ `C_DIST` para catálogo).
> Fecha: 2026-09-09. Supersede parcial: corrige formato `dis_cen` de 8D (contiene `\r`).
> Documentos previos vigentes: `INVESTIGACION_CONTABLE_PROFIT_8D.md`,
> `INVESTIGACION_CATALOGO_CUENTAS_PROFIT_8E5.md`, `MAPA_CONTABLE_PROFIT.md`.

## 1. Inventario real

Bases del servidor (14): `AD_CPAST, AD_CPAST_BAK, AD_DISAY, AD_DIST, AD_finca, AD_GRUP,
AD_LUBSL, AD_ROMA, AD_SLS, AD_SLT, AD_TRANS, C_DIST, MasterProfit, MasterProfitPro`.

Hallazgo de mapeo: `art` **NO tiene** columnas `grupo`/`subgrupo`. Tiene `co_lin`/`co_subl`.
"Grupo/Subgrupo" de Data-Maestra = `lin_art`/`sub_lin` (35 grupos, 147 subgrupos).
Evidencia: `INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='art'` (146 cols) contiene
`co_lin:char, co_subl:char, dis_cen:text` y ninguna columna grupo/subgrupo.

| Tabla | Filas | Rol contable | Estado |
|---|---|---|---|
| `dbo.art` | 11192 | `dis_cen` por artículo | Confirmado |
| `dbo.xart_cont` | 11097 | `cta1..cta8` + `nom_cta1..8` por `co_art` | Confirmado |
| `dbo.lin_art` | 35 | catálogo de grupos | Confirmado |
| `dbo.sub_lin` | 147 | catálogo de subgrupos | Confirmado |
| `dbo.segmento` | 64 | segmentos geográficos (`IRIBARREN`, `SAN FERNANDO`…), `dis_cen` vacío en 64/64 | Descartada como mapeo |
| `dbo.cat_art` | 24 | categorías (`REPUESTO`, `SERVICIO…`), `dis_cen` vacío en 24/24 | Descartada como mapeo |
| `dbo.placom` | 69905 | renglones de compra (tiene `cta_contab` por documento, no mapeo) | Descartada como mapeo |
| `dbo.plavent`, `conc_aut`, `spdevalm`, `spentre` | 0 | vacías | Descartadas |
| `C_DIST.dbo.sccuenta` | 855 | catálogo maestro PUC | Confirmado (revalidado) |

## 2. Muestra y frecuencias (AD_TRANS, N=11192)

| Métrica | Valor |
|---|---|
| Con `<DIS>` no vacío | 2744 (24.5%) |
| Vacíos (`NULL`/`''`/`'<DIS></DIS>'`) | 8448 (75.5%) |
| c1 | 2719 (99.1% de con-dis) |
| c7 | 2066 (75.3%) |
| c8 | 1921 (70.0%) |
| c2 | 681 (24.8%) |
| c3 | 639 (23.3%) |
| c9 | 39 (1.4%, solo texto en `dis_cen`, sin columna en `xart_cont`) |
| c4, c5, c6, c10 | 0 |

Combinaciones TOP globales: `''` 8448; `{c1:1.1.04.03.01.006}{c7:1.1.04.01.01.001}{c8:7.1.10.01.01.003}` 512;
`{c1:1.1.04.01.01.001}{c2:…}{c3:4.1.01.03.01.001}` 375.

## 3. Corrección a 8D: formato real con `\r`

`dis_cen` contiene retornos de carro: `<DIS>\r{c1:…}\r</DIS>\r`. Lectores deben
normalizar `\r`/`\n` antes de comparar o parsear (el `LIKE '%<DIS>{c%'` sin `\r` da 0 filas).

## 4. Etiquetas semánticas por posición (desde `nom_ctaN` de `xart_cont`, 11097 filas)

| Pos | Significado evidenciado | Cuentas distintas | Top |
|---|---|---|---|
| c1 | Inventario (varía por grupo) | 53 | `Inventario de Repuesto de Vehiculos` 4995x |
| c7 | Mercancías en tránsito (casi constante `1.1.04.01.01.001`) | 3 | `Mercancias en tránsito MP DPTO 1` 10395x |
| c8 | Gasto/costo (varía) | 34 | `Mantenimiento y repuestos de vehiculos` 5019x |
| c2 | Diferencia en cambio (raro) | 2 | `Diferencia en cambio` 6x |
| c3 | Servicios de fletes (familia 01/01) | 1 | `Servicios de Fletes Inter-Compañias` 637x |

Etiqueta funcional de Profit (`Distribución N`) sigue NO DETERMINADA en DB (`par_emp.p_para*=0`,
`spescena` vacía) — sin cambio vs 8D.

## 5. Catálogo revalidado (`C_DIST.dbo.sccuenta`)

855 cuentas, 489 imputables (`detalle=1 AND inactivo=0`), 0 inactivas. Usadas en AD_TRANS: 68
distintas. **7 usadas NO están en catálogo** (obsoletas/externas, con uso vivo):
`2.1.07.03.01.003`, `2.1.07.01.02.005`→(no usada en AD_TRANS), `5.1.05.04.01.001`,
`5.1.01.01.01.002`, `5.1.05.04.01.007`, `5.1.05.04.01.010`, `7.1.19.01.01.021`, `7.1.20.01.01.031`
(36 usos en `cta8`). Catálogo nunca usado: 794 (428 imputables). Regla futura: fallback o marca
obsoleta, nunca bloquear.

## 6. SQL utilizado (solo SELECT, evidencia)

```sql
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='art';
SELECT COUNT(*) FROM dbo.art;
SELECT COUNT(*) FROM dbo.art WHERE CAST(dis_cen AS VARCHAR(20)) LIKE '%<DIS>%';
SELECT 'c1', COUNT(*) FROM dbo.art WHERE CAST(dis_cen AS VARCHAR(2000)) LIKE '%{c1:%' UNION ALL ...;
SELECT co_lin, co_subl, COUNT(*) FROM dbo.art GROUP BY co_lin, co_subl;
SELECT LTRIM(RTRIM(co_art)), LTRIM(RTRIM(co_lin)), LTRIM(RTRIM(co_subl)),
       CAST(dis_cen AS VARCHAR(1000)) FROM dbo.art a LEFT JOIN dbo.xart_cont x ON x.co_art=a.co_art
WHERE CAST(a.dis_cen AS VARCHAR(1000)) LIKE '%{c1:%' OR ... ORDER BY a.co_art;
SELECT co_cue FROM C_DIST.dbo.sccuenta WHERE ... IN ('2.1.07.03.01.003',...);
SELECT * FROM dbo.segmento ORDER BY co_seg;  -- 64 filas, dis vacío
SELECT * FROM dbo.cat_art ORDER BY co_cat;    -- 24 filas, dis vacío
```
