# Centro de email de Vendrava

El email marketing se gestiona dentro de Vendrava. Resend es el servicio de entrega; los contactos, consentimientos, borradores, campañas, secuencias y actividad operativa se guardan en la organización de Vendrava.

## Qué permite hacer

- Preparar y guardar newsletters y borradores compartidos por la organización.
- Crear campañas con asunto y contenido congelados al programarlas, seleccionar audiencia con consentimiento válido y consultar el resultado de entrega.
- Crear secuencias comerciales con pasos de email, pausas y detención cuando el contacto responde o se da de baja.
- Enviar un email individual desde la ficha de un lead o una conversación, sujeto a permisos y consentimiento.
- Recibir respuestas en la bandeja del CRM mediante webhooks firmados de Resend. Los eventos repetidos se procesan una sola vez.
- Registrar enviados, entregados, abiertos, clicados, rebotados, suprimidos y bajas cuando Resend los notifica.

No conecta directamente una bandeja arbitraria de Gmail, Outlook o IMAP. La recepción se configura mediante el dominio, MX y webhook de Resend. Los adjuntos entrantes se registran como metadatos; el contenido binario todavía no se descarga.

## Requisitos para activarlo en un entorno

1. Aplicar las migraciones locales de borradores y retirada de Mautic (`20260923170000_email_newsletter_drafts` y `20260923180000_remove_mautic_native_email`) mediante el proceso habitual del entorno. Luego generar el cliente Prisma actualizado. No se han aplicado en producción.
2. Desplegar el backend con las rutas de borradores, campañas nativas y `webhooks/email/resend`, junto con el worker de campañas.
3. Configurar `INTEGRATION_CREDENTIALS_ENCRYPTION_KEYS` para cifrar las credenciales por organización. El origen público debe usar HTTPS.
4. En Conexiones, guardar Resend para cada organización con su API key y un `fromEmail` de dominio verificado. Para recepción, añadir el secreto de firma del webhook.
5. Verificar el dominio en Resend y publicar los registros DNS que indique el proveedor para envío (SPF y DKIM; DMARC según la política del dominio). Para recibir, configurar también los registros MX requeridos.
6. Crear webhooks de Resend para `email.received`, los eventos de envío y los eventos de contactos/supresión. Vendrava muestra el endpoint por organización; la firma se verifica con el secreto cifrado de esa misma organización.
7. Probar con direcciones propias: entrega, respuesta entrante, detención de secuencia, rebote y baja. Confirmar remitente, reply-to y DNS antes de aumentar el volumen.

Las credenciales, dominios y webhooks reales son configuración externa pendiente por organización. No se ha enviado una campaña real como parte de estos cambios.

## Webhook de Resend

Vendrava expone `POST /api/webhooks/email/resend/:orgId`. El endpoint se obtiene con una sesión autenticada desde el Centro de conexiones. La firma se valida con el secreto cifrado por organización; los eventos repetidos se procesan de forma idempotente. La recepción recupera el contenido del mensaje con la API key de esa misma organización.

Más detalles: [Recepción de email con Resend](EMAIL_RECEPCION_RESEND.md).
