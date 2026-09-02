# FASE 4B-1A — Plan de Normalización Física

Fecha: 01 de septiembre de 2026
Estado: PLAN — NO EJECUTADO

---

## 1. ESTRUCTURA ACTUAL

```
apps/api/src/
├── main.ts
├── app.module.ts
├── modules/
│   ├── accounting/          (3 archivos)
│   ├── audit/               (3 archivos)
│   ├── auth/                (5 archivos)
│   ├── catalogs/            (3 archivos)
│   ├── final-review/        (3 archivos)
│   ├── health/              (3 archivos)
│   ├── requests/            (6 archivos: controller, service, module, dto/)
│   ├── uploads/             (2 archivos)
│   └── warehouse/           (3 archivos)
└── shared/
    ├── prisma/              (2 archivos)
    └── utils/               (1 archivo)

apps/web/src/
├── main.tsx
├── app/                     (App.tsx, globals.css)
├── components/
│   ├── layout/              (1 archivo)
│   ├── ui/                  (3 archivos)
│   └── workflow/            (5 archivos)
├── contexts/                (2 archivos)
├── contracts/               (1 archivo)
├── mock/                    (6 archivos)
├── modules/
│   ├── accounting/          (2 archivos)
│   ├── administration/      (2 archivos)
│   ├── approvals/           (2 archivos)
│   ├── audit/               (2 archivos)
│   ├── dashboard/           (2 archivos)
│   ├── final-review/        (2 archivos)
│   ├── imports/             (2 archivos)
│   ├── requester/           (4 archivos)
│   └── warehouse/           (3 archivos)
├── services/
│   ├── index.ts
│   ├── api/                 (7 archivos)
│   └── mock/                (10 archivos)
├── types/                   (1 archivo)
└── utils/                   (1 archivo)
```

---

## 2. ESTRUCTURA PROPUESTA

```
apps/api/src/
├── main.ts                                        (SIN CAMBIO)
├── app.module.ts                                  (ACTUALIZAR IMPORTS)
├── modulos/                                       (ERA modules/)
│   ├── solicitudes/                               (ERA requests/)
│   │   ├── solicitud.controller.ts                (RENOMBRAR)
│   │   ├── solicitud.service.ts                   (RENOMBRAR)
│   │   ├── solicitud.module.ts                    (RENOMBRAR)
│   │   └── dto/
│   │       ├── approval.dto.ts                    (SIN CAMBIO)
│   │       ├── classify-request.dto.ts            (SIN CAMBIO)
│   │       └── create-request.dto.ts              (SIN CAMBIO)
│   ├── almacen/                                   (ERA warehouse/)
│   │   ├── almacen.controller.ts                  (RENOMBRAR)
│   │   ├── almacen.service.ts                     (RENOMBRAR)
│   │   └── almacen.module.ts                      (RENOMBRAR)
│   ├── contabilidad/                              (ERA accounting/)
│   │   ├── contabilidad.controller.ts             (RENOMBRAR)
│   │   ├── contabilidad.service.ts                (RENOMBRAR)
│   │   └── contabilidad.module.ts                 (RENOMBRAR)
│   ├── revision-final/                            (ERA final-review/)
│   │   ├── revision-final.controller.ts           (RENOMBRAR)
│   │   ├── revision-final.service.ts              (RENOMBRAR)
│   │   └── revision-final.module.ts               (RENOMBRAR)
│   ├── auditoria/                                 (ERA audit/)
│   │   ├── auditoria.controller.ts                (RENOMBRAR)
│   │   ├── auditoria.service.ts                   (RENOMBRAR)
│   │   └── auditoria.module.ts                    (RENOMBRAR)
│   ├── catalogos/                                 (ERA catalogs/)
│   │   ├── catalogos.controller.ts                (RENOMBRAR)
│   │   ├── catalogos.service.ts                   (RENOMBRAR)
│   │   └── catalogos.module.ts                    (RENOMBRAR)
│   ├── salud/                                     (ERA health/)
│   │   ├── salud.controller.ts                    (RENOMBRAR)
│   │   ├── salud.service.ts                       (RENOMBRAR)
│   │   └── salud.module.ts                        (RENOMBRAR)
│   ├── archivos/                                  (ERA uploads/)
│   │   ├── archivos.controller.ts                 (RENOMBRAR)
│   │   └── archivos.module.ts                     (RENOMBRAR)
│   └── autenticacion/                             (ERA auth/)
│       ├── autenticacion.controller.ts            (RENOMBRAR)
│       ├── autenticacion.service.ts               (RENOMBRAR)
│       ├── autenticacion.module.ts                (RENOMBRAR)
│       ├── rbac.guard.ts                          (SIN CAMBIO)
│       └── require-permission.decorator.ts        (SIN CAMBIO)
├── comun/                                         (ERA shared/)
│   ├── prisma/                                    (SIN CAMBIO)
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   └── utilidades/                                (ERA utils/)
│       └── flatten-request-data.ts                (SIN CAMBIO)

apps/web/src/
├── main.tsx                                       (SIN CAMBIO)
├── app/                                           (SIN CAMBIO)
├── componentes/                                   (ERA components/)
│   ├── diseno/                                    (ERA layout/)
│   │   └── AppLayout.tsx                          (SIN CAMBIO)
│   ├── ui/                                        (SIN CAMBIO)
│   └── workflow/                                  (SIN CAMBIO)
├── contextos/                                     (ERA contexts/)
│   ├── CompanyContext.tsx                          (SIN CAMBIO)
│   └── SessionContext.tsx                          (SIN CAMBIO)
├── contratos/                                     (ERA contracts/)
│   └── index.ts                                   (SIN CAMBIO)
├── mock/                                          (SIN CAMBIO — datos de prueba)
├── modulos/                                       (ERA modules/)
│   ├── solicitudes/                               (ERA requester/)
│   │   ├── SolicitudesList.tsx                    (RENOMBRAR de RequesterList)
│   │   ├── SolicitudCreate.tsx                    (RENOMBRAR de RequestCreate)
│   │   ├── SolicitudDetailPage.tsx                (RENOMBRAR de RequestDetailPage)
│   │   └── index.ts                              (ACTUALIZAR EXPORTS)
│   ├── almacen/                                   (ERA warehouse/)
│   │   ├── AlmacenList.tsx                        (RENOMBRAR de WarehouseList)
│   │   ├── AlmacenClassify.tsx                    (RENOMBRAR de WarehouseClassify)
│   │   └── index.ts                              (ACTUALIZAR EXPORTS)
│   ├── contabilidad/                              (ERA accounting/)
│   │   ├── ContabilidadList.tsx                   (RENOMBRAR de AccountingList)
│   │   └── index.ts                              (ACTUALIZAR EXPORTS)
│   ├── revision-final/                            (ERA final-review/)
│   │   ├── RevisionFinalPage.tsx                  (RENOMBRAR de FinalReviewPage)
│   │   └── index.ts                              (ACTUALIZAR EXPORTS)
│   ├── aprobaciones/                              (ERA approvals/)
│   │   ├── AprobacionesPage.tsx                   (RENOMBRAR de ApprovalsPage)
│   │   └── index.ts                              (ACTUALIZAR EXPORTS)
│   ├── panel/                                     (ERA dashboard/)
│   │   ├── PanelPage.tsx                          (RENOMBRAR de DashboardPage)
│   │   └── index.ts                              (ACTUALIZAR EXPORTS)
│   ├── importaciones/                             (ERA imports/)
│   │   ├── ImportacionesPage.tsx                  (RENOMBRAR de ImportsPage)
│   │   └── index.ts                              (ACTUALIZAR EXPORTS)
│   ├── auditoria/                                 (ERA audit/)
│   │   ├── AuditoriaPage.tsx                      (RENOMBRAR de AuditPage)
│   │   └── index.ts                              (ACTUALIZAR EXPORTS)
│   └── administracion/                            (ERA administration/)
│       ├── AdministracionPage.tsx                 (RENOMBRAR de AdminPage)
│       └── index.ts                              (ACTUALIZAR EXPORTS)
├── servicios/                                     (ERA services/)
│   ├── index.ts                                   (SIN CAMBIO)
│   ├── api/                                       (SIN CAMBIO internamente)
│   └── mock/                                      (SIN CAMBIO internamente)
├── tipos/                                         (ERA types/)
│   └── index.ts                                   (SIN CAMBIO)
└── utilidades/                                    (ERA utils/)
    └── image.ts                                   (SIN CAMBIO)
```

---

## 3. TABLA ANTES → DESPUÉS

### Backend

| ANTES | DESPUÉS | Archivos afectados |
|---|---|---|
| `modules/requests/` | `modulos/solicitudes/` | 8 (app.module + 5 cross-module + 2 tests) |
| `modules/warehouse/` | `modulos/almacen/` | 4 (app.module + 3 internos) |
| `modules/accounting/` | `modulos/contabilidad/` | 4 |
| `modules/final-review/` | `modulos/revision-final/` | 4 |
| `modules/audit/` | `modulos/auditoria/` | 4 |
| `modules/catalogs/` | `modulos/catalogos/` | 3 (app.module + 1 test + 1 interno) |
| `modules/health/` | `modulos/salud/` | 4 |
| `modules/uploads/` | `modulos/archivos/` | 4 |
| `modules/auth/` | `modulos/autenticacion/` | 12 (app.module + 6 cross-module + 5 internos) |
| `shared/` | `comun/` | 19 (app.module + 12 module imports + 2 tests + tsconfig) |
| `shared/utils/` | `comun/utilidades/` | 4 (services that import flatten) |

### Frontend

| ANTES | DESPUÉS | Archivos afectados |
|---|---|---|
| `modules/requester/` | `modulos/solicitudes/` | 2 (App.tsx + index) |
| `modules/warehouse/` | `modulos/almacen/` | 2 |
| `modules/accounting/` | `modulos/contabilidad/` | 2 |
| `modules/final-review/` | `modulos/revision-final/` | 2 |
| `modules/approvals/` | `modulos/aprobaciones/` | 2 |
| `modules/dashboard/` | `modulos/panel/` | 2 |
| `modules/imports/` | `modulos/importaciones/` | 2 |
| `modules/audit/` | `modulos/auditoria/` | 2 |
| `modules/administration/` | `modulos/administracion/` | 2 |
| `components/` | `componentes/` | 15 (13 modules + App + 1 component) |
| `components/layout/` | `componentes/diseno/` | 1 |
| `contexts/` | `contextos/` | 12 (11 modules + 1 component) |
| `contracts/` | `contratos/` | 14 (12 services + 2 modules) |
| `services/` | `servicios/` | 12 (11 modules + App) |
| `types/` | `tipos/` | 20 (9 modules + 6 mock + 6 services + contracts) |
| `utils/` | `utilidades/` | 2 (1 module + App) |

---

## 4. IMPACTO TOTAL

| Categoría | Cantidad |
|---|---|
| Carpetas renombradas | 22 |
| Archivos renombrados | ~55 (controllers + services + modules + pages) |
| Imports actualizados | ~120 |
| Tests afectados | 8 (imports de paths) |
| Config afectada | 2 (app.module.ts, App.tsx) |
| Barrel exports actualizados | 10 (index.ts de módulos) |

---

## 5. ARCHIVOS QUE NO SE TOCAN

| Archivo/Carpeta | Razón |
|---|---|
| `main.ts` (API) | Bootstrap funcional |
| `prisma/schema.prisma` | Esquema activo |
| `components/ui/` | UI genérica, convención técnica |
| `components/workflow/` | Componentes de workflow, convención técnica |
| `services/api/*` | Servicios API, convención técnica |
| `services/mock/*` | Mock services, convención técnica |
| `mock/*` | Datos mock, convención técnica |
| `scripts/*` | Scripts PowerShell |
| `types/index.ts` | Se renombra la CARPETA pero no su contenido |
| `contracts/index.ts` | Se renombra la CARPETA pero no su contenido |

---

## 6. RIESGOS

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Imports rotos | ALTO | Búsqueda global post-cambio |
| Tests rotos | MEDIO | Ejecutar tests después de cada bloque |
| Rutas de API rotas | BAJO | Los decorators @Controller mantienen rutas HTTP |
| barrel exports incorrectos | MEDIO | Verificar cada index.ts |

---

## 7. VALIDACIONES A EJECUTAR

1. Búsqueda de imports rotos (global)
2. Typecheck API
3. Typecheck WEB
4. Tests completos (69)
5. Build API
6. Health API
7. Verificar que rutas API no cambiaron

---

## 8. ORDEN DE EJECUCIÓN

1. Crear carpetas destino (`modulos/`, `comun/`, `componentes/`, etc.)
2. Mover archivos backend (modulos de negocio primero)
3. Actualizar imports backend (app.module.ts + cross-module)
4. Mover archivos shared → comun
5. Actualizar imports shared
6. Mover archivos frontend (modulos)
7. Actualizar imports frontend (App.tsx + index.ts)
8. Mover componentes, contextos, contratos, servicios, tipos, utilidades
9. Actualizar imports frontend (todos los módulos)
10. Eliminar carpetas vacías
11. Ejecutar validaciones
12. Crear docs/ESTRUCTURA_PROYECTO.md

---

## ESTADO: ESPERANDO CONFIRMACIÓN PARA SUBFASE B

NO se ha modificado ningún archivo de código.
Este es exclusivamente un plan de análisis.
