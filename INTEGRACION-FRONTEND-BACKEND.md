# Integración Frontend ↔ Backend — VozIA

> Fecha: 2026-06-29  
> Estado actual: **Backend 100% construido. Frontend usa datos mock. Conexión: solo login.**

---

## Estado rápido

| Capa | Estado |
|------|--------|
| Backend Fastify (rutas, controladores, servicios) | ✅ Completo |
| Prisma schema (todos los modelos) | ✅ Completo |
| WebSockets (Socket.io) | ✅ Completo |
| Vite proxy `/api` → `localhost:3000` | ✅ Configurado |
| `apiFetch` helper con JWT | ✅ Existe |
| `AuthContext` + `ProtectedRoute` | ✅ Existen |
| Login page → `POST /api/auth/login` | ✅ Conectado |
| **Todos los demás componentes** | ❌ Datos mock hardcodeados |
| **Todos los modales ("Nueva X")** | ❌ Solo estado local, no llaman a la API |
| **Páginas de detalle** | ❌ No fetchean datos reales |
| **WebSocket en frontend** | ❌ No existe `socket.io-client` |

---

## A. Setup obligatorio antes de nada

### A1. Infraestructura

```bash
# PostgreSQL 16 corriendo localmente (o Docker)
docker run -d --name vozia-pg -e POSTGRES_PASSWORD=vozia -e POSTGRES_DB=vozia -p 5432:5432 postgres:16

# Redis
docker run -d --name vozia-redis -p 6379:6379 redis:7
```

### A2. Variables de entorno del backend

Copiar y rellenar `backend/.env` desde `backend/.env.example`:

```env
DATABASE_URL=postgresql://postgres:vozia@localhost:5432/vozia
REDIS_URL=redis://localhost:6379
JWT_SECRET=algún_secreto_seguro
JWT_REFRESH_SECRET=otro_secreto_seguro
VOICE_SERVICE_URL=http://localhost:4000    # ← servicio de voz (MIGRACION-VOZ.md)
VOICE_SERVICE_SECRET=clave_compartida
PORT=3000
# S3 opcionales — dejar vacíos si no se usa almacenamiento todavía
```

### A3. Migraciones y seed

```bash
cd backend
npm install
npx prisma migrate dev --name init
npx prisma generate
npm run db:seed        # crea org demo + usuario admin + datos de ejemplo
```

> **Importante:** El seed en `backend/prisma/seed.ts` debe crear al menos:  
> - 1 `Organization`  
> - 1 `User` con contraseña conocida (p.ej. `admin@vozia.app` / `admin1234`)  
> - Datos de ejemplo para que el frontend no muestre pantallas vacías

### A4. Arrancar ambos servicios

```bash
# Terminal 1 — backend
cd backend && npm run dev     # puerto 3000

# Terminal 2 — frontend
npm run dev                   # puerto 5173, proxy /api → 3000
```

---

## B. Frontend — Reemplazar datos mock por fetch real

### Patrón estándar para cada componente

```jsx
// ANTES (mock):
const CAMPAIGNS = [{ id: 1, nombre: 'Demo', status: 'activa' }, ...]

// DESPUÉS (API):
import { apiFetch } from '../lib/api'

const [campaigns, setCampaigns] = useState([])
const [loading, setLoading]     = useState(true)
const [error, setError]         = useState(null)

useEffect(() => {
  apiFetch('/api/campaigns')
    .then(r => r.json())
    .then(data => setCampaigns(data.campaigns ?? data))
    .catch(e => setError(e.message))
    .finally(() => setLoading(false))
}, [])
```

### B1. Dashboard — `src/components/Dashboard.jsx`

| Estado actual | Acción |
|--------------|--------|
| KPIs hardcodeados | `GET /api/dashboard/stats` |
| Feed de actividad hardcodeado | `GET /api/dashboard/activity` |

**Shapes de respuesta:**
```js
// GET /api/dashboard/stats
{ totalCalls, totalLeads, meetingsScheduled, conversionRate, activeCampaigns }

// GET /api/dashboard/activity
[ { type: 'call'|'meeting', data: {...}, createdAt } ]
```

### B2. Campañas — `src/components/Campaigns.jsx`

| Estado actual | Acción |
|--------------|--------|
| Array `CAMPAIGNS` hardcodeado | `GET /api/campaigns` |
| Modal "Nueva campaña" no llama a API | Modal debe `POST /api/campaigns` |
| Botón "Ver" → campaña seleccionada | Usar datos ya cargados |
| Botón "Editar" → modal | `PUT /api/campaigns/:id` |
| Botón start/pause campaña | `POST /api/campaigns/:id/start` o `/pause` |

**Mapeo de campos (API → UI):**
```
id → id
name → nombre
status: 'draft'|'active'|'paused'|'done' → 'borrador'|'activa'|'pausada'|'finalizada'
totalLeads → total
contacted → contactados
meetingsScheduled → reuniones
createdAt → fecha
```

### B3. Llamadas — `src/components/Calls.jsx`

| Estado actual | Acción |
|--------------|--------|
| Array `CALLS` hardcodeado | `GET /api/calls?page=1&limit=20` |
| Detalle de llamada hardcodeado | `GET /api/calls/:id` |

**Mapeo:**
```
durationSeconds → duracion (formatear a "m:ss")
sentiment: 'positive'|'neutral'|'negative' → 'positivo'|'neutro'|'negativo'
outcome: 'meeting_scheduled'|'interested'|'rejected'|... → traducir
recordingUrl → url del reproductor de audio
transcript → texto completo
summary → aiSummary (tab "Resumen IA")
```

### B4. Leads — `src/components/Leads.jsx`

| Estado actual | Acción |
|--------------|--------|
| Array `LEADS` hardcodeado | `GET /api/leads?page=1&limit=20` |
| Modal "Nuevo lead" no llama a API | `POST /api/leads` |
| Importar CSV | `POST /api/leads/import` (body: CSV text, header: text/csv) |
| Timeline del lead | `GET /api/leads/:id/timeline` |
| "Agendar" → NewReunionModal | Debe `POST /api/meetings` con leadId |

### B5. Agentes — `src/components/Agentes.jsx`

| Estado actual | Acción |
|--------------|--------|
| Array hardcodeado | `GET /api/agents` |
| Modal "Nuevo agente" | `POST /api/agents` |
| Toggle activo/inactivo | `PUT /api/agents/:id` con `{ isActive: bool }` |
| Stats del agente | `GET /api/agents/:id/stats` |

**Campos clave del agente:**
```
name, role, personality, voiceId, systemPrompt, language, isActive
```

### B6. Pipeline — `src/components/Pipeline.jsx`

| Estado actual | Acción |
|--------------|--------|
| Oportunidades hardcodeadas | `GET /api/pipeline` |
| Modal "Nueva oportunidad" | `POST /api/pipeline` |
| Mover stage (drag o select) | `PUT /api/pipeline/:id` con `{ stage }` |

**Stages del backend:** `lead | qualified | proposal | negotiation | closed_won | closed_lost`

### B7. Reuniones — `src/components/Reuniones.jsx`

| Estado actual | Acción |
|--------------|--------|
| Reuniones hardcodeadas | `GET /api/meetings` |
| Modal "Nueva reunión" | `POST /api/meetings` |
| Reprogramar | `PUT /api/meetings/:id` con nuevo `scheduledAt` |
| Cancelar | `PUT /api/meetings/:id` con `{ status: 'cancelled' }` |
| "Unirse" | Abrir `meetingUrl` de la reunión |

### B8. Playbooks — `src/components/Playbooks.jsx`

| Estado actual | Acción |
|--------------|--------|
| Hardcodeados | `GET /api/playbooks` |
| Modal "Nuevo playbook" | `POST /api/playbooks` |
| Editar | `PUT /api/playbooks/:id` |

### B9. Automatizaciones — `src/components/Automatizaciones.jsx`

| Estado actual | Acción |
|--------------|--------|
| Hardcodeadas | `GET /api/automations` |
| Modal "Nueva automatización" | `POST /api/automations` |
| Toggle activa/pausada | `PUT /api/automations/:id/toggle` |
| Editar | abrir modal con datos reales + `PUT /api/automations/:id` |

### B10. Knowledge Base — `src/components/KnowledgeBase.jsx`

| Estado actual | Acción |
|--------------|--------|
| Artículos hardcodeados | `GET /api/knowledge` |
| Modal "Nuevo artículo" | `POST /api/knowledge` |
| Eliminar artículo | `DELETE /api/knowledge/:id` |

---

## C. Modales — conectar mutaciones

Todos los modales de `src/modals/` actualmente manipulan estado local o no hacen nada al guardar. Cada uno debe:

```jsx
// Patrón general para cualquier modal de creación
async function handleSave(formData) {
  const res = await apiFetch('/api/RECURSO', {
    method: 'POST',
    body: JSON.stringify(formData),
  })
  if (!res.ok) { setError('Error al guardar'); return }
  const created = await res.json()
  onSuccess(created)   // callback al componente padre para añadir el item a la lista
  onClose()
}
```

| Modal | Endpoint | Campos mínimos requeridos |
|-------|----------|--------------------------|
| `NewCampaignModal` | `POST /api/campaigns` | `name`, `agentId?`, `objective?` |
| `NewLeadModal` | `POST /api/leads` | `name`, `phone?`, `email?`, `company?` |
| `NewAgenteModal` | `POST /api/agents` | `name`, `role`, `systemPrompt?` |
| `NewOportunidadModal` | `POST /api/pipeline` | `name`, `leadId`, `stage`, `value?` |
| `NewReunionModal` | `POST /api/meetings` | `title`, `leadId`, `scheduledAt` |
| `NewPlaybookModal` | `POST /api/playbooks` | `name`, `steps` |
| `NewAutomatizacionModal` | `POST /api/automations` | `name`, `trigger`, `actions` |
| `NewArticuloModal` | `POST /api/knowledge` | `name`, `type`, `content?` |

---

## D. Páginas de detalle — `src/pages/`

Cada página de detalle recibe el `:id` de la URL y debe fetchear el recurso:

| Página | Fetch principal | Fetch secundario |
|--------|----------------|-----------------|
| `AgentDetailPage` | `GET /api/agents/:id` | `GET /api/agents/:id/stats` |
| `LeadDetailPage` | `GET /api/leads/:id/timeline` | — |
| `CampaignDetailPage` | `GET /api/campaigns/:id` | `GET /api/campaigns/:id/stats` |
| `CallDetailPage` | `GET /api/calls/:id` | — |
| `MeetingDetailPage` | `GET /api/meetings/:id` | — |
| `AutomacionDetailPage` | `GET /api/automations/:id` | — |
| `ArticleDetailPage` | `GET /api/knowledge/:id` | — |
| `PlaybookDetailPage` | `GET /api/playbooks/:id` | — |
| `OpportunityDetailPage` | `GET /api/pipeline/:id` | — |

```jsx
// Patrón para cualquier detail page
const { id } = useParams()
const [data, setData] = useState(null)

useEffect(() => {
  apiFetch(`/api/RECURSO/${id}`)
    .then(r => r.json())
    .then(setData)
}, [id])
```

---

## E. `apiFetch` — mejoras necesarias

El helper actual en `src/lib/api.js` es mínimo. Añadir:

```js
// src/lib/api.js
export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('vozia_token')
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  // Token expirado → redirigir a login
  if (res.status === 401) {
    localStorage.removeItem('vozia_token')
    localStorage.removeItem('vozia_user')
    window.location.href = '/login'
    return res
  }

  return res
}
```

---

## F. WebSockets — tiempo real

El backend ya emite `call:completed` via Socket.io cuando llega una llamada del servicio de voz.

### F1. Instalar cliente

```bash
npm install socket.io-client
```

### F2. Hook reutilizable

```js
// src/hooks/useSocket.js
import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from '../contexts/AuthContext'

export function useSocket(onCallCompleted) {
  const { user } = useAuth()
  const socketRef = useRef(null)

  useEffect(() => {
    if (!user?.orgId) return
    const socket = io('http://localhost:3000')
    socketRef.current = socket

    socket.emit('join:org', user.orgId)
    socket.on('call:completed', onCallCompleted)

    return () => socket.disconnect()
  }, [user?.orgId])

  return socketRef
}
```

### F3. Uso en Dashboard y Calls

```jsx
// Dashboard.jsx
useSocket((call) => {
  // actualizar KPIs y feed de actividad en tiempo real
  setStats(prev => ({ ...prev, totalCalls: prev.totalCalls + 1 }))
  setActivity(prev => [{ type: 'call', data: call, createdAt: call.createdAt }, ...prev].slice(0, 20))
})

// Calls.jsx
useSocket((call) => {
  setCalls(prev => [call, ...prev])
})
```

---

## G. Logout — completar flujo

```jsx
// src/contexts/AuthContext.jsx — añadir llamada al backend
const logout = async () => {
  await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  localStorage.removeItem('vozia_token')
  localStorage.removeItem('vozia_user')
  setToken(null)
  setUser(null)
}
```

---

## H. Verificar que voiceRoutes compila

El archivo `backend/src/index.ts` importa `voiceRoutes` de `./routes/voice`. Verificar que `backend/src/routes/voice.ts` exporta correctamente `voiceRoutes`:

```bash
cd backend && npx tsc --noEmit   # debe pasar sin errores
```

---

## I. Seed data — asegurar que existe

El archivo `backend/prisma/seed.ts` debe crear datos de demo. Si no crea suficientes datos, el frontend mostrará listas vacías. Estructura mínima del seed:

```ts
// backend/prisma/seed.ts
const org = await prisma.organization.create({ data: { name: 'VozIA Demo', plan: 'pro' } })

const user = await prisma.user.create({
  data: {
    orgId: org.id,
    email: 'admin@vozia.app',
    passwordHash: await bcrypt.hash('admin1234', 10),
    name: 'Admin VozIA',
    role: 'admin',
  }
})

// Crear agentes, campañas, leads, llamadas de ejemplo...
```

---

## J. Orden de implementación recomendado

### Fase 1 — Funcional básico (1-2h)

1. `backend/.env` configurado
2. `prisma migrate dev` + `prisma db seed`
3. Verificar login funciona en navegador
4. Mejorar `apiFetch` (manejo 401)

### Fase 2 — Listas principales (2-3h)

Conectar en orden de visibilidad:
1. Dashboard (`/api/dashboard/stats` + `/api/dashboard/activity`)
2. Leads (`/api/leads`)
3. Campaigns (`/api/campaigns`)
4. Calls (`/api/calls`)
5. Agents (`/api/agents`)

### Fase 3 — Mutaciones (2-3h)

Conectar modales en el mismo orden que la fase 2.

### Fase 4 — Módulos secundarios (1-2h)

Pipeline, Reuniones, Playbooks, Automatizaciones, KnowledgeBase

### Fase 5 — Páginas de detalle (2-3h)

9 detail pages, siguiendo el patrón del apartado D.

### Fase 6 — WebSocket (1h)

Instalar `socket.io-client` + hook `useSocket` + wiring en Dashboard y Calls.

---

## K. Campos que el frontend muestra pero el backend NO tiene

Algunos campos del mock UI no existen en el schema Prisma actual:

| Campo UI | Componente | ¿Qué hacer? |
|----------|-----------|-------------|
| `avatar` / `foto` del agente | Agentes | Usar initiales del nombre como fallback |
| `score` de la llamada (0-100) | Calls | No existe en schema — mostrar N/A o calcular desde sentimentScore |
| `coachingScore` | Calls (tab Coaching) | No existe — mostrar placeholder |
| `painPoints` del lead | Leads | Usar `customFields` JSONB como almacén |
| `prioridad` de oportunidad | Pipeline | No existe — usar `probability` como proxy |
| `categoria` de artículo KB | KnowledgeBase | Usar campo `type` del schema |
| `ejecutar X veces` en automatización | Automatizaciones | `runsCount` existe, `maxRuns` no — ignorar o añadir al schema |

Para los campos que faltan en el schema: **no añadir todavía**. Mostrar el dato de `customFields` o un valor por defecto hasta que se confirme que son necesarios.

---

## L. Resumen ejecutivo

```
Trabajo estimado total: ~12-15h

Bloqueante: base de datos + seed (A)
Impacto mayor: fase 2 (conectar listas = el CRM funciona)
Complejidad real: media — el patrón es idéntico en todos los componentes
Riesgo: mapeo de nombres de campos ES ↔ EN — revisar uno a uno
```

El backend está listo. Todo el trabajo restante es **frontend plumbing**: cambiar arrays mock por `useEffect + apiFetch` y conectar modales a las mutaciones. No hay que crear ningún endpoint nuevo para el CRM base.
