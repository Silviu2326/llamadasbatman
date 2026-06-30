# Vozia — Backend Specification

> **Alcance de este backend:** CRM, datos, autenticación, campañas, leads,
> pipeline, reuniones, playbooks, automatizaciones y knowledge base.
>
> **Fuera de alcance (servicio separado):** generación de voz, ejecución del
> agente IA en tiempo real, telefonía (Twilio), transcripción en vivo.
> Ese servicio se integrará después vía webhooks y una API interna.

---

## Stack recomendado

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| Runtime | **Node.js 20 LTS** | Mismo ecosistema JS que el frontend |
| Framework | **Fastify** | Más rápido que Express, validación integrada |
| Base de datos | **PostgreSQL 16** | Relacional, soporte JSON, full-text search |
| ORM | **Prisma** | Migraciones, type-safety |
| Cache / Queues | **Redis** | Sesiones, pub/sub para WebSockets |
| Auth | **JWT + refresh tokens** | Stateless, multi-tenant |
| WebSockets | **Socket.io** | Actualizaciones en tiempo real desde el servicio de voz |
| Almacenamiento | **S3 / R2** | Grabaciones y archivos de Knowledge Base |
| Lenguaje | **TypeScript** | Type-safety con Prisma |

---

## Arquitectura: dos servicios

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│   este backend (CRM)    │        │  servicio de voz (separado)  │
│                         │        │                              │
│  - Auth / usuarios      │◄──────►│  - Agente IA en tiempo real  │
│  - Campañas / leads     │  API   │  - Generación de voz (TTS)   │
│  - Pipeline / meetings  │  interna│ - Telefonía (Twilio/etc.)   │
│  - Playbooks            │        │  - Transcripción en vivo     │
│  - Automatizaciones     │        │                              │
│  - Knowledge base       │        │  → al terminar cada llamada  │
│  - Dashboard / KPIs     │◄───────│    POST /api/calls/ingest    │
└─────────────────────────┘ webhook└──────────────────────────────┘
```

El servicio de voz es el que inicia y conduce la llamada. Cuando termina,
manda un payload a este backend con el resultado (transcript, duración,
outcome, grabación URL, sentimiento). Este backend lo persiste y dispara
automatizaciones.

---

## Estructura de carpetas

```
backend/
├── src/
│   ├── routes/          # Definición de endpoints
│   ├── controllers/     # Lógica de request/response
│   ├── services/        # Lógica de negocio
│   ├── models/          # Tipos Prisma + DTOs
│   ├── middlewares/     # Auth, rate limit, validación
│   ├── jobs/            # Workers BullMQ
│   ├── websockets/      # Handlers Socket.io
│   └── lib/             # S3, mailer, etc.
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── tests/
```

---

## Modelos de base de datos

### `Organization` (multi-tenant)
```
id, name, plan,
voice_service_api_key,   ← clave que el servicio de voz usa para autenticarse
created_at
```

### `User`
```
id, org_id (FK), email, password_hash, role (admin|agent|viewer),
name, created_at
```

### `Agent` (configuración del agente — la ejecución vive en el otro servicio)
```
id, org_id (FK), name, role, personality,
voice_id,        ← referencia al voice ID del servicio de voz
system_prompt, language, is_active, created_at
```

### `Campaign`
```
id, org_id (FK), agent_id (FK), name, status (draft|active|paused|done),
objective, start_date, end_date,
total_leads, contacted, meetings_scheduled,
playbook_id (FK nullable), created_at
```

### `Lead`
```
id, org_id (FK), campaign_id (FK nullable),
name, phone, email, company,
status (new|contacted|qualified|unqualified|converted),
source, tags[], custom_fields JSONB, created_at
```

### `Call` (registro post-llamada — rellenado por el servicio de voz)
```
id, org_id (FK), agent_id (FK), lead_id (FK), campaign_id (FK nullable),
external_call_id,   ← ID del servicio de voz (para correlacionar)
direction (inbound|outbound),
status (completed|failed|no-answer|busy),
duration_seconds, recording_url,
transcript TEXT, transcript_words JSONB,
sentiment (positive|neutral|negative), sentiment_score FLOAT,
summary TEXT,
outcome (none|meeting_scheduled|interested|rejected|callback),
callback_at TIMESTAMP, started_at, ended_at, created_at
```

### `Meeting`
```
id, org_id (FK), lead_id (FK), call_id (FK nullable), assigned_to (FK → User),
title, scheduled_at, duration_minutes,
status (scheduled|completed|cancelled|no-show),
notes TEXT, meeting_url, created_at
```

### `Opportunity` (Pipeline)
```
id, org_id (FK), lead_id (FK), assigned_to (FK → User),
name, stage (lead|qualified|proposal|negotiation|closed_won|closed_lost),
value DECIMAL, currency, probability INT,
expected_close_date, notes TEXT, created_at
```

### `Playbook`
```
id, org_id (FK), name, description,
steps JSONB, tags[], is_active, created_at
```

### `Automation`
```
id, org_id (FK), name, trigger JSONB, actions JSONB[],
is_active, runs_count, last_run_at, created_at
```

### `KnowledgeBase`
```
id, org_id (FK), name, type (document|faq|url),
content TEXT, file_url, is_active, created_at
```

---

## Rutas y controladores

### Auth `/api/auth`
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/login` | Email + password → JWT |
| POST | `/refresh` | Refresh token → nuevo JWT |
| POST | `/logout` | Invalida refresh token |

### Agents `/api/agents`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Lista agentes de la org |
| POST | `/` | Crear agente (config + prompt) |
| GET | `/:id` | Detalle + métricas |
| PUT | `/:id` | Actualizar config / prompt |
| DELETE | `/:id` | Desactivar |
| GET | `/:id/stats` | Calls, conversiones, sentimiento |

### Calls `/api/calls`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Lista con filtros (agent, campaign, status, date) |
| GET | `/:id` | Detalle + transcript + grabación |
| POST | `/ingest` | **Webhook interno** — el servicio de voz envía el resultado de una llamada |
| GET | `/live` | Llamadas en curso (estado vía WS, datos vienen del servicio de voz) |

### Leads `/api/leads`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Lista con filtros + paginación |
| POST | `/` | Crear lead individual |
| POST | `/import` | CSV bulk import |
| PUT | `/:id` | Actualizar lead |
| GET | `/:id/timeline` | Historial de calls, meetings, notas |

### Campaigns `/api/campaigns`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Lista campañas |
| POST | `/` | Crear campaña |
| PUT | `/:id` | Editar |
| POST | `/:id/start` | Activar — envía lista de leads al servicio de voz |
| POST | `/:id/pause` | Pausar — notifica al servicio de voz |
| GET | `/:id/stats` | Métricas en tiempo real |

### Meetings `/api/meetings`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Lista reuniones |
| POST | `/` | Crear manualmente |
| PUT | `/:id` | Actualizar estado / notas |

### Pipeline `/api/pipeline`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Oportunidades por stage |
| POST | `/` | Crear oportunidad |
| PUT | `/:id` | Mover stage, editar valor |

### Playbooks `/api/playbooks`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Lista |
| POST | `/` | Crear |
| PUT | `/:id` | Editar pasos |

### Automations `/api/automations`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Lista |
| POST | `/` | Crear (trigger + acciones) |
| PUT | `/:id/toggle` | Activar / desactivar |

### Knowledge Base `/api/knowledge`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Lista documentos |
| POST | `/` | Subir documento / URL |
| DELETE | `/:id` | Eliminar |

### Dashboard `/api/dashboard`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/stats` | KPIs globales (calls, leads, conversiones) |
| GET | `/activity` | Feed de actividad reciente |

---

## Middlewares

```
authenticate(req)       → valida JWT, adjunta req.user + req.orgId
authenticateVoiceService→ valida API key del servicio de voz (solo /calls/ingest)
authorize(roles[])      → verifica rol del usuario
rateLimiter             → 100 req/min por IP (Redis)
validateBody(schema)    → valida con Zod
tenantScope             → filtra queries por org_id automáticamente
```

---

## Jobs / Workers (BullMQ + Redis)

| Queue | Descripción |
|-------|-------------|
| `automation-runner` | Ejecuta acciones tras eventos (call recibida, lead actualizado…) |
| `campaign-dispatch` | Al activar campaña, envía lotes de leads al servicio de voz |

> Los jobs de transcripción, análisis IA y marcador de llamadas viven en el
> servicio de voz, no aquí.

---

## Flujo de una llamada saliente

```
1. Usuario activa campaña → POST /api/campaigns/:id/start
2. Este backend envía la lista de leads + config del agente al servicio de voz
3. El servicio de voz gestiona toda la telefonía, IA y transcripción
4. Al terminar cada llamada → servicio de voz hace POST /api/calls/ingest
5. Este backend persiste el resultado y emite evento WS al frontend
6. Si outcome = meeting_scheduled → crea Meeting automáticamente
7. automation-runner evalúa triggers de automatizaciones
```

---

## Variables de entorno

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=
JWT_REFRESH_SECRET=
VOICE_SERVICE_URL=        ← URL del servicio de voz separado
VOICE_SERVICE_SECRET=     ← clave compartida para validar su webhook
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
APP_URL=https://vozia.app
```

---

## Notas de seguridad

- `VOICE_SERVICE_SECRET` valida que solo el servicio de voz puede llamar a `/calls/ingest`
- Grabaciones servidas vía URLs pre-firmadas S3 (expiran en 1h)
- `org_id` en **todas** las queries — nunca confiar en el body del cliente
- API keys del servicio de voz nunca expuestas al frontend
