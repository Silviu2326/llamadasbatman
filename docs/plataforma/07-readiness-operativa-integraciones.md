# Readiness operativa de integraciones

Este documento describe la ronda de endurecimiento de Meta Ads, Google Search
Console/Organic, Metricool, Mautic/email y Twilio. No contiene secretos
ni declara una integración conectada por el mero hecho de tener variables de
entorno.

## Estados y endpoints

El backend conserva `/health` como liveness mínimo y añade:

- `GET /health/ready`: comprueba la base de datos y la configuración de runtime.
  Devuelve `200` solo con `status: "ready"`; ante fallo devuelve `503`.
- `GET /health/integrations`: devuelve el estado de configuración de cada
  proveedor sin valores sensibles.
- `GET /health/integrations?probe=true`: además hace probes acotados por timeout
  para Meta, Mautic, Metricool y Twilio. Google OAuth no se marca como
  operativo sin un token de una organización, por lo que el probe de Google
  solo valida la configuración del cliente.

Los estados significan:

| Estado | Significado |
|---|---|
| `not_configured` | No hay ninguna variable del proveedor; es una integración opcional pendiente. |
| `configured` | El conjunto de variables está completo y su URL es válida; todavía no prueba una conexión de una organización. |
| `healthy` | El probe externo respondió correctamente. |
| `degraded` | Faltan variables, hay una URL inválida o el proveedor no respondió. |

## OAuth Google y Meta

- Los callbacks deben coincidir exactamente con las URLs registradas en el
  proveedor.
- Meta usa `META_OAUTH_REDIRECT_URI` o `PUBLIC_HOST` y exige HTTPS en
  producción.
- Google usa una callback por proveedor:
  `/api/organic/integrations/{provider}/oauth/callback`.
- El state se almacena únicamente hasheado, expira a los diez minutos y se
  consume atómicamente una vez. También se consume si Google/Meta devuelve un
  error OAuth, evitando replay del mismo state.
- PKCE se exige en ambos flujos; los verifiers y refresh tokens se cifran con
  claves separadas de JWT, OAuth state y Meta.
- Un refresh de Google usa single-flight por organización/proveedor para no
  competir cuando varias peticiones llegan justo al expirar el access token.
- Un fallo de refresh deja la integración en `needs_reauth`; no se presenta
  como conectada.

## Webhooks

### Meta Lead Ads

- `GET /api/meta/webhooks/leadgen` valida `hub.verify_token` y solo devuelve el
  challenge ante coincidencia exacta.
- `POST /api/meta/webhooks/leadgen` exige `X-Hub-Signature-256` con HMAC-SHA256
  sobre el body crudo.
- Los lead IDs externos se usan como fence de idempotencia por organización.
- Si falla una consulta temporal a Graph o la persistencia, responde `503` para
  que Meta reintente; los eventos desconocidos de otra página se ignoran de
  forma explícita.

### Mautic

- Se acepta `X-Mautic-Webhook-Secret` o `Authorization: Bearer` comparado en
  tiempo constante.
- El secreto por query-string solo funciona en desarrollo con
  `MAUTIC_WEBHOOK_ALLOW_QUERY_SECRET=true`; en producción está bloqueado.
- Los eventos de email se deduplican por proveedor + ID externo y los rebotes/
  bajas se convierten en eventos de cumplimiento.

### Twilio

- Voz y WhatsApp validan `X-Twilio-Signature` contra la URL pública exacta y los
  parámetros form-urlencoded.
- En producción no se deriva la URL firmada de `Host` o `X-Forwarded-*`: se
  exige `TWILIO_WEBHOOK_BASE_URL` o `PUBLIC_HOST` HTTPS.
- Media Streams no confía en parámetros enviados por el socket: usa una
  capability de corta duración y comprueba la organización y recursos antes de
  iniciar la sesión.
- Mensajes WhatsApp y callbacks de estado tienen fences de webhook para
  tolerar reintentos.

## Variables mínimas

Usar `backend/.env.example` como checklist. En producción son especialmente
críticas:

- `JWT_SECRET`, `OAUTH_STATE_SECRET`, `CORS_ORIGINS` y URLs públicas HTTPS.
- Meta: `META_APP_ID`, `META_APP_SECRET`,
  `META_TOKEN_ENCRYPTION_KEY`, `META_WEBHOOK_VERIFY_TOKEN` y callback.
- Google: client ID/secret, `GOOGLE_OAUTH_REDIRECT_BASE_URL` y
  `ORGANIC_TOKEN_ENCRYPTION_KEY`.
- Mautic: base URL, client credentials y `MAUTIC_WEBHOOK_SECRET`.
- Metricool: base URL y sus credenciales completas.
- Twilio: account SID, auth token, número emisor y `TWILIO_WEBHOOK_BASE_URL`.

El proceso debe fallar por configuración crítica incompleta en despliegues de
producción; una integración opcional completamente ausente no impide arrancar,
pero aparece como `not_configured`.

## Comprobaciones de despliegue

1. Ejecutar `npm run build` dentro de `backend`.
2. Levantar API y worker por separado; confirmar que Redis está disponible para
   los jobs que lo requieran.
3. Consultar `/health/ready`.
4. Consultar `/health/integrations?probe=true` desde una red de operación y
   revisar que ningún proveedor aparezca como `degraded`.
5. Probar callbacks en staging con eventos reales de prueba y verificar el
   `x-correlation-id` y la ausencia de duplicados.
6. Registrar en Meta, Google y Twilio exactamente las URLs de callback del
   entorno. Nunca reutilizar callbacks de localhost en producción.

## Bloqueos externos

El código no puede verificar sin credenciales reales ni acceso a los paneles de
proveedor:

- aprobación y scopes de la app Meta;
- OAuth consent screen y propiedades de Google;
- token/`blogId` válidos de Metricool y contrato de la API habilitado;
- versión y endpoints reales de la instancia Mautic;
- cuenta, números, firma y URLs públicas de Twilio;
- DNS, TLS, reverse proxy, Redis y base de datos de staging/producción.

Hasta que esos valores existan, la aplicación debe mostrar `not_configured` o
`degraded`, nunca `connected`.
