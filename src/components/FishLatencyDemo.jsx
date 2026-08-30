import { useEffect, useMemo, useRef, useState } from 'react'
import {
  RiCloseLine,
  RiDownload2Line,
  RiLoader4Line,
  RiPulseLine,
  RiRestartLine,
  RiVoiceprintLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'

const DEFAULT_TEXT = 'Hola, soy Clara, la asistente virtual de Vendrava. Te llamo porque hemos detectado una oportunidad para conseguir más clientes. ¿Tienes treinta segundos?'

function median(values, key) {
  if (!values.length) return null
  const sorted = values.map(value => value[key]).toSorted((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function latencyVerdict(ttfa) {
  if (ttfa == null) return null
  if (ttfa < 500) return { tone: 'great', label: 'Excelente', detail: 'Respuesta suficientemente rápida para conversación natural.' }
  if (ttfa < 900) return { tone: 'good', label: 'Aceptable', detail: 'Se notará una pausa corta entre turnos.' }
  return { tone: 'slow', label: 'Latencia alta', detail: 'Probablemente se sienta lenta en una llamada en directo.' }
}

export default function FishLatencyDemo({ onClose }) {
  const [text, setText] = useState(DEFAULT_TEXT)
  const [voiceId, setVoiceId] = useState('')
  const [model, setModel] = useState('s2.1-pro-free')
  const [latency, setLatency] = useState('balanced')
  const [runs, setRuns] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const abortRef = useRef(null)

  const ttfaMedian = median(runs, 'ttfaMs')
  const totalMedian = median(runs, 'fishTotalMs')
  const browserMedian = median(runs, 'browserTotalMs')
  const verdict = latencyVerdict(ttfaMedian)

  useEffect(() => () => {
    abortRef.current?.abort()
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  }, [audioUrl])

  useEffect(() => {
    const handleKey = event => {
      if (event.key === 'Escape' && status !== 'running') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, status])

  const runBenchmark = async () => {
    setStatus('running')
    setError('')
    setRuns([])
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl('')
    }

    const controller = new AbortController()
    abortRef.current = controller
    const nextRuns = []
    try {
      for (let index = 0; index < 3; index += 1) {
        const startedAt = performance.now()
        const response = await apiFetch('/api/calls/tts-latency-demo', {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({ text, voiceId, model, latency, speed: 1 }),
        })
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.error || `No se pudo medir Fish Audio (${response.status}).`)
        }

        const blob = await response.blob()
        const browserTotalMs = Math.round((performance.now() - startedAt) * 10) / 10
        const result = {
          index: index + 1,
          ttfaMs: Number(response.headers.get('X-Fish-TTFA-Ms')),
          fishTotalMs: Number(response.headers.get('X-Fish-Total-Ms')),
          browserTotalMs,
        }
        nextRuns.push(result)
        setRuns([...nextRuns])
        if (index === 2) setAudioUrl(URL.createObjectURL(blob))
      }
      setStatus('done')
    } catch (nextError) {
      if (nextError.name !== 'AbortError') setError(nextError.message)
      setStatus('idle')
    } finally {
      abortRef.current = null
    }
  }

  const downloadAudio = () => {
    if (!audioUrl) return
    const link = document.createElement('a')
    link.href = audioUrl
    link.download = 'fish-audio-latency-demo.mp3'
    link.click()
  }

  const canRun = status !== 'running' && text.trim().length >= 12

  return <div className="app-modal-backdrop calls-latency-backdrop" onMouseDown={event => {
    if (event.target === event.currentTarget && status !== 'running') onClose()
  }}>
    <section className="app-modal-card calls-latency-modal dark-scroll" role="dialog" aria-modal="true" aria-labelledby="fish-latency-title">
      <header className="calls-latency-head">
        <div className="calls-latency-icon"><RiPulseLine /></div>
        <div><h2 id="fish-latency-title">Latencia real de Fish Audio</h2><p>Tres síntesis consecutivas desde este servidor</p></div>
        <button type="button" onClick={onClose} disabled={status === 'running'} aria-label="Cerrar medición"><RiCloseLine /></button>
      </header>

      <div className="calls-latency-note"><RiVoiceprintLine /><span><strong>La voz no es la prueba.</strong> Medimos cuándo llega el primer audio y cuánto tarda en completarse.</span></div>

      <label className="calls-latency-field">
        <span>Frase de prueba <small>{text.length}/600</small></span>
        <textarea value={text} onChange={event => setText(event.target.value.slice(0, 600))} rows="4" disabled={status === 'running'} />
      </label>

      <div className="calls-latency-grid">
        <label className="calls-latency-field"><span>Modelo</span><select value={model} onChange={event => setModel(event.target.value)} disabled={status === 'running'}><option value="s2.1-pro-free">S2.1 Pro Free</option><option value="s2.1-pro">S2.1 Pro</option><option value="s2-pro">S2 Pro</option></select></label>
        <label className="calls-latency-field"><span>Modo</span><select value={latency} onChange={event => setLatency(event.target.value)} disabled={status === 'running'}><option value="balanced">Balanced</option><option value="low">Low</option><option value="normal">Normal</option></select></label>
      </div>

      <label className="calls-latency-field"><span>Voice ID <small>opcional</small></span><input value={voiceId} onChange={event => setVoiceId(event.target.value)} placeholder="Usa la voz predeterminada si queda vacío" disabled={status === 'running'} /></label>

      {runs.length > 0 && <section className="calls-latency-results" aria-live="polite">
        <div className="calls-latency-summary">
          <div><span>Primer audio</span><strong>{ttfaMedian != null ? `${Math.round(ttfaMedian)} ms` : '—'}</strong><small>mediana de Fish</small></div>
          <div><span>Audio completo</span><strong>{totalMedian != null ? `${Math.round(totalMedian)} ms` : '—'}</strong><small>mediana de Fish</small></div>
          <div><span>Total navegador</span><strong>{browserMedian != null ? `${Math.round(browserMedian)} ms` : '—'}</strong><small>ida, generación y vuelta</small></div>
        </div>
        <div className="calls-latency-table"><span>Intento</span><span>Primer audio</span><span>Completo</span><span>Navegador</span>{runs.map(run => <div key={run.index}><b>#{run.index}</b><span>{Math.round(run.ttfaMs)} ms</span><span>{Math.round(run.fishTotalMs)} ms</span><span>{Math.round(run.browserTotalMs)} ms</span></div>)}</div>
        {verdict && <div className={`calls-latency-verdict is-${verdict.tone}`}><strong>{verdict.label}</strong><span>{verdict.detail}</span></div>}
      </section>}

      {error && <div className="calls-latency-error" role="alert">{error}</div>}

      {audioUrl && <div className="calls-latency-player"><audio controls src={audioUrl}>Tu navegador no puede reproducir este audio.</audio><button type="button" onClick={downloadAudio} title="Descargar último audio"><RiDownload2Line /></button></div>}

      <footer className="calls-latency-actions">
        <p>TTFA se mide al recibir el primer chunk de audio, no solo las cabeceras.</p>
        <button type="button" className="calls-button primary" disabled={!canRun} onClick={runBenchmark}>{status === 'running' ? <><RiLoader4Line className="is-spinning" /> Midiendo {runs.length + 1}/3…</> : runs.length ? <><RiRestartLine /> Repetir prueba</> : <><RiPulseLine /> Medir 3 veces</>}</button>
      </footer>
    </section>
  </div>
}
