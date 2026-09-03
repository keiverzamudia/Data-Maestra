# Mapa de Cuentas Profit — 8D.1

> READ-ONLY AD_TRANS. Solo SELECT.

```
PROFIT SRVBDPROFITBK
│
├── Configuración c1..c10
│    ├── par_emp.p_para1..10 = 0  (no etiquetas) → NO DETERMINADO
│    ├── spescena (vacía)
│    └── UI Profit 01..10  (probable hardcode) → NO DETERMINADO
│
├── Catálogo maestro
│    ├── Tabla única PUC → NO DETERMINADO (0/250 tablas con 1.1.04.03.01.010)
│    ├── Aproximación usada:
│    │    ├── xart_cont.cta1..8 distinct (54+35) → Códigos PUC usados
│    │    │    └── nom_cta1..8 → Descripciones vinculadas (11)
│    │    └── art.dis_cen parse {cN:code} → 184 combinaciones, 2744 arts con <DIS>
│    └── cuentas.cod_cta (0102 bancos) → Descartada
│
├── xart_cont (USER_TABLE, PK co_art, 11097 filas, 26 cols)
│    ├── cta1 / nom_cta1 ↔ art.dis_cen.c1  (2719 usos)  CONFIRMADO
│    ├── cta2 / nom_cta2 ↔ c2 (681)
│    ├── cta3 / nom_cta3 ↔ c3 (639)
│    ├── cta4 / nom_cta4 ↔ c4 (0)
│    ├── cta5 / nom_cta5 ↔ c5 (0)
│    ├── cta6 / nom_cta6 ↔ c6 (0)
│    ├── cta7 / nom_cta7 ↔ c7 (2066)
│    ├── cta8 / nom_cta8 ↔ c8 (1921)
│    ├── cta9 → ❌ NO EXISTE (39 arts con c9 solo en art.dis_cen)
│    └── cta10 → ❌ NO EXISTE (0 usos)
│
└── art.dis_cen (text, 11192 arts)
     ├── <DIS>{c1:1.1.04.03.01.010}{c7:...}{c8:...}</DIS>  (orden c1→c10, sin espacios)
     ├── 2744 con <DIS> (24.5%), 8448 vacíos
     ├── c1 2719, c2 681, c3 639, c7 2066, c8 1921, c9 39, c4/5/6/10 0
     └── Ej. HERMEC066 {c1:1.2.05.02.05.001} ↔ xart_cont.cta1 mismo
```

## Relaciones confirmadas

| Origen | → Destino | Relación | Evidencia |
|---|---|---|---|
| `art.co_art` | `xart_cont.co_art` | 1:1 PK | `SELECT COUNT(*) FROM art JOIN xart_cont USING co_art` |
| `art.dis_cen {c1:code}` | `xart_cont.cta1` | 1:1 parse | `HERMEC066 c1=1.2.05.02.05.001 igual` |
| `xart_cont.cta1` | `xart_cont.nom_cta1` | 1:1 | `SELECT DISTINCT cta1, nom_cta1` 54→11 |
| `art.dis_cen {c9:code}` | `xart_cont.cta9` | **ROTA** — no existe | 39 casos sin columna |

## Dependencia empresa

`xart_cont` sin `co_emp`, `art` sin empresa, `par_emp` 1 fila → **NO DETERMINADO** variación.

## SQL clave

```sql
SELECT co_art, cta1, nom_cta1, cta8 FROM xart_cont WHERE co_art='HERMEC066'
SELECT CAST(dis_cen AS VARCHAR) FROM art WHERE co_art='HERMEC066'
SELECT COUNT(*) FROM art WHERE CAST(dis_cen AS VARCHAR) LIKE '%{c9:%' -- 39
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='xart_cont' -- 26 cols, no cta9
```
