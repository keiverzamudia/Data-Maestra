# FASE 14D — Contrato definitivo de creación de artículo en Profit (SOLO DISEÑO)

> READ-ONLY. 0 INSERT/UPDATE/DELETE ejecutados. La escritura futura será
> directa contra la base original `AD_TRANS` (fuente de verdad; sin BD paralela).

## 1. Arquitectura

```text
DM: solicitud → clasificar → validar(dry-run) → contabilidad → validación
    → APROBADO_FINAL → [FUTURO] PROCESANDO_PROFIT → INSERT Profit
    → VERIFY (relectura) → REGISTRADO_PROFIT | ERROR_PROFIT (reconciliar)
```

Estado real del código: `generateMasterCode()` existe (solo DM, patrón
MAX+1 local — **prohibido reutilizar para Profit**); `validateClassification()`
es el dry-run; no existe ningún servicio de escritura (`PROFIT_WRITE_ENABLED`
bloquea; estados PROCESANDO/REGISTRADO/ERROR_PROFIT solo son vocabulario).

## 2. Evidencia Profit (SELECT, base original, 11.192 artículos)

- PK `art_co_art` CLUSTERED sobre `co_art char(30) NOT NULL`, sin default,
  sin IDENTITY. Único adicional: `rowguid` (`newid()`).
- Índices útiles: `ico_lin`, `ico_subl`, `iuni_venta`, `isuni_vent`, `itipo_imp`.
- CHECKs: `CK_art_CO_ART (co_art<>'')`, `CK_art_TIPO (V/F/C/S/M/N/E)`,
  `CK_art_TIPO_IMP (1-9)`.
- Triggers activos: `TrigI_art` (INSERT: exige `suni_venta` ∈ unidades),
  `TrigU_art` (UPDATE: igual si cambia), `TrigD_art` (DELETE: bloquea con
  descuentos), `TrigD_artMce` (DELETE: bloquea con movimientos).
- Formato real: 61 % sistemático `{LIN}{SUBL}{NNNN}` (p. ej. `ACTEQT0001`,
  `HERMEC066`); resto legado (part numbers `*-CAT`, numéricos). Sin espacios
  (1 anomalía), 692 con guion (legado). `co_lin`/`co_subl` char(6), valores
  de 2–5 caracteres. Secuencias densas (RVH/MEC max 1313/1306 filas).
- **Conclusión §4**: `co_art` ≠ `master_code`. DM usa `{LIN}{SUBL}-{5díg}`
  con guion; Profit sistemático usa `{LIN}{SUBL}{4díg}` sin guion. Ambos
  códigos coexisten: `master_code` (interno DM) vs `co_art`/`source_code`.

## 3. Matriz de campos

| Campo Profit | Origen | Envía DM | Genera Profit | Oblig. | Validación previa |
|---|---|---|---|---|---|
| `co_art` | DM (algoritmo §5) | SÍ | — | SÍ | formato+disponibilidad+dry-run |
| `art_des` | solicitante | SÍ | — | SÍ | ≥3, normalizada |
| `tipo` | Warehouse (C/S/V) | SÍ | — | SÍ | dominio CHECK |
| `co_lin`, `co_subl` | Profit (compuesta) | SÍ | — | SÍ | FK compuesta |
| `uni_venta`=`suni_venta` | Profit unidades | SÍ (ambos) | — | SÍ | existencia viva (trigger) |
| `tipo_imp` | regla tipo→tasa | SÍ | — | SÍ | tabulado 1-9 |
| `co_cat/co_color/procedenci/co_prov` | defaults `01/01/01/GEN` | SÍ explícito | (def.) | Cond. | existencia |
| `tipo_cos` | ULCO (ULOM si S) | SÍ | — | SÍ | coherencia con tipo |
| `dis_cen` | estándar de línea o vacío | SÍ | — | Cond. | — |
| `fecha_reg/rowguid/stocks` | — | NUNCA | SÍ | — | — |
| `co_imp` | — | NUNCA (100 % vacío) | — | — | — |
| Todo lo releído | — | — | — | — | §12 |

## 4. Payload definitivo (solo estos campos)

`co_art, art_des, tipo, co_lin, co_subl, uni_venta, suni_venta, tipo_imp,
co_cat, co_color, procedenci, co_prov, tipo_cos, dis_cen`. Nada más.

## 5. Generación de código/correlativo (segura, no MAX+1)

Prefijo = `TRIM(co_lin)+TRIM(co_subl)`; sufijo 4 dígitos zero-padded
(rango 0001–9999; superar → `ERROR_CODE_SPACE_EXHAUSTED`).

1. `MAX(RIGHT(co,4))` con `LIKE prefijo+'[0-9]⁴'` (seek por prefijo literal).
2. Candidato = prefijo + siguiente.
3. `SELECT` existencia (filtro rápido, no garantía).
4. `INSERT` en transacción propia y corta.
5. Si error 2627 + mensaje `art_co_art` → colisión: siguiente candidato.
6. Reintento hasta `MAX_CODE_ALLOCATION_ATTEMPTS = 10`.
7. Agotado → `ERROR_CODE_ALLOCATION_EXHAUSTED`, solicitud a `ERROR_PROFIT`,
   sin estado ambiguo (nada escrito o solo el INSERT verificado).

## 6. Colisiones y concurrencia (§6–§7)

- Solo es colisión: `err.number === 2627` y mensaje con `art_co_art`
  (PK clustered; 2601 no aplica: el otro único es `rowguid` autogenerado).
- Todo lo demás (CHECK, FK, trigger 16/547/50000, timeout) = ERROR REAL:
  no reintentar, clasificar y escalar a humano.
- Proceso A y B pueden generar el mismo candidato: el perdedor recibe 2627
  y avanza al siguiente. Ventana mínima por transacción corta.

## 7. Idempotencia SEND → VERIFY → RECONCILE (§9)

`co_art` es la clave natural de idempotencia (sin IDENTITY que rastrear).
Tras INSERT o ante pérdida de conexión: `SELECT` por `co_art`.
- Existe con datos esperados → creado (reconciliar a REGISTRADO_PROFIT).
- No existe → retomar asignación.
- Existe con datos distintos → ERROR (fila ajena),STOP humano, jamás retry ciego.

## 8. Dry-run (§11, ya implementado)

`validateClassification()` → `READY` (ready=true), `BLOCKED` (faltantes),
`ERROR` (excepciones/Profit caído), con texto+icono, nunca solo color.

## 9. Relectura (§12)

`SELECT co_art, art_des, tipo, co_lin, co_subl, uni_venta, suni_venta,
tipo_imp, co_cat, co_color, procedenci, co_prov, tipo_cos, dis_cen,
fecha_reg, rowguid` por `co_art`; comparar EXPECTED vs ACTUAL campo a campo
(normalizando `char` con TRIM). Divergencia en defaults → WARNING con
tolerancia documentada; en enviados → ERROR.

## 10. Errores, límites y seguridad

`ERROR_CODE_ALLOCATION_EXHAUSTED` (10 intentos), `ERROR_CODE_SPACE_EXHAUSTED`
(>9999), `ERROR_PROFIT_UNREACHABLE`, `ERROR_PROFIT_VALIDATION` (CHECK/FK/
trigger con mensaje original). Credencial de escritura separada y mínima,
`PROFIT_WRITE_ENABLED` + fase explícita sobre copia antes de producción,
auditoría `PROFIT_ARTICLE_DRYRUN/CREATED/FAILED` sin secretos, permiso
`PROFIT.WRITE` independiente del READ.

## 11. Respuesta al criterio de finalización

Sabemos qué envía DM (§4), qué genera Profit (§3), cómo se genera el código
(§5), cómo se evitan colisiones (§6), qué error es colisión (2627+art_co_art)
y cómo se comprueba la creación (§9). Todo con evidencia SELECT citada arriba.
