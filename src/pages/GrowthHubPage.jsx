import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { SequenceEnrollPanel, SequenceStepsEditor } from './growth/SequenceSteps'
import {
  RiAddLine,
  RiAlertLine,
  RiArrowRightLine,
  RiCheckboxCircleLine,
  RiCloseLine,
  RiArchiveLine,
  RiCustomerService2Line,
  RiFilter3Line,
  RiFlashlightLine,
  RiFlowChart,
  RiHeartPulseLine,
  RiMailSendLine,
  RiMegaphoneLine,
  RiMore2Fill,
  RiPlayCircleLine,
  RiRefreshLine,
  RiSearchLine,
  RiSendPlaneLine,
  RiTimeLine,
  RiUserAddLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import {
  PROGRAM_NAME_MAX_LENGTH,
  TYPE_OPTIONS,
  areaFromType,
  canToggleProgram,
  countByArea,
  errorMessageFrom,
  filterPrograms,
  filtersRevealing,
  normalizePrograms,
  readableType,
  replaceProgram,
  validateProgramName,
} from '../lib/growthPrograms'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { formatLocaleDate, localeCode, useI18n } from '../i18n'
import PageLoadingState from '../components/ui/PageLoadingState'
import ProductPageHeader from '../components/ui/ProductPageHeader'
import growthJourneyBanner from '../assets/growth/growth-journey-banner.png'
import customerPulseImage from '../assets/growth/customer-pulse.png'
import './growth-hub.css'
import './growth-hub-assets.css'
import './growth-visual-standard.css'

const AREA_META = {
  acquisition: { label: 'Captación', icon: RiUserAddLine, color: 'cyan' },
  newsletter: { label: 'Newsletter', icon: RiMailSendLine, color: 'violet' },
  automation: { label: 'Automatizaciones', icon: RiFlowChart, color: 'indigo' },
  sales: { label: 'Ventas', icon: RiSendPlaneLine, color: 'amber' },
  retention: { label: 'Fidelización', icon: RiHeartPulseLine, color: 'rose' },
}

const STATUS_META = {
  draft: { label: 'Borrador', tone: 'muted' },
  active: { label: 'Activo', tone: 'active' },
  paused: { label: 'Pausado', tone: 'paused' },
  scheduled: { label: 'Programado', tone: 'scheduled' },
  completed: { label: 'Completado', tone: 'completed' },
}

const SUGGESTIONS = [
  { type: 'lead_magnet', name: 'Guía experta con formulario de descarga', description: 'Objetivo: convertir tráfico con una propuesta de valor tangible. Landing, formulario y seguimiento de descarga.' },
  { type: 'newsletter', name: 'Newsletter editorial mensual', description: 'Objetivo: mantener relación con los contactos que aún no están listos. Calendario, segmentos y frecuencia elegida por cada contacto.' },
  { type: 'automation_journey', name: 'Nurturing de intención alta', description: 'Objetivo: acompañar a quien muestra señales de interés. Disparador, espera, condición y salto a ventas.' },
  { type: 'sales_sequence', name: 'Secuencia de seguimiento comercial', description: 'Objetivo: conseguir una siguiente conversación sin perder contexto. Tareas, mensajes y propuesta conectados a la oportunidad.' },
  { type: 'nps', name: 'Pulso NPS post-servicio', description: 'Objetivo: detectar riesgo, defensores y oportunidades de referidos. Encuesta, alerta y playbook de respuesta.' },
]

const EMPTY_FORM = {
  name: '',
  type: 'lead_magnet',
  description: '',
  status: 'draft',
  steps: [],
}

function displayDate(value, locale = 'es') {
  if (!value) return locale === 'en' ? 'No date' : 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return locale === 'en' ? 'No date' : 'Sin fecha'
  return formatLocaleDate(date, locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

function statusFor(program) {
  return STATUS_META[program?.status] || STATUS_META.draft
}

function AreaIcon({ area, size = 'normal' }) {
  const Icon = AREA_META[area]?.icon || RiFlashlightLine
  return <span className={`growth-area-icon ${AREA_META[area]?.color || 'indigo'} ${size}`}><Icon aria-hidden="true" /></span>
}

function ProgramStatus({ program }) {
  const status = statusFor(program)
  return <span className={`growth-status ${status.tone}`}><i />{status.label}</span>
}

function ProgramRow({ program, onToggle, onEdit, onArchive, onStatusChange, busyId }) {
  const { locale } = useI18n()
  const area = AREA_META[program.area] || AREA_META.automation
  const isBusy = busyId === program.id
  const canToggle = canToggleProgram(program)

  return <article className="growth-program-row">
    <AreaIcon area={program.area} />
    <div className="growth-program-copy">
      <div className="growth-program-title"><strong>{program.name || 'Programa sin nombre'}</strong><ProgramStatus program={program} /></div>
      <p>{program.description || 'Sin objetivo definido todavía.'}</p>
      <span>{area.label} · {readableType(program.type)}</span>
    </div>
    <div className="growth-program-date"><RiTimeLine aria-hidden="true" /> <time dateTime={program.updatedAt || program.createdAt}>{displayDate(program.updatedAt || program.createdAt, locale)}</time></div>
    <div className="growth-program-actions">
      {canToggle ? <button type="button" className="growth-small-button" onClick={() => onToggle(program)} disabled={isBusy} aria-label={program.status === 'active' ? `Pausar ${program.name}` : `Activar ${program.name}`}>
        {isBusy ? <RiRefreshLine className="growth-spin" /> : program.status === 'active' ? <RiTimeLine /> : <RiPlayCircleLine />}
        <span>{isBusy ? 'Guardando' : program.status === 'active' ? 'Pausar' : 'Activar'}</span>
      </button> : null}
      <button type="button" className="growth-icon-button" onClick={() => onArchive(program)} disabled={isBusy} aria-label={`Archivar ${program.name}`} title="Archivar"><RiArchiveLine /></button>
      <button type="button" className="growth-icon-button" onClick={() => onEdit(program)} aria-label={`Editar ${program.name}`} title="Editar"><RiMore2Fill /></button>
    </div>
    {program.type === 'sales_sequence' && <SequenceEnrollPanel program={program} onStatusChange={onStatusChange} />}
  </article>
}

function SuggestedProgram({ item, onUse }) {
  const area = AREA_META[areaFromType(item.type)]
  const Icon = area.icon
  return <article className="growth-suggestion">
    <span className={`growth-suggestion-icon ${area.color}`}><Icon aria-hidden="true" /></span>
    <div><span className="growth-suggestion-label">Sugerencia para empezar</span><h3>{item.name}</h3><p>{item.description}</p></div>
    <button type="button" onClick={() => onUse(item)}>Configurar <RiArrowRightLine /></button>
  </article>
}

function ProgramModal({ program, initial, onClose, onSubmit, saving, requestError }) {
  const isEditing = Boolean(program)
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    ...(initial || {}),
    ...(program || {}),
    steps: program?.config?.steps ?? initial?.steps ?? [],
  }))
  const isSequence = form.type === 'sales_sequence'
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, saving])

  function update(field, value) {
    setForm(current => ({ ...current, [field]: value }))
    if (field === 'name' && nameError) setNameError('')
  }

  function selectArea(area) {
    const preferred = TYPE_OPTIONS.find(option => option.area === area)
    if (preferred) update('type', preferred.value)
  }

  function submit(event) {
    event.preventDefault()
    // Misma regla que el backend (mínimo 2 caracteres): avisar aquí evita un 400 opaco.
    const invalidName = validateProgramName(form.name)
    if (invalidName) { setNameError(invalidName); return }
    const payload = {
      // `description` es opcional en el modelo: al editar un programa sin
      // objetivo llega como null y `.trim()` congelaba el modal sin guardar.
      name: String(form.name || '').trim(),
      description: String(form.description || '').trim(),
      status: form.status || 'draft',
    }
    if (!isEditing) payload.type = form.type
    // Los pasos son lo que ejecuta el runner: sin ellos, matricular falla.
    if (isSequence) payload.config = { ...(program?.config || {}), steps: form.steps }
    onSubmit(payload)
  }

  return <div className="growth-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <form className="growth-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="growth-program-title">
      <header className="growth-modal-head">
        <div><span>{isEditing ? 'Editar programa' : 'Nuevo programa'}</span><h2 id="growth-program-title">{isEditing ? 'Afina el siguiente movimiento' : 'Diseña una iniciativa conectada'}</h2></div>
        <button type="button" className="growth-icon-button" onClick={onClose} disabled={saving} aria-label="Cerrar"><RiCloseLine /></button>
      </header>
      <div className="growth-modal-body">
        <label className="growth-field wide"><span>Nombre</span><input autoFocus value={form.name} maxLength={PROGRAM_NAME_MAX_LENGTH} onChange={event => update('name', event.target.value)} placeholder="Ej. Secuencia de propuesta abierta" required aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'growth-program-name-error' : undefined} />{nameError ? <small id="growth-program-name-error" className="growth-field-error" role="alert">{nameError}</small> : null}</label>
        <label className="growth-field"><span>Área {isEditing ? '(no editable)' : ''}</span><select value={areaFromType(form.type)} onChange={event => selectArea(event.target.value)} disabled={isEditing}>{Object.entries(AREA_META).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}</select></label>
        <label className="growth-field"><span>Formato {isEditing ? '(no editable)' : ''}</span><select value={form.type} onChange={event => update('type', event.target.value)} disabled={isEditing}>{TYPE_OPTIONS.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        <label className="growth-field wide"><span>Objetivo y notas de configuración</span><textarea value={form.description || ''} onChange={event => update('description', event.target.value)} rows="4" maxLength="1600" placeholder="Objetivo, audiencia, disparador, oferta o regla comercial…" /></label>
        <label className="growth-field"><span>Estado inicial</span><select value={form.status || 'draft'} onChange={event => update('status', event.target.value)}><option value="draft">Borrador</option><option value="active">Activo</option><option value="paused">Pausado</option></select></label>
        {isSequence && <SequenceStepsEditor steps={form.steps} onChange={steps => update('steps', steps)} />}
        <aside className="growth-modal-note"><RiCheckboxCircleLine /><span>El programa queda guardado para tu organización. Podrás activarlo o pausarlo desde este centro.</span></aside>
      </div>
      {requestError ? <p className="growth-modal-error" role="alert"><RiAlertLine /> {requestError}</p> : null}
      <footer className="growth-modal-actions"><button type="button" className="growth-button subtle" onClick={onClose} disabled={saving}>Cancelar</button><button className="growth-button primary" disabled={saving}>{saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear programa'}</button></footer>
    </form>
  </div>
}

export default function GrowthHubPage() {
  const { locale } = useI18n()
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  // Arranca en «Todo»: empezar en un área ocultaba los programas de las demás.
  const [activeArea, setActiveArea] = useState('all')
  const [activeStatus, setActiveStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [archiveTarget, setArchiveTarget] = useState(null)
  const deferredQuery = useDeferredValue(query)

  async function loadPrograms() {
    setLoading(true)
    setLoadError('')
    try {
      const response = await apiFetch('/api/growth-programs')
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorMessageFrom(payload, 'No pudimos cargar los programas de crecimiento.'))
      setPrograms(normalizePrograms(payload))
    } catch (error) {
      setPrograms([])
      setLoadError(error.message || 'No pudimos cargar los programas de crecimiento.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPrograms() }, [])

  const filteredPrograms = useMemo(
    () => filterPrograms(programs, { area: activeArea, status: activeStatus, query: deferredQuery, localeTag: localeCode(locale) }),
    [activeArea, activeStatus, deferredQuery, programs, locale],
  )

  const activeCount = useMemo(() => programs.filter(program => program.status === 'active').length, [programs])
  const areaCounts = useMemo(() => countByArea(programs), [programs])

  function openCreate(initial = null) {
    setSaveError('')
    setModal({ kind: 'create', initial })
  }

  function openEdit(program) {
    setSaveError('')
    setModal({ kind: 'edit', program })
  }

  async function saveProgram(input) {
    setSaving(true)
    setSaveError('')
    const editing = modal?.kind === 'edit'
    try {
      const response = await apiFetch(editing ? `/api/growth-programs/${modal.program.id}` : '/api/growth-programs', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(input),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorMessageFrom(payload, 'No pudimos guardar el programa.'))
      const saved = payload?.program || payload?.data || payload
      const normalized = normalizePrograms([saved])[0]
      if (editing) {
        setPrograms(current => replaceProgram(current, modal.program.id, normalized))
      } else if (normalized) {
        setPrograms(current => [normalized, ...current])
        // Un programa recién creado siempre debe verse: si los filtros lo
        // ocultarían (otra área, otro estado, búsqueda), se restablecen.
        const next = filtersRevealing(normalized, { area: activeArea, status: activeStatus, query, localeTag: localeCode(locale) })
        setActiveArea(next.area)
        setActiveStatus(next.status)
        setQuery(next.query)
      }
      setModal(null)
      setNotice(editing ? 'Programa actualizado.' : normalized?.status === 'active' ? 'Programa creado y activo.' : 'Programa creado.')
    } catch (error) {
      setSaveError(error.message || 'No pudimos guardar el programa.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleProgram(program) {
    const isActive = program.status === 'active'
    const nextStatus = isActive ? 'paused' : 'active'
    setBusyId(program.id)
    setNotice('')
    setActionError('')
    // Las secuencias comerciales usan /pause y /resume: además del programa,
    // pausan o reanudan sus matrículas. Un PUT de estado las dejaba desalineadas.
    const isSequence = program.type === 'sales_sequence'
    const request = isSequence
      ? apiFetch(`/api/growth-programs/${program.id}/${isActive ? 'pause' : 'resume'}`, { method: 'POST' })
      : apiFetch(`/api/growth-programs/${program.id}`, { method: 'PUT', body: JSON.stringify({ status: nextStatus }) })
    try {
      const response = await request
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorMessageFrom(payload, 'No pudimos actualizar el estado.'))
      const saved = isSequence ? { status: payload?.status || nextStatus } : payload?.program || payload?.data || payload
      setPrograms(current => current.map(item => item.id === program.id ? { ...item, ...saved, area: item.area, status: saved?.status || nextStatus } : item))
      setNotice(nextStatus === 'active' ? 'Programa activado.' : 'Programa pausado.')
    } catch (error) {
      // Un fallo puntual no debe sustituir la lista: se muestra como aviso.
      setActionError(error.message || 'No pudimos actualizar el estado del programa.')
    } finally {
      setBusyId(null)
    }
  }

  function updateProgramStatus(programId, status) {
    setPrograms(current => current.map(item => item.id === programId ? { ...item, status } : item))
  }

  async function archiveProgram(program) {
    setBusyId(program.id)
    setNotice('')
    setActionError('')
    try {
      const response = await apiFetch(`/api/growth-programs/${program.id}/archive`, { method: 'POST' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorMessageFrom(payload, 'No pudimos archivar el programa.'))
      setPrograms(current => current.filter(item => item.id !== program.id))
      setNotice(`«${program.name || 'Programa'}» archivado.`)
    } catch (error) {
      setActionError(error.message || 'No pudimos archivar el programa.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <PageLoadingState label={locale === 'en' ? 'Loading Growth Hub' : 'Cargando Growth Hub'} />

  return <main className="growth-page">
    <ProductPageHeader Icon={RiMegaphoneLine} title="Growth" description={locale === 'en' ? 'Design how to acquire, engage, sell and retain without losing the thread between teams.' : 'Diseña cómo captar, conversar, vender y fidelizar sin perder el hilo entre equipos.'} actions={<button className="growth-button primary" type="button" onClick={() => openCreate()}><RiAddLine /> {locale === 'en' ? 'New program' : 'Nuevo programa'}</button>} />

    <section className="growth-command" aria-label="Resumen de crecimiento">
      <div className="growth-command-intro"><span>Centro de operaciones</span><h2>Convierte cada señal en una siguiente acción.</h2><p>Los programas guardan intención, responsable operativo y estado en una misma vista.</p></div>
      <div className="growth-command-stats"><div><strong>{programs.length}</strong><span>programas</span></div><div><strong>{activeCount}</strong><span>en marcha</span></div><div><strong>{Object.keys(areaCounts).length}</strong><span>áreas activas</span></div></div>
      <div className="growth-command-visual" aria-hidden="true"><img src={growthJourneyBanner} alt="" /></div>
    </section>

    <section className="growth-area-tabs" aria-label="Áreas de trabajo">
      <button type="button" className={activeArea === 'all' ? 'active' : ''} onClick={() => setActiveArea('all')}><RiFlashlightLine /><span>Todo</span><em>{programs.length}</em></button>
      {Object.entries(AREA_META).map(([area, meta]) => { const Icon = meta.icon; return <button key={area} type="button" className={activeArea === area ? 'active' : ''} onClick={() => setActiveArea(area)}><Icon /><span>{meta.label}</span><em>{areaCounts[area] || 0}</em></button> })}
    </section>

    <section className="growth-workspace">
      <div className="growth-list-panel">
        <div className="growth-list-head"><div><span>Programas</span><h2>Iniciativas guardadas</h2></div></div>
        {actionError ? <p className="growth-modal-error growth-inline-error" role="alert"><RiAlertLine /> <span>{actionError}</span><button type="button" className="growth-icon-button" onClick={() => setActionError('')} aria-label="Cerrar aviso"><RiCloseLine /></button></p> : null}
        <div className="growth-toolbar"><label className="growth-search"><RiSearchLine /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nombre, objetivo o formato" aria-label="Buscar programas" /></label><label className="growth-status-filter"><RiFilter3Line /><span className="sr-only">Filtrar por estado</span><select value={activeStatus} onChange={event => setActiveStatus(event.target.value)}><option value="all">Todos los estados</option><option value="active">Activos</option><option value="draft">Borradores</option><option value="paused">Pausados</option><option value="completed">Completados</option></select></label></div>

        {loading ? <div className="growth-state loading"><span /><p>Preparando tu mapa de crecimiento…</p></div> : loadError ? <div className="growth-state error" role="alert"><RiAlertLine /><h3>No pudimos cargar Growth Hub</h3><p>{loadError}</p><button type="button" className="growth-button subtle" onClick={loadPrograms}><RiRefreshLine /> Reintentar</button></div> : programs.length === 0 ? <div className="growth-empty"><span className="growth-empty-icon"><RiFlashlightLine /></span><div><h3>Elige un movimiento para empezar</h3><p>No hay programas guardados todavía. Estas sugerencias no son datos demo: son puntos de partida que puedes configurar para tu organización.</p></div><div className="growth-suggestions">{SUGGESTIONS.map(item => <SuggestedProgram key={item.type} item={item} onUse={openCreate} />)}</div></div> : filteredPrograms.length ? <div className="growth-program-list">{filteredPrograms.map(program => <ProgramRow key={program.id} program={program} onToggle={toggleProgram} onEdit={openEdit} onArchive={setArchiveTarget} onStatusChange={updateProgramStatus} busyId={busyId} />)}</div> : <div className="growth-state filtered"><RiSearchLine /><h3>No hay programas con estos filtros</h3><p>Prueba con otro término o restablece los filtros para volver a ver todas las iniciativas.</p><button type="button" className="growth-button subtle" onClick={() => { setQuery(''); setActiveStatus('all'); setActiveArea('all') }}>Limpiar filtros</button></div>}
      </div>
      <aside className="growth-side-panel">
        <div className="growth-side-intro"><span>Mapa de capacidades</span><h2>Una operación conectada</h2><p>Cada área puede activar herramientas concretas, sin imponer un proceso único.</p><img className="growth-customer-pulse" src={customerPulseImage} alt="Visual de una red de señales de cliente" /></div>
        <div className="growth-capability-list">
          <div><AreaIcon area="acquisition" /><span><strong>Captación</strong><small>Lead magnets, formularios y popups</small></span></div>
          <div><AreaIcon area="newsletter" /><span><strong>Newsletter</strong><small>Contenido, segmentos y preferencias</small></span></div>
          <div><AreaIcon area="automation" /><span><strong>Automatizaciones</strong><small>Disparadores, condiciones y esperas</small></span></div>
          <div><AreaIcon area="sales" /><span><strong>Ventas</strong><small>Secuencias, propuestas y agenda</small></span></div>
          <div><AreaIcon area="retention" /><span><strong>Fidelización</strong><small>NPS, referidos y customer health</small></span></div>
        </div>
        <div className="growth-side-footer"><RiCustomerService2Line /><p><strong>Próximo paso recomendado</strong>Activa solo lo que puedas medir y responder; después conecta los resultados con el CRM.</p></div>
      </aside>
    </section>

    {notice ? <div className="growth-toast" role="status"><RiCheckboxCircleLine />{notice}<button type="button" onClick={() => setNotice('')} aria-label="Cerrar aviso"><RiCloseLine /></button></div> : null}
    {archiveTarget ? <ConfirmDialog
      title={`¿Archivar «${archiveTarget.name || 'Programa'}»?`}
      message={archiveTarget.type === 'sales_sequence'
        ? 'Dejará de aparecer en Growth y la secuencia no ejecutará más pasos. El registro y su historial se conservan para auditoría.'
        : 'Dejará de aparecer en Growth y no se podrá editar ni activar. El registro se conserva para auditoría.'}
      confirmText="Archivar programa"
      onConfirm={() => archiveProgram(archiveTarget)}
      onClose={() => setArchiveTarget(null)}
    /> : null}
    {modal ? <ProgramModal program={modal.program} initial={modal.initial} onClose={() => !saving && setModal(null)} onSubmit={saveProgram} saving={saving} requestError={saveError} /> : null}
  </main>
}
