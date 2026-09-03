# FASE 8D.1 — CIERRE DE CATÁLOGO CONTABLE Y c9/c10

## Objetivo

Cerrar las dudas pendientes de la FASE 8D sobre la estructura contable de Profit Plus 2K8 antes de diseñar la implementación en Data-Maestra.

Esta fase es EXCLUSIVAMENTE de investigación y verificación READ-ONLY.

Debemos resolver, con evidencia real:

1. Dónde está el catálogo maestro completo de cuentas contables que utiliza Profit.
2. De dónde obtiene Profit las cuentas asociadas a `c9`.
3. Si existe realmente una posición `c10` aunque actualmente no tenga artículos.
4. Qué representa exactamente cada posición `c1...c10`.
5. Si `xart_cont` es catálogo, desglose por artículo o ambas cosas.
6. Si existen otras tablas que completen `cta1...cta8` y permitan explicar `c9/c10`.
7. Si las cuentas contables dependen de empresa, ejercicio u otra configuración.
8. Si la pantalla de Profit utiliza una tabla/configuración distinta a `xart_cont`.
9. Si realmente podemos cumplir el requisito futuro de "todas las cuentas existentes en Profit".

NO implementar todavía la funcionalidad de Contabilidad en Data-Maestra.

---

# 1. CONTEXTO CONFIRMADO DE FASE 8D

Servidor:

```text
SRVBDPROFITBK
```

Base principal:

```text
AD_TRANS
```

Tabla de artículos:

```text
dbo.art
```

Campo:

```text
dis_cen
```

Ejemplo real:

```xml
<DIS>{c1:1.2.05.02.06.001}{c7:1.1.04.01.01.001}</DIS>
```

La investigación anterior encontró:

```text
dbo.xart_cont
    cta1 ... cta8
    nom_cta1 ... nom_cta8
```

y aproximadamente:

```text
2744 artículos con información contable relacionada
53 valores distintos en cta1
35 valores distintos en cta8
```

También se encontró:

```text
c1 → 2719 artículos
c2 → 681
c3 → 639
c4 → 0
c5 → 0
c6 → 0
c7 → 2066
c8 → 1921
c9 → 39
c10 → 0
```

Por lo tanto:

### NO asumir:

```text
xart_cont = catálogo maestro completo
```

porque todavía no está demostrado.

---

# 2. REGLAS NO NEGOCIABLES

Esta fase es READ-ONLY.

Prohibido ejecutar sobre Profit:

```text
INSERT
UPDATE
DELETE
MERGE
ALTER
DROP
CREATE
TRUNCATE
```

También evitar procedimientos almacenados si no se conoce con certeza que son READ-ONLY.

Preferir consultas contra:

```text
sys.databases
sys.tables
sys.columns
sys.types
sys.indexes
sys.index_columns
sys.foreign_keys
sys.foreign_key_columns
sys.objects
INFORMATION_SCHEMA
```

y SELECT sobre tablas.

NO modificar:

- AD_TRANS
- AD_DIST
- AD_CPAST
- AD_SLT
- AD_SLS
- AD_GRUP
- Data-Maestra
- Prisma
- workflow
- frontend
- ProfitAdapter

No crear base de datos TEST.

No crear tablas.

No importar nada.

No escribir nada.

---

# 3. PRIMER OBJETIVO — ENCONTRAR EL CATÁLOGO MAESTRO

La Fase 8D no encontró una tabla claramente identificada como PUC.

Ahora hacer una investigación más profunda.

## 3.1 Buscar por estructura, no solo por nombre

No buscar solamente tablas llamadas:

```text
cuentas
plan_cuentas
contabilidad
```

Buscar tablas que tengan combinaciones de columnas compatibles con:

```text
código
descripción
cuenta
nivel
padre
tipo
activo
```

Investigar columnas cuyo nombre contenga términos como:

```text
cod
codigo
co_
cuenta
cta
descr
des
nombre
nom
nivel
padre
sub
mayor
grupo
```

pero también analizar tablas que tengan estructura sospechosa aunque sus nombres no sean obvios.

Entregar candidatos ordenados:

| Tabla | Columnas relevantes | Registros | Por qué es candidata | Confianza |
|---|---|---:|---|---|

---

# 4. INVESTIGAR LONGITUD Y FORMATO DE CÓDIGOS

Los códigos reales observados tienen formato:

```text
1.2.05.02.06.001
2.1.03.01.02.000
```

Investigar tablas de AD_TRANS y bases relacionadas buscando columnas que contengan valores con patrones similares.

Usar SQL para identificar:

- códigos con puntos;
- códigos numéricos jerárquicos;
- longitud;
- número de segmentos;
- ceros a la izquierda.

No limitarse a nombres de columna.

Si es viable, localizar columnas de texto donde aparezcan valores que cumplan patrones similares a:

```regex
^[0-9]+(\.[0-9]+)+$
```

La búsqueda debe ser razonable y segura; no lanzar consultas destructivas ni innecesariamente pesadas contra todas las tablas si existen mejores candidatos.

---

# 5. INVESTIGAR DESCRIPCIONES DE CUENTAS

Para las tablas candidatas, verificar si existe la correspondencia:

```text
código → descripción
```

Ejemplos que debemos intentar localizar:

```text
1.2.05.02.06.001
Costo mobiliario / equipo de oficina
```

y:

```text
2.1.03.01.02.000
Cuentas por pagar transitorio
```

No asumir que las descripciones deben coincidir exactamente con la captura.

Si existen diferencias, documentarlas.

---

# 6. INVESTIGAR xart_cont EN PROFUNDIDAD

Determinar exactamente qué representa:

```text
dbo.xart_cont
```

Investigar:

- PK;
- índices;
- claves foráneas;
- relaciones;
- columnas completas;
- cantidad de filas;
- duplicados por `co_art`;
- duplicados por combinación de cuentas;
- si una fila corresponde a un artículo;
- si puede contener más de una fila por artículo;
- qué columnas adicionales existen;
- si `cta1...cta8` son posiciones equivalentes a c1...c8;
- si `nom_cta1...nom_cta8` son realmente las descripciones que muestra Profit;
- si existe algún campo equivalente a c9/c10 oculto bajo otro nombre.

Entregar mapa:

```text
dis_cen.c1
   ↓
xart_cont.cta1
   ↓
xart_cont.nom_cta1
```

y repetir para c2...c8.

Si la relación no es 1:1, documentarla.

---

# 7. INVESTIGACIÓN ESPECÍFICA DE c9

Esta es una prioridad crítica.

Ya sabemos que existen 39 artículos con `c9`.

Extraer todos los casos reales:

```text
co_art
dis_cen
valor c9
```

Después investigar esos mismos artículos en:

```text
xart_cont
```

Determinar:

```text
art.dis_cen.c9
        ↓
¿xart_cont.cta9?
        ↓
¿otra columna?
        ↓
¿otra tabla?
        ↓
¿otra configuración?
```

Si `xart_cont` no tiene `cta9`, descubrir de dónde sale.

Buscar además:

- columnas relacionadas con `cta9`;
- columnas relacionadas con `nom_cta9`;
- tablas relacionadas con `co_art`;
- otras tablas contables;
- estructuras XML/texto;
- configuraciones.

Entregar los 39 casos o, si son demasiados para el informe, estadísticas + suficientes ejemplos representativos y guardar la consulta SELECT completa.

---

# 8. INVESTIGACIÓN ESPECÍFICA DE c10

Aunque actualmente:

```text
c10 = 0
```

NO concluir que no existe.

Buscar:

```text
c10
cta10
nom_cta10
10
distribución 10
cuenta 10
```

en:

- nombres de columnas;
- datos;
- configuraciones;
- tablas;
- procedimientos/documentación local si fuese seguro leerlos.

Determinar si:

### Caso A

c10 es una posición válida pero actualmente sin uso.

### Caso B

Profit realmente solo soporta c1...c9 en esta instalación.

### Caso C

Existe una configuración de 10 posiciones pero está deshabilitada.

### Caso D

c10 pertenece a otra estructura.

No elegir un caso sin evidencia.

---

# 9. INVESTIGAR c1...c10 COMO POSICIONES

Crear una matriz:

| Posición | Encontrada en dis_cen | Encontrada en xart_cont | Campo correspondiente | Nombre | Fuente | Confianza |
|---|---|---|---|---|---|---|
| c1 | Sí | Sí | ... | ... | ... | Alta/Media/Baja |
| c2 | Sí | Sí | ... | ... | ... | ... |
| c3 | Sí | Sí | ... | ... | ... | ... |
| c4 | No | ? | ... | ... | ... | ... |
| c5 | No | ? | ... | ... | ... | ... |
| c6 | No | ? | ... | ... | ... | ... |
| c7 | Sí | Sí | ... | ... | ... | ... |
| c8 | Sí | Sí | ... | ... | ... | ... |
| c9 | Sí | ? | ... | ... | ... | ... |
| c10 | No | ? | ... | ... | ... | ... |

NO rellenar por inferencia.

---

# 10. INVESTIGAR LAS ETIQUETAS DE PROFIT

La pantalla muestra posiciones:

```text
01
02
03
...
10
```

y nombres/configuraciones asociados.

Necesitamos determinar si:

```text
c1
c2
...
c10
```

son simplemente posiciones internas y Profit utiliza etiquetas fijas.

Buscar en AD_TRANS y bases relacionadas:

```text
parámetros
configuración
empresa
contabilidad
artículos
cuentas
```

La Fase 8D encontró:

```text
dbo.par_emp
p_para1...p_para10 = 0
dist_num = 0
```

y no encontró una tabla evidente para etiquetas.

Revalidar esto sin asumir la conclusión anterior.

Si no aparece ninguna fuente:

```text
ORIGEN DE ETIQUETAS = NO DETERMINADO
```

No inventar nombres.

---

# 11. INVESTIGAR TODAS LAS BASES DEL SERVIDOR

Ya fueron revisadas algunas:

```text
AD_TRANS
AD_DIST
AD_CPAST
AD_SLT
AD_SLS
AD_GRUP
```

Ahora hacer inventario de las bases disponibles en:

```text
SRVBDPROFITBK
```

pero solo consultar las que tengan indicios razonables de contener:

- configuración;
- contabilidad;
- catálogo;
- empresa;
- artículos.

Determinar si el catálogo maestro podría estar en otra base.

Si otra base contiene información relevante:

```text
Base
Tabla
Relación
Evidencia
```

No asumir que AD_TRANS contiene todo.

---

# 12. INVESTIGAR DEPENDENCIA POR EMPRESA

Determinar si:

```text
c1...c10
```

y las cuentas dependen de:

- empresa;
- ejercicio;
- sucursal;
- instalación.

Buscar columnas como:

```text
co_emp
cod_emp
empresa
ejercicio
ano
periodo
```

en las tablas candidatas.

Comparar si el mismo código puede tener diferentes descripciones según empresa.

---

# 13. INVESTIGAR CUENTAS USADAS VS CUENTAS EXISTENTES

Necesitamos distinguir:

```text
CUENTAS UTILIZADAS POR ARTÍCULOS
```

de:

```text
CUENTAS EXISTENTES EN EL CATÁLOGO DE PROFIT
```

Calcular, si el catálogo maestro es encontrado:

```text
Total cuentas existentes
Total cuentas usadas en dis_cen
Total cuentas usadas en xart_cont
Total cuentas no utilizadas por artículos
```

Esto determinará si Data-Maestra debe importar:

```text
A) todas las cuentas
```

o:

```text
B) solamente cuentas usadas
```

El requisito del usuario es A, pero solo debe implementarse después de encontrar evidencia del catálogo.

---

# 14. INVESTIGAR CUENTAS INACTIVAS

Si el catálogo maestro contiene estado:

```text
activo/inactivo
```

determinar:

- cuántas activas;
- cuántas inactivas;
- si artículos actuales usan cuentas inactivas;
- si Profit permite seleccionarlas en la pantalla.

Esto será relevante para el futuro selector.

---

# 15. INVESTIGAR LA RELACIÓN CON LA PANTALLA

La captura de Profit muestra una interfaz donde:

```text
01
02
03
...
10
```

representa las posiciones.

Queremos saber si:

```text
c1 = posición 01
c2 = posición 02
...
c10 = posición 10
```

No asumirlo únicamente por nombre.

Comparar artículos reales donde se conozca:

```text
dis_cen
```

con lo que aparece en Profit si la información puede observarse de forma segura.

Si no puede verificarse desde la aplicación:

```text
RELACIÓN UI ↔ dis_cen = NO DETERMINADA
```

---

# 16. PRUEBA CRÍTICA DE RECONSTRUCCIÓN

Tomar varios artículos reales y reconstruir:

```xml
<DIS>{c1:...}{c7:...}</DIS>
```

desde la información de las tablas encontradas.

Ejemplo:

```text
Artículo: HERMEC066

dis_cen:
<DIS>{c1:1.2.05.02.05.001}{c7:1.1.04.01.01.001}{c8:7.1.10.02.01.002}</DIS>
```

Intentar explicar cada componente:

```text
c1 → ?
c7 → ?
c8 → ?
```

y verificar que los códigos existen en el catálogo correspondiente.

---

# 17. CONCLUSIÓN SOBRE EL FUTURO SELECTOR

Al final de la investigación responder obligatoriamente:

### ¿Podemos construir un selector con TODAS las cuentas de Profit?

Responder exactamente una de:

```text
SÍ — catálogo maestro identificado
```

o:

```text
NO — catálogo maestro todavía no identificado
```

o:

```text
PARCIALMENTE — catálogo identificado pero faltan elementos
```

Explicar por qué.

---

# 18. NO IMPLEMENTAR

Aunque durante la investigación se descubra la solución, NO implementar todavía:

- Prisma;
- modelos;
- migraciones;
- endpoints;
- React;
- selector;
- hooks;
- servicios;
- importación;
- sincronización;
- generación de DIS;
- WRITE a Profit;
- cambios de workflow.

La implementación será la siguiente fase.

---

# 19. ENTREGABLES

Crear:

```text
docs/INVESTIGACION_CONTABLE_PROFIT_8D1.md
```

Debe contener:

1. Resumen ejecutivo.
2. Catálogo maestro encontrado.
3. Tablas candidatas descartadas.
4. Investigación de xart_cont.
5. Investigación completa de c9.
6. Investigación completa de c10.
7. Matriz c1-c10.
8. Origen de las etiquetas.
9. Dependencia por empresa/ejercicio.
10. Cuentas utilizadas vs existentes.
11. Cuentas activas/inactivas.
12. Calidad de datos.
13. Reconstrucción de ejemplos DIS.
14. Consultas SQL utilizadas.
15. Conclusiones.
16. NO DETERMINADO.

Crear también:

```text
docs/MAPA_CUENTAS_PROFIT_8D1.md
```

Debe mostrar visualmente en texto:

```text
PROFIT
│
├── Configuración c1...c10
│
├── Catálogo maestro
│    ├── código
│    └── descripción
│
├── xart_cont
│    ├── cta1 / nom_cta1
│    ├── ...
│    └── cta8 / nom_cta8
│
└── art.dis_cen
     ├── c1
     ├── ...
     ├── c9
     └── c10
```

Y explicar las relaciones confirmadas.

---

# 20. VALIDACIÓN FINAL

Antes de detenerse confirmar:

```text
[ ] Solo SELECT
[ ] 0 escrituras
[ ] 0 cambios de esquema
[ ] 0 cambios en Profit
[ ] 0 cambios en Data-Maestra
[ ] Catálogo maestro investigado
[ ] xart_cont investigado
[ ] c9 investigado
[ ] c10 investigado
[ ] c1-c10 documentados
[ ] Etiquetas investigadas
[ ] Dependencia por empresa investigada
[ ] Cuentas utilizadas vs existentes investigadas
[ ] Reconstrucción DIS verificada
```

---

# 21. INFORME FINAL OBLIGATORIO

Mostrar:

```text
FASE 8D.1 — CIERRE DE CATÁLOGO CONTABLE Y c9/c10

ESTADO: COMPLETADA / BLOQUEADA

CATÁLOGO MAESTRO:
- Encontrado / No encontrado / Parcial
- Tabla:
- Registros:
- Código:
- Descripción:

xart_cont:
- Función:
- cta1...cta8:
- Relación con art:

c9:
- Origen:
- Ejemplos:
- Correspondencia:

c10:
- Existe / No existe / No determinado
- Evidencia:

c1-c10:
- resumen

ETIQUETAS:
- origen:

DEPENDENCIA:
- empresa:
- ejercicio:

CUENTAS:
- total existentes:
- usadas:
- no usadas:
- activas:
- inactivas:

DIS:
- formato confirmado:
- reconstrucción confirmada:

ESCRITURAS REALIZADAS: 0
CAMBIOS EN PROFIT: 0
CAMBIOS EN DATA-MAESTRA: 0

ARCHIVOS CREADOS:
- docs/INVESTIGACION_CONTABLE_PROFIT_8D1.md
- docs/MAPA_CUENTAS_PROFIT_8D1.md

CONCLUSIÓN:
¿Podemos construir el selector con TODAS las cuentas? SÍ / NO / PARCIALMENTE

NO DETERMINADO:
1. ...
2. ...

SIGUIENTE PASO:
FASE 8E — DISEÑO TÉCNICO DE CONTABILIDAD DATAMAESTRA

DETENERSE.
NO comenzar 8E automáticamente.
