import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { RiAddLine, RiArrowDownSLine, RiArrowRightSLine, RiBuilding2Line, RiCalendarLine, RiCloseLine, RiErrorWarningLine, RiFilter3Line, RiGroupLine, RiPhoneLine, RiSearchLine, RiShoppingCart2Line } from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import FormInput from '../components/forms/FormInput'
import FormModal from '../components/ui/FormModal'
import FormRow from '../components/forms/FormRow'
import NewLeadModal from '../modals/NewLeadModal'
import NewOportunidadModal from '../modals/NewOportunidadModal'
import PageLoadingState from '../components/ui/PageLoadingState'
import ProductPageHeader from '../components/ui/ProductPageHeader'
import './sales-workspace.css'

const SOURCES = [
  { id: 'lead', label: 'Lead', plural: 'Leads', endpoint: '/api/leads', Icon: RiGroupLine },
  { id: 'account', label: 'Cuenta', plural: 'Cuentas', endpoint: '/api/accounts', Icon: RiBuilding2Line },
  { id: 'opportunity', label: 'Oportunidad', plural: 'Pipeline', endpoint: '/api/pipeline/list', Icon: RiShoppingCart2Line },
]
const SOURCE_BY_ID = Object.fromEntries(SOURCES.map(source => [source.id, source]))
const LEGACY_VIEW_TO_TYPE = { leads: 'lead', accounts: 'account', pipeline: 'opportunity' }
const TYPE_TO_LEGACY_VIEW = { lead: 'leads', account: 'accounts', opportunity: 'pipeline' }
const SAVED_VIEWS = [
  { id: 'general', label: 'Vista general', description: 'Todos los registros comerciales en una sola tabla.', type: 'all' },
  { id: 'pipeline', label: 'Pipeline comercial', description: 'Oportunidades activas ordenadas para avanzar el cierre.', type: 'opportunity' },
]
const stageTone = value => {
  const label = String(value || '').toLocaleLowerCase()
  if (label.includes('ganad') || label.includes('cerrad')) return 'success'
  if (label.includes('perdid') || label.includes('cancel')) return 'danger'
  if (label.includes('negoci') || label.includes('propuesta')) return 'warn'
  if (label.includes('contact') || label.includes('calific')) return 'info'
  return 'neutral'
}
const money = (value, currency = 'EUR') => Number.isFinite(Number(value)) ? new Intl.NumberFormat('es-ES', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value)) : '—'
const initials = value => String(value || '—').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
const listFrom = body => Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : []

function normalizeRecord(source, item) {
  if (source.id === 'account') return { id: item.id, entity: source.id, title: item.name || 'Cuenta sin nombre', subtitle: item.domain || item.website || item.industry || 'Sin datos de empresa', stage: item.lifecycleStatus || 'Activa', owner: item.owner?.name || item.ownerName || 'Sin asignar', next: item.lastActivityAt ? new Date(item.lastActivityAt).toLocaleDateString('es-ES') : 'Sin actividad', value: item.openPipelineValue != null ? money(item.openPipelineValue) : '—', numericValue: Number(item.openPipelineValue) || 0 }
  if (source.id === 'opportunity') return { id: item.id, entity: source.id, title: item.name || 'Oportunidad sin nombre', subtitle: [item.account?.name, item.lead?.name].filter(Boolean).join(' · ') || 'Sin cuenta ni contacto', stage: item.stageLabel || item.stage || 'Sin etapa', owner: item.assignee?.name || item.owner?.name || 'Sin asignar', next: item.expectedCloseDate ? `Cierre ${new Date(item.expectedCloseDate).toLocaleDateString('es-ES')}` : 'Sin cierre previsto', value: money(item.value, item.currency || 'EUR'), numericValue: Number(item.value) || 0 }
  return { id: item.id, entity: source.id, title: item.name || 'Lead sin nombre', subtitle: item.company || item.email || item.phone || 'Sin empresa', stage: item.statusLabel || item.status || 'Nuevo', owner: item.owner?.name || item.assignedTo?.name || 'Sin asignar', next: item.customFields?.nextAction || item.nextAction || 'Definir siguiente paso', value: money(item.customFields?.value ?? item.value), numericValue: Number(item.customFields?.value ?? item.value) || 0 }
}

function NewAccountModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ name: '', domain: '', industry: '', sizeBand: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  async function submit() {
    setSaving(true); setError('')
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value.trim()))
      const response = await apiFetch('/api/accounts', { method: 'POST', body: JSON.stringify(payload) })
      if (!response.ok) throw new Error()
      onSuccess(await response.json())
    } catch { setError('No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.') } finally { setSaving(false) }
  }
  return <FormModal title="Nueva cuenta" onClose={onClose} onSubmit={submit} submitText={saving ? 'Creando…' : 'Crear cuenta'} size="sm">
    <p className="sales-modal-intro">Crea la empresa y conecta después sus leads y oportunidades.</p>
    {error ? <p className="sales-modal-error" role="alert">{error}</p> : null}
    <FormInput label="Nombre" required autoFocus value={form.name} onChange={update('name')} placeholder="Ej. Vendrava" />
    <FormRow><FormInput label="Dominio" value={form.domain} onChange={update('domain')} placeholder="vendrava.com" /><FormInput label="Sector" value={form.industry} onChange={update('industry')} placeholder="Tecnología" /></FormRow>
    <FormInput label="Tamaño" value={form.sizeBand} onChange={update('sizeBand')} placeholder="11-50" />
  </FormModal>
}

function RecordInspector({ record, onClose, onOpen, onCalendar, onCall }) {
  if (!record) return <aside className="sales-inspector sales-inspector-empty"><RiGroupLine /><strong>Selecciona un registro</strong><p>Consulta su contexto y continúa la siguiente acción sin salir del CRM.</p></aside>
  const source = SOURCE_BY_ID[record.entity]
  return <aside className="sales-inspector" aria-label="Contexto del registro seleccionado">
    <header><span className="sales-avatar">{initials(record.title)}</span><div><strong>{record.title}</strong><small>{record.subtitle}</small></div><button type="button" onClick={onClose} aria-label="Cerrar contexto"><RiCloseLine /></button></header>
    <dl><div><dt>Tipo</dt><dd><span className="sales-record-kind"><source.Icon /> {source.label}</span></dd></div><div><dt>Estado</dt><dd><span className={`sales-stage ${stageTone(record.stage)}`}>{record.stage}</span></dd></div><div><dt>Responsable</dt><dd>{record.owner}</dd></div><div><dt>Siguiente paso</dt><dd>{record.next}</dd></div><div><dt>Valor estimado</dt><dd>{record.value}</dd></div></dl>
    <div className="sales-inspector-actions"><button type="button" className="sales-action-primary" onClick={onOpen}>Abrir ficha <RiArrowRightSLine /></button><button type="button" onClick={onCalendar}><RiCalendarLine /> Programar</button><button type="button" onClick={onCall}><RiPhoneLine /> Llamar</button></div>
  </aside>
}

export default function SalesCRMPage({ sectionNavigation = null }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [itemsBySource, setItemsBySource] = useState({ lead: [], account: [], opportunity: [] })
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [typeFilter, setTypeFilter] = useState(() => LEGACY_VIEW_TO_TYPE[searchParams.get('vista')] || 'all')
  const [activeView, setActiveView] = useState(() => searchParams.get('vista') === 'pipeline' ? 'pipeline' : 'general')
  const [stageFilter, setStageFilter] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [sortBy, setSortBy] = useState('next')
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [showNewLead, setShowNewLead] = useState(false)
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [showNewOpportunity, setShowNewOpportunity] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const records = useMemo(() => SOURCES.flatMap(source => itemsBySource[source.id].map(item => normalizeRecord(source, item))), [itemsBySource])
  const stageOptions = useMemo(() => [...new Set(records.filter(record => typeFilter === 'all' || record.entity === typeFilter).map(record => record.stage).filter(Boolean))], [records, typeFilter])
  const ownerOptions = useMemo(() => [...new Set(records.map(record => record.owner).filter(owner => owner !== 'Sin asignar'))], [records])
  const filteredRecords = useMemo(() => records.filter(record => (typeFilter === 'all' || record.entity === typeFilter) && (stageFilter === 'all' || record.stage === stageFilter) && (ownerFilter === 'all' || record.owner === ownerFilter)), [records, typeFilter, stageFilter, ownerFilter])
  const sortedRecords = useMemo(() => [...filteredRecords].sort((left, right) => {
    if (sortBy === 'value') return right.numericValue - left.numericValue
    if (sortBy === 'name') return left.title.localeCompare(right.title, 'es')
    return String(left.next).localeCompare(String(right.next), 'es')
  }), [filteredRecords, sortBy])
  const selected = sortedRecords.find(record => `${record.entity}:${record.id}` === selectedId) || null
  const selectedView = activeView === 'custom'
    ? { label: 'Filtros personalizados', description: 'Combina criterios para construir tu propia lista de trabajo.' }
    : SAVED_VIEWS.find(view => view.id === activeView) || SAVED_VIEWS[0]

  async function load() {
    setState('loading'); setError('')
    const query = new URLSearchParams({ limit: '50' })
    if (deferredSearch) query.set('search', deferredSearch)
    const results = await Promise.allSettled(SOURCES.map(async source => {
      const response = await apiFetch(`${source.endpoint}?${query.toString()}`)
      if (!response.ok) throw new Error(source.id)
      return [source.id, listFrom(await response.json())]
    }))
    const next = { lead: [], account: [], opportunity: [] }
    const successful = results.filter(result => result.status === 'fulfilled')
    successful.forEach(result => { next[result.value[0]] = result.value[1] })
    setItemsBySource(next)
    if (!successful.length) { setState('error'); setError('No se pudieron cargar los registros del CRM.') } else setState('ready')
  }

  useEffect(() => { const timer = window.setTimeout(load, deferredSearch ? 220 : 0); return () => window.clearTimeout(timer) }, [deferredSearch])

  const hasActiveFilters = Boolean(search || activeView !== 'general' || typeFilter !== 'all' || stageFilter !== 'all' || ownerFilter !== 'all')
  const setRecordType = nextType => { setActiveView('custom'); setTypeFilter(nextType); setStageFilter('all'); setSelectedId(null); setSearchParams(nextType === 'all' ? {} : { vista: TYPE_TO_LEGACY_VIEW[nextType] }) }
  const applySavedView = view => { setActiveView(view.id); setTypeFilter(view.type); setStageFilter('all'); setOwnerFilter('all'); setSelectedId(null); setSearchParams(view.type === 'all' ? {} : { vista: TYPE_TO_LEGACY_VIEW[view.type] }) }
  const resetFilters = () => { setSearch(''); applySavedView(SAVED_VIEWS[0]) }

  if (state === 'loading' && !records.length) return <PageLoadingState label="Cargando CRM" />

  return <main className="sales-workspace dark-scroll">
    <ProductPageHeader Icon={RiGroupLine} title="CRM" description="Una sola tabla para gestionar leads, cuentas y oportunidades." navigation={sectionNavigation} actions={<div className="sales-header-actions"><div className="sales-create-menu"><button type="button" className="sales-create" onClick={() => setShowCreateMenu(open => !open)} aria-expanded={showCreateMenu} aria-haspopup="menu"><RiAddLine /> Crear <RiArrowDownSLine /></button>{showCreateMenu ? <div className="sales-create-menu-popover" role="menu"><button type="button" role="menuitem" onClick={() => { setShowNewLead(true); setShowCreateMenu(false) }}><RiGroupLine /> Nuevo lead</button><button type="button" role="menuitem" onClick={() => { setShowNewAccount(true); setShowCreateMenu(false) }}><RiBuilding2Line /> Nueva cuenta</button><button type="button" role="menuitem" onClick={() => { setShowNewOpportunity(true); setShowCreateMenu(false) }}><RiShoppingCart2Line /> Nueva oportunidad</button></div> : null}</div></div>} />
    <section className="sales-saved-viewbar" aria-label="Vistas guardadas"><div className="sales-saved-view-content"><span>Vistas guardadas</span><div className="sales-saved-views">{SAVED_VIEWS.map(view => <button type="button" key={view.id} className={view.id === activeView ? 'active' : ''} onClick={() => applySavedView(view)}>{view.label}</button>)}</div></div><p>{selectedView.description}</p></section>
    <section className="sales-crm-layout"><div className="sales-records-panel">
      <div className="sales-records-toolbar sales-records-filters"><label><RiSearchLine /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por persona, empresa o oportunidad…" /><kbd>⌘ K</kbd></label><span className="sales-filter-field"><small>Tipo</small><select className="sales-stage-filter" value={typeFilter} onChange={event => setRecordType(event.target.value)} aria-label="Filtrar por tipo"><option value="all">Todos</option>{SOURCES.map(source => <option key={source.id} value={source.id}>{source.plural}</option>)}</select></span><span className="sales-filter-field"><small>Estado</small><select className="sales-stage-filter" value={stageFilter} onChange={event => { setActiveView('custom'); setStageFilter(event.target.value); setSelectedId(null) }} aria-label="Filtrar por estado" disabled={!stageOptions.length}><option value="all">Todos</option>{stageOptions.map(stage => <option key={stage} value={stage}>{stage}</option>)}</select></span><span className="sales-filter-field"><small>Responsable</small><select className="sales-stage-filter" value={ownerFilter} onChange={event => { setActiveView('custom'); setOwnerFilter(event.target.value); setSelectedId(null) }} aria-label="Filtrar por responsable" disabled={!ownerOptions.length}><option value="all">Todos</option>{ownerOptions.map(owner => <option key={owner} value={owner}>{owner}</option>)}</select></span><button type="button" className="sales-filter" onClick={resetFilters} disabled={!hasActiveFilters}><RiFilter3Line /> Limpiar</button></div>
      <div className="sales-table-caption"><div><strong>{selectedView.label}</strong><span>{state === 'ready' ? `${sortedRecords.length} registros en esta vista` : 'Preparando registros'}</span></div><label>Ordenar<select value={sortBy} onChange={event => setSortBy(event.target.value)} aria-label="Ordenar registros"><option value="next">Próximo paso</option><option value="value">Mayor valor</option><option value="name">Nombre</option></select></label></div>
      {state === 'error' ? <div className="sales-state error"><RiErrorWarningLine /><strong>{error}</strong><button type="button" onClick={load}>Reintentar</button></div> : null}
      {state === 'ready' && !sortedRecords.length ? <div className="sales-state"><RiGroupLine /><strong>{hasActiveFilters ? 'No hay coincidencias' : 'Todavía no hay registros en el CRM.'}</strong><span>{hasActiveFilters ? 'Prueba con otro criterio o limpia los filtros.' : 'Crea un lead, una cuenta o una oportunidad para empezar.'}</span>{!hasActiveFilters ? <button type="button" onClick={() => setShowNewLead(true)}>Crear primer lead</button> : null}</div> : null}
      {state === 'ready' && sortedRecords.length ? <div className="sales-table-wrap"><div className="sales-table-head sales-unified-table"><span>Registro</span><span>Tipo</span><span>Estado</span><span>Responsable</span><span>Próximo paso</span><span>Valor</span><span /></div><div className="sales-table">{sortedRecords.map(record => { const source = SOURCE_BY_ID[record.entity]; return <button type="button" key={`${record.entity}:${record.id}`} className={`sales-record-row sales-unified-table ${selected?.id === record.id && selected?.entity === record.entity ? 'selected' : ''}`} onClick={() => setSelectedId(`${record.entity}:${record.id}`)}><span className="sales-record-main"><i>{initials(record.title)}</i><span><strong>{record.title}</strong><small>{record.subtitle}</small></span></span><span className="sales-record-kind"><source.Icon /> {source.label}</span><span><em className={`sales-stage ${stageTone(record.stage)}`}>{record.stage}</em></span><span>{record.owner}</span><span>{record.next}</span><strong>{record.value}</strong><RiArrowRightSLine /></button> })}</div></div> : null}
    </div><RecordInspector record={selected} onClose={() => setSelectedId(null)} onOpen={() => navigate(`/ventas/${selected.entity}/${selected.id}`)} onCalendar={() => navigate('/calendario')} onCall={() => navigate('/llamadas')} /></section>
    {showNewLead ? <NewLeadModal onClose={() => setShowNewLead(false)} onSuccess={() => { setShowNewLead(false); load() }} /> : null}
    {showNewAccount ? <NewAccountModal onClose={() => setShowNewAccount(false)} onSuccess={() => { setShowNewAccount(false); load() }} /> : null}
    {showNewOpportunity ? <NewOportunidadModal onClose={() => setShowNewOpportunity(false)} onSuccess={() => { setShowNewOpportunity(false); load() }} /> : null}
  </main>
}
