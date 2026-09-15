# FASE 14G — Navegación y bandejas operativas

## 1. Problema encontrado

La entrada "Aprobación Final" apuntaba a `/final-review`, cuya página se
titula "Validación Maestra": nombre y contenido no coincidían. No existían
"Mís solicitudes" (el Dashboard servía de buscador), ni entrada a
"Registro en Profit" (solo accesible desde el detalle), ni distinción entre
validar y aprobar al final. Causa raíz: el workflow tiene UN solo estado
final (`PENDIENTE_VALIDACION_MAESTRA` → `APROBADO_FINAL`) para dos
responsabilidades conceptuales; la navegación lo ocultaba bajo un nombre
equivocado.

## 2. Navegación final

- OPERACIÓN: Dashboard `/`, Mis solicitudes `/solicitudes` (alias
  `/requester`), Crear solicitud `/requester/new`.
- TRABAJO: Aprobaciones, Almacén, Contabilidad, Validación Maestra
  `/validacion-maestra`, Aprobación Final `/aprobacion-final` (alias
  `/final-review`), Registro en Profit `/profit/registro` (PROFIT.WRITE).
- ADMINISTRACIÓN: Personas, Organización, Roles, Auditoría, Importaciones.
- Solo permisos existentes; sin estados ni permisos nuevos.

## 3. Decisiones clave

- VM y AF comparten la cola `PENDIENTE_VALIDACION_MAESTRA` (una sola etapa
  real): VM revisa/devuelve sin aprobar; AF decide. Títulos, breadcrumbs y
  acciones coinciden con su responsabilidad (limitación documentada, no
  nuevos estados).
- Mis solicitudes reutiliza `SolicitudesList` (tabs activas/historial,
  visibilidad server-side 13A) en ruta `/solicitudes`.
- Registro en Profit: bandeja propia con `statuses` server-side
  (listas: APROBADO_FINAL; seguimiento: PROCESANDO/REGISTRADO/ERROR);
  estados previos excluidos por construcción. Tras aprobar: botón
  "Ir a Registro en Profit".
- Breadcrumbs por alias; detalle con enlace contextual por estado;
  Dashboard enlaza a bandejas (nueva tarjeta Listos para Profit).

## 4. Seguridad

Filtros siempre AND con el scope de visibilidad (el backend manda);
`statuses` con whitelist; `RequirePermission` en rutas; `Can` en acciones.

## 5. Archivos

Backend: `solicitud.service.ts` (+`statuses`), `solicitud.controller.ts`,
`request-statuses-14g.spec.ts`. Frontend: `navigation.ts`, `AppLayout.tsx`,
`App.tsx`, `RevisionFinalPage.tsx` (+modo), `profit-registro/` (nuevo),
`SolicitudesList.tsx` (+Etapa), `PanelPage.tsx`, `SolicitudDetailPage.tsx`,
`presentacion.ts` (`etapaActual`), `api-request-service.ts` + mock,
`navigation.test.ts`, modos en test existente.

## 6. Validación

Backend 361/361, frontend 147/147, `tsc` OK, ambos builds OK.

## 7. Limitaciones

VM/AF muestran las mismas filas (un solo estado real); etapa actual deriva
del estado (sin responsable nominal); sin contadores en sidebar (sin
endpoint de conteo).
