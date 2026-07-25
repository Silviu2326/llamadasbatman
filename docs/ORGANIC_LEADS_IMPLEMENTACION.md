# Organic Leads — implementación MVP

## Alcance entregado

Organic Leads está integrado como módulo protegido en `/organic`, dentro de la sección Captación de la sidebar. La primera versión entrega el resumen operativo inspirado en la referencia visual:

- oportunidad orgánica y KPIs;
- demanda por búsqueda y zona;
- acciones recomendadas;
- presencia local;
- visibilidad en IA;
- activos comerciales;
- leads orgánicos;
- competitor gap;
- estados de carga, configuración, vacío y error;
- diseño responsive y controles accesibles.

El módulo no inventa métricas. Si una fuente aún no está conectada, la interfaz muestra un estado vacío o un guion.

## Frontend

- `src/pages/OrganicLeadsPage.jsx`: pantalla, estados y modales.
- `src/pages/organic-leads.css`: sistema visual del módulo.
- `src/lib/organic/organicApi.js`: adaptador HTTP y normalización de respuestas.
- `src/lib/organicPage.js`: resolución segura para que la ruta no rompa checkouts parciales.
- `src/App.jsx`: ruta protegida `/organic`.
- `src/components/Sidebar.jsx`: entrada Organic Leads dentro de Captación.
- `src/lib/navigationPermissions.js`: filtrado de navegación por `organic.read`.

Las acciones del frontend usan endpoints reales:

- crear proyecto: `POST /api/organic/project`;
- conectar o actualizar web: `PATCH /api/organic/project`;
- guardar un activo como borrador: `POST /api/organic/assets`.

## Backend

Modelos Prisma añadidos:

- `OrganicProject`;
- `OrganicOpportunity`;
- `OrganicAsset`;
- `OrganicAction`;
- `OrganicIntegration`.

Migración: `backend/prisma/migrations/20260722120000_add_organic_leads_mvp/migration.sql`.

Rutas registradas en `backend/src/routes/organic.ts`:

- `GET /api/organic/overview`;
- `GET /api/organic/project`;
- `POST /api/organic/project`;
- `PATCH /api/organic/project`;
- `GET /api/organic/integrations`;
- `POST /api/organic/assets`;
- `POST /api/organic/opportunities/:opportunityId/actions`.

Todas las rutas exigen autenticación. Las mutaciones validan el payload con Zod, aplican límites de tamaño y escriben auditoría. El `orgId` se obtiene del JWT y se usa en las consultas, evitando confiar en un identificador de organización enviado por el cliente.

## Permisos

Permisos nuevos:

- `organic.read`;
- `organic.manage`;
- `organic.publish`;
- `organic.approve`;
- `organic.integrations.read`;
- `organic.integrations.manage`.

El acceso de navegación sólo muestra el módulo cuando el usuario tiene `organic.read`. El servidor sigue siendo la autoridad final y aplica los permisos por organización.

## Integraciones de la primera fase

El proyecto crea filas de integración para:

- Google Search Console;
- GA4;
- Google Business Profile.

La primera fase sólo preparaba el contrato y el estado de conexión. La implementación real de OAuth, discovery y sincronización de Search Console está documentada en [ORGANIC_LEADS_FASE2.md](ORGANIC_LEADS_FASE2.md).

## Verificación

Correcto:

- `npm.cmd run build` en la raíz;
- `npx.cmd prisma validate`;
- `npx.cmd prisma generate`;
- `git -c safe.directory=E:/exclusion/silxarcrm/llamadasrobin diff --check` sin errores de whitespace.

Limitaciones del entorno:

- el build global de backend sigue fallando por errores TypeScript preexistentes en otros servicios/tests, sin errores reportados en Organic;
- los tests de integración de Organic requieren `TEST_DATABASE_URL`;
- el navegador local alcanzó `/organic`, pero el shell redirigió a login porque no había sesión y el backend local no respondía en `127.0.0.1:3000`.

## Fase 2 y siguientes pasos

1. Aplicar las migraciones Organic en staging y configurar credenciales Google.
2. Levantar el backend con una base de pruebas y ejecutar las pruebas de integración.
3. Añadir reporting GA4/GBP y sincronizar conversiones con `AcquisitionEvent`/CRM.
4. Completar las vistas profundas con filtros, detalle de propiedad y auditoría de sincronización.
