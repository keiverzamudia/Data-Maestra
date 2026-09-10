# FASE 12B — DIS_CEN a nivel de grupos/subgrupos (READ-ONLY, 0 escrituras)

> Servidor `SRVBDPROFITBK`, base `AD_TRANS`. Solo SELECT. Fecha 2026-09-09.

## 1. Fuente actual de grupos en Data-Maestra (código real trazado)

```
Frontend (Almacén/Contabilidad/…)
  ↓ useCatalogos() → GET /catalogos/* (LOCAL: CatalogGroup/CatalogSubgroup)
API CatalogosService (SQLite local, sourceSystem='PROFIT')
  ↑ POST /catalogos/import {rows:[{groupCode,groupName,subgroupCode,subgroupName}]}
API ProfitAdapter.getGroups()/getSubgroups()
  ↓ SELECT co_lin, lin_des FROM dbo.lin_art
  ↓ SELECT co_lin, co_subl, subl_des FROM dbo.sub_lin
Profit AD_TRANS
```

SQL exactos (`profit-adapter.service.ts:212-249`):
- `SELECT co_lin, lin_des FROM dbo.lin_art ORDER BY co_lin`
- `SELECT co_lin, co_subl, subl_des FROM dbo.sub_lin [WHERE co_lin] ORDER BY …`
- Import: `catalog-import.service.ts:22-124` → `catalogos.controller.ts:46-71`.

**El adapter NO lee `dis_cen` de `lin_art`.** El estándar contable de grupo existe en Profit
pero Data-Maestra no lo importa (gap confirmado en código).

## 2. Tablas reales

- Grupos: `dbo.lin_art` (35 filas): `co_lin, lin_des, dis_cen, campo1-4, co_imun, co_reten, …` (25 cols).
- Subgrupos: `dbo.sub_lin` (147 filas): `co_subl, subl_des, co_lin, campo1-4, co_imun, co_reten, …`
  (21 cols). **Sin ninguna columna contable** (`dis_cen` inexistente: `Invalid column name`).
- Relación grupo→subgrupo: `sub_lin.co_lin` (lógica; sin FK declarada verificada).

## 3. Estándar contable: nivel GRUPO (`lin_art.dis_cen`), 23/35 grupos

Formato grupo (con espacios, distinto al de artículo):
`<DIS> {c1:…}{c7:…}{c8:…} </DIS>` — normalizar espacios/`\r` antes de comparar.
Casos parciales reales: `DON` y `GEN` y `MANT` traen `{c8:}` vacío.

12 grupos SIN estándar: `01, 02, 03, 1001, 99, ACT, AGR, COM, IMP, MAE, TRA, UNV`.

## 4. Caso FERRETERÍA

- Código `FER`, `FERRETERIA`, tabla `dbo.lin_art`.
- Estándar (1 configuración, nivel grupo):
  `<DIS> {c1:1.1.04.03.01.006}{c7:1.1.04.01.01.001}{c8:7.1.10.01.01.003} </DIS>`
- Subgrupos (8, sin config propia): CON, ELE, HER, HRR, MIS, PIN, TOR, TUB.
- Artículos (1490): **13 coinciden, 15 difieren, 1462 sin configuración.**
  Diferencias top: 3x `{c1:7.1.10.02.01.002}{c7:…}`, 3x `{c1:1.1.04.03.01.010}{c7:…}{c8:7.1.10.02.01.002}`,
  3x `{c1:5.1.01.01.01.001}{c7:…}`.

## 5. Tablas finales

| Grupo | Código | Subgrupo | Cód. sub | Tabla origen | Campo contable | DIS_CEN (grupo) | Nivel |
|---|---|---|---|---|---|---|---|
| FERRETERIA | FER | CONEXIONES…(8) | CON…TUB | `lin_art` | `dis_cen` | c1=1.1.04.03.01.006 c7=1.1.04.01.01.001 c8=7.1.10.01.01.003 | GRUPO |
| (otros 22) | … | … | … | `lin_art` | `dis_cen` | ver §3 | GRUPO |
| (12 sin) | … | … | … | `lin_art` | — (vacío) | — | — |
| TODOS | — | (147) | — | `sub_lin` | NINGUNO (sin columna) | — | — |

| Grupo | Estándar | Arts | Coinciden | No coinciden | Sin config |
|---|---|---|---|---|---|
| FERRETERIA | c1/c7/c8 (1 config) | 1490 | 13 | 15 | 1462 |

## 6. Conclusión y recomendación

- Profit SÍ tiene estándar a nivel de grupo (`lin_art.dis_cen`, 23/35), NO a subgrupo.
- FERRETERÍA: SÍ tiene (1 configuración, nivel grupo); artículos coinciden PARCIAL
  (estándar casi sin aplicar: 98% sin dis).
- Profit SÍ puede actuar como fuente maestra del estándar de grupo.
- Recomendación próxima fase: extender adapter+import con `dis_cen` de `lin_art`
  (normalizado) como referencia de Accounting; artículos con dis propio divergente =
  excepción a conciliar. Sin inferencia estadística.
