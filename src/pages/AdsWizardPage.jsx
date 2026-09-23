import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  RiAlertLine,
  RiArrowDownSLine,
  RiArrowRightLine,
  RiBarChartBoxLine,
  RiBookOpenLine,
  RiBriefcaseLine,
  RiCheckLine,
  RiCrosshairLine,
  RiExternalLinkLine,
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
import {
  applyRecommendationEffect,
  buildCreativeVariants,
  buildWizardPayload,
  describeForecast,
  describeStrategyProvider,
  describeWizardOutcome,
  hasGeneratedStrategy,
  pickCreative,
  resolveAudience,
  serializeDraftStrategy,
} from '../lib/adsWizard'
import { useExperience } from '../contexts/ExperienceContext'
import campaignSignal from '../assets/ads/campaign-signal-orbit.png'
import adCreativeGrowth from '../assets/ads/ad-creative-growth.png'
import audienceConstellation from '../assets/ads/audience-constellation.png'
import '../dashboard.css'
import './ads-wizard.css'

const DRAFT_STORAGE_KEY = 'vendrava.ads.wizard.draft.v2'

// El onboarding ya conoce el contexto básico de la empresa. El brief lo usa
// como punto de partida, pero nunca bloquea que marketing lo ajuste para una
// campaña concreta.
const CAMPAIGN_CONTEXT_BY_BUSINESS = {
  servicios: { label: 'Servicios', vertical: 'Servicios profesionales' },
  local: { label: 'Negocio local', vertical: 'Negocio local' },
  b2b: { label: 'B2B', vertical: 'B2B' },
  ecommerce: { label: 'E-commerce', vertical: 'E-commerce' },
  agencia: { label: 'Agencia', vertical: 'Agencia' },
}

function currencyFormatter(locale = getLocale()) {
  return new Intl.NumberFormat(localeCode(locale), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function compactFormatter(locale = getLocale()) {
  return new Intl.NumberFormat(localeCode(locale), { notation: 'compact', maximumFractionDigits: 1 })
}

const DESTINATIONS = [
  { value: 'landing', label: 'Una landing de la campaña' },
  { value: 'website', label: 'Una página de tu web' },
  { value: 'whatsapp', label: 'Una conversación de WhatsApp' },
  { value: 'calendar', label: 'Una reserva en el calendario' },
  { value: 'app', label: 'Una pantalla de tu app' },
]

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
    forecastSource: 'sector_benchmark',
    provider: 'heuristic',
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
  const experience = useExperience()
  const navigate = useNavigate()
  const draftSeed = useState(() => readDraft())[0]
  const businessContext = experience.providerAvailable && experience.onboardingCompleted
    ? CAMPAIGN_CONTEXT_BY_BUSINESS[experience.businessType]
    : null
  const [organizationIndustry, setOrganizationIndustry] = useState('')
  const [organicProfile, setOrganicProfile] = useState(null)
  const [knowledgeArticles, setKnowledgeArticles] = useState([])
  const [organizationContextLoading, setOrganizationContextLoading] = useState(true)
  const knownVertical = organizationIndustry || businessContext?.vertical || ''
  const [vertical, setVertical] = useState(draftSeed.vertical || '')
  const [objetivo, setObjetivo] = useState(draftSeed.objetivo || '')
  const [campaignFocus, setCampaignFocus] = useState(draftSeed.campaignFocus || '')
  const [destination, setDestination] = useState(draftSeed.destination || 'landing')
  const [knowledgeContext, setKnowledgeContext] = useState(draftSeed.knowledgeContext || null)
  const [presupuesto, setPresupuesto] = useState(draftSeed.presupuesto || '')
  const [audience, setAudience] = useState(draftSeed.audience || '')
  // Margen y % de adquisición también se guardan en el borrador (strategy.brief).
  const [margin, setMargin] = useState(draftSeed.margin || '')
  const [acquisitionShare, setAcquisitionShare] = useState(draftSeed.acquisitionShare || '30')
  const [outcome, setOutcome] = useState(null)
  const [playbooks, setPlaybooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [metaAccount, setMetaAccount] = useState(undefined)
  const [aiStatus, setAiStatus] = useState(hasGeneratedStrategy(draftSeed.strategy) ? 'ready' : 'idle')
  const [strategy, setStrategy] = useState(() => (hasGeneratedStrategy(draftSeed.strategy) ? normalizeStrategy(draftSeed.strategy) : null))
  const [showFactors, setShowFactors] = useState(false)
  // Se enseña el CAC máximo en cuanto hay margen: convierte dos números
  // abstractos en la cifra con la que /ads juzgará la campaña.
  const marginPreview = Number(margin) > 0 && Number(acquisitionShare) > 0
    ? `Podrás pagar hasta ${((Number(margin) * Number(acquisitionShare)) / 100).toFixed(2)} € por cliente nuevo.`
    : 'Un 30 % es un punto de partida razonable si no lo tienes calculado.'
  const [creativeIndex, setCreativeIndex] = useState(Number(draftSeed.creativeIndex) || 0)
  const [appliedRecommendation, setAppliedRecommendation] = useState('')
  const [draftStatus, setDraftStatus] = useState(
    draftSeed.campaignFocus || draftSeed.objetivo ? 'Borrador restaurado' : 'Autoguardado activo',
  )
  const saveTimerRef = useRef(null)
  const serverSaveTimerRef = useRef(null)
  const campaignVertical = vertical.trim() || knownVertical || 'Negocio sin clasificar'
  const knownTopics = Array.isArray(organicProfile?.sectors) ? organicProfile.sectors.filter(Boolean) : []
  const knownAudience = organicProfile?.audience?.trim() || ''

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
      // La industria es información de la organización, no una suposición de
      // Ads. Tiene prioridad sobre el perfil genérico del onboarding.
      apiFetch('/api/settings/organization')
        .then(response => response.ok ? response.json() : null)
        .catch(() => null),
      apiFetch('/api/organic/project')
        .then(response => response.ok ? response.json() : null)
        .catch(() => null),
      apiFetch('/api/knowledge')
        .then(response => response.ok ? response.json() : [])
        .catch(() => []),
    ]).then(([adPlaybooks, account, serverDraft, organization, organicProject, knowledge]) => {
      if (!active) return
      setPlaybooks(normalizePlaybooks(adPlaybooks, DEMO_MODE))
      setMetaAccount(account)
      setOrganizationIndustry(typeof organization?.industry === 'string' ? organization.industry.trim() : '')
      setOrganicProfile(organicProject?.project || null)
      setKnowledgeArticles(Array.isArray(knowledge) ? knowledge : [])
      setOrganizationContextLoading(false)
      if (serverDraft) {
        setVertical(serverDraft.vertical || '')
        setObjetivo(serverDraft.objetivo || '')
        setCampaignFocus(serverDraft.campaignFocus || serverDraft.strategy?.brief?.campaignFocus || '')
        setDestination(serverDraft.destination || serverDraft.strategy?.brief?.destination || 'landing')
        setKnowledgeContext(serverDraft.knowledgeContext || serverDraft.strategy?.brief?.knowledgeContext || null)
        setPresupuesto(serverDraft.presupuesto ? String(serverDraft.presupuesto) : '')
        setAudience(serverDraft.audience || '')
        setCreativeIndex(Number(serverDraft.creativeIndex) || 0)
        if (serverDraft.strategy?.brief?.margin != null) setMargin(String(serverDraft.strategy.brief.margin))
        if (serverDraft.strategy?.brief?.acquisitionShare) setAcquisitionShare(String(serverDraft.strategy.brief.acquisitionShare))
        if (hasGeneratedStrategy(serverDraft.strategy)) {
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

  const draftBrief = { campaignFocus, destination, knowledgeContext, margin, acquisitionShare }

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!campaignFocus && !objetivo && !presupuesto) return undefined

    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        vertical,
        objetivo,
        campaignFocus,
        destination,
        knowledgeContext,
        presupuesto,
        audience,
        margin,
        acquisitionShare,
        creativeIndex,
      }))
    } catch { /* almacenamiento local no disponible: el servidor sigue guardando */ }
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
          campaignFocus,
          destination,
          knowledgeContext,
          presupuesto: presupuesto ? Number(presupuesto) : null,
          audience,
          strategy: serializeDraftStrategy(strategy, draftBrief),
          creativeIndex,
        }),
      })
        .then(response => {
          if (response.ok && aiStatus !== 'running') setDraftStatus('Borrador guardado en el servidor')
        })
        .catch(() => {})
    }, 900)

    return () => window.clearTimeout(saveTimerRef.current)
    // draftBrief se deriva de campos ya listados.
  }, [vertical, objetivo, campaignFocus, destination, knowledgeContext, presupuesto, audience, margin, acquisitionShare, strategy, creativeIndex, aiStatus])

  const availablePlaybooks = useMemo(() => normalizePlaybooks(playbooks), [playbooks])
  const metaState = metaAccount === undefined ? 'loading' : metaAccount ? 'connected' : 'pending'
  const creativeVariants = useMemo(
    () => buildCreativeVariants({ campaignFocus, objetivo, audience: resolveAudience(audience, knownAudience) }),
    [campaignFocus, objetivo, audience, knownAudience],
  )
  const currentCreative = pickCreative(creativeVariants, creativeIndex)
  const forecastLabel = describeForecast(strategy)
  const recommendations = strategy?.recommendations ?? []
  const budgetLabel = presupuesto ? formatCurrency(presupuesto) + ' / mes' : 'Según tu definición'
  const canGenerate = Boolean(campaignFocus.trim() && objetivo.trim() && destination && presupuesto)

  function resetStrategy() {
    setStrategy(null)
    setAiStatus('idle')
    setAppliedRecommendation('')
  }

  function handlePreset(preset) {
    setCampaignFocus(preset.name)
    setObjetivo(preset.objective)
    setPresupuesto(String(preset.budget))
    setAudience(preset.audience)
    setMessage('')
    resetStrategy()
  }

  async function handleKnowledgeSelection(event) {
    const articleId = event.target.value
    if (!articleId) {
      setKnowledgeContext(null)
      return
    }

    const fallback = knowledgeArticles.find(article => article.id === articleId)
    try {
      const response = await apiFetch('/api/knowledge/' + articleId)
      const article = response.ok ? await response.json() : fallback
      if (!article) return
      const context = {
        id: article.id,
        name: String(article.name || '').slice(0, 180),
        type: String(article.type || 'documento').slice(0, 60),
        content: String(article.content || '').slice(0, 5000),
      }
      setKnowledgeContext(context)
      setCampaignFocus(context.name)
      resetStrategy()
    } catch {
      setMessage('No se pudo cargar ese artículo de la Base de conocimiento.')
    }
  }

  async function handleGenerateStrategy() {
    if (!canGenerate) {
      setMessage('Indica qué vas a promocionar, el destino, el objetivo y el presupuesto para analizar la campaña.')
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
          vertical: campaignVertical,
          objetivo: objetivo.trim(),
          presupuestoMensual: Number(presupuesto),
          audience: resolveAudience(audience, knownAudience),
          campaignFocus: campaignFocus.trim(),
          destination,
          knowledgeContext,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'El backend de estrategia no respondió')
      }

      const serverStrategy = await response.json()
      setStrategy(normalizeStrategy(serverStrategy))
      setAiStatus('ready')
      setDraftStatus(describeStrategyProvider(serverStrategy.provider))
    } catch {
      if (DEMO_MODE) {
        setStrategy(normalizeStrategy(buildStrategy({ vertical: campaignVertical, objetivo, presupuesto, audience: resolveAudience(audience, knownAudience) })))
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
        campaignFocus,
        destination,
        presupuesto,
        audience,
        margin,
        acquisitionShare,
        creativeIndex,
        strategy: serializeDraftStrategy(strategy, draftBrief),
      }))
      if (hasAccessToken()) {
        const response = await apiFetch('/api/ads/draft', {
          method: 'PUT',
          body: JSON.stringify({
            vertical,
            objetivo,
            campaignFocus,
            destination,
            knowledgeContext,
            presupuesto: presupuesto ? Number(presupuesto) : null,
            audience,
            strategy: serializeDraftStrategy(strategy, draftBrief),
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
    const effect = applyRecommendationEffect(recommendation, {
      strategy,
      objetivo,
      creativeIndex,
      variantCount: creativeVariants.length,
    })
    if (effect.patch.audience != null) setAudience(effect.patch.audience)
    if (effect.patch.objetivo != null) setObjetivo(effect.patch.objetivo)
    if (effect.patch.creativeIndex != null) setCreativeIndex(effect.patch.creativeIndex)
    if (effect.hint) setMessage(`Ajusta el objetivo: ${effect.hint}`)
    if (effect.focusId && typeof document !== 'undefined') {
      const field = document.getElementById(effect.focusId)
      field?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      field?.focus?.({ preventScroll: true })
    }
    setAppliedRecommendation(recommendation.title)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!campaignFocus.trim() || !objetivo.trim() || !destination || !presupuesto) {
      setMessage('Completa qué vas a promocionar, el destino, el objetivo y el presupuesto antes de crear la campaña.')
      return
    }

    setLoading(true)
    setMessage('')
    setOutcome(null)
    try {
      const response = await apiFetch('/api/ads/wizard', {
        method: 'POST',
        body: JSON.stringify(buildWizardPayload({
          vertical: campaignVertical,
          objetivo,
          presupuesto,
          audience,
          knownAudience,
          campaignFocus,
          destination,
          knowledgeContext,
          strategy: serializeStrategy(strategy),
          margin,
          acquisitionShare,
          creative: currentCreative,
        })),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.issues?.[0]?.message || body.error || 'No se pudo crear la campaña')
      }

      const campaign = await response.json()
      const result = describeWizardOutcome(campaign)
      // Si se publicó, se va directo a la campaña. Si quedó en borrador (sin
      // Meta o con error de publicación), el motivo se enseña aquí antes de
      // navegar: la página de destino no lo recibe y se perdería.
      if (result?.tone === 'success') {
        navigate('/campanas/' + campaign.id + '?tab=anuncio', { state: { adsWizardOutcome: result } })
        return
      }
      setOutcome({ ...result, campaignId: campaign.id })
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
          <Link to="/captacion/planificar">Campañas</Link>
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
              {(knownVertical || knownTopics.length || knownAudience) ? <div className="ads-known-context" role="status">
                <RiCheckLine aria-hidden="true" />
                <span>Usaremos el contexto de tu negocio{knownVertical ? <>: <strong>{knownVertical}</strong></> : ''}{knownTopics.length ? <> · temas: <strong>{knownTopics.join(', ')}</strong></> : ''}{knownAudience ? <> · público: <strong>{knownAudience}</strong></> : ''}. No hace falta repetirlo en este brief.</span>
              </div> : null}
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

            {outcome && (
              <div className="ads-message" role={outcome.tone === 'warning' ? 'alert' : 'status'}>
                {outcome.tone === 'warning' ? <RiAlertLine /> : <RiInformationLine />}
                <span>
                  {outcome.text}{' '}
                  <Link to={'/campanas/' + outcome.campaignId + '?tab=anuncio'}>Ir a la campaña <RiArrowRightLine /></Link>
                  {outcome.tone === 'info' ? <> · <Link to="/captacion/conectar">Conectar Meta</Link></> : null}
                </span>
              </div>
            )}

            <form className="ads-form" onSubmit={handleSubmit}>
              <div className="ads-fields">
                <label className="ads-field" htmlFor="ads-focus">
                  <span className="ads-field-label"><RiBriefcaseLine /> ¿Qué quieres promocionar?</span>
                  <span className="ads-field-helper">Elige el producto, servicio, evento o tema concreto que quieres impulsar.</span>
                  <span className="ads-input-wrap">
                    <input
                      id="ads-focus"
                      list="campaign-topics"
                      value={campaignFocus}
                      onChange={event => { setCampaignFocus(event.target.value); resetStrategy() }}
                      placeholder="Ej. partidos de pádel de esta semana"
                      autoComplete="off"
                      required
                    />
                    <RiSparkling2Line className="ads-input-affordance" />
                  </span>
                  <datalist id="campaign-topics">
                    {knownTopics.map(topic => <option key={topic} value={topic} />)}
                  </datalist>
                </label>

                <div className="ads-knowledge-picker">
                  <div className="ads-knowledge-picker-heading">
                    <span><RiBookOpenLine /> Producto o servicio desde Knowledge Base <em>opcional</em></span>
                    <Link to="/knowledge-base">Gestionar fuentes <RiArrowRightLine /></Link>
                  </div>
                  <p>Selecciona una ficha para aportar toda su información al análisis y al Creator Studio.</p>
                  <span className="ads-input-wrap">
                    <select
                      id="ads-knowledge-source"
                      value={knowledgeContext?.id || ''}
                      onChange={handleKnowledgeSelection}
                    >
                      <option value="">Escribirlo manualmente</option>
                      {knowledgeArticles.map(article => <option key={article.id} value={article.id}>{article.name}{article.type ? ` · ${article.type}` : ''}</option>)}
                    </select>
                    <RiArrowDownSLine className="ads-input-affordance" />
                  </span>
                  {knowledgeContext ? <div className="ads-knowledge-source" role="status">
                    <RiCheckLine aria-hidden="true" />
                    <span><strong>{knowledgeContext.name}</strong>{knowledgeContext.content ? <> · {knowledgeContext.content.slice(0, 132)}{knowledgeContext.content.length > 132 ? '…' : ''}</> : ' · ficha conectada'}</span>
                  </div> : null}
                </div>

                <label className="ads-field" htmlFor="ads-destination">
                  <span className="ads-field-label"><RiExternalLinkLine /> ¿A dónde dirigimos el tráfico?</span>
                  <span className="ads-field-helper">Define el siguiente paso que verá una persona al hacer clic.</span>
                  <span className="ads-input-wrap">
                    <select
                      id="ads-destination"
                      value={destination}
                      onChange={event => { setDestination(event.target.value); resetStrategy() }}
                      required
                    >
                      {DESTINATIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                    <RiArrowDownSLine className="ads-input-affordance" />
                  </span>
                </label>

                <label className="ads-field" htmlFor="ads-objective">
                  <span className="ads-field-label"><RiCrosshairLine /> ¿Qué quieres conseguir?</span>
                  <span className="ads-field-helper">El resultado que marcará si esta campaña funciona.</span>
                  <span className="ads-input-wrap">
                    <input
                      id="ads-objective"
                      list="objectives"
                      value={objetivo}
                      onChange={event => { setObjetivo(event.target.value); resetStrategy() }}
                      placeholder="Ej. conseguir inscripciones o reservas"
                      required
                    />
                    <RiArrowDownSLine className="ads-input-affordance" />
                  </span>
                  <datalist id="objectives">
                    <option value="Generar clientes potenciales" />
                    <option value="Agendar demos cualificadas" />
                    <option value="Conseguir reservas" />
                    <option value="Impulsar ventas" />
                    <option value="Recuperar leads" />
                    <option value="Aumentar solicitudes de contacto" />
                  </datalist>
                </label>

                <label className="ads-field" htmlFor="ads-audience">
                  <span className="ads-field-label"><RiTeamLine /> ¿A quién te diriges? <em>opcional</em></span>
                  <span className="ads-field-helper">{knownAudience ? `Si lo dejas vacío usaremos el público de tu perfil: ${knownAudience}.` : 'Describe el público; lo que escribas aquí tiene prioridad sobre cualquier sugerencia.'}</span>
                  <span className="ads-input-wrap">
                    <input
                      id="ads-audience"
                      value={audience}
                      maxLength={160}
                      onChange={event => { setAudience(event.target.value); resetStrategy() }}
                      placeholder={knownAudience || 'Ej. dueños de clínicas en Madrid'}
                      autoComplete="off"
                    />
                  </span>
                </label>

                <label className="ads-field" htmlFor="ads-budget">
                  <span className="ads-field-label"><RiMoneyDollarCircleLine /> Presupuesto mensual (€)</span>
                  <span className="ads-field-helper">Se reparte en un presupuesto diario al publicar en Meta.</span>
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
                    <span className="ads-input-affordance ads-unit-affordance" aria-hidden="true">€</span>
                  </span>
                </label>

                {/* El margen, no el ticket. De aquí salen el CAC, el CPQL y el
                    CPL objetivo (ads.md §9). Es opcional: sin él la campaña se
                    crea igual, pero /ads no podrá decir si sale rentable, solo
                    si es más barata que las demás. */}
                <label className="ads-field" htmlFor="ads-margin">
                  <span className="ads-field-label"><RiMoneyDollarCircleLine /> Margen por venta (€)</span>
                  <span className="ads-field-helper">Lo que te queda limpio de un cliente nuevo, no el precio. Sin esto no se puede saber si una campaña sale rentable.</span>
                  <span className="ads-input-wrap">
                    <input
                      id="ads-margin"
                      type="number"
                      min="1"
                      step="0.01"
                      inputMode="decimal"
                      value={margin}
                      onChange={event => setMargin(event.target.value)}
                      placeholder="900"
                    />
                    <span className="ads-input-affordance ads-unit-affordance" aria-hidden="true">€</span>
                  </span>
                </label>

                <label className="ads-field" htmlFor="ads-acq-share">
                  <span className="ads-field-label"><RiMoneyDollarCircleLine /> Del margen, ¿cuánto puedes gastar en captar? (%)</span>
                  <span className="ads-field-helper">{marginPreview}</span>
                  <span className="ads-input-wrap">
                    <input
                      id="ads-acq-share"
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      inputMode="numeric"
                      value={acquisitionShare}
                      onChange={event => setAcquisitionShare(event.target.value)}
                      placeholder="30"
                    />
                    <span className="ads-input-affordance ads-unit-affordance" aria-hidden="true">%</span>
                  </span>
                </label>
              </div>

              <button className={'ads-ai-button ' + aiStatus} type="button" onClick={handleGenerateStrategy} disabled={aiStatus === 'running'}>
                <span className="ads-ai-button-icon"><RiSparkling2Line /></span>
                <span>
                  <strong>{aiStatus === 'running' ? 'Analizando tu campaña…' : aiStatus === 'ready' ? 'Regenerar estrategia con IA' : 'Generar estrategia con IA'}</strong>
                  <small>{aiStatus === 'running' ? 'Vendrava está cruzando audiencia, objetivo y presupuesto' : 'Analiza oportunidades, audiencias y proyecciones'}</small>
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
                <div className="ads-score-label">Puntaje de oportunidad <span title="Mide lo completo que está el brief y el presupuesto frente al sector; no es una predicción de resultados">?</span></div>
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
                    {strategy?.provider && <strong>{strategy.provider === 'heuristic' || strategy.provider === 'fallback' ? 'Reglas por sector' : 'Redactada con IA'}</strong>}
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
                    <div><RiBarChartBoxLine /><span>Referencia mensual</span></div>
                    <small title={forecastLabel.note}>{forecastLabel.badge}</small>
                  </div>
                  <div className="ads-forecast-grid">
                    <div><span>Leads</span><strong>{strategy?.forecast.leads || '—'}</strong></div>
                    <div><span>Coste / lead</span><strong>{strategy?.forecast.cpl || '—'}</strong></div>
                    <div><span>Conversión</span><strong>{strategy?.forecast.conversion || '—'}</strong></div>
                    <div><span>Alcance</span><strong>{strategy?.forecast.reach || '—'}</strong></div>
                  </div>
                  <small className="ads-confidence-note"><RiInformationLine /> {strategy ? forecastLabel.note : 'Genera una estrategia para ver la referencia del sector'}</small>
                </div>

                <div className="ads-creative-card">
                  <div className="ads-card-heading">
                    <div><RiPulseLine /><span>Vista previa del anuncio</span></div>
                    <small>La variante elegida se guarda como copy inicial; si apruebas creatividades en Ads, se publican esas</small>
                    <button type="button" onClick={() => setCreativeIndex(index => (index + 1) % creativeVariants.length)}>
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
                    {creativeVariants.map((variant, index) => <i key={variant.label} className={index === creativeIndex ? 'active' : ''} />)}
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
            {recommendations.length === 0 && <p className="ads-recommendations-empty">Completa el brief y genera la estrategia para ver recomendaciones.</p>}
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
