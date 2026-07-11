import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiArrowLeftLine, RiMicLine, RiStopLine } from 'react-icons/ri'
import '../dashboard.css'

const isProd = location.hostname === 'llamadasspidermanback-production.up.railway.app' || location.hostname.startsWith('app.')
const WS_URL = isProd
  ? 'wss://llamadasspidermanback-production.up.railway.app/voice-sim/live'
  : `ws://${location.hostname}:3000/voice-sim/live`

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

const C = {
  bg: '#080c14', surface: '#0f1623', border: '#1e2a3a',
  accent: '#6366f1', green: '#10b981', red: '#ef4444',
  yellow: '#f59e0b', muted: '#4b5563', text: '#e2e8f0', sub: '#6b7280',
  orange: '#f97316', teal: '#14b8a6',
}

function float32ToInt16(f32) {
  const out = new Int16Array(f32.length)
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }
  return out
}

function fmtTs(ms) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function confColor(c) {
  if (c >= 0.92) return C.green
  if (c >= 0.75) return C.text
  if (c >= 0.55) return C.yellow
  return C.red
}

function latColor(ms) {
  if (ms < 500) return C.green
  if (ms < 1000) return C.yellow
  return C.red
}

function Badge({ label, value, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontFamily: 'monospace',
      background: '#ffffff08', border: `1px solid ${C.border}`,
      borderRadius: 4, padding: '2px 6px',
      color: color ?? C.sub,
    }}>
      {label && <span style={{ color: C.muted }}>{label}</span>}
      <span style={{ fontWeight: 700 }}>{value}</span>
    </span>
  )
}

function WordSpan({ word, confidence }) {
  const color = confColor(confidence ?? 1)
  const underline = (confidence ?? 1) < 0.7
  return (
    <span
      title={`conf: ${Math.round((confidence ?? 1) * 100)}%`}
      style={{
        color,
        marginRight: 4,
        textDecoration: underline ? 'underline dotted' : 'none',
        textUnderlineOffset: 3,
        cursor: 'default',
      }}
    >
      {word}
    </span>
  )
}

function LatencyBar({ label, ms, maxMs = 2000 }) {
  const pct = Math.min(100, (ms / maxMs) * 100)
  const color = latColor(ms)
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: C.sub }}>{label}</span>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color, fontWeight: 700 }}>{ms}ms</span>
      </div>
      <div style={{ height: 3, background: C.border, borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

function TurnCard({ line, sessionStart, turnNum }) {
  const ts = fmtTs((line.ts ?? 0) - (sessionStart ?? 0))
  const role = line.role
  const meta = line.meta ?? {}
  const isUser   = role === 'tú'
  const isAgent  = role === 'agente'
  const isSys    = role === 'sistema'

  const roleColor = { tú: C.accent, agente: C.green, sistema: C.muted }[role] ?? C.sub

  return (
    <div style={{
      marginBottom: 2,
      borderRadius: 10,
      background: isAgent ? '#0d1f12' : isUser ? '#0d0f20' : 'transparent',
      border: `1px solid ${isAgent ? '#1a3020' : isUser ? '#1a1e38' : 'transparent'}`,
      padding: isSys ? '6px 10px' : '10px 14px',
    }}>
      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isSys ? 0 : 6 }}>
        <span style={{ fontSize: 10, color: C.muted, fontFamily: 'monospace', minWidth: 32 }}>{ts}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: roleColor, minWidth: 48 }}>{role}</span>
        {!isSys && turnNum != null && (
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>#{turnNum}</span>
        )}
      </div>

      {/* body */}
      {!isSys && (
        <>
          {/* text — words colored for user, plain for agent */}
          <div style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 6, paddingLeft: 40 }}>
            {isUser && meta.words?.length
              ? meta.words.map((w, i) => <WordSpan key={i} word={w.word} confidence={w.confidence} />)
              : <span style={{ color: C.text }}>{line.text}</span>
            }
          </div>

          {/* meta badges row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingLeft: 40 }}>
            {isUser && <>
              {meta.confidence != null && (
                <Badge label="conf" value={`${Math.round(meta.confidence * 100)}%`} color={confColor(meta.confidence)} />
              )}
              {meta.durationSec > 0 && (
                <Badge label="dur" value={`${meta.durationSec.toFixed(1)}s`} />
              )}
              {meta.wpm != null && (
                <Badge label="wpm" value={meta.wpm} color={meta.wpm > 180 ? C.yellow : C.sub} />
              )}
              {meta.eotType && (
                <Badge label="" value={meta.eotType === 'EagerEndOfTurn' ? '⚡ eager EOT' : '✓ EOT'} color={meta.eotType === 'EagerEndOfTurn' ? C.yellow : C.teal} />
              )}
              {meta.language && <Badge label="lang" value={meta.language} />}
            </>}

            {isAgent && meta.latency && <>
              <Badge label="LLM" value={`${meta.latency.llm}ms`} color={latColor(meta.latency.llm)} />
              <Badge label="TTS" value={`${meta.latency.tts}ms`} color={latColor(meta.latency.tts)} />
              <Badge label="total" value={`${meta.latency.total}ms`} color={latColor(meta.latency.total)} />
            </>}
            {isAgent && !meta.latency && (
              <Badge label="" value="apertura" color={C.muted} />
            )}
          </div>
        </>
      )}

      {/* sistema: inline text */}
      {isSys && (
        <span style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', paddingLeft: 40, display: 'inline' }}>
          {line.text}
        </span>
      )}
    </div>
  )
}

export default function VoiceTestPage() {
  const navigate = useNavigate()
  const [agentId, setAgentId] = useState('')
  const [orgId, setOrgId]     = useState('')
  const [phase, setPhase]     = useState('idle')
  const [transcript, setTx]   = useState([])
  const [partial, setPartial] = useState('')
  const [volume, setVolume]   = useState(0)
  const [aiSpeaking, setAiSpk] = useState(false)
  const [turns, setTurns]     = useState(0)
  const [sent, setSent]       = useState(0)
  const [received, setReceived] = useState(0)
  const [interrupts, setInterrupts] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [latency, setLatency] = useState(null)

  const wsRef       = useRef(null)
  const capCtxRef   = useRef(null)
  const playCtxRef  = useRef(null)
  const workletRef  = useRef(null)
  const streamRef   = useRef(null)
  const nextPlayRef = useRef(0)
  const srcListRef  = useRef([])
  const spkTimerRef = useRef(null)
  const startRef    = useRef(0)
  const tickRef     = useRef(null)
  const txEndRef    = useRef(null)
  const turnCountRef = useRef(0)

  const addLine = useCallback((role, text, meta) => {
    setTx(p => [...p.slice(-120), { role, text, meta, id: Math.random(), ts: Date.now() }])
  }, [])

  // ── playback ────────────────────────────────────────────────────────────────
  function scheduleF32(f32) {
    const ctx = playCtxRef.current
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime
    if (nextPlayRef.current < now) nextPlayRef.current = now + 0.12
    const buf = ctx.createBuffer(1, f32.length, 24000)
    buf.getChannelData(0).set(f32)
    const src = ctx.createBufferSource()
    src.buffer = buf; src.connect(ctx.destination); src.start(nextPlayRef.current)
    srcListRef.current.push(src)
    src.onended = () => { srcListRef.current = srcListRef.current.filter(s => s !== src) }
    nextPlayRef.current += f32.length / 24000
    setAiSpk(true)
    clearTimeout(spkTimerRef.current)
    spkTimerRef.current = setTimeout(() => setAiSpk(false), Math.max((nextPlayRef.current - ctx.currentTime + 0.2) * 1000, 300))
  }

  function stopPlayback() {
    clearTimeout(spkTimerRef.current)
    srcListRef.current.forEach(s => { try { s.stop(0) } catch {} })
    srcListRef.current = []; nextPlayRef.current = 0; setAiSpk(false)
  }

  // ── start ───────────────────────────────────────────────────────────────────
  async function start() {
    setTx([]); setTurns(0); setSent(0); setReceived(0); setInterrupts(0)
    setPartial(''); setLatency(null); setPhase('live')
    turnCountRef.current = 0
    startRef.current = Date.now()
    tickRef.current = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 1000)), 1000)

    try {
      capCtxRef.current  = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
      playCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 })

      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })

      const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }))
      await capCtxRef.current.audioWorklet.addModule(blobUrl)
      URL.revokeObjectURL(blobUrl)

      const micSrc = capCtxRef.current.createMediaStreamSource(streamRef.current)
      const worklet = new AudioWorkletNode(capCtxRef.current, 'mic-proc')
      micSrc.connect(worklet)
      workletRef.current = worklet

      const ws = new WebSocket(WS_URL)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'start', agentId, orgId }))
        addLine('sistema', '✓ Conectado — habla ahora')
      }

      ws.onmessage = ev => {
        if (typeof ev.data !== 'string') {
          scheduleF32(new Float32Array(ev.data))
          setReceived(r => r + 1)
          return
        }
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'partial') {
            setPartial(msg.text)
          } else if (msg.type === 'transcript') {
            setPartial('')
            turnCountRef.current++
            const n = turnCountRef.current
            if (msg.role === 'agente' && msg.latency) setLatency(msg.latency)
            const roleLabel = msg.role === 'prospecto' ? 'tú' : msg.role
            const { type: _t, role: _r, ...meta } = msg
            addLine(roleLabel, msg.text, meta)
            setTurns(n)
          } else if (msg.type === 'interrupt') {
            stopPlayback()
            setInterrupts(i => i + 1)
            addLine('sistema', '⚡ Barge-in — audio detenido')
          } else if (msg.type === 'error') {
            addLine('sistema', `❌ ${msg.message}`)
          }
        } catch {}
      }

      ws.onerror = () => addLine('sistema', '❌ Error de conexión — ¿backend en :3000?')
      ws.onclose = () => { addLine('sistema', '— Sesión cerrada'); setPhase('idle') }

      worklet.port.onmessage = e => {
        if (ws.readyState !== WebSocket.OPEN) return
        const f32 = e.data
        let sum = 0; for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i]
        setVolume(Math.min(Math.round(Math.sqrt(sum / f32.length) * 600), 100))
        ws.send(float32ToInt16(f32).buffer)
        setSent(s => s + 1)
      }
    } catch (err) {
      addLine('sistema', `❌ ${err.message}`)
      stop()
    }
  }

  // ── stop ────────────────────────────────────────────────────────────────────
  function stop() {
    clearInterval(tickRef.current)
    stopPlayback()
    wsRef.current?.close(); wsRef.current = null
    workletRef.current?.disconnect(); workletRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null
    capCtxRef.current?.close(); capCtxRef.current = null
    playCtxRef.current?.close(); playCtxRef.current = null
    setPhase('idle'); setVolume(0); setPartial('')
  }

  // Auto-scroll transcript
  useEffect(() => {
    txEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, partial])

  useEffect(() => () => stop(), [])

  const isLive = phase === 'live'
  let turnN = 0

  return (
    <div className="dark-scroll vt-page" style={{ flex: 1, overflowY: 'auto', background: C.bg, padding: '26px 32px 48px' }}>
      <style>{`
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @media (max-width: 860px) {
          .vt-page { padding: 16px !important; }
          .vt-grid { grid-template-columns: 1fr !important; }
          .vt-transcript { min-height: 420px !important; }
        }
      `}</style>

      <button onClick={() => navigate('/agentes')} style={{
        display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
        color: C.sub, cursor: 'pointer', fontSize: 12.5, padding: 0, marginBottom: 22, fontFamily: 'inherit'
      }}>
        <RiArrowLeftLine style={{ width: 14, height: 14 }} /> Agentes IA
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>🎤 Test de Voz</h1>
      <p style={{ fontSize: 13, color: C.sub, marginBottom: 28 }}>
        Deepgram Flux · Cerebras · ElevenLabs — latencia end-to-end en tiempo real
      </p>

      <div className="vt-grid" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 18 }}>

        {/* ── LEFT ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.sub, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Opcional</div>
            {[['Agent ID', agentId, setAgentId], ['Org ID', orgId, setOrgId]].map(([lbl, val, set]) => (
              <div key={lbl} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11, color: C.sub, display: 'block', marginBottom: 3 }}>{lbl}</label>
                <input value={val} onChange={e => set(e.target.value)} disabled={isLive} placeholder="(opcional)"
                  style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 10px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>

          {!isLive
            ? <button onClick={start} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: C.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '11px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                <RiMicLine style={{ width: 16, height: 16 }} /> Iniciar sesión
              </button>
            : <button onClick={stop} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#2a0f0f', color: C.red, border: `1px solid ${C.red}`, borderRadius: 9, padding: '11px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                <RiStopLine style={{ width: 16, height: 16 }} /> Detener
              </button>
          }

          {/* estado */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px' }}>
            <Sec label="Estado" />
            <Row l="Sesión" v={isLive ? '● En vivo' : '○ Inactivo'} c={isLive ? C.green : C.muted} />
            <Row l="Tiempo" v={`${elapsed}s`} />
            <Row l="Turnos" v={turns} />
            <Row l="Interrupciones" v={interrupts} c={interrupts > 0 ? C.yellow : C.sub} />
            <Row l="IA" v={aiSpeaking ? '🔊 Hablando' : '🎤 Escuchando'} c={aiSpeaking ? C.yellow : C.green} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
              <span style={{ fontSize: 12, color: C.sub }}>Micrófono</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 64, height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${volume}%`, height: '100%', background: volume > 70 ? C.yellow : C.accent, transition: 'width .1s' }} />
                </div>
                <span style={{ fontSize: 11, color: C.sub, fontFamily: 'monospace', minWidth: 28 }}>{volume}%</span>
              </div>
            </div>
          </div>

          {/* latencia */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px' }}>
            <Sec label="Latencia (último turno)" />
            {latency ? (
              <>
                <LatencyBar label="LLM (EOT → respuesta)" ms={latency.llm} />
                <LatencyBar label="TTS (resp → 1er audio)" ms={latency.tts} />
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6 }}>
                  <LatencyBar label="Total RTT" ms={latency.total} maxMs={3000} />
                </div>
              </>
            ) : (
              <p style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', margin: 0 }}>
                {isLive ? 'esperando primer turno…' : 'sin datos'}
              </p>
            )}
          </div>

          {/* red */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px' }}>
            <Sec label="Red" />
            <Row l="Chunks mic →" v={sent} />
            <Row l="Chunks audio ←" v={received} />
          </div>

          {/* leyenda */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px' }}>
            <Sec label="Leyenda confianza" />
            {[[C.green, '≥ 92% alta'], [C.text, '75-91% normal'], [C.yellow, '55-74% dudosa'], [C.red, '< 55% baja']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: C.sub }}>{l}</span>
              </div>
            ))}
            <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>Palabras subrayadas = conf {'<'} 70%</div>
          </div>
        </div>

        {/* ── RIGHT: transcript ── */}
        <div className="vt-transcript" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 560 }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.sub, letterSpacing: 1, textTransform: 'uppercase' }}>Conversación</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: C.muted }}>palabras coloreadas por confianza</span>
              {transcript.length > 0 && (
                <button onClick={() => setTx([])} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 11 }}>limpiar</button>
              )}
            </div>
          </div>

          <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 8px' }}>
            {transcript.length === 0 && !partial && (
              <p style={{ fontSize: 13, color: C.muted, fontStyle: 'italic', padding: '8px 4px' }}>Sin actividad aún…</p>
            )}

            {transcript.map(line => {
              if (line.role !== 'sistema') turnN++
              return <TurnCard key={line.id} line={line} sessionStart={startRef.current} turnNum={line.role !== 'sistema' ? turnN : null} />
            })}

            {/* live partial */}
            {partial && (
              <div style={{ borderRadius: 10, background: '#0d0f20', border: `1px solid #1a1e38`, padding: '10px 14px', opacity: 0.75, marginBottom: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: C.muted, fontFamily: 'monospace', minWidth: 32 }}>
                    {fmtTs(Date.now() - startRef.current)}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>tú</span>
                  <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>en curso…</span>
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, paddingLeft: 40, color: C.text }}>
                  {partial}
                  <span style={{ display: 'inline-block', width: 2, height: 14, background: C.accent, borderRadius: 1, marginLeft: 3, verticalAlign: 'text-bottom', animation: 'blink 1s step-end infinite' }} />
                </div>
              </div>
            )}
            <div ref={txEndRef} />
          </div>

          {/* footer */}
          <div style={{ padding: '7px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 14, flexShrink: 0 }}>
            {[['STT', 'Deepgram Flux'], ['LLM', 'Cerebras'], ['TTS', 'ElevenLabs']].map(([k, v]) => (
              <span key={k} style={{ fontSize: 11, color: C.muted }}>
                <span style={{ color: C.sub, fontWeight: 600 }}>{k}</span> {v}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── micro components ──────────────────────────────────────────────────────────
function Sec({ label }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: C.sub, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
}
function Row({ l, v, c }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 12, color: C.sub }}>{l}</span>
      <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: c ?? C.text }}>{v}</span>
    </div>
  )
}
