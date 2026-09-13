# AJUSTE UI — ROLES Y PERMISOS (consola RBAC)

> Solo frontend. Lógica, endpoints, modelo efectivo y permisos intactos.

## Qué cambió

- **Drawer** (`RoleAdminModal`): título = nombre del rol + subtítulo
  "Administración del rol"; tarjeta superior jerárquica (eyebrow "ROL DEL
  SISTEMA", nombre, descripción real, métricas usuarios/permisos); toolbar de
  permisos con contador + buscador integrado; grupos por categoría con conteo;
  filas de permiso con nombre, descripción, estado y acción separados.
- **Ambigüedad eliminada**: fuera checkbox + ☑/☐. Estado con `Badge`
  (`+ CONCEDIDO` verde / `Sin conceder` gris) y acción separada
  (Conceder / Retirar con la confirmación existente).
- **Semántica honesta**: el drawer concede al rol (lo que usuarios heredan ✓).
  Leyenda visible con la prioridad DENEGADO > CONCEDIDO > HEREDADO y referencia
  a Personas y acceso para overrides por usuario. No se inventó estado
  DENEGADO a nivel rol (el backend no lo expone ahí).
- **Tabla principal** migrada a `DataTable` (mismos datos y permisos).
- **Sistema**: `Drawer` acepta `subtitle` y `size="narrow"` (480 px desktop,
  100 % móvil) + `.drawer-foot` sticky con Cerrar (sin acciones nuevas).

## Validación

- Nuevo `RoleAdminModal.test.tsx`: 5/5 (título, estados, conceder+feedback,
  filtro, usuarios/pie).
- Suite frontend (reporter JSON): 22 archivos, 133 tests, 133 passed, 0 failed.
- `tsc --noEmit` OK, `vite build` OK. Backend sin tocar.
