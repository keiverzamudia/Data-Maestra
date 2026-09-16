# FASE 17 — Implementación de homologación corporativa multiempresa

> Documenta lo implementado (no es investigación). Base obligatoria:
> `docs/FASE_16_INVESTIGACION_MULTIEMPRESA_PROFIT.md`. Sin agent-browser,
> sin subagentes. `PROFIT_WRITE_ENABLED=false` por defecto. Cero escrituras
> reales durante la validación (tests contra modelo en memoria).

## 1. Objetivo

Evolucionar Data-Maestra de registro simple a **homologación corporativa
de maestros**: comparar catálogos contra el estándar, sincronizarlos y
registrar el mismo artículo (mismo código, correlativo y payload) en
todas las empresas seleccionadas, en una sola operación atómica.

## 2. Arquitectura

Se reutiliza el módulo `profit` sin duplicarlo. Capas (sin lógica en controllers):

```
CorporateController (corporate/*)
  → CorporateHomologationService (orquesta: comparar → plan → preflight → TX → verificar → auditar)
  → CorporateCompaniesService (descubrimiento TEmpresas)
  → ProfitAdapterService.rawQuery (lecturas, three-part)
  → ProfitWriteAdapterService.runInGlobalTransaction (única vía de escritura)
  → SQL Server (una conexión, BEGIN/COMMIT/ROLLBACK multibase)
Módulos puros (testeables sin BD): corporate-company, corporate-catalogs,
corporate-compare (+ corporate-compare preflight evaluator).
SolicitudesService.createInProfit(..., targetCompanies?) delega en el motor
corporativo manteniendo la máquina de estados vigente.
```

## 3. AD_TRANS como estándar

`corporate-company.ts`: `STANDARD_COMPANY = 'AD_TRANS'`, única definición
centralizada. El estándar siempre participa en el registro corporativo
(referencia del correlativo y de los valores), aparece en el selector
marcado como "Estándar corporativo" y nunca es destino. No existe
configuración para cambiar el estándar en esta fase.

## 4. Descubrimiento dinámico de empresas

`CorporateCompaniesService.listCompanies()` lee
`AD_GRUP.dbo.TEmpresas` (solo lectura, caché 60 s), deduplica por
`cod_emp` (heap sin PK), filtra formatos inválidos y marca el estándar.
Una empresa nueva mañana aparece sola en selector, preflight y registro.
`GET /api/v1/corporate/companies`.

## 5. Catálogos homologados

`corporate-catalogs.ts`, en orden de dependencias (§8 Fase 16):
`tabulado → unidades → lin_art → sub_lin → cat_art → colores → prov →
proceden`, con columnas reales y `co_us_in` donde existe (todas menos
`tabulado`). Builders puros de SELECT/INSERT/UPDATE con referencias
`[DB].dbo.[tabla]` validadas (nunca interpolación libre).
Excluidos (§5/§29): movimientos, stocks, costos, precios, documentos,
auditoría Profit, `xart_cont`, `art_ext`, `kit`, `lote`, campos generados.

## 6. Reglas de comparación

`corporate-compare.ts`: `IGUAL` (no escribe), `FALTA_EN_DESTINO` (crea
con el código del estándar), `DESCRIPCION_DIFERENTE` (solo descripción,
nunca PK), `DATOS_DIFERENTES`/`NO_COMPATIBLE`/`ERROR` (bloquean, no se
adivina). `sub_lin` compara padre (`parentAware`). Códigos solo en
destino se ignoran (jamás se borra).

## 7. SyncPlan

Determinístico: comparar → plan → preflight → ejecutar. Cada ítem lleva
empresa, catálogo, código, operación (`NO_ACTION|INSERT|
UPDATE_DESCRIPTION|BLOCKED`), valor estándar/actual, motivo, seguridad y
estado. `POST /api/v1/corporate/compare` lo devuelve con resumen
(iguales/nuevos/descripciones/bloqueos) y bandera `executable`.

## 8. Preflight

`CorporateHomologationService.preflight()` (solo lectura), 15 checks por
empresa: directorio, nombre, conexión, esquema (15 columnas + PK),
tablas, columnas (+ insertabilidad solo donde el plan tiene INSERTs),
triggers presentes, catálogos del artículo (acepta cobertura del plan),
jerarquía, defaults, permiso de escritura (requiere flag),
candidato libre, secuencia, cuentas de `dis_cen`, compatibilidad de
`TrigI_art` (texto normalizado idéntico al estándar). Un fallo →
`ok:false` global y cero escrituras. `POST /api/v1/corporate/preflight`.

## 9. Transacción global

`ProfitWriteAdapterService.runInGlobalTransaction()`: una conexión del
pool de escritura, `BEGIN TRANSACTION`, sentencias three-part a todas
las bases, verificación dentro de la TX y `COMMIT`; cualquier error →
`ROLLBACK` total. Sin commit parcial por empresa. Servidores distintos:
sin atomicidad posible → el preflight aborta antes (misma conexión no
cubriría ambas).

## 10. Correlativo universal

`MAX()+1` del estándar bajo `UPDLOCK, HOLDLOCK` dentro de la TX +
candidato libre verificado en TODAS bajo lock antes de insertar (sin
`SELECT MAX` desprotegido). Mismo código en todas; conflicto o tope
9999 → aborta todo.

## 11. dis_cen

Estándar = `AD_TRANS` (vía plan/contabilidad como hoy). Preflight
verifica cada cuenta del payload en `C_DIST.dbo.sccuenta`; cuenta
faltante o formato inválido → error global, cero escrituras. Sin
sustituciones ni aproximaciones.

## 12. Registro multiempresa

`CorporateHomologationService.registerArticle()`: comparar → plan
(bloqueos abortan) → preflight con artículo (cobertura del plan incluida)
→ TX (reservar correlativo, homologar dependencias, INSERT idéntico con
`buildInsertStatement(payload, [DB].dbo.[art])`, verificar valores por
empresa) → commit/rollback. `POST /api/v1/corporate/register-article`
y extensión de `POST /requests/:id/profit-create` con `{ empresas: [] }`
(sin destinos = flujo simple histórico intacto). Payload de 15 columnas
y `co_us_in=DM` backend-only sin cambios.

## 13. Verificación

`compareArticlePayload()` compara los 15 valores esperados contra lo
leído en cada empresa (no basta EXISTS); `dis_cen` con la misma
tolerancia del motor simple. Diferencia pre-commit → rollback.

## 14. Auditoría

`AuditEvent` (`entityType: CorporateProfit`, sin secretos):
`CORPORATE_COMPARE`, `CORPORATE_PLAN_BLOCKED`, `CORPORATE_PREFLIGHT_OK/
FAILED`, `CORPORATE_WRITE_SUCCEEDED`, `CORPORATE_ROLLBACK` (con empresas,
código, correlativo, operaciones y motivo). El flujo por solicitud
conserva además sus eventos `PROFIT_*` con la lista de empresas.

## 15. Permisos

Lectura corporativa: `DASHBOARD.VIEW`. Escritura (homologar/registrar):
`PROFIT.WRITE` (deny by default, igual que el registro simple; su
otorgamiento a `MASTER_DATA_ADMIN` es acción administrativa explícita,
sin cambios globales de permisos en esta fase). La UI oculta Homologar
sin el permiso.

## 16. Feature flag

`PROFIT_WRITE_ENABLED=false` por defecto e intacto. `hasInsertPermission`
y `runInGlobalTransaction` exigen el flag (fail-closed); tests con flag
apagado demuestran cero escrituras.

## 17. Tests

Backend `test/homologacion-17.spec.ts`: 26 casos (empresas, builders,
comparación, plan, preflight, correlativo/conflictos, commit, bloqueos,
trigger incompatible, flag apagado, prov no insertable, rollback por
verificación, 3-empresas-una-falla, dis_cen). Fixture en memoria con
commit/rollback real y conteo de transacciones para probar "cero
escrituras". Frontend `HomologacionCorporativa.test.tsx`: estándar,
destinos dinámicos, comparar con resumen. Totales: backend 466/466,
frontend 198/198 (ver §reporte).

## 18. Limitaciones

- Triggers con texto distinto al estándar bloquean la empresa (requiere
  revisión DBA; no se normaliza automáticamente).
- INSERT de catálogo usa columnas mínimas + `co_us_in`; tablas con otros
  NOT NULL sin default (p. ej. `prov.rif`) abortan en preflight.
- Cuentas `dis_cen` se validan contra `C_DIST` (contexto estándar
  verificado en Fase 16).
- Multiservidor futuro: sin estrategia transaccional → aborta cerrado.

## 19. Decisiones técnicas

Reutilizar adapters/pool/driver (`msnodesqlv8` único); three-part names
con nombres validados; lógica pura separada del I/O; controllers
delgados con DTOs validados; estados de solicitud intactos
(`PROCESANDO_PROFIT → INSERTADO_PROFIT | ERROR_PROFIT`); auditoría
dual corporativa + por solicitud; UI empresarial sin jerga técnica.
