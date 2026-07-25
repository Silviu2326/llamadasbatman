# Navegación completa y Sidebar actual

**Fecha de revisión:** 22 de julio de 2026  
**Alcance:** navegación React, sidebar, visibilidad por permisos, rutas públicas/protegidas y diferencias entre menú y router.  
**Estado:** inventario de la implementación actual; no modifica la arquitectura ni añade rutas.

## 1. Fuentes revisadas

La implementación actual se ha contrastado con:

- [`src/components/Sidebar.jsx`](../../src/components/Sidebar.jsx): definición visual de la sidebar, grupos, elementos, colapsado y navegación.
- [`src/lib/navigationPermissions.js`](../../src/lib/navigationPermissions.js): permisos de lectura, alias de roles, fallback de permisos y requisitos por ruta.
- [`src/App.jsx`](../../src/App.jsx): rutas React Router públicas, protegidas, de detalle y administrativas.
- [`src/components/ProtectedRoute.jsx`](../../src/components/ProtectedRoute.jsx): shell autenticado y comportamiento responsive de la sidebar.
- [`src/components/AdminRoute.jsx`](../../src/components/AdminRoute.jsx): protección adicional de rutas administrativas.
- [`backend/src/access-control/catalog.ts`](../../backend/src/access-control/catalog.ts): catálogo backend de roles y permisos, usado como referencia de autoridad para autorización.
- [`docs/arquitectura-plataforma/01-arquitectura-de-navegacion.md`](../arquitectura-plataforma/01-arquitectura-de-navegacion.md): arquitectura objetivo de áreas, módulos y aliases.
- [`docs/arquitectura-plataforma/03-guia-de-implementacion.md`](../arquitectura-plataforma/03-guia-de-implementacion.md): responsabilidades previstas para `App`, `Sidebar` y `ProtectedRoute`.
- [`docs/arquitectura-plataforma/05-criterios-de-aceptacion.md`](../arquitectura-plataforma/05-criterios-de-aceptacion.md): criterios objetivo para navegación, permisos y rutas.
- [`docs/arquitectura-plataforma/09-permisos-seguridad-y-multi-tenant.md`](../arquitectura-plataforma/09-permisos-seguridad-y-multi-tenant.md): modelo de roles, scopes y defensa frontend/backend.
- [`docs/AUDITORIA_SIDEBAR_ACCESOS_RBAC.md`](../AUDITORIA_SIDEBAR_ACCESOS_RBAC.md): auditoría histórica de accesos y remediaciones previas.

## 2. Estructura visible de la Sidebar

La sidebar muestra `Dashboard` como entrada fija, fuera de cualquier grupo, y después filtra seis grupos funcionales. Los grupos se renderizan solo si conservan al menos un elemento visible para el usuario.

### 2.1 Dashboard fijo

| Elemento | Ruta | Permiso de visibilidad |
| --- | --- | --- |
| Dashboard | [`/dashboard`](../../src/App.jsx#L61) | `dashboard.read` |

La definición está en `DASHBOARD_ITEM` dentro de [`Sidebar.jsx`](../../src/components/Sidebar.jsx#L17). Se comprueba por separado con `canNavigateTo` antes de renderizarlo.

### 2.2 Captación

| Elemento | Ruta real | Permiso de visibilidad |
| --- | --- | --- |
| Campañas | [`/campanas`](../../src/App.jsx#L62) | `campaigns.read` |
| Ads | [`/ads`](../../src/App.jsx#L90) | `ads.read` |
| Redes sociales | [`/redes-sociales`](../../src/App.jsx#L87) | `social.read` |
| Prospect Finder | [`/prospectos`](../../src/App.jsx#L84) | `leads.write` **y** `costs.request` |
| Landings & webs | [`/landings`](../../src/App.jsx#L63) | `campaigns.read` |
| Funnels | [`/funnels`](../../src/App.jsx#L91) | `funnels.read` |
| Organic Leads | [`/organic`](../../src/App.jsx#L85) | `organic.read` |

La sección está declarada como `captacion` en [`Sidebar.jsx`](../../src/components/Sidebar.jsx#L19).

### 2.3 Conversación

| Elemento | Ruta real | Permiso de visibilidad |
| --- | --- | --- |
| Inbox | [`/conversacion/inbox`](../../src/App.jsx#L92) | `conversations.read` |
| Llamadas | [`/llamadas`](../../src/App.jsx#L64) | `calls.read` |
| Agentes IA | [`/agentes`](../../src/App.jsx#L66) | `agents.read` |
| Playbooks | [`/playbooks`](../../src/App.jsx#L69) | `playbooks.read` |
| Test de Voz | [`/voz/test`](../../src/App.jsx#L83) | `agents.read` |

La sección está declarada como `conversacion` en [`Sidebar.jsx`](../../src/components/Sidebar.jsx#L37). `Test de Voz` comparte el permiso de lectura de agentes porque no existe un permiso de navegación independiente en el mapa actual.

### 2.4 Nutrición

| Elemento | Ruta real | Permiso de visibilidad |
| --- | --- | --- |
| Email marketing | [`/email-marketing`](../../src/App.jsx#L88) | `campaigns.read` |
| Automatizaciones | [`/automatizaciones`](../../src/App.jsx#L71) | `automations.read` |

La sección está declarada como `nutricion` en [`Sidebar.jsx`](../../src/components/Sidebar.jsx#L49). Email marketing reutiliza el permiso de campañas; no tiene todavía un permiso específico de email en la navegación frontend.

### 2.5 Growth

| Elemento | Ruta real | Permiso de visibilidad |
| --- | --- | --- |
| Growth Hub | [`/growth`](../../src/App.jsx#L93) | `growth.read` |

La sección está declarada como `growth` en [`Sidebar.jsx`](../../src/components/Sidebar.jsx#L58). Es una diferencia con la arquitectura objetivo, que separa Operaciones, IA y Analítica y no define Growth como área de primer nivel.

### 2.6 Ventas

| Elemento | Ruta real | Permiso de visibilidad |
| --- | --- | --- |
| Leads | [`/leads`](../../src/App.jsx#L65) | `leads.read` |
| Pipeline | [`/pipeline`](../../src/App.jsx#L67) | `pipeline.read` |
| Reuniones | [`/reuniones`](../../src/App.jsx#L68) | `meetings.read` |
| Inteligencia comercial | [`/inteligencia-comercial`](../../src/App.jsx#L94) | cualquiera de `leads.read`, `experiments.read` o `memory.read` |

La sección está declarada como `ventas` en [`Sidebar.jsx`](../../src/components/Sidebar.jsx#L63). Inteligencia comercial usa una regla `anyOf`, a diferencia del resto de entradas que normalmente exige un permiso o todos los permisos declarados.

### 2.7 Sistema

| Elemento | Ruta real | Permiso de visibilidad |
| --- | --- | --- |
| Insights | [`/insights`](../../src/App.jsx#L70) | `dashboard.read` |
| Knowledge Base | [`/knowledge-base`](../../src/App.jsx#L72) | `knowledge.read` |
| Configuración | [`/configuracion`](../../src/App.jsx#L73) | `organization.read` |
| Gobierno empresarial | [`/gobierno-empresarial`](../../src/App.jsx#L95) | `governance.read` |
| Control de accesos | [`/access-control`](../../src/App.jsx#L96) | `access_control.read` |
| Recetas Ads | [`/admin/ad-playbooks`](../../src/App.jsx#L97) | `playbooks.manage_global` |

La sección está declarada como `sistema` en [`Sidebar.jsx`](../../src/components/Sidebar.jsx#L73). `Insights` reutiliza `dashboard.read`; no existe un permiso `insights.read` en el mapa frontend.

## 3. Comportamiento de la Sidebar

### Renderizado y visibilidad

1. `Sidebar` obtiene `user` desde `AuthContext`.
2. `filterNavigationSections(user, SECTIONS)` aplica el requisito de cada ruta.
3. Se eliminan los elementos que no cumplen el permiso.
4. Se eliminan los grupos que quedan vacíos.
5. `Dashboard` se calcula por separado mediante `canNavigateTo`.

La lógica está en [`navigationPermissions.js`](../../src/lib/navigationPermissions.js#L212-L222). Es una capa de UX: el servidor sigue siendo la autoridad para autorizar las APIs y las mutaciones.

### Secciones colapsables

- Cada grupo tiene un botón con `aria-expanded` y `aria-controls`.
- El estado se almacena en `localStorage` con la clave `vozia_sidebar_collapsed`.
- Si la URL actual empieza por la ruta de alguno de los elementos del grupo, el grupo se mantiene abierto aunque estuviera colapsado.
- La detección de activo usa `location.pathname.startsWith(item.to)`.

### Shell protegido y móvil

[`ProtectedRoute.jsx`](../../src/components/ProtectedRoute.jsx#L8-L25) contiene la sidebar dentro del shell autenticado. Además:

- redirige a `/login` si no hay token;
- cierra la sidebar al cambiar de ruta;
- permite abrirla desde el encabezado móvil;
- cierra con `Escape` y devuelve el foco al botón de apertura;
- ofrece backdrop para cerrar en móvil.

### Identidad y pie de sidebar

La implementación actual muestra:

- marca `VozIA` y subtítulo `AI Voice Revenue Platform`;
- estado del sistema, actualmente con texto de disponibilidad no conectada a una métrica;
- uso de llamadas IA, actualmente con texto de disponibilidad no conectada a una fuente de consumo;
- usuario actual, email, acceso a `/configuracion` y cierre de sesión.

## 4. Modelo de permisos de visibilidad

### Orden de resolución

[`getEffectiveNavigationPermissions`](../../src/lib/navigationPermissions.js#L193-L202) resuelve permisos así:

1. Busca permisos explícitos en `user.permissions`, `effectivePermissions`, `grantedPermissions`, `permissionKeys`, `access.permissions`, `authorization.permissions` o `rolePermissions`.
2. Si encuentra cualquiera de esas propiedades, usa exclusivamente esa lista explícita.
3. Si no existe una lista explícita, normaliza `user.role`, `user.roleKey` o `user.access.role`.
4. Aplica `ROLE_FALLBACK_PERMISSIONS`.
5. Si el rol no existe, devuelve un conjunto vacío: comportamiento deny-by-default.

Los requisitos de navegación son una tabla exacta por ruta en [`NAVIGATION_REQUIREMENTS`](../../src/lib/navigationPermissions.js#L116-L190). No hay resolución por prefijo ni por una jerarquía de rutas.

### Alias de roles

Los alias se normalizan antes de buscar el fallback:

| Alias aceptado | Rol normalizado |
| --- | --- |
| `administrator`, `administrador` | `admin` |
| `propietario` | `owner` |
| `owner_admin` | `admin` |
| `revenue-ops`, `revenueops` | `revenue_ops` |
| `sales-manager`, `salesmanager` | `sales_manager` |
| `sales-rep`, `salesrep` | `sales_rep` |
| `marketing`, `marketing-growth`, `marketinggrowth` | `marketing_growth` |
| `analista` | `analyst` |
| `cumplimento` | `compliance` |
| `finance-controller`, `financecontroller`, `finanzas` | `finance_controller` |
| `invitado` | `guest` |
| `lector` | `viewer` |

### Roles fallback y efecto visible

La siguiente tabla resume el fallback frontend actual. No sustituye a los permisos explícitos entregados por backend.

| Rol | Capacidades de navegación destacadas |
| --- | --- |
| `owner` | Todas las lecturas de `READ_PERMISSIONS`, además de `leads.write` y `costs.request`; ve todos los elementos actuales de la sidebar, incluido Gobierno, Control de accesos y Recetas Ads. |
| `admin` | Negocio completo de `BUSINESS_READ`, Organic, organización, integraciones, control de accesos y recetas globales; no incluye `governance.read` en el fallback, aunque la ruta de Gobierno tiene un guard adicional por rol. |
| `revenue_ops` | Negocio completo, Organic, organización, integraciones, control de accesos, escritura de leads y solicitud de costes; no incluye Gobierno en el fallback. |
| `sales_manager` | Dashboard, Inbox, Llamadas, Playbooks, Leads, Pipeline, Reuniones, Inteligencia comercial, Knowledge Base, Configuración y Control de accesos. |
| `sales_rep` | Dashboard, Inbox, Llamadas, Playbooks, Leads, Pipeline, Reuniones y Knowledge Base. |
| `marketing_growth` | Captación completa, Organic, Prospect Finder, Agentes IA, Playbooks, Email marketing, Automatizaciones, Growth, Leads, Inteligencia comercial y Knowledge Base. |
| `analyst` | Dashboard, Campañas, Ads, Redes sociales, Landings, Funnels, Organic, Pipeline, Growth, Inteligencia comercial, Insights y Configuración. |
| `compliance` | Dashboard, Campañas, Organic, Inbox, Llamadas, Playbooks, Leads, Inteligencia comercial, Knowledge Base, Configuración, Gobierno y Control de accesos. |
| `finance_controller` | Dashboard, Campañas, Ads, Organic, Growth, Inteligencia comercial, Insights y Configuración. |
| `guest` | Solo Dashboard. |
| `agent` (legacy) | `BUSINESS_READ`, organización, integraciones, control de accesos, escritura de leads y solicitud de costes; no obtiene `organic.read` en el fallback actual. |
| `viewer` (legacy) | `BUSINESS_READ` y organización; no obtiene Organic ni permisos administrativos. |

## 5. Rutas reales declaradas en `App.jsx`

### Rutas públicas

Estas rutas están fuera de `ProtectedRoute` y no aparecen en la sidebar:

| Ruta | Página | Uso |
| --- | --- | --- |
| `/login` | `LoginPage` | Inicio de sesión |
| `/l/:slug` | `PublicLandingPage` | Landing pública |
| `/campanas/compartir/:token` | `PublicCampaignSharePage` | Compartir una campaña públicamente |
| `/privacidad` | `PrivacyPage` | Política de privacidad |
| `/terminos` | `TermsPage` | Términos |

### Rutas protegidas de primer nivel

Estas rutas requieren sesión, pero no todas tienen un guard de permiso en `App.jsx`:

| Ruta | Página |
| --- | --- |
| `/` | Redirección a `/dashboard` |
| `/dashboard` | `Dashboard` |
| `/campanas` | `Campaigns` |
| `/landings` | `LandingsPage` |
| `/llamadas` | `Calls` |
| `/leads` | `Leads` |
| `/agentes` | `Agentes` |
| `/pipeline` | `Pipeline` |
| `/reuniones` | `Reuniones` |
| `/playbooks` | `Playbooks` |
| `/insights` | `Insights` |
| `/automatizaciones` | `Automatizaciones` |
| `/knowledge-base` | `KnowledgeBase` |
| `/configuracion` | `Configuracion` |
| `/voz/test` | `VoiceTestPage` |
| `/prospectos` | `ProspectFinderPage` |
| `/organic` | `OrganicLeadsPage`, con fallback a `NotFoundPage` si el módulo no resuelve |
| `/captacion/conectar` | `MetaAccountPage` |
| `/redes-sociales` | `ConectarRedesPage` |
| `/email-marketing` | `EmailMarketingPage` |
| `/captacion/nueva` | `AdsWizardPage` |
| `/ads` | `AdsPage` |
| `/funnels` | `FunnelsPage` |
| `/conversacion/inbox` | `ConversationsInboxPage` |
| `/growth` | `GrowthHubPage` |
| `/inteligencia-comercial` | `RevenueIntelligencePage` |

### Rutas de detalle

Todas están protegidas por sesión y no son entradas independientes de la sidebar:

| Ruta | Página |
| --- | --- |
| `/agentes/:id` | `AgentDetailPage` |
| `/leads/:id` | `LeadDetailPage` |
| `/campanas/:id` | `CampaignDetailPage` |
| `/llamadas/:id` | `CallDetailPage` |
| `/reuniones/:id` | `MeetingDetailPage` |
| `/automatizaciones/:id` | `AutomacionDetailPage` |
| `/knowledge-base/articulos/:id` | `ArticleDetailPage` |
| `/playbooks/:id` | `PlaybookDetailPage` |
| `/pipeline/:id` | `OpportunityDetailPage` |

### Rutas administrativas

| Ruta | Guard | Permiso/rol aplicado |
| --- | --- | --- |
| `/gobierno-empresarial` | `AdminRoute permission="governance.read"` | Consulta el catálogo backend y exige `governance.read`. |
| `/access-control` | `AdminRoute permission="access_control.read"` | Consulta el catálogo backend y exige `access_control.read`. |
| `/admin/ad-playbooks` | `AdminRoute` sin permiso explícito | Solo permite `owner` o `admin` según `ADMIN_ROLES`. |

La ruta comodín `*` muestra `NotFoundPage`.

## 6. Diferencias entre menú y rutas reales

### Rutas existentes sin entrada en la sidebar

Las siguientes rutas son alcanzables desde botones internos, enlaces contextuales o URL directa, pero no tienen elemento propio en `SECTIONS`:

- `/captacion/conectar`: conexión de Meta desde el flujo de Ads.
- `/captacion/nueva`: wizard de creación de Ads.
- Todas las rutas de detalle con `:id`.
- Las rutas públicas `/l/:slug`, `/campanas/compartir/:token`, `/privacidad` y `/terminos`.
- `/login`, `/` y la ruta comodín `*`.

### Entradas de la sidebar con protección de ruta incompleta

Aunque el elemento se oculta correctamente para la mayoría de usuarios sin permiso, `ProtectedRoute` solo comprueba la sesión. Por tanto, el control de visibilidad de `Sidebar` y el control de acceso a la ruta no son equivalentes para las rutas generales.

En particular:

- `navigationPermissions.js` decide si se muestra el enlace.
- `App.jsx` registra la ruta dentro de `ProtectedRoute`.
- `ProtectedRoute.jsx` no llama a `canNavigateTo` ni devuelve `403` por permiso.
- La página o la API pueden aplicar controles adicionales, pero no existe un guard común de ruta para todas las entradas.

### Guards administrativos no uniformes

`AdminRoute` tiene dos comportamientos:

- Con `permission`, consulta `/api/access-control/catalog` y falla cerrado si no encuentra el permiso.
- Sin `permission`, usa exclusivamente `ADMIN_ROLES = {'owner', 'admin'}`.

Esto produce una diferencia visible en `/gobierno-empresarial`: la sidebar exige `governance.read`, pero el guard adicional también permite a `admin` por el catálogo de rol solo si el permiso está concedido. En cambio, `/admin/ad-playbooks` no consulta un permiso concreto y se limita a owner/admin.

## 7. Diferencias con la arquitectura objetivo

La documentación de arquitectura propone ocho áreas de primer nivel: Captación, Conversación, Nutrición, Ventas, Operaciones, IA, Analítica y Sistema. La implementación actual tiene seis grupos más `Growth`:

| Arquitectura objetivo | Implementación actual |
| --- | --- |
| Captación | Captación |
| Conversación | Conversación |
| Nutrición | Nutrición |
| Ventas | Ventas |
| Operaciones | No existe como grupo |
| IA | No existe como grupo; Agentes IA está dentro de Conversación |
| Analítica | No existe como grupo; Insights está dentro de Sistema e Inteligencia comercial dentro de Ventas |
| Sistema | Sistema |
| — | Growth, grupo adicional actual |

La arquitectura objetivo también propone un registro único de módulos (`moduleRegistry`) con área, ruta base, capability, feature flags, integraciones requeridas y vistas. La implementación actual mantiene `SECTIONS` hardcodeado en [`Sidebar.jsx`](../../src/components/Sidebar.jsx#L19) y `NAVIGATION_REQUIREMENTS` en un segundo archivo. Esto deja dos fuentes frontend que deben mantenerse sincronizadas.

## 8. Hallazgos

### H1 — La sidebar y las rutas no comparten una única definición

`SECTIONS` contiene etiquetas, colores, iconos y rutas; `NAVIGATION_REQUIREMENTS` contiene permisos; `App.jsx` contiene componentes y rutas. Añadir un módulo exige modificar al menos dos o tres lugares y puede producir enlaces visibles sin ruta o rutas sin enlace.

### H2 — El filtrado de sidebar no es autorización de ruta

La sidebar aplica permisos de lectura solo para UX. Las rutas normales están cubiertas por sesión, no por un `PermissionRoute` común. Un usuario puede intentar abrir directamente una ruta que no aparece en su sidebar. La API debe seguir siendo la defensa final, pero falta una respuesta frontend explícita de acceso denegado.

### H3 — Fallback frontend y catálogo backend pueden divergir

Los fallback de [`navigationPermissions.js`](../../src/lib/navigationPermissions.js#L82) son una compatibilidad local. El catálogo backend de [`catalog.ts`](../../backend/src/access-control/catalog.ts#L161) es la fuente de autorización real. Cualquier diferencia entre ambas listas produce un enlace oculto de más o una ruta visible que fallará después.

### H4 — Scopes, feature flags e integraciones no participan en la visibilidad

El mapa actual solo expresa permisos de navegación y, en un caso, `anyOf`. No declara alcance `own/team/org`, feature flags, plan contratado ni integración requerida. Esto no refleja completamente el modelo descrito en [`09-permisos-seguridad-y-multi-tenant.md`](../arquitectura-plataforma/09-permisos-seguridad-y-multi-tenant.md).

### H5 — Estado de colapsado no está aislado por usuario

El comentario de `Sidebar.jsx` habla de persistencia por usuario, pero la clave `vozia_sidebar_collapsed` no incluye `user.id` ni `organizationId`. En un mismo navegador, dos sesiones pueden compartir el estado de grupos colapsados.

### H6 — Algunos módulos reutilizan permisos de otro dominio

Email marketing usa `campaigns.read`, Insights usa `dashboard.read`, Test de Voz usa `agents.read` y Prospect Finder exige permisos de escritura/coste para mostrar una entrada de lectura/operación. Son decisiones válidas como compatibilidad, pero deberían quedar explícitas en un registro de capacidades para evitar ambigüedad.

### H7 — La documentación histórica no representa todo el estado actual

[`AUDITORIA_SIDEBAR_ACCESOS_RBAC.md`](../AUDITORIA_SIDEBAR_ACCESOS_RBAC.md) describe hallazgos de una revisión anterior, entre ellos una sidebar sin filtrado y `AccessControlPage` sin ruta. El código actual sí contiene filtrado por permisos y registra `/access-control`. La auditoría histórica debe leerse como antecedente, no como inventario vigente.

### H8 — Falta una taxonomía uniforme de rutas canónicas y aliases

La arquitectura propone rutas como `/captacion/:module`, `/ventas/:module` y `/analitica/:view`, pero la aplicación mantiene rutas planas como `/campanas`, `/leads`, `/insights` y `/configuracion`. La propia arquitectura recomienda conservar aliases durante la migración; hoy no existe un registro que indique qué ruta plana es canónica y cuál es alias.

### H9 — La definición de iconos no cubre todas las entradas

`SIDEBAR_IMAGES` no contiene una imagen específica para varias rutas actuales, entre ellas `/ads`, `/organic`, `/growth`, `/inteligencia-comercial`, `/gobierno-empresarial`, `/access-control` y `/admin/ad-playbooks`. Esas entradas usan el icono React declarado en cada elemento, mientras otras usan imágenes del sistema.

## 9. Recomendaciones de evolución

1. Crear un registro único de navegación con `id`, `area`, `label`, `path`, `readPermission`, `writePermissions`, `scope`, `featureFlag`, `requiredIntegration`, `children` y `legacyAliases`.
2. Generar desde ese registro tanto la sidebar como el mapa de requisitos y, cuando sea posible, la tabla de rutas.
3. Añadir un `PermissionRoute` o un guard equivalente para las rutas protegidas de primer nivel y de detalle.
4. Mantener el backend como autoridad y mostrar una pantalla 403 diferenciada de login, 404 y configuración incompleta.
5. Obtener permisos efectivos desde la sesión o `/me` y reservar los fallbacks para compatibilidad temporal.
6. Incorporar el `userId` y `organizationId` a la clave del estado colapsado.
7. Definir la taxonomía futura de áreas y migrar mediante redirects o aliases sin romper favoritos.
8. Añadir pruebas por combinación relevante de rol, ruta y estado de integración.

## 10. Resumen operativo

La navegación actual tiene 26 entradas potenciales de sidebar: Dashboard y 25 elementos distribuidos en seis grupos. Las entradas están filtradas por permisos efectivos o por fallback de rol, y el shell autenticado ofrece comportamiento responsive y accesible. La aplicación registra más rutas que las visibles en el menú, especialmente rutas públicas, de detalle, de configuración de Ads y administrativas.

La principal deuda no está en la lista visual sino en la duplicación de fuentes y en la separación entre “se muestra el enlace” y “la ruta está autorizada”. La siguiente evolución debería centralizar la definición y hacer que el guard de ruta, la sidebar y las pruebas consuman el mismo contrato.
