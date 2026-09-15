# FASE 14L — RBAC + Registro Profit UX + Mis solicitudes

> Sin INSERT real. Flag OFF. Sin cambios de workflow/RBAC/contabilidad/
> almacén/VM/AF/SSE. Solo adiciones estrictamente necesarias.

## 1-7. RBAC revalidado (lectura real de BD + código)

1. **PROFIT.WRITE existe**: sí (tabla `permissions`, seed + fila).
2. **Rol que lo posee**: `MASTER_DATA_ADMIN` (único; 0 overrides).
3. **Usuario actual** (operador KZAMU, `818128eb…`, activo): roles vía
   `UserRole`; efectivo por `resolveEffectivePermissions`
   (DENY > GRANT > HEREDADO, 10F/10G).
4. **Permiso efectivo**: CONCEDIDO por ROL (MASTER_DATA_ADMIN); sin DENY
   (0 `UserPermissionOverride` para el permiso); HEREDADO no aplica como
   override (es concesión por rol).
5. **Override**: ninguno existente.
6. **Backend guard**: idéntica evaluación (`RbacGuard` +
   `getEffectivePermissions`) en las 5 rutas profit
   (`profit-plan` DASHBOARD.VIEW; `profit-create/verify/retry` PROFIT.WRITE;
   `profit-attempts` REQUEST.VIEW).
7. **Frontend permission**: misma fuente (`SessionContext.permissions`).

- MASTER_DATA_ADMIN conserva el permiso (no tocado). Sin mutaciones RBAC
  → sin auditoría adicional. Sesiones inactivas rechazadas en login
  (`autenticacion.service:179`).

## 8-12. Registro Profit UX

- Flag OFF → bloque **REGISTRO PREPARADO** (destino, auth, conexión,
  permiso, código, disponibilidad, dry-run + explicación, sin verde).
- Sin permiso → **SIN PERMISO** rojo (usuario, roles, permiso DENEGADO
  efectivo, origen RBAC).
- Permiso + flag OFF → **LISTO — ESCRITURA TEMPORALMENTE DESHABILITADA**.
- READY_TO_WRITE + botón solo con todo vigente; confirmación textual
  `REGISTRAR EN PROFIT` (además de gates backend).
- Master/Profit siempre separados (`Pendiente de registro` si falta;
  registrado muestra código + mensaje, sin re-registro por estado).

## 13-23. Mis solicitudes (`/solicitudes`, sidebar OPERACIÓN)

- `mine=true` server-side: fuerza `requesterId` de sesión (ignora spoof),
  también para admin; AND con scope (backend manda).
- Columnas §15 + Etapa (`etapaActual`), Master y Profit (`profitCode`,
  nueva columna persistida al registrar + backfill REQ-0055).
- Búsqueda server-side extendida (número, descripción, master, profit,
  part number); orden recientes/antiguas/actualizadas (whitelist);
  paginación 11G; filtros por estado (incl. Con error).
- Resumen: Total/En proceso/Completadas/Con error (server-side).
- Detalle: Recorrido + aprobaciones + master/profit + panel Profit con
  historial (responde "¿qué pasó?"). Crear → botón Ver solicitud
  (detalle directo).
- REQUESTER solo ve lo propio en `/solicitudes`; bandejas intactas.

## 9/25/26. Casos (solo lectura)

- REQ-0054: APROBADO_FINAL, master FERMIS-00001, por KZAMU. Intacto.
- REQ-0055: REGISTRADO_PROFIT, master FERMIS-00001, profit FERMIS0662,
  por KZAMU. FERMIS0662 COUNT=1, total 11.193. UI lo reconoce (sin acción
  de registro por estado).

## 18/28. Seguridad y validación

- Backend 388/388, frontend 162/162, `tsc` OK (ambos), builds OK,
  health 200, flag OFF, cero escrituras (COUNTs verificados).
- Nota operativa: el proceso API desacoplado se cayó 2 veces en la fase
  (puerto libre al reiniciar); se levantó con el script y quedó sano.
  Valorar supervisión persistente (fuera de alcance).
