import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiArrowLeftLine,
  RiCheckLine,
  RiCloseLine,
  RiInformationLine,
  RiMicLine,
  RiPulseLine,
  RiRefreshLine,
  RiShieldCheckLine,
  RiSignalWifi3Line,
  RiStopLine,
  RiTimeLine,
  RiWifiLine,
} from 'react-icons/ri'
import voiceOrbImage from '../assets/voice/voice-orb.png'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import './voice-test.css'
import { useI18n } from '../i18n'

const isProd = window.location.hostname === 'llamadasspidermanback-production.up.railway.app' || window.location.hostname.startsWith('app.')
const WS_URL = isProd
  ? 'wss://llamadasspidermanback-production.up.railway.app/voice-sim/live'
  : `ws://${window.location.hostname}:3000/voice-sim/live`

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

const COLORS = {
  accent: '#6366f1',
  green: '#10b981',
  red: '#ef4444',
  yellow: '#f59e0b',
  teal: '#14b8a6',
  muted: '#64748b',
  text: '#e2e8f0',
}

const WAVEFORM = [16, 28, 40, 22, 56, 34, 68, 43, 78, 36, 58, 27, 48, 20, 38, 24, 52, 30, 42, 18]

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

function confColor(value) {
  if (value >= 0.92) return COLORS.green
  if (value >= 0.75) return COLORS.text
  if (value >= 0.55) return COLORS.yellow
  return COLORS.red
}

function latencyColor(ms) {
  if (ms < 500) return COLORS.green
  if (ms < 1000) return COLORS.yellow
  return COLORS.red
}

function Waveform({ active = false, compact = false }) {
  return (
    <span className={`voice-waveform${active ? ' is-active' : ''}${compact ? ' is-compact' : ''}`} aria-hidden="true">
      {WAVEFORM.map((height, index) => <i key={index} style={{ '--wave-height': `${height}%`, '--wave-delay': `${index * 45}ms` }} />)}
    </span>
  )
}

function Badge({ label, value, color }) {
  return <span className="voice-badge" style={{ color: color ?? COLORS.muted }}>
    {label && <small>{label}</small>}
    <strong>{value}</strong>
  </span>
}

function LatencyBar({ label, ms, maxMs = 2000 }) {
  const percentage = Math.min(100, (ms / maxMs) * 100)
  const color = latencyColor(ms)
  return <div className="voice-latency-row">
    <div><span>{label}</span><strong style={{ color }}>{ms} ms</strong></div>
    <span className="voice-latency-track"><i style={{ width: `${percentage}%`, background: color }} /></span>
  </div>
}

function TurnCard({ line, sessionStart, turnNum }) {
  const { t } = useI18n()
  const role = line.role
  const meta = line.meta ?? {}
  const isUser = role === 'tú'
  const isAgent = role === 'agente'
  const isSystem = role === 'sistema'
  const roleLabel = isUser ? 'Tú' : isAgent ? 'Agente' : 'Sistema'
  const roleClass = isUser ? 'user' : isAgent ? 'agent' : 'system'
  const roleColor = isUser ? COLORS.accent : isAgent ? COLORS.green : COLORS.muted

  return <article className={`voice-turn voice-turn--${roleClass}`}>
    <div className="voice-turn-head">
      <span className="voice-turn-time">{fmtTs((line.ts ?? 0) - (sessionStart ?? 0))}</span>
      <span className="voice-turn-role" style={{ color: roleColor }}>{roleLabel}</span>
      {!isSystem && <span className="voice-turn-number">#{turnNum}</span>}
    </div>

    {isSystem ? <p className="voice-turn-system">{line.text}</p> : <>
      <p className="voice-turn-copy">
        {isUser && meta.words?.length
          ? meta.words.map((word, index) => <span key={index} title={`Confianza: ${Math.round((word.confidence ?? 1) * 100)}%`} style={{ color: confColor(word.confidence ?? 1), textDecoration: (word.confidence ?? 1) < 0.7 ? 'underline dotted' : 'none' }}>{word.word} </span>)
          : line.text}
      </p>
      <div className="voice-turn-badges">
        {isUser && meta.confidence != null && <Badge label="conf" value={`${Math.round(meta.confidence * 100)}%`} color={confColor(meta.confidence)} />}
        {isUser && meta.durationSec > 0 && <Badge label="dur" value={`${meta.durationSec.toFixed(1)}s`} />}
        {isUser && meta.wpm != null && <Badge label="wpm" value={meta.wpm} color={meta.wpm > 180 ? COLORS.yellow : COLORS.muted} />}
        {isUser && meta.language && <Badge label="lang" value={meta.language} />}
        {isAgent && meta.latency && <>
          <Badge label="LLM" value={`${meta.latency.llm}ms`} color={latencyColor(meta.latency.llm)} />
          <Badge label="TTS" value={`${meta.latency.tts}ms`} color={latencyColor(meta.latency.tts)} />
          <Badge label="total" value={`${meta.latency.total}ms`} color={latencyColor(meta.latency.total)} />
        </>}
      </div>
    </>}
  </article>
}

function DiagnosticCard({ icon: Icon, label, value, detail, tone = 'default', children }) {
  return <article className={`voice-diagnostic voice-diagnostic--${tone}`}>
    <div className="voice-diagnostic-head"><span className="voice-diagnostic-icon"><Icon /></span><span>{label}</span></div>
    {children ?? <div className="voice-diagnostic-value">{value}</div>}
    <small>{detail}</small>
  </article>
}

export default function VoiceTestPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { token } = useAuth()
  const [agentId, setAgentId] = useState('')
  const [agentOptions, setAgentOptions] = useState([])
  const [phase, setPhase] = useState('idle')

  useEffect(() => {
    apiFetch('/api/agents').then(r => r.ok ? r.json() : []).then(data => {
      if (Array.isArray(data)) setAgentOptions(data.map(agent => ({ id: agent.id, name: agent.name })))
    }).catch(() => {})
  }, [])
  const [transcript, setTranscript] = useState([])
  const [partial, setPartial] = useState('')
  const [volume, setVolume] = useState(0)
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [turns, setTurns] = useState(0)
  const [sent, setSent] = useState(0)
  const [received, setReceived] = useState(0)
  const [interrupts, setInterrupts] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [latency, setLatency] = useState(null)

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
  const turnCountRef = useRef(0)

  const addLine = useCallback((role, text, meta) => {
    setTranscript(current => [...current.slice(-120), { role, text, meta, id: Math.random(), ts: Date.now() }])
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
    setTurns(0)
    setSent(0)
    setReceived(0)
    setInterrupts(0)
    setPartial('')
    setLatency(null)
    setElapsed(0)
    setPhase('live')
    turnCountRef.current = 0
    startRef.current = Date.now()
    tickRef.current = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 1000)), 1000)

    try {
      if (!token) throw new Error('Tu sesión ha caducado. Inicia sesión de nuevo para probar la voz.')
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass || !navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite capturar audio.')
      capCtxRef.current = new AudioContextClass({ sampleRate: 16000 })
      playCtxRef.current = new AudioContextClass({ sampleRate: 24000 })
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })

      const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }))
      await capCtxRef.current.audioWorklet.addModule(blobUrl)
      URL.revokeObjectURL(blobUrl)

      const micSource = capCtxRef.current.createMediaStreamSource(streamRef.current)
      const worklet = new AudioWorkletNode(capCtxRef.current, 'mic-proc')
      micSource.connect(worklet)
      workletRef.current = worklet

      // Browser WebSockets cannot send Authorization headers. The server only
      // accepts the JWT when it is supplied after the fixed `vozia` protocol
      // marker, and negotiates only that marker back (never the token itself).
      const socket = new WebSocket(WS_URL, ['vozia', token])
      socket.binaryType = 'arraybuffer'
      wsRef.current = socket

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'start', agentId }))
        addLine('sistema', 'Conectado · habla ahora')
      }
      socket.onmessage = event => {
        if (typeof event.data !== 'string') {
          scheduleAudio(new Float32Array(event.data))
          setReceived(value => value + 1)
          return
        }
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'partial') {
            setPartial(message.text)
          } else if (message.type === 'transcript') {
            setPartial('')
            turnCountRef.current += 1
            const turnNumber = turnCountRef.current
            if (message.role === 'agente' && message.latency) setLatency(message.latency)
            const role = message.role === 'prospecto' ? 'tú' : message.role
            const { type: _type, role: _role, ...meta } = message
            addLine(role, message.text, meta)
            setTurns(turnNumber)
          } else if (message.type === 'interrupt') {
            stopPlayback()
            setInterrupts(value => value + 1)
            addLine('sistema', 'Barge-in · audio detenido')
          } else if (message.type === 'error') {
            addLine('sistema', message.message)
          }
        } catch {}
      }
      socket.onerror = () => addLine('sistema', 'No se pudo conectar con el servicio de voz. Inténtalo de nuevo en unos segundos.')
      socket.onclose = () => { addLine('sistema', 'Sesión cerrada'); setPhase('idle') }

      worklet.port.onmessage = event => {
        if (socket.readyState !== WebSocket.OPEN) return
        const f32 = event.data
        let sum = 0
        for (let i = 0; i < f32.length; i += 1) sum += f32[i] * f32[i]
        setVolume(Math.min(Math.round(Math.sqrt(sum / f32.length) * 600), 100))
        socket.send(float32ToInt16(f32).buffer)
        setSent(value => value + 1)
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
    setVolume(0)
    setPartial('')
  }

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, partial])

  useEffect(() => () => stop(), [])

  const isLive = phase === 'live'
  const latestUserTurn = [...transcript].reverse().find(line => line.role === 'tú' && line.meta?.confidence != null)
  const confidence = latestUserTurn?.meta?.confidence
  const networkChunks = sent + received
  let turnNumber = 0

  return <div className="dark-scroll voice-page">
    <header className="voice-header">
      <div className="voice-heading">
        <div className="voice-brand-icon"><RiPulseLine aria-hidden="true" /></div>
        <div><h1>{t('voiceTest.title')}</h1><p>{t('voiceTest.subtitle')}</p></div>
      </div>
      <div className="voice-header-actions">
        <button className="voice-button ghost" onClick={() => navigate('/agentes')}><RiArrowLeftLine /> {t('voiceTest.back')}</button>
        <span className="voice-system-status"><i /> {t('voiceTest.systemReady')}</span>
      </div>
    </header>

    <section className="voice-workspace" aria-label="Estudio de test de voz">
      <aside className="voice-left-column">
        <section className="voice-panel voice-config-panel">
          <div className="voice-panel-heading"><div><span className="voice-panel-kicker"><RiPulseLine /> {t('voiceTest.configuration')}</span><h2>{t('voiceTest.session')}</h2></div><RiInformationLine className="voice-panel-heading-icon" /></div>
          <p className="voice-panel-intro">{t('voiceTest.intro')}</p>
          <label className="voice-field"><span>Agente <em>{t('voiceTest.optional')}</em></span><select value={agentId} onChange={event => setAgentId(event.target.value)} disabled={isLive} style={{ width: '100%' }}><option value="">Agente por defecto</option>{agentOptions.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
          <div className="voice-config-note"><RiShieldCheckLine /><span>{t('voiceTest.privateSession')}</span></div>
        </section>

        <section className={`voice-panel voice-launch-panel${isLive ? ' is-live' : ''}`}>
          <div className="voice-orb-wrap"><img src={voiceOrbImage} alt="" className="voice-orb-image" /><span className="voice-orb-ring ring-one" /><span className="voice-orb-ring ring-two" /><div className="voice-orb-wave"><Waveform active={isLive || aiSpeaking} /></div></div>
          <div className="voice-launch-copy"><span>{isLive ? (aiSpeaking ? t('voiceTest.agentResponse') : t('voiceTest.micActive')) : t('voiceTest.engineReady')}</span><strong>{isLive ? (aiSpeaking ? t('voiceTest.agentSpeaking') : t('voiceTest.listening')) : t('voiceTest.ready')}</strong></div>
          {!isLive
            ? <button className="voice-button primary voice-start-button" onClick={start}><RiMicLine /> {t('voiceTest.start')}</button>
            : <button className="voice-button danger voice-start-button" onClick={stop}><RiStopLine /> {t('voiceTest.stop')}</button>}
          <p className="voice-launch-note"><RiInformationLine /> {t('voiceTest.microphoneHint')}</p>
        </section>
      </aside>

      <main className="voice-main-column">
        <section className="voice-panel voice-conversation-panel">
          <header className="voice-conversation-head">
            <div><span className="voice-conversation-icon"><RiPulseLine /></span><div><h2>{t('voiceTest.conversation')}</h2><p>{t('voiceTest.realtimeSignals')}</p></div></div>
            <div className="voice-conversation-status"><span className={isLive ? 'is-live' : ''}><i /> {isLive ? t('voiceTest.live') : t('voiceTest.waiting')}</span><b>{fmtTs(elapsed * 1000)}</b>{transcript.length > 0 && <button className="voice-clear-button" onClick={() => setTranscript([])}><RiRefreshLine /> {t('voiceTest.clear')}</button>}</div>
          </header>
          <div className="voice-conversation-body dark-scroll">
            {transcript.length === 0 && !partial && <div className="voice-empty-state"><div className="voice-empty-visual"><img src={voiceOrbImage} alt="" /><Waveform active={isLive || aiSpeaking} compact /></div><h3>{isLive ? t('voiceTest.listeningVoice') : t('voiceTest.ready')}</h3><p>{t('voiceTest.realtimeResponse')}</p><div className="voice-empty-meta"><span><RiCheckLine /> {t('voiceTest.bidirectionalAudio')}</span><span><RiCheckLine /> {t('voiceTest.wordConfidence')}</span></div></div>}
            {transcript.map(line => { if (line.role !== 'sistema') turnNumber += 1; return <TurnCard key={line.id} line={line} sessionStart={startRef.current} turnNum={line.role !== 'sistema' ? turnNumber : null} /> })}
            {partial && <article className="voice-turn voice-turn--partial"><div className="voice-turn-head"><span className="voice-turn-time">{fmtTs(Date.now() - startRef.current)}</span><span className="voice-turn-role">Tú</span><span className="voice-turn-number">en curso…</span></div><p className="voice-turn-copy">{partial}<i className="voice-cursor" /></p></article>}
            <div ref={transcriptEndRef} />
          </div>
          <footer className="voice-conversation-footer"><span className="voice-footer-note"><RiShieldCheckLine /> {t('voiceTest.private')}</span></footer>
        </section>

        <section className="voice-diagnostics-grid" aria-label={t('voiceTest.diagnostics')}>
          <DiagnosticCard icon={RiPulseLine} label={t('status.live')} value={isLive ? t('voiceTest.live') : t('voiceTest.inactive')} detail={isLive ? (aiSpeaking ? t('voiceTest.responding') : t('voiceTest.listening')) : t('voiceTest.noData')} tone={isLive ? 'live' : 'default'} />
          <DiagnosticCard icon={RiTimeLine} label={t('voiceTest.latency')} value={latency?.total ?? 0} detail={latency ? t('voiceTest.lastTurn') : t('voiceTest.noData')} tone={latency ? 'live' : 'default'}><div className="voice-diagnostic-value"><strong>{latency?.total ?? 0}</strong><small>ms</small></div></DiagnosticCard>
          <DiagnosticCard icon={RiWifiLine} label={t('voiceTest.network')} value={networkChunks} detail={`${sent} ${t('voiceTest.sent')} · ${received} ${t('voiceTest.received')}`} tone={networkChunks > 0 ? 'live' : 'default'}><div className="voice-signal-bars"><i /><i /><i /><i /></div></DiagnosticCard>
          <DiagnosticCard icon={RiShieldCheckLine} label={t('voiceTest.confidence')} value={confidence != null ? `${Math.round(confidence * 100)}%` : '—'} detail={confidence != null ? t('voiceTest.lastTranscript') : t('voiceTest.noData')} tone={confidence != null ? 'live' : 'default'} />
        </section>

        <section className="voice-telemetry-grid">
          <div className="voice-panel voice-latency-panel"><div className="voice-panel-heading"><div><span className="voice-panel-kicker"><RiTimeLine /> {t('voiceTest.performance')}</span><h2>{t('voiceTest.lastTurnLatency')}</h2></div><span className="voice-panel-inline-status"><i /> {latency ? t('voiceTest.updated') : t('voiceTest.waiting')}</span></div>{latency ? <><LatencyBar label="El agente piensa la respuesta" ms={latency.llm} /><LatencyBar label="Empieza a hablar" ms={latency.tts} /><LatencyBar label="Respuesta completa" ms={latency.total} maxMs={3000} /></> : <div className="voice-no-data"><RiTimeLine /><span>{t('voiceTest.realtimeMetrics')}</span></div>}</div>
          <div className="voice-panel voice-session-panel"><div className="voice-panel-heading"><div><span className="voice-panel-kicker"><RiSignalWifi3Line /> {t('voiceTest.signals')}</span><h2>{t('voiceTest.sessionStatus')}</h2></div><button className="voice-icon-button" aria-label={t('voiceTest.reset')} onClick={stop}><RiRefreshLine /></button></div><div className="voice-session-list"><div><span>{t('voiceTest.activeTime')}</span><strong>{elapsed}s</strong></div><div><span>{t('voiceTest.turns')}</span><strong>{turns}</strong></div><div><span>{t('voiceTest.interruptions')}</span><strong className={interrupts > 0 ? 'is-warning' : ''}>{interrupts}</strong></div><div><span>{t('voiceTest.microphone')}</span><strong>{volume}%</strong></div></div><div className="voice-meter"><span><i style={{ width: `${volume}%` }} /></span><small>{t('voiceTest.inputLevel')}</small></div></div>
        </section>

        <footer className="voice-page-footer"><span><RiInformationLine /> {t('voiceTest.realtimeMetrics')}</span><span><RiCheckLine /> {t('voiceTest.underControl')}</span></footer>
      </main>
    </section>

    {transcript.some(line => line.role === 'sistema' && line.text.toLowerCase().includes('error')) && <div className="voice-inline-alert" role="status"><RiCloseLine /> El servicio de voz no responde. Espera unos segundos y vuelve a intentarlo; si persiste, contacta con soporte.</div>}
  </div>
}
