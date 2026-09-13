# REESTRUCTURACIÓN VISUAL ENTERPRISE — Reporte de fase

> Solo frontend. Sin cambios de backend, workflow, permisos, endpoints, Prisma,
> contabilidad, notificaciones ni Profit WRITE.

## 1. Resumen ejecutivo

Data-Maestra adopta un único lenguaje visual SaaS/Enterprise construido sobre el
sistema existente (tokens.css + ds.css + componentes/ui), no un sistema paralelo:
tokens semánticos, sidebar oscuro con drawer móvil, tablas/paginación/secciones
oficiales, tipografías Inter + JetBrains Mono y responsive real por componente.

## 2. Sistema de diseño (modificado/creado)

- `app/tokens.css`: aliases semánticos `--color-*`, escala tipo (caption 11 →
  metric 26), `--font-mono` JetBrains Mono, `--radius-xs/lg`, `--shadow-sm/card`,
  `--line-height-*`, `--content-max`, breakpoints documentados.
- `index.html`: título ES, fuentes Inter 400-700 + JetBrains Mono (con fallback
  offline), meta description.
- `componentes/ui/index.tsx`: `SectionCard`, `StatCard` (oficial; `KpiCard`
  queda legacy), `Code` (mono), `DataTable` (loading/empty/error, filas
  clicables por teclado, `data-label` responsive) y `Pagination` server-side
  (page/limit/total, sin convertir a arrays locales).
- `app/ds.css`: drawer móvil, `.notif-dot`, `.mono`, `.section-head`,
  `.table-card`, `.row-actions`, `.dropzone`, `.success-hero`, `.master-code-sm`,
  `.code-inline`, clases de Almacén/pipeline; eliminado rail móvil anterior.

## 3. Páginas

- Shell: drawer móvil (hamburguesa, overlay, Escape, cierra al navegar), punto
  CSS en vez de emoji, marca ES "Gestión de Datos Maestros".
- Solicitudes y Almacén (colas), Aprobaciones, Validación Maestra: migradas a
  `DataTable` + `Pagination` (mismos datos y permisos).
- Crear Solicitud: layout principal + aside (solicitante, criterios de
  pre-envío con contador, contador de caracteres, `Field` con errores).
- Almacén/clasificar: `SectionCard`s, clases token en vez de inline, veredicto
  dry-run por clase.
- Validación Maestra: `SectionCard` de cierre con acción dominante intacta.
- Administración: eliminado `Section` local duplicado → `SectionCard`.
- Auditoría/Contabilidad/Importaciones/Dashboard: clases token, glifos
  consistentes, 0 mojibake U+FFFD en `apps/web/src`.

## 4. Responsive / accesibilidad / iconografía

Breakpoints 768/1200 por componente (drawer, grids 65/35→1 col, stepper con
scroll/vertical, tablas a tarjetas con etiquetas, modales 94vw, botones 44px).
`focus-visible` global, iconos+texto en estados, sin dependencias nuevas
(sistema de glifos unicode existente normalizado).

## 5. Validación

- Tests web: 133/133 (22 archivos), incluye `enterprise.test.tsx` (7 nuevos).
- `tsc --noEmit` OK, `vite build` OK.
- Lint: no ejecutable — el repo no tiene `eslint.config` (preexistente).
- Backend intacto: `git status` solo toca `apps/web`.

## 6. Pendientes / recomendaciones

1. Crear `eslint.config` (deuda preexistente) y correr lint.
2. Migrar tablas restantes (admin, auditoría, contabilidad) a `DataTable` cuando
   se toquen (tienen selección/acciones especiales; hoy ya comparten `.table`).
3. Converger `KpiCard`→`StatCard` y `.pill-*`→`.badge-*` (compatibles, sin prisa).
4. Badges de pendientes en sidebar (requiere conteos; no inventar datos).
5. Verificación visual humana contra Stitch en desktop/tablet/móvil.
