import type { RequestContextSummary } from '../../tipos';
import { api } from './api-client';

/**
 * FASE — Cliente del resumen contextual ÚNICO de contadores.
 * Una sola request para menú + Dashboard + sección Trabajo pendiente.
 * El backend calcula el alcance; el frontend no envía userId/roleId.
 */
export async function apiGetRequestContextSummary(): Promise<RequestContextSummary> {
  return api.get<RequestContextSummary>('/api/v1/requests/context-summary');
}
