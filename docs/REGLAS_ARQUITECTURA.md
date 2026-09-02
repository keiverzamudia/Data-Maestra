# Reglas de Arquitectura — Data-Maestra

Fecha: 01 de septiembre de 2026

---

## REGLA 1: Separación de capas

### Frontend

```
Página (modulos/)
  ↓
Componentes (componentes/ui/, componentes/workflow/)
  ↓
Servicio (servicios/api/ o servicios/mock/)
  ↓
API HTTP
```

**NUNCA:**
- Componente → fetch directo (si existe servicio)
- Página → lógica de negocio compleja
- Servicio → UI

### Backend

```
Controller (modulos/*)
  ↓
Guard/RBAC (modulos/autenticacion/)
  ↓
Service (modulos/*)
  ↓
Prisma (comun/prisma/)
  ↓
PostgreSQL/SQLite
```

**NUNCA:**
- Controller → Prisma directamente
- Service → HTTP externo (salvo integración futura con Profit)
- Controller → lógica de negocio compleja

---

## REGLA 2: Un módulo = una responsabilidad

Cada módulo en `modulos/` tiene una responsabilidad clara:

| Módulo | Responsabilidad |
|---|---|
| solicitudes | Crear, enviar, gestionar solicitudes de artículos |
| almacen | Clasificar artículos (grupo, subgrupo, marca, etc.) |
| contabilidad | Revisar y aprobar información contable |
| revision-final | Aprobación definitiva antes de activar master |
| auditoria | Registrar y consultar eventos de auditoría |
| catalogos | Gestionar catálogos (grupos, marcas, unidades) |
| salud | Health checks del sistema |
| archivos | Upload y serve de imágenes |
| autenticacion | Usuarios, roles, permisos, sesiones |

---

## REGLA 3: Dependencias unidireccionales

### Backend

```
modulos/* → comun/prisma
modulos/* → comun/utilidades
modulos/solicitudes ← modulos/almacen
modulos/solicitudes ← modulos/contabilidad
modulos/solicitudes ← modulos/revision-final
modulos/autenticacion ← todos los controllers (via Guard)
```

**NUNCA:**
- `comun/` importa de `modulos/`
- Un módulo importa de otro módulo (excepto solicitudes que es el core)

### Frontend

```
modulos/* → servicios/
modulos/* → componentes/
modulos/* → contextos/
modulos/* → tipos/
servicios/* → contratos/
servicios/* → tipos/
```

**NUNCA:**
- `servicios/` importa de `modulos/`
- `componentes/` importa de `modulos/`
- `tipos/` importa de cualquier cosa

---

## REGLA 4: No duplicar lógica

Si una función existe en `comun/utilidades/`, importarla. No crear una copia.

Ejemplo: `flattenRequestData()` está en `comun/utilidades/flatten-request-data.ts`. Los 4 servicios que la necesitan la importan desde ahí.

---

## REGLA 5: Los mocks son fallback

Cuando existe un servicio API real en `servicios/api/`, el componente debe usarlo.

Los mocks en `servicios/mock/` y `mock/` son para:
- Desarrollo sin backend
- Tests
- Fallback si la API no responde

**NUNCA:**
- Importar `mock/` directamente en componentes si existe servicio API
- Usar datos mock en producción

---

## REGLA 6: Los permisos se declaran una vez

Los permisos se definen en `autenticacion.service.ts` en `ROLE_PERMISSIONS`.

Se aplican en controllers con `@RequirePermission('X.Y')`.

El frontend los verifica con `useSession().hasPermission()`.

**NUNCA:**
- Duplicar la lista de permisos
- Hardcodear permisos en el frontend sin verificar el backend

---

## REGLA 7: Los tests cubren la lógica de negocio

Tests obligatorios para:
- Services con lógica de negocio
- Transiciones de workflow
- Validaciones de estado
- RBAC guards

Tests opcionales para:
- Controllers (se prueban vía integración)
- Componentes UI (se prueban manualmente)

---

## REGLA 8: Documentar cambios al workflow

Cualquier cambio a `getNextStatus()` en `solicitud.service.ts` debe:
1. Actualizar `docs/MANUAL_DESARROLLADOR.md` sección Workflow
2. Agregar test para la nueva transición
3. Verificar que el frontend maneje el nuevo estado

---

## REGLA 9: No modificar archivos generados

NUNCA modificar manualmente:
- `prisma/generated/` (se regenera con `prisma generate`)
- `dist/` (se regenera con `nest build`)
- `node_modules/`
- `pnpm-lock.yaml` (se regenera con `pnpm install`)

---

## REGLA 10: Los endpoints son la API pública

Los endpoints definidos en controllers son la interfaz pública del backend.

**NUNCA:**
- Eliminar un endpoint sin migración
- Cambiar el formato de respuesta sin actualizar el frontend
- Agregar parámetros requeridos sin versionado
