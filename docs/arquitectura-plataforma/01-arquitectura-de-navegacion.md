# Arquitectura de navegación

## Sidebar de primer nivel

El sidebar debe mostrar como máximo estas áreas, además del Dashboard:

1. Captación
2. Conversación
3. Nutrición
4. Ventas
5. Operaciones
6. IA
7. Analítica
8. Sistema

Cada área es colapsable. El estado de expansión se conserva por usuario. Si una ruta hija está activa, su área debe permanecer abierta.

## Registro de módulos

La navegación debe salir de una configuración única, por ejemplo `src/config/moduleRegistry.js`, y no de listas duplicadas en `App.jsx`, `Sidebar.jsx` y cada página.

```js
{
  id: 'seo',
  area: 'captacion',
  label: 'SEO',
  icon: RiSearchEyeLine,
  basePath: '/captacion/seo',
  capability: 'seo.read',
  views: ['overview', 'keywords', 'audits', 'rankings'],
  enabledByDefault: false,
}
```

El registro debe soportar `capability`, `featureFlag`, `requiredIntegration`, `views` y `children`.

## Rutas recomendadas

Las rutas son pocas y expresan contexto:

```text
/dashboard
/captacion/:module
/captacion/:module/:view
/captacion/:module/:id
/conversacion/inbox
/conversacion/:channel
/nutricion/:module
/ventas/:module
/ventas/:module/:id
/operaciones/:module
/ia/:module
/analitica/:view
/sistema/:module
```

Se pueden mantener alias de compatibilidad para las rutas actuales:

| Ruta actual | Destino conceptual |
| --- | --- |
| `/campanas` | `/captacion/campanas` |
| `/prospectos` | `/captacion/prospect-finder` |
| `/redes-sociales` | `/captacion/redes-sociales` |
| `/llamadas` | `/conversacion/llamadas` |
| `/agentes` | `/ia/agentes` o `/conversacion/agentes` según decisión de producto |
| `/playbooks` | `/conversacion/playbooks` |
| `/email-marketing` | `/nutricion/email` |
| `/automatizaciones` | `/nutricion/automatizaciones` |
| `/leads` | `/ventas/leads` |
| `/pipeline` | `/ventas/pipeline` |
| `/reuniones` | `/ventas/reuniones` |
| `/insights` | `/analitica/insights` |
| `/configuracion` | `/sistema/configuracion` |

No eliminar los alias hasta que los enlaces internos y favoritos hayan sido migrados.

## Catálogo de módulos

### Captación

Campañas, ADS, Prospect Finder, Redes Sociales, Landings, Funnels, SEO, Google Business, Scraping, Bases de datos, Eventos, Afiliados, Referidos, Audiencias, Formularios y Encuestas.

### Conversación

Inbox Unificado, Llamadas, WhatsApp, Chat Web, Instagram DM, Facebook Messenger, Telegram, SMS, Videollamadas, Agentes IA, Playbooks, Test de Voz, Plantillas, Transcripciones, Grabaciones y Sentimiento.

### Nutrición

Email Marketing, Automatizaciones, Secuencias, Newsletter, Lead Scoring, Remarketing, Audiencias dinámicas, Contenido IA, Campañas multicanal, Calendario editorial, Push y Centro de preferencias.

### Ventas

Leads, Contactos, Empresas, Oportunidades, Pipeline, Clientes, Reuniones, Presupuestos, Contratos, Facturación, Cobros, Productos, Catálogo, Objetivos, Comisiones y Firmas electrónicas.

### Operaciones

Centralita, Números, IVR, Colas, Horarios, Grabaciones, Calidad, Supervisión y Monitor en directo.

### IA

Agentes, Prompts, Modelos IA, Voces, Conocimiento, Memorias, Entrenamiento, Evaluaciones, Simulador, Agentes compartidos y Biblioteca IA.

### Analítica

Dashboard Ejecutivo, Insights, Embudos, Conversión, ROI, Atribución, Forecast, Objetivos, Rendimiento comercial, Informes y Exportaciones.

### Sistema

Configuración, Usuarios, Roles, Equipos, API, Webhooks, Integraciones, Marketplace, Logs, Auditoría, Facturación y Suscripción.

## Shell de módulo

Todos los módulos deben reutilizar un shell con:

- Breadcrumb y título.
- Descripción corta.
- Acciones primarias.
- Filtros y búsqueda.
- Tabs o subnavegación.
- Estado de carga, vacío y error.
- Lista, tabla, kanban o calendario según el caso.
- Modales de creación y edición.
- Exportación y vistas guardadas cuando aplique.

Crear `ModuleShell`, `ModuleHeader`, `ModuleTabs`, `DataView`, `EmptyState`, `ErrorState`, `FilterBar` y `RecordDrawer` antes de multiplicar pantallas.

## Estructura de una URL

Las URLs deben ser legibles, estables y compartibles dentro de la organización.

```text
/{area}/{module}?view={view}&page={page}&q={query}&status={status}
/{area}/{module}/{recordId}?tab={tab}
```

Reglas:

- Los nombres técnicos de rutas se escriben en kebab-case.
- Los identificadores reales no se sustituyen por nombres visibles.
- Los filtros que el usuario puede compartir viven en query params.
- El estado efímero de un modal no vive en la URL salvo que necesite deep-link.
- Una ruta desconocida muestra un 404 dentro del shell protegido, no una pantalla en blanco.
- Cambiar de tab no debe perder filtros de la lista si se vuelve atrás.

## Vistas por módulo

Cada módulo puede declarar estas vistas, pero no tiene que implementar todas:

| Vista | Uso | Ejemplo |
| --- | --- | --- |
| `overview` | Resumen de salud y acciones | resumen SEO |
| `list` | Gestión masiva | lista de formularios |
| `board` | Flujo por estados | pipeline de oportunidades |
| `calendar` | Planificación temporal | eventos/editorial |
| `inbox` | Trabajo en tiempo real | conversaciones |
| `editor` | Crear o configurar | formulario, agente, automatización |
| `detail` | Contexto de una entidad | empresa, oportunidad |
| `settings` | Configuración avanzada | integración, centralita |

Una vista puede ser un tab de otra y no necesariamente una ruta independiente.

## Regla de elección entre página, drawer y modal

| Necesidad | Solución |
| --- | --- |
| Consultar o editar un registro complejo | página de detalle |
| Revisar rápidamente un registro desde una lista | drawer lateral |
| Crear un registro de pocos campos | modal |
| Configurar un flujo de varios pasos | página/editor |
| Confirmar una acción destructiva | modal de confirmación |
| Ver una operación en tiempo real | vista dedicada o panel persistente |

## Command palette

Implementar un punto de entrada global con `Ctrl/Cmd + K` que permita:

- Navegar a módulos y vistas.
- Crear entidades comunes.
- Buscar contactos, empresas, leads y oportunidades.
- Ejecutar acciones autorizadas.
- Mostrar comandos recientes.

El command palette debe filtrar por permiso y feature flag. No debe convertirse en una segunda navegación con acciones que el usuario no puede ejecutar.

## Menú Crear

El botón universal `Crear` debe mostrar solo acciones disponibles para el contexto actual. En una ficha de empresa, por ejemplo, prioriza crear actividad, lead, oportunidad, conversación o tarea; en Captación prioriza campaña, audiencia, formulario o landing.
