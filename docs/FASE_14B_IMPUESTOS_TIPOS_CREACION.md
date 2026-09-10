# FASE 14B — Impuestos, tipos secundarios y comportamiento de creación (READ-ONLY)

> Solo SELECT + metadata. 0 escrituras, 0 cambios de código. Base `AD_TRANS`.

## 1. Impuestos — conclusión

- **El campo real de tasa es `art.tipo_imp`** (`char(1)`, FK → `tabulado.tipo`,
  CHECK 1-9). Catálogo `tabulado` (9 tasas: 1=TASA GENERAL 16/16, 2=A1, 3=A2,
  4=VENTAS EXENTAS, 5=COMPRAS EXENTAS, 6=EXENTOS 0/0, 7-9=A3-A5 en 0).
- Distribución: C→`1` (10314/10317); S→`6` (657, exentos), `1` (124), `5` (8), `4` (3);
  V→`1` (80/81). Regla práctica: C y V gravados (`1`); S exento (`6`) salvo excepciones.
- **`art.co_imp` NO es la tasa**: FK hacia `imp_mun` (impuestos municipales, tabla
  vacía, 0 filas) y está 100% vacío en `art`. No enviar.
- `tasas` = tipo de cambio de moneda; `uni_trib` = unidades tributarias históricas.
  No relacionados con el artículo.

## 2. Significado F/M/N/E y tipos a exponer

- Sin catálogo descriptivo en DB (ninguna tabla `*tipo*art*`, `*clase*`).
- Evidencia: N=`GENFER442` paleta de madera (envase/embalaje), M=`RVHSUS`
  amortiguador (ambos anulados, n=1). Hipótesis no confirmadas (posible
  N=envase, M=materia prima/manufactura, F=fabricación, E=especial); se marcan
  **DESCONOCIDO**, no se afirman.
- **Exponer en DM (MVP): C, S, V.** F/E/M/N como reservados (válidos por CHECK,
  sin uso). `MP` no existe en ningún nivel.

## 3. Trigger INSERT exacto (`TrigI_art`)

Solo valida `suni_venta` ∈ `unidades`, con ROLLBACK si falla. No genera campos.
`TrigU_art`: misma validación solo `IF UPDATE(suni_venta)`. `TrigD_artMce`:
bloquea DELETE con movimientos en `reng_mce`. `xart_cont` sin triggers (lo
mantiene la app Profit, no la BD).

## 4. Campos generados / defaults

DB: `fecha_reg=getdate()`, `rowguid=newid()`, espacios/ceros, AMBART
(`co_cat/co_color/procedenci=01`, `co_prov=GEN`, `tipo/tipo_cos/tipo_imp= C/ULOM/1`,
`relac_aut=1`, UND). Nada más se genera solo.

## 5. Combinaciones válidas

- FK compuesta `FK_art_sub_lin (co_lin, co_subl)` → sublínea debe pertenecer a la línea.
- FKs simples: línea, categoría, color, procedencia, proveedor, unidades ×2, tasa.
- `co_cat`/`co_color`/`procedenci`/`co_prov` aceptan sus valores "NO APLICA".

## 6. Contrato conceptual de creación (SIN implementar)

Enviar: `co_art` (único ≤30, sin espacios), `art_des`, `tipo` ∈ {C,S,V},
`co_lin`, `co_subl` (de la línea), `uni_venta=suni_venta` ∈ unidades,
`tipo_imp` (1 por defecto; 6 para S exento), `co_cat` (default `01`),
`co_color` (`01`), `procedenci` (`01`), `co_prov` (`GEN`), `tipo_cos`
(ULCO; ULOM si servicio), `dis_cen` (estándar de línea o vacío).
Dejar a Profit: `fecha_reg`, `rowguid`, stocks, equivalencias.
Reconsultar tras crear: `fecha_reg`, `rowguid`, `dis_cen`/`xart_cont`,
`stock_act`, `anulado`.

## 7. Riesgos

Credencial sin escritura, 42 tablas hijas, PK inmutable, `dis_cen` con `\r`,
`xart_cont` sin trigger (releer con retraso), F/E sin semántica confirmada.

## 8. SQL clave (reproducible)

```sql
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='tabulado';
SELECT tipo, descripcio, porc_vent, porc_comp FROM dbo.tabulado ORDER BY tipo;
SELECT CAST(a.tipo AS VARCHAR(5)), LTRIM(RTRIM(CAST(a.tipo_imp AS VARCHAR(10)))), COUNT(*)
FROM dbo.art a GROUP BY CAST(a.tipo AS VARCHAR(5)), LTRIM(RTRIM(CAST(a.tipo_imp AS VARCHAR(10))));
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='co_imp';
SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.TrigI_art'));
SELECT fk.name, c1.name, OBJECT_NAME(fk.referenced_object_id)
FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fk.object_id=fkc.constraint_object_id
JOIN sys.columns c1 ON fkc.parent_object_id=c1.object_id AND fkc.parent_column_id=c1.column_id
WHERE fk.parent_object_id=OBJECT_ID('dbo.art');
```
