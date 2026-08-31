# Prueba de Workflow Local

## Usuarios MOCK disponibles

| ID | Nombre | Rol | Departamento | Permisos |
|----|--------|-----|--------------|----------|
| u1 | Juan Pérez | Solicitante | Compras | REQUEST.CREATE, REQUEST.VIEW, DASHBOARD.VIEW |
| u2 | María García | Gerente | Compras | REQUEST.VIEW, DASHBOARD.VIEW |
| u3 | Carlos Rodríguez | Almacén | Almacén | WAREHOUSE.CLASSIFY, WAREHOUSE.VIEW, REQUEST.VIEW, DASHBOARD.VIEW |
| u4 | Ana López | Contabilidad | Contabilidad | ACCOUNTING.APPROVE, ACCOUNTING.VIEW, REQUEST.VIEW, DASHBOARD.VIEW |
| u5 | Luis Martínez | Revisión Final | Contabilidad | REQUEST.VIEW, DASHBOARD.VIEW, ADMIN.MANAGE, AUDIT.VIEW, IMPORT.RUN, IMPORT.VIEW |

## Cómo cambiar de usuario

En la esquina inferior derecha hay un botón que muestra el usuario actual.

Al hacer clic se despliega la lista de usuarios disponibles.

Al seleccionar un usuario:
1. Se actualiza la sesión en el backend
2. Se refrescan los permisos
3. Los módulos visibles cambian según el rol

## Flujo completo del workflow

### Paso 1: Solicitante crea solicitud

1. Seleccionar usuario: **Juan Pérez (Solicitante)**
2. Ir a **Solicitante** → **Nueva Solicitud**
3. Completar:
   - Descripción: "FILTRO HIDRÁULICO PARKER 20 MICRAS"
   - Propósito: "Mantenimiento preventivo"
   - Prioridad: Alta
4. Clic en **Enviar Solicitud**
5. Verificar que el estado sea **PENDING_MANAGER**

### Paso 2: Gerente aprueba

1. Seleccionar usuario: **María García (Gerente)**
2. Ir a **Solicitante** → ver la solicitud pendiente
3. Abrir detalle de la solicitud
4. Clic en **Aprobar**
5. Verificar que el estado pase a **PENDING_WAREHOUSE**

### Paso 3: Almacén clasifica

1. Seleccionar usuario: **Carlos Rodríguez (Almacén)**
2. Ir a **Clasificación**
3. La solicitud debe aparecer en la bandeja
4. Clic en **Calificar**
5. Seleccionar:
   - Grupo: RVH (Repuestos de Vehículos)
   - Subgrupo: CAR (Carrocería)
   - Categoría: Parachoque Delantero
   - Marca: Baldwin
   - Unidad: PZA (Pieza)
6. Verificar que el código se genere automáticamente: **RVHCAR00000X**
7. Clic en **Aprobar Clasificación**
8. Verificar que el estado pase a **PENDING_ACCOUNTING**

### Paso 4: Contabilidad aprueba

1. Seleccionar usuario: **Ana López (Contabilidad)**
2. Ir a **Contabilidad**
3. La solicitud debe aparecer en la bandeja
4. Clic en **Revisar**
5. Verificar que la clasificación de Almacén sea visible (grupo, subgrupo, marca)
6. Agregar código contable:
   - Código: 5010-01
   - Descripción: Repuestos vehículos
7. Clic en **Aprobar**
8. Verificar que el estado pase a **PENDING_FINAL_REVIEW**

### Paso 5: Revisión Final aprueba

1. Seleccionar usuario: **Luis Martínez (Revisión Final)**
2. Ir a **Solicitante** → ver la solicitud
3. Abrir detalle
4. Clic en **Aprobar**
5. Verificar que el estado pase a **APPROVED**

## Prueba de persistencia

1. Completar el flujo hasta APPROVED
2. Cerrar el navegador
3. Volver a abrir http://localhost:5173
4. La solicitud debe seguir existiendo con estado APPROVED
5. Reiniciar backend (`pnpm --filter @master-data/api run dev`)
6. Volver a consultar → la solicitud persiste en SQLite

## API endpoints de usuario

```
GET /api/v1/auth/session          → sesión del usuario actual
GET /api/v1/auth/session?userId=u2 → cambiar a usuario u2
GET /api/v1/auth/users            → listar usuarios disponibles
```

## Nota importante

- La sesión es global por instancia del backend
- Si hay múltiples pestañas del navegador, comparten la misma sesión
- El selector de usuarios es una herramienta de desarrollo
- En producción esto será reemplazado por autenticación real
