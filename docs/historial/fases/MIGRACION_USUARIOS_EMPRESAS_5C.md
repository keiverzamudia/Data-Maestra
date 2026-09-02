# Migración de Usuarios y Empresas — Fase 5C

Fecha: 01 de septiembre de 2026
Estado: COMPLETADA

---

## 1. Resumen

Se migraron empresas, departamentos, usuarios y roles desde datos mock hacia la API real del backend.

| Dominio | Antes | Después |
|---|---|---|
| Empresas | `mock/companies.ts` | `GET /organizacion/companies` → Prisma |
| Departamentos | `mock/companies.ts` | `GET /organizacion/departments` → Prisma |
| Usuarios | `mock/companies.ts` | `GET /organizacion/users` → Prisma |
| Roles | `mock/companies.ts` | `GET /organizacion/roles` → Prisma |

---

## 2. Archivos creados (4)

| Archivo | Propósito |
|---|---|
| `modulos/organizacion/organizacion.controller.ts` | Endpoints para empresas, departamentos, usuarios, roles |
| `modulos/organizacion/organizacion.service.ts` | Lógica de negocio para datos de organización |
| `modulos/organizacion/organizacion.module.ts` | Registro NestJS |
| `servicios/api/api-organizacion-service.ts` | Servicio frontend para API de organización |
| `hooks/useOrganizacion.ts` | Hook React que carga datos de organización |

---

## 3. Archivos modificados (9)

| Archivo | Cambio |
|---|---|
| `app.module.ts` | Agregado OrganizacionModule |
| `seed.js` | Agregadas empresas c2/c3, departamentos d4-d6, usuario u6, roles, permisos |
| `servicios/api/index.ts` | Agregado export de apiOrganizacionService |
| `contextos/CompanyContext.tsx` | Migrado a API real |
| `modulos/almacen/AlmacenList.tsx` | Reemplazado import mock por useOrganizacion() |
| `modulos/contabilidad/ContabilidadList.tsx` | Reemplazado import mock por useOrganizacion() |
| `modulos/revision-final/RevisionFinalPage.tsx` | Reemplazado import mock por useOrganizacion() |
| `modulos/auditoria/AuditoriaPage.tsx` | Reemplazado import mock por useOrganizacion() |
| `modulos/administracion/AdministracionPage.tsx` | Reemplazado import mock por useOrganizacion() |
| `componentes/workflow/RequestDetail.tsx` | Reemplazado import mock por useOrganizacion() |

---

## 4. Endpoints creados

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/organizacion/companies` | Lista empresas activas |
| GET | `/organizacion/departments` | Lista departamentos (filtro por companyId) |
| GET | `/organizacion/users` | Lista usuarios con roles (filtro por companyId) |
| GET | `/organizacion/roles` | Lista roles |

---

## 5. Seed data

Se actualizaron los datos de semilla para incluir:

- 3 empresas (c1, c2, c3)
- 6 departamentos (d1-d6)
- 6 usuarios (u1-u6)
- 7 roles
- 13 permisos
- 9 user roles

---

## 6. CompanyContext

**Antes:** Importaba `companies` directamente de `mock/companies.ts`

**Después:** Llama a `GET /organizacion/companies` vía API

El context ahora:
- Carga empresas desde la API al montar
- Selecciona la primera empresa por defecto
- Expone `empresas` y `companies` (alias para compatibilidad)
- Tiene estado `loading`

---

## 7. Mocks restantes

| Mock | Consumidores | Estado |
|---|---|---|
| `mock/companies.ts` | **0** | CANDIDATO A ELIMINACIÓN EN 5F |
| `mock/catalog.ts` | **0** | CANDIDATO A ELIMINACIÓN EN 5F |
| `mock/master-items.ts` | **0** | CANDIDATO A ELIMINACIÓN EN 5F |
| `mock/requests.ts` | Servicios mock | Mantener como fallback |
| `mock/source-items.ts` | 2 componentes | Mantener hasta Fase 5D |
| `mock/extras.ts` | 3 servicios mock | Mantener hasta Fase 5E |

---

## 8. Tests

- 69/69 tests existentes pasan ✅
- No se modificaron tests existentes

---

## 9. Validación

| Prueba | Estado |
|---|---|
| API typecheck | ✅ PASS |
| WEB typecheck | ✅ PASS |
| Tests | ✅ 69/69 |
| Health | ✅ 200 |
| Imports mock/companies | ✅ **0** |

---

## 10. Estadística

**ANTES:**
- Imports directos a mock/companies: **7**
- Empresas reales: 1 (en DB)
- Departamentos reales: 3 (en DB)
- Usuarios reales: 5 (en DB)

**DESPUÉS:**
- Imports directos a mock/companies: **0**
- Empresas reales: 3 (en DB via API)
- Departamentos reales: 6 (en DB via API)
- Usuarios reales: 6 (en DB via API)

---

## 11. Auth

La autenticación sigue siendo mock in-memory. Esto es intencional — la migración de JWT corresponde a una fase de seguridad posterior.

El sistema de sesión actual funciona:
- `GET /auth/session` retorna usuario mock
- `GET /auth/users` retorna lista de usuarios mock
- RBAC verifica permisos contra datos mock

Los datos de usuarios/empresas/departamentos ahora vienen de la API real para visualización, pero la sesión sigue siendo mock.

---

FASE 5C — COMPLETADA
