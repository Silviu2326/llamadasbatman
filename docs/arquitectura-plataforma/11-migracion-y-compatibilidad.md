# Migración y compatibilidad

La plataforma ya tiene rutas y componentes en producción o en uso local. La evolución debe ser incremental y reversible.

## Inventario actual

Puntos de entrada conocidos:

```text
/dashboard
/campanas
/llamadas
/leads
/agentes
/pipeline
/reuniones
/playbooks
/insights
/automatizaciones
/knowledge-base
/configuracion
/voz/test
/prospectos
/captacion/conectar
/redes-sociales
/email-marketing
/captacion/nueva
/admin/ad-playbooks
```

Antes de migrar una ruta, buscar referencias en:

- `src/`
- navegación y botones;
- documentación;
- enlaces guardados o emails;
- tests E2E;
- configuraciones de despliegue;
- permisos y telemetría.

## Estrategia de aliases

La ruta antigua redirige a la nueva sin perder el identificador:

```jsx
<Route path="/leads" element={<Navigate to="/ventas/leads" replace />} />
<Route path="/ventas/leads" element={<ModuleIndexPage moduleId="leads" />} />
```

Para rutas con query params, conservar filtros compatibles y descartar solo parámetros que ya no existan.

## Fases de migración frontend

### Paso 1: registro paralelo

Crear `moduleRegistry` sin eliminar `SECTIONS`. Validar que el registro contiene todas las rutas existentes.

### Paso 2: sidebar desde registro

Cambiar `Sidebar.jsx` para renderizar el registro, manteniendo los mismos paths visibles. Comparar capturas o smoke tests.

### Paso 3: shell común

Migrar una página sencilla, por ejemplo Insights o Formularios, a `ModuleShell`. No migrar todas a la vez.

### Paso 4: rutas canónicas

Añadir rutas nuevas y aliases antiguos. Actualizar enlaces internos para usar la ruta canónica.

### Paso 5: retirada controlada

Solo retirar una ruta antigua cuando:

- no hay enlaces internos;
- los tests usan la ruta nueva;
- hay telemetría suficiente;
- se ha comunicado el cambio;
- existe fallback o página de ayuda.

## Migración de datos

No renombrar columnas en producción sin estrategia expand/contract:

1. Añadir nueva columna/modelo compatible.
2. Escribir en ambas representaciones.
3. Migrar datos existentes por lotes.
4. Leer desde la nueva representación.
5. Verificar conteos y consistencia.
6. Dejar de escribir la antigua.
7. Eliminarla en una migración posterior.

Para estados nuevos, permitir temporalmente el valor antiguo y mapearlo de forma explícita.

## Datos mock y datos reales

Si una pantalla actual usa arrays locales:

1. Mantener la forma visual mientras se crea el endpoint.
2. Introducir una capa de servicio con la misma forma.
3. Añadir indicador `source: demo | api`.
4. Sustituir el origen por API.
5. Eliminar datos demo o dejar un dataset de desarrollo separado.

Nunca ejecutar acciones destructivas contra datos demo por error ni presentar resultados locales como persistidos.

## Feature flags

Cada módulo nuevo debe poder activarse por:

```text
organizationId
environment
role
requiredIntegration
rolloutPercentage
```

El backend debe respetar el flag; ocultarlo en frontend no es suficiente.

Flags deben tener propietario, fecha de revisión y plan de retirada.

## Compatibilidad de API

- Añadir campos es compatible.
- Eliminar o cambiar el tipo de un campo no lo es.
- Cambiar estados requiere migración y documentación.
- Mantener endpoints antiguos con `deprecated` durante una ventana.
- Registrar uso de endpoints deprecated antes de retirarlos.

## Rollback

Cada entrega debe declarar:

- cómo desactivar el feature flag;
- cómo revertir la versión frontend;
- cómo detener jobs;
- cómo revertir una migración sin pérdida;
- qué datos creados por la nueva función quedan huérfanos;
- quién decide el rollback.

No usar `git reset --hard` ni borrar cambios locales como mecanismo de rollback de desarrollo.

## Checklist de migración

- [ ] Inventario de rutas y referencias.
- [ ] Alias de compatibilidad.
- [ ] Flag de activación.
- [ ] Plan de datos expand/contract.
- [ ] Smoke test de ruta antigua y nueva.
- [ ] Rollback probado en entorno de prueba.
- [ ] Telemetría de uso.
- [ ] Documentación actualizada.
