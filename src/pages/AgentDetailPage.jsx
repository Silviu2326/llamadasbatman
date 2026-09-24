import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  RiArrowLeftLine, RiPlayLine, RiBookOpenLine, RiPhoneLine,
  RiCalendarLine, RiBarChartLine, RiSettings3Line,
  RiBrainLine, RiMicLine, RiVolumeUpLine, RiShieldCheckLine, RiSave3Line,
  RiFlowChart, RiLockLine, RiTimeLine, RiArrowRightLine,
  RiCheckLine, RiMessage2Line, RiPulseLine, RiCpuLine, RiSparkling2Line, RiLoader4Line, RiMagicLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { OUTCOME_COLOR, outcomeLabel } from '../lib/callOutcome'
import { useI18n } from '../i18n'
import AgentStrategyPanel from '../components/agents/AgentStrategyPanel'
import AgentDetailNav from '../components/agents/AgentDetailNav'
import AgentReadinessChecklist from '../components/agents/AgentReadinessChecklist'
import AgentSafetyPanel from '../components/agents/AgentSafetyPanel'
import { LIFECYCLE, lifecycleOf, apiErrorMessage, readBody } from '../components/agents/agentLifecycle'
import { WEEKDAYS, TIME_ZONES, limitsFromSettings, limitsToSettings } from '../components/agents/operationalLimits'
import AgentGovernancePanel from '../components/agents/AgentGovernancePanel'
import AgentSimpleSetup from '../components/agents/AgentSimpleSetup'
import AgentKnowledgePanel from '../components/agents/AgentKnowledgePanel'
import PageLoadingState from '../components/ui/PageLoadingState'
import '../dashboard.css'
import '../components/agents.css'
import './agent-detail.css'
import './sales-detail-standard.css'

// Colores por `lifecycleStatus` (Agent.lifecycleStatus): el estado real del
// agente, el que cambian publish/pause/resume/archive.
const STATUS = {
  active:   { color: 'var(--success)', bg: '#10b98112', border: '#10b98130' },
  paused:   { color: 'var(--warn)', bg: '#f59e0b12', border: '#f59e0b30' },
  draft:    { color: 'var(--muted)', bg: '#94a3b812', border: '#94a3b830' },
  archived: { color: 'var(--dim)', bg: '#6b728012', border: '#6b728030' },
}

const AGENT_TYPE_LABELS = { sales: 'Ventas', receptionist: 'Recepción', qualification: 'Cualificación', appointment: 'Citas', support: 'Soporte', collections: 'Cobros', handoff: 'Transferencias' }

const TABS = ['Conversaciones', 'Rendimiento', 'Configuración', 'Playbooks']

const RUNTIME_STACK = [
  { key: 'primaryLlm', Icon: RiBrainLine, eyebrow: 'CEREBRO', detail: 'Respuesta principal del agente', tone: 'violet' },
  { key: 'transcriptionStt', Icon: RiMicLine, eyebrow: 'TRANSCRIPCIÓN', detail: 'Texto y detección de turnos', tone: 'cyan' },
  { key: 'tts', Icon: RiVolumeUpLine, eyebrow: 'VOZ', detail: 'Síntesis en streaming', tone: 'green' },
]

const RUNTIME_DEFAULTS = {
  primaryLlm: { provider: 'cerebras', model: 'gpt-oss-120b' },
  guru: { provider: 'cerebras', model: 'gpt-oss-120b', enabled: true, structure: 'sales-strategist', instructions: '', contextMode: 'full' },
  transcriptionStt: { provider: 'deepgram', model: 'flux-general-multi' },
  emotionStt: { provider: 'cartesia', model: 'ink-2', enabled: false },
  tts: { provider: 'fish', model: 's2.1-pro' },
  temperature: '0.58',
  transcriptionLanguage: 'auto',
  emotionMode: 'turn',
  turnTaking: 'balanced',
}

const GURU_STRUCTURES = [
  { value: 'sales-strategist', label: 'Estratega comercial', description: 'Detecta intención, fricción y el siguiente paso más útil.' },
  { value: 'qualification-coach', label: 'Coach de cualificación', description: 'Prioriza encaje, urgencia, decisores y motivos de descarte.' },
  { value: 'objection-coach', label: 'Coach de objeciones', description: 'Aclara la preocupación real y propone una respuesta basada en evidencia.' },
  { value: 'customer-success', label: 'Acompañamiento de cliente', description: 'Cuida satisfacción, riesgo, adopción y continuidad de la relación.' },
]

const RUNTIME_CATALOG = {
  llm: [
    { value: 'cerebras', label: 'Cerebras', models: ['gpt-oss-120b'] },
    { value: 'groq', label: 'Groq', models: ['llama-3.3-70b-versatile', 'llama-4-scout-17b-16e-instruct', 'qwen/qwen3-32b'] },
    { value: 'deepseek', label: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'] },
  ],
  stt: [
    { value: 'deepgram', label: 'Deepgram', models: ['flux-general-multi'] },
    { value: 'cartesia', label: 'Cartesia', models: ['ink-2'] },
  ],
  tts: [
    { value: 'fish', label: 'Fish Audio', models: ['s2.1-pro', 's2.1-pro-free', 's2-pro'] },
    { value: 'minimax', label: 'MiniMax', models: ['speech-2.8-turbo', 'speech-2.8-hd'] },
  ],
}

function runtimeProviderLabel(type, provider) {
  return RUNTIME_CATALOG[type]?.find(item => item.value === provider)?.label || provider
}

function runtimeModelLabel(model) {
  return model === 'flux-general-multi' ? 'Flux Multilingual' : model
}

function normalizeRuntimeSettings(value) {
  const current = value && typeof value === 'object' ? value : {}
  const legacyGuru = current.guru || current.fallbackLlm || {}
  return {
    ...RUNTIME_DEFAULTS,
    ...current,
    primaryLlm: { ...RUNTIME_DEFAULTS.primaryLlm, ...(current.primaryLlm || {}) },
    guru: { ...RUNTIME_DEFAULTS.guru, ...legacyGuru },
    ...(current.fallbackLlm ? { fallbackLlm: current.fallbackLlm } : {}),
    transcriptionStt: { ...RUNTIME_DEFAULTS.transcriptionStt, ...(current.transcriptionStt || {}) },
    emotionStt: { ...RUNTIME_DEFAULTS.emotionStt, ...(current.emotionStt || {}) },
    tts: { ...RUNTIME_DEFAULTS.tts, ...(current.tts || {}) },
  }
}

const DEFAULT_BEHAVIOR = {
  formality: 'auto',
  verbosity: 'balanced',
  openingLine: '',
  structure: '',
  doNotSay: '',
}

function updateNestedSettings(current, patch) {
  return { ...current, ...patch, behavior: { ...DEFAULT_BEHAVIOR, ...(current.behavior || {}), ...(patch.behavior || {}) } }
}

function RuntimeStackCard({ item, runtime }) {
  const { Icon } = item
  const type = item.key === 'primaryLlm' ? 'llm' : item.key === 'transcriptionStt' ? 'stt' : 'tts'
  const selected = runtime[item.key]
  return <article className={`agent-runtime-card is-${item.tone}`}>
    <div className="agent-runtime-card-icon"><Icon aria-hidden="true" /></div>
    <div className="agent-runtime-card-copy">
      <span className="agent-runtime-eyebrow">{item.eyebrow}</span>
      <strong>{runtimeProviderLabel(type, selected.provider)}</strong>
      <span className="agent-runtime-model">{runtimeModelLabel(selected.model)}</span>
      <small>{item.detail}</small>
    </div>
    <span className="agent-runtime-live"><i /> Configurable</span>
  </article>
}

function AgentRuntimePanel({ draft, agentId, onChange, onNavigate, playbooks = [] }) {
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const settings = draft.settings || {}
  const runtime = normalizeRuntimeSettings(settings.runtime)
  const behavior = { ...DEFAULT_BEHAVIOR, ...(settings.behavior || {}) }
  const setBehavior = patch => onChange({ settings: updateNestedSettings(settings, { behavior: patch }) })
  const setRuntime = patch => onChange({ settings: updateNestedSettings(settings, { runtime: { ...runtime, ...patch } }) })
  const setRuntimeNode = (key, patch) => setRuntime({ [key]: { ...runtime[key], ...patch } })
  const changeRuntimeProvider = (key, type, provider) => {
    const option = RUNTIME_CATALOG[type].find(item => item.value === provider)
    setRuntimeNode(key, { provider, model: option?.models?.[0] || '' })
  }
  const guruStructures = [
    ...GURU_STRUCTURES,
    ...playbooks.map(playbook => ({
      value: `playbook:${playbook.id}`,
      label: `Playbook · ${playbook.name}`,
      description: playbook.description || 'Estructura cargada desde un playbook personalizado.',
    })),
  ]
  const selectedGuruStructure = guruStructures.find(item => item.value === runtime.guru.structure)
  const changeGuruStructure = value => {
    const playbook = playbooks.find(item => `playbook:${item.id}` === value)
    const loadedInstructions = playbook
      ? [playbook.description, playbook.steps ? `Pasos del playbook:\n${JSON.stringify(playbook.steps)}` : ''].filter(Boolean).join('\n').slice(0, 4_000)
      : runtime.guru.instructions
    setRuntimeNode('guru', { structure: value, instructions: loadedInstructions })
  }
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])
  const field = (label, value, change, placeholder) => <label className="agent-center-field">
    <span>{label}</span>
    <input value={value || ''} onChange={event => change(event.target.value)} placeholder={placeholder || ''} />
  </label>

  const previewVoice = async () => {
    setPreviewBusy(true)
    setPreviewError('')
    try {
      const response = await apiFetch('/api/calls/tts-latency-demo', {
        method: 'POST',
        body: JSON.stringify({
          text: behavior.openingLine?.trim() || 'Hola, soy tu agente de Vendrava. ¿Tienes un minuto para que te explique por qué te llamo?',
          voiceId: draft.voiceId || '',
          model: runtime.tts.provider === 'fish' ? runtime.tts.model : 's2.1-pro',
          latency: 'balanced',
          speed: Number(settings.speechSpeed || 1),
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'No se pudo generar la muestra de voz.')
      }
      const nextUrl = URL.createObjectURL(await response.blob())
      setPreviewUrl(nextUrl)
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'No se pudo generar la muestra de voz.')
    } finally {
      setPreviewBusy(false)
    }
  }

  return <section className="agent-operating-center" aria-labelledby="agent-operating-center-title">
    <div className="agent-center-heading">
      <div>
        <span className="agent-center-kicker"><RiSparkling2Line /> CENTRO OPERATIVO</span>
        <h2 id="agent-operating-center-title">Cómo piensa, escucha y responde</h2>
        <p>Todo lo que define una llamada está aquí. Cambia el criterio y guarda para que el siguiente contacto lo use.</p>
      </div>
      <div className="agent-center-flow" aria-label="Flujo de una llamada">
        <span><RiMicLine /> Escucha</span><RiArrowRightLine /><span><RiBrainLine /> Decide</span><RiArrowRightLine /><span><RiVolumeUpLine /> Responde</span>
      </div>
    </div>

    <div className="agent-runtime-stack" aria-label="Stack de voz">
      {RUNTIME_STACK.map(item => <RuntimeStackCard item={item} runtime={runtime} key={item.key} />)}
    </div>

    <div className="agent-runtime-config">
      <div className="agent-runtime-config-heading">
        <div><h3><RiCpuLine /> Configuración del pipeline</h3><p>Combina proveedores por función. La selección queda guardada en este agente.</p></div>
        <span><RiShieldCheckLine /> BYOK / conexiones de la organización</span>
      </div>
      <div className="agent-runtime-config-grid">
        <div className="agent-runtime-config-group is-violet">
          <div className="agent-runtime-config-title"><RiBrainLine /><div><strong>Respuesta principal</strong><small>El modelo que responde al lead</small></div></div>
          <div className="agent-center-form-grid">
            <label className="agent-center-field"><span>Proveedor</span><select value={runtime.primaryLlm.provider} onChange={event => changeRuntimeProvider('primaryLlm', 'llm', event.target.value)}>{RUNTIME_CATALOG.llm.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
            <label className="agent-center-field"><span>Modelo</span><select value={runtime.primaryLlm.model} onChange={event => setRuntimeNode('primaryLlm', { model: event.target.value })}>{(RUNTIME_CATALOG.llm.find(item => item.value === runtime.primaryLlm.provider)?.models || []).map(model => <option value={model} key={model}>{model}</option>)}</select></label>
          </div>
        </div>
        <div className="agent-runtime-config-group is-violet agent-guru-config-group">
          <div className="agent-runtime-config-title"><RiSparkling2Line /><div><strong>Modelo Guru / estratega</strong><small>Analiza la llamada y ajusta al modelo que habla</small></div></div>
          <div className="agent-center-form-grid">
            <label className="agent-center-field"><span>Proveedor</span><select value={runtime.guru.provider} onChange={event => changeRuntimeProvider('guru', 'llm', event.target.value)}>{RUNTIME_CATALOG.llm.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
            <label className="agent-center-field"><span>Modelo</span><select value={runtime.guru.model} onChange={event => setRuntimeNode('guru', { model: event.target.value })}>{(RUNTIME_CATALOG.llm.find(item => item.value === runtime.guru.provider)?.models || []).map(model => <option value={model} key={model}>{model}</option>)}</select></label>
          </div>
          <label className="agent-center-field agent-guru-structure-field"><span>Estructura base</span><select value={runtime.guru.structure} onChange={event => changeGuruStructure(event.target.value)}>{guruStructures.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
          <p className="agent-guru-structure-description">{selectedGuruStructure?.description || 'Estructura personalizada del Guru.'}</p>
          <label className="agent-center-field agent-guru-instructions"><span>Personalizar criterio del Guru</span><textarea value={runtime.guru.instructions || ''} onChange={event => setRuntimeNode('guru', { instructions: event.target.value })} placeholder="Ej. prioriza margen, detecta riesgo de abandono y propone solo un siguiente paso…" /></label>
          <label className="agent-runtime-inline-toggle"><input type="checkbox" checked={runtime.guru.enabled !== false} onChange={event => setRuntimeNode('guru', { enabled: event.target.checked })} /><span>Activar estratega en segundo plano</span></label>
          <p className="agent-guru-boundary"><RiLockLine /> El Guru nunca habla con el cliente: solo devuelve una directiva breve que modifica el contexto del modelo rápido.</p>
        </div>
        <div className="agent-runtime-config-group is-cyan">
          <div className="agent-runtime-config-title"><RiMicLine /><div><strong>Transcripción</strong><small>Texto visible y turn-taking</small></div></div>
          <div className="agent-center-form-grid">
            <label className="agent-center-field"><span>Proveedor STT</span><select value={runtime.transcriptionStt.provider} onChange={event => changeRuntimeProvider('transcriptionStt', 'stt', event.target.value)}>{RUNTIME_CATALOG.stt.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
            <label className="agent-center-field"><span>Modelo STT</span><select value={runtime.transcriptionStt.model} onChange={event => setRuntimeNode('transcriptionStt', { model: event.target.value })}>{(RUNTIME_CATALOG.stt.find(item => item.value === runtime.transcriptionStt.provider)?.models || []).map(model => <option value={model} key={model}>{runtimeModelLabel(model)}</option>)}</select></label>
          </div>
        </div>
        <div className="agent-runtime-config-group is-cyan">
          <div className="agent-runtime-config-title"><RiPulseLine /><div><strong>Análisis de emociones</strong><small>Un segundo STT para señales del interlocutor</small></div></div>
          <div className="agent-center-form-grid">
            <label className="agent-center-field"><span>Proveedor STT</span><select value={runtime.emotionStt.provider} onChange={event => changeRuntimeProvider('emotionStt', 'stt', event.target.value)}>{RUNTIME_CATALOG.stt.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
            <label className="agent-center-field"><span>Modelo STT</span><select value={runtime.emotionStt.model} onChange={event => setRuntimeNode('emotionStt', { model: event.target.value })}>{(RUNTIME_CATALOG.stt.find(item => item.value === runtime.emotionStt.provider)?.models || []).map(model => <option value={model} key={model}>{runtimeModelLabel(model)}</option>)}</select></label>
          </div>
          <label className="agent-runtime-inline-toggle"><input type="checkbox" checked={runtime.emotionStt.enabled === true} onChange={event => setRuntimeNode('emotionStt', { enabled: event.target.checked })} /><span>Activar análisis en cada turno</span></label>
        </div>
        <div className="agent-runtime-config-group is-green">
          <div className="agent-runtime-config-title"><RiVolumeUpLine /><div><strong>Síntesis de voz</strong><small>Proveedor y modelo de salida</small></div></div>
          <div className="agent-center-form-grid">
            <label className="agent-center-field"><span>Proveedor TTS</span><select value={runtime.tts.provider} onChange={event => changeRuntimeProvider('tts', 'tts', event.target.value)}>{RUNTIME_CATALOG.tts.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
            <label className="agent-center-field"><span>Modelo TTS</span><select value={runtime.tts.model} onChange={event => setRuntimeNode('tts', { model: event.target.value })}>{(RUNTIME_CATALOG.tts.find(item => item.value === runtime.tts.provider)?.models || []).map(model => <option value={model} key={model}>{model}</option>)}</select></label>
          </div>
        </div>
      </div>
      <div className="agent-runtime-advanced-grid">
        <label className="agent-center-field"><span>Temperatura de respuesta</span><select value={runtime.temperature} onChange={event => setRuntime({ temperature: event.target.value })}><option value="0.2">0.2 · precisa</option><option value="0.4">0.4 · estable</option><option value="0.58">0.58 · natural</option><option value="0.8">0.8 · creativa</option></select></label>
        <label className="agent-center-field"><span>Idioma de transcripción</span><select value={runtime.transcriptionLanguage} onChange={event => setRuntime({ transcriptionLanguage: event.target.value })}><option value="auto">Automático</option><option value="es">Español</option><option value="en">English</option></select></label>
        <label className="agent-center-field"><span>Lectura emocional</span><select value={runtime.emotionMode} onChange={event => setRuntime({ emotionMode: event.target.value })}><option value="turn">Cada turno</option><option value="important">Solo momentos clave</option><option value="off">Desactivada</option></select></label>
        <label className="agent-center-field"><span>Ritmo de turnos</span><select value={runtime.turnTaking} onChange={event => setRuntime({ turnTaking: event.target.value })}><option value="fast">Rápido</option><option value="balanced">Equilibrado</option><option value="natural">Natural</option></select></label>
      </div>
      <p className="agent-runtime-config-note"><RiLockLine /> Las claves nunca se guardan en el agente: se resuelven desde las conexiones de la organización y cada proveedor debe estar configurado antes de usarlo.</p>
    </div>

    <div className="agent-center-grid">
      <div id="agent-behavior" className="agent-center-section agent-behavior-section">
        <div className="agent-center-section-heading"><div><h3><RiMessage2Line /> Personalidad de la conversación</h3><p>Estas reglas se añaden al prompt del agente en cada llamada.</p></div><span className="agent-center-section-status"><RiCheckLine /> Configurable</span></div>
        <div className="agent-center-form-grid">
          <label className="agent-center-field"><span>Idioma principal</span><select value={draft.language || 'es'} onChange={event => onChange({ language: event.target.value })}><option value="es">Español</option><option value="en">English</option></select></label>
          <label className="agent-center-field"><span>Formalidad</span><select value={behavior.formality} onChange={event => setBehavior({ formality: event.target.value })}><option value="auto">Adaptar al interlocutor</option><option value="tu">Tú, cercano</option><option value="usted">Usted, formal</option></select></label>
          <label className="agent-center-field"><span>Nivel de detalle</span><select value={behavior.verbosity} onChange={event => setBehavior({ verbosity: event.target.value })}><option value="brief">Breve y directo</option><option value="balanced">Equilibrado</option><option value="detailed">Detallado</option></select></label>
          {field('Frase de apertura', behavior.openingLine, value => setBehavior({ openingLine: value }), 'Ej. Hola, soy Clara de Vendrava…')}
        </div>
        <div className="agent-center-form-grid agent-center-form-grid-wide">
          <label className="agent-center-field"><span>Mensajes que debe priorizar</span><textarea value={settings.keyMessages || ''} onChange={event => onChange({ settings: { ...settings, keyMessages: event.target.value } })} placeholder="Qué debe explicar, demostrar o recordar…" /></label>
          <label className="agent-center-field"><span>Qué nunca debe decir</span><textarea value={behavior.doNotSay || ''} onChange={event => setBehavior({ doNotSay: event.target.value })} placeholder="Promesas, precios o afirmaciones que debe evitar…" /></label>
        </div>
      </div>

      <div className="agent-center-section agent-voice-section">
        <div className="agent-center-section-heading"><div><h3><RiVolumeUpLine /> Voz y latencia</h3><p>Preferencias de voz y respuesta para este agente.</p></div><span className="agent-center-section-status is-secure"><RiShieldCheckLine /> Conectado</span></div>
        <label className="agent-center-field"><span>Voice ID de Fish Audio</span><input value={draft.voiceId || ''} onChange={event => onChange({ voiceId: event.target.value })} placeholder="ID de voz de referencia" /></label>
        <div className="agent-center-form-grid">
          <label className="agent-center-field"><span>Velocidad</span><select value={settings.speechSpeed || '1.0'} onChange={event => onChange({ settings: { ...settings, speechSpeed: event.target.value } })}><option value="0.8">0.8 · pausada</option><option value="0.9">0.9 · calmada</option><option value="1.0">1.0 · natural</option><option value="1.1">1.1 · ágil</option><option value="1.2">1.2 · rápida</option></select></label>
          <div className="agent-runtime-locked"><RiMicLine /><div><strong>{runtimeProviderLabel('stt', runtime.transcriptionStt.provider)} · {runtimeModelLabel(runtime.transcriptionStt.model)}</strong><small>{runtime.transcriptionLanguage === 'auto' ? 'Idioma automático' : runtime.transcriptionLanguage === 'es' ? 'Español' : 'English'} · {runtime.turnTaking} · configurable arriba</small></div></div>
        </div>
        <div className="agent-voice-actions">
          <button type="button" className="agent-voice-preview-button" onClick={previewVoice} disabled={previewBusy}><RiVolumeUpLine /> {previewBusy ? <><RiLoader4Line className="is-spinning" /> Generando muestra…</> : 'Escuchar muestra'}</button>
          <button type="button" className="agent-voice-test-button" onClick={() => onNavigate(`/voz/cabina?agentId=${encodeURIComponent(agentId)}`)} title="La cabina del navegador no crea ninguna llamada en el CRM y no cuenta como prueba para publicar."><RiPlayLine /> Cabina del navegador (demo)</button>
          {previewUrl && <audio className="agent-preview-audio" controls src={previewUrl}>Tu navegador no puede reproducir esta muestra.</audio>}
        </div>
        {previewError && <p className="agent-preview-error" role="alert">{previewError}</p>}
        <label className="agent-center-toggle"><span><strong>Respuesta anticipada</strong><small>Empieza a pensar al detectar el fin probable del turno y solo publica la respuesta cuando se confirma.</small></span><input type="checkbox" checked={settings.speculative !== false} onChange={event => onChange({ settings: { ...settings, speculative: event.target.checked } })} /><i aria-hidden="true"><b /></i></label>
        <div className="agent-voice-note"><RiPulseLine /><span>La interrupción y el fin de turno se detectan en tiempo real para mantener una conversación natural.</span></div>
      </div>
    </div>

    <div className="agent-center-bottom-grid">
      <div className="agent-center-mini-card"><div className="agent-mini-icon"><RiFlowChart /></div><div><strong>Ruta de respuesta</strong><span>Estrategia → playbook → fuentes → siguiente acción</span></div></div>
      <button type="button" className="agent-center-link" onClick={() => onNavigate('/knowledge-base')}><RiBookOpenLine /><span><strong>Fuentes verificadas</strong><small>Gestiona el conocimiento que puede consultar</small></span><RiArrowRightLine /></button>
      <div className="agent-center-mini-card"><div className="agent-mini-icon is-blue"><RiTimeLine /></div><div><strong>Diseñado para llamadas</strong><span>Streaming de audio en los tres pasos</span></div></div>
    </div>
  </section>
}

// Etiquetas y colores salen de src/lib/callOutcome.js — antes este mapa
// etiquetaba `rejected` y `callback`, que el backend no escribe nunca.

// Tab "Configuración": límites operativos reales (Agent.settings.operationalLimits,
// aplicados por el worker antes de marcar). Los campos sin efecto que había
// aquí (tono de voz, tiempo máximo por llamada, reintentos) se retiraron.
function OperationalLimitsForm({ value, onChange, accent }) {
  const toggleDay = code => onChange({ ...value, activeDays: value.activeDays.includes(code) ? value.activeDays.filter(day => day !== code) : [...value.activeDays, code] })
  const fieldStyle = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit', minWidth: 0 }
  const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 0', borderBottom: '1px solid var(--line)' }
  return <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 'clamp(14px,3vw,18px)' }}>
    <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>Límites operativos</p>
    <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--dim)' }}>Se aplican en cada llamada de campaña. Un contacto fuera de ventana se reprograma, no se descarta.</p>
    <div style={rowStyle}><label htmlFor="agent-limit-max" style={{ fontSize: 12.5, color: 'var(--dim)' }}>Máx. llamadas/día</label><input id="agent-limit-max" type="number" min="1" max="10000" value={value.maxCallsPerDay} onChange={event => onChange({ ...value, maxCallsPerDay: event.target.value })} placeholder="Sin límite" style={{ ...fieldStyle, width: 120, textAlign: 'right' }} /></div>
    <div style={rowStyle}><span style={{ fontSize: 12.5, color: 'var(--dim)' }}>Días activos</span><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{WEEKDAYS.map(([code, label]) => { const on = value.activeDays.includes(code); return <button type="button" key={code} aria-pressed={on} onClick={() => toggleDay(code)} style={{ ...fieldStyle, cursor: 'pointer', padding: '5px 9px', fontWeight: 600, color: on ? accent : 'var(--dim)', borderColor: on ? accent : 'var(--line)' }}>{label}</button> })}</div></div>
    <div style={rowStyle}><label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--dim)', cursor: 'pointer' }}><input type="checkbox" checked={value.scheduleEnabled} onChange={event => onChange({ ...value, scheduleEnabled: event.target.checked })} /> Horario de llamadas</label><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="time" value={value.start} disabled={!value.scheduleEnabled} onChange={event => onChange({ ...value, start: event.target.value })} style={fieldStyle} /><span style={{ color: 'var(--dim)' }}>–</span><input type="time" value={value.end} disabled={!value.scheduleEnabled} onChange={event => onChange({ ...value, end: event.target.value })} style={fieldStyle} /></div></div>
    <div style={{ ...rowStyle, borderBottom: 'none' }}><label htmlFor="agent-limit-tz" style={{ fontSize: 12.5, color: 'var(--dim)' }}>Zona horaria</label><select id="agent-limit-tz" value={value.timezone} onChange={event => onChange({ ...value, timezone: event.target.value })} style={fieldStyle}><option value="">Europe/Madrid (por defecto)</option>{TIME_ZONES.map(zone => <option key={zone} value={zone}>{zone}</option>)}</select></div>
    {value.scheduleEnabled && value.start >= value.end ? <p role="alert" style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--danger-soft)' }}>La hora de inicio debe ser anterior a la de fin.</p> : null}
  </div>
}

function toAgent(d, stats) {
  return {
    id: d.id, name: d.name, role: d.role, agentType: d.agentType || 'sales',
    desc: d.description || d.systemPrompt || '',
    systemPrompt: d.systemPrompt || '',
    color: 'var(--accent)', bg: '#6366f120', verified: false,
    lifecycleStatus: lifecycleOf(d),
    objetivo: d.systemPrompt || '',
    agentType: d.agentType || 'sales', callDirection: d.callDirection || 'both', language: d.language || 'en',
    voiceId: d.voiceId || '', settings: d.settings || {},
    calls: stats?.calls ?? 0, conv: stats ? Math.round((stats.meetingsScheduled / (stats.calls || 1)) * 100) : 0,
    stats: [
      { label: 'Llamadas totales', value: stats?.calls ?? 0, pct: '—', hint: stats?.calls ? 'Registradas en el agente' : 'Aún no hay llamadas', Icon: RiPhoneLine },
      { label: 'Reuniones', value: stats?.meetingsScheduled ?? 0, pct: '—', hint: stats?.meetingsScheduled ? 'Agendadas desde llamadas' : 'Ninguna agendada', Icon: RiCalendarLine },
      { label: 'Sentimiento medio', value: stats ? (stats.avgSentimentScore?.toFixed(2) ?? '—') : '—', pct: '—', hint: stats?.calls ? 'Sobre llamadas analizadas' : 'Necesita conversaciones', Icon: RiBarChartLine },
      { label: 'Tasa de cierre', value: stats ? `${Math.round((stats.meetingsScheduled / (stats.calls || 1)) * 100)}%` : '—', pct: '—', hint: stats?.calls ? 'Reuniones sobre llamadas' : 'Necesita conversaciones', Icon: RiBarChartLine },
    ],
  }
}

export default function AgentDetailPage() {
  const { locale } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const [agent, setAgent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState('Conversaciones')
  const [lifecycle, setLifecycle] = useState('draft')
  const [workspace, setWorkspace] = useState(null)
  const [savedConfig, setSavedConfig] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [toggleError, setToggleError] = useState('')
  const [toggleBusy, setToggleBusy] = useState(false)
  const [limits, setLimits] = useState(limitsFromSettings({}))
  const [agentSettings, setAgentSettings] = useState({})
  const [draft, setDraft] = useState({ settings: { behavior: DEFAULT_BEHAVIOR } })
  const [savedDraftSnapshot, setSavedDraftSnapshot] = useState('')
  const [saving, setSaving] = useState(false)
  const [playbooks, setPlaybooks] = useState([])
  const [recentCalls, setRecentCalls] = useState([])
  const [timeseries, setTimeseries] = useState(null)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('agent-detail-view-mode') || 'simple')
  const [governanceRequest, setGovernanceRequest] = useState({ section: 'basic', nonce: 0 })

  const changeViewMode = mode => {
    setViewMode(mode)
    localStorage.setItem('agent-detail-view-mode', mode)
    requestAnimationFrame(() => document.getElementById('agent-view-mode')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/agents/${id}`).then(r => r.ok ? r.json() : null),
      // Secundarios: si uno falla la ficha se sigue mostrando, solo pierde ese bloque.
      apiFetch(`/api/agents/${id}/stats`).then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch('/api/playbooks').then(r => r.ok ? r.json() : []).catch(() => null),
      apiFetch(`/api/calls?agentId=${id}&limit=20`).then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch(`/api/agents/${id}/timeseries?days=30`).then(r => r.ok ? r.json() : null).catch(() => null),
      apiFetch(`/api/agents/${id}/workspace`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([data, stats, pbList, callsData, series, ws]) => {
      setRecentCalls(Array.isArray(callsData?.data) ? callsData.data : [])
      setTimeseries(series)
      if (ws) setWorkspace(ws)
      if (data) {
        const a = toAgent(data, stats)
        setAgent(a)
        setLifecycle(lifecycleOf(data))
        const settings = data.settings || {}
        setAgentSettings(settings)
        const nextDraft = {
          name: data.name || '', role: data.role || '', agentType: data.agentType || 'sales', callDirection: data.callDirection || 'both',
          description: data.description || '', phoneNumber: data.phoneNumber || '', monthlyMinuteLimit: data.monthlyMinuteLimit || null,
          language: data.language || 'es', voiceId: data.voiceId || '', systemPrompt: data.systemPrompt || '',
          settings: updateNestedSettings(settings, {}),
        }
        setDraft(nextDraft)
        setSavedDraftSnapshot(JSON.stringify(nextDraft))
        setLimits(limitsFromSettings(settings))
      }
      setPlaybooks(Array.isArray(pbList) ? pbList : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  // `?section=quality` (desde la lista de agentes) abre directamente la prueba real.
  useEffect(() => {
    const section = searchParams.get('section')
    if (!loading && agent && section) {
      changeViewMode('professional')
      setGovernanceRequest(current => ({ section, nonce: current.nonce + 1 }))
      setTimeout(() => document.getElementById('agent-governance')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    }
  }, [loading, agent?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshWorkspace = async () => {
    const response = await apiFetch(`/api/agents/${id}/workspace`)
    if (!response.ok) return null
    const next = await response.json()
    setWorkspace(next)
    setLifecycle(lifecycleOf(next.agent))
    return next
  }

  // El estado solo cambia por publish/pause/resume (nunca por PUT). Publicar
  // exige readiness completo; reanudar vuelve a borrador si algo caducó.
  const changeLifecycle = async () => {
    const action = lifecycle === 'active' ? 'pause' : lifecycle === 'paused' ? 'resume' : lifecycle === 'draft' ? 'publish' : null
    if (!action || toggleBusy) return
    setToggleError(''); setToggleBusy(true)
    try {
      const response = await apiFetch(`/api/agents/${id}/${action}`, { method: 'POST' })
      const body = await readBody(response)
      if (!response.ok) throw new Error(apiErrorMessage(body, 'No se pudo cambiar el estado del agente.'))
      if (body.lifecycleStatus) setLifecycle(body.lifecycleStatus)
      if (action === 'resume' && body.lifecycleStatus === 'draft') setToggleError(`Reanudado como borrador: ${apiErrorMessage({ blockers: body.blockers }, 'vuelve a publicar cuando esté listo.')}`)
      await refreshWorkspace()
    } catch (error) { setToggleError(error.message || 'No se pudo cambiar el estado del agente.') } finally { setToggleBusy(false) }
  }

  const saveConfig = async () => {
    setSaving(true)
    const { schedule: _legacySchedule, speechSpeed, ...rest } = draft.settings || {}
    const settings = { ...rest, operationalLimits: limitsToSettings(limits) }
    // Un agente sin velocidad guardada (p. ej. clonado) no puede enviar '' : zod lo rechaza.
    if (speechSpeed) settings.speechSpeed = speechSpeed
    const nextDraft = { ...draft, settings }
    try {
      const response = await apiFetch(`/api/agents/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: draft.name,
          role: draft.role,
          description: draft.description,
          agentType: draft.agentType,
          callDirection: draft.callDirection,
          language: draft.language,
          systemPrompt: draft.systemPrompt,
          voiceId: draft.voiceId || undefined,
          phoneNumber: (draft.phoneNumber || '').trim(),
          monthlyMinuteLimit: draft.monthlyMinuteLimit || null,
          settings,
        }),
      })
      const body = await readBody(response)
      if (response.ok) {
        setAgentSettings(settings)
        setDraft(current => ({ ...current, settings }))
        setSavedDraftSnapshot(JSON.stringify(nextDraft))
        setAgent(current => ({ ...current, name: draft.name || current.name, role: draft.role || current.role, agentType: draft.agentType || current.agentType, language: draft.language, voiceId: draft.voiceId, systemPrompt: draft.systemPrompt, desc: draft.description || draft.systemPrompt || current.desc, objetivo: draft.systemPrompt || current.objetivo }))
        setSaveError('')
        setSavedConfig(true)
        setTimeout(() => setSavedConfig(false), 2000)
        refreshWorkspace()
        return true
      }
      setSaveError(apiErrorMessage(body, 'No se pudieron guardar los cambios. Inténtalo de nuevo.'))
      return false
    } catch {
      setSaveError('No se pudieron guardar los cambios. Comprueba tu conexión.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const updateDraft = patch => setDraft(current => {
    const next = { ...current, ...patch }
    if (patch.settings) next.settings = updateNestedSettings(current.settings || {}, patch.settings)
    return next
  })

  const reloadDraftFromAgent = data => {
    const settings = data.settings || {}
    const nextDraft = {
      name: data.name || '', role: data.role || '', agentType: data.agentType || 'sales', callDirection: data.callDirection || 'both',
      description: data.description || '', phoneNumber: data.phoneNumber || '', monthlyMinuteLimit: data.monthlyMinuteLimit || null,
      language: data.language || 'es', voiceId: data.voiceId || '', systemPrompt: data.systemPrompt || '',
      settings: updateNestedSettings(settings, {}),
    }
    setDraft(nextDraft)
    setSavedDraftSnapshot(JSON.stringify(nextDraft))
    setAgentSettings(settings)
    setLimits(limitsFromSettings(settings))
    setLifecycle(lifecycleOf(data))
    setAgent(current => current ? {
      ...current,
      name: nextDraft.name,
      role: nextDraft.role,
      agentType: nextDraft.agentType,
      callDirection: nextDraft.callDirection,
      language: nextDraft.language,
      voiceId: nextDraft.voiceId,
      systemPrompt: nextDraft.systemPrompt,
      desc: nextDraft.description || nextDraft.systemPrompt,
      objetivo: nextDraft.systemPrompt,
      lifecycleStatus: lifecycleOf(data),
    } : current)
  }

  const openGovernanceSection = section => {
    setGovernanceRequest(current => ({ section, nonce: current.nonce + 1 }))
    document.getElementById('agent-governance')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const hasUnsavedChanges = Boolean(savedDraftSnapshot && (JSON.stringify(draft) !== savedDraftSnapshot || JSON.stringify(limitsToSettings(limits)) !== JSON.stringify(limitsToSettings(limitsFromSettings(agentSettings)))))
  const handleSectionChange = sectionId => {
    if (sectionId === 'agent-playbook') setTab('Playbooks')
    if (sectionId === 'agent-performance') setTab('Rendimiento')
  }

  // Duplicar vive en AgentGovernancePanel (POST /agents/:id/clone), que copia
  // solo lo que se elige y valida la voz en el servidor.

  const activatePlaybook = pb => {
    const settings = { ...agentSettings, activePlaybookId: pb.id, activePlaybookVersion: 1 }
    apiFetch(`/api/agents/${id}`, { method: 'PUT', body: JSON.stringify({ settings }) })
      .then(r => { if (r.ok) setAgentSettings(settings) })
  }

  if (loading) return <PageLoadingState label={locale === 'en' ? 'Loading agent' : 'Cargando agente'} />

  if (!agent) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 14, background: 'var(--bg)' }}>
      {locale === 'en' ? 'Agent not found' : 'Agente no encontrado'}
    </div>
  )

  const s = STATUS[lifecycle] || STATUS.draft
  const lifecycleAction = lifecycle === 'active' ? 'Pausar' : lifecycle === 'paused' ? 'Reanudar' : lifecycle === 'draft' ? 'Publicar' : null
  const lifecycleActionDisabled = toggleBusy || !lifecycleAction || (lifecycle === 'draft' && workspace && !workspace.readiness?.ready)

  return (
    <div className={`agent-detail-page dark-scroll ${viewMode === 'simple' ? 'is-simple-view' : 'is-professional-view'}`} style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: 'var(--bg)', padding: '26px clamp(12px,4vw,32px) 40px' }}>

      {/* Back */}
      <button className="agent-detail-back" onClick={() => navigate('/agentes')} style={{
        display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
        color: 'var(--dim)', cursor: 'pointer', fontSize: 12.5, padding: 0, marginBottom: 22,
        fontFamily: 'inherit',
      }}>
        <RiArrowLeftLine style={{ width: 14, height: 14 }} /> Agentes IA
      </button>

      {/* Hero */}
      <div id="agent-summary" className="agent-detail-hero" style={{
        display: 'flex', alignItems: 'center', gap: 22, marginBottom: 24, flexWrap: 'wrap',
        padding: '20px clamp(14px,3vw,24px)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
      }}>
        {/* Avatar */}
        <div className="agent-detail-avatar" style={{
          width: 86, height: 86, borderRadius: '50%', flexShrink: 0,
          background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${agent.color} 31%, transparent), color-mix(in srgb, ${agent.bg} 80%, transparent))`,
          border: `2px solid color-mix(in srgb, ${agent.color} 38%, transparent)`,
          boxShadow: `0 0 0 5px color-mix(in srgb, ${agent.color} 7%, transparent), 0 0 32px color-mix(in srgb, ${agent.color} 19%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 34, fontWeight: 800, color: 'var(--text-strong)',
        }}>{agent.name[0]}</div>

        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-strong)', minWidth: 0, overflowWrap: 'anywhere' }}>{agent.name}</h1>
            {agent.verified && (
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: agent.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 800, flexShrink: 0 }}>✓</span>
            )}
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, color: s.color, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {lifecycle === 'active' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, display: 'inline-block', boxShadow: `0 0 4px ${s.color}` }} />}
              {LIFECYCLE[lifecycle]?.label || 'Borrador'}
            </span>
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 13.5, color: agent.color, fontWeight: 600 }}>{agent.role} · {AGENT_TYPE_LABELS[agent.agentType] || agent.agentType}</p>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.6, maxWidth: 520, overflowWrap: 'break-word' }}>{agent.desc}</p>
        </div>

        {/* Actions */}
        <div className="agent-detail-actions" style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {lifecycleAction ? <button type="button" onClick={changeLifecycle} disabled={lifecycleActionDisabled} title={lifecycle === 'draft' && workspace && !workspace.readiness?.ready ? 'Completa los requisitos de publicación primero.' : LIFECYCLE[lifecycle]?.description} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 13px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, cursor: lifecycleActionDisabled ? 'not-allowed' : 'pointer', opacity: lifecycleActionDisabled ? 0.6 : 1, fontFamily: 'inherit' }}>
            <div style={{ width: 32, height: 17, borderRadius: 99, background: lifecycle === 'active' ? 'var(--success)' : 'var(--line-2)', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 2, left: lifecycle === 'active' ? 15 : 2, width: 13, height: 13, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{toggleBusy ? 'Cambiando…' : lifecycleAction}</span>
          </button> : null}
          <button onClick={() => setTab('Playbooks')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            <RiBookOpenLine style={{ width: 14, height: 14 }} /> Entrenar
          </button>
          <button onClick={() => { changeViewMode('professional'); openGovernanceSection('quality') }} title="Llamada real a un número propio autorizado, grabada y evaluada." style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: `linear-gradient(90deg, var(--accent-deep), ${agent.color})`, border: 'none', borderRadius: 9, color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: `0 0 18px color-mix(in srgb, ${agent.color} 15%, transparent)`, fontFamily: 'inherit' }}>
            <RiPlayLine style={{ width: 13, height: 13 }} /> Prueba real
          </button>
          {toggleError && <p role="alert" style={{ margin: 0, flexBasis: '100%', textAlign: 'right', fontSize: 11.5, color: 'var(--danger-soft)' }}>{toggleError}</p>}
        </div>
      </div>

      <div id="agent-view-mode" className="agent-view-mode" aria-label="Nivel de configuración">
        <div className="agent-view-mode-current"><span className="agent-view-mode-icon"><RiMagicLine /></span><span><strong>{viewMode === 'simple' ? 'Vista sencilla' : 'Vista profesional'}</strong><small>{viewMode === 'simple' ? 'Configuración guiada' : 'Control completo'}</small></span></div>
        <button type="button" className="agent-view-mode-toggle" onClick={() => changeViewMode(viewMode === 'simple' ? 'professional' : 'simple')} aria-label={`Cambiar a vista ${viewMode === 'simple' ? 'profesional' : 'sencilla'}`}>
          <span className={`agent-view-mode-track ${viewMode === 'professional' ? 'is-professional' : ''}`} aria-hidden="true"><i /></span>
          <span><small>Cambiar a</small><strong>{viewMode === 'simple' ? 'Profesional' : 'Sencilla'}</strong></span>
          <RiArrowRightLine aria-hidden="true" />
        </button>
      </div>

      {viewMode === 'simple' ? <AgentSimpleSetup agentId={agent.id} draft={draft} onChange={updateDraft} onSave={saveConfig} saving={saving} saved={savedConfig} onNavigate={navigate} onPublished={refreshWorkspace} onWorkspaceLoaded={ws => { setWorkspace(ws); setLifecycle(lifecycleOf(ws.agent)) }} onOpenGovernance={section => { changeViewMode('professional'); openGovernanceSection(section) }} /> : null}

      {/* Stat cards */}
      <div className="agent-detail-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12, marginBottom: 22 }}>
        {agent.stats.map(s => (
          <div className="agent-detail-stat" key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
            <div className="agent-detail-stat-head"><p style={{ margin: 0, fontSize: 10.5, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</p>{React.createElement(s.Icon || RiBarChartLine, { 'aria-hidden': true })}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>{s.value}</span>
              <span style={{ fontSize: 11.5, color: s.pct === '—' ? 'var(--faint)' : s.pct.startsWith('↑') ? 'var(--success-soft)' : 'var(--danger-soft)', fontWeight: 600 }}>{s.pct}</span>
            </div>
            <span className="agent-detail-stat-hint">{s.hint}</span>
          </div>
        ))}
      </div>

      <AgentDetailNav
        hasUnsavedChanges={hasUnsavedChanges}
        onSectionChange={handleSectionChange}
        actions={[
          { id: 'save', label: 'Guardar cambios', hint: 'Aplicar al siguiente contacto', icon: RiSave3Line, onSelect: saveConfig, disabled: saving },
          { id: 'test', label: 'Prueba real', hint: 'Llamada evaluada a tu número', icon: RiPlayLine, onSelect: () => { changeViewMode('professional'); openGovernanceSection('quality') } },
          { id: 'sources', label: 'Gestionar fuentes', hint: 'Abrir base de conocimiento', icon: RiBookOpenLine, onSelect: () => navigate('/knowledge-base') },
        ]}
      />

      <div className="agent-save-bar">
        <div><RiCpuLine /><span><strong>Centro de control del agente</strong><small>{saving ? 'Guardando configuración…' : savedConfig ? 'Cambios guardados y listos para la próxima llamada' : 'Los cambios se guardan juntos para mantener el comportamiento coherente'}</small></span></div>
        <div className="agent-save-actions">
          {saveError && <span role="alert" className="agent-save-error">{saveError}</span>}
          <button type="button" className="agent-save-button" onClick={saveConfig} disabled={saving}><RiSave3Line /> {saving ? 'Guardando…' : savedConfig ? 'Guardado' : 'Guardar cambios'}</button>
        </div>
      </div>

      <AgentGovernancePanel
        agentId={agent.id}
        draft={draft}
        onChange={updateDraft}
        hasUnsavedChanges={hasUnsavedChanges}
        onNavigate={navigate}
        requestedSection={governanceRequest}
        onAgentReload={reloadDraftFromAgent}
        onWorkspaceLoaded={ws => { setWorkspace(ws); setLifecycle(lifecycleOf(ws.agent)) }}
      />

      <div id="agent-stack">
        <AgentRuntimePanel draft={draft} agentId={agent.id} onChange={updateDraft} onNavigate={navigate} playbooks={playbooks} />
      </div>

      <div className="agent-detail-enhancement-grid">
        {/* El simulador escrito y el inspector de prompt enlatados se retiraron:
            no usaban el prompt real ni creaban llamadas, y confundían con la prueba. */}
        <AgentReadinessChecklist
          workspace={workspace}
          onNavigate={targetId => {
            if (targetId === 'language-voice') return document.getElementById('agent-stack')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            if (targetId === 'instructions') return document.getElementById('agent-playbook')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            if (targetId === 'call-test' || targetId === 'consent') return openGovernanceSection('quality')
            if (targetId === 'basic') return openGovernanceSection('basic')
            if (targetId === 'publication') return changeLifecycle()
            document.getElementById('agent-behavior')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        />
      </div>

      <section id="agent-playbook" className="agent-strategy-center" aria-labelledby="agent-strategy-center-title">
        <div className="agent-center-heading agent-strategy-heading">
          <div><span className="agent-center-kicker"><RiFlowChart /> MÉTODO DE CONVERSACIÓN</span><h2 id="agent-strategy-center-title">Qué hará en cada llamada</h2><p>La estrategia ordena la conversación; el playbook y las instrucciones del agente completan el contexto.</p></div>
          <button type="button" className="agent-outline-action" onClick={() => setTab('Playbooks')}><RiBookOpenLine /> Ver playbooks</button>
        </div>
        <AgentStrategyPanel
          agent={{ ...agent, ...draft, settings: draft.settings || {}, systemPrompt: draft.systemPrompt || '' }}
          playbooks={playbooks}
          onEdit={updateDraft}
          onNavigate={navigate}
        />
      </section>

      <div className="agent-detail-enhancement-grid agent-detail-enhancement-grid-secondary">
        <AgentSafetyPanel draft={draft} onChange={updateDraft} />
      </div>

      {/* Body 2-col */}
      <div className="agent-detail-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(270px,100%),1fr))', gap: 16, alignItems: 'start' }}>

        {/* Left: persona */}
        <div className="agent-detail-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

          {/* Estado */}
          <div className="agent-detail-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 10.5, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Estado</p>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: s.color }}>{LIFECYCLE[lifecycle]?.label}</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--dim)', lineHeight: 1.5 }}>{LIFECYCLE[lifecycle]?.description}</p>
            {workspace?.readiness ? <p style={{ margin: '8px 0 0', fontSize: 11.5, color: workspace.readiness.ready ? 'var(--success)' : 'var(--muted)' }}>{workspace.readiness.checks.filter(item => item.ready).length} de {workspace.readiness.checks.length} requisitos de publicación listos</p> : null}
          </div>

          {/* Objetivo */}
          <div className="agent-detail-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 10.5, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Objetivo</p>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, overflowWrap: 'break-word' }}>{agent.objetivo}</p>
          </div>

          {/* Docs: panel real de conocimiento (settings.knowledgeIds + vista previa del prompt) */}
          <AgentKnowledgePanel agentId={agent.id} onNavigate={navigate} />

          {/* Quick actions */}
          <div className="agent-detail-card agent-detail-quick-actions" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(130px,100%),1fr))', gap: 7 }}>
              <button onClick={() => navigate('/playbooks')} style={{ padding: '9px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, color: 'var(--muted)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}><RiBookOpenLine /> Ver playbook</button>
              <button onClick={() => setTab('Configuración')} style={{ padding: '9px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, color: 'var(--muted)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}><RiSettings3Line /> Configurar</button>
              <button onClick={() => openGovernanceSection('control')} style={{ padding: '9px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, color: 'var(--muted)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>Clonar agente</button>
            </div>
          </div>
        </div>

        {/* Right: tabs */}
        <div id="agent-performance" className="agent-detail-tabs-panel" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', minWidth: 0 }}>
          <div className="agent-detail-tabs tabs-scroll" style={{ display: 'flex', borderBottom: '1px solid var(--line)', padding: '0 16px' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: 'none', border: 'none', padding: '13px 13px',
                fontSize: 12.5, fontWeight: tab === t ? 700 : 400,
                color: tab === t ? agent.color : 'var(--faint)',
                borderBottom: `2px solid ${tab === t ? agent.color : 'transparent'}`,
                cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}>{t}</button>
            ))}
          </div>

          <div className="agent-detail-tab-body" style={{ padding: '22px clamp(14px,4vw,22px)' }}>
            {tab === 'Conversaciones' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>Últimas llamadas de este agente</p>
                  <button onClick={() => navigate('/llamadas')} style={{ background: 'transparent', border: `1px solid color-mix(in srgb, ${agent.color} 31%, transparent)`, borderRadius: 8, padding: '6px 12px', color: agent.color, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Ver todas</button>
                </div>
                {recentCalls.length === 0
                  ? <div className="agent-detail-empty-calls"><RiPhoneLine /><p>Este agente todavía no tiene llamadas registradas.</p><span>La primera conversación aparecerá aquí.</span><button onClick={() => { changeViewMode('professional'); openGovernanceSection('quality') }}><RiPlayLine /> Hacer una prueba real</button></div>
                  : <div className="scroll-x" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12 }}>
                    {recentCalls.map((c, i) => {
                      const name = c.lead?.name ?? 'Sin contacto'
                      const seconds = c.durationSeconds ?? 0
                      const result = outcomeLabel(c.outcome)
                      const clr = OUTCOME_COLOR[c.outcome] ?? 'var(--dim)'
                      return (
                        <div key={c.id} role="button" tabIndex="0" onClick={() => navigate(`/llamadas/${c.id}`)} onKeyDown={e => e.key === 'Enter' && navigate(`/llamadas/${c.id}`)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 130px 80px 120px', gap: 0, minWidth: 430, padding: '11px 16px', borderBottom: i < recentCalls.length - 1 ? '1px solid var(--line)' : 'none', alignItems: 'center', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--dim)', flexShrink: 0 }}>{name[0]}</div>
                            <div style={{ minWidth: 0 }}><p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p><p style={{ margin: 0, fontSize: 11, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lead?.company ?? 'Sin empresa'}</p></div>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--dim)' }}>{c.startedAt ? new Date(c.startedAt).toLocaleString(locale === 'en' ? 'en-US' : 'es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                          <span style={{ fontSize: 11.5, color: 'var(--dim)' }}>{seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—'}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: clr + '15', color: clr, border: `1px solid color-mix(in srgb, ${clr} 19%, transparent)`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>{result}</span>
                        </div>
                      )
                    })}
                  </div>
                }
              </div>
            )}

            {tab === 'Rendimiento' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {!timeseries ? <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 13, padding: '30px 0' }}>No se pudieron cargar las métricas históricas.</p> : <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(160px,100%),1fr))', gap: 12 }}>
                    {[
                      { label: `Llamadas (${timeseries.days} días)`, value: timeseries.totals.calls },
                      { label: 'Tasa de éxito', value: `${timeseries.totals.successRate}%` },
                      { label: 'Duración media', value: timeseries.totals.avgDurationSeconds != null ? `${Math.floor(timeseries.totals.avgDurationSeconds / 60)}:${String(timeseries.totals.avgDurationSeconds % 60).padStart(2, '0')} min` : '—' },
                      { label: 'Sentimiento medio', value: timeseries.totals.avgSentiment != null ? (timeseries.totals.avgSentiment > 0 ? `+${timeseries.totals.avgSentiment}` : String(timeseries.totals.avgSentiment)) : '—' },
                    ].map(m => (
                      <div key={m.label} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px' }}>
                        <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.label}</p>
                        <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-strong)' }}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>Llamadas por día · últimos {timeseries.days} días</p>
                      <span style={{ fontSize: 11, color: 'var(--dim)' }}>Total: {timeseries.totals.calls}</span>
                    </div>
                    {timeseries.totals.calls === 0
                      ? <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 13, padding: '20px 0', background: 'var(--surface-2)', borderRadius: 10 }}>Sin llamadas en este periodo.</p>
                      : <div style={{ height: 110, background: 'var(--surface-2)', borderRadius: 10, display: 'flex', alignItems: 'flex-end', gap: 2, padding: '10px 14px' }}>
                        {(() => { const max = Math.max(...timeseries.series.map(d => d.calls), 1); return timeseries.series.map(d => (
                          <div key={d.date} title={`${d.date}: ${d.calls} llamadas, ${d.meetings} reuniones`} style={{ flex: 1, borderRadius: '2px 2px 0 0', background: `linear-gradient(180deg, color-mix(in srgb, ${agent.color} 80%, transparent), ${agent.bg})`, height: `${(d.calls / max) * 100}%`, minHeight: d.calls ? 3 : 1, opacity: d.calls ? 1 : 0.25 }} />
                        )) })()}
                      </div>
                    }
                  </div>
                </>}
              </div>
            )}

            {tab === 'Configuración' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 'clamp(14px,3vw,18px)' }}>
                  <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>Voz</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--dim)' }}>Voz del agente</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: draft.voiceId ? 'var(--muted)' : 'var(--faint)', overflowWrap: 'anywhere' }}>{draft.settings?.voiceSelection?.id === draft.voiceId && draft.settings?.voiceSelection?.name ? draft.settings.voiceSelection.name : draft.voiceId || 'Sin definir'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 0' }}>
                    <label htmlFor="agent-cfg-speed" style={{ fontSize: 12.5, color: 'var(--dim)' }}>Velocidad de habla</label>
                    <select id="agent-cfg-speed" value={draft.settings?.speechSpeed || '1.0'} onChange={event => updateDraft({ settings: { ...draft.settings, speechSpeed: event.target.value } })} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit' }}>
                      <option value="0.8">0.8 · pausada</option><option value="0.9">0.9 · calmada</option><option value="1.0">1.0 · natural</option><option value="1.1">1.1 · ágil</option><option value="1.2">1.2 · rápida</option>
                    </select>
                  </div>
                </div>
                <OperationalLimitsForm value={limits} onChange={setLimits} accent={agent.color} />
                {saveError && <p role="alert" style={{ margin: 0, color: 'var(--danger-soft)', fontSize: 12.5 }}>{saveError}</p>}
                <button onClick={saveConfig} disabled={saving} style={{ alignSelf: 'flex-start', background: savedConfig ? 'var(--success-bg)' : `linear-gradient(90deg, var(--accent-deep), ${agent.color})`, border: 'none', borderRadius: 9, padding: '10px 20px', color: savedConfig ? 'var(--success)' : 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background .3s', fontFamily: 'inherit' }}>
                  {savedConfig ? '✓ Guardado' : saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            )}

            {tab === 'Playbooks' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>Playbooks disponibles</p>
                  <button onClick={() => navigate('/playbooks')} style={{ background: 'transparent', border: `1px solid color-mix(in srgb, ${agent.color} 31%, transparent)`, borderRadius: 8, padding: '6px 12px', color: agent.color, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>+ Asignar playbook</button>
                </div>
                {playbooks.length === 0
                  ? <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 13, padding: '30px 0' }}>Sin playbooks. Crea uno desde la sección Playbooks.</p>
                  : playbooks.map(pb => {
                    const active = agentSettings.activePlaybookId === pb.id
                    return (
                      <div key={pb.id} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 11, padding: '14px 16px' }}>
                        <div aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 10, background: agent.bg + '50', border: `1px solid color-mix(in srgb, ${agent.color} 19%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>📖</div>
                        <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{pb.name}</p>
                            {active && <span style={{ fontSize: 10, fontWeight: 600, background: '#10b98115', color: 'var(--success)', border: '1px solid #10b98130', borderRadius: 4, padding: '1px 6px' }}>Activo · v{agentSettings.activePlaybookVersion ?? 1}</span>}
                          </div>
                          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--dim)' }}>{pb.description || 'Sin descripción'}</p>
                        </div>
                        <button onClick={() => activatePlaybook(pb)} style={{ fontSize: 11, fontWeight: 600, color: active ? 'var(--success)' : 'var(--muted)', background: active ? '#10b98115' : 'var(--line)', border: `1px solid ${active ? '#10b98130' : 'var(--line)'}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>{active ? 'Activo' : 'Activar'}</button>
                      </div>
                    )
                  })
                }
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
