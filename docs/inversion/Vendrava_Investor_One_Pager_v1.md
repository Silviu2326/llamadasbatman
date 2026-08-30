# Vendrava

## Investor One Pager

### Sistema operativo de revenue conversacional para el mercado hispanohablante

**Every lead moves forward.**

| Control del documento | Detalle |
|---|---|
| Clasificación | Confidencial - conversación inicial con inversores |
| Versión | v1.0 |
| Fecha | 5 de agosto de 2026 |
| Etapa declarada | Prototipo funcional avanzado; validación de producción y tracción comercial pendientes |
| Uso recomendado | Enviar después de una introducción personal; no sustituye una due diligence ni un modelo financiero aprobado |

> **Regla de honestidad:** el repositorio no aporta evidencia verificable de clientes de pago, ARR, retención o cohortes. Hasta incorporar esa evidencia, Vendrava debe presentarse como una compañía *pre-revenue* con producto avanzado, no como un SaaS ya validado.

## Vendrava en una frase

Vendrava es un **AI Sales CRM que convierte cada señal comercial en una acción**: capta leads, conversa por voz y WhatsApp, califica, agenda, hace seguimiento y mueve el pipeline desde una sola plataforma, con contexto compartido y control humano.

## La tesis de inversión

Los CRM tradicionales registran lo que el equipo hizo. Las herramientas de voz ejecutan llamadas. Las plataformas de marketing generan demanda. Vendrava une esas tres capas para que **captación, conversación y avance comercial funcionen como un único sistema operativo**.

| Bloque | Lectura inversora |
|---|---|
| Problema | Los leads llegan por canales distintos, se responden tarde y pierden contexto al pasar de marketing a ventas. El CRM termina siendo un archivo, no un motor de ejecución. |
| Solución | Un sistema que recibe o encuentra el lead, decide el siguiente paso, ejecuta voz/WhatsApp/email, registra el resultado y devuelve ese aprendizaje al pipeline. |
| Entrada al mercado | Equipos de servicios con citas o ventas de ticket alto: clínicas, inmobiliarias, concesionarios, agencias, educación y servicios profesionales. |
| Producto inicial vendible | CRM de leads y pipeline + agentes de voz entrante/saliente + seguimiento multicanal + agenda + automatizaciones, empaquetados por vertical. |
| Expansión | Growth Marketing Hub, generación de demanda, Prospect Finder, Ads, landings, inteligencia comercial, multi-sede y white-label. |
| Modelo | SaaS por cuenta, no por asiento, con minutos de voz incluidos y excedente por uso. Precios públicos orientativos desde 99, 299 y 599 euros/mes, más Enterprise. |
| Foso potencial | Corpus propietario de conversación + resultado en español, playbooks por vertical, integraciones operativas, memoria acumulada, gobernanza y coste de cambio. |
| Visión | Ser la capa de ejecución que conecta la primera señal comercial con ingresos: **from first signal to revenue**. |

## Por qué ahora

- En 2025, el 20% de las empresas de la UE con al menos 10 empleados ya utilizaba tecnologías de IA, frente al 13,5% en 2024: la adopción empresarial está acelerando, pero la ejecución comercial sigue fragmentada ([Eurostat](https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20251211-2)).
- España contaba con 3.310.824 empresas activas a 1 de enero de 2025. En los sectores iniciales de Vendrava había **417.087 empresas con tres o más empleados**, calculadas a partir de las tablas oficiales de comercio, hostelería, inmobiliario, servicios profesionales, servicios auxiliares, educación/sanidad, ocio y otros servicios ([INE, DIRCE 2025](https://ine.es/dyngs/Prensa/DIRCE2025.pdf)).
- El artículo 50 del Reglamento de IA de la UE aplica sus reglas de transparencia desde el 2 de agosto de 2026. La identificación de la IA, la trazabilidad y el control humano dejan de ser detalles técnicos y se convierten en criterios de compra ([Comisión Europea](https://digital-strategy.ec.europa.eu/en/factpages/quick-facts-transparency-rules-ai-systems)).
- Salesforce, HubSpot y HighLevel ya están llevando agentes al CRM; Vapi, Retell y ElevenLabs están haciendo accesible la infraestructura de voz. La categoría está validada. La oportunidad de Vendrava es resolverla con **profundidad operativa para pymes y equipos hispanohablantes**, no competir como API genérica.

## Evidencia de producto

La plataforma revisada contiene una superficie full-stack amplia: CRM de leads, pipeline, campañas, llamadas, reuniones, agentes, playbooks, conocimiento, automatizaciones, email, Ads, landings, funnels, prospección B2B, Growth Hub, orquestador, inteligencia comercial, gobierno y control de accesos.

La base técnica combina React/Vite, Fastify/TypeScript, Prisma/PostgreSQL, Redis/BullMQ e integraciones con proveedores como Twilio, Meta, Mautic, Metricool y Google. El sistema incluye patrones de outbox, workers, permisos multi-tenant, consentimiento y guardas para acciones externas.

**Estado real:** varias capacidades están implementadas en código, pero las credenciales, migraciones y pruebas E2E de staging no están cerradas. Voz/Twilio e integraciones externas siguen requiriendo validación real. Antes de usuarios de pago deben cerrarse los hallazgos críticos y altos de seguridad e integridad ya identificados en auditoría.

## Go-to-market recomendado

1. **Tres a cinco design partners** en Valencia/Madrid, comenzando por clínicas y concesionarios/inmobiliarias, donde una cita tiene valor económico claro.
2. **Founder-led sales** con implantación asistida y un flujo estrecho: lead entrante -> contacto -> calificación -> cita -> resultado.
3. **Canal agencias/consultoras** apoyado en la experiencia y distribución de SprintMarkt, con opción multi-sede y white-label.
4. **Expansión por evidencia:** no abrir un nuevo vertical hasta demostrar activación, retención a 90 días, margen y mejora de conversión en el anterior.

## Métricas que convierten la tesis en inversión

| Dimensión | Gate recomendado |
|---|---|
| Fiabilidad | Más del 99% de leads ingeridos sin pérdida y contacto p95 inferior a 60 segundos cuando el canal y la base legal lo permitan |
| Producto | Al menos 85% de retención de logos a 90 días y cinco cuentas usando el flujo completo en producción |
| Valor | Mejora demostrable frente al proceso previo en tiempo de respuesta, tasa de contacto y citas calificadas |
| Economía | Margen bruto superior al 70%, COGS de voz controlado y recuperación de CAC inferior a nueve meses |
| Foso | Conversaciones etiquetadas con resultado real y una mejora de playbook medida mediante experimento |

## Ask propuesto

**Ronda pre-seed de referencia: 600.000 euros para 18 meses**, condicionada a aprobar presupuesto, cap table y plan de contratación. Objetivo: cerrar producción, conseguir 5-10 design partners, convertir los primeros clientes de pago y demostrar un primer bucle de aprendizaje por vertical.

Además del capital, se buscan:

- introducciones a operadores e inversores B2B SaaS, CRM, voice AI y future of work;
- acceso a clínicas, concesionarios, inmobiliarias y agencias que puedan actuar como design partners;
- criterio experto sobre distribución, pricing y expansión España -> Europa/LATAM.

## Pitch de 20 segundos

> Los CRM guardan lo que pasó y las herramientas de voz solo llaman. Vendrava conecta la primera señal comercial con la siguiente acción: capta el lead, conversa por voz o WhatsApp, califica, agenda y mueve el pipeline desde una sola plataforma. Empezamos con equipos de servicios y ticket alto en español; el activo a largo plazo es el sistema que aprende qué conversación y qué acción generan resultado en cada vertical.

## Antes de enviarlo

- Sustituir la ronda de referencia por el importe y condiciones aprobados.
- Añadir nombres, dedicación y experiencia del equipo fundador.
- Incorporar métricas reales de pilotos; si no existen, mantener explícitamente la etapa *pre-revenue*.
- Confirmar que los hallazgos críticos de auditoría están cerrados antes de afirmar “listo para producción”.

### Base documental interna

[Auditoría de plataforma](../plataforma/00-indice-auditoria-plataforma.md) · [Inventario funcional](../PLATAFORMA_ACTUAL_PAGINAS_Y_FUNCIONALIDADES.md) · [Matriz de producción](../PRODUCTION_READINESS_MATRIX.md) · [Evaluación técnica](../EVALUACION_TECNICA_SOFTWARE.md) · [Auditoría externa](../../AUDITORIA_EXTERNA_2026-08-01.md) · [Pricing público](../../vendrava-public/content/locales/es/pricing.ts)
