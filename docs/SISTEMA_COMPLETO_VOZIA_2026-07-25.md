# Sistema completo de Vozia

Documento técnico integral del CRM, automatización comercial, marketing y llamadas de voz.

- Fecha de revisión: 25 de julio de 2026.
- Ubicación del proyecto: E:/exclusion/silxarcrm/llamadasrobin.
- Propósito: describir la arquitectura real, el flujo de datos, las capacidades de voz y el estado de producción.
- Idiomas objetivo: español e inglés en la aplicación; español de España como idioma por defecto de las llamadas.
- Alcance: interfaz web, API, base de datos, workers, integraciones, telefonía, motores de voz, observabilidad y operación.

## Cómo leer este documento

Este documento funciona como mapa técnico y operativo del sistema. Cada módulo se describe por su responsabilidad, entradas, salidas, dependencias, estado y siguiente acción.

La palabra producción se usa con prudencia. Que una ruta compile o responda no significa que esté lista para recibir tráfico real, datos personales o llamadas de clientes.

El sistema contiene una plataforma comercial amplia y una capa de voz que todavía conviene tratar como dos superficies operativas relacionadas. La arquitectura permite unirlas, pero el nivel de producción depende de secretos, proveedores, migraciones, telefonía, pruebas y operación.

## Resumen ejecutivo

Vozia es una plataforma multiempresa para gestionar captación, leads, conversaciones, campañas, tareas, oportunidades, automatizaciones, marketing y agentes de voz.

El frontend está construido con React y Vite. La navegación está protegida por autenticación, permisos y selección de experiencia. Las páginas pesadas se cargan de forma diferida para reducir el JavaScript inicial.

El backend está construido con Node.js, TypeScript, Fastify y Prisma. Expone rutas agrupadas por dominio y delega la lógica en servicios específicos. Los workers ejecutan tareas asíncronas, sincronizaciones y procesos de outbox.

La base de datos PostgreSQL concentra el estado transaccional. Prisma define organizaciones, usuarios, agentes, campañas, leads, llamadas, conversaciones, mensajes, automatizaciones, tareas, marketing, crecimiento, memoria operativa y gobernanza.

La capa de voz integra telefonía, streaming de audio, control de sesiones, transcripción, inteligencia conversacional, texto a voz, cumplimiento, trazas y evaluación.

El objetivo de experiencia es acercarse a un sistema de interacción continua tipo GPT Live: escucha permanente, turnos naturales, interrupciones, silencios útiles, confirmaciones y baja latencia. El sistema todavía necesita medición de latencia extremo a extremo y validación con llamadas reales.

## Estado global actual

| Área | Estado | Lectura práctica |
| --- | --- | --- |
| Frontend | Funcional y compilable | La aplicación arranca y la carga inicial ha mejorado con lazy loading. |
| Backend API | Compilable | Los módulos principales están presentes y las validaciones críticas han mejorado. |
| Base de datos | Prisma operativo | Existe una migración nueva para aprobaciones sensibles, pero el conjunto de migraciones debe consolidarse y revisarse. |
| Autenticación | Implementada | Requiere validar secretos, expiración, cookies, CORS y recuperación en el entorno elegido. |
| Multiempresa | Diseñada | Hay aislamiento por organización en servicios clave; debe auditarse de forma sistemática en todas las rutas. |
| Voz española | Orientada a es-ES | Los valores por defecto ya priorizan español y la sesión puede transportar idioma. |
| Full dúplex | Parcial | Hay piezas de streaming y gateway; falta probar interacción continua con métricas comparables. |
| Agentes inbound | Soportados por modelo | La dirección inbound existe en configuración y telefonía. |
| Agentes outbound | Soportados por modelo | Falta validar campañas, consentimiento, reintentos y control de horario en operación real. |
| Open source local | Preparado como arquitectura | La ejecución real depende del hardware, modelos descargados, cuantización y pruebas de calidad. |
| Producción | No cerrada | Hay trabajo pendiente en secretos, migraciones, proveedores, monitorización y procedimientos de rollback. |

## Objetivos funcionales

1. Recibir llamadas entrantes con un agente especializado.
2. Realizar llamadas salientes con consentimiento, horarios y reintentos controlados.
3. Mantener conversaciones naturales en español de España.
4. Permitir interrupciones del usuario sin esperar a que termine una frase larga.
5. Emitir respuestas con una voz configurable por agente.
6. Registrar transcripción, eventos, métricas, resultado y tareas derivadas.
7. Transferir a una persona cuando el caso lo requiera.
8. Conectar la conversación de voz con lead, campaña, oportunidad y organización.
9. Ejecutar automatizaciones y seguimientos posteriores a la llamada.
10. Ofrecer una interfaz bilingüe para administración y operación.

## Objetivos no funcionales

- Baja latencia perceptible en la primera respuesta.
- Recuperación ante desconexión de proveedor.
- Aislamiento estricto por organización.
- Idempotencia en webhooks, eventos y trabajos.
- Trazabilidad de cada llamada.
- Minimización y protección de datos personales.
- Despliegue reproducible en servidor propio.
- Capacidad de sustituir proveedores por modelos open source locales.
- Métricas de calidad de voz, interrupciones, silencios y errores.
- Operación segura con apagado y reanudación de workers.

## Arquitectura de alto nivel

```text
Usuario operador
      |
      v
Frontend React / Vite
      | HTTPS
      v
API Fastify / TypeScript
      |
      +--> PostgreSQL mediante Prisma
      +--> Redis o cola equivalente
      +--> Proveedores de marketing y telefonía
      +--> Servicios de voz locales o remotos
      +--> Workers y outbox
      +--> Observabilidad y auditoría
      |
      v
Telefonía -> Media Stream -> Sesión dúplex -> STT / LLM / TTS -> Audio
```

La arquitectura está separada por dominios, pero el flujo de llamada atraviesa casi todo el sistema. Por ello una modificación de voz puede afectar autenticación, agentes, leads, campañas, tareas, privacidad y facturación operativa.

## Principios de diseño

- La organización es el límite de seguridad principal.
- El agente define intención, idioma, voz, dirección y políticas.
- La llamada es un proceso con estado, no solo una transcripción.
- El audio y la transcripción deben tener trazas correlacionadas.
- Las decisiones irreversibles requieren confirmación o escalado.
- Las integraciones externas deben ser tolerantes a reintentos.
- Las tareas largas deben salir del proceso HTTP.
- La configuración por entorno nunca debe depender de secretos versionados.
- La experiencia de interrupción es parte central del producto.
- Todo comportamiento importante debe poder observarse y evaluarse.

## Mapa del repositorio

El repositorio agrupa aplicación web, API, motor de voz, documentación y configuración de despliegue. Las carpetas tienen responsabilidades distintas y deben mantenerse separadas para evitar que una optimización local rompa la operación global.

### Aplicación web

- Archivo o ámbito: src/.
- Responsabilidad: Interfaz principal para operadores y administradores.
- Entradas: Sesión, organización, permisos y datos de API.
- Salidas: Páginas, modales, estados y navegación.
- Dependencias: React, Vite, librerías visuales y API cliente.
- Estado actual: Compilable y con carga diferida aplicada.
- Siguiente acción: Medir errores de runtime y dividir los chunks restantes.

### API

- Archivo o ámbito: backend/src/.
- Responsabilidad: Servidor HTTP y composición de dominios.
- Entradas: Petición autenticada, payload y contexto de organización.
- Salidas: Respuesta JSON, evento o trabajo asíncrono.
- Dependencias: Fastify, Prisma, servicios, middlewares.
- Estado actual: Compilable con rutas organizadas.
- Siguiente acción: Añadir pruebas de contrato por dominio.

### Motor de voz

- Archivo o ámbito: voice-engine/.
- Responsabilidad: Procesamiento de audio, STT, TTS y sesiones dúplex.
- Entradas: Frames de audio, configuración y eventos de sesión.
- Salidas: Audio, texto, eventos y métricas.
- Dependencias: Python, modelos locales y gateway.
- Estado actual: Prototipo funcional con defaults españoles.
- Siguiente acción: Medir latencia y calidad con audio real.

### Esquema Prisma

- Archivo o ámbito: backend/prisma/.
- Responsabilidad: Modelo persistente y migraciones.
- Entradas: Entidades, relaciones y cambios de esquema.
- Salidas: Tablas, índices y restricciones.
- Dependencias: PostgreSQL y Prisma Client.
- Estado actual: Generación operativa; migraciones pendientes de consolidación.
- Siguiente acción: Revisar historial y ejecutar migración en staging.

### Documentación

- Archivo o ámbito: docs/.
- Responsabilidad: Decisiones, auditorías, runbooks y arquitectura.
- Entradas: Código, resultados de pruebas y decisiones.
- Salidas: Guías de operación y diseño.
- Dependencias: Markdown y artefactos de revisión.
- Estado actual: Amplia y en crecimiento.
- Siguiente acción: Mantener un índice único y fechas de revisión.

### Configuración raíz

- Archivo o ámbito: package.json, vite.config.js, docker-compose.yml.
- Responsabilidad: Arranque local, compilación y servicios auxiliares.
- Entradas: Variables de entorno y comandos.
- Salidas: Procesos web, base de datos y contenedores.
- Dependencias: npm, Docker y entorno de servidor.
- Estado actual: Disponible con riesgos de secretos y persistencia.
- Siguiente acción: Separar perfiles local, staging y producción.

### Pruebas

- Archivo o ámbito: backend/src/__tests__, voice-engine/test_moshi_gateway.py.
- Responsabilidad: Verificar lógica, contratos y gateway.
- Entradas: Fixtures, mocks, peticiones y audio sintético.
- Salidas: Aserciones y reportes.
- Dependencias: Vitest, scripts offline y Python.
- Estado actual: Smoke tests pasan; suite completa requiere base aislada.
- Siguiente acción: Crear entorno efímero de integración.

### Control de versiones

- Archivo o ámbito: .gitignore y .git/.
- Responsabilidad: Evitar secretos y registrar cambios.
- Entradas: Archivos del proyecto y reglas de exclusión.
- Salidas: Historial reproducible.
- Dependencias: Git.
- Estado actual: El secreto local backend/.env ya no está indexado.
- Siguiente acción: Rotar credenciales que hayan estado expuestas.

## Frontend y experiencia de usuario

El frontend es la superficie de operación diaria. Debe permitir comprender qué ocurre en una llamada, corregir configuraciones, revisar leads, ejecutar acciones y distinguir claramente entre datos demo, datos reales y errores de integración.

Nota sobre el estado: en esta sección, Operativo significa que la página compila y renderiza. No implica integración extremo a extremo con datos reales del backend; buena parte de la interfaz sigue funcionando con datos demo (ver src/lib/dataMode.js) y la conexión real debe verificarse módulo a módulo.

### Punto de entrada de React

- Archivo o ámbito: src/main.jsx.
- Responsabilidad: Montar la aplicación y proveedores globales.
- Entradas: DOM, configuración de Vite y contexto.
- Salidas: Árbol React inicial.
- Dependencias: React, AuthContext y estilos.
- Estado actual: Operativo.
- Siguiente acción: Añadir manejo visible de fallo de montaje.

### Composición principal

- Archivo o ámbito: src/App.jsx.
- Responsabilidad: Definir rutas, layout, guards y carga de páginas.
- Entradas: Sesión, permisos, experiencia y URL.
- Salidas: Página protegida o pública.
- Dependencias: React Router, AuthContext y páginas.
- Estado actual: Lazy loading aplicado a páginas pesadas.
- Siguiente acción: Analizar chunks de gráficos y dependencias compartidas.

### Contexto de autenticación

- Archivo o ámbito: src/contexts/AuthContext.jsx.
- Responsabilidad: Mantener identidad, token y organización.
- Entradas: Respuesta de login, refresh y logout.
- Salidas: Usuario actual y estado de sesión.
- Dependencias: API cliente y almacenamiento de sesión.
- Estado actual: Implementado.
- Siguiente acción: Añadir pruebas de expiración y recuperación.

### Contexto de experiencia

- Archivo o ámbito: src/contexts/ExperienceContext.jsx.
- Responsabilidad: Seleccionar idioma y modo de interfaz.
- Entradas: Preferencias locales y perfil.
- Salidas: Experiencia ES o EN.
- Dependencias: i18n y preferencias.
- Estado actual: Implementado.
- Siguiente acción: Persistir preferencia en servidor cuando proceda.

### Sistema i18n

- Archivo o ámbito: src/i18n/index.js.
- Responsabilidad: Resolver textos de interfaz por idioma.
- Entradas: Clave, idioma y variables.
- Salidas: Texto traducido.
- Dependencias: Diccionario español e inglés.
- Estado actual: Implementado en la superficie principal.
- Siguiente acción: Detectar claves ausentes durante CI.

### Traducción heredada

- Archivo o ámbito: src/i18n/legacyDomTranslation.js.
- Responsabilidad: Mantener compatibilidad con textos DOM antiguos.
- Entradas: Nodo y diccionario.
- Salidas: Texto actualizado.
- Dependencias: DOM y catálogo de traducciones.
- Estado actual: Compatibilidad existente.
- Siguiente acción: Eliminar gradualmente mutaciones directas del DOM.

### Cliente API

- Archivo o ámbito: src/lib/api.js.
- Responsabilidad: Centralizar peticiones, headers y errores.
- Entradas: Método, ruta, body y sesión.
- Salidas: JSON, error normalizado o blob.
- Dependencias: Fetch, token y backend.
- Estado actual: Operativo.
- Siguiente acción: Añadir cancelación y trazas de request.

### Sesión local

- Archivo o ámbito: src/lib/authSession.js.
- Responsabilidad: Leer y escribir credenciales de sesión.
- Entradas: Token, usuario y expiración.
- Salidas: Estado persistido.
- Dependencias: Storage del navegador.
- Estado actual: Operativo.
- Siguiente acción: Revisar XSS, renovación y política de almacenamiento.

### Modo de datos

- Archivo o ámbito: src/lib/dataMode.js.
- Responsabilidad: Distinguir datos demo de datos de servidor.
- Entradas: Feature flag o configuración.
- Salidas: Modo mock o live.
- Dependencias: Variables de entorno.
- Estado actual: Disponible.
- Siguiente acción: Mostrar el modo activo al operador.

### Estado de datos

- Archivo o ámbito: src/lib/dataStatus.js.
- Responsabilidad: Representar carga, error, vacío y éxito.
- Entradas: Promise y resultado.
- Salidas: Estado de UI.
- Dependencias: Hooks y componentes.
- Estado actual: Disponible.
- Siguiente acción: Unificar estados en un componente común.

### Configuración visual

- Archivo o ámbito: src/lib/experienceConfig.js.
- Responsabilidad: Resolver textos y capacidades por experiencia.
- Entradas: Idioma y módulo.
- Salidas: Labels, iconos y capacidades.
- Dependencias: i18n.
- Estado actual: Operativo.
- Siguiente acción: Documentar claves funcionales y no solo visuales.

### Permisos de navegación

- Archivo o ámbito: src/lib/navigationPermissions.js.
- Responsabilidad: Ocultar o bloquear rutas según capacidad.
- Entradas: Rol, permisos y organización.
- Salidas: Menú y guardas.
- Dependencias: AuthContext.
- Estado actual: Operativo.
- Siguiente acción: Alinear permisos de UI con autorización backend.

### Layout principal

- Archivo o ámbito: src/App.jsx y src/components/Sidebar.jsx (no existe un AppLayout.jsx dedicado).
- Responsabilidad: Proporcionar navegación, header y área de trabajo.
- Entradas: Página, usuario y sidebar.
- Salidas: Estructura visual consistente.
- Dependencias: React Router y componentes base.
- Estado actual: Operativo.
- Siguiente acción: Añadir señal clara de estado de conexión.

### Barra lateral

- Archivo o ámbito: src/components/Sidebar.jsx.
- Responsabilidad: Navegar por dominios funcionales.
- Entradas: Permisos y experiencia.
- Salidas: Enlaces y selección activa.
- Dependencias: Navigation permissions.
- Estado actual: Operativo.
- Siguiente acción: Revisar accesibilidad de teclado.

### Cabecera

- Archivo o ámbito: src/components/ExperienceSwitcher.jsx (no existe un Header.jsx dedicado).
- Responsabilidad: Mostrar organización, idioma y acciones globales.
- Entradas: Usuario, organización y eventos.
- Salidas: Controles de sesión y contexto.
- Dependencias: AuthContext.
- Estado actual: Operativo.
- Siguiente acción: Añadir indicador de llamada activa.

### Centro de llamadas

- Archivo o ámbito: src/components/Calls.jsx (no existe un CallCenter.jsx separado).
- Responsabilidad: Supervisar llamadas, estados y acciones.
- Entradas: Call, agent, transcript y eventos.
- Salidas: Panel operativo.
- Dependencias: API de calls y componentes de voz.
- Estado actual: Funcionalidad presente.
- Siguiente acción: Conectar métricas de latencia y calidad en directo.

### Panel de agente

- Archivo o ámbito: src/modals/NewAgenteModal.jsx y src/pages/VoiceTestPage.jsx (no existe AgentPanel.jsx).
- Responsabilidad: Configurar agente y probar capacidades.
- Entradas: Agent config y permisos.
- Salidas: Formulario y estado guardado.
- Dependencias: Agents API.
- Estado actual: Validación backend reforzada.
- Siguiente acción: Añadir preview de voz y prueba de interrupción.

### Lista de agentes

- Archivo o ámbito: src/components/Agentes.jsx.
- Responsabilidad: Listar y seleccionar agentes.
- Entradas: Organización y filtros.
- Salidas: Tarjetas, estados y acciones.
- Dependencias: Agents API.
- Estado actual: Operativa.
- Siguiente acción: Mostrar dirección inbound, outbound o ambas.

### Detalle de agente

- Archivo o ámbito: src/pages/AgentDetailPage.jsx.
- Responsabilidad: Editar prompt, voz, idioma y comportamiento.
- Entradas: Agent ID y formulario.
- Salidas: Configuración versionada o guardada.
- Dependencias: Agents API y validación.
- Estado actual: Operativo con campos principales.
- Siguiente acción: Añadir historial de cambios y prueba de llamada.

### Página de llamadas

- Archivo o ámbito: src/components/Calls.jsx.
- Responsabilidad: Consultar llamadas y resultados.
- Entradas: Filtros, paginación y organización.
- Salidas: Tabla y detalle.
- Dependencias: Calls API.
- Estado actual: Operativa.
- Siguiente acción: Añadir filtros de latencia, idioma y transferencia.

### Detalle de llamada

- Archivo o ámbito: src/pages/CallDetailPage.jsx.
- Responsabilidad: Inspeccionar transcripción, eventos y tareas.
- Entradas: Call ID.
- Salidas: Timeline, evaluación y acciones.
- Dependencias: Calls API, traces y tasks.
- Estado actual: Operativo en superficie.
- Siguiente acción: Enmascarar PII de forma consistente.

### Dashboard

- Archivo o ámbito: src/components/Dashboard.jsx.
- Responsabilidad: Ofrecer visión de negocio y operación.
- Entradas: Métricas y organización.
- Salidas: KPIs, gráficos y alertas.
- Dependencias: Dashboard API y charts.
- Estado actual: Operativo.
- Siguiente acción: Separar métricas demo de métricas reales.

### Leads

- Archivo o ámbito: src/components/Leads.jsx.
- Responsabilidad: Gestionar captación y calificación.
- Entradas: Filtros y leads.
- Salidas: Tabla, detalle y acciones.
- Dependencias: Leads API.
- Estado actual: Operativo.
- Siguiente acción: Alinear estados con flujo outbound.

### Oportunidades

- Archivo o ámbito: src/components/Pipeline.jsx y src/pages/OpportunityDetailPage.jsx.
- Responsabilidad: Gestionar pipeline comercial.
- Entradas: Opportunities y actividades.
- Salidas: Kanban, detalle y timeline.
- Dependencias: Pipeline API.
- Estado actual: Operativo.
- Siguiente acción: Añadir eventos de llamada y consentimiento.

### Campañas

- Archivo o ámbito: src/components/Campaigns.jsx y src/pages/CampaignDetailPage.jsx.
- Responsabilidad: Crear campañas y revisar ejecución.
- Entradas: Campañas, audiencia y canales.
- Salidas: Wizard y estados.
- Dependencias: Campaigns API y workers.
- Estado actual: Operativo con jobs asíncronos.
- Siguiente acción: Mostrar salud de colas y últimos errores.

### Automatizaciones

- Archivo o ámbito: src/components/Automatizaciones.jsx y src/pages/AutomacionDetailPage.jsx.
- Responsabilidad: Configurar reglas y pasos.
- Entradas: Triggers, acciones y versiones.
- Salidas: Editor y ejecuciones.
- Dependencias: Automations API.
- Estado actual: Operativo.
- Siguiente acción: Validar ciclos y límites de ejecución.

### Tareas

- Archivo o ámbito: sin página dedicada; la API está en backend/src/routes/tasks.ts.
- Responsabilidad: Coordinar trabajo humano y automático.
- Entradas: Task, priority y status.
- Salidas: Bandeja de tareas.
- Dependencias: Tasks API.
- Estado actual: La API existe; el frontend no tiene bandeja de tareas dedicada.
- Siguiente acción: Crear la página de tareas y añadir SLA y asignación por equipo.

### Marketing

- Archivo o ámbito: src/pages/EmailMarketingPage.jsx y src/pages/AdsPage.jsx.
- Responsabilidad: Supervisar campañas de email y ads.
- Entradas: Métricas de proveedores.
- Salidas: Panel de rendimiento.
- Dependencias: Marketing, Meta y Metricool API.
- Estado actual: Operativo según credenciales.
- Siguiente acción: Mostrar fecha de sincronización y frescura.

### Crecimiento

- Archivo o ámbito: src/pages/GrowthHubPage.jsx.
- Responsabilidad: Gestionar programas y experimentos.
- Entradas: GrowthProgram y RevenueExperiment.
- Salidas: Panel de iniciativas.
- Dependencias: Growth y Revenue APIs.
- Estado actual: Operativo.
- Siguiente acción: Alinear gobernanza de experimentos.

### Configuración

- Archivo o ámbito: src/components/Configuracion.jsx.
- Responsabilidad: Administrar organización, integraciones y preferencias.
- Entradas: Perfil, credenciales y permisos.
- Salidas: Formularios de configuración.
- Dependencias: Settings, accounts y access control.
- Estado actual: Operativo.
- Siguiente acción: Separar secretos visibles de metadatos.

### Páginas públicas

- Archivo o ámbito: src/pages/LoginPage.jsx, TermsPage.jsx, PrivacyPage.jsx.
- Responsabilidad: Permitir acceso, información legal y recuperación.
- Entradas: URL, formulario y consentimiento.
- Salidas: Pantallas públicas.
- Dependencias: Auth y textos bilingües.
- Estado actual: Operativas.
- Siguiente acción: Revisar textos legales por jurisdicción.

### Página 404

- Archivo o ámbito: src/pages/NotFoundPage.jsx.
- Responsabilidad: Informar rutas inexistentes.
- Entradas: URL inválida.
- Salidas: Navegación de recuperación.
- Dependencias: React Router.
- Estado actual: Operativa.
- Siguiente acción: Registrar rutas rotas sin filtrar información.

### Modales de dominio

- Archivo o ámbito: src/modals/.
- Responsabilidad: Editar entidades sin abandonar la página.
- Entradas: Entidad, formulario y permisos.
- Salidas: Cambios confirmados o errores.
- Dependencias: API cliente y componentes.
- Estado actual: Amplia cobertura.
- Siguiente acción: Unificar validación y foco accesible.

### Assets y estilos

- Archivo o ámbito: src/assets, src/style.css, src/dashboard.css y src/sidebar.css.
- Responsabilidad: Identidad visual, iconos y layout.
- Entradas: Tokens y recursos.
- Salidas: Estilos renderizados.
- Dependencias: CSS, fuentes e iconos.
- Estado actual: Operativo.
- Siguiente acción: Auditar peso de assets y contraste.

## Backend, rutas HTTP y servicios

El backend aplica autenticación, aislamiento de organización, validación, persistencia, integración y orquestación. La ruta debe ser fina y el servicio debe encapsular la regla de negocio.

### Access control

- Archivo o ámbito: backend/src/routes/accessControl.ts.
- Responsabilidad: Gestionar solicitudes y decisiones de acceso.
- Entradas: Usuario, organización y tipo de solicitud.
- Salidas: Estado de acceso y auditoría.
- Dependencias: Auth, Prisma y permisos.
- Estado actual: Implementado.
- Siguiente acción: Probar escalado y doble aprobación.

### Accounts

- Archivo o ámbito: backend/src/routes/accounts.ts.
- Responsabilidad: Administrar cuentas y contactos de organización.
- Entradas: Account payload y filtros.
- Salidas: Cuentas y relaciones.
- Dependencias: Prisma y workspace access.
- Estado actual: Implementado.
- Siguiente acción: Añadir validación de campos sensibles.

### Action center

- Archivo o ámbito: backend/src/routes/actionCenter.ts.
- Responsabilidad: Exponer acciones recomendadas y pendientes.
- Entradas: Estado, prioridad y filtros.
- Salidas: Action items y acciones.
- Dependencias: ActionCenter service.
- Estado actual: Implementado.
- Siguiente acción: Conectar con llamadas y automatizaciones.

### Ad playbooks

- Archivo o ámbito: backend/src/routes/adPlaybooks.ts.
- Responsabilidad: Administrar guías para publicidad.
- Entradas: Playbook payload.
- Salidas: Playbooks y versiones.
- Dependencias: AdPlaybook service.
- Estado actual: Implementado.
- Siguiente acción: Añadir validación de canal.

### Ads

- Archivo o ámbito: backend/src/routes/ads.ts.
- Responsabilidad: Consultar y gestionar anuncios.
- Entradas: Cuenta Meta, campaña y filtros.
- Salidas: Insights, campañas y acciones.
- Dependencias: Meta services.
- Estado actual: Implementado.
- Siguiente acción: Proteger mutaciones con aprobación.

### Agents

- Archivo o ámbito: backend/src/routes/agents.ts.
- Responsabilidad: Crear, editar y listar agentes de voz.
- Entradas: Agent payload y organización.
- Salidas: Agent config persistida.
- Dependencias: Agents service, Prisma y Zod.
- Estado actual: Corregido para validación estricta y aislamiento.
- Siguiente acción: Añadir versionado de prompt y voz.

### Auth

- Archivo o ámbito: backend/src/routes/auth.ts.
- Responsabilidad: Login, refresh, logout y sesión.
- Entradas: Credenciales, cookies y headers.
- Salidas: Token, sesión o error.
- Dependencias: Auth service, Prisma y seguridad.
- Estado actual: Implementado.
- Siguiente acción: Añadir rate limit y pruebas de abuso.

### Automations

- Archivo o ámbito: backend/src/routes/automations.ts.
- Responsabilidad: Gestionar automatizaciones y ejecuciones.
- Entradas: Trigger, steps y estado.
- Salidas: Automation y runs.
- Dependencias: Automation service y workers.
- Estado actual: Implementado.
- Siguiente acción: Validar idempotencia de cada paso.

### Calls

- Archivo o ámbito: backend/src/routes/calls.ts.
- Responsabilidad: Consultar llamadas, resultados y acciones.
- Entradas: Call ID, filtros y organización.
- Salidas: Call, eventos, tareas y evaluación.
- Dependencias: Calls service y Prisma.
- Estado actual: Implementado.
- Siguiente acción: Añadir control de acceso por agente.

### Campaigns

- Archivo o ámbito: backend/src/routes/campaigns.ts.
- Responsabilidad: Gestionar campañas comerciales.
- Entradas: Campaign payload y audiencia.
- Salidas: Campaña y estado.
- Dependencias: Campaigns service y workers.
- Estado actual: Implementado.
- Siguiente acción: Aplicar límites de horario y consentimiento.

### Campaign share

- Archivo o ámbito: backend/src/routes/campaignShare.ts.
- Responsabilidad: Compartir campaña con permisos limitados.
- Entradas: Campaign ID y destinatario.
- Salidas: Enlace o permiso temporal.
- Dependencias: Campaigns, auth y access control.
- Estado actual: Implementado.
- Siguiente acción: Revisar expiración y revocación.

### Conversations

- Archivo o ámbito: backend/src/routes/conversations.ts.
- Responsabilidad: Gestionar conversaciones multicanal.
- Entradas: Contact, messages y canal.
- Salidas: Conversation y mensajes.
- Dependencias: Conversations service y Prisma.
- Estado actual: Implementado.
- Siguiente acción: Unificar eventos de voz con mensajes.

### Dashboard

- Archivo o ámbito: backend/src/routes/dashboard.ts.
- Responsabilidad: Exponer KPIs agregados.
- Entradas: Rango temporal y organización.
- Salidas: KPIs y series.
- Dependencias: Dashboard service y agregaciones.
- Estado actual: Implementado.
- Siguiente acción: Validar consultas con grandes volúmenes.

### Email metrics

- Archivo o ámbito: backend/src/routes/emailMetrics.ts.
- Responsabilidad: Consultar entregas y eventos de email.
- Entradas: Campaña y rango.
- Salidas: Métricas agregadas.
- Dependencias: EmailMetrics service.
- Estado actual: Implementado.
- Siguiente acción: Distinguir eventos simulados de proveedor real.

### Funnels

- Archivo o ámbito: backend/src/routes/funnels.ts.
- Responsabilidad: Gestionar embudos y conversiones.
- Entradas: Funnel stages y métricas.
- Salidas: Embudo y rendimiento.
- Dependencias: Funnels service.
- Estado actual: Implementado.
- Siguiente acción: Añadir atribución de llamadas.

### Growth programs

- Archivo o ámbito: backend/src/routes/growthPrograms.ts.
- Responsabilidad: Administrar programas de crecimiento.
- Entradas: Programa, estado y objetivos.
- Salidas: GrowthProgram y acciones.
- Dependencias: Growth service.
- Estado actual: Implementado.
- Siguiente acción: Añadir gobernanza de cambios.

### Integration credentials

- Archivo o ámbito: backend/src/routes/integrationCredentials.ts.
- Responsabilidad: Crear y rotar credenciales externas.
- Entradas: Proveedor, secreto y organización.
- Salidas: Metadatos cifrados o estado.
- Dependencias: OrganizationCredentials service.
- Estado actual: Implementado.
- Siguiente acción: Verificar cifrado real y rotación.

### Integration health

- Archivo o ámbito: backend/src/routes/integrationHealth.ts.
- Responsabilidad: Informar salud y preparación de integraciones.
- Entradas: Proveedor y configuración.
- Salidas: Estado de conexión.
- Dependencias: IntegrationHealth service.
- Estado actual: Ruta de ready separada de health.
- Siguiente acción: Normalizar semántica de liveness y readiness.

### Knowledge

- Archivo o ámbito: backend/src/routes/knowledge.ts.
- Responsabilidad: Gestionar base de conocimiento del agente.
- Entradas: Documentos, favoritos y búsqueda.
- Salidas: KnowledgeBase y resultados.
- Dependencias: Knowledge service.
- Estado actual: Implementado.
- Siguiente acción: Añadir indexado asíncrono y control de PII.

### Landing

- Archivo o ámbito: backend/src/routes/landing.ts.
- Responsabilidad: Servir o gestionar contenidos públicos.
- Entradas: Slug y contenido.
- Salidas: Landing data.
- Dependencias: Landing service.
- Estado actual: Implementado.
- Siguiente acción: Separar contenido público de datos privados.

### Leads

- Archivo o ámbito: backend/src/routes/leads.ts.
- Responsabilidad: Crear, actualizar y calificar leads.
- Entradas: Lead payload, filtros y eventos.
- Salidas: Lead, auditoría y acciones.
- Dependencias: Lead ingestion, Prisma y webhooks.
- Estado actual: Implementado.
- Siguiente acción: Añadir deduplicación determinista.

### Marketing campaigns

- Archivo o ámbito: backend/src/routes/marketingCampaigns.ts.
- Responsabilidad: Gestionar campañas de marketing.
- Entradas: Audience, template y schedule.
- Salidas: Campaign y EmailDelivery.
- Dependencias: Marketing service y workers.
- Estado actual: Implementado.
- Siguiente acción: Validar opt-out antes de enviar.

### Mautic

- Archivo o ámbito: backend/src/routes/mautic.ts.
- Responsabilidad: Sincronizar contactos y activos con Mautic.
- Entradas: Credenciales y payload.
- Salidas: Bindings, contactos y eventos.
- Dependencias: MauticSync service.
- Estado actual: Implementado según credenciales.
- Siguiente acción: Agregar retry con backoff.

### Mautic webhooks

- Archivo o ámbito: backend/src/routes/mauticWebhooks.ts.
- Responsabilidad: Recibir eventos de Mautic.
- Entradas: Webhook firmado.
- Salidas: Lead event y WebhookEvent.
- Dependencias: Lead ingestion y firma.
- Estado actual: Implementado.
- Siguiente acción: Aplicar replay protection.

### Meetings

- Archivo o ámbito: backend/src/routes/meetings.ts.
- Responsabilidad: Gestionar reuniones y disponibilidad.
- Entradas: Meeting payload.
- Salidas: Meeting y tareas.
- Dependencias: Meetings service.
- Estado actual: Implementado.
- Siguiente acción: Conectar confirmación por voz.

### Meta accounts

- Archivo o ámbito: backend/src/routes/metaAccounts.ts.
- Responsabilidad: Administrar cuentas Meta.
- Entradas: OAuth state y cuenta.
- Salidas: MetaAdAccount.
- Dependencias: Meta integration y OAuth.
- Estado actual: Implementado.
- Siguiente acción: Revisar permisos mínimos.

### Meta webhooks

- Archivo o ámbito: backend/src/routes/metaWebhooks.ts.
- Responsabilidad: Recibir leads y eventos Meta.
- Entradas: Payload firmado.
- Salidas: Lead, AcquisitionEvent y WebhookEvent.
- Dependencias: MetaLeadWebhook service.
- Estado actual: Implementado.
- Siguiente acción: Probar eventos duplicados.

### Metricool

- Archivo o ámbito: backend/src/routes/metricool.ts.
- Responsabilidad: Sincronizar métricas sociales.
- Entradas: Cuenta y rango.
- Salidas: Snapshots y métricas.
- Dependencias: MetricoolSync service.
- Estado actual: Implementado.
- Siguiente acción: Controlar ventanas y cuotas.

### Observability

- Archivo o ámbito: backend/src/routes/observability.ts.
- Responsabilidad: Exponer métricas y trazas operativas.
- Entradas: Auth operativa y filtros.
- Salidas: Health, readiness y métricas.
- Dependencias: VoiceTrace, logger y servicios.
- Estado actual: Implementado.
- Siguiente acción: Proteger endpoints y añadir alertas.

### Orchestration

- Archivo o ámbito: backend/src/routes/orchestration.ts.
- Responsabilidad: Gestionar memoria, políticas y decisiones.
- Entradas: Propuesta, política y contexto.
- Salidas: OperationalMemoryProposal y decisiones.
- Dependencias: Orchestration runtime.
- Estado actual: Implementado.
- Siguiente acción: Formalizar aprobación humana.

### Organic

- Archivo o ámbito: backend/src/routes/organic.ts.
- Responsabilidad: Gestionar SEO y contenido orgánico.
- Entradas: Proyecto, activo y acción.
- Salidas: OrganicProject y OrganicAsset.
- Dependencias: Organic services.
- Estado actual: Implementado.
- Siguiente acción: Añadir proveedor de búsqueda real.

### Pipeline

- Archivo o ámbito: backend/src/routes/pipeline.ts.
- Responsabilidad: Gestionar etapas y oportunidades.
- Entradas: Opportunity, stage y filtros.
- Salidas: Pipeline y StageHistory.
- Dependencias: Pipeline service.
- Estado actual: Implementado.
- Siguiente acción: Auditar transiciones no autorizadas.

### Playbooks

- Archivo o ámbito: backend/src/routes/playbooks.ts.
- Responsabilidad: Gestionar playbooks comerciales.
- Entradas: Playbook y versión.
- Salidas: Playbook data.
- Dependencias: Playbooks service.
- Estado actual: Implementado.
- Siguiente acción: Asociar playbook a tipo de agente.

### Prospects

- Archivo o ámbito: backend/src/routes/prospects.ts.
- Responsabilidad: Buscar y administrar prospectos.
- Entradas: Filtros y fuentes.
- Salidas: Prospect records.
- Dependencias: Prospecting service.
- Estado actual: Implementado.
- Siguiente acción: Documentar fuentes y límites legales.

### Revenue intelligence

- Archivo o ámbito: backend/src/routes/revenueIntelligence.ts.
- Responsabilidad: Exponer experimentos y señales comerciales.
- Entradas: Experiment, variant y metrics.
- Salidas: RevenueExperiment y asignaciones.
- Dependencias: Revenue service.
- Estado actual: Implementado.
- Siguiente acción: Definir cálculo de significancia.

### Settings

- Archivo o ámbito: backend/src/routes/settings.ts.
- Responsabilidad: Gestionar preferencias y configuración.
- Entradas: Preference payload.
- Salidas: UserPreference y settings.
- Dependencias: Settings service.
- Estado actual: Implementado.
- Siguiente acción: Distinguir preferencias de secretos.

### Tasks

- Archivo o ámbito: backend/src/routes/tasks.ts.
- Responsabilidad: Gestionar tareas humanas y automáticas.
- Entradas: Task payload y filtros.
- Salidas: Task y ActionItem.
- Dependencias: Tasks service.
- Estado actual: Implementado.
- Siguiente acción: Añadir permisos por asignación.

### Voice

- Archivo o ámbito: backend/src/routes/voice.ts.
- Responsabilidad: Crear y supervisar sesiones de voz.
- Entradas: Agent, call y stream token.
- Salidas: Voice session y eventos.
- Dependencias: Voice coordinator y Twilio.
- Estado actual: Implementado.
- Siguiente acción: Añadir endpoint de diagnóstico no invasivo.

### WhatsApp

- Archivo o ámbito: backend/src/routes/whatsapp.ts.
- Responsabilidad: Gestionar conversaciones de WhatsApp.
- Entradas: Webhook y mensajes.
- Salidas: Conversation, Message y DeliveryAttempt.
- Dependencias: WhatsApp service.
- Estado actual: Implementado.
- Siguiente acción: Unificar consentimiento con voz.

### Middleware de auth

- Archivo o ámbito: backend/src/middlewares/authenticate.ts (con authorize.ts y authenticateVoiceService.ts).
- Responsabilidad: Validar sesión y establecer principal.
- Entradas: Token, cookie o header.
- Salidas: Principal con userId y orgId.
- Dependencias: AuthSession y JWT.
- Estado actual: Implementado.
- Siguiente acción: Añadir rotación y detección de anomalías.

### Parseo de requests

- Archivo o ámbito: esquemas Zod en backend/src/controllers/*.controller.ts (no existe un middleware parseRequest dedicado).
- Responsabilidad: Validar y normalizar entrada HTTP.
- Entradas: Schema y body.
- Salidas: Payload tipado o error 400.
- Dependencias: Zod.
- Estado actual: Usado en puntos críticos.
- Siguiente acción: Extender a todos los endpoints de mutación.

### Manejo de errores

- Archivo o ámbito: hook onError en backend/src/index.ts con safeOperationalError (no existe un errorHandler.ts dedicado).
- Responsabilidad: Convertir errores en respuestas seguras.
- Entradas: Exception y request context.
- Salidas: Status, código y mensaje.
- Dependencias: Logger y Fastify.
- Estado actual: Implementado.
- Siguiente acción: Eliminar filtración de stack en producción.

### Health canónico

- Archivo o ámbito: backend/src/voice/observability o health route.
- Responsabilidad: Comprobar vida del proceso y dependencias.
- Entradas: Request de health.
- Salidas: Liveness, readiness y detalle controlado.
- Dependencias: Database y servicios.
- Estado actual: La ruta canónica es /health/ready.
- Siguiente acción: Documentar contrato para el balanceador.

## Servicios de negocio

Los servicios contienen reglas que no deberían repetirse en las rutas. La frontera entre servicio y worker define qué puede responder inmediatamente y qué debe ejecutarse en segundo plano.

### Access control service

- Archivo o ámbito: backend/src/services/accessControl.service.ts.
- Responsabilidad: Aplicar políticas de acceso y solicitudes.
- Entradas: Principal, target y acción.
- Salidas: Permitido, denegado o solicitud.
- Dependencias: Prisma y policy.
- Estado actual: Implementado.
- Siguiente acción: Añadir matriz de permisos versionada.

### Accounts service

- Archivo o ámbito: backend/src/services/accounts.service.ts.
- Responsabilidad: Gestionar cuentas y contactos comerciales.
- Entradas: Account payload.
- Salidas: Cuenta y relaciones.
- Dependencias: Prisma.
- Estado actual: Implementado.
- Siguiente acción: Añadir merge seguro de duplicados.

### Action center service

- Archivo o ámbito: backend/src/services/actionCenter.service.ts.
- Responsabilidad: Crear, priorizar y cerrar acciones.
- Entradas: Señal de negocio y prioridad.
- Salidas: ActionItem e historial.
- Dependencias: Prisma y tareas.
- Estado actual: Implementado.
- Siguiente acción: Conectar resultado de llamada.

### Ad optimizer

- Archivo o ámbito: backend/src/services/adOptimizer.service.ts.
- Responsabilidad: Proponer cambios en anuncios.
- Entradas: Insights, reglas y presupuesto.
- Salidas: Recomendación gobernada.
- Dependencias: Meta services y policies.
- Estado actual: Implementado.
- Siguiente acción: Requerir aprobación para mutaciones.

### Ad playbook service

- Archivo o ámbito: backend/src/services/adPlaybook.service.ts.
- Responsabilidad: Aplicar guías publicitarias.
- Entradas: Playbook y contexto.
- Salidas: Plan de acciones.
- Dependencias: Prisma.
- Estado actual: Implementado.
- Siguiente acción: Añadir validación de compatibilidad.

### Ads overview

- Archivo o ámbito: backend/src/services/adsOverview.service.ts.
- Responsabilidad: Agregar rendimiento de anuncios.
- Entradas: Snapshots y rango.
- Salidas: Resumen de métricas.
- Dependencias: MetaAdAccount y Prisma.
- Estado actual: Implementado.
- Siguiente acción: Añadir frescura de datos.

### Ads strategy

- Archivo o ámbito: backend/src/services/adsStrategy.service.ts.
- Responsabilidad: Generar estrategia de publicidad.
- Entradas: Objetivo, audiencia y presupuesto.
- Salidas: Plan estratégico.
- Dependencias: LLM opcional y reglas.
- Estado actual: Implementado.
- Siguiente acción: Registrar versión de salida.

### Ads wizard

- Archivo o ámbito: backend/src/services/adsWizard.service.ts.
- Responsabilidad: Guiar la creación de campañas.
- Entradas: Pasos del asistente.
- Salidas: Draft y validación.
- Dependencias: MetaCampaignBuilder.
- Estado actual: Implementado.
- Siguiente acción: Persistir paso actual e idempotencia.

### Agent service

- Archivo o ámbito: backend/src/services/agents.service.ts.
- Responsabilidad: Crear y actualizar agentes de voz.
- Entradas: Payload validado y orgId.
- Salidas: Agent persistido.
- Dependencias: Prisma y Zod.
- Estado actual: Corregido para no aceptar orgId del cliente.
- Siguiente acción: Añadir tests de escalación multiempresa.

### Asset generator

- Archivo o ámbito: backend/src/services/assetGenerator.service.ts.
- Responsabilidad: Preparar assets de marketing.
- Entradas: Brief y proveedor.
- Salidas: Asset metadata.
- Dependencias: Storage y proveedores.
- Estado actual: Implementado.
- Siguiente acción: Separar generación de publicación.

### Auth service

- Archivo o ámbito: backend/src/services/auth.service.ts.
- Responsabilidad: Resolver credenciales y sesiones.
- Entradas: Email, password, refresh.
- Salidas: AuthSession y tokens.
- Dependencias: Prisma, bcrypt y JWT.
- Estado actual: Implementado.
- Siguiente acción: Añadir bloqueo progresivo.

### Automation service

- Archivo o ámbito: backend/src/services/automations.service.ts.
- Responsabilidad: Crear versiones y ejecutar acciones.
- Entradas: Automation definition y event.
- Salidas: Run, steps y outbox.
- Dependencias: Prisma y workers.
- Estado actual: Implementado.
- Siguiente acción: Añadir límite por organización.

### Calls service

- Archivo o ámbito: backend/src/services/calls.service.ts.
- Responsabilidad: Consultar y cerrar llamadas.
- Entradas: Call context y events.
- Salidas: Call result, tasks y notes.
- Dependencias: Prisma y voice trace.
- Estado actual: Implementado.
- Siguiente acción: Normalizar estados terminales.

### Conversation AI

- Archivo o ámbito: backend/src/services/conversationAi.service.ts.
- Responsabilidad: Resolver asistencia conversacional.
- Entradas: Conversation, messages y context.
- Salidas: Respuesta estructurada.
- Dependencias: LLM configurado y knowledge.
- Estado actual: Implementado.
- Siguiente acción: Añadir guardas de herramienta.

### Conversations service

- Archivo o ámbito: backend/src/services/conversations.service.ts.
- Responsabilidad: Persistir conversación y mensajes.
- Entradas: Channel event.
- Salidas: Conversation y Message.
- Dependencias: Prisma y delivery.
- Estado actual: Implementado.
- Siguiente acción: Compartir modelo entre voz y texto.

### Dashboard service

- Archivo o ámbito: backend/src/services/dashboard.service.ts.
- Responsabilidad: Calcular indicadores de negocio.
- Entradas: Organización y rango.
- Salidas: KPIs y series.
- Dependencias: Prisma agregations.
- Estado actual: Implementado.
- Siguiente acción: Añadir índices de consulta.

### Digital audit

- Archivo o ámbito: backend/src/services/digitalAudit.service.ts.
- Responsabilidad: Evaluar presencia y activos digitales.
- Entradas: Dominio y señales.
- Salidas: Audit report.
- Dependencias: Providers y rules.
- Estado actual: Implementado.
- Siguiente acción: Guardar evidencia y fecha.

### Email metrics

- Archivo o ámbito: backend/src/services/emailMetrics.service.ts.
- Responsabilidad: Calcular entregabilidad y engagement.
- Entradas: EmailEvent y Delivery.
- Salidas: Metrics.
- Dependencias: Prisma.
- Estado actual: Implementado.
- Siguiente acción: Normalizar eventos de proveedores.

### Funnels service

- Archivo o ámbito: backend/src/services/funnels.service.ts.
- Responsabilidad: Calcular paso a paso del funnel.
- Entradas: Lead events y stages.
- Salidas: Conversion rates.
- Dependencias: Prisma.
- Estado actual: Implementado.
- Siguiente acción: Añadir atribución multicanal.

### Growth programs service

- Archivo o ámbito: backend/src/services/growthPrograms.service.ts.
- Responsabilidad: Gestionar iniciativas de crecimiento.
- Entradas: Program definition.
- Salidas: GrowthProgram.
- Dependencias: Prisma y tasks.
- Estado actual: Implementado.
- Siguiente acción: Conectar experimento y resultado.

### Integration health service

- Archivo o ámbito: backend/src/services/integrationHealth.service.ts.
- Responsabilidad: Comprobar credenciales y conectividad.
- Entradas: Provider config.
- Salidas: Health status.
- Dependencias: Provider clients.
- Estado actual: Implementado.
- Siguiente acción: Aplicar timeouts independientes.

### Knowledge service

- Archivo o ámbito: backend/src/services/knowledge.service.ts.
- Responsabilidad: Indexar y consultar conocimiento.
- Entradas: Document, query y agent.
- Salidas: Chunks y citations.
- Dependencias: Storage, embeddings y LLM.
- Estado actual: Implementado conceptualmente.
- Siguiente acción: Definir índice local y eliminación de PII.

### Lead ingestion

- Archivo o ámbito: backend/src/services/leadIngestion.service.ts.
- Responsabilidad: Transformar eventos en leads.
- Entradas: Webhook, form o llamada.
- Salidas: Lead y AcquisitionEvent.
- Dependencias: Prisma, dedupe y consent.
- Estado actual: Implementado.
- Siguiente acción: Añadir contrato por proveedor.

### Leads service

- Archivo o ámbito: backend/src/services/leads.service.ts.
- Responsabilidad: Gestionar ciclo de vida del lead.
- Entradas: Lead payload y transitions.
- Salidas: Lead, audit y next action.
- Dependencias: Prisma.
- Estado actual: Implementado.
- Siguiente acción: Validar transición por rol.

### Marketing campaigns service

- Archivo o ámbito: backend/src/services/marketingCampaigns.service.ts.
- Responsabilidad: Preparar campañas de email.
- Entradas: Audience, template y schedule.
- Salidas: Deliveries y runs.
- Dependencias: Workers y opt-out.
- Estado actual: Implementado.
- Siguiente acción: Añadir preflight de destinatarios.

### Mautic sync

- Archivo o ámbito: backend/src/services/mauticSync.service.ts.
- Responsabilidad: Sincronizar Mautic con idempotencia.
- Entradas: Contact, asset y credentials.
- Salidas: Binding y event.
- Dependencias: Mautic API y WebhookEvent.
- Estado actual: Implementado.
- Siguiente acción: Añadir backoff y dead letter.

### Meetings service

- Archivo o ámbito: backend/src/services/meetings.service.ts.
- Responsabilidad: Crear y confirmar reuniones.
- Entradas: Availability y participant.
- Salidas: Meeting y task.
- Dependencias: Calendar provider opcional.
- Estado actual: Implementado.
- Siguiente acción: Conectar con agente outbound.

### Meta ad account

- Archivo o ámbito: backend/src/services/metaAdAccount.service.ts.
- Responsabilidad: Resolver cuenta y tokens Meta.
- Entradas: OAuth state y org.
- Salidas: MetaAdAccount.
- Dependencias: Meta OAuth.
- Estado actual: Implementado.
- Siguiente acción: Rotar token sin interrumpir sync.

### Meta campaign builder

- Archivo o ámbito: backend/src/services/metaCampaignBuilder.service.ts.
- Responsabilidad: Construir payload Meta.
- Entradas: Campaign draft.
- Salidas: API payload.
- Dependencias: Meta API y validation.
- Estado actual: Implementado.
- Siguiente acción: Cubrir campos por objetivo.

### Meta conversions

- Archivo o ámbito: backend/src/services/metaConversions.service.ts.
- Responsabilidad: Enviar conversiones offline.
- Entradas: Lead outcome y event.
- Salidas: Conversion event.
- Dependencias: Meta API.
- Estado actual: Implementado.
- Siguiente acción: Evitar duplicados por event id.

### Meta insights

- Archivo o ámbito: backend/src/services/metaInsights.service.ts.
- Responsabilidad: Importar insights.
- Entradas: Account, range y cursor.
- Salidas: AdInsightSnapshot.
- Dependencias: Meta API y Prisma.
- Estado actual: Implementado.
- Siguiente acción: Controlar paginación y rate limit.

### Meta lead webhook

- Archivo o ámbito: backend/src/services/metaLeadWebhook.service.ts.
- Responsabilidad: Procesar leads de Meta.
- Entradas: Signed webhook payload.
- Salidas: Lead y acquisition event.
- Dependencias: Signature verification.
- Estado actual: Implementado.
- Siguiente acción: Guardar raw payload minimizado.

### Metricool sync

- Archivo o ámbito: backend/src/services/metricoolSync.service.ts.
- Responsabilidad: Sincronizar métricas de redes.
- Entradas: Provider credentials y range.
- Salidas: Organic metrics.
- Dependencias: Metricool API.
- Estado actual: Implementado.
- Siguiente acción: Registrar cuotas y errores.

### Orchestration runtime

- Archivo o ámbito: backend/src/services/orchestration.runtime.ts.
- Responsabilidad: Evaluar eventos, memoria y políticas.
- Entradas: Event, proposal y policy.
- Salidas: Decision o approval request.
- Dependencias: Governance models.
- Estado actual: Implementado con gobernanza inicial.
- Siguiente acción: Separar evaluación pura de efectos.

### Organic service

- Archivo o ámbito: backend/src/services/organic.service.ts.
- Responsabilidad: Gestionar proyectos y activos SEO.
- Entradas: Organic project and asset.
- Salidas: OrganicAction.
- Dependencias: Prisma y provider clients.
- Estado actual: Implementado.
- Siguiente acción: Añadir workflow de revisión humana.

### Pipeline service

- Archivo o ámbito: backend/src/services/pipeline.service.ts.
- Responsabilidad: Gestionar oportunidades y etapas.
- Entradas: Opportunity transition.
- Salidas: OpportunityStageHistory.
- Dependencias: Prisma y access control.
- Estado actual: Implementado.
- Siguiente acción: Bloquear saltos inválidos.

### Playbooks service

- Archivo o ámbito: backend/src/services/playbooks.service.ts.
- Responsabilidad: Administrar guías comerciales.
- Entradas: Playbook definition.
- Salidas: Versioned playbook.
- Dependencias: Prisma.
- Estado actual: Implementado.
- Siguiente acción: Añadir pruebas de compatibilidad con agente.

### Prospecting service

- Archivo o ámbito: backend/src/services/prospecting.service.ts.
- Responsabilidad: Administrar descubrimiento de prospectos.
- Entradas: Source query.
- Salidas: Prospect record.
- Dependencias: Provider y compliance.
- Estado actual: Implementado.
- Siguiente acción: Documentar base legal.

### Revenue intelligence

- Archivo o ámbito: backend/src/services/revenueIntelligence.service.ts.
- Responsabilidad: Analizar experimentos y señales.
- Entradas: Variants, assignments y outcomes.
- Salidas: Revenue metrics.
- Dependencias: Prisma.
- Estado actual: Implementado.
- Siguiente acción: Definir ventana estadística.

### Sales sequence

- Archivo o ámbito: backend/src/services/salesSequence.service.ts.
- Responsabilidad: Inscribir leads en secuencias.
- Entradas: Lead, sequence y consent.
- Salidas: Enrollment y steps.
- Dependencias: Prisma y workers.
- Estado actual: Implementado.
- Siguiente acción: Integrar llamadas con reglas de horario.

### Settings service

- Archivo o ámbito: backend/src/services/settings.service.ts.
- Responsabilidad: Guardar preferencias operativas.
- Entradas: UserPreference payload.
- Salidas: Preference.
- Dependencias: Prisma.
- Estado actual: Implementado.
- Siguiente acción: No mezclar con credenciales.

### Social types

- Archivo o ámbito: backend/src/services/socialTypes.ts.
- Responsabilidad: Normalizar tipos de contenido.
- Entradas: Provider asset.
- Salidas: Canonical type.
- Dependencias: Metricool y organic.
- Estado actual: Implementado.
- Siguiente acción: Cubrir formatos multimedia.

### Tasks service

- Archivo o ámbito: backend/src/services/tasks.service.ts.
- Responsabilidad: Crear y actualizar tareas.
- Entradas: Task payload y source.
- Salidas: Task, history y reminders.
- Dependencias: Prisma.
- Estado actual: Implementado.
- Siguiente acción: Añadir idempotency key.

### Twilio integration

- Archivo o ámbito: backend/src/services/twilioIntegration.service.ts.
- Responsabilidad: Crear llamadas y validar webhooks.
- Entradas: Phone number, URL y call metadata.
- Salidas: Call SID y events.
- Dependencias: Twilio API y signature.
- Estado actual: Implementado.
- Siguiente acción: Probar timeouts y fallback.

### WhatsApp service

- Archivo o ámbito: backend/src/services/whatsapp.service.ts.
- Responsabilidad: Enviar, recibir y reconciliar mensajes.
- Entradas: Webhook y message payload.
- Salidas: Message y DeliveryAttempt.
- Dependencias: Provider API y consent.
- Estado actual: Implementado.
- Siguiente acción: Compartir política de opt-out.

### Workspace access

- Archivo o ámbito: backend/src/services/workspaceAccess.service.ts.
- Responsabilidad: Resolver organización y roles.
- Entradas: Principal y workspace.
- Salidas: Authorization decision.
- Dependencias: Prisma.
- Estado actual: Implementado.
- Siguiente acción: Auditar todas las rutas.

## Persistencia y modelo de datos

Prisma es la fuente de verdad del esquema. Las entidades se relacionan por organización, usuario, lead, conversación, campaña y llamada. En producción, el historial de migraciones debe estar versionado, revisado y aplicado de forma determinista.

### Organization

- Archivo o ámbito: Organization.
- Responsabilidad: Representar tenant y límites de aislamiento.
- Entradas: Nombre, slug, configuración y usuarios.
- Salidas: Contexto de organización.
- Dependencias: User, Agent, Campaign y todas las entidades de negocio.
- Estado actual: Modelo central y operativo.
- Siguiente acción: Añadir cuotas explícitas de voz y almacenamiento.

### User

- Archivo o ámbito: User.
- Responsabilidad: Representar operador, administrador o usuario externo.
- Entradas: Identidad, rol y orgId.
- Salidas: Principal de aplicación.
- Dependencias: Organization, AuthSession y preferencias.
- Estado actual: Operativo.
- Siguiente acción: Revisar roles finos y baja de usuario.

### AuthSession

- Archivo o ámbito: AuthSession.
- Responsabilidad: Persistir sesiones renovables.
- Entradas: User, token hash y expiración.
- Salidas: Sesión revocable.
- Dependencias: User y Auth service.
- Estado actual: Operativo.
- Siguiente acción: Añadir device metadata minimizada.

### MetaOAuthState

- Archivo o ámbito: MetaOAuthState.
- Responsabilidad: Evitar CSRF durante OAuth Meta.
- Entradas: Organization, state y expiry.
- Salidas: Estado temporal de OAuth.
- Dependencias: Meta routes y credentials.
- Estado actual: Operativo.
- Siguiente acción: Limpiar estados expirados.

### OrganizationIntegrationCredential

- Archivo o ámbito: OrganizationIntegrationCredential.
- Responsabilidad: Guardar referencias de credenciales por organización.
- Entradas: Provider, encrypted secret y metadata.
- Salidas: Credencial gestionable.
- Dependencias: OrganizationCredentials y health.
- Estado actual: Operativo con revisión pendiente de cifrado.
- Siguiente acción: Verificar KMS o secret manager.

### UserPreference

- Archivo o ámbito: UserPreference.
- Responsabilidad: Persistir idioma y preferencias del usuario.
- Entradas: User, key y value.
- Salidas: Preferencia.
- Dependencias: Settings service.
- Estado actual: Operativo.
- Siguiente acción: Validar catálogo de claves.

### Agent

- Archivo o ámbito: Agent.
- Responsabilidad: Definir persona operativa y de voz.
- Entradas: Nombre, type, direction, language, voice y prompt.
- Salidas: Configuración seleccionable por llamada.
- Dependencias: Organization, Call y Playbook.
- Estado actual: Validación estricta aplicada.
- Siguiente acción: Versionar configuración para reproducibilidad.

### Campaign

- Archivo o ámbito: Campaign.
- Responsabilidad: Representar campaña comercial.
- Entradas: Organization, status, audience y schedule.
- Salidas: Campaña ejecutable.
- Dependencias: Lead, Automation y workers.
- Estado actual: Operativo.
- Siguiente acción: Añadir política de consentimiento al modelo.

### Lead

- Archivo o ámbito: Lead.
- Responsabilidad: Representar contacto potencial o cliente.
- Entradas: Identity, status, source y orgId.
- Salidas: Lead enriquecible y auditable.
- Dependencias: Calls, Conversation, Opportunity y AcquisitionEvent.
- Estado actual: Operativo.
- Siguiente acción: Encriptar o minimizar campos sensibles.

### AcquisitionEvent

- Archivo o ámbito: AcquisitionEvent.
- Responsabilidad: Registrar origen de captación.
- Entradas: Lead, provider, campaign y raw metadata.
- Salidas: Atribución de adquisición.
- Dependencias: Meta, Mautic, forms y calls.
- Estado actual: Operativo.
- Siguiente acción: Limitar raw payload.

### Call

- Archivo o ámbito: Call.
- Responsabilidad: Registrar una llamada de negocio.
- Entradas: Agent, lead, provider, direction y status.
- Salidas: Resultado, duración y referencias.
- Dependencias: VoiceCallEvent, metrics, evaluation y tasks.
- Estado actual: Operativo.
- Siguiente acción: Añadir versión de runtime.

### VoiceCallEvent

- Archivo o ámbito: VoiceCallEvent.
- Responsabilidad: Registrar eventos temporales de la llamada.
- Entradas: Call, timestamp, type y payload.
- Salidas: Timeline técnica.
- Dependencias: VoiceTrace y observability.
- Estado actual: Operativo.
- Siguiente acción: Definir retención y redacción.

### VoiceCallMetric

- Archivo o ámbito: VoiceCallMetric.
- Responsabilidad: Guardar métricas de audio y conversación.
- Entradas: Call, segment, metric y value.
- Salidas: Latencia, interrupción, silencio y calidad.
- Dependencias: Voice engine y evaluation.
- Estado actual: Operativo.
- Siguiente acción: Normalizar unidades y percentiles.

### VoiceCallEvaluation

- Archivo o ámbito: VoiceCallEvaluation.
- Responsabilidad: Guardar evaluación automática o humana.
- Entradas: Call, rubric, score y feedback.
- Salidas: Score de calidad.
- Dependencias: CallJudge y dashboards.
- Estado actual: Operativo.
- Siguiente acción: Versionar rubric y modelo evaluador.

### CallTask

- Archivo o ámbito: CallTask.
- Responsabilidad: Crear trabajo derivado de una llamada.
- Entradas: Call, assignee, due date y status.
- Salidas: Tarea accionable.
- Dependencias: Tasks service y ActionItem.
- Estado actual: Operativo.
- Siguiente acción: Unificar con Task si no hay diferencia útil.

### Meeting

- Archivo o ámbito: Meeting.
- Responsabilidad: Representar cita comercial.
- Entradas: Lead, opportunity, time y status.
- Salidas: Cita confirmable.
- Dependencias: Calls, tasks y calendar.
- Estado actual: Operativo.
- Siguiente acción: Guardar zona horaria explícita.

### Opportunity

- Archivo o ámbito: Opportunity.
- Responsabilidad: Representar negocio en pipeline.
- Entradas: Account, lead, stage y value.
- Salidas: Oportunidad comercial.
- Dependencias: StageHistory, activities y products.
- Estado actual: Operativo.
- Siguiente acción: Añadir fuente de conversión de llamada.

### OpportunityStageHistory

- Archivo o ámbito: OpportunityStageHistory.
- Responsabilidad: Auditar cambios de etapa.
- Entradas: Opportunity, from, to y actor.
- Salidas: Historial de pipeline.
- Dependencias: Pipeline service.
- Estado actual: Operativo.
- Siguiente acción: Impedir edición retroactiva.

### Playbook

- Archivo o ámbito: Playbook.
- Responsabilidad: Guardar guías comerciales.
- Entradas: Organization, version y content.
- Salidas: Instrucción aplicable.
- Dependencias: Agents y automation.
- Estado actual: Operativo.
- Siguiente acción: Separar prompt de reglas de cumplimiento.

### AdPlaybook

- Archivo o ámbito: AdPlaybook.
- Responsabilidad: Guardar reglas específicas de publicidad.
- Entradas: Organization, channel y rules.
- Salidas: Guía de optimización.
- Dependencias: Ads services.
- Estado actual: Operativo.
- Siguiente acción: Añadir versión activa.

### MetaAdAccount

- Archivo o ámbito: MetaAdAccount.
- Responsabilidad: Relacionar organización con cuenta Meta.
- Entradas: OAuth token reference y account id.
- Salidas: Cuenta sincronizable.
- Dependencias: Meta services.
- Estado actual: Operativo.
- Siguiente acción: Nunca exponer access token.

### AdWizardDraft

- Archivo o ámbito: AdWizardDraft.
- Responsabilidad: Persistir creación incompleta de campaña.
- Entradas: User, organization y step state.
- Salidas: Borrador reanudable.
- Dependencias: Ads wizard.
- Estado actual: Operativo.
- Siguiente acción: Añadir expiración.

### AdInsightSnapshot

- Archivo o ámbito: AdInsightSnapshot.
- Responsabilidad: Guardar métricas importadas de anuncios.
- Entradas: Account, ad id, date y metrics.
- Salidas: Serie histórica.
- Dependencias: Meta insights y dashboard.
- Estado actual: Operativo.
- Siguiente acción: Índices por cuenta y fecha.

### Automation

- Archivo o ámbito: Automation.
- Responsabilidad: Definir automatización activa.
- Entradas: Trigger, status y organization.
- Salidas: Automatización versionable.
- Dependencias: AutomationVersion y runs.
- Estado actual: Operativo.
- Siguiente acción: Validar ownership de cada step.

### AutomationVersion

- Archivo o ámbito: AutomationVersion.
- Responsabilidad: Congelar definición ejecutable.
- Entradas: Automation, version y steps.
- Salidas: Snapshot de ejecución.
- Dependencias: Automation runner.
- Estado actual: Operativo.
- Siguiente acción: Añadir hash de contenido.

### ChannelIdentity

- Archivo o ámbito: ChannelIdentity.
- Responsabilidad: Representar identidad de un canal.
- Entradas: Conversation, provider y address.
- Salidas: Canal resoluble.
- Dependencias: WhatsApp, email y voice.
- Estado actual: Operativo.
- Siguiente acción: Normalizar números en formato E.164.

### Conversation

- Archivo o ámbito: Conversation.
- Responsabilidad: Agrupar mensajes de una interacción.
- Entradas: Lead, channel, status y organization.
- Salidas: Hilo multicanal.
- Dependencias: Message, Call y delivery.
- Estado actual: Operativo.
- Siguiente acción: Relacionar una llamada con conversación canónica.

### MessageTemplate

- Archivo o ámbito: MessageTemplate.
- Responsabilidad: Guardar plantillas reutilizables.
- Entradas: Channel, locale y content.
- Salidas: Mensaje renderizable.
- Dependencias: Marketing y sequences.
- Estado actual: Operativo.
- Siguiente acción: Validar variables antes de enviar.

### Message

- Archivo o ámbito: Message.
- Responsabilidad: Persistir mensaje entrante o saliente.
- Entradas: Conversation, direction, content y status.
- Salidas: Mensaje auditable.
- Dependencias: DeliveryAttempt y provider.
- Estado actual: Operativo.
- Siguiente acción: Redactar PII en logs.

### DeliveryAttempt

- Archivo o ámbito: DeliveryAttempt.
- Responsabilidad: Registrar cada intento de entrega.
- Entradas: Message, provider, status y response.
- Salidas: Resultado de envío.
- Dependencias: WhatsApp, email y Metricool.
- Estado actual: Operativo.
- Siguiente acción: Aplicar backoff y límite.

### ContactConsent

- Archivo o ámbito: ContactConsent.
- Responsabilidad: Guardar consentimiento por canal.
- Entradas: Lead, channel, scope y timestamp.
- Salidas: Decisión de contacto.
- Dependencias: Campaigns, calls y messaging.
- Estado actual: Operativo.
- Siguiente acción: Añadir fuente y prueba del consentimiento.

### WebhookEvent

- Archivo o ámbito: WebhookEvent.
- Responsabilidad: Persistir eventos externos para idempotencia.
- Entradas: Provider, event id y payload hash.
- Salidas: Evento procesable y auditable.
- Dependencias: Meta, Mautic, Twilio y WhatsApp.
- Estado actual: Operativo.
- Siguiente acción: Aplicar expiración de payload bruto.

### AutomationRun

- Archivo o ámbito: AutomationRun.
- Responsabilidad: Representar ejecución de automatización.
- Entradas: AutomationVersion, trigger y status.
- Salidas: Run y errores.
- Dependencias: Automation runner.
- Estado actual: Operativo.
- Siguiente acción: Añadir lease y heartbeat.

### OutboxEvent

- Archivo o ámbito: OutboxEvent.
- Responsabilidad: Garantizar publicación de eventos transaccionales.
- Entradas: Aggregate, type y payload.
- Salidas: Evento pendiente de dispatch.
- Dependencias: Outbox dispatcher.
- Estado actual: Operativo.
- Siguiente acción: Añadir dead letter y reintentos visibles.

### ImportJob

- Archivo o ámbito: ImportJob.
- Responsabilidad: Representar importación larga.
- Entradas: Source, file, progress y status.
- Salidas: Job reanudable.
- Dependencias: Import runner y leads.
- Estado actual: Operativo.
- Siguiente acción: Validar límites de archivo.

### NextBestAction

- Archivo o ámbito: NextBestAction.
- Responsabilidad: Proponer siguiente paso para lead.
- Entradas: Lead, action y score.
- Salidas: Recomendación.
- Dependencias: Action center y revenue intelligence.
- Estado actual: Operativo.
- Siguiente acción: Explicar señal que originó la recomendación.

### OptOut

- Archivo o ámbito: OptOut.
- Responsabilidad: Registrar exclusión de comunicaciones.
- Entradas: Lead, channel y reason.
- Salidas: Bloqueo de envío.
- Dependencias: Campaigns y calls.
- Estado actual: Operativo.
- Siguiente acción: Aplicar a todos los proveedores.

### LeadNote

- Archivo o ámbito: LeadNote.
- Responsabilidad: Guardar nota comercial.
- Entradas: Lead, author y content.
- Salidas: Nota consultable.
- Dependencias: Leads y calls.
- Estado actual: Operativo.
- Siguiente acción: Separar nota interna de mensaje al cliente.

### LeadAudit

- Archivo o ámbito: LeadAudit.
- Responsabilidad: Auditar cambios relevantes del lead.
- Entradas: Lead, actor, before y after.
- Salidas: Historial de cambios.
- Dependencias: Leads service.
- Estado actual: Operativo.
- Siguiente acción: Redactar campos sensibles.

### LeadFile

- Archivo o ámbito: LeadFile.
- Responsabilidad: Referenciar archivos de lead.
- Entradas: Lead, storage key y metadata.
- Salidas: Archivo enlazable.
- Dependencias: Storage y knowledge.
- Estado actual: Operativo.
- Siguiente acción: Escanear malware y limitar acceso.

### KnowledgeBase

- Archivo o ámbito: KnowledgeBase.
- Responsabilidad: Representar fuente de conocimiento del agente.
- Entradas: Organization, source y chunks.
- Salidas: Contenido consultable.
- Dependencias: Knowledge service y agents.
- Estado actual: Operativo conceptualmente.
- Siguiente acción: Añadir estado de indexado.

### KnowledgeFavorite

- Archivo o ámbito: KnowledgeFavorite.
- Responsabilidad: Marcar fuentes útiles para un usuario.
- Entradas: User y knowledge base.
- Salidas: Preferencia de consulta.
- Dependencias: Knowledge UI.
- Estado actual: Operativo.
- Siguiente acción: Aplicar control de acceso al favorito.

### AuditLog

- Archivo o ámbito: AuditLog.
- Responsabilidad: Registrar acciones de seguridad y negocio.
- Entradas: Actor, action, target y metadata.
- Salidas: Evidencia de auditoría.
- Dependencias: Middleware y servicios.
- Estado actual: Operativo.
- Siguiente acción: Definir retención y exportación.

### MauticAssetBinding

- Archivo o ámbito: MauticAssetBinding.
- Responsabilidad: Relacionar entidad local y asset Mautic.
- Entradas: Local id, remote id y type.
- Salidas: Binding reconciliable.
- Dependencias: Mautic sync.
- Estado actual: Operativo.
- Siguiente acción: Añadir checksum.

### AutomationStepRun

- Archivo o ámbito: AutomationStepRun.
- Responsabilidad: Guardar resultado de cada paso.
- Entradas: Run, step, status y error.
- Salidas: Detalle de ejecución.
- Dependencias: Automation runner.
- Estado actual: Operativo.
- Siguiente acción: Registrar duración.

### ScheduledTrigger

- Archivo o ámbito: ScheduledTrigger.
- Responsabilidad: Programar activaciones futuras.
- Entradas: Automation, cron y timezone.
- Salidas: Trigger ejecutable.
- Dependencias: Temporal scheduler.
- Estado actual: Operativo.
- Siguiente acción: Validar DST y zona horaria.

### SalesActivity

- Archivo o ámbito: SalesActivity.
- Responsabilidad: Registrar actividad comercial.
- Entradas: Lead, account, actor y type.
- Salidas: Timeline comercial.
- Dependencias: Calls, meetings y tasks.
- Estado actual: Operativo.
- Siguiente acción: Relacionar fuente de actividad.

### Task

- Archivo o ámbito: Task.
- Responsabilidad: Representar trabajo pendiente.
- Entradas: Owner, status, priority y due date.
- Salidas: Tarea asignable.
- Dependencias: Tasks, calls y actions.
- Estado actual: Operativo.
- Siguiente acción: Añadir event source.

### MauticContactBinding

- Archivo o ámbito: MauticContactBinding.
- Responsabilidad: Relacionar lead y contacto Mautic.
- Entradas: Lead, remote id y sync state.
- Salidas: Binding de contacto.
- Dependencias: Mautic sync.
- Estado actual: Operativo.
- Siguiente acción: Resolver conflictos de edición.

### MarketingCampaign

- Archivo o ámbito: MarketingCampaign.
- Responsabilidad: Representar campaña de email.
- Entradas: Template, audience y schedule.
- Salidas: Campaña y entregas.
- Dependencias: EmailDelivery y workers.
- Estado actual: Operativo.
- Siguiente acción: Añadir versión de contenido.

### EmailDelivery

- Archivo o ámbito: EmailDelivery.
- Responsabilidad: Representar envío individual.
- Entradas: Campaign, recipient y status.
- Salidas: Entrega rastreable.
- Dependencias: EmailEvent y provider.
- Estado actual: Operativo.
- Siguiente acción: Minimizar dirección en logs.

### EmailEvent

- Archivo o ámbito: EmailEvent.
- Responsabilidad: Registrar evento del proveedor de email.
- Entradas: Delivery, type y timestamp.
- Salidas: Métrica de entrega.
- Dependencias: Email metrics.
- Estado actual: Operativo.
- Siguiente acción: Idempotencia por provider event id.

### Account

- Archivo o ámbito: Account.
- Responsabilidad: Representar cuenta o empresa cliente.
- Entradas: Organization, name y metadata.
- Salidas: Cuenta comercial.
- Dependencias: Opportunity y contacts.
- Estado actual: Operativo.
- Siguiente acción: Normalizar dominios.

### OpportunityContact

- Archivo o ámbito: OpportunityContact.
- Responsabilidad: Relacionar oportunidad y contacto.
- Entradas: Opportunity, lead y role.
- Salidas: Participante de negocio.
- Dependencias: Pipeline.
- Estado actual: Operativo.
- Siguiente acción: Evitar duplicados.

### Product

- Archivo o ámbito: Product.
- Responsabilidad: Representar producto o servicio vendible.
- Entradas: Organization, price y active.
- Salidas: Catálogo.
- Dependencias: OpportunityLineItem.
- Estado actual: Operativo.
- Siguiente acción: Añadir moneda.

### OpportunityLineItem

- Archivo o ámbito: OpportunityLineItem.
- Responsabilidad: Representar producto en oportunidad.
- Entradas: Opportunity, product, quantity y price.
- Salidas: Valor desglosado.
- Dependencias: Opportunity y Product.
- Estado actual: Operativo.
- Siguiente acción: Congelar precio histórico.

### GrowthProgram

- Archivo o ámbito: GrowthProgram.
- Responsabilidad: Representar iniciativa de crecimiento.
- Entradas: Type, owner, status y goal.
- Salidas: Programa ejecutable.
- Dependencias: Growth service y tasks.
- Estado actual: Operativo.
- Siguiente acción: Añadir criterios de éxito.

### SalesSequenceEnrollment

- Archivo o ámbito: SalesSequenceEnrollment.
- Responsabilidad: Inscribir lead en secuencia.
- Entradas: Lead, sequence, consent y status.
- Salidas: Enrollment.
- Dependencias: Sales sequence runner.
- Estado actual: Operativo.
- Siguiente acción: Bloquear sin consentimiento.

### SalesSequenceStepRun

- Archivo o ámbito: SalesSequenceStepRun.
- Responsabilidad: Registrar pasos de secuencia.
- Entradas: Enrollment, step y result.
- Salidas: Historial de contacto.
- Dependencias: Workers y calls.
- Estado actual: Operativo.
- Siguiente acción: Añadir dedupe por step.

### OrganicProject

- Archivo o ámbito: OrganicProject.
- Responsabilidad: Representar proyecto SEO o contenido.
- Entradas: Organization, domain y goals.
- Salidas: Proyecto orgánico.
- Dependencias: Organic assets y actions.
- Estado actual: Operativo.
- Siguiente acción: Añadir región e idioma.

### OrganicOpportunity

- Archivo o ámbito: OrganicOpportunity.
- Responsabilidad: Representar oportunidad de contenido.
- Entradas: Project, keyword y score.
- Salidas: Oportunidad priorizada.
- Dependencias: Organic service.
- Estado actual: Operativo.
- Siguiente acción: Guardar evidencia de fuente.

### OrganicAsset

- Archivo o ámbito: OrganicAsset.
- Responsabilidad: Representar contenido creado.
- Entradas: Project, type, locale y status.
- Salidas: Asset publicable.
- Dependencias: Metricool y actions.
- Estado actual: Operativo.
- Siguiente acción: Revisión humana obligatoria.

### OrganicAction

- Archivo o ámbito: OrganicAction.
- Responsabilidad: Representar acción de publicación u optimización.
- Entradas: Asset, provider y status.
- Salidas: Acción ejecutable.
- Dependencias: Metricool sync.
- Estado actual: Operativo.
- Siguiente acción: Idempotencia por asset y destino.

### OrganicIntegration

- Archivo o ámbito: OrganicIntegration.
- Responsabilidad: Configurar integración orgánica.
- Entradas: Organization, provider y status.
- Salidas: Integración.
- Dependencias: Metricool.
- Estado actual: Operativo.
- Siguiente acción: Comprobar permisos.

### OrganicOAuthState

- Archivo o ámbito: OrganicOAuthState.
- Responsabilidad: Proteger OAuth de integración orgánica.
- Entradas: Organization, state y expiry.
- Salidas: Estado temporal.
- Dependencias: Organic routes.
- Estado actual: Operativo.
- Siguiente acción: Limpiar expirados.

### RevenueExperiment

- Archivo o ámbito: RevenueExperiment.
- Responsabilidad: Definir experimento comercial.
- Entradas: Goal, hypothesis y status.
- Salidas: Experimento.
- Dependencias: Variants y assignments.
- Estado actual: Operativo.
- Siguiente acción: Añadir criterio de parada.

### RevenueExperimentVariant

- Archivo o ámbito: RevenueExperimentVariant.
- Responsabilidad: Definir variante de experimento.
- Entradas: Experiment, config y weight.
- Salidas: Variante seleccionable.
- Dependencias: Revenue service.
- Estado actual: Operativo.
- Siguiente acción: Validar suma de pesos.

### RevenueExperimentAssignment

- Archivo o ámbito: RevenueExperimentAssignment.
- Responsabilidad: Asignar entidad a variante.
- Entradas: Experiment, variant y subject.
- Salidas: Asignación estable.
- Dependencias: Revenue intelligence.
- Estado actual: Operativo.
- Siguiente acción: Aplicar hash estable.

### OperationalMemoryProposal

- Archivo o ámbito: OperationalMemoryProposal.
- Responsabilidad: Representar memoria propuesta por el sistema.
- Entradas: Signal, proposal y status.
- Salidas: Memoria pendiente o aceptada.
- Dependencias: Orchestration runtime.
- Estado actual: Operativo con aprobación.
- Siguiente acción: Mostrar evidencia antes de persistir.

### GovernancePolicy

- Archivo o ámbito: GovernancePolicy.
- Responsabilidad: Definir políticas de autorización automática.
- Entradas: Scope, rule y threshold.
- Salidas: Decisión de gobernanza.
- Dependencias: Orchestration y access control.
- Estado actual: Operativo inicial.
- Siguiente acción: Versionar cambios.

### AccessControlRequest

- Archivo o ámbito: AccessControlRequest.
- Responsabilidad: Solicitar permiso elevado.
- Entradas: Actor, target, reason y status.
- Salidas: Solicitud auditable.
- Dependencias: Access control.
- Estado actual: Operativo.
- Siguiente acción: Añadir expiración.

### SensitiveApprovalRequest

- Archivo o ámbito: SensitiveApprovalRequest.
- Responsabilidad: Solicitar aprobación de operación sensible.
- Entradas: Organization, action, payload y status.
- Salidas: Aprobación o rechazo.
- Dependencias: Migration nueva y governance.
- Estado actual: Tabla añadida en esta iteración.
- Siguiente acción: Aplicar en mutaciones de ads, credenciales y llamadas.

### ActionItem

- Archivo o ámbito: ActionItem.
- Responsabilidad: Representar acción priorizada.
- Entradas: Owner, priority, status y source.
- Salidas: Acción del centro operativo.
- Dependencias: Action center y tasks.
- Estado actual: Operativo.
- Siguiente acción: Añadir SLA y deduplicación.

### ActionItemHistory

- Archivo o ámbito: ActionItemHistory.
- Responsabilidad: Auditar transiciones de acción.
- Entradas: ActionItem, actor y change.
- Salidas: Historial.
- Dependencias: Action center.
- Estado actual: Operativo.
- Siguiente acción: Proteger integridad histórica.

## Flujo de autenticación y multiempresa

Toda operación debe derivar la organización desde la identidad autenticada o desde una relación autorizada. Nunca se debe confiar en un orgId enviado por el navegador cuando existe un principal autenticado.

### Login

- Archivo o ámbito: POST /auth/login.
- Responsabilidad: Validar credenciales y crear sesión.
- Entradas: Email, password y contexto.
- Salidas: Token o cookie y usuario.
- Dependencias: Auth service y User.
- Estado actual: Implementado.
- Siguiente acción: Aplicar rate limit y alertas.

### Refresh de sesión

- Archivo o ámbito: POST /auth/refresh.
- Responsabilidad: Renovar sesión válida.
- Entradas: Refresh token y sesión.
- Salidas: Nuevo access token.
- Dependencias: AuthSession y JWT.
- Estado actual: Implementado.
- Siguiente acción: Rotar refresh token.

### Logout

- Archivo o ámbito: POST /auth/logout.
- Responsabilidad: Revocar sesión.
- Entradas: Sesión actual.
- Salidas: Confirmación.
- Dependencias: AuthSession.
- Estado actual: Implementado.
- Siguiente acción: Revocar sesiones relacionadas opcionalmente.

### Principal

- Archivo o ámbito: Request principal.
- Responsabilidad: Transportar userId, orgId y rol.
- Entradas: JWT o sesión.
- Salidas: Contexto interno confiable.
- Dependencias: Auth middleware.
- Estado actual: Implementado.
- Siguiente acción: Añadir organización activa explícita.

### Aislamiento de agentes

- Archivo o ámbito: loadAgentConfig.
- Responsabilidad: Buscar agente por id y orgId.
- Entradas: agentId y orgId del principal.
- Salidas: AgentConfig seguro.
- Dependencias: Prisma y simStream.
- Estado actual: Corregido en esta iteración.
- Siguiente acción: Replicar patrón a todos los recursos.

### Aislamiento de leads

- Archivo o ámbito: Leads service.
- Responsabilidad: Filtrar lead por organización.
- Entradas: orgId interno y filtros.
- Salidas: Lead autorizado.
- Dependencias: Prisma.
- Estado actual: Diseñado.
- Siguiente acción: Auditar cada findUnique por id.

### Aislamiento de llamadas

- Archivo o ámbito: Calls service.
- Responsabilidad: Impedir acceso cruzado a llamadas.
- Entradas: callId y orgId.
- Salidas: Call autorizada.
- Dependencias: Prisma.
- Estado actual: Diseñado.
- Siguiente acción: Añadir pruebas negativas.

### Aislamiento de credenciales

- Archivo o ámbito: OrganizationCredentials.
- Responsabilidad: Limitar secreto a organización.
- Entradas: orgId y provider.
- Salidas: Credential metadata.
- Dependencias: Prisma y secret store.
- Estado actual: Implementado parcialmente.
- Siguiente acción: Cifrar y evitar retorno del valor.

### Roles

- Archivo o ámbito: UserRole.
- Responsabilidad: Diferenciar permisos globales y operativos.
- Entradas: Rol del usuario.
- Salidas: Policy decision.
- Dependencias: Access control.
- Estado actual: Implementado.
- Siguiente acción: Descomponer roles amplios.

### Auditoría

- Archivo o ámbito: AuditLog.
- Responsabilidad: Registrar accesos y mutaciones sensibles.
- Entradas: Principal, action y target.
- Salidas: Audit event.
- Dependencias: Prisma y logger.
- Estado actual: Implementado.
- Siguiente acción: Añadir correlation id obligatorio.

## Tipos de agentes y modos de llamada

El agente es una combinación de objetivo comercial, dirección de llamada, idioma, voz, reglas de conversación, herramientas y políticas de escalado. La configuración debe ser versionable y evaluable.

### Agente de recepción

- Archivo o ámbito: type receptionist.
- Responsabilidad: Atender llamadas entrantes y clasificar motivo.
- Entradas: Llamada inbound, número y saludo.
- Salidas: Intención, datos básicos o transferencia.
- Dependencias: Agent config, telephony y CRM.
- Estado actual: Tipo permitido.
- Siguiente acción: Definir guion de apertura en ES y EN.

### Agente de ventas

- Archivo o ámbito: type sales.
- Responsabilidad: Presentar oferta y detectar oportunidad.
- Entradas: Lead, contexto comercial y llamada.
- Salidas: Calificación, objeciones y siguiente paso.
- Dependencias: Sales brain, playbook y pipeline.
- Estado actual: Tipo permitido.
- Siguiente acción: Limitar afirmaciones no verificadas.

### Agente de cualificación

- Archivo o ámbito: type qualification.
- Responsabilidad: Recoger datos y puntuar lead.
- Entradas: Lead parcial y formulario de preguntas.
- Salidas: Score y campos normalizados.
- Dependencias: Leads, knowledge y tasks.
- Estado actual: Tipo permitido.
- Siguiente acción: Definir campos obligatorios por campaña.

### Agente de citas

- Archivo o ámbito: type appointment.
- Responsabilidad: Buscar disponibilidad y confirmar reunión.
- Entradas: Calendario, lead y preferencias.
- Salidas: Meeting o tarea de seguimiento.
- Dependencias: Meetings y calendar provider.
- Estado actual: Tipo permitido.
- Siguiente acción: Confirmar zona horaria y consentimiento.

### Agente de soporte

- Archivo o ámbito: type support.
- Responsabilidad: Resolver dudas y decidir escalado.
- Entradas: Knowledge base y contexto de cliente.
- Salidas: Respuesta, ticket o handoff.
- Dependencias: Knowledge y conversations.
- Estado actual: Tipo permitido.
- Siguiente acción: Medir resolución sin transferencia.

### Agente de cobros

- Archivo o ámbito: type collections.
- Responsabilidad: Gestionar recordatorios de pago.
- Entradas: Cuenta, deuda y políticas.
- Salidas: Promesa, escalado o bloqueo.
- Dependencias: Accounts, compliance y tasks.
- Estado actual: Tipo permitido.
- Siguiente acción: Revisar normativa antes de producción.

### Agente de transferencia

- Archivo o ámbito: type handoff.
- Responsabilidad: Entregar contexto a una persona.
- Entradas: Intent, transcript y disponibilidad.
- Salidas: Transferencia con resumen.
- Dependencias: Telephony, calls y tasks.
- Estado actual: Tipo permitido.
- Siguiente acción: Probar recuperación si no hay operador.

### Dirección inbound

- Archivo o ámbito: direction inbound.
- Responsabilidad: Aceptar llamadas iniciadas por el contacto.
- Entradas: Twilio webhook y stream.
- Salidas: Sesión de voz asociada.
- Dependencias: Twilio, simStream y agent config.
- Estado actual: Soportada.
- Siguiente acción: Aplicar horario y fallback.

### Dirección outbound

- Archivo o ámbito: direction outbound.
- Responsabilidad: Iniciar llamadas a leads autorizados.
- Entradas: Campaign, lead y scheduler.
- Salidas: Call SID y sesión.
- Dependencias: Twilio client, workers y consent.
- Estado actual: Soportada.
- Siguiente acción: Aplicar ventanas y reintentos.

### Dirección ambas

- Archivo o ámbito: direction both.
- Responsabilidad: Permitir entrada y salida.
- Entradas: Agent config y reglas.
- Salidas: Sesión según origen.
- Dependencias: Agents y telephony.
- Estado actual: Soportada.
- Siguiente acción: Evitar que el prompt mezcle objetivos.

### Idioma del agente

- Archivo o ámbito: language.
- Responsabilidad: Seleccionar idioma y locale.
- Entradas: Agent language o fallback.
- Salidas: es-ES o en-US por sesión.
- Dependencias: Remote engine, STT y TTS.
- Estado actual: es-ES priorizado.
- Siguiente acción: Añadir catálogo de voces compatibles.

### Voz del agente

- Archivo o ámbito: voice id.
- Responsabilidad: Seleccionar perfil vocal.
- Entradas: Agent voiceId y provider.
- Salidas: Timbre y prosodia.
- Dependencias: TTS provider o modelo local.
- Estado actual: Disponible.
- Siguiente acción: Añadir preview y checksum de modelo.

### Prompt operativo

- Archivo o ámbito: prompt.
- Responsabilidad: Definir comportamiento conversacional.
- Entradas: Prompt, playbook y contexto.
- Salidas: Instrucciones del LLM.
- Dependencias: Sales brain, knowledge y policy.
- Estado actual: Disponible.
- Siguiente acción: Separar prompt de reglas duras.

### Herramientas

- Archivo o ámbito: tools.
- Responsabilidad: Permitir acciones controladas.
- Entradas: Tool schema y authorization.
- Salidas: Resultado estructurado.
- Dependencias: Services y governance.
- Estado actual: Parcial.
- Siguiente acción: Aplicar allowlist por tipo de agente.

### Escalado

- Archivo o ámbito: handoff policy.
- Responsabilidad: Decidir cuándo entregar a humano.
- Entradas: Riesgo, intención y frustración.
- Salidas: Transfer o callback.
- Dependencias: Compliance, telephony y tasks.
- Estado actual: Parcial.
- Siguiente acción: Crear matriz de motivos obligatorios.

### Consentimiento

- Archivo o ámbito: contact consent.
- Responsabilidad: Determinar si se puede contactar.
- Entradas: Lead, channel y scope.
- Salidas: Permitido o bloqueado.
- Dependencias: ContactConsent, OptOut y campaign.
- Estado actual: Modelo presente.
- Siguiente acción: Hacerlo requisito antes de outbound.

### Horario

- Archivo o ámbito: calling window.
- Responsabilidad: Limitar llamadas a franjas autorizadas.
- Entradas: Timezone y reglas locales.
- Salidas: Permitido o diferido.
- Dependencias: Scheduler y lead locale.
- Estado actual: Parcial.
- Siguiente acción: Persistir zona horaria del contacto.

### Reintentos

- Archivo o ámbito: retry policy.
- Responsabilidad: Gestionar no respuesta y fallos.
- Entradas: Call outcome y contador.
- Salidas: Nuevo intento o cierre.
- Dependencias: Workers y campaigns.
- Estado actual: Parcial.
- Siguiente acción: Imponer máximo por campaña.

### Resultado de llamada

- Archivo o ámbito: call outcome.
- Responsabilidad: Convertir conversación en estado de negocio.
- Entradas: Transcript, events y human review.
- Salidas: Outcome, task y next action.
- Dependencias: Calls, leads y pipeline.
- Estado actual: Implementado conceptualmente.
- Siguiente acción: Normalizar catálogo de resultados.

### Evaluación

- Archivo o ámbito: call judge.
- Responsabilidad: Medir cumplimiento y calidad.
- Entradas: Call trace y rubric.
- Salidas: Scores y feedback.
- Dependencias: Evaluation services.
- Estado actual: Disponible.
- Siguiente acción: Calibrar contra evaluadores humanos.

## Arquitectura de llamadas tipo GPT Live

El objetivo es un Interaction Loop continuo: audio entrante, detección de actividad, transcripción parcial, decisión incremental, audio saliente, interrupción y recuperación. No se trata de esperar una frase completa y responder en lotes.

### Entrada de telefonía

- Archivo o ámbito: Twilio Media Stream.
- Responsabilidad: Transportar audio bidireccional.
- Entradas: Frames μ-law o PCM y metadata.
- Salidas: Stream de audio hacia sesión.
- Dependencias: Twilio, streamAuth y mediaStream.
- Estado actual: Implementado.
- Siguiente acción: Medir jitter y pérdida de frames.

### Autenticación del stream

- Archivo o ámbito: streamAuth.
- Responsabilidad: Validar que el stream pertenece a una llamada autorizada.
- Entradas: Token, call SID y principal.
- Salidas: Contexto de stream.
- Dependencias: Twilio y coordinator.
- Estado actual: Implementado.
- Siguiente acción: Rotar tokens y limitar replay.

### Sesión

- Archivo o ámbito: VoiceSession.
- Responsabilidad: Mantener estado vivo de una llamada.
- Entradas: Call, agent, locale y buffers.
- Salidas: Estado de turno y conexión.
- Dependencias: Coordinator, bridge y engines.
- Estado actual: Implementado.
- Siguiente acción: Persistir snapshots de recuperación.

### Coordinador

- Archivo o ámbito: VoiceCoordinator.
- Responsabilidad: Orquestar apertura, ejecución y cierre.
- Entradas: Call request y agent config.
- Salidas: Voice session y final result.
- Dependencias: Telephony, engine factory y trace.
- Estado actual: Implementado.
- Siguiente acción: Añadir supervisor de fallos.

### Bridge de audio

- Archivo o ámbito: audio/bridge.
- Responsabilidad: Adaptar formatos entre teléfono y motor.
- Entradas: Frames de entrada y salida.
- Salidas: Frames compatibles.
- Dependencias: DSP, codec y providers.
- Estado actual: Implementado.
- Siguiente acción: Validar sample rate con pruebas reales.

### DSP

- Archivo o ámbito: audio/dsp.
- Responsabilidad: Normalizar y procesar audio.
- Entradas: PCM, gain y sample rate.
- Salidas: Audio limpio y medible.
- Dependencias: Numpy o runtime equivalente.
- Estado actual: Implementado.
- Siguiente acción: Medir impacto de CPU.

### Detector de ruido

- Archivo o ámbito: audio/noiseClassifier.
- Responsabilidad: Distinguir voz, ruido y silencio.
- Entradas: Frame audio.
- Salidas: Clase acústica.
- Dependencias: Turn manager y metrics.
- Estado actual: Disponible.
- Siguiente acción: Calibrar para teléfonos españoles.

### Prosodia

- Archivo o ámbito: audio/prosodic.
- Responsabilidad: Controlar pausas, ritmo y énfasis.
- Entradas: Texto, intención y perfil.
- Salidas: Prosody controls.
- Dependencias: TTS router y voice profile.
- Estado actual: Disponible.
- Siguiente acción: Evaluar naturalidad con jueces humanos.

### Turn manager

- Archivo o ámbito: turn/turnManager.
- Responsabilidad: Decidir inicio, fin e interrupción de turno.
- Entradas: VAD, partial STT y estado.
- Salidas: Turn event.
- Dependencias: STT, LLM y TTS.
- Estado actual: Implementado en piezas.
- Siguiente acción: Probar barge-in bajo ruido.

### VAD

- Archivo o ámbito: Voice activity detection.
- Responsabilidad: Detectar actividad vocal.
- Entradas: Audio frame.
- Salidas: Speech start, speech end o silence.
- Dependencias: DSP y turn manager.
- Estado actual: Necesario para full dúplex.
- Siguiente acción: Comparar Silero VAD y WebRTC VAD.

### STT parcial

- Archivo o ámbito: Streaming speech-to-text.
- Responsabilidad: Emitir texto antes del final del turno.
- Entradas: Audio y idioma.
- Salidas: Partial transcript.
- Dependencias: Deepgram, local STT o gateway.
- Estado actual: Soportado por arquitectura.
- Siguiente acción: Definir política de estabilidad.

### LLM incremental

- Archivo o ámbito: Conversation intelligence.
- Responsabilidad: Generar respuesta con contexto parcial.
- Entradas: Transcript, state y tools.
- Salidas: Tokens, intent o action.
- Dependencias: LLM local/remoto y sales brain.
- Estado actual: Parcial.
- Siguiente acción: Añadir cancelación de generación.

### TTS streaming

- Archivo o ámbito: Streaming text-to-speech.
- Responsabilidad: Emitir audio en fragmentos.
- Entradas: Tokens, locale y voice.
- Salidas: Audio parcial.
- Dependencias: Piper, Qwen3 TTS, ElevenLabs opcional.
- Estado actual: Disponible según engine.
- Siguiente acción: Medir time to first audio.

### Barge-in

- Archivo o ámbito: Interrupción del usuario.
- Responsabilidad: Parar o atenuar TTS al detectar voz.
- Entradas: Speech start durante salida.
- Salidas: Cancelación y nuevo turno.
- Dependencias: VAD, TTS cancel y turn manager.
- Estado actual: Objetivo central.
- Siguiente acción: Registrar tiempo de corte.

### Backchannel

- Archivo o ámbito: Mmm, sí, un momento.
- Responsabilidad: Emitir señales conversacionales breves.
- Entradas: Silencio, carga o escucha.
- Salidas: Audio corto o texto de estado.
- Dependencias: Prosody, TTS y policy.
- Estado actual: Pendiente de calibración.
- Siguiente acción: Separar backchannel de respuesta semántica.

### Silencio útil

- Archivo o ámbito: Pause policy.
- Responsabilidad: No rellenar cada pausa con contenido.
- Entradas: Duración, intención y confidence.
- Salidas: Espera, backchannel o pregunta.
- Dependencias: Turn manager y policy.
- Estado actual: Parcial.
- Siguiente acción: Medir abandono y percepción.

### Detección de contestador

- Archivo o ámbito: AMD.
- Responsabilidad: Distinguir humano y buzón en outbound.
- Entradas: Audio inicial y duración.
- Salidas: Human, machine o unknown.
- Dependencias: amdService y Twilio.
- Estado actual: Disponible.
- Siguiente acción: Probar con buzones españoles.

### Cierre

- Archivo o ámbito: Session finalizer.
- Responsabilidad: Cerrar audio, persistir resultado y liberar recursos.
- Entradas: Hangup, error o transfer.
- Salidas: Call terminal state.
- Dependencias: Calls, trace y workers.
- Estado actual: Implementado.
- Siguiente acción: Asegurar cierre idempotente.

### Transferencia

- Archivo o ámbito: Human handoff.
- Responsabilidad: Pasar la llamada y contexto a humano.
- Entradas: Motivo, transcript y destino.
- Salidas: Transfer result.
- Dependencias: Twilio client y tasks.
- Estado actual: Parcial.
- Siguiente acción: Definir fallback a callback.

### Evaluación en línea

- Archivo o ámbito: Online metrics.
- Responsabilidad: Medir latencia y eventos sin bloquear.
- Entradas: Timestamps y counters.
- Salidas: Metrics y trace.
- Dependencias: VoiceCallMetric y observability.
- Estado actual: Implementado en piezas.
- Siguiente acción: No guardar audio por defecto.

### Recuperación

- Archivo o ámbito: Reconnect and resume.
- Responsabilidad: Continuar tras una caída corta.
- Entradas: Session snapshot y stream state.
- Salidas: Sesión reanudada o cierre.
- Dependencias: Redis, DB y coordinator.
- Estado actual: Pendiente.
- Siguiente acción: Definir límite de recuperación.

### Seguridad de audio

- Archivo o ámbito: Audio privacy.
- Responsabilidad: Limitar acceso y retención del audio.
- Entradas: Frames, recordings y policies.
- Salidas: Audio efímero o cifrado.
- Dependencias: Storage y compliance.
- Estado actual: Pendiente.
- Siguiente acción: Documentar retención por organización.

### Contrato de eventos

- Archivo o ámbito: Voice events.
- Responsabilidad: Estandarizar eventos entre componentes.
- Entradas: Event type y payload.
- Salidas: Evento versionado.
- Dependencias: VoiceTrace, workers y UI.
- Estado actual: En construcción.
- Siguiente acción: Crear esquema JSON versionado.

## Motor de voz y modelos

La estrategia recomendada es mantener una interfaz de engine y poder probar dos modos: un motor remoto compatible para validar la experiencia y un pipeline local open source para controlar coste, privacidad y personalización.

### Engine factory

- Archivo o ámbito: backend/src/voice/engine/factory.ts.
- Responsabilidad: Seleccionar motor por configuración.
- Entradas: VOICE_ENGINE_MODE y agent config.
- Salidas: VoiceEngine implementation.
- Dependencias: RemoteVoiceEngine y local adapter.
- Estado actual: Implementado.
- Siguiente acción: Añadir healthcheck y capability negotiation.

### Remote voice engine

- Archivo o ámbito: backend/src/voice/engine/remoteVoiceEngine.ts.
- Responsabilidad: Adaptar proveedor remoto o gateway.
- Entradas: Session config, locale, voice y metadata.
- Salidas: Audio y eventos.
- Dependencias: Remote endpoint, agent config y trace.
- Estado actual: Implementado con idioma y voz por agente.
- Siguiente acción: Validar timeouts y fallback.

### Voice engine interface

- Archivo o ámbito: backend/src/voice/engine/architecture.ts.
- Responsabilidad: Definir contrato común del motor.
- Entradas: Audio frames, events y config.
- Salidas: Session lifecycle.
- Dependencias: Coordinator y engine factory.
- Estado actual: Base arquitectónica.
- Siguiente acción: Congelar contrato versionado.

### Voice session engine

- Archivo o ámbito: backend/src/voice/engine/voiceSession.ts.
- Responsabilidad: Encapsular sesión de engine.
- Entradas: Stream, context y lifecycle.
- Salidas: Turn events y audio.
- Dependencias: STT, TTS y LLM.
- Estado actual: Implementado parcialmente.
- Siguiente acción: Añadir cancelación consistente.

### Python server

- Archivo o ámbito: voice-engine/server.py.
- Responsabilidad: Exponer pipeline de voz local.
- Entradas: Audio websocket, config y language.
- Salidas: Transcripts y audio TTS.
- Dependencias: STT local, Qwen3 TTS y session.
- Estado actual: Actualizado a defaults españoles.
- Siguiente acción: Probar carga concurrente.

### Moshi gateway

- Archivo o ámbito: voice-engine/moshi_gateway.py.
- Responsabilidad: Conectar gateway dúplex y STT.
- Entradas: Session metadata y audio.
- Salidas: Session ready, transcript y capabilities.
- Dependencias: Moshi, STT adapters y trace.
- Estado actual: Tests offline pasan.
- Siguiente acción: Documentar licencia y requisitos de GPU.

### STT español

- Archivo o ámbito: voice-engine/server.py y moshi_gateway.py.
- Responsabilidad: Transcribir español de España.
- Entradas: Audio y language es-ES.
- Salidas: Texto parcial o final.
- Dependencias: Faster-Whisper, Deepgram o engine local.
- Estado actual: es-ES por defecto.
- Siguiente acción: Medir WER con corpus telefónico.

### TTS español

- Archivo o ámbito: voice-engine/server.py.
- Responsabilidad: Generar voz castellana.
- Entradas: Texto, idioma y speaker.
- Salidas: Audio PCM o stream.
- Dependencias: Qwen3 TTS, Piper o provider.
- Estado actual: Instrucción Spanish configurada.
- Siguiente acción: Comparar naturalidad y latencia.

### Piper

- Archivo o ámbito: VOICE_ENGINE_TTS_PROVIDER=piper.
- Responsabilidad: Proporcionar TTS local ligero.
- Entradas: Texto y modelo .onnx.
- Salidas: WAV o PCM.
- Dependencias: Piper runtime y voz española.
- Estado actual: Opción de bajo consumo.
- Siguiente acción: Elegir voz con licencia compatible.

### Qwen3 TTS

- Archivo o ámbito: VOICE_ENGINE_TTS_PROVIDER=qwen3.
- Responsabilidad: Proporcionar voz más expresiva.
- Entradas: Texto e instrucción de estilo.
- Salidas: Audio expresivo.
- Dependencias: GPU, modelo y speaker.
- Estado actual: Integrado como opción.
- Siguiente acción: Medir memoria y estabilidad.

### ElevenLabs adapter

- Archivo o ámbito: backend/src/voice/tts/elevenLabsTts.ts.
- Responsabilidad: Permitir TTS externo opcional.
- Entradas: Texto, voice id y API key.
- Salidas: Audio externo.
- Dependencias: ElevenLabs API.
- Estado actual: Opcional y no open source.
- Siguiente acción: Aislarlo del modo local.

### Deepgram STT

- Archivo o ámbito: backend/src/voice/stt/deepgram.ts.
- Responsabilidad: Usar STT streaming de proveedor.
- Entradas: Audio y locale.
- Salidas: Transcript y confidence.
- Dependencias: Deepgram credentials.
- Estado actual: Opcional.
- Siguiente acción: Compararlo contra STT local español.

### TTS router

- Archivo o ámbito: backend/src/voice/tts/ttsRouter.ts.
- Responsabilidad: Elegir proveedor y fallback.
- Entradas: Locale, voice profile y policy.
- Salidas: Audio provider result.
- Dependencias: Profiles, providers y engine.
- Estado actual: Implementado.
- Siguiente acción: Añadir circuit breaker.

### Voice profiles

- Archivo o ámbito: backend/src/voice/tts/voiceProfiles.ts.
- Responsabilidad: Mapear agentes a voces compatibles.
- Entradas: Agent voiceId y locale.
- Salidas: Provider profile.
- Dependencias: TTS router y config.
- Estado actual: Disponible.
- Siguiente acción: Validar que la voz pertenece al idioma.

### Prosody controller

- Archivo o ámbito: backend/src/voice/tts/prosodyController.ts.
- Responsabilidad: Aplicar ritmo y pausas.
- Entradas: Text, intent y profile.
- Salidas: TTS instructions.
- Dependencias: Prosodic module y provider.
- Estado actual: Disponible.
- Siguiente acción: Crear presets de teléfono.

### Sales brain

- Archivo o ámbito: backend/src/voice/intelligence/salesBrain.ts.
- Responsabilidad: Aplicar lógica comercial al diálogo.
- Entradas: Lead, playbook y transcript.
- Salidas: Next action, intent y response policy.
- Dependencias: LLM, CRM y agent type.
- Estado actual: Implementado conceptualmente.
- Siguiente acción: Separar facts de generación libre.

### Call context

- Archivo o ámbito: backend/src/voice/intelligence/conversation/callContext.ts.
- Responsabilidad: Mantener contexto mínimo y relevante.
- Entradas: Agent config, lead y events.
- Salidas: Prompt context.
- Dependencias: Sales brain, knowledge y trace.
- Estado actual: Actualizado con type y direction.
- Siguiente acción: Limitar tamaño y PII.

### Cerebras adapter

- Archivo o ámbito: backend/src/voice/intelligence/llm/cerebras.ts.
- Responsabilidad: Conectar LLM externo rápido.
- Entradas: Messages y model.
- Salidas: Tokens o structured output.
- Dependencias: Cerebras credentials.
- Estado actual: Opcional.
- Siguiente acción: No usar como requisito del modo local.

### Knowledge grounding

- Archivo o ámbito: voice knowledge integration.
- Responsabilidad: Dar respuestas basadas en fuentes.
- Entradas: Query y organization.
- Salidas: Citations y facts.
- Dependencias: KnowledgeBase y embeddings.
- Estado actual: Parcial.
- Siguiente acción: Bloquear respuestas sin fuente en dominios sensibles.

### Moshi base prompt

- Archivo o ámbito: Moshi gateway metadata.
- Responsabilidad: Identificar prompt operativo del agente.
- Entradas: Agent type, direction y prompt.
- Salidas: Metadata de trazabilidad.
- Dependencias: Trace y session.
- Estado actual: El prompt es trace-only, no control de modelo base.
- Siguiente acción: No presentar este campo como fine-tuning.

### Personaplex-like direction

- Archivo o ámbito: Full duplex open source.
- Responsabilidad: Combinar speech-to-speech y control de diálogo.
- Entradas: Audio continuo y persona.
- Salidas: Interacción natural.
- Dependencias: Moshi o modelo equivalente, policy y TTS.
- Estado actual: Línea de investigación.
- Siguiente acción: Validar licencias y entrenamiento español.

### Kyutai interactivity alignment

- Archivo o ámbito: Interactivity research.
- Responsabilidad: Alinear backchannels, pausas e interrupciones.
- Entradas: Eventos humanos y feedback.
- Salidas: Política de interactividad.
- Dependencias: Dataset, reward model y runtime.
- Estado actual: No integrado como modelo entrenado.
- Siguiente acción: Usarlo primero como marco de evaluación.

### Especialización española

- Archivo o ámbito: Spanish voice specialization.
- Responsabilidad: Adaptar pronunciación, turnos y expresiones.
- Entradas: Corpus telefónico español.
- Salidas: Modelo o reglas calibradas.
- Dependencias: STT, TTS, prompts y evaluators.
- Estado actual: Objetivo del producto.
- Siguiente acción: Crear corpus consentido y rubric.

### Cambio de voz

- Archivo o ámbito: Voice swap.
- Responsabilidad: Permitir cambiar timbre sin cambiar política.
- Entradas: Voice id o speaker.
- Salidas: Audio con nueva identidad.
- Dependencias: TTS profiles o voice cloning.
- Estado actual: Relativamente fácil en TTS; más difícil en S2S.
- Siguiente acción: Verificar licencia y consentimiento de voz.

### Personalización

- Archivo o ámbito: Agent personalization.
- Responsabilidad: Modificar tono, objetivo y reglas.
- Entradas: Agent config y playbook.
- Salidas: Comportamiento reproducible.
- Dependencias: Agent service, LLM y TTS.
- Estado actual: Alta en pipeline modular.
- Siguiente acción: Versionar cada experimento.

### Métricas de latencia

- Archivo o ámbito: Voice latency.
- Responsabilidad: Medir desde fin de audio a primer audio.
- Entradas: Timestamps por componente.
- Salidas: TTFT, TTFB y E2E.
- Dependencias: VoiceCallMetric y trace.
- Estado actual: Necesario antes de comparar engines.
- Siguiente acción: Publicar p50, p95 y peor caso.

### Calidad de voz

- Archivo o ámbito: Voice quality.
- Responsabilidad: Medir naturalidad, inteligibilidad y emoción.
- Entradas: Grabaciones de referencia y evaluadores.
- Salidas: MOS, preference y error tags.
- Dependencias: CallJudge y corpus.
- Estado actual: Pendiente de benchmark.
- Siguiente acción: Crear conjunto ES y EN equilibrado.

### Calidad semántica

- Archivo o ámbito: Conversation quality.
- Responsabilidad: Medir objetivos cumplidos y errores.
- Entradas: Rubric, transcript y CRM outcome.
- Salidas: Score y defects.
- Dependencias: CallJudge y sales brain.
- Estado actual: Disponible.
- Siguiente acción: Separar calidad lingüística de conversión.

### Coste local

- Archivo o ámbito: Self-hosted cost.
- Responsabilidad: Calcular coste por minuto y concurrencia.
- Entradas: GPU hours, CPU y storage.
- Salidas: Cost model.
- Dependencias: Deployment y metrics.
- Estado actual: Por estimar con hardware.
- Siguiente acción: Probar servidor alquilado por horas.

### Licencias

- Archivo o ámbito: Model licensing.
- Responsabilidad: Controlar uso comercial y redistribución.
- Entradas: Model cards y dependencies.
- Salidas: Matriz de compatibilidad.
- Dependencias: Open source audit.
- Estado actual: Pendiente de auditoría final.
- Siguiente acción: Registrar licencia por versión.

## Workers, jobs y asincronía

Los workers desacoplan tareas largas de las peticiones HTTP. Deben ser idempotentes, observables y capaces de reintentarse sin duplicar llamadas, mensajes o publicaciones.

### Ad insights sync

- Archivo o ámbito: backend/src/jobs/adInsightsSync.ts.
- Responsabilidad: Importar métricas de Meta.
- Entradas: Cuenta, cursor y rango.
- Salidas: AdInsightSnapshot.
- Dependencias: Meta insights y scheduler.
- Estado actual: Implementado.
- Siguiente acción: Añadir backoff y cursor persistente.

### Ad review poll

- Archivo o ámbito: backend/src/jobs/adReviewPoll.ts.
- Responsabilidad: Consultar estado de revisión publicitaria.
- Entradas: Campaign ids y provider.
- Salidas: Campaign status.
- Dependencias: Meta API.
- Estado actual: Implementado.
- Siguiente acción: Evitar polling agresivo.

### Automation runner

- Archivo o ámbito: backend/src/jobs/automationRunner.ts.
- Responsabilidad: Ejecutar pasos de automatización.
- Entradas: AutomationRun y lease.
- Salidas: Step runs y outbox.
- Dependencias: Automation service y Prisma.
- Estado actual: Implementado.
- Siguiente acción: Añadir lock distribuido.

### Campaign send runner

- Archivo o ámbito: backend/src/jobs/campaignSendRunner.ts.
- Responsabilidad: Enviar campañas programadas.
- Entradas: MarketingCampaign y audience.
- Salidas: EmailDelivery y events.
- Dependencias: Email provider y opt-out.
- Estado actual: Implementado.
- Siguiente acción: Aplicar límite de proveedor.

### Import job runner

- Archivo o ámbito: backend/src/jobs/importJobRunner.ts.
- Responsabilidad: Procesar archivos e importaciones.
- Entradas: ImportJob y file.
- Salidas: Leads, errors y progress.
- Dependencias: Storage y leads.
- Estado actual: Implementado.
- Siguiente acción: Añadir cancelación.

### Lead call dispatch

- Archivo o ámbito: backend/src/jobs/leadCallDispatch.ts.
- Responsabilidad: Programar llamadas outbound.
- Entradas: Lead, consent y campaign.
- Salidas: Call request o skip.
- Dependencias: Twilio, schedule y agent.
- Estado actual: Implementado conceptualmente.
- Siguiente acción: Aplicar horario y AMD.

### Outbox dispatcher

- Archivo o ámbito: backend/src/jobs/outboxDispatcher.ts.
- Responsabilidad: Publicar eventos transaccionales.
- Entradas: OutboxEvent pendiente.
- Salidas: Delivery y retry.
- Dependencias: Providers y event handlers.
- Estado actual: Implementado.
- Siguiente acción: Crear dead-letter visible.

### Sales sequence runner

- Archivo o ámbito: backend/src/jobs/salesSequenceRunner.ts.
- Responsabilidad: Avanzar secuencias comerciales.
- Entradas: Enrollment y step.
- Salidas: Messages, calls o tasks.
- Dependencias: Consent y channels.
- Estado actual: Implementado.
- Siguiente acción: Respetar pausas y opt-out.

### Temporal event scheduler

- Archivo o ámbito: backend/src/jobs/temporalEventScheduler.ts.
- Responsabilidad: Activar eventos programados.
- Entradas: ScheduledTrigger y timezone.
- Salidas: AutomationRun.
- Dependencias: Scheduler y Prisma.
- Estado actual: Implementado.
- Siguiente acción: Probar cambio horario europeo.

### Leases

- Archivo o ámbito: Worker lease.
- Responsabilidad: Evitar procesamiento concurrente.
- Entradas: Job id y worker id.
- Salidas: Lease renovado.
- Dependencias: Prisma o Redis.
- Estado actual: Parcial.
- Siguiente acción: Definir expiración y recuperación.

### Retry policy

- Archivo o ámbito: Retry policy.
- Responsabilidad: Reintentar solo errores transitorios.
- Entradas: Error class y attempt count.
- Salidas: Next retry o terminal.
- Dependencias: Workers y providers.
- Estado actual: Parcial.
- Siguiente acción: Clasificar 4xx, 5xx y timeouts.

### Dead letter

- Archivo o ámbito: Dead letter queue.
- Responsabilidad: Aislar trabajos que no se completan.
- Entradas: Job y error final.
- Salidas: Registro para intervención.
- Dependencias: Outbox y workers.
- Estado actual: Pendiente.
- Siguiente acción: Añadir UI de reprocess.

### Backpressure

- Archivo o ámbito: Queue capacity.
- Responsabilidad: Evitar saturar modelos o proveedor.
- Entradas: Queue depth y concurrency.
- Salidas: Throttle y reject controlado.
- Dependencias: Redis, engine y workers.
- Estado actual: Pendiente.
- Siguiente acción: Definir límites por organización.

### Shutdown

- Archivo o ámbito: Graceful shutdown.
- Responsabilidad: Cerrar workers sin perder trabajo.
- Entradas: Signal, active jobs.
- Salidas: Drain y exit.
- Dependencias: Node process y queues.
- Estado actual: Necesario.
- Siguiente acción: Probar SIGTERM durante llamada.

### Observabilidad de jobs

- Archivo o ámbito: Worker metrics.
- Responsabilidad: Medir duración, error y lag.
- Entradas: Job events.
- Salidas: Metrics y logs.
- Dependencias: Logger y monitoring.
- Estado actual: Parcial.
- Siguiente acción: Añadir dashboard operativo.

## Integraciones externas

Las integraciones amplían el sistema, pero introducen latencia, cuotas, cambios de API y dependencia de secretos. Cada proveedor debe estar detrás de un adaptador y tener healthcheck, timeout, retry e idempotencia.

### Twilio

- Archivo o ámbito: Twilio Voice.
- Responsabilidad: Telefonía entrante, saliente y media streams.
- Entradas: Account SID, auth token, number y webhook.
- Salidas: Call SID, audio stream y events.
- Dependencias: twilioClient, streamAuth y telephony.
- Estado actual: Integración central.
- Siguiente acción: Validar firma y números E.164.

### Mautic

- Archivo o ámbito: Mautic.
- Responsabilidad: Contactos, campañas y eventos.
- Entradas: Base URL, credentials y webhooks.
- Salidas: Bindings y lead events.
- Dependencias: Mautic sync.
- Estado actual: Disponible.
- Siguiente acción: Probar compatibilidad de versiones.

### Meta Ads

- Archivo o ámbito: Meta Marketing API.
- Responsabilidad: Cuentas, campañas, leads e insights.
- Entradas: OAuth, account id y scopes.
- Salidas: Ad data y webhook events.
- Dependencias: Meta services.
- Estado actual: Disponible con credenciales.
- Siguiente acción: Revisar expiración de tokens.

### Metricool

- Archivo o ámbito: Metricool.
- Responsabilidad: Métricas de redes y publicación indirecta.
- Entradas: API key y project.
- Salidas: Snapshots.
- Dependencias: Metricool sync.
- Estado actual: Disponible según cuenta.
- Siguiente acción: Añadir healthcheck por endpoint.

### Email provider

- Archivo o ámbito: SMTP o API email.
- Responsabilidad: Enviar mensajes y recibir eventos.
- Entradas: SMTP/API key, domain y webhook.
- Salidas: Delivery y events.
- Dependencias: Marketing campaign worker.
- Estado actual: Abstracción presente.
- Siguiente acción: Elegir proveedor compatible con self-hosting.

### Calendar provider

- Archivo o ámbito: Calendario.
- Responsabilidad: Consultar disponibilidad y crear citas.
- Entradas: OAuth y timezone.
- Salidas: Meeting confirmation.
- Dependencias: Meetings service.
- Estado actual: Opcional.
- Siguiente acción: Implementar interfaz estable.

### LLM remoto

- Archivo o ámbito: Cerebras u otro.
- Responsabilidad: Proporcionar generación rápida si se permite.
- Entradas: API key, model y prompt.
- Salidas: Tokens y structured output.
- Dependencias: Cerebras adapter.
- Estado actual: Opcional.
- Siguiente acción: No acoplar el modo local.

### STT remoto

- Archivo o ámbito: Deepgram.
- Responsabilidad: Transcripción streaming.
- Entradas: API key, audio y locale.
- Salidas: Partial transcript.
- Dependencias: Deepgram adapter.
- Estado actual: Opcional.
- Siguiente acción: Comparar coste y WER.

### TTS remoto

- Archivo o ámbito: ElevenLabs.
- Responsabilidad: Voz de alta calidad.
- Entradas: API key, voice id y text.
- Salidas: Audio.
- Dependencias: ElevenLabs adapter.
- Estado actual: Opcional.
- Siguiente acción: Aislar datos y cumplir privacidad.

### Provider health

- Archivo o ámbito: Integration health.
- Responsabilidad: Detectar fallo antes de una campaña o llamada.
- Entradas: Provider credentials.
- Salidas: Ready, degraded o down.
- Dependencias: Integration health route.
- Estado actual: Implementado.
- Siguiente acción: No exponer secretos ni payloads.

### Webhooks

- Archivo o ámbito: Webhook boundary.
- Responsabilidad: Recibir cambios externos de forma segura.
- Entradas: Headers, signature y payload.
- Salidas: WebhookEvent y dispatch.
- Dependencias: Routes y ingestion services.
- Estado actual: Implementado en varios proveedores.
- Siguiente acción: Normalizar verificación.

### OAuth

- Archivo o ámbito: OAuth boundary.
- Responsabilidad: Conectar cuentas sin almacenar password.
- Entradas: Code, state y redirect.
- Salidas: Credential reference.
- Dependencias: OAuth state models.
- Estado actual: Implementado en Meta y orgánico.
- Siguiente acción: Usar PKCE donde aplique.

### Rate limits

- Archivo o ámbito: Provider quotas.
- Responsabilidad: Evitar bloqueos y costes inesperados.
- Entradas: Response headers y counters.
- Salidas: Throttle y retry after.
- Dependencias: Adapters y workers.
- Estado actual: Parcial.
- Siguiente acción: Registrar cuota consumida.

### Circuit breaker

- Archivo o ámbito: External resilience.
- Responsabilidad: Parar llamadas a proveedor degradado.
- Entradas: Error rate y timeout.
- Salidas: Open, half-open o closed.
- Dependencias: Integration health.
- Estado actual: Pendiente.
- Siguiente acción: Aplicarlo al motor de voz.

### Data minimization

- Archivo o ámbito: External data policy.
- Responsabilidad: Enviar solo lo necesario a cada proveedor.
- Entradas: Lead, transcript y consent.
- Salidas: Payload reducido.
- Dependencias: Privacy y adapters.
- Estado actual: Pendiente de matriz formal.
- Siguiente acción: Clasificar campos por proveedor.

## Seguridad, privacidad y cumplimiento

El producto maneja nombres, teléfonos, conversaciones, transcripciones, credenciales y posiblemente datos financieros. La seguridad no puede limitarse a autenticación: debe cubrir minimización, autorización, retención, auditoría y respuesta.

### Secretos de entorno

- Archivo o ámbito: backend/.env y variables.
- Responsabilidad: Separar secretos del código y del repositorio.
- Entradas: Environment variables y secret store.
- Salidas: Configuración runtime.
- Dependencias: Docker, backend y providers.
- Estado actual: backend/.env está ignorado y fuera del índice.
- Siguiente acción: Rotar cualquier secreto histórico.

### JWT y sesiones

- Archivo o ámbito: Auth security.
- Responsabilidad: Controlar acceso y expiración.
- Entradas: Credentials, session and refresh.
- Salidas: Tokens revocables.
- Dependencias: Auth service.
- Estado actual: Implementado.
- Siguiente acción: Usar claves fuera del repositorio.

### Contraseñas

- Archivo o ámbito: Password hashing.
- Responsabilidad: Evitar guardar passwords reversibles.
- Entradas: Password input.
- Salidas: Hash y verification.
- Dependencias: bcrypt o equivalente.
- Estado actual: Implementado.
- Siguiente acción: Definir coste y migración.

### CORS

- Archivo o ámbito: HTTP boundary.
- Responsabilidad: Limitar orígenes autorizados.
- Entradas: Origin header y env.
- Salidas: Allowed origin o reject.
- Dependencias: Fastify.
- Estado actual: Configuración requiere revisión.
- Siguiente acción: Separar local y producción.

### Rate limiting

- Archivo o ámbito: Abuse control.
- Responsabilidad: Limitar login, webhooks y llamadas.
- Entradas: IP, user y org counters.
- Salidas: 429 controlado.
- Dependencias: Middleware y Redis.
- Estado actual: Pendiente de auditoría.
- Siguiente acción: Aplicar por endpoint sensible.

### Validación Zod

- Archivo o ámbito: Input validation.
- Responsabilidad: Rechazar campos extra y tipos incorrectos.
- Entradas: JSON request.
- Salidas: Payload seguro.
- Dependencias: agents controller y otros routes.
- Estado actual: Mejorada para agentes.
- Siguiente acción: Extender a todas las mutaciones.

### Aislamiento multiempresa

- Archivo o ámbito: Tenant isolation.
- Responsabilidad: Impedir lectura o mutación cruzada.
- Entradas: Principal orgId.
- Salidas: Query scoped.
- Dependencias: Prisma services.
- Estado actual: Corregido en agents; auditoría global pendiente.
- Siguiente acción: Crear tests de ataque cruzado.

### Auditoría

- Archivo o ámbito: Audit trail.
- Responsabilidad: Explicar acciones sensibles.
- Entradas: Actor, target y action.
- Salidas: AuditLog.
- Dependencias: Services y middleware.
- Estado actual: Modelo presente.
- Siguiente acción: Definir eventos obligatorios.

### PII en logs

- Archivo o ámbito: Log privacy.
- Responsabilidad: Evitar teléfonos y transcripciones en logs.
- Entradas: Error, payload y metadata.
- Salidas: Log redacted.
- Dependencias: Logger y trace.
- Estado actual: Pendiente de política única.
- Siguiente acción: Crear redactor central.

### Audio

- Archivo o ámbito: Audio retention.
- Responsabilidad: Definir si se guarda o se descarta.
- Entradas: Recording, stream y consent.
- Salidas: Retención o eliminación.
- Dependencias: Twilio y storage.
- Estado actual: Pendiente de decisión por organización.
- Siguiente acción: Desactivar grabación por defecto.

### Transcripción

- Archivo o ámbito: Transcript privacy.
- Responsabilidad: Proteger texto de conversación.
- Entradas: Partial y final transcript.
- Salidas: DB redacted o encrypted.
- Dependencias: Call events y evaluation.
- Estado actual: Persistencia disponible.
- Siguiente acción: Separar texto operativo de texto sensible.

### Consentimiento

- Archivo o ámbito: Voice consent.
- Responsabilidad: Controlar llamadas y grabaciones.
- Entradas: Consent record y campaign.
- Salidas: Allow, block o ask.
- Dependencias: ContactConsent y OptOut.
- Estado actual: Modelo presente.
- Siguiente acción: Hacer enforcement antes de Twilio.

### Grabación

- Archivo o ámbito: Recording notice.
- Responsabilidad: Informar y registrar grabación.
- Entradas: Call policy y announcement.
- Salidas: Notice event.
- Dependencias: Telephony y compliance.
- Estado actual: Pendiente.
- Siguiente acción: Definir audio legal por país.

### Transferencia humana

- Archivo o ámbito: Human handoff.
- Responsabilidad: Evitar revelar datos al operador incorrecto.
- Entradas: Context summary y target.
- Salidas: Transfer safe.
- Dependencias: Access control y telephony.
- Estado actual: Parcial.
- Siguiente acción: Aplicar permisos y redacción.

### Herramientas de agente

- Archivo o ámbito: Tool authorization.
- Responsabilidad: Limitar acciones del LLM.
- Entradas: Tool call y policy.
- Salidas: Permitido, aprobado o bloqueado.
- Dependencias: Governance y services.
- Estado actual: Parcial.
- Siguiente acción: No permitir efectos destructivos directos.

### Aprobación sensible

- Archivo o ámbito: SensitiveApprovalRequest.
- Responsabilidad: Requerir revisión para operaciones críticas.
- Entradas: Action, payload y actor.
- Salidas: Approved o rejected.
- Dependencias: Prisma migration y governance.
- Estado actual: Tabla añadida; flujo por conectar.
- Siguiente acción: Integrarlo en ads, credenciales y acciones de voz.

### Dependencias

- Archivo o ámbito: Dependency security.
- Responsabilidad: Detectar vulnerabilidades y licencias.
- Entradas: package lock y requirements.
- Salidas: Report y remediation.
- Dependencias: npm, pip y CI.
- Estado actual: Pendiente de automatización.
- Siguiente acción: Ejecutar auditoría periódica.

### Backups

- Archivo o ámbito: Backup policy.
- Responsabilidad: Recuperar datos y configuración.
- Entradas: DB, storage y secrets metadata.
- Salidas: Backup cifrado.
- Dependencias: PostgreSQL y storage.
- Estado actual: Pendiente de runbook real.
- Siguiente acción: Probar restauración.

### Borrado

- Archivo o ámbito: Deletion policy.
- Responsabilidad: Atender borrado o retención.
- Entradas: Organization, lead y events.
- Salidas: Delete or anonymize.
- Dependencias: Prisma y providers.
- Estado actual: Pendiente.
- Siguiente acción: Definir cascadas y evidencias.

### Incidente

- Archivo o ámbito: Incident response.
- Responsabilidad: Contener acceso o proveedor comprometido.
- Entradas: Alert, logs y scope.
- Salidas: Incident record.
- Dependencias: Observability y operations.
- Estado actual: Documentación parcial.
- Siguiente acción: Ensayar playbook.

## Observabilidad y evaluación

Una experiencia de voz natural no se puede validar solo con una demo. Hace falta correlacionar timestamps, audio, transcripción, decisiones, interrupciones y resultado de negocio.

### Voice trace

- Archivo o ámbito: backend/src/voice/observability/voiceTrace.ts.
- Responsabilidad: Correlacionar eventos de una llamada.
- Entradas: Call id, session id y event.
- Salidas: Trace event con locale y agent config.
- Dependencias: Prisma, logger y engine.
- Estado actual: Actualizado para idioma y metadata.
- Siguiente acción: Añadir sampling configurable.

### Session logger

- Archivo o ámbito: backend/src/voice/sessionLogger.ts.
- Responsabilidad: Registrar ciclo de vida de sesión.
- Entradas: Session events y errors.
- Salidas: Logs estructurados.
- Dependencias: Coordinator y engine.
- Estado actual: Disponible.
- Siguiente acción: Redactar PII.

### Call judge

- Archivo o ámbito: backend/src/voice/evaluation/callJudge.ts.
- Responsabilidad: Aplicar rubric de calidad.
- Entradas: Transcript y trace.
- Salidas: Scores y defects.
- Dependencias: LLM o reglas.
- Estado actual: Disponible.
- Siguiente acción: Separar score automático de humano.

### Call judge service

- Archivo o ámbito: backend/src/voice/evaluation/callJudgeService.ts.
- Responsabilidad: Persistir evaluación y feedback.
- Entradas: Call and rubric.
- Salidas: VoiceCallEvaluation.
- Dependencias: Prisma.
- Estado actual: Disponible.
- Siguiente acción: Versionar rubric.

### Voice experiment

- Archivo o ámbito: backend/src/voice/experiments/voiceExperiment.ts.
- Responsabilidad: Comparar motores, voces o prompts.
- Entradas: Variant assignment.
- Salidas: Experiment metrics.
- Dependencias: Revenue intelligence y trace.
- Estado actual: Disponible.
- Siguiente acción: Asegurar asignación estable.

### TTFT

- Archivo o ámbito: Time to first token.
- Responsabilidad: Medir inicio de generación.
- Entradas: Generation timestamps.
- Salidas: Milliseconds.
- Dependencias: LLM adapter.
- Estado actual: Necesario.
- Siguiente acción: Emitir en cada turno.

### TTFA

- Archivo o ámbito: Time to first audio.
- Responsabilidad: Medir primera muestra de audio.
- Entradas: TTS start and audio frame.
- Salidas: Milliseconds.
- Dependencias: TTS router y bridge.
- Estado actual: Necesario.
- Siguiente acción: Separar warm y cold start.

### E2E latency

- Archivo o ámbito: End to end.
- Responsabilidad: Medir fin de usuario a primer audio.
- Entradas: Speech end y audio out.
- Salidas: Milliseconds p50/p95.
- Dependencias: Turn manager y trace.
- Estado actual: Necesario.
- Siguiente acción: Publicar por engine y locale.

### Barge-in latency

- Archivo o ámbito: Interruption latency.
- Responsabilidad: Medir cuánto tarda en parar la voz.
- Entradas: User speech start y TTS stop.
- Salidas: Milliseconds.
- Dependencias: VAD y TTS cancellation.
- Estado actual: Pendiente.
- Siguiente acción: Objetivo operativo por debajo de un umbral definido.

### STT WER

- Archivo o ámbito: Transcription quality.
- Responsabilidad: Medir errores de transcripción.
- Entradas: Reference transcript and hypothesis.
- Salidas: WER, CER y entity accuracy.
- Dependencias: Corpus español.
- Estado actual: Pendiente.
- Siguiente acción: Crear golden set telefónico.

### TTS MOS

- Archivo o ámbito: Voice quality.
- Responsabilidad: Medir naturalidad e inteligibilidad.
- Entradas: Audio samples and rubric.
- Salidas: MOS y preference.
- Dependencias: Call judge y human panel.
- Estado actual: Pendiente.
- Siguiente acción: Evaluar variantes de voz.

### Backchannel rate

- Archivo o ámbito: Interactivity.
- Responsabilidad: Medir frecuencia y adecuación de mmm y pausas.
- Entradas: Turn events y rubric.
- Salidas: Rate y false positive.
- Dependencias: Turn manager.
- Estado actual: Pendiente.
- Siguiente acción: No optimizar cantidad sin calidad.

### Silence distribution

- Archivo o ámbito: Silence quality.
- Responsabilidad: Medir pausas antes de responder.
- Entradas: Timestamps.
- Salidas: Histogram y abandoned calls.
- Dependencias: Trace.
- Estado actual: Pendiente.
- Siguiente acción: Segmentar por intención.

### Transfer rate

- Archivo o ámbito: Handoff quality.
- Responsabilidad: Medir derivaciones y motivos.
- Entradas: Call outcome y reason.
- Salidas: Rate and reason distribution.
- Dependencias: Calls y tasks.
- Estado actual: Disponible.
- Siguiente acción: Detectar transferencias evitables.

### Goal completion

- Archivo o ámbito: Business outcome.
- Responsabilidad: Medir cita, calificación o resolución.
- Entradas: Call outcome y CRM.
- Salidas: Conversion or completion.
- Dependencias: Calls, leads y meetings.
- Estado actual: Disponible conceptualmente.
- Siguiente acción: Definir outcome por agente.

### Error taxonomy

- Archivo o ámbito: Operational defects.
- Responsabilidad: Clasificar fallos repetibles.
- Entradas: Trace, logs y judge.
- Salidas: Defect code.
- Dependencias: Evaluation y incident.
- Estado actual: Pendiente.
- Siguiente acción: Usar códigos estables.

### Health metrics

- Archivo o ámbito: System health.
- Responsabilidad: Medir API, DB, queue y provider.
- Entradas: Health probes.
- Salidas: Ready and degraded.
- Dependencias: Integration health.
- Estado actual: Implementado parcialmente.
- Siguiente acción: Separar liveness de readiness.

### Dashboards

- Archivo o ámbito: Operations dashboard.
- Responsabilidad: Ver capacidad y errores en tiempo real.
- Entradas: Metrics and logs.
- Salidas: Panels y alerts.
- Dependencias: Monitoring stack.
- Estado actual: Pendiente de despliegue.
- Siguiente acción: Crear panel de llamadas.

### Alertas

- Archivo o ámbito: Alerting.
- Responsabilidad: Avisar degradación útil.
- Entradas: Threshold, window y severity.
- Salidas: Notification.
- Dependencias: Observability.
- Estado actual: Pendiente.
- Siguiente acción: Evitar alert fatigue.

### Replay

- Archivo o ámbito: Call replay.
- Responsabilidad: Reproducir eventos sin exponer PII.
- Entradas: Trace snapshot.
- Salidas: Debug session.
- Dependencias: VoiceTrace y test harness.
- Estado actual: Pendiente.
- Siguiente acción: Usar datos sintéticos o anonimizados.

## Pruebas y validación

La confianza del sistema requiere capas: compilación, pruebas unitarias, pruebas offline, integración con PostgreSQL, contratos HTTP, seguridad multiempresa, audio sintético y pruebas manuales de llamadas.

### Build raíz

- Archivo o ámbito: npm run build.
- Responsabilidad: Detectar errores de compilación del frontend.
- Entradas: Código, dependencias y env de build.
- Salidas: Bundle generado.
- Dependencias: Vite y TypeScript indirecto.
- Estado actual: Pasa tras lazy loading.
- Siguiente acción: Mantener en CI.

### Build backend

- Archivo o ámbito: backend npm run build.
- Responsabilidad: Detectar errores de TypeScript y bundling.
- Entradas: Código backend.
- Salidas: Dist backend.
- Dependencias: TypeScript y esbuild.
- Estado actual: Pasa.
- Siguiente acción: Añadir chequeo de source maps.

### Prisma generate

- Archivo o ámbito: npm run db:generate.
- Responsabilidad: Generar cliente desde schema.
- Entradas: schema.prisma.
- Salidas: Prisma Client.
- Dependencias: Prisma.
- Estado actual: Pasa.
- Siguiente acción: Ejecutar tras cambios de schema.

### Offline backend

- Archivo o ámbito: npm run test:offline.
- Responsabilidad: Verificar rutas y lógica sin DB real.
- Entradas: Mocks y fixture runtime.
- Salidas: Tests offline.
- Dependencias: Vitest o script Node.
- Estado actual: Pasa con 4 tests.
- Siguiente acción: Ampliar cobertura.

### Gateway Python

- Archivo o ámbito: python voice-engine/test_moshi_gateway.py.
- Responsabilidad: Verificar handshake, idioma y transcript.
- Entradas: Audio fake y session metadata.
- Salidas: 5 tests y eventos.
- Dependencias: Python y fake STT.
- Estado actual: Pasa.
- Siguiente acción: Añadir audio multicanal.

### Py compile

- Archivo o ámbito: python -m py_compile.
- Responsabilidad: Detectar errores sintácticos Python.
- Entradas: server, gateway y tests.
- Salidas: Bytecode válido.
- Dependencias: Python.
- Estado actual: Pasa.
- Siguiente acción: Incluir en CI.

### Suite completa

- Archivo o ámbito: npm test.
- Responsabilidad: Ejecutar tests con PostgreSQL aislado.
- Entradas: TEST_DATABASE_URL.
- Salidas: Resultados de integración.
- Dependencias: Prisma y DB.
- Estado actual: Bloqueada sin DB aislada.
- Siguiente acción: Crear base efímera y seed mínimo.

### Contrato agents

- Archivo o ámbito: agents controller tests.
- Responsabilidad: Comprobar unknown fields y ownership.
- Entradas: Payload válido, extra y org mismatch.
- Salidas: 400 o scoped result.
- Dependencias: Zod, Prisma y mocks.
- Estado actual: Necesario.
- Siguiente acción: Añadir antes de producción.

### Contrato voice

- Archivo o ámbito: voice routes tests.
- Responsabilidad: Comprobar token y lifecycle.
- Entradas: Call, agent y stream.
- Salidas: Session response.
- Dependencias: Twilio mocks.
- Estado actual: Parcial.
- Siguiente acción: Cubrir callbacks.

### Multiempresa negativo

- Archivo o ámbito: tenant isolation tests.
- Responsabilidad: Intentar leer entidad de otra organización.
- Entradas: IDs cruzados y principals.
- Salidas: 404 o 403.
- Dependencias: Prisma test DB.
- Estado actual: Pendiente crítico.
- Siguiente acción: Crear suite transversal.

### Webhook replay

- Archivo o ámbito: webhook tests.
- Responsabilidad: Repetir evento externo.
- Entradas: Same provider event id.
- Salidas: Una sola mutación.
- Dependencias: WebhookEvent.
- Estado actual: Pendiente.
- Siguiente acción: Cubrir Meta, Mautic y Twilio.

### Idempotencia worker

- Archivo o ámbito: worker tests.
- Responsabilidad: Procesar job dos veces.
- Entradas: Same job and lease.
- Salidas: Un efecto observable.
- Dependencias: Workers y DB.
- Estado actual: Pendiente.
- Siguiente acción: Añadir constraints.

### Audio sintético

- Archivo o ámbito: audio fixtures.
- Responsabilidad: Repetir casos de voz sin datos reales.
- Entradas: WAV, noise y interruptions.
- Salidas: Transcript y metrics.
- Dependencias: Python, VAD y engine.
- Estado actual: Pendiente.
- Siguiente acción: Crear corpus local con consentimiento.

### Carga de sesiones

- Archivo o ámbito: load test voice.
- Responsabilidad: Medir concurrencia y saturación.
- Entradas: N sesiones simultáneas.
- Salidas: Latency, CPU y memory.
- Dependencias: Engine y telephony mock.
- Estado actual: Pendiente.
- Siguiente acción: Probar niveles incrementales.

### Prueba de interrupción

- Archivo o ámbito: barge-in test.
- Responsabilidad: Verificar corte inmediato de TTS.
- Entradas: User speech durante response.
- Salidas: TTS cancel y turn switch.
- Dependencias: VAD, TTS y turn manager.
- Estado actual: Pendiente.
- Siguiente acción: Medir p95.

### Prueba de idioma

- Archivo o ámbito: locale test.
- Responsabilidad: Verificar es-ES y en-US por agente.
- Entradas: Agent language and session.
- Salidas: STT/TTS locale correctos.
- Dependencias: Agent config y engine.
- Estado actual: Parcial.
- Siguiente acción: Comprobar no mezcla de idiomas.

### Prueba de voz

- Archivo o ámbito: voice selection test.
- Responsabilidad: Comprobar voiceId por agente.
- Entradas: Two agents, two voices.
- Salidas: Audio profile correct.
- Dependencias: TTS router.
- Estado actual: Pendiente.
- Siguiente acción: Comparar audio y metadata.

### Prueba de teléfono

- Archivo o ámbito: telephony integration.
- Responsabilidad: Validar codec, DTMF y hangup.
- Entradas: Twilio test call.
- Salidas: Stable call.
- Dependencias: Twilio and media stream.
- Estado actual: Pendiente.
- Siguiente acción: Usar número de staging.

### Prueba de recuperación

- Archivo o ámbito: reconnect test.
- Responsabilidad: Simular caída del gateway.
- Entradas: Network interruption.
- Salidas: Resume or graceful close.
- Dependencias: Coordinator and gateway.
- Estado actual: Pendiente.
- Siguiente acción: Definir SLA.

### Prueba de seguridad

- Archivo o ámbito: security regression.
- Responsabilidad: Verificar secretos, headers y autorización.
- Entradas: Malicious requests.
- Salidas: Safe errors.
- Dependencias: Auth and middleware.
- Estado actual: Pendiente.
- Siguiente acción: Integrar scanner.

### Prueba visual

- Archivo o ámbito: browser smoke.
- Responsabilidad: Verificar login, idiomas y 404.
- Entradas: Browser interactions.
- Salidas: No console errors.
- Dependencias: Frontend and browser.
- Estado actual: Realizada en iteración previa.
- Siguiente acción: Mantener screenshots de referencia.

### Prueba de bundle

- Archivo o ámbito: bundle inspection.
- Responsabilidad: Controlar peso inicial.
- Entradas: Build output.
- Salidas: Size report.
- Dependencias: Vite.
- Estado actual: Mejorado a aproximadamente 504 kB inicial.
- Siguiente acción: Dividir chart chunk restante.

### Prueba de migraciones

- Archivo o ámbito: ops:prisma-audit.
- Responsabilidad: Detectar tablas y migraciones ausentes.
- Entradas: Schema, migration files y DB.
- Salidas: Audit report.
- Dependencias: Prisma.
- Estado actual: Detecta advertencias de historial.
- Siguiente acción: Consolidar antes de release.

### Prueba de documentación

- Archivo o ámbito: docs check.
- Responsabilidad: Verificar enlaces y fechas.
- Entradas: Markdown files.
- Salidas: Broken link report.
- Dependencias: PowerShell o CI.
- Estado actual: Pendiente.
- Siguiente acción: Automatizar enlaces internos.

### Prueba de operación

- Archivo o ámbito: production rehearsal.
- Responsabilidad: Ensayar backup, deploy y rollback.
- Entradas: Staging environment.
- Salidas: Runbook evidence.
- Dependencias: Docker, DB y workers.
- Estado actual: Pendiente.
- Siguiente acción: Hacer una ejecución completa.

## Despliegue y operación

El despliegue puede ser local, en un servidor propio o en una instancia alquilada durante pocas horas. Para probar los dos modos de llamadas conviene separar el plano web, el backend, PostgreSQL, el gateway de voz y los modelos según la capacidad del servidor.

### Desarrollo local

- Archivo o ámbito: npm run dev.
- Responsabilidad: Iterar frontend y backend.
- Entradas: Node, PostgreSQL y env local.
- Salidas: Aplicación en localhost.
- Dependencias: Vite, Fastify y Prisma.
- Estado actual: Disponible.
- Siguiente acción: Documentar puertos y resets.

### Docker Compose

- Archivo o ámbito: docker-compose.yml.
- Responsabilidad: Levantar dependencias reproducibles.
- Entradas: Env, volumes y services.
- Salidas: Postgres y servicios auxiliares.
- Dependencias: Docker Compose.
- Estado actual: Disponible con revisión de passwords.
- Siguiente acción: Usar secretos fuera del YAML.

### Servidor CPU

- Archivo o ámbito: VPS sin GPU.
- Responsabilidad: Ejecutar API, DB, workers y TTS ligero.
- Entradas: 4-8 vCPU, RAM y SSD.
- Salidas: CRM y voz de baja concurrencia.
- Dependencias: Node, Postgres y Piper.
- Estado actual: Adecuado para prueba pequeña.
- Siguiente acción: No ejecutar modelos pesados.

### Servidor GPU

- Archivo o ámbito: GPU alquilada.
- Responsabilidad: Ejecutar STT/TTS y modelo dúplex local.
- Entradas: GPU VRAM, CUDA y storage.
- Salidas: Motor local con menor latencia.
- Dependencias: PyTorch, CUDA y model cache.
- Estado actual: Opción de benchmark.
- Siguiente acción: Apagar al terminar y borrar snapshots sensibles.

### Modo remoto

- Archivo o ámbito: Remote engine.
- Responsabilidad: Validar UX con provider o gateway.
- Entradas: Endpoint, API key y config.
- Salidas: Respuesta de voz.
- Dependencias: RemoteVoiceEngine.
- Estado actual: Útil para comparación.
- Siguiente acción: No mezclar resultados de coste local.

### Modo local

- Archivo o ámbito: Local engine.
- Responsabilidad: Validar independencia de proveedor.
- Entradas: Modelos descargados y runtime.
- Salidas: Audio y transcript local.
- Dependencias: voice-engine y GPU.
- Estado actual: Arquitectura preparada.
- Siguiente acción: Comprobar licencias y concurrencia.

### Base de datos

- Archivo o ámbito: PostgreSQL.
- Responsabilidad: Persistir estado transaccional.
- Entradas: DATABASE_URL y migrations.
- Salidas: Tablas y consultas.
- Dependencias: Prisma.
- Estado actual: Necesaria.
- Siguiente acción: Backup y restore antes de producción.

### Redis o cola

- Archivo o ámbito: Queue backend.
- Responsabilidad: Coordinar jobs y estado efímero.
- Entradas: REDIS_URL.
- Salidas: Locks, queue y rate limits.
- Dependencias: Workers.
- Estado actual: Según configuración.
- Siguiente acción: Decidir proveedor único.

### Reverse proxy

- Archivo o ámbito: Nginx o Caddy.
- Responsabilidad: Terminar TLS y enrutar servicios.
- Entradas: Domain, certificates y upstreams.
- Salidas: HTTPS y WebSocket.
- Dependencias: Backend, frontend y gateway.
- Estado actual: Pendiente de receta final.
- Siguiente acción: Probar WebSocket sobre TLS.

### TLS

- Archivo o ámbito: HTTPS/WSS.
- Responsabilidad: Proteger credenciales y audio.
- Entradas: Certificates y domain.
- Salidas: Conexión cifrada.
- Dependencias: Reverse proxy.
- Estado actual: Obligatorio en producción.
- Siguiente acción: Renovación automática.

### Persistencia de modelos

- Archivo o ámbito: Model cache.
- Responsabilidad: Evitar descargar en cada arranque.
- Entradas: Model path y volume.
- Salidas: Cache de STT/TTS/LLM.
- Dependencias: Docker volume y GPU.
- Estado actual: Pendiente.
- Siguiente acción: Versionar hashes, no binarios.

### Variables de entorno

- Archivo o ámbito: .env.example.
- Responsabilidad: Documentar configuración sin secretos.
- Entradas: Template y runtime.
- Salidas: Config validada.
- Dependencias: Node y Python.
- Estado actual: Actualizada para español.
- Siguiente acción: Validar startup con schema.

### Migraciones

- Archivo o ámbito: prisma migrate deploy.
- Responsabilidad: Aplicar esquema en servidor.
- Entradas: Migration history y DB.
- Salidas: Schema actualizado.
- Dependencias: Prisma.
- Estado actual: Nueva tabla añadida; historial pendiente.
- Siguiente acción: No usar db push en producción.

### Workers

- Archivo o ámbito: backend worker.
- Responsabilidad: Ejecutar jobs fuera del API.
- Entradas: Env, queue y DB.
- Salidas: Jobs procesados.
- Dependencias: Node y Prisma.
- Estado actual: Disponible.
- Siguiente acción: Supervisar con systemd o Docker.

### Supervisor

- Archivo o ámbito: systemd o container restart.
- Responsabilidad: Reiniciar procesos fallidos.
- Entradas: Service unit y health.
- Salidas: Proceso recuperado.
- Dependencias: OS y monitoring.
- Estado actual: Pendiente.
- Siguiente acción: Definir límites de restart.

### Logs

- Archivo o ámbito: structured logs.
- Responsabilidad: Conservar diagnóstico operativo.
- Entradas: stdout y correlation id.
- Salidas: Logs consultables.
- Dependencias: Node, Python y proxy.
- Estado actual: Parcial.
- Siguiente acción: Centralizar y retener.

### Métricas

- Archivo o ámbito: Prometheus compatible.
- Responsabilidad: Observar salud y latencia.
- Entradas: Counters, histograms y gauges.
- Salidas: Dashboards.
- Dependencias: VoiceTrace y health.
- Estado actual: Pendiente de stack.
- Siguiente acción: Añadir labels controladas.

### Alerting

- Archivo o ámbito: Alertmanager o equivalente.
- Responsabilidad: Notificar fallos relevantes.
- Entradas: Metric thresholds.
- Salidas: Alerts.
- Dependencias: Monitoring stack.
- Estado actual: Pendiente.
- Siguiente acción: Definir on-call.

### Backups

- Archivo o ámbito: DB and config backups.
- Responsabilidad: Recuperar servicio.
- Entradas: DB dump y config segura.
- Salidas: Restore point.
- Dependencias: PostgreSQL y storage.
- Estado actual: Pendiente de ensayo.
- Siguiente acción: Cifrar y probar.

### Rollback

- Archivo o ámbito: Release rollback.
- Responsabilidad: Volver a versión estable.
- Entradas: Artifact, migration and config.
- Salidas: Service previous version.
- Dependencias: Git, Docker y Prisma.
- Estado actual: Pendiente.
- Siguiente acción: Documentar compatibilidad de migraciones.

### Prueba por horas

- Archivo o ámbito: Ephemeral GPU test.
- Responsabilidad: Probar modelos sin compromiso de coste.
- Entradas: Server rental and schedule.
- Salidas: Benchmark report.
- Dependencias: Deploy scripts y test corpus.
- Estado actual: Objetivo directo del usuario.
- Siguiente acción: Automatizar shutdown.

### Separación de entornos

- Archivo o ámbito: dev, staging, prod.
- Responsabilidad: Evitar mezclar datos y secretos.
- Entradas: Environment name.
- Salidas: Isolated resources.
- Dependencias: Config and DB.
- Estado actual: Necesario.
- Siguiente acción: Bloquear prod desde credenciales dev.

### Dominio y webhooks

- Archivo o ámbito: Public URLs.
- Responsabilidad: Permitir Twilio y OAuth.
- Entradas: DNS, TLS y paths.
- Salidas: Callback reachable.
- Dependencias: Proxy y routes.
- Estado actual: Pendiente para llamada real.
- Siguiente acción: Verificar rutas canónicas.

### Capacidad

- Archivo o ámbito: Concurrency budget.
- Responsabilidad: Saber cuántas llamadas soporta el servidor.
- Entradas: CPU, VRAM, queue depth.
- Salidas: Max concurrent sessions.
- Dependencias: Load test.
- Estado actual: Desconocida.
- Siguiente acción: Medir con dos motores.

### Coste

- Archivo o ámbito: Cost model.
- Responsabilidad: Estimar servidor, tráfico y storage.
- Entradas: Hours, GPU, minutes and providers.
- Salidas: Cost per call.
- Dependencias: Deploy and metrics.
- Estado actual: Pendiente.
- Siguiente acción: Separar coste fijo y variable.

### Actualizaciones

- Archivo o ámbito: Upgrade policy.
- Responsabilidad: Actualizar dependencias y modelos.
- Entradas: Release notes y tests.
- Salidas: Upgrade or pin.
- Dependencias: npm, Python y models.
- Estado actual: Pendiente.
- Siguiente acción: Registrar compatibility matrix.

### Data residency

- Archivo o ámbito: Server location.
- Responsabilidad: Mantener datos en ubicación elegida.
- Entradas: Region y providers.
- Salidas: Residency decision.
- Dependencias: Telephony, DB y engine.
- Estado actual: Depende de proveedor.
- Siguiente acción: Preferir local para audio sensible.

### Disaster recovery

- Archivo o ámbito: DR.
- Responsabilidad: Definir recuperación ante pérdida del servidor.
- Entradas: Backup and RTO/RPO.
- Salidas: Recovery procedure.
- Dependencias: Operations.
- Estado actual: Pendiente.
- Siguiente acción: Acordar objetivos de negocio.

### Runbook

- Archivo o ámbito: docs/PRODUCCION_RUNBOOK.md.
- Responsabilidad: Guiar arranque, parada y diagnóstico.
- Entradas: Procedures y checks.
- Salidas: Operación repetible.
- Dependencias: Deploy stack.
- Estado actual: Existe documentación relacionada.
- Siguiente acción: Actualizar con modo local real.

### Production gate

- Archivo o ámbito: npm run ops:production-gate.
- Responsabilidad: Bloquear release si faltan requisitos.
- Entradas: Env, schema y checks.
- Salidas: Pass, warn o fail.
- Dependencias: Scripts de operaciones.
- Estado actual: Existe y debe endurecerse.
- Siguiente acción: Convertir warnings críticos en fallos.

## Configuración relevante

La configuración debe tener una fuente clara. Los valores de desarrollo no pueden convertirse silenciosamente en valores de producción. Las variables de voz deben resolverse por agente, después por entorno y finalmente por defaults seguros.

### NODE_ENV

- Archivo o ámbito: backend runtime.
- Responsabilidad: Seleccionar comportamiento de entorno.
- Entradas: development, test o production.
- Salidas: Feature flags y errores.
- Dependencias: Node process.
- Estado actual: Convencional.
- Siguiente acción: Validar valores permitidos.

### DATABASE_URL

- Archivo o ámbito: database.
- Responsabilidad: Conectar PostgreSQL.
- Entradas: URL con credenciales.
- Salidas: Prisma connection.
- Dependencias: Prisma.
- Estado actual: Obligatoria.
- Siguiente acción: No imprimirla en logs.

### JWT_SECRET

- Archivo o ámbito: auth.
- Responsabilidad: Firmar tokens.
- Entradas: Secreto runtime.
- Salidas: JWT validado.
- Dependencias: Auth service.
- Estado actual: Obligatoria fuera de dev.
- Siguiente acción: Requerir longitud mínima.

### VOICE_CALL_LANGUAGE

- Archivo o ámbito: voice fallback.
- Responsabilidad: Idioma por defecto de llamada.
- Entradas: Locale.
- Salidas: Locale de call trace.
- Dependencias: Voice trace y remote engine.
- Estado actual: es-ES.
- Siguiente acción: Mantener solo como fallback.

### VOICE_ENGINE_LANGUAGE

- Archivo o ámbito: local engine.
- Responsabilidad: Idioma base del motor.
- Entradas: Locale.
- Salidas: STT session language.
- Dependencias: Python voice engine.
- Estado actual: es-ES.
- Siguiente acción: Sobrescribir por sesión cuando sea posible.

### VOICE_ENGINE_TTS_LANGUAGE

- Archivo o ámbito: local TTS.
- Responsabilidad: Instrucción lingüística del TTS.
- Entradas: Spanish o English.
- Salidas: TTS language behavior.
- Dependencias: Qwen3 TTS.
- Estado actual: Spanish.
- Siguiente acción: Alinear con locale del agente.

### VOICE_ENGINE_TTS_PROVIDER

- Archivo o ámbito: local TTS.
- Responsabilidad: Elegir proveedor local.
- Entradas: piper o qwen3.
- Salidas: TTS implementation.
- Dependencias: voice-engine.
- Estado actual: piper como opción ligera.
- Siguiente acción: Validar provider al arrancar.

### VOICE_ENGINE_PIPER_MODEL

- Archivo o ámbito: Piper.
- Responsabilidad: Ruta del modelo español.
- Entradas: Filesystem path.
- Salidas: Piper model.
- Dependencias: Piper runtime.
- Estado actual: Opcional.
- Siguiente acción: Comprobar existencia y licencia.

### VOICE_DUPLEX_LANGUAGE

- Archivo o ámbito: duplex gateway.
- Responsabilidad: Idioma por defecto del gateway.
- Entradas: Locale.
- Salidas: Session ready locale.
- Dependencias: Moshi gateway.
- Estado actual: es-ES.
- Siguiente acción: Hacerlo por sesión.

### VOICE_ENGINE_MODE

- Archivo o ámbito: engine selection.
- Responsabilidad: Seleccionar local o remote.
- Entradas: local, remote o auto.
- Salidas: Engine factory branch.
- Dependencias: Backend voice engine.
- Estado actual: Arquitectural.
- Siguiente acción: Definir fallback explícito.

### TWILIO_ACCOUNT_SID

- Archivo o ámbito: telephony.
- Responsabilidad: Identificar cuenta Twilio.
- Entradas: SID.
- Salidas: Twilio client.
- Dependencias: Twilio integration.
- Estado actual: Secreto.
- Siguiente acción: No compartir en frontend.

### TWILIO_AUTH_TOKEN

- Archivo o ámbito: telephony.
- Responsabilidad: Firmar y autorizar Twilio.
- Entradas: Token.
- Salidas: Validated requests.
- Dependencias: Twilio integration.
- Estado actual: Secreto.
- Siguiente acción: Rotar ante exposición.

### TWILIO_PHONE_NUMBER

- Archivo o ámbito: outbound.
- Responsabilidad: Número de origen.
- Entradas: E.164.
- Salidas: Outbound call.
- Dependencias: Twilio client.
- Estado actual: Configuración.
- Siguiente acción: Validar región y verificación.

### PUBLIC_BASE_URL

- Archivo o ámbito: webhooks.
- Responsabilidad: Construir callback público.
- Entradas: HTTPS base URL.
- Salidas: Webhook URLs.
- Dependencias: Twilio, OAuth y providers.
- Estado actual: Necesaria para staging público.
- Siguiente acción: No apuntar a localhost.

### REDIS_URL

- Archivo o ámbito: queues.
- Responsabilidad: Conectar cola y locks.
- Entradas: URL.
- Salidas: Queue client.
- Dependencias: Workers.
- Estado actual: Según implementación.
- Siguiente acción: Cifrar y limitar red.

### CORS_ORIGIN

- Archivo o ámbito: frontend access.
- Responsabilidad: Limitar navegador autorizado.
- Entradas: Origin list.
- Salidas: CORS headers.
- Dependencias: Fastify.
- Estado actual: Necesita valores por entorno.
- Siguiente acción: No usar wildcard en producción.

### LOG_LEVEL

- Archivo o ámbito: observability.
- Responsabilidad: Controlar detalle de logs.
- Entradas: debug, info, warn, error.
- Salidas: Logger configuration.
- Dependencias: Node y Python.
- Estado actual: Convencional.
- Siguiente acción: No habilitar debug con PII.

### S3 or storage vars

- Archivo o ámbito: files and audio.
- Responsabilidad: Configurar almacenamiento.
- Entradas: Endpoint, bucket y keys.
- Salidas: File references.
- Dependencias: LeadFile y recordings.
- Estado actual: Opcional.
- Siguiente acción: Separar buckets por entorno.

### MODEL_CACHE_DIR

- Archivo o ámbito: local models.
- Responsabilidad: Controlar cache de modelos.
- Entradas: Filesystem path.
- Salidas: Loaded model.
- Dependencias: Python runtime.
- Estado actual: Necesario en GPU.
- Siguiente acción: Montar volumen persistente.

### GPU settings

- Archivo o ámbito: CUDA.
- Responsabilidad: Seleccionar dispositivo y dtype.
- Entradas: CUDA_VISIBLE_DEVICES y precision.
- Salidas: Runtime allocation.
- Dependencias: PyTorch.
- Estado actual: Pendiente por servidor.
- Siguiente acción: Registrar memoria al arrancar.

## Problemas conocidos y correcciones aplicadas

La auditoría previa detectó problemas de seguridad, configuración, rutas, rendimiento y trazabilidad. Algunas correcciones ya están aplicadas; otras requieren infraestructura o una decisión de producto.

### Campos extra en agentes

- Archivo o ámbito: agents controller.
- Responsabilidad: Un cliente podía intentar enviar campos no previstos.
- Entradas: Payload inválido.
- Salidas: 400 con schema estricto.
- Dependencias: Zod y parseRequest.
- Estado actual: Corregido.
- Siguiente acción: Mantener pruebas de regresión.

### Sobrescritura de orgId

- Archivo o ámbito: agents service.
- Responsabilidad: La creación no debe aceptar ownership del cliente.
- Entradas: Body malicioso con orgId.
- Salidas: orgId del principal.
- Dependencias: Agents service.
- Estado actual: Corregido.
- Siguiente acción: Auditar servicios equivalentes.

### Lectura cruzada de agentes

- Archivo o ámbito: agentConfig.
- Responsabilidad: agentId debe estar acotado por organización.
- Entradas: ID válido de otra org.
- Salidas: No encontrado o denegado.
- Dependencias: Prisma findFirst con orgId.
- Estado actual: Corregido.
- Siguiente acción: Añadir test negativo.

### Idioma hardcodeado

- Archivo o ámbito: voice runtime.
- Responsabilidad: La voz no debe asumir inglés.
- Entradas: Agent o env config.
- Salidas: es-ES por defecto.
- Dependencias: Remote engine, trace y Python.
- Estado actual: Corregido.
- Siguiente acción: Probar agente en inglés explícito.

### Metadata de prompt Moshi

- Archivo o ámbito: Moshi gateway.
- Responsabilidad: No confundir metadata con fine-tuning.
- Entradas: Prompt del agente.
- Salidas: Trace-only metadata.
- Dependencias: Gateway.
- Estado actual: Corregido documentalmente.
- Siguiente acción: Implementar control real si el modelo lo permite.

### Ruta ready duplicada

- Archivo o ámbito: integration health.
- Responsabilidad: Evitar dos contratos ambiguos.
- Entradas: Health URLs.
- Salidas: /health/ready canónico y ruta integrations separada.
- Dependencias: Routes.
- Estado actual: Corregido.
- Siguiente acción: Documentar en proxy.

### Secrets versionados

- Archivo o ámbito: backend/.env.
- Responsabilidad: Un secreto local estaba en índice.
- Entradas: Git index.
- Salidas: Archivo ignorado y fuera del índice.
- Dependencias: gitignore y git rm cached.
- Estado actual: Índice corregido; rotación pendiente.
- Siguiente acción: Rotar credenciales.

### Fallback changeme

- Archivo o ámbito: docker compose.
- Responsabilidad: Passwords por defecto no son aceptables.
- Entradas: Env ausente.
- Salidas: Startup failure.
- Dependencias: Docker Compose.
- Estado actual: Corregido a required env.
- Siguiente acción: Documentar bootstrap seguro.

### Migración sensible

- Archivo o ámbito: SensitiveApprovalRequest.
- Responsabilidad: Faltaba tabla para gobernanza.
- Entradas: Schema y servicio.
- Salidas: Migration SQL.
- Dependencias: Prisma.
- Estado actual: Añadida.
- Siguiente acción: Commit y deploy controlado.

### Bundle inicial grande

- Archivo o ámbito: frontend.
- Responsabilidad: Carga inicial innecesariamente pesada.
- Entradas: Todas las páginas eager.
- Salidas: Lazy route chunks.
- Dependencias: React.lazy y Suspense.
- Estado actual: Mejorado.
- Siguiente acción: Dividir chart y vendor.

### Suite completa sin DB

- Archivo o ámbito: test.
- Responsabilidad: No se puede verificar integración sin DB aislada.
- Entradas: DATABASE URL ausente.
- Salidas: Tests bloqueados.
- Dependencias: Prisma.
- Estado actual: Pendiente externo.
- Siguiente acción: Provisionar PostgreSQL de test.

### Historial de migraciones

- Archivo o ámbito: prisma.
- Responsabilidad: Archivos de migración sucios o no consolidados.
- Entradas: Git status y audit.
- Salidas: Release reproducible.
- Dependencias: Prisma audit.
- Estado actual: Advertencias pendientes.
- Siguiente acción: Revisar todas las migraciones.

### Audio real sin benchmark

- Archivo o ámbito: voice.
- Responsabilidad: No existe comparación repetible.
- Entradas: Llamadas reales y corpus.
- Salidas: Quality report.
- Dependencias: Voice engine.
- Estado actual: Pendiente.
- Siguiente acción: Crear benchmark ES.

### Latencia no cerrada

- Archivo o ámbito: voice.
- Responsabilidad: La arquitectura no demuestra p95.
- Entradas: Timestamps.
- Salidas: Latency report.
- Dependencias: Trace y metrics.
- Estado actual: Pendiente.
- Siguiente acción: Medir cold y warm.

### Consentimiento outbound

- Archivo o ámbito: campaign calls.
- Responsabilidad: No debe llamar sin base legal.
- Entradas: Lead status y consent.
- Salidas: Skip o call.
- Dependencias: ContactConsent y OptOut.
- Estado actual: Modelo disponible; enforcement por verificar.
- Siguiente acción: Convertir en precondición.

### Rollback no ensayado

- Archivo o ámbito: operations.
- Responsabilidad: Un release puede dejar DB incompatible.
- Entradas: Migration y artifact.
- Salidas: Restore path.
- Dependencias: Runbook.
- Estado actual: Pendiente.
- Siguiente acción: Ensayar staging.

### Licencias no cerradas

- Archivo o ámbito: open source.
- Responsabilidad: Open source no siempre significa uso comercial libre.
- Entradas: Models y dependencies.
- Salidas: License matrix.
- Dependencias: Model cards.
- Estado actual: Pendiente.
- Siguiente acción: Registrar versión y licencia.

### PII en trace

- Archivo o ámbito: privacy.
- Responsabilidad: Transcript y teléfono pueden filtrarse.
- Entradas: Trace payload.
- Salidas: Redacted event.
- Dependencias: VoiceTrace y logger.
- Estado actual: Pendiente.
- Siguiente acción: Redactor central.

### No hay supervisor de voz

- Archivo o ámbito: reliability.
- Responsabilidad: El motor puede fallar durante una llamada.
- Entradas: Engine error.
- Salidas: Fallback o handoff.
- Dependencias: Coordinator.
- Estado actual: Pendiente.
- Siguiente acción: Crear state machine de fallo.

### Concurrencia desconocida

- Archivo o ámbito: capacity.
- Responsabilidad: No se sabe cuántas sesiones soporta una GPU.
- Entradas: N calls.
- Salidas: Capacity ceiling.
- Dependencias: Load test.
- Estado actual: Pendiente.
- Siguiente acción: Benchmark por modelo.

## Flujos de negocio principales

Los siguientes flujos muestran cómo se combinan datos, servicios, voz y workers. El valor del sistema aparece cuando una llamada produce una acción comercial trazable y no cuando solo genera audio.

### Alta de organización

- Archivo o ámbito: Organization onboarding.
- Responsabilidad: Crear tenant, usuario y configuración inicial.
- Entradas: User signup y settings.
- Salidas: Organization, User y defaults.
- Dependencias: Auth, Organization y Settings.
- Estado actual: Flujo base.
- Siguiente acción: Añadir checklist de integraciones.

### Creación de agente

- Archivo o ámbito: Agent creation.
- Responsabilidad: Guardar agente con tipo, dirección, idioma y voz.
- Entradas: Formulario o API.
- Salidas: Agent scoped.
- Dependencias: Agents controller y service.
- Estado actual: Flujo corregido.
- Siguiente acción: Crear versión y prueba sintética.

### Llamada entrante

- Archivo o ámbito: Inbound call.
- Responsabilidad: Responder una llamada y clasificarla.
- Entradas: Twilio webhook y caller number.
- Salidas: Call, session, transcript y outcome.
- Dependencias: Telephony, voice coordinator y lead.
- Estado actual: Arquitectura disponible.
- Siguiente acción: Probar número real de staging.

### Llamada saliente

- Archivo o ámbito: Outbound call.
- Responsabilidad: Contactar lead autorizado.
- Entradas: Campaign, scheduler y consent.
- Salidas: Call SID y result.
- Dependencias: Lead dispatch, Twilio y agent.
- Estado actual: Arquitectura disponible.
- Siguiente acción: Implementar gates de horario.

### Calificación de lead

- Archivo o ámbito: Lead qualification.
- Responsabilidad: Convertir diálogo en campos y score.
- Entradas: Transcript y rubric.
- Salidas: Lead update, audit y next action.
- Dependencias: Sales brain y Leads service.
- Estado actual: Conceptual operativo.
- Siguiente acción: Definir schema de extracción.

### Reserva de cita

- Archivo o ámbito: Appointment booking.
- Responsabilidad: Crear reunión tras confirmar disponibilidad.
- Entradas: Intent, slots y timezone.
- Salidas: Meeting y confirmation.
- Dependencias: Meetings service.
- Estado actual: Disponible conceptualmente.
- Siguiente acción: Conectar calendar real.

### Transferencia

- Archivo o ámbito: Escalation.
- Responsabilidad: Pasar caso complejo a humano.
- Entradas: Risk, intent o request.
- Salidas: Transfer and task.
- Dependencias: Telephony, tasks y compliance.
- Estado actual: Parcial.
- Siguiente acción: Definir estados de handoff.

### Seguimiento

- Archivo o ámbito: Post-call follow-up.
- Responsabilidad: Crear tarea o secuencia tras la llamada.
- Entradas: Call outcome.
- Salidas: Task, ActionItem o enrollment.
- Dependencias: Calls, Tasks y sequence runner.
- Estado actual: Disponible.
- Siguiente acción: Evitar duplicados.

### Campaña outbound

- Archivo o ámbito: Campaign execution.
- Responsabilidad: Procesar audiencia con límites.
- Entradas: Campaign, leads y consent.
- Salidas: Calls, messages y metrics.
- Dependencias: Workers y providers.
- Estado actual: Parcial.
- Siguiente acción: Añadir pausa global.

### Webhook de lead

- Archivo o ámbito: Lead ingestion.
- Responsabilidad: Transformar evento externo en lead.
- Entradas: Provider webhook.
- Salidas: Lead y AcquisitionEvent.
- Dependencias: WebhookEvent y ingestion.
- Estado actual: Disponible.
- Siguiente acción: Probar replay.

### Sync de marketing

- Archivo o ámbito: Marketing sync.
- Responsabilidad: Importar métricas y actualizar panel.
- Entradas: Provider API.
- Salidas: Snapshots y KPIs.
- Dependencias: Workers y dashboard.
- Estado actual: Disponible.
- Siguiente acción: Mostrar frescura.

### Automatización

- Archivo o ámbito: Automation run.
- Responsabilidad: Disparar acciones por evento.
- Entradas: Trigger y version.
- Salidas: Run, step runs y outbox.
- Dependencias: Automation runner.
- Estado actual: Disponible.
- Siguiente acción: Aplicar límite y aprobación.

### Memoria operativa

- Archivo o ámbito: Operational memory.
- Responsabilidad: Proponer aprendizaje sin mutar directamente.
- Entradas: Signal y proposal.
- Salidas: Approval request o memory.
- Dependencias: Orchestration runtime.
- Estado actual: Parcial.
- Siguiente acción: Conectar revisión humana.

### Cierre de llamada

- Archivo o ámbito: Call closure.
- Responsabilidad: Persistir resultado de forma idempotente.
- Entradas: Hangup y final events.
- Salidas: Terminal Call y metrics.
- Dependencias: Session finalizer.
- Estado actual: Implementado en piezas.
- Siguiente acción: Probar doble cierre.

### Revisión de calidad

- Archivo o ámbito: Quality review.
- Responsabilidad: Evaluar llamada y alimentar experimento.
- Entradas: Trace y transcript.
- Salidas: Evaluation and defects.
- Dependencias: CallJudge.
- Estado actual: Disponible.
- Siguiente acción: Comparar con panel humano.

## Arquitecturas recomendadas para voz

El sistema puede soportar varias combinaciones. La selección debe basarse en latencia, naturalidad, idioma, coste, capacidad de personalización, licencias y complejidad operativa.

### Arquitectura A: pipeline modular local

- Archivo o ámbito: STT -> LLM -> TTS.
- Responsabilidad: Controlar cada componente y sustituir modelos.
- Entradas: Audio, transcript y context.
- Salidas: Respuesta con componentes intercambiables.
- Dependencias: Faster-Whisper, LLM local, Piper/Qwen3.
- Estado actual: La más práctica para producción incremental.
- Siguiente acción: Empezar aquí para aislar problemas.

### Arquitectura B: speech-to-speech dúplex

- Archivo o ámbito: Audio -> modelo dúplex -> audio.
- Responsabilidad: Reducir pasos y mejorar ritmo conversacional.
- Entradas: Audio continuo.
- Salidas: Audio y eventos de diálogo.
- Dependencias: Moshi/Personaplex-like o equivalente.
- Estado actual: Más cercana a GPT Live; mayor complejidad.
- Siguiente acción: Usarla como segunda línea de benchmark.

### Arquitectura C: híbrida

- Archivo o ámbito: STT local + LLM local + TTS local/remoto.
- Responsabilidad: Equilibrar control y calidad.
- Entradas: Audio y política de proveedor.
- Salidas: Respuesta híbrida.
- Dependencias: Engine factory y routers.
- Estado actual: Adecuada para comparar costes.
- Siguiente acción: Aislar datos y fallback.

### Arquitectura D: remoto para baseline

- Archivo o ámbito: Gateway remoto.
- Responsabilidad: Obtener referencia rápida de UX.
- Entradas: Session config y audio.
- Salidas: Audio de referencia.
- Dependencias: RemoteVoiceEngine.
- Estado actual: Útil para medir objetivo.
- Siguiente acción: No tomarla como solución self-hosted final.

### Arquitectura E: dos modos en paralelo

- Archivo o ámbito: Local y remoto con experiment assignment.
- Responsabilidad: Comparar por agente o llamada.
- Entradas: Variant assignment.
- Salidas: Metrics comparables.
- Dependencias: VoiceExperiment y trace.
- Estado actual: Recomendada para decisión.
- Siguiente acción: Definir corpus y distribución.

### Persona especializada española

- Archivo o ámbito: Fine-tuning o prompting.
- Responsabilidad: Adaptar vocabulario, prosodia y política.
- Entradas: Corpus consentido y rubrics.
- Salidas: Modelo o perfil español.
- Dependencias: Training pipeline y policy.
- Estado actual: Posible; no trivial.
- Siguiente acción: Empezar por datos y evaluación.

### Moshi-Call-EN personalizado

- Archivo o ámbito: Base inglesa adaptada.
- Responsabilidad: Explorar inglés especializado.
- Entradas: English corpus y tasks.
- Salidas: Modelo conversacional.
- Dependencias: Moshi-like runtime.
- Estado actual: Interesante para producto inglés.
- Siguiente acción: Verificar licencia y datos.

### Control de voz separado

- Archivo o ámbito: Speaker identity layer.
- Responsabilidad: Cambiar timbre sin cambiar lógica.
- Entradas: Voice profile.
- Salidas: Audio con voz seleccionada.
- Dependencias: TTS router o voice cloning.
- Estado actual: Fácil en modular; difícil en S2S puro.
- Siguiente acción: Mantener interfaz de speaker.

### Control de interactividad

- Archivo o ámbito: Turn policy layer.
- Responsabilidad: Ajustar backchannel, pause y barge-in.
- Entradas: Events, rubric y policy.
- Salidas: Turn decisions.
- Dependencias: Turn manager y alignment.
- Estado actual: Muy personalizable fuera del modelo.
- Siguiente acción: Medir antes de entrenar.

### Plan de benchmark

- Archivo o ámbito: Benchmark matrix.
- Responsabilidad: Comparar arquitecturas de forma objetiva.
- Entradas: Same calls, same prompts, same corpus.
- Salidas: Ranking por dimensión.
- Dependencias: Trace, judge y human eval.
- Estado actual: Necesario.
- Siguiente acción: Publicar p50/p95 y MOS.

## Ranking práctico de opciones

Para llamadas españolas autoalojadas, el ranking debe reflejar el riesgo de operación y no solo la demostración más espectacular. La solución modular local suele ganar por control; el speech-to-speech gana por potencial.

| Puesto | Opción | Latencia potencial | Calidad de voz | Personalización | Complejidad | Recomendación |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Pipeline modular local con STT, LLM y TTS | Alta si se optimiza | Alta con buen TTS | Muy alta | Media | Base de producción recomendada |
| 2 | Híbrido local con TTS o STT intercambiable | Alta | Muy alta en el componente externo | Alta | Media | Buen equilibrio para validar |
| 3 | Modelo dúplex tipo Moshi/PersonaPlex especializado | Muy alta en warm GPU | Potencialmente muy alta | Alta, pero difícil | Alta | Línea de I+D y benchmark |
| 4 | Gateway remoto como baseline | Dependiente de red | Alta | Media | Baja | Útil para referencia, no para requisito local |
| 5 | Pipeline CPU completo | Limitada | Variable | Alta | Baja | Solo prototipo o baja concurrencia |

La decisión final debe salir de una prueba con el mismo guion, el mismo ruido, el mismo idioma, la misma campaña y la misma rúbrica.

## Interacción bilingüe

La interfaz y la voz son capas relacionadas pero no idénticas. El operador puede usar inglés mientras el agente habla español, o definir agentes separados. La configuración debe evitar que el idioma del navegador sustituya al idioma de la llamada sin intención explícita.

### Idioma de UI

- Archivo o ámbito: i18n.
- Responsabilidad: Traducir menús, labels, errores y ayudas.
- Entradas: User preference o browser default.
- Salidas: Spanish or English UI.
- Dependencias: i18n dictionaries.
- Estado actual: Implementado.
- Siguiente acción: Detectar claves no traducidas.

### Idioma de llamada

- Archivo o ámbito: Agent.language.
- Responsabilidad: Controlar STT, prompt y TTS de una sesión.
- Entradas: Agent config.
- Salidas: Locale de session.
- Dependencias: Agent config, engine y trace.
- Estado actual: es-ES por defecto.
- Siguiente acción: Permitir en-US y otros locales validados.

### Prompt bilingüe

- Archivo o ámbito: Prompt policy.
- Responsabilidad: Mantener instrucciones del agente en idioma correcto.
- Entradas: Agent prompt y locale.
- Salidas: Prompt contextual.
- Dependencias: Sales brain y LLM.
- Estado actual: Parcial.
- Siguiente acción: Versionar prompt por locale.

### Voz compatible

- Archivo o ámbito: Voice catalog.
- Responsabilidad: Evitar voz inglesa para texto español.
- Entradas: Locale y voice id.
- Salidas: Validated profile.
- Dependencias: Voice profiles.
- Estado actual: Pendiente.
- Siguiente acción: Crear matriz locale-voice.

### Nombres y entidades

- Archivo o ámbito: Entity pronunciation.
- Responsabilidad: Pronunciar marcas, nombres y siglas.
- Entradas: Knowledge y pronunciation hints.
- Salidas: Audio más claro.
- Dependencias: TTS/lexicon.
- Estado actual: Pendiente.
- Siguiente acción: Añadir diccionario de pronunciación.

### Fallback de idioma

- Archivo o ámbito: Language fallback.
- Responsabilidad: Evitar sesión sin locale válido.
- Entradas: Invalid agent language.
- Salidas: Safe default.
- Dependencias: Engine factory.
- Estado actual: es-ES.
- Siguiente acción: Registrar fallback.

### Evaluación por idioma

- Archivo o ámbito: Locale evaluation.
- Responsabilidad: No mezclar scores de idiomas.
- Entradas: Call locale y rubric.
- Salidas: Comparable metrics.
- Dependencias: CallJudge.
- Estado actual: Pendiente.
- Siguiente acción: Separar datasets ES/EN.

### Detección de cambio

- Archivo o ámbito: Code switching.
- Responsabilidad: Decidir qué hacer si el usuario cambia de idioma.
- Entradas: STT language detection.
- Salidas: Stay, switch o ask.
- Dependencias: Turn manager y policy.
- Estado actual: Pendiente.
- Siguiente acción: Definir comportamiento explícito.

## Roadmap de implementación

La secuencia propuesta reduce riesgo y permite validar valor antes de invertir en entrenamiento complejo.

### Fase 0: higiene

- Archivo o ámbito: Secretos, migraciones y entorno.
- Responsabilidad: Cerrar base de operación.
- Entradas: Git, .env, Prisma y compose.
- Salidas: Repositorio seguro y reproducible.
- Dependencias: DevOps y backend.
- Estado actual: Parcial.
- Siguiente acción: Rotar credenciales y consolidar migraciones.

### Fase 1: contrato de voz

- Archivo o ámbito: Engine interface y events.
- Responsabilidad: Fijar límites entre backend y motor.
- Entradas: Session config y event schema.
- Salidas: Adapters sustituibles.
- Dependencias: Voice engine y trace.
- Estado actual: Parcial.
- Siguiente acción: Congelar JSON schema.

### Fase 2: baseline español

- Archivo o ámbito: Pipeline modular local.
- Responsabilidad: Tener una llamada completa en es-ES.
- Entradas: Twilio, STT, LLM, TTS.
- Salidas: Inbound y outbound básicos.
- Dependencias: Local engine y telephony.
- Estado actual: Siguiente hito.
- Siguiente acción: Probar una llamada real consentida.

### Fase 3: full dúplex

- Archivo o ámbito: VAD, partial STT y barge-in.
- Responsabilidad: Reducir sensación de turnos rígidos.
- Entradas: Audio continuo.
- Salidas: Interacción continua.
- Dependencias: Turn manager y gateway.
- Estado actual: En construcción.
- Siguiente acción: Medir TTFB y corte.

### Fase 4: agentes

- Archivo o ámbito: Tipos, políticas y herramientas.
- Responsabilidad: Diferenciar recepción, ventas y soporte.
- Entradas: Agent config y playbooks.
- Salidas: Comportamientos especializados.
- Dependencias: Agents, knowledge y governance.
- Estado actual: Modelo presente.
- Siguiente acción: Versionar prompts y herramientas.

### Fase 5: calidad

- Archivo o ámbito: Corpus, rúbricas y CallJudge.
- Responsabilidad: Comparar voces y modelos.
- Entradas: Golden set y human eval.
- Salidas: Quality report.
- Dependencias: Evaluation y experiments.
- Estado actual: Pendiente.
- Siguiente acción: Crear 100-300 casos iniciales.

### Fase 6: producción

- Archivo o ámbito: Observabilidad, backups y rollback.
- Responsabilidad: Recibir tráfico controlado.
- Entradas: Staging, TLS y monitoring.
- Salidas: Runbook probado.
- Dependencias: Ops y security.
- Estado actual: Pendiente.
- Siguiente acción: Ensayar despliegue completo.

### Fase 7: especialización

- Archivo o ámbito: Fine-tuning o alignment.
- Responsabilidad: Mejorar español e interactividad.
- Entradas: Corpus propio y feedback.
- Salidas: Modelo o policy especializada.
- Dependencias: Training pipeline.
- Estado actual: Investigación.
- Siguiente acción: No entrenar antes de medir baseline.

### Fase 8: escala

- Archivo o ámbito: Concurrencia y coste.
- Responsabilidad: Aumentar sesiones sin degradar.
- Entradas: Load tests y capacity.
- Salidas: SLO y cost per call.
- Dependencias: GPU, queue y autoscaling.
- Estado actual: Futuro.
- Siguiente acción: Definir objetivo de llamadas simultáneas.

## Criterios de aceptación

Un sistema completo no se considera listo porque una llamada responde. Debe cumplir criterios técnicos, lingüísticos, comerciales y operativos verificables.

### A1: autenticación

- Archivo o ámbito: Security.
- Responsabilidad: Solo usuarios válidos acceden.
- Entradas: Unauthorized requests.
- Salidas: 401/403 correctos.
- Dependencias: Auth middleware.
- Estado actual: Pendiente de regresión completa.
- Siguiente acción: Test automatizado.

### A2: aislamiento

- Archivo o ámbito: Security.
- Responsabilidad: Un tenant no ve datos de otro.
- Entradas: Cross-org ids.
- Salidas: 404/403 y sin side effects.
- Dependencias: All services.
- Estado actual: Pendiente de suite transversal.
- Siguiente acción: Test con dos organizaciones.

### A3: agente

- Archivo o ámbito: Configuration.
- Responsabilidad: Agente válido se guarda y recupera.
- Entradas: Strict payload.
- Salidas: Persisted config.
- Dependencias: Agents route/service.
- Estado actual: Parcial ya corregido.
- Siguiente acción: Test de campos extra.

### A4: inbound

- Archivo o ámbito: Telephony.
- Responsabilidad: Una llamada entrante llega al agente.
- Entradas: Twilio staging call.
- Salidas: Audio bidirectional.
- Dependencias: Twilio and coordinator.
- Estado actual: Pendiente real.
- Siguiente acción: Número de pruebas.

### A5: outbound

- Archivo o ámbito: Telephony.
- Responsabilidad: Solo llama a leads permitidos.
- Entradas: Consent, schedule and campaign.
- Salidas: Call or skip reason.
- Dependencias: Lead dispatch.
- Estado actual: Pendiente real.
- Siguiente acción: Test de consentimiento.

### A6: idioma

- Archivo o ámbito: Language.
- Responsabilidad: Agente español usa es-ES en todos los componentes.
- Entradas: Agent language.
- Salidas: STT/TTS/trace locale.
- Dependencias: Voice stack.
- Estado actual: Parcial.
- Siguiente acción: Assertion por evento.

### A7: interrupción

- Archivo o ámbito: Interaction.
- Responsabilidad: El usuario interrumpe al agente.
- Entradas: Speech during TTS.
- Salidas: TTS stops quickly.
- Dependencias: VAD and turn manager.
- Estado actual: Pendiente.
- Siguiente acción: Benchmark p95.

### A8: latencia

- Archivo o ámbito: Performance.
- Responsabilidad: Respuesta perceptiblemente ágil.
- Entradas: Controlled call.
- Salidas: TTFA within target.
- Dependencias: Trace and engine.
- Estado actual: Pendiente.
- Siguiente acción: Definir target por architecture.

### A9: voz

- Archivo o ámbito: Quality.
- Responsabilidad: Voz entendible y consistente.
- Entradas: Human panel.
- Salidas: MOS and no clipping.
- Dependencias: TTS and bridge.
- Estado actual: Pendiente.
- Siguiente acción: Panel español.

### A10: resultado

- Archivo o ámbito: CRM.
- Responsabilidad: Llamada actualiza lead o task correctamente.
- Entradas: Outcome event.
- Salidas: Single idempotent mutation.
- Dependencias: Calls and services.
- Estado actual: Parcial.
- Siguiente acción: Test duplicate close.

### A11: fallo

- Archivo o ámbito: Resilience.
- Responsabilidad: Proveedor caído produce fallback seguro.
- Entradas: Timeout or disconnect.
- Salidas: Retry, transfer or close.
- Dependencias: Coordinator and circuit breaker.
- Estado actual: Pendiente.
- Siguiente acción: Chaos test.

### A12: privacidad

- Archivo o ámbito: Compliance.
- Responsabilidad: PII y audio siguen política.
- Entradas: Trace and storage.
- Salidas: Redacted logs and retention.
- Dependencias: Privacy layer.
- Estado actual: Pendiente.
- Siguiente acción: Revisión legal.

### A13: operación

- Archivo o ámbito: Operations.
- Responsabilidad: Operador puede arrancar y parar.
- Entradas: Runbook procedure.
- Salidas: Repeatable deploy.
- Dependencias: Docker and workers.
- Estado actual: Pendiente.
- Siguiente acción: Rehearsal.

### A14: rollback

- Archivo o ámbito: Operations.
- Responsabilidad: Versión anterior se recupera.
- Entradas: Failed release.
- Salidas: Service restored.
- Dependencias: Artifacts and DB.
- Estado actual: Pendiente.
- Siguiente acción: Staging rollback.

### A15: costes

- Archivo o ámbito: Finance.
- Responsabilidad: Coste por minuto es conocido.
- Entradas: Usage metrics.
- Salidas: Cost report.
- Dependencias: Providers and GPU.
- Estado actual: Pendiente.
- Siguiente acción: Separar baseline y local.

## Checklist de arranque

Esta lista sirve para una sesión de prueba corta en un servidor alquilado o para un entorno de staging.

### Preparar servidor

- Archivo o ámbito: Infrastructure.
- Responsabilidad: Elegir CPU/GPU, región y duración.
- Entradas: Provider account.
- Salidas: Host reachable.
- Dependencias: Deployment docs.
- Estado actual: Pendiente por ejecución.
- Siguiente acción: Crear snapshot temporal.

### Preparar DNS

- Archivo o ámbito: Networking.
- Responsabilidad: Obtener URL pública HTTPS.
- Entradas: Domain and certificate.
- Salidas: Webhook URL.
- Dependencias: Reverse proxy.
- Estado actual: Pendiente.
- Siguiente acción: Verificar WSS.

### Preparar PostgreSQL

- Archivo o ámbito: Database.
- Responsabilidad: Crear DB de prueba.
- Entradas: DATABASE_URL.
- Salidas: Schema target.
- Dependencias: Prisma.
- Estado actual: Pendiente.
- Siguiente acción: Aplicar migrate deploy.

### Preparar secrets

- Archivo o ámbito: Security.
- Responsabilidad: Introducir secretos fuera del repo.
- Entradas: Secret manager or env.
- Salidas: Runtime config.
- Dependencias: Auth, Twilio y providers.
- Estado actual: Pendiente.
- Siguiente acción: Rotar al terminar.

### Descargar modelos

- Archivo o ámbito: Models.
- Responsabilidad: Precargar STT/TTS/LLM.
- Entradas: Model registry and cache.
- Salidas: Model files.
- Dependencias: Voice engine.
- Estado actual: Pendiente.
- Siguiente acción: Verificar hashes.

### Arrancar API

- Archivo o ámbito: Backend.
- Responsabilidad: Levantar servidor HTTP.
- Entradas: Env and DB.
- Salidas: Health response.
- Dependencias: Fastify.
- Estado actual: Disponible.
- Siguiente acción: Revisar logs de startup.

### Arrancar worker

- Archivo o ámbito: Async.
- Responsabilidad: Levantar procesamiento asíncrono.
- Entradas: Env and queue.
- Salidas: Worker heartbeat.
- Dependencias: Node worker.
- Estado actual: Disponible.
- Siguiente acción: Comprobar job de prueba.

### Arrancar voice engine

- Archivo o ámbito: Voice.
- Responsabilidad: Levantar gateway local.
- Entradas: GPU/CPU and model paths.
- Salidas: Session ready.
- Dependencias: Python gateway.
- Estado actual: Pendiente.
- Siguiente acción: Probar handshake.

### Configurar número

- Archivo o ámbito: Telephony.
- Responsabilidad: Apuntar webhook de Twilio.
- Entradas: Public URL and agent.
- Salidas: Inbound call route.
- Dependencias: Twilio.
- Estado actual: Pendiente.
- Siguiente acción: Validar firma.

### Crear agente ES

- Archivo o ámbito: Agent.
- Responsabilidad: Configurar recepción o ventas.
- Entradas: Type, direction, es-ES, voice.
- Salidas: Agent id.
- Dependencias: Agents API.
- Estado actual: Disponible.
- Siguiente acción: Guardar versión.

### Llamada controlada

- Archivo o ámbito: Call.
- Responsabilidad: Realizar prueba con consentimiento.
- Entradas: Test phone and script.
- Salidas: Transcript and audio.
- Dependencias: Full stack.
- Estado actual: Pendiente.
- Siguiente acción: Registrar timestamps.

### Evaluar

- Archivo o ámbito: Quality.
- Responsabilidad: Comparar con rúbrica.
- Entradas: Trace, transcript and audio.
- Salidas: Score and defects.
- Dependencias: CallJudge.
- Estado actual: Pendiente.
- Siguiente acción: Guardar benchmark.

### Apagar

- Archivo o ámbito: Cost.
- Responsabilidad: Parar servidor y workers.
- Entradas: Shutdown command.
- Salidas: No running resources.
- Dependencias: Provider console.
- Estado actual: Pendiente.
- Siguiente acción: Verificar facturación.

### Eliminar temporal

- Archivo o ámbito: Privacy.
- Responsabilidad: Borrar snapshots y audio de prueba.
- Entradas: Storage and logs.
- Salidas: Clean environment.
- Dependencias: Provider and DB.
- Estado actual: Pendiente.
- Siguiente acción: Conservar solo reporte anonimizado.

## Decisiones pendientes

Estas decisiones no deben quedar implícitas porque cambian coste, diseño y nivel de riesgo.

### Proveedor de telefonía

- Archivo o ámbito: Decision.
- Responsabilidad: Elegir Twilio u alternativa compatible.
- Entradas: Coste, cobertura y media streams.
- Salidas: Provider decision.
- Dependencias: Telephony adapter.
- Estado actual: Twilio está integrado.
- Siguiente acción: Comparar España y portabilidad.

### Modelo STT

- Archivo o ámbito: Decision.
- Responsabilidad: Elegir precisión y latencia para es-ES.
- Entradas: WER, GPU, licencia y streaming.
- Salidas: STT baseline.
- Dependencias: Voice engine.
- Estado actual: Hay adapters posibles.
- Siguiente acción: Benchmark con ruido telefónico.

### Modelo TTS

- Archivo o ámbito: Decision.
- Responsabilidad: Elegir voz base de producción.
- Entradas: MOS, TTFB, VRAM y licencia.
- Salidas: TTS baseline.
- Dependencias: Piper, Qwen3 o provider.
- Estado actual: Piper y Qwen3 disponibles.
- Siguiente acción: Medir tres voces.

### Modelo LLM

- Archivo o ámbito: Decision.
- Responsabilidad: Elegir razonamiento y coste.
- Entradas: Tokens, tool use y latency.
- Salidas: LLM baseline.
- Dependencias: Cerebras o local LLM.
- Estado actual: Adapter parcial.
- Siguiente acción: Definir structured output.

### Modelo dúplex

- Archivo o ámbito: Decision.
- Responsabilidad: Decidir si se invierte en S2S.
- Entradas: Naturalidad, entrenamiento y licencia.
- Salidas: Research path.
- Dependencias: Moshi-like stack.
- Estado actual: En investigación.
- Siguiente acción: No bloquear MVP modular.

### Servidor

- Archivo o ámbito: Decision.
- Responsabilidad: Elegir CPU/GPU y región.
- Entradas: VRAM, coste y disponibilidad.
- Salidas: Deployment profile.
- Dependencias: Ops.
- Estado actual: Pendiente.
- Siguiente acción: Alquilar por horas para benchmark.

### Retención de audio

- Archivo o ámbito: Decision.
- Responsabilidad: Guardar, cifrar o descartar.
- Entradas: Valor de debug y privacidad.
- Salidas: Retention policy.
- Dependencias: Telephony and storage.
- Estado actual: Pendiente.
- Siguiente acción: Default sin grabación.

### Transcripción visible

- Archivo o ámbito: Decision.
- Responsabilidad: Definir acceso de operadores.
- Entradas: PII y utilidad.
- Salidas: RBAC policy.
- Dependencias: Calls UI and auth.
- Estado actual: Pendiente.
- Siguiente acción: Redactar por rol.

### Fine-tuning

- Archivo o ámbito: Decision.
- Responsabilidad: Decidir cuándo entrenar.
- Entradas: Baseline, corpus y ROI.
- Salidas: Training plan.
- Dependencias: Models and evaluation.
- Estado actual: No ejecutar aún.
- Siguiente acción: Primero crear datos.

### Escalado humano

- Archivo o ámbito: Decision.
- Responsabilidad: Definir casos obligatorios.
- Entradas: Risk categories and SLA.
- Salidas: Handoff matrix.
- Dependencias: Compliance and telephony.
- Estado actual: Parcial.
- Siguiente acción: Aprobar con negocio.

### Modo inglés

- Archivo o ámbito: Decision.
- Responsabilidad: Decidir si se mantiene en paralelo.
- Entradas: Mercado, corpus y voces.
- Salidas: Locale roadmap.
- Dependencias: i18n and voice.
- Estado actual: Soportado a nivel de configuración.
- Siguiente acción: Crear benchmark EN separado.

### Open source estricto

- Archivo o ámbito: Decision.
- Responsabilidad: Definir qué significa en el proyecto.
- Entradas: Licenses and hosted dependencies.
- Salidas: Allowed stack.
- Dependencias: Dependency audit.
- Estado actual: Objetivo declarado.
- Siguiente acción: Crear allowlist de licencias.

## Referencias internas

La documentación existente complementa este mapa. Debe conservarse como detalle especializado, mientras este archivo funciona como índice técnico global.

### Arquitectura de plataforma

- Archivo o ámbito: docs/arquitectura-plataforma/.
- Responsabilidad: Decisiones generales de producto y módulos.
- Entradas: Arquitectura y ADRs.
- Salidas: Contexto de plataforma.
- Dependencias: Frontend, backend y Prisma.
- Estado actual: Referencia principal de producto.
- Siguiente acción: Mantener enlaces actualizados.

### Auditoría completa

- Archivo o ámbito: docs/AUDITORIA_COMPLETA_SISTEMA_2026-07-25.md.
- Responsabilidad: Hallazgos, riesgos y correcciones.
- Entradas: Estado del repositorio.
- Salidas: Lista priorizada de problemas.
- Dependencias: Auditoría y pruebas.
- Estado actual: Documento de control actual.
- Siguiente acción: Actualizar después de cada release.

### Production readiness

- Archivo o ámbito: docs/PRODUCTION_READINESS_MATRIX.md.
- Responsabilidad: Matriz de requisitos para producción.
- Entradas: Checks técnicos y operativos.
- Salidas: Readiness status.
- Dependencias: Ops y seguridad.
- Estado actual: Referencia de release.
- Siguiente acción: Convertir checks manuales en CI.

### Runbook de producción

- Archivo o ámbito: docs/PRODUCCION_RUNBOOK.md.
- Responsabilidad: Procedimientos de operación.
- Entradas: Deploy, health y rollback.
- Salidas: Pasos operativos.
- Dependencias: Docker, DB y workers.
- Estado actual: Referencia operativa.
- Siguiente acción: Añadir procedimiento de voice engine.

### Open source full duplex

- Archivo o ámbito: docs/VOZ_OPEN_SOURCE_FULL_DUPLEX.md.
- Responsabilidad: Opciones de modelos y arquitectura de voz.
- Entradas: Investigación open source.
- Salidas: Comparativa de engines.
- Dependencias: Voice architecture.
- Estado actual: Referencia de estrategia.
- Siguiente acción: Actualizar con benchmarks reales.

### Despliegue de voice engine

- Archivo o ámbito: docs/VOICE_ENGINE_DESPLIEGUE_OPCIONES.md.
- Responsabilidad: Opciones de servidor y ejecución.
- Entradas: GPU, Docker y proveedores.
- Salidas: Deployment choices.
- Dependencias: Voice engine.
- Estado actual: Referencia de infraestructura.
- Siguiente acción: Añadir coste por hora medido.

### Estado GPT Live open source

- Archivo o ámbito: docs/VOICE_ENGINE_OPENSOURCE_GPT_LIVE_ESTADO.md.
- Responsabilidad: Estado de interacción continua.
- Entradas: Moshi, Personaplex y alternativas.
- Salidas: Gap analysis.
- Dependencias: Voice research.
- Estado actual: Referencia de I+D.
- Siguiente acción: Separar hechos de hipótesis.

### Dos arquitecturas

- Archivo o ámbito: docs/VOICE_TWO_ARCHITECTURES_IMPLEMENTACION.md.
- Responsabilidad: Plan para probar pipeline y dúplex.
- Entradas: Engines y métricas.
- Salidas: Implementation plan.
- Dependencias: Voice engine y experiments.
- Estado actual: Referencia de comparación.
- Siguiente acción: Conectar con acceptance criteria.

### Este documento

- Archivo o ámbito: docs/SISTEMA_COMPLETO_VOZIA_2026-07-25.md.
- Responsabilidad: Mapa integral de todo el sistema.
- Entradas: Inventario y auditoría.
- Salidas: Visión única de arquitectura.
- Dependencias: Todos los dominios.
- Estado actual: Documento nuevo.
- Siguiente acción: Revisar cuando cambie el esquema.

## Glosario

Definiciones breves para mantener un vocabulario común entre producto, backend, voz y operaciones.

### Agent

- Definición: Entidad que configura objetivo, dirección, idioma, voz y reglas de un agente de voz.
- Dónde: Agent model y voice config.
- Nota: Evitar confundir agente con usuario humano.
- Recomendación: Usar agentId.

### Call

- Definición: Registro de una interacción telefónica.
- Dónde: Call model y calls service.
- Nota: Puede tener múltiples eventos y métricas.
- Recomendación: Usar callId.

### Full dúplex

- Definición: El sistema escucha y habla con solapamiento controlado.
- Dónde: Voice session y turn manager.
- Nota: No implica que dos respuestas semánticas se ejecuten a la vez.
- Recomendación: Medir barge-in.

### Interaction Loop

- Definición: Bucle continuo de audio, percepción, decisión y respuesta.
- Dónde: Gateway y coordinator.
- Nota: Es el núcleo de la experiencia tipo GPT Live.
- Recomendación: Versionar eventos.

### Barge-in

- Definición: Interrupción del agente por voz del usuario.
- Dónde: VAD y TTS cancellation.
- Nota: Debe parar la respuesta saliente.
- Recomendación: Registrar latencia.

### Backchannel

- Definición: Señal breve de escucha como mmm o sí.
- Dónde: Prosody y turn policy.
- Nota: No debe convertirse en ruido repetitivo.
- Recomendación: Evaluar adecuación.

### TTFA

- Definición: Tiempo desde decisión o texto hasta primer audio.
- Dónde: TTS y trace.
- Nota: Métrica perceptual de voz.
- Recomendación: Reportar p50 y p95.

### E2E latency

- Definición: Tiempo desde final de turno de usuario hasta primer audio del agente.
- Dónde: Trace completo.
- Nota: Incluye colas, LLM y TTS.
- Recomendación: Separar warm/cold.

### STT

- Definición: Speech to text, conversión de audio a texto.
- Dónde: Deepgram, Whisper u otro.
- Nota: Puede ser parcial o final.
- Recomendación: Registrar confidence.

### TTS

- Definición: Text to speech, conversión de texto a audio.
- Dónde: Piper, Qwen3 o provider.
- Nota: Puede tener streaming.
- Recomendación: Registrar provider y voice.

### VAD

- Definición: Voice activity detection, detección de voz.
- Dónde: Audio DSP.
- Nota: Determina turnos y barge-in.
- Recomendación: Calibrar ruido.

### AMD

- Definición: Answering machine detection.
- Dónde: Outbound telephony.
- Nota: Distingue humano y buzón.
- Recomendación: Registrar unknown.

### Outbox

- Definición: Patrón para publicar eventos después de commit.
- Dónde: OutboxEvent y dispatcher.
- Nota: Evita perder eventos.
- Recomendación: Reintentar con idempotencia.

### Idempotencia

- Definición: Repetir operación sin duplicar efecto.
- Dónde: Webhooks y workers.
- Nota: Clave para telefonía y campañas.
- Recomendación: Usar event id.

### Tenant

- Definición: Organización aislada dentro del sistema.
- Dónde: Organization y orgId.
- Nota: Límite de acceso principal.
- Recomendación: No aceptar orgId del cliente.

### Readiness

- Definición: Indica que el servicio puede recibir tráfico.
- Dónde: Health route.
- Nota: Puede fallar aunque el proceso esté vivo.
- Recomendación: Distinguir de liveness.

### Runbook

- Definición: Procedimiento operativo reproducible.
- Dónde: Docs de producción.
- Nota: Reduce errores durante incidentes.
- Recomendación: Probarlo en staging.

### Golden set

- Definición: Conjunto fijo de casos de evaluación.
- Dónde: Voice benchmark.
- Nota: Permite comparar versiones.
- Recomendación: Versionar corpus.

### MOS

- Definición: Mean Opinion Score de calidad percibida.
- Dónde: TTS evaluation.
- Nota: No sustituye métricas técnicas.
- Recomendación: Usar panel humano.

### WER

- Definición: Word Error Rate de transcripción.
- Dónde: STT evaluation.
- Nota: Debe medirse con referencia.
- Recomendación: Separar nombres propios.

### PII

- Definición: Información personal identificable.
- Dónde: Lead, call y transcript.
- Nota: Debe minimizarse y protegerse.
- Recomendación: Redactar logs.

### Handoff

- Definición: Transferencia a una persona o callback.
- Dónde: Telephony y tasks.
- Nota: Debe conservar contexto útil.
- Recomendación: Definir motivos.

### Prompt

- Definición: Instrucción de comportamiento del modelo.
- Dónde: Agent y LLM.
- Nota: No sustituye reglas duras.
- Recomendación: Versionar.

### Tool

- Definición: Acción que el agente puede solicitar.
- Dónde: Services y governance.
- Nota: Debe autorizarse por política.
- Recomendación: Usar allowlist.

### Fine-tuning

- Definición: Ajuste de parámetros con datos específicos.
- Dónde: Model training.
- Nota: No es primera solución para todos los problemas.
- Recomendación: Medir baseline antes.

### Alignment

- Definición: Ajuste de comportamiento según preferencias o feedback.
- Dónde: Interactivity research.
- Nota: Puede afectar turnos y seguridad.
- Recomendación: Evaluar regresiones.

## Conclusión operativa

El sistema ya tiene una base amplia y corregida en puntos importantes, pero la diferencia entre prototipo convincente y producto de llamadas fiable estará en los benchmarks, la operación y el control del ciclo de vida.

La ruta más segura es mantener el pipeline modular local como baseline, completar una llamada española de extremo a extremo, instrumentar cada transición y usar un segundo engine dúplex para comparar.

La voz puede cambiarse relativamente fácil cuando el TTS está separado de la lógica conversacional. La personalización también es alta en prompts, playbooks, idioma, herramientas, políticas y perfiles. En un modelo speech-to-speech monolítico, cambiar voz o comportamiento requiere más validación y puede afectar el equilibrio aprendido entre escucha, interrupción y respuesta.

La especialización española debe centrarse en datos telefónicos consentidos, pronunciación, nombres propios, silencios, backchannels, turnos y políticas de comunicación. Entrenar o alinear un modelo antes de disponer de una rúbrica y una baseline haría difícil demostrar una mejora real.

Para decidir con evidencia, la prueba mínima debe comparar dos agentes y dos modos de engine con las mismas llamadas, medir TTFA, E2E, barge-in, WER, MOS, transferencias, cumplimiento y coste por minuto.

El sistema completo queda descrito aquí como una plataforma multiempresa con CRM, automatización, marketing y voz. Las piezas más importantes para cerrar producción son: consolidar migraciones, rotar secretos históricos, desplegar una base de pruebas aislada, completar consentimiento outbound, medir latencia real, validar licencias, endurecer observabilidad y ensayar rollback.

Fin del documento.

