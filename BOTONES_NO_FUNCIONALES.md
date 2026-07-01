# Botones no funcionales — Diagnóstico y plan de corrección

> Análisis completo del proyecto `llamadasrobin` (VozIA).  
> Fecha: 2026-06-27  
> Metodología: lectura directa de todos los componentes JSX.

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Convenciones de este documento](#2-convenciones)
3. [Sidebar](#3-sidebar)
4. [Dashboard](#4-dashboard)
5. [Campañas](#5-campañas)
6. [Llamadas](#6-llamadas)
7. [Leads](#7-leads)
8. [Agentes](#8-agentes)
9. [Pipeline](#9-pipeline)
10. [Reuniones](#10-reuniones)
11. [Playbooks](#11-playbooks)
12. [Automatizaciones](#12-automatizaciones)
13. [Knowledge Base](#13-knowledge-base)
14. [Problemas transversales](#14-problemas-transversales)
15. [Priorización](#15-priorización)

---

## 1. Resumen ejecutivo

Se identificaron aproximadamente **85 botones/elementos interactivos** sin funcionalidad real en 11 módulos del proyecto. La mayoría son `<button>` con `cursor: pointer` pero sin `onClick`. El patrón se repite de forma sistemática:

| Tipo de problema | Cantidad aprox. | Impacto |
|-----------------|----------------|---------|
| Paginación sin lógica | ~8 módulos | Alto — limita datos visibles |
| Filtros sin abrir nada | ~10 módulos | Alto — UI principal inútil |
| Acciones de panel de detalle sin onClick | ~15 botones | Alto — acciones clave bloqueadas |
| Dropdowns decorativos | ~10 botones | Medio |
| Tabs con contenido vacío | 3 módulos | Medio |
| Botones de exportar/importar | ~6 botones | Bajo-Medio |
| Botones de menú "⋯" sin acción | ~8 botones | Bajo |
| Toggles decorativos | ~4 botones | Bajo |

**Lo que SÍ funciona:**
- Navegación del sidebar (NavLinks de React Router)
- Todos los modales de "Nueva X" (Nueva campaña, Nuevo lead, Nuevo agente, etc.)
- Tabs de filtro en Automatizaciones
- Tabs de categorías en Knowledge Base
- Selección de fila para abrir panel de detalle (Llamadas, Automatizaciones, Reuniones)
- Selector de comparativa en Dashboard

---

## 2. Convenciones

### Tipos de corrección

| Sigla | Descripción |
|-------|-------------|
| `ESTADO` | Añadir/conectar estado React existente. Solo código JS, sin nueva UI. |
| `FILTRO` | Implementar lógica de filtrado sobre el array de datos. |
| `MODAL` | Crear o reutilizar un componente modal/drawer. |
| `PANEL` | Abrir/cerrar un panel lateral ya existente o nuevo. |
| `DROPDOWN` | Implementar un menú desplegable con opciones reales. |
| `TOAST` | Mostrar confirmación o feedback con un toast/notificación. |
| `PAGINACION` | Añadir estado de página y slice del array de datos. |
| `NAVEGACION` | Usar `useNavigate()` de React Router para ir a otra ruta. |
| `NOOP` | No necesita implementación real (demo/mockup) — puede dejarse con `console.log`. |

### Archivos relevantes

```
src/
  components/
    Dashboard.jsx
    Campaigns.jsx
    Calls.jsx
    Leads.jsx
    Agentes.jsx
    Pipeline.jsx
    Reuniones.jsx
    Playbooks.jsx
    Automatizaciones.jsx
    KnowledgeBase.jsx
    Configuracion.jsx
    Sidebar.jsx
  modals/
    NewCampaignModal.jsx    ✓ existe y funciona
    NewLeadModal.jsx        ✓ existe y funciona
    NewAgenteModal.jsx      ✓ existe y funciona
    NewOportunidadModal.jsx ✓ existe y funciona
    NewReunionModal.jsx     ✓ existe y funciona
    NewPlaybookModal.jsx    ✓ existe y funciona
    NewAutomatizacionModal.jsx ✓ existe y funciona
    NewArticuloModal.jsx    ✓ existe y funciona
  ui/
    FilterDropdown.jsx      (revisar si existe; si no, crear)
    ExportDropdown.jsx      ✓ existe
    DateRangePicker.jsx     ✓ existe
```

---

## 3. Sidebar

**Archivo:** `src/components/Sidebar.jsx`

### 3.1 Botón de usuario (abajo)

```jsx
// línea ~200 — botón con hover pero sin onClick
<button style={styles.userBtn} onMouseEnter={...} onMouseLeave={...}>
  <div style={styles.avatar}>AC</div>
  ...
</button>
```

**Problema:** no abre ningún menú ni redirige a configuración de perfil.

**Solución:** `DROPDOWN` o `NAVEGACION`

```jsx
// Opción A — navegar a /configuracion (más simple)
import { useNavigate } from 'react-router-dom'
const navigate = useNavigate()
<button onClick={() => navigate('/configuracion')} ...>

// Opción B — dropdown con opciones: Mi perfil, Configuración, Cerrar sesión
// Crear un pequeño estado `showUserMenu` y renderizar un popover encima del botón
const [showUserMenu, setShowUserMenu] = useState(false)
```

**Archivos a modificar:** `src/components/Sidebar.jsx`

---

## 4. Dashboard

**Archivo:** `src/components/Dashboard.jsx`

### 4.1 "Ver todos los agentes"

**Problema:** botón sin onClick en la sección AgentesTable.

**Solución:** `NAVEGACION`

```jsx
import { useNavigate } from 'react-router-dom'
// ...
<button onClick={() => navigate('/agentes')}>Ver todos los agentes</button>
```

### 4.2 "Ver todas las alertas"

**Problema:** botón sin onClick en la sección AlertasIA.

**Solución:** `NAVEGACION` o `MODAL`

```jsx
// Opción simple — ir a una sección o página
<button onClick={() => navigate('/insights')}>Ver todas las alertas</button>

// Opción más completa — modal con lista expandida de alertas
const [showAlertas, setShowAlertas] = useState(false)
<button onClick={() => setShowAlertas(true)}>Ver todas las alertas</button>
{showAlertas && <AlertasModal onClose={() => setShowAlertas(false)} />}
```

### 4.3 Flechas de alerta individual (`RiArrowRightLine`)

**Problema:** iconos decorativos, no son botones clicables.

**Solución:** `NOOP` o `MODAL`  
Cada alerta podría abrir un detalle. En un mockup es suficiente con `console.log` o un toast.

**Archivos a modificar:** `src/components/Dashboard.jsx`

---

## 5. Campañas

**Archivo:** `src/components/Campaigns.jsx`

### 5.1 Selector de rango de fechas (header)

**Problema:** botón con texto hardcoded "12 may – 18 may", sin onClick.

**Solución:** `ESTADO` — el componente `DateRangePicker` ya existe en `src/ui/DateRangePicker.jsx`.

```jsx
import DateRangePicker from '../ui/DateRangePicker'
const [dateRange, setDateRange] = useState({ start: '2024-05-12', end: '2024-05-18' })
const [showPicker, setShowPicker] = useState(false)

<button onClick={() => setShowPicker(true)}>
  {formatRange(dateRange)}
</button>
{showPicker && (
  <DateRangePicker
    value={dateRange}
    onChange={r => { setDateRange(r); setShowPicker(false) }}
    onClose={() => setShowPicker(false)}
  />
)}
```

### 5.2 Botón "Filtros"

**Problema:** sin onClick.

**Solución:** `DROPDOWN`

```jsx
const [showFilter, setShowFilter] = useState(false)
<button onClick={() => setShowFilter(v => !v)}>Filtros</button>
{showFilter && (
  <FilterDropdown
    options={['Estado', 'Canal', 'Agente', 'Fecha']}
    onClose={() => setShowFilter(false)}
  />
)}
```

Si `FilterDropdown` no existe en `src/ui/`, crearlo como un pequeño popover con checkboxes.

### 5.3 Dropdown "Estado: Todos"

**Problema:** sin onClick; debería filtrar la tabla de campañas.

**Solución:** `FILTRO` + `DROPDOWN`

```jsx
const [statusFilter, setStatusFilter] = useState('Todos')
const STATUS_OPTIONS = ['Todos', 'Activa', 'Pausada', 'Borrador', 'Finalizada']

// filtrar array:
const filteredCampaigns = CAMPAIGNS.filter(c =>
  statusFilter === 'Todos' ? true : c.status === statusFilter
)
```

### 5.4 Botones "Ver" y "Editar" en fila de campaña

**Problema:** sin onClick.

**Solución:**
- **"Ver"** → `PANEL` — abrir panel de detalle lateral (similar al de Llamadas/Reuniones) mostrando datos de la campaña seleccionada.
- **"Editar"** → `MODAL` — reutilizar `NewCampaignModal` pasando la campaña como prop `initialData` para edición.

```jsx
const [selectedCampaign, setSelectedCampaign] = useState(null)
const [editCampaign, setEditCampaign] = useState(null)

// en la fila:
<button onClick={() => setSelectedCampaign(campaign)}>Ver</button>
<button onClick={() => setEditCampaign(campaign)}>Editar</button>

// render:
{selectedCampaign && <CampaignDetailPanel campaign={selectedCampaign} onClose={() => setSelectedCampaign(null)} />}
{editCampaign && <NewCampaignModal initialData={editCampaign} onClose={() => setEditCampaign(null)} />}
```

### 5.5 Botón "⋯" por fila (RiMoreLine)

**Problema:** sin onClick.

**Solución:** `DROPDOWN`

```jsx
const [rowMenu, setRowMenu] = useState(null) // id de la fila con menú abierto

<button onClick={e => { e.stopPropagation(); setRowMenu(rowMenu === campaign.id ? null : campaign.id) }}>
  <RiMoreLine />
</button>
{rowMenu === campaign.id && (
  <div className="row-menu-popover">
    <button onClick={() => { setEditCampaign(campaign); setRowMenu(null) }}>Editar</button>
    <button onClick={() => { /* duplicar */ setRowMenu(null) }}>Duplicar</button>
    <button onClick={() => { /* pausar */ setRowMenu(null) }}>Pausar / Activar</button>
    <button onClick={() => { /* eliminar */ setRowMenu(null) }} style={{ color: 'red' }}>Eliminar</button>
  </div>
)}
```

### 5.6 "Por llamadas" dropdown en CanalDonut

**Problema:** sin onClick.

**Solución:** `ESTADO` — alternar qué métrica muestra el donut.

```jsx
const [canalMetric, setCanalMetric] = useState('llamadas')
// opciones: 'llamadas' | 'emails' | 'reuniones'
```

### 5.7 "Conversión" dropdown en TopConversion

**Problema:** sin onClick.

**Solución:** `ESTADO` — cambiar el criterio de ordenación del ranking.

```jsx
const [convMetric, setConvMetric] = useState('conversion')
```

### 5.8 "Ver reporte completo"

**Problema:** sin onClick.

**Solución:** `NAVEGACION`

```jsx
<button onClick={() => navigate('/insights')}>Ver reporte completo</button>
```

### 5.9 Paginación

**Problema:** todos los botones ‹ 1 2 3 … › sin onClick.

**Solución:** `PAGINACION`

```jsx
const [page, setPage] = useState(1)
const PAGE_SIZE = 10
const paginated = filteredCampaigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
const totalPages = Math.ceil(filteredCampaigns.length / PAGE_SIZE)

// en los botones:
<button onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button>
{Array.from({ length: totalPages }, (_, i) => (
  <button key={i} onClick={() => setPage(i + 1)} style={{ fontWeight: page === i+1 ? 700 : 400 }}>
    {i + 1}
  </button>
))}
<button onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</button>
```

**Archivos a modificar:** `src/components/Campaigns.jsx`, posiblemente crear `src/ui/FilterDropdown.jsx`

---

## 6. Llamadas

**Archivo:** `src/components/Calls.jsx`

### 6.1 Selector de fecha y "Filtros" / "Exportar" (header)

Misma solución que Campañas §5.1 y §5.2. Ver esos apartados.

**"Exportar"** → `NOOP` o `TOAST`

```jsx
<button onClick={() => alert('Exportando...')}>Exportar</button>
// o con una librería de toast ya instalada
```

### 6.2 Reproductor de audio

**Problema:** botones de play, velocidad, descarga y pantalla completa son decorativos.

**Solución:** `ESTADO`

```jsx
const [playing, setPlaying] = useState(false)
const [speed, setSpeed] = useState(1.0)
const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

// play/pausa:
<button onClick={() => setPlaying(v => !v)}>
  {playing ? <RiPauseLine /> : <RiPlayLine />}
</button>

// velocidad (cicla entre opciones):
<button onClick={() => setSpeed(s => {
  const idx = SPEEDS.indexOf(s)
  return SPEEDS[(idx + 1) % SPEEDS.length]
})}>
  {speed}x
</button>

// descarga → NOOP en mockup
<button onClick={() => console.log('download')}>
  <RiDownloadLine />
</button>
```

> **Nota:** si se quiere un reproductor real conectado a un `<audio>`, se usa `useRef` sobre un elemento `<audio src={call.audioUrl}>` y se controla con `audioRef.current.play()` / `.pause()`.

### 6.3 Dropdown "Acciones"

**Problema:** sin onClick.

**Solución:** `DROPDOWN`

```jsx
const [showAcciones, setShowAcciones] = useState(false)
<button onClick={() => setShowAcciones(v => !v)}>Acciones</button>
{showAcciones && (
  <div className="dropdown-menu">
    <button>Añadir nota</button>
    <button>Compartir transcripción</button>
    <button>Marcar como revisada</button>
    <button style={{ color: 'red' }}>Eliminar</button>
  </div>
)}
```

### 6.4 Tabs sin contenido (Resumen IA, Coaching, Objeciones, Siguientes pasos)

**Problema:** los tabs cambian el estado `tab` pero solo el case `'Transcripcion'` renderiza contenido. Los demás no tienen nada.

**Solución:** `ESTADO` — añadir bloques de contenido para cada tab.

```jsx
// En el switch/condicional de renderizado del tab activo, añadir:
{tab === 'Resumen IA' && (
  <div>
    <p><strong>Resumen automático:</strong></p>
    <p>{call.aiSummary ?? 'No disponible'}</p>
  </div>
)}
{tab === 'Coaching' && (
  <div>
    <p>Puntuación: <strong>{call.coachingScore ?? 'N/A'}</strong></p>
    {/* métricas de coaching */}
  </div>
)}
{tab === 'Objeciones' && (
  <ul>
    {(call.objections ?? []).map((o, i) => <li key={i}>{o}</li>)}
  </ul>
)}
```

Los datos pueden ser campos hardcoded por llamada en el array `CALLS` (ya que es un mockup).

### 6.5 "Ver transcripción completa"

**Problema:** sin onClick.

**Solución:** `MODAL`

```jsx
const [showTranscript, setShowTranscript] = useState(false)
<button onClick={() => setShowTranscript(true)}>Ver transcripción completa</button>
{showTranscript && (
  <div className="modal-overlay" onClick={() => setShowTranscript(false)}>
    <div className="modal-box" onClick={e => e.stopPropagation()}>
      <h2>Transcripción completa</h2>
      <div className="transcript-scroll">{/* líneas de transcripción */}</div>
      <button onClick={() => setShowTranscript(false)}>Cerrar</button>
    </div>
  </div>
)}
```

### 6.6 "Ver todos los momentos clave"

**Problema:** sin onClick.

**Solución:** `MODAL` (similar al anterior) o expandir la sección inline con un estado `showAllMoments`.

```jsx
const [showAllMoments, setShowAllMoments] = useState(false)
const moments = showAllMoments ? call.moments : call.moments.slice(0, 3)
<button onClick={() => setShowAllMoments(v => !v)}>
  {showAllMoments ? 'Ver menos' : 'Ver todos los momentos'}
</button>
```

### 6.7 Paginación

Ver §5.9 — misma implementación.

**Archivos a modificar:** `src/components/Calls.jsx`

---

## 7. Leads

**Archivo:** `src/components/Leads.jsx`

### 7.1 "Filtros" e "Importar" (header)

- **Filtros** → `DROPDOWN` (ver §5.2)
- **Importar** → `MODAL` — crear `ImportLeadsModal.jsx` con un uploader CSV o dejarlo como `NOOP`.

### 7.2 Botones de acción rápida en LeadDetail (Llamar, Email, Agendar, Nota, Más)

**Problema:** cinco botones de acción sin onClick en el panel de detalle del lead.

**Solución:**

```jsx
// Llamar → NOOP o toast
<button onClick={() => alert(`Llamando a ${lead.phone}...`)}>Llamar</button>

// Email → NOOP o abrir cliente de email
<button onClick={() => window.open(`mailto:${lead.email}`)}>Email</button>

// Agendar → MODAL — abrir NewReunionModal con el lead preseleccionado
const [showSchedule, setShowSchedule] = useState(false)
<button onClick={() => setShowSchedule(true)}>Agendar</button>
{showSchedule && <NewReunionModal leadId={lead.id} onClose={() => setShowSchedule(false)} />}

// Nota → MODAL — crear NoteModal simple (textarea + guardar)
// Más → DROPDOWN con más opciones
```

### 7.3 Tabs de detalle sin contenido (Actividad, Llamadas, Emails, Reuniones)

**Problema:** igual que §6.4 — los tabs cambian estado pero solo "Resumen" tiene contenido.

**Solución:** `ESTADO` — añadir contenido para cada tab:

```jsx
{activeTab === 'Actividad' && (
  <ul className="activity-feed">
    {lead.activities?.map((a, i) => (
      <li key={i}><span>{a.date}</span> — {a.description}</li>
    ))}
  </ul>
)}
{activeTab === 'Llamadas' && (
  // lista de llamadas asociadas a este lead
  <CallList calls={lead.calls ?? []} />
)}
// etc.
```

### 7.4 "Agendar demo" en LeadDetail

**Problema:** sin onClick.

**Solución:** `MODAL` — reutilizar `NewReunionModal`.

```jsx
<button onClick={() => setShowSchedule(true)}>Agendar demo</button>
```

### 7.5 "Editar" tags y "+" añadir tag

**Problema:** sin onClick.

**Solución:** `ESTADO` — inline tag editor.

```jsx
const [editingTags, setEditingTags] = useState(false)
const [tagInput, setTagInput] = useState('')

{editingTags
  ? <input value={tagInput} onChange={e => setTagInput(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && addTag(tagInput)} autoFocus />
  : <button onClick={() => setEditingTags(true)}>+ Añadir tag</button>
}
```

### 7.6 "Ver todos" (puntos de dolor)

**Solución:** `ESTADO` — expandir la lista.

```jsx
const [showAllPains, setShowAllPains] = useState(false)
const pains = showAllPains ? lead.painPoints : lead.painPoints.slice(0, 3)
<button onClick={() => setShowAllPains(v => !v)}>
  {showAllPains ? 'Ver menos' : 'Ver todos'}
</button>
```

### 7.7 "Segmentar"

**Problema:** sin onClick.

**Solución:** `MODAL` — abrir un modal de segmentación con filtros avanzados, o `NOOP`.

### 7.8 Paginación

Ver §5.9.

**Archivos a modificar:** `src/components/Leads.jsx`, opcionalmente `src/modals/NoteModal.jsx` (crear)

---

## 8. Agentes

**Archivo:** `src/components/Agentes.jsx`

### 8.1 Toggle view ⊞/☰

**Problema:** sin onClick.

**Solución:** `ESTADO`

```jsx
const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
<button onClick={() => setViewMode('grid')}>⊞</button>
<button onClick={() => setViewMode('list')}>☰</button>

// y en el render:
{viewMode === 'grid'
  ? <div style={{ display: 'grid', ... }}>{agents.map(AgentCard)}</div>
  : <div>{agents.map(AgentListRow)}</div>
}
```

### 8.2 Dropdown "Ordenar por"

**Solución:** `ESTADO` + `DROPDOWN`

```jsx
const [sortBy, setSortBy] = useState('recientes')
const SORT_OPTIONS = ['Más recientes', 'Mejor tasa', 'Más llamadas', 'Nombre A-Z']

const sorted = [...agents].sort((a, b) => {
  if (sortBy === 'mejor tasa') return b.tasa - a.tasa
  if (sortBy === 'más llamadas') return b.llamadas - a.llamadas
  return 0 // default
})
```

### 8.3 Botón "Filtros"

Ver §5.2.

### 8.4 Estrella RiStarLine en AgentCard

**Problema:** sin onClick — debería marcar/desmarcar favorito.

**Solución:** `ESTADO`

```jsx
const [starred, setStarred] = useState(agent.starred ?? false)
<button onClick={e => { e.stopPropagation(); setStarred(v => !v) }}>
  {starred ? <RiStarFill color="#fbbf24" /> : <RiStarLine />}
</button>
```

### 8.5 Botón "⋯" en AgentCard

**Solución:** `DROPDOWN` con opciones: Editar, Duplicar, Desactivar, Eliminar.

### 8.6 "Probar agente"

**Problema:** sin onClick.

**Solución:** `MODAL`

Crear `TestAgentModal.jsx` — un panel de chat simulado donde el usuario puede escribir texto y ver cómo respondería el agente. O simplemente `NOOP` con un toast.

### 8.7 Quick actions (Editar configuración, Entrenar, Ver playbook, Clonar)

**Problema:** botones sin onClick.

**Solución:**

```jsx
// Editar configuración → MODAL o NAVEGACION a /configuracion?tab=agentes
<button onClick={() => setShowEditAgent(true)}>Editar configuración</button>
{showEditAgent && <NewAgenteModal initialData={agent} onClose={() => setShowEditAgent(false)} />}

// Entrenar con documentos → MODAL con uploader
// Ver playbook → NAVEGACION
<button onClick={() => navigate('/playbooks')}>Ver playbook</button>

// Clonar agente → ESTADO — duplicar el agente en el array local
<button onClick={() => {
  const clone = { ...agent, id: Date.now(), name: `${agent.name} (copia)` }
  setAgents(prev => [...prev, clone])
}}>Clonar agente</button>
```

### 8.8 Toggle de estado en AgentDetail (activo/inactivo)

**Problema:** decorativo.

**Solución:** `ESTADO`

```jsx
const [active, setActive] = useState(agent.active ?? true)
<div onClick={() => setActive(v => !v)} style={{ cursor: 'pointer' }}>
  <Toggle active={active} />
</div>
```

**Archivos a modificar:** `src/components/Agentes.jsx`, opcionalmente `src/modals/TestAgentModal.jsx` (crear)

---

## 9. Pipeline

**Archivo:** `src/components/Pipeline.jsx`

### 9.1 Selector de fecha y "Filtros"

Ver §5.1 y §5.2.

### 9.2 "⋯" del header

**Solución:** `DROPDOWN` con opciones de vista (Kanban, Lista, etc.) o configuración del pipeline.

### 9.3 "+ X más" en KanbanColumn

**Problema:** cada columna muestra las primeras N tarjetas y tiene un botón "+ X más" sin onClick.

**Solución:** `ESTADO` — expandir/colapsar la columna.

```jsx
const [expanded, setExpanded] = useState(false)
const VISIBLE = 3
const visible = expanded ? cards : cards.slice(0, VISIBLE)

{visible.map(card => <OppCard key={card.id} {...card} />)}
{cards.length > VISIBLE && (
  <button onClick={() => setExpanded(v => !v)}>
    {expanded ? 'Ver menos' : `+ ${cards.length - VISIBLE} más`}
  </button>
)}
```

### 9.4 OppCard — cursor pointer sin onClick

**Problema:** las tarjetas de oportunidad tienen `cursor: pointer` pero no abren nada.

**Solución:** `PANEL` — abrir panel de detalle lateral (similar a Reuniones/Llamadas).

```jsx
const [selectedOpp, setSelectedOpp] = useState(null)
<OppCard onClick={() => setSelectedOpp(opp)} />
{selectedOpp && <OppDetailPanel opp={selectedOpp} onClose={() => setSelectedOpp(null)} />}
```

### 9.5 CTAs de "Acciones recomendadas" (Ver oportunidades, Ver propuestas, Ver calendario)

**Solución:** `NAVEGACION`

```jsx
<button onClick={() => navigate('/pipeline?filter=oportunidades')}>Ver oportunidades</button>
<button onClick={() => navigate('/pipeline?filter=propuestas')}>Ver propuestas</button>
<button onClick={() => navigate('/reuniones')}>Ver calendario</button>
```

**Archivos a modificar:** `src/components/Pipeline.jsx`

---

## 10. Reuniones

**Archivo:** `src/components/Reuniones.jsx`

### 10.1 Header — Selector de fecha, Filtros, Exportar

- **Fecha** → `ESTADO` + `DateRangePicker` (ver §5.1)
- **Filtros** → `DROPDOWN` (ver §5.2)
- **Exportar** → `NOOP` o `TOAST`

### 10.2 Icono filtro inline (cerca de la tabla)

**Solución:** `ESTADO` — mismo `showFilter` del header, o abrir un panel de filtros secundario.

### 10.3 RowMenu — "Reprogramar" y "Cancelar reunión"

**Problema:** el `switch` en el handler de RowMenu tiene los cases `reschedule` y `cancel` sin código.

```jsx
// Código actual (Reuniones.jsx):
case 'reschedule': break  // ← vacío
case 'cancel':    break  // ← vacío
```

**Solución:** `MODAL`

```jsx
case 'reschedule':
  setRescheduleReunion(reunion)
  break
case 'cancel':
  setConfirmCancel(reunion)
  break
```

```jsx
// Modales correspondientes:
{rescheduleReunion && (
  <NewReunionModal
    initialData={rescheduleReunion}
    onClose={() => setRescheduleReunion(null)}
  />
)}
{confirmCancel && (
  <ConfirmModal
    message={`¿Cancelar la reunión con ${confirmCancel.lead}?`}
    onConfirm={() => {
      setReuniones(prev => prev.filter(r => r.id !== confirmCancel.id))
      setConfirmCancel(null)
    }}
    onClose={() => setConfirmCancel(null)}
  />
)}
```

### 10.4 DetailPanel — "Unirse a la reunión"

**Problema:** sin onClick.

**Solución:** `NOOP` en mockup. En producción abriría el link de videollamada.

```jsx
<button onClick={() => window.open(reunion.meetingUrl ?? '#', '_blank')}>
  Unirse a la reunión
</button>
```

### 10.5 DetailPanel — "Ver detalle del lead"

**Solución:** `NAVEGACION`

```jsx
<button onClick={() => navigate(`/leads?id=${reunion.leadId}`)}>
  Ver detalle del lead
</button>
```

### 10.6 DetailPanel — "Reprogramar" y "Cancelar reunión"

Misma solución que §10.3 — conectar a los modales ya descritos.

### 10.7 Paginación

Ver §5.9.

**Archivos a modificar:** `src/components/Reuniones.jsx`, opcionalmente `src/modals/ConfirmModal.jsx` (crear, es reutilizable)

---

## 11. Playbooks

**Archivo:** `src/components/Playbooks.jsx`

### 11.1 "Importar playbook"

**Solución:** `MODAL` — uploader de archivo JSON/YAML, o `NOOP`.

### 11.2 "Usar playbook" en PlaybookCard

**Problema:** sin onClick.

**Solución:** `MODAL` o `NAVEGACION`

```jsx
// Opción A — abrir modal de selección de campaña para aplicar el playbook
const [usePlaybook, setUsePlaybook] = useState(null)
<button onClick={e => { e.stopPropagation(); setUsePlaybook(pb) }}>Usar playbook</button>
{usePlaybook && (
  <SelectCampanaModal
    playbook={usePlaybook}
    onClose={() => setUsePlaybook(null)}
  />
)}

// Opción B — ir a crear campaña con playbook preseleccionado
<button onClick={() => navigate('/campanas?playbook=' + pb.id)}>Usar playbook</button>
```

### 11.3 "⋯" en PlaybookCard

**Solución:** `DROPDOWN` con opciones: Editar, Duplicar, Compartir, Eliminar.

### 11.4 "Filtros" de playbooks

Ver §5.2.

### 11.5 "Ver todos los playbooks (18)"

**Problema:** muestra solo algunos — botón sin onClick.

**Solución:** `ESTADO`

```jsx
const [showAll, setShowAll] = useState(false)
const visible = showAll ? PLAYBOOKS : PLAYBOOKS.slice(0, 4)
<button onClick={() => setShowAll(v => !v)}>
  {showAll ? 'Ver menos' : 'Ver todos los playbooks (18)'}
</button>
```

### 11.6 DetailPanel — "Usar este playbook" y "Ver detalle completo"

- **"Usar este playbook"** → misma solución que §11.2
- **"Ver detalle completo"** → `NAVEGACION` a una ruta `/playbooks/:id` (requiere crear esa ruta y página), o expandir el panel existente.

**Archivos a modificar:** `src/components/Playbooks.jsx`

---

## 12. Automatizaciones

**Archivo:** `src/components/Automatizaciones.jsx`

### 12.1 "Filtros"

Ver §5.2.

### 12.2 Dropdown "Ordenar por: Más recientes"

**Solución:** `ESTADO` + `DROPDOWN`

```jsx
const [sortBy, setSortBy] = useState('recientes')
const sorted = [...AUTOMATIONS].sort((a, b) => {
  if (sortBy === 'nombre') return a.name.localeCompare(b.name)
  if (sortBy === 'ejecuciones') return b.execs - a.execs
  return 0
})
```

### 12.3 Toggles de estado (activa/pausada) en filas

**Problema:** decorativos.

**Solución:** `ESTADO`

```jsx
// En el estado local de automatizaciones:
const [automations, setAutomations] = useState(AUTOMATIONS)

const toggleStatus = (idx) => {
  setAutomations(prev => prev.map((a, i) =>
    i === idx ? { ...a, status: a.status === 'activa' ? 'pausada' : 'activa' } : a
  ))
}

// En el Toggle:
<div onClick={e => { e.stopPropagation(); toggleStatus(realIdx) }}>
  <Toggle active={a.status === 'activa'} />
</div>
```

### 12.4 "⋯" en filas

**Solución:** `DROPDOWN` con opciones: Ver detalle, Editar, Duplicar, Pausar/Activar, Eliminar.

### 12.5 Panel — dropdown "Este mes"

**Solución:** `ESTADO`

```jsx
const [perfPeriod, setPerfPeriod] = useState('mes')
// opciones: 'semana' | 'mes' | 'trimestre'
```

### 12.6 "Editar automatización" en panel footer

**Problema:** sin onClick.

**Solución:** `MODAL` — reutilizar `NewAutomatizacionModal` con `initialData`.

```jsx
<button onClick={() => setEditAutomation(auto)}>Editar automatización</button>
{editAutomation && (
  <NewAutomatizacionModal
    initialData={editAutomation}
    onClose={() => setEditAutomation(null)}
  />
)}
```

### 12.7 "⋯" en panel footer

**Solución:** `DROPDOWN` con: Duplicar, Exportar, Eliminar.

### 12.8 Paginación

Ver §5.9.

**Archivos a modificar:** `src/components/Automatizaciones.jsx`

---

## 13. Knowledge Base

**Archivo:** `src/components/KnowledgeBase.jsx`

### 13.1 "Importar"

**Solución:** `MODAL` con uploader de archivo o `NOOP`.

### 13.2 "Filtros" y "Más recientes" dropdown

- **Filtros** → `DROPDOWN`
- **Más recientes** → `ESTADO` + dropdown de ordenación

```jsx
const [sortBy, setSortBy] = useState('recientes')
const sorted = [...ARTICLES].sort((a, b) => {
  if (sortBy === 'visitas') return b.visits - a.visits
  if (sortBy === 'título') return a.title.localeCompare(b.title)
  return 0 // recientes: mantener orden original
})
```

### 13.3 "⋯" en ArticleRow

**Solución:** `DROPDOWN` con opciones: Editar, Compartir, Marcar como favorito, Eliminar.

### 13.4 "Ver todos los artículos" (panel lateral)

**Solución:** `ESTADO` — colapsar/expandir la lista, o es redundante con los tabs ya existentes.

### 13.5 "Ver mejores prácticas"

**Solución:** `MODAL` o `NAVEGACION` a un artículo específico dentro de la misma Knowledge Base.

### 13.6 "Solicitar artículo"

**Solución:** `MODAL`

```jsx
// Modal simple con: Título del artículo, Categoría, Descripción breve, Botón enviar
const [showRequest, setShowRequest] = useState(false)
<button onClick={() => setShowRequest(true)}>Solicitar artículo</button>
{showRequest && <RequestArticleModal onClose={() => setShowRequest(false)} />}
```

### 13.7 Paginación

`activePage` ya está en estado — solo falta el slice:

```jsx
const PAGE_SIZE = 8
const paginated = ARTICLES.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE)
```

Los botones `PageBtn` ya tienen `onClick={() => setActivePage(p)}` — lo que falta es usarlo para el slice.

**Archivos a modificar:** `src/components/KnowledgeBase.jsx`

---

## 14. Problemas transversales

### 14.1 Paginación — patrón único para todos los módulos

En lugar de reimplementar la paginación en cada componente, crear un hook reutilizable:

**`src/hooks/usePagination.js`**

```js
import { useState } from 'react'

export function usePagination(items, pageSize = 10) {
  const [page, setPage] = useState(1)
  const totalPages = Math.ceil(items.length / pageSize)
  const paginated = items.slice((page - 1) * pageSize, page * pageSize)

  return {
    page, setPage,
    paginated,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    prev: () => setPage(p => Math.max(1, p - 1)),
    next: () => setPage(p => Math.min(totalPages, p + 1)),
  }
}
```

Uso en cualquier componente:

```jsx
const { page, setPage, paginated, totalPages, prev, next } = usePagination(filteredItems, 10)
```

### 14.2 ConfirmModal — reutilizable para cancelaciones y eliminaciones

Crear `src/modals/ConfirmModal.jsx`:

```jsx
export default function ConfirmModal({ title, message, confirmLabel = 'Confirmar', onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box confirm" onClick={e => e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        <p>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancelar</button>
          <button onClick={onConfirm} style={{ background: '#dc2626', color: '#fff' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
```

Útil en: Reuniones (cancelar reunión), Leads (eliminar lead), Campañas (eliminar campaña), Agentes (eliminar agente).

### 14.3 FilterDropdown — si no existe, crear uno mínimo

**`src/ui/FilterDropdown.jsx`**

```jsx
export default function FilterDropdown({ title, options, selected, onSelect, onClose }) {
  return (
    <div className="filter-dropdown" onMouseLeave={onClose}>
      {title && <p className="filter-title">{title}</p>}
      {options.map(opt => (
        <label key={opt} style={{ display: 'flex', gap: 8, cursor: 'pointer', padding: '6px 12px' }}>
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => onSelect(opt)}
          />
          {opt}
        </label>
      ))}
    </div>
  )
}
```

### 14.4 Toast / notificaciones

Instalar una librería minimalista para feedback de acciones (exportar, guardar, etc.):

```bash
npm install react-hot-toast
```

En `src/main.jsx`:
```jsx
import { Toaster } from 'react-hot-toast'
// dentro del render:
<Toaster position="bottom-right" />
```

Uso:
```jsx
import toast from 'react-hot-toast'
<button onClick={() => { exportData(); toast.success('Exportado correctamente') }}>
  Exportar
</button>
```

---

## 15. Priorización

### 🔴 Alta — bloquean funcionalidad clave

| # | Qué | Dónde | Estado |
|---|-----|-------|--------|
| 1 | Tabs sin contenido (Resumen IA, Coaching, Objeciones) | `Calls.jsx` | ✅ HECHO |
| 2 | Acciones de lead (Llamar, Email, Agendar, Nota) | `Leads.jsx` | ✅ HECHO |
| 3 | Tabs de detalle de lead sin contenido | `Leads.jsx` | ✅ HECHO |
| 4 | Reprogramar / Cancelar reunión (RowMenu y DetailPanel) | `Reuniones.jsx` | ✅ HECHO |
| 5 | Toggle activa/pausada en Automatizaciones | `Automatizaciones.jsx` | ✅ HECHO |
| 6 | "Editar" campaña (botón Ver/Editar) | `Campaigns.jsx` | ✅ HECHO |

### 🟡 Media — mejoran la usabilidad significativamente

| # | Qué | Dónde | Estado |
|---|-----|-------|--------|
| 7 | Paginación en Knowledge Base | `KnowledgeBase.jsx` | ✅ HECHO |
| 8 | Filtros de estado en Campañas | `Campaigns.jsx` | ✅ HECHO |
| 9 | "Usar playbook" | `Playbooks.jsx` | ✅ HECHO |
| 10 | OppCard clickeable → panel de detalle | `Pipeline.jsx` | ✅ HECHO |
| 11 | Reproductor de audio (play/pausa, velocidad) | `Calls.jsx` | ✅ HECHO |
| 12 | "Ordenar por" y expand/collapse en Pipeline | `Pipeline.jsx` | ✅ HECHO |

### 🟢 Baja — polish y completitud

| # | Qué | Dónde | Estado |
|---|-----|-------|--------|
| 13 | "Ver todos los agentes / alertas" | `Dashboard.jsx` | ✅ HECHO |
| 14 | "Exportar" en Llamadas y Reuniones | `Calls.jsx`, `Reuniones.jsx` | ✅ HECHO |
| 15 | Botón usuario en sidebar | `Sidebar.jsx` | ✅ HECHO |
| 16 | Quick actions en AgentDetail (Probar, Ver playbook, etc.) | `Agentes.jsx` | ✅ HECHO |
| 17 | View toggle ⊞/☰ en Agentes | `Agentes.jsx` | ✅ HECHO |
| 18 | Toggle activo/inactivo en AgentDetail | `Agentes.jsx` | ✅ HECHO |
| 19 | "Solicitar artículo" | `KnowledgeBase.jsx` | ✅ HECHO |
| 20 | "Importar playbook" | `Playbooks.jsx` | ✅ HECHO |

### 🔵 Adicionales implementados

| Qué | Dónde | Estado |
|-----|-------|--------|
| "Ver reporte completo" → /insights | `Campaigns.jsx` | ✅ HECHO |
| "Editar automatización" → modal | `Automatizaciones.jsx` | ✅ HECHO |
| "Unirse a reunión" → Google Meet | `Reuniones.jsx` | ✅ HECHO |
| "Ver detalle del lead" → /leads | `Reuniones.jsx` | ✅ HECHO |
| ConfirmModal cancelar reunión | `Reuniones.jsx` | ✅ HECHO |
| "Agendar demo" en LeadDetail | `Leads.jsx` | ✅ HECHO |
| "Ver todos" pain points (expandir) | `Leads.jsx` | ✅ HECHO |
| Nota inline en LeadDetail | `Leads.jsx` | ✅ HECHO |
| "Ver todas las alertas" → /insights | `Dashboard.jsx` | ✅ HECHO |
| "Ver todos los agentes" → /agentes | `Dashboard.jsx` | ✅ HECHO |
| Acciones recomendadas CTA → navigate | `Pipeline.jsx` | ✅ HECHO |
| "Importar" Knowledge Base | `KnowledgeBase.jsx` | ✅ HECHO |
| "Importar playbook" | `Playbooks.jsx` | ✅ HECHO |

---

*Fin del documento. Última actualización: 2026-06-27.*
