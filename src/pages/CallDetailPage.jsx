import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { RiArrowLeftLine, RiCheckLine, RiCloseLine, RiEdit2Line, RiFileCopyLine, RiMailSendLine, RiPhoneLine, RiSearchLine, RiSendPlaneLine, RiStarFill, RiStarLine, RiTimeLine, RiAddLine } from 'react-icons/ri'
import '../dashboard.css'
import './call-detail.css'
import './sales-detail-standard.css'
import { getLocale, localeCode, useI18n } from '../i18n'
import { MicroappProjectionPanel, MicroappSurfaceActions } from '../components/MicroappSurfaceActions'
import { readSalesCollection } from '../lib/salesWorkspace'
import SalesContactAction from '../components/SalesContactAction'
import SalesTaskModal from '../modals/SalesTaskModal'
import PageLoadingState from '../components/ui/PageLoadingState'
import CallRecordingPlayer from '../components/CallRecordingPlayer'
import { EDITABLE_OUTCOMES, displayOutcome, outcomeLabel } from '../lib/callOutcome'

const TABS = ['Resumen', 'Transcripción', 'Notas']

function formatDuration(seconds) {
  if (seconds == null) return '—'
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

function formatClock(ms) {
  if (!Number.isFinite(ms)) return ''
  const total = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const AGENT_ROLES = new Set(['agente', 'assistant', 'agent', 'ia'])

/**
 * Turnos con rol y tiempo. Primero `transcriptTurns` (JSON del backend); si
 * solo hay texto plano "rol: texto", se parte por líneas y se lee el rol de
 * cada una en vez de meter toda la llamada en una burbuja del contacto.
 */
function normalizeTranscript(turns, plain) {
  if (Array.isArray(turns) && turns.length) {
    return turns
      .map(item => ({ agent: AGENT_ROLES.has(String(item.role ?? item.speaker ?? '').toLowerCase()) || Boolean(item.agent), time: formatClock(Number(item.atMs)), text: String(item.text ?? item.content ?? '').trim() }))
      .filter(item => item.text)
  }
  if (typeof plain === 'string' && plain.trim()) {
    return plain.split('\n').map(line => {
      const separator = line.indexOf(':')
      const role = separator > 0 ? line.slice(0, separator).trim().toLowerCase() : ''
      const known = AGENT_ROLES.has(role) || ['prospecto', 'cliente', 'user', 'usuario', 'lead'].includes(role)
      return { agent: AGENT_ROLES.has(role), time: '', text: (known ? line.slice(separator + 1) : line).trim() }
    }).filter(item => item.text)
  }
  return []
}

const DIMENSION_LABELS = { turnTaking: 'Turnos', greeting: 'Saludo', voiceNaturalness: 'Naturalidad', discovery: 'Descubrimiento', objectionHandling: 'Objeciones', closing: 'Cierre', compliance: 'Cumplimiento', crmAccuracy: 'Registro en CRM' }
const CRITICAL_LABELS = { assistant_spoke_after_opt_out: 'El agente siguió hablando tras el opt-out', no_prospect_turns: 'El contacto no habló en ningún momento' }
const METRIC_LABELS = { durationSeconds: 'Duración (s)', agentTurns: 'Turnos del agente', prospectTurns: 'Turnos del contacto', sentimentScore: 'Sentimiento' }
const formatDate = value => value ? new Date(value).toLocaleString(localeCode(getLocale()), { dateStyle: 'medium', timeStyle: 'short' }) : null
const toLocalInput = value => { if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const pad = n => String(n).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}` }

function Avatar({ call, size = 54 }) {
  return <div className="detail-avatar" style={{ '--avatar': call.bg, width: size, height: size, fontSize: size * .34 }}>{call.initials}</div>
}

function Transcript({ call, query, onlyAgent }) {
  const { t } = useI18n()
  const messages = call.transcript.filter(item => (!onlyAgent || item.agent) && (!query || item.text.toLowerCase().includes(query.toLowerCase())))
  if (!messages.length) return <div className="detail-empty-state"><RiSearchLine /><strong>{call.transcript.length ? t('common.noResults') : 'No hay transcripción disponible'}</strong><span>{call.transcript.length ? 'Prueba con otro término.' : 'La transcripción estará disponible cuando termine de procesarse la llamada.'}</span></div>
  return <div className="detail-transcript" data-i18n-skip>{messages.map((message, index) => <article className={`detail-message ${message.agent ? 'agent' : 'contact'}`} key={`${message.time}-${index}`}>{message.agent && <div className="detail-message-avatar">IA</div>}<div className="detail-message-body"><div className="detail-message-bubble"><p>{message.text}</p></div><span>{message.time ? `${message.time} · ` : ''}{message.agent ? `${call.agent} (agente)` : `${call.name} (contacto)`}</span></div>{!message.agent && <Avatar call={call} size={28} />}</article>)}</div>
}

/** Resultado editable: selector + fechas acordadas, guardado con PATCH /api/calls/:id. */
function OutcomeEditor({ call, onSaved, onError }) {
  const [outcome, setOutcome] = useState(call.outcome || 'none')
  const [meetingAt, setMeetingAt] = useState(toLocalInput(call.meetingAt))
  const [callbackAt, setCallbackAt] = useState(toLocalInput(call.callbackAt))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { setOutcome(call.outcome || 'none'); setMeetingAt(toLocalInput(call.meetingAt)); setCallbackAt(toLocalInput(call.callbackAt)) }, [call.outcome, call.meetingAt, call.callbackAt])
  const dirty = outcome !== (call.outcome || 'none') || meetingAt !== toLocalInput(call.meetingAt) || callbackAt !== toLocalInput(call.callbackAt)
  const save = async () => {
    setSaving(true); setMessage('')
    const body = {}
    if (outcome !== (call.outcome || 'none')) body.outcome = outcome
    if (meetingAt !== toLocalInput(call.meetingAt)) body.meetingAt = meetingAt ? new Date(meetingAt).toISOString() : null
    if (callbackAt !== toLocalInput(call.callbackAt)) body.callbackAt = callbackAt ? new Date(callbackAt).toISOString() : null
    try {
      const response = await apiFetch(`/api/calls/${call.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      if (!response.ok) { const data = await response.json().catch(() => ({})); onError(data.error || 'No se pudo guardar el resultado.'); return }
      const data = await response.json()
      const effects = data.effects || {}
      const notes = [effects.leadStatus ? `contacto → ${effects.leadStatus}` : null, effects.meetingCreated ? 'reunión creada' : null, effects.taskCreated ? 'tarea de seguimiento creada' : null].filter(Boolean)
      setMessage(`Resultado guardado${notes.length ? ` · ${notes.join(' · ')}` : ''}.`)
      onSaved(data)
    } catch { onError('No se pudo guardar el resultado. Revisa la conexión.') } finally { setSaving(false) }
  }
  return <article className="detail-summary-card"><div className="detail-card-heading"><h2>Resultado</h2></div>
    <label className="detail-stat-row"><span>Resultado</span><select value={outcome} onChange={event => setOutcome(event.target.value)} aria-label="Resultado de la llamada">{EDITABLE_OUTCOMES.map(value => <option key={value} value={value}>{outcomeLabel(value)}</option>)}</select></label>
    {outcome === 'meeting_scheduled' && <label className="detail-stat-row"><span>Reunión</span><input type="datetime-local" value={meetingAt} onChange={event => setMeetingAt(event.target.value)} aria-label="Fecha de la reunión" /></label>}
    {outcome === 'callback_requested' && <label className="detail-stat-row"><span>Volver a llamar</span><input type="datetime-local" value={callbackAt} onChange={event => setCallbackAt(event.target.value)} aria-label="Fecha para volver a llamar" /></label>}
    {call.sentiment && <div className="detail-stat-row"><span>Sentimiento</span><strong>{call.sentiment}</strong></div>}
    <button className="calls-button primary" onClick={save} disabled={!dirty || saving}><RiCheckLine /> {saving ? 'Guardando…' : 'Guardar resultado'}</button>
    {message && <p role="status">{message}</p>}
  </article>
}

function EvaluationCard({ evaluation }) {
  if (!evaluation) return <article className="detail-summary-card"><div className="detail-card-heading"><h2>Evaluación</h2></div><p>Esta llamada aún no tiene evaluación.</p></article>
  const dimensions = Object.entries(evaluation.dimensions || {}).filter(([, value]) => value != null)
  const critical = Array.isArray(evaluation.criticalErrors) ? evaluation.criticalErrors : []
  return <article className="detail-summary-card"><div className="detail-card-heading"><h2>Evaluación</h2></div>
    <div className="detail-stat-row"><span>Puntuación</span><strong>{evaluation.overall ?? '—'}/100 · {evaluation.approved ? 'aprobada' : 'no aprobada'}</strong></div>
    {evaluation.trainingTag && <div className="detail-stat-row"><span>Etiqueta</span><strong>{evaluation.trainingTag}</strong></div>}
    {dimensions.map(([key, value]) => <div className="detail-stat-row" key={key}><span>{DIMENSION_LABELS[key] || key}</span><strong>{value}</strong></div>)}
    {critical.length > 0 && <p role="alert">{critical.map(code => CRITICAL_LABELS[code] || code).join(' · ')}</p>}
  </article>
}

export default function CallDetailPage() {
  const { t } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const [call, setCall] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('Resumen')
  const [starred, setStarred] = useState(false)
  const [opportunities, setOpportunities] = useState(null)
  const [opportunityError, setOpportunityError] = useState('')
  const [contactAction, setContactAction] = useState(null)
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [followUpMessage, setFollowUpMessage] = useState('')
  const [tasks, setTasks] = useState([])
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [transcriptQuery, setTranscriptQuery] = useState('')
  const [onlyAgent, setOnlyAgent] = useState(false)

  const mapCall = data => { const duration = data.durationSeconds; return { id: data.id, leadId: data.leadId || data.lead?.id, agentId: data.agentId || data.agent?.id, name: data.lead?.name || 'Contacto', initials: (data.lead?.name || 'CO').split(' ').map(word => word[0]).slice(0, 2).join('').toUpperCase(), bg: 'var(--accent)', company: data.lead?.company || 'Sin empresa', role: data.lead?.role || '', time: data.startedAt ? new Date(data.startedAt).toLocaleString(localeCode(getLocale())) : 'Sin fecha', dur: formatDuration(duration), outcome: displayOutcome(data), status: outcomeLabel(displayOutcome(data)), callStatus: data.status || null, isTest: Boolean(data.isTest), score: data.sentimentScore, sentiment: data.sentiment, summary: data.summary, callbackAt: data.callbackAt, meetingAt: data.meetingAt, agent: data.agent?.name || 'Sin agente', recordingUrl: data.recordingUrl, transcript: normalizeTranscript(data.transcriptTurns, data.transcript), metrics: data.metrics || {}, evaluation: data.evaluation || null } }
  useEffect(() => { let active = true; apiFetch(`/api/calls/${id}`).then(response => { if (!response.ok) throw new Error(); return response.json() }).then(data => { if (!active) return; setCall(mapCall(data)); setStarred(Boolean(data.isFavorite)) }).catch(() => { if (active) setError('No se pudo cargar la llamada. Revisa la conexión.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [id])
  const applySavedResult = data => { setCall(current => current ? { ...current, outcome: data.outcome || current.outcome, status: outcomeLabel(data.outcome || current.outcome), summary: data.summary ?? current.summary, callbackAt: data.callbackAt ?? null, meetingAt: data.meetingAt ?? null } : current); setError(''); apiFetch(`/api/calls/${id}/tasks`).then(response => response.ok ? response.json() : []).then(value => setTasks(Array.isArray(value) ? value : [])).catch(() => {}) }
  useEffect(() => { apiFetch(`/api/calls/${id}/notes`).then(response => response.ok ? response.json() : []).then(value => setNotes(Array.isArray(value) ? value : [])).catch(() => {}) }, [id])
  useEffect(() => { apiFetch(`/api/calls/${id}/tasks`).then(response => response.ok ? response.json() : []).then(value => setTasks(Array.isArray(value) ? value : [])).catch(() => {}) }, [id])

  useEffect(() => {
    setOpportunities(null); setOpportunityError('')
    if (!call?.leadId) return
    const controller = new AbortController()
    readSalesCollection(apiFetch, `/api/pipeline/list?leadId=${encodeURIComponent(call.leadId)}`, { signal: controller.signal })
      .then(items => { if (!controller.signal.aborted) setOpportunities(items) })
      .catch(() => { if (!controller.signal.aborted) setOpportunityError('No se pudieron consultar las oportunidades. Revisa tus permisos o abre el CRM.') })
    return () => controller.abort()
  }, [call?.leadId])

  // Sin try/catch, un fallo de red dejaba el rechazo sin gestionar: el botón no
  // hacía nada y el usuario no veía ningún aviso.
  const toggleFavorite = async () => { try { const response = await apiFetch(`/api/calls/${id}/favorite`, { method: 'POST' }); if (response.ok) { const data = await response.json(); setStarred(Boolean(data.isFavorite)) } else setError('No se pudo actualizar favoritos.') } catch { setError('No se pudo actualizar favoritos. Revisa la conexión.') } }
  const addNote = async () => { if (!newNote.trim()) return; try { const response = await apiFetch(`/api/calls/${id}/notes`, { method: 'POST', body: JSON.stringify({ text: newNote.trim() }) }); if (!response.ok) { setError('No se pudo guardar la nota.'); return }; const created = await response.json(); setNotes(list => [created, ...list]); setNewNote(''); setError('') } catch { setError('No se pudo guardar la nota. Revisa la conexión.') } }
  const deleteNote = async noteId => { try { const response = await apiFetch(`/api/calls/${id}/notes/${noteId}`, { method: 'DELETE' }); if (response.ok) setNotes(list => list.filter(item => item.id !== noteId)); else setError('No se pudo eliminar la nota.') } catch { setError('No se pudo eliminar la nota. Revisa la conexión.') } }
  const toggleTask = async task => { try { const response = await apiFetch(`/api/calls/${id}/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify({ done: !task.done }) }); if (response.ok) setTasks(list => list.map(item => item.id === task.id ? { ...item, done: !item.done } : item)); else setError('No se pudo actualizar la acción.') } catch { setError('No se pudo actualizar la acción. Revisa la conexión.') } }
  const copySummary = async () => { if (!call) return; try { await navigator.clipboard?.writeText(`${call.name} · ${call.company}\n${call.summary || 'Sin resumen disponible'}`) } catch { setError('No se pudo copiar el resumen.') } }

  if (loading) return <PageLoadingState label={t('details.loadingCall')} />
  if (!call) return <div className="detail-loading" role="alert"><span>{error || t('details.noCall')}</span></div>
  const metricEntries = Object.entries(call.metrics).filter(([, value]) => value != null && value !== '').map(([key, value]) => [METRIC_LABELS[key] || key, value])

  return <main className="call-detail-page dark-scroll">{contactAction && <SalesContactAction record={{ id: call.leadId, entity: 'lead', title: call.name }} action={contactAction} onClose={() => setContactAction(null)} />}{showFollowUp && <SalesTaskModal opportunities={opportunities || []} leadId={call.leadId} onClose={() => setShowFollowUp(false)} onSuccess={() => setFollowUpMessage('Seguimiento guardado. Puedes consultarlo y completarlo en el calendario.')} />}{followUpMessage && <p role="status">{followUpMessage} <button onClick={() => navigate('/calendario')}>Abrir calendario</button></p>}<div className="detail-topbar"><button className="detail-back" onClick={() => navigate(`/llamadas${window.location.search}`)}><RiArrowLeftLine /> Volver a llamadas</button><div className="detail-top-actions">{call.leadId && <><button className="detail-utility-action" onClick={() => navigate(`/ventas/lead/${call.leadId}`)}>Ver contacto</button><button className="detail-utility-action" onClick={() => setContactAction('meeting')}>Programar reunión</button><button className="detail-utility-action" onClick={() => setContactAction('call')}>Volver a llamar</button><button className="detail-note-action" onClick={() => setShowFollowUp(true)}>Programar seguimiento</button></>}{call.agentId && <button className="detail-utility-action" onClick={() => navigate(`/agentes/${call.agentId}`)}>Ver agente</button>}<MicroappSurfaceActions surface="call" entityId={id} /><button className={`detail-utility-action ${starred ? 'is-starred' : ''}`} onClick={toggleFavorite} aria-label={starred ? 'Quitar de destacadas' : 'Destacar llamada'} title={starred ? 'Quitar de destacadas' : 'Destacar llamada'}>{starred ? <RiStarFill /> : <RiStarLine />}</button><button className="detail-utility-action" onClick={copySummary} aria-label="Copiar resumen" title="Copiar resumen"><RiFileCopyLine /></button><button className="detail-note-action" onClick={() => setTab('Notas')}><RiEdit2Line /> Añadir nota</button></div></div><MicroappProjectionPanel surface="call" entityId={id} />
    {error && <div className="detail-empty-state" role="alert"><RiCloseLine /><span>{error}</span></div>}
    <section className="detail-hero"><div className="detail-hero-main"><Avatar call={call} /><div className="detail-hero-copy"><div className="detail-name-line"><h1>{call.name}</h1><span className="detail-status">{call.status}</span>{call.isTest && <span className="detail-status">Prueba</span>}</div><p>{call.company} · {call.role}</p><div className="detail-facts"><span><RiPhoneLine /><b>{call.agent}</b><small>Agente</small></span><span><RiTimeLine /><b>{call.dur}</b><small>Duración</small></span><span><RiTimeLine /><b>{call.time}</b><small>Hora</small></span>{call.meetingAt && <span><RiTimeLine /><b>{formatDate(call.meetingAt)}</b><small>Reunión acordada</small></span>}{call.callbackAt && <span><RiTimeLine /><b>{formatDate(call.callbackAt)}</b><small>Volver a llamar</small></span>}</div></div></div>{call.score != null && <div className="detail-score"><span>Sentimiento</span><strong>{call.score}</strong></div>}</section>
    <section className="detail-player-section"><div className="detail-section-heading"><div><h2>Grabación de la llamada</h2><p>Reproduce el audio original cuando está disponible.</p></div></div><CallRecordingPlayer recordingUrl={call.recordingUrl} /></section>
    <section className="detail-layout"><div className="detail-main-panel"><nav className="detail-tabs" aria-label="Secciones del detalle">{TABS.map(value => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{value}</button>)}</nav>{tab === 'Resumen' && <div className="detail-summary-grid"><article className="detail-summary-card detail-summary-wide"><div className="detail-card-heading"><h2>Resumen de la llamada</h2></div><p>{call.summary || 'No hay resumen disponible para esta llamada.'}</p></article><OutcomeEditor call={call} onSaved={applySavedResult} onError={setError} /><EvaluationCard evaluation={call.evaluation} />{metricEntries.length > 0 && <article className="detail-summary-card"><div className="detail-card-heading"><h2>Métricas disponibles</h2></div>{metricEntries.map(([label, value]) => <div className="detail-stat-row" key={label}><span>{label}</span><strong>{String(value)}</strong></div>)}</article>}</div>}{tab === 'Transcripción' && <div className="detail-transcript-wrap"><div className="detail-transcript-toolbar"><div><RiSearchLine /><input value={transcriptQuery} onChange={event => setTranscriptQuery(event.target.value)} placeholder="Buscar en la transcripción…" aria-label="Buscar en la transcripción" /></div><button className={onlyAgent ? 'active' : ''} aria-pressed={onlyAgent} onClick={() => setOnlyAgent(value => !value)}>Solo agente</button></div><Transcript call={call} query={transcriptQuery} onlyAgent={onlyAgent} /></div>}{tab === 'Notas' && <div className="detail-notes"><div className="detail-notes-heading"><h2>Notas de esta llamada</h2><span>{notes.length} notas</span></div><textarea value={newNote} onChange={event => setNewNote(event.target.value)} placeholder="Añade contexto…" /><button className="calls-button primary" onClick={addNote}><RiCheckLine /> Guardar nota</button><div>{notes.map(item => <article key={item.id}><p>{item.text}</p><small>{item.authorName || 'Equipo'} · {item.createdAt ? new Date(item.createdAt).toLocaleString(localeCode(getLocale())) : ''}</small><button onClick={() => deleteNote(item.id)} aria-label="Eliminar nota"><RiCloseLine /></button></article>)}</div></div>}</div><aside className="detail-sidebar">{call.leadId && <section className="detail-side-card"><h2>Oportunidades del contacto</h2>{opportunityError ? <p role="status">{opportunityError}</p> : !opportunities ? <p>Cargando oportunidades…</p> : opportunities.length ? opportunities.map(item => <button key={item.id} className="detail-add-action" onClick={() => navigate(`/ventas/opportunity/${item.id}`)}>{item.name}</button>) : <p>No hay oportunidades vinculadas a este contacto.</p>}</section>}<section className="detail-side-card"><div className="detail-card-heading"><h2>Próximas acciones</h2><RiCheckLine /></div>{tasks.length ? <div className="detail-tasks">{tasks.map(item => <button key={item.id} className={item.done ? 'done' : ''} onClick={() => toggleTask(item)}><i>{item.done && <RiCheckLine />}</i><span>{item.title}</span></button>)}</div> : <div className="detail-empty-state"><span>No hay acciones registradas.</span></div>}</section><section className="detail-side-card"><button className="detail-add-action" onClick={() => setTab('Notas')}><RiSendPlaneLine /> Añadir contexto en notas</button></section></aside></section>
  </main>
}
