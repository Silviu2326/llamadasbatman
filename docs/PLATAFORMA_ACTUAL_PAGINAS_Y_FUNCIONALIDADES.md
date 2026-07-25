# Vendrava — plataforma actual

## Inventario funcional de páginas y funcionalidades

**Fecha del documento:** 22 de julio de 2026  
**Alcance:** experiencia web autenticada, páginas públicas, páginas de detalle y superficies administrativas disponibles en la aplicación actual.

Este documento describe la plataforma tal como está organizada actualmente. Su objetivo es que una persona que no haya visto Vendrava pueda entender qué páginas existen, para qué sirve cada una y qué operaciones concentra.

## 1. Estructura general de la plataforma

Vendrava reúne en una misma aplicación el ciclo completo de captación, conversación y conversión:

```text
Objetivo
  → campañas, Ads, redes, landings, funnels y Organic Leads
  → prospectos, leads, conversaciones, llamadas y reuniones
  → pipeline, automatizaciones, email y agentes IA
  → inteligencia comercial, atribución e ingresos
```

La navegación autenticada se organiza en:

- **Dashboard:** centro de actividad y decisiones.
- **Objetivos:** dirección de iniciativas y acciones coordinadas.
- **Captación:** campañas, Ads, redes sociales, Prospect Finder, landings, funnels y Organic Leads.
- **Conversación:** Inbox, llamadas, agentes IA, playbooks y test de voz.
- **Nutrición:** email marketing y automatizaciones.
- **Growth:** Growth Hub.
- **Ventas:** leads, pipeline, reuniones e inteligencia comercial.
- **Sistema:** Insights, Knowledge Base, configuración, gobierno, control de accesos y recetas Ads.

La visibilidad de cada entrada se adapta al rol y al espacio de trabajo activo. La plataforma también dispone de modos de experiencia para mostrar una navegación más guiada o más completa.

## 2. Páginas principales de la navegación

### 2.1 Dashboard

**Ruta:** `/dashboard`  
**Grupo:** página inicial

El Dashboard es la vista de coordinación diaria de la organización. Consolida la información comercial y convierte la actividad en próximos pasos.

Funciones principales:

- Resumen de leads, conversaciones, llamadas, reuniones, pipeline e ingresos.
- Indicadores de rendimiento y evolución temporal.
- Lectura de actividad reciente por canal.
- Centro de acciones con prioridades, responsables, estado y llamadas a la acción.
- Seguimiento de oportunidades, tareas y eventos que requieren atención.
- Acceso directo a campañas, leads, reuniones, llamadas, pipeline y orquestador.
- Actualización de datos y navegación al detalle de cada elemento.
- Cambio entre experiencias básica y avanzada.

### 2.2 Objetivos / Orquestador

**Ruta:** `/orquestador`  
**Grupo:** acceso superior de la navegación

El Orquestador transforma un objetivo comercial en un plan coordinado que utiliza los módulos de Vendrava.

Funciones principales:

- Definir objetivo, resultado esperado, localización, duración y presupuesto.
- Generar un plan con fases de diagnóstico, preparación, activación, monitorización y atribución.
- Añadir acciones ejecutables con referencias a campañas, landings, leads, agentes, plantillas o secuencias.
- Consultar el catálogo de acciones disponibles.
- Revisar coste estimado, dependencias, límites y acciones que requieren aprobación.
- Aprobar, rechazar, ejecutar, pausar y revertir operaciones mediante comandos trazables.
- Consultar el estado de cada paso y el resultado de las acciones externas.
- Mantener claves de idempotencia para evitar duplicar operaciones.
- Conectar el plan con el Centro de acciones y la actividad comercial.

## 3. Captación

### 3.1 Campañas

**Ruta:** `/campanas`  
**Páginas relacionadas:** `/campanas/:id`, `/campanas/compartir/:token`

Campañas es el espacio para organizar iniciativas de adquisición y convertirlas en activos medibles.

Funciones principales:

- Crear campañas con nombre, objetivo y presupuesto.
- Consultar campañas paginadas y filtrar por estado.
- Buscar campañas por nombre o criterio de trabajo.
- Revisar actividad, estado operativo, inversión y activos asociados.
- Abrir la ficha completa de una campaña.
- Relacionar campaña con landing, anuncios, publicaciones, formularios y leads.
- Compartir una campaña mediante una página pública de presentación.
- Utilizar la campaña como referencia desde el Orquestador y otros módulos.

### 3.2 Ads

**Ruta:** `/ads`  
**Páginas relacionadas:** `/captacion/conectar`, `/captacion/nueva`, `/admin/ad-playbooks`

Ads concentra la gestión de publicidad de pago y la conexión con Meta Ads.

Funciones principales:

- Consultar campañas publicitarias y su estado.
- Ver inversión, resultados, leads, coste por resultado y rendimiento por periodo.
- Consultar snapshots e insights de anuncios.
- Revisar campañas, conjuntos y anuncios vinculados a Meta.
- Preparar campañas con una estructura guiada de objetivo, audiencia, creatividad, copy, presupuesto y landing.
- Guardar borradores y propuestas antes de activarlas.
- Publicar campañas pausadas y gestionar la activación con aprobación.
- Conectar una cuenta publicitaria de Meta mediante OAuth.
- Validar usuario, cuenta publicitaria, página y permisos concedidos.
- Revisar estados de conexión y sincronización.

### 3.3 Recetas Ads

**Ruta:** `/admin/ad-playbooks`

Biblioteca administrativa de patrones reutilizables para crear anuncios y campañas con criterios homogéneos.

Funciones principales:

- Consultar recetas globales.
- Crear, editar y mantener plantillas de campañas.
- Definir estructuras de copy, audiencias, objetivos y reglas de uso.
- Reutilizar una receta desde el Ads Wizard o una campaña.
- Gestionar cambios mediante permisos administrativos y flujo de revisión.

### 3.4 Redes sociales

**Ruta:** `/redes-sociales`

Área de conexión y operación de canales sociales mediante Postiz y Metricool.

Funciones principales:

- Consultar el estado de las conexiones sociales.
- Ver las integraciones disponibles y sus identificadores publicables.
- Conectar perfiles y canales sociales desde el proveedor.
- Preparar publicaciones de texto, imágenes, enlaces y llamadas a la acción.
- Crear borradores y publicaciones programadas.
- Asociar cada publicación a una campaña y a una landing mediante UTMs.
- Consultar publicaciones y métricas de rendimiento por integración.
- Gestionar la atribución de tráfico social hacia campañas y landings.

### 3.5 Prospect Finder

**Ruta:** `/prospectos`

Prospect Finder sirve para descubrir empresas y contactos que coinciden con un perfil comercial.

Funciones principales:

- Definir criterios de búsqueda por actividad, localización, tamaño y perfil.
- Consultar resultados de prospectos.
- Filtrar, ordenar y seleccionar empresas.
- Enriquecer registros con datos públicos y de contacto disponibles.
- Revisar información de empresa, web, ubicación, teléfono y señales comerciales.
- Importar prospectos al CRM como leads o cuentas.
- Asociar prospectos a una campaña, segmento o secuencia.
- Preparar una secuencia de seguimiento desde el resultado seleccionado.

### 3.6 Landings & webs

**Ruta:** `/landings`  
**Páginas públicas relacionadas:** `/l/:slug`

Este módulo permite crear páginas de captación y experiencias web vinculadas a campañas.

Funciones principales:

- Crear y administrar páginas de servicio, campañas y captación.
- Definir slug, título, propuesta de valor, contenido y llamadas a la acción.
- Añadir formularios y datos de contacto.
- Asociar landing a campaña, fuente y parámetros UTM.
- Previsualizar y publicar una página pública.
- Consultar landings existentes y su estado.
- Recibir leads desde formularios públicos.
- Mantener la relación entre visita, fuente, lead, reunión y oportunidad.

### 3.7 Funnels

**Ruta:** `/funnels`

Funnels representa visualmente el recorrido de conversión de una campaña o iniciativa.

Funciones principales:

- Visualizar etapas de captación y conversión.
- Consultar entradas, leads, contactos, reuniones, oportunidades y cierres.
- Comparar volumen y conversión entre etapas.
- Identificar el paso de una campaña que genera cada resultado.
- Navegar desde el funnel a campañas, landings, leads y pipeline.
- Utilizar el funnel como contexto de reporting y atribución.

### 3.8 Organic Leads

**Ruta:** `/organic`

Organic Leads reúne oportunidades de demanda orgánica, visibilidad local y presencia en buscadores y sistemas de IA.

Funciones principales:

- Crear o seleccionar un proyecto orgánico.
- Conectar Google Search Console mediante OAuth.
- Descubrir propiedades disponibles y seleccionar la propiedad de trabajo.
- Consultar consultas, páginas, impresiones, clics, CTR y posición.
- Detectar búsquedas con intención comercial.
- Ordenar oportunidades por demanda, competencia y valor estimado.
- Generar páginas de servicio y contenidos asociados a oportunidades.
- Consultar visibilidad local y presencia por ubicación.
- Revisar visibilidad en respuestas de IA.
- Analizar contenido, competidores y menciones locales.
- Crear publicaciones locales, activos y acciones de optimización.
- Relacionar oportunidades orgánicas con landings, leads y valor comercial.

## 4. Conversación

### 4.1 Inbox

**Ruta:** `/conversacion/inbox`

Inbox centraliza las conversaciones de los distintos canales en una bandeja operativa.

Funciones principales:

- Consultar conversaciones por contacto, canal y estado.
- Ver el historial de mensajes y el contexto del lead.
- Responder desde el canal conectado.
- Clasificar conversaciones y asignarlas a personas o agentes.
- Crear tareas y seguimientos desde una conversación.
- Relacionar conversación con lead, campaña, oportunidad o reunión.
- Consultar actividad reciente y estado de atención.

### 4.2 Llamadas

**Ruta:** `/llamadas`  
**Página relacionada:** `/llamadas/:id`

Llamadas permite operar y analizar las conversaciones telefónicas de la organización.

Funciones principales:

- Consultar listado de llamadas con paginación y filtros.
- Buscar por contacto, teléfono, agente, estado o resultado.
- Revisar duración, dirección, estado y resultado de cada llamada.
- Consultar métricas agregadas de llamadas.
- Abrir la ficha con transcripción, resumen, señales, sentimiento y próximos pasos.
- Crear tareas de seguimiento desde una llamada.
- Relacionar llamada con lead, reunión, campaña y oportunidad.
- Exportar el listado de llamadas.
- Lanzar una nueva llamada desde el módulo de voz.

### 4.3 Agentes IA

**Ruta:** `/agentes`  
**Página relacionada:** `/agentes/:id`

Agentes IA es el espacio para crear, configurar y operar asistentes de voz y conversación.

Funciones principales:

- Crear agentes para recepción, cualificación, ventas, soporte o seguimiento.
- Configurar nombre, rol, idioma, voz, tono y comportamiento.
- Asociar conocimiento y playbooks al agente.
- Definir preguntas, criterios de cualificación y reglas de transferencia.
- Configurar disponibilidad, canales y acciones posteriores a la conversación.
- Activar o desactivar agentes.
- Consultar actividad, llamadas y resultados asociados.
- Abrir la ficha avanzada de un agente.
- Mantener la configuración mediante cambios guardados y versionados por el backend.

### 4.4 Playbooks

**Ruta:** `/playbooks`  
**Página relacionada:** `/playbooks/:id`

Playbooks contiene guías operativas para que personas y agentes sigan procesos comerciales consistentes.

Funciones principales:

- Crear playbooks por proceso, canal o tipo de oportunidad.
- Definir pasos, preguntas, respuestas, criterios y acciones.
- Asociar playbook a agentes, llamadas, campañas o equipos.
- Consultar y editar versiones.
- Revisar cambios antes de publicarlos.
- Activar playbooks para su uso operativo.
- Consultar la ficha con instrucciones, uso e integraciones relacionadas.

### 4.5 Test de Voz

**Ruta:** `/voz/test`

Laboratorio para probar la experiencia de voz antes de utilizarla en una operación comercial.

Funciones principales:

- Seleccionar agente y configuración de voz.
- Iniciar una conversación de prueba.
- Probar micrófono, audio, streaming y respuesta del agente.
- Consultar eventos de la sesión.
- Validar respuesta, transferencia y cierre de llamada.
- Revisar el resultado de la prueba antes de activar un agente.

## 5. Nutrición

### 5.1 Email marketing

**Ruta:** `/email-marketing`

Email marketing gestiona campañas, plantillas y comunicaciones de nutrición.

Funciones principales:

- Crear campañas de email.
- Definir asunto, remitente, contenido y audiencia.
- Gestionar plantillas y mensajes reutilizables.
- Segmentar leads y contactos.
- Programar envíos y consultar su estado.
- Asociar envíos a campañas y secuencias.
- Consultar entregas, aperturas, clics, respuestas, rebotes y bajas.
- Sincronizar contactos y eventos con Mautic.
- Respetar consentimiento, supresión y preferencias de contacto.

### 5.2 Automatizaciones

**Ruta:** `/automatizaciones`  
**Página relacionada:** `/automatizaciones/:id`

Automatizaciones permite construir procesos que reaccionan a eventos comerciales y ejecutan acciones coordinadas.

Funciones principales:

- Crear automatizaciones a partir de disparadores.
- Configurar condiciones, esperas y ramas.
- Ejecutar acciones sobre leads, cuentas, tareas, emails, reuniones, pipeline y agentes.
- Consultar ejecuciones, pasos, estado, intentos y resultados.
- Activar, pausar y reanudar automatizaciones.
- Revisar la ficha de una automatización y su historial.
- Utilizar leases, reintentos y eventos outbox para ejecutar procesos asíncronos.

## 6. Growth

### 6.1 Growth Hub

**Ruta:** `/growth`

Growth Hub coordina programas de crecimiento que combinan activos, campañas, contenido y seguimiento.

Funciones principales:

- Crear programas de crecimiento a partir de un objetivo.
- Definir audiencia, duración, presupuesto y resultado esperado.
- Organizar assets, acciones y etapas del programa.
- Relacionar landings, campañas, publicaciones, emails y secuencias.
- Consultar el estado del programa y sus ejecuciones.
- Generar borradores de activos y acciones coordinadas.
- Iniciar procesos de aprobación y activación.
- Consultar resultados y señales de rendimiento.

## 7. Ventas

### 7.1 Leads

**Ruta:** `/leads`  
**Página relacionada:** `/leads/:id`

Leads es el registro central de personas interesadas y contactos captados.

Funciones principales:

- Consultar, buscar y filtrar leads.
- Ordenar por estado, origen, fecha, prioridad, responsable o campaña.
- Crear nuevos leads.
- Importar leads y prospectos.
- Asignar responsable y fuente.
- Registrar contacto, notas y tareas.
- Abrir la ficha completa del lead.
- Ver conversaciones, llamadas, reuniones, emails y oportunidades relacionadas.
- Cambiar estado y cualificación.
- Crear seguimiento, secuencia o reunión.
- Relacionar lead con campaña, landing y atribución de ingresos.

### 7.2 Pipeline

**Ruta:** `/pipeline`  
**Página relacionada:** `/pipeline/:id`

Pipeline muestra las oportunidades comerciales desde la primera conversación hasta el cierre.

Funciones principales:

- Visualizar oportunidades por etapas.
- Crear oportunidades y asociarlas a leads o cuentas.
- Mover oportunidades entre etapas.
- Consultar valor, probabilidad, fecha prevista y responsable.
- Filtrar por equipo, estado, fuente, campaña y periodo.
- Abrir el detalle de una oportunidad.
- Registrar actividad, tareas, notas y reuniones.
- Reabrir o cerrar oportunidades según permisos.
- Relacionar oportunidad con ingresos atribuidos y costes de adquisición.

### 7.3 Reuniones

**Ruta:** `/reuniones`  
**Página relacionada:** `/reuniones/:id`

Reuniones organiza las citas comerciales y su relación con el proceso de venta.

Funciones principales:

- Consultar reuniones en lista y calendario.
- Crear reuniones con lead, cuenta, oportunidad, responsable, fecha y duración.
- Filtrar por estado, responsable y periodo.
- Confirmar, reprogramar, cancelar y completar reuniones.
- Abrir la ficha con participantes, contexto y actividad.
- Registrar resultado y próximos pasos.
- Crear tareas posteriores a la reunión.
- Vincular reunión con campaña, llamada, pipeline y atribución.

### 7.4 Inteligencia comercial

**Ruta:** `/inteligencia-comercial`

Inteligencia comercial convierte la actividad de captación y ventas en lectura de ingresos y decisiones.

Funciones principales:

- Consultar ingresos atribuidos por fuente, campaña, canal y periodo.
- Ver coste por lead, coste por reunión, coste por oportunidad y retorno.
- Analizar conversiones entre etapas del pipeline.
- Comparar equipos, canales y campañas.
- Consultar previsión de ingresos y estado del forecast.
- Identificar oportunidades estancadas y puntos de aceleración.
- Revisar señales de rendimiento y recomendaciones comerciales.
- Exportar o compartir lecturas de rendimiento.

## 8. Sistema

### 8.1 Insights

**Ruta:** `/insights`

Insights ofrece una lectura analítica transversal de la actividad comercial.

Funciones principales:

- Consultar llamadas, reuniones, leads, conversiones y actividad.
- Visualizar evolución diaria, semanal y mensual.
- Comparar volumen de llamadas con reuniones generadas.
- Consultar métricas de campañas, pipeline y equipos.
- Filtrar el periodo de análisis.
- Revisar indicadores y gráficos de rendimiento.
- Navegar desde una métrica al módulo operativo correspondiente.

### 8.2 Knowledge Base

**Ruta:** `/knowledge-base`  
**Página relacionada:** `/knowledge-base/articulos/:id`

Knowledge Base centraliza el conocimiento que utilizan los equipos y los agentes IA.

Funciones principales:

- Crear artículos y documentos.
- Organizar contenido por categorías.
- Subir archivos PDF, DOC, DOCX, TXT, MD, CSV y JSON.
- Procesar documentos para convertirlos en artículos consultables.
- Buscar, filtrar y paginar contenido.
- Editar y eliminar artículos.
- Abrir una ficha con contenido, metadatos y relación con agentes.
- Mantener conocimiento de producto, procesos, objeciones, servicios e integraciones.
- Utilizar los artículos como fuente para respuestas y playbooks.

### 8.3 Configuración

**Ruta:** `/configuracion`

Configuración reúne la administración cotidiana de la cuenta, organización y conexiones.

Funciones principales:

- Editar perfil de usuario.
- Administrar nombre, email, web, teléfono, industria, dirección, zona horaria y moneda de la organización.
- Gestionar preferencias de idioma y formato.
- Cambiar contraseña.
- Consultar integraciones y su estado.
- Acceder a la configuración de Meta Ads, Google, Metricool, Postiz, Mautic y Twilio.
- Administrar opciones de seguridad y sesiones.
- Consultar datos de uso y módulos habilitados.

### 8.4 Gobierno empresarial

**Ruta:** `/gobierno-empresarial`

Gobierno empresarial gestiona decisiones que requieren revisión, separación de funciones y trazabilidad.

Funciones principales:

- Consultar solicitudes de acceso y elevación de rol.
- Revisar solicitudes de experimento de pago y gasto.
- Revisar cambios de playbooks y memoria operativa.
- Aprobar o rechazar solicitudes según tipo y rol.
- Consultar responsables, fechas, justificación y estado.
- Ver historial de decisiones y auditoría.
- Mantener separación entre quien solicita y quien aprueba.

### 8.5 Control de accesos

**Ruta:** `/access-control`

Control de accesos administra roles, permisos y espacios de trabajo.

Funciones principales:

- Consultar miembros de la organización.
- Ver roles y permisos efectivos.
- Gestionar solicitudes de acceso.
- Consultar capacidades incluidas en cada plan.
- Revisar límites de usuarios, leads, campañas, agentes, automatizaciones y workspaces.
- Gestionar workspaces de agencias.
- Cambiar contexto de workspace cuando existe autorización.
- Revisar trazabilidad de cambios de acceso.

## 9. Páginas públicas y de acceso

### 9.1 Inicio de sesión

**Ruta:** `/login`

Permite iniciar sesión y establecer la sesión autenticada de la organización.

Funciones principales:

- Introducir credenciales.
- Mantener la sesión de usuario.
- Recuperar el acceso mediante los mecanismos disponibles.
- Acceder a la experiencia autorizada para el rol y workspace.

### 9.2 Landing pública

**Ruta:** `/l/:slug`

Página pública generada desde una landing de campaña.

Funciones principales:

- Mostrar propuesta de valor, servicios, contenidos y llamadas a la acción.
- Recibir parámetros UTM y conservar el contexto de atribución.
- Capturar datos mediante formulario.
- Crear o actualizar un lead.
- Asociar la conversión con campaña, fuente y landing.

### 9.3 Compartir campaña

**Ruta:** `/campanas/compartir/:token`

Vista pública para compartir una campaña o presentación de resultados mediante un token.

Funciones principales:

- Mostrar la información compartida de la campaña.
- Presentar objetivos, activos, actividad y resultados seleccionados.
- Permitir la consulta sin entrar en el espacio autenticado.

### 9.4 Privacidad y términos

**Rutas:** `/privacidad`, `/terminos`

Páginas informativas de privacidad, tratamiento de datos y condiciones de uso.

## 10. Páginas de detalle

Las páginas de detalle mantienen el contexto del registro seleccionado y concentran sus acciones, relaciones e historial.

| Página | Ruta | Registro que representa | Funcionalidad principal |
|---|---|---|---|
| Detalle de agente | `/agentes/:id` | Agente IA | Configuración, conocimiento, playbook, voz, actividad y estado |
| Detalle de lead | `/leads/:id` | Lead | Datos, actividad, conversaciones, tareas, reuniones, pipeline y seguimiento |
| Detalle de campaña | `/campanas/:id` | Campaña | Objetivo, presupuesto, activos, Ads, leads, actividad y atribución |
| Detalle de llamada | `/llamadas/:id` | Llamada | Audio, transcripción, resumen, señales, participantes y tareas |
| Detalle de reunión | `/reuniones/:id` | Reunión | Participantes, agenda, estado, resultado, notas y próximos pasos |
| Detalle de automatización | `/automatizaciones/:id` | Automatización | Disparadores, pasos, condiciones, ejecuciones e historial |
| Detalle de artículo | `/knowledge-base/articulos/:id` | Artículo | Contenido, categoría, metadatos y uso en conocimiento |
| Detalle de playbook | `/playbooks/:id` | Playbook | Pasos, instrucciones, versiones, agentes y procesos vinculados |
| Detalle de oportunidad | `/pipeline/:id` | Oportunidad | Etapa, valor, probabilidad, actividad, tareas, reuniones y cierre |

## 11. Servicios y conexiones que soportan las páginas

Las páginas operativas se conectan con estos servicios y fuentes:

- **Meta Ads:** cuentas publicitarias, campañas, anuncios, leads, insights y conversiones.
- **Google Search Console:** propiedades, consultas, páginas, impresiones, clics, CTR y posición.
- **Google Places:** descubrimiento y datos públicos de Prospect Finder.
- **Metricool:** publicaciones, perfiles, programación y analítica social.
- **Postiz:** integraciones de redes, borradores, publicaciones programadas y contenido social.
- **Mautic:** contactos, segmentos, campañas, envíos, respuestas, rebotes y bajas.
- **Twilio:** llamadas, WhatsApp, callbacks, Media Streams y estados de comunicación.
- **Base de conocimiento:** documentos y artículos consultables por agentes y procesos.
- **CRM interno:** leads, cuentas, oportunidades, tareas, reuniones, llamadas y atribución.
- **Workers y colas:** sincronizaciones, outbox, automatizaciones, secuencias y tareas programadas.

## 12. Flujo funcional completo de Vendrava

Una operación puede recorrer las páginas de la plataforma en este orden:

1. Se define un objetivo desde **Objetivos**.
2. Se detecta la oportunidad en **Ads**, **Organic Leads** o **Prospect Finder**.
3. Se crea una **Campaña**, **Landing**, **Funnel**, publicación o secuencia.
4. El contacto entra por una landing, anuncio, red social, email, llamada o prospección.
5. El registro se centraliza en **Leads** y **Inbox**.
6. Un equipo o **Agente IA** realiza la conversación y crea seguimiento.
7. La actividad se convierte en **Reunión** y después en una oportunidad de **Pipeline**.
8. **Automatizaciones**, email y playbooks mantienen el seguimiento.
9. **Inteligencia comercial** e **Insights** conectan el resultado con la fuente y el ingreso.
10. **Gobierno empresarial**, **Control de accesos** y **Configuración** mantienen el control operativo de la organización.

## 13. Resumen de la plataforma actual

Vendrava dispone de una experiencia unificada para:

- Captar demanda de pago, orgánica y prospectada.
- Crear campañas, landings, funnels, publicaciones y emails.
- Conversar mediante Inbox, llamadas, WhatsApp y agentes IA.
- Organizar leads, reuniones, tareas, oportunidades y pipeline.
- Automatizar seguimientos y secuencias.
- Centralizar conocimiento y playbooks.
- Coordinar objetivos mediante el Orquestador y Growth Hub.
- Medir actividad, conversiones, atribución e ingresos.
- Administrar cuentas, conexiones, permisos, workspaces y aprobaciones.

