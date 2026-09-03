# FASE 8D — INVESTIGACIÓN CONTABLE PROFIT

## Objetivo
Investigar EXCLUSIVAMENTE READ-ONLY cómo Profit Plus 2K8 almacena y presenta la información contable de artículos, especialmente:

```sql
SELECT TOP (1000) co_art, dis_cen
FROM AD_TRANS.dbo.art;
```

Ejemplo:
`<DIS>{c1:1.2.05.02.06.001}{c7:1.1.04.01.01.001}</DIS>`

NO implementar todavía la pantalla de Contabilidad de Data-Maestra. NO modificar Profit.

## Reglas no negociables
- Solo SELECT en SQL Server.
- Prohibidos INSERT, UPDATE, DELETE, MERGE, ALTER, DROP, CREATE y TRUNCATE.
- No modificar Data-Maestra, Prisma, workflow ni frontend.
- No inventar tablas, relaciones, significados ni reglas.
- Toda conclusión debe tener evidencia real.
- Si algo no puede determinarse: `NO DETERMINADO`.
- No investigar ni implementar distribución por centros de costo.

## Contexto funcional confirmado
- Existen como máximo 10 posiciones: c1...c10.
- Cada posición acepta UNA sola cuenta.
- No es obligatorio llenar las 10.
- Solo se guardan las posiciones seleccionadas.
- El futuro selector debe permitir buscar por código/número y por nombre/descripción.
- Código y descripción están vinculados: seleccionar uno debe resolver el otro.
- Solo se usarán cuentas que ya existan en Profit.
- No se permitirá crear cuentas desde Data-Maestra en esta primera versión.
- El futuro formato debe ser exactamente:
`<DIS>{c1:...}{c7:...}</DIS>`

## 1. Inventario de tablas
En `SRVBDPROFITBK`, investigar `AD_TRANS` y otras bases relacionadas si fuese necesario usando `sys.tables`, `sys.columns`, `sys.types`, `sys.schemas`.

Buscar tablas/columnas relacionadas con:
`cuenta`, `contab`, `contable`, `contabilidad`, `cta`, `co_cta`, `dis`, `cen`, etc., sin limitarse a esos nombres.

Entregar tabla:
| Tabla | Columna | Tipo | Posible función | Evidencia |

## 2. Investigación de dis_cen
Analizar datos reales de `dbo.art.dis_cen`:
- cantidad total;
- vacíos/no vacíos;
- presencia de `<DIS>`;
- posiciones c1...c10 encontradas;
- frecuencia por posición;
- combinaciones de posiciones;
- ejemplos reales;
- formatos diferentes;
- orden;
- espacios/saltos;
- posiciones fuera de c1-c10;
- duplicados;
- códigos inválidos o sin correspondencia.

Entregar estadísticas y ejemplos.

## 3. Descubrir qué significan c1...c10
Determinar de dónde obtiene Profit los nombres/etiquetas que aparecen en la ventana de Información Contable.

Investigar configuración, parámetros, catálogos y relaciones que permitan obtener:
`c1 → nombre`, ..., `c10 → nombre`.

NO asumir que los nombres son fijos.

Determinar si dependen de:
- empresa;
- ejercicio;
- instalación;
- tipo de artículo;
- configuración.

## 4. Encontrar catálogo de cuentas
Identificar la tabla real que alimenta el selector de cuentas.

Determinar, con evidencia:
- código;
- descripción;
- activo/inactivo;
- tipo;
- nivel;
- cuenta padre;
- claves/índices;
- duplicados;
- cantidad de registros.

Necesitamos poder explicar cómo Profit convierte:
`2.1.03.01.02.000 ↔ CUENTAS POR PAGAR TRANSITORIO`

## 5. Relacionar dis_cen con cuentas
Para códigos encontrados en `dis_cen`, correlacionar con el catálogo real.

Calcular:
- códigos analizados;
- cuentas encontradas;
- cuentas no encontradas;
- porcentaje de correspondencia;
- diferencias de formato;
- espacios;
- ceros a la izquierda;
- códigos obsoletos si existen.

## 6. Investigar la pantalla de Profit
Si puede determinarse de forma segura y READ-ONLY, descubrir qué tabla/configuración utiliza Profit para llenar el selector mostrado en la captura.

No hacer ingeniería invasiva, no modificar instalación ni archivos.

## 7. Mapa c1-c10
Crear tabla:
| Posición | Nombre mostrado por Profit | Código ejemplo | Descripción ejemplo | Tabla origen | Confirmado |
|---|---|---|---|---|---|
| c1 | ... | ... | ... | ... | Sí/No |
...
| c10 | ... | ... | ... | ... | Sí/No |

No rellenar información sin evidencia.

## 8. Reglas de serialización
Determinar exactamente cómo debe reconstruirse:
`<DIS>{c1:...}{c7:...}</DIS>`

Verificar:
- orden;
- espacios;
- mayúsculas;
- etiqueta;
- posiciones vacías;
- duplicados;
- orden obligatorio o no;
- aceptación de posiciones parciales.

NO implementar todavía la función.

## 9. Calidad de datos
Buscar:
- códigos duplicados;
- nombres duplicados;
- espacios;
- descripciones vacías;
- cuentas inactivas;
- cuentas usadas por artículos pero ausentes del catálogo;
- cuentas del catálogo nunca utilizadas.

## 10. Entregables
Crear únicamente documentación de investigación:

`docs/INVESTIGACION_CONTABLE_PROFIT_8D.md`
- resumen;
- bases consultadas;
- tablas;
- catálogo;
- c1-c10;
- dis_cen;
- estadísticas;
- relaciones;
- calidad;
- serialización;
- dependencia por empresa;
- confirmado/no determinado;
- recomendación;
- SQL SELECT utilizado.

`docs/MAPA_CONTABLE_PROFIT.md`
- mapa central c1-c10 y origen de cada dato.

`docs/PROPUESTA_CONTABILIDAD_DATAMAESTRA_8D.md`
- solo propuesta futura de UI/flujo:
  carpeta [c1-c10] + cuenta [buscar código/nombre];
  selección bidireccional código↔descripción;
  máximo 10;
  posiciones opcionales;
  salida `<DIS>{c1:...}{c7:...}</DIS>`.

## 11. Validación
Confirmar:
- conexión SQL;
- AD_TRANS;
- consultas SELECT;
- 0 escrituras;
- 0 cambios en Profit;
- c1-c10 investigados;
- catálogo identificado o NO DETERMINADO;
- relación con dis_cen;
- estadísticas;
- reglas de serialización.

## 12. Prohibido en 8D
NO:
- importar cuentas a Data-Maestra;
- crear modelos Prisma;
- migraciones;
- endpoints;
- React;
- selector;
- ProfitAdapter WRITE;
- escritura en Profit;
- crear cuentas;
- centros de costo;
- cambios de workflow.

## Informe final obligatorio
Mostrar:

FASE 8D — INVESTIGACIÓN CONTABLE PROFIT
ESTADO: COMPLETADA / BLOQUEADA

BASES INVESTIGADAS:
- ...

TABLAS ENCONTRADAS:
- ...

CATÁLOGO CONTABLE:
- ...

c1-c10:
- ...

dis_cen:
- ...

CORRESPONDENCIA:
- ...

ESCRITURAS REALIZADAS: 0
CAMBIOS EN PROFIT: 0

ARCHIVOS CREADOS:
- ...

CONCLUSIONES:
1. ...
2. ...
3. ...

NO DETERMINADO:
1. ...

SIGUIENTE PASO PROPUESTO:
FASE 8E — DISEÑO TÉCNICO DE CONTABILIDAD DATAMAESTRA

DETENERSE. No comenzar 8E automáticamente.
