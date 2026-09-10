# FASE 14A — Requisitos reales de artículos en Profit Plus 2K8

> Auditoría exclusivamente READ-ONLY (solo SELECT + metadata). 0 escrituras, 0 cambios
> de código/schema/endpoints. Servidor `SRVBDPROFITBK`, base `AD_TRANS` (N=11192 artículos).

## 1. Objetivo

Determinar el tipo real de artículo, obligatoriedad de campos, defaults, catálogos
y automatismos, como base para una futura creación de artículos desde Data-Maestra.

## 2. Alcance

`dbo.art` (146 columnas), catálogos relacionados, `dbo.ambart`, triggers de `art`,
`dbo.tabulado`, `C_DIST.dbo.sccuenta` (ver 12A). Sin ingeniería invasiva de la UI Profit.

## 3. Conexión utilizada

La existente de Data-Maestra (`ProfitAdapter`, `SRVBDPROFITBK/AD_TRANS`, usuario
`solicitudweb`, `PROFIT_WRITE_ENABLED=false`). Scripts temporales solo-SELECT
ejecutados y eliminados; JSON de evidencia en temp local (no versionado).

## 4. Tablas investigadas

`art`, `lin_art` (35), `sub_lin` (147), `cat_art` (24), `colores` (8), `prov` (1873),
`proceden` (24 códigos), `unidades` (14), `tabulado` (9 tasas), `ambart` (1 fila),
`xart_cont` (11097), `segmento`, `placom`.

## 5. Campo real del tipo de artículo

**`dbo.art.tipo` (`char(1)`, NOT NULL, default espacio).** Sin FK; dominio impuesto por
constraint `CK_art_TIPO`: **`V, F, C, S, M, N, E`**. Es el campo utilizado por Profit
para distinguir el tipo (columna literalmente llamada `tipo`, con CHECK dedicado;
`tipo_cos` es tipo de costo —ULCO/ULOM—, `tipo_imp` es tasa de impuesto 1-9).

## 6. Valores reales encontrados

| tipo | N | % | Stock>0 | dis_cen | Lectura |
|---|---|---|---|---|---|
| C | 10317 | 92.2 | 1970 | 19% | Consumo/inventariable (repuestos, ferretería: RVH 3113, VEH 1894, FER 1482) |
| S | 792 | 7.1 | 1 | 94% | Servicio/gasto (fletes `01/01` 639, ferias, donaciones) |
| V | 81 | 0.7 | 8 | 53% | Venta (combustibles, electricidad) |
| N | 1 | — | 0 | 0% | `GENFER442` paleta de madera, anulado |
| M | 1 | — | 0 | 0% | `RVHSUS` amortiguador, anulado |
| F, E | 0 | 0 | — | — | Legales por CHECK, sin uso actual |

**Corrección a la referencia inicial: NO existe `MP`** (ni como valor ni en el CHECK).
`N`/`M` son marginales y ambos an curiosamente an anulado=true (únicos 2 con ese patrón
explícito; `anulado=1` global: 3374).

## 7. Mapeo de tipos

S≈servicio/gasto, C≈consumible/inventariable, V≈venta. F/E reservados sin uso.
`M`/`N` sin uso operativo (muestras anuladas). `manj_serv` (ambart)=true sugiere que
el formulario distingue manejo de servicios, coherente con S sin stock.

## 8. Estructura de dbo.art

146 columnas; PK `co_art char(30)` + `CK_art_CO_ART (co_art<>'')`. Índices en
`art_des, co_cat, co_color, co_lin, co_prov, co_subl+co_lin, procedenci, suni_venta,
tipo_imp, uni_venta, modelo, ref`. 10 FKs de salida, 42 tablas hijas referencian `art`,
triggers INSERT/UPDATE/DELETE dedicados (+`TrigD_artMce`).

| Campo | Tipo SQL | Nullable | Default | Ejemplo real | Clasificación | Evidencia |
|---|---|---|---|---|---|---|
| co_art | char(30) | NO | — | `094-7134-CAT` | OBLIGATORIO (DM genera) | PK, sin default, CHECK <>'' |
| art_des | varchar(120) | NO | espacio | `PIN PISTON…` | OBLIGATORIO (negocio) | Default espacio; siempre informado en muestra |
| fecha_reg | smalldatetime | NO | `getdate()` | 2025-09-26 | AUTOMÁTICO | Default fecha actual; 0 NULL |
| tipo | char(1) | NO | espacio | C | OBLIGATORIO (DM elige) | CHECK V/F/C/S/M/N/E |
| co_lin | char(6) | NO | espacio | RVH | OBLIGATORIO (catálogo) | FK lin_art; AMBART co_linv=true |
| co_cat | char(6) | NO | espacio | 01=NO APLICA | CONDICIONAL (01 = sin categoría) | FK cat_art; 8054 con `01` |
| co_subl | char(6) | NO | espacio | MAQ | OBLIGATORIO (catálogo) | FK sub_lin(co_lin,co_subl); AMBART co_sublv=true |
| co_color | char(6) | NO | espacio | 01=NO APLICA | CONDICIONAL (`01` default operativo) | FK colores; 10411 con `01`; default AMBART `01` |
| item | char(10) | NO | espacio | 0113 / vacío (4379) | OPCIONAL | 39% vacío |
| ref/modelo | char(20) | NO | espacio | BAHCO / vacío | OPCIONAL | Mayoritariamente vacíos en muestra |
| procedenci | char(6) | NO | espacio | 01 / F-02 / SS | CONDICIONAL (default `01`) | FK proceden (24 valores) |
| co_prov | char(10) | NO | espacio | GEN / ceros (venta) | CONDICIONAL (GEN genérico) | FK prov (1873); V usa `0000000000` |
| ubicacion | varchar(60) | NO | espacio | vacío | OPCIONAL | Vacío en muestras |
| uni_venta | char(6) | NO | espacio | UND (10702) | OBLIGATORIO (catálogo) | FK unidades (14: UND/MET/MTS/LTS/GAL/KG/CJ/PAR/PAQ/SAC/JGO/TON/ML/01) |
| suni_venta | char(6) | NO | espacio | = uni_venta | OBLIGATORIO (igual a uni_venta) | **Trigger INSERT la exige en `unidades`** |
| uni_compra | char(6) | NO | espacio | vacío (10157) | OPCIONAL | 91% vacío |
| uni_relac/relac_aut | decimal/int | NO | 0/0(AMBART 1) | 0 / 1 | AUTOMÁTICO/OPCIONAL | relac_aut=1 en 10155 |
| co_imp | char(4) | NO | espacio | vacío (11192) | NO APLICA (siempre vacío) | 100% vacío |
| tipo_cos | char(4) | NO | espacio | ULCO (10827) / ULOM (365) | CONDICIONAL (default AMBART ULOM) | S-feria usa ULOM |
| tipo_imp | char(1) | NO | espacio | 1 (10520), 6 (661) | OBLIGATORIO (catálogo) | FK tabulado; CHECK 1-9 |
| alm_prin | char(4) | NO | espacio | vacío (11192) | OPCIONAL | 100% vacío |
| anulado | bit | NO | 0 | 0/1 | DERIVADO (baja lógica) | 3374 en 1 |
| dis_cen | text | NO | espacio | `<DIS>…` / vacío (8448) | CONDICIONAL (nivel línea/artículo) | Ver §16 |
| compuesto/lote/valido | bit | NO | 0 | 0 (11192) | NO APLICA hoy | 100% en 0 |
| serialp/garantia | char(30) | NO | espacio | vacío (11192) | NO APLICA hoy | 100% vacíos |
| peso/pie | decimal | NO | 0 | 0 | OPCIONAL | — |
| uni_emp/rel_emp | char/decimal | NO | espacio/1 | vacío / 1 (11035) | OPCIONAL | rel_emp=1 casi total |
| stock_* | decimal | NO | 0 | stock_act>0 en 1979 | DERIVADO (movimientos) | stock_com=0 total; stock_des=1 fila |
| atributo1..6/campo1..8 | bit/varchar | NO | 0/espacio | — | NO NECESARIO MVP | Sin uso evidenciado |

## 9. Campos obligatorios

Estructuralmente solo `co_art` (único sin default). De negocio: `art_des, tipo,
co_lin, co_subl, uni_venta (=suni_venta), tipo_imp`. El resto tiene default DB
(espacio/0) o valor "NO APLICA" (`01`, `GEN`).

## 10. Campos automáticos

`fecha_reg` (getdate), stocks (movimientos), `rel_emp=1` por defecto.

## 11. Campos opcionales

`item, ref, modelo, ubicacion, uni_compra, alm_prin, peso, pie, uni_emp, garantia`.

## 12. Campos condicionales

`co_cat` (`01`=sin categoría), `co_color` (`01`), `procedenci` (`01`), `co_prov`
(`GEN`, ceros en V), `tipo_cos` (ULCO/ULOM), `dis_cen` (heredado de línea o propio).

## 13. Defaults AMBART

1 sola fila (`amb_usua=999`): patrón por campo `*v`=visible, `*d`=?, valor plano=defecto.
Defaults: `co_cat=01, co_color=01, procedenci=01, co_prov=GEN, relac_aut=1,
tipo_cos=ULOM, tipo_imp=1, tipo=C, primaria/secundaria=UND, uni_relac1=0`.
`co_lin/co_subl` con `*v=true` pero default vacío (selección obligatoria sin defecto).
`manj_serv=true`, `lotev/garantiav=true` (visibles aunque sin uso actual).

## 14. Dependencias de catálogos

| Campo ART | Tabla | Campo | Obligatoria | Representa |
|---|---|---|---|---|
| co_lin | lin_art | co_lin | Sí | Línea/grupo (35) |
| co_subl (+co_lin) | sub_lin | co_subl | Sí | Sublínea (147, compuesta) |
| co_cat | cat_art | co_cat | Parcial (`01`) | Categoría (24) |
| co_color | colores | co_col | Parcial (`01`) | Marca/combustible (8) |
| procedenci | proceden | cod_proc | Parcial | Procedencia (24) |
| co_prov | prov | co_prov | Parcial | Proveedor (1873) |
| uni_venta/suni_venta | unidades | co_uni | Sí | Unidades (14) |
| tipo_imp | tabulado | tipo | Sí | Tasa impuesto (9) |
| (cuentas) | C_DIST.sccuenta | co_cue | Parcial | PUC para dis_cen |

## 15. Línea / categoría / sublínea

`co_lin`→línea, `co_subl`→sublínea **compuesta** (FK doble a `sub_lin`),
`co_cat`→categoría **independiente** (`01`=NO APLICA en 72%).
Equivalencia DM: Grupo=co_lin, Subgrupo=co_subl; Categoría Profit NO equivale a nada
de DM (no confundir). Combinación inválida línea+sublínea imposible por FK.

## 16. Contabilidad / DIS_CEN

`dis_cen` existe en `art` (vacío 75.5%), `lin_art` (estándar, 23/35) y `cat_art`/
`segmento` (vacíos). Prevalencia: propio del artículo si existe; si no, estándar de
línea (12A/12B). S: 94% con dis (fletes c1/c2/c3); C: 19%; V: 53%. `c9` solo texto.

## 17. Unidades

`uni_venta` obligatoria (UND 96%), `suni_venta` idéntica y **exigida por trigger**,
`uni_compra` opcional (91% vacío), resto equivalencias sin uso (`tuni_venta` 100% vacío).

## 18. Proveedor / procedencia

No obligatorios estrictos: defaults `GEN`/`01`; V usa proveedor de ceros y `SS`.

## 19. Stock / lote / serial

`lote/serialp/valido/compuesto` sin uso (todo 0/vacío). Stock solo en C (y 8 V).
Tipo S sin stock operativo (1/792). Dependencia de tipo: solo evidenciada para S.

## 20. Código y descripción

`co_art` char(30), sin espacios admitidos por CHECK, case preservado (ej. `F-`,
`.RVHMIS0336`, `094-7134-CAT`); `art_des` varchar(120). DM debe generar `co_art`
único ≤30; `fecha_reg` la pone Profit.

## 21. Triggers y automatismos

`TrigI_art` (INSERT): exige `suni_venta` ∈ `unidades`, rollback si falla. `TrigU_art`,
`TrigD_art`, `TrigD_artMce` existen (longitudes 743+; cuerpos no extraídos salvo INSERT).
42 tablas hijas referencian `art` (borrado/renombre con impacto).

## 22. Matriz por tipo de artículo

| Campo | C | S | V | N/M | F/E |
|---|---|---|---|---|---|
| co_art/art_des/fecha | OBL/AUTO | OBL/AUTO | OBL/AUTO | — | DESCONOCIDO (sin filas) |
| tipo | OBLIGATORIO | OBLIGATORIO | OBLIGATORIO | OBLIGATORIO | OBLIGATORIO |
| co_lin/co_subl | OBLIGATORIO | OBLIGATORIO | OBLIGATORIO | OBLIGATORIO | DESCONOCIDO |
| co_cat | CONDICIONAL | CONDICIONAL (`01` 96%) | CONDICIONAL | CONDICIONAL | DESCONOCIDO |
| uni_venta/suni | OBLIGATORIO | OBLIGATORIO | OBLIGATORIO | OBLIGATORIO | DESCONOCIDO |
| tipo_imp | OBLIGATORIO | OBLIGATORIO | OBLIGATORIO | OBLIGATORIO | DESCONOCIDO |
| dis_cen | CONDICIONAL | CONDICIONAL (casi siempre) | CONDICIONAL | NO APLICA | DESCONOCIDO |
| stock | DERIVADO | NO APLICA | DERIVADO | NO APLICA | DESCONOCIDO |
| lote/serial | NO APLICA | NO APLICA | NO APLICA | NO APLICA | DESCONOCIDO |

## 23. Qué debe capturar Data-Maestra

Obligatorio: descripción, tipo (C/S/V), línea, sublínea, unidad venta (=stock),
tasa impuesto; condicional: categoría, color, procedencia, proveedor, costo,
dis_cen (o heredar de línea).

## 24. Qué debe obtener desde Profit

Catálogos (líneas, sublíneas, categorías, colores, procedencias, proveedores,
unidades, tasas, PUC) + estándar `lin_art.dis_cen` + defaults AMBART.

## 25. Qué puede completar Profit

`fecha_reg`, stocks, equivalencias unidad, espacios/ceros por default.

## 26. Qué debería configurarse por grupo/subgrupo

`tipo` como DEFAULT de línea (no imposición: V/C conviven en VEH/GEN/FER),
`co_cat` frecuente, `dis_cen` ya implementado (12C/12D).

## 27. Riesgos para futura escritura

Trigger INSERT (suni_venta), 42 tablas hijas, `co_art` inmutable por PK, CHECKs de
tipo, FKs de catálogo, `dis_cen` text con `\r`, credencial `solicitudweb` sin
permisos de escritura (verificar), dry-run + idempotencia obligatorios.

## 28. Campos que NO deben asumirse

`MP` no existe. `co_cat` no es jerárquica de línea. `item/ref/modelo` no son
obligatorios. `uni_compra` no es obligatoria. `co_imp/alm_prin/lote/serialp` sin uso.
Etiquetas c1..c10 no están en DB.

## 29. Consultas SELECT utilizadas

Metadata (`INFORMATION_SCHEMA.COLUMNS`, `sys.default_constraints/indexes/
foreign_keys/triggers/check_constraints`, `OBJECT_DEFINITION`), `COUNT/DISTINCT/
GROUP BY` por `tipo, tipo_cos, tipo_imp, item, uni_*, co_cat, co_color, procedenci`,
muestras `TOP 8` por tipo, `ambart` completa, catálogos `*_n` y `TOP 25`.

## 30. Evidencia y resultados

N=11192; C=10317/S=792/V=81/N=1/M=1; CHECK `V/F/C/S/M/N/E`; AMBART 1 fila;
triggers 4; FKs 10/42; `suni_venta` exigida por trigger.

## 31. Recomendación para Fase 14B

Modelar `tipoArticulo` (C/S/V + F/E reservados) como default de línea con override
por solicitud; capturar el §23; validar catálogos + trigger antes de cualquier
INSERT; mantener READ-ONLY hasta 14B.
