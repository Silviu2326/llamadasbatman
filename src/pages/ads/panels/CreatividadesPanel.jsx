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
import { APPROVAL_LABEL, BRIEF_STATUS_LABEL } from '../primitives'
import './ads-plan.css'

// Creatividades de la campaña global: los briefs son el puente hacia el
// Creator Studio (definen qué pedir) y las creatividades vuelven de él con un
// flujo de aprobación por delante. El estudio consume el brief, no lo inventa.

const PLATFORM_LABEL = { meta: 'Meta', google: 'Google' }
const FORMAT_LABEL = { imagen: 'Imagen', video: 'Vídeo', carrusel: 'Carrusel' }
const BRIEF_TONE = { draft: '', in_studio: 'tone-info', delivered: 'tone-ok', archived: '' }
const APPROVAL_TONE = { draft: '', in_review: 'tone-warn', approved: 'tone-ok', rejected: 'tone-bad' }

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

function BriefModal({ brief, planData, busy, onSave, onClose }) {
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
    eyebrow="Brief creativo"
    title={brief ? 'Editar brief creativo' : 'Nuevo brief creativo'}
    description="El brief define qué debe contar la creatividad: el Creator Studio lo recibe como contexto de solo lectura y devuelve las piezas a esta campaña."
    onClose={onClose}
  >
    <form onSubmit={submit}>
      <div className="gs-modal-body">
        <div className="gs-form-grid">
          <label>Audiencia
            <select className="gs-select" value={audienceId} onChange={event => setAudienceId(event.target.value)}>
              <option value="">Sin audiencia asignada</option>
              {audiences.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label>Plataforma destino
            <select className="gs-select" value={platform} onChange={event => setPlatform(event.target.value)}>
              {activations.map(a => <option key={a.platform} value={a.platform}>{PLATFORM_LABEL[a.platform] ?? a.platform}{a.id ? '' : ' (activación sin preparar)'}</option>)}
            </select>
          </label>
          <label>Formato
            <select className="gs-select" value={format} onChange={event => setFormat(event.target.value)}>
              <option value="imagen">Imagen</option>
              <option value="video">Vídeo</option>
              <option value="carrusel">Carrusel</option>
            </select>
          </label>
          <label>Variantes pedidas
            <input className="gs-input" type="number" min="1" max="10" value={variantCount} onChange={event => setVariantCount(event.target.value)} />
          </label>
          <label className="full">Problema <small>qué le duele a la audiencia</small>
            <input className="gs-input" value={problema} onChange={event => setProblema(event.target.value)} />
          </label>
          <label className="full">Promesa <small>qué cambia con la oferta</small>
            <input className="gs-input" value={promesa} onChange={event => setPromesa(event.target.value)} />
          </label>
          <label>Oferta
            <input className="gs-input" value={oferta} onChange={event => setOferta(event.target.value)} />
          </label>
          <label>Prueba <small>evidencia, casos, cifras reales</small>
            <input className="gs-input" value={prueba} onChange={event => setPrueba(event.target.value)} />
          </label>
          <label>CTA
            <input className="gs-input" value={cta} onChange={event => setCta(event.target.value)} placeholder="Ej.: Reserva una demo" />
          </label>
          <label>Destino
            <input className="gs-input" value={destination} onChange={event => setDestination(event.target.value)} placeholder={campaign?.landingSlug ? `/${campaign.landingSlug}` : 'URL o landing'} />
          </label>
          <label className="full">Objeciones <small>qué frena a la audiencia y cómo responderlo</small>
            <textarea className="gs-textarea" value={objeciones} onChange={event => setObjeciones(event.target.value)} />
          </label>
          <label className="full">Restricciones legales o de marca
            <textarea className="gs-textarea" value={restrictions} onChange={event => setRestrictions(event.target.value)} placeholder="Ej.: no prometer resultados garantizados; usar la paleta corporativa" />
          </label>
        </div>
      </div>
      <div className="gs-modal-foot">
        <p>El mensaje se guarda como objeto en el brief; el estudio lo usa para prefillar el prompt sin inventar nada.</p>
        <div className="gs-modal-actions">
          <button type="button" className="gs-button ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="gs-button primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar brief'}</button>
        </div>
      </div>
    </form>
  </ModalShell>
}

// Editar una creatividad rechazada la devuelve a borrador (lo hace el backend):
// el motivo del rechazo queda registrado y la pieza vuelve a empezar el flujo.
function CreativeModal({ creative, busy, onSave, onClose }) {
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
    eyebrow="Creatividad"
    title="Editar creatividad"
    description="Al guardar, la creatividad vuelve a borrador y repite el flujo de aprobación."
    onClose={onClose}
  >
    <form onSubmit={submit}>
      <div className="gs-modal-body">
        <div className="gs-form-grid">
          <label className="full">Titular
            <input className="gs-input" value={headline} onChange={event => setHeadline(event.target.value)} placeholder="Sin titular" />
          </label>
          <label className="full">Texto principal
            <textarea className="gs-textarea" value={primaryText} onChange={event => setPrimaryText(event.target.value)} />
          </label>
          <label className="full">Descripción
            <input className="gs-input" value={description} onChange={event => setDescription(event.target.value)} />
          </label>
          <label>CTA
            <input className="gs-input" value={cta} onChange={event => setCta(event.target.value)} />
          </label>
        </div>
      </div>
      <div className="gs-modal-foot">
        <p>{creative.rejectedReason ? `Motivo del último rechazo: ${creative.rejectedReason}` : null}</p>
        <div className="gs-modal-actions">
          <button type="button" className="gs-button ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="gs-button primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </div>
    </form>
  </ModalShell>
}

export default function CreatividadesPanel({ plan, ui }) {
  const [briefModal, setBriefModal] = useState(null) // null | { brief: obj|null }
  const [editingCreative, setEditingCreative] = useState(null)
  const [archivingBriefId, setArchivingBriefId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  if (!plan.selectedId) {
    return <section className="gs-panel gs-rise"><div className="gs-panel-body"><div className="gs-empty">
      <span><RiSparkling2Line /></span>
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
          <h2>Briefs creativos</h2>
          <p>El puente hacia el Creator Studio: cada brief define audiencia, mensaje y formato, y el estudio devuelve las creatividades a esta campaña.</p>
        </div>
        <div className="gs-panel-actions">
          <button type="button" className="gs-button ghost" onClick={() => setBriefModal({ brief: null })}><RiAddLine /> Nuevo brief</button>
          <button type="button" className="gs-button primary" onClick={() => ui.openStudio()}><RiSparkling2Line /> Crear con Creator Studio</button>
        </div>
      </div>
      <div className="gs-panel-body">
        {visibleBriefs.length ? <div className="ah-briefs">
          {visibleBriefs.map(brief => {
            const busy = plan.busyId === brief.id
            const message = brief.message && typeof brief.message === 'object' ? brief.message : {}
            return <article key={brief.id} className="ah-brief">
              <header>
                <span className={`gs-pill ${BRIEF_TONE[brief.status] ?? ''}`}>{BRIEF_STATUS_LABEL[brief.status] ?? brief.status}</span>
                <small>{PLATFORM_LABEL[brief.channel] ?? brief.channel ?? 'Sin canal'} · {FORMAT_LABEL[brief.format] ?? brief.format ?? 'Sin formato'}</small>
              </header>
              <strong>{message.promesa || brief.cta || 'Brief sin mensaje todavía'}</strong>
              <dl className="ah-brief-meta">
                <div><dt>Audiencia</dt><dd>{brief.audienceName || 'Sin audiencia'}</dd></div>
                <div><dt>CTA</dt><dd>{brief.cta || 'Sin CTA'}</dd></div>
                <div><dt>Destino</dt><dd>{brief.destination || 'Sin destino'}</dd></div>
                <div><dt>Variantes</dt><dd>{`${brief.variantCount ?? 1} pedidas · ${brief.creativeCount ?? 0} creadas`}</dd></div>
              </dl>
              <footer className="ah-actions">
                <button type="button" className="gs-button small accent" disabled={busy} onClick={() => openBriefInStudio(brief)}><RiSparkling2Line /> Abrir en Creator Studio</button>
                {brief.status !== 'delivered' ? <button type="button" className="gs-button small ghost" disabled={busy} onClick={() => plan.setBriefStatus(brief.id, 'delivered')}><RiCheckLine /> {busy ? '…' : 'Marcar entregado'}</button> : null}
                <button type="button" className="gs-icon-button" aria-label="Editar brief" disabled={busy} onClick={() => setBriefModal({ brief })}><RiPencilLine /></button>
                {archivingBriefId === brief.id ? <span className="ah-confirm">
                  ¿Archivar?
                  <button type="button" className="gs-button small danger" disabled={busy} onClick={async () => { const done = await plan.setBriefStatus(brief.id, 'archived'); if (done) setArchivingBriefId(null) }}>{busy ? '…' : 'Sí'}</button>
                  <button type="button" className="gs-button small ghost" onClick={() => setArchivingBriefId(null)}>No</button>
                </span> : <button type="button" className="gs-icon-button" aria-label="Archivar brief" disabled={busy} onClick={() => setArchivingBriefId(brief.id)}><RiArchiveLine /></button>}
              </footer>
            </article>
          })}
        </div> : <p className="gs-empty-inline">Todavía no hay briefs creativos en esta campaña. Crea el primero para darle contexto real al Creator Studio.</p>}
      </div>
    </section>

    <section className="gs-panel gs-rise">
      <div className="gs-panel-head"><div>
        <h2>Creatividades</h2>
        <p>Las piezas de la campaña con su flujo de aprobación: borrador → revisión → aprobada o rechazada con motivo. Solo las aprobadas pueden convertirse en anuncio.</p>
      </div></div>
      <div className="gs-panel-body">
        {creatives.length ? <div className="ah-creatives">
          {creatives.map(creative => {
            const busy = plan.busyId === creative.id
            const origin = creative.briefId ? briefById.get(creative.briefId) : null
            const originLabel = origin
              ? `${PLATFORM_LABEL[origin.channel] ?? origin.channel ?? 'Sin canal'} · ${origin.audienceName || 'sin audiencia'}`
              : 'Sin brief de origen'
            return <article key={creative.id} className="ah-creative">
              <header>
                <span className={`gs-pill ${APPROVAL_TONE[creative.approvalStatus] ?? ''}`}>{APPROVAL_LABEL[creative.approvalStatus] ?? creative.approvalStatus}</span>
                <small>{FORMAT_LABEL[creative.format] ?? creative.format ?? 'Sin formato'} · v{creative.version ?? 1}</small>
              </header>
              <strong>{creative.headline || 'Sin titular'}</strong>
              <p>{creative.primaryText || 'Sin texto principal todavía.'}</p>
              <small>Brief de origen: {originLabel}</small>
              {creative.assetId ? <small>Pieza en biblioteca — <Link to="/activos">ver en Activos</Link></small> : null}
              {creative.approvalStatus === 'rejected' && creative.rejectedReason ? <p className="ah-rejected">Motivo del rechazo: {creative.rejectedReason}</p> : null}
              {creative.approvalStatus === 'approved' && creative.metaAdId ? <small>En uso — anuncio {creative.metaAdId}</small> : null}
              <footer className="ah-actions">
                {creative.approvalStatus === 'draft' ? <button type="button" className="gs-button small accent" disabled={busy} onClick={() => plan.submitCreative(creative.id)}><RiSendPlaneLine /> {busy ? 'Enviando…' : 'Enviar a revisión'}</button> : null}
                {creative.approvalStatus === 'in_review' ? <>
                  <button type="button" className="gs-button small accent" disabled={busy} onClick={() => plan.approveCreative(creative.id)}><RiCheckLine /> {busy ? '…' : 'Aprobar'}</button>
                  <button type="button" className="gs-button small danger" disabled={busy} onClick={() => { setRejectingId(rejectingId === creative.id ? null : creative.id); setRejectReason('') }}><RiCloseLine /> Rechazar</button>
                </> : null}
                {creative.approvalStatus === 'rejected' ? <button type="button" className="gs-button small ghost" disabled={busy} onClick={() => setEditingCreative(creative)}><RiPencilLine /> Editar</button> : null}
              </footer>
              {rejectingId === creative.id ? (
                // El motivo es obligatorio (≥3 caracteres): es el aprendizaje
                // que queda registrado sobre por qué la pieza no valía.
                <form className="ah-reject-form" onSubmit={event => { event.preventDefault(); rejectCreative(creative) }}>
                  <label htmlFor={`reject-${creative.id}`}>¿Por qué la rechazas?</label>
                  <textarea id={`reject-${creative.id}`} className="gs-textarea" rows="2" value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder="Ej.: el titular promete algo que la oferta no cumple" />
                  <div>
                    <button type="button" className="gs-button small ghost" onClick={() => { setRejectingId(null); setRejectReason('') }}>Cancelar</button>
                    <button type="submit" className="gs-button small danger" disabled={busy || rejectReason.trim().length < 3}>Confirmar rechazo</button>
                  </div>
                </form>
              ) : null}
            </article>
          })}
        </div> : <p className="gs-empty-inline">Todavía no hay creatividades en esta campaña. Abre un brief en el Creator Studio o crea una pieza directamente con el estudio.</p>}
      </div>
    </section>

    {briefModal ? <BriefModal
      brief={briefModal.brief}
      planData={{ audiences, activations: plan.plan.activations, campaign: plan.plan.campaign }}
      busy={plan.busyId === (briefModal.brief?.id ?? 'new')}
      onSave={(body, id) => plan.saveBrief(body, id)}
      onClose={() => setBriefModal(null)}
    /> : null}

    {editingCreative ? <CreativeModal
      creative={editingCreative}
      busy={plan.busyId === editingCreative.id}
      onSave={body => plan.updateCreative(editingCreative.id, body)}
      onClose={() => setEditingCreative(null)}
    /> : null}
  </div>
}
