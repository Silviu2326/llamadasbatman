# VozIA — Qué es la plataforma, explicado sin tecnicismos

*Documento de referencia para entender VozIA como producto terminado. Escrito en lenguaje de negocio, sin jerga de programación.*

---

## 1. La idea en una frase

VozIA es un CRM (un sistema para gestionar clientes y ventas) pensado para que un negocio **consiga clientes nuevos de forma automática**: encuentra o recibe clientes potenciales, los diagnostica para saber qué venderles, y los llama por teléfono con un agente de inteligencia artificial que suena como una persona real — todo esto sin que nadie del negocio tenga que hacer llamadas en frío ni perseguir leads manualmente.

El sistema se organiza en cinco grandes piezas:

1. **Captación de leads** — cómo entran clientes potenciales al sistema (alta manual, importación, formularios, Meta, web y otros canales).
2. **Prospección B2B** — salir a buscar negocios reales que encajen con lo que se quiere vender, con un diagnóstico de oportunidad como argumento de venta.
3. **Anuncios en Meta** — crear y gestionar campañas de publicidad en Facebook e Instagram.
4. **Llamadas con agente de IA (VozIA)** — el agente de voz que llama a los clientes potenciales y mantiene una conversación real para conseguir una cita o venta.
5. **Email marketing** — secuencias automáticas que mantienen vivos a los leads que no están listos para comprar hoy.

Estas cinco piezas están pensadas para encadenarse: un anuncio o una búsqueda trae un lead → el lead se diagnostica automáticamente → el agente de IA lo llama en segundos → si hay interés, se agenda una cita → si no está listo, entra en una secuencia de email. Ese es el "motor completo" del producto.

---

## 2. Cómo se navega la plataforma (mapa general)

El menú lateral tiene estas secciones:

- **Dashboard**: panel general con métricas del negocio.
- **Campañas**: agrupaciones de leads con un objetivo comercial.
- **Llamadas**: historial y gestión de llamadas con agente de IA.
- **Leads**: listado y ficha de cada cliente potencial.
- **Prospect Finder**: búsqueda automática de negocios B2B.
- **Agentes IA**: perfiles de voz, personalidades y guiones de los agentes.
- **Pipeline**: vista visual del embudo de ventas.
- **Reuniones**: citas agendadas con leads.
- **Playbooks**: recetas de campañas de anuncios por rubro.
- **Insights**: análisis y métricas avanzadas.
- **Automatizaciones**: reglas automáticas, incluyendo secuencias de email.
- **Knowledge Base**: base de conocimiento del negocio para los agentes de IA.
- **Configuración**: ajustes del sistema.
- **Test de Voz**: herramienta interna para probar agentes de IA sin hacer llamadas reales.

Las secciones que forman el motor principal del producto se explican en detalle más abajo: **Leads, Prospect Finder, Diagnóstico de oportunidad, Anuncios en Meta, Llamadas con agente de IA, Email marketing, Agentes IA y Pipeline**.

---

## 3. Captación de leads (clientes potenciales)

### 3.1 Qué problema resuelve

Cualquier negocio necesita un flujo constante de clientes potenciales nuevos. El problema habitual es que conseguirlos es caro y lento: hay que buscar a mano quién podría ser cliente, o esperar a que alguien llegue solo por una web o un anuncio. VozIA ataca esto por dos caminos que se complementan: **salir a buscar negocios reales que encajen con lo que se quiere vender**, y **reaccionar con velocidad** a cualquier lead que entre por otras vías, llamándolo casi al instante para que no se enfríe ni se lo lleve la competencia.

El principio de diseño central es que **el tiempo hasta el primer contacto es lo que más importa**: la mayoría de negocios tardan horas o días en llamar a un lead nuevo; si VozIA lo llama en menos de 30 segundos, esa velocidad ya es la ventaja competitiva.

### 3.2 De dónde vienen los leads

- **Alta manual, uno por uno**: cualquier usuario puede registrar a mano un cliente potencial (nombre, cargo, empresa, email, teléfono, estado, origen y etiquetas libres). Es el camino típico cuando alguien se entera de un cliente potencial por su cuenta (una llamada, una recomendación, una feria).
- **Importación masiva por archivo Excel/CSV**: se puede subir una lista completa de contactos (nombre, teléfono, email, empresa) y el sistema los da de alta a todos de golpe, asociados a una campaña. Pensado para cuando el negocio ya tiene su propia lista y quiere subirla entera de una vez. El sistema evita duplicados exactos dentro de esa misma carga.
- **Prospect Finder**: búsqueda automática de negocios reales. Se explica en detalle en la sección 4.
- **Canales externos**: leads que llegan solos desde formularios de anuncios de Meta, la propia web del negocio u otras fuentes. El sistema los recibe, crea automáticamente en el CRM y dispara la llamada del agente de IA sin que nadie apriete ningún botón.

Cada lead queda registrado con un campo de "origen" libre para poder sumar más fuentes en el futuro sin rediseñar el resto del sistema.

### 3.3 Qué pasa con un lead una vez está en el sistema

**Estados (el embudo comercial):** cada lead avanza por etapas — Nuevo → Contactado → Interesado/Calificado → Reunión agendada → Negociación → Ganado o Perdido. En la pantalla de Leads esto se ve como etiquetas de colores, y también existe una **vista tipo tablero visual (Kanban)** que agrupa los leads por su nivel de oportunidad detectado en el diagnóstico (Caliente / Tibio / Frío / Sin diagnosticar).

**Asignación a campañas:** cada lead puede quedar vinculado a una campaña concreta (un conjunto de leads que se trabaja con un objetivo y, opcionalmente, un agente de IA determinado). La campaña lleva la cuenta de cuántos leads tiene en total, cuántos fueron contactados y cuántas reuniones se agendaron a partir de ella.

**Seguimiento:** cada lead tiene una línea de tiempo con todas las llamadas que se le hicieron, las reuniones agendadas, las negociaciones abiertas (con su valor económico y probabilidad de cierre), las notas del equipo y los archivos adjuntos.

**Llamada automática inmediata:** cuando entra un lead nuevo, el sistema lo encola con prioridad máxima. Antes de marcar, comprueba que el teléfono no esté en la lista de "no llamar" y que la hora local del contacto esté dentro de la franja permitida (por defecto, de 9:00 a 20:00). Si todo está en regla, el agente de IA llama en segundos.

### 3.4 Captación de leads desde canales externos

VozIA recibe leads automáticamente desde cualquier canal externo conectado:

- **Meta (Facebook e Instagram)**: cuando alguien completa un formulario de anuncio o deja su teléfono en una campaña, el lead entra al CRM y el agente de IA lo llama en menos de 30 segundos.
- **Formularios web**: cualquier formulario de la web del negocio puede enviar los datos directamente a VozIA, disparando la misma llamada inmediata.
- **Google Ads y otras plataformas**: se pueden conectar por API o webhook para que los leads entren con el mismo tratamiento automático.
- **Landing pages automáticas**: cada campaña de anuncios puede generar su propia landing, optimizada para móvil, que mide cada visita, cada clic y cada envío.

La regla es la misma para todos los canales: **cualquier lead nuevo que entre en el sistema recibe una llamada automática de máxima prioridad**, siempre dentro del horario permitido y respetando la lista de exclusión.

---

## 4. Prospección B2B y diagnóstico de oportunidad

### 4.1 Qué problema resuelve

Esta pieza convierte a VozIA en algo más que "una IA que llama a los leads que ya tienes": cuando tu cliente es otro negocio, **diagnostica automáticamente qué le falta a cada negocio potencial antes de contactarlo**, para que el equipo comercial sepa a quién llamar primero y con qué argumento.

La idea es cambiar la llamada en frío ("¿le interesa nuestro servicio?") por una llamada con un argumento concreto: "hemos analizado su presencia online y detectamos que su web no tiene botón de WhatsApp, no tiene reservas online, y su ficha de Google tiene pocas reseñas — esto le está costando clientes, y esto es lo que podemos hacer". Es decir, el diagnóstico funciona como **anzuelo comercial personalizado**: un análisis automático y gratuito que sirve de excusa y de argumento de venta a la vez.

**Esta función es solo para negocios B2B.** Una clínica dental no prospecta otras clínicas dentales. Una peluquería no prospecta peluquerías. Sirve para asesorías, agencias, consultoras, fabricantes B2B, software y servicios a empresas.

### 4.2 Cómo funciona el Prospect Finder

El Prospect Finder funciona utilizando la API oficial de Google Places. Cada empresa debe configurar su propia API Key.

**Cómo lo usa alguien del equipo:** hay una pantalla dedicada donde solo hace falta escribir un **rubro** (por ejemplo "clínicas dentales", "gimnasios", "peluquerías") y una **ciudad** (por ejemplo "Valencia"), y pulsar "Buscar". No hace falta ningún conocimiento técnico.

**Qué trae el sistema:** hasta 20 negocios reales que coinciden con la búsqueda. De cada uno obtiene: nombre, dirección, teléfono, página web (si tiene), calificación en estrellas, número de reseñas, enlace a su ficha de Google Maps y cantidad de fotos publicadas.

**Puntaje rápido de oportunidad:** cada negocio recibe automáticamente una puntuación de 0 a 100 que estima qué tan buena oportunidad comercial representa. Un negocio sin web propia, con calificación baja o con pocas reseñas suma más puntos, porque indica carencias digitales que se pueden vender.

**Filtros y orden:** los resultados se pueden reordenar por puntuación de oportunidad, estrellas o número de reseñas, y filtrar por negocios sin web, con teléfono, o con un mínimo de estrellas/reseñas. También se puede exportar la lista a CSV.

**Convertir búsquedas en leads:** se marcan los negocios que interesan, se asocian opcionalmente a una campaña y con un clic pasan a ser leads normales dentro del CRM, guardando toda la información recogida.

**Protección contra duplicados:** el sistema recuerda qué negocios ya se importaron antes (por su identificador único de Google o por su teléfono), así que no vuelve a importar el mismo negocio dos veces.

**Opciones al importar:**
- **"Enriquecer"**: el sistema visita automáticamente la web del negocio para intentar sacar un email de contacto y detectar en qué redes sociales tiene presencia.
- **"Diagnosticar al importar"**: cada negocio importado pasa automáticamente por el diagnóstico de oportunidad, de forma que el lead ya llega con su argumento de venta hecho.

### 4.3 Cómo funciona el diagnóstico de oportunidad

Se puede lanzar automáticamente al importar un negocio desde el Prospect Finder, o manualmente desde la ficha de cualquier lead con el botón "Diagnosticar ahora".

Dado el nombre del negocio y su página web, el sistema:

1. **Visita la web pública** del negocio y descarga su contenido.
2. Analiza la página buscando señales en varias categorías:
   - **Presencia pública**: título y descripción para buscadores, adaptación a móvil, velocidad de carga, conexión segura (https), datos estructurados, Google Analytics, píxel de Meta.
   - **Redes sociales**: enlaces a Instagram, Facebook, LinkedIn, TikTok, YouTube, X o WhatsApp.
   - **Madurez del negocio**: sistemas de reservas o citas online, venta online, chat de atención, uso de constructores genéricos tipo Wix.
   - **Capacidad de conversión**: formulario de contacto, botón de llamar, botón de WhatsApp, textos tipo "pide tu presupuesto".
   - **Reputación en Google**: calificación y número de reseñas.
3. Si se indica rubro y ciudad, el sistema **compara al negocio con hasta 20 competidores reales de la misma zona**, para generar argumentos como "su calificación está un 15% por debajo de la media del sector en su ciudad".

### 4.4 Qué produce como resultado

No es un simple aprobado/suspenso: es un resultado comercial completo, pensado para que lo use cualquier vendedor sin conocimientos técnicos:

- **Dos puntuaciones (0 a 100)**: "presencia pública" y "madurez operativa".
- **Una puntuación única de "oportunidad de venta"** que combina ambas.
- **Etiqueta de temperatura: Caliente, Tibio o Frío**, visible como insignia de color en la ficha y en el listado de leads.
- **Lista de oportunidades o carencias detectadas**, cada una con descripción en lenguaje llano, nivel de gravedad, servicio al que correspondería venderle la solución, nivel de impacto comercial y **un texto de venta ya redactado**.
- **Resumen en una frase y un pitch comercial global** listo para usar en una llamada o email.
- **Comparación con la competencia local**, si hay datos de sector/ciudad.

Todo esto se ve en una tarjeta visual dentro de la ficha de cada lead, y de forma resumida en el listado general, donde además se puede filtrar por carencias concretas ("sin web", "sin reservas online", "sin analítica", "pocas reseñas").

El resultado del análisis vive dentro del CRM. También se puede exportar a CSV la lista de prospectos encontrados.

### 4.5 Coste y alcance de la prospección B2B

La búsqueda de negocios usa la API de Google Places, y el diagnóstico descarga y analiza el contenido de cada web. El uso de estos servicios de Google tiene un coste variable que crece con el volumen de búsquedas y diagnósticos.

Si la web de un negocio bloquea el acceso automático, el diagnóstico se marca como "revisar manualmente" en vez de dar una puntuación falsa. El sistema también evita diagnosticar el mismo negocio dos veces seguidas si la web no ha cambiado, ahorrando coste innecesario.

---

## 5. Anuncios en Meta (Facebook e Instagram)

### 5.1 Qué problema resuelve

La idea no es "hacer anuncios en Facebook" como fin en sí mismo, sino automatizar todo el proceso de conseguir clientes a través de publicidad: desde que el negocio decide "quiero conseguir clientes" hasta que un interesado recibe una llamada automática de VozIA apenas segundos después de mostrar interés, terminando en una cita agendada. La promesa es **"conseguí clientes mientras dormís"**: el negocio responde tres preguntas simples, y todo lo demás —anuncio, imagen, texto, publicación, ajuste de presupuesto, llamada al interesado— lo hace la plataforma.

### 5.2 Cómo funciona el flujo

1. El negocio conecta su propia cuenta de Meta una única vez. Cada negocio necesita su propia cuenta publicitaria y su propia tarjeta; el CRM no puede correr anuncios de varios clientes sobre una cuenta compartida.
2. Responde tres preguntas: ¿qué tipo de negocio tenés?, ¿qué querés conseguir?, ¿cuál es tu presupuesto mensual?
3. El sistema genera el anuncio: si existe una receta (playbook) para ese rubro, la usa; si no, genera texto, oferta e imagen con IA.
4. El sistema publica la campaña en Meta y espera la revisión de Meta (que puede tardar minutos o días, y a veces rechaza el anuncio).
5. Empiezan a llegar interesados a través del formulario nativo de Meta o de una página propia.
6. Apenas entra un interesado, VozIA lo llama automáticamente en menos de 30 segundos.
7. Si la llamada resulta en interés real, se agenda una cita.
8. El sistema se ajusta solo con reglas simples: pausar si sale caro por interesado, cambiar la imagen si se agota la audiencia, y frenar todo si se supera el gasto diario máximo.
9. El dueño del negocio ve resultados de negocio, no términos técnicos: cuántos interesados llamó el sistema y cuántas citas se agendaron.

### 5.3 Qué automatización interviene

- **Generación de contenido con IA**: texto, oferta de "regalo" e imagen cuando no hay receta preparada.
- **Segmentación automática de Meta**: el CRM fija solo límites duros (ubicación, edad mínima) y deja que el algoritmo de Meta decida el resto.
- **Reglas simples de auto-ajuste**: pausar si sale caro, subir presupuesto al mejor anuncio, cambiar imagen si se agota, frenar si se supera el gasto diario.
- **VozIA**: llama automáticamente al interesado apenas entra.

### 5.4 Detalles de negocio relevantes

- **Tipo de anuncio principal**: generación de interesados con formulario nativo dentro de Meta, con alternativa de página de aterrizaje propia.
- **Playbooks**: recetas por rubro con oferta + "regalo" + texto + imagen ya probados. Reducen el riesgo de rechazo por parte de Meta y garantizan calidad mínima desde el primer día.
- **Presupuesto**: definido por el negocio más un tope diario máximo como freno de emergencia.
- **Quién paga qué**: el CRM cobra su suscripción y uso de VozIA; el gasto publicitario se paga directamente a Meta con la tarjeta y cuenta del negocio.
- **Revisión de Meta**: cada anuncio pasa por revisión antes de publicarse. Puede rechazarse por políticas de salud, finanzas o textos exagerados, sin que el CRM pueda evitarlo.
- **Aprendizaje entre negocios**: con datos de muchos negocios del mismo rubro, el sistema detecta qué oferta o mensaje funciona mejor y mejora las recetas automáticamente.

---

## 6. Llamadas con agente de IA (VozIA)

### 6.1 Qué es y qué problema resuelve

Este es el "empleado de ventas por teléfono" del CRM: un agente de IA que **llama por teléfono a los leads y mantiene con ellos una conversación de voz real, en español, fluida**, con el objetivo de conseguir una cita o calificar el interés del prospecto.

Resuelve el cuello de botella clásico de cualquier equipo comercial: nadie llama a los leads a tiempo, y llamar a mano no escala. La promesa concreta es doble:
- **Velocidad**: en el momento en que entra un lead nuevo, la primera llamada sale en menos de 30 segundos.
- **Escala sin coste humano**: el mismo agente puede atender 1 o 1.000 llamadas simultáneas al mismo coste marginal, sin cansancio, disponible 24/7.

### 6.2 Cómo funciona una llamada, de principio a fin

1. **Se decide a quién llamar**: porque entró un lead nuevo (dispara llamada inmediata prioritaria) o porque se activó una campaña de llamadas sobre una lista de leads.
2. **Antes de marcar, se revisa cumplimiento normativo**: que el número no haya pedido "no me llamen" antes, y que la hora local del prospecto esté dentro de la franja permitida (por defecto, de 9:00 a 20:00). Si no se cumple, no se llama.
3. **Se marca el número** a través de un proveedor de telefonía en la nube (Twilio), que detecta si contesta una persona o un contestador.
4. **Cuando contesta**, el sistema carga la personalidad y guion de ese agente concreto y abre un canal de audio en tiempo real.
5. **El agente saluda primero**, por ejemplo: "Hola, buenos días, soy Alex, de [Empresa]. ¿Está el responsable un momento?"
6. **Mientras el prospecto habla, el sistema escucha en tiempo real** y va transcribiendo palabra por palabra. En cuanto detecta que probablemente está por terminar su turno, ya prepara una respuesta por adelantado.
7. **Si el prospecto interrumpe**, el sistema corta inmediatamente el audio del agente y le cede la palabra.
8. **El cerebro del agente genera una respuesta** teniendo en cuenta todo lo hablado hasta ese momento.
9. **Esa respuesta se convierte en voz**, con un tono y personalidad concretos, y se reproduce frase por frase casi en el mismo instante en que se genera.
10. **En paralelo, un supervisor revisa cómo va la llamada** cada pocos turnos y, si hace falta, le da nuevas instrucciones al agente para cambiar de estrategia o de tono en caliente.
11. **Si el prospecto dice frases tipo "no me vuelvan a llamar"**, el sistema marca automáticamente ese número para no volver a llamarlo.
12. **Al terminar la llamada**, el sistema guarda automáticamente: duración, transcripción completa, sentimiento detectado del prospecto y resultado (cita agendada, no interesado, transferido a un humano, dado de baja).

### 6.3 Qué tecnologías de IA se usan y qué hace cada una

El sistema combina varios proveedores de IA especializados, cada uno haciendo una sola cosa muy bien:

- **Oído (voz a texto): Deepgram.** Escucha el audio del prospecto en tiempo real y lo convierte en texto, detectando cuándo empieza y termina de hablar.
- **Cerebro rápido (genera la respuesta): Cerebras.** Redacta en el momento lo que el agente va a decir, basándose en toda la conversación. Se eligió por ser uno de los proveedores más rápidos del mercado.
- **Supervisor estratégico (calidad de venta): Claude, apodado internamente "Guru".** Un segundo cerebro, más lento pero más inteligente en estrategia, que revisa la conversación cada ciertos turnos y decide si hay que cambiar de técnica o tono.
- **Boca (texto a voz): ElevenLabs.** Convierte el texto generado en audio con entonación natural, pausas y distintos estilos de habla.
- **Red de seguridad**: si el cerebro rápido falla, un proveedor de respaldo toma el relevo para que la llamada no se corte.

En resumen: **una IA escucha y transcribe, otra piensa qué decir rápido, una tercera supervisa la estrategia de venta, una cuarta convierte la respuesta en voz, y hay un respaldo por si falla algo.**

### 6.4 Los perfiles de voz — personalidades y estilos de conversación

El sistema tiene **11 personalidades de habla** predefinidas, cada una pensada para un momento distinto de la conversación de ventas: Directo, Cercano, Consultivo, Challenger, Storyteller, Snap, Empático, Urgente, Técnico, Prueba social y Mini closer.

Cada perfil define qué tipo de cosas dice el agente y cómo suena (velocidad, entonación, pausas). Además, el sistema ajusta la voz automáticamente según el estado de ánimo detectado en el prospecto: si está molesto, habla más despacio; si detecta interés, habla con más energía.

Cada agente configurado en el CRM puede tener asignada una voz distinta, de modo que distintos agentes virtuales pueden sonar como personas distintas.

Junto con esto hay **13 técnicas clásicas de venta** (AIDA, SPIN, Challenger, Consultiva, Sandler, Storytelling, etc.) que el supervisor puede activar según cómo reacciona el prospecto. También existe un detector de **8 objeciones típicas** ("es caro", "ya tenemos algo similar", "no es buen momento", "necesito consultarlo", "mándenme información", "no me interesa", "no tengo tiempo", respuestas con sarcasmo), cada una con su manual de respuesta.

### 6.5 Cómo se organizan las campañas de llamadas

Hay que distinguir tres conceptos diferentes que en el día a día pueden llamarse "campañas":

- **Campaña comercial**: un grupo de leads con un objetivo y, opcionalmente, un agente de IA asignado. Sirve para organizar el trabajo y medir resultados.
- **Campaña de llamadas**: se activa sobre una campaña comercial y lanza llamadas automáticas a todos sus leads "nuevos".
- **Campaña de anuncios**: una campaña publicitaria en Meta. Se explica en la sección 5.

**Llamada individual e inmediata a un lead nuevo:** al entrar un lead nuevo se encola con prioridad máxima, se revisa cumplimiento, y si está en regla se lanza la llamada de inmediato.

**Campaña de llamadas completa:** el sistema llama automáticamente a todos los leads nuevos de una campaña comercial, respetando horarios, lista de exclusión y ritmo de marcación configurado.

**Reintentos inteligentes:** si un lead no contesta, VozIA vuelve a intentarlo más tarde con el ritmo configurado para no saturar.

### 6.6 Cumplimiento y calidad de las llamadas

- **Aviso de IA y grabación**: al inicio de cada llamada donde la ley lo exija, el agente informa que es un asistente de inteligencia artificial y solicita consentimiento para grabar.
- **Transferencia a humano**: si el prospecto pide hablar con una persona, si detecta frustración muy alta o si la conversación no avanza, el sistema transfiere la llamada a un humano con todo el contexto visible.
- **Lista de no llamar**: cualquier número que pida no ser llamado queda bloqueado de forma permanente en la base de datos.
- **Horario legal**: el sistema respeta la franja horaria permitida según el país y la zona horaria del prospecto.
- **Registro completo**: cada llamada queda guardada con transcripción, duración, sentimiento, resultado y enlace a la grabación en la ficha del lead.

---

## 7. Email marketing

### 7.1 Qué problema resuelve

La mayoría de los leads no compran a la primera conversación. Algunos piden tiempo, otros no responden, otros no están listos. Sin un sistema de seguimiento, esos leads se pierden. El email marketing de VozIA resuelve eso: **envía automáticamente el mensaje correcto a cada lead según su situación**, sin que el comercial tenga que acordarse de escribir a mano.

**No es para todos los negocios.** Una peluquería local o una clínica dental pueden vivir de WhatsApp y llamadas. Una fábrica B2B, una asesoría o una agencia suelen necesitar secuencias de email más largas. Cada cliente activa este módulo solo si encaja con su modelo de venta.

### 7.2 Qué permite hacer

- **Secuencias por estado**: cada lead recibe el email correcto según dónde esté en el embudo (nuevo, contactado, interesado, reunión agendada, propuesta enviada, etc.).
- **Segmentación por comportamiento**: abrió, cliqueó, no respondió, pidió tiempo, rechazó por precio.
- **Reactivación de leads dormidos**: después de un tiempo sin actividad, VozIA envía un mensaje diseñado para volver a enganchar.
- **Contenido adaptado al rubro**: una clínica dental no recibe la misma secuencia que un concesionario.
- **Sincronización con el CRM**: el comercial ve en la ficha del lead si abrió el email, qué cliqueó y cuándo.

El email no reemplaza la llamada. La prepara.

### 7.3 Cómo se conecta con el resto del sistema

El email marketing vive dentro del módulo de **Automatizaciones**. Desde ahí se configuran reglas del tipo:

- "Si un lead pasa 3 días en estado 'Interesado' sin agendar reunión, enviarle el caso de éxito de su rubro."
- "Si un lead abre el email y cliquea, subir su prioridad y notificar al comercial."
- "Si un lead dice 'déjame pensarlo', esperar 5 días y enviarle una comparativa."

También se puede disparar manualmente desde la ficha de un lead: el comercial elige una plantilla y la envía en un clic.

### 7.4 Métricas de email marketing

El dashboard muestra: emails enviados, tasa de apertura, tasa de clics, rebotes, leads reactivados y conversiones atribuidas a cada secuencia. Se puede filtrar por campaña, rubro y período.

---

## 8. Otras secciones del CRM

### 8.1 Pipeline

Vista visual del embudo de ventas. Muestra los leads agrupados por estado (Nuevo, Contactado, Interesado, Reunión agendada, Negociación, Ganado, Perdido) y permite arrastrarlos de una columna a otra. También ofrece una vista Kanban donde los leads se agrupan por temperatura (Caliente, Tibio, Frío) según el diagnóstico de oportunidad.

### 8.2 Dashboard

Panel general con las métricas que el dueño del negocio necesita ver de un vistazo: leads totales, leads calientes, llamadas realizadas, citas agendadas, valor de cartera, tasa de conversión, emails enviados y abiertos. Se puede filtrar por período, canal, campaña y equipo comercial.

### 8.3 Agentes IA

Sección donde se configuran los distintos agentes de voz del sistema. Cada agente tiene:

- Nombre y empresa que representa.
- Objetivo de la llamada (agendar cita, cualificar interés, cerrar venta).
- Guion base y conocimiento del negocio.
- Perfil de voz (Directo, Cercano, Consultivo, etc.).
- Timbre de voz asignado (voz masculina, femenina, tono, acento).

Esto permite tener, por ejemplo, un agente para clínicas dentales y otro para asesorías fiscales, cada uno con su propio guion y estrategia.

### 8.4 Reuniones

Gestión de citas agendadas con leads. Muestra las reuniones próximas, pasadas y pendientes, con recordatorios automáticos por email o WhatsApp. Se conecta con la ficha del lead para que el comercial llegue a la reunión con todo el contexto.

### 8.5 Knowledge Base

Base de conocimiento donde el negocio carga la información que necesitan los agentes de IA para responder bien: productos, precios, objeciones comunes, casos de éxito, preguntas frecuentes. Cuanto mejor esté cargada, más precisas son las respuestas del agente.

---

## 9. Cierre

VozIA no es solo un CRM ni solo un robot de llamadas. Es un motor completo de captación y conversión: encuentra o recibe leads, los diagnostica, los llama con un agente de IA que suena natural, agenda citas, nutre a los que no están listos y da al equipo humano todo el contexto para cerrar.

Cada negocio usa el subconjunto que le corresponde. Una clínica dental puede vivir de anuncios en Meta, llamadas automáticas y WhatsApp. Una asesoría puede vivir de prospección B2B, diagnóstico de oportunidad y email marketing. El mismo sistema cubre ambos modelos bajo un solo panel, una sola ficha de lead y una sola historia desde el primer contacto hasta la venta.
