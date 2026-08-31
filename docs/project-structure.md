# Estructura del Proyecto

## Visión General

El proyecto es un **monorepo** gestionado con pnpm workspaces.

---

## Carpetas Principales

```
Data-Maestra/
├── apps/
│   ├── web/          → Frontend (React + TypeScript + Vite)
│   └── api/          → Backend (NestJS + Prisma)
│
├── packages/
│   ├── contracts/    → Interfaces compartidas entre frontend y backend
│   └── shared/       → Enums y tipos compartidos
│
├── docs/             → Documentación técnica del proyecto
├── db/               → Scripts SQL y esquemas de base de datos
├── prompts/          → Prompts de fases de desarrollo
└── .opencode/        → Configuración de OpenCode (skills, comandos)
```

---

## Frontend (`apps/web/`)

```
src/
├── app/
│   ├── App.tsx           → Punto de entrada: rutas y layout principal
│   └── globals.css       → Estilos globales de la aplicación
│
├── components/
│   ├── ui/               → Componentes reutilizables (Button, Input, Card, Modal, etc.)
│   ├── layout/           → Layout principal (sidebar, header, contenido)
│   └── workflow/         → Componentes de workflow (Timeline, AnalyzerPanel, etc.)
│
├── modules/
│   ├── dashboard/        → KPIs, resumen, actividad reciente
│   ├── requester/        → Crear y gestionar solicitudes de artículos
│   ├── warehouse/        → Clasificar artículos (grupo, subgrupo, marca, etc.)
│   ├── accounting/       → Revisar y aprobar información contable
│   ├── imports/          → Pipeline de importación, matching, data quality
│   ├── audit/            → Registro de eventos del sistema
│   └── administration/   → Gestión de usuarios, roles, catálogos
│
├── services/
│   ├── mock/             → Implementación mock de servicios (datos en memoria)
│   └── session.ts        → Sesión mock del usuario actual
│
├── contexts/
│   ├── SessionContext.tsx → Estado global: usuario, permisos, empresa
│   └── CompanyContext.tsx → Estado global: empresa seleccionada
│
├── contracts/            → Interfaces de contrato de cada servicio
├── mock/                 → Datos mock (catálogos, empresas, solicitudes, masters)
├── types/                → Tipos TypeScript del dominio
└── main.tsx              → Entry point de React
```

---

## Backend (`apps/api/`)

```
src/
├── main.ts               → Entry point de NestJS
├── app.module.ts          → Módulo raíz
├── modules/
│   └── health/            → Health check (único módulo actual)
└── shared/
    └── prisma/            → Servicio y módulo de Prisma
```

---

## Paquetes Compartidos

- **`packages/contracts`** — Interfaces de servicio (RequestService, WarehouseService, etc.)
- **`packages/shared`** — Enums y tipos compartidos

---

## Convenciones

- Cada módulo exporta desde su `index.ts`
- Los servicios mock implementan contratos definidos en `contracts/`
- Los componentes UI son genéricos y reutilizables
- Los componentes de workflow son específicos del dominio
- Los contextos manejan estado global mínimo (sesión y empresa)
