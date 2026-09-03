# Implementación Contabilidad 8E — Información Contable c1..c10

> Fase 8E. Primera versión funcional. ProfitAdapter continúa READ-ONLY. 0 escrituras en Profit.

## Qué se implementó

Sección **"Información Contable"** integrada en el flujo existente de Contabilidad
(`Contabilidad → solicitud → clasificación → aprobación`), sin página aislada:

- Pestañas de posiciones `01..10` con indicador visual accesible (`●` con cuenta / `○` vacía,
  más `title` y `aria-selected`; no depende solo del color).
- Por posición: combobox que busca por **código o nombre** sobre el **mismo registro**
  (seleccionar uno resuelve el otro; no son campos independientes).
- Vista de Código + Descripción vinculados, botón **Quitar cuenta**.
- **Vista previa para Profit** con el DIS exacto + botón **Copiar**. No escribe en Profit.
- Una sola cuenta por posición; posiciones opcionales (vacías se omiten).

## Componentes (frontend)

| Archivo | Rol |
|---|---|
| `apps/web/src/componentes/contabilidad/InformacionContable.tsx` (+ `index.ts`) | UI: tabs 01..10, combobox, preview DIS, copiar |
| `apps/web/src/modulos/contabilidad/ContabilidadList.tsx` | Integra el componente; antes tenía inputs libres de código/descripción (ahora selector vinculado) |
| `apps/web/src/servicios/api/api-profit-service.ts` | `getAccounts(search?, limit?)` → `GET /api/v1/profit/accounts` |
| `apps/web/src/utilidades/dis.ts` | Espejo de `serializarDis`/`deserializarDis` (misma regla que backend) |
| `apps/web/src/contratos/index.ts` | `AccountingCode` += `position?: string` |
| `apps/web/src/tipos/index.ts` | `Request.accountingCodes[]` += `position?: string` |
| `apps/web/src/componentes/workflow/RequestDetail.tsx` | Muestra badge `cN` junto a cada código contable (cuando existe) |

## Servicios / backend

| Archivo | Rol |
|---|---|
| `apps/api/src/modulos/profit/profit-adapter.service.ts` | `getAccounts(limit, search?)`: `SELECT DISTINCT` sobre `UNION` de `xart_cont.cta1..8 / nom_cta1..8`, parametrizado con `request.input`, paginado `OFFSET/FETCH`. Solo SELECT. |
| `apps/api/src/modulos/profit/profit.controller.ts` | `GET /profit/accounts?limit=&search=` (`DASHBOARD.VIEW`, rol Contabilidad lo tiene). Solo GET. |
| `apps/api/src/modulos/contabilidad/dis.utils.ts` | `serializarDis()` / `deserializarDis()` puras y testeables |
| `apps/api/src/modulos/contabilidad/contabilidad.service.ts` | `approve()` acepta `position` y valida c1..c10 (máx 10, sin duplicados, código+descripción requeridos). Sin `position` se acepta por compatibilidad con filas pre-8E. |
| `apps/api/src/modulos/contabilidad/contabilidad.controller.ts` | Body `approve` += `position?: string` |
| `apps/api/prisma/schema.prisma` | `RequestAccountingCode.position String?` (nullable, no destructivo; `db push` aplicado a `dev.db`) |

## Tipos

```ts
// backend: dis.utils.ts
type ContabilidadPosition = 1 | 2 | ... | 10;
interface DisEntry { position: ContabilidadPosition; code: string; }

// frontend: componentes/contabilidad/InformacionContable.tsx
type PositionKey = `c${ContabilidadPosition}`; // 'c1'..'c10'
interface ContabilidadEntry { position: PositionKey; code: string; description: string; }

// backend: profit-adapter.service.ts
interface ProfitAccount { code: string; description: string; }
```

Representación interna inequívoca: número `1..10` en backend, clave `c1..c10`
en frontend/persistencia. Nunca `"01"` como clave.

## Funciones DIS

```ts
serializarDis([{ position: 1, code: '1.2.05.02.06.001' }, { position: 7, code: '1.1.04.01.01.001' }])
// → '<DIS>{c1:1.2.05.02.06.001}{c7:1.1.04.01.01.001}</DIS>'

deserializarDis('<DIS>{c1:1.2.05.02.06.001}{c7:1.1.04.01.01.001}</DIS>')
// → { c1: '1.2.05.02.06.001', c7: '1.1.04.01.01.001' }
```

Reglas: solo seleccionadas, orden c1→c10, sin espacios, conserva puntos/ceros,
wrapper `<DIS>`, `c11` (y fuera de c1..c10) lanza error en vez de aceptarse
silencioso, `<DIS></DIS>` ↔ `{}`.

## Origen de cuentas (actualizado 8E.6)

- Fuente real: **`C_DIST.dbo.sccuenta`** (catálogo maestro, 855 cuentas, 489
  imputables; ver `docs/IMPLEMENTACION_CATALOGO_CUENTAS_PROFIT_8E6.md`).
  Antes: `dbo.xart_cont` (solo usadas), hoy referencia de uso.
- Si Profit agrega una cuenta nueva y aparece en `xart_cont`, el selector la
  muestra tras recargar (sin importar nada).
- Si Profit está caído o sin configurar, el componente muestra el error y no
  bloquea el resto de la pantalla; el backend responde 503 controlado.
- No se crean ni editan cuentas. No hay mock nuevo.

## c1..c10 / c9 / c10

- `c1..c8`: alimentadas por `xart_cont.cta1..8` (verificado 8D.1).
- `c9`: soportado en UI y en DIS (39 artículos lo usan en `art.dis_cen`);
  no se supone que venga de `xart_cont` (no tiene `cta9`); usa la misma
  fuente de cuentas disponible.
- `c10`: visible y seleccionable aunque hoy tenga 0 artículos (válida sin uso).
- Etiquetas: literales `c1..c10` (origen de nombres Profit **NO DETERMINADO**).

## Validaciones

Backend (`ContabilidadService.validateAccountingCodes`): máx 10, una cuenta por
posición, `position` debe ser `c1..c10`, código y descripción no vacíos.
Frontend: pestañas impiden duplicar posición; aviso `⚠ ya usada en cN` si el
mismo código se repite; el combobox solo permite elegir del catálogo
(`No hay coincidencias. No se pueden crear cuentas.`).

## Qué NO está implementado

- Escritura en Profit (ni `ProfitAdapter` WRITE ni POST/PUT/PATCH/DELETE nuevos).
- Centros de costo, porcentajes, montos.
- Creación de cuentas ni importación del catálogo.
- Cambios de workflow, permisos o RBAC.
- Etiquetas descriptivas de `c1..c10` (pendiente determinar origen).

## Cómo funciona la UI

1. Contabilidad abre una solicitud `PENDING_ACCOUNTING` → **Revisar**.
2. El componente carga las cuentas una vez (`GET /profit/accounts`, límite 500)
   y filtra localmente por código o nombre.
3. El usuario elige pestaña (`01..10`), busca (`1.1.04` o `repuestos`), elige el
   registro → Código y Descripción quedan vinculados.
4. La vista previa `<DIS>…</DIS>` se actualiza sola; **Copiar** la lleva al
   portapapeles para validación visual.
5. **Aprobar** envía `[{code, description, position}]`; el backend persiste con
   `position` y avanza a `PENDING_FINAL_REVIEW`. **Rechazar** pide comentario
   obligatorio y devuelve a Almacén (sin cambios).

## Corrección 8E.1

- **Endpoint real:** `GET /api/v1/profit/accounts?limit=&search=` → `ProfitController.getAccounts()`
  → `ProfitAdapter.getAccounts()` → `AD_TRANS` (ver `docs/CORRECCION_CONTABILIDAD_PROFIT_8E1.md`).
  El 404 inicial era runtime desactualizado (proceso anterior al build con la ruta);
  `dist/` ya contiene `Get('accounts')`. Tras `.\scripts\api-restart.ps1` responde 200.
- **DIS:** ya no es "vista previa" con botón copiar. Ahora es **"Formato contable
  para Profit"** ("Representación generada automáticamente…"), sin botón y sin
  edición manual: es el payload serializado para la integración futura (8F+).
  `serializarDis()` intacto (18 tests).

## Validación 8E

- Tests API: 12 suites, **121 passed** (nuevos `dis.utils.spec.ts` 18 + 3 de
  posiciones en `accounting.service.spec.ts` + 1 de `getAccounts` en
  `profit-adapter.spec.ts`).
- Typecheck API: PASS. Typecheck web: PASS.
- Build API (`nest build`): PASS. Build web (145 módulos): PASS.
- SQL de `getAccounts` verificado en vivo contra `AD_TRANS` vía `sqlcmd`
  (SELECT DISTINCT … UNION … ORDER BY … OFFSET/FETCH, 5 filas de ejemplo OK).
- Health: `GET /api/v1/health` al final (API no reiniciada por el agente;
  `GET /profit/accounts` en vivo requiere `.\scripts\api-restart.ps1`).
