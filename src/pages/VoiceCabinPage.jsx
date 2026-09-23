import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiArrowLeftLine } from 'react-icons/ri'
import { AlertTriangle, Clock3, Radio, Settings2, X } from './voice-cabin/icons'
import { CallStage } from './voice-cabin/CallStage'
import { MetricRail } from './voice-cabin/MetricRail'
import { SettingsDrawer } from './voice-cabin/SettingsDrawer'
import { TelemetryPanel } from './voice-cabin/TelemetryPanel'
import { useVoiceSession } from './voice-cabin/useVoiceSession'
import { formatClock, formatLatency } from './voice-cabin/lib/voiceMetrics'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../i18n'
import './voice-cabin.css'

// Cabina del stack Deepgram Flux → Cerebras → Fish Audio. Puerto de
// vendrava-voice-lab sobre el WebSocket /voice-sim/live que ya usa /voz/lab.
function CallTimer({ startedAt }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!startedAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  const seconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0
  return <time className="session-clock">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</time>
}

function ProviderBadge({ name, provider, status, simulated, locale = 'es' }) {
  const es = locale !== 'en'
  const label = simulated
    ? (es ? 'SIM' : 'SIM')
    : status === 'active' ? (es ? 'EN VIVO' : 'LIVE')
      : status === 'connecting' ? (es ? 'ENLACE' : 'LINK')
        : status === 'error' ? (es ? 'ERR' : 'ERR')
          : (es ? 'LISTO' : 'READY')
  const tone = simulated ? 'sim' : status
  return (
    <div className="provider-status" title={`${provider}: ${simulated ? (es ? 'simulado' : 'simulated') : status}`}>
      <span>{name}</span><i className={`provider-dot dot-${tone}`} /><small>{label}</small>
    </div>
  )
}

function providerLabel(provider) {
  return ({ deepgram: 'Deepgram Flux', cartesia: 'Cartesia Ink', cerebras: 'Cerebras', groq: 'Groq', deepseek: 'DeepSeek', fish: 'Fish Audio', minimax: 'MiniMax' })[provider] || provider
}

function EventStream({ view }) {
  const { locale } = useI18n()
  const es = locale !== 'en'
  const traces = view.traces.slice(0, 3)
  return (
    <section className="event-stream surface" aria-labelledby="event-stream-title">
      <header>
        <div><span className="eyebrow">{es ? 'Observabilidad' : 'Observability'}</span><h2 id="event-stream-title">{es ? 'Eventos' : 'Event stream'}</h2></div>
        <div className="event-legend"><span><i className="legend-info" /> INFO</span><span><i className="legend-active" /> {es ? 'EN VIVO' : 'LIVE'}</span><span><i className="legend-warn" /> {es ? 'AVISO' : 'WARN'}</span></div>
      </header>
      <div className="event-rows">
        {traces.length ? traces.map(trace => (
          <article className="event-row" key={trace.id}>
            <time>{formatClock(trace.at)}</time>
            <span className={`event-direction event-${trace.stage}`}>→</span>
            <b>{trace.stage === 'system' ? 'VOICE CORE' : trace.stage.toUpperCase()}</b>
            <code>{trace.label}</code>
            <span className="event-duration">{formatLatency(trace.durationMs)}</span>
            <i className={`event-state state-${trace.stage}`} />
          </article>
        )) : (
          <div className="events-empty"><Clock3 size={15} /> {es ? 'Los eventos aparecerán aquí en orden.' : 'Live stage events will appear here in timestamp order.'}</div>
        )}
      </div>
    </section>
  )
}

export default function VoiceCabinPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const { locale } = useI18n()
  const es = locale !== 'en'
  const [agentId, setAgentId] = useState(() => new URLSearchParams(window.location.search).get('agentId') || '')
  const [agentOptions, setAgentOptions] = useState([])
  const [runtimeProviders, setRuntimeProviders] = useState({ stt: 'deepgram', llm: 'cerebras', tts: 'fish', models: { stt: 'flux-general-multi', llm: 'gpt-oss-120b', tts: 's2.1-pro' } })
  const {
    view, settings, setSettings, phoneAudio, setPhoneAudio,
    startLive, stop, runDemo, sendText, toggleMicrophone, toggleSpeaker, interrupt, clearError,
  } = useVoiceSession({ token, agentId, locale })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isActive = view.mode === 'live' || view.mode === 'connecting' || view.mode === 'demo'

  useEffect(() => {
    apiFetch('/api/agents').then(r => (r.ok ? r.json() : null)).then(data => {
      if (Array.isArray(data)) setAgentOptions(data.map(agent => ({ id: agent.id, name: agent.name })))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!agentId) return
    let active = true
    apiFetch(`/api/agents/${agentId}`).then(r => r.ok ? r.json() : null).then(data => {
      if (!active || !data) return
      const runtime = data.settings?.runtime || {}
      setRuntimeProviders({
        stt: runtime.transcriptionStt?.provider || 'deepgram',
        llm: runtime.primaryLlm?.provider || 'cerebras',
        tts: runtime.tts?.provider || 'fish',
        models: {
          stt: runtime.transcriptionStt?.model || 'flux-general-multi',
          llm: runtime.primaryLlm?.model || 'gpt-oss-120b',
          tts: runtime.tts?.model || 's2.1-pro',
        },
      })
      const speed = Number(data.settings?.speechSpeed)
      setSettings(current => ({
        ...current,
        voiceId: data.voiceId || current.voiceId,
        speed: Number.isFinite(speed) && speed >= 0.8 && speed <= 1.2 ? speed : current.speed,
        speculative: typeof data.settings?.speculative === 'boolean' ? data.settings.speculative : current.speculative,
      }))
    }).catch(() => {})
    return () => { active = false }
  }, [agentId, setSettings])

  useEffect(() => {
    const onKey = event => {
      const target = event.target
      if (event.code === 'Escape') {
        if (settingsOpen) setSettingsOpen(false)
        else if (isActive) stop()
        return
      }
      if (target.matches('input, textarea, select, button')) return
      if (event.code === 'Space' && !isActive && !settingsOpen) {
        event.preventDefault()
        void startLive()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isActive, settingsOpen, startLive, stop])

  return (
    <div className="cabin-root">
      <div className="cabin-shell" data-testid="vendrava-voice-cabin">
        <header className="topbar">
          <div className="brand-lockup">
            <button className="settings-button" type="button" onClick={() => navigate('/voz/lab')} aria-label="Volver al laboratorio de voz">
              <RiArrowLeftLine size={16} />
            </button>
            <span className="brand">VENDRAVA</span>
            <i />
            <span className="product-title">{es ? 'Cabina de voz' : 'Voice Cabin'} <b>/ {es ? 'Español' : 'English'}</b></span>
          </div>

          <div className={`session-status ${isActive ? 'is-live' : ''} ${view.mode === 'demo' ? 'is-demo' : ''}`}>
            <i /> <b>{view.mode === 'demo' ? 'DEMO' : isActive ? (es ? 'EN VIVO' : 'LIVE') : (es ? 'LISTO' : 'READY')}</b>
            <CallTimer startedAt={view.startedAt} />
          </div>

          <div className="topbar-tools">
            <div className="provider-cluster" aria-label={es ? 'Estado de los proveedores' : 'Provider health'}>
              <ProviderBadge locale={locale} name={providerLabel(runtimeProviders.stt)} provider={runtimeProviders.stt} status={view.providers[runtimeProviders.stt]} simulated={view.mode === 'demo'} />
              <ProviderBadge locale={locale} name={providerLabel(runtimeProviders.llm)} provider={runtimeProviders.llm} status={view.providers[runtimeProviders.llm]} simulated={view.mode === 'demo'} />
              <ProviderBadge locale={locale} name={providerLabel(runtimeProviders.tts)} provider={runtimeProviders.tts} status={view.providers[runtimeProviders.tts]} simulated={view.mode === 'demo'} />
            </div>
            <select
              className="settings-button"
              value={agentId}
              onChange={event => setAgentId(event.target.value)}
              disabled={isActive}
              aria-label="Agente"
            >
              <option value="">Agente por defecto</option>
              {agentOptions.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
              <button className="settings-button" type="button" onClick={() => setSettingsOpen(true)} aria-label={es ? 'Abrir ajustes de voz' : 'Open voice settings'}>
              <Settings2 size={18} /><span>{es ? 'Ajustes' : 'Settings'}</span>
            </button>
          </div>
        </header>

        <main>
          <MetricRail view={view} />
          <div className="voice-workspace">
            <CallStage
              locale={locale}
              view={view}
              onStart={startLive}
              onStop={stop}
              onDemo={runDemo}
              onSendText={sendText}
              onToggleMicrophone={toggleMicrophone}
              onToggleSpeaker={toggleSpeaker}
              onInterrupt={interrupt}
            />
            <TelemetryPanel view={view} runtime={runtimeProviders} locale={locale} />
          </div>
          <EventStream view={view} />
        </main>

        <footer className="app-footer">
          <span><Radio size={12} /> Las claves nunca salen del servidor · el audio no se escribe a disco</span>
          <span>{providerLabel(runtimeProviders.stt)} {runtimeProviders.models.stt} → {providerLabel(runtimeProviders.llm)} {runtimeProviders.models.llm} → {providerLabel(runtimeProviders.tts)} {runtimeProviders.models.tts}</span>
        </footer>

        <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} setSettings={setSettings} phoneAudio={phoneAudio} setPhoneAudio={setPhoneAudio} health={view.health} runtime={runtimeProviders} locale={locale} />

        {view.error && (
          <div className="error-toast" role="alert">
            <AlertTriangle size={18} />
            <span>{view.error}</span>
            <button type="button" onClick={clearError} aria-label={es ? 'Cerrar error' : 'Dismiss error'}><X size={16} /></button>
          </div>
        )}
      </div>
    </div>
  )
}
