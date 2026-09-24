import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RiAddLine,
  RiArchiveLine,
  RiCheckLine,
  RiCloseLine,
  RiPencilLine,
  RiRefreshLine,
  RiSendPlaneLine,
  RiSparkling2Line,
} from 'react-icons/ri'
import { approvalLabel, briefStatusLabel } from '../primitives'
import './ads-plan.css'

// Creatividades de la campaña global: los briefs son el puente hacia el
// Creator Studio (definen qué pedir) y las creatividades vuelven de él con un
// flujo de aprobación por delante. El estudio consume el brief, no lo inventa.

const FORMAT_KEY = { imagen: 'image', video: 'video', carrusel: 'carousel' }
const PLATFORM_KEY = { meta: 'metaShort', google: 'googleShort' }

function platformLabel(t, platform, fallback) {
  return platform ? (t(`ads.platform.${PLATFORM_KEY[platform] ?? ''}`) ?? platform) : fallback
}

function formatLabel(t, format, fallback) {
  return format ? (t(`ads.creatividades.${FORMAT_KEY[format] ?? ''}`) ?? format) : fallback
}

const BRIEF_TONE = { draft: '', in_studio: 'tone-info', delivered: 'tone-ok', archived: '' }
const APPROVAL_TONE = { draft: '', in_review: 'tone-warn', approved: 'tone-ok', rejected: 'tone-bad' }

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

function BriefModal({ brief, planData, busy, onSave, onClose, t }) {
  const { audiences, activations, campaign } = planData
  const message = brief?.message && typeof brief.message === 'object' ? brief.message : {}
  const [audienceId, setAudienceId] = useState(brief?.audienceId ?? '')
  const [platform, setPlatform] = useState(brief?.channel ?? activations[0]?.platform ?? 'meta')
  const [format, setFormat] = useState(brief?.format ?? 'imagen')
  const [problema, setProblema] = useState(message.problema ?? '')
  const [promesa, setPromesa] = useState(message.promesa ?? '')
  const [oferta, setOferta] = useState(message.oferta ?? '')
  const [prueba, setPrueba] = useState(message.prueba ?? '')
  const [objeciones, setObjeciones] = useState(message.objeciones ?? '')
  const [cta, setCta] = useState(brief?.cta ?? '')
  const [restrictions, setRestrictions] = useState(brief?.restrictions ?? '')
  // El destino por defecto es la landing de la campaña: el anuncio lleva al
  // sitio que la campaña global ya definió, no a uno improvisado.
  const [destination, setDestination] = useState(brief?.destination ?? (campaign?.landingSlug ? `/${campaign.landingSlug}` : ''))
  const [variantCount, setVariantCount] = useState(String(brief?.variantCount ?? 3))

  async function submit(event) {
    event.preventDefault()
    const activation = activations.find(a => a.platform === platform) ?? null
    const saved = await onSave({
      campaignId: campaign?.id,
      audienceId: audienceId || null,
      activationId: activation?.id ?? null,
      channel: platform,
      format,
      message: {
        problema: problema.trim() || null,
        promesa: promesa.trim() || null,
        oferta: oferta.trim() || null,
        prueba: prueba.trim() || null,
        objeciones: objeciones.trim() || null,
        cta: cta.trim() || null,
      },
      cta: cta.trim() || null,
      destination: destination.trim() || null,
      restrictions: restrictions.trim() || null,
      variantCount: Math.max(1, Number(variantCount) || 1),
    }, brief?.id)
    if (saved) onClose()
  }

  return <ModalShell
    eyebrow={t('ads.creatividades.briefEyebrow')}
    title={brief ? t('ads.creatividades.editBrief') : t('ads.creatividades.newBrief')}
    description={t('ads.creatividades.briefDescription')}
    onClose={onClose}
    closeLabel={t('ads.common.close')}
  >
    <form onSubmit={submit}>
      <div className="gs-modal-body">
        <div className="gs-form-grid">
          <label>{t('ads.creatividades.audience')}
            <select className="gs-select" value={audienceId} onChange={event => setAudienceId(event.target.value)}>
              <option value="">{t('ads.creatividades.noAudience')}</option>
              {audiences.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label>{t('ads.creatividades.platform')}
            <select className="gs-select" value={platform} onChange={event => setPlatform(event.target.value)}>
              {activations.map(a => <option key={a.platform} value={a.platform}>{platformLabel(t, a.platform, a.platform)}{a.id ? '' : ` ${t('ads.creatividades.activationNotReady')}`}</option>)}
            </select>
          </label>
          <label>{t('ads.creatividades.format')}
            <select className="gs-select" value={format} onChange={event => setFormat(event.target.value)}>
              <option value="imagen">{t('ads.creatividades.image')}</option>
              <option value="video">{t('ads.creatividades.video')}</option>
              <option value="carrusel">{t('ads.creatividades.carousel')}</option>
            </select>
          </label>
          <label>{t('ads.creatividades.variants')}
            <input className="gs-input" type="number" min="1" max="10" value={variantCount} onChange={event => setVariantCount(event.target.value)} />
          </label>
          <label className="full">{t('ads.creatividades.problem')} <small>{t('ads.creatividades.problemHint')}</small>
            <input className="gs-input" value={problema} onChange={event => setProblema(event.target.value)} />
          </label>
          <label className="full">{t('ads.creatividades.promise')} <small>{t('ads.creatividades.promiseHint')}</small>
            <input className="gs-input" value={promesa} onChange={event => setPromesa(event.target.value)} />
          </label>
          <label>{t('ads.creatividades.offer')}
            <input className="gs-input" value={oferta} onChange={event => setOferta(event.target.value)} />
          </label>
          <label>{t('ads.creatividades.proof')} <small>{t('ads.creatividades.proofHint')}</small>
            <input className="gs-input" value={prueba} onChange={event => setPrueba(event.target.value)} />
          </label>
          <label>{t('ads.creatividades.cta')}
            <input className="gs-input" value={cta} onChange={event => setCta(event.target.value)} placeholder={t('ads.creatividades.ctaPlaceholder')} />
          </label>
          <label>{t('ads.creatividades.destination')}
            <input className="gs-input" value={destination} onChange={event => setDestination(event.target.value)} placeholder={campaign?.landingSlug ? `/${campaign.landingSlug}` : t('ads.creatividades.destinationPlaceholder')} />
          </label>
          <label className="full">{t('ads.creatividades.objections')} <small>{t('ads.creatividades.objectionsHint')}</small>
            <textarea className="gs-textarea" value={objeciones} onChange={event => setObjeciones(event.target.value)} />
          </label>
          <label className="full">{t('ads.creatividades.restrictions')}
            <textarea className="gs-textarea" value={restrictions} onChange={event => setRestrictions(event.target.value)} placeholder={t('ads.creatividades.restrictionsPlaceholder')} />
          </label>
        </div>
      </div>
      <div className="gs-modal-foot">
        <p>{t('ads.creatividades.briefNote')}</p>
        <div className="gs-modal-actions">
          <button type="button" className="gs-button ghost" onClick={onClose}>{t('ads.common.cancel')}</button>
          <button type="submit" className="gs-button primary" disabled={busy}>{busy ? t('ads.common.saving') : t('ads.creatividades.saveBrief')}</button>
        </div>
      </div>
    </form>
  </ModalShell>
}

// Editar una creatividad rechazada la devuelve a borrador (lo hace el backend):
// el motivo del rechazo queda registrado y la pieza vuelve a empezar el flujo.
function CreativeModal({ creative, busy, onSave, onClose, t }) {
  const [headline, setHeadline] = useState(creative.headline ?? '')
  const [primaryText, setPrimaryText] = useState(creative.primaryText ?? '')
  const [description, setDescription] = useState(creative.description ?? '')
  const [cta, setCta] = useState(creative.cta ?? '')

  async function submit(event) {
    event.preventDefault()
    const saved = await onSave({
      headline: headline.trim() || null,
      primaryText: primaryText.trim() || null,
      description: description.trim() || null,
      cta: cta.trim() || null,
    })
    if (saved) onClose()
  }

  return <ModalShell
    eyebrow={t('ads.creatividades.creativeEyebrow')}
    title={t('ads.creatividades.editCreative')}
    description={t('ads.creatividades.creativeDescription')}
    onClose={onClose}
    closeLabel={t('ads.common.close')}
  >
    <form onSubmit={submit}>
      <div className="gs-modal-body">
        <div className="gs-form-grid">
          <label className="full">{t('ads.creatividades.headline')}
            <input className="gs-input" value={headline} onChange={event => setHeadline(event.target.value)} placeholder={t('ads.creatividades.noHeadline')} />
          </label>
          <label className="full">{t('ads.creatividades.primaryText')}
            <textarea className="gs-textarea" value={primaryText} onChange={event => setPrimaryText(event.target.value)} />
          </label>
          <label className="full">{t('ads.creatividades.description')}
            <input className="gs-input" value={description} onChange={event => setDescription(event.target.value)} />
          </label>
          <label>{t('ads.creatividades.cta')}
            <input className="gs-input" value={cta} onChange={event => setCta(event.target.value)} />
          </label>
        </div>
      </div>
      <div className="gs-modal-foot">
        <p>{creative.rejectedReason ? t('ads.creatividades.lastRejection', { reason: creative.rejectedReason }) : null}</p>
        <div className="gs-modal-actions">
          <button type="button" className="gs-button ghost" onClick={onClose}>{t('ads.common.cancel')}</button>
          <button type="submit" className="gs-button primary" disabled={busy}>{busy ? t('ads.common.saving') : t('ads.creatividades.saveChanges')}</button>
        </div>
      </div>
    </form>
  </ModalShell>
}

export default function CreatividadesPanel({ plan, ui }) {
  const { t } = ui
  const [briefModal, setBriefModal] = useState(null) // null | { brief: obj|null }
  const [editingCreative, setEditingCreative] = useState(null)
  const [archivingBriefId, setArchivingBriefId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  if (!plan.selectedId) {
    return <section className="gs-panel gs-rise"><div className="gs-panel-body"><div className="gs-empty">
      <span><RiSparkling2Line /></span>
      <h3>{t('ads.creatividades.noCampaignTitle')}</h3>
      <p>{t('ads.creatividades.noCampaignText')}</p>
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

  const { briefs, creatives, audiences } = plan.plan
  const visibleBriefs = briefs.filter(b => b.status !== 'archived')
  const briefById = new Map(briefs.map(b => [b.id, b]))

  // Abrir un brief en el estudio lo marca «en el estudio» si aún era borrador:
  // el estado del brief cuenta la verdad de dónde está el trabajo.
  async function openBriefInStudio(brief) {
    if (brief.status === 'draft') {
      const updated = await plan.setBriefStatus(brief.id, 'in_studio')
      if (!updated) return
    }
    ui.openStudio(brief.id)
  }

  async function rejectCreative(creative) {
    const reason = rejectReason.trim()
    if (reason.length < 3) return
    const done = await plan.rejectCreative(creative.id, reason)
    if (done) { setRejectingId(null); setRejectReason('') }
  }

  return <div className="gs-stack">
    <section className="gs-panel gs-rise">
      <div className="gs-panel-head">
        <div>
          <h2>{t('ads.creatividades.briefsTitle')}</h2>
          <p>{t('ads.creatividades.briefsText')}</p>
        </div>
        <div className="gs-panel-actions">
          <button type="button" className="gs-button ghost" onClick={() => setBriefModal({ brief: null })}><RiAddLine /> {t('ads.creatividades.newBriefButton')}</button>
          <button type="button" className="gs-button primary" onClick={() => ui.openStudio()}><RiSparkling2Line /> {t('ads.creatividades.createWithStudio')}</button>
        </div>
      </div>
      <div className="gs-panel-body">
        {visibleBriefs.length ? <div className="ah-briefs">
          {visibleBriefs.map(brief => {
            const busy = plan.busyId === brief.id
            const message = brief.message && typeof brief.message === 'object' ? brief.message : {}
            return <article key={brief.id} className="ah-brief">
              <header>
                <span className={`gs-pill ${BRIEF_TONE[brief.status] ?? ''}`}>{briefStatusLabel(t, brief.status)}</span>
                <small>{platformLabel(t, brief.channel, t('ads.creatividades.noChannel'))} · {formatLabel(t, brief.format, t('ads.creatividades.noFormat'))}</small>
              </header>
              <strong>{message.promesa || brief.cta || t('ads.creatividades.briefNoMessage')}</strong>
              <dl className="ah-brief-meta">
                <div><dt>{t('ads.creatividades.briefAudience')}</dt><dd>{brief.audienceName || t('ads.creatividades.briefNoAudience')}</dd></div>
                <div><dt>{t('ads.creatividades.cta')}</dt><dd>{brief.cta || t('ads.creatividades.noCta')}</dd></div>
                <div><dt>{t('ads.creatividades.destination')}</dt><dd>{brief.destination || t('ads.creatividades.noDestination')}</dd></div>
                <div><dt>{t('ads.creatividades.variants')}</dt><dd>{t('ads.creatividades.variantsLine', { requested: brief.variantCount ?? 1, created: brief.creativeCount ?? 0 })}</dd></div>
              </dl>
              <footer className="ah-actions">
                <button type="button" className="gs-button small accent" disabled={busy} onClick={() => openBriefInStudio(brief)}><RiSparkling2Line /> {t('ads.creatividades.openStudio')}</button>
                {brief.status !== 'delivered' ? <button type="button" className="gs-button small ghost" disabled={busy} onClick={() => plan.setBriefStatus(brief.id, 'delivered')}><RiCheckLine /> {busy ? '…' : t('ads.creatividades.markDelivered')}</button> : null}
                <button type="button" className="gs-icon-button" aria-label={t('ads.creatividades.editBriefAria')} disabled={busy} onClick={() => setBriefModal({ brief })}><RiPencilLine /></button>
                {archivingBriefId === brief.id ? <span className="ah-confirm">
                  {t('ads.common.archiveQuestion')}
                  <button type="button" className="gs-button small danger" disabled={busy} onClick={async () => { const done = await plan.setBriefStatus(brief.id, 'archived'); if (done) setArchivingBriefId(null) }}>{busy ? '…' : t('ads.common.yes')}</button>
                  <button type="button" className="gs-button small ghost" onClick={() => setArchivingBriefId(null)}>{t('ads.common.no')}</button>
                </span> : <button type="button" className="gs-icon-button" aria-label={t('ads.creatividades.archiveBriefAria')} disabled={busy} onClick={() => setArchivingBriefId(brief.id)}><RiArchiveLine /></button>}
              </footer>
            </article>
          })}
        </div> : <p className="gs-empty-inline">{t('ads.creatividades.noBriefs')}</p>}
      </div>
    </section>

    <section className="gs-panel gs-rise">
      <div className="gs-panel-head"><div>
        <h2>{t('ads.creatividades.creativesTitle')}</h2>
        <p>{t('ads.creatividades.creativesText')}</p>
      </div></div>
      <div className="gs-panel-body">
        {creatives.length ? <div className="ah-creatives">
          {creatives.map(creative => {
            const busy = plan.busyId === creative.id
            const origin = creative.briefId ? briefById.get(creative.briefId) : null
            const originLabel = origin
              ? t('ads.creatividades.originLine', { platform: platformLabel(t, origin.channel, t('ads.creatividades.noChannel')), audience: origin.audienceName || t('ads.creatividades.originNoAudience') })
              : t('ads.creatividades.noOriginBrief')
            return <article key={creative.id} className="ah-creative">
              <header>
                <span className={`gs-pill ${APPROVAL_TONE[creative.approvalStatus] ?? ''}`}>{approvalLabel(t, creative.approvalStatus)}</span>
                <small>{formatLabel(t, creative.format, t('ads.creatividades.noFormat'))} · {t('ads.creatividades.version', { version: creative.version ?? 1 })}</small>
              </header>
              <strong>{creative.headline || t('ads.creatividades.noHeadline')}</strong>
              <p>{creative.primaryText || t('ads.creatividades.noPrimaryText')}</p>
              <small>{t('ads.creatividades.originBrief', { origin: originLabel })}</small>
              {creative.assetId ? <small>{t('ads.creatividades.inLibrary')} <Link to="/activos">{t('ads.creatividades.seeInAssets')}</Link></small> : null}
              {creative.approvalStatus === 'rejected' && creative.rejectedReason ? <p className="ah-rejected">{t('ads.creatividades.rejectionReason', { reason: creative.rejectedReason })}</p> : null}
              {creative.approvalStatus === 'approved' && creative.metaAdId ? <small>{t('ads.creatividades.inUse', { id: creative.metaAdId })}</small> : null}
              <footer className="ah-actions">
                {creative.approvalStatus === 'draft' ? <button type="button" className="gs-button small accent" disabled={busy} onClick={() => plan.submitCreative(creative.id)}><RiSendPlaneLine /> {busy ? t('ads.creatividades.sending') : t('ads.creatividades.submit')}</button> : null}
                {creative.approvalStatus === 'in_review' ? <>
                  <button type="button" className="gs-button small accent" disabled={busy} onClick={() => plan.approveCreative(creative.id)}><RiCheckLine /> {busy ? '…' : t('ads.creatividades.approve')}</button>
                  <button type="button" className="gs-button small danger" disabled={busy} onClick={() => { setRejectingId(rejectingId === creative.id ? null : creative.id); setRejectReason('') }}><RiCloseLine /> {t('ads.creatividades.reject')}</button>
                </> : null}
                {creative.approvalStatus === 'rejected' ? <button type="button" className="gs-button small ghost" disabled={busy} onClick={() => setEditingCreative(creative)}><RiPencilLine /> {t('ads.common.edit')}</button> : null}
              </footer>
              {rejectingId === creative.id ? (
                // El motivo es obligatorio (≥3 caracteres): es el aprendizaje
                // que queda registrado sobre por qué la pieza no valía.
                <form className="ah-reject-form" onSubmit={event => { event.preventDefault(); rejectCreative(creative) }}>
                  <label htmlFor={`reject-${creative.id}`}>{t('ads.creatividades.whyReject')}</label>
                  <textarea id={`reject-${creative.id}`} className="gs-textarea" rows="2" value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder={t('ads.creatividades.rejectPlaceholder')} />
                  <div>
                    <button type="button" className="gs-button small ghost" onClick={() => { setRejectingId(null); setRejectReason('') }}>{t('ads.common.cancel')}</button>
                    <button type="submit" className="gs-button small danger" disabled={busy || rejectReason.trim().length < 3}>{t('ads.creatividades.confirmReject')}</button>
                  </div>
                </form>
              ) : null}
            </article>
          })}
        </div> : <p className="gs-empty-inline">{t('ads.creatividades.noCreatives')}</p>}
      </div>
    </section>

    {briefModal ? <BriefModal
      brief={briefModal.brief}
      planData={{ audiences, activations: plan.plan.activations, campaign: plan.plan.campaign }}
      busy={plan.busyId === (briefModal.brief?.id ?? 'new')}
      onSave={(body, id) => plan.saveBrief(body, id)}
      onClose={() => setBriefModal(null)}
      t={t}
    /> : null}

    {editingCreative ? <CreativeModal
      creative={editingCreative}
      busy={plan.busyId === editingCreative.id}
      onSave={body => plan.updateCreative(editingCreative.id, body)}
      onClose={() => setEditingCreative(null)}
      t={t}
    /> : null}
  </div>
}
