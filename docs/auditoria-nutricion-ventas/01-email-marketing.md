# Auditoría de Nutrición: Email Marketing

## 1. Objetivo esperado

Según la visión del producto, Email Marketing debe nutrir leads según estado y comportamiento, reactivar contactos dormidos, registrar aperturas/clics en el CRM y medir enviados, aperturas, clics, rebotes, reactivaciones y conversiones por secuencia. La especificación de módulos añade campaña, envío, plantilla, variante y preferencias por categoría/canal.

Referencias:

- [Especificación funcional, líneas 166-185](../arquitectura-plataforma/07-especificacion-de-modulos.md#email-marketing-newsletter-y-campañas-multicanal)
- [Visión de Email Marketing](../../PLATAFORMA_EXPLICACION_GENERAL.md#7-email-marketing)

## 2. Arquitectura actual

```text
CRM React
   │
   ├─ GET/POST /api/mautic/*
   │          │
   │          └─ Mautic REST API (instancia compartida)
   │
   ├─ POST /api/leads/:id/send-email
   │          └─ envío puntual a contacto Mautic
   │
   └─ eventos y respuestas Resend
              ▲
              └─ POST /api/webhooks/email/resend/:orgId
```

El aislamiento previsto usa:

- un tag de contacto `org-<orgId>`;
- un prefijo de campaña `[org:<orgId>]`;
- el campo custom `crmleadid` para vincular Mautic con `Lead.id`.

Esta decisión está implementada en [mauticSync.service.ts, líneas 35-47](../../backend/src/services/mauticSync.service.ts#L35).

## 3. Funciones que sí existen

### 3.1 Acceso y configuración

- El módulo está limitado al plan `completo` y a `Organization.mauticEnabled` en [mautic.controller.ts, líneas 24-37](../../backend/src/controllers/mautic.controller.ts#L24).
- Las credenciales de Mautic se leen del entorno y se obtiene un token OAuth con caché en [mauticSync.service.ts, líneas 29-88](../../backend/src/services/mauticSync.service.ts#L29).
- La UI tiene estado de carga y pantalla de plan no habilitado en [EmailMarketingPage.jsx, líneas 128-151 y 225-226](../../src/pages/EmailMarketingPage.jsx#L128).

### 3.2 Contactos y segmentos

- `ingestLead()` sincroniza leads entrantes con Mautic en [leadIngestion.service.ts, líneas 24-53](../../backend/src/services/leadIngestion.service.ts#L24).
- Un cambio de `Lead.status` vuelve a sincronizar el contacto en [leads.service.ts, líneas 89-113](../../backend/src/services/leads.service.ts#L89).
- Los estados se asignan a segmentos `nuevo`, `contactado`, `interesado` y `ganado` en [mauticSync.service.ts, líneas 21-27](../../backend/src/services/mauticSync.service.ts#L21).
- Existe una acción de automatización para añadir un lead a un segmento concreto.

### 3.3 Campañas y plantillas

La API expone:

- listado y creación de campañas;
- listado de plantillas/emails;
- envío de prueba;
- programación;
- pausa;
- detalle/estadísticas.

Rutas: [backend/src/routes/mautic.ts](../../backend/src/routes/mautic.ts).

La UI permite crear una campaña, gestionarla, seleccionar una plantilla y un lead de prueba, programar una fecha y pausar una campaña en [EmailMarketingPage.jsx, líneas 43-223](../../src/pages/EmailMarketingPage.jsx#L43).

### 3.4 Interacción y webhooks

- El webhook admite apertura, clic, rebote y baja en [mauticWebhooks.ts, líneas 24-80](../../backend/src/routes/mauticWebhooks.ts#L24).
- Usa secreto por header/Bearer o, como fallback, query string y compara con `timingSafeEqual`.
- La actividad se deduplica y se guarda dentro de `Lead.customFields.mauticActivity` en [mauticSync.service.ts, líneas 333-357](../../backend/src/services/mauticSync.service.ts#L333).
- La vista muestra aperturas y clics recientes enlazados a la ficha del lead.

## 4. Evaluación funcional

| Capacidad | Estado | Evaluación |
| --- | --- | --- |
| Conectar Mautic | Parcial | Hay credenciales globales, token y gating, pero no health check visible ni estado operativo por organización. |
| Sincronizar contactos | Parcial | Funciona para ingestión y cambios de estado; no para todas las altas/importaciones/ediciones. |
| Crear campaña | Parcial | Solo crea nombre y descripción. No define audiencia, contenido, eventos ni objetivo de conversión. |
| Seleccionar audiencia | No existe en CRM | Depende de segmentos externos y aliases escritos a mano. |
| Gestionar plantilla | Parcial | Se listan assets globales de Mautic; no hay aislamiento, editor, preview robusto ni ownership. |
| Enviar prueba | Parcial | Hay flujo, pero usa endpoints Mautic no validados y permite `emailId` arbitrario. |
| Programar/publicar | Parcial | Se guardan fechas, pero no se confirma un cambio a `isPublished: true`. |
| Pausar | Parcial | Hace PATCH remoto, sin historial local ni reconciliación posterior. |
| Métricas | Insuficiente | Solo suma eventos guardados por lead; no hay enviados, entregados, únicos, rebotes o conversiones. |
| Consentimiento y preferencias | Insuficiente | Existe `ContactConsent`, pero no protege todos los envíos ni hay centro de preferencias por categoría. |
| A/B testing | No existe | No hay variantes, reparto, objetivo ni selección de ganador. |
| Atribución a ventas | No existe | No hay relación fiable entre envío/interacción y oportunidad o venta. |

## 5. Hallazgos

### EM-01 · P0 · Aislamiento insuficiente de plantillas y envíos

`getEmailTemplates()` devuelve todos los emails de la instancia Mautic, sin filtrar por `orgId`, en [mauticSync.service.ts, líneas 228-233](../../backend/src/services/mauticSync.service.ts#L228). El endpoint de prueba valida que el destinatario pertenezca a la organización, pero no valida que `emailId` ni la plantilla pertenezcan a ella. El parámetro `campaignId` de la ruta se valida, pero no participa en el envío en [mautic.controller.ts, líneas 76-94](../../backend/src/controllers/mautic.controller.ts#L76).

El envío manual desde una ficha de lead también acepta cualquier `mauticEmailId` en [leads.controller.ts, líneas 211-226](../../backend/src/controllers/leads.controller.ts#L211).

**Impacto:** un usuario podría ver nombres de plantillas de otros clientes o enviar un activo ajeno a un contacto propio si conoce su ID.

**Corrección:** introducir `EmailTemplateBinding(orgId, externalId)` o aplicar prefijo/categoría/permission group verificable en Mautic; comprobar ownership en backend para listar y enviar. Nunca confiar en un ID externo enviado por el navegador.

### EM-02 · P0 · Consentimiento, baja y rebote no forman una barrera única

Las acciones automáticas de email sí consultan `ContactConsent`, pero `sendEmailToLead()` no lo hace y el endpoint manual tampoco. Los eventos `unsubscribe` y `bounce` se registran, pero no actualizan un estado de supresión ni bloquean envíos posteriores.

Además, una campaña ejecutada directamente por Mautic puede no consultar el `ContactConsent` del CRM antes de enviar.

**Impacto:** emails a contactos dados de baja, rebotados o sin base legal, con riesgo normativo y de reputación del dominio.

**Corrección:** crear una función única `assertEmailSendAllowed(orgId, leadId, purpose, category)` usada por envíos manuales, automatizaciones y sincronización de segmentos. Los webhooks de baja/rebote deben actualizar `ContactConsent`/`EmailSuppression` de forma transaccional.

### EM-03 · P0 · Contrato Mautic no verificado

El propio servicio documenta que las rutas exactas no se probaron contra un despliegue real en [mauticSync.service.ts, líneas 190-197 y 236-246](../../backend/src/services/mauticSync.service.ts#L190).

**Impacto:** crear, programar, pausar o enviar puede fallar al activar producción según la versión/configuración de Mautic.

**Corrección:** fijar versión de Mautic, crear pruebas de contrato en CI contra un contenedor, usar fixtures de respuestas reales y ejecutar un E2E con contacto de prueba y dominio sandbox antes de habilitar el módulo.

### EM-04 · P1 · La campaña creada no es una campaña ejecutable completa

La creación remota solo envía `name` y `description` en [mauticSync.service.ts, líneas 217-226](../../backend/src/services/mauticSync.service.ts#L217). No define:

- segmento/audiencia;
- email o variante;
- evento de entrada;
- cadencia;
- objetivo de conversión;
- zona horaria;
- límites y exclusiones.

La UI presenta el resultado como campaña lista para nutrir, aunque en Mautic puede ser solo un contenedor vacío.

**Corrección:** añadir un wizard de campaña con validación de completitud y estados `draft`, `ready`, `scheduled`, `running`, `paused`, `completed`, `error`.

### EM-05 · P1 · “Programar” no garantiza publicar

`scheduleCampaign()` actualiza `publishUp`/`publishDown`, pero no `isPublished: true`, en [mauticSync.service.ts, líneas 253-269](../../backend/src/services/mauticSync.service.ts#L253). La UI afirma que “Mautic activará la campaña” en [EmailMarketingPage.jsx, líneas 84-88](../../src/pages/EmailMarketingPage.jsx#L84).

**Impacto:** campaña programada en la interfaz que nunca se activa.

**Corrección:** separar acciones `schedule` y `publish`, verificar el estado remoto tras la mutación y mostrar el estado reconciliado, no el estado optimista.

### EM-06 · P1 · Métricas con definiciones incorrectas

El overview suma todos los eventos históricos guardados por lead. La UI calcula:

```text
openRate = aperturas / contactos con email
clickRate = clics / aperturas
```

en [EmailMarketingPage.jsx, líneas 228-233](../../src/pages/EmailMarketingPage.jsx#L228).

Esto no es una tasa estándar de campaña: no usa emails enviados o entregados, no deduplica por destinatario/envío y puede superar el 100 %. Tampoco filtra por periodo o campaña.

**Corrección:** persistir `EmailDelivery` y `EmailEvent`; calcular entregados, aperturas únicas, clics únicos, rebotes, bajas y conversiones por campaña, variante y periodo.

### EM-07 · P1 · Rebotes y bajas se presentan como clics

El backend añade `bounce` y `unsubscribe` a `recentActivity`, pero la UI renderiza cualquier tipo distinto de `open` como clic en [EmailMarketingPage.jsx, línea 255](../../src/pages/EmailMarketingPage.jsx#L255). Los filtros solo ofrecen aperturas y clics.

**Impacto:** una baja o un rebote puede mostrarse como señal positiva de intención.

**Corrección:** representar cada tipo con semántica y color propios, y convertir baja/rebote en alertas y supresión, no en engagement.

### EM-08 · P1 · Almacenamiento de eventos frágil en `customFields`

Cada webhook hace read-modify-write de un JSON del lead. Dos eventos concurrentes pueden sobrescribirse; el crecimiento queda limitado a 50 eventos sin tabla de histórico; no hay índices por campaña, tipo o fecha.

El fingerprint alternativo, si Mautic no manda ID, usa solo `leadId|type|detail`. Dos aperturas legítimas del mismo asunto se deduplican para siempre.

**Corrección:** persistir eventos en una tabla con `externalEventId`, `occurredAt`, `campaignId`, `messageId`, `type`, `metadata` e índices. Usar unique parcial por proveedor+externalEventId y conservar el payload original sanitizado.

### EM-09 · P1 · Altas manuales e importaciones no se sincronizan de forma completa

`createLead()` e `importLeads()` escriben directamente en Prisma en [leads.service.ts, líneas 40-87](../../backend/src/services/leads.service.ts#L40). Solo `ingestLead()` llama a `syncContact()`, crea conversación y orquesta canales.

**Impacto:** un lead creado desde la UI puede aparecer en la lista de destinatarios de prueba, pero no existir todavía en Mautic; el envío falla con “no sincronizado”.

**Corrección:** todas las fuentes deben entrar por un servicio idempotente común o emitir un outbox `lead.created` que ejecute sync y orquestación fuera de la transacción HTTP.

### EM-10 · P1 · No existe registro local de entrega

El sistema puede crear un `Message` cuando una automatización envía email dentro de una conversación, pero el envío manual y las campañas no generan un registro uniforme de:

- solicitud;
- aceptación del proveedor;
- entrega;
- fallo;
- rebote;
- baja;
- interacción.

**Impacto:** no es posible auditar qué se envió, evitar duplicados, reconciliar Mautic ni atribuir una venta.

**Corrección:** unificar todo envío en `EmailDelivery`/`Message` con idempotency key y estado de proveedor.

### EM-11 · P1 · Mutaciones sin RBAC

Las rutas Mautic solo usan `authenticate`; un usuario `viewer` puede crear, programar o pausar campañas si tiene acceso al módulo. El middleware `authorize()` existe, pero no se aplica en estas rutas.

**Corrección:** matriz de permisos: viewer solo lectura; agent puede enviar prueba/manual dentro de sus permisos; admin/marketing manager crea, publica y pausa campañas.

### EM-12 · P1 · Resiliencia externa insuficiente

`mauticFetch()` no define timeout, retry, circuit breaker ni trazas estructuradas. Los envíos se hacen dentro de la petición o de un paso de automatización y no hay reconciliación programada.

**Corrección:** cliente Mautic tipado con timeout, retry solo en operaciones seguras/idempotentes, idempotency key, métricas, cola y job de reconciliación.

### EM-13 · P2 · Estado de conexión engañoso

Si el overview falla, la UI guarda `null`, pero sigue mostrando “Mautic conectado · datos en tiempo real” en [EmailMarketingPage.jsx, líneas 144-151 y 240](../../src/pages/EmailMarketingPage.jsx#L144). Un error de campañas se representa como lista vacía.

**Corrección:** estados distintos para `connected`, `degraded`, `not_configured`, `unauthorized` y `error`; mostrar última sincronización y acción de reintento.

### EM-14 · P2 · Selección de plantillas poco usable

En gestión de campaña se selecciona una plantilla por nombre, pero desde la ficha del lead se pide escribir manualmente el ID Mautic. No hay preview, asunto, idioma, categoría, remitente ni validación de variables.

**Corrección:** selector común de plantillas autorizadas, preview renderizado, variables requeridas y envío de prueba antes de publicar.

## 6. Funcionalidades a crear

### 6.1 Base operativa obligatoria

1. **Binding multi-tenant de Mautic**
   - contacto, plantilla, segmento y campaña vinculados a `orgId`;
   - estado de sync, último intento y último error;
   - reconciliación periódica.

2. **Consentimiento y supresión centralizados**
   - consentimiento por canal, propósito y categoría;
   - bajas globales y por categoría;
   - hard bounce, spam complaint y dirección inválida;
   - exclusión antes de cualquier envío.

3. **Registro de entregas y eventos**
   - un registro por destinatario y mensaje;
   - idempotencia;
   - estados `queued`, `accepted`, `delivered`, `failed`, `bounced`, `unsubscribed`;
   - eventos únicos y totales.

4. **Cliente Mautic verificado**
   - contratos tipados;
   - timeout y observabilidad;
   - pruebas de contrato por versión;
   - health check y reconciliación.

### 6.2 Campañas operables desde el CRM

Crear un wizard con:

1. objetivo y nombre;
2. audiencia dinámica y exclusiones;
3. plantilla/variante y variables;
4. remitente, reply-to e idioma;
5. calendario y zona horaria;
6. control de frecuencia;
7. prueba y checklist;
8. aprobación y publicación.

La app no necesita reconstruir todo el editor visual de Mautic. Puede mantener Mautic como motor y guardar en el CRM una proyección operativa, ownership y métricas. Para edición avanzada puede ofrecer un deep link firmado al activo remoto.

### 6.3 Audiencias dinámicas

El constructor debe combinar:

- estado y etapa;
- fuente/campaña/UTM;
- empresa, sector, ubicación y etiquetas;
- score e intención;
- apertura, clic, rebote o inactividad;
- última actividad y próxima acción;
- consentimiento y supresiones.

Debe existir preview del tamaño, muestra de contactos y explicación de por qué un lead entra o queda excluido.

### 6.4 Métricas y atribución

Dashboard por campaña, variante, audiencia y periodo:

- enviados;
- aceptados/entregados;
- apertura única y total;
- clic único y total;
- CTR y CTOR;
- rebote soft/hard;
- bajas y quejas;
- respuestas;
- reuniones generadas;
- oportunidades creadas/movidas;
- ingresos atribuidos.

La atribución debe basarse en eventos con ventana configurable y mostrar si es directa, asistida o inferida.

### 6.5 Experimentación

- variantes de asunto y contenido;
- reparto porcentual;
- muestra y duración mínimas;
- objetivo de éxito;
- ganador manual o automático;
- historial de cambios.

## 7. API propuesta

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/email/health` | Estado de integración, versión y última sincronización. |
| GET | `/api/email/templates` | Solo plantillas autorizadas para la organización. |
| GET | `/api/email/templates/:id/preview` | Preview y variables requeridas. |
| GET | `/api/email/audiences` | Audiencias guardadas. |
| POST | `/api/email/audiences/preview` | Conteo y muestra sin persistir. |
| POST | `/api/email/campaigns` | Crear borrador local/remoto. |
| PUT | `/api/email/campaigns/:id` | Configurar objetivo, audiencia, contenido y calendario. |
| POST | `/api/email/campaigns/:id/validate` | Checklist de publicación. |
| POST | `/api/email/campaigns/:id/send-test` | Prueba idempotente a destinatarios autorizados. |
| POST | `/api/email/campaigns/:id/publish` | Publicar tras validación y permiso. |
| POST | `/api/email/campaigns/:id/pause` | Pausar y reconciliar. |
| GET | `/api/email/campaigns/:id/metrics` | Métricas por periodo y variante. |
| GET | `/api/email/leads/:leadId/history` | Historial completo de entregas e interacción. |
| PUT | `/api/email/preferences/:leadId` | Preferencias y consentimiento por categoría. |
| POST | `/api/email/sync/retry` | Reintentar bindings fallidos con permiso. |

## 8. Criterios de aceptación

Email Marketing puede considerarse MVP operable cuando:

- ningún activo externo se lista o usa sin ownership de `orgId`;
- un contacto sin consentimiento o suprimido no puede recibir un envío por ninguna ruta;
- toda campaña tiene audiencia, plantilla, remitente, calendario y objetivo válidos;
- publicar verifica el estado remoto y registra quién aprobó;
- todo envío tiene idempotency key y estado reconciliable;
- apertura, clic, rebote y baja se guardan como eventos independientes;
- las tasas usan enviados/entregados y eventos únicos correctos;
- la ficha del lead muestra historial de email real, no solo un ID de plantilla;
- los roles limitan lectura, prueba, creación, aprobación y publicación;
- existen pruebas de contrato Mautic y un E2E de campaña de prueba;
- la UI nunca muestra “conectado” o “tiempo real” cuando el health check no lo confirma.
