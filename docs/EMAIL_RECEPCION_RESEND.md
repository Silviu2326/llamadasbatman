# Recepción de email con Resend

Vendrava recibe mensajes mediante un webhook por organización. El endpoint público es `POST /api/webhooks/email/resend/:orgId`; la organización de la ruta selecciona la credencial BYOK, pero no se considera autenticación: cada petición debe validar la firma Svix (`svix-id`, `svix-timestamp`, `svix-signature`) con el secreto de ese webhook. Se rechazan firmas inválidas y marcas de tiempo con más de cinco minutos de diferencia; los eventos se registran de forma idempotente.

## Configuración en Vendrava

Guarda la integración Resend para la organización con `apiKey`, `fromEmail` y el campo opcional `webhookSigningSecret` (el valor `whsec_…` mostrado por Resend). El endpoint para esa organización se consulta con la sesión autenticada en `GET /api/integration-credentials/resend/inbound-webhook`. Configura `RESEND_WEBHOOK_BASE_URL` con el origen HTTPS público de la aplicación; `PUBLIC_HOST` se acepta como alternativa. En producción la ruta no se anuncia si la URL no es HTTPS. El campo de secreto se guarda cifrado como credencial de organización y nunca se devuelve en respuestas de lectura.

La escritura de credenciales reemplaza el objeto de secretos guardado, así que al actualizarlo hay que volver a incluir la API key y el remitente ya configurados junto con el signing secret. No se necesita ni se crea un secreto global compartido entre organizaciones.

## Configuración manual pendiente en Resend y DNS

1. Verifica en Resend un dominio receptor y publica los registros MX/DNS que indique Resend para ese dominio.
2. Crea un webhook de Resend para el evento `email.received`, usando el endpoint de Vendrava devuelto para la organización.
3. Copia el signing secret de ese webhook a la credencial Resend de la misma organización.
4. Asegúrate de que la API key BYOK tenga acceso de lectura a los emails entrantes (`emails.receiving.get`).

Resend notifica el evento con metadatos y un `email_id`; no incluye el cuerpo del mensaje en el webhook. Vendrava recupera `text`, `html`, cabeceras y datos de adjuntos con `GET /emails/receiving/{email_id}` usando la API key guardada por esa organización. Después guarda el mensaje entrante en la conversación del contacto cuyo email coincida exactamente (sin distinguir mayúsculas) dentro de la misma organización. Si no existe contacto, crea una conversación de email sin contacto vinculado. Si la respuesta corresponde a un contacto que participa en una secuencia comercial, detiene su secuencia.

El cuerpo de texto se usa cuando Resend lo devuelve; si no, se conserva el HTML. Se guardan metadatos de adjuntos, pero el contenido binario de estos no se descarga todavía. No se crea una conexión automáticamente ni se ha probado contra una cuenta real; es necesario completar manualmente el dominio, MX, webhook y secreto descritos arriba.
## Eventos de envío y cumplimiento

El mismo endpoint acepta eventos firmados para registrar actividad en `EmailEvent` y actualizar la entrega asociada en `EmailDelivery`:

- `email.sent` → aceptado; `email.delivered` → entregado.
- `email.opened` → apertura; `email.clicked` → clic y URL.
- `email.bounced` → rebote permanente; `email.complained` → queja de spam.
- `email.failed`, `email.delivery_delayed` y `email.suppressed` → fallo, demora o supresión.
- `contact.updated` con `unsubscribed: true` → baja; `suppression.added` → baja, rebote o queja según su origen.

Los eventos se deduplican por `svix-id`; se vinculan a `EmailDelivery` usando `data.email_id` y el destinatario cuando esté presente. Para la baja, que suele venir como actualización del contacto y no como respuesta a un envío individual, se busca el contacto por email dentro de la organización; se registra el evento de cumplimiento y se detiene su secuencia comercial. Solo queda vinculada a una entrega la actividad que incluye un `email_id` correlacionable. Los envíos individuales de Vendrava guardan el ID devuelto por Resend para permitir esa correlación.

Al crear el webhook en Resend, selecciona los eventos de email y contactos/supresión que se vayan a usar. Referencia oficial de [tipos de evento](https://resend.com/docs/webhooks/event-types) y [verificación de firmas](https://resend.com/docs/webhooks/verify-webhooks-requests).