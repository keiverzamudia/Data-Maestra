/**
 * Configuración de ajuste (tuning) del motor de coincidencia.
 *
 * Todos los números que gobiernan el puntaje, la clasificación y el
 * solape tolerante viven aquí, con nombre y en un solo lugar. Motivo:
 * el recall (preselección) y el scoring eran dos definiciones distintas
 * de "parecerse" y el desajuste producía candidatos entrando por una
 * puerta que el scoring luego no reconocía (todo quedaba 0/100).
 * Ambas etapas leen esta misma configuración.
 *
 * Reglas:
 *  - igual para todos los casos de uso: nada por solicitud, empresa o
 *    artículo (cero hardcodeo de escenarios);
 *  - los umbrales son ajustes de calibración del dominio, no secretos
 *    de implementación; si algún día pasan a tabla configurable en la
 *    base, este objeto es su forma versionada en código;
 *  - los valores de pesos replican la estrategia documentada §33 del
 *    motor v1 (identificadores > características > texto > contexto).
 */

export interface MatchTuningConfig {
  /** Pesos por señal estructurada. Suma nominal 109 → tope 100. */
  weights: {
    /** Número de parte: identificador fuerte, decides arriba. */
    partNumber: number;
    model: number;
    brand: number;
    category: number;
    subCategory: number;
    unit: number;
    application: number;
    purpose: number;
  };
  /** Texto: similitud tolerante mínima para sumar evidencia y su escala. */
  description: {
    /** Umbral de similitud textual (0–1) para DESCRIPTION_SIMILARITY. */
    minSimilarity: number;
    /** Puntos = round(similitud × scale); con similitud ≤1 tope = scale. */
    scale: number;
  };
  /** Clasificaciones del motor (score sin conflictos). */
  classification: {
    high: number;
    medium: number;
    low: number;
  };
  /** Calibración del solape tolerante entre tokens (recall + scoring). */
  tolerance: {
    /** Por debajo de esta longitud solo vale igualdad exacta (p. ej. "DE"). */
    minLengthExact: number;
    /** Prefijo común mínimo para considerar abreviatura (MACK ⊂ MACKGRANITE). */
    sharedPrefixMin: number;
    /** Longitud mínima para permitir 1 edición (TORNILLO ↔ TORNILO). */
    editMinLength1: number;
    /** Longitud mínima para permitir 2 ediciones. */
    editMinLength2: number;
    /** Ediciones permitidas en el primer tramo (0 = prohibido). */
    editMax1: number;
    /** Ediciones permitidas en el segundo tramo. */
    editMax2: number;
  };
}

/**
 * Calibración vigente del motor.
 *
 * Nota sobre `tolerance`: la prohibición de edición en tokens de 4–5
 * letras es deliberada. En ese ruido vive el ruido real: VASO y PASO
 * distan una letra y jamás son el mismo artículo (por eso "vaso"
 * traía CAJA DE PASO / LLAVE DE PASO). La subcadena y el prefijo largo
 * sí se permiten porque son relaciones de contención reales
 * (VASO ⊂ VASOS, HEX ⊂ HEXAGONAL).
 */
export const MATCH_TUNING: Readonly<MatchTuningConfig> = Object.freeze({
  weights: Object.freeze({
    partNumber: 40,
    model: 25,
    brand: 15,
    category: 8,
    subCategory: 6,
    unit: 5,
    application: 5,
    purpose: 5,
  }),
  description: Object.freeze({
    minSimilarity: 0.5,
    scale: 20,
  }),
  classification: Object.freeze({
    high: 65,
    medium: 35,
    low: 12,
  }),
  tolerance: Object.freeze({
    minLengthExact: 3,
    sharedPrefixMin: 4,
    editMinLength1: 6,
    editMinLength2: 8,
    editMax1: 1,
    editMax2: 2,
  }),
} as MatchTuningConfig);
