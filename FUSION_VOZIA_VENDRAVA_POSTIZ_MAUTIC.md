# Vendrava completo: qué es, qué partes lo forman y por qué no es solo un CRM


---

## En una oración

**Vendrava es una plataforma de marketing y ventas que, bajo una sola marca, atrae clientes, conversa con ellos, los nutre y ayuda a cerrarlos — con los datos en casa del negocio.**

No es un CRM más. No es solo un chatbot. Es una pila de cuatro herramientas que, juntas, cubren todo el embudo de ventas.

---

## Las cuatro piezas, explicadas como si fueras nuevo

### 1. Vendrava (la parte que ya conocían algunos)

Vendrava empezó como un software para negocios que reciben leads por teléfono o WhatsApp y necesitan responder rápido antes de que el cliente se vaya con la competencia.

Hace cosas como:

- Atender WhatsApp de clientes con un agente de IA.
- Contestar llamadas entrantes.
- Decirle al comercial qué hacer después de cada conversación ("llámalo mañana a las 10", "envíale la propuesta", etc.).
- Dejar que un humano revise y apruebe acciones importantes antes de que se ejecuten.
- Adaptar horarios de llamada y reglas de privacidad según el país.

Su punto fuerte: **reaccionar rápido a lo que ya está entrando**.

Su punto débil: **no salía a buscar clientes nuevos**. Si nadie llamaba o escribía, Vendrava no hacía nada.

### 2. VozIA (el motor de generación de demanda)

VozIA es otro producto que se construyó para salir a buscar clientes en vez de esperar a que lleguen.

Hace cosas como:

- Hacer llamadas salientes automáticas con una voz de IA que suena natural.
- Buscar negocios reales por sector y ciudad (por ejemplo, "todas las clínicas dentales de Valencia que no tienen web") y puntuar cuáles son mejores oportunidades.
- Crear campañas de anuncios en Meta (Facebook/Instagram) en tres preguntas: genera el copy, la imagen, la landing y publica.
- Auditar la presencia digital de un negocio y escribir un argumento de venta personalizado.
- Llevar un CRM con leads, pipeline, reuniones y notas.

Su punto fuerte: **generar demanda que no existía**.

Su punto débil: **no tenía WhatsApp ni llamada entrante**. Era saliente o nada.

### 3. Postiz (la parte social)

Postiz es una herramienta para programar publicaciones en redes sociales. Piensa en algo tipo Buffer o Hootsuite, pero open-source y con IA.

Hace cosas como:

- Programar posts en Instagram, LinkedIn, X, etc.
- Medir qué publicaciones funcionan.
- Dejar que un equipo colabore en el calendario de contenidos.
- Conectarse por API con otras herramientas.

Su rol en Vendrava: **mantener la presencia orgánica del negocio en redes**. No todos los clientes quieren pagar anuncios todo el año. Postiz cubre el lado barato y sostenible: publicar contenido propio.

### 4. Mautic (la parte de email)

Mautic es una plataforma de automatización de marketing. Piensa en algo tipo Mailchimp o ActiveCampaign, pero open-source y self-hosted.

Hace cosas como:

- Guardar contactos y segmentarlos.
- Enviar secuencias de emails automáticas.
- Reactivar leads que no respondieron.
- Medir aperturas, clics y conversiones.

Su rol en Vendrava: **nutrir leads que no están listos para comprar hoy**. La mayoría de los leads no compran a la primera. Sin Mautic, esos leads se pierden.

---

## Por qué juntar todo bajo Vendrava

Hoy un negocio que quiera cubrir todo el embudo necesita contratar varias herramientas sueltas:

- Una para publicar en redes (Postiz).
- Una para anuncios pagados y prospección (VozIA).
- Una para atender WhatsApp y llamadas (Vendrava).
- Una para emails automáticos (Mautic).
- Y encima un CRM para no perder el hilo.

Eso significa: varios logins, datos que no se hablan, facturas distintas y equipos de soporte que se pasan la bola.

La propuesta es simple: **que todo eso viva en un solo panel, bajo una sola marca, con una sola base de clientes.**

La marca que se queda es Vendrava, porque ya está posicionada y tiene clientes. Por dentro, el motor es la suma de las cuatro piezas.

---

## Cómo se ve esto en la vida real

Imagina una clínica dental que usa Vendrava.

**Lunes 09:00.** La clínica activa una campaña. Vendrava le genera el anuncio de Instagram, la imagen, el copy y la landing. Al mismo tiempo, Postiz le programa 4 posts orgánicos para la semana.

**Lunes 14:30.** Vendrava busca otras clínicas de la zona sin web propia y le entrega una lista de 12 negocios con teléfono y argumento de venta.

**Martes 08:12.** Alguien hace clic en el anuncio, deja su teléfono. Vendrava llama en segundos, detecta interés y agenda una cita.

**Martes 08:20.** A uno de los negocios de la lista se le envía un WhatsApp: "Vimos que no tenéis reservas online, ¿queréis ver cómo funciona?".

**Martes 11:30.** Un lead no contestó la llamada del lunes. Vendrava reintenta sin machacar.

**Miércoles 09:00.** El equipo comercial abre Vendrava. Cada lead tiene transcript de llamada, intención detectada, objeción, próxima acción sugerida y, si vino de la prospección, la auditoría digital del negocio.

**Jueves 10:00.** Un lead dijo "déjame pensarlo". Mautic le envía automáticamente un email con un caso de éxito de otra clínica.

**Viernes 16:00.** La clínica cierra un nuevo paciente. Todo vino del mismo sitio.

Eso es lo que ninguna de las cuatro piezas sola puede contar completo.

---

## Cómo se conectan técnicamente

No se fusionan todas las bases de datos en un solo monstruo. Cada pieza hace lo suyo y se habla por API y webhooks.

- **Vendrava** es el sistema maestro de leads y oportunidades.
- **VozIA** alimenta leads generados por voz, anuncios y prospección.
- **Postiz** recibe de VozIA/Vendrava el copy y la imagen para generar posts orgánicos, y avisa cuando alguien interactúa en redes.
- **Mautic** recibe contactos de Vendrava, los nutre por email y avisa cuando el lead abre o cliquea.

Cada uno puede correr en su propio contenedor bajo la infraestructura de Vendrava. Por ejemplo:

- `app.vendrava.com` → panel principal.
- `social.vendrava.com` → Postiz.
- `email.vendrava.com` → Mautic.

El usuario ve una sola marca. Por dentro son servicios independientes que se sincronizan.

---

## Qué cambia para el cliente

No tiene que saber nombres como VozIA, Postiz o Mautic. Para él, Vendrava simplemente ahora hace más cosas:

- Antes: "Vendrava contesta rápido lo que le llega".
- Ahora: **"Vendrava atrae, captura, conversa, nutre y cierra clientes — todo en uno."**

El cliente puede empezar solo con la parte que necesite:

- **Plan básico**: solo reacción rápida (WhatsApp, llamada entrante, next-best-action).
- **Plan crecimiento**: además, generación de demanda (anuncios, prospección, llamadas salientes).
- **Plan completo**: además, redes sociales y email marketing.

Nadie paga por lo que no usa.

---

## Cómo se construye esto sin romper nada

### Fase 0 — lo que ya existe, disponible desde el día uno

- Todo el motor de VozIA: llamadas, prospección, anuncios, auditoría, CRM base.
- Postiz y Mautic montados como servicios independientes, aún sin activar para clientes.

### Fase 1 — lo urgente

- WhatsApp integrado al motor conversacional.
- Cumplimiento por mercado (horarios legales, lista de no llamar, avisos de IA).
- Un solo login para Vendrava, Postiz y Mautic.

### Fase 2 — lo que completa el círculo

- Llamada entrante con el mismo agente de voz.
- Motor de "próxima acción recomendada".
- Webhooks entre Vendrava y Postiz/Mautic para que todo fluya.

### Fase 3 — confianza

- Cola de aprobación humana para acciones sensibles.
- Paquetes por sector: cada rubro trae guion de voz + receta de anuncio + calendario social + secuencia de email + reglas de cumplimiento.

### Fase 4 — limpieza interna

- Unificar la arquitectura de supervisión de la IA.
- Auditar que el aviso de IA se escuche en todos los mercados.
- Consolidar logs y monitoreo de los cuatro servicios.

---

## Qué esto NO es

- **No es pegarle un logo a VozIA.** Vendrava aporta WhatsApp, llamada entrante, aprobación humana y next-best-action, cosas que VozIA no tenía.
- **No es reemplazar el CRM por Mautic.** Mautic gestiona contactos y emails; el CRM gestiona leads, pipeline y reuniones.
- **No es reemplazar los anuncios de VozIA por Postiz.** Postiz es orgánico; los anuncios son pagados. Se complementan.
- **No es obligar a todos los clientes a usar todo.** Cada negocio usa lo que paga.
- **No es una integración superficial de cuatro SaaS.** Se monta bajo la IP e infraestructura de Vendrava, con los datos del cliente en casa.

---

## Riesgos reales

- **Cuatro sistemas son más difíciles de operar que uno.** Hace falta un equipo que sepa mantenerlos, actualizarlos y monitorearlos.
- **Mautic está en PHP; el resto, en Node/Next/Nest.** Eso significa dos culturas de despliegue distintas.
- **Postiz usa Temporal**, un orquestador de tareas. Añade complejidad operativa.
- **La sincronización de contactos puede romperse.** Hay que definir un único ID maestro por persona desde el primer día.
- **El cliente puede sentirse abrumado.** Hay que mostrar solo las funciones que contrató, no las cuatro pestañas a la vez.
- **No se puede activar todo para todos el mismo día.** Cada canal nuevo hay que probarlo con un par de clientes antes de abrirlo al resto.

---

## Cómo se sabe si funcionó

1. Ningún cliente actual de Vendrava siente que perdió algo.
2. Los clientes nuevos empiezan a usar al menos una pieza de generación de demanda.
3. Algunos clientes usan generación de demanda + reacción multicanal al mismo tiempo.
4. Dejan de contratar herramientas externas para redes y email.
5. Soporte no escucha "esto lo hacía el otro sistema".
6. Aparece al menos un caso real de un negocio que cubrió todo el embudo con Vendrava.

---

## Cierre

La idea no es complicar Vendrava. Es terminar de armar lo que un negocio real necesita para vender hoy: estar donde están los clientes, hablarles por el canal que prefieran, no perderlos si no compran a la primera, y darle al comercial el contexto para cerrar.

VozIA, Postiz y Mautic no se integran porque sí. Se integran porque cada uno cubre un hueco que, si no cubre Vendrava, el cliente cubre con otra herramienta suelta. Y eso es exactamente lo que Vendrava quiere dejar de ser: una pieza suelta más.
