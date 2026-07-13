# Guía de implementación

## Punto de partida del repositorio

La aplicación actual usa React, React Router, Fastify y Prisma. Los puntos centrales son:

- `src/App.jsx`: rutas frontend actuales.
- `src/components/Sidebar.jsx`: navegación lateral actual.
- `src/components/ProtectedRoute.jsx`: shell protegido.
- `src/lib/api.js`: cliente de API.
- `backend/src/index.ts`: registro de rutas Fastify.
- `backend/prisma/schema.prisma`: modelo de datos.
- `backend/src/controllers/`: controladores existentes.
- `backend/src/routes/`: rutas existentes.

## Archivos a crear

```text
src/config/moduleRegistry.js
src/config/permissions.js
src/config/featureFlags.js
src/components/layout/ModuleShell.jsx
src/components/layout/ModuleHeader.jsx
src/components/layout/ModuleTabs.jsx
src/components/layout/RecordDrawer.jsx
src/components/data/DataView.jsx
src/components/data/FilterBar.jsx
src/components/data/EmptyState.jsx
src/components/data/ErrorState.jsx
src/pages/ModuleIndexPage.jsx
src/pages/ModuleRecordPage.jsx
src/pages/InboxPage.jsx
src/pages/ExecutiveDashboardPage.jsx
```

Los nombres son orientativos, pero la responsabilidad debe mantenerse separada.

## Archivos a modificar primero

### `src/components/Sidebar.jsx`

- Sustituir `SECTIONS` hardcodeado por el registro de módulos.
- Mantener Dashboard como entrada fija.
- Ocultar módulos por `featureFlag`, integración requerida y permiso.
- Mantener aliases de rutas actuales.
- Añadir búsqueda rápida o enlace al command palette.

### `src/App.jsx`

- Añadir un route shell para las áreas nuevas.
- Usar páginas genéricas para listas y fichas.
- Mantener rutas específicas existentes mientras dure la migración.
- No duplicar una importación y una ruta por cada subfunción.

### `src/components/ProtectedRoute.jsx`

- Mantener la protección actual.
- Añadir resolución de organización, permisos y flags antes de mostrar módulos.

### `src/lib/api.js`

- Centralizar `list`, `get`, `create`, `update`, `delete`, `bulk` y `export`.
- Añadir manejo uniforme de errores, cancelación y estados de carga.
- No llamar a proveedores externos directamente desde componentes React.

### `src/style.css`, `src/sidebar.css` y CSS de componentes

- Crear tokens de spacing, colores, estados y tamaños.
- Definir responsive para sidebar, tablas, drawers y tabs.
- Evitar estilos globales que rompan páginas existentes.

## Backend: patrón obligatorio

Para un módulo nuevo como SEO:

```text
backend/src/routes/seo.ts
backend/src/controllers/seo.controller.ts
backend/src/services/seo.service.ts
backend/src/validators/seo.schemas.ts
```

La ruta debe registrarse en `backend/src/index.ts` con un prefijo estable, por ejemplo `/api/seo`.

La respuesta debe tener una forma consistente:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 0
  }
}
```

Errores:

```json
{
  "error": {
    "code": "SEO_AUDIT_NOT_FOUND",
    "message": "No se encontró la auditoría"
  }
}
```

## Matriz de módulos y profundidad

| Módulo | Primera vista | Vista secundaria | Backend inicial |
| --- | --- | --- | --- |
| SEO | Resumen | Keywords, auditorías, rankings | proyectos, keywords, audits |
| Google Business | Resumen | reseñas, publicaciones, ubicaciones | locations, reviews, posts |
| Scraping | Jobs | resultados, listas, importación | scrapingJobs, prospects |
| Formularios | Lista | editor, respuestas, embed | forms, fields, submissions |
| Inbox | Bandeja | conversación, plantillas | conversations, messages |
| Secuencias | Lista | editor, métricas | sequences, steps, enrollments |
| Oportunidades | Kanban/lista | ficha contextual | opportunities, stages |
| Centralita | Monitor | números, IVR, colas | phoneNumbers, queues, ivr |
| IA | Catálogo | ficha de agente | agents, models, voices |
| Analítica | Dashboard | informe/exportación | reports, widgets, exports |
| Sistema | Ajustes | usuarios, integraciones, logs | users, roles, integrations |

## Orden recomendado de código

1. Registro de módulos y shell visual.
2. Migración del sidebar y aliases.
3. Componentes de datos compartidos.
4. Objeto/timeline de contacto, empresa y oportunidad.
5. Inbox unificado.
6. Módulos de captación y nutrición.
7. Operaciones e IA avanzada.
8. Analítica y administración.

## Estructura frontend propuesta

La estructura final puede crecer así, conservando las páginas existentes durante la migración:

```text
src/
├── config/
│   ├── moduleRegistry.js
│   ├── permissions.js
│   └── featureFlags.js
├── components/
│   ├── layout/
│   │   ├── AppShell.jsx
│   │   ├── ModuleShell.jsx
│   │   ├── ModuleHeader.jsx
│   │   ├── ModuleTabs.jsx
│   │   └── RecordDrawer.jsx
│   ├── data/
│   │   ├── DataView.jsx
│   │   ├── DataTable.jsx
│   │   ├── FilterBar.jsx
│   │   ├── SavedViews.jsx
│   │   ├── EmptyState.jsx
│   │   └── ErrorState.jsx
│   └── domain/
│       ├── ActivityTimeline.jsx
│       ├── ContactSummary.jsx
│       ├── CompanySummary.jsx
│       ├── OpportunitySummary.jsx
│       └── ConversationSummary.jsx
├── hooks/
│   ├── usePermissions.js
│   ├── useFeatureFlag.js
│   ├── useListQuery.js
│   ├── useMutation.js
│   └── useRealtime.js
├── pages/
│   ├── ModuleIndexPage.jsx
│   ├── ModuleRecordPage.jsx
│   ├── InboxPage.jsx
│   └── ExecutiveDashboardPage.jsx
└── lib/
    ├── api.js
    ├── queryKeys.js
    ├── errors.js
    └── permissions.js
```

No es obligatorio crear todos los archivos en la primera fase. La estructura evita que cada módulo invente su propio patrón.

## Tipo del registro de módulos

Aunque el proyecto use JavaScript, documentar la forma esperada ayuda a no romper el contrato:

```js
/**
 * @typedef {Object} ModuleDefinition
 * @property {string} id
 * @property {string} area
 * @property {string} label
 * @property {string} basePath
 * @property {string} capability
 * @property {string[]} views
 * @property {boolean} enabledByDefault
 * @property {string=} requiredIntegration
 * @property {string=} featureFlag
 */
```

Cada módulo debe declarar también `entity`, `icon`, `order`, `deprecated`, `aliases` y `createActions` cuando corresponda.

## ModuleShell mínimo

```jsx
<ModuleShell module={module}>
  <ModuleHeader
    title="Formularios"
    description="Puntos de entrada para captar demanda"
    primaryAction={<CreateFormButton />}
  />
  <ModuleTabs items={tabs} />
  <FilterBar value={filters} onChange={setFilters} />
  <DataView
    status={status}
    data={forms}
    empty={<FormsEmptyState />}
    error={<ErrorState onRetry={reload} />}
  />
</ModuleShell>
```

El shell no conoce reglas de SEO, facturación o conversaciones. Solo coordina layout y estados.

## Patrón de hook de lista

Un módulo remoto debe separar query, presentación y mutación:

```js
const { data, meta, status, error, reload } = useListQuery(
  ['forms', filters],
  () => formsApi.list(filters),
)
```

Requisitos:

- cancelar requests obsoletas;
- conservar datos anteriores durante paginación si mejora UX;
- invalidar la lista tras crear/editar/borrar;
- mostrar error de servidor sin perder filtros;
- evitar llamadas duplicadas en Strict Mode.

## Patrón de ficha

Una ficha debe tener una única fuente de verdad para el registro. Las pestañas piden subrecursos paginados; no cargan todo el universo en la primera llamada.

```text
GET /api/opportunities/:id
GET /api/opportunities/:id/activities
GET /api/opportunities/:id/conversations
GET /api/opportunities/:id/documents
```

Las acciones usan endpoints de dominio y actualizan la ficha después de la respuesta del servidor.

## Archivos backend por dominio

Cuando el dominio crezca, separar también los servicios comunes:

```text
backend/src/
├── routes/
├── controllers/
├── services/
├── validators/
├── repositories/
├── policies/
├── events/
├── jobs/
├── integrations/
└── lib/
```

`controllers` traducen HTTP; `services` ejecutan negocio; `repositories` encapsulan consultas; `policies` resuelven autorización; `events` publican eventos; `jobs` ejecutan trabajo asíncrono.

## Migración de componentes actuales

No reescribir `Leads.jsx`, `Pipeline.jsx`, `Calls.jsx` o `Automatizaciones.jsx` por completo en la primera iteración. Extraer progresivamente:

1. encabezado y acciones;
2. filtros;
3. estados vacío/error;
4. tabla/lista;
5. drawer de detalle;
6. timeline;
7. API y mutaciones.

Tras cada extracción, comparar el comportamiento con la versión anterior.

## Qué modificar en cada tipo de trabajo

| Trabajo | Archivos mínimos |
| --- | --- |
| Nuevo módulo visual sin backend | `moduleRegistry`, `App`, `ModuleShell`, página, estilos, tests |
| CRUD persistente | esquema, validator, service, controller, route, `index.ts`, `api.js`, página, tests |
| Integración externa | modelo de Integration, adapter, webhook, job, secretos, logs, UI de conexión |
| Nuevo permiso | permisos, policy backend, hook frontend, tests 401/403/tenant |
| Nueva métrica | query backend, definición de métrica, widget, estado sin datos, prueba de cálculo |
| Nueva acción masiva | endpoint job, selección UI, progreso, cancelación, auditoría, límites |
