# VozIA vs. Vendrava — comparativa

*Hecha el 2026-07-05. Un lado de esta comparación (Vendrava) sale de leer su web pública (https://vendrava.com/es/) — no su código, porque no lo tenemos. El otro lado (VozIA) sale de leer el código real del repo. Es importante no mezclar los dos niveles: lo de Vendrava es "lo que dicen que hacen", lo nuestro es "lo que confirmé que funciona".*

---

## Qué es Vendrava, en una frase

Un CRM con IA que se posiciona como "contesta, llama y agenda tus leads": une WhatsApp, formularios web, llamadas entrantes y email en un solo pipeline, y una IA de voz que atiende, cualifica y deja resumen de cada interacción para que el comercial arranque el día con la próxima acción ya decidida.

Su diferencia principal de mensaje: no van a buscar al cliente, están pensados para reaccionar rápido a lo que ya está entrando por cualquier canal.

---

## Lo que tiene Vendrava que nosotros no

| Punto | Qué dicen que hacen | Cómo estamos nosotros |
|---|---|---|
| **WhatsApp** | Canal de entrada unificado junto con formularios, llamadas y email | No existe ningún canal de WhatsApp en el producto |
| **Llamadas entrantes** | Su IA "atiende" cuando el prospecto llama al negocio | Nuestro motor de voz es para llamar nosotros (outbound); no hay un flujo para recibir una llamada entrante de un prospecto marcando al negocio |
| **Próxima acción recomendada** | Cada interacción queda con objeción, intención y "próxima acción" sugerida | Guardamos transcript, sentimiento y resultado por llamada, pero no una recomendación explícita de qué hacer después |
| **Constructor de flujos multicanal** | Automatizaciones que combinan canal de origen, urgencia e intención detectada | Nuestras automatizaciones son más simples: un evento dispara una lista de acciones fija |
| **Aprobación humana en el loop** | Mensaje explícito de "la IA propone, tu equipo aprueba, edita o toma la llamada" | No tenemos cola de aprobación — nuestras automatizaciones ejecutan solas, sin paso intermedio |
| **Cumplimiento configurable por mercado** | Consentimiento, horarios y exclusiones configurables según el país | Tenemos horario legal y lista de no-llamar, pero pensado para España/México, no como configuración multi-mercado |
| **Paquetes por sector como producto** | Clínicas, concesionarios, inmobiliarias, call centers, peluquerías caninas — mensaje de "ya viene entrenado para tu rubro" | Tenemos playbooks por vertical, pero no empaquetados ni comunicados como producto sectorizado |

**Dato curioso, no una ventaja ni desventaja real**: su arquitectura de "Fast Executor + Guru Supervisor" (respuesta rápida en tiempo real + un segundo cerebro que analiza en background y ajusta estrategia) es exactamente el mismo patrón que ya tenemos construido en nuestro pipeline de voz (el módulo `Guru` que revisa la conversación cada pocos turnos y le da un brief nuevo al agente). Ellos lo usan como argumento de venta explícito; nosotros lo tenemos funcionando pero no lo mencionamos en ningún material de cara al cliente.

---

## Lo que tenemos nosotros que Vendrava no (según su web)

| Punto | Qué hacemos nosotros | Qué dice su web |
|---|---|---|
| **Generación y publicación de anuncios en Meta** | Con 3 preguntas armamos oferta, copy, imagen, landing page y publicamos la campaña real en Facebook/Instagram vía API | Meta Ads y Google Ads aparecen solo como fuentes de las que *reciben* leads, nunca como algo que ellos ayuden a crear o publicar |
| **Prospect Finder (búsqueda de negocios por zona)** | Buscamos negocios reales por sector y ciudad y los traemos con un puntaje de oportunidad | No hay ninguna mención de salir a buscar prospectos nuevos — dependen de que el lead llegue por un canal existente |
| **Auditoría digital automática** | Analizamos la web de un negocio (SEO, HTTPS, redes, reservas online) y generamos un puntaje y un pitch de venta ya redactado | No aparece nada parecido |
| **Landing page generada sola** | Cada campaña de Meta Ads tiene su propia página de aterrizaje, generada automáticamente | No mencionan generación de landings |

---

## Lectura rápida para B2B y B2C

- **B2B** (nuestro Prospect Finder): Vendrava no tiene forma de salir a buscar negocios nuevos — nosotros sí. Esa es nuestra ventaja más clara de este lado.
- **B2C** (nuestro Meta Ads): Vendrava no crea ni publica anuncios, solo los recibe como fuente — nosotros armamos la campaña entera. Otra ventaja clara.
- **Punto débil frente a ellos**: no tenemos WhatsApp ni atención de llamadas entrantes. Si un cliente ya usa algo como Vendrava o evalúa ambas plataformas, esto es probablemente lo primero que va a preguntar y lo primero que nos falta responder.

En resumen: no competimos en el mismo punto de entrada. Ellos son fuertes reaccionando rápido a lo que ya te está llegando por cualquier canal; nosotros somos fuertes generando de dónde te llega (prospección propia y anuncios propios) y en la llamada saliente automática.
