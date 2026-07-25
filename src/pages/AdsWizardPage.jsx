import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  RiAlertLine,
  RiArrowDownSLine,
  RiArrowRightLine,
  RiBarChartBoxLine,
  RiBriefcaseLine,
  RiCheckLine,
  RiCrosshairLine,
  RiInformationLine,
  RiLightbulbLine,
  RiLineChartLine,
  RiMetaLine,
  RiMoneyDollarCircleLine,
  RiPulseLine,
  RiRefreshLine,
  RiRocketLine,
  RiSave3Line,
  RiSendPlaneLine,
  RiSparkling2Line,
  RiTeamLine,
  RiTimeLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { getLocale, localeCode, useI18n } from '../i18n'
import { hasAccessToken } from '../lib/authSession'
import { DEMO_MODE } from '../lib/dataMode'
import campaignSignal from '../assets/ads/campaign-signal-orbit.png'
import adCreativeGrowth from '../assets/ads/ad-creative-growth.png'
import audienceConstellation from '../assets/ads/audience-constellation.png'
import '../dashboard.css'
import './ads-wizard.css'

const DRAFT_STORAGE_KEY = 'vozia.ads.wizard.draft.v2'

function currencyFormatter(locale = getLocale()) {
  return new Intl.NumberFormat(localeCode(locale), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function compactFormatter(locale = getLocale()) {
  return new Intl.NumberFormat(localeCode(locale), { notation: 'compact', maximumFractionDigits: 1 })
}

const DEFAULT_PLAYBOOKS = [
  {
    id: 'saas-b2b',
    name: 'SaaS B2B',
    vertical: 'SaaS B2B',
    objective: 'Agendar demos cualificadas',
    audience: 'Gerentes y Directores de TI',
    budget: 1200,
  },
  {
    id: 'servicios-profesionales',
    name: 'Servicios profesionales',
    vertical: 'Servicios profesionales',
    objective: 'Generar clientes potenciales',
    audience: 'Responsables de operaciones',
    budget: 750,
  },
  {
    id: 'salud',
    name: 'Clínicas y salud',
    vertical: 'Clínicas y salud',
    objective: 'Aumentar solicitudes de contacto',
    audience: 'Personas interesadas en tratamientos',
    budget: 600,
  },
]

const CREATIVE_VARIANTS = [
  {
    label: 'Growth signal',
    title: 'Convierte intención en crecimiento',
    body: 'Automatiza la captación y enfoca cada euro en las oportunidades con más potencial.',
    cta: 'Descubre cómo',
  },
  {
    label: 'ROI first',
    title: 'Más señales. Menos ruido.',
    body: 'Una estrategia de anuncios que aprende de cada conversación y mejora con cada lead.',
    cta: 'Ver estrategia',
  },
  {
    label: 'Demand capture',
    title: 'Tu próximo cliente ya está buscando',
    body: 'Llega antes, entiende mejor la intención y convierte el interés en una conversación.',
    cta: 'Empezar ahora',
  },
]

const DEFAULT_RECOMMENDATIONS = [
  {
    id: 'audience',
    title: 'Segmenta por intención alta',
    body: 'Enfoca la audiencia en señales de compra recientes para reducir el coste por lead.',
    impact: 'Impacto alto',
    icon: RiCrosshairLine,
    action: 'audience',
  },
  {
    id: 'message',
    title: 'Habla de un resultado medible',
    body: 'El mensaje debe prometer una mejora concreta, no una lista de funcionalidades.',
    impact: 'Impacto alto',
    icon: RiLightbulbLine,
    action: 'objective',
  },
  {
    id: 'creative',
    title: 'Prueba dos variaciones',
    body: 'Compara el ángulo de crecimiento con una creatividad orientada a ROI.',
    impact: 'Impacto medio',
    icon: RiLineChartLine,
    action: 'creative',
  },
]

function readDraft() {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function formatCurrency(value, locale = getLocale()) {
  return value ? currencyFormatter(locale).format(Number(value)) : '—'
}

function formatReach(value, locale = getLocale()) {
  return value ? compactFormatter(locale).format(value) : '—'
}

function getProfile(vertical) {
  const normalized = vertical.toLowerCase()
  if (normalized.includes('salud') || normalized.includes('clín')) {
    return {
      audience: 'Personas interesadas en tratamientos',
      detail: 'Señales de intención, ubicación y búsquedas relacionadas.',
      cpl: 34,
      conversion: '9–14%',
      reachFactor: 260,
      angle: 'confianza y resultado',
    }
  }
  if (normalized.includes('servicio') || normalized.includes('consult')) {
    return {
      audience: 'Responsables de operaciones',
      detail: 'Empresas en crecimiento que necesitan ganar eficiencia.',
      cpl: 48,
      conversion: '11–16%',
      reachFactor: 230,
      angle: 'eficiencia y control',
    }
  }
  return {
    audience: 'Gerentes y Directores de TI',
    detail: 'Empresas de 50–500 empleados con intención de modernización.',
    cpl: 72,
    conversion: '12–18%',
    reachFactor: 190,
    angle: 'crecimiento y automatización',
  }
}

function buildStrategy({ vertical, objetivo, presupuesto, audience }) {
  const profile = getProfile(vertical)
  const budget = Number(presupuesto) || 0
  const completedFields = [vertical, objetivo, presupuesto, audience].filter(Boolean).length
  const score = Math.min(96, Math.max(44, Math.round(
    38 + completedFields * 11 + Math.min(18, budget / 120) + (objetivo.length > 18 ? 7 : 0),
  )))
  const expectedLeads = Math.max(4, Math.round(budget / profile.cpl))
  const lowLeads = Math.max(3, Math.round(expectedLeads * 0.82))
  const highLeads = Math.max(lowLeads + 2, Math.round(expectedLeads * 1.22))
  const resolvedAudience = audience.trim() || profile.audience
  const objective = objetivo.trim() || 'captar demanda cualificada'

  return {
    score,
    scoreLabel: score >= 80 ? 'Alta oportunidad' : score >= 65 ? 'Buena base' : 'Necesita más señales',
    audience: resolvedAudience,
    audienceDetail: profile.detail,
    confidence: Math.min(96, Math.max(72, 70 + completedFields * 6)),
    summary: 'La mejor entrada es ' + profile.angle + ': ' + objective.toLowerCase() + ' con una audiencia que ya reconoce el problema.',
    forecast: {
      leads: lowLeads + '–' + highLeads,
      cpl: formatCurrency(profile.cpl),
      conversion: profile.conversion,
      reach: budget ? formatReach(budget * profile.reachFactor) + '+' : '—',
    },
    recommendations: [
      {
        ...DEFAULT_RECOMMENDATIONS[0],
        body: 'Prioriza ' + resolvedAudience.toLowerCase() + ' y excluye perfiles sin señales de compra para proteger el presupuesto.',
      },
      {
        ...DEFAULT_RECOMMENDATIONS[1],
        body: 'Construye el mensaje alrededor de ' + profile.angle + ' y conecta la promesa con un resultado verificable.',
      },
      {
        ...DEFAULT_RECOMMENDATIONS[2],
        body: 'Lanza una versión centrada en crecimiento y otra en ROI; deja que la primera señal decida el siguiente ajuste.',
      },
    ],
  }
}

// ponytail: sin merge de fallback — lo que el backend no devuelve se muestra
// como '—', nunca como cifra inventada. buildStrategy solo se usa en DEMO_MODE.
function normalizeStrategy(data) {
  if (!data) return null
  const remoteRecommendations = Array.isArray(data.recommendations) ? data.recommendations : []
  return {
    ...data,
    forecast: { leads: '—', cpl: '—', conversion: '—', reach: '—', ...(data.forecast || {}) },
    recommendations: remoteRecommendations.map((recommendation, index) => ({
      ...DEFAULT_RECOMMENDATIONS[index % DEFAULT_RECOMMENDATIONS.length],
      ...recommendation,
      icon: DEFAULT_RECOMMENDATIONS[index % DEFAULT_RECOMMENDATIONS.length].icon,
    })),
  }
}

function serializeStrategy(strategy) {
  if (!strategy) return null
  return {
    ...strategy,
    recommendations: (strategy.recommendations || []).map(({ icon, ...recommendation }) => recommendation),
  }
}

function normalizePlaybooks(data, allowDemo = DEMO_MODE) {
  if (!Array.isArray(data) || data.length === 0) return allowDemo ? DEFAULT_PLAYBOOKS : []
  return data.map((item, index) => ({
    id: item.id || 'playbook-' + index,
    name: item.name || item.vertical || 'Preset de campaña',
    vertical: item.vertical || item.name || '',
    objective: item.objective || item.objetivo || 'Generar clientes potenciales',
    audience: item.audience || '',
    budget: item.budget || item.presupuestoMensual || 800,
  }))
}

export default function AdsWizardPage() {
  const { locale } = useI18n()
  const navigate = useNavigate()
  const draftSeed = useState(() => readDraft())[0]
  const [vertical, setVertical] = useState(draftSeed.vertical || '')
  const [objetivo, setObjetivo] = useState(draftSeed.objetivo || '')
  const [presupuesto, setPresupuesto] = useState(draftSeed.presupuesto || '')
  const [audience, setAudience] = useState(draftSeed.audience || '')
  const [playbooks, setPlaybooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [metaAccount, setMetaAccount] = useState(undefined)
  const [aiStatus, setAiStatus] = useState(draftSeed.strategy ? 'ready' : 'idle')
  const [strategy, setStrategy] = useState(() => normalizeStrategy(draftSeed.strategy))
  const [showFactors, setShowFactors] = useState(false)
  const [creativeIndex, setCreativeIndex] = useState(0)
  const [appliedRecommendation, setAppliedRecommendation] = useState('')
  const [draftStatus, setDraftStatus] = useState(
    draftSeed.vertical || draftSeed.objetivo ? 'Borrador restaurado' : 'Autoguardado activo',
  )
  const saveTimerRef = useRef(null)
  const serverSaveTimerRef = useRef(null)

  useEffect(() => {
    let active = true
    Promise.all([
      apiFetch('/api/ad-playbooks')
        .then(response => response.ok ? response.json() : [])
        .catch(() => []),
      apiFetch('/api/meta/accounts')
        .then(response => response.ok ? response.json() : null)
        .catch(() => null),
      apiFetch('/api/ads/draft')
        .then(response => response.ok ? response.json() : null)
        .catch(() => null),
    ]).then(([adPlaybooks, account, serverDraft]) => {
      if (!active) return
      setPlaybooks(normalizePlaybooks(adPlaybooks, DEMO_MODE))
      setMetaAccount(account)
      if (serverDraft) {
        setVertical(serverDraft.vertical || '')
        setObjetivo(serverDraft.objetivo || '')
        setPresupuesto(serverDraft.presupuesto ? String(serverDraft.presupuesto) : '')
        setAudience(serverDraft.audience || '')
        setCreativeIndex(Number(serverDraft.creativeIndex) || 0)
        if (serverDraft.strategy) {
          setStrategy(normalizeStrategy(serverDraft.strategy))
          setAiStatus('ready')
        }
        setDraftStatus('Borrador restaurado del servidor')
      }
    })

    return () => {
      active = false
      window.clearTimeout(saveTimerRef.current)
      window.clearTimeout(serverSaveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!vertical && !objetivo && !presupuesto && !audience) return undefined

    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      vertical,
      objetivo,
      presupuesto,
      audience,
    }))
    setDraftStatus('Guardando cambios…')
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      setDraftStatus('Borrador guardado automáticamente')
    }, 550)

    window.clearTimeout(serverSaveTimerRef.current)
    serverSaveTimerRef.current = window.setTimeout(() => {
      if (!hasAccessToken()) return
      apiFetch('/api/ads/draft', {
        method: 'PUT',
        body: JSON.stringify({
          vertical,
          objetivo,
          presupuesto: presupuesto ? Number(presupuesto) : null,
          audience,
          strategy: serializeStrategy(strategy),
          creativeIndex,
        }),
      })
        .then(response => {
          if (response.ok && aiStatus !== 'running') setDraftStatus('Borrador guardado en el servidor')
        })
        .catch(() => {})
    }, 900)

    return () => window.clearTimeout(saveTimerRef.current)
  }, [vertical, objetivo, presupuesto, audience, strategy, creativeIndex, aiStatus])

  const availablePlaybooks = useMemo(() => normalizePlaybooks(playbooks), [playbooks])
  const metaState = metaAccount === undefined ? 'loading' : metaAccount ? 'connected' : 'pending'
  const currentCreative = CREATIVE_VARIANTS[creativeIndex]
  const recommendations = strategy?.recommendations || DEFAULT_RECOMMENDATIONS
  const budgetLabel = presupuesto ? formatCurrency(presupuesto) + ' / mes' : 'Según tu definición'
  const canGenerate = Boolean(vertical.trim() && objetivo.trim() && presupuesto)

  function resetStrategy() {
    setStrategy(null)
    setAiStatus('idle')
    setAppliedRecommendation('')
  }

  function handlePreset(preset) {
    setVertical(preset.vertical)
    setObjetivo(preset.objective)
    setPresupuesto(String(preset.budget))
    setAudience(preset.audience)
    setMessage('')
    resetStrategy()
  }

  async function handleGenerateStrategy() {
    if (!canGenerate) {
      setMessage('Completa vertical, objetivo y presupuesto para que la IA pueda analizar la campaña.')
      return
    }

    setMessage('')
    setAiStatus('running')
    setShowFactors(false)
    setAppliedRecommendation('')
    try {
      const response = await apiFetch('/api/ads/strategy', {
        method: 'POST',
        body: JSON.stringify({
          vertical: vertical.trim(),
          objetivo: objetivo.trim(),
          presupuestoMensual: Number(presupuesto),
          audience: audience.trim(),
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'El backend de estrategia no respondió')
      }

      const serverStrategy = await response.json()
      setStrategy(normalizeStrategy(serverStrategy))
      setAiStatus('ready')
      setDraftStatus(serverStrategy.provider === 'claude'
        ? 'Estrategia IA generada y guardada'
        : 'Estrategia generada con fallback seguro')
    } catch {
      if (DEMO_MODE) {
        setStrategy(normalizeStrategy(buildStrategy({ vertical, objetivo, presupuesto, audience })))
        setAiStatus('ready')
        setDraftStatus('Estrategia local de demostración')
        setMessage('Modo demostración: la estrategia se ha generado localmente.')
      } else {
        setStrategy(null)
        setAiStatus('error')
        setDraftStatus('Estrategia no disponible')
        setMessage('No se pudo conectar con el servicio de estrategia. No se muestran proyecciones simuladas.')
      }
    }
  }

  async function saveDraft() {
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        vertical,
        objetivo,
        presupuesto,
        audience,
        strategy: serializeStrategy(strategy),
      }))
      if (hasAccessToken()) {
        const response = await apiFetch('/api/ads/draft', {
          method: 'PUT',
          body: JSON.stringify({
            vertical,
            objetivo,
            presupuesto: presupuesto ? Number(presupuesto) : null,
            audience,
            strategy: serializeStrategy(strategy),
            creativeIndex,
          }),
        })
        if (!response.ok) throw new Error('No se pudo sincronizar el borrador')
        setDraftStatus('Borrador guardado en el servidor')
      } else {
        setDraftStatus('Borrador guardado ahora')
      }
    } catch {
      setMessage('No se pudo guardar el borrador.')
    }
  }

  function applyRecommendation(recommendation) {
    if (recommendation.action === 'audience' && strategy) setAudience(strategy.audience)
    if (recommendation.action === 'objective') setObjetivo('Agendar demos cualificadas')
    if (recommendation.action === 'creative') setCreativeIndex(index => (index + 1) % CREATIVE_VARIANTS.length)
    setAppliedRecommendation(recommendation.title)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!vertical.trim() || !objetivo.trim() || !presupuesto) {
      setMessage('Completa los tres datos principales antes de crear la campaña.')
      return
    }

    setLoading(true)
    setMessage('')
    try {
      const response = await apiFetch('/api/ads/wizard', {
        method: 'POST',
        body: JSON.stringify({
          vertical: vertical.trim(),
          objetivo: objetivo.trim(),
          presupuestoMensual: Number(presupuesto),
          audience: audience.trim(),
          strategy: serializeStrategy(strategy),
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'No se pudo crear la campaña')
      }

      const campaign = await response.json()
      if (campaign.adStatus === 'draft' && !campaign.metaCampaignId) {
        setMessage('Campaña creada en borrador. Conecta una cuenta de Meta para publicarla.')
      }
      navigate('/campanas/' + campaign.id + '?tab=anuncio')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="dark-scroll ads-page">
      <div className="ads-page-shell">
        <div className="ads-breadcrumbs">
          <Link to="/campanas">Campañas</Link>
          <RiArrowRightLine />
          <span>Nueva campaña</span>
        </div>

        <header className="ads-page-header">
          <div className="ads-header-main">
            <div className="ads-header-mark" aria-hidden="true"><RiRocketLine /></div>
            <div className="ads-header-copy">
              <h1>{locale === 'en' ? 'New acquisition campaign' : 'Nueva campaña de captación'}</h1>
              <p>{locale === 'en' ? 'Create your Meta Ads campaign with AI and save a draft ready to launch.' : 'Crea tu campaña en Meta Ads con IA y guarda un borrador listo para lanzar.'}</p>
            </div>
          </div>
          <div className="ads-header-actions">
            <div className="ads-channel-selector" aria-label="Canal de campaña">
              <RiMetaLine />
              <span>Meta Ads</span>
              <RiArrowDownSLine />
            </div>
            <button className="ads-draft-button" type="button" onClick={saveDraft}>
              <RiSave3Line />
              Guardar borrador
            </button>
          </div>
        </header>

        <div className="ads-workspace">
          <section className="ads-brief-panel" aria-labelledby="ads-form-title">
            <div className="ads-panel-heading">
              <div className="ads-panel-heading-main">
                <span className="ads-step-number">01</span>
                <div>
                  <h2 id="ads-form-title">Brief de campaña</h2>
                  <p>Completa lo esencial. La IA analizará y propondrá la mejor estrategia.</p>
                </div>
              </div>
              <span className="ads-step-status"><i /> Paso 1 de 2</span>
            </div>

            <div className="ads-presets">
              <div className="ads-presets-heading">
                <span>Atajos de IA</span>
                <small>Empieza con un perfil recomendado</small>
              </div>
              <div className="ads-preset-list">
                {availablePlaybooks.slice(0, 3).map(preset => (
                  <button key={preset.id} type="button" onClick={() => handlePreset(preset)}>
                    <RiSparkling2Line />
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className={'ads-connection-card ' + metaState} role="status" aria-live="polite">
              <span className="ads-connection-icon">
                {metaState === 'connected' ? <RiCheckLine /> : <RiMetaLine />}
              </span>
              <div>
                <strong>
                  {metaState === 'loading' && 'Comprobando conexión con Meta'}
                  {metaState === 'connected' && 'Meta conectada'}
                  {metaState === 'pending' && 'Meta todavía no está conectada'}
                </strong>
                <span>
                  {metaState === 'loading' && 'Estamos verificando tu cuenta publicitaria.'}
                  {metaState === 'connected' && 'Cuenta ' + metaAccount.metaAdAccountId + ' lista para publicar.'}
                  {metaState === 'pending' && <>Puedes crear un borrador y <Link to="/captacion/conectar">conectar tu cuenta después</Link>.</>}
                </span>
              </div>
              {metaState === 'pending' && <Link className="ads-connection-action" to="/captacion/conectar">Conectar <RiArrowRightLine /></Link>}
              {metaState === 'connected' && <span className="ads-connection-dot" aria-label="Cuenta conectada" />}
            </div>

            {message && (
              <div className="ads-message" role="alert">
                <RiAlertLine />
                <span>{message}</span>
              </div>
            )}

            <form className="ads-form" onSubmit={handleSubmit}>
              <div className="ads-fields">
                <label className="ads-field" htmlFor="ads-vertical">
                  <span className="ads-field-label"><RiBriefcaseLine /> Vertical / industria</span>
                  <span className="ads-field-helper">La categoría que mejor describe tu negocio.</span>
                  <span className="ads-input-wrap">
                    <input
                      id="ads-vertical"
                      list="verticals"
                      value={vertical}
                      onChange={event => { setVertical(event.target.value); resetStrategy() }}
                      placeholder="Ej. SaaS B2B, clínicas dentales..."
                      autoComplete="organization-title"
                      required
                    />
                    <RiArrowDownSLine className="ads-input-affordance" />
                  </span>
                  <datalist id="verticals">
                    {availablePlaybooks.map(playbook => <option key={playbook.id} value={playbook.vertical} />)}
                  </datalist>
                </label>

                <label className="ads-field" htmlFor="ads-objective">
                  <span className="ads-field-label"><RiCrosshairLine /> Objetivo de la campaña</span>
                  <span className="ads-field-helper">Qué resultado quieres lograr con esta campaña.</span>
                  <span className="ads-input-wrap">
                    <input
                      id="ads-objective"
                      list="objectives"
                      value={objetivo}
                      onChange={event => { setObjetivo(event.target.value); resetStrategy() }}
                      placeholder="Ej. agendar demos, recuperar leads..."
                      required
                    />
                    <RiArrowDownSLine className="ads-input-affordance" />
                  </span>
                  <datalist id="objectives">
                    <option value="Generar clientes potenciales" />
                    <option value="Agendar demos cualificadas" />
                    <option value="Recuperar leads" />
                    <option value="Aumentar solicitudes de contacto" />
                  </datalist>
                </label>

                <label className="ads-field" htmlFor="ads-audience">
                  <span className="ads-field-label"><RiTeamLine /> Audiencia objetivo <em>opcional</em></span>
                  <span className="ads-field-helper">La IA la completará si la dejas vacía.</span>
                  <span className="ads-input-wrap">
                    <input
                      id="ads-audience"
                      value={audience}
                      onChange={event => { setAudience(event.target.value); resetStrategy() }}
                      placeholder="Ej. responsables de operaciones..."
                      autoComplete="off"
                    />
                    <RiTeamLine className="ads-input-affordance" />
                  </span>
                </label>

                <label className="ads-field" htmlFor="ads-budget">
                  <span className="ads-field-label"><RiMoneyDollarCircleLine /> Presupuesto mensual (€)</span>
                  <span className="ads-field-helper">La IA repartirá el presupuesto y estimará el alcance.</span>
                  <span className="ads-input-wrap">
                    <input
                      id="ads-budget"
                      type="number"
                      min="1"
                      step="0.01"
                      inputMode="decimal"
                      value={presupuesto}
                      onChange={event => { setPresupuesto(event.target.value); resetStrategy() }}
                      placeholder="500"
                      required
                    />
                    <span className="ads-input-affordance">EUR</span>
                  </span>
                </label>
              </div>

              <button className={'ads-ai-button ' + aiStatus} type="button" onClick={handleGenerateStrategy} disabled={aiStatus === 'running'}>
                <span className="ads-ai-button-icon"><RiSparkling2Line /></span>
                <span>
                  <strong>{aiStatus === 'running' ? 'Analizando tu campaña…' : aiStatus === 'ready' ? 'Regenerar estrategia con IA' : 'Generar estrategia con IA'}</strong>
                  <small>{aiStatus === 'running' ? 'VozIA está cruzando audiencia, objetivo y presupuesto' : 'Analiza oportunidades, audiencias y proyecciones'}</small>
                </span>
                {aiStatus === 'running' ? <RiPulseLine className="ads-ai-spinner" /> : <RiArrowRightLine />}
              </button>

              <div className="ads-form-footer">
                <span><RiTimeLine /> {draftStatus}</span>
                <button className="ads-submit-button" type="submit" disabled={loading} aria-busy={loading}>
                  {loading ? 'Creando…' : <><RiSendPlaneLine /> Crear campaña</>}
                </button>
              </div>
            </form>
          </section>

          <section className="ads-intelligence-panel" aria-labelledby="ads-preview-title">
            <div className="ads-preview-heading">
              <div>
                <div className="ads-heading-number">02</div>
                <h2 id="ads-preview-title">Inteligencia de campaña</h2>
                <p>Análisis en tiempo real con IA para llegar a la audiencia correcta.</p>
              </div>
              <span className={'ads-ai-live ' + aiStatus}><i /> IA {aiStatus === 'running' ? 'analizando' : 'activa'}</span>
            </div>

            <div className="ads-intelligence-grid">
              <div className="ads-score-block">
                <div className="ads-score-label">Puntaje de oportunidad <span title="Estimación basada en el brief y el análisis IA">?</span></div>
                <div className="ads-score-row">
                  <strong>{strategy?.score || '—'}</strong>
                  <span>/100</span>
                  {strategy && <em className={strategy.score >= 80 ? 'high' : 'medium'}>{strategy.scoreLabel}</em>}
                </div>
                <div className="ads-score-bar"><span style={{ width: (strategy?.score || 0) + '%' }} /></div>
                <p>{strategy?.summary || 'Completa el brief y genera una estrategia para desbloquear el análisis.'}</p>
                <button className="ads-factors-button" type="button" onClick={() => setShowFactors(value => !value)}>
                  {showFactors ? 'Ocultar factores' : 'Ver factores que impulsan el puntaje'}
                  <RiArrowDownSLine className={showFactors ? 'rotated' : ''} />
                </button>
                {showFactors && (
                  <div className="ads-factors-list">
                    <span><RiCheckLine /> Brief completo</span>
                    <span><RiCheckLine /> Objetivo con intención comercial</span>
                    <span><RiCheckLine /> Presupuesto suficiente para aprender</span>
                  </div>
                )}
                <div className="ads-orbit-frame">
                  <img src={campaignSignal} alt="Señal orbital de análisis de IA" />
                  <span className="ads-orbit-core">IA</span>
                </div>
              </div>

              <div className="ads-intelligence-side">
                <div className="ads-audience-card">
                  <div className="ads-card-heading">
                    <div><RiTeamLine /><span>Audiencia recomendada</span></div>
                    {strategy?.confidence != null && <strong>{strategy.confidence}% afinidad</strong>}
                  </div>
                  <div className="ads-audience-body">
                    <img src={audienceConstellation} alt="" />
                    <div>
                      <strong>{strategy?.audience || 'Esperando tu brief'}</strong>
                      <span>{strategy?.audienceDetail || 'La IA encontrará el perfil más relevante para tu objetivo.'}</span>
                    </div>
                  </div>
                </div>

                <div className="ads-forecast-card">
                  <div className="ads-card-heading">
                    <div><RiBarChartBoxLine /><span>Pronóstico mensual</span></div>
                    <small>Estimación IA</small>
                  </div>
                  <div className="ads-forecast-grid">
                    <div><span>Leads</span><strong>{strategy?.forecast.leads || '—'}</strong></div>
                    <div><span>Coste / lead</span><strong>{strategy?.forecast.cpl || '—'}</strong></div>
                    <div><span>Conversión</span><strong>{strategy?.forecast.conversion || '—'}</strong></div>
                    <div><span>Alcance</span><strong>{strategy?.forecast.reach || '—'}</strong></div>
                  </div>
                  <small className="ads-confidence-note"><RiInformationLine /> {strategy?.confidence != null ? `Proyecciones estimadas con ${strategy.confidence}% de confianza` : 'Genera una estrategia para ver proyecciones'}</small>
                </div>

                <div className="ads-creative-card">
                  <div className="ads-card-heading">
                    <div><RiPulseLine /><span>Vista previa del anuncio</span></div>
                    <small>Ejemplo ilustrativo — el copy final se define al publicar</small>
                    <button type="button" onClick={() => setCreativeIndex(index => (index + 1) % CREATIVE_VARIANTS.length)}>
                      Variar creativo <RiRefreshLine />
                    </button>
                  </div>
                  <div className="ads-creative-preview">
                    <img src={adCreativeGrowth} alt="Propuesta visual de crecimiento para el anuncio" />
                    <div className="ads-creative-copy">
                      <small>{currentCreative.label}</small>
                      <strong>{currentCreative.title}</strong>
                      <span>{currentCreative.body}</span>
                      <b>{currentCreative.cta}</b>
                    </div>
                  </div>
                  <div className="ads-creative-dots" aria-label="Variaciones de creativo">
                    {CREATIVE_VARIANTS.map((variant, index) => <i key={variant.label} className={index === creativeIndex ? 'active' : ''} />)}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="ads-strategy-strip" aria-labelledby="ads-strategy-title">
          <div className="ads-strategy-heading">
            <div>
              <h2 id="ads-strategy-title"><RiSparkling2Line /> Estrategia sugerida por IA</h2>
              <p>{strategy ? 'Acciones priorizadas para maximizar el resultado de tu campaña.' : 'Genera una estrategia para recibir recomendaciones adaptadas a tu brief.'}</p>
            </div>
            {strategy && <span className="ads-strategy-ready"><RiCheckLine /> Lista para aplicar</span>}
          </div>
          <div className="ads-recommendations">
            {recommendations.map(recommendation => {
              const Icon = recommendation.icon
              const applied = appliedRecommendation === recommendation.title
              return (
                <article className={'ads-recommendation ' + (applied ? 'applied' : '')} key={recommendation.id}>
                  <span className="ads-recommendation-icon"><Icon /></span>
                  <div>
                    <h3>{recommendation.title}</h3>
                    <p>{recommendation.body}</p>
                    <small>{recommendation.impact}</small>
                  </div>
                  <button type="button" onClick={() => applyRecommendation(recommendation)}>
                    {applied ? <><RiCheckLine /> Aplicado</> : 'Aplicar'}
                  </button>
                </article>
              )
            })}
          </div>
        </section>

        <section className="ads-info-note">
          <RiInformationLine />
          <div>
            <strong>Qué pasa después</strong>
            <span>La campaña se crea como borrador y pasa por revisión antes de publicarse. El presupuesto publicitario se cobra directamente en Meta.</span>
          </div>
          <Link to="/captacion/conectar">Ver configuración <RiArrowRightLine /></Link>
        </section>
      </div>
    </main>
  )
}
