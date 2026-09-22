# Inserción multiempresa Profit (FASE 25)

## Arquitectura

Un artículo aprobado puede distribuirse a varias empresas Profit, pero solo
después de comprobar por empresa que existen catálogos y dependencias.

```text
Solicitud (CONTABILIDAD_APROBADA)
  → MultiCompanyAnalyzer (UI, solo lectura)
  → POST /profit/multi-company/analyze → CompatibilityAnalysis
  → usuario selecciona solo compatibles habilitadas
  → ConfirmDialog con resumen
  → POST /profit/multi-company/insert (PROFIT.WRITE + flag)
  → revalidación fresca por empresa → INSERT + verificación + auditoría
```

## Piezas reutilizadas (no duplicadas)

- Descubrimiento: `CorporateCompaniesService` (`AD_GRUP.dbo.TEmpresas`,
  `cod_emp`; dinámico, sin hardcodear).
- Compatibilidad: `CorporateHomologationService.preflight(company, {article})`
  (15 checks por empresa: directorio, conexión, esquema, tablas, columnas,
  triggers, catálogos FK, jerarquía, defaults, secuencia, cuentas dis_cen,
  permiso de escritura).
- Payload 19 columnas FASE 24.2 (`buildProfitArticlePayload`), mismo `co_art`
  en todas (candidato universal desde el estándar).
- `profit-driver.ts` única capa Profit; `PROFIT_WRITE_ENABLED=false` por
  defecto; RBAC existente (`DASHBOARD.VIEW` lectura, `PROFIT.WRITE`
  inserción, `ADMIN.MANAGE` configuración).
- Auditoría: `AuditEvent` (`PROFIT_COMPATIBILITY_ANALYZED`,
  `PROFIT_MULTI_INSERT_*`, `PROFIT_COMPANY_INSERT_RESULT`,
  `PROFIT_COMPANY_CONFIG_SAVED`, `PROFIT_STANDARD_COMPANY_SET`).

## Empresas (descubrimiento real 2026-09-21)

| Empresa | Nombre | art |
|---|---|---|
| AD_DIST | DISTRIBUIDORA DE HIDROCARBUROS SAN LUIS | 1.347 |
| AD_LUBSL | LUBRICANTES SAN LUIS | 40 |
| AD_ROMA | ALIMENTO ROMA | 474 |
| AD_SLS | SAN LUIS SUMINISTROS | 1.486 |
| AD_TRANS | TRANSPORTE SAN LUIS DE LARA (estándar) | 11.195 |
| COR_A3 | CORPORACION AGROPECUARIA VENEZOLANA | 4.055 |

## Fuente de empresas

`AD_GRUP.dbo.TEmpresas` (`cod_emp`). La configuración local
(`profit_company_config`: `enabled`, `isStandard`) solo guarda flags; sin
fila, habilitada salvo estándar por código.

## Archivos

- Backend: `profit/multi-company.service.ts`, `multi-company.controller.ts`,
  `dto/multi-company.dto.ts` (registro en `profit.module.ts`).
- Migración: `20260921_fase25_company_config`.
- Frontend: `servicios/api/api-multiempresa-service.ts`,
  `componentes/workflow/MultiCompanyAnalyzer.tsx` (montado en
  `SolicitudDetailPage`), `modulos/administracion/ProfitCompaniesAdmin.tsx`
  (ruta `/admin/empresas`, nav, sección, ayuda `empresas-profit`).
- Tests: `test/multi-company-25.spec.ts` (9), `MultiCompanyAnalyzer.test.tsx`
  (6), `ProfitCompaniesAdmin.test.tsx` (3).
