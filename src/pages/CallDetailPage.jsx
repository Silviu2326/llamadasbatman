import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { RiArrowLeftLine, RiCheckLine, RiCloseLine, RiDownload2Line, RiEdit2Line, RiFileCopyLine, RiMailSendLine, RiPauseLine, RiPhoneLine, RiPlayLine, RiSearchLine, RiSendPlaneLine, RiStarFill, RiStarLine, RiTimeLine, RiAddLine } from 'react-icons/ri'
import '../dashboard.css'
import './call-detail.css'
import './sales-detail-standard.css'
import { getLocale, localeCode, useI18n } from '../i18n'
import { MicroappProjectionPanel, MicroappSurfaceActions } from '../components/MicroappSurfaceActions'
import PageLoadingState from '../components/ui/PageLoadingState'

const TABS = ['Resumen', 'Transcripción', 'Notas']

function formatDuration(seconds) {
  if (seconds == null) return '—'
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

function normalizeTranscript(value) {
  if (Array.isArray(value)) return value.map((item, index) => ({ agent: Boolean(item.agent ?? item.speaker === 'agent'), time: item.time || item.timestamp || '', text: item.text || item.content || '' })).filter(item => item.text)
  if (typeof value === 'string' && value.trim()) return [{ agent: false, time: '', text: value }]
  return []
}

function Avatar({ call, size = 54 }) {
  return <div className="detail-avatar" style={{ '--avatar': call.bg, width: size, height: size, fontSize: size * .34 }}>{call.initials}</div>
}

function Transcript({ call, query, onlyAgent }) {
  const { t } = useI18n()
  const messages = call.transcript.filter(item => (!onlyAgent || item.agent) && (!query || item.text.toLowerCase().includes(query.toLowerCase())))
  if (!messages.length) return <div className="detail-empty-state"><RiSearchLine /><strong>{call.transcript.length ? t('common.noResults') : 'No hay transcripción disponible'}</strong><span>{call.transcript.length ? 'Prueba con otro término.' : 'La transcripción estará disponible cuando termine de procesarse la llamada.'}</span></div>
  return <div className="detail-transcript" data-i18n-skip>{messages.map((message, index) => <article className={`detail-message ${message.agent ? 'agent' : 'contact'}`} key={`${message.time}-${index}`}>{message.agent && <div className="detail-message-avatar">IA</div>}<div className="detail-message-body"><div className="detail-message-bubble"><p>{message.text}</p></div><span>{message.time} · {message.agent ? call.agent : call.name}</span></div>{!message.agent && <Avatar call={call} size={28} />}</article>)}</div>
}

function Player({ recordingUrl }) {
  const { t } = useI18n()
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  if (!recordingUrl) return <div className="detail-empty-state"><RiPhoneLine /><strong>{t('details.noRecording')}</strong><span>{t('details.noRecordingText')}</span></div>
  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }
    try {
      await audio.play()
      setPlaying(true)
    } catch {
      setPlaying(false)
    }
  }
  return <div className="detail-player"><audio ref={audioRef} src={recordingUrl} preload="metadata" onLoadedMetadata={event => setDuration(event.currentTarget.duration)} onTimeUpdate={event => setCurrent(event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} /><button className="detail-play" onClick={togglePlayback} aria-label={playing ? 'Pausar llamada' : 'Reproducir llamada'}>{playing ? <RiPauseLine /> : <RiPlayLine />}</button><span className="detail-player-time">{formatDuration(Math.floor(current))}</span><input className="detail-player-range" type="range" min="0" max={duration || 0} value={current} onChange={event => { const value = Number(event.target.value); setCurrent(value); if (audioRef.current) audioRef.current.currentTime = value }} aria-label="Posición de la grabación" /><span className="detail-player-time">{formatDuration(Math.floor(duration))}</span><a className="detail-download" href={recordingUrl} target="_blank" rel="noreferrer" aria-label="Descargar audio"><RiDownload2Line /></a></div>
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
  const [tasks, setTasks] = useState([])
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [transcriptQuery, setTranscriptQuery] = useState('')
  const [onlyAgent, setOnlyAgent] = useState(false)

  useEffect(() => { let active = true; apiFetch(`/api/calls/${id}`).then(response => { if (!response.ok) throw new Error(); return response.json() }).then(data => { if (!active) return; const duration = data.durationSeconds; setCall({ id: data.id, name: data.lead?.name || 'Contacto', initials: (data.lead?.name || 'CO').split(' ').map(word => word[0]).slice(0, 2).join('').toUpperCase(), bg: 'var(--accent)', company: data.lead?.company || 'Sin empresa', role: data.lead?.role || '', time: data.startedAt ? new Date(data.startedAt).toLocaleString(localeCode(getLocale())) : 'Sin fecha', dur: formatDuration(duration), status: data.outcome || 'Sin resultado', score: data.sentimentScore, sentiment: data.sentiment, summary: data.summary, agent: data.agent?.name || 'Sin agente', recordingUrl: data.recordingUrl, transcript: normalizeTranscript(data.transcript), metrics: data.metrics || {} }); setStarred(Boolean(data.isFavorite)) }).catch(() => { if (active) setError('No se pudo cargar la llamada. Revisa la conexión.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [id])
  useEffect(() => { apiFetch(`/api/calls/${id}/notes`).then(response => response.ok ? response.json() : []).then(value => setNotes(Array.isArray(value) ? value : [])).catch(() => {}) }, [id])
  useEffect(() => { apiFetch(`/api/calls/${id}/tasks`).then(response => response.ok ? response.json() : []).then(value => setTasks(Array.isArray(value) ? value : [])).catch(() => {}) }, [id])

  // Sin try/catch, un fallo de red dejaba el rechazo sin gestionar: el botón no
  // hacía nada y el usuario no veía ningún aviso.
  const toggleFavorite = async () => { try { const response = await apiFetch(`/api/calls/${id}/favorite`, { method: 'POST' }); if (response.ok) { const data = await response.json(); setStarred(Boolean(data.isFavorite)) } else setError('No se pudo actualizar favoritos.') } catch { setError('No se pudo actualizar favoritos. Revisa la conexión.') } }
  const addNote = async () => { if (!newNote.trim()) return; try { const response = await apiFetch(`/api/calls/${id}/notes`, { method: 'POST', body: JSON.stringify({ text: newNote.trim() }) }); if (!response.ok) { setError('No se pudo guardar la nota.'); return }; const created = await response.json(); setNotes(list => [created, ...list]); setNewNote(''); setError('') } catch { setError('No se pudo guardar la nota. Revisa la conexión.') } }
  const deleteNote = async noteId => { try { const response = await apiFetch(`/api/calls/${id}/notes/${noteId}`, { method: 'DELETE' }); if (response.ok) setNotes(list => list.filter(item => item.id !== noteId)); else setError('No se pudo eliminar la nota.') } catch { setError('No se pudo eliminar la nota. Revisa la conexión.') } }
  const toggleTask = async task => { try { const response = await apiFetch(`/api/calls/${id}/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify({ done: !task.done }) }); if (response.ok) setTasks(list => list.map(item => item.id === task.id ? { ...item, done: !item.done } : item)); else setError('No se pudo actualizar la acción.') } catch { setError('No se pudo actualizar la acción. Revisa la conexión.') } }
  const copySummary = async () => { if (!call) return; try { await navigator.clipboard?.writeText(`${call.name} · ${call.company}\n${call.summary || 'Sin resumen disponible'}`) } catch { setError('No se pudo copiar el resumen.') } }

  if (loading) return <PageLoadingState label={t('details.loadingCall')} />
  if (!call) return <div className="detail-loading" role="alert"><span>{error || t('details.noCall')}</span></div>
  const metricEntries = Object.entries(call.metrics).filter(([, value]) => value != null && value !== '')

  return <main className="call-detail-page dark-scroll"><div className="detail-topbar"><button className="detail-back" onClick={() => navigate(`/llamadas${window.location.search}`)}><RiArrowLeftLine /> Volver a llamadas</button><div className="detail-top-actions"><MicroappSurfaceActions surface="call" entityId={id} /><button className={`detail-utility-action ${starred ? 'is-starred' : ''}`} onClick={toggleFavorite} aria-label={starred ? 'Quitar de destacadas' : 'Destacar llamada'} title={starred ? 'Quitar de destacadas' : 'Destacar llamada'}>{starred ? <RiStarFill /> : <RiStarLine />}</button><button className="detail-utility-action" onClick={copySummary} aria-label="Copiar resumen" title="Copiar resumen"><RiFileCopyLine /></button><button className="detail-note-action" onClick={() => setTab('Notas')}><RiEdit2Line /> Añadir nota</button></div></div><MicroappProjectionPanel surface="call" entityId={id} />
    {error && <div className="detail-empty-state" role="alert"><RiCloseLine /><span>{error}</span></div>}
    <section className="detail-hero"><div className="detail-hero-main"><Avatar call={call} /><div className="detail-hero-copy"><div className="detail-name-line"><h1>{call.name}</h1><span className="detail-status">{call.status}</span></div><p>{call.company} · {call.role}</p><div className="detail-facts"><span><RiPhoneLine /><b>{call.agent}</b><small>Agente</small></span><span><RiTimeLine /><b>{call.dur}</b><small>Duración</small></span><span><RiTimeLine /><b>{call.time}</b><small>Hora</small></span></div></div></div>{call.score != null && <div className="detail-score"><span>Sentimiento</span><strong>{call.score}</strong></div>}</section>
    <section className="detail-player-section"><div className="detail-section-heading"><div><h2>Grabación de la llamada</h2><p>Reproduce el audio original cuando está disponible.</p></div></div><Player recordingUrl={call.recordingUrl} /></section>
    <section className="detail-layout"><div className="detail-main-panel"><nav className="detail-tabs" aria-label="Secciones del detalle">{TABS.map(value => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{value}</button>)}</nav>{tab === 'Resumen' && <div className="detail-summary-grid"><article className="detail-summary-card detail-summary-wide"><div className="detail-card-heading"><h2>Resumen de la llamada</h2></div><p>{call.summary || 'No hay resumen disponible para esta llamada.'}</p></article>{metricEntries.length > 0 && <article className="detail-summary-card"><div className="detail-card-heading"><h2>Métricas disponibles</h2></div>{metricEntries.map(([label, value]) => <div className="detail-stat-row" key={label}><span>{label}</span><strong>{String(value)}</strong></div>)}</article>}</div>}{tab === 'Transcripción' && <div className="detail-transcript-wrap"><div className="detail-transcript-toolbar"><div><RiSearchLine /><input value={transcriptQuery} onChange={event => setTranscriptQuery(event.target.value)} placeholder="Buscar en la transcripción…" aria-label="Buscar en la transcripción" /></div><button className={onlyAgent ? 'active' : ''} onClick={() => setOnlyAgent(value => !value)}>Solo IA</button></div><Transcript call={call} query={transcriptQuery} onlyAgent={onlyAgent} /></div>}{tab === 'Notas' && <div className="detail-notes"><div className="detail-notes-heading"><h2>Notas de esta llamada</h2><span>{notes.length} notas</span></div><textarea value={newNote} onChange={event => setNewNote(event.target.value)} placeholder="Añade contexto…" /><button className="calls-button primary" onClick={addNote}><RiCheckLine /> Guardar nota</button><div>{notes.map(item => <article key={item.id}><p>{item.text}</p><small>{item.authorName || 'Equipo'} · {item.createdAt ? new Date(item.createdAt).toLocaleString(localeCode(getLocale())) : ''}</small><button onClick={() => deleteNote(item.id)} aria-label="Eliminar nota"><RiCloseLine /></button></article>)}</div></div>}</div><aside className="detail-sidebar"><section className="detail-side-card"><div className="detail-card-heading"><h2>Próximas acciones</h2><RiCheckLine /></div>{tasks.length ? <div className="detail-tasks">{tasks.map(item => <button key={item.id} className={item.done ? 'done' : ''} onClick={() => toggleTask(item)}><i>{item.done && <RiCheckLine />}</i><span>{item.title}</span></button>)}</div> : <div className="detail-empty-state"><span>No hay acciones registradas.</span></div>}</section><section className="detail-side-card"><button className="detail-add-action" onClick={() => setTab('Notas')}><RiSendPlaneLine /> Añadir contexto en notas</button></section></aside></section>
  </main>
}
