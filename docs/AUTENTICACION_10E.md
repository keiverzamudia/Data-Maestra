# FASE 10E — JWT + Sesión real (puente de permisos temporal)

> Identidad 100% real (JWT → Session → request.user). Autorización fina en 10F.

## Estrategia
- Cookie HttpOnly `dm_session` (`SameSite=Lax`, `Secure` en producción,
  `credentials:'include'`). Sin JWT en JS, sin localStorage.
- JWT `{sub, sessionId}` HS256, TTL único `AUTH_SESSION_TTL_HOURS=8`
  (`auth.config.ts`). Secreto `JWT_SECRET` por env (falla explícito en prod).
- CSRF: SameSite=Lax como base (mutadores son POST/PUT/PATCH/DELETE).
  Documentado como trade-off; sin infra CSRF adicional en 10E.

## Session (modelo 10B sin cambios)
Crea: cada login (incl. primer login). Guarda: userId, tokenHash=SHA256(JWT),
expiresAt, ip, userAgent. Nunca JWT en claro. Revoca: logout, cambio de
password (todas), expiración. Fila conservada para auditoría.

## Pertenencia organizacional (10E-A)
`UserRole` += `departmentId?` + relaciones `UserRole→Department`,
`Department→UserRole[]`, unique `[userId, roleId, companyId, departmentId]`.
Backfill `prisma/backfill-userrole-department-10e.js` (idempotente): solo vía
`Department.managerId` (u2→d1, u3→d2, u4→d3). **Pendientes sin inventar:**
u1 (REQUESTER), u5 (MASTER_DATA_ADMIN). Integridad company↔dept: 0 violaciones.
Regla (nivel aplicación): `UserRole.companyId === Department.companyId`.

## Rutas de identidad
- `POST /auth/login` → valida, crea Session, cookie. Sin accessToken en JSON.
- `POST /auth/logout` → revoca, limpia cookie (idempotente).
- `GET /auth/session` (JwtGuard) → usuario+roles+permisos+memberships. Sin `?userId`.
- `POST /auth/cambiar-password {currentPassword, newPassword}` → identidad de
  sesión; revoca todas; frontend vuelve al login.
- `GET /auth/usuarios?search=` sigue público (autocomplete pre-login).

## Puente temporal TODO(10F)
`permisos.ts`: conjuntos por rol (los 6 de 10D; AUDITOR→[]). `RbacGuard` lee
`request.user.permissions` (resueltos desde `user_roles` reales). 10F:
`UserRole→Role→RolePermission→Permission` + overrides, y poblará
`role_permissions` (vacía).

## Rol primario en sync (§7)
NO asignado: VUSUARIOS solo da codigo+nombre; company/department
indeterminables. Reportado como faltante (asignación en 10H con empresa/depto
explícitos). No inventado.

## Pendiente 10F
RBAC real, autorización por empresa/departamento (puntos preparados:
`resolveCompanyContext`, `requireDepartmentMembership`), admin usuarios/roles,
departamento para u1/u5, rate-limit a autocomplete.
