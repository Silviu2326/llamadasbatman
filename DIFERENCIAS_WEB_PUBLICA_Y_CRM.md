# Auditoría de diferencias: web pública Vendrava vs. CRM

Fecha de revisión: 13 de julio de 2026
Repositorios revisados:

- `vendrava-public/`: web pública en Next.js 15, exportada como sitio estático, bilingüe (ES/EN).
- raíz del repositorio: CRM React y API Fastify/Prisma.

Este documento describe el estado que se puede verificar en el código. Que una integración exista en el código no garantiza que esté operativa en producción: Meta, Twilio, Mautic y Postiz también requieren credenciales, webhooks y configuración de cada organización.

## Resumen ejecutivo

Hay dos desajustes de prioridad máxima:

1. Los formularios de demo, contacto y newsletter de la web pública **no llegan al CRM**. `LeadCaptureForm` simula el éxito con un temporizador; no crea lead, conversación, consentimiento ni atribución.
2. La web comercializa un módulo completo de **propuestas comerciales** que el CRM todavía no tiene: no hay modelo `Proposal`, endpoints ni interfaz para generar, enviar, aprobar, versionar o registrar aperturas.

El CRM también contiene capacidades potentes que hoy se comunican poco en la web: creación de campañas Meta con IA, generación de creatividades, redes sociales con Postiz, auditoría digital de prospectos, atribución de captación, playbooks y base de conocimiento para agentes.

La idea de producto que mejor une ambos proyectos es: **generar demanda → responder en todos los canales → convertir y aprender**. La web ya explica bien el segundo tramo; debería hacer visible que Vendrava también genera la demanda y mide su recorrido hasta ventas.

## Leyenda

| Estado | Significado |
| --- | --- |
| Implementado | Hay interfaz y/o API que cubre el caso principal. |
| Parcial | Existe una base funcional, pero no todo el alcance prometido. |
| No encontrado | No se ha localizado modelo, endpoint ni flujo de producto que lo soporte. |
| Marketing | Es una capacidad de la web pública, no un módulo que deba existir dentro del CRM. |

## Lo que promete la web y falta o está incompleto en el CRM

| Área pública | Estado en CRM | Diferencia comprobada | Prioridad |
| --- | --- | --- | --- |
| Formularios de demo, contacto y newsletter | No encontrado | La web muestra confirmación local tras 500 ms. No hay `fetch`, API ni sincronización con Leads, Inbox, consentimiento o UTMs del CRM. | P0 |
| Propuestas comerciales | No encontrado | La página promete crear desde el CRM, enviar, saber si se abrieron, recordar, aprobar internamente, versionar y alimentar analítica. El CRM solo tiene la etapa `proposal` de oportunidad y adjuntos genéricos. | P0 |
| Llamadas entrantes con IA | Parcial | La voz real está orientada a llamadas salientes: el webhook recibe los IDs de organización, campaña, agente y lead preparados al iniciar una llamada. No hay enrutado genérico de una persona que llama a un número de Vendrava. | P1 |
| Constructor visual de automatizaciones | Parcial | El backend ejecuta disparadores y acciones reales, con outbox e idempotencia, pero la interfaz actual crea flujos sencillos. No hay constructor visual de condiciones, ramificaciones, esperas y objetivos como el descrito en la web. | P1 |
| Asignación automática de leads | Parcial | La web promete reglas por territorio, producto, idioma y carga. Hay asignación y takeover en conversaciones, pero no un motor de reparto configurable con esos criterios. | P1 |
| Lead scoring explicable | Parcial | Hay predicción/insights y auditoría digital, pero no se ha localizado un score único, persistente y configurable con reglas visibles para todos los leads. | P1 |
| Analítica comercial avanzada | Parcial | Existen dashboard, pipeline, funnels y vistas de anuncios. Faltan evidencias de informes configurables completos, ciclo de venta por representante/equipo, análisis de propuestas y exportación generalizada tal como se vende. | P1 |
| Landing builder y formularios externos | Parcial | Se crean landings públicas y se registran visitas, leads y atribución. La conexión de webs externas sigue siendo manual/local y no hay un constructor completo con dominios, formularios embebibles y publicación gestionada de extremo a extremo. | P1 |
| Gestión integral de WhatsApp Business | Parcial | Inbox, mensajes, plantillas, ventana de 24 h, consentimiento y respuestas IA están implementados. Falta una gestión visible de múltiples números/equipos, plantillas y reglas de enrutado administrativas. | P2 |
| Cumplimiento y operación internacional administrables | Parcial | Hay normalización telefónica, opt-out, consentimiento y validación de firma de Twilio. No se ha localizado un centro de políticas por país, retención, auditoría y reglas de contacto configurable desde el producto. | P2 |
| Facturación/planes de voz | No encontrado | La web publica planes y consumo de voz por minuto. El CRM tiene flags de plan, pero no se ha localizado suscripción, cobro, créditos consumibles, checkout ni facturación. | P2 |

### Matices importantes

- El CRM sí dispone de un endpoint real para landings propias: `POST /api/public/landing/:slug/lead`. Registra atribución y consentimiento, crea el lead y puede orquestar seguimiento. El problema es que la web pública Next.js no lo usa.
- El CRM sí dispone de automatizaciones para eventos como lead creado, lead inactivo, mensaje recibido, llamada completada o propuesta estancada. La diferencia es la amplitud del editor y de las reglas, no la inexistencia total de automatización.
- La funcionalidad de voz incluye transcripción, resumen, sentimiento, grabación, transferencia y controles de cumplimiento para llamadas salientes. No debe comunicarse como centralita de llamadas entrantes hasta construir el enrutado correspondiente.

## Lo que existe en el CRM y la web pública no está vendiendo con suficiente claridad

| Capacidad del software | Evidencia en CRM | Tratamiento actual en la web | Oportunidad de comunicación |
| --- | --- | --- | --- |
| Generación de campañas Meta con IA | Wizard de Ads, playbooks por vertical, estrategia, creatividades y publicación/snapshots de Meta. | Se menciona marketing y captación, pero no se posiciona con fuerza como creación operativa de demanda. | Página/hero: de brief a campaña, creativo, landing y seguimiento de resultados. |
| Redes sociales con IA y Postiz | Conexión de workspace, calendario/publicación, borradores IA, UTMs y métricas. | No hay un producto público dedicado a redes sociales. | Añadir módulo de social selling y contenidos conectados a campañas. |
| Auditoría digital de prospectos | Auditoría SEO/presencia/madurez, oportunidades y pitch comercial dentro de la ficha de lead. | Prospect Finder menciona auditoría opcional, pero no tiene una propuesta de valor propia y visible. | Vender “encuentra, audita y prioriza” antes de contactar. |
| Atribución de captación y funnels | Eventos de adquisición, campañas, visitas, leads, contacto y reuniones; landings públicas. | La web habla de CRM de crecimiento, pero el circuito de atribución hasta venta queda difuso. | Mostrar un diagrama real de origen → conversación → reunión → pipeline. |
| Inbox omnicanal con IA | Conversaciones, mensajes, estados de entrega, consentimiento, takeover humano y respuesta IA. | WhatsApp está bien cubierto, pero la vista operativa omnicanal no tiene protagonismo. | Comunicar que el equipo trabaja desde una cola de conversaciones, no desde teléfonos aislados. |
| Base de conocimiento y playbooks | Knowledge Base, documentos y playbooks asignables a agentes; playbooks también para Ads. | La web habla de agentes entrenados por nicho, pero no explica cómo el cliente controla ese conocimiento. | Añadir “tu conocimiento, tus reglas y tus playbooks”, con control humano. |
| Operación comercial posterior a la captación | Leads, pipeline, reuniones, grabaciones, transcripciones, notas y siguientes acciones. | Varias capacidades aparecen repartidas en páginas de producto. | Un caso de uso completo demostraría la continuidad de la plataforma. |
| Integraciones concretas | Conectores de Meta, Twilio, Mautic y Postiz; webhooks de Meta/Mautic/WhatsApp. | La web describe canales, pero no destaca el mapa de integraciones. | Crear página de integraciones y aclarar qué aporta cada conector. |
| Compartición de resultados de campaña | API pública de campañas mediante token. | No se presenta como función comercial. | Ofrecer reporting compartible para dirección o clientes de agencia. |

## Capacidades exclusivas de la web pública

Estas diferencias son esperables: son necesarias para captar tráfico y explicar el producto, no para operar el CRM.

| Capacidad | Estado en CRM | Nota |
| --- | --- | --- |
| SEO técnico, sitemap, rutas bilingües y contenido ES/EN | Marketing | La web cuenta con muchas páginas de producto, sectores, comparativas, recursos y blog. |
| Páginas de precios, legal, seguridad, contacto y demo | Marketing | Deben enlazar a procesos operativos reales, especialmente sus formularios. |
| Contenido sectorial y comparativas | Marketing | Es una ventaja de adquisición que puede alimentarse de los playbooks reales del CRM. |
| Diseño de conversión, testimonios y recursos | Marketing | No requiere réplica en la aplicación; sí una conexión fiable de cada CTA al CRM. |

## Recomendación de implementación

### P0 — corregir la confianza comercial

1. Conectar todos los formularios de `vendrava-public` a un endpoint público del CRM.
   - Validar servidor y anti-spam.
   - Crear o deduplicar el lead por email/teléfono.
   - Guardar página, CTA, idioma, campaña, UTM, `gclid`/`fbclid`, mensaje y consentimiento.
   - Abrir conversación/tarea de seguimiento y disparar la automatización permitida por el consentimiento.
   - Mostrar éxito solo después de la respuesta real de la API.
2. Decidir la estrategia de Propuestas: construir el módulo real o retirar/suavizar esa página y todas sus afirmaciones hasta que exista.
3. Mantener una matriz de “claim público → capacidad verificable” como condición antes de publicar copy nuevo.

### P1 — completar el recorrido de conversión

1. Construir un módulo `Proposal`: plantilla, datos del lead/oportunidad, PDF o enlace, envío, apertura, versiones, aprobación y eventos para automatización/analítica.
2. Añadir entrada de voz real: asignación del número entrante a organización, identificación por teléfono, cola/agente, fallback humano y trazabilidad.
3. Evolucionar automatizaciones con condiciones, espera, ramificación, límites de frecuencia, tareas y reglas de reparto de leads.
4. Convertir Landings & webs en una integración real: formulario embebible/API, dominios, publicación y medición unificada.
5. Definir las métricas de ventas que se prometen y añadir sus modelos/vistas/exportaciones antes de mantener esas promesas públicas.

### P2 — elevar el posicionamiento de la web

1. Crear una narrativa y página de “Captación” que conecte Ads, redes sociales, Prospect Finder, auditoría, landings, funnels y CRM.
2. Añadir una página de integraciones (Meta, WhatsApp/Twilio, Mautic, Postiz) con prerequisitos y límites transparentes.
3. Hacer visible el método de entrenamiento de agentes: Knowledge Base, playbooks, aprobaciones humanas y auditoría.
4. Si se mantienen precios por uso, implementar y exponer el sistema de plan, consumo y facturación; si no, evitar dar a entender que ya se gestiona dentro del producto.

## Archivos de referencia

- Web: `vendrava-public/components/forms/LeadCaptureForm.tsx`
- Web: `vendrava-public/content/products.ts`
- Web: `vendrava-public/content/locales/es/pricing.ts`
- CRM: `src/components/Sidebar.jsx`
- CRM: `src/pages/PublicLandingPage.jsx`
- CRM: `src/pages/ConectarRedesPage.jsx`
- API: `backend/src/index.ts`
- API: `backend/src/controllers/landing.controller.ts`
- API: `backend/src/services/automations.service.ts`
- API: `backend/src/routes/voice.ts`
- API: `backend/src/services/digitalAudit.service.ts`
- Datos: `backend/prisma/schema.prisma`

## Criterio de cierre

La sección estará alineada cuando cada CTA de la web cree un dato rastreable en el CRM, cada promesa pública tenga un flujo verificable y las capacidades diferenciales de captación, IA y operación omnicanal sean visibles en el relato comercial.
