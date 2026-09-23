import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api'
import { RiDownload2Line, RiPauseLine, RiPhoneLine, RiPlayLine } from 'react-icons/ri'
import { useI18n } from '../i18n'

const formatTime = value => Number.isFinite(value) ? `${Math.floor(value / 60)}m ${String(Math.floor(value % 60)).padStart(2, '0')}s` : '—'

export default function CallRecordingPlayer({ recordingUrl }) {
  const { t } = useI18n()
  const audioRef = useRef(null)
  const blobRef = useRef(null)
  const abortRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const privateRecording = /^\/api\/calls\/recordings\/[a-f0-9-]+$/.test(recordingUrl || '')
  useEffect(() => {
    setPlaying(false); setCurrent(0); setDuration(0); setError(''); setLoading(false)
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
      if (blobRef.current) URL.revokeObjectURL(blobRef.current)
      blobRef.current = null
    }
  }, [recordingUrl])

  // Load private recordings only on request. Never put JWTs into an audio URL,
  // and never forward Authorization to third-party recording hosts.
  const load = async () => {
    if (!privateRecording) return recordingUrl
    if (blobRef.current) return blobRef.current
    if (abortRef.current) return null
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true); setError('')
    try {
      const response = await apiFetch(recordingUrl, { signal: controller.signal })
      if (!response.ok) throw new Error(response.status === 409 ? 'La grabación todavía no está disponible. Vuelve a intentarlo en unos segundos.' : 'No se pudo cargar la grabación.')
      const blob = await response.blob()
      if (controller.signal.aborted) return null
      const url = URL.createObjectURL(blob)
      blobRef.current = url
      return url
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof TypeError ? 'No se pudo conectar para cargar la grabación. Vuelve a intentarlo.' : e.message || 'No se pudo cargar la grabación.')
      return null
    } finally {
      if (abortRef.current === controller) { abortRef.current = null; setLoading(false) }
    }
  }
  const play = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause(); setPlaying(false); return }
    const url = await load()
    if (!url || audioRef.current !== audio) return
    if (audio.src !== url) audio.src = url
    try { await audio.play(); setPlaying(true); setError('') }
    catch { setPlaying(false); setError('No se pudo reproducir el audio. Puedes volver a intentarlo o descargarlo.') }
  }
  const download = async () => {
    const url = await load()
    if (!url) return
    const a = document.createElement('a')
    a.href = url; a.download = 'grabacion-llamada.wav'; a.rel = 'noreferrer'
    if (!privateRecording) a.target = '_blank'
    a.click()
  }
  if (!recordingUrl) return <div className="detail-empty-state"><RiPhoneLine /><strong>{t('details.noRecording')}</strong><span>{t('details.noRecordingText')}</span></div>
  return <div>
    <div className="detail-player">
      <audio key={recordingUrl} ref={audioRef} src={privateRecording ? undefined : recordingUrl} preload="metadata"
        onLoadedMetadata={event => setDuration(event.currentTarget.duration)} onTimeUpdate={event => setCurrent(event.currentTarget.currentTime)}
        onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setError('No se pudo reproducir la grabación.')} />
      <button className="detail-play" disabled={loading} onClick={play} aria-label={playing ? 'Pausar llamada' : 'Reproducir llamada'}>{playing ? <RiPauseLine /> : <RiPlayLine />}</button>
      <span className="detail-player-time">{formatTime(current)}</span>
      <input className="detail-player-range" type="range" min="0" max={Number.isFinite(duration) ? duration : 0} value={current} onChange={event => { const value = Number(event.target.value); setCurrent(value); if (audioRef.current) audioRef.current.currentTime = value }} aria-label="Posición de la grabación" />
      <span className="detail-player-time">{formatTime(duration)}</span>
      <button className="detail-download" disabled={loading} onClick={download} aria-label="Descargar audio"><RiDownload2Line /></button>
    </div>
    {loading && <p role="status">Cargando grabación…</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}
