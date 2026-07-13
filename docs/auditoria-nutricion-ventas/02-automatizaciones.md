# Auditoría de Nutrición: Automatizaciones

## 1. Objetivo esperado

La especificación define un motor de acciones fiables sobre eventos de negocio con:

- trigger;
- condiciones;
- ramas;
- acciones;
- esperas;
- reintentos;
- logs;
- `runId`, estado, pasos, timestamps y error.

Referencia: [Especificación de Automatizaciones y Secuencias](../arquitectura-plataforma/07-especificacion-de-modulos.md#automatizaciones-y-secuencias).

## 2. Arquitectura actual

```text
Evento de dominio
   ├─ Redis/BullMQ ───────────────┐
   └─ OutboxEvent en Postgres ────┤
                                  ▼
                     runAutomationsForEvent()
                                  │
                     Automation + AutomationRun
                                  │
                    acciones secuenciales reales
           ┌──────────┬───────────┼──────────┬───────────┐
           ▼          ▼           ▼          ▼           ▼
        Prisma     WhatsApp     Llamada     Mautic       IA
```

Piezas principales:

- definición y validación: [automations.service.ts](../../backend/src/services/automations.service.ts);
- cola Redis: [automationRunner.ts](../../backend/src/jobs/automationRunner.ts);
- outbox durable: [outboxDispatcher.ts](../../backend/src/jobs/outboxDispatcher.ts);
- modelos: [Automation y AutomationRun](../../backend/prisma/schema.prisma#L454);
- UI de listado: [Automatizaciones.jsx](../../src/components/Automatizaciones.jsx);
- alta: [NewAutomatizacionModal.jsx](../../src/modals/NewAutomatizacionModal.jsx);
- detalle: [AutomacionDetailPage.jsx](../../src/pages/AutomacionDetailPage.jsx).

## 3. Funciones que sí existen

### 3.1 Definiciones persistidas

- listado, creación, lectura, activar/pausar y eliminar;
- aislamiento de lectura/mutación por `orgId` en el servicio;
- trigger JSON y acciones JSON;
- contador de ejecuciones y última ejecución.

Rutas actuales: [backend/src/routes/automations.ts](../../backend/src/routes/automations.ts).

### 3.2 Eventos canónicos

El motor reconoce siete eventos:

1. `call.completed`
2. `lead.inactive.7d`
3. `meeting.scheduled.24h`
4. `opportunity.proposal.3d`
5. `lead.created`
6. `lead.inactive.30d`
7. `message.received`

Definición: [automations.service.ts, líneas 7-27](../../backend/src/services/automations.service.ts#L7).

### 3.3 Acciones reales soportadas

- `log`;
- `update_lead_status`;
- `send_to_mautic_segment`;
- `send_whatsapp_template`;
- `queue_voice_call`;
- `send_email_template`;
- `ai_reply_whatsapp`.

Las acciones de WhatsApp, voz y email consultan `ContactConsent` antes de ejecutar en [automations.service.ts, líneas 157-199](../../backend/src/services/automations.service.ts#L157).

### 3.4 Ejecución durable parcial

- `AutomationRun` tiene clave única por organización, automatización y `triggerEventId`.
- Un run se reclama con `updateMany`, evitando dos workers sobre el mismo estado.
- `currentStep` permite reanudar desde el último paso guardado.
- Se registran intentos, input, output, error y timestamps.
- El outbox reintenta con backoff exponencial.

Evidencia: [automations.service.ts, líneas 117-210](../../backend/src/services/automations.service.ts#L117) y [outboxDispatcher.ts, líneas 8-42](../../backend/src/jobs/outboxDispatcher.ts#L8).

## 4. Eventos que se producen realmente

| Evento | Productor real | Estado |
| --- | --- | --- |
| `lead.created` | Orquestación de conversación/ingestión | Funciona solo para fuentes que pasan por `ingestLead()`/`orchestrateNewLead()`. |
| `call.completed` | Servicio de llamadas | Existe. |
| `message.received` | Servicio WhatsApp/conversaciones | Existe. |
| `lead.inactive.7d` | Ninguno | No operativo. |
| `lead.inactive.30d` | Ninguno | No operativo. |
| `meeting.scheduled.24h` | Ninguno | No operativo. |
| `opportunity.proposal.3d` | Ninguno | No operativo. |

La búsqueda de productores solo encuentra llamadas explícitas para los tres primeros. Los cuatro eventos temporales aparecen en el catálogo y en la UI, pero no existe scheduler o job que los emita.

## 5. Evaluación funcional

| Capacidad | Estado | Evaluación |
| --- | --- | --- |
| Crear flujo | Parcial | Solo un trigger y un conjunto muy limitado de acciones. |
| Condiciones | No existe | La UI muestra una fase “Regla”, pero no hay evaluación condicional. |
| Ramas | No existe | No hay if/else, switch ni salida por resultado. |
| Esperas | No existe | `nextRunAt` existe en el modelo, pero no se usa. |
| Eventos temporales | No operativo | Se ofrecen, pero no se producen. |
| Reintentos | Parcial | Outbox reintenta; no hay política por acción, máximo o dead-letter visible. |
| Idempotencia | Parcial | El run es idempotente, pero la acción externa no siempre lo es. |
| Historial | Backend parcial | `AutomationRun` existe; no hay API/UI de historial o step log. |
| Edición/versionado | No existe | Una automatización creada no se puede editar ni versionar. |
| Prueba/simulación | No existe | No hay dry-run, payload de ejemplo o validación de alcance. |
| Plantillas de flujo | Decorativo | Las tarjetas abren el formulario vacío y algunas prometen acciones no soportadas. |
| Permisos | Insuficiente | Todas las rutas usan solo autenticación. |

## 6. Hallazgos

### AU-01 · P0 · Disparadores temporales que nunca se ejecutan

La UI permite crear flujos para inactividad, reunión próxima y propuesta estancada en [NewAutomatizacionModal.jsx, líneas 9-17](../../src/modals/NewAutomatizacionModal.jsx#L9). No existe ningún productor para esos eventos.

**Impacto:** el usuario activa una automatización válida visualmente que nunca corre y no recibe ninguna advertencia.

**Corrección:** job `temporalEventScheduler` que consulte registros por `org.timezone`, genere claves de evento deterministas y publique al outbox. También debe existir un health indicator del scheduler.

### AU-02 · P0 · Idempotencia del run, pero no de cada efecto externo

Después de ejecutar una acción, el motor incrementa `currentStep`. Si Mautic/Twilio acepta el envío y el proceso cae antes de esa actualización, el reintento repetirá el efecto.

**Impacto:** emails o WhatsApps duplicados y llamadas repetidas.

**Corrección:** crear `AutomationStepRun` con clave única `runId + stepKey`; reservar la acción antes del efecto, usar idempotency keys del proveedor cuando existan y reconciliar estados inciertos antes de reintentar.

### AU-03 · P0 · Acciones omitidas se contabilizan como ejecutadas

Si falta teléfono/email o consentimiento, las ramas no ejecutan el envío, pero el motor avanza `currentStep`. Al final guarda `output.actionsExecuted = actions.length` y marca el run `succeeded`.

**Impacto:** el historial futuro diría “éxito” aunque no se hubiera realizado la acción comercial.

**Corrección:** resultado por paso `succeeded`, `skipped`, `blocked`, `failed`; código y razón estructurados, por ejemplo `CONSENT_MISSING`, `ADDRESS_MISSING` o `PROVIDER_UNAVAILABLE`.

### AU-04 · P1 · Un flujo fallido retrasa los siguientes flujos del mismo evento

El bucle ejecuta automatizaciones en serie y relanza el error en [automations.service.ts, líneas 117-214](../../backend/src/services/automations.service.ts#L117). Si la primera falla, las posteriores no se procesan hasta un reintento del evento.

**Corrección:** crear/reclamar todos los runs, ejecutarlos de forma independiente y devolver un resumen. Un fallo debe afectar a su run, no al resto de automatizaciones coincidentes.

### AU-05 · P1 · Reintentos sin límite ni dead-letter operativo

El outbox vuelve a `pending` con backoff, pero no hay máximo de intentos, estado `dead`, alerta ni herramienta para reintentar manualmente. `AutomationRun.nextRunAt` no participa en la ejecución.

**Corrección:** política configurable por tipo de error, límite, jitter, dead-letter, alerta y endpoint de replay con RBAC.

### AU-06 · P1 · Cobertura de eventos incompleta

Faltan productores para cambios comerciales esenciales:

- `lead.status.changed`;
- `lead.updated`;
- `opportunity.created`;
- `opportunity.stage.changed`;
- `meeting.created/rescheduled/completed/cancelled/no_show`;
- `email.opened/clicked/bounced/unsubscribed`;
- `task.due/overdue`;
- `consent.changed`.

Sin estos eventos, Nutrición y Ventas no pueden coordinarse de forma fiable.

### AU-07 · P1 · No hay condiciones, ramas ni esperas

La especificación las exige y la UI dice “Disparar · decidir · actuar”, pero el backend solo compara el nombre del evento y ejecuta una lista lineal.

**Corrección:** nodos tipados con condiciones AND/OR, ramas, delay absoluto/relativo, horario permitido y timeout.

### AU-08 · P1 · Descripción perdida

El modal coloca la descripción en `trigger.description`, pero `Automation` no tiene `description` y el mapeo de UI busca `a.description`. El servicio guarda el trigger, no un campo de descripción. Resultado: la descripción no aparece donde espera la UI.

Evidencia: [NewAutomatizacionModal.jsx, líneas 52-61](../../src/modals/NewAutomatizacionModal.jsx#L52), [schema.prisma, líneas 454-467](../../backend/prisma/schema.prisma#L454) y [automationMapping.js, líneas 45-64](../../src/lib/automationMapping.js#L45).

**Corrección:** añadir `description` al agregado de automatización y migrar `trigger.description` existente.

### AU-09 · P1 · Flujos activos sin garantía de completitud

La creación usa `isActive: true` por defecto y permite `actions: []`. No existe estado borrador, checklist, validación de referencias externas ni aprobación.

**Corrección:** estados `draft`, `validating`, `active`, `paused`, `archived`; solo activar una versión validada con al menos una acción útil.

### AU-10 · P1 · No hay edición, versionado, clonado ni rollback

Las rutas no ofrecen `PUT /:id`. Cualquier corrección exige borrar y recrear, perdiendo continuidad conceptual. Tampoco se sabe con qué definición se ejecutó un run histórico.

**Corrección:** `AutomationVersion` inmutable, borrador editable, publicación atómica y `versionId` en cada run.

### AU-11 · P1 · Historial existente pero inaccesible

La ficha afirma que solo hay conteo total, aunque `AutomationRun` ya guarda datos detallados en Prisma. No hay endpoints de runs ni pasos.

**Corrección:** lista paginada, detalle del run, filtros por estado/fecha/lead, timeline de pasos, payload redactado, error, reintento y enlace a lead/conversación.

### AU-12 · P1 · Validación insuficiente de definición

Se valida el tipo general de acción y dos parámetros, pero no:

- nombre vacío/límites;
- máximo de acciones;
- status permitido para `update_lead_status`;
- ownership/existencia de plantilla o segmento;
- tono IA permitido;
- variables requeridas;
- combinación trigger/acción;
- payload requerido por evento.

El controller tampoco usa Zod en [automations.controller.ts](../../backend/src/controllers/automations.controller.ts).

### AU-13 · P1 · Mutaciones sin RBAC ni auditoría de autor

Viewer, agent y admin pueden crear, activar, pausar o eliminar. El modelo no guarda `createdBy`, `updatedBy` o `publishedBy`.

**Corrección:** permisos separados para leer, editar, publicar, pausar, eliminar y reintentar; audit log de cada cambio.

### AU-14 · P1 · Redis y outbox duplican el camino sin una autoridad clara

Algunos eventos se publican en Redis y además se persisten en outbox. La clave de run evita gran parte de los duplicados, pero aumenta estados posibles y dificulta observabilidad.

**Corrección:** usar outbox como fuente de verdad; el dispatcher puede publicar jobs por `outboxEvent.id`, y el worker ejecuta. Si Redis está caído, el evento queda pendiente; no se necesita una segunda ejecución directa.

### AU-15 · P1 · Configuración operativa incompleta

Los workers solo arrancan con `BACKGROUND_WORKERS_ENABLED=true`, pero esa variable no figura en `backend/.env.example` y `docker-compose.yml` no levanta el backend worker.

**Impacto:** aplicación web saludable con automatizaciones detenidas silenciosamente.

**Corrección:** proceso worker explícito en despliegue, health endpoint por cola/scheduler, alerta por lag y documentación de variables.

### AU-16 · P2 · Plantillas de inicio engañosas

Las tarjetas no prefijan el formulario. “Seguimiento post-llamada” promete enviar email y crear tarea, pero `create_task` no está soportado. El clic solo abre el alta genérica en [Automatizaciones.jsx, líneas 20-24 y 77-79](../../src/components/Automatizaciones.jsx#L20).

**Corrección:** plantillas reales versionadas o eliminar las promesas no operativas.

### AU-17 · P2 · Optimismo de UI sin rollback

Activar/pausar actualiza estado local aunque la API falle, tanto en listado como detalle. El usuario puede ver “Activa” cuando el backend no cambió.

**Corrección:** esperar confirmación, deshabilitar durante la petición, mostrar error y restaurar el estado si falla.

## 7. Funcionalidades a crear

### 7.1 Constructor de flujos

Nodos iniciales:

| Tipo | Nodos MVP |
| --- | --- |
| Trigger | evento de dominio, webhook autorizado, fecha/tiempo transcurrido. |
| Condición | campo, estado, score, consentimiento, actividad, pertenencia a segmento. |
| Control | if/else, espera, ventana horaria, límite de frecuencia, finalizar. |
| Acción CRM | crear tarea, asignar propietario, añadir/quitar tag, actualizar campo/estado. |
| Acción canal | email, WhatsApp, llamada, notificación interna. |
| Acción ventas | crear oportunidad, mover etapa, agendar recordatorio, crear siguiente acción. |

### 7.2 Scheduler temporal

Debe generar eventos deterministas para:

- lead inactivo N días;
- oportunidad N días en etapa;
- reunión a T-24 h, T-2 h y T+15 min;
- tarea próxima/vencida;
- campaña o secuencia programada.

Reglas:

- considerar `Organization.timezone`;
- evitar doble emisión por entidad+regla+ventana;
- recalcular/cancelar cuando cambia la fecha o etapa;
- procesar backlog tras una caída sin tormenta de envíos.

### 7.3 Historial y operación

- dashboard de salud: cola, lag, fallos y dead-letter;
- runs paginados;
- step runs con resultados y latencias;
- replay desde un paso seguro;
- cancelar run en espera;
- ver definición/version usada;
- redacción de PII y secretos en payloads;
- alertas por tasa de fallo.

### 7.4 Versionado y gobernanza

- borrador y versión publicada;
- diff entre versiones;
- validación previa;
- simulación con un lead de prueba;
- aprobación para acciones masivas;
- rollback;
- archivo sin borrar historial.

## 8. API propuesta

| Método | Ruta | Uso |
| --- | --- | --- |
| POST | `/api/automations` | Crear automatización en borrador. |
| PUT | `/api/automations/:id/draft` | Editar nombre, descripción y grafo borrador. |
| POST | `/api/automations/:id/validate` | Validar referencias, permisos y alcance. |
| POST | `/api/automations/:id/simulate` | Dry-run con payload o entidad de prueba. |
| POST | `/api/automations/:id/publish` | Crear versión inmutable y activar. |
| POST | `/api/automations/:id/pause` | Pausar nuevas entradas. |
| POST | `/api/automations/:id/clone` | Clonar como borrador. |
| GET | `/api/automations/:id/runs` | Historial paginado. |
| GET | `/api/automations/:id/runs/:runId` | Pasos, estados y errores. |
| POST | `/api/automations/:id/runs/:runId/retry` | Reintento controlado. |
| POST | `/api/automations/:id/runs/:runId/cancel` | Cancelar espera o trabajo pendiente. |
| GET | `/api/automations/catalog` | Triggers/acciones disponibles y schemas. |
| GET | `/api/automations/health` | Estado de workers, outbox, scheduler y lag. |

## 9. Criterios de aceptación

Automatizaciones puede considerarse MVP operable cuando:

- todo trigger visible tiene un productor probado;
- un flujo no se activa si está vacío o contiene referencias inválidas;
- existe al menos condición, rama y espera;
- cada ejecución apunta a una versión inmutable;
- cada paso tiene estado, timestamps, resultado y error estructurado;
- los efectos externos son idempotentes o se reconcilian antes de repetir;
- falta de consentimiento/datos queda como `blocked` o `skipped`, no como acción ejecutada;
- un flujo fallido no bloquea otros flujos del mismo evento;
- hay máximo de reintentos, dead-letter y replay con permisos;
- el historial es visible y enlaza con lead, oportunidad, reunión o conversación;
- roles y audit log cubren edición, publicación, pausa, borrado y reintento;
- worker, outbox y scheduler exponen health y alertas;
- existen tests unitarios del evaluador, integración del runner y E2E de al menos un flujo por canal.
