# FASE 10D — Autenticación real de credenciales (sin JWT)

> 10D autentica credenciales, pero 10E implementará la sesión/JWT definitiva.

## Contraseña inicial global
- Único punto: `apps/api/src/modulos/autenticacion/initial-password.ts` →
  `getInitialPassword()` (prevalece env `INITIAL_PASSWORD`).
- Global (igual para todos los usuarios nuevos), nunca en texto plano en BD,
  nunca en logs ni API. Solo se usa para verificar el primer login y generar
  el hash bcrypt correspondiente.

## Primer login (passwordHash NULL)
1. `POST /auth/login {userId, password}` con la inicial → correcto.
2. Backend guarda `passwordHash = bcrypt(inicial)`, mantiene
   `mustChangePassword = true`, deja `passwordChangedAt = null` y actualiza
   `lastLoginAt`. Frontend muestra "Debes cambiar tu contraseña" (no entra).
3. `POST /auth/cambiar-password {userId, currentPassword, newPassword}` →
   `passwordHash` nuevo, `mustChangePassword = false`, `passwordChangedAt = now()`.
4. Frontend vuelve al login; la inicial ya no funciona.

## Reglas
- Usuarios `active = false` no se autentican ni cambian contraseña.
- Errores genéricos ("Usuario o contraseña incorrectos") sin enumerar.
- Política: mínimo 8 caracteres, diferente a la actual (backend autoridad).
- Auditoría: `LOGIN_EXITOSO`, `LOGIN_FALLIDO`, `CAMBIO_PASSWORD`,
  `CAMBIO_PASSWORD_FALLIDO` (sin secretos).
- Autocomplete: `GET /auth/usuarios?search=` (solo activos, `{id, displayName}`,
  server-side, límite 50). El login muestra solo el nombre.

## Pendiente 10E
JWT/sesiones, reemplazo de SessionContext mock (hoy LoginPage es puerta de
entrada y la navegación sigue sobre el mock, marcado `TODO(10E)`), guards JWT,
protección de rutas frontend, logout/invalidación.
