import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAddLine, RiArrowRightSLine, RiCheckLine, RiDeleteBinLine, RiFlowChart,
  RiMailLine, RiMoreLine, RiPauseCircleLine, RiPhoneLine, RiPlayCircleLine,
  RiRefreshLine, RiSearchLine, RiSendPlaneLine, RiSparkling2Line, RiTimeLine,
  RiUserAddLine,
} from 'react-icons/ri'
import { HiChevronDown } from 'react-icons/hi'
import { apiFetch } from '../lib/api'
import DataStatusBanner from './ui/DataStatusBanner'
import ConfirmDialog from './ui/ConfirmDialog'
import { classifyFetchError, statusMessage } from '../lib/dataStatus'
import { mapAutomation } from '../lib/automationMapping'
import NewAutomatizacionModal from '../modals/NewAutomatizacionModal'
import useClickOutside from '../hooks/useClickOutside'
import automationHeroImage from '../assets/automation-hero.png'
import '../dashboard.css'
import './automations.css'
import { getLocale, localeCode, useI18n } from '../i18n'

const FILTER_TABS = ['Todas', 'Activas', 'Pausadas']
const SORT_OPTIONS = [{ key: 'recientes', label: 'Más recientes' }, { key: 'ejecuciones', label: 'Más ejecuciones' }, { key: 'nombre', label: 'Nombre (A-Z)' }]
const STARTER_TEMPLATES = [
  { Icon: RiPhoneLine, color: 'var(--danger-soft)', title: 'Seguimiento post-llamada', detail: 'Envía un email y crea una tarea después de cada llamada.', trigger: 'Llamada completada' },
  { Icon: RiUserAddLine, color: 'var(--cyan)', title: 'Bienvenida a nuevos leads', detail: 'Activa una primera acción cuando entra un contacto nuevo.', trigger: 'Nuevo lead creado' },
  { Icon: RiMailLine, color: 'var(--violet)', title: 'Reactivar oportunidades', detail: 'Detecta inactividad y vuelve a abrir la conversación.', trigger: 'Lead sin actividad > 7 días' },
]

function Metric({ Icon, label, value, detail, color }) {
  return <article className="automation-metric"><div className="automation-metric-icon" style={{ color, background: `color-mix(in srgb, ${color} 9%, transparent)`, borderColor: `color-mix(in srgb, ${color} 22%, transparent)` }}><Icon /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>
}

function Toggle({ active }) {
  return <span className={`automation-toggle${active ? ' active' : ''}`} aria-hidden="true"><i /></span>
}

export default function Automatizaciones() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('Todas')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('recientes')
  const [openSort, setOpenSort] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)
  const [showNewAutomation, setShowNewAutomation] = useState(false)
  const [automations, setAutomations] = useState([])
  const [loading, setLoading] = useState(true)
  const [dataStatus, setDataStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const sortRef = useRef(null)
  useClickOutside([sortRef], () => setOpenSort(false))

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setDataStatus('loading')
    setLoadError('')
    apiFetch('/api/automations')
      .then(async response => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar las automatizaciones.')
        return payload
      })
      .then(data => {
        if (!mounted) return
        const next = Array.isArray(data) ? data.map(mapAutomation) : []
        setAutomations(next)
        setDataStatus(next.length ? 'live' : 'empty')
      })
      .catch(error => {
        if (!mounted) return
        setAutomations([])
        const status = classifyFetchError(error)
        setDataStatus(status)
        setLoadError(error.message || statusMessage(status))
      })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [refreshKey])

  const activeCount = automations.filter(a => a.status === 'activa').length
  const pausedCount = automations.filter(a => a.status === 'pausada').length
  const totalRuns = automations.reduce((sum, a) => sum + (a.runsCount ?? 0), 0)
  const filtered = automations.filter(a => filter === 'Activas' ? a.status === 'activa' : filter === 'Pausadas' ? a.status === 'pausada' : true).filter(a => { const q = search.trim().toLowerCase(); return !q || a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q) })
  const sorted = [...filtered]
  if (sortBy === 'nombre') sorted.sort((a, b) => a.name.localeCompare(b.name))
  if (sortBy === 'ejecuciones') sorted.sort((a, b) => (b.runsCount ?? 0) - (a.runsCount ?? 0))
  const perPage = 10
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage))
  const paginated = sorted.slice((page - 1) * perPage, page * perPage)
  const sortLabel = SORT_OPTIONS.find(item => item.key === sortBy)?.label

  function setFilterAndReset(value) { setFilter(value); setPage(1) }
  async function toggleStatus(id) {
    const response = await apiFetch(`/api/automations/${id}/toggle`, { method: 'PUT' }).catch(() => null)
    if (!response?.ok) { setToast('No se pudo cambiar el estado. Si es un borrador, añade al menos una acción antes de activarlo.'); window.setTimeout(() => setToast(''), 3600); return }
    const updated = await response.json().catch(() => null)
    const isActive = updated ? Boolean(updated.isActive) : (automations.find(item => item.id === id)?.status !== 'activa')
    setAutomations(previous => previous.map(item => item.id === id ? { ...item, status: isActive ? 'activa' : 'pausada', rawStatus: updated?.status ?? item.rawStatus } : item))
  }
  async function deleteAutomation(id) {
    const response = await apiFetch(`/api/automations/${id}`, { method: 'DELETE' }).catch(() => null)
    if (response?.ok) setAutomations(previous => previous.filter(item => item.id !== id))
    else { setToast('No se pudo eliminar la automatización.'); window.setTimeout(() => setToast(''), 3600) }
  }

  const mutationsBlocked = loading || ['error', 'disconnected'].includes(dataStatus)
  const metricValue = value => loading || ['error', 'disconnected'].includes(dataStatus) ? '—' : value

  return <div className="dark-scroll automation-page">
    <DataStatusBanner
      status={dataStatus}
      message={loadError || statusMessage(dataStatus, { live: 'Automatizaciones sincronizadas con tu organización.', empty: 'La conexión responde, pero todavía no hay flujos creados.', disconnected: 'No se pueden consultar ni modificar flujos mientras no hay conexión con el servicio.' })}
      onRetry={dataStatus === 'error' || dataStatus === 'disconnected' ? () => setRefreshKey(value => value + 1) : undefined}
      onAction={dataStatus === 'disconnected' ? () => navigate('/configuracion') : undefined}
      actionLabel="Configurar conexión"
    />
    <header className="automation-header"><div className="automation-heading"><div className="automation-brand-icon"><RiFlowChart /></div><div><h1>{t('modules.automationTitle')}</h1><p>{t('modules.automationSubtitle')}</p></div></div><div className="automation-header-actions"><button className="automation-button ghost" onClick={() => setRefreshKey(value => value + 1)}><RiRefreshLine /> {t('calls.refresh')}</button><button className="automation-button secondary" onClick={() => document.querySelector('#automation-library')?.scrollIntoView({ behavior: 'smooth' })}><RiTimeLine /> {t('modules.viewFlows')}</button><button className="automation-button primary" onClick={() => setShowNewAutomation(true)}><RiAddLine /> {t('modal.newAutomation')}</button></div></header>

    <section className="automation-hero" aria-labelledby="automation-hero-title"><div className="automation-hero-copy"><div className="automation-hero-status"><i /> Motor operativo listo</div><h2 id="automation-hero-title">Tu operación no debería depender de recordar cada paso.</h2><p>Conecta disparadores y acciones para que el seguimiento ocurra solo, con la misma precisión cada vez.</p><div className="automation-hero-actions"><button className="automation-button primary" onClick={() => setShowNewAutomation(true)}><RiSparkling2Line /> Crear un flujo</button><button className="automation-button secondary" onClick={() => document.querySelector('#automation-library')?.scrollIntoView({ behavior: 'smooth' })}>Explorar automatizaciones <RiArrowRightSLine /></button></div><div className="automation-hero-meta"><span><RiCheckLine /> Flujos auditables</span><span><RiSendPlaneLine /> {activeCount} activos ahora</span></div></div><div className="automation-hero-media"><img src={automationHeroImage} alt="Motor visual de automatización con nodos conectados" /><div className="automation-hero-caption"><span>Workflow engine</span><strong>Disparar · decidir · actuar</strong></div></div></section>

    <section className="automation-metrics" aria-label="Resumen de automatizaciones"><Metric Icon={RiFlowChart} color="#818cf8" label="Total de flujos" value={metricValue(automations.length)} detail={dataStatus === 'empty' ? 'Aún no hay flujos' : `${metricValue(activeCount)} activos`} /><Metric Icon={RiPlayCircleLine} color="#34d399" label="Activos ahora" value={metricValue(activeCount)} detail="trabajando en segundo plano" /><Metric Icon={RiSendPlaneLine} color="#22d3ee" label="Ejecuciones" value={loading || ['error', 'disconnected'].includes(dataStatus) ? '—' : totalRuns.toLocaleString(localeCode(getLocale()))} detail="total acumulado" /><Metric Icon={RiPauseCircleLine} color="#f59e0b" label="Pausados" value={metricValue(pausedCount)} detail="pendientes de revisión" /></section>

    <section className="automation-flow-band"><div><span>Arquitectura simple</span><h2>Menos tareas repetidas. Más tiempo para decidir.</h2><p>Cada flujo combina un evento de entrada con acciones medibles y fáciles de revisar.</p></div><div className="automation-flow-steps"><div><span className="is-purple"><RiFlowChart /></span><strong>Disparador</strong><small>Detecta una señal</small></div><i /><div><span className="is-cyan"><RiSparkling2Line /></span><strong>Regla</strong><small>Aplica contexto</small></div><i /><div><span className="is-coral"><RiSendPlaneLine /></span><strong>Acción</strong><small>Mueve el proceso</small></div></div></section>

    <section className="automation-starters" aria-labelledby="automation-starters-title"><div className="automation-starters-heading"><div><span className="automation-eyebrow">Empieza rápido</span><h2 id="automation-starters-title">Tres flujos para ponerlo en marcha</h2><p>Usa una base conocida y ajusta los detalles a tu proceso.</p></div><button className="automation-link-button" onClick={() => setShowNewAutomation(true)}>Crear desde cero <RiArrowRightSLine /></button></div><div className="automation-starter-grid">{STARTER_TEMPLATES.map(template => <button className="automation-starter-card" key={template.title} onClick={() => setShowNewAutomation(true)}><span className="automation-starter-icon" style={{ color: template.color, background: `color-mix(in srgb, ${template.color} 9%, transparent)`, borderColor: `color-mix(in srgb, ${template.color} 27%, transparent)` }}><template.Icon /></span><span className="automation-starter-copy"><strong>{template.title}</strong><small>{template.detail}</small><em><RiFlowChart /> {template.trigger}</em></span><RiArrowRightSLine className="automation-starter-arrow" /></button>)}</div></section>

    {showNewAutomation && <NewAutomatizacionModal onClose={() => setShowNewAutomation(false)} onSuccess={() => { setShowNewAutomation(false); setRefreshKey(value => value + 1) }} />}

    <section className="automation-library" id="automation-library"><div className="automation-library-heading"><div><span className="automation-eyebrow">Centro de control</span><h2>Todos tus flujos</h2><p>Busca, filtra y revisa el estado de cada automatización.</p></div><div className="automation-library-count">{filtered.length} de {automations.length} flujos</div></div><div className="automation-toolbar"><div className="automation-search"><RiSearchLine /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="Buscar por nombre o descripción…" aria-label="Buscar automatizaciones" /></div><div className="automation-tabs" role="tablist">{FILTER_TABS.map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilterAndReset(item)}>{item}<small>{item === 'Todas' ? automations.length : item === 'Activas' ? activeCount : pausedCount}</small></button>)}</div><div className="automation-sort" ref={sortRef}><button onClick={() => setOpenSort(value => !value)}>Ordenar: <strong>{sortLabel}</strong><HiChevronDown className={openSort ? 'rotate' : ''} /></button>{openSort && <div className="automation-sort-menu">{SORT_OPTIONS.map(option => <button key={option.key} className={sortBy === option.key ? 'selected' : ''} onClick={() => { setSortBy(option.key); setOpenSort(false) }}>{option.label}</button>)}</div>}</div></div>

      <div className="automation-table-head"><span>Automatización</span><span>Estado</span><span>Disparador</span><span>Ejecuciones</span><span>Última ejecución</span><span /></div>
      {!paginated.length && <div className="automation-empty"><div><RiFlowChart /></div><strong>{search || filter !== 'Todas' ? 'No hay flujos con estos filtros' : 'Todavía no tienes automatizaciones'}</strong><p>{search || filter !== 'Todas' ? 'Prueba con otra búsqueda o cambia el filtro para ver más resultados.' : 'Crea tu primer flujo y deja que el seguimiento ocurra automáticamente.'}</p><button className="automation-button primary" onClick={() => setShowNewAutomation(true)}><RiAddLine /> Crear automatización</button></div>}
      <div className="automation-list">{paginated.map((automation, index) => { const active = automation.status === 'activa'; const isDraft = automation.rawStatus === 'draft'; const Icon = automation.Icon; const TriggerIcon = automation.TriggerIcon; return <article className="automation-row" key={automation.id ?? index} onClick={() => navigate(`/automatizaciones/${automation.id}`)}><div className="automation-name"><div className="automation-row-icon" style={{ color: automation.iconColor, background: `color-mix(in srgb, ${automation.iconBg} 13%, transparent)`, borderColor: `color-mix(in srgb, ${automation.iconBg} 33%, transparent)` }}><Icon /></div><div><strong>{automation.name}</strong><p>{automation.desc}</p><div className="automation-tags">{isDraft && <span className="status-draft-badge">Borrador</span>}{automation.tags.map(tag => <span key={tag}>{tag}</span>)}</div></div></div><button className="automation-status" onClick={event => { event.stopPropagation(); toggleStatus(automation.id) }}><span className={active ? 'status-active' : 'status-paused'}>{active ? 'Activa' : 'Pausada'}</span><Toggle active={active} /></button><div className="automation-trigger"><span><TriggerIcon /></span>{automation.trigger}</div><strong className="automation-runs">{automation.execs}</strong><span className="automation-last">{automation.last}</span><div className="automation-row-menu"><button aria-label={`Más acciones para ${automation.name}`} onClick={event => { event.stopPropagation(); setOpenMenuId(value => value === automation.id ? null : automation.id) }}><RiMoreLine /></button>{openMenuId === automation.id && <div className="automation-menu" onClick={event => event.stopPropagation()}><button onClick={() => { setOpenMenuId(null); setConfirmDeleteId(automation.id) }}><RiDeleteBinLine /> Eliminar</button></div>}</div></article> })}</div>
      <footer className="automation-pagination"><span>Mostrando {filtered.length ? Math.min((page - 1) * perPage + 1, filtered.length) : 0}–{Math.min(page * perPage, filtered.length)} de {filtered.length} automatizaciones</span><div><button disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}><HiChevronDown /></button>{Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 3).map(number => <button key={number} className={number === page ? 'active' : ''} onClick={() => setPage(number)}>{number}</button>)}<button disabled={page === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}><HiChevronDown className="next" /></button></div><span>{perPage} por página</span></footer>
    </section>
    {toast && <div className="automation-toast" role="status">{toast}</div>}
    {confirmDeleteId && <ConfirmDialog
      title="Eliminar automatización"
      message="Se eliminará esta automatización y dejará de ejecutarse. No se puede deshacer."
      confirmText="Eliminar"
      onConfirm={() => deleteAutomation(confirmDeleteId)}
      onClose={() => setConfirmDeleteId(null)}
    />}
  </div>
}
