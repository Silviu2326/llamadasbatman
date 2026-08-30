import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RiAlertLine, RiArrowRightLine, RiBarChartLine, RiCheckLine, RiCloseLine, RiExternalLinkLine,
  RiGlobalLine, RiImageAddLine, RiLinkM, RiRadarLine, RiRefreshLine, RiShareForwardLine,
  RiSparkling2Line, RiTimeLine, RiVoiceprintLine,
} from 'react-icons/ri'
import DataStatusBanner from '../../components/ui/DataStatusBanner'
import { statusMessage } from '../../lib/dataStatus'
import { getLocale, localeCode } from '../../i18n'
import {
  FORMAT_LABEL, HISTORY_LABEL, IMAGE_BUSY_STATES, OBJECTIVE_LABEL, OPPORTUNITY_META, PLATFORM_META,
  REJECTION_LABEL, defaultObjectiveFor, formatEuros, formatPipeline, formatShortDate, pieceToText,
  platformMeta, renderAnalyticsValue,
} from './contentFormats'

/* ── Radar ──────────────────────────────────────────────────────────────── */

/**
 * Radar de oportunidades de contenido — pantallas.md §1. Dos reglas: la
 * cabecera cuenta lo analizado (es lo que hace creíble lo encontrado) y el
 * vacío es honesto: sin señales no se rellena con tarjetas genéricas.
 */
export function RadarPanel({ radar, onGenerate, onOwnIdea }) {
  const opportunities = radar.data?.opportunities ?? []
  const evidence = radar.evidence
  return (
    <section className="gs-panel is-accent" aria-labelledby="og-radar-title">
      <header className="gs-panel-head">
        <div>
          <span className="gs-overline">Radar · desde tus conversaciones</span>
          <h2 id="og-radar-title"><span className="gs-panel-icon"><RiRadarLine /></span>
            {radar.loading
              ? 'Analizando conversaciones…'
              : `${radar.data?.conversationsAnalyzed ?? 0} conversaciones analizadas · ${opportunities.length} ${opportunities.length === 1 ? 'oportunidad' : 'oportunidades'} de contenido`}
          </h2>
          <p>Cada oportunidad sale de conversaciones reales y guarda de dónde salió. Generar abre el estudio con el objetivo ya elegido.</p>
        </div>
        <div className="gs-panel-actions">
          <button type="button" className="gs-button ghost" onClick={onOwnIdea}>Crear desde una idea propia</button>
          <button type="button" className="gs-button" onClick={radar.refresh} disabled={radar.busy || radar.loading}>
            <RiRefreshLine className={radar.busy ? 'gs-spin' : ''} /> {radar.busy ? 'Analizando…' : 'Volver a analizar'}
          </button>
        </div>
      </header>
      <div className="gs-panel-body">
        {radar.loading ? <div className="gs-skeleton"><i /><i /><i /></div> : opportunities.length ? (
          <div className="gs-queue">
            {opportunities.map(opportunity => {
              const meta = OPPORTUNITY_META[opportunity.type] ?? { label: opportunity.type, tone: 'info' }
              return (
                <article className={`gs-queue-card tone-${meta.tone}`} key={opportunity.id}>
                  <header>
                    <span className="gs-queue-kind">{meta.label}</span>
                    {/* El chip es el modo objetivo con el que se abrirá el estudio. */}
                    <span className="gs-pill">{OBJECTIVE_LABEL[defaultObjectiveFor(opportunity.type)]}</span>
                  </header>
                  <strong>{opportunity.summary}</strong>
                  <p><b>Oportunidad:</b> {opportunity.title}</p>
                  <small>
                    {opportunity.evidenceCount} {opportunity.evidenceCount === 1 ? 'mención' : 'menciones'} en {opportunity.conversationsScanned} conversaciones
                    {' '}<button type="button" className="gs-link" onClick={() => radar.loadEvidence(opportunity.id)}>ver</button>
                  </small>
                  <footer>
                    <div>
                      <button type="button" className="gs-button small ghost" onClick={() => radar.dismiss(opportunity.id)}>Descartar</button>
                      <button type="button" className="gs-button small primary" onClick={() => onGenerate(opportunity)}>Generar campaña <RiArrowRightLine /></button>
                    </div>
                  </footer>
                </article>
              )
            })}
          </div>
        ) : (
          <p className="gs-empty-inline">Esta semana no hay suficientes señales para proponer contenido con evidencia. Conecta más llamadas o vuelve el lunes.</p>
        )}
        {evidence ? (
          <div className="og-evidence" role="status">
            <div className="og-evidence-head">
              <strong>{evidence.title}</strong>
              <button type="button" className="gs-icon-button" onClick={radar.closeEvidence} aria-label="Cerrar evidencias"><RiCloseLine /></button>
            </div>
            <p>{evidence.summary}</p>
            {/* Conteos y referencias, nunca la transcripción: la cita literal exige consentimiento. */}
            <small>{evidence.calls.length} llamadas y {evidence.conversations.length} conversaciones sustentan esta oportunidad. Se muestran referencias, no transcripciones.</small>
          </div>
        ) : null}
      </div>
    </section>
  )
}

/* ── Estudio ────────────────────────────────────────────────────────────── */

/** Chequeo de especificidad (idea 27): lo sustituido con su fuente y lo que sigue genérico. */
function SpecificityNote({ specificity }) {
  const flags = specificity?.flags ?? []
  if (!flags.length) return null
  const replaced = flags.filter(flag => flag.replacedWith)
  const pending = flags.filter(flag => !flag.replacedWith)
  return (
    <div className="og-specificity">
      {replaced.length ? (
        <details>
          <summary className="is-ok">{replaced.length} {replaced.length === 1 ? 'frase genérica sustituida' : 'frases genéricas sustituidas'} con datos reales</summary>
          <ul>{replaced.map((flag, index) => <li key={`ok-${index}`}>«{flag.phrase}» → <strong>{flag.replacedWith}</strong>{flag.sourceName ? <em> · de «{flag.sourceName}»</em> : null}</li>)}</ul>
        </details>
      ) : null}
      {pending.length ? (
        <details>
          <summary className="is-warn">{pending.length} {pending.length === 1 ? 'frase sin dato que la sostenga' : 'frases sin dato que las sostengan'}</summary>
          <ul>{pending.map((flag, index) => <li key={`pending-${index}`}>«{flag.phrase}» · {flag.why}</li>)}</ul>
          {specificity?.afterHumanEdit
            ? <small>Al editar a mano solo se marca: el texto es tuyo y no se reescribe solo.</small>
            : specificity?.factsAvailable === 0 ? <small>No hay nada en la Base de conocimiento con lo que sustituirlas: solo se pueden marcar.</small> : null}
        </details>
      ) : null}
    </div>
  )
}

/** Informe del editor adversario (idea 21). La PII enmascarada va delante, no escondida. */
function CriticNote({ review }) {
  if (!review) return null
  const issues = review.critique?.issues ?? []
  const masked = review.pii?.masked ?? 0
  if (!masked && !issues.length && !review.critique?.discardedReason) return null
  return (
    <div className="og-critic">
      {masked ? <p className="is-alert">Se {masked === 1 ? 'ha eliminado un dato personal' : `han eliminado ${masked} datos personales`} del texto ({(review.pii.found ?? []).join(', ').toLowerCase()}). Revísala antes de aprobarla.</p> : null}
      {issues.length ? (
        <details>
          <summary>{issues.length === 1 ? 'El editor le vio una pega' : `El editor le vio ${issues.length} pegas`}</summary>
          <ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
          {review.critique?.rewritten ? <small>La pieza que ves ya está reescrita con esas correcciones.</small> : null}
        </details>
      ) : null}
      {review.critique?.discardedReason ? <small>Reescritura descartada: {review.critique.discardedReason}</small> : null}
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
  const setup = studio.setup
  const data = studio.data
  return (
    <section className="gs-panel" id="og-studio" aria-labelledby="og-studio-title">
      <header className="gs-panel-head">
        <div>
          <h2 id="og-studio-title"><span className="gs-panel-icon"><RiSparkling2Line /></span>Estudio</h2>
          <p>
            {data ? 'Seis piezas de la misma oportunidad: post, carrusel, guion de Reel, 3 stories, email y locución.' : setup ? 'Decide el objetivo y los canales antes de generar.' : 'Elige una oportunidad del radar o parte de una idea propia con el copiloto de abajo.'}
            {data?.voice ? ` Escritas con la voz del negocio (${data.voice.sampleSize} intervenciones reales).` : data ? ` ${data.voiceMissingReason}` : ''}
            {data?.generatedBy === 'deterministic' ? ' Generadas sin modelo: falta configurar la clave de IA.' : ''}
            {data?.specificity?.replaced ? ` ${data.specificity.replaced} ${data.specificity.replaced === 1 ? 'frase genérica sustituida' : 'frases genéricas sustituidas'} con datos de la Base de conocimiento.` : ''}
            {data?.specificity?.unresolved ? ` ${data.specificity.unresolved} sin dato que ${data.specificity.unresolved === 1 ? 'la sostenga' : 'las sostenga'}${data.specificity.knowledgeMissing ? ': la Base de conocimiento está vacía' : ''}.` : ''}
          </p>
        </div>
        {setup ? <button type="button" className="gs-icon-button" aria-label="Cerrar el estudio" onClick={studio.close}><RiCloseLine /></button> : null}
      </header>
      {setup ? (
        <div className="gs-panel-body">
          <div className="og-studio-setup">
            <div>
              <strong>{setup.title}</strong>
              <p>{setup.summary}</p>
              {setup.objective ? <small>Enfoque sugerido por el análisis: {setup.objective}</small> : null}
            </div>
            <label className="gs-field">
              <span>Objetivo</span>
              <select className="gs-select" value={studio.objective} onChange={event => studio.setObjective(event.target.value)}>
                {Object.entries(OBJECTIVE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <fieldset className="gs-fieldset">
              <legend>Canales de publicación</legend>
              <ChannelPicker selected={studio.channels} onToggle={studio.toggleChannel} />
            </fieldset>
            <div className="og-studio-actions">
              {/* Volver a generar rehace los borradores; lo que ya está en la cola no se toca. */}
              <button type="button" className="gs-button primary" disabled={studio.busy || !studio.channels.length} onClick={studio.generate}>
                <RiSparkling2Line /> {studio.busy ? 'Generando…' : data ? 'Volver a generar' : 'Generar la campaña (6 piezas)'}
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
  const status = studio.imageStatus[piece.id]
  // Una pieza publicada ya salió con su imagen: cambiarla aquí mentiría.
  const imageLocked = piece.status === 'published' || IMAGE_BUSY_STATES.includes(status)
  return (
    <article className="og-piece">
      <header>
        <span className="gs-pill tone-info">{FORMAT_LABEL[piece.format] ?? piece.format}</span>
        <small>≈ {piece.minutesSaved} min ahorrados</small>
      </header>
      <pre className="og-piece-body">{pieceToText(piece)}</pre>
      <SpecificityNote specificity={piece.specificity} />
      <CriticNote review={piece.reviewReport} />

      {piece.format === 'voiceover' ? (
        piece.audioUrl ? (
          <div className="og-audio">
            <audio controls src={piece.audioUrl} preload="none" />
            <a className="gs-link" href={piece.audioUrl} download><RiVoiceprintLine /> Descargar audio</a>
            <small>≈ {piece.body?.estimatedSeconds ?? '—'} s · voz {piece.body?.provider ?? 'desconocida'}</small>
            {piece.editedByHuman ? <small className="is-stale">El audio se grabó antes de esta edición: vuelve a generar para que suene el texto nuevo.</small> : null}
          </div>
        ) : <p className="gs-note">{piece.body?.missingReason}</p>
      ) : null}

      {piece.format === 'carousel' && piece.body?.slideImages?.length ? (
        <div className="og-slides">
          <div>{piece.body.slideImages.map((url, index) => <img key={url} src={url} alt={`Slide ${index + 1} del carrusel`} loading="lazy" />)}</div>
          {piece.body?.brandTemplate?.usesDefaultColors ? <small>Maquetadas con los colores por defecto: pon los de tu marca en «Fuentes y marca».</small> : null}
          <button type="button" className="gs-link" disabled={imageLocked} onClick={() => studio.useSlide(piece)}><RiImageAddLine /> Usar la portada como imagen</button>
        </div>
      ) : null}
      {piece.format === 'carousel' && piece.body?.slidesMissingReason ? <p className="gs-note">{piece.body.slidesMissingReason}</p> : null}

      <div className="og-piece-image">
        {piece.imageUrl ? <img src={piece.imageUrl} alt={`Imagen de la pieza ${FORMAT_LABEL[piece.format] ?? piece.format}`} /> : null}
        <label className={`gs-link${imageLocked ? ' is-disabled' : ''}`}>
          <RiImageAddLine /> {status === 'uploading' ? 'Subiendo…' : piece.imageUrl ? 'Cambiar imagen' : 'Subir imagen'}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={imageLocked} onChange={event => { void studio.uploadImage(piece.id, event.target.files?.[0]); event.target.value = '' }} />
        </label>
        <button type="button" className="gs-link" disabled={imageLocked} onClick={() => studio.generateImage(piece)}><RiSparkling2Line /> {status === 'generating' ? 'Generando imagen…' : 'Generar imagen con IA'}</button>
        {piece.imageUrl ? <button type="button" className="gs-link" disabled={imageLocked} onClick={() => studio.removeImage(piece.id)}><RiCloseLine /> {status === 'removing' ? 'Quitando…' : 'Quitar'}</button> : null}
      </div>

      <footer>
        <small>{piece.evidenceSummary}</small>
        {piece.status === 'draft'
          ? <button type="button" className="gs-button small primary" disabled={studio.busy} onClick={() => studio.submit(piece.id)}>Enviar a aprobación</button>
          : <span className="gs-pill tone-ok">{piece.status === 'pending_approval' ? 'En la cola' : piece.status}</span>}
      </footer>
    </article>
  )
}

/* ── Sala de aprobación ─────────────────────────────────────────────────── */

function PieceHistory({ history, busy, onComment }) {
  const [message, setMessage] = useState('')
  const events = history?.events ?? []
  return (
    <div className="og-history">
      <ul>
        {events.length ? events.map(event => (
          <li key={event.id}>
            <strong>{event.actor}</strong>{event.external ? ' (cliente)' : ''} · {HISTORY_LABEL[event.kind] ?? event.kind}
            {event.message ? <span>: «{event.message}»</span> : null}
            <em>{new Date(event.at).toLocaleString(localeCode(getLocale()))}</em>
          </li>
        )) : <li className="is-empty">Todavía no hay movimientos en esta pieza.</li>}
      </ul>
      <div className="og-history-comment">
        <input className="gs-input" value={message} onChange={event => setMessage(event.target.value)} placeholder="Comentar esta pieza…" />
        <button type="button" className="gs-button small" disabled={busy || !message.trim()} onClick={() => { onComment(message.trim()); setMessage('') }}>Comentar</button>
      </div>
    </div>
  )
}

/** Sala de aprobación — pantallas.md §3. Rechazar exige motivo. */
export function ApprovalQueue({ approval }) {
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [openHistory, setOpenHistory] = useState(null)
  const pending = approval.queue.filter(piece => piece.status === 'pending_approval')
  return (
    <section className="gs-panel" id="og-approval" aria-labelledby="og-approval-title">
      <header className="gs-panel-head">
        <div>
          <h2 id="og-approval-title"><span className="gs-panel-icon"><RiCheckLine /></span>Sala de aprobación</h2>
          <p>{pending.length ? `${pending.length} ${pending.length === 1 ? 'pieza pendiente' : 'piezas pendientes'} de decisión. Aprobar crea el borrador en Metricool.` : 'No hay piezas esperando decisión.'}</p>
        </div>
        {pending.length ? (
          <button type="button" className="gs-button primary" onClick={approval.approveAll} disabled={approval.busy}>
            {approval.progress ? `Aprobando ${approval.progress.done}/${approval.progress.total}…` : 'Aprobar todo'}
          </button>
        ) : null}
      </header>
      {pending.length ? (
        <div className="gs-panel-body">
          <div className="og-approval-list">
            {pending.map(piece => (
              <article className="og-approval-piece" key={piece.id}>
                <header>
                  <span className="gs-pill tone-info">{FORMAT_LABEL[piece.format] ?? piece.format}</span>
                  {piece.opportunity ? <span className="og-approval-origin">de «{piece.opportunity.title}» · {piece.opportunity.evidenceCount} evidencias</span> : null}
                  {piece.editedByHuman ? <span className="gs-pill tone-warn">editada</span> : null}
                </header>
                <textarea className="gs-textarea og-approval-editor" rows="5" value={approval.drafts[piece.id] ?? pieceToText(piece)} onChange={event => approval.setDraft(piece.id, event.target.value)} />
                <SpecificityNote specificity={piece.specificity} />
                <CriticNote review={piece.reviewReport} />
                <footer>
                  <button type="button" className="gs-button small ghost" disabled={approval.busy || approval.drafts[piece.id] === undefined} onClick={() => approval.saveEdit(piece)}>Guardar edición</button>
                  <button type="button" className="gs-button small ghost" onClick={() => { const next = openHistory === piece.id ? null : piece.id; setOpenHistory(next); if (next) approval.loadHistory(piece.id) }}>
                    {openHistory === piece.id ? 'Ocultar historial' : `Historial${piece._count?.events ? ` (${piece._count.events})` : ''}`}
                  </button>
                  <button type="button" className="gs-button small ghost" disabled={approval.busy} onClick={() => { setRejecting(piece.id); setReason(''); setComment('') }}>Rechazar</button>
                  <button type="button" className="gs-button small primary" disabled={approval.busy} onClick={() => approval.approve(piece.id)}>Aprobar</button>
                </footer>
                {openHistory === piece.id ? <PieceHistory history={approval.histories[piece.id]} busy={approval.busy} onComment={message => approval.comment(piece.id, message)} /> : null}
                {rejecting === piece.id ? (
                  <div className="og-reject">
                    <span>¿Por qué se rechaza? El motivo es obligatorio.</span>
                    <div className="gs-choices">
                      {Object.entries(REJECTION_LABEL).map(([value, label]) => (
                        <button key={value} type="button" className={`gs-choice${reason === value ? ' selected' : ''}`} onClick={() => setReason(value)}>{label}</button>
                      ))}
                    </div>
                    <input className="gs-input" value={comment} onChange={event => setComment(event.target.value)} placeholder="Detalle opcional…" />
                    <div className="og-reject-actions">
                      <button type="button" className="gs-button small ghost" onClick={() => setRejecting(null)}>Cancelar</button>
                      <button type="button" className="gs-button small primary" disabled={!reason || approval.busy} onClick={() => { approval.reject(piece.id, reason, comment); setRejecting(null) }}>Confirmar rechazo</button>
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
  if (!results) return null
  const percent = value => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`)
  return (
    <section className="gs-panel" aria-labelledby="og-results-title">
      <header className="gs-panel-head">
        <div><h2 id="og-results-title"><span className="gs-panel-icon"><RiBarChartLine /></span>Resultados del contenido</h2><p>Tiempo ahorrado, aprobación y leads atribuidos a las piezas. Lo que aún no se puede medir se dice, no se rellena con ceros.</p></div>
      </header>
      <div className="gs-panel-body">
        <div className="gs-minis">
          <div className="gs-mini"><span>Tiempo ahorrado</span><strong>{results.minutesSaved} min</strong><em>solo piezas aprobadas</em></div>
          <div className="gs-mini"><span>% aprobado</span><strong>{percent(results.approvalRate)}</strong><em>{results.approved} de {results.pieces} piezas</em></div>
          <div className="gs-mini"><span>% sin editar</span><strong>{percent(results.untouchedRate)}</strong><em>de las aprobadas</em></div>
          <div className="gs-mini"><span>Leads atribuidos</span><strong>{results.leadsAttributed ?? 0}</strong><em>{results.published} piezas publicadas</em></div>
          {/* Ganado y abierto no se suman nunca: lo abierto es expectativa. */}
          <div className={`gs-mini${results.value?.measurable ? '' : ' is-missing'}`}><span>Euros ganados</span><strong>{results.value?.measurable ? formatEuros(results.value.won) : 'Sin medición'}</strong><em>{results.value?.measurable ? `${formatEuros(results.value.open)} aún abiertos` : 'sin oportunidades en el CRM'}</em></div>
        </div>
        {results.perPiece.length ? (
          <div className="gs-table-scroll" style={{ marginTop: 14 }}>
            <table className="gs-table">
              <thead><tr><th>Pieza</th><th>Canales</th><th>UTM</th><th className="num">Visitas</th><th className="num">Leads</th><th>En pipeline</th><th className="num">Ganado / abierto</th></tr></thead>
              <tbody>
                {results.perPiece.map(piece => (
                  <tr key={piece.id}>
                    <td><strong>{FORMAT_LABEL[piece.format] ?? piece.format}</strong></td>
                    <td>{piece.channels?.length ? piece.channels.map(channel => platformMeta(channel).name).join(', ') : '—'}</td>
                    <td><code>{piece.utmContent}</code></td>
                    <td className="num">{piece.visits === null ? 'sin publicar' : piece.visits}</td>
                    <td className="num">{piece.leads === null ? '—' : piece.leads}</td>
                    <td>{formatPipeline(piece.pipeline)}</td>
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
  const [form, setForm] = useState(null)
  const current = form ?? brand.data
  return (
    <section className="gs-panel" aria-labelledby="og-brand-title">
      <header className="gs-panel-head">
        <div>
          <h2 id="og-brand-title"><span className="gs-panel-icon"><RiShareForwardLine /></span>Marca y aprobación externa</h2>
          <p>Con estos colores y este logo se maquetan las slides del carrusel.{brand.data?.isDefault ? ' Ahora mismo son los colores por defecto, no los tuyos.' : ''}</p>
        </div>
      </header>
      <div className="gs-panel-body">
        {current ? (
          <div className="og-brand-kit">
            {['primary', 'secondary', 'text'].map(key => (
              <label key={key} htmlFor={`og-brand-${key}`}>
                {key === 'primary' ? 'Color principal' : key === 'secondary' ? 'Color secundario' : 'Color del texto'}
                <input id={`og-brand-${key}`} type="color" value={current[key]} onChange={event => setForm({ ...current, [key]: event.target.value })} />
              </label>
            ))}
            <label htmlFor="og-brand-logo" className="is-wide">
              Logo (URL)
              <input id="og-brand-logo" className="gs-input" type="url" placeholder="https://…/logo.png" value={current.logoUrl ?? ''} onChange={event => setForm({ ...current, logoUrl: event.target.value || null })} />
            </label>
            <button type="button" className="gs-button primary" disabled={brand.busy || !form} onClick={() => { brand.save(form); setForm(null) }}>Guardar marca</button>
          </div>
        ) : <p className="gs-empty-inline">El libro de marca no está disponible en este plan o todavía no se ha cargado.</p>}

        <div className="og-links">
          <div className="og-links-head">
            <strong>Enlaces de aprobación para clientes</strong>
            <button type="button" className="gs-button small" disabled={brand.busy} onClick={brand.createLink}><RiLinkM /> Crear enlace</button>
          </div>
          {/* Se enseña una vez y no se puede volver a consultar: en la base solo vive su huella. */}
          {brand.newLink ? <p className="og-link-new"><code>{brand.newLink.url}</code><small>{brand.newLink.notice}</small></p> : null}
          <ul>
            {brand.links.length ? brand.links.map(link => (
              <li key={link.id}>
                <span>{link.label || 'Sin etiqueta'}</span>
                <em>{link.active ? `caduca el ${new Date(link.expiresAt).toLocaleDateString(localeCode(getLocale()))}` : link.revokedAt ? 'revocado' : 'caducado'}</em>
                {link.active ? <button type="button" className="gs-link" disabled={brand.busy} onClick={() => brand.revokeLink(link.id)}>Revocar</button> : null}
              </li>
            )) : <li className="is-empty">No hay enlaces activos. Con uno, tu cliente aprueba sin entrar en el CRM.</li>}
          </ul>
        </div>
      </div>
    </section>
  )
}

/* ── Metricool ──────────────────────────────────────────────────────────── */

export function MetricoolPanel({ connection, analytics, gated }) {
  return (
    <section className="gs-panel" aria-labelledby="og-metricool-title">
      <header className="gs-panel-head">
        <div><h2 id="og-metricool-title"><span className="gs-panel-icon"><RiShareForwardLine /></span>Redes sociales · Metricool</h2><p>Metricool gestiona tus canales, calendario y publicaciones. Aquí se conecta y se leen sus métricas; planificar y publicar se hace allí.</p></div>
        {connection.connected ? <span className="gs-pill tone-ok">Conectado</span> : null}
      </header>
      <div className="gs-panel-body">
        {gated ? (
          <p className="gs-empty-inline">Redes sociales es una función del Plan Completo. Habla con tu administrador para activarla.</p>
        ) : !connection.connected ? (
          <div className="og-connect">
            <span className="og-connect-icon"><RiShareForwardLine aria-hidden="true" /></span>
            <div>
              <strong>Aún no conectaste tus redes</strong>
              <p>Configura Metricool para publicar y programar contenido en Instagram, LinkedIn, Facebook, TikTok, YouTube y X.</p>
            </div>
            <button type="button" className="gs-button primary" onClick={connection.connect} disabled={connection.connecting || connection.loading}><RiShareForwardLine /> {connection.connecting ? 'Conectando…' : 'Conectar redes sociales'}</button>
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
              <div><strong>Metricool está conectado</strong><p>Abre su planificador para revisar y ajustar tus borradores.</p></div>
              {connection.providerUrl ? <a className="gs-button" href={connection.providerUrl} target="_blank" rel="noreferrer">Abrir Metricool <RiExternalLinkLine /></a> : null}
            </div>
            <h3 className="gs-subhead">Métricas <small>reportadas por Metricool</small></h3>
            <DataStatusBanner compact status={analytics.loading ? 'loading' : analytics.status} message={analytics.error || statusMessage(analytics.status, { live: 'Métricas reales disponibles.', empty: 'Metricool todavía no ha reportado actividad.', demo: 'Las métricas demo están identificadas y no representan actividad real.' })} onRetry={analytics.status === 'error' || analytics.status === 'disconnected' ? analytics.reload : undefined} />
            <AnalyticsList data={analytics.data} status={analytics.loading ? 'loading' : analytics.status} onRetry={analytics.reload} />
          </>
        )}
      </div>
    </section>
  )
}

function AnalyticsList({ data, status, onRetry }) {
  if (status === 'loading') return <div className="gs-skeleton"><i /><i /><i /></div>
  if (status === 'error' || status === 'disconnected') {
    return <p className="gs-empty-inline"><RiAlertLine /> No se pudieron cargar las métricas. {onRetry ? <button type="button" className="gs-link" onClick={onRetry}>Reintentar</button> : null}</p>
  }
  const entries = data && typeof data === 'object' ? Object.entries(data) : []
  if (!entries.length) return <p className="gs-empty-inline">Todavía no hay métricas disponibles. Aparecerán cuando Metricool reporte actividad de tus redes.</p>
  return (
    <div className="og-analytics">
      {entries.map(([key, value]) => <div key={key}><span>{key}</span><strong>{renderAnalyticsValue(value)}</strong></div>)}
    </div>
  )
}

/* ── Copiloto por brief ─────────────────────────────────────────────────── */

export function CopilotPanel({ copilot, campaignLink, gated }) {
  const { selectedCampaign, selectedCampaignId } = campaignLink
  const creationBlocked = !selectedCampaignId || !selectedCampaign?.landingSlug
  return (
    <section className="gs-panel" id="og-copilot" aria-labelledby="og-copilot-title">
      <header className="gs-panel-head">
        <div><h2 id="og-copilot-title"><span className="gs-panel-icon"><RiSparkling2Line /></span>Copiloto de contenido</h2><p>Parte de una idea propia: describe qué quieres comunicar y genera un borrador por canal, enlazado a la landing de una campaña con UTMs propias.</p></div>
        <span className="gs-pill tone-violet"><RiSparkling2Line /> IA preparada</span>
      </header>
      <div className="gs-panel-body">
        {gated ? <p className="gs-alert is-info"><RiAlertLine /><span>Los borradores en Metricool son una función del Plan Completo. Puedes generar el plan, pero no crear borradores.</span></p> : null}
        <form className="og-copilot" onSubmit={copilot.generate}>
          <div className="og-linker">
            <div className="og-linker-head"><span><RiGlobalLine aria-hidden="true" /> Campaña y destino</span><small>Obligatorio para crear borradores</small></div>
            <DataStatusBanner compact status={campaignLink.status} message={campaignLink.error || statusMessage(campaignLink.status, { live: 'Campañas reales disponibles para enlazar.', empty: 'Crea una campaña con landing para poder crear borradores.', demo: 'Modo demo explícito: las campañas no publicarán contenido real.' })} onRetry={campaignLink.status === 'error' || campaignLink.status === 'disconnected' ? campaignLink.reload : undefined} onAction={campaignLink.status === 'empty' ? () => window.location.assign('/captacion/planificar') : undefined} actionLabel="Crear campaña" />
            <div className="gs-form-grid">
              <label htmlFor="og-campaign">
                Campaña
                <select id="og-campaign" className="gs-select" value={selectedCampaignId} onChange={event => campaignLink.setSelectedCampaignId(event.target.value)} disabled={campaignLink.loading}>
                  <option value="">{campaignLink.loading ? 'Cargando campañas…' : 'Selecciona una campaña'}</option>
                  {campaignLink.campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}{campaign.landingSlug ? '' : ' · sin landing'}</option>)}
                </select>
              </label>
              <label htmlFor="og-cta">
                Llamada a la acción
                <input id="og-cta" className="gs-input" type="text" maxLength="160" value={campaignLink.cta} onChange={event => campaignLink.setCta(event.target.value)} placeholder="Ej. Reserva una demo" />
              </label>
            </div>
            {selectedCampaignId ? (
              selectedCampaign?.landingSlug
                ? <p className="og-destination is-ok"><RiCheckLine aria-hidden="true" /> Destino: <a href={`/l/${selectedCampaign.landingSlug}`} target="_blank" rel="noreferrer">/l/{selectedCampaign.landingSlug}</a><small>Se añadirán UTMs únicas para cada canal.</small></p>
                : <p className="og-destination is-warn"><RiAlertLine aria-hidden="true" /> Esta campaña aún no tiene landing. <Link to="/captacion/convertir?tab=landings">Crear landing <RiArrowRightLine /></Link></p>
            ) : null}
          </div>
          <label className="gs-field" htmlFor="og-brief">
            <span>Brief de contenido</span>
            <textarea id="og-brief" className="gs-textarea" value={copilot.prompt} onChange={event => copilot.setPrompt(event.target.value)} rows="3" placeholder="Cuéntale a la IA qué quieres conseguir…" />
          </label>
          <div className="gs-form-grid">
            <label htmlFor="og-tone">Tono<select id="og-tone" className="gs-select" value={copilot.tone} onChange={event => copilot.setTone(event.target.value)}><option value="cercano">Cercano</option><option value="experto">Experto</option><option value="inspirador">Inspirador</option><option value="directo">Directo</option></select></label>
            <label htmlFor="og-start">Fecha de inicio<input id="og-start" className="gs-input" type="date" value={copilot.startDate} onChange={event => copilot.setStartDate(event.target.value)} /></label>
          </div>
          <fieldset className="gs-fieldset">
            <legend>Canales de salida</legend>
            <ChannelPicker selected={copilot.channels} onToggle={copilot.toggleChannel} />
          </fieldset>
          <button className="gs-button primary" type="submit" disabled={copilot.loading || !copilot.prompt.trim() || !copilot.channels.length}>
            <RiSparkling2Line /> {copilot.loading ? 'Generando…' : 'Generar plan de contenido'}
          </button>
        </form>

        {copilot.plan ? (
          <div className="og-plan">
            <div className="og-plan-head">
              <div>
                <span className="gs-overline">{copilot.plan.generatedBy === 'fallback' ? 'Borrador automático · IA no disponible' : 'Plan generado con IA'}</span>
                <h3>{copilot.plan.title}</h3>
                <p>{copilot.plan.summary}</p>
              </div>
              <button className="gs-icon-button" type="button" aria-label="Descartar plan generado" onClick={copilot.clearPlan}><RiCloseLine /></button>
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
                        {copilot.postImages[index] ? <img src={copilot.postImages[index]} alt="Imagen del post" /> : null}
                        <label className={`gs-link${locked ? ' is-disabled' : ''}`}>
                          <RiImageAddLine /> {imageState === 'uploading' ? 'Subiendo…' : 'Subir imagen'}
                          <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={locked} onChange={event => { void copilot.uploadImage(event.target.files?.[0], index); event.target.value = '' }} />
                        </label>
                        <button type="button" className="gs-link" disabled={imageState === 'generating' || locked} onClick={() => copilot.generateImage(post, index)}><RiSparkling2Line /> {imageState === 'generating' ? 'Generando imagen…' : 'Generar imagen con IA'}</button>
                        {copilot.postImages[index] && !locked ? <button type="button" className="gs-link" onClick={() => copilot.removeImage(index)}><RiCloseLine /> Quitar</button> : null}
                      </div>
                    </div>
                    <button type="button" className="gs-button small" disabled={status === 'creating' || status === 'done' || creationBlocked || gated} title={creationBlocked ? 'Selecciona una campaña con landing para crear el borrador' : undefined} onClick={() => copilot.createDraft(post, index)}>
                      {status === 'done' ? <><RiCheckLine /> Creado</> : status === 'creating' ? 'Creando…' : 'Crear borrador'}
                    </button>
                  </article>
                )
              })}
            </div>
          </div>
        ) : null}
        <div className="og-copilot-foot"><span><RiGlobalLine /> Cada borrador incluye la landing y UTMs de su campaña.</span><span><RiTimeLine /> Las fechas son sugerencias, ajústalas desde el calendario de Metricool.</span></div>
      </div>
    </section>
  )
}
