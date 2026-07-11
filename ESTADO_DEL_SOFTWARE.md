# VozIA — qué es esto

*Explicado para alguien que no ha visto el software nunca. Sin tecnicismos innecesarios, sin "próximamente revolucionario". Lo que hace, lo hace; lo que no incluye todavía, se dice tal cual.*

---

## Qué es, en una frase

VozIA es una plataforma que encuentra clientes potenciales, los llama por teléfono con un agente de inteligencia artificial que habla como una persona, y guarda todo lo que pasa en un CRM para que el equipo comercial no tenga que perseguir nada a mano.

No es un chatbot de texto. No es un contestador con voz robótica que lee un guion fijo. Es una llamada de teléfono real, con un asistente que escucha, entiende, responde en menos de un segundo y sabe cuándo pasarle la llamada a una persona.

Sirve para dos tipos de negocio de forma distinta, y este documento está organizado para que cada uno encuentre primero lo suyo:

- Si tu negocio vende **a otras empresas** (B2B), lo que más te interesa es cómo VozIA encuentra negocios objetivo por zona y sector, y los llama solo.
- Si tu negocio vende **al consumidor final** (B2C), lo que más te interesa es cómo VozIA crea y publica anuncios en Facebook/Instagram que generan leads y los llama en segundos.

Ambos casos usan el mismo motor de llamadas por debajo. La diferencia está en cómo entra el lead.

---

## El agente de IA que llama por teléfono

Este es el corazón de todo. Cuando alguien contesta el teléfono, hay una conversación de verdad: el agente escucha lo que dice el prospecto, entiende la intención, y responde con voz natural, adaptando el tono según cómo va la charla.

Algunas cosas que hace, explicadas sin rodeos:

- **No interrumpe como un robot.** Si el prospecto empieza a hablar mientras el agente todavía está terminando una frase, el agente se calla y escucha — como haría una persona.
- **Detecta el estado de ánimo del prospecto** turno a turno (interesado, neutro, frustrado, molesto) y ajusta cómo sigue la conversación.
- **Sabe cuándo pasar la llamada a un humano.** Si el prospecto lo pide explícitamente ("quiero hablar con una persona") o si la conversación se pone tensa varias veces seguidas, transfiere la llamada a un número humano en caliente, sin colgar.
- **Reintenta si no contestan**, con un tiempo de espera entre intento e intento, hasta un máximo de intentos — no se queda llamando sin parar ni abandona al primer tono.
- **Respeta un ritmo de marcado razonable**, para no saturar la línea ni comportarse como un centro de llamadas agresivo.

Todo esto se puede probar desde el navegador, sin necesidad de un teléfono real, con una pantalla de prueba que simula la llamada completa con tu propio micrófono — útil para escuchar cómo suena un agente antes de ponerlo en producción.

Cada agente (nombre, personalidad, voz, idioma, guion base) se configura por separado, así que un mismo negocio puede tener varios agentes distintos para campañas distintas.

---

## Para negocios B2B: encontrar y llamar a tus clientes potenciales

Esta es la pieza pensada para quien vende a otros negocios y necesita una lista de a quién llamar, no solo un teléfono que suena.

**Prospect Finder** busca negocios reales por sector y ciudad (usando el mismo mapa de negocios que usa Google) y devuelve una lista con nombre, teléfono, web, valoración y número de reseñas. A cada negocio de la lista se le calcula al vuelo un puntaje de oportunidad: si no tiene web, si tiene pocas reseñas, si su valoración es baja — todo eso suma como "negocio con hueco para venderle algo".

De esa lista se puede importar en bloque a tu CRM, con dos decisiones que tú controlas:
- si querés que a cada negocio importado se le haga automáticamente una **auditoría digital** (ver más abajo), y
- si querés que se les **llame automáticamente** en cuanto entran, o prefieres revisarlos primero.

La **auditoría digital** es una revisión automática de la presencia online de un negocio: si su web carga rápido, si tiene HTTPS, si está optimizada para buscadores, si tiene redes sociales activas, si permite reservar cita o comprar online. Con eso arma un puntaje de "oportunidad" y un argumento de venta ya redactado — literalmente el texto que un comercial puede usar para explicarle a ese negocio por qué necesita mejorar su presencia digital. Se puede auditar un negocio a la vez o una campaña entera de una sola vez, y queda guardado el histórico de auditorías para ver si un negocio mejora con el tiempo.

También se puede subir una lista propia en CSV (nombre, teléfono, email, empresa) con la misma opción de llamar automáticamente o no a los importados.

---

## Para negocios B2C: anuncios que generan leads solos

Esta es la pieza pensada para quien vende directo al consumidor y necesita anuncios que traigan gente interesada, sin depender de una agencia.

El proceso es un asistente de tres preguntas: rubro del negocio, objetivo de la campaña, y presupuesto mensual. Con eso, VozIA genera solo:

- la **oferta** y el texto del anuncio,
- una **imagen** para el anuncio,
- una **página de aterrizaje** (landing) propia, donde cae la gente que hace clic,
- y publica la **campaña real en Meta** (Facebook e Instagram), lista para empezar a mostrarse.

Cuando alguien rellena el formulario del anuncio o de la landing, el sistema lo recibe en el momento y dispara automáticamente una llamada — sin que nadie tenga que revisar una bandeja de entrada ni exportar un Excel.

Además, cuando un lead que vino de un anuncio termina agendando una reunión, Meta se entera de eso (de forma segura, sin exponer datos personales en claro). Eso ayuda a que el propio sistema de anuncios de Meta aprenda a traer gente que realmente agenda, no solo gente que rellena un formulario y desaparece.

Desde el panel de cada campaña se puede ver cuánto se gastó, cuántos leads trajo, cuánto costó cada lead, y poner un tope de gasto o de costo-por-lead para que la campaña se pause sola si se dispara.

---

## El CRM que conecta todo

Todo lo anterior alimenta un CRM pensado para que un equipo comercial trabaje desde un solo sitio:

- **Leads**: ficha de cada contacto con sus datos reales, notas del equipo, archivos adjuntos y el historial de llamadas y reuniones.
- **Pipeline**: tablero de oportunidades por etapa (nuevo, calificado, propuesta, negociación, ganado/perdido), con indicadores calculados sobre los datos reales del negocio — mejores días y horas para llamar, oportunidades que llevan tiempo paradas.
- **Reuniones**: se agendan y quedan registradas con un enlace de videollamada asociado.
- **Agentes IA**: la configuración de cada agente de voz (personalidad, guion, idioma, voz).
- **Playbooks**: guiones y recetas de venta por vertical, organizables desde el panel de administración.
- **Knowledge Base**: una biblioteca de artículos de referencia (precios, objeciones, producto) para que el equipo tenga la información a mano.
- **Automatizaciones**: reglas del tipo "cuando pase X, hacé Y" — por ejemplo, actualizar el estado de un lead automáticamente cuando ocurre un evento concreto.
- **Insights**: paneles con la evolución de llamadas, leads, reuniones e ingresos.

---

## Buenas prácticas y cumplimiento normativo

Llamar por teléfono de forma automática tiene reglas, y VozIA las tiene en cuenta:

- Las llamadas solo se hacen dentro de un horario permitido según la zona horaria del número al que se llama.
- Si alguien pide durante una llamada que no lo vuelvan a llamar, queda registrado de forma permanente y no se le vuelve a marcar.
- Las llamadas se graban, con aviso durante la conversación.

Sigue pendiente confirmar que, desde el primer segundo de cada llamada, el agente se identifique explícitamente como un asistente de inteligencia artificial — la función para decirlo existe, pero es lo primero que hay que verificar antes de escalar el volumen de llamadas en cualquier país con normativa estricta sobre esto.

---

## Qué no incluye todavía

Para no vender humo: hoy VozIA **no** tiene integración real con calendarios externos (Google Calendar, Zoom) — las reuniones se registran con un enlace, pero no se crean solas en tu calendario. Tampoco hay integraciones activas con herramientas externas como HubSpot, Salesforce o Slack — si tu operación depende de alguna de esas, hoy no se conecta de forma automática. Y la ingesta de leads desde fuentes distintas a las ya descritas (un formulario propio, Google Ads) se puede construir cuando haga falta, pero no viene lista de fábrica.

Nada de esto bloquea usar la plataforma hoy para lo que ya hace bien: encontrar leads, llamarlos con un agente de IA que suena a persona, y llevar el seguimiento comercial en un solo sitio.
