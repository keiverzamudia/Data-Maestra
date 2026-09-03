# Corrección selector contable — Fase 8E.6.1

> Sin cambios en Profit. Sin filtros nuevos. Sin agent-browser.

## Causa de duplicados

- **En `sccuenta`: NO existen.** `GROUP BY co_cue HAVING COUNT(*) > 1` vacío;
  855 filas / 855 códigos distintos; los 7 códigos reportados existen una vez
  cada uno. La fuente es correcta y no se toca.
- **En API: NO existen.** Páginas `OFFSET 0/20` con `ORDER BY co_cue` verificadas
  disjuntas vía `sqlcmd` (página 1 termina en `1.1.04.06.04.001`, página 2
  empieza en `5.1.01.01.01.001`).
- **Solamente en frontend:** el acumulador usaba `results.length` del closure y
  aceptaba cualquier respuesta tardía, de modo que una página obsoleta
  (búsqueda anterior o scroll repetido) se agregaba sobre resultados vigentes,
  repitiendo códigos y provocando `Encountered two children with the same key`.
  No se ocultó con una key artificial: se corrigió la fuente del duplicado.

## Solución

- Nuevo `utilidades/account-pages.ts` (puro y testeado): cada búsqueda abre una
  **generación**; cada página lleva su **offset esperado**. Solo se acepta una
  respuesta si generación y offset coinciden con los vigentes; el resto se
  descarta (sin mezclas, sin repetidos, sin huecos). Cambio de búsqueda
  reinicia items/offset/estado.
- Red de seguridad determinista: `dedupeByCode` (primera ocurrencia, orden
  estable). Con códigos únicos no pierde información.
- Key React: `key={a.code}`, válida porque el backend garantiza unicidad
  (verificado en § anterior); el comentario en código lo documenta.
- Búsqueda y paginación del backend **sin cambios** (ya correctas).

## Paginación

Primera carga 20; scroll al final (`scrollTop + clientHeight >=
scrollHeight - 40`) pide `offset = siguiente esperado`; continúa hasta
`hasMore = false` (página parcial), cubriendo las 489 imputables. Cambio de
texto reinicia todo y solo muestra la nueva búsqueda.

## Búsqueda

Server-side con debounce 300 ms sobre `co_cue` y `des_cue`, parcial,
case-insensitive por collation. Sin filtros adicionales.

## Tests

- Web (`account-pages.test.ts`, 10 tests, primer archivo de tests web):
  no-duplicados, primera/segunda página, reinicio por búsqueda, tardías
  descartadas, offset obsoleto descartado, última página parcial, contrato
  código/descripción, key estable.
- API: 13 suites, 126 passed (incluye búsqueda código+nombre y 18 DIS intactos).
- Typecheck API y web PASS. Build web PASS (146 módulos).

## Cambios

- Creados: `utilidades/account-pages.ts`, `utilidades/account-pages.test.ts`,
  este documento.
- Modificados: `InformacionContable.tsx` (paginación por generación/offset;
  UI intacta), `IMPLEMENTACION_CATALOGO_CUENTAS_PROFIT_8E6.md` (nota 8E.6.1).
- Eliminados: ninguno.
- Profit: 0 escrituras (scan 0 × INSERT/UPDATE/DELETE/MERGE/ALTER/DROP/CREATE/
  TRUNCATE/`$executeRaw`/`$queryRaw`); solo `@Get`.
