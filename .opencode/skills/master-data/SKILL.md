---
name: master-data
description: Aplicar principios de Master Data Management para artículos homologados, códigos maestros, alias, atributos y relaciones con múltiples fuentes.
compatibility: opencode
---

# Master Data

## Entidad central
`master_item` representa un artículo homologado.

## Debe distinguir
- código original;
- código maestro;
- descripción original;
- descripción normalizada;
- descripción maestra.

## Relaciones
Un master item puede relacionarse con muchos registros de origen.

## Invariantes
- Un mismo código de una fuente no puede apuntar simultáneamente a dos maestros activos.
- Un master item no debe duplicarse por una sola diferencia de mayúsculas/espacios.
- No fusionar sin trazabilidad.
- Las fusiones deben conservar historial y referencias.

## Estados
ACTIVE, INACTIVE, MERGED, PENDING_REVIEW, REJECTED según el contexto.
