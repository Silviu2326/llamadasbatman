import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import PageLoadingState from '../components/ui/PageLoadingState'
import './studio-review.css'

function timecode(ms) {
  const seconds = Math.max(0, Math.floor(Number(ms || 0) / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export default function PublicStudioReviewPage() {
  const { token } = useParams()
  const videoRef = useRef(null)
  const [state, setState] = useState('loading')
  const [review, setReview] = useState(null)
  const [currentMs, setCurrentMs] = useState(0)
  const [form, setForm] = useState({ authorName: '', body: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endpoint = `/api/public/studio-review/${encodeURIComponent(token || '')}`

  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, referrerPolicy: 'no-referrer' })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body) return setState('missing')
      setReview(body); setState('ready')
    } catch { setState('error') }
  }, [endpoint])

  useEffect(() => { if (token) void load(); else setState('missing') }, [load, token])

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch(`${endpoint}/comments`, {
        method: 'POST', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ timecodeMs: currentMs, body: form.body.trim(), ...(form.authorName.trim() ? { authorName: form.authorName.trim() } : {}) }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'No se pudo guardar el comentario.')
      setForm(current => ({ ...current, body: '' })); await load()
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }

  if (state === 'loading') return <PageLoadingState label="Cargando sala de revisión" />
  if (state !== 'ready') return <main className="studio-review-state"><h1>Sala no disponible</h1><p>El enlace puede haber caducado o sido revocado. Solicita uno nuevo al equipo.</p></main>

  return <main className="studio-review-page">
    <header><span>STUDIO · REVISIÓN</span><h1>{review.production.title}</h1><p>Reproduce el master, pausa donde quieras y deja una nota asociada a ese instante.</p></header>
    <section className="studio-review-grid">
      <div className="studio-review-player">
        <video ref={videoRef} controls preload="metadata" referrerPolicy="no-referrer" src={review.asset.url} onTimeUpdate={event => setCurrentMs(Math.round(event.currentTarget.currentTime * 1000))} />
        <form onSubmit={submit}>
          <strong>{timecode(currentMs)}</strong>
          <input aria-label="Tu nombre" placeholder="Tu nombre (opcional)" maxLength={80} value={form.authorName} onChange={event => setForm(current => ({ ...current, authorName: event.target.value }))} />
          <textarea aria-label="Comentario" required rows={3} maxLength={2000} placeholder="¿Qué debería cambiar aquí?" value={form.body} onChange={event => setForm(current => ({ ...current, body: event.target.value }))} />
          {error ? <p role="alert">{error}</p> : null}
          <button disabled={busy || !form.body.trim()}>{busy ? 'Guardando…' : `Comentar en ${timecode(currentMs)}`}</button>
        </form>
      </div>
      <aside><h2>Notas ({review.comments.length})</h2>{review.comments.length === 0 ? <p>Aún no hay comentarios.</p> : review.comments.map(comment => <button key={comment.id} className={comment.status === 'resolved' ? 'resolved' : ''} onClick={() => { if (videoRef.current) { videoRef.current.currentTime = comment.timecodeMs / 1000; videoRef.current.play().catch(() => undefined) } }}><strong>{timecode(comment.timecodeMs)}</strong><span>{comment.body}</span><small>{comment.authorName || 'Invitado'}{comment.status === 'resolved' ? ' · Resuelto' : ''}</small></button>)}</aside>
    </section>
  </main>
}
