# Automatizar Meta Ads desde SilxarCRM — análisis de cómo armarlo

Objetivo: que un cliente pague dentro de SilxarCRM y, sin tocar Ads Manager, el sistema cree la campaña, la publique, la optimice sola con el tiempo, y los leads que entren disparen una llamada de VozIA. Este documento analiza qué es automatizable de verdad, qué no, y cómo encajarlo con el backend actual (Fastify + Prisma + BullMQ + Redis).

## Principios de producto (lo que manda sobre el diseño técnico)

Tres cosas no negociables que definen dónde poner el esfuerzo de ingeniería:

1. **Tiempo hasta el contacto es la métrica que importa.** La mayoría de negocios tardan horas o días en llamar a un lead nuevo; si VozIA llama en menos de 30 segundos desde que el lead entra, esa velocidad por sí sola ya es la ventaja competitiva frente a cualquier negocio que llama al día siguiente. Esto convierte al "Call trigger" (sección de componentes) en el elemento más crítico de todo el sistema — más que cualquier sofisticación del motor de optimización de ads. Se implementa con una cola de alta prioridad en BullMQ dedicada a leads nuevos, sin batching ni delay artificial.
2. **Lanzar una campaña tiene que sentirse trivial para el cliente.** Muchos negocios chicos nunca hacen publicidad porque les parece complicado. La única interacción del cliente debería ser un wizard de 3 preguntas — *¿Qué tipo de negocio tenés?* / *¿Qué querés conseguir?* / *¿Presupuesto mensual?* — y un botón "Generar campaña". Todo lo demás (copies, imagen, landing, formulario, seguimiento, llamadas, métricas) lo resuelve SilxarCRM solo. Esas 3 respuestas son el único input real que alimenta los generadores de assets y el campaign builder descritos más abajo — nada de formularios largos de segmentación o creative.
3. **Se vende el resultado, no la herramienta.** El copy del producto (onboarding, landing de venta, emails) tiene que hablar en términos de "conseguí clientes mientras dormís" / "activá la captación y dejá que la plataforma encuentre y llame a tus clientes potenciales", no en términos de "tenemos IA, CRM y automatizaciones". Esto no cambia la arquitectura, pero sí importa para UI/copy del wizard y de los reportes que ve el cliente (mostrar "leads llamados" y "citas agendadas", no "CPL" ni "CTR" como métricas de portada).

## Visión de producto: no es un CRM ni una herramienta de anuncios

El error sería presentarlo como "CRM con IA" o "gestor de campañas". Se presenta como: **"Activá tu sistema de captación y dejá que consiga clientes por vos."** El dueño de un gimnasio o una peluquería no quiere aprender marketing ni mirar un dashboard de anuncios — quiere que le entren citas agendadas.

Flujo tal como se le explica al cliente (sin jerga técnica):

```
Cliente paga
   ↓
Responde 3 preguntas
   ↓
Silxar genera el anuncio
   ↓
Llegan leads
   ↓
VozIA llama automáticamente
   ↓
Se agenda la cita
   ↓
El negocio solo atiende clientes ya interesados
```

El detalle técnico de cada paso está en "Flujo end-to-end propuesto" más abajo — esta versión es la que vende el producto, no la que se implementa.

De acá se desprende algo importante para la arquitectura: **el verdadero producto no son los anuncios de Meta, es el motor de captación y seguimiento** (Lead → CRM → VozIA → Cita → Conversión). Meta Ads es hoy la primera fuente de leads, pero no puede ser la única pieza de la que depende todo el sistema — ver la sección de dependencia de Meta más abajo.

## Qué NO se puede saltar (limitaciones duras de Meta)

Antes de diseñar nada, esto marca el techo de "automático":

1. **Cada cliente necesita su propia cuenta publicitaria de Meta** (Ad Account + Business Manager), verificada. No se puede correr anuncios de N clientes distintos sobre una sola cuenta compartida sin violar los términos de Meta ni mezclar facturación.
2. **El método de pago del anuncio lo pone el dueño de la cuenta publicitaria**, no un tercero por API. Modelo elegido: **el cliente paga directo a Meta** — agrega su propia tarjeta en su cuenta de Meta (Business Manager); SilxarCRM solo gestiona la campaña con rol de administrador vía System User token. El pago dentro de SilxarCRM cubre la suscripción del servicio (uso de la plataforma, llamadas, generación de assets), no el gasto publicitario en sí.
3. **Meta revisa cada anuncio antes de publicarlo** (ad review). Tarda de minutos a ~24hs y puede rechazar por política (salud, finanzas, antes/después, texto en la imagen, claims exagerados). No es instantáneo ni 100% predecible.
4. **Advantage+ Shopping / Advantage+ App no se pueden crear ni editar por API** desde v25.0 (solo desde Ads Manager). El resto de tipos de campaña sí.
5. **Verificación de negocio e identidad** puede ser requerida por Meta (KYC), sobre todo en verticales sensibles (salud, finanzas, política). Eso es manual y fuera de tu control.
6. La generación de creative con IA (imagen/copy) igual pasa por el mismo ad review — no hay atajo por ser generado por API.

Conclusión: se puede automatizar **todo el ciclo operativo** (crear, publicar, medir, ajustar, pausar, re-optimizar, generar leads → llamada), pero **no** la aprobación de Meta ni la carga inicial del método de pago del cliente — esas dos siempre tienen un paso humano/de Meta en el medio.

## Flujo end-to-end propuesto

```
1. Cliente paga plan en SilxarCRM
       ↓
2. Onboarding Meta (una sola vez por cliente)
   - Cliente conecta su Business Manager / Ad Account (OAuth "Facebook Login for Business")
   - SilxarCRM pide rol de administrador sobre esa cuenta vía System User token
   - Cliente confirma método de pago en su propia cuenta de Meta (paso manual, 1 vez)
       ↓
3. Wizard de negocio (input del cliente, 3 preguntas)
   - ¿Qué tipo de negocio? / ¿Qué querés conseguir? / ¿Presupuesto mensual?
   - Ninguna otra pregunta: esto es todo lo que el cliente completa
       ↓
4. Generación de assets (automático, a partir del wizard)
   - ¿Hay playbook para ese rubro? → usar oferta/lead magnet/copy/landing/prompt de imagen ya preparados y probados
   - Si no hay playbook para ese rubro → generar todo con LLM/imagen como fallback (ver sección de playbooks)
       ↓
5. Generación de campaña (automático, a partir del wizard)
   - Objetivo y presupuesto ya salen de las respuestas del wizard (sin pantalla de segmentación manual)
   - Armar el Ad Creative con la imagen + copy generados (o el formulario nativo de Lead Ads)
   - Crear Campaign → Ad Set → Ad vía Marketing API
   - Estado inicial: PAUSED hasta pasar validaciones propias
       ↓
6. Publicación (automático, con espera de Meta)
   - Activar campaña (ACTIVE)
   - Poll o webhook de "ad review" hasta que effective_status = ACTIVE / DISAPPROVED
   - Si DISAPPROVED: reintentar con creative alternativo o avisar al cliente
       ↓
7. Loop de optimización (automático, recurrente — BullMQ cada X horas)
   - Leer Insights (spend, CPL, CTR, frequency) por ad set
   - Reglas: pausar ad set con CPL > umbral, subir presupuesto al que mejor rinde,
     rotar creative si frequency > umbral (fatiga), redistribuir entre ad sets
       ↓
8. Captura de leads (automático, tiempo real, cola de máxima prioridad)
   - Webhook `leadgen` (o submit de la landing propia) → guardar lead en CRM → encolar llamada VozIA
   - SLA objetivo: llamada iniciada en <30 segundos desde que entra el lead
       ↓
9. Feedback a Meta (automático)
   - Resultado de la llamada (contestó / no contestó / se convirtió) → Conversions API
   - Meta re-optimiza el targeting usando esa señal de calidad de lead
```

## Componentes a construir

| Componente | Qué hace | Encaje con lo existente |
|---|---|---|
| **Meta OAuth + token store** | Conectar Business Manager del cliente, guardar System User token (larga duración) por cliente | Nueva tabla Prisma `MetaAdAccount` (clientId, adAccountId, pageId, accessToken cifrado) |
| **Playbook library** | Busca si hay oferta/lead magnet/copy/landing/prompt de imagen ya preparados para el rubro elegido | Tabla Prisma `Playbook` (vertical, oferta, lead_magnet, copy, landing_template_id, image_prompt); se carga a mano, no requiere UI de administración en el MVP |
| **Lead magnet generator** (fallback) | Genera el "free value" (guía/checklist/mini-diagnóstico en texto) cuando no hay playbook para el rubro | LLM que ya está en el stack (Anthropic/OpenAI/Cerebras, ver `backend/src/voice/intelligence/llm/`) — es texto, no necesita nada nuevo |
| **Landing page generator** (fallback) | Genera una página simple (hero + free value + formulario) cuando no hay playbook | Template único + variables (rubro, oferta, colores) renderizado a HTML estático, deployado junto al frontend (ya hay `vercel.json`) |
| **Image generator** (fallback) | Genera la imagen del anuncio cuando no hay prompt de playbook para el rubro | API de imágenes de OpenAI (`openai` ya es dependencia del backend) |
| **Campaign builder** | Arma Campaign/AdSet/Ad/Creative a partir de un template + input del cliente | Servicio nuevo `backend/src/ads/metaCampaignBuilder.ts` |
| **Ad review poller** | Chequea `effective_status` hasta ACTIVE/DISAPPROVED | Job BullMQ, reusa Redis ya existente |
| **Optimization engine** | Reglas de pausa/ajuste de presupuesto/rotación de creative | Job BullMQ recurrente (cron), lee Insights API |
| **Lead webhook receiver** | Endpoint Fastify que recibe `leadgen`, valida firma de Meta, lo traduce a un modelo `Lead` genérico (campo `source: 'meta'`) y lo guarda | Reusa patrón de webhooks/rutas Fastify actuales; el modelo `Lead` queda listo para sumar otros `source` (Google, TikTok, landing) sin tocar el resto del pipeline |
| **Call trigger** | Al llegar un lead, encola llamada VozIA con prioridad máxima (SLA <30s) | Ya existe el pipeline de voz (`backend/src/voice/...`); solo hay que enganchar el trigger a una cola BullMQ dedicada y sin batching |
| **Wizard de negocio** | 3 preguntas (rubro / objetivo / presupuesto) que alimentan generadores de assets y campaign builder | Frontend nuevo (formulario corto en `src/pages/`), sin pantallas de configuración adicionales |
| **Conversions API sender** | Manda evento (lead contactado / convertido) de vuelta a Meta | Servicio simple, reusa el token de `MetaAdAccount` |
| **Billing SilxarCRM** | Cobro del plan/suscripción del cliente (no del gasto publicitario) | Falta Stripe u otro gateway — no existe en el backend hoy |

## Playbooks preentrenados por vertical (no generar todo de cero)

La diferencia entre "automatizado" y "optimizado": si cada campaña se genera de cero con un LLM, la calidad es pareja pero mediocre. Para los rubros más comunes conviene tener un **playbook preescrito y probado** — oferta, lead magnet, copy y prompt de imagen ya definidos, más el template de landing ya maquetado para ese rubro. Ejemplos:

| Vertical | Oferta | Lead magnet | Copy | Landing / imagen |
|---|---|---|---|---|
| Gimnasio | Prueba gratuita 7 días | Guía de entrenamiento | "¿Querés ponerte en forma antes del verano?" | Template + prompt de imagen ya preparados |
| Peluquería canina | Primera sesión con descuento | — | Ya preparado | Ya preparada |

El flujo objetivo con playbook es: **seleccionar negocio → responder 3 preguntas → todo lo demás ya está optimizado** (no solo automatizado). El wizard, al recibir la respuesta "tipo de negocio", primero busca match contra la biblioteca de playbooks; si existe, usa esos assets ya probados (solo completa variables chicas: nombre del negocio, ciudad, presupuesto). Si el rubro no está cubierto todavía, cae al generador genérico por LLM/imagen descrito abajo — ese fallback es lo que permite lanzar cualquier rubro desde el día 1 sin bloquear el producto a que alguien escriba el playbook antes.

Un playbook es literalmente un registro fijo (JSON/fila en tabla `Playbook`: vertical, oferta, lead_magnet, copy, landing_template_id, image_prompt) — no hace falta motor de reglas ni configurador visual para esto en el MVP, se cargan a mano los primeros 5–10 rubros más pedidos y se suman más con el tiempo. Además reduce el riesgo de "rechazo de anuncios recurrente" (ver Riesgos): un playbook ya probado y aprobado por Meta una vez tiene mucha menos chance de ser rechazado que un copy/imagen 100% nuevo generado en el momento.

## Generación por LLM (fallback para rubros sin playbook)

Cuando no hay playbook para el rubro, se generan los tres assets de cero, una sola vez por campaña (no en el loop recurrente):

- **Free value / lead magnet**: se genera con el mismo LLM que ya usa VozIA para conversación — un prompt con el rubro del cliente alcanza, no hace falta un servicio nuevo. Se guarda como texto/markdown; no requiere generar PDF: el valor se entrega directamente en la landing (se desbloquea después de dejar el contacto), y se agrega descarga en PDF más adelante solo si algún cliente lo pide puntualmente.
- **Landing page**: mismo template genérico usado por los playbooks, pero con copy/free value generados en vez de preescritos. Se publica como página estática reusando el hosting que ya existe (Vercel). El formulario postea al mismo backend que recibe los leads de Meta, así el pipeline "lead → CRM → llamada VozIA" es el mismo sin importar si el lead vino de un playbook, de la generación por LLM, del Lead Ad nativo o de la landing.
- **Imagen del anuncio**: se genera con el mismo proveedor de IA que ya está instalado en el backend (`openai`, que ya se usa en el proyecto) a partir de un prompt armado con rubro + oferta, con 2-3 variantes para que el loop de optimización pueda rotar por fatiga.

Los assets, vengan de un playbook o del fallback, pasan igual por el ad review de Meta — ni preescribirlos ni generarlos con IA evita esa revisión.

## Reglas de "auto-ajuste" (motor de optimización)

Ejemplos concretos, todos calculables con Insights API + BullMQ cron:

- **Pausar por costo**: si `cost_per_lead` de un ad set > umbral definido por el cliente durante 48hs con gasto mínimo acumulado → pausar ese ad set.
- **Reasignar presupuesto**: mover % de presupuesto del ad set peor CPL al mejor CPL (dentro de la misma campaña).
- **Fatiga de creative**: si `frequency` > 3–4 y CTR cae, rotar a un creative alternativo generado previamente.
- **Kill switch por gasto diario**: si `spend` del día supera el tope configurado por el cliente → pausar toda la campaña (protección contra descontrol de gasto, crítico en un sistema "automático").
- **Calidad de lead real**: si el % de leads que VozIA marca como "no contesta" o "no calificado" es alto para un ad set, bajarle prioridad — usando la señal que vuelve por Conversions API.

Todo esto son reglas simples (if/then sobre métricas), no hace falta ML para la v1 — Meta ya optimiza la entrega internamente; el motor propio solo pone límites y redistribuye presupuesto entre lo que arma la campaña.

## Riesgos a tener en cuenta

- **Gasto descontrolado**: sin un kill switch por presupuesto diario, un bug en el loop de optimización puede quemar plata del cliente. Es el punto más crítico a testear bien.
- **Rechazo de anuncios recurrente**: si el creative generado por IA viola políticas seguido, el cliente ve fricción. Conviene un set de plantillas pre-aprobadas por vertical.
- **Tokens de acceso**: el System User token de Meta hay que guardarlo cifrado y con expiración larga controlada (no expira cada 60 días como un user token normal, pero se puede revocar del lado del cliente).
- **Responsabilidad legal del gasto**: dejar clarísimo en el onboarding quién paga qué (Meta cobra al método de pago del cliente, no a SilxarCRM), para evitar reclamos.
- **Rate limits de la API**: el loop de optimización y el poll de ad review deben respetar los límites de Graph API (por app y por cuenta) — con BullMQ es fácil escalonar los jobs.
- **Dependencia de Meta**: si Meta cambia políticas, tumba una API o suspende una cuenta, no puede parar el motor entero. Ver el diseño de fuente de lead intercambiable abajo — es la mitigación.

## Dependencia de Meta: diseñar la fuente del lead como intercambiable

Meta Ads es la primera fuente, no puede ser la única de la que depende todo. La forma barata de lograrlo (nada de "sistema de plugins"): un **modelo `Lead` único con un campo `source`** (`meta`, `google`, `tiktok`, `landing`, `manual`, ...) y un **adapter chico por canal** que traduce el payload de cada plataforma a ese mismo modelo. Todo lo que viene después del lead (CRM → VozIA → Cita → Conversión) es idéntico sin importar de dónde vino:

```
Meta Ads ─┐
Google Ads ─┤
TikTok Ads ─┼──► adapter → Lead (source, contacto, campaña) ──► CRM ──► VozIA ──► Cita ──► Conversión
Landing propia ─┤
Web del cliente ─┘
```

Esto no es sobreingeniería: es un campo `source` en la tabla `Lead` y una función `parseXLead(payload) → Lead` por canal — se escribe una sola vez (`parseMetaLead`) para el MVP y el resto se agrega cuando haga falta, sin tocar el pipeline de CRM/llamada. Lo caro sería *no* hacerlo ahora: si el "Lead webhook receiver" queda hardcodeado a la forma exacta del payload de Meta, migrar a otra fuente el día de mañana implica reescribir el pipeline entero en vez de agregar un adapter.

## Oportunidad de datos (a futuro, no en el MVP)

Con volumen entre clientes de un mismo rubro (ej. 300 gimnasios, 200 peluquerías, 150 estudios de abogados) el sistema acumula, por vertical: qué oferta genera más leads, qué presupuesto rinde mejor, qué tipo de lead termina agendando cita, qué conversaciones de VozIA terminan en conversión. Con suficiente volumen esto se puede convertir en recomendaciones automáticas al armar una campaña nueva (ej. "para un gimnasio en Madrid, 400€/mes con oferta de prueba gratis de 7 días históricamente da +35% citas"). Es una ventaja difícil de copiar porque depende de tener el volumen acumulado, no de la tecnología en sí.

### El hilo de trazabilidad que lo hace posible

Para poder responder "¿qué playbook genera más citas?", "¿qué oferta convierte mejor?", "¿qué copy funciona mejor?", "¿qué llamadas terminan en venta?", cada entidad tiene que quedar enlazada con la anterior en la cadena, sin cortes:

```
Vertical → Playbook → Campaña → Lead → Llamada → Cita → Venta
```

En la práctica esto es una sola cosa: que `Campaña` guarde una referencia al `playbookId` que usó, y que `Lead`, `Llamada`, `Cita` y `Venta` guarden (directa o transitivamente, vía `campaignId`) esa misma referencia. No hace falta una tabla nueva por cada relación — alcanza con que cada entidad ya prevista (Campaign, Lead, Call, Appointment) tenga su FK al registro anterior de la cadena. Sin esto, el dato de conversión queda huérfano y las preguntas de arriba no se pueden responder ni con todo el volumen del mundo — es la diferencia entre "sabemos que tuvimos ventas" y "sabemos qué playbook produjo esas ventas".

No es trabajo del MVP construir el análisis — pero el enlace `playbookId` (y en general **capturar bien los campos desde el día 1**: rubro, oferta, presupuesto, resultado de la llamada, si hubo cita) sí tiene que estar desde que se crea la primera campaña. Agregar esa FK después implica no poder atribuir nada de lo generado antes; el análisis/recomendación en sí se construye recién cuando haya volumen real para que valga la pena.

El destino natural de ese aprendizaje son los **playbooks** (sección anterior): cuando el dato muestre que cierta oferta o presupuesto funciona mejor para un rubro, se actualiza el playbook de ese rubro — no hace falta ML corriendo en producción, alcanza con revisar y ajustar los playbooks a mano con lo que muestran los números. Con el hilo de trazabilidad completo, esto deja de ser "lanzamos anuncios automáticamente" y pasa a ser "sabemos qué suele funcionar para cada sector porque lo aprendimos de miles de campañas" — la ventaja competitiva real de acumular volumen.

## MVP realista (primer recorte)

Orden de prioridad: lo que se ve/siente primero, no lo que es técnicamente más vistoso.

1. **Cola de llamada de alta prioridad con SLA <30s** — esto es innegociable desde el día 1, es la ventaja competitiva real, no se recorta ni se deja para v2.
2. **Wizard de 3 preguntas** (rubro / objetivo / presupuesto) como única pantalla de configuración — nada de formularios de segmentación manual, ni siquiera en el MVP.
3. Onboarding manual asistido (conectar cuenta Meta + confirmar pago) — no hace falta automatizar esto de entrada.
4. **2–3 playbooks completos** para los rubros más pedidos (ej. gimnasio, peluquería) con oferta/lead magnet/copy/landing/imagen ya definidos a mano — mejor calidad garantizada que generar todo por LLM desde el día 1. El resto de los rubros cae al fallback genérico (un template de landing + un prompt de imagen por rubro + un free value en texto, generados por LLM).
5. Un solo template de campaña (objetivo "Leads"), un solo creative por campaña.
6. Loop de optimización con 2 reglas nomás: kill switch por gasto diario + pausar por CPL alto.
7. Webhook de leads (Meta y landing propia) → llamada automática, sobre un modelo `Lead` con campo `source` desde el día 1 (aunque el único adapter que exista sea el de Meta) y guardando rubro/oferta/presupuesto/resultado de la llamada — para no tener que reconstruir ese dato cuando haga falta el análisis de la sección de datos.
8. Sin Conversions API todavía — se agrega en v2 una vez que el resto funciona.

Con eso ya se cumple "el cliente responde 3 preguntas, paga, se genera el anuncio, se promociona, se ajusta solo, y cada lead recibe una llamada en segundos" — la sofisticación (rotación de creatives, multi-ad-set, ML de optimización) se suma después sin tener que rediseñar la base. El copy de cara al cliente (onboarding, reportes) siempre en términos de resultado ("clientes mientras dormís"), nunca de features técnicas.
