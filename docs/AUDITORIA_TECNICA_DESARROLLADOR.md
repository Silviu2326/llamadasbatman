# Auditoría técnica de la aplicación

**Fecha:** 15 de julio de 2026  
**Alcance:** arquitectura frontend/backend, rutas, autenticación, estados de datos, accesibilidad, rendimiento y operabilidad. Se revisó el código de las 37 rutas registradas en `src/App.jsx` y sus componentes principales. No se han modificado archivos de producto durante la auditoría.

## Resumen ejecutivo

El proyecto cuenta con una arquitectura funcional React + Fastify/Prisma y varias integraciones disponen de validación de firma de proveedor. La deuda más importante está en los límites de aislamiento multi-tenant y de autenticación, en los endpoints públicos capaces de generar llamadas/mensajes, en la separación entre estado real y demostrativo, y en la falta de garantías automatizadas para rutas, accesibilidad y migraciones.

La aplicación no debe considerarse lista para un despliegue externo amplio hasta cerrar los bloqueantes P0: fuga potencial de datos entre organizaciones por WebSocket, voz pública con coste, RBAC de servidor, consentimiento/antispam, secretos y credenciales de seed. Los hallazgos se ordenan por impacto y probabilidad, no por esfuerzo de implementación.

## Inventario técnico revisado

| Capa | Componentes revisados | Observación |
| --- | --- | --- |
| Enrutado | `src/App.jsx`, `ProtectedRoute`, `AdminRoute`, navegación lateral | 37 rutas explícitas (3 públicas y 34 protegidas), sin catch-all 404. |
| Frontend de dominio | Dashboard, campañas, llamadas, leads, agentes, pipeline, reuniones, playbooks, insights, automatizaciones, conocimiento, configuración, captación, ads, email, inbox y Growth Hub | Conviven pantallas conectadas a API con vistas y KPIs de ejemplo. |
| Servicios backend | Fastify, Prisma, controladores de auth, campañas, automatizaciones, integraciones y voz | La validación de firmas de Twilio/Meta/WhatsApp es una buena base; autenticación y límites deben reforzarse. |
| Datos y operación | Prisma schema/migraciones, `.env` configurada, scripts de build/test | El estado de migraciones no pudo verificarse contra la base configurada debido a un error del motor de esquema; hace falta una comprobación reproducible en CI/staging. |

## Hallazgos priorizados

### P0 — Socket.IO permite leer llamadas de otra organización

**Evidencia:** `backend/src/websockets/index.ts` inicializa Socket.IO con CORS abierto, no autentica el handshake y permite que el cliente envíe `join:org` con un `orgId` arbitrario. `backend/src/voice/telephony/mediaStream.ts` emite a esa sala la llamada completa, incluida la transcripción.

**Riesgo:** cualquier cliente que conozca o adivine un identificador de organización podría suscribirse a eventos de otra organización y recibir contenido de llamadas. Es una fuga multi-tenant de datos personales y comerciales.

**Corrección:** autenticar el handshake con JWT/sesión, derivar `orgId` exclusivamente del claim validado, eliminar el evento de unión arbitraria y configurar una allowlist de orígenes. Añadir pruebas de integración que demuestren que un socket de la organización A no puede escuchar ni emitir en B.

### P0 — WebSockets de voz públicos permiten consumo de IA y suplantación de contexto

**Evidencia:** `backend/src/index.ts` acepta upgrades públicos en `/media` y `/voice-sim/live`. `mediaStream.ts` y `simStream.ts` aceptan `orgId`/`agentId` que vienen del cliente e inician servicios Deepgram/ElevenLabs.

**Riesgo:** se pueden iniciar sesiones de IA con coste, asociarlas a otra organización y forzar consumo sin autorización. También expone una vía de abuso de recursos y de facturación.

**Corrección:** exigir autenticación de usuario en simulación; para telefonía, verificar la procedencia Twilio antes del upgrade y enlazar la sesión al contexto de servidor. No confiar nunca en IDs de organización o agente enviados por el socket. Aplicar límite de origen, IP, usuario, concurrencia y presupuesto, con alertas de coste.

### P0 — Secreto JWT inseguro por defecto

**Evidencia:** `backend/src/index.ts` configura JWT con `process.env.JWT_SECRET ?? 'changeme_secret'`.

**Riesgo:** si una variable de entorno falta o se configura mal, cualquier actor que conozca el secreto publicado en el repositorio podría firmar tokens válidos. Es una escalada directa de privilegios.

**Corrección:**

- Eliminar el fallback y abortar el arranque en producción si falta `JWT_SECRET` o no cumple longitud/entropía mínima.
- Separar secretos por entorno, almacenarlos en un gestor de secretos y rotarlos antes del siguiente despliegue.
- Añadir una prueba de configuración de arranque y una regla de CI que bloquee secretos de ejemplo.

### P0 — Roles de interfaz no equivalen a autorización del servidor

**Evidencia:** múltiples rutas mutables sólo aplican `authenticate`, no `authorize`: agentes; campañas (crear, iniciar, pausar y compartir); Meta (OAuth, presupuesto y desconexión); Postiz/publicación; WhatsApp; prospectos/importación y ads. `src/components/AdminRoute.jsx` protege únicamente la navegación en cliente.

**Riesgo:** una cuenta autenticada de sólo lectura puede invocar las APIs directamente y modificar datos, publicar contenido, arrancar campañas o generar costes. Ocultar botones en React no es un control de acceso.

**Corrección:** aplicar autorización por rol y organización a cada handler mutable en backend, centralizar la política y devolver 403 coherente. Crear una matriz rol × endpoint en tests HTTP y verificar que las rutas administrativas no dependen de `AdminRoute` para proteger datos.

### P0 — Automatizaciones Mautic no validan la pertenencia del recurso antes del efecto

**Evidencia:** `backend/src/services/automations.service.ts` usa cualquier `segmentAlias` al enviar a segmento y cualquier `emailId` al ejecutar email sin comprobar antes un `MauticAssetBinding` activo de la organización. El controlador de leads sí contiene una comprobación de pertenencia comparable.

**Riesgo:** una organización podría disparar plantillas o segmentos no vinculados a ella, con fuga o envío de comunicaciones fuera de su ámbito autorizado.

**Corrección:** comprobar de manera atómica `orgId`, tipo de activo y estado activo del binding antes de cualquier llamada externa; impedir IDs/aliases libres en el payload y probar explícitamente el aislamiento entre dos organizaciones.

### P0 — La landing pública puede disparar comunicaciones sin controles antiabuso suficientes

**Evidencia:** `backend/src/controllers/landing.controller.ts` acepta `consent=true` de la petición pública y permite acciones de voz/WhatsApp; `backend/src/services/conversations.service.ts` inicia WhatsApp o encola voz. No hay CAPTCHA/challenge, límite específico, deduplicación de teléfono ni verificación adicional de consentimiento.

**Riesgo:** un tercero puede automatizar formularios, declarar consentimiento falsamente y provocar llamadas o mensajes reales: coste, spam, daño reputacional y riesgo normativo.

**Corrección:** exigir challenge anti-bot, honeypot y limitación por IP/slug/teléfono; deduplicar; guardar evidencia de consentimiento (texto, versión, origen, fecha) y exigir doble opt-in o revisión antes de llamadas según la jurisdicción. Alertar y poder pausar rápidamente un slug abusado.

### P0 — El seed crea credenciales administrativas conocidas

**Evidencia:** `backend/prisma/seed.ts` crea y registra `admin@vozia.ai` con contraseña `admin1234`.

**Riesgo:** si el seed se ejecuta fuera de desarrollo aislado, cualquier persona que conozca el repositorio dispone de una cuenta privilegiada predecible.

**Corrección:** prohibir el seed de credenciales conocidas fuera de `development`, requerir un secreto explícito/aleatorio para cualquier administrador de bootstrap y no imprimir contraseñas en logs. Añadir un test de protección de entorno.

### P1 — Ciclo de sesión débil y token accesible desde JavaScript

**Evidencia:** el contexto/API frontend mantiene la autenticación en `localStorage`; `backend/src/controllers/auth.controller.ts` emite accesos de 7 días y acepta un JWT firmado genérico como refresh token. El logout devuelve éxito sin invalidación o rotación de sesión.

**Riesgo:** una XSS o una extensión maliciosa puede extraer un bearer token de larga duración. Un token renovable no revocado mantiene acceso incluso después de cerrar sesión.

**Corrección:**

- Mover refresh token a cookie `HttpOnly`, `Secure`, `SameSite` adecuada; mantener el access token en memoria y con duración corta.
- Usar tipo/audiencia de token diferenciados, IDs de sesión y rotación de refresh token en cada uso.
- Persistir sesiones/tokens revocados, invalidarlos en logout y permitir cierre de sesiones por usuario.
- Añadir limitación por cuenta/IP y registros de eventos para login, refresh y fallos.

### P1 — CORS permisivo con credenciales

**Evidencia:** `backend/src/index.ts` usa `cors({ origin: true, credentials: true })`.

**Riesgo:** permite reflejar orígenes de forma amplia. Al migrar a cookies de sesión, esta configuración sería especialmente peligrosa; incluso hoy complica definir una superficie de confianza verificable.

**Corrección:** lista de orígenes explícita por entorno, rechazo por defecto y pruebas de preflight. No activar credenciales hasta que la lista y las cookies estén correctamente configuradas.

### P1 — Datos demo y estado real comparten el mismo contrato visual

**Evidencia:** `src/components/Agentes.jsx` normaliza datos API con `DEMO_AGENTS` y actualiza partes mediante estado local; `Sidebar.jsx`, `CampaignDetailPage.jsx`, `OpportunityDetailPage.jsx` y `PlaybookDetailPage.jsx` incorporan métricas, cronologías o configuraciones estáticas sin marcador duradero.

**Riesgo:** decisiones comerciales tomadas sobre números falsos y soporte imposible de diagnosticar porque la interfaz asegura que una acción se completó aunque nunca llegó al servidor.

**Corrección:**

- Definir en el contrato API un `dataMode` (`live`, `demo`, `empty`, `unavailable`) y renderizar una banda persistente fuera de producción para demo.
- Eliminar el fallback silencioso para operaciones mutables; para lectura, usar el patrón transparente de `Insights` con fecha/fuente.
- Implementar invalidación de caché, respuesta canónica desde backend, toasts de éxito/error y tests de persistencia para cada mutación.

### P1 — Enrutado sin recuperación de rutas desconocidas

**Evidencia:** `src/App.jsx` no registra `<Route path="*">` ni una página de error.

**Riesgo:** enlaces rotos, marcadores obsoletos y navegaciones manuales producen un estado sin recuperación, difícil de observar y de soporte.

**Corrección:** añadir 404 pública/protegida, telemetría del path original y pruebas de router para URL inválida, rutas autenticadas y redirecciones de permisos.

### P1 — OAuth Meta permite replays y no enlaza sólidamente el consentimiento de conexión

**Evidencia:** `backend/src/services/metaAdAccount.service.ts` firma un `state`, pero no persiste nonce de un solo uso, TTL ni emplea PKCE; el callback se expone desde `routes/metaAccounts.ts`.

**Riesgo:** el estado puede reutilizarse o usarse fuera del contexto de usuario/organización que inició la conexión, creando riesgo de CSRF/replay de una vinculación OAuth.

**Corrección:** generar un `state` aleatorio, persistido, de vida corta y de un solo uso, ligado a usuario, organización, redirección y proveedor. Aplicar PKCE donde esté disponible y auditar tanto éxito como error del callback.

### P1 — Trabajos asíncronos pueden quedar bloqueados o duplicarse tras una caída

**Evidencia:** `jobs/outboxDispatcher.ts` y la sincronización Mautic dejan elementos en `processing` sin lease/reaper; `jobs/importJobRunner.ts` puede tomar un trabajo ya marcado `processing` sin claim atómico. El runner de campañas reduce parte de la duplicación internamente, pero sigue sin recuperación de jobs huérfanos.

**Riesgo:** comunicaciones no entregadas permanentemente después de un crash, o importaciones procesadas simultáneamente por varios workers y con resultados duplicados/inconsistentes.

**Corrección:** implementar claim transaccional (`SKIP LOCKED` o actualización condicional), `lockedAt`, `workerId` y lease expirables; reencolar trabajos abandonados e imponer idempotency keys en efectos externos. Probar caída de worker, reintento y ejecución concurrente.

### P1 — Migraciones no suficientemente seguras para historiales de base de datos heterogéneos

**Evidencia:** el directorio Prisma parte de una baseline no idempotente seguida de migraciones posteriores. Una base creada históricamente con `db push` puede no compartir el historial requerido; además, `prisma migrate status` no completó en el entorno auditado por un error del motor de esquema.

**Riesgo:** despliegues bloqueados, aplicación parcial de cambios o necesidad de intervención manual en producción.

**Corrección:** documentar y ensayar un runbook `migrate resolve` para instalaciones históricas, clonar una base representativa y ejecutar `migrate deploy` en CI/staging antes de cada release. Mantener un backup verificable y un procedimiento de rollback de aplicación/datos.

### P2 — Configuración de errores de prehandler ambigua

**Evidencia:** los middleware `authenticate.ts` y `authorize.ts` envían `401`/`403` en ramas de error sin retornar explícitamente la respuesta.

**Riesgo:** depende de la semántica de Fastify para cortar la cadena; una modificación posterior puede permitir que el handler continúe o generar dobles respuestas.

**Corrección:** devolver `return reply.status(...).send(...)` en todas las salidas terminales y añadir pruebas unitarias que prueben que el handler protegido no se ejecuta ante 401/403.

### P2 — Límite global de cuerpo elevado para cargas en base64

**Evidencia:** `backend/src/index.ts` configura `bodyLimit: 15 * 1024 * 1024`, con flujos que aceptan archivos codificados en base64.

**Riesgo:** aumenta consumo de memoria y superficie de denegación de servicio para todas las rutas JSON, aunque no necesiten adjuntos.

**Corrección:** limitar globalmente el JSON a un tamaño pequeño, usar `multipart` con límites por ruta/tipo de fichero, analizar archivos y preferir subida directa a almacenamiento con URLs firmadas.

### P2 — Accesibilidad sin garantías de componentes compartidos

**Evidencia:** `FormInput` no relaciona semánticamente etiqueta e input; `FormModal` no implementa diálogo modal completo; el disparador de menú de `ProtectedRoute` no expone etiqueta ni estado. Son componentes que se reutilizan en muchas rutas.

**Riesgo:** una única deficiencia se multiplica por formularios, modales y navegación, reduciendo cumplimiento y usabilidad con teclado/lector.

**Corrección:** arreglar primero los primitivos compartidos, incluir `eslint-plugin-jsx-a11y`, pruebas `axe` y pruebas de teclado con Playwright en los flujos de login, creación y edición.

### P2 — Componentes de dominio demasiado grandes y bundle inicial pesado

**Evidencia:** vistas como `OpportunityDetailPage.jsx`, `Pipeline.jsx`, `KnowledgeBase.jsx`, `Configuracion.jsx` y `LeadDetailPage.jsx` concentran decenas de miles de caracteres/lógica. La última compilación disponible generó un chunk JS principal aproximado de 1,58 MB y CSS de unos 531 kB, con advertencia de Vite por tamaño.

**Riesgo:** cambios frágiles, revisiones difíciles, pruebas lentas y tiempo de carga innecesario; todo el código de rutas se importa de entrada.

**Corrección:** dividir por secciones y hooks de dominio, aplicar lazy loading por ruta con límites de error, separar librerías de visualización y medir LCP/INP antes y después. Establecer un presupuesto de bundle en CI.

### P2 — Landings auxiliares persistidas sólo en navegador

**Evidencia:** `src/pages/LandingsPage.jsx` usa `readExternalWebs`/`writeExternalWebs` sobre `localStorage`.

**Riesgo:** no existe fuente de verdad multiusuario, auditoría ni recuperación de datos al cambiar de dispositivo. La UI puede divergir de backend sin detección.

**Corrección:** recurso backend con `tenantId`, autor, fecha, validación de URL y políticas de borrado; `localStorage` limitado a borradores con migración segura.

### P2 — Operabilidad y despliegue de esquema no verificables de forma automatizada

**Evidencia:** `prisma migrate status` contra la configuración de base de datos no completó por un error del motor de esquema. Los tests requieren `TEST_DATABASE_URL` antes de arrancar, por lo que no se obtuvo una ejecución de integración aislada en la auditoría.

**Riesgo:** migraciones sin confirmar y regresiones de contrato entre frontend, Prisma y API pueden llegar a producción sin una señal temprana.

**Corrección:**

- Crear una base efímera de test/CI y ejecutar `prisma migrate deploy`, generación de cliente, pruebas unitarias e integración en cada PR.
- Añadir healthcheck que compruebe DB/colas/integraciones sin exponer secretos.
- Registrar versiones de migración al arrancar y documentar el proceso de rollback.
- Resolver el error del motor antes del siguiente despliegue; no asumir que implica corrupción de datos sin reproducirlo contra staging.

### P3 — Observabilidad y respuestas de funciones incompletas

**Evidencia:** varias acciones de frontend usan `alert`, `confirm` o cambios locales sin un patrón común de resultado; el cliente Prisma se inicializa sin un ciclo de cierre/telemetría explícito.

**Riesgo:** soporte y diagnóstico difíciles, especialmente en errores de integraciones externas y procesos asíncronos.

**Corrección:** centralizar notificaciones, errores API con `requestId`, logs estructurados sin PII/secreto, métricas de cola/webhook y apagado ordenado de Prisma/Fastify.

## Controles que ya son positivos

- Las integraciones de voz/WhatsApp y Meta revisadas validan firmas de proveedor antes de procesar webhooks.
- Hay protección de rutas y una ruta administrativa diferenciada.
- Varias superficies recientes ya exponen carga, vacío, error y reintento, lo que ofrece un patrón reusable.
- `Insights` deja visible cuando usa demostración, mejor que un fallback silencioso.

## Secuencia de remediación propuesta

1. **Bloqueo de despliegue:** eliminar secreto JWT por defecto, rotar secretos, confirmar migraciones en staging y añadir 404.
2. **Seguridad de sesiones:** refresh HttpOnly rotado, access token corto, revocación, limitación de autenticación y allowlist CORS.
3. **Integridad de producto:** retirar/etiquetar demos, conectar mutaciones reales, normalizar estados de datos y eliminar persistencia local como fuente de verdad.
4. **Calidad transversal:** primitives accesibles, pruebas E2E de rutas/mutaciones, refactor de componentes grandes y división del bundle.
5. **Operación continua:** CI con base de datos efímera, pruebas de migraciones, observabilidad y presupuestos de rendimiento.

## Pruebas que faltan antes de considerar el sistema endurecido

- Login, logout, refresh, revocación y ataque de token reutilizado.
- Permisos de todas las rutas protegidas, incluido `/admin/ad-playbooks` y una URL inexistente.
- Persistencia real de configuración de agentes, campañas, landings y automatizaciones, incluido un error de red.
- Webhooks con firmas correctas, erróneas y reintentos idempotentes.
- Carga de archivos: tamaño, tipo, malware, límite concurrente y recuperación.
- Recorrido de teclado, lector de pantalla y móvil para login, modal y formulario.
- Prueba de carga y medición LCP/INP después de aplicar división de rutas.

## Límites de la auditoría

No se realizaron pruebas de penetración, no se usaron cuentas de cliente, ni se desplegó/alteró la base de datos. Los hallazgos de proveedor, pagos, envíos reales, deliverability y permisos de organizaciones deben completarse con pruebas controladas de staging.
