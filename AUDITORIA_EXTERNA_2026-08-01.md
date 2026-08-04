# Auditoría externa del software — VozIA / llamadasrobin

**Fecha:** 2026-08-01  
**Objeto auditado:** working tree actual del repositorio, incluidos cambios no confirmados.  
**Fuera de alcance:** voz, TTS, STT, audio, telefonía de voz, copy, pricing e infraestructura externa, según `BRIEF_ANALISIS_EXTERNO.md`.

## 1. Resumen ejecutivo

El software compila y la suite backend pasa, pero no está listo para usuarios de pago sin corregir dos P0 y varios P1 de integridad.  
El riesgo principal es una escalada `own → org` en workspaces secundarios que permite leer, exportar y modificar datos de otros propietarios.  
El segundo P0 permite responder 200 a un unsubscribe/bounce aunque falle su persistencia, con riesgo de volver a contactar a quien se dio de baja.  
También existen SSRF, referencias cruzadas entre tenants, entitlements eludibles y webhooks públicos con amplificación de trabajo.  
Las integraciones externas presentan varios puntos no idempotentes: un retry puede duplicar campañas, mensajes, clientes Stripe o borradores sociales.  
El frontend contiene un flujo de edición bloqueado, datos simulados presentados como reales, dobles envíos y operaciones multi-petición que dejan huérfanos.  
La migración Postiz→Metricool no está rastreada y el auditor Prisma falla; un despliegue construido solo desde Git queda desalineado con el schema.  
Antes de cobrar: corregir los dos P0, cerrar aislamiento/SSRF/AuthZ, hacer resumibles las operaciones externas y añadir gates CI de build, tests, lint y migraciones.

### Base de verificación

| Comprobación | Resultado |
|---|---|
| Frontend Vite, build sin escribir artefactos | Pasa; 648 módulos |
| Backend TypeScript `tsc --noEmit` | Pasa |
| Backend `npm test` | 106/106 |
| Backend offline runtime | 4/4 |
| Tests operativos raíz | 25/27; fallan 2 por la auditoría Prisma |
| Auditor Prisma read-only | 1 error y 3 warnings |
| Smoke UI | Login renderiza sin overlay/errores de consola; EN→ES funciona |

## 2. Hallazgos

## P0 — Críticos

### P0-01 — El scope `own/team` se pierde y escala a `org` en workspaces secundarios

**Severidad:** P0. Un usuario de agencia limitado a sus registros puede acceder y mutar registros de todos los usuarios del workspace cliente.

**Evidencia:** `backend/src/services/workspaceAccess.service.ts:202-214` fija `claims.workspaceScope`; `backend/src/lib/dataScope.ts:16-20` usa `'org'` cuando ese dato falta; `backend/src/controllers/pipeline.controller.ts:139-160,189-194,340-364` y `backend/src/controllers/leads.controller.ts:266-270,303-331` pasan `{ userId, role }` pero omiten `workspaceScope`. Los servicios eliminan entonces el filtro de propietario en `backend/src/services/pipeline.service.ts:142-152,199-206,732-748` y `backend/src/services/leads.service.ts:81-92,144-154,393-406`.

**Cómo se rompe:** grant agency `role=owner`, `scope=own` sobre workspace B → `X-Workspace-Id: B` → `GET /api/pipeline`, `GET /api/leads/export`, `PUT /api/pipeline/:id` o `PUT /api/leads/:id` operan con alcance de toda la organización.

**Arreglo mínimo:** pasar siempre un único `DataActor { userId, role, workspaceScope }`; impedir overloads que acepten actor parcial y añadir regresiones con `owner + own` para lectura, exportación y escritura.

### P0-02 — Un unsubscribe/bounce de Mautic puede perderse mientras el webhook responde 200

**Severidad:** P0. El sistema puede volver a contactar a una persona después de una baja explícita.

**Evidencia:** `backend/src/routes/mauticWebhooks.ts:273-301` envuelve con `.catch(() => {})` la actividad, el consentimiento y la parada de secuencias; `backend/src/routes/mauticWebhooks.ts:305` marca después el webhook como exitoso. `backend/src/routes/mauticWebhooks.ts:160-191` también traga errores de `EmailEvent`.

**Cómo se rompe:** llega un webhook firmado `unsubscribe`; PostgreSQL falla en `recordEmailComplianceEvent`; el error se descarta, se devuelve 200 y Mautic no reintenta; el consentimiento puede seguir `granted` y otra secuencia vuelve a enviar.

**Arreglo mínimo:** no capturar fallos de compliance; responder 503 y persistir evento, consentimiento, delivery y stop de secuencias en una transacción idempotente.

## P1 — Altos

### P1-01 — SSRF y lectura sin límite en la auditoría web de leads

**Severidad:** P1. Un usuario autenticado puede consultar redes privadas y agotar memoria.

**Evidencia:** `backend/src/controllers/leads.controller.ts:89-93,413-426` solo limita la longitud de `website`; `backend/src/services/digitalAudit.service.ts:150-176` usa `fetch(url, { redirect: 'follow' })` y luego `await res.text()` sin validar IP, redirects ni bytes.

**Cómo se rompe:** `POST /api/leads/:id/audit` con `{"website":"http://127.0.0.1:3000/health/metrics/json"}` o una URL pública que redirige a red interna; una respuesta de cientos de MB se materializa completa.

**Arreglo mínimo:** fetch común con bloqueo DNS/IP en cada salto, redirects manuales y streaming con tope de 1–2 MB.

### P1-02 — Mautic hace consultas Prisma antes de autenticar el webhook

**Severidad:** P1. Una petición anónima puede amplificarse en miles de consultas secuenciales.

**Evidencia:** body global de 15 MB en `backend/src/index.ts:75-80`; `backend/src/routes/mauticWebhooks.ts:211-219` hace un `lead.findUnique()` por evento y solo verifica secreto/HMAC en `:221-238`.

**Cómo se rompe:** JSON cercano a 15 MB con miles de eventos y firma inválida → miles de queries antes del 403.

**Arreglo mínimo:** identificar tenant y verificar HMAC sobre el raw body antes de Prisma; body específico pequeño, máximo de eventos y un único `findMany`.

### P1-03 — Campaign acepta Agent y Playbook de otra organización

**Severidad:** P1. Permite enlazar y leer configuración interna de otro tenant.

**Evidencia:** el controller acepta ambos IDs en `backend/src/controllers/campaigns.controller.ts:14-32`; create/update los persisten sin validar `orgId` en `backend/src/services/campaigns.service.ts:46-61,89-97`; list/get incluyen objetos completos en `:20-23,100-104`. Las relaciones del schema no incorporan tenant: `backend/prisma/schema.prisma:325-345,347-380,681-693`.

**Cómo se rompe:** tenant A crea campaña con `agentId` de B → la FK es válida → `GET /api/campaigns/:id` devuelve Agent, `systemPrompt`, settings y Playbook de B.

**Arreglo mínimo:** validar cada FK con `{ id, orgId }` y, preferiblemente, usar claves compuestas tenant+ID.

### P1-04 — La idempotencia de `EmailEvent` es global entre tenants

**Severidad:** P1. Un evento de un tenant puede suprimir aperturas, bounces o bajas de otro.

**Evidencia:** lookup por `{ provider, externalEventId }` en `backend/src/routes/mauticWebhooks.ts:161-165`; unique global `@@unique([provider, externalEventId])` en `backend/prisma/schema.prisma:1510-1527`.

**Cómo se rompe:** A registra `mautic/42`; B recibe otro `mautic/42`; el handler encuentra A y retorna sin aplicar B.

**Arreglo mínimo:** `@@unique([orgId, provider, externalEventId])` y lookups tenant-scoped.

### P1-05 — Envíos de email y marketing eluden el entitlement del plan

**Severidad:** P1. Organizaciones `free/pro` con credenciales residuales pueden usar funciones de pago.

**Evidencia:** `backend/src/routes/marketingCampaigns.ts:7-21` y `backend/src/routes/conversations.ts:10-22` aplican RBAC pero no `requireEntitlement`; email termina en Mautic desde `backend/src/services/conversations.service.ts:226-232` y la publicación remota vive en `backend/src/services/marketingCampaigns.service.ts:254-385`. El control correcto sí existe en `backend/src/routes/leads.ts:68-75`.

**Cómo se rompe:** organización degradada a `free`, todavía configurada en Mautic → owner publica campaña o envía email desde conversación.

**Arreglo mínimo:** exigir `email_marketing` + integración Mautic en todas las rutas que generan esos efectos; guard por canal en conversaciones.

### P1-06 — La migración Metricool no está en Git y el schema queda por delante del historial

**Severidad:** P1. Un despliegue reproducido desde archivos rastreados no contiene la columna que consulta el runtime.

**Evidencia:** schema usa `metricoolEnabled` en `backend/prisma/schema.prisma:123-126`; baseline crea `postizEnabled/postizWorkspaceId` en `backend/prisma/migrations/20260714000000_baseline/migration.sql:37-38`; la corrección está en `backend/prisma/migrations/20260727120000_replace_postiz_with_metricool/migration.sql:1-3`, pero `git status` la marca `??`. `npm run ops:prisma-audit` reporta `MODEL_COLUMNS_MISSING: Organization.metricoolEnabled` y rompe dos tests.

**Cómo se rompe:** checkout limpio + `prisma migrate deploy` → consultas de dashboard, settings, entitlements o Metricool esperan una columna ausente.

**Arreglo mínimo:** revisar y versionar la migración; hacer que el auditor comprenda `RENAME COLUMN`; gate obligatorio en CI.

### P1-07 — El kill switch de Ads declara pausa aunque Meta la rechace

**Severidad:** P1. La publicidad puede seguir gastando mientras el CRM afirma que está pausada.

**Evidencia:** `backend/src/services/adOptimizer.service.ts:10-14` no comprueba `res.ok`; `:19-22` siempre persiste `paused_*`.

**Cómo se rompe:** Meta devuelve 401/500; `fetch` resuelve, el estado local cambia a paused y el ad set remoto sigue activo.

**Arreglo mínimo:** lanzar en no-2xx; actualizar local solo tras confirmación, persistir `pause_failed` y reintentar con backoff.

### P1-08 — Las publicaciones Meta, Mautic y Metricool no son resumibles tras fallo parcial

**Severidad:** P1. Un retry crea objetos remotos duplicados.

**Evidencia:** Meta crea Campaign/AdSet/Creative/Ad antes de guardar todos los IDs al final en `backend/src/services/metaCampaignBuilder.service.ts:78-128`; Mautic obtiene ID en `backend/src/services/marketingCampaigns.service.ts:280-296` pero su catch `:398-405` solo guarda el ID previo; Metricool lanza varios POST en paralelo sin persistir IDs en `backend/src/services/metricoolSync.service.ts:206-233`.

**Cómo se rompe:** proveedor crea uno o varios objetos y el siguiente paso falla → el retry no conoce lo ya creado y lo duplica.

**Arreglo mínimo:** comando persistido por operación/plataforma; guardar cada ID confirmado inmediatamente y reanudar desde el primer paso pendiente; claves idempotentes deterministas.

### P1-09 — Los imports grandes esperan a que expire la lease entre batches

**Severidad:** P1. Un CSV de 2.000 filas puede tardar unas 16,5 horas con la lease por defecto.

**Evidencia:** `backend/src/jobs/importJobRunner.ts:200-223` procesa un solo batch; `:233-245` conserva `processing`, `workerId` y `leaseExpiresAt`; la selección `:34-41` solo recupera el job tras expirar.

**Cómo se rompe:** 100 batches de 20 filas, aproximadamente 10 minutos entre reclamaciones.

**Arreglo mínimo:** iterar mientras se conserve lease o devolver el job a disponible tras cada batch.

### P1-10 — `Campaign.totalLeads` se desincroniza

**Severidad:** P1. Dashboards, funnels y conversiones muestran métricas incorrectas.

**Evidencia:** crear lead y sumar son escrituras separadas en `backend/src/services/leads.service.ts:247-256`; update cambia `Lead.campaignId` en `:378-408` sin ajustar campaña anterior/nueva.

**Cómo se rompe:** mover un lead A→B deja el contador en A y no suma B; un fallo entre create e increment también diverge.

**Arreglo mínimo:** transacción con ajustes condicionales o calcular/reconciliar el conteo desde `Lead`.

### P1-11 — Las transiciones y cierres de oportunidades no son atómicos

**Severidad:** P1. Concurrencia o caída intermedia deja etapa, historial, fecha y valor en estados incompatibles.

**Evidencia:** `moveStage` lee fuera de transacción y actualiza sin condición de etapa previa en `backend/src/services/pipeline.service.ts:358-400`; `markWon`, `markLost` y `reopen` escriben datos adicionales después en `:491-499,545-550,601-619`.

**Cómo se rompe:** dos movimientos simultáneos crean historias abiertas incompatibles; una caída después de `moveStage` deja `closed_won` sin `actualCloseDate/finalValue`.

**Arreglo mínimo:** transacción única por comando, compare-and-set de etapa y constraint de una sola historia abierta.

### P1-12 — Stripe tiene carrera al crear Customer y acepta webhooks fuera de orden

**Severidad:** P1. Una suscripción puede quedar ligada a un Customer perdido o un evento antiguo reactivar un plan cancelado.

**Evidencia:** read→POST→update sin idempotency/CAS en `backend/src/services/billing.service.ts:42-52`; aplicación de eventos sin `event.id`, `event.created` ni subscription ID en `:104-118`.

**Cómo se rompe:** dos checkouts crean C1/C2 y el último sobrescribe la BD; o `subscription.deleted` pone free y después un `checkout.session.completed` antiguo restaura pago.

**Arreglo mínimo:** idempotency key `customer:${orgId}`, persistencia condicional, ledger único de eventos Stripe y monotonicidad por suscripción.

### P1-13 — WhatsApp puede duplicar envíos y perder callbacks tempranos

**Severidad:** P1. Duplica mensajes/coste y deja estados locales obsoletos.

**Evidencia:** se llama a Twilio antes de persistir en `backend/src/services/whatsapp.service.ts:195-221`; el controller no acepta idempotency key (`backend/src/controllers/whatsapp.controller.ts:50-55`). `handleStatus` archiva callbacks sin mensaje en `backend/src/services/whatsapp.service.ts:162-169`.

**Cómo se rompe:** Twilio envía y el insert falla → retry duplica; o `delivered` llega antes del insert y nunca se reaplica.

**Arreglo mínimo:** comando local duradero e idempotente antes del envío, worker/outbox y reconciliación de callbacks huérfanos.

### P1-14 — Un batch Meta Lead Ads parcialmente procesado entra en retry permanente

**Severidad:** P1. Un lead ya creado hace fallar para siempre el replay del batch.

**Evidencia:** cada lead se crea en `backend/src/services/metaLeadWebhook.service.ts:89-100`; `createLead` usa create directo en `backend/src/services/leads.service.ts:247-249`, pese al unique `(orgId, externalLeadId)` de `backend/prisma/schema.prisma:435`.

**Cómo se rompe:** L1 se crea, L2 falla; el retry choca P2002 en L1 y el batch nunca llega a `failed=0`.

**Arreglo mínimo:** upsert/get-or-create y tratar duplicado como éxito idempotente.

### P1-15 — Completar reuniones es repetible y crea tareas duplicadas

**Severidad:** P1. Doble clic/retry genera efectos repetidos y permite transiciones terminales inválidas.

**Evidencia:** `backend/src/services/meetings.service.ts:455-463` solo bloquea `cancelled`; cada llamada crea follow-up en `:493-506`. Task carece de unique por origen en `backend/prisma/schema.prisma:1375-1409`.

**Cómo se rompe:** dos `/complete` generan dos tareas; una reunión `no_show` puede pasar a `completed`.

**Arreglo mínimo:** claim `status=scheduled`, transacción reunión+tarea+outbox y unique/upsert por source.

### P1-16 — Conversion API de Meta pierde eventos y deduplica reuniones distintas

**Severidad:** P1. Conversiones válidas desaparecen o se colapsan silenciosamente.

**Evidencia:** `backend/src/services/metaConversions.service.ts:68-79` traga errores/no-2xx; `sendScheduleEvent` usa `lead:${lead.id}:Schedule` en `:93-103`.

**Cómo se rompe:** Meta 500 → no retry; dos reuniones del mismo lead comparten `event_id` y Meta elimina la segunda.

**Arreglo mínimo:** outbox con retry/dead-letter y `event_id=meeting:${meeting.id}:Schedule`.

### P1-17 — Editar una oportunidad siempre falla por contrato incompatible

**Severidad:** P1. Bloquea un flujo principal del CRM.

**Evidencia:** `src/pages/OpportunityDetailPage.jsx:328-346` incluye siempre `stage` en `PUT /api/pipeline/:id`; el schema `.strict()` de `backend/src/controllers/pipeline.controller.ts:95-105` no admite ese campo.

**Cómo se rompe:** cambiar solo el nombre y guardar → request incluye `stage` → HTTP 400 → nada se persiste.

**Arreglo mínimo:** retirar `stage` del PUT y usar `/move-stage`, o admitirlo con las mismas reglas de transición.

### P1-18 — La UI presenta actividad, KPIs e integraciones inventadas como datos reales

**Severidad:** P1. El usuario toma decisiones sobre información que nunca ocurrió.

**Evidencia:** Opportunity fija `activities: []` pero renderiza llamada/email/creación estáticos en `src/pages/OpportunityDetailPage.jsx:135-154,810-831`. Playbook usa datos fijos en `src/pages/PlaybookDetailPage.jsx:13-26,134-151,172-225,247-254` y descarta `steps/tags` reales en `:38-50`.

**Cómo se rompe:** una oportunidad recién creada muestra eventos de hace días; dos playbooks distintos muestran 28,4 %, 6m42s, 624 reuniones, 15 pasos y las mismas integraciones.

**Arreglo mínimo:** consumir endpoints reales o mostrar estado vacío/no disponible; nunca mezclar mocks en runtime.

### P1-19 — Las reuniones envían hora local sin zona

**Severidad:** P1. Las citas se guardan con una hora distinta según la TZ del proceso backend.

**Evidencia:** `src/modals/NewReunionModal.jsx:102-143` y `src/pages/LeadDetailPage.jsx:110-115` envían `YYYY-MM-DDTHH:mm:00`; backend hace `new Date(...)` en `backend/src/services/meetings.service.ts:229,381`.

**Cómo se rompe:** navegador Madrid agenda 10:00, Node UTC interpreta 10:00 UTC y luego se muestra 12:00 CEST.

**Arreglo mínimo:** enviar ISO UTC/offset explícito y almacenar UTC.

### P1-20 — Crear oportunidad o reunión puede dejar un lead huérfano

**Severidad:** P1. Una operación visible como fallida deja datos parciales y el retry duplica.

**Evidencia:** `src/modals/NewOportunidadModal.jsx:72-95` y `src/modals/NewReunionModal.jsx:123-147` crean primero el lead y luego la entidad en una segunda petición.

**Cómo se rompe:** lead 201 + oportunidad/reunión 500 → lead persiste; retry crea otro.

**Arreglo mínimo:** endpoint transaccional backend para cada operación compuesta e idempotency key.

### P1-21 — Siete modales permiten doble submit

**Severidad:** P1. Doble clic durante latencia crea registros duplicados.

**Evidencia:** el botón común depende de `submitDisabled` en `src/components/ui/FormModal.jsx:187-205`; no se pasa pese a existir `saving` en `NewLeadModal.jsx:28-55`, `NewReunionModal.jsx:102-157`, `NewOportunidadModal.jsx:61-100`, `NewAutomatizacionModal.jsx:41-70`, `NewAgenteModal.jsx:39-61`, `NewPlaybookModal.jsx:21-40` y `NewArticuloModal.jsx:22-41`.

**Cómo se rompe:** dos clics → dos POST antes de recibir el primero.

**Arreglo mínimo:** `submitDisabled={saving}`, guard al inicio del handler e idempotencia server-side.

### P1-22 — El importe de oportunidad se corrompe con formato español

**Severidad:** P1. El dinero persistido puede ser tres órdenes de magnitud menor.

**Evidencia:** parser en `src/modals/NewOportunidadModal.jsx:83-91`; input libre en `:183-185`.

**Cómo se rompe:** `1.234,56` se limpia a `1.23456` y se guarda aproximadamente como 1,23 € en lugar de 1.234,56 €.

**Arreglo mínimo:** input numérico canónico o parser por locale; enviar decimal exacto/unidades menores.

## P2 — Medios

### P2-01 — `metadata` arbitrario puede almacenar y exponer secretos

**Severidad:** P2. Lectores de integraciones pueden recibir secretos anidados.

**Evidencia:** metadata abierta en `backend/src/controllers/integrationCredentials.controller.ts:15-20`; redacción solo top-level en `:71-78`; devolución íntegra en `backend/src/lib/organizationCredentialsCrypto.ts:35-69`; GET requiere solo `integrations.read` en `backend/src/routes/integrationCredentials.ts:8-12`.

**Cómo se rompe:** guardar `metadata.ops.clientSecret` → la allowlist deja pasar `ops` → GET lo devuelve.

**Arreglo mínimo:** schema cerrado por proveedor y proyección pública explícita con detección recursiva.

### P2-02 — Las credenciales cifradas no soportan rotación de clave

**Severidad:** P2. Cambiar una clave invalida todo lo ya cifrado.

**Evidencia:** clave única sin `keyId`/fallback en `backend/src/lib/tokenCrypto.ts:6-24`, `organicTokenCrypto.ts:8-27` y `organizationCredentialsCrypto.ts:4-32`; el fallo acaba en `credential_decrypt_failed` (`backend/src/services/organizationCredentials.service.ts:57-68`).

**Cómo se rompe:** cifrar con K1, desplegar K2 → todas las credenciales anteriores fallan.

**Arreglo mínimo:** ciphertext con `keyId`, keyring activo+anteriores y recifrado gradual.

### P2-03 — La subida de ficheros acepta MIME y contenido activos arbitrarios

**Severidad:** P2. El bucket puede servir HTML/script controlado por usuario.

**Evidencia:** validación superficial en `backend/src/controllers/leads.controller.ts:83-87,440-454`; MIME pasa directo en `backend/src/services/leads.service.ts:542-548` y `backend/src/lib/s3.ts:21-22`; se genera URL firmada en `leads.service.ts:537-539`.

**Cómo se rompe:** Base64 de HTML + `mimeType:text/html` → S3 lo entrega como contenido activo.

**Arreglo mínimo:** allowlist, magic bytes, nombre/extensión servidor, attachment y antivirus para documentos.

### P2-04 — El health público dispara probes autenticados contra proveedores

**Severidad:** P2. Un anónimo consume recursos/cuotas y credenciales del backend.

**Evidencia:** ruta pública en `backend/src/routes/integrationHealth.ts:4-9`; `?probe=true` en controller `:7-10`; llamadas Meta/Mautic/Metricool en `backend/src/services/integrationHealth.service.ts:151-190`.

**Cómo se rompe:** repetir `GET /health/integrations?probe=true` fuerza llamadas externas; solo aplica el rate limit global 100/min.

**Arreglo mínimo:** público solo snapshot pasivo; probe con token de observabilidad, caché y límite bajo.

### P2-05 — El rate limit por teléfono actúa como oráculo de formularios

**Severidad:** P2. Permite inferir si un número envió un lead en 24 h.

**Evidencia:** key slug+hash teléfono en `backend/src/routes/landing.ts:10-14`; exceso 429 en `:35-40`; validación del body ocurre después en `backend/src/controllers/landing.controller.ts:231-246`.

**Cómo se rompe:** body inválido con teléfono objetivo → 429 si ya existe; 400 si no.

**Arreglo mínimo:** respuesta indistinguible y dedupe dentro del handler; antiabuso separado por IP/sesión.

### P2-06 — Revenue y predicción mezclan monedas y una analítica trunca a 10.000

**Severidad:** P2. Los totales financieros no representan una unidad válida.

**Evidencia:** revenue suma asignaciones multi-moneda y usa `take:10_000` en `backend/src/services/revenueIntelligence.service.ts:496-523`; pipeline agrega sin currency en `backend/src/services/pipeline.service.ts:685-726`.

**Cómo se rompe:** €100 + US$100 → 200 con lista EUR/USD; 12.000 asignaciones se informan como 10.000; riesgo USD se etiqueta con €.

**Arreglo mínimo:** agregación por moneda/variante, sin truncamiento silencioso, y `revenueByCurrency`.

### P2-07 — Sales Sequence puede quedar atascada por escrituras parciales

**Severidad:** P2. Un step queda succeeded mientras Enrollment no avanza.

**Evidencia:** step y enrollment se actualizan por separado en `backend/src/services/salesSequence.service.ts:238-247`; pause/stop/resume también en `:187-230`.

**Cómo se rompe:** caída entre ambas escrituras → no hay step reclamable y la matrícula sigue activa.

**Arreglo mínimo:** transacciones para cada cambio de estado compuesto.

### P2-08 — Ad review deja de reintentar en cualquier no-2xx

**Severidad:** P2. Campañas quedan indefinidamente `pending_review`.

**Evidencia:** `backend/src/jobs/adReviewPoll.ts:38-45` retorna en `!res.ok` y BullMQ marca éxito; `:53-58` traga fallo al programar el siguiente poll.

**Cómo se rompe:** primer poll recibe 500 → no existe job sucesor.

**Arreglo mínimo:** lanzar en errores retryables, attempts/backoff y jobId determinista.

### P2-09 — Google Business Profile ignora `nextPageToken`

**Severidad:** P2. Recursos reales quedan imposibles de configurar.

**Evidencia:** `backend/src/services/organicGoogleIntegration.service.ts:538-555` lee solo 20 cuentas/100 ubicaciones; `:591-600` rechaza recursos no descubiertos.

**Cómo se rompe:** ubicación 101 no aparece y `configureResource` devuelve `resource_not_discovered`.

**Arreglo mínimo:** paginar con límites explícitos e indicador de truncamiento.

### P2-10 — Campañas email y Metricool reinterpretan mal las zonas horarias

**Severidad:** P2. Contenido programado se publica horas antes/después.

**Evidencia:** email acepta `timezone` pero hace `new Date()` sin usarla en `backend/src/controllers/marketingCampaigns.controller.ts:23-34` y `marketingCampaigns.service.ts:135-137`; Metricool convierte a UTC, quita offset y vuelve a adjuntar zona en `backend/src/services/metricoolSync.service.ts:162-171`.

**Cómo se rompe:** 09:00 México se interpreta en TZ servidor; `09:00+02` se convierte a `07:00` + Europe/Madrid.

**Arreglo mínimo:** validar IANA y convertir wall-clock→UTC una sola vez; conservar instante u hora local, no mezclar ambos.

### P2-11 — Prospección concurrente crea leads duplicados

**Severidad:** P2. Incumple el dedupe y duplica contadores.

**Evidencia:** read-before-write en `backend/src/controllers/prospects.controller.ts:75-89`; lead sin `externalLeadId`; el `AcquisitionEvent` único de `:111-133` solo queda ligado al último.

**Cómo se rompe:** dos imports del mismo `placeId` pasan la lectura y crean dos Leads.

**Arreglo mínimo:** `externalLeadId=prospecting:<placeId>`, manejo P2002/get-or-create y transacción con evento/contador.

### P2-12 — Auditoría masiva carga toda la campaña y cuenta fallos como éxitos

**Severidad:** P2. Puede consumir mucha memoria y devuelve métricas falsas.

**Evidencia:** `backend/src/services/leads.service.ts:491-506` carga todos los leads, corta a 50 en memoria, hace `catch(() => null)` y siempre incrementa `audited`.

**Cómo se rompe:** 500.000 leads + proveedor caído → lee todo y responde `audited:50` aunque fallen 50.

**Arreglo mínimo:** filtro/take SQL y contadores `audited/failed/errors` reales.

### P2-13 — Accounts no garantiza dominio único por organización

**Severidad:** P2. Creates concurrentes o updates producen cuentas duplicadas.

**Evidencia:** find-then-create y update sin conflicto en `backend/src/services/accounts.service.ts:79-102,124-136`; schema solo tiene index, no unique, en `backend/prisma/schema.prisma:1562`.

**Cómo se rompe:** dos creates simultáneos o editar B a `example.com` ya usado por A.

**Arreglo mínimo:** unique normalizado `(orgId,domain)` y manejo P2002 en create/update.

### P2-14 — El token compartible de campaña tiene carrera

**Severidad:** P2. Una petición puede recibir un enlace que ya nace inválido.

**Evidencia:** `backend/src/services/campaigns.service.ts:223-230` lee null, genera UUID y actualiza sin condición.

**Cómo se rompe:** dos requests generan T1/T2; solo el último queda persistido y el otro cliente recibe un token muerto.

**Arreglo mínimo:** update condicional `shareToken:null`, releer y devolver el valor persistido.

### P2-15 — Paginación backend usa orden no total

**Severidad:** P2. Hay duplicados/omisiones entre páginas con empates.

**Evidencia:** leads `backend/src/services/leads.service.ts:102-125`, oportunidades `pipeline.service.ts:221-243` y campañas `campaigns.service.ts:19-25` ordenan por un único campo no único.

**Cómo se rompe:** varias filas con mismo `createdAt/name`; página 2 cambia de orden tras una inserción o plan distinto.

**Arreglo mínimo:** añadir `id` como desempate y preferir cursor compuesto.

### P2-16 — Faltan índices para queries de alto crecimiento

**Severidad:** P2. Endpoints/jobs degradan hacia scans lineales.

**Evidencia:** `AdInsightSnapshot` sin índice (`backend/prisma/schema.prisma:759-774`) se consulta por campaign+capturedAt; Lead carece de `(orgId,campaignId,createdAt)`; Opportunity de `(orgId,leadId,createdAt)` pese a `backend/src/services/leads.service.ts:617-619`.

**Cómo se rompe:** al crecer snapshots/leads/oportunidades, filtros y jobs escanean muchas filas no relacionadas.

**Arreglo mínimo:** índices compuestos alineados con esos `where/orderBy` y validar con `EXPLAIN`.

### P2-17 — El detalle de automatización confirma un toggle rechazado

**Severidad:** P2. La UI muestra “Activa” aunque backend no cambió nada.

**Evidencia:** `src/pages/AutomacionDetailPage.jsx:157-161` no espera/valida respuesta; backend rechaza borradores inválidos en `backend/src/services/automations.service.ts:479-486`.

**Cómo se rompe:** activar borrador sin acciones → backend falla, estado local cambia hasta recargar.

**Arreglo mínimo:** esperar `response.ok`, usar respuesta canónica y no mutar en error.

### P2-18 — Campos visibles se descartan silenciosamente

**Severidad:** P2. El usuario recibe éxito pero pierde datos.

**Evidencia:** subrole se captura pero no se envía en `src/modals/NewAgenteModal.jsx:32,43-52,66`; tipo/categoría de Playbook se omiten en `NewPlaybookModal.jsx:25-31,43-45`; autor de artículo se omite en `NewArticuloModal.jsx:26-32,46`.

**Cómo se rompe:** rellenar, crear y recargar → el dato no existe.

**Arreglo mínimo:** retirar controles o implementar contrato+persistencia+lectura.

### P2-19 — Facetas, KPIs y selectores del frontend operan sobre páginas parciales

**Severidad:** P2. La interfaz afirma “0” u omite registros que sí existen.

**Evidencia:** Leads filtra la página cargada (`src/components/Leads.jsx:163-209`); Reuniones calcula tabs/KPIs locales (`Reuniones.jsx:97-119,260-292`); Calls mezcla total global y filtrado (`Calls.jsx:139-149,195-206,253`); Campaigns/Landings/selector social se limitan a 100 (`Campaigns.jsx:39,214-250,301-304`, `LandingsPage.jsx:228-278`, `ConectarRedesPage.jsx:150-160`).

**Cómo se rompe:** dato relevante en página 2 o campaña 101 → filtro/KPI/selector no lo ve; footer Calls muestra total global para resultado filtrado.

**Arreglo mínimo:** filtros/agregados server-side y paginación completa de selectores.

### P2-20 — Metricool convierte cualquier 403 en “mejora tu plan”

**Severidad:** P2. Da una instrucción falsa al usuario.

**Evidencia:** frontend colapsa 403 en `src/pages/ConectarRedesPage.jsx:125-147,303-310`; backend diferencia `PLAN_CAPABILITY_REQUIRED` e `INTEGRATION_DISABLED` en `backend/src/controllers/metricool.controller.ts:37-60`.

**Cómo se rompe:** plan Completo + integración deshabilitada → UI recomienda comprar el plan.

**Arreglo mínimo:** parsear `code` con la utilidad de plan gate.

### P2-21 — Guardar Configuración puede persistir solo la mitad

**Severidad:** P2. El mensaje contradice el estado real.

**Evidencia:** `src/components/Configuracion.jsx:291-327` lanza dos PUT independientes/concurrentes.

**Cómo se rompe:** organización 200 + preferencias 500 → parte queda guardada, UI informa fallo total.

**Arreglo mínimo:** resultados independientes y recarga canónica, o endpoint transaccional único.

### P2-22 — Un fallo de estadísticas se muestra como actividad cero

**Severidad:** P2. Confunde indisponibilidad con dato real.

**Evidencia:** `src/pages/AgentDetailPage.jsx:43-60,81-93` sustituye fallo por ceros.

**Cómo se rompe:** detalle 200 + stats 500 → 0 llamadas/reuniones/porcentaje.

**Arreglo mínimo:** estado de error separado y valores `—/no disponible`.

### P2-23 — Oportunidades perdidas se dibujan como Lead y pueden crearse sin motivo

**Severidad:** P2. Estado terminal se representa y valida de forma inconsistente.

**Evidencia:** `closed_lost` mapea a `lead` en `src/pages/OpportunityDetailPage.jsx:13-23,135-154,447-449,504-525`; el modal permite crearla en `src/modals/NewOportunidadModal.jsx:9,176-181`, mientras el comando normal exige motivo en `backend/src/controllers/pipeline.controller.ts:122-127`.

**Cómo se rompe:** una perdida resalta primera etapa; crear directamente perdida evita motivo obligatorio.

**Arreglo mínimo:** estado terminal visual separado y prohibir terminales en create o exigir el mismo comando.

### P2-24 — Campaigns permite que respuestas antiguas sobrescriban filtros nuevos

**Severidad:** P2. La lista puede mostrar una búsqueda anterior.

**Evidencia:** `src/components/Campaigns.jsx:186-212,236` no aborta ni versiona requests.

**Cómo se rompe:** A lenta, B rápida → B aparece y luego A la reemplaza.

**Arreglo mínimo:** `AbortController` o request-id vigente.

### P2-25 — La página pública confunde 5xx con enlace inexistente

**Severidad:** P2. Oculta una caída recuperable y pide un enlace nuevo.

**Evidencia:** `src/pages/PublicCampaignSharePage.jsx:30-45,60-62` convierte todo HTTP no-ok en `not-found` y no ofrece retry.

**Cómo se rompe:** API 500 → mensaje “enlace no disponible”.

**Arreglo mínimo:** distinguir 404/410 de 5xx y añadir reintento.

### P2-26 — “Enviar a Mautic” puede crear una automatización sin esa acción

**Severidad:** P2. El checkbox visible no se materializa en el payload.

**Evidencia:** `src/modals/NewAutomatizacionModal.jsx:41-60` solo añade acción si `segmentAlias` no está vacío, pero no lo valida.

**Cómo se rompe:** marcar Mautic, alias vacío, crear → `actions: []` y borrador inactivo.

**Arreglo mínimo:** alias obligatorio al marcar y submit bloqueado.

### P2-27 — No hay CI ni linter y el frontend carece de suite real

**Severidad:** P2. Ya existen dos tests operativos rotos que ningún gate ejecuta antes de merge.

**Evidencia:** no existe `.github/workflows/`; `package.json:6-11` solo ofrece dev/build/gates manuales y ningún `test/lint`; `backend/package.json:4-16` tiene tests pero no lint; no hay config ESLint/Prettier en raíz/backend. De 109 ficheros frontend, el único test de aplicación es `src/lib/planGate.test.mjs`.

**Cómo se rompe:** una migración sin trackear y un contrato PUT incompatible pueden integrarse aunque build/TypeScript pasen.

**Arreglo mínimo:** CI con install reproducible, frontend build+tests, backend tsc+tests, auditor Prisma `--strict`, lint y checks de migraciones.

## P3 — Menores / deuda técnica

### P3-01 — El CSV de reuniones no escapa celdas

**Severidad:** P3. Exportaciones quedan corruptas con datos comunes.

**Evidencia:** `src/components/Reuniones.jsx:315-322` concatena valores sin quoting.

**Cómo se rompe:** empresa `Acme, S.L.` crea una columna adicional; comillas/saltos también rompen filas.

**Arreglo mínimo:** reutilizar el exportador CSV escapado del backend o quote RFC 4180.

### P3-02 — Ficheros monolíticos concentran contratos y reglas sin frontera de prueba

**Severidad:** P3. Es deuda de mantenibilidad, no un fallo runtime aislado.

**Evidencia:** `backend/src/services/mauticSync.service.ts` (~1.219 líneas), `pipeline.service.ts` (~1.048), `automations.service.ts` (~828), `src/pages/OpportunityDetailPage.jsx` (~1.123) y `src/components/Pipeline.jsx` (~915). El P0-01 y P1-17 muestran el efecto concreto de propagar actor/contrato de forma inconsistente entre capas.

**Cómo se rompe:** cambios de scope, transición o shape deben replicarse manualmente en rutas/controllers/services/páginas y no existe contrato compartido que falle en compilación.

**Arreglo mínimo:** extraer comandos/queries por agregado y schemas compartidos generados; añadir tests antes de dividir, no hacer un rewrite total.

## 3. Código muerto / a borrar o decidir

| Elemento | Evidencia | Acción propuesta |
|---|---|---|
| `src/components/ui/FilterDropdown.jsx` | 98 líneas; sin imports externos | Borrar |
| `src/components/ui/DateRangePicker.jsx` | 109 líneas; sin imports externos | Borrar |
| `src/utils/dateHelpers.js` | Solo lo importa `DateRangePicker` muerto | Borrar junto al componente |
| `src/components/ui/ActionModal.jsx` | 94 líneas; sin imports externos | Borrar |
| `backend/_tmp_test_optimizer.ts` | No está en scripts/imports y queda fuera de `tsconfig` | Borrar o convertir en test real |
| `SalesSequenceStepRun.maxAttempts` | `schema.prisma:1702`; runtime usa `5` hardcodeado en `salesSequence.service.ts:250-257` | Usar o eliminar |
| `SalesSequenceStepRun.providerAttemptedAt` | `schema.prisma:1706`; sin lecturas/escrituras runtime | Implementar fence o eliminar |
| `SalesSequenceStepRun.meetingId/taskId` | `schema.prisma:1708-1724`; IDs solo se guardan dentro de `output` | Persistir columnas o eliminar relaciones |

**Postiz:** no queda código ejecutable activo. Solo aparece como historia de la baseline y en la migración de reemplazo; no hay rutas, controllers, services ni UI runtime que borrar.

## 4. Qué NO está roto

- Frontend y backend compilan; la suite backend completa pasa 106/106 y el runtime offline 4/4.
- `authenticate.ts:8-47` valida JWT de acceso, sesión persistida, expiración/revocación y paridad actual de usuario/org/rol.
- Refresh tokens opacos, hasheados y rotados atómicamente (`backend/src/services/auth.service.ts:30-37,74-103`).
- RBAC falla cerrado para roles/permisos desconocidos; el guard sí calcula bien el scope. P0-01 ocurre después, al perderlo en controllers.
- CORS usa allowlist y los secretos críticos rechazan defaults débiles (`backend/src/lib/securityConfig.ts:16-39`).
- Meta verifica HMAC antes de procesar; Stripe verifica firma/tolerancia; Mautic compara secretos/HMAC en tiempo constante. El defecto Mautic es trabajo previo y manejo posterior de errores.
- OAuth Meta/Google usa state opaco, PKCE cifrado, hash persistido y consumo único.
- `EmailDelivery` tiene claim, lease, backoff y estado `uncertain`; el outbox tiene claim atómico, renovación, retry exponencial y dead-letter.
- El scheduler temporal crea trigger+outbox en transacción y revalida vigencia.
- Opportunity/Product/Revenue usan `Decimal` y Ads usa céntimos enteros; los defectos monetarios están en parseo/agregación multi-moneda.
- Public media evita path traversal; campaign share selecciona solo campos públicos; las URLs S3 de lectura caducan en una hora.
- No se encontraron SQL raw inseguro, ejecución dinámica ni credenciales reales versionadas.
- La retirada de Postiz está limpia en runtime.
- En el smoke test, el login renderizó contenido útil sin overlay ni errores de consola y el selector EN→ES actualizó toda la pantalla.

## 5. Orden mínimo recomendado

1. P0-01 y P0-02, con regresiones automáticas.
2. P1-01 a P1-06: tenant isolation, SSRF, webhooks, entitlements y migración.
3. Operaciones externas P1-07 a P1-16 mediante outbox/idempotencia/reconciliación.
4. Flujos frontend P1-17 a P1-22 y retirada inmediata de datos simulados.
5. CI/lint/contratos compartidos y después el resto de P2/P3.
