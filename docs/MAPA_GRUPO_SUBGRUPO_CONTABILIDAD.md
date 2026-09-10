# Mapa Grupo+Subgrupo → Contabilidad (AD_TRANS, evidencia 2026-09-09)

> Grupo = `co_lin`, Subgrupo = `co_subl`. 142 combinaciones con artículos; 78 con `dis_cen`.
> Regla de confianza: ALTA = dominante ≥95% **y** n≥10 con-dis; MEDIA = 70–95%; BAJA = <70%.
> Muestras n=1 al 100% se clasifican NO DETERMINADO por muestra insuficiente (no ALTA).

## Veredicto

**Patrón PARCIAL.** Solo 2 combinaciones son deterministas (`01/01` 99.8% con n=639 y
`GEN/MED` 100% con n=26). El resto es correlación estadística con excepciones reales
(hasta 26 configuraciones distintas en `GEN/FER`). **Auto-carga solo segura para lista
blanca ALTA; lo demás es referencia/sugerencia, nunca valor oficial.** Contabilidad
conserva la decisión humana.

## Matriz (Top 18 por artículos con-dis)

| GRUPO | SUBGRUPO | n total | con dis | sin dis | Dominante | % | combos | Confianza |
|---|---|---|---|---|---|---|---|---|
| 01 | 01 | 639 | 639 | 0 | c1=1.1.04.01.01.001 c2=… c3=4.1.01.03.01.001 | 99.8 | 2 | ALTA |
| GEN | MED | 30 | 26 | 4 | c1=1.1.04.03.01.006 c7=1.1.04.01.01.001 c8=7.1.10.01.01.003 | 100 | 1 | ALTA |
| GEN | FER | 437 | 399 | 38 | c1=1.1.04.03.01.006 c7=… c8=7.1.10.01.01.003 | 72.2 | 26 | MEDIA |
| VEH | MEC | 1169 | 353 | 816 | c1=1.1.04.03.01.009 c7=… c8=5.1.01.01.01.001 | 60.6 | 7 | BAJA |
| UNV | FER | 213 | 171 | 42 | c1=1.1.04.03.01.006 c7=… c8=7.1.10.01.01.003 | 67.3 | 14 | BAJA |
| GEN | CON | 131 | 121 | 10 | c1=1.1.04.03.01.006 c7=… c8=7.1.10.01.01.003 | 92.6 | 8 | MEDIA |
| GEN | OFI | 99 | 89 | 10 | c1=1.1.04.03.01.002 c7=… c8=7.1.19.01.01.002 | 80.9 | 11 | MEDIA |
| VEH | FIL | 192 | 87 | 105 | c1=1.1.04.03.01.009 c7=… c8=5.1.01.01.01.001 | 55.2 | 2 | BAJA |
| VEH | CON | 202 | 72 | 130 | c1=1.1.04.03.01.009 c7=… c8=7.1.10.02.01.003 | 76.4 | 3 | MEDIA |
| VEH | GEN | 163 | 70 | 93 | c1=1.1.04.03.01.009 c7=… c8=5.1.01.01.01.001 | 55.7 | 7 | BAJA |
| UNV | OFI | 63 | 61 | 2 | c1=1.1.04.03.01.002 c7=… c8=7.1.19.01.01.002 | 68.9 | 5 | BAJA |
| GEN | SEG | 63 | 52 | 11 | c1=1.1.04.03.01.011 c7=… c8=5.1.05.04.01.001 | 75.0 | 9 | MEDIA |
| VEH | ELE | 105 | 50 | 55 | c1=1.1.04.03.01.009 c7=… c8=7.1.10.02.01.003 | 64.0 | 2 | BAJA |
| ACT | EQU | 76 | 50 | 26 | c1=1.2.05.02.04.001 c7=… (c8 solo 26/50) | 30.0 | 17 | BAJA |
| GEN | LIM | 43 | 43 | 0 | c1=… c7=… c8=… | 81.4 | 8 | MEDIA |
| ACT | MOB | 58 | 36 | 22 | c1=1.2.05.02.06.001 c7=… (c8 solo 12/36) | 63.9 | 8 | BAJA |
| ACT | VEH | 35 | 34 | 1 | c1=… c7=… (c8 1/34) | 64.7 | 3 | BAJA |
| GEN | COM | 32 | 29 | 3 | c1=… c7=… c8=… | 58.6 | 9 | BAJA |

`c7=1.1.04.01.01.001` en casi todas (tránsito). Agregado: ALTA 20 combos (18 con n=1 →
NO DETERMINADO real), MEDIA 13, BAJA 45. Cobertura ALTA real: 664/2736 con-dis (24%).

## Familias de posiciones

- **Inventario**: `{c1, c7, c8}` (c1 99%, c7 75%, c8 70% sobre con-dis).
- **01/01**: `{c1, c2, c3}` (única determinista masiva).
- c9: 39 artículos, sin columna `xart`, sin patrón de combo (caso por caso).

## Cola de excepciones (64 combos SIN dis, 4839 artículos)

Top: `RVH/MEC` 1310, `RME/MAQ` 895, `RVH/FIL` 472, `RVH/ELE` 282, `SOF/SUM` 197,
`RVH/MAN` 135, `RVH/MIS` 122, `RVH/CON` 119, `RVH/ROD` 116, `RVH/MON` 105.
Son trabajo manual de Contabilidad: sin referencia Profit que sugerir.

## Propuesta de 4 datos mínimos (PROPUESTA, pendiente de aprobación)

Evidencia: ninguna familia usa 4 posiciones a la vez (máx 3). Propuesta:
slots `{c1, c7, c8}` obligatorios + 4º slot condicional `{c2, c3}` solo para familia 01-type.
Prioridad en bandeja: ALTA = firma dominante completa; MEDIA = parcial; EXCEPCIÓN = sin firma.
**NO aprobar automáticamente**: la firma es referencia.

## Arquitectura futura (diseño, NO implementar)

- Almacén elige Grupo+Subgrupo → API consulta firma conocida (lista blanca ALTA precargada
  desde este mapa; resto: "sin configuración dominante, N variantes") → muestra solo lectura.
- Contabilidad valida: correspondencia grupo/subgrupo, firma esperada vs actual, 4 slots,
  existencia en `sccuenta` (+ fallback obsoletas). Orden: completas primero, luego parciales,
  luego excepciones.
