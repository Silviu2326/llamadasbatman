import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAddLine, RiArrowDownSLine, RiArrowRightLine, RiBarChartLine,
  RiBookOpenLine, RiCalendarLine, RiCheckLine, RiCloseLine,
  RiExternalLinkLine, RiFilter3Line, RiFlashlightLine,
  RiMessage3Line, RiPhoneLine, RiRobot2Line, RiSearchLine,
  RiSettings3Line, RiBuilding2Line,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { DEMO_MODE } from '../lib/dataMode'
import { classifyFetchError, statusMessage } from '../lib/dataStatus'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import DataStatusBanner from './ui/DataStatusBanner'
import PageLoadingState from './ui/PageLoadingState'
import ProductPageHeader from './ui/ProductPageHeader'
import NewAgenteModal from '../modals/NewAgenteModal'
import AgentStrategyPanel from './agents/AgentStrategyPanel'
import './agents.css'
import { useI18n } from '../i18n'

const STATUS = {
  Activo: { color: 'var(--success)', bg: '#10b98115', border: '#10b98135' },
  Pausado: { color: 'var(--warn-soft)', bg: '#f59e0b14', border: '#f59e0b35' },
}

const TYPE_META = {
  ventas: { label: 'Ventas', short: 'Ventas', color: 'var(--violet)', icon: RiPhoneLine, description: 'Califica leads y acompaña al equipo comercial.' },
  soporte: { label: 'Soporte', short: 'Soporte', color: 'var(--cyan)', icon: RiMessage3Line, description: 'Atiende consultas y deriva incidencias.' },
  agenda: { label: 'Agendamiento', short: 'Agenda', color: 'var(--success)', icon: RiCalendarLine, description: 'Coordina reuniones y próximos pasos.' },
  cobranza: { label: 'Recuperación', short: 'Recuperación', color: 'var(--warn)', icon: RiFlashlightLine, description: 'Hace seguimiento de oportunidades.' },
}

const AGENT_TYPE_META = {
  sales: { es: 'Ventas', en: 'Sales' },
  receptionist: { es: 'Recepción', en: 'Receptionist' },
  qualification: { es: 'Cualificación', en: 'Lead qualification' },
  appointment: { es: 'Citas', en: 'Appointment setter' },
  support: { es: 'Soporte', en: 'Customer support' },
  collections: { es: 'Cobros y renovaciones', en: 'Collections and renewals' },
  handoff: { es: 'Transferencia a humano', en: 'Human handoff' },
}

const CALL_DIRECTION_META = {
  inbound: { es: 'Recibe llamadas', en: 'Receives calls' },
  outbound: { es: 'Realiza llamadas', en: 'Makes calls' },
  both: { es: 'Entrante y saliente', en: 'Inbound and outbound' },
}

function agentTypeLabel(type, locale = 'es') {
  const item = AGENT_TYPE_META[type] ?? AGENT_TYPE_META.sales
  return item[locale === 'en' ? 'en' : 'es']
}

function callDirectionLabel(direction, locale = 'es') {
  const item = CALL_DIRECTION_META[direction] ?? CALL_DIRECTION_META.both
  return item[locale === 'en' ? 'en' : 'es']
}

const TABS = [
  { id: 'tipo', label: 'Rol', Icon: RiRobot2Line },
  { id: 'estrategia', label: 'Estrategia', Icon: RiFlashlightLine },
  { id: 'configuracion', label: 'Configuración', Icon: RiSettings3Line },
  { id: 'mensajes', label: 'Mensajes', Icon: RiMessage3Line },
  { id: 'conocimiento', label: 'Fuentes', Icon: RiBookOpenLine },
]

const FILTERS = ['Todos', 'Activos', 'Pausados']

function matchesStatusFilter(agent, filter) {
  if (filter === 'Todos') return true
  if (filter === 'Activos') return agent.status === 'Activo'
  if (filter === 'Pausados') return agent.status === 'Pausado'
  return false
}

function resolveType(role) {
  const value = String(role ?? '').toLowerCase()
  if (value.includes('soport')) return 'soporte'
  if (value.includes('agenda') || value.includes('reun')) return 'agenda'
  if (value.includes('cobr') || value.includes('recuper')) return 'cobranza'
  return 'ventas'
}

function normalizeAgent(agent) {
  const type = resolveType(agent.role)
  return {
    ...agent,
    name: agent.name || 'Sin nombre',
    role: agent.role || 'ventas',
    agentType: agent.agentType || 'sales',
    callDirection: agent.callDirection || 'both',
    type,
    status: agent.isActive ? 'Activo' : 'Pausado',
    language: agent.language || 'Sin definir',
    color: TYPE_META[type].color,
  }
}

function StatusBadge({ status }) {
  const meta = STATUS[status] ?? STATUS.Pausado
  return <span className="agent-status" style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}><i style={{ background: meta.color }} />{status}</span>
}

function AgentAvatar({ agent, size = 'md' }) {
  const meta = TYPE_META[agent.type] ?? TYPE_META.ventas
  const Icon = meta.icon
  return <span className={`agent-avatar agent-avatar-${size}`} style={{ '--agent-color': agent.color ?? meta.color }}><Icon /></span>
}

function AgentListItem({ agent, selected, onClick, locale = (document.documentElement.lang === 'en' ? 'en' : 'es') }) {
  const meta = TYPE_META[agent.type] ?? TYPE_META.ventas
  return <button type="button" className={`agent-list-item${selected ? ' is-selected' : ''}`} style={{ '--agent-color': agent.color ?? meta.color }} onClick={onClick}>
    <AgentAvatar agent={agent} />
    <span className="agent-list-copy"><strong>{agent.name}</strong><small>{agent.role || meta.short} <b>·</b> {agent.language}</small><small>{agentTypeLabel(agent.agentType, locale)} <b>·</b> {callDirectionLabel(agent.callDirection, locale)}</small></span>
    <span className="agent-list-right"><StatusBadge status={agent.status} /><RiArrowRightLine /></span>
  </button>
}

function Toggle({ enabled, onClick, label }) {
  return <button type="button" className={`agent-toggle${enabled ? ' is-on' : ''}`} onClick={onClick} aria-label={label} aria-pressed={enabled}><i /></button>
}

function Field({ label, value, onChange, type = 'text' }) {
  if (type === 'textarea') return <label className="agent-field"><span>{label}</span><textarea value={value} onChange={event => onChange(event.target.value)} /></label>
  return <label className="agent-field"><span>{label}</span><div className="agent-input-wrap"><input value={value} onChange={event => onChange(event.target.value)} /><RiArrowDownSLine /></div></label>
}

function SelectField({ label, value, onChange, options }) {
  return <label className="agent-field"><span>{label}</span><div className="agent-input-wrap"><select value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><RiArrowDownSLine /></div></label>
}

function EmptyAgentWorkspace({ onCreate }) {
  return <section className="agent-studio agent-studio-empty">
    <div className="agent-empty-state">
      <span className="agent-empty-icon"><RiRobot2Line /></span>
      <span className="agent-panel-kicker">Tu primer agente de voz</span>
      <h2>Empieza con un agente que llame por ti</h2>
      <p>Configura su propósito, voz y forma de conversar. Podrás ajustar la estrategia después de crearlo.</p>
      <div className="agent-empty-actions">
        <button type="button" className="agent-button primary" onClick={onCreate}><RiAddLine /> Crear mi primer agente</button>
        <span className="agent-empty-status"><i /> Conexión disponible</span>
      </div>
    </div>
  </section>
}

function TypePanel({ agent, onEdit }) {
  const meta = TYPE_META[agent.type] ?? TYPE_META.ventas
  const Icon = meta.icon
  return <div className="agent-studio-grid agent-type-grid">
    <section className="agent-panel agent-type-panel"><div className="agent-panel-heading"><div><span className="agent-panel-kicker">Rol guardado en el agente</span><h3>Elige el propósito</h3></div><RiRobot2Line /></div><p className="agent-panel-intro">El cambio se guarda como el rol del agente al pulsar «Guardar cambios».</p><div className="agent-type-options">{Object.entries(TYPE_META).map(([id, item]) => { const TypeIcon = item.icon; return <button type="button" key={id} className={`agent-type-option${id === agent.type ? ' is-selected' : ''}`} onClick={() => onEdit({ role: id })} style={{ '--type-color': item.color }}><span><TypeIcon /></span><strong>{item.label}</strong><small>{item.description}</small>{id === agent.type && <RiCheckLine />}</button> })}</div></section>
    <section className="agent-panel agent-summary-panel" style={{ '--agent-color': agent.color }}><div className="agent-panel-heading"><div><span className="agent-panel-kicker">Perfil actual</span><h3>{agent.name}</h3></div><AgentAvatar agent={agent} size="lg" /></div><div className="agent-profile-badge" style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 9%, transparent)`, borderColor: `color-mix(in srgb, ${meta.color} 21%, transparent)` }}><Icon /> {agent.role}</div><p>{agent.systemPrompt || 'Este agente todavía no tiene instrucciones registradas.'}</p></section>
  </div>
}

function ConfigPanel({ agent, onEdit, locale = (document.documentElement.lang === 'en' ? 'en' : 'es') }) {
  const typeOptions = Object.entries(AGENT_TYPE_META).map(([value, labels]) => ({ value, label: labels[locale === 'en' ? 'en' : 'es'] }))
  const directionOptions = Object.entries(CALL_DIRECTION_META).map(([value, labels]) => ({ value, label: labels[locale === 'en' ? 'en' : 'es'] }))
  return <div className="agent-studio-grid agent-config-grid"><section className="agent-panel"><div className="agent-panel-heading"><div><span className="agent-panel-kicker">Campos persistentes</span><h3>Identidad del agente</h3></div><RiSettings3Line /></div><div className="agent-form-grid"><Field label="Nombre del agente" value={agent.name} onChange={value => onEdit({ name: value })} /><Field label="Personalidad" value={agent.personality || ''} onChange={value => onEdit({ personality: value })} /><Field label="Idioma" value={agent.language} onChange={value => onEdit({ language: value })} /><SelectField label={locale === 'en' ? 'Agent type' : 'Tipo de agente'} value={agent.agentType} onChange={value => onEdit({ agentType: value })} options={typeOptions} /><SelectField label={locale === 'en' ? 'Call direction' : 'Dirección de llamadas'} value={agent.callDirection} onChange={value => onEdit({ callDirection: value })} options={directionOptions} /></div><div className="agent-setting-row"><div><strong>Agente habilitado</strong><small>Este cambio se guarda al confirmar.</small></div><Toggle enabled={agent.isActive} onClick={() => onEdit({ isActive: !agent.isActive })} label="Activar agente" /></div></section><VoicePanel agent={agent} onEdit={onEdit} /></div>
}

function VoicePanel({ agent, onEdit }) {
  const settings = agent.settings || {}
  const speedOptions = ['0.8', '0.9', '1.0', '1.1', '1.2'].map(value => ({ value, label: `${value}x${value === '1.0' ? ' (Normal)' : ''}` }))
  return <section className="agent-panel"><div className="agent-panel-heading"><div><span className="agent-panel-kicker">Campos persistentes</span><h3>Configuración de voz</h3></div><RiSettings3Line /></div><p className="agent-panel-intro">La voz y la velocidad se guardan en el agente al confirmar los cambios.</p><div className="agent-form-grid"><Field label="ID de voz (proveedor TTS)" value={agent.voiceId || ''} onChange={value => onEdit({ voiceId: value })} /><SelectField label="Velocidad de habla" value={settings.speechSpeed || '1.0'} onChange={value => onEdit({ settings: { ...settings, speechSpeed: value } })} options={speedOptions} /></div></section>
}

function MessagesPanel({ agent, onEdit }) {
  const settings = agent.settings || {}
  return <div className="agent-messages-layout"><section className="agent-panel"><div className="agent-panel-heading"><div><span className="agent-panel-kicker">Campo persistente</span><h3>Mensajes clave</h3></div><RiMessage3Line /></div><p className="agent-panel-intro">Uno por línea. Se guardan en la configuración del agente y quedan disponibles para el motor de conversación.</p><Field label="Mensajes que el agente debe priorizar" type="textarea" value={settings.keyMessages || ''} onChange={value => onEdit({ settings: { ...settings, keyMessages: value } })} /></section></div>
}

function KnowledgePanel({ onNavigate }) {
  const [articles, setArticles] = useState(null)
  const [business, setBusiness] = useState(null)
  useEffect(() => {
    let active = true
    Promise.all([
      apiFetch('/api/knowledge').then(response => response.ok ? response.json() : []),
      apiFetch('/api/settings/business-profile').then(response => response.ok ? response.json() : null),
    ]).then(([knowledge, profile]) => {
      if (!active) return
      setArticles(Array.isArray(knowledge) ? knowledge : knowledge?.data ?? [])
      setBusiness(profile)
    }).catch(() => { if (active) { setArticles([]); setBusiness(null) } })
    return () => { active = false }
  }, [])
  const essentials = business?.readiness?.completedRequired ?? 0
  const offers = business?.readiness?.activeOffers ?? 0
  return <div className="agent-knowledge-layout"><section className="agent-panel agent-source-panel"><div className="agent-panel-heading"><div><span className="agent-panel-kicker">Fuente comercial prioritaria</span><h3>Información de empresa y precios</h3></div><RiBuilding2Line /></div><p className="agent-panel-intro">Todos los agentes usan esta ficha para identidad, ofertas, precios exactos, qué incluye cada plan y límites comerciales.</p>
    {business === null ? <p className="agent-panel-intro">Cargando ficha empresarial…</p> : <div className="agent-source-readiness"><span className={essentials === 4 ? 'is-ready' : ''}><b>{essentials}/4</b> campos esenciales</span><span className={offers > 0 ? 'is-ready' : ''}><b>{offers}</b> ofertas activas</span></div>}
    <button type="button" className="agent-button secondary" onClick={() => onNavigate('/informacion-empresa')}><RiBuilding2Line /> Gestionar información de empresa <RiExternalLinkLine /></button></section><section className="agent-panel agent-source-panel"><div className="agent-panel-heading"><div><span className="agent-panel-kicker">Fuente documental complementaria</span><h3>Knowledge Base compartida</h3></div><RiBookOpenLine /></div><p className="agent-panel-intro">Los documentos aportan procesos y respuestas detalladas. Si hay conflicto, los precios y condiciones de la ficha empresarial tienen prioridad.</p>
    {articles === null ? <p className="agent-panel-intro">Cargando artículos…</p>
      : articles.length === 0 ? <p className="agent-panel-intro">Todavía no hay artículos. Crea el primero para que el agente pueda apoyarse en él.</p>
      : <ul className="agent-knowledge-list">{articles.slice(0, 6).map(article => <li key={article.id}><strong>{article.name}</strong><small>{article.type || 'documento'}</small></li>)}</ul>}
    <button type="button" className="agent-button secondary" onClick={() => onNavigate('/knowledge-base')}><RiBookOpenLine /> Gestionar Knowledge Base <RiExternalLinkLine /></button></section><div className="agent-source-flow"><span><RiBuilding2Line /> Empresa</span><i>+</i><span><RiBookOpenLine /> Knowledge</span><i>+</i><span><RiRobot2Line /> Instrucciones</span><RiArrowRightLine /><strong>Próxima llamada</strong></div></div>
}

function Studio({ agent, tab, setTab, onEdit, onNavigate, onSave, saving, locale, playbooks }) {
  const panels = {
    tipo: <TypePanel agent={agent} onEdit={onEdit} />,
    estrategia: <AgentStrategyPanel agent={agent} onEdit={onEdit} playbooks={playbooks} onNavigate={onNavigate} />,
    configuracion: <ConfigPanel agent={agent} onEdit={onEdit} locale={locale} />,
    mensajes: <MessagesPanel agent={agent} onEdit={onEdit} />,
    conocimiento: <KnowledgePanel onNavigate={onNavigate} />,
  }
  return <section className="agent-studio"><div className="agent-studio-head"><div className="agent-studio-title"><AgentAvatar agent={agent} size="lg" /><div><div className="agent-studio-name"><h2>{agent.name}</h2><StatusBadge status={agent.status} /></div><p>{agent.role} <b>·</b> {agent.language}</p></div></div><div className="agent-studio-actions"><button type="button" className="agent-button secondary" onClick={() => onNavigate(`/agentes/${agent.id}`)}><RiExternalLinkLine /> Ver detalle</button></div></div><div className="agent-stepper">{TABS.map((step, index) => <button type="button" key={step.id} className={tab === step.id ? 'is-active' : ''} onClick={() => setTab(step.id)}><span>{index + 1}</span><b>{step.label}</b>{index < TABS.length - 1 && <i />}</button>)}</div><div className="agent-studio-body">{panels[tab]}</div><div className="agent-studio-footer"><span>{tab === 'estrategia' ? 'Los cambios se aplican en la próxima llamada.' : 'Los cambios no se guardan hasta confirmarlos.'}</span><button type="button" className="agent-button primary" onClick={onSave} disabled={saving}>{saving ? 'Guardando…' : tab === 'estrategia' ? 'Guardar estrategia' : 'Guardar cambios'} <RiArrowRightLine /></button></div></section>
}

export default function Agentes() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [dataStatus, setDataStatus] = useState('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [activeFilter, setActiveFilter] = useState('Todos')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('Más recientes')
  const [selectedId, setSelectedId] = useState(null)
  const [studioTab, setStudioTab] = useState('tipo')
  const [showNewAgent, setShowNewAgent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [playbooks, setPlaybooks] = useState([])

  useEffect(() => {
    let active = true
    async function loadAgents() {
      setLoading(true)
      setLoadError('')
      setDataStatus('loading')
      try {
        const [data, playbookData] = await Promise.all([
          apiFetch('/api/agents').then(response => {
            if (!response.ok) {
              return readPlanGate(response).then(gate => {
                const error = new Error(`agents_${response.status}`)
                error.status = response.status
                error.code = gate?.code
                error.plan = gate?.plan
                error.serverMessage = gate?.message
                throw error
              })
            }
            return response.json()
          }),
          apiFetch('/api/playbooks').then(response => response.ok ? response.json() : []).catch(() => []),
        ])
        if (!Array.isArray(data)) throw new Error('invalid_response')
        if (!active) return
        const next = data.map(normalizeAgent)
        setAgents(next)
        setPlaybooks(Array.isArray(playbookData) ? playbookData : [])
        setSelectedId(previous => next.some(agent => agent.id === previous) ? previous : next[0]?.id ?? null)
        setDataStatus(DEMO_MODE ? 'demo' : next.length ? 'live' : 'empty')
      } catch (error) {
        if (active) {
          setAgents([])
          setSelectedId(null)
          if (error?.code === 'PLAN_CAPABILITY_REQUIRED') {
            setDataStatus('plan')
            setLoadError(planGateMessage(error, locale))
            return
          }
          const status = classifyFetchError(error)
          setDataStatus(status)
          setLoadError(statusMessage(status, { error: 'No se pudieron cargar los agentes.' }))
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    loadAgents()
    return () => { active = false }
  }, [reloadKey])

  const selectedAgent = agents.find(agent => agent.id === selectedId) ?? null
  const filtered = useMemo(() => agents.filter(agent => {
    const matchesFilter = matchesStatusFilter(agent, activeFilter)
    const matchesSearch = `${agent.name} ${agent.role} ${agent.systemPrompt || ''}`.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  }).sort((a, b) => sort === 'Nombre A-Z' ? a.name.localeCompare(b.name) : 0), [activeFilter, agents, search, sort])

  const updateSelected = useCallback((changes) => {
    setAgents(current => current.map(agent => agent.id === selectedId ? normalizeAgent({ ...agent, ...changes }) : agent))
  }, [selectedId])

  function notify(message) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  async function saveSelected() {
    if (!selectedAgent) return
    const agentBeforeSave = normalizeAgent({ ...selectedAgent })
    setSaving(true)
    setLoadError('')
    try {
      const payload = {
        name: selectedAgent.name.trim(),
        role: selectedAgent.role,
        agentType: selectedAgent.agentType,
        callDirection: selectedAgent.callDirection,
        personality: selectedAgent.personality || undefined,
        systemPrompt: selectedAgent.systemPrompt || undefined,
        language: selectedAgent.language,
        isActive: selectedAgent.isActive,
        voiceId: selectedAgent.voiceId || undefined,
        settings: selectedAgent.settings || undefined,
      }
      if (!payload.name) throw new Error('missing_name')
      const response = await apiFetch(`/api/agents/${selectedAgent.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      if (!response.ok) throw new Error('save_failed')
      notify('Cambios guardados correctamente')
    } catch {
      // Local form edits are deliberately optimistic for typing, but they
      // must not survive a failed/missing PUT as if they had been persisted.
      setAgents(current => current.map(agent => agent.id === agentBeforeSave.id ? agentBeforeSave : agent))
      setLoadError('No se pudieron guardar los cambios. Se restauró la última configuración confirmada.')
      notify('No se pudieron guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoadingState label={locale === 'en' ? 'Loading agents' : 'Cargando agentes'} />

  return <main className="agents-page dark-scroll">
    <ProductPageHeader Icon={RiRobot2Line} title={t('modules.agentTitle')} description={locale === 'en' ? 'Manage your voice agents from one simple list.' : 'Gestiona todos tus agentes de voz desde una lista sencilla.'} actions={<div className="agents-header-actions"><button type="button" className="agent-button primary" onClick={() => setShowNewAgent(true)}><RiAddLine /> {t('modal.newAgent')}</button></div>} />

    {dataStatus !== 'empty' && dataStatus !== 'live' && <DataStatusBanner
      status={dataStatus}
      message={loadError || statusMessage(dataStatus, { live: 'Agentes reales cargados desde tu organización.', demo: 'Modo demo explícito: estos datos no activan agentes reales.' })}
      onRetry={dataStatus === 'error' || dataStatus === 'disconnected' ? () => setReloadKey(key => key + 1) : undefined}
      onAction={dataStatus === 'disconnected' || dataStatus === 'plan' ? () => navigate('/configuracion') : undefined}
      actionLabel={dataStatus === 'plan' ? 'Gestionar plan' : 'Configurar conexión'}
    />}

    <section className="agents-section agents-table-section">
      <div className="agents-toolbar"><div className="agents-tabs">{FILTERS.map(filter => <button type="button" key={filter} className={activeFilter === filter ? 'is-active' : ''} onClick={() => setActiveFilter(filter)}>{filter}<span>{agents.filter(agent => matchesStatusFilter(agent, filter)).length}</span></button>)}</div><div className="agents-toolbar-actions"><label className="agents-search"><RiSearchLine /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar agente..." /></label><label className="agents-sort"><RiFilter3Line /><select value={sort} onChange={event => setSort(event.target.value)}><option>Más recientes</option><option>Nombre A-Z</option></select><RiArrowDownSLine /></label></div></div>
      <div className="agents-table-wrap">
        <table className="agents-table">
          <thead><tr><th>Agente</th><th>Tipo</th><th>Idioma</th><th>Dirección</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>{loading ? <tr><td colSpan="6" className="agents-table-message">Cargando agentes…</td></tr> : loadError ? <tr><td colSpan="6" className="agents-table-message"><p>{loadError}</p>{dataStatus !== 'plan' ? <button type="button" className="agent-button secondary" onClick={() => setReloadKey(key => key + 1)}>Reintentar</button> : null}</td></tr> : filtered.length ? filtered.map(agent => <tr key={agent.id}><td><div className="agents-table-agent"><AgentAvatar agent={agent} /><span><strong>{agent.name}</strong><small>{agent.role}</small></span></div></td><td>{agentTypeLabel(agent.agentType, locale)}</td><td>{agent.language}</td><td>{callDirectionLabel(agent.callDirection, locale)}</td><td><StatusBadge status={agent.status} /></td><td><div className="agents-table-actions"><button type="button" className="agent-button secondary" onClick={() => navigate(`/agentes/${agent.id}`)}><RiExternalLinkLine /> Detalle</button><button type="button" className="agent-button primary" onClick={() => navigate(`/voz/cabina?agentId=${encodeURIComponent(agent.id)}`)}><RiPhoneLine /> Probar</button></div></td></tr>) : <tr><td colSpan="6" className="agents-table-message">{agents.length ? 'No hay agentes que coincidan con los filtros.' : 'Todavía no hay agentes registrados.'}</td></tr>}</tbody>
        </table>
      </div>
    </section>
    {toast && <div className="agents-toast" role="status"><RiCheckLine /> {toast}<button type="button" onClick={() => setToast('')} aria-label="Cerrar aviso"><RiCloseLine /></button></div>}
    {showNewAgent && <NewAgenteModal onClose={() => setShowNewAgent(false)} onSuccess={item => { const agent = normalizeAgent(item); setAgents(current => [agent, ...current]); setSelectedId(agent.id); setStudioTab('tipo'); setShowNewAgent(false); notify('Nuevo agente creado') }} />}
  </main>
}
