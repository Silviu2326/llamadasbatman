import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { RiCheckLine, RiCloseLine, RiLoader4Line } from 'react-icons/ri'
import PageLoadingState from '../components/ui/PageLoadingState'
import './content-approval.css'

/**
 * Sala de aprobación para el cliente de una agencia — `roadmap.md` fase 3.
 *
 * Sin login: la autorización es el token de la URL. Y sin CRM: aquí solo se ve
 * lo que se va a publicar, se comenta y se decide. No hay Radar, ni evidencias
 * internas, ni Resultados; ese material es del negocio, no de quien da el visto
 * bueno.
 *
 * Aprobar aquí **no publica**: deja la pieza aprobada para que la agencia cree
 * el borrador. Publicar consume su integración y es decisión suya.
 */

const FORMAT_LABEL = {
  post: 'Post',
  carousel: 'Carrusel',
  reel_script: 'Guion de Reel',
  stories: '3 stories',
  email: 'Email',
  voiceover: 'Locución',
}

const REJECTION_LABEL = {
  no_suena_a_nosotros: 'No suena a nosotros',
  dato_incorrecto: 'Hay un dato incorrecto',
  no_es_prioridad: 'No es prioridad ahora',
  ya_lo_hemos_contado: 'Ya lo hemos contado',
  demasiado_generico: 'Demasiado genérico',
}

/** El mismo texto que se ve en el CRM, con la forma de cada formato. */
function pieceText(piece) {
  const body = piece.body ?? {}
  if (piece.format === 'post') return body.text ?? ''
  if (piece.format === 'carousel') return [body.title, ...(body.slides ?? [])].filter(Boolean).join('\n\n')
  if (piece.format === 'stories') return (body.stories ?? []).map((story, index) => `${index + 1}. ${story?.text ?? ''}${story?.sticker ? `\n   (${story.sticker})` : ''}`).join('\n\n')
  if (piece.format === 'email') return [body.subject, body.preheader, body.body].filter(Boolean).join('\n\n')
  return [body.hook, body.body, body.cta].filter(Boolean).join('\n\n')
}

export default function PublicContentApprovalPage() {
  const { token } = useParams()
  const [state, setState] = useState('loading')
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')

  const base = `/api/public/content-approval/${encodeURIComponent(token ?? '')}`

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${base}/queue`, { headers: { Accept: 'application/json' } })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload) { setState('not-found'); return }
      setData(payload)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [base])

  useEffect(() => {
    if (!token) { setState('not-found'); return }
    void load()
  }, [token, load])

  async function act(path, body) {
    setBusy(true)
    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) { setNotice(payload.error || 'No se pudo completar la acción'); return false }
      await load()
      return true
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return <PageLoadingState label="Cargando aprobación" />
  if (state !== 'ready') {
    return (
      <main className="approval-public approval-public-center">
        <h1>Este enlace ya no vale</h1>
        <p>Puede haber caducado o haberse revocado. Pídele uno nuevo a tu agencia.</p>
      </main>
    )
  }

  const pending = (data.pieces ?? []).filter(piece => piece.status === 'pending_approval')

  return (
    <main className="approval-public">
      <header>
        <h1>Contenido para aprobar</h1>
        <p>{data.business ? `${data.business} · ` : ''}{pending.length ? `${pending.length} ${pending.length === 1 ? 'pieza pendiente' : 'piezas pendientes'}` : 'nada pendiente ahora mismo'}.</p>
        <small>Al aprobar, tu agencia programa la publicación. Nada se publica desde aquí.</small>
      </header>

      {notice ? <p className="approval-public-notice">{notice}</p> : null}

      {pending.map(piece => (
        <article key={piece.id} className="approval-public-piece">
          <header>
            <strong>{FORMAT_LABEL[piece.format] ?? piece.format}</strong>
            {piece.channels?.length ? <span>{piece.channels.join(' · ')}</span> : null}
          </header>

          {piece.imageUrl ? <img src={piece.imageUrl} alt="" /> : null}
          <pre>{pieceText(piece)}</pre>
          {piece.audioUrl ? <audio controls src={piece.audioUrl} preload="none" /> : null}

          {/* Lo que el editor no pudo resolver se enseña también fuera: quien
              aprueba tiene derecho a ver qué frase no tiene dato detrás. */}
          {(piece.specificity?.flags ?? []).filter(flag => !flag.replacedWith).length ? (
            <ul className="approval-public-flags">
              {piece.specificity.flags.filter(flag => !flag.replacedWith).map((flag, index) => (
                <li key={index}>«{flag.phrase}» · {flag.why}</li>
              ))}
            </ul>
          ) : null}

          <footer>
            <button type="button" disabled={busy} onClick={() => { setRejecting(piece.id); setReason(''); setComment('') }}>
              <RiCloseLine /> Rechazar
            </button>
            <button type="button" className="is-primary" disabled={busy} onClick={() => act(`/pieces/${piece.id}/approve`)}>
              <RiCheckLine /> Aprobar
            </button>
          </footer>

          {rejecting === piece.id ? (
            <div className="approval-public-reject">
              <span>¿Por qué? El motivo es obligatorio: es lo que evita que se repita.</span>
              <div>
                {Object.entries(REJECTION_LABEL).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={reason === value ? 'is-selected' : ''}
                    onClick={() => setReason(value)}
                  >{label}</button>
                ))}
              </div>
              <input value={comment} onChange={event => setComment(event.target.value)} placeholder="Detalle opcional…" />
              <div className="approval-public-reject-actions">
                <button type="button" onClick={() => setRejecting(null)}>Cancelar</button>
                <button
                  type="button"
                  className="is-primary"
                  disabled={!reason || busy}
                  onClick={async () => { if (await act(`/pieces/${piece.id}/reject`, { reason, comment })) setRejecting(null) }}
                >Confirmar rechazo</button>
              </div>
            </div>
          ) : null}
        </article>
      ))}
    </main>
  )
}
