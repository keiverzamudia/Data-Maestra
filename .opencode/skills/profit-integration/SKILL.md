---
name: profit-integration
description: Aislar la integración con Profit Plus 2K8 mediante adapters, lectura segura, staging y contratos independientes del esquema legacy.
compatibility: opencode
---

# Profit Integration

## Regla absoluta
Primera fase READ-ONLY.

## Arquitectura
Frontend → API → Profit Application Service → ProfitAdapter → fuente Profit.

El resto de la aplicación no debe conocer tablas de Profit.

## Reglas
- No asumir nombres de tablas.
- Primero inspeccionar esquema real.
- Crear perfil por empresa/instancia.
- Registrar origen, fecha de extracción y versión del esquema.
- Copiar datos a staging antes de homologar.
- No modificar Profit.
- No mezclar datos de diferentes empresas sin conservar `source_company_id`.

## Futuro
Si se implementa escritura:
- adapter separado;
- permisos explícitos;
- idempotencia;
- dry-run;
- auditoría;
- rollback/compensación;
- pruebas sobre copia de Profit.
