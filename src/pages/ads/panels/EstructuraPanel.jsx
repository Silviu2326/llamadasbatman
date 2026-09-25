import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatLocaleNumber } from '../../../i18n'
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
import { activationStatusLabel, formatCents, formatPeriod } from '../primitives'
import './ads-plan.css'

// Estructura publicitaria de la campaña global seleccionada: activaciones por
// plataforma, operación real en Meta, anuncios publicados, presupuesto y
// audiencias. Todo sale de plan.plan (/api/ads/plan); aquí no se fabrica nada:
// null = «Sin medición», 0 = medido y salió cero.

const ACTIVATION_TONE = { unconfigured: '', draft: 'tone-info', ready: 'tone-cyan', active: 'tone-ok', paused: 'tone-warn', finished: '' }

// Transiciones válidas de una activación: unconfigured→draft→ready→active↔paused→finished.
// El backend las valida; los botones solo ofrecen los pasos con sentido y el
// error del servidor llega por la notificación del hook.
// Etiquetas en ads.estructura.actions.<key>.
const STATUS_ACTIONS = {
  draft: [{ status: 'ready', key: 'ready', Icon: RiCheckLine }],
  ready: [{ status: 'active', key: 'activate', Icon: RiPlayCircleLine }],
  active: [{ status: 'paused', key: 'pause', Icon: RiPauseCircleLine }],
  paused: [
    { status: 'active', key: 'resume', Icon: RiPlayCircleLine },
    { status: 'finished', key: 'finish', Icon: RiStopCircleLine },
  ],
}

function platformLabel(t, platform) {
  return t(`ads.platform.${platform}`) ?? platform
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

function ModalShell({ eyebrow, title, description, onClose, closeLabel, children }) {
  return <div className="gs-modal-backdrop" role="presentation" onClick={onClose}>
    <div className="gs-modal" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
      <div className="gs-modal-head">
        <span className="gs-modal-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        <button type="button" className="gs-modal-close" onClick={onClose} aria-label={closeLabel}><RiCloseLine /></button>
      </div>
      {children}
    </div>
  </div>
}

function ActivationModal({ activation, busy, onSave, onClose, t }) {
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
    eyebrow={t('ads.estructura.editEyebrow')}
    title={t('ads.estructura.editTitle', { platform: platformLabel(t, activation.platform) })}
    description={t('ads.estructura.editDescription')}
    onClose={onClose}
    closeLabel={t('ads.common.close')}
  >
    <form onSubmit={submit}>
      <div className="gs-modal-body">
        <div className="gs-form-grid">
          <label className="full">{t('ads.estructura.objectiveLabel')}
            <input className="gs-input" value={objective} onChange={event => setObjective(event.target.value)} placeholder={t('ads.estructura.objectivePlaceholder')} />
          </label>
          <label>{t('ads.estructura.budgetLabel')}
            <input className="gs-input" type="number" min="0" step="0.01" value={budget} onChange={event => setBudget(event.target.value)} placeholder={t('ads.estructura.budgetPlaceholder')} />
          </label>
          <label>{t('ads.estructura.conversionLabel')}
            <input className="gs-input" value={conversionEvent} onChange={event => setConversionEvent(event.target.value)} placeholder={t('ads.estructura.conversionPlaceholder')} />
          </label>
          <label>{t('ads.estructura.startDate')}
            <input className="gs-input" type="date" value={startDate} onChange={event => setStartDate(event.target.value)} />
          </label>
          <label>{t('ads.estructura.endDate')}
            <input className="gs-input" type="date" value={endDate} onChange={event => setEndDate(event.target.value)} />
          </label>
        </div>
      </div>
      <div className="gs-modal-foot">
        <p>{t('ads.estructura.statusNote')}</p>
        <div className="gs-modal-actions">
          <button type="button" className="gs-button ghost" onClick={onClose}>{t('ads.common.cancel')}</button>
          <button type="submit" className="gs-button primary" disabled={busy}>{busy ? t('ads.common.saving') : t('ads.estructura.saveActivation')}</button>
        </div>
      </div>
    </form>
  </ModalShell>
}

function AudienceModal({ audience, busy, onSave, onClose, t }) {
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
    eyebrow={t('ads.estructura.audienceEyebrow')}
    title={audience ? t('ads.estructura.editAudience') : t('ads.estructura.newAudience')}
    description={t('ads.estructura.audienceDescription')}
    onClose={onClose}
    closeLabel={t('ads.common.close')}
  >
    <form onSubmit={submit}>
      <div className="gs-modal-body">
        <div className="gs-form-grid">
          <label className="full">{t('ads.estructura.name')} <i>*</i>
            <input className="gs-input" value={name} onChange={event => setName(event.target.value)} required placeholder={t('ads.estructura.namePlaceholder')} />
          </label>
          <label>{t('ads.estructura.segment')}
            <input className="gs-input" value={segment} onChange={event => setSegment(event.target.value)} placeholder={t('ads.estructura.segmentPlaceholder')} />
          </label>
          <label>{t('ads.estructura.location')}
            <input className="gs-input" value={location} onChange={event => setLocation(event.target.value)} placeholder={t('ads.estructura.locationPlaceholder')} />
          </label>
          <label>{t('ads.estructura.ageRange')}
            <input className="gs-input" value={ageRange} onChange={event => setAgeRange(event.target.value)} placeholder={t('ads.estructura.agePlaceholder')} />
          </label>
          <label>{t('ads.estructura.estimatedSize')}
            <input className="gs-input" type="number" min="0" value={estimatedSize} onChange={event => setEstimatedSize(event.target.value)} placeholder={t('ads.estructura.noEstimate')} />
          </label>
          <label className="full">{t('ads.estructura.interests')} <small>{t('ads.estructura.commaSeparated')}</small>
            <input className="gs-input" value={interests} onChange={event => setInterests(event.target.value)} placeholder={t('ads.estructura.interestsPlaceholder')} />
          </label>
          <label className="full">{t('ads.estructura.exclusions')} <small>{t('ads.estructura.commaSeparated')}</small>
            <input className="gs-input" value={exclusions} onChange={event => setExclusions(event.target.value)} placeholder={t('ads.estructura.exclusionsPlaceholder')} />
          </label>
          <label className="full">{t('ads.estructura.customAudiences')} <small>{t('ads.estructura.customAudiencesHint')}</small>
            <input className="gs-input" value={customAudiences} onChange={event => setCustomAudiences(event.target.value)} placeholder={t('ads.estructura.customAudiencesPlaceholder')} />
          </label>
          <label>{t('ads.estructura.dataSource')}
            <input className="gs-input" value={dataSource} onChange={event => setDataSource(event.target.value)} placeholder={t('ads.estructura.dataSourcePlaceholder')} />
          </label>
          <label>{t('ads.estructura.consentBasis')}
            <input className="gs-input" value={consentBasis} onChange={event => setConsentBasis(event.target.value)} placeholder={t('ads.estructura.consentPlaceholder')} />
          </label>
          <label className="full gs-field" style={{ gridAutoFlow: 'column', justifyContent: 'start', alignItems: 'center' }}>
            <input type="checkbox" checked={reusable} onChange={event => setReusable(event.target.checked)} />
            {t('ads.estructura.reusableOrg')}
          </label>
        </div>
      </div>
      <div className="gs-modal-foot">
        <p>{t('ads.estructura.sizeNote')}</p>
        <div className="gs-modal-actions">
          <button type="button" className="gs-button ghost" onClick={onClose}>{t('ads.common.cancel')}</button>
          <button type="submit" className="gs-button primary" disabled={busy || !name.trim()}>{busy ? t('ads.common.saving') : t('ads.estructura.saveAudience')}</button>
        </div>
      </div>
    </form>
  </ModalShell>
}

export default function EstructuraPanel({ overview, plan, ui }) {
  const { locale, t } = ui
  const [editingActivation, setEditingActivation] = useState(null)
  const [audienceModal, setAudienceModal] = useState(null) // null | { audience: obj|null }
  const [archivingId, setArchivingId] = useState(null)

  if (!plan.selectedId) {
    return <section className="gs-panel gs-rise"><div className="gs-panel-body"><div className="gs-empty">
      <span><RiStackLine /></span>
      <h3>{t('ads.estructura.noCampaignTitle')}</h3>
      <p>{t('ads.estructura.noCampaignText')}</p>
    </div></div></section>
  }

  if (plan.planLoading && !plan.plan) {
    return <section className="gs-panel" aria-busy="true"><div className="gs-panel-body"><div className="gs-skeleton"><i /><i /><i /></div></div></section>
  }

  if (!plan.plan) {
    return <section className="gs-panel"><div className="gs-panel-body">
      <div className="gs-alert is-error" role="alert"><span>{plan.planError || t('ads.common.planLoadError')}</span><button type="button" className="gs-button small" onClick={plan.reloadPlan}><RiRefreshLine /> {t('ads.common.retry')}</button></div>
    </div></section>
  }

  const { campaign, budget, activations, audiences, creatives } = plan.plan
  const campaignId = campaign?.id ?? plan.selectedId
  const metaActivation = activations.find(a => a.platform === 'meta') ?? null
  const overviewCampaign = overview.overview?.campaigns?.find(c => c.id === plan.selectedId) ?? null

  // Señal Meta = la campaña existe en la operación de Meta (overview), su
  // activación tiene estado remoto, viene derivada de la configuración legacy
  // o ya es una activación Meta persistida (formalizada): sin esto, al
  // formalizar desaparecía el bloque «Operación en Meta» con el botón Publicar.
  const hasMetaSignal = Boolean(overviewCampaign || metaActivation?.remote || metaActivation?.derivedFromLegacy || metaActivation?.id)
  const metaPublished = Boolean(overviewCampaign?.metaCampaignId ?? metaActivation?.remote?.metaCampaignId)
  const metaActive = overviewCampaign?.crmStatus === 'active' || overviewCampaign?.status === 'active'
  const managing = overview.managingCampaign

  // Anuncios publicados de verdad: el remoto de la activación Meta y las
  // creatividades que ya viven como anuncio (metaAdId). Nada especulativo.
  const publishedAds = []
  if (metaActivation?.remote?.metaAdId) publishedAds.push({ key: `remote-${metaActivation.remote.metaAdId}`, title: t('ads.estructura.activationAd'), metaAdId: metaActivation.remote.metaAdId, status: metaActivation.remote.adStatus ?? null })
  for (const creative of (creatives ?? []).filter(c => c.metaAdId)) {
    publishedAds.push({ key: `creative-${creative.id}`, title: creative.headline || t('ads.estructura.untitledCreative'), metaAdId: creative.metaAdId, status: null })
  }

  const overAssigned = budget?.globalCents != null && budget?.assignedCents != null && budget.assignedCents > budget.globalCents
  const budgetPct = budget?.globalCents ? Math.min(100, Math.round(((budget.assignedCents ?? 0) / budget.globalCents) * 100)) : 0

  return <div className="gs-stack">
    <section className="gs-panel gs-rise">
      <div className="gs-panel-head"><div>
        <h2>{t('ads.estructura.activationsTitle')}</h2>
        <p>{t('ads.estructura.activationsText')}</p>
      </div></div>
      <div className="gs-panel-body">
        <div className="ah-cards">
          {activations.map(activation => {
            const busy = plan.busyId === (activation.id ?? 'new')
            const actions = activation.id ? STATUS_ACTIONS[activation.status] ?? [] : []
            return <article key={activation.id ?? activation.platform} className="ah-activation">
              <header>
                <strong>{platformLabel(t, activation.platform)}</strong>
                <span className={`gs-pill ${ACTIVATION_TONE[activation.status] ?? ''}`}>{activationStatusLabel(t, activation.status)}</span>
              </header>
              <dl className="ah-props">
                <div><dt>{t('ads.estructura.assignedBudget')}</dt><dd className={activation.budgetCents == null ? 'is-missing' : ''}>{activation.budgetCents == null ? t('ads.estructura.unassigned') : formatCents(activation.budgetCents, false, locale, t)}</dd></div>
                <div><dt>{t('ads.estructura.objectiveLabel')}</dt><dd className={activation.objective ? '' : 'is-missing'}>{activation.objective || t('ads.common.noObjective')}</dd></div>
                <div><dt>{t('ads.estructura.account')}</dt><dd className={activation.adAccountRef ? '' : 'is-missing'}>
                  {activation.adAccountRef || (activation.platform === 'meta' ? <Link to="/captacion/conectar">{t('ads.estructura.noAccount')}</Link> : t('ads.estructura.noAccount'))}
                </dd></div>
                <div><dt>{t('ads.estructura.conversion')}</dt><dd className={activation.conversionEvent ? '' : 'is-missing'}>{activation.conversionEvent || t('ads.estructura.unconfigured')}</dd></div>
                <div><dt>{t('ads.context.period')}</dt><dd className={activation.startDate || activation.endDate ? '' : 'is-missing'}>{formatPeriod(activation.startDate, activation.endDate, locale, t)}</dd></div>
                {/* health es Json en el esquema: solo se pinta si es texto plano */}
                {typeof activation.health === 'string' && activation.health ? <div><dt>{t('ads.estructura.health')}</dt><dd>{activation.health}</dd></div> : null}
              </dl>
              {activation.derivedFromLegacy ? <p className="ah-note">
                {t('ads.estructura.derivedNote')}
                <br />
                <button type="button" className="gs-button small" disabled={busy} onClick={() => plan.createActivation({ campaignId, platform: 'meta' })}>{busy ? t('ads.common.creating') : t('ads.estructura.formalize')}</button>
              </p> : null}
              {!activation.id && !activation.derivedFromLegacy ? <p className="ah-note is-info">
                {activation.platform === 'google' ? t('ads.estructura.googleNote') : t('ads.estructura.noFormalActivation')}
                <br />
                <button type="button" className="gs-button small" disabled={busy} onClick={() => plan.createActivation({ campaignId, platform: activation.platform })}>{busy ? t('ads.common.creating') : t('ads.estructura.prepare')}</button>
              </p> : null}
              {activation.id ? <footer className="ah-actions">
                <button type="button" className="gs-button small ghost" disabled={busy} onClick={() => setEditingActivation(activation)}><RiPencilLine /> {t('ads.common.edit')}</button>
                {actions.map(action => <button
                  key={action.status}
                  type="button"
                  className={`gs-button small ${action.status === 'active' ? 'accent' : action.status === 'finished' ? 'danger' : 'ghost'}`}
                  disabled={busy}
                  onClick={() => plan.updateActivation(activation.id, { status: action.status })}
                ><action.Icon /> {busy ? '…' : t(`ads.estructura.actions.${action.key}`)}</button>)}
              </footer> : null}
            </article>
          })}
        </div>
      </div>
    </section>

    {hasMetaSignal ? <section className="gs-panel gs-rise">
      <div className="gs-panel-head"><div>
        <h2>{t('ads.estructura.metaOpsTitle')}</h2>
        <p>{t('ads.estructura.metaOpsText')}</p>
      </div></div>
      <div className="gs-panel-body">
        <div className="ah-actions">
          {!metaPublished
            ? <button type="button" className="gs-button primary" disabled={managing} onClick={() => overview.manageCampaign(plan.selectedId, 'publish')}><RiRocketLine /> {managing ? t('ads.estructura.publishing') : t('ads.estructura.publish')}</button>
            : metaActive
              ? <button type="button" className="gs-button ghost" disabled={managing} onClick={() => overview.manageCampaign(plan.selectedId, 'pause')}><RiPauseCircleLine /> {managing ? t('ads.estructura.pausing') : t('ads.estructura.pauseMeta')}</button>
              : <button type="button" className="gs-button primary" disabled={managing} onClick={() => overview.manageCampaign(plan.selectedId, 'activate')}><RiPlayCircleLine /> {managing ? t('ads.estructura.activating') : t('ads.estructura.activateMeta')}</button>}
          <button type="button" className="gs-button ghost" disabled={managing} onClick={() => overview.syncCampaign(plan.selectedId)}><RiRefreshLine /> {t('ads.estructura.sync')}</button>
          <span className="gs-note">{metaPublished ? t('ads.estructura.metaExists') : t('ads.estructura.metaNotPublished')}</span>
        </div>
      </div>
    </section> : null}

    <section className="gs-panel gs-rise">
      <div className="gs-panel-head"><div>
        <h2>{t('ads.estructura.publishedAdsTitle')}</h2>
        <p>{t('ads.estructura.publishedAdsText')}</p>
      </div></div>
      <div className="gs-panel-body">
        {publishedAds.length ? <div className="ah-list">
          {publishedAds.map(ad => <div key={ad.key} className="ah-row">
            <div className="ah-row-main"><strong>{ad.title}</strong><small>{t('ads.estructura.adRef', { id: ad.metaAdId })}</small></div>
            <span className="ah-row-meta">{ad.status ?? t('ads.estructura.noRemoteStatus')}</span>
          </div>)}
        </div> : <p className="gs-empty-inline">{t('ads.estructura.noPublishedAds')}</p>}
      </div>
    </section>

    <section className="gs-panel gs-rise">
      <div className="gs-panel-head"><div>
        <h2>{t('ads.estructura.budgetTitle')}</h2>
        <p>{t('ads.estructura.budgetText')}</p>
      </div></div>
      <div className="gs-panel-body">
        <div className="gs-stat-grid">
          <div className="gs-stat"><span>{t('ads.estructura.global')}</span><strong>{formatCents(budget?.globalCents, false, locale, t)}</strong></div>
          <div className={`gs-stat${overAssigned ? ' is-bad' : ''}`}><span>{t('ads.estructura.assigned')}</span><strong>{formatCents(budget?.assignedCents, false, locale, t)}</strong></div>
          <div className="gs-stat"><span>{t('ads.estructura.spent')}</span><strong>{formatCents(budget?.spentCents, false, locale, t)}</strong></div>
          <div className={`gs-stat${budget?.availableCents != null && budget.availableCents >= 0 ? ' is-ok' : ''}`}><span>{t('ads.estructura.available')}</span><strong>{formatCents(budget?.availableCents, false, locale, t)}</strong></div>
        </div>
        {budget?.globalCents != null && budget?.assignedCents != null ? <div className={`ah-budget-bar${overAssigned ? ' is-over' : ''}`}>
          <div className="gs-bar-track"><i style={{ width: `${budgetPct}%` }} /></div>
          <small><b>{budgetPct}%</b> {t('ads.estructura.budgetBar')}{overAssigned ? ` ${t('ads.estructura.overAssigned')}` : ''}</small>
        </div> : null}
      </div>
    </section>

    <section className="gs-panel gs-rise">
      <div className="gs-panel-head">
        <div>
          <h2>{t('ads.estructura.audiencesTitle')}</h2>
          <p>{t('ads.estructura.audiencesText')}</p>
        </div>
        <div className="gs-panel-actions">
          <button type="button" className="gs-button primary" onClick={() => setAudienceModal({ audience: null })}><RiAddLine /> {t('ads.estructura.newAudience')}</button>
        </div>
      </div>
      <div className="gs-panel-body">
        {audiences.length ? <div className="ah-list">
          {audiences.map(audience => {
            const busy = plan.busyId === audience.id
            const details = [audience.segment, audience.location, audience.ageRange].filter(Boolean).join(' · ') || t('ads.estructura.noSegmentation')
            return <div key={audience.id} className="ah-row">
              <div className="ah-row-main">
                <strong>{audience.name}{audience.campaignId == null ? <span className="gs-pill tone-violet">{t('ads.estructura.reusable')}</span> : null}</strong>
                <small>{details}</small>
              </div>
              <span className="ah-row-meta">
                {t('ads.estructura.interestsCount', { interests: audience.interests?.length ?? 0, exclusions: audience.exclusions?.length ?? 0 })}<br />
                {t('ads.estructura.sizeLine', { size: audience.estimatedSize == null ? t('ads.estructura.noEstimate') : formatLocaleNumber(audience.estimatedSize, locale), source: audience.dataSource || t('ads.estructura.noDataSource') })}
              </span>
              <div className="ah-actions">
                {archivingId === audience.id ? <span className="ah-confirm">
                  {t('ads.common.archiveQuestion')}
                  <button type="button" className="gs-button small danger" disabled={busy} onClick={async () => { const done = await plan.archiveAudience(audience.id); if (done) setArchivingId(null) }}>{busy ? t('ads.estructura.archiving') : t('ads.estructura.yesArchive')}</button>
                  <button type="button" className="gs-button small ghost" onClick={() => setArchivingId(null)}>{t('ads.common.no')}</button>
                </span> : <>
                  <button type="button" className="gs-icon-button" aria-label={t('ads.estructura.editAria', { name: audience.name })} disabled={busy} onClick={() => setAudienceModal({ audience })}><RiPencilLine /></button>
                  <button type="button" className="gs-icon-button" aria-label={t('ads.estructura.archiveAria', { name: audience.name })} disabled={busy} onClick={() => setArchivingId(audience.id)}><RiArchiveLine /></button>
                </>}
              </div>
            </div>
          })}
        </div> : <p className="gs-empty-inline">{t('ads.estructura.noAudiences')}</p>}
      </div>
    </section>

    {editingActivation ? <ActivationModal
      activation={editingActivation}
      busy={plan.busyId === editingActivation.id}
      onSave={body => plan.updateActivation(editingActivation.id, body)}
      onClose={() => setEditingActivation(null)}
      t={t}
    /> : null}

    {audienceModal ? <AudienceModal
      audience={audienceModal.audience}
      busy={plan.busyId === (audienceModal.audience?.id ?? 'new')}
      onSave={(body, id) => plan.saveAudience({ ...body, campaignId: body.reusable ? null : campaignId, reusable: undefined }, id)}
      onClose={() => setAudienceModal(null)}
      t={t}
    /> : null}
  </div>
}
