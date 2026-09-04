/**
 * FASE 10C §9 — Contraseña global inicial (único punto de configuración).
 *
 * El Administrador/Desarrollador cambia la contraseña inicial AQUÍ (o vía la
 * variable de entorno INITIAL_PASSWORD, que prevalece). No duplicar este valor
 * en otros archivos. Nunca se almacena en la base de datos ni se registra en
 * logs: 10D la usará únicamente para generar/verificar hashes bcrypt.
 *
 * PRODUCCIÓN: definir INITIAL_PASSWORD en el entorno y eliminar el fallback.
 */
const DEV_FALLBACK_INITIAL_PASSWORD = 'DataMaestra2026*';

export function getInitialPassword(): string {
  return process.env.INITIAL_PASSWORD || DEV_FALLBACK_INITIAL_PASSWORD;
}
