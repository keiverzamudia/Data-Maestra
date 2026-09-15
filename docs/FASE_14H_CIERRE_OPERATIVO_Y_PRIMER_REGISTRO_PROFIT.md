# FASE 14H — Cierre operativo UI + preparación primer registro real

> Sin INSERT real (sin confirmación humana explícita; fase de preparación).
> Sin cambios de workflow/RBAC/contabilidad/almacén/SSE. Motor 14F reutilizado.

## 1. Problemas y cambios

- **Crear solicitud duplicado** (§3): el sidebar mostraba la entrada dos veces
  (hija + top-level). Eliminada la top-level; queda una sola vez bajo Mis
  solicitudes. Rutas intactas (incl. legacy).
- **Dashboard** (§6–§12): 4 métricas (fuera totales/importaciones);
  `StatCard` oficial; nueva sección Trabajo pendiente con conteos reales por
  bandeja permitida (almacén, contabilidad, VM/AF, gerencia, Profit; fallos
  ocultan la fila, jamás números falsos); actividad compacta (máx. 6 +
  "Ver mis solicitudes"); estado compacto con minibarras; acciones rápidas
  compactas por permiso (Crear, Mis, VM, AF, Profit).
- **VM vs AF** (§13–§16): mismo estado técnico, experiencias distintas —
  VM valida/devuelve (sin aprobar) con copy de revisión; AF decide con
  copy de decisión final + pill "Pendiente de decisión final" junto al
  estado técnico (sin falsificar). Detalle con alertas de responsabilidad.
- **Detalle contextual** (§17): PENDIENTE_VALIDACION_MAESTRA → ambas
  bandejas; APROBADO_FINAL/PROCESANDO/REGISTRADO/ERROR → Registro en Profit.

## 2. Navegación final

OPERACIÓN (Dashboard, Mis solicitudes, Crear) · TRABAJO (Aprobaciones,
Almacén, Contabilidad, Validación Maestra, Aprobación Final, Registro en
Profit) · ADMINISTRACIÓN (Personas, Organización, Roles, Auditoría,
Importaciones). Breadcrumbs por alias; solo permisos existentes.

## 3. Estado del Write Engine (§21–§25)

- Servidor/base: SRVBDPROFITBK/AD_TRANS (OK, lectura verificada).
- Autenticación soportada por el código: SQL auth (USER+PASSWORD) o
  Windows integrada (`trustedConnection`, identidad del proceso API).
- Conexión/usuario de escritura: **BLOCKED** (sin `PROFIT_WRITE_*`).
- `PROFIT.WRITE`: existe en BD, otorgado a nadie (OK como bloqueo).
- Flag: `false` (origen `.env.local`; habilitar = editar + restart usuario).
- Dry-run manual REQ-0055/CARRETA: **READY** — FER/MIS compuesta ✓, UND ✓,
  tasa 1 ✓, cat/color 01 ✓, V→1 + ULCO coherentes, candidato FERMIS0662
  disponible (payload: FERMIS0662/CARRETA/V/FER/MIS/UND/UND/1/01/01/01/GEN/
  ULCO/vacío).

## 4. PRIMER INSERT: BLOQUEADO (falta)

- servidor: OK · base: OK · dry-run: READY · permiso: existe sin otorgar
  (BLOCKED) · conexión: BLOCKED · usuario técnico: BLOCKED · flag: OFF.
- Para ejecutar (humano): DBA crea login mínimo-privilegio → completar
  `PROFIT_WRITE_*` → otorgar `PROFIT.WRITE` → `api-restart.ps1` → dry-run
  endpoint → confirmación explícita → flag temporal → INSERT → VERIFY → off.
- **No se ejecutó INSERT real en esta fase.**

## 5. Validación y archivos

- Backend 361/361, frontend 150/150, `tsc` OK, ambos builds OK.
- Tocados: `navigation.ts`, `AppLayout` (grupos; sin cambios), `App.tsx`
  (sin cambios), `RevisionFinalPage.tsx`, `PanelPage.tsx` (+test),
  `SolicitudDetailPage.tsx`, `presentacion.ts`, tests nuevos; backend solo
  `statuses` (14G). Sin duplicaciones; campo origen: sin campo adecuado en
  `art` (trazabilidad en AuditEvent).
