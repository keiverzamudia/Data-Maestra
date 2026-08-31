---
name: matching-engine
description: Diseñar matching híbrido y explicable para detectar artículos equivalentes sin fusionar falsos positivos.
compatibility: opencode
---

# Matching Engine

## Pipeline
1. normalización;
2. exact match;
3. códigos de fabricante;
4. atributos;
5. fuzzy text;
6. reglas de exclusión;
7. score;
8. revisión humana si corresponde.

## Score
Los pesos deben estar configurados en DB/configuración, no hardcodeados.

Ejemplo inicial orientativo:
- part number 40%;
- marca 15%;
- modelo 15%;
- categoría 10%;
- descripción 10%;
- medidas 5%;
- aplicación 5%.

Estos pesos son hipótesis iniciales y deben calibrarse con datos reales.

## Decisión
- alta confianza: candidato fuerte;
- media: revisión;
- baja: no recomendar.

Nunca afirmar igualdad física solo por similitud textual.

## Explicabilidad
Cada score debe poder explicar qué campos coincidieron y cuáles difirieron.
