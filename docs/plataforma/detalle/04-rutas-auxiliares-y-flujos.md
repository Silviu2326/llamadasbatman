# Rutas auxiliares y flujos de navegación

## Objetivo de este documento

Esta guía explica las rutas que no son, en sentido estricto, una pantalla principal de la sidebar: autenticación, páginas legales, superficies públicas, fichas de detalle, conexiones externas, wizards y 404.

Está escrita para una persona que conoce el objetivo de la plataforma, pero nunca ha visto el sistema. Para cada ruta se describe:

- qué problema resuelve;
- cómo se llega a ella;
- qué protección aplica;
- qué datos consume y modifica;
- qué acciones permite;
- qué estados puede mostrar;
- adónde vuelve el usuario;
- qué dependencias necesita;
- qué debe comprobarse antes de considerarla operativa.

La fuente principal es el código actual. Cuando una vista contiene una presentación o un fallback local, se marca expresamente para no confundirlo con datos reales.

## Evidencia revisada

- Enrutado: `src/App.jsx`.
- Sesión: `src/contexts/AuthContext.jsx`, `src/lib/authSession.js`, `src/lib/api.js`.
- Guards: `src/components/ProtectedRoute.jsx`, `src/components/AdminRoute.jsx`.
- Páginas públicas y auxiliares: `src/pages/LoginPage.jsx`, `PrivacyPage.jsx`, `TermsPage.jsx`, `PublicLandingPage.jsx`, `PublicCampaignSharePage.jsx`, `NotFoundPage.jsx`.
- Fichas: `AgentDetailPage.jsx`, `LeadDetailPage.jsx`, `CampaignDetailPage.jsx`, `CallDetailPage.jsx`, `MeetingDetailPage.jsx`, `AutomacionDetailPage.jsx`, `ArticleDetailPage.jsx`, `PlaybookDetailPage.jsx`, `OpportunityDetailPage.jsx`.
- Conexión y creación de campañas: `MetaAccountPage.jsx`, `AdsWizardPage.jsx`.
- Backend: `backend/src/index.ts`, las rutas y controladores de auth, landing, campaign share y Meta, además de las rutas de cada dominio.
- Arquitectura relacionada: `docs/arquitectura-plataforma/01-arquitectura-de-navegacion.md`, `docs/arquitectura-plataforma/09-permisos-seguridad-y-multi-tenant.md` y la guía funcional de `docs/plataforma/00-guia-funcional-por-pagina.md`.

---

## 1. Arquitectura real de navegación

### 1.1 Capas que deciden qué puede ver la persona

La aplicación se monta en este orden:

```text
AuthProvider
  └── BrowserRouter
        └── Routes
              ├── rutas públicas
              └── ProtectedRoute
                    ├── shell autenticado + Sidebar
                    └── AdminRoute en rutas administrativas
```

#### `AuthProvider`

`AuthProvider` envuelve tanto las rutas públicas como las protegidas. Al montar la aplicación intenta restaurar una sesión mediante `POST /api/auth/refresh`.

Expone:

- `token`: access token en memoria;
- `user`: usuario devuelto por login o refresh;
- `isRestoring`: indica que todavía se está restaurando la sesión;
- `login(token, user)`: guarda la sesión de trabajo;
- `logout()`: revoca la sesión y limpia el token.

La presencia del `AuthProvider` no hace privadas las rutas por sí sola. La decisión efectiva la toma `ProtectedRoute`.

#### `ProtectedRoute`

`ProtectedRoute` es el shell de la zona autenticada:

1. mientras `isRestoring` es verdadero muestra una pantalla de restauración;
2. si no existe `token`, redirige a `/login`;
3. si existe sesión, dibuja la Sidebar, el encabezado móvil y el `<Outlet>` de la ruta hija;
4. al cambiar de ruta cierra la Sidebar móvil;
5. permite cerrar el menú con Escape y devuelve el foco al botón del menú.

No resuelve permisos de cada botón. Sólo resuelve el acceso general a la aplicación.

#### `AdminRoute`

Las rutas administrativas usan un segundo guard:

- sin `permission`: exige que `user.role` sea `owner` o `admin`;
- con `permission`: consulta `/api/access-control/catalog` y exige que el permiso aparezca en `grantedPermissions`;
- mientras comprueba acceso muestra `Comprobando permisos…`;
- si no hay token, falla la comprobación o no existe el permiso, redirige a `/dashboard`.

Esto se aplica actualmente a:

| Ruta | Protección declarada |
|---|---|
| `/gobierno-empresarial` | `governance.read` |
| `/access-control` | `access_control.read` |
| `/admin/ad-playbooks` | sólo rol `owner`/`admin` mediante `AdminRoute` sin permiso explícito |

El backend debe volver a comprobar el permiso. Ocultar un enlace en el frontend no es una frontera de seguridad.

### 1.2 Tipos de ruta actuales

| Tipo | Rutas | Sesión necesaria | Shell |
|---|---|---:|---|
| Acceso | `/login` | No | Pantalla propia de login |
| Legal | `/privacidad`, `/terminos` | No | Página propia sencilla |
| Captación pública | `/l/:slug` | No | Landing completa |
| Compartida | `/campanas/compartir/:token` | No | Resumen de solo lectura |
| Operativa | `/dashboard`, `/campanas`, `/leads`, etc. | Sí | `ProtectedRoute` + Sidebar |
| Detalle | `/agentes/:id`, `/leads/:id`, etc. | Sí | `ProtectedRoute` + página de detalle |
| Integración | `/captacion/conectar` | Sí para la página; callback público | `ProtectedRoute` |
| Wizard | `/captacion/nueva` | Sí | `ProtectedRoute` + editor de varios pasos |
| Administración | `/gobierno-empresarial`, `/access-control`, `/admin/ad-playbooks` | Sí + guard adicional | `ProtectedRoute` + `AdminRoute` |
| Fallback | `*` | No en el componente | 404 propia |

### 1.3 Reglas de entrada y salida

- Las fichas reciben el identificador desde `useParams()`.
- Los tabs de las fichas, salvo el detalle de campaña, viven en estado React y no suelen ser URLs independientes.
- `CampaignDetailPage` conserva el tab en `?tab=`; por ejemplo `/campanas/123?tab=anuncio`.
- La vuelta se hace normalmente con `navigate()` a la lista padre, no con una ruta generada por el navegador.
- `CallDetailPage` conserva la query string al volver a `/llamadas`.
- OAuth usa una redirección externa y regresa a una ruta interna con `status=connected` o `status=error`.
- Los enlaces públicos no tienen acceso al shell autenticado ni a la Sidebar.
- Una ruta desconocida cae en `NotFoundPage`, incluso si la URL parece pertenecer al área protegida.

### 1.4 Ciclo común de una ficha

```text
URL con id
  → useParams()
  → GET /api/<dominio>/<id>
  → loading
  → datos reales / no encontrado / error
  → tabs y mutaciones
  → guardar y refrescar estado
  → volver a la lista o continuar al siguiente módulo
```

La mayoría de páginas distinguen carga, entidad inexistente y error de red. No todas ofrecen un botón de reintento: debe comprobarse ficha por ficha.

### 1.5 `apiFetch` y pérdida de sesión

Las fichas autenticadas usan `apiFetch` en lugar de `fetch` directo. Esta utilidad:

1. obtiene el access token en memoria;
2. añade `Authorization: Bearer <token>`;
3. añade `Content-Type: application/json` cuando hay body;
4. si recibe `401` en una ruta que no es `/api/auth/*`, intenta una sola renovación;
5. repite la petición original si la renovación funciona;
6. si no puede renovar, limpia el token y navega a `/login`.

La página de landing y la página compartida usan `fetch` directo porque son públicas y no deben depender de la sesión.

### 1.6 Dependencias transversales

Para que una navegación aparentemente correcta sea operativa hacen falta, según la ruta:

- API backend levantada bajo `/api`;
- base de datos con el registro consultado;
- permisos del usuario y aislamiento por `orgId`;
- cookies de refresh aceptadas por navegador y backend;
- proveedores externos, credenciales y callbacks configurados;
- URLs de audio accesibles para llamadas;
- clipboard, `mailto:` o `tel:` disponibles para acciones del navegador;
- migraciones Prisma aplicadas;
- workers/webhooks activos cuando una acción depende de ejecución asíncrona.

---

## 2. Fichas de rutas auxiliares

### 2.1 Login — `/login`

#### Propósito y problema que resuelve

Es la puerta de entrada a VozIA. Resuelve el acceso controlado a la organización y evita que una persona tenga que conocer una URL interna concreta para iniciar sesión.

#### Entrada

- URL directa `/login`.
- Redirección desde `ProtectedRoute` cuando no existe access token.
- Redirección desde `apiFetch` cuando una sesión no puede renovarse.

La ruta no recibe un `returnTo`; después de autenticarse siempre lleva a `/dashboard`.

#### Seguridad

- La página es pública, pero el login backend está limitado por IP a 10 intentos cada 15 minutos.
- El backend normaliza email, limita tamaño de email y contraseña y responde con error genérico para credenciales inválidas.
- El access token se mantiene sólo en memoria.
- El refresh token se entrega como cookie `HttpOnly`, `SameSite=Lax`, con `Path=/api/auth` y `Secure` en producción.
- El formulario no muestra ni registra la contraseña.

#### Datos y APIs

`POST /api/auth/login` con `{ email, password }`.

La respuesta correcta devuelve:

- `token` de acceso;
- `user.id`;
- `user.name`;
- `user.email`;
- `user.role`;
- `user.orgId`.

El `AuthContext` también llama a `POST /api/auth/refresh` al montar la aplicación. El refresh rota la sesión y la cookie opaca.

#### Acciones

- Introducir correo y contraseña.
- Mostrar u ocultar la contraseña.
- Enviar el formulario.
- Abrir el panel “¿La olvidaste?”
- Introducir un correo de recuperación.
- Abrir un mensaje `mailto:` a soporte.
- Consultar términos y privacidad.

La recuperación no llama a una API ni envía automáticamente el correo: prepara un mensaje para `soporte@vozia.app`.

#### Estados

- inicial/restaurando: lo gestiona `AuthProvider` alrededor de la ruta;
- formulario vacío: validación local;
- enviando: botón deshabilitado y “Verificando acceso…”;
- error: mensaje accesible con `role="alert"`;
- recuperación abierta: foco automático en el campo de correo;
- éxito: login en contexto y navegación a `/dashboard`.

#### Retorno y navegación

- éxito → `/dashboard` con `replace: true`;
- términos → `/terminos`;
- privacidad → `/privacidad`;
- recuperación → correo externo mediante `mailto:`.

#### Dependencias

`AuthContext`, `authSession`, `/api/auth/login`, `/api/auth/refresh`, cookie de sesión y backend de usuarios.

#### Checklist

- [ ] Credenciales incorrectas no revelan si existe el usuario.
- [ ] Se respeta el rate limit del backend.
- [ ] La cookie de refresh no es accesible desde JavaScript.
- [ ] Un login correcto crea sesión y llega a dashboard.
- [ ] Un refresh fallido devuelve a login sin bucle.
- [ ] La recuperación deja claro que requiere soporte.

### 2.2 Privacidad — `/privacidad`

#### Propósito y problema que resuelve

Ofrece el resumen informativo sobre tratamiento de datos antes o después del acceso, especialmente para usuarios que llegan desde el login o necesitan revisar sus derechos.

#### Entrada

- Enlace legal del login.
- Enlace desde `/terminos`.
- URL directa.

#### Seguridad

Es pública y no expone datos de una organización ni datos de usuarios. El texto aclara que el acuerdo de tratamiento firmado con la organización prevalece sobre el resumen.

#### Datos y APIs

No consulta API. Es contenido estático en `PrivacyPage.jsx`.

El contenido menciona datos de usuarios autorizados, información comercial, datos técnicos, controles de autenticación e integraciones externas habilitadas explícitamente.

#### Acciones

- Volver a `/login`.
- Ir a `/terminos`.
- Escribir a `soporte@vozia.app` para derechos, incidencias o información adicional.

#### Estados

No tiene carga remota, error de datos ni estado de sesión visible. Su único estado operativo es la disponibilidad de la página y de los enlaces.

#### Retorno y navegación

Ambos enlaces son deterministas: login y términos. No intenta devolver al usuario a la página anterior.

#### Dependencias

React Router y el contenido legal aprobado. La fecha visible en el código es 15 de julio de 2026.

#### Checklist

- [ ] Revisar el texto legal con la versión contractual vigente.
- [ ] Confirmar que el correo de soporte está operativo.
- [ ] Verificar que se puede abrir sin sesión.
- [ ] Comprobar navegación bidireccional con términos y login.

### 2.3 Términos — `/terminos`

#### Propósito y problema que resuelve

Explica las condiciones mínimas de uso y las responsabilidades de la organización titular y de sus usuarios.

#### Entrada

- Enlace legal del login.
- Enlace desde `/privacidad`.
- URL directa.

#### Seguridad

Es pública y no carga información operativa. Declara que el acceso está reservado a personas autorizadas, que las credenciales son responsabilidad del usuario y que la organización debe disponer de base legal para los datos y comunicaciones.

#### Datos y APIs

No consulta API. Es contenido estático en `TermsPage.jsx`.

#### Acciones

- Volver a `/login`.
- Abrir contacto de soporte para incidencias de acceso, seguridad o uso.
- Ir a `/privacidad`.

#### Estados

No tiene estados remotos. Debe renderizar de forma independiente del estado de sesión.

#### Retorno y navegación

Vuelve a login o privacidad; no inicia sesión ni guarda consentimiento técnico.

#### Dependencias

Contenido contractual, React Router y `soporte@vozia.app`. La fecha visible en el código es 15 de julio de 2026.

#### Checklist

- [ ] Revisar coherencia con contratos y anexos de tratamiento.
- [ ] Confirmar que no se presenta como aceptación electrónica si el flujo no la registra.
- [ ] Verificar acceso público y enlaces.
- [ ] Mantener la fecha de actualización sincronizada.

### 2.4 Landing pública — `/l/:slug`

#### Propósito y problema que resuelve

Es la superficie de captación pública. Convierte una visita atribuida a una campaña activa en una solicitud de contacto, sin exigir una cuenta VozIA.

#### Entrada

- URL pública generada para una campaña, por ejemplo `/l/demo-valencia`.
- Parámetros UTM, `gclid`, `fbclid` y otros parámetros de atribución.
- Modo preview mediante `/l/preview` o `?preview=1`.

#### Seguridad

- No requiere JWT.
- El backend sólo devuelve campañas con `landingSlug` coincidente y `status: active`.
- El formulario exige nombre, teléfono y consentimiento.
- El campo honeypot `website` se acepta para no revelar el control al bot, pero nunca crea un lead.
- El backend valida teléfono, email, consentimiento y versión de consentimiento.
- Hay rate limits por IP y por huella de teléfono.
- La huella de envío evita repetir la cadena de llamada/automatización para el mismo teléfono y campaña.
- La evidencia de consentimiento guarda una correlación hash de IP y user-agent, no esos valores en claro dentro de `ContactConsent`.

#### Datos y APIs

Carga real:

- `GET /api/public/landing/:slug` → campaña activa, nombre, oferta, lead magnet, copy, template e imagen.
- `POST /api/public/landing/:slug/view` → registra `landing_view` y datos de atribución.
- `POST /api/public/landing/:slug/lead` → ingesta el lead, registra consentimiento y crea `landing_lead`.

La atribución puede contener `sessionId`, UTMs, `gclid`, `fbclid`, referrer, path y fuente/medio/contenido.

En preview se usa `PREVIEW_LANDING`, no se llama a la API de landing ni se registra visita real.

#### Acciones

- Navegar por anclas: beneficios, proceso y preguntas frecuentes.
- Desplazarse al formulario desde varios CTA.
- Abrir/cerrar preguntas frecuentes.
- Enviar nombre, teléfono, email, franja de contacto y consentimiento.
- Ver confirmación y cerrarla para volver al formulario.

#### Estados

- preview: copy local y envío simulado;
- cargando: “Preparando tu experiencia…”;
- error/404: landing no encontrada o no disponible, con reintento mediante reload;
- formulario vacío: validación de nombre/teléfono;
- consentimiento ausente: error de validación;
- enviando: botón en progreso;
- error del backend/rate limit: mensaje de formulario;
- enviado: tarjeta de confirmación.

#### Retorno y navegación

No vuelve al CRM. Los CTA son scroll interno. El resultado correcto es una confirmación y la creación/actualización del lead en backend.

#### Dependencias

Campaña activa, slug, `adAssets`, base de datos de campañas, servicio `ingestLead`, `AcquisitionEvent`, consentimiento y rate limiter.

#### Checklist

- [ ] Una campaña pausada o inexistente no se publica.
- [ ] La visita se registra una sola vez por sesión cuando corresponde.
- [ ] UTM y click IDs llegan al evento de adquisición.
- [ ] El honeypot no genera lead ni automatización.
- [ ] Teléfono, email y consentimiento se validan en backend.
- [ ] Repetir el mismo teléfono no duplica la cadena comercial.
- [ ] Preview no contamina datos reales.

### 2.5 Campaña compartida — `/campanas/compartir/:token`

#### Propósito y problema que resuelve

Permite compartir con un cliente, dirección o colaborador un resumen de campaña sin darle acceso a VozIA ni a datos internos del workspace.

#### Entrada

- El usuario interno genera un enlace desde `/campanas/:id` usando “Compartir enlace”.
- La API devuelve una URL como `/campanas/compartir/:token`.
- El destinatario abre el enlace sin sesión.

#### Seguridad

- La vista no usa `ProtectedRoute` ni JWT.
- El token debe cumplir el formato UUID en el backend.
- `getCampaignByShareToken` devuelve sólo campos seguros para el resumen.
- La UI se presenta explícitamente como solo lectura.
- El token no debe dar acceso a la campaña interna, edición, leads, notas ni integraciones.

#### Datos y APIs

- Generación interna: `POST /api/campaigns/:id/share-link`.
- Lectura pública: `GET /api/public/campaigns/:token`.

La vista consume nombre, objetivo, estado, leads, contactados y reuniones. Calcula tasas de contacto y conversión sobre esos valores recibidos.

#### Acciones

No permite editar ni ejecutar acciones. Sólo muestra estado, métricas, barras de progreso y fecha/estado de actualización declarados por la vista.

#### Estados

- loading: cargando resumen;
- token ausente o respuesta no válida: enlace no disponible;
- error de red: no se pudo cargar la campaña;
- ready: resumen de solo lectura;
- estado de campaña: borrador, activa, pausada o finalizada.

#### Retorno y navegación

No contiene un enlace de retorno al CRM. El destinatario necesita el enlace compartido o una URL interna distinta para volver al sistema.

#### Dependencias

Token persistido en la campaña, endpoint público, contrato de campos seguros y `campaign-share.css`.

#### Checklist

- [ ] El token sólo se genera para una campaña que el usuario puede leer.
- [ ] El endpoint público rechaza tokens inválidos y desconocidos.
- [ ] No se filtran PII, notas internas, presupuesto ni credenciales.
- [ ] Los números mostrados proceden de la respuesta, no de mocks.
- [ ] La revocación o expiración del enlace tiene comportamiento definido.

---

## 3. Fichas de detalle autenticadas

Todas las rutas de esta sección están debajo de `ProtectedRoute`. Se accede normalmente desde una lista de la Sidebar, desde un CTA, desde otra ficha o mediante un enlace profundo con el ID del registro.

### 3.1 Detalle de agente IA — `/agentes/:id`

#### Propósito y problema que resuelve

Centraliza la comprensión y operación de un agente: quién es, cómo funciona, cuánto ha trabajado y con qué playbooks se puede activar. Resuelve la dispersión entre configuración de voz, límites operativos y rendimiento.

#### Entrada

- Desde `/agentes` al seleccionar un agente.
- CTA de detalle de agente en campañas u otras vistas.
- URL profunda con `id`.

#### Seguridad

`ProtectedRoute` protege la pantalla. La lectura y las mutaciones se vuelven a autorizar en los endpoints de agentes y playbooks. La pantalla no debe tratar el `systemPrompt`, la personalidad o la configuración como datos públicos.

#### Datos y APIs

- `GET /api/agents/:id` → identidad, rol, personalidad, prompt, estado y settings.
- `GET /api/agents/:id/stats` → llamadas, reuniones y sentimiento medio.
- `GET /api/playbooks` → biblioteca disponible para asignar.
- `PUT /api/agents/:id` con `isActive` → activar/pausar.
- `PUT /api/agents/:id` con `settings` → guardar configuración o playbook activo.

La función `toAgent` adapta el modelo backend a la presentación. Algunos elementos visuales de energía, humor, documentos o llamadas recientes tienen fallback de interfaz y no deben interpretarse automáticamente como métricas del backend.

#### Acciones y áreas de la ficha

- Resumen: identidad, estado, objetivo, estadísticas y actividad reciente.
- Conversaciones: tab interno para el contexto conversacional.
- Configuración: voz, personalidad, límites, reintentos, días, horario y zona horaria.
- Playbooks: consultar, activar o asignar un playbook.
- Rendimiento: llamadas, reuniones, sentimiento y tasa calculada.
- Activar/pausar el agente.
- Volver a `/agentes`, `/llamadas` o `/knowledge-base` según el CTA.

#### Estados

- cargando;
- agente no encontrado;
- error de carga;
- activo/pausado;
- guardado correcto de configuración;
- fallo de actualización con reversión del toggle cuando corresponde;
- playbook activo o disponible para activar.

#### Retorno y navegación

- “Agentes IA” → `/agentes`;
- “Ver playbook” o “Asignar playbook” → `/playbooks`;
- documentos extra → `/knowledge-base`;
- llamadas → `/llamadas`.

#### Dependencias

Modelo `Agent`, `Agent.settings`, playbooks, estadísticas de llamadas/reuniones y permisos de agentes.

#### Checklist

- [ ] Un ID ajeno a la organización no devuelve datos.
- [ ] Pausar/activar persiste y refleja error si falla.
- [ ] No se exponen secretos de proveedores de voz.
- [ ] La configuración JSON no pierde campos desconocidos.
- [ ] Se distingue dato real de fallback visual.

### 3.2 Detalle de lead — `/leads/:id`

#### Propósito y problema que resuelve

Es la ficha comercial unificada de una persona: estado, propietario, contacto, actividad, consentimiento, inteligencia, notas, archivos y email. Resuelve el problema de trabajar un lead desde varias listas sin contexto compartido.

#### Entrada

- Desde `/leads`.
- Desde una oportunidad, reunión, llamada, campaña o actividad.
- URL profunda con `id`.

#### Seguridad

La lectura usa permisos y alcance de leads. El teléfono, email, consentimiento, archivos y actividad son datos sensibles. El backend debe aplicar `owned`, `team` u `org` según el permiso, no confiar en el ID enviado por el navegador.

#### Datos y APIs

Carga inicial paralela:

- `/api/leads/:id/timeline`;
- `/api/leads/:id/audit`;
- `/api/leads/:id/notes`;
- `/api/leads/:id/files`;
- `/api/dashboard/stats`;
- `/api/leads/:id/activities`;
- `/api/leads/:id/consent`;
- `/api/leads/owners`;
- `/api/leads/:id/email-history`;
- `/api/leads/:id/preferences`.

Según exista empresa vinculada, también consulta `/api/accounts/:accountId`. Para acciones usa `/api/accounts?search=`, `/api/accounts/leads/:id/assign`, `/api/meetings`, `/api/leads/:id`, `/owner`, `/audit`, `/preferences`, `/send-email` y `/files`.

#### Acciones y áreas de la ficha

- Resumen: score, datos de contacto y timeline resumido.
- Actividad: llamadas, mensajes, emails, notas, archivos, reuniones, tareas y cambios de estado.
- Consentimiento: canales, propósito y estado otorgado/denegado/revocado.
- Inteligencia: auditoría y señales disponibles.
- Notas: crear notas internas.
- Archivos: cargar archivos como base64 y revisar los ya asociados.
- Email: visible sólo cuando el plan y Mautic están habilitados.
- Llamar mediante `tel:` si existe teléfono.
- Email mediante `mailto:` si existe correo.
- Agendar reunión mediante `POST /api/meetings`.
- Cambiar estado y propietario.
- Vincular una empresa.
- Ejecutar auditoría con web, ciudad y sector.
- Actualizar preferencias y enviar una plantilla Mautic.

#### Estados

- carga parcial por `Promise.allSettled`;
- lead no encontrado;
- error de conexión;
- score real o “Sin score”;
- propietario asignado o sin asignar;
- etapas desde Nuevo hasta Ganado, además de Perdido;
- email habilitado/deshabilitado por plan e integración;
- consentimiento desconocido, otorgado, denegado o revocado;
- subida de archivo, guardado de nota y agendado con estados propios.

#### Retorno y navegación

El botón de breadcrumb vuelve a `/leads`. Los CTA de llamar/email salen al sistema operativo o cliente de correo. Agendar permanece en la ficha y actualiza el estado del lead cuando la reunión se crea.

#### Dependencias

Lead, `SalesActivity`, `ContactConsent`, notas, archivos, cuentas, reuniones, Mautic, auditoría y propietarios de organización.

#### Checklist

- [ ] Todas las consultas están aisladas por organización y alcance.
- [ ] El score indica si viene de API o no existe.
- [ ] PII y archivos no se registran en logs innecesarios.
- [ ] El consentimiento no se interpreta como permiso para canales no otorgados.
- [ ] El email sólo aparece con plan/integración válidos.
- [ ] Agendar y cambiar estado dejan actividad trazable.

### 3.3 Detalle de campaña — `/campanas/:id`

#### Propósito y problema que resuelve

Es el centro operativo de una campaña. Une objetivo, estado, embudo, resultados, Meta Ads, actividad, configuración, duplicación y enlace compartido.

#### Entrada

- Desde `/campanas`.
- Desde `/captacion/nueva` después de crear el borrador.
- Desde un enlace interno con `/campanas/:id?tab=anuncio`.
- Desde un CTA de playbook u otra sección de captación.

#### Seguridad

Está dentro de `ProtectedRoute`; el backend debe comprobar lectura, edición, publicación y acceso a la cuenta Meta en la organización. El enlace compartido se genera desde una sesión autorizada, pero su URL pública es de sólo lectura.

#### Datos y APIs

- `GET /api/campaigns/:id` → campaña, configuración, agente, fechas y métricas acumuladas.
- `GET /api/campaigns/:id/activity` → leads, llamadas y reuniones recientes.
- `PUT /api/campaigns/:id` → nombre, objetivo, meta, presupuesto y settings.
- `POST /api/campaigns/:id/start` o `/pause` → activar/pausar.
- `POST /api/campaigns/:id/duplicate` → crear borrador duplicado.
- `POST /api/campaigns/:id/share-link` → generar enlace compartido.
- Meta: `GET /api/ads/campaigns/:id/status`, `GET /insights`, `POST /publish`, `/pause` o `/activate`.

#### Acciones y tabs

- Resumen: embudo leads → contactados → reuniones y contenido cuando exista fuente real.
- Anuncio: estado remoto Meta, gasto, leads, CPL, impresiones y publicar/pausar/activar.
- Audiencia: preparado como sección, pero actualmente declara que la API de segmentos no está conectada.
- Conversaciones: relación campaña-conversaciones todavía no disponible.
- Contenido: relación de piezas todavía no disponible.
- Automatización: flujo específico de campaña todavía no disponible.
- Configuración: scoring, alertas, orgánico y control de frecuencia.
- Activar o pausar la campaña.
- Editar nombre, objetivo, goal y presupuesto.
- Duplicar como borrador.
- Exportar un informe `.txt`.
- Generar y copiar enlace público.

#### Estados

- cargando;
- campaña no encontrada;
- error de conexión con reintento;
- activa, pausada, borrador o finalizada;
- actividad cargando, vacía o con error;
- Meta cargando, conectado con objetos remotos o pendiente;
- Meta publica, pausa o activa con feedback y error de permisos/conexión;
- tabs incompletos que muestran estado honesto de fuente no conectada.

#### Retorno y navegación

- breadcrumb → `/campanas`;
- wizard → `/campanas/:id?tab=anuncio`;
- compartir → modal local con URL pública;
- duplicar → el nuevo `/campanas/:copyId`;
- cambiar tab → query `tab`, preservable en deep link.

#### Dependencias

Campaign, AcquisitionEvent/actividad, agentes, Meta Ads, permisos de campañas, cuenta publicitaria, insights y generación de tokens de share.

#### Checklist

- [ ] Un usuario sólo puede leer y editar campañas de su organización.
- [ ] `?tab=anuncio` abre la pestaña correcta.
- [ ] Los datos de Meta no se sustituyen por métricas ficticias.
- [ ] Publicar, pausar y activar tienen permisos y auditoría.
- [ ] El informe exportado no incluye secretos ni PII innecesaria.
- [ ] El enlace público sólo expone campos seguros.
- [ ] Las tabs aún no conectadas no presentan datos de ejemplo como reales.

### 3.4 Detalle de llamada — `/llamadas/:id`

#### Propósito y problema que resuelve

Permite revisar una llamada de forma accionable: qué ocurrió, qué dijo cada parte, qué sentimiento tuvo y qué seguimiento queda pendiente.

#### Entrada

- Desde `/llamadas`.
- Desde un lead, agente, campaña u oportunidad.
- URL profunda con el ID de llamada.

#### Seguridad

La llamada, grabación y transcripción son datos especialmente sensibles. La ruta requiere sesión y permisos de lectura de llamadas/grabaciones. La descarga usa el `recordingUrl` devuelto: backend debe garantizar que sea una URL autorizada y caducable.

#### Datos y APIs

- `GET /api/calls/:id` → lead, agente, duración, resultado, sentimiento, resumen, audio, transcript y métricas.
- `GET /api/calls/:id/notes` y `POST /notes`;
- `DELETE /api/calls/:id/notes/:noteId`;
- `GET /api/calls/:id/tasks`;
- `PUT /api/calls/:id/tasks/:taskId`;
- `POST /api/calls/:id/favorite`.

#### Acciones y tabs

- Resumen: resumen y métricas disponibles.
- Transcripción: búsqueda textual y filtro “Sólo IA”.
- Notas: crear y eliminar notas de contexto.
- Reproducir, pausar, mover posición y abrir/descargar audio cuando existe.
- Destacar o quitar destacado.
- Copiar resumen al clipboard.
- Ir a notas desde el botón “Añadir nota”.
- Marcar tareas completadas.

#### Estados

- cargando;
- llamada no disponible/error;
- audio no disponible;
- transcripción no disponible o sin coincidencias;
- nota guardando/eliminada;
- tarea actualizada;
- favorito actualizado o error.

#### Retorno y navegación

Vuelve a `/llamadas` conservando `window.location.search`, para no perder filtros de la lista.

#### Dependencias

Call, Lead, Agent, grabación, transcripción, notas, tareas, clipboard y permisos de datos sensibles.

#### Checklist

- [ ] Audio y transcript respetan permisos separados de lectura/descarga.
- [ ] La URL de audio no queda expuesta indefinidamente.
- [ ] La búsqueda de transcript no altera el contenido original.
- [ ] El estado de tareas se persiste en backend.
- [ ] Copiar resumen no copia datos distintos de los que la persona puede leer.

### 3.5 Detalle de reunión — `/reuniones/:id`

#### Propósito y problema que resuelve

Prepara, documenta y cierra una reunión comercial. Evita que la cita exista sólo en el calendario y que se pierdan el contexto del lead, los acuerdos y el siguiente paso.

#### Entrada

- Desde `/reuniones`.
- Desde un lead, campaña, oportunidad o llamada.
- Desde un enlace profundo con el ID.

#### Seguridad

Requiere sesión y permisos de reuniones. Cambiar fecha, cancelar, completar y marcar no-show son mutaciones autorizadas. Notas, resultados, acuerdos y valor pipeline deben permanecer dentro de la organización.

#### Datos y APIs

- `GET /api/meetings/:id` → reunión, lead, agente, estado, URL, valor y notas.
- `GET /api/meetings/:id/prep` → preparación con lead, notas, llamadas, oportunidad, actividad y reuniones previas.
- `PUT /api/meetings/:id` → notas y cambios soportados.
- `POST /api/meetings/:id/reschedule` → reprogramación.
- `POST /api/meetings/:id/complete` → resultado, acuerdos y posible tarea de seguimiento.
- `POST /api/meetings/:id/no-show` → marca ausencia.

#### Acciones y tabs

- Preparación: estado y contacto del lead, notas recientes, últimas llamadas, oportunidad abierta, actividad y reuniones previas.
- Notas: editar y guardar notas de reunión.
- Historial: muestra disponibilidad de historial tras completar.
- Abrir URL de reunión en nueva pestaña.
- Reprogramar con el modal de nueva reunión precargado.
- Cancelar con confirmación.
- Completar y registrar resultado/acuerdos.
- Marcar no-show.
- Crear tarea de seguimiento al completar.

#### Estados

- carga de reunión;
- contexto de preparación cargando, correcto o error;
- sin lead, notas, llamadas u oportunidad;
- programada, completada, cancelada o no-show;
- resultado obligatorio al completar;
- operación de completar/no-show en curso;
- modal de reprogramación/cancelación abierto.

#### Retorno y navegación

- breadcrumb y cancelación → `/reuniones`;
- reprogramación cierra modal y recarga la misma ficha;
- completar/no-show recarga la reunión para reflejar el estado.

#### Dependencias

Meeting, Lead, Call, Opportunity, SalesActivity, tareas, calendario externo/URL de reunión y permisos de escritura.

#### Checklist

- [ ] Completar exige resultado.
- [ ] Cancelar pide confirmación.
- [ ] No-show no borra el contexto ni impide el cierre posterior si el producto lo permite.
- [ ] Reprogramar modifica la reunión existente, no crea una duplicada.
- [ ] La tarea de seguimiento queda vinculada a la reunión/oportunidad.

### 3.6 Detalle de automatización — `/automatizaciones/:id`

#### Propósito y problema que resuelve

Hace observable una automatización: qué hace, si está activa, qué versiones se han publicado y cómo se ejecutaron sus runs. Resuelve la falta de trazabilidad de los procesos automáticos.

#### Entrada

- Desde `/automatizaciones`.
- Desde un error de ejecución o un journey.
- URL profunda con el ID.

#### Seguridad

Requiere lectura de automatizaciones. Publicar y pausar/reanudar requieren permiso de publicación. Las entradas y salidas de pasos pueden contener PII o payloads de proveedores y deben ocultarse o redaccionarse según política.

#### Datos y APIs

- `GET /api/automations/:id`;
- `GET /api/automations/:id/versions`;
- `POST /api/automations/:id/publish`;
- `PUT /api/automations/:id/toggle`;
- `GET /api/automations/:id/runs?page=&limit=15&status=`;
- `GET /api/automations/:id/runs/:runId`.

#### Acciones y tabs

- Resumen: acciones configuradas y estado.
- Historial: runs paginados con filtros en cola, ejecutando, completados y fallidos.
- Detalle de run: pasos, estados, inputs, outputs y errores disponibles.
- Configuración: contenido/configuración presentada por la automatización.
- Publicar una nueva versión.
- Pausar o reanudar.
- Cargar más ejecuciones.

#### Estados

- cargando;
- automatización no encontrada;
- activa o pausada;
- error al publicar;
- sin ejecuciones;
- runs en cola, ejecutando, completados o fallidos;
- pasos pendientes, correctos, omitidos, bloqueados o fallidos;
- detalle de run cargando, disponible o no disponible.

#### Retorno y navegación

Vuelve a `/automatizaciones`. Los tabs y el run seleccionado son estado interno; no están expuestos como query params.

#### Dependencias

Automation, versiones inmutables, AutomationRun, pasos, colas/workers, triggers y permisos de publicación.

#### Checklist

- [ ] Publicar crea o activa una versión identificable.
- [ ] Una automatización pausada no se ejecuta por error.
- [ ] Los estados del run coinciden con backend.
- [ ] La paginación no duplica runs.
- [ ] Inputs/outputs sensibles están protegidos en UI y logs.
- [ ] Un fallo de publicación no deja la UI simulando éxito.

### 3.7 Detalle de artículo de Knowledge Base — `/knowledge-base/articulos/:id`

#### Propósito y problema que resuelve

Ofrece una lectura y edición contextual de un artículo que puede alimentar al equipo y a los agentes. Resuelve la dispersión de documentación y permite medir si el contenido ayuda.

#### Entrada

- Desde `/knowledge-base`.
- Desde un agente al consultar documentos.
- Desde un artículo relacionado.
- URL profunda con el ID.

#### Seguridad

Requiere sesión y permisos de conocimiento. El contenido puede incluir procesos internos, prompts o información comercial; compartirlo mediante clipboard debe considerarse una acción de lectura, no una publicación pública.

#### Datos y APIs

- `GET /api/knowledge/:id`;
- `GET /api/knowledge` para artículos relacionados de la misma categoría;
- `POST /api/knowledge/:id/favorite`;
- `POST /api/knowledge/:id/reaction`;
- `PUT /api/knowledge/:id` con nombre, tipo y contenido.

#### Acciones y áreas

- Leer contenido y secciones.
- Marcar favorito.
- Marcar si fue útil y ajustar contador.
- Compartir copiando la URL actual al clipboard.
- Editar nombre, tipo y contenido en modal.
- Abrir artículos relacionados.
- Descargar cuando el botón de exportación está habilitado por la presentación.

#### Estados

- cargando;
- artículo no encontrado;
- favorito y reacción con actualización optimista y rollback si falla;
- artículos relacionados vacíos;
- edición abierta, guardando o cancelada;
- error de copia o guardado.

#### Retorno y navegación

- breadcrumb → `/knowledge-base`;
- artículo relacionado → `/knowledge-base/articulos/:relatedId`;
- compartir no cambia de ruta.

#### Dependencias

Knowledge, categorías, favoritos, reacciones, clipboard y permisos de lectura/escritura.

#### Checklist

- [ ] El artículo no se expone a otra organización.
- [ ] La edición conserva el tipo y contenido correcto.
- [ ] El rollback optimista deja la UI coherente si falla la API.
- [ ] Compartir copia una URL cuya seguridad sea compatible con el contenido.
- [ ] Los indicadores de lectura no se presentan como métricas reales si no vienen de API.

### 3.8 Detalle de playbook — `/playbooks/:id`

#### Propósito y problema que resuelve

Explica un playbook reutilizable para que una persona pueda decidir si asignarlo a un agente o usarlo en una campaña.

#### Entrada

- Desde `/playbooks`.
- Desde un agente.
- Desde una campaña o el wizard.
- URL profunda con el ID.

#### Seguridad

Requiere lectura de playbooks. El contenido puede contener guiones, objeciones y reglas internas; no es una página pública. Las acciones de edición, si se añaden, deben usar permisos de mutación.

#### Datos y APIs

- `GET /api/playbooks/:id`.

El componente adapta la respuesta con metadatos visuales. `successRate`, `uses` y `avgDuration` reciben fallback (`—`/`0`) cuando no están en API. Parte de los bloques de inclusión y estadísticas actuales son constantes de presentación; deben sustituirse por datos versionados antes de usar la vista como reporting.

#### Acciones y tabs

- Resumen: ideal para, componentes incluidos y descripción.
- Incluye: flujo, objeciones, preguntas y momentos clave.
- Rendimiento: indicadores de éxito, duración y reuniones mostrados por la vista.
- “Usar en campaña” → `/campanas`.
- Exportar → descarga local de texto.
- Volver a `/playbooks`.

#### Estados

- cargando;
- playbook no encontrado;
- disponible con datos del backend;
- datos opcionales ausentes representados como `—`;
- exportación local.

#### Retorno y navegación

El CTA principal lleva a la lista de campañas, no a un formulario específico de creación. La asignación directa a un agente se realiza desde el detalle del agente o desde la gestión de playbooks.

#### Dependencias

Playbook, agentes, campañas, versionado de guiones y exportación local.

#### Checklist

- [ ] La versión mostrada es identificable.
- [ ] Las estadísticas no mezclan mocks con datos reales sin etiqueta.
- [ ] Exportar no incluye secretos ni datos de leads.
- [ ] “Usar en campaña” conserva el contexto del playbook cuando se implemente.
- [ ] Sólo roles autorizados pueden editar/publicar el playbook.

### 3.9 Detalle de oportunidad/pipeline — `/pipeline/:id`

#### Propósito y problema que resuelve

Es la ficha de una oportunidad comercial. Permite controlar etapa, valor, probabilidad, forecast, contactos decisores, productos, actividad y cierre. Resuelve la pérdida de contexto entre lead, oportunidad y forecast.

#### Entrada

- Desde `/pipeline` en cualquier vista de etapas.
- Desde un lead, reunión o campaña.
- URL profunda con el ID.

#### Seguridad

La lectura y mutación usan permisos de oportunidades y alcance del propietario/equipo. La UI puede trabajar con contactos de organización y productos, pero el backend debe comprobar que la oportunidad, lead y contactos pertenecen al mismo tenant.

#### Datos y APIs

Carga inicial:

- `GET /api/pipeline/:id`;
- `GET /api/tasks?opportunityId=:id&limit=5`;
- `GET /api/pipeline/:id/contacts`;
- `GET /api/pipeline/:id/line-items`.

Búsqueda y mutaciones:

- `GET /api/leads?search=&limit=10` para añadir contactos;
- `POST/DELETE /api/pipeline/:id/contacts`;
- `POST/DELETE /api/pipeline/:id/line-items`;
- `PUT /api/pipeline/:id` para edición y notas;
- `PUT /api/pipeline/:id/forecast-category`;
- `POST /api/pipeline/:id/mark-won`;
- `POST /api/pipeline/:id/mark-lost`;
- `POST /api/pipeline/:id/reopen`.

#### Acciones y tabs

- Resumen: etapa, valor, probabilidad, próximo paso, lead y datos principales.
- Contactos: buscar leads existentes, añadir rol de compra, marcar principal y eliminar.
- Productos: añadir nombre, cantidad, precio, moneda y eliminar líneas.
- Actividad: historial relacionado.
- Notas: guardar notas de oportunidad.
- Editar nombre, etapa, valor, divisa, probabilidad, fecha de cierre, notas y propietario.
- Cambiar categoría de forecast: pipeline, best case, commit u omitida.
- Marcar ganada, perdida con motivo obligatorio o reabrir.
- Crear llamada o reunión desde acciones rápidas, con navegación a listas cuando corresponde.

#### Estados

- cargando;
- oportunidad no encontrada;
- abierta o cerrada ganada/perdida;
- siguiente tarea inexistente, abierta o en progreso;
- contactos/líneas cargando, vacíos o con error;
- edición/guardado con error;
- acción de ganar/perder/reabrir en curso;
- motivo de pérdida obligatorio;
- valores monetarios por divisa sin conversión automática.

#### Retorno y navegación

El breadcrumb vuelve a `/pipeline`. Las acciones rápidas pueden llevar a `/llamadas` o `/reuniones`. El cierre y la reapertura refrescan la misma ficha para conservar el contexto.

#### Dependencias

Opportunity, Lead, `OpportunityContact`, productos/líneas, Task, forecast, actividad y permisos de propietario/equipo.

#### Checklist

- [ ] `closed_lost` no se confunde con la etapa visual `lead`.
- [ ] Marcar perdida exige motivo y conserva notas.
- [ ] El forecast no convierte divisas de forma implícita.
- [ ] Añadir un contacto verifica pertenencia a la organización.
- [ ] La siguiente tarea representa el próximo paso real.
- [ ] Ganar, perder y reabrir generan historial/auditoría.

---

## 4. Conexión de Meta Ads — `/captacion/conectar`

### Propósito y problema que resuelve

Conecta la cuenta publicitaria de Meta para que las campañas puedan publicarse, consultarse y enviar conversiones. Resuelve la separación entre la configuración interna de VozIA y el activo real de Meta.

### Entrada

- Desde la Sidebar/captación.
- Desde el aviso del wizard cuando Meta está pendiente.
- Desde la configuración de una campaña.
- Retorno del OAuth backend con `?status=connected` o `?status=error`.

### Seguridad

La página vive bajo `ProtectedRoute`. El backend separa permisos:

- lectura: `integrations.read` a nivel de organización;
- mutación/OAuth/desconexión/pixel: `integrations.manage`;
- tope de presupuesto: `costs.request`.

El callback OAuth es público porque llega desde la redirección de Meta; el backend consume un estado OAuth de un solo uso, valida el flujo y redirige a la aplicación. Los tokens deben permanecer en backend.

### Datos y APIs

- `GET /api/meta/accounts` → cuenta, estado, IDs, fecha y configuración.
- `GET /api/meta/accounts/oauth/start-url` → URL de autorización.
- `GET /api/meta/accounts/oauth/start` → variante de redirección backend.
- `GET /api/meta/accounts/oauth/callback` → callback sin JWT.
- `PUT /api/meta/accounts/:id/budget-cap` → tope diario en céntimos.
- `PUT /api/meta/accounts/:id/pixel-id` → Pixel ID.
- `DELETE /api/meta/accounts/:id` → desconexión.

### Acciones

- Conectar una cuenta.
- Ver Ad Account ID, página, estado y fecha de conexión.
- Guardar tope diario de gasto.
- Guardar Pixel ID para conversiones Lead/Schedule.
- Desconectar con confirmación.

### Estados

- cargando;
- sin cuenta conectada;
- OAuth correcto;
- OAuth fallido;
- cuenta conectada;
- guardando tope o Pixel;
- error de guardado;
- desconexión correcta o fallida.

### Retorno y navegación

OAuth vuelve a `/captacion/conectar?status=connected|error`. El wizard enlaza a esta ruta y después la persona puede volver manualmente al wizard o abrir una campaña.

### Dependencias

Meta App, `META_*`/configuración OAuth, estado OAuth, tokens Meta, cuenta publicitaria, Pixel, Conversions API, permisos y migraciones.

### Checklist

- [ ] Callback no exige JWT, pero valida state y código.
- [ ] Tokens nunca aparecen en JSON del frontend.
- [ ] La cuenta está ligada a `orgId`.
- [ ] El tope se guarda en céntimos y no acepta valores negativos.
- [ ] Pixel ID se valida y queda asociado a la cuenta correcta.
- [ ] Desconectar revoca/elimina credenciales y deja auditoría.
- [ ] Se prueba el retorno en éxito, cancelación y error de OAuth.

---

## 5. Wizard de nueva campaña — `/captacion/nueva`

### Propósito y problema que resuelve

Guía la creación de una campaña de captación en Meta Ads sin obligar a empezar desde una pantalla vacía. Ayuda a definir vertical, objetivo, presupuesto y audiencia; genera una estrategia; guarda borrador; y crea la campaña lista para revisión/publicación.

### Entrada

- Desde el CTA de nueva campaña.
- Desde `/campanas`.
- URL directa protegida.

### Seguridad

Requiere `ProtectedRoute`. Las operaciones de estrategia, borrador y creación deben comprobar permisos de campañas/ads en backend. El access token sólo se consulta para decidir si sincronizar el borrador con servidor; nunca se persiste en `localStorage`.

### Datos y APIs

Carga inicial:

- `GET /api/ad-playbooks` → presets disponibles;
- `GET /api/meta/accounts` → estado de conexión;
- `GET /api/ads/draft` → borrador del usuario/organización.

Persistencia y generación:

- `PUT /api/ads/draft` → autosave server-side;
- `POST /api/ads/strategy` → estrategia remota si está disponible;
- `POST /api/ads/wizard` → crear campaña.

También guarda una copia local bajo `vozia.ads.wizard.draft.v2`.

### Acciones y flujo

1. Elegir vertical/preset.
2. Definir objetivo.
3. Definir presupuesto mensual.
4. Ajustar audiencia.
5. Generar estrategia con IA.
6. Revisar score, audiencia, alcance estimado, CPL, conversión y recomendaciones.
7. Aplicar recomendaciones de audiencia, objetivo o creatividad.
8. Cambiar variantes creativas.
9. Guardar borrador manualmente.
10. Crear campaña.
11. Si Meta no está conectado, ir a `/captacion/conectar`.

### Estados

- borrador inicial/autoguardado;
- borrador restaurado desde local o servidor;
- cuenta Meta comprobando, conectada o pendiente;
- estrategia idle, ejecutando o lista;
- estrategia remota de proveedor Claude;
- fallback local si el backend IA no responde;
- campos incompletos;
- campaña creando;
- campaña creada como draft;
- error de creación o sincronización.

La estrategia local usa perfiles y fórmulas definidas en el frontend. Es útil para no bloquear la experiencia, pero sus forecasts no son resultados reales de Meta y deben presentarse como estimación.

### Retorno y navegación

- breadcrumb → `/campanas`;
- conectar Meta → `/captacion/conectar`;
- creación correcta → `/campanas/:id?tab=anuncio`;
- si la campaña queda en draft se muestra aviso para conectar Meta antes de publicar.

### Dependencias

Ad playbooks, cuenta Meta, borrador por usuario/organización, endpoint de estrategia, creación de campaña, localStorage y página de detalle.

### Checklist

- [ ] Los datos de otro usuario/organización no aparecen en el borrador.
- [ ] El autosave no genera una campaña accidental.
- [ ] El fallback local está etiquetado como estimación.
- [ ] Presupuesto y campos obligatorios se validan en backend.
- [ ] Una campaña nueva entra como draft cuando no hay objetos Meta.
- [ ] La navegación abre el tab de anuncio correcto.
- [ ] Publicar requiere cuenta y permisos Meta válidos.

---

## 6. 404 y rutas desconocidas — `*`

### Propósito y problema que resuelve

Evita una pantalla en blanco cuando una URL no existe, cambió o contiene un ID/ruta no contemplado por el router. Informa de la dirección problemática y ofrece un punto de recuperación.

### Entrada

- Cualquier URL no registrada en `App.jsx`.
- También puede aparecer si una ruta pública o auxiliar se visita con un patrón incorrecto.

### Seguridad

`NotFoundPage` es pública y no consulta datos. Si la URL desconocida pertenece a una zona que debería ser privada, el router no llega a montar el shell protegido porque el wildcard está fuera de `ProtectedRoute`.

Esto es útil para no filtrar contenido, pero significa que el 404 no conserva automáticamente el contexto de autenticación ni la Sidebar.

### Datos y APIs

No consulta API. Usa `useLocation()` para mostrar `location.pathname`.

### Acciones

- Leer el código 404 y la URL recibida.
- Pulsar “Ir al inicio”.

### Estados

Es una vista estática: no hay loading, fetch, reintento remoto ni diferenciación entre ruta pública y protegida.

### Retorno y navegación

El botón siempre lleva a `/dashboard`. Si la persona no está autenticada, `ProtectedRoute` la redirigirá después a `/login`.

### Dependencias

React Router, `useLocation` y la ruta `/dashboard`.

### Checklist

- [ ] Una URL desconocida renderiza algo útil y no una pantalla blanca.
- [ ] La ruta mostrada se escapa correctamente dentro de `code`.
- [ ] El botón no crea bucles para usuarios sin sesión.
- [ ] El diseño se mantiene fuera del shell autenticado.
- [ ] Se decide si en el futuro debe existir un 404 protegido con Sidebar.

---

## 7. Flujos completos de navegación

### 7.1 Acceso y expiración de sesión

```text
Visita cualquier ruta
  → AuthProvider intenta /api/auth/refresh
  → si no hay sesión: las rutas públicas siguen accesibles
  → si se visita una ruta protegida: ProtectedRoute → /login
  → login correcto → token en memoria + refresh cookie → /dashboard
  → petición posterior 401 → apiFetch intenta refresh una vez
  → refresh fallido → limpia token → /login
```

### 7.2 Crear campaña y publicar en Meta

```text
/captacion/nueva
  → cargar presets, cuenta Meta y borrador
  → generar estrategia / fallback local
  → POST /api/ads/wizard
  → /campanas/:id?tab=anuncio
  → si no hay Meta: /captacion/conectar
  → OAuth Meta
  → retorno con status
  → volver a campaña
  → publicar/activar desde tab Anuncio
```

### 7.3 Captación pública y seguimiento comercial

```text
/l/:slug
  → GET landing activa
  → POST view con UTMs/click IDs
  → POST lead con consentimiento
  → Lead + AcquisitionEvent
  → /leads/:id
  → agendar /api/meetings
  → /reuniones/:id
  → completar/no-show
  → /pipeline/:id y forecast
```

### 7.4 Campaña compartida

```text
/campanas/:id
  → POST /share-link desde sesión interna
  → URL /campanas/compartir/:token
  → GET público de campos seguros
  → resumen de sólo lectura
```

### 7.5 Agente, playbook y llamada

```text
/agentes/:id
  → revisar settings y stats
  → asignar/activar playbook
  → operar campañas o llamadas
  → /llamadas/:id
  → revisar audio/transcript/notas/tareas
```

### 7.6 Automatización observable

```text
/automatizaciones/:id
  → GET automatización + versiones
  → publicar versión
  → toggle activa/pausada
  → Historial de runs
  → detalle de un run y sus pasos
```

## 8. Lista de verificación de arquitectura

### Router y deep links

- [ ] Cada ruta de `App.jsx` tiene una única responsabilidad clara.
- [ ] Los IDs se validan en backend y no sólo en el componente.
- [ ] Los tabs que deban compartirse se reflejan en query params.
- [ ] Los botones de vuelta conservan filtros o contexto cuando corresponde.
- [ ] Las rutas auxiliares tienen un destino claro cuando el registro no existe.

### Seguridad

- [ ] Todo detalle autenticado está bajo `ProtectedRoute`.
- [ ] Toda ruta administrativa usa `AdminRoute` y un permiso explícito cuando sea posible.
- [ ] Cada endpoint repite autenticación, permiso, scope y `orgId`.
- [ ] Las grabaciones, transcripts, PII, conocimiento y tokens tienen controles específicos.
- [ ] Los callbacks OAuth públicos sólo aceptan estados/códigos válidos.
- [ ] Los share tokens exponen sólo datos seguros y revocables.

### Datos y estados

- [ ] Loading, vacío, no encontrado y error no se confunden.
- [ ] Los fallbacks locales están etiquetados y no se mezclan con reporting real.
- [ ] Las mutaciones actualizan o recargan la fuente de verdad.
- [ ] Los fallos de mutación no dejan un estado visual falso.
- [ ] Los estados asincrónicos no permiten doble envío.

### Operación

- [ ] Migraciones aplicadas en staging y producción.
- [ ] Variables de OAuth y proveedores configuradas fuera del frontend.
- [ ] Workers y webhooks activos para llamadas, automatizaciones y Meta.
- [ ] URLs de audio, clipboard, `mailto:` y `tel:` probadas en los navegadores soportados.
- [ ] Se han probado permisos con owner, admin, manager, sales, marketing, analyst y viewer.
- [ ] Se han ejecutado pruebas de aislamiento entre dos organizaciones.

## 9. Riesgos y decisiones pendientes

1. **Arquitectura de rutas todavía plana.** La documentación de arquitectura propone rutas agrupadas como `/captacion/:module`, `/ventas/:module` o `/sistema/:module`, pero el código actual conserva alias planos como `/campanas`, `/leads`, `/pipeline` y `/automatizaciones`. No deben eliminarse sin migrar enlaces, favoritos y permisos.
2. **Tabs internos no siempre son deep links.** Sólo la ficha de campaña serializa el tab en la URL. Agente, lead, llamada, reunión, automatización, artículo, playbook y oportunidad pierden el tab al recargar o compartir.
3. **AdminRoute sin permiso explícito en recetas Ads.** `/admin/ad-playbooks` sigue protegido por rol legado `owner/admin`; conviene declarar una capacidad concreta.
4. **Datos de presentación en playbooks y agentes.** Algunas estadísticas y elementos visuales están definidos localmente; deben marcarse como demo o conectar una fuente real.
5. **Fallback local del wizard.** La estrategia local permite continuar, pero no equivale a previsión de Meta ni a resultado de una campaña.
6. **404 único fuera del shell.** Una URL protegida desconocida muestra el 404 público; puede ser correcto desde seguridad, pero no conserva la navegación de la aplicación.
7. **Operatividad externa.** Que la página de Meta, Organic o Ads exista no implica que OAuth, credenciales, migraciones, webhooks y workers estén activos.

## 10. Criterio de “implementado” para una ruta

Una ruta se puede considerar implementada sólo cuando se cumplen las cuatro capas:

1. **Enrutado:** existe en `App.jsx` y se llega desde la navegación esperada.
2. **Presentación:** distingue carga, datos, vacío, no encontrado y error.
3. **Contrato:** sus APIs tienen autenticación, permisos, validación y aislamiento.
4. **Operación:** sus credenciales, migraciones, workers y proveedores están disponibles en el entorno.

Si sólo existe la primera o segunda capa, la ruta está construida visualmente, pero el flujo todavía no está cerrado de extremo a extremo.
