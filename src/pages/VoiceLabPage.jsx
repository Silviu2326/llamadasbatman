import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiArrowLeftLine, RiInformationLine, RiMicLine, RiPulseLine, RiRefreshLine, RiShieldCheckLine, RiStopLine } from 'react-icons/ri'
import voiceOrbImage from '../assets/voice/voice-orb.png'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import './voice-test.css'

// Misma infraestructura que /voz/test: esta página solo elige el motor por sesión.
const isProd = window.location.hostname === 'llamadasspidermanback-production.up.railway.app' || window.location.hostname.startsWith('app.')
const WS_URL = isProd
  ? 'wss://llamadasspidermanback-production.up.railway.app/voice-sim/live'
  : `ws://${window.location.hostname}:3000/voice-sim/live`

const ENGINES = [
  { id: 'omni', label: 'Qwen 3.5 Omni (speech-to-speech)', note: 'El audio viaja a Alibaba Cloud (DashScope). Úsalo solo para evaluar el modelo, no con datos reales de clientes.' },
  { id: 'stack', label: 'Stack modular (STT → LLM → TTS)', note: 'Motor autoalojado (voice-engine). Elige el STT y el TTS que quieres comparar en esta sesión.' },
]
const STT_OPTIONS = [
  { id: 'whisper', label: 'faster-whisper (por turnos)' },
  { id: 'kyutai', label: 'Kyutai streaming (VAD semántico)' },
]
const TTS_OPTIONS = [
  { id: 'qwen', label: 'Qwen3-TTS' },
  { id: 'chatterbox', label: 'Chatterbox' },
  { id: 'piper', label: 'Piper' },
]

const WORKLET_SRC = `
class MicProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0]
    if (ch) { const copy = ch.slice(); this.port.postMessage(copy, [copy.buffer]) }
    return true
  }
}
registerProcessor('mic-proc', MicProcessor)
`

function float32ToInt16(f32) {
  const out = new Int16Array(f32.length)
  for (let i = 0; i < f32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, f32[i]))
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return out
}

function fmtTs(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function VoiceLabPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [agentId, setAgentId] = useState('')
  const [agentOptions, setAgentOptions] = useState([])
  const [engine, setEngine] = useState('omni')
  const [stt, setStt] = useState('whisper')
  const [tts, setTts] = useState('qwen')
  const [phase, setPhase] = useState('idle')
  const [transcript, setTranscript] = useState([])
  const [partial, setPartial] = useState('')
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const wsRef = useRef(null)
  const capCtxRef = useRef(null)
  const playCtxRef = useRef(null)
  const workletRef = useRef(null)
  const streamRef = useRef(null)
  const nextPlayRef = useRef(0)
  const srcListRef = useRef([])
  const spkTimerRef = useRef(null)
  const startRef = useRef(0)
  const tickRef = useRef(null)
  const transcriptEndRef = useRef(null)
  const disposedRef = useRef(false)

  const isOmni = engine === 'omni'
  const engineInfo = ENGINES.find(item => item.id === engine)

  useEffect(() => {
    apiFetch('/api/agents').then(r => (r.ok ? r.json() : null)).then(data => {
      if (Array.isArray(data)) setAgentOptions(data.map(agent => ({ id: agent.id, name: agent.name })))
    }).catch(() => {})
  }, [])

  const addLine = useCallback((role, text) => {
    setTranscript(current => [...current.slice(-120), { role, text: String(text ?? ''), id: Math.random(), ts: Date.now() }])
  }, [])

  function scheduleAudio(f32) {
    const context = playCtxRef.current
    if (!context) return
    if (context.state === 'suspended') context.resume()
    const now = context.currentTime
    if (nextPlayRef.current < now) nextPlayRef.current = now + 0.12
    const buffer = context.createBuffer(1, f32.length, 24000)
    buffer.getChannelData(0).set(f32)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.start(nextPlayRef.current)
    srcListRef.current.push(source)
    source.onended = () => { srcListRef.current = srcListRef.current.filter(item => item !== source) }
    nextPlayRef.current += f32.length / 24000
    setAiSpeaking(true)
    clearTimeout(spkTimerRef.current)
    spkTimerRef.current = setTimeout(() => setAiSpeaking(false), Math.max((nextPlayRef.current - context.currentTime + 0.2) * 1000, 300))
  }

  function stopPlayback() {
    clearTimeout(spkTimerRef.current)
    srcListRef.current.forEach(source => { try { source.stop(0) } catch {} })
    srcListRef.current = []
    nextPlayRef.current = 0
    setAiSpeaking(false)
  }

  async function start() {
    setTranscript([])
    setPartial('')
    setElapsed(0)
    setPhase('live')
    startRef.current = Date.now()
    tickRef.current = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 1000)), 1000)

    try {
      if (!token) throw new Error('Tu sesión ha caducado. Inicia sesión de nuevo.')
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass || !navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite capturar audio.')
      capCtxRef.current = new AudioContextClass({ sampleRate: 16000 })
      playCtxRef.current = new AudioContextClass({ sampleRate: 24000 })
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      if (disposedRef.current) { stream.getTracks().forEach(track => track.stop()); return }
      streamRef.current = stream

      const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }))
      await capCtxRef.current.audioWorklet.addModule(blobUrl)
      URL.revokeObjectURL(blobUrl)

      const micSource = capCtxRef.current.createMediaStreamSource(streamRef.current)
      const worklet = new AudioWorkletNode(capCtxRef.current, 'mic-proc')
      micSource.connect(worklet)
      workletRef.current = worklet

      const socket = new WebSocket(WS_URL, ['vozia', token])
      socket.binaryType = 'arraybuffer'
      wsRef.current = socket

      socket.onopen = () => {
        if (isOmni) {
          socket.send(JSON.stringify({ type: 'start', agentId, engine: 'qwen-omni' }))
          addLine('sistema', 'Conectado con Qwen 3.5 Omni · habla ahora')
        } else {
          socket.send(JSON.stringify({ type: 'start', agentId, stt, tts }))
          addLine('sistema', `Conectado con el stack modular · STT ${stt} · TTS ${tts} · habla ahora`)
        }
      }
      socket.onmessage = event => {
        if (typeof event.data !== 'string') { scheduleAudio(new Float32Array(event.data)); return }
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'partial') setPartial(message.text)
          else if (message.type === 'transcript') {
            setPartial('')
            addLine(message.role === 'prospecto' ? 'tú' : message.role, message.text)
          } else if (message.type === 'interrupt') {
            stopPlayback()
            addLine('sistema', 'Interrupción · audio detenido')
          } else if (message.type === 'error') addLine('sistema', message.message)
        } catch {}
      }
      socket.onerror = () => addLine('sistema', 'No se pudo conectar con el servicio de voz.')
      socket.onclose = () => { addLine('sistema', 'Sesión cerrada'); setPhase('idle') }

      worklet.port.onmessage = event => {
        if (socket.readyState !== WebSocket.OPEN) return
        socket.send(float32ToInt16(event.data).buffer)
      }
    } catch (error) {
      addLine('sistema', error.message)
      stop()
    }
  }

  function stop() {
    clearInterval(tickRef.current)
    stopPlayback()
    wsRef.current?.close()
    wsRef.current = null
    workletRef.current?.disconnect()
    workletRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    capCtxRef.current?.close()
    capCtxRef.current = null
    playCtxRef.current?.close()
    playCtxRef.current = null
    setPhase('idle')
    setPartial('')
  }

  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [transcript, partial])
  useEffect(() => () => { disposedRef.current = true; stop() }, [])

  const isLive = phase === 'live'
  const agentLabel = isOmni ? 'Qwen Omni' : 'Agente'

  return <div className="dark-scroll voice-page">
    <header className="voice-header">
      <div className="voice-heading">
        <div className="voice-brand-icon"><RiPulseLine aria-hidden="true" /></div>
        <div><h1>Laboratorio de voz</h1><p>Compara Qwen 3.5 Omni con el stack modular (STT + LLM + Qwen TTS) en la misma llamada de prueba</p></div>
      </div>
      <div className="voice-header-actions">
        <button className="voice-button ghost" onClick={() => navigate('/voz/test')}><RiArrowLeftLine /> Test de voz clásico</button>
      </div>
    </header>

    <section className="voice-workspace" aria-label="Laboratorio de voz">
      <aside className="voice-left-column">
        <section className="voice-panel voice-config-panel">
          <div className="voice-panel-heading"><div><span className="voice-panel-kicker"><RiPulseLine /> Configuración</span><h2>Sesión</h2></div><RiInformationLine className="voice-panel-heading-icon" /></div>
          <p className="voice-panel-intro">{engineInfo.note}</p>
          <label className="voice-field"><span>Motor</span><select value={engine} onChange={event => setEngine(event.target.value)} disabled={isLive} style={{ width: '100%' }}>{ENGINES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          {!isOmni && <>
            <label className="voice-field"><span>STT</span><select value={stt} onChange={event => setStt(event.target.value)} disabled={isLive} style={{ width: '100%' }}>{STT_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label className="voice-field"><span>TTS</span><select value={tts} onChange={event => setTts(event.target.value)} disabled={isLive} style={{ width: '100%' }}>{TTS_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          </>}
          <label className="voice-field"><span>Agente <em>opcional</em></span><select value={agentId} onChange={event => setAgentId(event.target.value)} disabled={isLive} style={{ width: '100%' }}><option value="">Agente por defecto</option>{agentOptions.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
          <div className="voice-config-note"><RiShieldCheckLine /><span>{isOmni ? 'Modelo: qwen3.5-omni-flash-realtime · VAD semántico del servidor' : `Pipeline: ${stt} → LLM local → ${tts} · motor autoalojado`}</span></div>
        </section>

        <section className={`voice-panel voice-launch-panel${isLive ? ' is-live' : ''}`}>
          <div className="voice-orb-wrap"><img src={voiceOrbImage} alt="" className="voice-orb-image" /><span className="voice-orb-ring ring-one" /><span className="voice-orb-ring ring-two" /></div>
          <div className="voice-launch-copy"><span>{isLive ? (aiSpeaking ? 'Respuesta del agente' : 'Micrófono activo') : 'Motor listo'}</span><strong>{isLive ? (aiSpeaking ? 'El agente está hablando' : 'Escuchando') : 'Listo para hablar'}</strong></div>
          {!isLive
            ? <button className="voice-button primary voice-start-button" onClick={start}><RiMicLine /> Iniciar llamada de prueba</button>
            : <button className="voice-button danger voice-start-button" onClick={stop}><RiStopLine /> Terminar</button>}
          <p className="voice-launch-note"><RiInformationLine /> Se usará el micrófono por defecto del dispositivo.</p>
        </section>
      </aside>

      <main className="voice-main-column">
        <section className="voice-panel voice-conversation-panel">
          <header className="voice-conversation-head">
            <div><span className="voice-conversation-icon"><RiPulseLine /></span><div><h2>Conversación</h2><p>Transcripción en tiempo real</p></div></div>
            <div className="voice-conversation-status"><span className={isLive ? 'is-live' : ''}><i /> {isLive ? 'En directo' : 'En espera'}</span><b>{fmtTs(elapsed * 1000)}</b>{transcript.length > 0 && <button className="voice-clear-button" onClick={() => setTranscript([])}><RiRefreshLine /> Limpiar</button>}</div>
          </header>
          <div className="voice-conversation-body dark-scroll">
            {transcript.length === 0 && !partial && <div className="voice-empty-state"><div className="voice-empty-visual"><img src={voiceOrbImage} alt="" /></div><h3>{isLive ? 'Escuchando tu voz' : 'Listo para hablar'}</h3><p>Tu voz y la respuesta del agente aparecerán aquí en tiempo real.</p></div>}
            {transcript.map(line => <article key={line.id} className={`voice-turn voice-turn--${line.role === 'tú' ? 'user' : line.role === 'agente' ? 'agent' : 'system'}`}>
              <div className="voice-turn-head"><span className="voice-turn-time">{fmtTs((line.ts ?? 0) - (startRef.current ?? 0))}</span><span className="voice-turn-role">{line.role === 'tú' ? 'Tú' : line.role === 'agente' ? agentLabel : 'Sistema'}</span></div>
              {line.role === 'sistema' ? <p className="voice-turn-system">{line.text}</p> : <p className="voice-turn-copy">{line.text}</p>}
            </article>)}
            {partial && <article className="voice-turn voice-turn--partial"><div className="voice-turn-head"><span className="voice-turn-role">Tú</span><span className="voice-turn-number">en curso…</span></div><p className="voice-turn-copy">{partial}<i className="voice-cursor" /></p></article>}
            <div ref={transcriptEndRef} />
          </div>
          <footer className="voice-conversation-footer"><span className="voice-footer-note"><RiShieldCheckLine /> {isOmni ? 'Sesión de evaluación · el audio se procesa en Alibaba Cloud' : 'Sesión de evaluación · el audio se procesa en tu motor autoalojado'}</span></footer>
        </section>
      </main>
    </section>
  </div>
}
