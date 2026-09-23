# Runbook de producción

Este documento distingue lo que el código puede verificar localmente de lo que requiere infraestructura, credenciales o consentimiento del proveedor. No se deben copiar secretos en el repositorio ni marcar una integración como conectada solo porque sus variables existan.

La compuerta reproducible es `scripts/production-gate.mjs`. Es deliberadamente independiente de `backend/src`: valida el contrato de configuración antes de arrancar la aplicación y no hace llamadas a proveedores.

## 0. Compuerta operativa reproducible

Antes del gate de producción, ejecutar los checks locales no mutantes:

```powershell
node scripts/ops-checks.mjs
```

Este comando solo revisa sintaxis JavaScript, inventario de migraciones,
`backend/.env.example`, documentación y `prisma validate`; no arranca
servicios, no abre conexiones de red y no ejecuta `prisma migrate`.

Desde la raíz del repositorio:

```bash
npm run ops:production-gate -- --env-file backend/.env
```

El comando exige `NODE_ENV=production`, `DATABASE_URL`, `REDIS_URL`, `PUBLIC_BASE_URL`, `JWT_SECRET`, `OAUTH_STATE_SECRET`, las claves de cifrado y las integraciones indicadas por `REQUIRED_INTEGRATIONS`. Si `REQUIRED_INTEGRATIONS` está vacío en producción, se consideran obligatorias Meta Ads, Google/Search Console, Metricool y Twilio. Resend se configura por organización en Vendrava y no como secreto global de despliegue.

Cada integración tiene tres estados de configuración: bloque completamente
ausente (`WARN` si no es obligatoria), bloque completo (`PASS`) o bloque
parcial (`FAIL`). Una sola URL, token, ID o callback de una integración
opcional no se acepta como “no configurada”: hay que completar todas sus
variables requeridas o eliminarlas. Una integración incluida en
`REQUIRED_INTEGRATIONS` siempre falla si falta cualquier variable.

La salida solo contiene nombres de variables, estados y motivos; nunca valores de entorno, tokens, contraseñas o URLs con credenciales. Las URLs de localhost, `host.docker.internal`, dominios privados y rangos RFC1918 se bloquean. Para una instalación local o una red privada de staging hay que declararlo de forma consciente:

```bash
npm run ops:production-gate -- --env-file backend/.env.staging --allow-private
```

`--allow-private` no relaja la obligación de HTTPS para `PUBLIC_BASE_URL`, callbacks OAuth, webhooks públicos ni otros orígenes públicos en producción. No debe usarse en el gate de producción público.

Para automatización CI, usar JSON sin valores sensibles:

```bash
npm run ops:production-gate -- --env-file backend/.env --json
```

### Migraciones: confirmación explícita

El gate nunca ejecuta migraciones por defecto. `prisma migrate deploy` solo se invoca si el gate pasa y se proporciona el texto exacto de confirmación:

```bash
npm run ops:production-gate -- --env-file backend/.env --migrate --confirm-migrations APPLY_PRODUCTION_MIGRATIONS
```

Sin `--migrate`, con una confirmación incorrecta o con cualquier fallo de configuración, `prisma migrate deploy` no se ejecuta. El gate ejecuta primero `prisma validate`; después, y solo después de la confirmación explícita, ejecuta `prisma migrate deploy` dentro de `backend`.

Antes de confirmar una migración de producción deben existir backup verificable, ventana de cambio, revisión de migraciones y un procedimiento de rollback. Este repositorio no ejecuta ese comando automáticamente durante build, test o arranque.

## 1. Orden seguro de despliegue

1. Crear una base PostgreSQL y Redis aislados para staging.
2. Copiar `backend/.env.example` a un secreto gestionado por el entorno, añadir `NODE_ENV=production` y definir `PUBLIC_BASE_URL`.
3. Generar valores aleatorios independientes para `JWT_SECRET`, `OAUTH_STATE_SECRET`, `META_TOKEN_ENCRYPTION_KEY`, `ORGANIC_TOKEN_ENCRYPTION_KEY`, `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY`, `OBSERVABILITY_TOKEN`, `OBSERVABILITY_MUTATION_TOKEN` y `WORKER_HEARTBEAT_KEY`. Los dos tokens de observabilidad deben ser distintos.
4. Configurar `APP_URL`, `PUBLIC_HOST`, `CORS_ORIGINS`, `TRUST_PROXY` y callbacks HTTPS antes de iniciar OAuth.
5. Ejecutar la compuerta de la sección 0; corregir todos los `FAIL` antes de continuar.
6. Ejecutar `npx prisma validate` y `npx prisma generate` desde `backend`.
7. Aplicar migraciones únicamente con la orden confirmada de la sección 0.
8. Arrancar API y workers por separado; comprobar `/health`, `/health/ready` y `/health/integrations`.
9. Configurar `OBSERVABILITY_TOKEN` y usarlo como Bearer en `/health/workers`, `/health/queues`, `/health/metrics` y `/health/metrics/json`. Reservar `OBSERVABILITY_MUTATION_TOKEN`, distinto, para operaciones como replay de outbox; `WORKER_HEARTBEAT_KEY` debe ser estable por despliegue y no compartirse con otro entorno.
10. Conectar un proveedor cada vez y verificar su callback, renovación, webhook firmado y evento idempotente.
11. Ejecutar los flujos E2E con datos de prueba antes de usar una cuenta comercial.

## 2. Variables por proveedor

| Proveedor | Variables mínimas | Validación adicional |
|---|---|---|
| Meta Ads | `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI`, `META_TOKEN_ENCRYPTION_KEY`, `META_WEBHOOK_VERIFY_TOKEN` | OAuth con PKCE, scopes aprobados, webhook Meta firmado y cuenta publicitaria de staging |
| Google / Search Console | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_BASE_URL`, `ORGANIC_TOKEN_ENCRYPTION_KEY` | Propiedad seleccionada, refresh token cifrado y acceso real a Search Console |
| Metricool | `METRICOOL_BASE_URL`, `METRICOOL_USER_TOKEN`, `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID` | Perfil/marca devuelto por la API y post de borrador con atribución |
| Email (Resend) | Credencial BYOK de cada organización: API key, remitente verificado y secreto de webhook opcional | Probar entrega, recepción, consentimiento, baja y webhook firmado desde una organización de staging |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, URL pública de webhook y número origen | Firma `X-Twilio-Signature`, llamada de prueba y callback de estado |

## 3. Gates de producción

- `GET /health/ready` debe responder `200`.
- Las integraciones no configuradas deben aparecer como `not_configured`, no como conectadas.
- Las integraciones con variables incompletas deben aparecer como `degraded`.
- Las acciones reales deben pasar por permiso, entitlement, aprobación, idempotency key y worker.
- Ninguna pantalla debe mostrar datos demo salvo que `VITE_DATA_MODE=demo|preview` o `VITE_ALLOW_DEMO_DATA=true` esté activado explícitamente.
- El orquestador debe conservar la propuesta y el resultado de cada paso; ningún efecto irreversible debe ocurrir durante la generación del plan.

## 4. Migraciones y rollback

Las migraciones se aplican solo con `prisma migrate deploy` y una copia/backup verificado. La migración del centro de acción crea `ActionItem` y `ActionItemHistory`; debe aplicarse antes de usar el endpoint `PATCH /api/dashboard/actions/:id`. No se deben editar migraciones ya aplicadas: cualquier corrección requiere una nueva migración.

## 5. Pruebas mínimas antes de abrir tráfico

- aislamiento entre dos organizaciones en cada endpoint mutador;
- OAuth con `state` inválido, expirado y reutilizado;
- refresh token cifrado y renovación fallida;
- webhook con firma inválida, duplicado y payload parcial;
- aprobación rechazada, reintento con la misma idempotency key y timeout de proveedor;
- límite de plan alcanzado y workspace secundario sin concesión;
- cuatro recorridos E2E documentados en `docs/plataforma/05-evolucion-orquestada-y-centro-de-accion.md`.

## 6. Criterio de salida

La aplicación no está lista para producción comercial hasta que staging tenga credenciales válidas, migraciones aplicadas, workers activos, pruebas E2E con resultado reproducible y atribución de ingresos comprobada. El código puede estar compilado y aun así no cumplir este criterio operativo.

