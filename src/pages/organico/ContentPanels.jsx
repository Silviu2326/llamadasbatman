import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RiAlertLine, RiArrowRightLine, RiBarChartLine, RiCheckLine, RiCloseLine, RiExternalLinkLine,
  RiGlobalLine, RiImageAddLine, RiLinkM, RiRadarLine, RiRefreshLine, RiShareForwardLine,
  RiSparkling2Line, RiTimeLine, RiVoiceprintLine,
} from 'react-icons/ri'
import DataStatusBanner from '../../components/ui/DataStatusBanner'
import { statusMessage } from '../../lib/dataStatus'
import { localeCode, useI18n } from '../../i18n'
import {
  IMAGE_BUSY_STATES, OBJECTIVE_KEYS, PLATFORM_META, REJECTION_KEYS, defaultObjectiveFor, formatEuros, formatLabel,
  formatPipeline, formatShortDate, historyLabel, objectiveLabel, opportunityMeta, pieceToText, platformMeta,
  rejectionLabel, renderAnalyticsValue,
} from './contentFormats'

/* ── Radar ──────────────────────────────────────────────────────────────── */

/**
 * Radar de oportunidades de contenido — pantallas.md §1. Dos reglas: la
 * cabecera cuenta lo analizado (es lo que hace creíble lo encontrado) y el
 * vacío es honesto: sin señales no se rellena con tarjetas genéricas.
 */
export function RadarPanel({ radar, onGenerate, onOwnIdea }) {
  const { t } = useI18n()
  const opportunities = radar.data?.opportunities ?? []
  const evidence = radar.evidence
  return (
    <section className="gs-panel is-accent" aria-labelledby="og-radar-title">
      <header className="gs-panel-head">
        <div>
          <span className="gs-overline">{t('organic.radar.overline')}</span>
          <h2 id="og-radar-title"><span className="gs-panel-icon"><RiRadarLine /></span>
            {radar.loading
              ? t('organic.radar.analyzing')
              : t(opportunities.length === 1 ? 'organic.radar.headlineOne' : 'organic.radar.headline', { conversations: radar.data?.conversationsAnalyzed ?? 0, count: opportunities.length })}
          </h2>
          <p>{t('organic.radar.intro')}</p>
        </div>
        <div className="gs-panel-actions">
          <button type="button" className="gs-button ghost" onClick={onOwnIdea}>{t('organic.radar.ownIdea')}</button>
          <button type="button" className="gs-button" onClick={radar.refresh} disabled={radar.busy || radar.loading}>
            <RiRefreshLine className={radar.busy ? 'gs-spin' : ''} /> {radar.busy ? t('organic.radar.analyzingShort') : t('organic.radar.reanalyze')}
          </button>
        </div>
      </header>
      <div className="gs-panel-body">
        {radar.loading ? <div className="gs-skeleton"><i /><i /><i /></div> : opportunities.length ? (
          <div className="gs-queue">
            {opportunities.map(opportunity => {
              const meta = opportunityMeta(opportunity.type, t)
              return (
                <article className={`gs-queue-card tone-${meta.tone}`} key={opportunity.id}>
                  <header>
                    <span className="gs-queue-kind">{meta.label}</span>
                    {/* El chip es el modo objetivo con el que se abrirá el estudio. */}
                    <span className="gs-pill">{objectiveLabel(defaultObjectiveFor(opportunity.type), t)}</span>
                  </header>
                  <strong>{opportunity.summary}</strong>
                  <p><b>{t('organic.radar.opportunityLabel')}</b> {opportunity.title}</p>
                  <small>
                    {t(opportunity.evidenceCount === 1 ? 'organic.radar.mentionOne' : 'organic.radar.mentions', { n: opportunity.evidenceCount, conversations: opportunity.conversationsScanned })}
                    {' '}<button type="button" className="gs-link" onClick={() => radar.loadEvidence(opportunity.id)}>{t('organic.radar.view')}</button>
                  </small>
                  <footer>
                    <div>
                      <button type="button" className="gs-button small ghost" onClick={() => radar.dismiss(opportunity.id)}>{t('organic.radar.dismiss')}</button>
                      <button type="button" className="gs-button small primary" onClick={() => onGenerate(opportunity)}>{t('organic.radar.generate')} <RiArrowRightLine /></button>
                    </div>
                  </footer>
                </article>
              )
            })}
          </div>
        ) : (
          <p className="gs-empty-inline">{t('organic.radar.empty')}</p>
        )}
        {evidence ? (
          <div className="og-evidence" role="status">
            <div className="og-evidence-head">
              <strong>{evidence.title}</strong>
              <button type="button" className="gs-icon-button" onClick={radar.closeEvidence} aria-label={t('organic.radar.closeEvidence')}><RiCloseLine /></button>
            </div>
            <p>{evidence.summary}</p>
            {/* Conteos y referencias, nunca la transcripción: la cita literal exige consentimiento. */}
            <small>{t('organic.radar.evidenceNote', { calls: evidence.calls.length, conversations: evidence.conversations.length })}</small>
          </div>
        ) : null}
      </div>
    </section>
  )
}

/* ── Estudio ────────────────────────────────────────────────────────────── */

/** Chequeo de especificidad (idea 27): lo sustituido con su fuente y lo que sigue genérico. */
function SpecificityNote({ specificity }) {
  const { t } = useI18n()
  const flags = specificity?.flags ?? []
  if (!flags.length) return null
  const replaced = flags.filter(flag => flag.replacedWith)
  const pending = flags.filter(flag => !flag.replacedWith)
  return (
    <div className="og-specificity">
      {replaced.length ? (
        <details>
          <summary className="is-ok">{t(replaced.length === 1 ? 'organic.studio.replacedOne' : 'organic.studio.replacedMany', { n: replaced.length })}</summary>
          <ul>{replaced.map((flag, index) => <li key={`ok-${index}`}>«{flag.phrase}» → <strong>{flag.replacedWith}</strong>{flag.sourceName ? <em> {t('organic.studio.fromSource', { source: flag.sourceName })}</em> : null}</li>)}</ul>
        </details>
      ) : null}
      {pending.length ? (
        <details>
          <summary className="is-warn">{t(pending.length === 1 ? 'organic.studio.pendingOne' : 'organic.studio.pendingMany', { n: pending.length })}</summary>
          <ul>{pending.map((flag, index) => <li key={`pending-${index}`}>«{flag.phrase}» · {flag.why}</li>)}</ul>
          {specificity?.afterHumanEdit
            ? <small>{t('organic.studio.humanEditNote')}</small>
            : specificity?.factsAvailable === 0 ? <small>{t('organic.studio.noFactsNote')}</small> : null}
        </details>
      ) : null}
    </div>
  )
}

/** Informe del editor adversario (idea 21). La PII enmascarada va delante, no escondida. */
function CriticNote({ review }) {
  const { t } = useI18n()
  if (!review) return null
  const issues = review.critique?.issues ?? []
  const masked = review.pii?.masked ?? 0
  if (!masked && !issues.length && !review.critique?.discardedReason) return null
  return (
    <div className="og-critic">
      {masked ? <p className="is-alert">{t(masked === 1 ? 'organic.studio.piiOne' : 'organic.studio.piiMany', { n: masked, found: (review.pii.found ?? []).join(', ').toLowerCase() })}</p> : null}
      {issues.length ? (
        <details>
          <summary>{t(issues.length === 1 ? 'organic.studio.issuesOne' : 'organic.studio.issuesMany', { n: issues.length })}</summary>
          <ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
          {review.critique?.rewritten ? <small>{t('organic.studio.rewrittenNote')}</small> : null}
        </details>
      ) : null}
      {review.critique?.discardedReason ? <small>{t('organic.studio.discarded', { reason: review.critique.discardedReason })}</small> : null}
    </div>
  )
}

function ChannelPicker({ selected, onToggle }) {
  return (
    <div className="gs-choices">
      {Object.entries(PLATFORM_META).map(([id, item]) => {
        const Icon = item.Icon
        const active = selected.includes(id)
        return (
          <button type="button" key={id} className={`gs-choice${active ? ' selected' : ''}`} onClick={() => onToggle(id)} aria-pressed={active}>
            <Icon aria-hidden="true" /><span>{item.name}</span>{active ? <RiCheckLine aria-hidden="true" /> : null}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Estudio — pantallas.md §2. Las seis piezas de la oportunidad con sus
 * evidencias y la voz con la que se escribieron. Antes de generar se decide
 * objetivo y canales: cambian lo que se escribe y a dónde sale.
 */
export function StudioPanel({ studio }) {
  const { t } = useI18n()
  const setup = studio.setup
  const data = studio.data
  return (
    <section className="gs-panel" id="og-studio" aria-labelledby="og-studio-title">
      <header className="gs-panel-head">
        <div>
          <h2 id="og-studio-title"><span className="gs-panel-icon"><RiSparkling2Line /></span>{t('organic.studio.title')}</h2>
          <p>
            {data ? t('organic.studio.introData') : setup ? t('organic.studio.introSetup') : t('organic.studio.introIdle')}
            {data?.voice ? t('organic.studio.voiceNote', { n: data.voice.sampleSize }) : data ? ` ${data.voiceMissingReason}` : ''}
            {data?.generatedBy === 'deterministic' ? t('organic.studio.deterministicNote') : ''}
            {data?.specificity?.replaced ? t(data.specificity.replaced === 1 ? 'organic.studio.specReplacedOne' : 'organic.studio.specReplacedMany', { n: data.specificity.replaced }) : ''}
            {data?.specificity?.unresolved ? t(data.specificity.unresolved === 1 ? 'organic.studio.specUnresolvedOne' : 'organic.studio.specUnresolvedMany', { n: data.specificity.unresolved, missing: data.specificity.knowledgeMissing ? t('organic.studio.knowledgeMissing') : '' }) : ''}
          </p>
        </div>
        {setup ? <button type="button" className="gs-icon-button" aria-label={t('organic.studio.close')} onClick={studio.close}><RiCloseLine /></button> : null}
      </header>
      {setup ? (
        <div className="gs-panel-body">
          <div className="og-studio-setup">
            <div>
              <strong>{setup.title}</strong>
              <p>{setup.summary}</p>
              {setup.objective ? <small>{t('organic.studio.suggestedFocus', { objective: setup.objective })}</small> : null}
            </div>
            <label className="gs-field">
              <span>{t('organic.studio.objective')}</span>
              <select className="gs-select" value={studio.objective} onChange={event => studio.setObjective(event.target.value)}>
                {OBJECTIVE_KEYS.map(value => <option key={value} value={value}>{objectiveLabel(value, t)}</option>)}
              </select>
            </label>
            <fieldset className="gs-fieldset">
              <legend>{t('organic.studio.channels')}</legend>
              <ChannelPicker selected={studio.channels} onToggle={studio.toggleChannel} />
            </fieldset>
            <div className="og-studio-actions">
              {/* Volver a generar rehace los borradores; lo que ya está en la cola no se toca. */}
              <button type="button" className="gs-button primary" disabled={studio.busy || !studio.channels.length} onClick={studio.generate}>
                <RiSparkling2Line /> {studio.busy ? t('organic.studio.generating') : data ? t('organic.studio.regenerate') : t('organic.studio.generate')}
              </button>
            </div>
          </div>
          {data?.pieces?.length ? (
            <div className="og-pieces">
              {data.pieces.map(piece => <PieceCard key={piece.id} piece={piece} studio={studio} />)}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function PieceCard({ piece, studio }) {
  const { t } = useI18n()
  const status = studio.imageStatus[piece.id]
  // Una pieza publicada ya salió con su imagen: cambiarla aquí mentiría.
  const imageLocked = piece.status === 'published' || IMAGE_BUSY_STATES.includes(status)
  return (
    <article className="og-piece">
      <header>
        <span className="gs-pill tone-info">{formatLabel(piece.format, t)}</span>
        <small>{t('organic.studio.minutesSaved', { n: piece.minutesSaved })}</small>
      </header>
      <pre className="og-piece-body">{pieceToText(piece)}</pre>
      <SpecificityNote specificity={piece.specificity} />
      <CriticNote review={piece.reviewReport} />

      {piece.format === 'voiceover' ? (
        piece.audioUrl ? (
          <div className="og-audio">
            <audio controls src={piece.audioUrl} preload="none" />
            <a className="gs-link" href={piece.audioUrl} download><RiVoiceprintLine /> {t('organic.studio.downloadAudio')}</a>
            <small>{t('organic.studio.audioMeta', { seconds: piece.body?.estimatedSeconds ?? '—', provider: piece.body?.provider ?? t('organic.studio.unknownVoice') })}</small>
            {piece.editedByHuman ? <small className="is-stale">{t('organic.studio.audioStale')}</small> : null}
          </div>
        ) : <p className="gs-note">{piece.body?.missingReason}</p>
      ) : null}

      {piece.format === 'carousel' && piece.body?.slideImages?.length ? (
        <div className="og-slides">
          <div>{piece.body.slideImages.map((url, index) => <img key={url} src={url} alt={t('organic.studio.slideAlt', { n: index + 1 })} loading="lazy" />)}</div>
          {piece.body?.brandTemplate?.usesDefaultColors ? <small>{t('organic.studio.defaultColors')}</small> : null}
          <button type="button" className="gs-link" disabled={imageLocked} onClick={() => studio.useSlide(piece)}><RiImageAddLine /> {t('organic.studio.useCover')}</button>
        </div>
      ) : null}
      {piece.format === 'carousel' && piece.body?.slidesMissingReason ? <p className="gs-note">{piece.body.slidesMissingReason}</p> : null}

      <div className="og-piece-image">
        {piece.imageUrl ? <img src={piece.imageUrl} alt={t('organic.studio.pieceImageAlt', { format: formatLabel(piece.format, t) })} /> : null}
        <label className={`gs-link${imageLocked ? ' is-disabled' : ''}`}>
          <RiImageAddLine /> {status === 'uploading' ? t('organic.studio.uploading') : piece.imageUrl ? t('organic.studio.changeImage') : t('organic.studio.uploadImage')}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={imageLocked} onChange={event => { void studio.uploadImage(piece.id, event.target.files?.[0]); event.target.value = '' }} />
        </label>
        <button type="button" className="gs-link" disabled={imageLocked} onClick={() => studio.generateImage(piece)}><RiSparkling2Line /> {status === 'generating' ? t('organic.studio.generatingImage') : t('organic.studio.generateImage')}</button>
        {piece.imageUrl ? <button type="button" className="gs-link" disabled={imageLocked} onClick={() => studio.removeImage(piece.id)}><RiCloseLine /> {status === 'removing' ? t('organic.studio.removing') : t('organic.studio.remove')}</button> : null}
      </div>

      <footer>
        <small>{piece.evidenceSummary}</small>
        {piece.status === 'draft'
          ? <button type="button" className="gs-button small primary" disabled={studio.busy} onClick={() => studio.submit(piece.id)}>{t('organic.studio.submit')}</button>
          : <span className="gs-pill tone-ok">{piece.status === 'pending_approval' ? t('organic.studio.inQueue') : piece.status}</span>}
      </footer>
    </article>
  )
}

/* ── Sala de aprobación ─────────────────────────────────────────────────── */

function PieceHistory({ history, busy, onComment }) {
  const { t, locale } = useI18n()
  const [message, setMessage] = useState('')
  const events = history?.events ?? []
  return (
    <div className="og-history">
      <ul>
        {events.length ? events.map(event => (
          <li key={event.id}>
            <strong>{event.actor}</strong>{event.external ? t('organic.approval.client') : ''} · {historyLabel(event.kind, t)}
            {event.message ? <span>: «{event.message}»</span> : null}
            <em>{new Date(event.at).toLocaleString(localeCode(locale))}</em>
          </li>
        )) : <li className="is-empty">{t('organic.approval.noEvents')}</li>}
      </ul>
      <div className="og-history-comment">
        <input className="gs-input" value={message} onChange={event => setMessage(event.target.value)} placeholder={t('organic.approval.commentPlaceholder')} />
        <button type="button" className="gs-button small" disabled={busy || !message.trim()} onClick={() => { onComment(message.trim()); setMessage('') }}>{t('organic.approval.comment')}</button>
      </div>
    </div>
  )
}

/** Sala de aprobación — pantallas.md §3. Rechazar exige motivo. */
export function ApprovalQueue({ approval }) {
  const { t } = useI18n()
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [openHistory, setOpenHistory] = useState(null)
  const pending = approval.queue.filter(piece => piece.status === 'pending_approval')
  return (
    <section className="gs-panel" id="og-approval" aria-labelledby="og-approval-title">
      <header className="gs-panel-head">
        <div>
          <h2 id="og-approval-title"><span className="gs-panel-icon"><RiCheckLine /></span>{t('organic.approval.title')}</h2>
          <p>{pending.length ? t(pending.length === 1 ? 'organic.approval.pendingOne' : 'organic.approval.pendingMany', { n: pending.length }) : t('organic.approval.empty')}</p>
        </div>
        {pending.length ? (
          <button type="button" className="gs-button primary" onClick={approval.approveAll} disabled={approval.busy}>
            {approval.progress ? t('organic.approval.approvingProgress', { done: approval.progress.done, total: approval.progress.total }) : t('organic.approval.approveAll')}
          </button>
        ) : null}
      </header>
      {pending.length ? (
        <div className="gs-panel-body">
          <div className="og-approval-list">
            {pending.map(piece => (
              <article className="og-approval-piece" key={piece.id}>
                <header>
                  <span className="gs-pill tone-info">{formatLabel(piece.format, t)}</span>
                  {piece.opportunity ? <span className="og-approval-origin">{t('organic.approval.origin', { title: piece.opportunity.title, n: piece.opportunity.evidenceCount })}</span> : null}
                  {piece.editedByHuman ? <span className="gs-pill tone-warn">{t('organic.approval.edited')}</span> : null}
                </header>
                <textarea className="gs-textarea og-approval-editor" rows="5" value={approval.drafts[piece.id] ?? pieceToText(piece)} onChange={event => approval.setDraft(piece.id, event.target.value)} />
                <SpecificityNote specificity={piece.specificity} />
                <CriticNote review={piece.reviewReport} />
                {piece.format !== 'email' ? (
                  <label className="gs-field og-approval-schedule">
                    <span>{t('organic.approval.scheduleLabel')}</span>
                    <input className="gs-input" type="datetime-local" value={approval.schedule[piece.id] ?? ''} onChange={event => approval.setSchedule(piece.id, event.target.value)} />
                    <small>{t('organic.approval.scheduleHint')}</small>
                  </label>
                ) : null}
                <footer>
                  <button type="button" className="gs-button small ghost" disabled={approval.busy || approval.drafts[piece.id] === undefined} onClick={() => approval.saveEdit(piece)}>{t('organic.approval.saveEdit')}</button>
                  <button type="button" className="gs-button small ghost" onClick={() => { const next = openHistory === piece.id ? null : piece.id; setOpenHistory(next); if (next) approval.loadHistory(piece.id) }}>
                    {openHistory === piece.id ? t('organic.approval.hideHistory') : `${t('organic.approval.history')}${piece._count?.events ? ` (${piece._count.events})` : ''}`}
                  </button>
                  <button type="button" className="gs-button small ghost" disabled={approval.busy} onClick={() => { setRejecting(piece.id); setReason(''); setComment('') }}>{t('organic.approval.reject')}</button>
                  <button type="button" className="gs-button small primary" disabled={approval.busy} onClick={() => approval.approve(piece.id)}>{t('organic.approval.approve')}</button>
                </footer>
                {openHistory === piece.id ? <PieceHistory history={approval.histories[piece.id]} busy={approval.busy} onComment={message => approval.comment(piece.id, message)} /> : null}
                {rejecting === piece.id ? (
                  <div className="og-reject">
                    <span>{t('organic.approval.whyReject')}</span>
                    <div className="gs-choices">
                      {REJECTION_KEYS.map(value => (
                        <button key={value} type="button" className={`gs-choice${reason === value ? ' selected' : ''}`} onClick={() => setReason(value)}>{rejectionLabel(value, t)}</button>
                      ))}
                    </div>
                    <input className="gs-input" value={comment} onChange={event => setComment(event.target.value)} placeholder={t('organic.approval.detailPlaceholder')} />
                    <div className="og-reject-actions">
                      <button type="button" className="gs-button small ghost" onClick={() => setRejecting(null)}>{t('organic.approval.cancel')}</button>
                      <button type="button" className="gs-button small primary" disabled={!reason || approval.busy} onClick={() => { approval.reject(piece.id, reason, comment); setRejecting(null) }}>{t('organic.approval.confirmReject')}</button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

/* ── Resultados ─────────────────────────────────────────────────────────── */

/** Resultados — pantallas.md §4: lo que aún no se mide se dice, no se rellena. */
export function ResultsPanel({ results }) {
  const { t } = useI18n()
  if (!results) return null
  const percent = value => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`)
  return (
    <section className="gs-panel" aria-labelledby="og-results-title">
      <header className="gs-panel-head">
        <div><h2 id="og-results-title"><span className="gs-panel-icon"><RiBarChartLine /></span>{t('organic.results.title')}</h2><p>{t('organic.results.intro')}</p></div>
      </header>
      <div className="gs-panel-body">
        <div className="gs-minis">
          <div className="gs-mini"><span>{t('organic.results.timeSaved')}</span><strong>{t('organic.results.minutes', { n: results.minutesSaved })}</strong><em>{t('organic.results.approvedOnly')}</em></div>
          <div className="gs-mini"><span>{t('organic.results.approvedRate')}</span><strong>{percent(results.approvalRate)}</strong><em>{t('organic.results.ofPieces', { approved: results.approved, total: results.pieces })}</em></div>
          <div className="gs-mini"><span>{t('organic.results.untouchedRate')}</span><strong>{percent(results.untouchedRate)}</strong><em>{t('organic.results.ofApproved')}</em></div>
          <div className="gs-mini"><span>{t('organic.results.leadsAttributed')}</span><strong>{results.leadsAttributed ?? 0}</strong><em>{t('organic.results.published', { n: results.published })}</em></div>
          {/* Ganado y abierto no se suman nunca: lo abierto es expectativa. */}
          <div className={`gs-mini${results.value?.measurable ? '' : ' is-missing'}`}><span>{t('organic.results.eurosWon')}</span><strong>{results.value?.measurable ? formatEuros(results.value.won) : t('organic.results.noMeasure')}</strong><em>{results.value?.measurable ? t('organic.results.stillOpen', { amount: formatEuros(results.value.open) }) : t('organic.results.noCrmDeals')}</em></div>
        </div>
        {results.perPiece.length ? (
          <div className="gs-table-scroll" style={{ marginTop: 14 }}>
            <table className="gs-table">
              <thead><tr><th>{t('organic.results.colPiece')}</th><th>{t('organic.results.colChannels')}</th><th>{t('organic.results.colUtm')}</th><th className="num">{t('organic.results.colVisits')}</th><th className="num">{t('organic.results.colLeads')}</th><th>{t('organic.results.colPipeline')}</th><th className="num">{t('organic.results.colWon')}</th></tr></thead>
              <tbody>
                {results.perPiece.map(piece => (
                  <tr key={piece.id}>
                    <td><strong>{formatLabel(piece.format, t)}</strong></td>
                    <td>{piece.channels?.length ? piece.channels.map(channel => platformMeta(channel).name).join(', ') : '—'}</td>
                    <td><code>{piece.utmContent}</code></td>
                    <td className="num">{piece.visits === null ? t('organic.results.unpublished') : piece.visits}</td>
                    <td className="num">{piece.leads === null ? '—' : piece.leads}</td>
                    <td>{formatPipeline(piece.pipeline, t)}</td>
                    <td className="num">{piece.value ? `${formatEuros(piece.value.won)} / ${formatEuros(piece.value.open)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {results.caveats?.length ? <ul className="og-caveats">{results.caveats.map(caveat => <li key={caveat}>{caveat}</li>)}</ul> : null}
      </div>
    </section>
  )
}

/* ── Marca y aprobación externa ─────────────────────────────────────────── */

/** Libro de marca (idea 7) y enlaces de aprobación (fase 3): se configuran una vez y afectan a todo. */
export function BrandAndSharing({ brand }) {
  const { t, locale } = useI18n()
  const [form, setForm] = useState(null)
  const current = form ?? brand.data
  return (
    <section className="gs-panel" aria-labelledby="og-brand-title">
      <header className="gs-panel-head">
        <div>
          <h2 id="og-brand-title"><span className="gs-panel-icon"><RiShareForwardLine /></span>{t('organic.brand.title')}</h2>
          <p>{t('organic.brand.intro')}{brand.data?.isDefault ? t('organic.brand.defaultNote') : ''}</p>
        </div>
      </header>
      <div className="gs-panel-body">
        {current ? (
          <div className="og-brand-kit">
            {['primary', 'secondary', 'text'].map(key => (
              <label key={key} htmlFor={`og-brand-${key}`}>
                {t(`organic.brand.${key}`)}
                <input id={`og-brand-${key}`} type="color" value={current[key]} onChange={event => setForm({ ...current, [key]: event.target.value })} />
              </label>
            ))}
            <label htmlFor="og-brand-logo" className="is-wide">
              {t('organic.brand.logo')}
              <input id="og-brand-logo" className="gs-input" type="url" placeholder="https://…/logo.png" value={current.logoUrl ?? ''} onChange={event => setForm({ ...current, logoUrl: event.target.value || null })} />
            </label>
            <button type="button" className="gs-button primary" disabled={brand.busy || !form} onClick={() => { brand.save(form); setForm(null) }}>{t('organic.brand.save')}</button>
          </div>
        ) : <p className="gs-empty-inline">{t('organic.brand.unavailable')}</p>}

        <div className="og-links">
          <div className="og-links-head">
            <strong>{t('organic.brand.linksTitle')}</strong>
            <button type="button" className="gs-button small" disabled={brand.busy} onClick={brand.createLink}><RiLinkM /> {t('organic.brand.createLink')}</button>
          </div>
          {/* Se enseña una vez y no se puede volver a consultar: en la base solo vive su huella. */}
          {brand.newLink ? <p className="og-link-new"><code>{brand.newLink.url}</code><small>{brand.newLink.notice}</small></p> : null}
          <ul>
            {brand.links.length ? brand.links.map(link => (
              <li key={link.id}>
                <span>{link.label || t('organic.brand.noLabel')}</span>
                <em>{link.active ? t('organic.brand.expires', { date: new Date(link.expiresAt).toLocaleDateString(localeCode(locale)) }) : link.revokedAt ? t('organic.brand.revoked') : t('organic.brand.expired')}</em>
                {link.active ? <button type="button" className="gs-link" disabled={brand.busy} onClick={() => brand.revokeLink(link.id)}>{t('organic.brand.revoke')}</button> : null}
              </li>
            )) : <li className="is-empty">{t('organic.brand.noLinks')}</li>}
          </ul>
        </div>
      </div>
    </section>
  )
}

/* ── Metricool ──────────────────────────────────────────────────────────── */

export function MetricoolPanel({ connection, analytics, gated }) {
  const { t } = useI18n()
  return (
    <section className="gs-panel" aria-labelledby="og-metricool-title">
      <header className="gs-panel-head">
        <div><h2 id="og-metricool-title"><span className="gs-panel-icon"><RiShareForwardLine /></span>{t('organic.metricool.title')}</h2><p>{t('organic.metricool.intro')}</p></div>
        {connection.connected ? <span className="gs-pill tone-ok">{t('organic.metricool.connected')}</span> : null}
      </header>
      <div className="gs-panel-body">
        {gated ? (
          <p className="gs-empty-inline">{t('organic.metricool.gated')}</p>
        ) : !connection.connected ? (
          <div className="og-connect">
            <span className="og-connect-icon"><RiShareForwardLine aria-hidden="true" /></span>
            <div>
              <strong>{t('organic.metricool.notConnectedTitle')}</strong>
              <p>{t('organic.metricool.notConnectedText')}</p>
            </div>
            <button type="button" className="gs-button primary" onClick={connection.connect} disabled={connection.connecting || connection.loading}><RiShareForwardLine /> {connection.connecting ? t('organic.metricool.connecting') : t('organic.metricool.connect')}</button>
          </div>
        ) : (
          <>
            {connection.integrations.length ? (
              <div className="og-chips">
                {connection.integrations.map((item, index) => {
                  const meta = platformMeta(item?.platform ?? item?.type ?? item?.provider)
                  return <span className="gs-chip" key={item?.id ?? index}><meta.Icon aria-hidden="true" /> {item?.name ?? item?.username ?? meta.name}</span>
                })}
              </div>
            ) : null}
            <div className="og-connect">
              <span className="og-connect-icon"><RiGlobalLine aria-hidden="true" /></span>
              <div><strong>{t('organic.metricool.connectedTitle')}</strong><p>{t('organic.metricool.connectedText')}</p></div>
              {connection.providerUrl ? <a className="gs-button" href={connection.providerUrl} target="_blank" rel="noreferrer">{t('organic.metricool.open')} <RiExternalLinkLine /></a> : null}
            </div>
            <h3 className="gs-subhead">{t('organic.metricool.metrics')} <small>{t('organic.metricool.reportedBy')}</small></h3>
            <DataStatusBanner compact status={analytics.loading ? 'loading' : analytics.status} message={analytics.error || statusMessage(analytics.status, { live: t('organic.metricool.metricsLive'), empty: t('organic.metricool.metricsEmpty'), demo: t('organic.metricool.metricsDemo') })} onRetry={analytics.status === 'error' || analytics.status === 'disconnected' ? analytics.reload : undefined} />
            <AnalyticsList data={analytics.data} status={analytics.loading ? 'loading' : analytics.status} onRetry={analytics.reload} />
          </>
        )}
      </div>
    </section>
  )
}

function AnalyticsList({ data, status, onRetry }) {
  const { t } = useI18n()
  if (status === 'loading') return <div className="gs-skeleton"><i /><i /><i /></div>
  if (status === 'error' || status === 'disconnected') {
    return <p className="gs-empty-inline"><RiAlertLine /> {t('organic.metricool.metricsFailed')} {onRetry ? <button type="button" className="gs-link" onClick={onRetry}>{t('organic.metricool.retry')}</button> : null}</p>
  }
  const entries = data && typeof data === 'object' ? Object.entries(data) : []
  if (!entries.length) return <p className="gs-empty-inline">{t('organic.metricool.metricsNone')}</p>
  return (
    <div className="og-analytics">
      {entries.map(([key, value]) => <div key={key}><span>{key}</span><strong>{renderAnalyticsValue(value, t)}</strong></div>)}
    </div>
  )
}

/* ── Copiloto por brief ─────────────────────────────────────────────────── */

export function CopilotPanel({ copilot, campaignLink, gated }) {
  const { t } = useI18n()
  const { selectedCampaign, selectedCampaignId } = campaignLink
  const creationBlocked = !selectedCampaignId || !selectedCampaign?.landingSlug
  return (
    <section className="gs-panel" id="og-copilot" aria-labelledby="og-copilot-title">
      <header className="gs-panel-head">
        <div><h2 id="og-copilot-title"><span className="gs-panel-icon"><RiSparkling2Line /></span>{t('organic.copilot.title')}</h2><p>{t('organic.copilot.intro')}</p></div>
        <span className="gs-pill tone-violet"><RiSparkling2Line /> {t('organic.copilot.aiReady')}</span>
      </header>
      <div className="gs-panel-body">
        {gated ? <p className="gs-alert is-info"><RiAlertLine /><span>{t('organic.copilot.gated')}</span></p> : null}
        <form className="og-copilot" onSubmit={copilot.generate}>
          <div className="og-linker">
            <div className="og-linker-head"><span><RiGlobalLine aria-hidden="true" /> {t('organic.copilot.campaignAndDestination')}</span><small>{t('organic.copilot.requiredForDrafts')}</small></div>
            <DataStatusBanner compact status={campaignLink.status} message={campaignLink.error || statusMessage(campaignLink.status, { live: t('organic.copilot.campaignsLive'), empty: t('organic.copilot.campaignsEmpty'), demo: t('organic.copilot.campaignsDemo') })} onRetry={campaignLink.status === 'error' || campaignLink.status === 'disconnected' ? campaignLink.reload : undefined} onAction={campaignLink.status === 'empty' ? () => window.location.assign('/captacion/planificar') : undefined} actionLabel={t('organic.copilot.createCampaign')} />
            <div className="gs-form-grid">
              <label htmlFor="og-campaign">
                {t('organic.copilot.campaign')}
                <select id="og-campaign" className="gs-select" value={selectedCampaignId} onChange={event => campaignLink.setSelectedCampaignId(event.target.value)} disabled={campaignLink.loading}>
                  <option value="">{campaignLink.loading ? t('organic.copilot.loadingCampaigns') : t('organic.copilot.selectCampaign')}</option>
                  {campaignLink.campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}{campaign.landingSlug ? '' : t('organic.copilot.noLanding')}</option>)}
                </select>
              </label>
              <label htmlFor="og-cta">
                {t('organic.copilot.cta')}
                <input id="og-cta" className="gs-input" type="text" maxLength="160" value={campaignLink.cta} onChange={event => campaignLink.setCta(event.target.value)} placeholder={t('organic.copilot.ctaPlaceholder')} />
              </label>
            </div>
            {selectedCampaignId ? (
              selectedCampaign?.landingSlug
                ? <p className="og-destination is-ok"><RiCheckLine aria-hidden="true" /> {t('organic.copilot.destination')} <a href={`/l/${selectedCampaign.landingSlug}`} target="_blank" rel="noreferrer">/l/{selectedCampaign.landingSlug}</a><small>{t('organic.copilot.utmNote')}</small></p>
                : <p className="og-destination is-warn"><RiAlertLine aria-hidden="true" /> {t('organic.copilot.noLandingYet')} <Link to="/captacion/convertir?tab=landings">{t('organic.copilot.createLanding')} <RiArrowRightLine /></Link></p>
            ) : null}
          </div>
          <label className="gs-field" htmlFor="og-brief">
            <span>{t('organic.copilot.brief')}</span>
            <textarea id="og-brief" className="gs-textarea" value={copilot.prompt} onChange={event => copilot.setPrompt(event.target.value)} rows="3" placeholder={t('organic.copilot.briefPlaceholder')} />
          </label>
          <div className="gs-form-grid">
            <label htmlFor="og-tone">{t('organic.copilot.tone')}<select id="og-tone" className="gs-select" value={copilot.tone} onChange={event => copilot.setTone(event.target.value)}><option value="cercano">{t('organic.copilot.toneWarm')}</option><option value="experto">{t('organic.copilot.toneExpert')}</option><option value="inspirador">{t('organic.copilot.toneInspiring')}</option><option value="directo">{t('organic.copilot.toneDirect')}</option></select></label>
            <label htmlFor="og-start">{t('organic.copilot.startDate')}<input id="og-start" className="gs-input" type="date" value={copilot.startDate} onChange={event => copilot.setStartDate(event.target.value)} /></label>
          </div>
          <fieldset className="gs-fieldset">
            <legend>{t('organic.copilot.channels')}</legend>
            <ChannelPicker selected={copilot.channels} onToggle={copilot.toggleChannel} />
          </fieldset>
          <button className="gs-button primary" type="submit" disabled={copilot.loading || !copilot.prompt.trim() || !copilot.channels.length}>
            <RiSparkling2Line /> {copilot.loading ? t('organic.copilot.generating') : t('organic.copilot.generatePlan')}
          </button>
        </form>

        {copilot.plan ? (
          <div className="og-plan">
            <div className="og-plan-head">
              <div>
                <span className="gs-overline">{copilot.plan.generatedBy === 'fallback' ? t('organic.copilot.fallbackPlan') : t('organic.copilot.aiPlan')}</span>
                <h3>{copilot.plan.title}</h3>
                <p>{copilot.plan.summary}</p>
              </div>
              <button className="gs-icon-button" type="button" aria-label={t('organic.copilot.discardPlan')} onClick={copilot.clearPlan}><RiCloseLine /></button>
            </div>
            <div className="og-posts">
              {(copilot.plan.posts ?? []).map((post, index) => {
                const meta = platformMeta(post.platform)
                const status = copilot.draftStatus[index]
                const imageState = copilot.imageStatus[index]
                const locked = imageState === 'uploading' || status === 'creating' || status === 'done'
                return (
                  <article className="og-post" key={`${post.platform}-${index}`}>
                    <div className="og-post-date"><strong>{formatShortDate(post.suggestedDate)}</strong><span style={{ color: meta.color }}><meta.Icon aria-hidden="true" /> {meta.name}</span></div>
                    <div className="og-post-copy">
                      <p>{post.text}</p>
                      <div className="og-piece-image">
                        {copilot.postImages[index] ? <img src={copilot.postImages[index]} alt={t('organic.copilot.postImageAlt')} /> : null}
                        <label className={`gs-link${locked ? ' is-disabled' : ''}`}>
                          <RiImageAddLine /> {imageState === 'uploading' ? t('organic.studio.uploading') : t('organic.studio.uploadImage')}
                          <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={locked} onChange={event => { void copilot.uploadImage(event.target.files?.[0], index); event.target.value = '' }} />
                        </label>
                        <button type="button" className="gs-link" disabled={imageState === 'generating' || locked} onClick={() => copilot.generateImage(post, index)}><RiSparkling2Line /> {imageState === 'generating' ? t('organic.studio.generatingImage') : t('organic.studio.generateImage')}</button>
                        {copilot.postImages[index] && !locked ? <button type="button" className="gs-link" onClick={() => copilot.removeImage(index)}><RiCloseLine /> {t('organic.studio.remove')}</button> : null}
                      </div>
                    </div>
                    <button type="button" className="gs-button small" disabled={status === 'creating' || status === 'done' || creationBlocked || gated} title={creationBlocked ? t('organic.copilot.selectCampaignWithLanding') : undefined} onClick={() => copilot.createDraft(post, index)}>
                      {status === 'done' ? <><RiCheckLine /> {t('organic.copilot.created')}</> : status === 'creating' ? t('organic.copilot.creating') : t('organic.copilot.createDraft')}
                    </button>
                  </article>
                )
              })}
            </div>
          </div>
        ) : null}
        <div className="og-copilot-foot"><span><RiGlobalLine /> {t('organic.copilot.footLanding')}</span><span><RiTimeLine /> {t('organic.copilot.footDates')}</span></div>
      </div>
    </section>
  )
}
