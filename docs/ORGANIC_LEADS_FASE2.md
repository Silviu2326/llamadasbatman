# Organic Leads — fase 2: integraciones Google

## Entregado

La fase 2 añade conexiones reales, sin afirmar datos que no existan:

- OAuth Google server-side para Search Console, GA4 y Google Business Profile.
- `state` opaco hashado, de un solo uso, con expiración y PKCE.
- Access/refresh tokens cifrados con AES-256-GCM y una clave exclusiva de Organic.
- Discovery de propiedades Search Console, propiedades GA4 y ubicaciones GBP.
- Selección explícita de propiedad antes de sincronizar.
- Desconexión local y revocación del token en Google cuando es posible.
- Sincronización real de consultas de Search Console a `OrganicOpportunity`.
- Panel de estados y acciones en `/organic`.
- Navegación interna de Resumen, Oportunidades, Visibilidad local, Visibilidad IA, Contenido, Competidores y Leads orgánicos.

## Contrato backend

Rutas añadidas:

- `GET /api/organic/integrations/:provider/oauth/start-url` — devuelve la URL OAuth.
- `GET /api/organic/integrations/:provider/oauth/start` — redirección directa.
- `GET /api/organic/integrations/:provider/oauth/callback` — callback público protegido por state.
- `GET /api/organic/integrations/:provider/status` — estado seguro sin tokens.
- `POST /api/organic/integrations/:provider/discover` — descubre recursos del proveedor.
- `PUT /api/organic/integrations/:provider/resource` — fija una propiedad descubierta.
- `DELETE /api/organic/integrations/:provider` — desconecta y limpia credenciales locales.
- `POST /api/organic/integrations/search_console/sync` — ingesta queries reales por rango de fechas.

El frontend usa estos contratos; las acciones no escriben nada si el proveedor no está conectado o la propiedad no procede del discovery.

## Configuración requerida

En `backend/.env`:

```env
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_BASE_URL=https://api.example.com
ORGANIC_TOKEN_ENCRYPTION_KEY=
```

`ORGANIC_TOKEN_ENCRYPTION_KEY` debe ser aleatoria y tener al menos 32 caracteres. No debe reutilizar `JWT_SECRET`, `OAUTH_STATE_SECRET` ni `META_TOKEN_ENCRYPTION_KEY`.

En Google Cloud hay que habilitar las APIs correspondientes y registrar estos callbacks:

```text
/api/organic/integrations/search_console/oauth/callback
/api/organic/integrations/ga4/oauth/callback
/api/organic/integrations/google_business_profile/oauth/callback
```

## Fuente oficial y decisiones técnicas

El flujo sigue OAuth para aplicaciones web de servidor de Google, conserva refresh tokens cifrados y usa scopes de lectura para Search Console/GA4 y `business.manage` para GBP. Search Console usa `searchAnalytics.query` con dimensiones `query`, rango de fechas y límite controlado; la API documenta un máximo de 25.000 filas por consulta. [OAuth web server de Google](https://developers.google.com/identity/protocols/oauth2/web-server), [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [GA Admin API](https://developers.google.com/analytics/devguides/config/admin/v1), [GBP locations.list](https://developers.google.com/my-business/reference/rest/v4/accounts.locations/list).

GA4 y GBP quedan en discovery en esta fase. No se muestran sesiones, conversiones o acciones locales hasta que se implemente la ingesta de sus APIs de reporting con sus propiedades seleccionadas.

## Migración y verificación

Migración nueva:

`backend/prisma/migrations/20260722153000_add_organic_google_oauth/migration.sql`

Verificado:

- `prisma validate` correcto.
- `prisma generate` correcto.
- build frontend correcto.
- build backend sin errores nuevos de Organic; continúa fallando por errores TypeScript preexistentes fuera de este módulo.
- no se ejecutó `prisma migrate deploy`: requiere apuntar explícitamente a una base de staging.
- no se validó OAuth real ni sincronización Google: faltan credenciales y `TEST_DATABASE_URL`.

## Próximo paso operativo

1. Configurar credenciales Google en staging.
2. Aplicar la migración con `npx prisma migrate deploy` desde `backend`.
3. Crear un proyecto Organic de prueba.
4. Conectar Search Console, descubrir y seleccionar propiedad.
5. Ejecutar una sincronización de 30 días y verificar oportunidades creadas, auditoría y aislamiento tenant.
