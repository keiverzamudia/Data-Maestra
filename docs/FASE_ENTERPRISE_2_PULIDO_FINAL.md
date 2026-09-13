# ENTERPRISE 2 — Validación y pulido final (CERRADA)

> Solo frontend. Backend intacto. Sin rediseño: validación → corrección → cierre.

## 1. Problemas encontrados y corregidos

- **Títulos en dos tamaños inline (15/16 px, 21 casos)**: convergidos a
  `.card-title` (token h2) y `.subsection-title` (token h3). Cero cambio visual.
- **Hex hardcodeado `#fff`** (ImageLightbox): a `var(--white)`.
- **Overflow móvil real**: `.modal{min-width:420px}` excedía viewports de 360 px
  → `min(420px, 100vw-32px)` + altura `100dvh`; `.notif-panel` 340 px fijos →
  ancho fluido con tope y posición segura en <768 px.
- **Grids sin apilado móvil**: `.review-grid` y `.compare` ahora colapsan a 1
  columna en <700 px.
- **A11y**: `role="dialog"` + `aria-label="Cerrar"` en Modal; Escape cierra
  Modal/Drawer/ConfirmDialog.
- **Microdetalle**: imagen de RequestDetail a `.evidence-thumb`; línea contable
  a `.acct-line` con código en mono.

## 2. Revisado sin cambios (conforme)

Spacing: 78 valores inline auditados, todos en escala (4/8/12). Botones/inputs/
badges/tablas/cards ya comparten jerarquía del sistema. Tablas `.table` de
admin/auditoría/contabilidad quedan como deuda independiente (§8).

## 3. Validación

- Tests frontend: 133/133 (22 archivos). Sin tests artificiales.
- `tsc --noEmit`: OK. `vite build`: OK.
- Lint: sin ejecutar — no existe `eslint.config` y falta `typescript-eslint`
  (requiere instalar dependencia + decisión de config: deuda del mantenedor).

## 4. Deudas restantes

1. `eslint.config` + `typescript-eslint` (instalación y reglas).
2. Migración total a `DataTable` (admin, auditoría, contabilidad).
3. `KpiCard`→`StatCard`, `.pill-*`→`.badge-*`.
4. Badges de pendientes en sidebar (requiere conteos reales).
5. Verificación visual humana Stitch en 3 viewports.

**FASE ENTERPRISE VISUAL CERRADA.** No continuar rediseños.
