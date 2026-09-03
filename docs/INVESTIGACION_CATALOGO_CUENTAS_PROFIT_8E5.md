# Investigación catálogo de cuentas Profit — Fase 8E.5 (solo SELECT)

> Profit READ-ONLY. Sin agent-browser, sin cambios de código, sin cambios en UI/endpoints.

## 1. Objetivo

Determinar de dónde proviene el catálogo completo de cuentas del selector
"Cuenta Contable" de Profit, ya que `/profit/accounts` actual (solo
`xart_cont`) muestra únicamente cuentas usadas por artículos.

## 2. Estado anterior

- Fuente actual: `AD_DIST.dbo.xart_cont`, `UNION` de `cta1..cta8`/`nom_cta1..8`,
  `DISTINCT`, `limit` defecto 500 / máximo 1000, búsqueda `LIKE` por código o
  nombre, paginado `OFFSET/FETCH` (`profit-adapter.service.ts:274-286`,
  `profit.controller.ts:42-49`).
- `c9` no viene de `cta9` (no existe); usa el mismo catálogo disponible.
  `c10` es posición seleccionable con el mismo catálogo.

## 3. Fuente actual

`AD_DIST.dbo.xart_cont` (1335 filas): configuraciones contables por artículo,
no catálogo maestro. ~79 códigos distintos usados.

## 4. Tablas investigadas

Mismas 8 candidatas en AD_DIST y AD_TRANS (`cuentas`, `cta_ingr`, `xcta_ingr`,
`xart_cont`, `hist_plan`, `plan_fis`, `spplan`, `spplanenc`):

| Tabla (AD_DIST) | Filas | Código | Nombre | Observaciones |
|---|---|---|---|---|
| `cuentas` | 24 | `cod_cta` | — | **Cuentas bancarias** (`co_banco`, `num_cta`, ej. `0102`). Descartada como PUC. |
| `cta_ingr` | 245 | `co_ingr` | `descrip` | Conceptos de ingreso; `cta_contab` con 1 solo valor distinto (vacío). Descartada. |
| `xcta_ingr` | 60 | `co_ingr` | — | `cuenta` 100% NULL. Descartada. |
| `xart_cont` | 1335 | `cta1..8` | `nom_cta1..8` | Solo usadas. No es maestro. |
| `hist_plan` / `spplan` / `spplanenc` | 0 | — | — | Vacías. |
| `plan_fis` | 6 | — | — | Formas fiscales XML. Descartada. |

## 5. Tabla xart_cont

Ver §4. Función confirmada: desglose por artículo (una fila por `co_art`),
materialización de `art.dis_cen`. No contiene `c9`/`c10`.

## 6. art.dis_cen

Uso confirmado en 8D/8D.1: `<DIS>{c1:…}{c7:…}</DIS>`, `c9` en 39 artículos
(solo texto), `c10` sin uso. Fuente de posiciones, no de catálogo.

## 7. Candidatos encontrados

Barrido de 28 bases del servidor: ninguna `AD_*` tiene `sccuenta`; solo
`MasterProfitPro` (vacía: 0 filas, DB plantilla con 45 empresas en `MpEmpresa`
y todo `sc*` en 0) y **`C_DIST`** la tienen.

**Hallazgo: `C_DIST.dbo.sccuenta` — el módulo Contabilidad (`sc*`) vive en
`C_DIST`** (tablas `sccuenta`, `scaux`, `sccentro`, `sccompro`, `scgrupo`,
`scmoneda`, …). `N_DIST` no tiene `sccuenta`.

## 8. Evidencia

```sql
SELECT COUNT(*) FROM C_DIST.dbo.sccuenta;                       -- 855
SELECT co_cue, des_cue, detalle, inactivo, co_cuepadre
FROM C_DIST.dbo.sccuenta ORDER BY co_cue;                        -- TOP 12 verificados
SELECT co_cue, des_cue FROM C_DIST.dbo.sccuenta
WHERE co_cue='1.1.02.01.01.003';                                 -- Diferencia en cambio
```

Columnas clave: `co_cue char` (código punteado), `des_cue varchar`,
`detalle bit` (1 = imputable), `inactivo bit`, `co_cuepadre char` (jerarquía).

## 9. Cantidades

| Métrica | Valor |
|---|---|
| Filas / códigos distintos (`C_DIST.sccuenta`) | 855 / 855 |
| Inactivas | 0 |
| Imputables (`detalle=1`, `inactivo=0`) — candidatas al selector | **489** |
| Cabeceras (`detalle=0`) | 366 |
| Raíces (`co_cuepadre` vacío) | 8 |
| Distintas usadas en `AD_DIST.xart_cont` | 79 |
| Usadas no presentes en catálogo | **3** (obsoletas, ver §12) |
| En catálogo nunca usadas por artículos | ~410 (489 − 79) |

## 10. Catálogo maestro encontrado / no encontrado

**Encontrado: `C_DIST.dbo.sccuenta`** (855 cuentas, 0 inactivas, jerarquía por
`co_cuepadre`, formato idéntico al de `xart_cont`, cuenta conocida presente).

## 11. Empresa/ejercicio

- `sccuenta` no tiene columnas de empresa ni ejercicio (estructura verificada).
- `C_DIST.dbo.par_emp` tiene 1 fila (`cod_emp='C_DIST'`): BD contable de una
  sola compañía.
- Variación del plan entre compañías: **NO DETERMINADO** (solo `C_DIST` tiene
  `sccuenta` con datos entre las bases revisadas).

## 12. Comparación

- En catálogo pero nunca usadas: ~410 (ej. la mayoría del plan).
- Usadas (`xart_cont`) pero no en catálogo: 3, todas hojas obsoletas cuyas
  ramas/hermanas sí existen: `2.1.07.03.01.003` (rama `2.1.07.03.01.%`
  inexistente), `2.1.07.01.02.005` (hermanas `.001-.004` existen),
  `5.1.05.04.01.001` (usada por `GENSEG004/006`; hermanas `.002+` existen).
  Recomendación: al migrar la fuente, esas 3 siguen resolviéndose si se
  conservan como fallback o se marcan obsoletas; no bloquear posiciones que
  las tengan.

## 13. Recomendación

1. El catálogo maestro completo **existe**: `C_DIST.dbo.sccuenta`.
2. Columnas: `co_cue` (código) y `des_cue` (nombre).
3. 855 cuentas (489 imputables con `detalle=1, inactivo=0`).
4. Empresa/ejercicio: sin dependencia por fila; BD de compañía única.
5. `xart_cont` debe dejar de ser la fuente del selector; queda como referencia
   de configuraciones por artículo (y origen de `c9`, que no existe en
   columnas).
6. `art.dis_cen` sigue como formato de posiciones, no de catálogo.
7. Fuente futura de `GET /profit/accounts`: `C_DIST.dbo.sccuenta`
   (con `detalle=1 AND inactivo=0` por defecto; incluir cabeceras solo si la UI
   quiere mostrar jerarquía). Notar que es **otra base** (`C_DIST`), por lo que
   el adapter debe soportar base contable distinta de la operativa.
8. Mantener `c9`/`c10` como posiciones (vienen del formato, no del catálogo).
9. Arquitectura del selector: sin cambios visuales; solo cambia el origen de
   la lista (más filas → exige búsqueda server-side + paginación, ver §14).

## 14. Diseño futuro de búsqueda

- `GET /profit/accounts?search=&limit=&offset=` (añadir `offset`; hoy solo
  `limit` con `OFFSET 0`). Límite máximo 100 (no 1000): con 489 imputables,
  páginas de 20-50 para scroll infinito.
- `WHERE (co_cue LIKE '%' + @search + '%' OR des_cue LIKE '%' + @search + '%')`,
  case-insensitive por collation (`Latin1_General_CI_AS` verificado en 8D).
- `ORDER BY co_cue`; índice existente: verificar `PK` sobre `co_cue` (asumido
  por unicidad 855/855; confirmar al implementar).
- No cargar el PUC al navegador: primer paint con `limit=20`, scroll pide más.
- Respuesta conserva `{code, description}` (mapear `co_cue→code`,
  `des_cue→description`); selección bidireccional intacta.
- Filtro por defecto `detalle=1 AND inactivo=0`; parámetro `includeHeaders`
  opcional si se quiere árbol.
- Mantener `c1..c10`, solo existentes, sin crear cuentas, sin paginación
  artificial a 10 en UI (10 = posiciones, no resultados).

## 15. Riesgos

- Otra base (`C_DIST`): credencial `solicitudweb` debe tener `db_datareader`
  en `C_DIST` (hoy solo probado en `AD_DIST`); verificar antes de implementar.
- Las 3 cuentas obsoletas usadas deben seguir resolviéndose (fallback o marca).
- `MasterProfitPro.sccuenta` vacía: no usarla como fuente.
- Collation al comparar `xart_cont` (AD_DIST) con `sccuenta` (C_DIST): misma
  instancia, sin problema esperado.

## 16. Pendientes

- DBA: confirmar `solicitudweb` con lectura en `C_DIST` y si `C_DIST` es la
  contabilidad oficial de la compañía de `AD_DIST`.
- Al implementar: confirmar PK/índice sobre `sccuenta.co_cue`.
- Decidir tratamiento visual de las 3 obsoletas.
