# FASE 19 — Normalizador semántico y extracción de características

> Evolución de la fundación FASE 18. Sin motor de coincidencia, sin IA,
> sin homologación, sin escrituras Profit. Textos de usuario en español;
> códigos internos intactos.

## 1. Objetivo

Representaciones comparables: distintas escrituras del mismo artículo
("FILTRO P/ACEITE INT DT466", "Filtro de aceite International DT-466",
"FILTRO ACEITE INT DT 466") generan formas normalizadas que FASE 20 podrá
comparar, conservando siempre los originales.

## 2. Relación con FASE 18

Se reutiliza todo (identidad, perfil, input, decisiones, auditoría, RBAC,
ProfitAdapter, TEmpresas). Solo se extiende: normalizador, características,
persistencia de representación, re-normalización, etiquetas ES.

## 3. Normalización vs coincidencia

Normalizar = representar comparable. Coincidir (FASE 20) = decidir con
evidencia. Esta fase no decide nada.

## 4. Reglas de texto (v2, determinística)

v1 congelada. v2: trim → sin acentos → mayúsculas → fracciones protegidas
("1 / 2"→"1/2"; "/" suelto a espacio) → puntuación y ¿?¡! a espacio →
compactación por pares de tokens → colapsar espacios.

## 5. Tokens

`tokenizeV2`: división por espacios del texto v2 con clases
PALABRA/NUMERO/TECNICO/FRACCION. Sin decisiones todavía.

## 6. Números

Intactos siempre: DT466, DT-466, DT 466→DT466; 24V, 12V, 10W40, 1/2, 1000.
Nunca se elimina un número.

## 7. Modelos

Convergencia representacional ("DT 466"→"DT466") sin afirmar igualdad
semántica; el original se conserva en el perfil.

## 8. Referencias

Señales por patrón (≥1 letra y ≥1 dígito, longitud ≥4): LF9009, P550949,
ABC123-01→ABC12301. Débiles por diseño: candidatas, no oficiales.

## 9. Marcas

Resolución exacta contra `brands.normalizedName` activos vía Prisma. Sin
diccionario ni equivalencias inventadas (INT≠INTERNATIONAL salvo catálogo).

## 10. Abreviaturas

Sin lista ni resolución (P/, INT, MOT…). Preservar antes que simplificar.

## 11. Palabras

Sin lista de irrelevantes; FILTRO/ACEITE/MOTOR/DT466/24V/10W40 intactos.

## 12. Tokens técnicos

`technicalTokens`: tokens con dígitos o fracciones (DT466, 10W40, 1/2) más
los aportados en el input. Distinto valor identificativo, misma estructura.

## 13. Unidades

Mapa canónico (KG, LB, MM, CM, V, LT, UND y variantes) como señal
`unitCanonical` separada; el texto original no se altera; sin conversiones
(1/2 nunca →0.5).

## 14. Propósito

`normalizedPurpose` independiente; jamás concatenado irreversible.

## 15. Aplicación

`normalizedApplication` independiente; no se reclasifica nada.

## 16. Características

`modelCandidate`, `partNumberCandidate` (dato aportado manda),
`brandCandidate` (solo catálogo), `unitCanonical`, `technicalTokens`.
Señales auxiliares, no datos maestros.

## 17. Versionado

`v1` congelada (tests de regresión); `v2` actual. Cada perfil guarda su
versión; `renormalizeProfile` migra v1→v2 misma fila (original intacto,
`normalizedAt` actualizado). Sin re-normalización masiva.

## 18. Re-normalización

`POST /matching/renormalizar` (`REQUEST.VIEW`): requiere perfil previo;
si ya está en v2 no reescribe. Endpoints previos intactos
(`normalizar` ahora v2, `perfiles` guarda v2, `decisiones` igual).

## 19. Idempotencia

`normalizeTextV2(normalizeTextV2(x)) === normalizeTextV2(x)` testeado con
espacios, acentos, signos, separadores, números, modelos, referencias y
unidades.

## 20. Preservación

`originalDescription` inmutable en perfil y re-normalización; la solicitud
original no se toca.

## 21. Falsos positivos

Reglas que los evitan (testeadas): sin eliminaciones; sin truncados
(DT466→DT, 24V→V); fracciones protegidas; número+palabra no fusiona
("466 UND"); dato aportado priorizado; marca solo por catálogo.

## 22. Qué NO hace esta fase

§33 del alcance: sin matching/IA/embeddings/OCR/UI comprador, sin
homologación/sincronización/registro/migración masiva, sin cambios de
workflow, solicitudes, RBAC ni funcionalidades ajenas.

## 23. Preparación para FASE 20

`ArticleMatchEngine.findCandidates` puede consumir `NormalizedProfileV2`
(tokens, technicalTokens, señales) + decisiones SAME/DIFFERENT/REVIEW como
verdad de entrenamiento/evaluación futura.
