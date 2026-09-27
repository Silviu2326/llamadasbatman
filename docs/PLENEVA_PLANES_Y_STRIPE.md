# Planes de Pleneva y puesta en marcha de Stripe

Estado: catálogo preparado en código; **el cobro público todavía no está activo**. No se debe activar el CTA de pago hasta completar los pasos de producción al final.

## Qué vendemos

Precios propuestos en EUR por organización y mes, sin IVA. El gasto en anuncios y las tarifas de servicios externos contratados directamente por el cliente se pagan aparte. Los límites se aplican en el servidor; llegar al techo de minutos o envíos detiene más consumo y no genera cargos automáticos.

| Plan público | Clave interna | Precio mensual | Qué incluye | Límites principales |
| --- | --- | ---: | --- | --- |
| Gratis | `free` | 0 € | CRM, campañas de anuncios y 1 agente de voz | 3 usuarios, 500 leads, 3 campañas, 1 agente, 5 automatizaciones, 60 min de llamada y 500 emails/mes |
| Arranque | `pro` | 99 € | CRM, agenda, captación, agentes, automatizaciones, integraciones, prospección, orgánico/social, analítica y microapps | 10 usuarios, 10.000 leads, 25 campañas, 5 agentes, 50 automatizaciones, 500 min y 5.000 emails operativos/mes |
| Crecimiento | `completo` | 299 € | Todo Arranque, más email marketing, newsletters, secuencias y gestión de equipo | 50 usuarios, 100.000 leads, 250 campañas, 25 agentes, 250 automatizaciones, 2.000 min y 25.000 emails/mes |
| Agencias | `agency` | A medida | Todo Crecimiento, marca blanca y multiespacio | Hasta 100 espacios; precio, minutos y envíos deben figurar en el contrato. Los límites técnicos base son 50.000 min y 500.000 emails/mes. |

Las cuotas de emails abarcan los envíos que se registran en `EmailDelivery`; Arranque no habilita la pantalla de email marketing. La funcionalidad de agentes no garantiza un número de teléfono propio ni un volumen de llamadas mayor que la cuota. El cliente debe tener una ruta de telefonía y los proveedores necesarios configurados. Los pagos de recarga de cartera son separados de la suscripción.

El coste estimado interno actual es 6 céntimos/minuto de voz y 0,09 céntimos/email aceptado, antes de otros costes. A cuota completa: Arranque ~34,50 € de coste variable estimado; Crecimiento ~142,50 €. Son supuestos de margen, no precios al cliente ni un compromiso de coste final. Stripe publica para España 1,5 % + 0,25 € por pago con tarjeta estándar del EEE y 0,7 % del volumen de Billing en pago por consumo (consulta: 27-09-2026; https://stripe.com/es/pricing). Sobre 99 € esto supone ~2,43 € y sobre 299 € ~6,83 € antes de impuestos y otros costes. El margen restante estimado a cuota completa sería ~62,07 € y ~149,67 €, respectivamente; no incluye infraestructura, soporte, marketing, devoluciones ni variaciones de proveedor.

## Clientes anteriores

La migración marca las organizaciones existentes como `legacy`. Conservan sus cuotas anteriores: pro 2.000 min/20.000 emails y completo 10.000 min/100.000 emails al mes. Los registros nuevos y las suscripciones nuevas o modificadas a través de Stripe usan `2026-09`. No cambiar una cuenta antigua de forma masiva sin revisar su contrato.

## Configurar Stripe

1. Crear o acceder a la cuenta Stripe de Pleneva. Configurar los datos fiscales, el método de cobro y las reglas de impuestos de la cuenta. Los importes de catálogo son sin IVA; decidir y probar Stripe Tax o la configuración fiscal aplicable antes de cobrar.
2. En `backend`, ejecutar `npm run stripe:prices` para ver el catálogo sin crear nada. Con una clave de **test**, ejecutar `npm run stripe:prices -- --apply --mode=test`; anotar `STRIPE_PRICE_PRO` y `STRIPE_PRICE_COMPLETO`. Repetir con `--mode=live` y clave live solo tras aprobar precios e impuestos. El script usa lookup keys idempotentes y no crea el precio de Agencias.
3. Configurar en el backend `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_COMPLETO` y `STRIPE_WEBHOOK_SECRET`. El webhook firmado debe apuntar a `POST /api/billing/webhook` y recibir `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.created` y `checkout.session.completed` y `checkout.session.async_payment_succeeded`.
4. Activar Customer Portal para que el propietario pueda cancelar o cambiar la suscripción. Configurar sus precios admitidos en el portal y revisar cómo se prorratean los cambios de plan. El backend toma el plan del Price realmente facturado, nunca de los metadatos del navegador.
5. Ejecutar la migración de Prisma y desplegar backend y panel. El backend de producción debe responder antes de activar el registro pago. Probar en test: registro, Checkout, pago correcto, webhook, acceso al plan, cambio de plan, impago, cancelación y reintento de webhook; verificar el saldo de cartera por separado.
6. Configurar `NEXT_PUBLIC_PAID_CHECKOUT_ENABLED=true` en la landing únicamente cuando backend, dominio `app.pleneva.com`, cookie compartida entre subdominios y pruebas de Stripe estén correctos. Desplegar la landing tras cambiar esta variable.

Actualmente faltan claves de Stripe y Price IDs en el entorno local. El destino público del backend que usa el panel devolvía `Application not found` en la comprobación previa. Por tanto, los botones públicos de pago permanecen dirigidos a una consulta/demo, sin prometer un Checkout funcional.

## Trazabilidad en código

- Catálogo visual: `pleneva-landing/app/page.tsx` y `src/pages/configuracion/PlanBillingPage.jsx`.
- Capacidades y límites de entidades: `backend/src/access-control/entitlements.ts`.
- Cuotas mensuales y términos anteriores: `backend/src/access-control/consumption.ts`.
- Sesiones y webhooks de Stripe: `backend/src/services/billing.service.ts` y `backend/src/routes/billing.ts`.
- Productos y Prices: `backend/scripts/setup-stripe-prices.mjs`.
