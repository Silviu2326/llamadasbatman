Devuelvo solo el markdown.

```markdown
# Vendrava · Roadmap de producto — SprintMarkt

> Documento de trabajo para el equipo de desarrollo de Vendrava.
> Nivel C del diagnóstico de mercado: construir el foso real y defendible.
> Principio rector del producto: **que ninguna llamada perdida cueste un cliente.** Vendrava contesta, califica y agenda leads por voz y WhatsApp, con el equipo humano siempre al control.

## Contexto y encuadre

Este roadmap no persigue "más IA de voz". Persigue cerrar la brecha competitiva que hoy nos deja fuera de la conversación: **casi todos los rivales traen el origen del lead y nosotros no**, y ninguno tiene todavía un foso de datos en español que se defienda solo. El orden de prioridad de este documento responde a esa realidad: primero conectamos la entrada de leads (sin esto no hay producto vendible), después profundizamos por vertical donde ya tenemos un design partner real, y en paralelo empezamos a acumular el activo que nadie nos puede copiar rápido: datos propietarios de conversación y resultado en español.

Nota de altura y tono para todo lo que se construya (UI, copys de producto, materiales de venta): bajamos "convierte/cierra ventas" y subimos "contesta, califica, agenda, hace seguimiento". El equipo humano no se reemplaza; se apoya con IA. El cumplimiento normativo es un argumento de venta visible, no una nota legal al pie.

Los KPIs y cifras de ejemplo de este documento son ilustrativos/objetivo, no datos verificados.

---

## 1. Ingesta de leads (CRÍTICO — bloqueante de todo lo demás)

**Problema:** hoy Vendrava aparentemente no trae origen de leads. Sin entrada de leads no somos comparables con los rivales y el producto no es vendible como sistema de speed-to-lead. Esto es P0 absoluto.

**Objetivo:** que un lead entre por cualquiera de los canales habituales del cliente y Vendrava lo contacte por voz o WhatsApp en el menor tiempo posible, con trazabilidad de origen extremo a extremo.

### 1.1 Integración Meta Lead Ads
- Conexión OAuth con la cuenta de Meta Business del cliente; alta guiada sin tocar código.
- Suscripción a webhooks de `leadgen`: un lead enviado en Facebook/Instagram Lead Ads llega a Vendrava en menos de 60 segundos.
- Mapeo configurable de campos del formulario Meta a campos de lead de Vendrava (nombre, teléfono, email, campos personalizados).
- Reintentos con backoff y cola de reprocesamiento ante fallo de entrega; ningún lead se pierde silenciosamente.
- Se registra `campaña / conjunto de anuncios / anuncio / formulario` como origen para atribución posterior.

**Criterios de aceptación:**
- Un lead de prueba enviado desde una campaña Meta real dispara el primer intento de contacto (voz o WhatsApp) en < 60 s en el 95 % de los casos.
- Si el webhook falla, el lead queda en cola y se reintenta; no hay pérdida.
- El origen (campaña/anuncio/formulario) es visible en la ficha del lead.

### 1.2 Integración Google Lead Form Ads
- Conexión con Google Ads Lead Form extensions vía webhook con clave de validación (`lead_id`, `google_key`).
- Validación de firma/clave configurable por cliente.
- Mismo mapeo de campos y misma latencia objetivo que Meta.

**Criterios de aceptación:**
- Un lead de Google Lead Form llega y se contacta con la misma latencia objetivo (< 60 s, p95).
- La clave de validación rechaza payloads no firmados.

### 1.3 Webhooks de formularios genéricos
- Endpoint entrante por cliente (URL + secreto) para formularios web propios, landing pages, Typeform, Elementor, WordPress, etc.
- Payload documentado y ejemplos listos para copiar/pegar para el desarrollador del cliente.
- Mapeo de campos autoservicio desde el panel.
- Rate limiting y deduplicación por teléfono/email en ventana configurable.

**Criterios de aceptación:**
- Un `POST` de ejemplo documentado crea un lead y arranca el flujo de contacto.
- Dos envíos del mismo teléfono en < N minutos no generan dos llamadas duplicadas.
- Existe documentación pública de integración que un dev externo puede seguir sin soporte.

### 1.4 Importación de CRM existente
- Importación por CSV con asistente de mapeo de columnas y previsualización antes de confirmar.
- Conectores de arranque para los CRM habituales del mercado objetivo (empezar por HubSpot y una alternativa ligera; el resto vía CSV).
- Detección de duplicados contra leads ya existentes.
- Marcado explícito de si un lead importado debe entrar en un flujo de reactivación o solo cargarse como histórico (con base legal para el contacto).

**Criterios de aceptación:**
- Un CSV de 5.000 filas se importa con reporte de filas OK / erróneas / duplicadas.
- Ningún lead importado se contacta automáticamente sin que el cliente active explícitamente el flujo y confirme base legal.

### 1.5 Sincronización de calendario/agenda
- Conexión bidireccional con Google Calendar y Microsoft 365/Outlook.
- Lectura de disponibilidad real para que Vendrava solo ofrezca huecos libres.
- Escritura de la cita agendada como evento, con invitados y recordatorios.
- Manejo de zona horaria y de solapamientos; nunca doble-reserva.

**Criterios de aceptación:**
- Una cita agendada por Vendrava aparece en el calendario del cliente en < 30 s y bloquea el hueco.
- Si el hueco se ocupa en el calendario externo mientras el lead decide, Vendrava deja de ofrecerlo.
- Cambios/cancelaciones en el calendario externo se reflejan en Vendrava.

---

## 2. Profundidad vertical por MOTION

**Problema:** un CRM de voz genérico no defiende nada. La profundidad por vertical es lo que hace el producto pegajoso y difícil de sustituir. Dividimos en dos *motions* con economía y flujo distintos.

### Motion A — Servicios con cita (clínicas, veterinarias, peluquerías)

Volumen alto, ticket bajo, valor = ocupación de agenda y recuperación de huecos perdidos.

- **Integraciones de agenda/booking:** además del calendario genérico (1.5), conectores con sistemas de reserva sectoriales habituales; si no hay API, agendado sobre calendario estándar.
- **Recordatorios de cita** por voz y WhatsApp, con confirmación/cancelación gestionada por el lead.
- **Recuperación de no-shows:** detección de cita no atendida y flujo automático de reagenda dentro de las X horas siguientes.
- **Reactivación de pacientes/clientes inactivos** con base legal explícita.
- **Plantillas por servicio** (p. ej. "primera visita", "revisión", "vacunación", "corte + color") con guion, duración y preparación específicos.

**Criterios de aceptación:**
- Una cita marcada como no-show dispara un intento de reagenda automático en la ventana configurada.
- El cliente puede activar una plantilla de servicio y quedar operativa sin escribir guion desde cero.
- Confirmación/cancelación por WhatsApp actualiza el estado de la cita y libera el hueco en calendario.

### Motion B — Venta de ticket alto (concesionarios, inmobiliaria)

Volumen menor, ticket alto, ciclo largo, valor = calificar y hacer avanzar oportunidades caras sin dejarlas enfriar. **Design partner: un concesionario real dispuesto a validar el flujo (a conseguir; no asumir clientes existentes).**

- **Integración DMS / portales:** entrada de leads desde portales del sector (para automoción: Coches.net, Milanuncios; para inmobiliaria: Idealista, Fotocasa) y volcado/lectura contra el DMS o gestor de inventario del cliente.
- **Calificación de presupuesto y financiación:** el flujo recoge rango de presupuesto, forma de pago, interés en financiación y datos de calificación previa, sin prometer aprobaciones ni dar asesoramiento financiero.
- **Workflows de test-drive / visita:** agendar prueba de conducción o visita al inmueble, con recordatorio, confirmación y recuperación si no se presenta.
- **Traspaso a comercial (handoff):** cuando el lead está caliente o calificado, pase claro y con contexto al comercial humano.

**Criterios de aceptación (con un concesionario como design partner):**
- Un lead entrante de un portal de automoción se califica (presupuesto, financiación sí/no, vehículo de interés) y, si procede, agenda test-drive.
- El comercial del concesionario recibe el lead calificado con resumen de la conversación y próximos pasos.
- El concesionario valida en uso real que el flujo le ahorra tiempo de primer contacto y no genera fricción con su proceso comercial.
- Ninguna afirmación del flujo promete financiación garantizada ni condiciones concretas no verificadas.

---

## 3. Flywheel de datos (EL FOSO)

**Problema:** cualquiera integra una API de voz. Lo que nadie puede copiar rápido es **un corpus propietario de conversación + resultado en español**, por vertical, que nos diga qué patrones de conversación agendan y cuáles no. Ese es el activo defendible a medio plazo.

**Objetivo:** convertir cada llamada/conversación en dato estructurado que alimente y mejore el "Guru Supervisor", hasta poder sostener un claim de resultado: *IA que aprende qué patrones de conversación agendan más citas en llamadas en español.* (Claim de resultado, no de magia; medible.)

- **Captura estructurada** de cada conversación: transcripción, intención detectada, objeciones, resultado (agendó / no agendó / no interesado / no contactado), vertical y dialecto.
- **Etiquetado de resultado enlazado al resultado real** (cita cumplida, no-show, venta cuando el cliente lo comparte), no solo al desenlace de la llamada.
- **Bucle de mejora del Guru Supervisor:** los patrones que correlacionan con agendar se convierten en recomendaciones de guion por vertical.
- **Gobernanza del dato:** consentimiento y base legal para el uso del dato agregado; separación entre dato del cliente y modelo agregado anonimizado; el cliente conserva la titularidad de sus datos.
- **Panel de aprendizaje:** el cliente ve qué está funcionando en sus conversaciones (no solo métricas de volumen).

**Criterios de aceptación:**
- Cada conversación queda almacenada con resultado estructurado y dialecto/vertical asociados.
- Existe al menos un ciclo demostrable en el que un patrón detectado en datos reales cambia una recomendación de guion y esa recomendación se mide.
- El uso de datos para mejora agregada está cubierto por consentimiento y anonimización auditables.
- El claim de resultado se sostiene con una métrica interna real (tasa de agenda por variante), no con una cifra inventada.

---

## 4. Compliance por geografía COMO FEATURE de producto

**Problema:** el cumplimiento suele tratarse como carga legal. Para nosotros es diferenciador de venta: en un mercado donde muchos operadores de IA de voz están en zona gris, ser el que llega con aviso de IA, consentimiento y control humano de serie es un argumento comercial. Además, el **EU AI Act, artículo 50** obliga a informar de que se interactúa con una IA, con aplicación relevante a partir de agosto de 2026.

- **Aviso de IA al inicio de la llamada:** locución automática y configurable que informa de que se habla con un asistente de IA, con registro de que se emitió. Cumple EU AI Act Art. 50.
- **Gestión de consentimiento:** captura y almacenamiento del consentimiento (grabación, tratamiento de datos, contacto), con marca de tiempo y base legal por lead.
- **Control humano / handoff:** el operador humano puede escuchar, intervenir y tomar el control de la conversación en cualquier momento; nunca hay automatización sin salida humana.
- **Trazabilidad:** registro auditable de qué se dijo, qué se consintió, cuándo se avisó de la IA y quién intervino.
- **Perfiles por geografía:** conjunto de reglas por territorio (RGPD/España como base; horarios legales de contacto; marcos aplicables en mercados LATAM objetivo) seleccionables por cliente.
- **Empaquetado como material de venta:** one-pager y sección en la web/demo que presenta el cumplimiento como ventaja ("tu equipo, con IA de apoyo, avisando siempre y con control humano").

**Criterios de aceptación:**
- Toda llamada saliente/entrante gestionada por IA emite el aviso de IA y lo deja registrado.
- El consentimiento queda almacenado con marca de tiempo, base legal y territorio.
- Un humano puede tomar el control de una conversación en curso y queda registrado el handoff.
- El cliente puede seleccionar un perfil de geografía y el sistema aplica sus reglas (p. ej. franjas horarias de contacto).
- Existe material de venta que presenta el cumplimiento como argumento, sin claims legales falsos.

---

## 5. Calidad de voz ES/EN por dialecto y guardarraíles de margen

**Problema:** una voz que suena "latina neutra" a un cliente en Valencia resta credibilidad; y el coste de voz por minuto puede comerse el margen si no se controla. Calidad por dialecto y control de COGS van juntos.

- **Voces por dialecto:** español ibérico (peninsular), español mexicano y español rioplatense como conjuntos diferenciados, más inglés; selección por cliente/campaña.
- **Coherencia dialectal:** léxico y expresiones acordes al dialecto (p. ej. peninsular: "coche/móvil", euros); nada de mezclas incoherentes.
- **Guardarraíles de margen:** medición de COGS de voz por minuto por proveedor; alertas y límites de gasto por cliente/campaña; selección de proveedor/voz según relación calidad-coste.
- **Fallback controlado:** si un proveedor sube de precio o cae, conmutación a alternativa sin degradar calidad por debajo de un umbral.
- **Panel de coste por minuto** visible para operaciones internas, con margen por cliente.

**Criterios de aceptación:**
- El cliente selecciona dialecto y la voz resultante es coherente en léxico y acento (validado por escucha humana en cada dialecto ofrecido).
- El COGS de voz por minuto se mide por conversación y se agrega por cliente/campaña.
- Existe un límite de gasto configurable que frena o alerta antes de comprometer margen.
- Un cambio de proveedor no baja la calidad por debajo del umbral definido.

---

## Secuenciación (qué primero)

El orden no es negociable en su primer tramo: sin ingesta no hay producto, y sin cumplimiento no hay venta creíble ni cobertura ante el AI Act.

**Fase 0 — Bloqueante (ahora):**
1. **Ingesta de leads (bloque 1)**, empezando por Meta Lead Ads + webhooks genéricos + sincronización de calendario. Es lo que nos hace comparables con los rivales.
2. **Aviso de IA + consentimiento + handoff humano (bloque 4, núcleo)**. Requisito legal (AI Act, ago 2026) y argumento de venta desde el día uno. Se construye en paralelo a la ingesta, no después.

**Fase 1 — Profundidad donde ya tenemos tracción:**
3. **Motion B con un concesionario como design partner (a conseguir) (bloque 2B)**: caso real, feedback real, referencia vendible. En paralelo, arrancar la **captura estructurada de datos (bloque 3, captura)**, porque cada conversación desde ya debe generar activo.
4. **Google Lead Form + import de CRM (resto del bloque 1)**.

**Fase 2 — Motion A y calidad:**
5. **Motion A servicios con cita (bloque 2A)**: recordatorios, no-shows, plantillas. Alto volumen, buen generador de datos.
6. **Calidad de voz por dialecto + guardarraíles de margen (bloque 5)**, priorizando ibérico primero.

**Fase 3 — Cierre del foso:**
7. **Bucle de mejora del Guru Supervisor (bloque 3, aprendizaje)** y **perfiles de compliance por geografía / LATAM (bloque 4, ampliación)**. Aquí el claim de resultado empieza a sostenerse con datos propios.

Regla de oro de secuenciación: **nada avanza de fase sin superar las métricas de gate.**

---

## Métricas de gate

Umbrales que deben cumplirse para justificar seguir invirtiendo en cada fase. Cifras ilustrativas/objetivo, a ajustar con datos reales.

**Gate de ingesta (Fase 0):**
- Latencia de primer contacto < 60 s en p95 de leads entrantes.
- < 1 % de leads perdidos por fallo de integración (medido, no estimado).

**Gate de cumplimiento (Fase 0):**
- 100 % de llamadas con aviso de IA emitido y registrado.
- 100 % de conversaciones con base legal y consentimiento trazables.

**Gate de producto/retención (para pasar a expandir):**
- **Retención de clientes > 85 % a 90 días** (logo retention). Si un cliente no sigue a los 90 días, el producto no ha demostrado valor suficiente.
- Al menos un design partner real (p. ej. un concesionario o una clínica) usando el producto en producción y dispuesto a ser referencia.

**Gate de negocio:**
- **ARR real** creciendo mes a mes con clientes de pago (no pilotos gratis contados como ingreso).
- Margen bruto por cliente positivo tras aplicar guardarraíles de COGS de voz (bloque 5): si un cliente no es rentable a nivel unitario, se revisa antes de escalar.

**Gate de foso (para validar la Fase 3):**
- Volumen de conversaciones etiquetadas con resultado suficiente para que el Guru Supervisor produzca al menos una recomendación de guion medible por vertical.
- Diferencia medible en tasa de agenda entre variantes de guion recomendadas por datos vs. base: prueba de que el flywheel funciona.
```