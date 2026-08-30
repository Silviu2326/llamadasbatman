# Plan: integración contextual de microapps

Versión ejecutable de `INTEGRACION_CONTEXTUAL_MICROAPPS.md`. Aquel documento fija la dirección; este fija qué se construye, en qué orden y cómo se sabe que está hecho. Fecha: 2026-08-22.

## 0. Punto de partida (lo que ya existe)

No partimos de cero. Esto está en el código y se reutiliza:

| Pieza | Dónde | Estado |
|---|---|---|
| Contrato del manifiesto con `dataAccess`, `effects`, `approvalAction`, `estimateCost`, `freshnessDays`, `followUps` | `backend/src/microapps/types.ts:70` | Completo |
| `MicroappRun` con `leadId`, `accountId`, `productionId`, `staleAt`, snapshots RBAC | `backend/prisma/schema.prisma` (`model MicroappRun`) | Completo |
| Endpoint de ejecución que valida `leadId/accountId/productionId` contra la org | `backend/src/controllers/microapps.controller.ts:322-410` | Completo |
| Listado de runs filtrado por entidad (`/api/microapps/runs?leadId=`) | mismo controlador | Completo |
| Prefill del runner desde `?leadId=`, `?accountId=`, `?productionId=` | `src/pages/MicroappRunnerPage.jsx:575-645` | Completo; solo rellena el primer campo con widget `lead`/`account` |
| Botones contextuales en ficha de lead (3 apps) y de cuenta (3 apps) | `LeadDetailPage.jsx:615`, `AccountsPage.jsx:57` | Hardcodeados por página |
| Historial de runs en la pestaña "Investigación" del lead | `LeadDetailPage.jsx:378-399` | Solo lead; lista, no proyecta |
| Acciones de seguimiento en el resultado | `MicroappRunnerPage.jsx:340-360` | **Solo navegación.** Las mutaciones (`create_task`, `update_crm`, `email`…) están deliberadamente desactivadas |

Huecos reales, medidos:

- **Solo 1 microapp declara `widget: 'lead'`** (`call-prep`). 8 declaran `account`, 7 `asset`. El resto pide texto libre (`company`, `transcript`, `discoveryNotes`…) aunque el dato esté en el CRM. El prefill no les sirve.
- **~140 `kind` distintos de followUp** en los manifiestos, sin catálogo cerrado; el frontend solo ejecuta los de navegación. La promesa "resultado → siguiente acción" hoy es un chip que no hace nada.
- **No existe almacenamiento de configuración por organización/equipo** para microapps (ni modelo ni endpoint). Los "4 niveles de configuración" son hoy 1 nivel: la ejecución.
- **`CallDetailPage` y `OpportunityDetailPage` no tienen ninguna referencia a microapps.** Dos de las tres superficies de la Ola 1 están vacías.
- Las superficies están hardcodeadas en cada página. Añadir una microapp a una ficha es editar JSX.

## 1. Principios de ejecución

1. **Mecanismo antes que catálogo.** No se tocan 147 microapps. Se construye el mecanismo con 7 y se deja un procedimiento de 5 líneas para las demás.
2. **Extender, no duplicar.** No se crea un tipo `MicroappPlacement` aparte; se amplía `MicroappManifest`. `contextBindings` se deriva de los widgets de entidad del `uiSchema`, no se declara dos veces.
3. **Toda escritura pasa por un adapter con RBAC.** Una microapp nunca escribe en el CRM directamente; devuelve una *proyección* y el adapter la aplica (o la deja como propuesta si `effects: 'external'` o falta permiso).
4. **Cada fase acaba con algo usable desde una ficha**, no con infraestructura sin botón.

## 2. Fase 0 — Contrato (backend, sin UI)

Objetivo: que el manifiesto pueda decir *dónde vive* y *qué proyecta* sin cambiar cómo se ejecuta.

### 2.1 Ampliar `MicroappManifest` (`types.ts`)

```ts
// Nuevos widgets de entidad en UiFieldSpec.widget
widget: ... | 'lead' | 'account' | 'asset' | 'call' | 'opportunity' | 'conversation' | 'meeting'

// Nuevo en MicroappManifest (opcional; las apps sin placement siguen siendo válidas)
placements?: Array<{
  surface: MicroappSurface   // 'lead' | 'account' | 'call' | 'opportunity' | 'conversation' | 'meeting' | 'campaign' | 'landing' | 'asset' | 'production' | 'flow' | 'client'
  role: 'primary' | 'secondary'
  trigger: 'manual' | 'after_call' | 'after_create' | 'recommended'
  actionLabel: string        // "Preparar llamada", nunca "Abrir microapp"
}>
resultProjection?: {
  kind: 'brief' | 'score' | 'sequence' | 'proposal' | 'evidence' | 'asset' | 'action'
  target: MicroappSurface    // entidad que recibe la proyección
  pin?: boolean              // se fija en la ficha hasta caducar (staleAt)
}
configurationScope?: Array<'organization' | 'team' | 'user' | 'run'>
```

`MicroappSurface` es un enum cerrado. Un `placement.surface` solo es válido si el `uiSchema` tiene un widget de esa entidad (o la app opera sobre la org, como `voice-of-customer`). `registerMicroapp` lo valida.

### 2.2 Cerrar el catálogo de followUps

Sustituir los ~140 `kind` libres por un enum de ~15 con semántica de plataforma:

```
navigate | run_microapp | create_task | create_note | create_meeting |
send_email_draft | update_lead_field | update_stage | create_opportunity |
create_document | create_asset | create_campaign_draft | request_approval | queue_call
```

Cada `kind` lleva `params` tipados. Los manifiestos actuales se migran con un mapa `legacyKind → kind` en un solo commit; los que no mapean pasan a `navigate` con `route`. Test: ningún manifiesto registra un `kind` fuera del enum.

### 2.3 Endpoint de descubrimiento por superficie

`GET /api/microapps/surfaces/:surface?entityId=` devuelve las microapps con `placement` en esa superficie **filtradas por RBAC del usuario** (reusa `dataAccess` / roles) con `actionLabel`, `role`, coste estimado y última ejecución sobre esa entidad. Sustituye a los arrays hardcodeados de `LeadDetailPage` y `AccountsPage`.

### 2.4 Resolver contexto en servidor

Hoy el prefill mete el `leadId` en el input y cada microapp carga lo que quiere. Se formaliza: `MicroappCtx` gana `context: { lead?, account?, call?, opportunity? }` resuelto por el runtime a partir de `leadId/accountId/callId/...` del body, **ya filtrado por `dataAccess`**. Si el usuario no puede leer notas, `context.lead.notes` viene vacío y el resultado incluye `limitations: ['notes_redacted']`. Las microapps dejan de hacer su propio `prisma.lead.findFirst`.

**Entregable Fase 0:** tipos + validación en `registerMicroapp` + endpoint de superficies + migración de followUps. Sin cambios visibles. Tests: registry rechaza placement sin widget; enum de followUps; surfaces respeta RBAC.

## 3. Fase 1 — Proyección y acciones (backend + runner)

Objetivo: que un resultado vuelva a la entidad y que los chips de acción hagan algo.

### 3.1 Tabla de proyecciones

```prisma
model MicroappProjection {
  id        String   @id @default(cuid())
  orgId     String
  runId     String   @unique
  kind      String   // brief | score | ...
  surface   String   // lead | call | ...
  entityId  String
  payload   Json     // lo que pinta la ficha
  pinned    Boolean  @default(true)
  staleAt   DateTime?
  createdAt DateTime @default(now())
  @@index([orgId, surface, entityId, pinned])
}
```

El runtime la escribe al completar el job si el manifiesto tiene `resultProjection`. `GET /api/microapps/projections?surface=&entityId=` la sirve a la ficha. Cuando `staleAt` pasa, la ficha la muestra atenuada con "Volver a generar".

### 3.2 Adapter de followUps

`backend/src/microapps/followUpAdapter.ts`: un `switch` sobre el enum de 2.2. Cada rama comprueba permiso (`create_task` → `tasks:write`, `update_stage` → `pipeline:write`…), aplica la mutación y registra en `AuditLog`. Si `effects: 'external'` o hay `approvalAction`, crea una aprobación en lugar de ejecutar. `POST /api/microapps/runs/:runId/actions` lo expone.

### 3.3 Runner

`ActionChips` deja de ser solo navegación: llama a 3.2 y muestra el resultado ("Tarea creada · ver"). Se elimina el comentario *"las mutaciones siguen desactivadas hasta tener un adapter"* porque el adapter existe.

**Entregable Fase 1:** desde `/microapps/call-prep?leadId=` el brief queda fijado en el lead y "Crear tarea" crea la tarea. Tests: proyección escrita al completar; adapter rechaza sin permiso; `external` genera aprobación y no ejecuta.

## 4. Fase 2 — Ola 1: llamadas y leads (las 7 microapps)

Objetivo: la experiencia que describe el doc, en las tres fichas que importan. Cada app se hace completa (schema → placement → proyección → followUps) antes de pasar a la siguiente.

| # | Microapp | Cambio de input | Placement | Proyección | FollowUps |
|---|---|---|---|---|---|
| 1 | `call-prep` | Ya recibe `leadId`. Añadir `callId?` para prepararla desde una llamada programada | `lead` primary, `call` primary (manual) | `brief` → lead/call, pinned | `create_task`, `queue_call`, `create_meeting` |
| 2 | `company-research-360` | `companyName`/`website` se derivan de `accountId` o `leadId`; se mantienen como override | `account` primary, `lead` secondary | `evidence` → account | `create_lead`, `run_microapp(call-prep)` |
| 3 | `post-call-followup-generator` | **Reescribir input**: `callId` sustituye a `transcript`/`participants`/`crmStage` (todo sale de la llamada y su lead) | `call` primary (`after_call`) | `sequence` → call + lead | `send_email_draft`, `create_task`, `update_lead_field` |
| 4 | `voice-of-customer` | Ya opera sobre la org por `daysBack`. Añadir filtro opcional `leadId`/`accountId` | `call` secondary, `conversation` secondary | `evidence` → org (Knowledge Base), sin pin | `create_note`, `create_document` |
| 5 | `explainable-prospect-scoring` | `company`/`website`/`products` → `leadId` (+ `products` desde la info de empresa de la org) | `lead` primary (`after_create`, `manual`) | `score` → lead (campo `aiScore` + explicación) | `update_stage`, `run_microapp(call-prep)` |
| 6 | `buying-signal-radar` | igual que 5, sobre `accountId` | `account` primary, `lead` secondary | `evidence` → account, pinned | `create_task`, `queue_call` |
| 7 | `hyperpersonalized-sequence` | `leadIds[]` (selección múltiple desde la lista de leads) | `lead` primary (desde selección en `/leads`) | `sequence` → cada lead | `send_email_draft`, `create_task` |

Nota sobre la 3: la app actual (`growthSalesPackB.ts:282`) pide la transcripción en un `textarea` marcado `sensitive`. Es exactamente la pantalla que el doc quiere eliminar y, además, un riesgo: el usuario copia transcripciones a mano. Es la reescritura más valiosa de la ola.

### 4.1 Fichas

- **`LeadDetailPage`**: sustituir `LEAD_RESEARCH_MICROAPPS` por `GET /surfaces/lead`. Bloque "Proyecciones" arriba de la ficha (brief fijado, score con explicación). El historial de runs se queda en Investigación.
- **`CallDetailPage`** (hoy 0 referencias): "Preparar llamada" si es futura, "Preparar follow-up" si ya ocurrió (trigger `after_call` → se ofrece automáticamente al cerrar). Panel lateral con el brief/secuencia.
- **`AccountsPage`**: sustituir los 3 botones hardcodeados por surfaces. Señales de `buying-signal-radar` como tarjeta fijada.
- **Lista de leads**: selección múltiple → "Crear secuencia" (app 7).
- **Runner como drawer**: desde la ficha el runner se abre como panel lateral, no como navegación a `/microapps/:id`. Mismo componente, distinto contenedor. `/microapps/:id` sigue existiendo para el catálogo.

**Entregable Fase 2:** las 7 apps funcionan desde su ficha sin pedir nada que esté en el CRM. Aceptación: `MicroappRun` con entidad vinculada ≥ 80 % de las ejecuciones de estas 7.

## 5. Fase 3 — Configuración por niveles

Objetivo: que el usuario edite "Objetivo de llamada" y "Tono", no prompts.

- `model MicroappConfig { orgId, microappId, scope: organization|team|user, scopeId?, values Json }`.
- El runtime fusiona `org → team → user → run` antes de validar con `inputSchema`. `UiFieldSpec` gana `scope?: 'organization' | 'team' | 'user' | 'run'` para decidir qué se muestra en Configuración y qué en la ejecución.
- UI: pestaña "Configurar" en `/microapps/:id` separada de "Ejecutar". En la ficha solo aparecen los campos con `scope: 'run'`.

**Entregable:** `call-prep` desde el lead muestra solo "Objetivo"; tono, idioma y límites vienen de la org.

## 6. Fase 4 — Automatizar y recomendar

- Triggers `after_call` y `after_create` conectados a los eventos de dominio existentes para crear el run automáticamente si la org lo activa en `MicroappConfig`.
- Nodo "Microapp" en Flows (`backend/src/flows`) que consume `placements` y `resultProjection` para encadenar.
- `next-microapp-recommender` reimplementado como función de plataforma (`placements` + última proyección + permisos), no como microapp con prompt.

## 7. Fase 5 — Migrar el resto del catálogo

Procedimiento por microapp (≈20 min, delegable):

1. Cambiar inputs de texto libre por widgets de entidad donde el dato exista en CRM.
2. Declarar `placements` (1 primary, ≤2 secondary) y `resultProjection`.
3. Mapear `followUps` al enum.
4. Añadir caso al test de superficies.

Orden: Ola 2 (pipeline/cliente) → Ola 3 (captación) → Ola 4 (Studio) → Ola 5 (sistema), como las lista el doc de dirección. Cada ola se decide al terminar la anterior, con las métricas de §9.

## 8. Qué se retira

- Arrays `LEAD_RESEARCH_MICROAPPS` y botones hardcodeados en `AccountsPage`.
- `kind` libres en followUps.
- Inputs `transcript`, `discoveryNotes`, `companyName` en apps que tienen la entidad disponible.
- Comentario y bloqueo de mutaciones en `ActionChips`.
- La matriz de 147 líneas del doc de dirección pasa a anexo; la fuente de verdad de "dónde vive cada app" es `placements` en el manifiesto, expuesto por `/surfaces`.

## 9. Métricas (medibles desde el día 1 de Fase 2)

| Métrica | Fuente | Objetivo Ola 1 |
|---|---|---|
| % runs con entidad vinculada | `MicroappRun.leadId/accountId/callId` | ≥ 80 % en las 7 apps |
| % runs con proyección | `MicroappProjection` / `MicroappRun` | ≥ 90 % en apps con `resultProjection` |
| % runs con acción posterior | `POST /runs/:id/actions` | ≥ 40 % |
| Tiempo apertura de ficha → resultado | evento frontend | < 90 s para `call-prep` |
| Coste estimado vs real | `estimateCost` vs ledger | desvío < 25 % |
| Runs iniciados desde `/microapps` vs desde ficha | `referrer` en el body de ejecución | invertir la proporción actual |

## 10. Orden y dependencias

```
Fase 0 (contrato) ──► Fase 1 (proyección + adapter) ──► Fase 2 (Ola 1: 7 apps + 3 fichas)
                                                              │
                                                              ├──► Fase 3 (configuración)
                                                              └──► Fase 4 (automatizar)
                                                                         │
                                                                         └──► Fase 5 (resto)
```

Fases 0 y 1 son backend y no bloquean a nadie. Fase 2 es donde el producto cambia y donde hay que parar a medir. Fases 3 y 4 pueden ir en paralelo. Fase 5 no se planifica hasta tener datos de la 2.

## 11. Riesgos

- **Reescribir inputs rompe runs históricos.** Mitigación: `version` en el manifiesto ya existe; el runner muestra runs antiguos con su `input` tal cual y solo permite "Reutilizar entrada" si el schema actual lo acepta.
- **El adapter de followUps abre escrituras en el CRM desde IA.** Mitigación: RBAC por kind, `AuditLog` obligatorio, `effects: 'external'` siempre por aprobación, y `update_stage` nunca sin confirmación explícita del usuario en la UI.
- **Migrar ~140 kinds a mano.** Mitigación: mapa legacy en un solo commit + test que falla si aparece un kind fuera del enum.
- **Las fichas se llenan de botones.** Regla: 1 acción primary visible + menú "Más capacidades" para las secondary.
