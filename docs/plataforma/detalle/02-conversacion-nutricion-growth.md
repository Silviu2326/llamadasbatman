# Conversación, Nutrición y Growth — guía funcional detallada

## 0. Cómo leer esta guía

Este documento está pensado para una persona que conoce el negocio, pero nunca ha visto la plataforma. Describe qué páginas existen, para qué sirven y qué ocurre realmente cuando se usan.

La referencia de navegación es `src/components/Sidebar.jsx` y las rutas efectivas están registradas en `src/App.jsx`. La evidencia técnica se ha contrastado con los componentes/páginas, hooks y utilidades frontend, las rutas/controllers/services de `backend/src` y los modelos de `backend/prisma/schema.prisma`.

### Convenciones de estado

| Marca | Significado |
|---|---|
| **Código real** | La pantalla consulta o muta datos de la organización mediante API y el backend los persiste o calcula. |
| **Fallback demo** | Texto, imagen, icono, catálogo de sugerencias o valor visual definido en frontend. No debe interpretarse como dato de negocio. |
| **Proveedor externo** | La operación depende de Resend, Twilio, WhatsApp, Deepgram, Cerebras, ElevenLabs u otro servicio fuera del CRM. |
| **Parcial / pendiente** | La interfaz existe, pero hay controles, métricas o integraciones que todavía no tienen contrato completo o no se ejecutan desde esa vista. |

### Mapa rápido

| Grupo de Sidebar | Página | Ruta | Problema principal |
|---|---|---|---|
| Conversación | Inbox | `/conversacion/inbox` | Evitar que los leads y sus mensajes queden repartidos por canales sin contexto. |
| Conversación | Llamadas | `/llamadas` | Revisar volumen, resultado, intención y seguimiento de las llamadas. |
| Conversación | Agentes IA | `/agentes` | Configurar qué agentes de voz existen y qué instrucciones persistentes tienen. |
| Conversación | Playbooks | `/playbooks` | Convertir prácticas comerciales repetibles en guías reutilizables. |
| Conversación | Test de Voz | `/voz/test` | Probar audio bidireccional, transcripción, latencia e interrupciones antes de operar. |
| Nutrición | Email marketing | `/email-marketing` | Nutrir contactos con campañas gobernadas, audiencia, plantillas y métricas. |
| Nutrición | Automatizaciones | `/automatizaciones` | Ejecutar seguimientos y acciones repetibles a partir de eventos. |
| Growth | Growth Hub | `/growth` | Coordinar iniciativas de captación, newsletter, automatización, ventas y fidelización. |

### Dependencias comunes

- Todas las páginas son rutas protegidas por `ProtectedRoute`; el frontend usa `apiFetch`, que añade la sesión autenticada.
- El backend identifica la organización mediante `orgId` del JWT y cada servicio debe filtrar por ese tenant.
- La visibilidad de la entrada de Sidebar usa `src/lib/navigationPermissions.js`; la autorización real se vuelve a comprobar en backend con `requirePermission`.
- Los estados de carga, error y vacío son intencionados: una tarjeta vacía no equivale a un dato cero ni a una demo.
- Las páginas de detalle conectadas desde estas áreas son `/llamadas/:id`, `/agentes/:id`, `/playbooks/:id` y `/automatizaciones/:id`.

---

## 1. Inbox — centro de conversaciones

### Propósito y problema que resuelve

Inbox es la bandeja operativa omnicanal. Resuelve el problema de atender a un lead mirando solo un canal aislado: en un mismo hilo se puede ver el contacto, su procedencia, sus consentimientos, la oportunidad relacionada, mensajes de WhatsApp/email/voz y notas internas.

La pantalla no es un simple buzón. Su objetivo es que el usuario pueda decidir y ejecutar el siguiente paso sin abandonar el contexto comercial.

### Usuarios

- Atención comercial y SDR que responden a leads.
- Managers que revisan conversaciones abiertas, asignaciones y prioridades.
- Operadores que toman el control de una conversación iniciada por IA.
- Usuarios de operaciones que necesitan comprobar consentimiento, campaña y adquisición antes de contactar.

### Ruta y navegación

- Ruta principal: `/conversacion/inbox`.
- Entrada de Sidebar: **Conversación → Inbox**.
- Navega hacia la ficha del lead desde el contexto de la conversación si se utiliza el enlace de la entidad en otras vistas.
- Se conecta con `/llamadas` conceptualmente por el canal de voz, con `/email-marketing` por plantillas/engagement y con `/automatizaciones` mediante eventos y acciones.
- No existe una ruta frontend separada para el hilo: el detalle se carga dentro de la misma pantalla al seleccionar una fila.

### Precondiciones

1. El usuario debe tener sesión válida.
2. Debe disponer de `conversations.read` para cargar la bandeja.
3. Para cambiar estado, asignar o tomar control necesita `conversations.write`.
4. Para enviar mensajes o usar sugerencias IA la ruta exige además `costs.request`.
5. Para enviar por un canal se necesita el dato del lead, consentimiento válido y proveedor configurado.

Si no existen conversaciones, la pantalla se puede abrir igualmente y muestra un estado vacío. No crea conversaciones de prueba en frontend.

### Layout y lectura de la pantalla

1. **Barra superior**: selector de estado y acceso rápido al buscador.
2. **Cabecera**: título “Conversaciones” y explicación operativa.
3. **Columna izquierda — cola**:
   - buscador por texto;
   - filtros de canal: Todos, WhatsApp, Llamadas y Email;
   - contador y orden de conversaciones más recientes;
   - filas con nombre, empresa/email, hora, último mensaje, canal y señal de estado.
4. **Columna central — hilo**:
   - cabecera del contacto y estado;
   - botón “Pasar a humano”;
   - timeline ascendente de mensajes y eventos;
   - compositor de WhatsApp, voz o email;
   - selector de plantillas;
   - sugerencia de respuesta con IA;
   - envío.
5. **Columna derecha — inspector**:
   - origen: campaña, source/medium, landing y fecha de captación;
   - contacto: teléfono, email, empresa y cargo;
   - consentimientos por WhatsApp, voz y email;
   - oportunidad actual, etapa, valor y prioridad;
   - siguiente mejor acción propuesta.

### Datos de entrada

#### Desde la lista

- `channel` para filtrar por canal.
- `status` para filtrar `open`, `assigned`, `pending`, `snoozed` o `closed`.
- `search` para buscar por asunto, lead, empresa, email, teléfono o cuerpo de mensaje.
- El servicio limita la consulta a 100 filas y admite `assignedUserId`, `limit` y `offset` aunque no todos se exponen como controles visibles.

#### Desde el hilo

- Estado de conversación.
- Canal de salida.
- Texto libre o `templateId`.
- Tono para sugerencia IA, actualmente `consultivo` desde la pantalla.
- Usuario que toma el control.

#### Datos enriquecidos que recibe la interfaz

- Lead y usuario asignado.
- Último mensaje en la lista.
- Mensajes completos, autores y delivery attempts en el detalle.
- Acquisition events y campaña.
- Oportunidad y consentimientos.
- `NextBestAction` propuestas.

### Acciones y comportamiento

| Acción de usuario | Efecto visible | Persistencia/servicio |
|---|---|---|
| Buscar | Filtra la cola con debounce de 280 ms | `GET /api/conversations?search=...` |
| Filtrar canal/estado | Recarga la cola | `GET /api/conversations` |
| Seleccionar fila | Carga el hilo y el inspector | `GET /api/conversations/:id` |
| Cambiar estado | Actualiza el estado y `closedAt` si procede | `PUT /api/conversations/:id` |
| Pasar a humano | Asigna al usuario y cambia a `assigned`; añade evento interno | `POST /api/conversations/:id/takeover` |
| Elegir plantilla | Recupera plantillas activas del canal | `GET /api/conversations/templates?channel=...` |
| Enviar WhatsApp | Valida teléfono y consentimiento y envía | `POST /api/conversations/:id/messages`, proveedor WhatsApp/Twilio |
| Enviar email | Exige plantilla aprobada, email y consentimiento | `POST /api/conversations/:id/messages`, Resend |
| Solicitar llamada | Exige teléfono y consentimiento de voz; encola llamada | `POST /api/conversations/:id/messages`, Twilio/job de llamadas |
| Añadir nota interna | Registra un evento interno | El servicio soporta `channel: internal`, aunque el compositor visible prioriza canales externos |
| Sugerir con IA | Rellena el compositor, no envía automáticamente | `POST /api/conversations/:id/suggest`, `conversationAi.service` |
| Aceptar siguiente acción | Convierte recomendación en tarea | `POST /api/conversations/:conversationId/next-actions/:id/accept` |
| Descartar siguiente acción | Marca la recomendación como descartada | `POST /api/conversations/:conversationId/next-actions/:id/dismiss` |

### Resultado esperado

- El usuario sabe quién es el contacto, de dónde llegó y qué permisos de contacto tiene.
- Los mensajes quedan asociados al hilo y conservan canal, proveedor, dirección, estado de entrega y timestamps.
- Una respuesta o llamada queda registrada como actividad del CRM y puede disparar automatizaciones.
- Una recomendación aceptada termina en una tarea real con owner, lead y conversación; no se queda en un simple banner.

### Estados de la pantalla

- **Loading de lista**: “Cargando conversaciones…”.
- **Error de lista**: error y botón de reintento.
- **Vacío**: no hay conversaciones o ningún filtro coincide.
- **Sin selección**: invita a seleccionar una conversación.
- **Loading de hilo**: se mantiene la conversación seleccionada mientras llega el detalle.
- **Error de hilo/acción**: mensaje de última acción fallida y reintento.
- **Timeline vacío**: el hilo existe, pero todavía no tiene mensajes.
- **Enviando/tomando control/sugiriendo**: botones deshabilitados y textos de progreso.
- **Fallos de proveedor**: el mensaje puede quedar fallido; `DeliveryState` muestra “No entregado”.

### Permisos

Frontend para mostrar la página: `conversations.read`.

Backend:

- Lectura: `conversations.read` con scope `org`.
- Actualizaciones y takeover: `conversations.write` con scope `org`.
- Envío y sugerencia IA: `conversations.write` + `costs.request`.
- Aceptar una acción: `conversations.write` + `tasks.write`.
- La autorización no sustituye consentimiento: el servicio comprueba `ContactConsent` por lead y canal.

### APIs, servicios, modelos y dependencias

**Frontend**

- `src/pages/ConversationsInboxPage.jsx`.
- `src/pages/conversations-inbox.css`.
- `src/lib/api.js` y `apiFetch`.
- No utiliza un hook de datos específico; coordina `useState`, `useEffect`, `useMemo`, `useCallback` y `useRef` dentro de la página.

**Backend**

- Ruta: `backend/src/routes/conversations.ts`.
- Controller: `backend/src/controllers/conversations.controller.ts`.
- Servicio: `backend/src/services/conversations.service.ts`.
- IA: `backend/src/services/conversationAi.service.ts`.
- Tareas: `backend/src/services/tasks.service.ts`.
- Automatizaciones: `backend/src/jobs/automationRunner.ts`.

**Modelos principales**

- `Conversation`.
- `Message` y `DeliveryAttempt`.
- `MessageTemplate`.
- `ChannelIdentity`.
- `ContactConsent`.
- `NextBestAction`.
- `Lead`, `Campaign`, `AcquisitionEvent`, `Opportunity` y `Task`.

**Proveedores/dependencias externas**

- WhatsApp/Twilio para mensajería y voz.
- Resend para envío de email; borradores y consentimiento se gestionan en Vendrava.
- Proveedor LLM configurado por `conversationAi.service` para sugerencias.
- Jobs/outbox para eventos y llamadas.

### Riesgos y pendientes

- El compositor muestra tres canales, pero el envío exige configuraciones y consentimientos que pueden no estar disponibles en una organización nueva.
- La etiqueta de conversación puede mezclar mensajes de proveedores con estados distintos; la trazabilidad depende de `providerMessageId`, `externalEventId` y `DeliveryAttempt`.
- “Pasar a humano” asigna al usuario actual, pero la experiencia de distribución/colas de equipo no está desarrollada como una bandeja avanzada.
- El servicio soporta aceptar/descartar `NextBestAction`, pero la pantalla revisada no expone todos esos botones del inspector.
- Las sugerencias IA requieren coste autorizado y disponibilidad del proveedor; no deben interpretarse como respuesta enviada.
- Las consultas de lista tienen filtros adicionales en backend que no están expuestos en la UI.
- Deben mantenerse pruebas de aislamiento por `orgId`, consentimiento, idempotencia de webhooks y duplicación de mensajes.

### Checklist operativo

- [ ] El usuario tiene `conversations.read`.
- [ ] El hilo pertenece a la organización correcta.
- [ ] El lead tiene teléfono/email cuando se quiere contactar.
- [ ] El consentimiento del canal está en estado `granted`.
- [ ] La plantilla está activa y aprobada cuando aplica.
- [ ] El proveedor correspondiente está configurado.
- [ ] El resultado aparece en el timeline con estado de entrega.
- [ ] Si se acepta la siguiente acción, existe una tarea asociada.
- [ ] Un fallo de proveedor no se presenta como envío confirmado.

---

## 2. Llamadas — revisión y seguimiento de conversaciones de voz

### Propósito y problema que resuelve

Llamadas es la bandeja de análisis de llamadas realizadas o recibidas por la plataforma. Resuelve la pérdida de información posterior a una llamada: permite localizar contactos, filtrar resultados, priorizar conversaciones de alta intención, exportar la vista y crear seguimiento.

La operación detallada de una llamada se completa en `/llamadas/:id`; la página `/llamadas` es el centro de revisión y priorización.

### Usuarios

- SDR y equipo comercial.
- Managers que revisan rendimiento por agente o resultado.
- Operaciones que exportan llamadas para análisis.
- Supervisores de voz que necesitan pasar de un registro a su transcripción, grabación, notas y tareas.

### Ruta y navegación

- Ruta principal: `/llamadas`.
- Entrada: **Conversación → Llamadas**.
- “Nueva llamada” y el comando equivalente navegan a `/voz/test`.
- Cada fila navega a `/llamadas/:id`.
- Desde el detalle se puede volver a la lista y consultar resumen, transcripción y notas.

### Precondiciones

- Sesión válida y `calls.read` para consultar.
- `calls.write` para acciones masivas, favoritos, notas y tareas.
- `tasks.read/write` para consultar o crear seguimiento de una llamada.
- Para que haya datos debe existir un `Call` ingerido desde el sistema de voz o desde un proveedor externo.

### Layout

1. **Cabecera**: título, comandos, actualizar, filtros, exportar y nueva llamada.
2. **Hero de inteligencia de voz**: explicación visual y accesos rápidos. La imagen y la onda son recursos de presentación, no métricas.
3. **KPI**:
   - llamadas totales;
   - duración media;
   - tasa de conversión;
   - reuniones agendadas.
4. **Filtros opcionales** por resultado y agente.
5. **Workspace**:
   - lista paginada de llamadas recientes;
   - vistas rápidas Todas, Alta intención y Para hoy;
   - búsqueda local en contacto/empresa/cargo;
   - selección múltiple;
   - panel derecho de rendimiento.
6. **Command palette** con búsqueda, filtro de intención, filtros, exportación y nueva llamada.

### Datos de entrada y normalización

La página pide `GET /api/calls?page=&limit=20` y mapea cada `Call` a la vista:

- lead → nombre, empresa, cargo e iniciales;
- `startedAt` → fecha visible;
- `durationSeconds` → minutos/segundos;
- `outcome` → Reunión agendada, Interesado, No interesado o Seguimiento;
- `sentimentScore` → score de la fila;
- agente → nombre;
- `recordingUrl` → queda disponible para el detalle.

La tabla no inventa llamadas si la API devuelve vacío. La imagen de onda fija en `WaveBars` es decoración visual.

### Acciones

- Actualizar: vuelve a pedir la página actual.
- Abrir filtros: filtra resultado/agente en memoria sobre la página cargada.
- Cambiar vista rápida: prioriza estados de alta intención o llamadas cuya fecha comienza por “hoy”.
- Buscar: filtra contacto, empresa y cargo.
- Seleccionar filas: habilita barra de acciones.
- Crear seguimiento: `POST /api/calls/bulk-actions` con `action: follow_up`.
- Priorizar: `POST /api/calls/bulk-actions` con `action: priority`.
- Exportar: genera CSV en el navegador con la vista actual.
- Abrir una llamada: navega a `/llamadas/:id`.
- Nueva llamada: abre el Test de Voz.

### Resultado y detalle

La fila ayuda a decidir qué llamada revisar primero. La ficha de detalle permite:

- reproducir `recordingUrl` si existe;
- leer transcripción normalizada;
- buscar texto dentro de la transcripción;
- filtrar solo intervenciones del agente;
- consultar resumen, resultado, sentimiento y metadatos disponibles;
- crear, editar y eliminar notas;
- crear y actualizar tareas de llamada;
- marcar favorito.

### Estados

- Loading inicial con mensaje de carga.
- Error de API con reintento.
- Lista vacía o sin coincidencias con búsqueda/filtro.
- KPI sin dato: muestra “—” y “Sin datos disponibles”; no usa un valor de ejemplo.
- Rendimiento derecho sin datos: indica que aún no hay datos de rendimiento.
- Página paginada con total y total de páginas entregados por el backend.
- Detalle sin grabación: informa que no existe `recordingUrl`.
- Detalle sin transcripción: no muestra una conversación ficticia.

### Permisos

- Lista y detalle: `calls.read` org.
- Acciones masivas, favoritos y notas: `calls.write` org.
- Tareas de llamada: `calls.read` + `tasks.read` para lectura y `calls.write` + `tasks.write` para mutación.
- El ingest de voz no usa el JWT de usuario: se protege con `authenticateVoiceService` y valida la propiedad de lead, agente y campaña.

### APIs, servicios, modelos y dependencias

**Frontend**

- `src/components/Calls.jsx`.
- `src/pages/CallDetailPage.jsx`.
- `src/components/calls.css` y `src/pages/call-detail.css`.
- `apiFetch`, hooks locales de estado, memoización y listeners de teclado.

**Backend**

- `backend/src/routes/calls.ts`.
- `backend/src/controllers/calls.controller.ts`.
- `backend/src/services/calls.service.ts`.
- `backend/src/lib/salesActivity.ts` y `emitToOrg` para eventos cuando corresponde.

**Modelos**

- `Call`.
- `Lead`, `Agent`, `Campaign` y `Meeting`.
- `CallTask`.
- `LeadNote` reutilizado por notas de llamada.
- `AutomationRun`/outbox cuando la llamada completada dispara automatizaciones.

**Proveedores**

- Twilio para telefonía, grabaciones y callbacks.
- Deepgram para speech-to-text en la sesión real.
- ElevenLabs para voz sintetizada del agente.
- Cerebras/LLM configurado para respuesta y análisis de voz.

### Riesgos y pendientes

- La tasa de conversión y reuniones del panel derecho dependen de `/api/dashboard/stats`; si no hay estadísticas se muestra vacío.
- La búsqueda y filtros de la pantalla se aplican sobre la página cargada, no son necesariamente filtros server-side completos.
- El botón “Alta intención” contiene un contador visual fijo en la UI; no debe confundirse con el recuento real de filas.
- La exportación CSV es del conjunto visible, no de todo el histórico.
- La URL de grabación debe tener controles de acceso y retención adecuados; el modelo solo conserva la referencia.
- El ingest requiere contexto consistente entre organización, lead, agente y campaña; un contexto inválido debe rechazarse.
- Deben monitorizarse llamadas con resultado `uncertain`, callbacks duplicados, reintentos y transcripciones incompletas.

### Checklist operativo

- [ ] La API devuelve `total`, `page`, `limit` y `totalPages` coherentes.
- [ ] Cada llamada pertenece al `orgId` autenticado.
- [ ] Resultado y sentimiento proceden de `Call`, no de placeholders.
- [ ] Grabación y transcripción muestran estado honesto si faltan.
- [ ] Las acciones masivas no se confirman si el backend falla.
- [ ] Las tareas creadas quedan asociadas a la llamada y organización.
- [ ] Las grabaciones y transcripts tienen política de acceso y retención.

---

## 3. Agentes IA — configuración de agentes de voz

### Propósito y problema que resuelve

Agentes IA es el estudio de configuración de los agentes que participan en conversaciones de voz. Resuelve la dispersión de identidad, rol e instrucciones: permite saber qué agentes existen, cuáles están activos y qué campos persistentes puede editar el operador.

No es todavía un editor completo de comportamiento de voz. La propia pantalla señala qué bloques no tienen API de persistencia.

### Usuarios

- Administradores y responsables de operaciones de voz.
- Managers que activan/pausan agentes.
- Equipos de ventas que ajustan rol, personalidad e instrucciones.
- Operaciones de conocimiento que mantienen la Knowledge Base en otra sección.

### Ruta y navegación

- Ruta: `/agentes`.
- Entrada: **Conversación → Agentes IA**.
- Detalle: `/agentes/:id`.
- Test: `/voz/test`.
- Knowledge Base: `/knowledge-base`.

### Precondiciones

- `agents.read` para cargar la lista.
- `agents.manage` para crear, actualizar y desactivar.
- Para utilizar un agente en voz real debe existir, pertenecer al tenant y estar activo.
- La disponibilidad del proveedor de voz se comprueba fuera del editor, durante la sesión o llamada.

### Layout y tabs

1. **Cabecera** con “Nuevo agente”.
2. **Hero** de configuración centralizada. La imagen de red de conocimiento es visual.
3. **Métricas reales**: agentes configurados, activos y pausados.
4. **Workspace**:
   - filtros Todos, Activos y Pausados;
   - búsqueda por nombre, rol e instrucciones;
   - orden reciente o nombre A-Z;
   - lista de agentes;
   - editor del agente seleccionado.
5. **Stepper del editor**:
   - Rol;
   - Instrucciones;
   - Configuración;
   - Mensajes;
   - Knowledge Base.
6. **Bloque inferior** para enlazar a Knowledge Base y mostrar actividad.

### Datos de entrada y campos persistentes

#### Crear agente

El modal recoge nombre, rol, subrol, descripción/objetivo y personalidad. La petición real envía:

```json
{
  "name": "…",
  "role": "…",
  "personality": "…",
  "systemPrompt": "…"
}
```

El subrol no se envía en la implementación actual; la descripción se usa como `systemPrompt`.

#### Editar agente

La pestaña **Rol** actualiza `role`. **Instrucciones** edita `systemPrompt`. **Configuración** edita `name`, `personality`, `language` e `isActive`. Los cambios se acumulan localmente y solo se envían al pulsar “Guardar cambios”.

### Acciones y resultado

| Acción | Resultado |
|---|---|
| Nuevo agente | Crea un registro real en `/api/agents`. |
| Seleccionar agente | Abre su editor y normaliza rol/estado para la UI. |
| Cambiar rol | Modifica el borrador local del editor. |
| Editar instrucciones | Cambia el prompt del sistema que se persistirá. |
| Activar/pausar | Cambia `isActive` al guardar. |
| Guardar cambios | `PUT /api/agents/:id`; muestra toast de éxito/error. |
| Ver detalle | Navega a `/agentes/:id`. |
| Gestionar Knowledge Base | Navega a `/knowledge-base`. |
| Desactivar desde backend | Existe `DELETE /api/agents/:id`; la pantalla principal no lo expone como acción visible. |

### Qué es real y qué está pendiente

**Código real**

- Lista, alta, lectura, actualización, desactivación y estadísticas tienen endpoints backend.
- Nombre, rol, personalidad, idioma, prompt e `isActive` tienen columnas en `Agent`.
- La sesión de voz valida que el agente pertenezca a la misma organización y esté activo.

**Fallback/demo de UI**

- Colores, iconos, textos descriptivos de roles e imagen hero.
- La clasificación visual de roles (`ventas`, `soporte`, `agenda`, `cobranza`) se deriva de texto.
- La actividad agregada del bloque inferior no está conectada a una fuente en esta vista.

**Parcial/pendiente**

- Configuración de voz detallada no se persiste desde esta pantalla.
- Mensajes por situación no tienen API de configuración.
- Las fuentes de Knowledge Base asociadas individualmente al agente no llegan a la vista.
- Las estadísticas por agente tienen endpoint backend, pero la pantalla no las usa en el bloque de actividad.

### Estados

- Loading de agentes.
- Error de carga con reintento.
- Sin agentes registrados.
- Sin coincidencias con filtros.
- Sin agente seleccionado: pide seleccionar o crear.
- Guardado: botón deshabilitado y texto de progreso.
- Toast de guardado o error.
- Panel no disponible para capacidades sin persistencia.

### Permisos y APIs

- Frontend: `/agentes` requiere `agents.read`; `/voz/test` también se vincula a `agents.read`.
- Backend:
  - `GET /api/agents` → `agents.read`.
  - `POST /api/agents` → `agents.manage`.
  - `GET /api/agents/:id` → `agents.read`.
  - `PUT /api/agents/:id` → `agents.manage`.
  - `DELETE /api/agents/:id` → `agents.manage`.
  - `GET /api/agents/:id/stats` → `agents.read`.
- Controller: `backend/src/controllers/agents.controller.ts`.
- Servicio: `backend/src/services/agents.service.ts`.
- Modelo: `Agent`, relacionado con `Organization`, `Campaign` y `Call`.

### Riesgos y pendientes

- El usuario puede pensar que cambiar una pestaña no persistente modifica el agente; la interfaz lo marca como no disponible, pero el límite debe mantenerse visible.
- El nombre de rol enviado por el modal no coincide necesariamente con las categorías visuales normalizadas.
- No existe aún un vínculo persistido visible entre agente y artículos concretos de Knowledge Base.
- Activar un agente sin configurar proveedor/voz puede producir una sesión que no arranca.
- El prompt del sistema es un campo potente: debe auditarse y protegerse frente a cambios no autorizados.

### Checklist operativo

- [ ] El agente pertenece a la organización.
- [ ] El rol y prompt describen el objetivo operativo.
- [ ] `isActive` coincide con la intención de producción.
- [ ] La configuración de voz externa está disponible.
- [ ] El agente se prueba en `/voz/test` antes de lanzarlo a llamadas.
- [ ] Las fuentes de conocimiento se mantienen en Knowledge Base.
- [ ] Los cambios se guardan y se puede comprobar el resultado en una nueva carga.

---

## 4. Playbooks — guías repetibles de conversación

### Propósito y problema que resuelve

Playbooks convierte una forma de vender o atender en una guía que se puede reutilizar. Resuelve la variabilidad entre agentes y operadores: qué objetivo perseguir, qué preguntas hacer, cómo responder objeciones y qué siguiente paso proponer.

La página tiene una capa de catálogo y otra de detalle. El catálogo mezcla recursos reales del backend con una biblioteca visual de referencia que aún no está completamente persistida.

### Usuarios

- Managers comerciales.
- Responsables de operaciones y enablement.
- Administradores que gestionan playbooks globales.
- Responsables de agentes que quieren usar una guía como base de instrucciones.

### Ruta y navegación

- Catálogo: `/playbooks`.
- Detalle: `/playbooks/:id`.
- Entrada: **Conversación → Playbooks**.
- El catálogo también ofrece acciones administrativas relacionadas con el catálogo global, pero la gestión global requiere permisos adicionales.

### Precondiciones

- `playbooks.read` para listar y consultar.
- `playbooks.write` para crear y editar.
- `playbooks.approve` para aprobación cuando se usa el flujo de gobierno correspondiente.
- `playbooks.manage_global` para recursos globales/admin.
- Los datos de rendimiento solo aparecen si existe fuente de campañas/llamadas; los valores de catálogo definidos en frontend no prueban rendimiento real.

### Layout

1. Cabecera con título, búsqueda, filtros, importar y nuevo playbook.
2. Tarjetas de métricas.
3. Pestañas: Todos, Mis playbooks, Oficiales y Compartidos conmigo.
4. Biblioteca de tarjetas con nombre, descripción, etiquetas, tipo, tasa y uso.
5. Panel de detalle seleccionado con uso recomendado, estructura, estadísticas e integraciones sugeridas.
6. Modal de creación y navegación al detalle persistido.

### Datos de entrada y acciones

**Listado real**: `GET /api/playbooks` devuelve los playbooks de la organización. `mapPlaybook` transforma nombre, descripción y tags. Para los playbooks recibidos del backend, tasa, reuniones y campañas se representan como “—”/0 porque no hay métricas de uso asociadas en el contrato actual.

**Crear**: el modal envía nombre, descripción, `steps` y `tags` mediante `POST /api/playbooks`.

**Editar**: el detalle permite modificar nombre, descripción, pasos, tags y `isActive` mediante `PUT /api/playbooks/:id`.

**Importar**: el botón de importar abre un selector de archivo `.json`, `.yaml` o `.txt`, pero el flujo de parseo/persistencia no está implementado en la pantalla revisada. No debe presentarse como importación completada.

**Usar**: las tarjetas pueden abrir el modal de nuevo playbook; la aplicación efectiva sobre una campaña/agente debe comprobarse en el detalle de campaña o configuración del agente.

### Estructura funcional esperada

Un playbook puede contener:

- nombre y descripción;
- pasos de conversación (`steps` JSON);
- etiquetas;
- estado activo;
- relación a campañas mediante `Campaign.playbookId`.

La estructura visual de referencia incluye flujo conversacional, manejo de objeciones, preguntas de calificación, mensajes clave e integraciones sugeridas. Los contadores y estadísticas de esa referencia son fallback si no llegan desde backend.

### Estados

- Cargando catálogo.
- Catálogo vacío.
- Error de consulta: la pantalla actual no siempre presenta un estado de error dedicado, por lo que hay riesgo de ver biblioteca vacía.
- Filtros sin resultados.
- Modal creando.
- Detalle no encontrado o sin datos según la ruta de detalle.
- Métricas no disponibles: “—”, no valor ficticio.

### APIs, permisos, modelos y dependencias

- Frontend: `src/components/Playbooks.jsx`, `src/pages/PlaybookDetailPage.jsx`, `src/modals/NewPlaybookModal.jsx`.
- Backend: `backend/src/routes/playbooks.ts`, `backend/src/controllers/playbooks.controller.ts`, `backend/src/services/playbooks.service.ts`.
- Modelo: `Playbook`; relación con `Organization` y `Campaign`.
- Campañas y agentes pueden consumir la configuración; la ejecución de una conversación depende además del runtime de voz.
- No hay proveedor externo directo en el catálogo; los proveedores aparecen cuando un playbook se usa en una llamada/agente.

### Riesgos y pendientes

- La biblioteca oficial mostrada en frontend contiene datos de referencia y puede dar sensación de catálogo persistido aunque solo existan los registros API.
- Los números de éxito, reuniones e ingresos definidos en `STATS`, `PLAYBOOKS` y `DETAIL` son demo/fallback; no deben utilizarse en informes.
- El botón importar aún no completa la importación.
- Debe definirse un esquema versionado de `steps` para que los agentes ejecuten siempre una versión entendible.
- Falta una vista clara de aprobación, publicación, asignación a campaña y rollback.
- El vínculo entre playbook y prompt de agente debe quedar auditado y ser visible.

### Checklist operativo

- [ ] Distinguir playbook global, oficial, propio y compartido.
- [ ] Validar que `steps` cumple el esquema antes de activarlo.
- [ ] Verificar asociación a campaña/agente.
- [ ] No mostrar tasas de éxito si no existe métrica real.
- [ ] Aprobar/publicar con permisos separados.
- [ ] Mantener versión y rollback.
- [ ] Probar el playbook en Test de Voz antes de producción.

---

## 5. Test de Voz — laboratorio de sesión en tiempo real

### Propósito y problema que resuelve

Test de Voz es el entorno de prueba técnica y conversacional. Resuelve el riesgo de lanzar un agente sin comprobar micrófono, audio de respuesta, transcripción, latencia, confianza e interrupciones.

No es una llamada comercial contra un lead. Es una sesión privada de simulación para validar el comportamiento del agente.

### Usuarios

- Responsables de configuración de agentes.
- QA de voz y operaciones.
- Managers que revisan latencia y calidad antes de activar campañas.
- Desarrolladores/soporte cuando se diagnostica el canal de audio.

### Ruta y navegación

- Ruta: `/voz/test`.
- Entrada: **Conversación → Test de Voz**.
- Acceso de vuelta: `/agentes`.
- Desde `/llamadas`, el botón “Nueva llamada” abre esta página; el nombre puede inducir a pensar en una llamada saliente, pero el flujo implementado es una simulación WebSocket.

### Precondiciones

1. Sesión autenticada y token disponible en `AuthContext`.
2. Navegador con `AudioContext`, `AudioWorklet` y `getUserMedia`.
3. Permiso del usuario para usar el micrófono.
4. Backend de voz accesible en el WebSocket configurado.
5. Opcionalmente, `agentId` válido, perteneciente al tenant y activo.
6. Secretos y proveedores server-side de Deepgram, Cerebras y ElevenLabs.

### Layout

**Columna izquierda**

- Configuración de sesión.
- Campo opcional Agent ID.
- Nota de privacidad.
- Orb visual y waveform.
- Iniciar/detener sesión.

**Columna central**

- Conversación en tiempo real.
- Mensajes del sistema, usuario y agente.
- Texto parcial de STT.
- Metadatos por turno: confianza, duración, WPM, idioma y latencia LLM/TTS/total.
- Footer con STT Deepgram Flux, LLM Cerebras y TTS ElevenLabs.

**Diagnósticos**

- Estado.
- Latencia.
- Red, con chunks enviados/recibidos.
- Confianza de la última transcripción.

**Telemetría**

- Barras de latencia del último turno.
- Tiempo activo, turnos, interrupciones y volumen del micrófono.

### Flujo de una sesión

1. El usuario pulsa “Iniciar sesión”.
2. La página crea contextos de captura a 16 kHz y reproducción a 24 kHz.
3. Solicita el micrófono con cancelación de eco, supresión de ruido y auto gain.
4. Registra un `AudioWorklet` que convierte `Float32` a PCM16.
5. Abre `ws://.../voice-sim/live` en desarrollo o `wss://.../voice-sim/live` en producción.
6. Envía el JWT como segundo protocolo WebSocket junto al marcador `vozia`.
7. Envía `{ type: 'start', agentId }`.
8. Envía audio binario y recibe audio binario/respuestas JSON.
9. Renderiza parciales, transcripciones, respuestas y eventos de interrupción.
10. Al detener, cierra WebSocket, worklets, stream y AudioContexts.

### Datos de entrada/salida

- Entrada manual: `agentId` opcional.
- Entrada del navegador: audio del micrófono.
- Mensajes recibidos: `partial`, `transcript`, `interrupt`, `error`, bytes de audio.
- Metadatos: confianza por palabra, duración, WPM, idioma y latencia.
- Resultado: sesión privada observada en pantalla; no se presenta como `Call` comercial salvo que otro flujo de telefonía la ingiera.

### Estados

- En espera/listo para hablar.
- En vivo/micrófono activo.
- Agente hablando.
- Error de navegador, sesión caducada o conexión.
- Sesión cerrada.
- Sin transcripción todavía.
- Sin latencia/confianza hasta recibir el primer turno.

### Permisos y seguridad

- La navegación se asocia a `agents.read`.
- El WebSocket de simulación autentica el JWT durante el handshake y valida el agentId contra `orgId` y `isActive`.
- El token no se envía como subprotocolo negociado de vuelta: el servidor solo negocia el marcador fijo.
- La llamada real saliente usa un flujo distinto protegido por `authenticateVoiceService`, validación de ownership, cumplimiento y firma Twilio.

### APIs, servicios y proveedores

**Frontend**

- `src/pages/VoiceTestPage.jsx`.
- `src/contexts/AuthContext.jsx`.
- `src/pages/voice-test.css`.

**Backend**

- `backend/src/routes/voice.ts` para webhooks/outbound de telefonía.
- WebSocket de simulación y `backend/src/voice/telephony/simStream.ts`.
- Sesión real: `mediaStream.ts`, `streamAuth.ts`, `deepgramElevenLabs.ts`.
- Configuración: `agentConfig.ts`.
- Telemetría: `sessionLogger.ts`, `coordinator.ts`.

**Proveedores**

- Deepgram: STT.
- Cerebras/LLM: respuestas.
- ElevenLabs: TTS.
- Twilio: telefonía real, no el micrófono local del test.

### Riesgos y pendientes

- El URL de desarrollo depende de puerto 3000; si el backend no está activo la UI solo puede mostrar un error de conexión.
- La página no guarda por sí sola un informe de QA persistido.
- El campo Agent ID es libre; debería ofrecer selección desde `/api/agents` para reducir errores.
- El nombre “Nueva llamada” en otras vistas debe diferenciarse de “sesión de prueba”.
- El audio y transcript son datos sensibles; hay que definir retención, logs y consentimiento si se reutilizan.
- Deben probarse navegadores, permisos de micrófono, reconexión, corte de proveedor, barge-in y límites de duración.

### Checklist operativo

- [ ] Backend WebSocket operativo.
- [ ] Token válido y organización correcta.
- [ ] Micrófono autorizado.
- [ ] Agent ID activo y perteneciente al tenant.
- [ ] STT, LLM y TTS configurados.
- [ ] Latencia total dentro del objetivo.
- [ ] Interrupciones y cierre liberan recursos.
- [ ] La sesión de prueba no se confunde con una llamada productiva.

---

## 6. Email marketing — campañas nativas con Resend

### Propósito y alcance

Vendrava mantiene en su propia base de datos la audiencia, consentimientos, borradores, campañas y actividad de email. Resend se usa como servicio de entrega y recepción; no es el lugar donde se editan ni administran las campañas.

El módulo permite preparar newsletters, programar campañas, crear secuencias de seguimiento y enviar desde fichas de leads y conversaciones. Al programar se congela el asunto y el contenido para que la entrega coincida con lo aprobado. El worker procesa la cola con leases e idempotencia. Cada envío requiere consentimiento válido; las bajas y respuestas detienen la secuencia del contacto. Resend devuelve eventos firmados que se normalizan en el historial local.

### Configuración por organización

La organización conecta Resend desde Conexiones con una API key, un remitente de dominio verificado y, para recepción, el secreto firmado del webhook. Los secretos se cifran por organización. Vendrava muestra el endpoint de recepción. Las respuestas entrantes se añaden a la conversación del contacto; si no hay un contacto asociado, se crea una conversación de email sin vínculo.

### Datos y límites

Los borradores, consentimientos, campañas y entregas viven en Vendrava. Los IDs y eventos que llegan de Resend se guardan para conciliar los resultados. No se importa ni sincroniza una base externa de contactos. Las bandejas arbitrarias de Gmail/Outlook/IMAP y la descarga binaria de adjuntos entrantes no están incluidas.

### Puesta en marcha

Aplicar las migraciones del email nativo, verificar DNS y remitente, conectar Resend para una organización de staging y probar envío, respuesta, baja y eventos firmados antes de usar una lista real. El runbook vigente está en [EMAIL_MARKETING_ACTIVACION.md](../../EMAIL_MARKETING_ACTIVACION.md).
## 7. Automatizaciones — motor de flujos y ejecuciones

### Propósito y problema que resuelve

Automatizaciones permite que el seguimiento no dependa de que una persona recuerde cada paso. Resuelve acciones repetitivas después de un evento: una llamada completada puede generar email y tarea; un lead nuevo puede entrar en una secuencia local de email; un mensaje puede provocar una respuesta o una llamada.

La página es el centro de control. El detalle permite inspeccionar configuración, versiones, historial de runs y pasos ejecutados.

### Usuarios

- RevOps y administradores de procesos.
- Marketing/lifecycle.
- Managers comerciales.
- Operaciones que monitorizan runs, fallos, DLQ y scheduler.

### Ruta y navegación

- Lista: `/automatizaciones`.
- Detalle: `/automatizaciones/:id`.
- Entrada: **Nutrición → Automatizaciones**.
- Se relaciona con Inbox, llamadas, email/Resend, WhatsApp, tareas, oportunidades y Growth.

### Precondiciones

- `automations.read` para consultar.
- `automations.write` para crear y eliminar.
- `automations.publish` para publicar versiones, activar y pausar.
- Proveedores y consentimientos para acciones externas.
- Workers habilitados (`BACKGROUND_WORKERS_ENABLED=true`) para ejecución asíncrona completa.

### Layout de la lista

1. Cabecera con “Nueva automatización”.
2. Hero con explicación y plantilla visual.
3. Métricas calculadas desde la lista: total, activas, ejecuciones y pausadas.
4. Starter templates: seguimiento post-llamada, reactivación y otros puntos de partida; son sugerencias, no workflows creados.
5. Biblioteca:
   - búsqueda;
   - tabs Todas, Activas y Pausadas;
   - orden reciente/ejecuciones/nombre;
   - tabla de nombre, estado, disparador, ejecuciones y última ejecución;
   - paginación;
   - toggle de estado;
   - eliminación.

### Crear una automatización

El modal recoge nombre, descripción y disparador. Las opciones visibles incluyen:

- `call.completed`;
- `lead.inactive.7d`;
- `meeting.scheduled.24h`;
- `opportunity.proposal.3d`;
- `lead.created`;
- `lead.inactive.30d`;
- `message.received`.

También permite seleccionar una acción de canal:

- responder WhatsApp con IA;
- enviar plantilla WhatsApp;
- encolar llamada;
- enviar plantilla de email;
- incorporar lead a una audiencia local que respeta el consentimiento.

El backend soporta además `log`, `update_lead_status`, `create_task`, `set_owner`, `add_tag`, `update_field`, `create_opportunity` y `notify`, aunque no todos están disponibles en el modal.

### Ejecución real

1. El evento se normaliza mediante aliases.
2. Se buscan automatizaciones activas del tenant.
3. Se crea/recupera `AutomationRun` con `triggerEventId` idempotente.
4. Se asigna la versión publicada más reciente al run.
5. Cada paso se reclama en `AutomationStepRun`.
6. Las acciones externas se ejecutan con protecciones de outcome unknown; no se repiten a ciegas si el proveedor pudo haber aceptado el efecto.
7. Se registran estados `succeeded`, `skipped`, `blocked` o `failed`.
8. Se actualizan run, contador y última ejecución.

### Detalle y navegación

`/automatizaciones/:id` expone:

- resumen de qué hace;
- estado y acciones;
- publicar nueva versión;
- pausar/reanudar;
- KPI de ejecuciones, última ejecución, estado y acciones configuradas;
- tabs de resumen, historial y configuración;
- filtros de runs por estado;
- detalle de run y de sus pasos;
- disparador y flujo.

### APIs, modelos y dependencias

**Rutas**

- `GET /api/automations`.
- `GET /api/automations/health`.
- `POST /api/automations`.
- `GET /api/automations/:id`.
- `GET /api/automations/:id/runs`.
- `GET /api/automations/:id/runs/:runId`.
- `GET /api/automations/:id/versions`.
- `POST /api/automations/:id/publish`.
- `PUT /api/automations/:id/toggle`.
- `DELETE /api/automations/:id`.

**Modelos**

- `Automation`.
- `AutomationVersion`.
- `AutomationRun`.
- `AutomationStepRun`.
- `OutboxEvent` y `ScheduledTrigger`.
- `Conversation`, `Lead`, `Task`, `EmailDelivery`, mensajes y oportunidades según la acción.

**Servicios/jobs**

- `backend/src/services/automations.service.ts`.
- `backend/src/controllers/automations.controller.ts`.
- `backend/src/jobs/automationRunner.ts`.
- `src/lib/automationMapping.js`.
- `useClickOutside` para menús de la UI; el motor no depende de hooks frontend.

### Estados y errores

- Borrador sin acciones: no se puede activar/publicar.
- Activa, pausada, archivada.
- Run: `queued`, `running`, `succeeded`, `failed`, `dead_letter`.
- Paso: `succeeded`, `skipped`, `blocked`, `failed`.
- Worker detenido: health `stopped`.
- Outbox atrasado o scheduler atrasado: health `degraded`.
- Error de proveedor: puede quedar bloqueado como `OUTCOME_UNKNOWN` para revisión.
- Sin resultados: estado vacío con CTA de creación.

### Qué es real y qué es fallback

**Código real**

- Lista, alta, toggle y eliminación.
- Publicación de versiones inmutables.
- Historial de runs y detalle de pasos.
- Idempotencia por evento y por paso.
- Auditoría en mutaciones principales.

**Fallback/demo**

- Imágenes y textos de starter templates.
- Iconos y etiquetas visuales que traducen el JSON a lenguaje comercial.
- El número de badge de alta intención en otras pantallas no representa el motor de automatizaciones.

### Riesgos y pendientes

- Activar una automatización con acciones externas implica coste, consentimiento y riesgo de efecto duplicado.
- La UI de creación no expone todas las acciones soportadas.
- La salud del motor existe como endpoint, pero debe mostrarse de forma más visible en el centro de control.
- `GET /:id/reconcile` de campañas y los workers deben tener alertas operativas, no solo logs.
- Las acciones con resultado desconocido requieren cola de revisión y reanudación controlada.
- Debe documentarse quién puede publicar frente a quién puede editar borradores.

### Checklist operativo

- [ ] Disparador canónico y payload definido.
- [ ] Acciones válidas y parámetros completos.
- [ ] Consentimiento para email, WhatsApp y voz.
- [ ] No se activa un borrador sin acciones.
- [ ] Se publica una versión antes de producción.
- [ ] Worker, outbox y scheduler están saludables.
- [ ] Runs y pasos quedan auditables.
- [ ] Fallos de proveedor no se reintentan duplicando efectos.
- [ ] Se revisan runs `blocked`, `failed` y `dead_letter`.

---

## 8. Growth Hub — centro de iniciativas de crecimiento

### Propósito y problema que resuelve

Growth Hub es la capa de coordinación transversal. Resuelve tener iniciativas de captación, newsletter, automatización, ventas y fidelización dispersas en documentos o herramientas sin un estado común.

No reemplaza el motor de campañas, email o automatizaciones. Registra la iniciativa, su área, estado, configuración y fechas para que el equipo sepa qué está en marcha y qué debe activar después.

### Usuarios

- Growth y marketing.
- RevOps.
- Managers que coordinan captación, nutrición, ventas y customer success.
- Dirección que necesita una vista de programas activos, borradores y próximos lanzamientos.

### Ruta y navegación

- Ruta: `/growth`.
- Entrada: **Growth → Growth Hub**.
- Conecta conceptualmente con campañas, Email marketing, Automatizaciones, Pipeline, Organic Leads y fidelización.
- La versión actual no abre un subdetalle separado: editar se realiza en modal.

### Precondiciones

- Sesión válida.
- `growth.read` para listar/consultar.
- `growth.write` para crear, editar, activar, pausar y archivar.
- El tipo de programa debe pertenecer al catálogo cerrado del backend.

### Catálogo de programas

Los tipos soportados son:

- `newsletter`;
- `lead_magnet`;
- `popup`;
- `automation_journey`;
- `webinar`;
- `referral`;
- `nps`;
- `sales_sequence`;
- `proposal`;
- `customer_health`.

La UI agrupa esos tipos en áreas:

- Captación.
- Newsletter.
- Automatización.
- Ventas.
- Fidelización.

### Layout

1. **Cabecera** con título y “Nuevo programa”.
2. **Command panel** con total de programas, activos y áreas.
3. **Tabs por área**: Todo, Captación, Newsletter, Automatizaciones, Ventas y Fidelización.
4. **Lista de iniciativas** con búsqueda, filtro por estado y orden visual.
5. **Fila de programa** con nombre, descripción, estado, área, formato, fecha y acciones.
6. **Panel lateral** con mapa de capacidades y siguiente paso recomendado.
7. **Modal de creación/edición**.

### Datos de entrada

El modal envía:

- `name` obligatorio;
- `type` en creación;
- `description`;
- `status`: draft, active o paused;
- en backend también existen `config`, `metrics`, `startsAt` y `endsAt`, aunque la UI resumida no expone todos.

La búsqueda filtra por nombre, descripción y tipo. El estado y el área se filtran en memoria tras cargar los programas.

### Acciones y resultado

| Acción | Resultado |
|---|---|
| Crear programa | `POST /api/growth-programs`, queda normalmente como borrador. |
| Editar | `PUT`/`PATCH /api/growth-programs/:id` con los campos modificados. |
| Activar | Actualiza a `active`. |
| Pausar | Actualiza a `paused`. |
| Actualizar | Vuelve a cargar la lista. |
| Filtrar/buscar | Cambia la vista local sin mutar datos. |
| Archivar | Existe `POST /api/growth-programs/:id/archive`, pero no está expuesto en la fila actual. |
| Usar sugerencia | Abre el modal prellenado; no crea hasta confirmar. |

### Estados

- Loading: prepara el mapa de crecimiento.
- Error de carga con reintento.
- Lista vacía con sugerencias de inicio.
- Lista filtrada sin coincidencias.
- Programa `draft`, `active`, `paused`, `scheduled`, `completed` o `archived`.
- Guardado de creación/edición con error en modal.
- Toggle ocupado por programa.
- Toast de programa creado, actualizado, activado o pausado.

### APIs, servicio y modelo

- `GET /api/growth-programs`.
- `GET /api/growth-programs/overview`.
- `GET /api/growth-programs/:id`.
- `POST /api/growth-programs`.
- `PATCH /api/growth-programs/:id`.
- `PUT /api/growth-programs/:id`.
- `POST /api/growth-programs/:id/archive`.
- Frontend: `src/pages/GrowthHubPage.jsx`, `src/pages/growth-hub.css` y assets visuales.
- Controller: `backend/src/controllers/growthPrograms.controller.ts`.
- Service: `backend/src/services/growthPrograms.service.ts`.
- Modelo: `GrowthProgram` con `orgId`, tipo, descripción, estado, `config`, `metrics`, fechas y archivado.
- Las mutaciones escriben `AuditLog`.

### Qué problema no resuelve todavía

Growth Hub registra y ordena programas, pero no ejecuta por sí solo un newsletter, un webinar, una secuencia o un NPS. La ejecución debe vivir en la herramienta especializada:

- Email marketing con borradores y campañas locales entregadas por Resend.
- Automatizaciones para journeys y acciones.
- Campañas/landings para captación.
- Pipeline/CRM para propuestas y secuencias.
- Servicios de fidelización aún por conectar para NPS/customer health/referrals.

La imagen del journey y las sugerencias son ayudas de orientación; no son actividad real.

### Riesgos y pendientes

- El modelo `config`/`metrics` es flexible; sin esquemas por tipo se puede almacenar una iniciativa incompleta.
- La UI deja editar estado inicial, pero el backend también controla fechas y transiciones; falta una explicación de reglas de calendario.
- Las métricas del programa no se calculan desde las herramientas que lo ejecutan.
- Archivar conserva el registro, pero no está visible en la UI actual.
- No existe todavía un vínculo obligatorio entre GrowthProgram y campaña, automatización, campaña de email o pipeline.
- La recomendación de “próximo paso” es texto de producto, no un motor de priorización.

### Checklist operativo

- [ ] Nombre y objetivo comprensibles.
- [ ] Tipo y área correctos.
- [ ] Responsable y herramienta ejecutora identificados en `config` o documentación operativa.
- [ ] Estado inicial coherente con la configuración real.
- [ ] Fechas y dependencias definidas cuando el programa es programado.
- [ ] Enlace con campaña, automatización, email o CRM.
- [ ] Métricas reales conectadas antes de usar el programa como informe.
- [ ] Archivado y auditoría revisados al retirar una iniciativa.

---

## 9. Flujo transversal recomendado

Una operación típica de estas áreas queda así:

1. **Growth Hub** registra el programa y el objetivo.
2. **Email marketing** o una **automatización** configura la nutrición.
3. El lead recibe una señal o responde y aparece en **Inbox**.
4. La oportunidad se contacta por WhatsApp, email o voz con consentimiento.
5. **Agentes IA** y **Playbooks** definen el rol y la guía de conversación.
6. **Test de Voz** valida la experiencia antes de producción.
7. La llamada entra en **Llamadas**, con transcripción, resultado y tareas.
8. Las **Automatizaciones** crean el seguimiento o actualizan el CRM.
9. Email/Resend registra aperturas, clics y bajas; Inbox vuelve a ser el punto operativo.
10. Growth Hub conserva el programa como iniciativa coordinada, no como sustituto de cada sistema ejecutor.

### Principios que deben mantenerse

- No presentar un valor visual o catálogo de ejemplo como dato de organización.
- No enviar por un canal sin consentimiento válido.
- No activar una automatización sin acciones y versión controlable.
- No mostrar una campaña de email como publicada hasta pasar validación y permisos.
- No tratar un test de voz como llamada productiva.
- No afirmar que un programa de Growth está ejecutándose si solo está registrado.
- Filtrar siempre por `orgId` y auditar mutaciones sensibles.

---

## 10. Inventario de código revisado

### Frontend

- `src/components/Sidebar.jsx`.
- `src/App.jsx`.
- `src/pages/ConversationsInboxPage.jsx` y `src/pages/conversations-inbox.css`.
- `src/components/Calls.jsx` y `src/components/calls.css`.
- `src/pages/CallDetailPage.jsx` y `src/pages/call-detail.css`.
- `src/components/Agentes.jsx`, `src/modals/NewAgenteModal.jsx` y `src/components/agents.css`.
- `src/pages/AgentDetailPage.jsx`.
- `src/components/Playbooks.jsx`, `src/modals/NewPlaybookModal.jsx` y `src/pages/PlaybookDetailPage.jsx`.
- `src/pages/VoiceTestPage.jsx` y `src/pages/voice-test.css`.
- `src/pages/EmailMarketingPage.jsx` y `src/pages/email.css`.
- `src/components/Automatizaciones.jsx`, `src/modals/NewAutomatizacionModal.jsx`, `src/pages/AutomacionDetailPage.jsx` y `src/components/automations.css`.
- `src/pages/GrowthHubPage.jsx` y `src/pages/growth-hub.css`.
- `src/lib/api.js`, `src/lib/automationMapping.js`, `src/contexts/AuthContext.jsx`, `src/hooks/useClickOutside.js`.

### Backend

- `backend/src/index.ts` para registro de prefijos.
- Rutas/controllers/services de conversations, calls, agents, playbooks, voice, Resend webhooks, email newsletter drafts, marketing campaigns, automations y growth programs.
- `backend/src/jobs/automationRunner.ts` y `backend/src/jobs/leadCallDispatch.ts`.
- `backend/src/voice/*` para sesión, audio, STT, TTS, telephony, autenticación y logging.
- `backend/src/access-control/catalog.ts` y guards de permisos.
- `backend/prisma/schema.prisma` para los modelos funcionales y sus relaciones.

### Documentación relacionada

- `docs/plataforma/00-guia-funcional-por-pagina.md`.
- `docs/plataforma/01-navegacion-sidebar.md`.
- `docs/plataforma/02-secciones-frontend.md`.
- `docs/plataforma/03-backend-api.md`.
- `docs/plataforma/04-permisos-seguridad-integraciones.md`.



