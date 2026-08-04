# Guía funcional de la plataforma, página por página

> Esta es la guía rápida de orientación. Para la ficha operativa completa de cada pantalla —datos, estados, permisos, APIs, dependencias, riesgos y checklist— consulta la [documentación detallada por dominio](#documentación-detallada-por-dominio).

## Para quién es esta guía

Está escrita para una persona que conoce el propósito general del sistema, pero nunca ha navegado esta instancia. No describe sólo componentes técnicos: explica qué problema de negocio resuelve cada página, qué información necesita y qué resultado produce.

## Mapa mental rápido

La plataforma sigue este recorrido:

```text
Captar demanda → Conversar → Cualificar → Gestionar oportunidad → Reunirse → Medir y mejorar
      Ads / Organic / Prospect Finder / Campañas
                         ↓
              Inbox / Llamadas / Agentes IA
                         ↓
                 Leads / Pipeline / Reuniones
                         ↓
             Insights / Growth / Inteligencia comercial
```

Las páginas de Sistema gobiernan permisos, conocimiento, configuración, auditoría y recetas operativas.

## Páginas principales de la sidebar

### Dashboard — `/dashboard`

- **Problema que resuelve:** empezar el día sin tener que abrir cada módulo para saber qué está pasando.
- **Qué se consulta:** actividad, volumen de leads, llamadas, pipeline, reuniones y señales comerciales.
- **Qué se obtiene:** una visión general para decidir dónde actuar primero.
- **Quién la usa:** cualquier usuario operativo con permiso `dashboard.read`.

### Captación

| Página | Problema que resuelve | Qué hace el usuario | Resultado |
|---|---|---|---|
| **Campañas** — `/campanas` | Organizar acciones de captación sin perder agente, playbook, landing ni resultados | Crea/revisa campañas, objetivos, fechas, agente, presupuesto y seguimiento | Una campaña operativa con leads, llamadas y reuniones atribuibles |
| **Ads** — `/ads` | Gestionar publicidad de pago sin separar estrategia, configuración y rendimiento | Revisa cuentas Meta, campañas, anuncios, presupuestos e insights | Campañas Ads controladas y métricas de rendimiento |
| **Redes sociales** — `/redes-sociales` | Publicar en varios canales sin entrar manualmente en cada red | Conecta redes y trabaja publicaciones/programación mediante Metricool | Contenido distribuido y estado de publicación centralizado |
| **Prospect Finder** — `/prospectos` | Encontrar empresas o contactos nuevos cuando el CRM todavía no tiene suficiente mercado | Busca, filtra, revisa y puede importar prospectos | Nuevos prospectos incorporables al flujo comercial; puede requerir coste/aprobación |
| **Landings & webs** — `/landings` | Convertir una campaña o servicio en una página pública con una acción clara | Crea/revisa landings, formularios, slug y contenido | URL pública que captura demanda y puede atribuir conversiones |
| **Funnels** — `/funnels` | Visualizar dónde se pierden los contactos entre captación y venta | Configura pasos, entradas y conversiones del funnel | Diagnóstico de fugas y puntos de mejora |
| **Organic Leads** — `/organic` | Descubrir búsquedas orgánicas con intención comercial y convertirlas en oportunidades | Conecta Google, descubre propiedades, selecciona una fuente y sincroniza Search Console | Oportunidades orgánicas reales, activos sugeridos y valor potencial sin métricas inventadas |

### Conversación

| Página | Problema que resuelve | Qué hace el usuario | Resultado |
|---|---|---|---|
| **Inbox** — `/conversacion/inbox` | Tener conversaciones repartidas entre canales y perder contexto | Atiende, responde, asigna y revisa conversaciones | Historial centralizado y siguiente acción para cada contacto |
| **Llamadas** — `/llamadas` | No saber qué llamadas ocurrieron, qué se dijo o qué seguimiento falta | Filtra llamadas, consulta transcripciones/resúmenes y revisa resultados | Registro de actividad y tareas comerciales derivadas |
| **Agentes IA** — `/agentes` | Escalar llamadas y cualificación sin que todo dependa de un vendedor | Configura agentes, rol, personalidad, voz, prompt y límites | Agentes listos para operar con una campaña o flujo |
| **Playbooks** — `/playbooks` | Hacer que cada agente o vendedor improvise el proceso comercial | Define guiones, criterios, objeciones y pasos de conversación | Comportamiento comercial repetible y auditable |
| **Test de Voz** — `/voz/test` | Detectar problemas de voz antes de poner un agente en producción | Prueba audio, conexión y comportamiento del agente | Validación rápida de experiencia y configuración de voz |

### Nutrición

| Página | Problema que resuelve | Qué hace el usuario | Resultado |
|---|---|---|---|
| **Email marketing** — `/email-marketing` | Hacer seguimiento manual a contactos que aún no están listos para comprar | Revisa campañas, entregas, cumplimiento y métricas | Secuencias de nutrición medibles, normalmente apoyadas en Mautic |
| **Automatizaciones** — `/automatizaciones` | Depender de tareas manuales para mover un lead o activar un seguimiento | Configura disparadores, condiciones, acciones, horarios y journeys | Ejecuciones repetibles con trazabilidad y estados de error |

### Growth

| Página | Problema que resuelve | Qué hace el usuario | Resultado |
|---|---|---|---|
| **Growth Hub** — `/growth` | Tener experimentos, programas y acciones de crecimiento dispersos | Revisa programas, hipótesis, acciones, métricas y automatizaciones | Iniciativas de crecimiento priorizadas y medibles |

### Ventas

| Página | Problema que resuelve | Qué hace el usuario | Resultado |
|---|---|---|---|
| **Leads** — `/leads` | Perder contactos, fuente de adquisición, estado o responsable | Busca, filtra, edita y consulta la ficha del lead | Registro comercial centralizado y trazable |
| **Pipeline** — `/pipeline` | No saber qué oportunidades están abiertas, bloqueadas o a punto de cerrarse | Mueve oportunidades, revisa valor, etapa, propietario y actividad | Forecast y control de la cartera comercial |
| **Reuniones** — `/reuniones` | Perder citas, contexto o próximos pasos después de una llamada | Consulta agenda, detalle, asistentes y resultado | Reuniones coordinadas y conectadas con leads/pipeline |
| **Inteligencia comercial** — `/inteligencia-comercial` | Tener datos del CRM sin saber qué decisión tomar después | Revisa señales, acciones recomendadas, memoria, experimentos y revenue intelligence | Próxima mejor acción y decisiones comerciales justificadas |

### Sistema

| Página | Problema que resuelve | Qué hace el usuario | Resultado |
|---|---|---|---|
| **Insights** — `/insights` | Ver actividad sin detectar tendencias, anomalías o rendimiento | Consulta análisis agregados y señales del negocio | Diagnóstico para priorizar mejoras |
| **Knowledge Base** — `/knowledge-base` | Que agentes y equipo trabajen con información desactualizada o dispersa | Carga, organiza y consulta artículos/conocimiento | Fuente común para agentes y operación |
| **Configuración** — `/configuracion` | Tener preferencias, organización e integraciones repartidas o sin control | Ajusta perfil, organización, preferencias y conexiones permitidas | Entorno configurado y límites visibles |
| **Gobierno empresarial** — `/gobierno-empresarial` | Cambiar políticas, memoria, riesgos o experimentos sin control | Revisa gobierno, aprobaciones, auditoría y políticas | Cambios sensibles controlados y trazables |
| **Control de accesos** — `/access-control` | Dar demasiado o demasiado poco acceso a cada persona | Administra roles, permisos, solicitudes y scopes | Acceso mínimo necesario con decisiones de servidor |
| **Recetas Ads** — `/admin/ad-playbooks` | Crear anuncios desde cero sin consistencia ni controles de marca | Administra plantillas, recetas y reglas globales de anuncios | Biblioteca reutilizable para campañas Ads |

## Rutas que no son una página principal de sidebar

Estas rutas forman parte de flujos concretos o de acceso público:

| Ruta | Para qué sirve |
|---|---|
| `/login` | Autenticación de usuarios |
| `/l/:slug` | Ver una landing pública por slug |
| `/campanas/compartir/:token` | Ver una campaña mediante enlace compartido |
| `/privacidad` y `/terminos` | Información legal antes o después del acceso |
| `/agentes/:id` | Detalle y configuración de un agente |
| `/leads/:id` | Ficha completa de un lead |
| `/campanas/:id` | Detalle y configuración de campaña |
| `/llamadas/:id` | Detalle de una llamada |
| `/reuniones/:id` | Detalle de una reunión |
| `/automatizaciones/:id` | Detalle de una automatización |
| `/knowledge-base/articulos/:id` | Lectura/edición de un artículo |
| `/playbooks/:id` | Detalle de playbook |
| `/pipeline/:id` | Detalle de oportunidad |
| `/captacion/conectar` | Conexión de cuenta Meta y retorno de OAuth |
| `/captacion/nueva` | Wizard de creación de campaña/Ads |

## Cómo se relacionan las páginas

### Ejemplo de captación de pago

1. **Ads** configura la cuenta, campaña y anuncio.
2. **Landings & webs** ofrece la página de destino.
3. **Leads** recibe el contacto con fuente/campaña.
4. **Inbox**, **Llamadas** o **Agentes IA** hacen el primer contacto.
5. **Pipeline** registra la oportunidad y su etapa.
6. **Reuniones** agenda la conversación comercial.
7. **Insights** e **Inteligencia comercial** indican qué mejorar.

### Ejemplo de captación orgánica

1. **Organic Leads** conecta Search Console, GA4 o GBP.
2. Descubre búsquedas y propiedades reales.
3. Crea oportunidades orgánicas y borradores de activos.
4. **Landings & webs** o **Campañas** convierten la oportunidad en una superficie comercial.
5. **Leads** y **AcquisitionEvent** permiten atribuir el resultado.
6. **Pipeline**, **Reuniones** e **Insights** completan el ciclo.

### Ejemplo de operación con IA y automatización

1. **Knowledge Base** contiene la información autorizada.
2. **Playbooks** define cómo usarla en una conversación.
3. **Agentes IA** ejecuta el comportamiento.
4. **Llamadas/Inbox** almacenan el resultado.
5. **Automatizaciones** crean seguimiento.
6. **Gobierno empresarial** y **Control de accesos** delimitan quién puede cambiarlo.

## Diferencia entre “página implementada” y “flujo operativo completo”

Que exista una ruta no significa que todas sus dependencias estén activas. Una página puede estar implementada y seguir necesitando:

- credenciales de proveedor;
- una migración Prisma aplicada;
- workers, Redis o webhooks activos;
- permisos concretos;
- datos reales para dejar de mostrar estados vacíos;
- validación de staging y pruebas de integración.

Para el detalle técnico de esas diferencias, consulta [02-secciones-frontend.md](./02-secciones-frontend.md), [03-backend-api.md](./03-backend-api.md) y [04-permisos-seguridad-integraciones.md](./04-permisos-seguridad-integraciones.md).

## Documentación detallada por dominio

Las siguientes fichas amplían cada entrada de la sidebar y las rutas auxiliares. Están pensadas para que una persona nueva en esta instancia pueda entender qué hace la página, cuándo usarla, qué necesita para funcionar y cómo comprobar que el flujo terminó correctamente.

- [Captación y Organic Leads](./detalle/01-captacion.md): Dashboard, Campañas, Ads, Redes sociales, Prospect Finder, Landings & webs, Funnels y Organic Leads.
- [Conversación, Nutrición y Growth](./detalle/02-conversacion-nutricion-growth.md): Inbox, Llamadas, Agentes IA, Playbooks, Test de Voz, Email marketing, Automatizaciones y Growth Hub.
- [Ventas y Sistema](./detalle/03-ventas-sistema.md): Leads, Pipeline, Reuniones, Inteligencia comercial, Insights, Knowledge Base, Configuración, Gobierno empresarial, Control de accesos y Recetas Ads.
- [Rutas auxiliares y flujos](./detalle/04-rutas-auxiliares-y-flujos.md): login, páginas públicas, campañas compartidas, fichas de detalle, OAuth de Meta, wizard de nueva campaña y 404.

Cada ficha usa la misma estructura: problema de negocio, usuario y permiso, ruta y precondiciones, estructura visual, entradas y salidas, acciones, estados de carga/vacío/error, APIs y modelos, proveedores externos, navegación relacionada, riesgos o pendientes y checklist de aceptación.
