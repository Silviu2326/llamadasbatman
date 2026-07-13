# Especificación funcional de módulos

Este documento traduce el catálogo de producto a unidades implementables. Cada módulo se describe por objetivo, MVP, vistas, entidades, acciones y límites. La presencia de un nombre en el catálogo no significa que deba existir una página separada.

## Formato de una especificación

Cada módulo nuevo debe conservar esta estructura:

```text
Objetivo
Usuario principal
Entrada
Flujo principal
Entidad principal
Vistas necesarias
Acciones persistentes
Integraciones
Eventos emitidos
Permisos
Métricas
Fuera de alcance del MVP
```

## 1. Captación

### Campañas y ADS

**Objetivo:** coordinar campañas de pago y orgánicas, conservar su atribución y conectar las conversiones con el pipeline.

**Vistas:** resumen, lista, detalle, creatividades, audiencias, presupuesto, conversiones e historial.

**Acciones:** crear campaña, conectar canal, publicar/pausar, duplicar, cambiar presupuesto, asociar landing/formulario, exportar resultados.

**Entidades:** `Campaign`, `CampaignAsset`, `Audience`, `AttributionTouch`, `AdAccount`.

**MVP:** campañas internas con fuente/canal, presupuesto, estado y métricas; integración externa solo cuando existan credenciales y sincronización segura.

**No hacer todavía:** presentar cifras simuladas como si vinieran de Meta, Google o TikTok. Si los datos no están sincronizados, mostrar claramente “datos de demostración” o “pendiente de conexión”.

### Prospect Finder y Scraping

**Objetivo:** descubrir empresas o contactos y convertir resultados revisados en leads.

**Vistas:** configuración del job, progreso, resultados, duplicados, importación y listas guardadas.

**Flujo:** definir fuente y criterios → ejecutar job → mostrar progreso → revisar resultados → deduplicar → importar seleccionados → registrar origen.

**Entidades:** `ProspectingJob`, `ProspectResult`, `ImportBatch`, `LeadSource`.

**Guardas:** límites por plan, rate limit, robots/condiciones del proveedor, consentimiento y trazabilidad de origen. No almacenar datos personales sin política de retención.

### SEO

**Objetivo:** controlar oportunidades de búsqueda y salud técnica sin crear tres productos inconexos.

**Tabs:** Resumen, Palabras clave, Auditorías, Posicionamiento, Competidores, Contenido.

**Entidades:** `SeoProject`, `Keyword`, `SeoAudit`, `RankingSnapshot`, `ContentBrief`.

**MVP:** proyecto, dominio, keywords, snapshots de posición y auditoría con severidad.

**Acciones:** crear proyecto, importar keywords, ejecutar auditoría, asignar incidencia, crear brief, exportar.

**Eventos:** `seo.audit.completed`, `seo.issue.assigned`, `seo.ranking.changed`.

### Google Business

**Objetivo:** gestionar presencia local, reseñas y publicaciones desde la ficha de ubicación.

**Tabs:** Ubicaciones, Reseñas, Publicaciones, Preguntas, Métricas.

**Entidades:** `BusinessLocation`, `Review`, `BusinessPost`, `ReviewReply`.

**MVP:** conexión de ubicación, lista de reseñas, estado de respuesta y borradores de publicación.

**Regla:** responder una reseña debe registrar autor, fecha, texto enviado y resultado del proveedor.

### Landings, Funnels y Formularios

**Objetivo:** crear activos de conversión y medir su rendimiento.

**Vistas:** activos, editor, preview, respuestas, conversiones y versiones.

**Entidades:** `Landing`, `Funnel`, `FunnelStep`, `Form`, `FormField`, `FormSubmission`.

**MVP:** editor visual básico, preview, publicación, versión y conexión a campaña/lead.

**Acciones:** crear, duplicar, editar, publicar, despublicar, probar, ver respuestas y exportar.

**Seguridad:** el endpoint público de formulario debe tener rate limit, honeypot/CAPTCHA configurable, validación de campos y protección contra duplicados.

### Bases de datos, Eventos, Afiliados y Referidos

Agruparlos bajo `Fuentes externas` si todavía no tienen suficiente volumen para ocupar una entrada visible.

| Capacidad | Entidad | Flujo MVP |
| --- | --- | --- |
| Bases de datos | `ImportBatch` | subir CSV → mapear columnas → validar → importar |
| Eventos | `Event`, `Registration` | crear evento → landing/formulario → asistentes → seguimiento |
| Afiliados | `Partner`, `ReferralLink`, `Commission` | crear partner → enlace → conversiones → comisión |
| Referidos | `ReferralProgram`, `Referral` | configurar reglas → registrar referido → validar → premiar |
| Audiencias | `Audience`, `AudienceRule` | definir reglas → calcular miembros → sincronizar |

## 2. Conversación

### Inbox Unificado

**Objetivo:** que el equipo gestione todos los hilos desde una cola común sin perder el canal original.

**Layout:** lista de conversaciones, panel de hilo, panel de contacto/contexto.

**Filtros:** asignado, equipo, canal, estado, prioridad, sentimiento, última actividad y SLA.

**Acciones:** responder, asignar, etiquetar, cerrar, reabrir, transferir, crear tarea, convertir a oportunidad, insertar plantilla.

**Entidades:** `Conversation`, `Message`, `ConversationAssignment`, `ConversationTag`, `MessageTemplate`.

**MVP de canales:** implementar primero el canal que tenga conexión de producción disponible. Los demás pueden aparecer como “conectar canal”, nunca como bandejas falsas.

### Canales

WhatsApp, Chat Web, Instagram DM, Facebook Messenger, Telegram y SMS deben adaptarse al mismo contrato interno de mensaje:

```text
conversationId
direction: inbound | outbound
channel
sender
recipient
body
attachments
providerMessageId
status: queued | sent | delivered | read | failed
occurredAt
```

### Llamadas, videollamadas y voz IA

Usar la llamada como una conversación especializada con metadatos de duración, participantes, grabación, transcripción, resultado, transferencia y coste.

**Tabs:** resumen, participantes, transcripción, grabación, sentimiento, eventos técnicos y seguimiento.

### Plantillas, transcripciones, grabaciones y sentimiento

Son capacidades transversales del objeto conversación, no cuatro páginas obligatorias del sidebar.

- Plantillas: catálogo por canal y equipo.
- Transcripciones: documento asociado a llamada/videollamada.
- Grabaciones: asset protegido con URL firmada y caducidad.
- Sentimiento: resultado versionado con modelo, confianza y posibilidad de revisión humana.

## 3. Nutrición

### Automatizaciones y Secuencias

**Objetivo:** ejecutar acciones fiables sobre eventos de negocio.

**Componentes:** trigger, condiciones, ramas, acciones, esperas, reintentos y logs.

**Triggers iniciales:** lead creado, formulario enviado, etapa cambiada, mensaje recibido, llamada finalizada, evento registrado, tiempo transcurrido.

**Acciones iniciales:** crear tarea, asignar propietario, enviar email, enviar mensaje, añadir etiqueta, entrar en secuencia, actualizar campo, notificar equipo.

**Regla:** toda ejecución tiene `runId`, estado, pasos, timestamps, error y reintento.

### Email Marketing, Newsletter y Campañas multicanal

Unificar campaña y mensaje, diferenciando:

- campaña: objetivo, audiencia y calendario;
- envío: ejecución de un canal;
- plantilla: contenido reutilizable;
- variante: versión para pruebas.

El centro de preferencias debe permitir darse de baja por categoría y canal, no solo mediante un booleano global.

### Lead Scoring y Audiencias dinámicas

El scoring debe ser explicable:

```text
score total = datos firmográficos + comportamiento + interacción - señales negativas
```

Guardar las reglas y el motivo de cada cambio de score. No recalcular silenciosamente sin historial.

### Contenido IA, calendario editorial y Push

Crear un espacio de trabajo de contenidos con estados `idea`, `borrador`, `revisión`, `aprobado`, `programado`, `publicado` y `archivado`. Los textos generados por IA deben guardar modelo, prompt/version, autor de revisión y fecha.

## 4. Ventas

### Leads, Contactos, Empresas y Clientes

No duplicar ficha por estado. Un contacto puede ser lead y después cliente; el estado comercial es una propiedad o relación, no una entidad duplicada.

**Vistas:** lista, segmentos, ficha y timeline.

### Oportunidades y Pipeline

**Vistas:** kanban, lista, forecast y ficha.

**Campos mínimos:** nombre, valor, moneda, etapa, probabilidad, fecha estimada de cierre, propietario, empresa, contactos, fuente y motivo de pérdida.

**Acciones:** mover etapa, asignar, añadir actividad, crear presupuesto, marcar ganada/perdida, reabrir con permiso.

### Presupuestos, Contratos, Facturación y Cobros

Estas capacidades deben vivir dentro de la oportunidad/cliente y tener vistas globales administrativas.

| Objeto | Ciclo de vida |
| --- | --- |
| Presupuesto | borrador → enviado → aceptado/rechazado → caducado |
| Contrato | borrador → enviado → firmado → cancelado |
| Factura | borrador → emitida → vencida/pagada/anulada |
| Cobro | pendiente → iniciado → confirmado/fallido/reembolsado |

No implementar facturación real sin decidir proveedor, moneda, impuestos, numeración, conciliación y requisitos legales.

### Productos, Catálogo, Objetivos y Comisiones

El catálogo es una fuente de productos; una oportunidad contiene líneas de producto; objetivos y comisiones se calculan sobre eventos comerciales auditados.

## 5. Operaciones

### Centralita

**Vistas:** monitor, números, IVR, colas, horarios, calidad y configuración.

**Entidades:** `PhoneNumber`, `IvrFlow`, `Queue`, `BusinessHours`, `CallRecording`, `QualityReview`, `LiveSession`.

**MVP:** estado de números, colas, horarios y monitor básico con eventos en tiempo real.

**No mezclar:** la configuración de telefonía no debe estar en la pantalla de cada llamada.

## 6. IA

### Catálogo de IA

Agrupar Prompts, Modelos, Voces, Conocimiento, Memorias, Evaluaciones, Simulador y Biblioteca dentro de un catálogo gobernado.

**Objeto Agent:** instrucciones, modelo, voz, herramientas, conocimiento, memoria, límites, versión y estado.

**Publicación:** guardar versión inmutable, ejecutar evaluaciones mínimas, solicitar aprobación si el riesgo lo exige y publicar la versión.

### Evaluaciones y Simulador

Una evaluación debe definir dataset, criterios, versión del agente, modelo evaluador, puntuaciones y fallos. El simulador debe marcar claramente que no es una conversación real.

### Agentes compartidos

Compartir una referencia versionada y permisos de uso, no copiar secretos ni configuraciones privadas de una organización a otra.

## 7. Analítica

### Dashboard Ejecutivo

Widgets iniciales: ingresos, pipeline, conversión, leads por fuente, tiempo de respuesta, llamadas, coste por adquisición y forecast.

Cada widget debe declarar métrica, filtros, rango temporal, zona horaria y fuente de datos.

### Embudos, ROI, Atribución y Forecast

- Embudo: etapas y población, con definición de entrada/salida.
- ROI: inversión, ingresos atribuidos y ventana de atribución.
- Atribución: first touch, last touch, lineal o modelo elegido.
- Forecast: valor ponderado, escenario y fecha de corte.

No mostrar ROI si faltan costes o ingresos; mostrar “sin datos suficientes”.

### Informes y Exportaciones

Los informes guardan consulta, columnas, filtros, permisos y programación. Las exportaciones grandes se crean como jobs con estado y enlace temporal.

## 8. Sistema

### Usuarios, Roles y Equipos

Separar identidad, pertenencia a organización, rol y equipo. Un usuario puede pertenecer a varios equipos y tener permisos por rol más excepciones explícitas.

### API, Webhooks e Integraciones

Usar claves rotables, scopes, firma de webhooks, reintentos y logs de entrega. Una integración desconectada debe conservar el historial y bloquear solo las acciones que dependen de ella.

### Marketplace, Logs, Auditoría y Suscripción

Marketplace instala capacidades declaradas. Logs técnicos no sustituyen a Auditoría de negocio. Facturación y Suscripción deben ser un subdominio coherente, no dos pantallas sin relación.
