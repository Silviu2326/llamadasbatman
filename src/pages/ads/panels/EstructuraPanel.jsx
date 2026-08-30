import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RiAddLine,
  RiArchiveLine,
  RiCheckLine,
  RiCloseLine,
  RiPauseCircleLine,
  RiPencilLine,
  RiPlayCircleLine,
  RiRefreshLine,
  RiRocketLine,
  RiStackLine,
  RiStopCircleLine,
} from 'react-icons/ri'
import { ACTIVATION_STATUS_LABEL, formatCents } from '../primitives'
import './ads-plan.css'

// Estructura publicitaria de la campaña global seleccionada: activaciones por
// plataforma, operación real en Meta, anuncios publicados, presupuesto y
// audiencias. Todo sale de plan.plan (/api/ads/plan); aquí no se fabrica nada:
// null = «Sin medición», 0 = medido y salió cero.

const PLATFORM_LABEL = { meta: 'Meta Ads', google: 'Google Ads' }
const ACTIVATION_TONE = { unconfigured: '', draft: 'tone-info', ready: 'tone-cyan', active: 'tone-ok', paused: 'tone-warn', finished: '' }

// Transiciones válidas de una activación: unconfigured→draft→ready→active↔paused→finished.
// El backend las valida; los botones solo ofrecen los pasos con sentido y el
// error del servidor llega por la notificación del hook.
const STATUS_ACTIONS = {
  draft: [{ status: 'ready', label: 'Marcar lista', Icon: RiCheckLine }],
  ready: [{ status: 'active', label: 'Activar', Icon: RiPlayCircleLine }],
  active: [{ status: 'paused', label: 'Pausar', Icon: RiPauseCircleLine }],
  paused: [
    { status: 'active', label: 'Reanudar', Icon: RiPlayCircleLine },
    { status: 'finished', label: 'Finalizar', Icon: RiStopCircleLine },
  ],
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : DATE_FORMAT.format(date)
}

function formatPeriod(startDate, endDate) {
  const start = formatDate(startDate)
  const end = formatDate(endDate)
  if (!start && !end) return 'Sin periodo'
  return `${start ?? '—'} – ${end ?? '—'}`
}

/** Valor de un <input type="date"> a partir de una fecha ISO del plan. */
function dateInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

/** Entrada en euros → céntimos enteros; vacío = sin presupuesto asignado. */
function eurosToCents(value) {
  if (value === '' || value == null) return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null
}

function ModalShell({ eyebrow, title, description, onClose, children }) {
  return <div className="gs-modal-backdrop" role="presentation" onClick={onClose}>
    <div className="gs-modal" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
      <div className="gs-modal-head">
        <span className="gs-modal-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        <button type="button" className="gs-modal-close" onClick={onClose} aria-label="Cerrar"><RiCloseLine /></button>
      </div>
      {children}
    </div>
  </div>
}

function ActivationModal({ activation, busy, onSave, onClose }) {
  const [objective, setObjective] = useState(activation.objective ?? '')
  const [budget, setBudget] = useState(activation.budgetCents == null ? '' : String(activation.budgetCents / 100))
  const [startDate, setStartDate] = useState(dateInputValue(activation.startDate))
  const [endDate, setEndDate] = useState(dateInputValue(activation.endDate))
  const [conversionEvent, setConversionEvent] = useState(activation.conversionEvent ?? '')

  async function submit(event) {
    event.preventDefault()
    const saved = await onSave({
      objective: objective.trim() || null,
      budgetCents: eurosToCents(budget),
      startDate: startDate || null,
      endDate: endDate || null,
      conversionEvent: conversionEvent.trim() || null,
    })
    if (saved) onClose()
  }

  return <ModalShell
    eyebrow="Activación Ads"
    title={`Editar activación de ${PLATFORM_LABEL[activation.platform] ?? activation.platform}`}
    description="El presupuesto asignado sale del presupuesto global de la campaña; el backend bloquea asignar más de lo disponible."
    onClose={onClose}
  >
    <form onSubmit={submit}>
      <div className="gs-modal-body">
        <div className="gs-form-grid">
          <label className="full">Objetivo publicitario
            <input className="gs-input" value={objective} onChange={event => setObjective(event.target.value)} placeholder="Ej.: generar leads cualificados para la oferta de la campaña" />
          </label>
          <label>Presupuesto asignado (€)
            <input className="gs-input" type="number" min="0" step="0.01" value={budget} onChange={event => setBudget(event.target.value)} placeholder="Sin asignar" />
          </label>
          <label>Evento de conversión
            <input className="gs-input" value={conversionEvent} onChange={event => setConversionEvent(event.target.value)} placeholder="Ej.: Lead" />
          </label>
          <label>Fecha de inicio
            <input className="gs-input" type="date" value={startDate} onChange={event => setStartDate(event.target.value)} />
          </label>
          <label>Fecha de fin
            <input className="gs-input" type="date" value={endDate} onChange={event => setEndDate(event.target.value)} />
          </label>
        </div>
      </div>
      <div className="gs-modal-foot">
        <p>Los cambios de estado (lista, activa, pausada…) se hacen desde la tarjeta, no aquí.</p>
        <div className="gs-modal-actions">
          <button type="button" className="gs-button ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="gs-button primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar activación'}</button>
        </div>
      </div>
    </form>
  </ModalShell>
}

function AudienceModal({ audience, busy, onSave, onClose }) {
  const [name, setName] = useState(audience?.name ?? '')
  const [segment, setSegment] = useState(audience?.segment ?? '')
  const [location, setLocation] = useState(audience?.location ?? '')
  const [ageRange, setAgeRange] = useState(audience?.ageRange ?? '')
  const [interests, setInterests] = useState((audience?.interests ?? []).join(', '))
  const [exclusions, setExclusions] = useState((audience?.exclusions ?? []).join(', '))
  const [customAudiences, setCustomAudiences] = useState((audience?.customAudiences ?? []).join(', '))
  const [estimatedSize, setEstimatedSize] = useState(audience?.estimatedSize == null ? '' : String(audience.estimatedSize))
  const [dataSource, setDataSource] = useState(audience?.dataSource ?? '')
  const [consentBasis, setConsentBasis] = useState(audience?.consentBasis ?? '')
  // Reutilizable = sin campaña (campaignId null): sirve a toda la organización.
  const [reusable, setReusable] = useState(audience ? audience.campaignId == null : false)

  const splitList = value => value.split(',').map(item => item.trim()).filter(Boolean)

  async function submit(event) {
    event.preventDefault()
    if (!name.trim()) return
    const size = estimatedSize === '' ? null : Number(estimatedSize)
    const saved = await onSave({
      name: name.trim(),
      segment: segment.trim() || null,
      location: location.trim() || null,
      ageRange: ageRange.trim() || null,
      interests: splitList(interests),
      exclusions: splitList(exclusions),
      customAudiences: splitList(customAudiences),
      // El tamaño estimado no se inventa: vacío = «Sin estimación» (null).
      estimatedSize: Number.isFinite(size) ? size : null,
      dataSource: dataSource.trim() || null,
      consentBasis: consentBasis.trim() || null,
      reusable,
    }, audience?.id)
    if (saved) onClose()
  }

  return <ModalShell
    eyebrow="Audiencia"
    title={audience ? 'Editar audiencia' : 'Nueva audiencia'}
    description="Las audiencias alimentan los briefs creativos y las activaciones. Una audiencia reutilizable queda disponible para cualquier campaña global."
    onClose={onClose}
  >
    <form onSubmit={submit}>
      <div className="gs-modal-body">
        <div className="gs-form-grid">
          <label className="full">Nombre <i>*</i>
            <input className="gs-input" value={name} onChange={event => setName(event.target.value)} required placeholder="Ej.: Decisores B2B en España" />
          </label>
          <label>Segmento
            <input className="gs-input" value={segment} onChange={event => setSegment(event.target.value)} placeholder="Ej.: dirección comercial" />
          </label>
          <label>Ubicación
            <input className="gs-input" value={location} onChange={event => setLocation(event.target.value)} placeholder="Ej.: España" />
          </label>
          <label>Rango de edad
            <input className="gs-input" value={ageRange} onChange={event => setAgeRange(event.target.value)} placeholder="Ej.: 30-55" />
          </label>
          <label>Tamaño estimado
            <input className="gs-input" type="number" min="0" value={estimatedSize} onChange={event => setEstimatedSize(event.target.value)} placeholder="Sin estimación" />
          </label>
          <label className="full">Intereses <small>separados por comas</small>
            <input className="gs-input" value={interests} onChange={event => setInterests(event.target.value)} placeholder="Ej.: CRM, ventas B2B, marketing" />
          </label>
          <label className="full">Exclusiones <small>separadas por comas</small>
            <input className="gs-input" value={exclusions} onChange={event => setExclusions(event.target.value)} placeholder="Ej.: clientes actuales" />
          </label>
          <label className="full">Audiencias propias <small>ids o nombres de custom audiences, separadas por comas</small>
            <input className="gs-input" value={customAudiences} onChange={event => setCustomAudiences(event.target.value)} placeholder="Ej.: lista-clientes-2026" />
          </label>
          <label>Origen de datos
            <input className="gs-input" value={dataSource} onChange={event => setDataSource(event.target.value)} placeholder="Ej.: CRM propio" />
          </label>
          <label>Base de consentimiento
            <input className="gs-input" value={consentBasis} onChange={event => setConsentBasis(event.target.value)} placeholder="Ej.: interés legítimo" />
          </label>
          <label className="full gs-field" style={{ gridAutoFlow: 'column', justifyContent: 'start', alignItems: 'center' }}>
            <input type="checkbox" checked={reusable} onChange={event => setReusable(event.target.checked)} />
            Reutilizable en toda la organización
          </label>
        </div>
      </div>
      <div className="gs-modal-foot">
        <p>El tamaño estimado es una estimación declarada, no una medición: si no la tienes, déjalo vacío.</p>
        <div className="gs-modal-actions">
          <button type="button" className="gs-button ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="gs-button primary" disabled={busy || !name.trim()}>{busy ? 'Guardando…' : 'Guardar audiencia'}</button>
        </div>
      </div>
    </form>
  </ModalShell>
}

export default function EstructuraPanel({ overview, plan, ui }) {
  const { locale } = ui
  const [editingActivation, setEditingActivation] = useState(null)
  const [audienceModal, setAudienceModal] = useState(null) // null | { audience: obj|null }
  const [archivingId, setArchivingId] = useState(null)

  if (!plan.selectedId) {
    return <section className="gs-panel gs-rise"><div className="gs-panel-body"><div className="gs-empty">
      <span><RiStackLine /></span>
      <h3>Sin campaña seleccionada</h3>
      <p>Selecciona una campaña global en la barra superior para ver su estructura publicitaria.</p>
    </div></div></section>
  }

  if (plan.planLoading && !plan.plan) {
    return <section className="gs-panel" aria-busy="true"><div className="gs-panel-body"><div className="gs-skeleton"><i /><i /><i /></div></div></section>
  }

  if (!plan.plan) {
    return <section className="gs-panel"><div className="gs-panel-body">
      <div className="gs-alert is-error" role="alert"><span>{plan.planError || 'No se pudo cargar el plan de esta campaña.'}</span><button type="button" className="gs-button small" onClick={plan.reloadPlan}><RiRefreshLine /> Reintentar</button></div>
    </div></section>
  }

  const { campaign, budget, activations, audiences, creatives } = plan.plan
  const campaignId = campaign?.id ?? plan.selectedId
  const metaActivation = activations.find(a => a.platform === 'meta') ?? null
  const overviewCampaign = overview.overview?.campaigns?.find(c => c.id === plan.selectedId) ?? null

  // Señal Meta = la campaña existe en la operación de Meta (overview) o su
  // activación tiene estado remoto o viene derivada de la configuración legacy.
  const hasMetaSignal = Boolean(overviewCampaign || metaActivation?.remote || metaActivation?.derivedFromLegacy)
  const metaPublished = Boolean(overviewCampaign?.metaCampaignId ?? metaActivation?.remote?.metaCampaignId)
  const metaActive = overviewCampaign?.crmStatus === 'active' || overviewCampaign?.status === 'active'
  const managing = overview.managingCampaign

  // Anuncios publicados de verdad: el remoto de la activación Meta y las
  // creatividades que ya viven como anuncio (metaAdId). Nada especulativo.
  const publishedAds = []
  if (metaActivation?.remote?.metaAdId) publishedAds.push({ key: `remote-${metaActivation.remote.metaAdId}`, title: 'Anuncio de la activación Meta', metaAdId: metaActivation.remote.metaAdId, status: metaActivation.remote.adStatus ?? null })
  for (const creative of (creatives ?? []).filter(c => c.metaAdId)) {
    publishedAds.push({ key: `creative-${creative.id}`, title: creative.headline || 'Creatividad sin titular', metaAdId: creative.metaAdId, status: null })
  }

  const overAssigned = budget?.globalCents != null && budget?.assignedCents != null && budget.assignedCents > budget.globalCents
  const budgetPct = budget?.globalCents ? Math.min(100, Math.round(((budget.assignedCents ?? 0) / budget.globalCents) * 100)) : 0

  return <div className="gs-stack">
    <section className="gs-panel gs-rise">
      <div className="gs-panel-head"><div>
        <h2>Activaciones por plataforma</h2>
        <p>La campaña global se ejecuta con una activación por canal de pago. Cada activación lleva su presupuesto, su cuenta y su evento de conversión.</p>
      </div></div>
      <div className="gs-panel-body">
        <div className="ah-cards">
          {activations.map(activation => {
            const busy = plan.busyId === (activation.id ?? 'new')
            const actions = activation.id ? STATUS_ACTIONS[activation.status] ?? [] : []
            return <article key={activation.id ?? activation.platform} className="ah-activation">
              <header>
                <strong>{PLATFORM_LABEL[activation.platform] ?? activation.platform}</strong>
                <span className={`gs-pill ${ACTIVATION_TONE[activation.status] ?? ''}`}>{ACTIVATION_STATUS_LABEL[activation.status] ?? activation.status}</span>
              </header>
              <dl className="ah-props">
                <div><dt>Presupuesto asignado</dt><dd className={activation.budgetCents == null ? 'is-missing' : ''}>{activation.budgetCents == null ? 'Sin asignar' : formatCents(activation.budgetCents, false, locale)}</dd></div>
                <div><dt>Objetivo publicitario</dt><dd className={activation.objective ? '' : 'is-missing'}>{activation.objective || 'Sin objetivo'}</dd></div>
                <div><dt>Cuenta</dt><dd className={activation.adAccountRef ? '' : 'is-missing'}>
                  {activation.adAccountRef || (activation.platform === 'meta' ? <Link to="/captacion/conectar">Sin cuenta conectada</Link> : 'Sin cuenta conectada')}
                </dd></div>
                <div><dt>Conversión</dt><dd className={activation.conversionEvent ? '' : 'is-missing'}>{activation.conversionEvent || 'Sin configurar'}</dd></div>
                <div><dt>Periodo</dt><dd className={activation.startDate || activation.endDate ? '' : 'is-missing'}>{formatPeriod(activation.startDate, activation.endDate)}</dd></div>
                {/* health es Json en el esquema: solo se pinta si es texto plano */}
                {typeof activation.health === 'string' && activation.health ? <div><dt>Salud</dt><dd>{activation.health}</dd></div> : null}
              </dl>
              {activation.derivedFromLegacy ? <p className="ah-note">
                Derivada de la configuración actual de Meta — formalízala para asignarle presupuesto propio.
                <br />
                <button type="button" className="gs-button small" disabled={busy} onClick={() => plan.createActivation({ campaignId, platform: 'meta' })}>{busy ? 'Creando…' : 'Formalizar activación'}</button>
              </p> : null}
              {!activation.id && !activation.derivedFromLegacy ? <p className="ah-note is-info">
                {activation.platform === 'google'
                  ? 'La conexión de Google Ads llega en la siguiente fase: la activación queda en borrador para reservar presupuesto y preparar briefs.'
                  : 'Esta plataforma todavía no tiene activación formal para esta campaña.'}
                <br />
                <button type="button" className="gs-button small" disabled={busy} onClick={() => plan.createActivation({ campaignId, platform: activation.platform })}>{busy ? 'Creando…' : 'Preparar activación'}</button>
              </p> : null}
              {activation.id ? <footer className="ah-actions">
                <button type="button" className="gs-button small ghost" disabled={busy} onClick={() => setEditingActivation(activation)}><RiPencilLine /> Editar</button>
                {actions.map(action => <button
                  key={action.status}
                  type="button"
                  className={`gs-button small ${action.status === 'active' ? 'accent' : action.status === 'finished' ? 'danger' : 'ghost'}`}
                  disabled={busy}
                  onClick={() => plan.updateActivation(activation.id, { status: action.status })}
                ><action.Icon /> {busy ? '…' : action.label}</button>)}
              </footer> : null}
            </article>
          })}
        </div>
      </div>
    </section>

    {hasMetaSignal ? <section className="gs-panel gs-rise">
      <div className="gs-panel-head"><div>
        <h2>Operación en Meta</h2>
        <p>Acciones reales sobre la campaña en Meta: publicar el borrador, activarla o pausarla y sincronizar el estado remoto.</p>
      </div></div>
      <div className="gs-panel-body">
        <div className="ah-actions">
          {!metaPublished
            ? <button type="button" className="gs-button primary" disabled={managing} onClick={() => overview.manageCampaign(plan.selectedId, 'publish')}><RiRocketLine /> {managing ? 'Enviando…' : 'Publicar borrador en Meta'}</button>
            : metaActive
              ? <button type="button" className="gs-button ghost" disabled={managing} onClick={() => overview.manageCampaign(plan.selectedId, 'pause')}><RiPauseCircleLine /> {managing ? 'Pausando…' : 'Pausar en Meta'}</button>
              : <button type="button" className="gs-button primary" disabled={managing} onClick={() => overview.manageCampaign(plan.selectedId, 'activate')}><RiPlayCircleLine /> {managing ? 'Activando…' : 'Activar en Meta'}</button>}
          <button type="button" className="gs-button ghost" disabled={managing} onClick={() => overview.syncCampaign(plan.selectedId)}><RiRefreshLine /> Sincronizar estado</button>
          <span className="gs-note">{metaPublished ? 'La campaña ya existe en Meta; el estado mostrado es el del último overview.' : 'La campaña todavía no está publicada en Meta.'}</span>
        </div>
      </div>
    </section> : null}

    <section className="gs-panel gs-rise">
      <div className="gs-panel-head"><div>
        <h2>Anuncios publicados</h2>
        <p>Solo lo que existe de verdad en la plataforma: el anuncio remoto de la activación y las creatividades ya convertidas en anuncio.</p>
      </div></div>
      <div className="gs-panel-body">
        {publishedAds.length ? <div className="ah-list">
          {publishedAds.map(ad => <div key={ad.key} className="ah-row">
            <div className="ah-row-main"><strong>{ad.title}</strong><small>Anuncio {ad.metaAdId}</small></div>
            <span className="ah-row-meta">{ad.status ?? 'Sin estado remoto'}</span>
          </div>)}
        </div> : <p className="gs-empty-inline">Sin anuncios publicados todavía.</p>}
      </div>
    </section>

    <section className="gs-panel gs-rise">
      <div className="gs-panel-head"><div>
        <h2>Presupuesto</h2>
        <p>El presupuesto global vive en la campaña; las activaciones reservan parte y el gasto real llega de las plataformas. Sin dato = «Sin medición».</p>
      </div></div>
      <div className="gs-panel-body">
        <div className="gs-stat-grid">
          <div className="gs-stat"><span>Global</span><strong>{formatCents(budget?.globalCents, false, locale)}</strong></div>
          <div className={`gs-stat${overAssigned ? ' is-bad' : ''}`}><span>Asignado a plataformas</span><strong>{formatCents(budget?.assignedCents, false, locale)}</strong></div>
          <div className="gs-stat"><span>Gasto real</span><strong>{formatCents(budget?.spentCents, false, locale)}</strong></div>
          <div className={`gs-stat${budget?.availableCents != null && budget.availableCents >= 0 ? ' is-ok' : ''}`}><span>Disponible</span><strong>{formatCents(budget?.availableCents, false, locale)}</strong></div>
        </div>
        {budget?.globalCents != null && budget?.assignedCents != null ? <div className={`ah-budget-bar${overAssigned ? ' is-over' : ''}`}>
          <div className="gs-bar-track"><i style={{ width: `${budgetPct}%` }} /></div>
          <small><b>{budgetPct}%</b> del presupuesto global está asignado a plataformas.{overAssigned ? ' El backend bloquea asignar más presupuesto del global: revisa las activaciones.' : ''}</small>
        </div> : null}
      </div>
    </section>

    <section className="gs-panel gs-rise">
      <div className="gs-panel-head">
        <div>
          <h2>Audiencias</h2>
          <p>Definiciones de a quién se dirige la campaña. Las reutilizables sirven a toda la organización; el resto pertenecen a esta campaña.</p>
        </div>
        <div className="gs-panel-actions">
          <button type="button" className="gs-button primary" onClick={() => setAudienceModal({ audience: null })}><RiAddLine /> Nueva audiencia</button>
        </div>
      </div>
      <div className="gs-panel-body">
        {audiences.length ? <div className="ah-list">
          {audiences.map(audience => {
            const busy = plan.busyId === audience.id
            const details = [audience.segment, audience.location, audience.ageRange].filter(Boolean).join(' · ') || 'Sin segmentación declarada'
            return <div key={audience.id} className="ah-row">
              <div className="ah-row-main">
                <strong>{audience.name}{audience.campaignId == null ? <span className="gs-pill tone-violet">Reutilizable</span> : null}</strong>
                <small>{details}</small>
              </div>
              <span className="ah-row-meta">
                {`${audience.interests?.length ?? 0} intereses · ${audience.exclusions?.length ?? 0} exclusiones`}<br />
                {`Tamaño: ${audience.estimatedSize == null ? 'Sin estimación' : audience.estimatedSize.toLocaleString('es-ES')} · ${audience.dataSource || 'Sin origen de datos'}`}
              </span>
              <div className="ah-actions">
                {archivingId === audience.id ? <span className="ah-confirm">
                  ¿Archivar?
                  <button type="button" className="gs-button small danger" disabled={busy} onClick={async () => { const done = await plan.archiveAudience(audience.id); if (done) setArchivingId(null) }}>{busy ? 'Archivando…' : 'Sí, archivar'}</button>
                  <button type="button" className="gs-button small ghost" onClick={() => setArchivingId(null)}>No</button>
                </span> : <>
                  <button type="button" className="gs-icon-button" aria-label={`Editar ${audience.name}`} disabled={busy} onClick={() => setAudienceModal({ audience })}><RiPencilLine /></button>
                  <button type="button" className="gs-icon-button" aria-label={`Archivar ${audience.name}`} disabled={busy} onClick={() => setArchivingId(audience.id)}><RiArchiveLine /></button>
                </>}
              </div>
            </div>
          })}
        </div> : <p className="gs-empty-inline">Todavía no hay audiencias en esta campaña. Crea la primera para poder preparar briefs creativos.</p>}
      </div>
    </section>

    {editingActivation ? <ActivationModal
      activation={editingActivation}
      busy={plan.busyId === editingActivation.id}
      onSave={body => plan.updateActivation(editingActivation.id, body)}
      onClose={() => setEditingActivation(null)}
    /> : null}

    {audienceModal ? <AudienceModal
      audience={audienceModal.audience}
      busy={plan.busyId === (audienceModal.audience?.id ?? 'new')}
      onSave={(body, id) => plan.saveAudience({ ...body, campaignId: body.reusable ? null : campaignId, reusable: undefined }, id)}
      onClose={() => setAudienceModal(null)}
    /> : null}
  </div>
}
