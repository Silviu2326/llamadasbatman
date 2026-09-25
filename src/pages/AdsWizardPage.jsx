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
// campaña concreta. Etiquetas en adsWizard.business.<tipo>.
const BUSINESS_TYPES = ['servicios', 'local', 'b2b', 'ecommerce', 'agencia']

function currencyFormatter(locale = getLocale()) {
  return new Intl.NumberFormat(localeCode(locale), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function compactFormatter(locale = getLocale()) {
  return new Intl.NumberFormat(localeCode(locale), { notation: 'compact', maximumFractionDigits: 1 })
}

// Etiquetas en adsWizard.destinations.<value>.
const DESTINATIONS = ['landing', 'website', 'whatsapp', 'calendar', 'app']

// Presets de demostración (solo DEMO_MODE): su texto sale de adsWizard.playbooks.*.
function defaultPlaybooks(t) {
  return [
    { id: 'saas-b2b', name: t('adsWizard.playbooks.saasName'), vertical: t('adsWizard.playbooks.saasName'), objective: t('adsWizard.playbooks.saasObjective'), audience: t('adsWizard.playbooks.saasAudience'), budget: 1200 },
    { id: 'servicios-profesionales', name: t('adsWizard.playbooks.servicesName'), vertical: t('adsWizard.playbooks.servicesName'), objective: t('adsWizard.playbooks.servicesObjective'), audience: t('adsWizard.playbooks.servicesAudience'), budget: 750 },
    { id: 'salud', name: t('adsWizard.playbooks.healthName'), vertical: t('adsWizard.playbooks.healthName'), objective: t('adsWizard.playbooks.healthObjective'), audience: t('adsWizard.playbooks.healthAudience'), budget: 600 },
  ]
}

function defaultRecommendations(t) {
  return [
    { id: 'audience', title: t('adsWizard.recommendations.audienceTitle'), body: t('adsWizard.recommendations.audienceBody'), impact: t('adsWizard.recommendations.impactHigh'), icon: RiCrosshairLine, action: 'audience' },
    { id: 'message', title: t('adsWizard.recommendations.messageTitle'), body: t('adsWizard.recommendations.messageBody'), impact: t('adsWizard.recommendations.impactHigh'), icon: RiLightbulbLine, action: 'objective' },
    { id: 'creative', title: t('adsWizard.recommendations.creativeTitle'), body: t('adsWizard.recommendations.creativeBody'), impact: t('adsWizard.recommendations.impactMedium'), icon: RiLineChartLine, action: 'creative' },
  ]
}

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

function getProfile(vertical, t) {
  const normalized = vertical.toLowerCase()
  if (normalized.includes('salud') || normalized.includes('clín') || normalized.includes('health') || normalized.includes('clinic')) {
    return { audience: t('adsWizard.demo.healthAudience'), detail: t('adsWizard.demo.healthDetail'), cpl: 34, conversion: '9–14%', reachFactor: 260, angle: t('adsWizard.demo.healthAngle') }
  }
  if (normalized.includes('servicio') || normalized.includes('consult') || normalized.includes('service')) {
    return { audience: t('adsWizard.demo.servicesAudience'), detail: t('adsWizard.demo.servicesDetail'), cpl: 48, conversion: '11–16%', reachFactor: 230, angle: t('adsWizard.demo.servicesAngle') }
  }
  return { audience: t('adsWizard.demo.defaultAudience'), detail: t('adsWizard.demo.defaultDetail'), cpl: 72, conversion: '12–18%', reachFactor: 190, angle: t('adsWizard.demo.defaultAngle') }
}

function buildStrategy({ vertical, objetivo, presupuesto, audience }, t) {
  const profile = getProfile(vertical, t)
  const budget = Number(presupuesto) || 0
  const completedFields = [vertical, objetivo, presupuesto, audience].filter(Boolean).length
  const score = Math.min(96, Math.max(44, Math.round(
    38 + completedFields * 11 + Math.min(18, budget / 120) + (objetivo.length > 18 ? 7 : 0),
  )))
  const expectedLeads = Math.max(4, Math.round(budget / profile.cpl))
  const lowLeads = Math.max(3, Math.round(expectedLeads * 0.82))
  const highLeads = Math.max(lowLeads + 2, Math.round(expectedLeads * 1.22))
  const resolvedAudience = audience.trim() || profile.audience
  const objective = objetivo.trim() || t('adsWizard.demo.defaultObjective')
  const recommendations = defaultRecommendations(t)

  return {
    score,
    scoreLabel: score >= 80 ? t('adsWizard.demo.scoreHigh') : score >= 65 ? t('adsWizard.demo.scoreGood') : t('adsWizard.demo.scoreLow'),
    audience: resolvedAudience,
    audienceDetail: profile.detail,
    confidence: Math.min(96, Math.max(72, 70 + completedFields * 6)),
    summary: t('adsWizard.demo.summary', { angle: profile.angle, objective: objective.toLowerCase() }),
    forecast: {
      leads: lowLeads + '–' + highLeads,
      cpl: formatCurrency(profile.cpl),
      conversion: profile.conversion,
      reach: budget ? formatReach(budget * profile.reachFactor) + '+' : '—',
    },
    forecastSource: 'sector_benchmark',
    provider: 'heuristic',
    recommendations: [
      { ...recommendations[0], body: t('adsWizard.demo.recAudience', { audience: resolvedAudience.toLowerCase() }) },
      { ...recommendations[1], body: t('adsWizard.demo.recMessage', { angle: profile.angle }) },
      { ...recommendations[2], body: t('adsWizard.demo.recCreative') },
    ],
  }
}

// ponytail: sin merge de fallback — lo que el backend no devuelve se muestra
// como '—', nunca como cifra inventada. buildStrategy solo se usa en DEMO_MODE.
function normalizeStrategy(data, t) {
  if (!data) return null
  const defaults = defaultRecommendations(t)
  const remoteRecommendations = Array.isArray(data.recommendations) ? data.recommendations : []
  return {
    ...data,
    forecast: { leads: '—', cpl: '—', conversion: '—', reach: '—', ...(data.forecast || {}) },
    recommendations: remoteRecommendations.map((recommendation, index) => ({
      ...defaults[index % defaults.length],
      ...recommendation,
      icon: defaults[index % defaults.length].icon,
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

function normalizePlaybooks(data, allowDemo, t) {
  if (!Array.isArray(data) || data.length === 0) return allowDemo ? defaultPlaybooks(t) : []
  return data.map((item, index) => ({
    id: item.id || 'playbook-' + index,
    name: item.name || item.vertical || t('adsWizard.playbooks.fallbackName'),
    vertical: item.vertical || item.name || '',
    objective: item.objective || item.objetivo || t('adsWizard.playbooks.fallbackObjective'),
    audience: item.audience || '',
    budget: item.budget || item.presupuestoMensual || 800,
  }))
}

export default function AdsWizardPage() {
  const { t, locale } = useI18n()
  const experience = useExperience()
  const navigate = useNavigate()
  const draftSeed = useState(() => readDraft())[0]
  const businessContext = experience.providerAvailable && experience.onboardingCompleted && BUSINESS_TYPES.includes(experience.businessType)
    ? { vertical: t(`adsWizard.business.${experience.businessType}`) }
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
  const [strategy, setStrategy] = useState(() => (hasGeneratedStrategy(draftSeed.strategy) ? normalizeStrategy(draftSeed.strategy, t) : null))
  const [showFactors, setShowFactors] = useState(false)
  // Se enseña el CAC máximo en cuanto hay margen: convierte dos números
  // abstractos en la cifra con la que /ads juzgará la campaña.
  const marginPreview = Number(margin) > 0 && Number(acquisitionShare) > 0
    ? t('adsWizard.marginPreview', { amount: ((Number(margin) * Number(acquisitionShare)) / 100).toFixed(2) })
    : t('adsWizard.marginDefault')
  const [creativeIndex, setCreativeIndex] = useState(Number(draftSeed.creativeIndex) || 0)
  const [appliedRecommendation, setAppliedRecommendation] = useState('')
  // El estado del borrador se guarda como clave y se traduce al pintar, para
  // que cambiar de idioma no deje un texto en el idioma anterior.
  const [draftStatus, setDraftStatus] = useState(
    draftSeed.campaignFocus || draftSeed.objetivo ? 'adsWizard.draft.restored' : 'adsWizard.draft.autosave',
  )
  const saveTimerRef = useRef(null)
  const serverSaveTimerRef = useRef(null)
  const campaignVertical = vertical.trim() || knownVertical || t('adsWizard.unclassifiedBusiness')
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
      setPlaybooks(Array.isArray(adPlaybooks) ? adPlaybooks : [])
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
          setStrategy(normalizeStrategy(serverDraft.strategy, t))
          setAiStatus('ready')
        }
        setDraftStatus('adsWizard.draft.restoredServer')
      }
    })

    return () => {
      active = false
      window.clearTimeout(saveTimerRef.current)
      window.clearTimeout(serverSaveTimerRef.current)
    }
    // Solo al montar: t cambia con el idioma pero la carga inicial no se repite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setDraftStatus('adsWizard.draft.saving')
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      setDraftStatus('adsWizard.draft.savedLocal')
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
          if (response.ok && aiStatus !== 'running') setDraftStatus('adsWizard.draft.savedServer')
        })
        .catch(() => {})
    }, 900)

    return () => window.clearTimeout(saveTimerRef.current)
    // draftBrief se deriva de campos ya listados.
  }, [vertical, objetivo, campaignFocus, destination, knowledgeContext, presupuesto, audience, margin, acquisitionShare, strategy, creativeIndex, aiStatus])

  const availablePlaybooks = useMemo(() => normalizePlaybooks(playbooks, DEMO_MODE, t), [playbooks, t])
  const metaState = metaAccount === undefined ? 'loading' : metaAccount ? 'connected' : 'pending'
  const creativeVariants = useMemo(
    () => buildCreativeVariants({ campaignFocus, objetivo, audience: resolveAudience(audience, knownAudience) }, t),
    [campaignFocus, objetivo, audience, knownAudience, t],
  )
  const currentCreative = pickCreative(creativeVariants, creativeIndex)
  const forecastLabel = describeForecast(strategy, t)
  const recommendations = strategy?.recommendations ?? []
  const budgetLabel = presupuesto ? t('adsWizard.budgetPerMonth', { amount: formatCurrency(presupuesto, locale) }) : t('adsWizard.budgetByDefinition')
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
      setMessage(t('adsWizard.knowledgeLoadError'))
    }
  }

  async function handleGenerateStrategy() {
    if (!canGenerate) {
      setMessage(t('adsWizard.generateMissing'))
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
        throw new Error(body.error || t('adsWizard.strategyBackendError'))
      }

      const serverStrategy = await response.json()
      setStrategy(normalizeStrategy(serverStrategy, t))
      setAiStatus('ready')
      setDraftStatus(serverStrategy.provider === 'deepseek' || serverStrategy.provider === 'claude' ? 'adsWizard.lib.providerAi' : 'adsWizard.lib.providerRules')
    } catch {
      if (DEMO_MODE) {
        setStrategy(normalizeStrategy(buildStrategy({ vertical: campaignVertical, objetivo, presupuesto, audience: resolveAudience(audience, knownAudience) }, t), t))
        setAiStatus('ready')
        setDraftStatus('adsWizard.draft.demoStrategy')
        setMessage(t('adsWizard.demoStrategyNotice'))
      } else {
        setStrategy(null)
        setAiStatus('error')
        setDraftStatus('adsWizard.draft.unavailable')
        setMessage(t('adsWizard.strategyUnavailable'))
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
        if (!response.ok) throw new Error(t('adsWizard.draftSyncError'))
        setDraftStatus('adsWizard.draft.savedServer')
      } else {
        setDraftStatus('adsWizard.draft.savedNow')
      }
    } catch {
      setMessage(t('adsWizard.draftSaveError'))
    }
  }

  function applyRecommendation(recommendation) {
    const effect = applyRecommendationEffect(recommendation, {
      strategy,
      objetivo,
      creativeIndex,
      variantCount: creativeVariants.length,
    }, t)
    if (effect.patch.audience != null) setAudience(effect.patch.audience)
    if (effect.patch.objetivo != null) setObjetivo(effect.patch.objetivo)
    if (effect.patch.creativeIndex != null) setCreativeIndex(effect.patch.creativeIndex)
    if (effect.hint) setMessage(t('adsWizard.adjustObjective', { hint: effect.hint }))
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
      setMessage(t('adsWizard.createMissing'))
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
        throw new Error(body.issues?.[0]?.message || body.error || t('adsWizard.createFailed'))
      }

      const campaign = await response.json()
      const result = describeWizardOutcome(campaign, t)
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
          <Link to="/captacion/planificar">{t('adsWizard.breadcrumbCampaigns')}</Link>
          <RiArrowRightLine />
          <span>{t('adsWizard.breadcrumbNew')}</span>
        </div>

        <header className="ads-page-header">
          <div className="ads-header-main">
            <div className="ads-header-mark" aria-hidden="true"><RiRocketLine /></div>
            <div className="ads-header-copy">
              <h1>{t('adsWizard.title')}</h1>
              <p>{t('adsWizard.subtitle')}</p>
            </div>
          </div>
          <div className="ads-header-actions">
            <div className="ads-channel-selector" aria-label={t('adsWizard.channelAria')}>
              <RiMetaLine />
              <span>Meta Ads</span>
              <RiArrowDownSLine />
            </div>
            <button className="ads-draft-button" type="button" onClick={saveDraft}>
              <RiSave3Line />
              {t('adsWizard.saveDraft')}
            </button>
          </div>
        </header>

        <div className="ads-workspace">
          <section className="ads-brief-panel" aria-labelledby="ads-form-title">
            <div className="ads-panel-heading">
              <div className="ads-panel-heading-main">
                <span className="ads-step-number">01</span>
                <div>
                  <h2 id="ads-form-title">{t('adsWizard.briefTitle')}</h2>
                  <p>{t('adsWizard.briefText')}</p>
                </div>
              </div>
              <span className="ads-step-status"><i /> {t('adsWizard.step')}</span>
            </div>

            <div className="ads-presets">
              <div className="ads-presets-heading">
                <span>{t('adsWizard.shortcuts')}</span>
                <small>{t('adsWizard.shortcutsHint')}</small>
              </div>
              {(knownVertical || knownTopics.length || knownAudience) ? <div className="ads-known-context" role="status">
                <RiCheckLine aria-hidden="true" />
                <span>{t('adsWizard.contextPrefix')}{knownVertical ? <>: <strong>{knownVertical}</strong></> : ''}{knownTopics.length ? <> · {t('adsWizard.contextTopics')}: <strong>{knownTopics.join(', ')}</strong></> : ''}{knownAudience ? <> · {t('adsWizard.contextAudience')}: <strong>{knownAudience}</strong></> : ''}{t('adsWizard.contextSuffix')}</span>
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
                  {metaState === 'loading' && t('adsWizard.meta.checking')}
                  {metaState === 'connected' && t('adsWizard.meta.connected')}
                  {metaState === 'pending' && t('adsWizard.meta.pending')}
                </strong>
                <span>
                  {metaState === 'loading' && t('adsWizard.meta.checkingText')}
                  {metaState === 'connected' && t('adsWizard.meta.connectedText', { id: metaAccount.metaAdAccountId })}
                  {metaState === 'pending' && <>{t('adsWizard.meta.pendingBefore')}<Link to="/captacion/conectar">{t('adsWizard.meta.pendingLink')}</Link>{t('adsWizard.meta.pendingAfter')}</>}
                </span>
              </div>
              {metaState === 'pending' && <Link className="ads-connection-action" to="/captacion/conectar">{t('adsWizard.meta.connect')} <RiArrowRightLine /></Link>}
              {metaState === 'connected' && <span className="ads-connection-dot" aria-label={t('adsWizard.meta.connectedDot')} />}
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
                  <Link to={'/campanas/' + outcome.campaignId + '?tab=anuncio'}>{t('adsWizard.goToCampaign')} <RiArrowRightLine /></Link>
                  {outcome.tone === 'info' ? <> · <Link to="/captacion/conectar">{t('adsWizard.connectMeta')}</Link></> : null}
                </span>
              </div>
            )}

            <form className="ads-form" onSubmit={handleSubmit}>
              <div className="ads-fields">
                <label className="ads-field" htmlFor="ads-focus">
                  <span className="ads-field-label"><RiBriefcaseLine /> {t('adsWizard.focusLabel')}</span>
                  <span className="ads-field-helper">{t('adsWizard.focusHelper')}</span>
                  <span className="ads-input-wrap">
                    <input
                      id="ads-focus"
                      list="campaign-topics"
                      value={campaignFocus}
                      onChange={event => { setCampaignFocus(event.target.value); resetStrategy() }}
                      placeholder={t('adsWizard.focusPlaceholder')}
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
                    <span><RiBookOpenLine /> {t('adsWizard.knowledgeLabel')} <em>{t('adsWizard.optional')}</em></span>
                    <Link to="/knowledge-base">{t('adsWizard.manageSources')} <RiArrowRightLine /></Link>
                  </div>
                  <p>{t('adsWizard.knowledgeText')}</p>
                  <span className="ads-input-wrap">
                    <select
                      id="ads-knowledge-source"
                      value={knowledgeContext?.id || ''}
                      onChange={handleKnowledgeSelection}
                    >
                      <option value="">{t('adsWizard.manual')}</option>
                      {knowledgeArticles.map(article => <option key={article.id} value={article.id}>{article.name}{article.type ? ` · ${article.type}` : ''}</option>)}
                    </select>
                    <RiArrowDownSLine className="ads-input-affordance" />
                  </span>
                  {knowledgeContext ? <div className="ads-knowledge-source" role="status">
                    <RiCheckLine aria-hidden="true" />
                    <span><strong>{knowledgeContext.name}</strong>{knowledgeContext.content ? <> · {knowledgeContext.content.slice(0, 132)}{knowledgeContext.content.length > 132 ? '…' : ''}</> : ` · ${t('adsWizard.articleConnected')}`}</span>
                  </div> : null}
                </div>

                <label className="ads-field" htmlFor="ads-destination">
                  <span className="ads-field-label"><RiExternalLinkLine /> {t('adsWizard.destinationLabel')}</span>
                  <span className="ads-field-helper">{t('adsWizard.destinationHelper')}</span>
                  <span className="ads-input-wrap">
                    <select
                      id="ads-destination"
                      value={destination}
                      onChange={event => { setDestination(event.target.value); resetStrategy() }}
                      required
                    >
                      {DESTINATIONS.map(value => <option key={value} value={value}>{t(`adsWizard.destinations.${value}`)}</option>)}
                    </select>
                    <RiArrowDownSLine className="ads-input-affordance" />
                  </span>
                </label>

                <label className="ads-field" htmlFor="ads-objective">
                  <span className="ads-field-label"><RiCrosshairLine /> {t('adsWizard.objectiveLabel')}</span>
                  <span className="ads-field-helper">{t('adsWizard.objectiveHelper')}</span>
                  <span className="ads-input-wrap">
                    <input
                      id="ads-objective"
                      list="objectives"
                      value={objetivo}
                      onChange={event => { setObjetivo(event.target.value); resetStrategy() }}
                      placeholder={t('adsWizard.objectivePlaceholder')}
                      required
                    />
                    <RiArrowDownSLine className="ads-input-affordance" />
                  </span>
                  <datalist id="objectives">
                    {(t('adsWizard.objectiveOptions') ?? []).map(option => <option key={option} value={option} />)}
                  </datalist>
                </label>

                <label className="ads-field" htmlFor="ads-audience">
                  <span className="ads-field-label"><RiTeamLine /> {t('adsWizard.audienceLabel')} <em>{t('adsWizard.optional')}</em></span>
                  <span className="ads-field-helper">{knownAudience ? t('adsWizard.audienceHelperKnown', { audience: knownAudience }) : t('adsWizard.audienceHelper')}</span>
                  <span className="ads-input-wrap">
                    <input
                      id="ads-audience"
                      value={audience}
                      maxLength={160}
                      onChange={event => { setAudience(event.target.value); resetStrategy() }}
                      placeholder={knownAudience || t('adsWizard.audiencePlaceholder')}
                      autoComplete="off"
                    />
                  </span>
                </label>

                <label className="ads-field" htmlFor="ads-budget">
                  <span className="ads-field-label"><RiMoneyDollarCircleLine /> {t('adsWizard.budgetLabel')}</span>
                  <span className="ads-field-helper">{t('adsWizard.budgetHelper')}</span>
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
                  <span className="ads-field-label"><RiMoneyDollarCircleLine /> {t('adsWizard.marginLabel')}</span>
                  <span className="ads-field-helper">{t('adsWizard.marginHelper')}</span>
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
                  <span className="ads-field-label"><RiMoneyDollarCircleLine /> {t('adsWizard.shareLabel')}</span>
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
                  <strong>{aiStatus === 'running' ? t('adsWizard.aiRunning') : aiStatus === 'ready' ? t('adsWizard.aiRegenerate') : t('adsWizard.aiGenerate')}</strong>
                  <small>{aiStatus === 'running' ? t('adsWizard.aiRunningHint') : t('adsWizard.aiHint')}</small>
                </span>
                {aiStatus === 'running' ? <RiPulseLine className="ads-ai-spinner" /> : <RiArrowRightLine />}
              </button>

              <div className="ads-form-footer">
                <span><RiTimeLine /> {t(draftStatus)}</span>
                <button className="ads-submit-button" type="submit" disabled={loading} aria-busy={loading}>
                  {loading ? t('adsWizard.creating') : <><RiSendPlaneLine /> {t('adsWizard.createCampaign')}</>}
                </button>
              </div>
            </form>
          </section>

          <section className="ads-intelligence-panel" aria-labelledby="ads-preview-title">
            <div className="ads-preview-heading">
              <div>
                <div className="ads-heading-number">02</div>
                <h2 id="ads-preview-title">{t('adsWizard.intelTitle')}</h2>
                <p>{t('adsWizard.intelText')}</p>
              </div>
              <span className={'ads-ai-live ' + aiStatus}><i /> {aiStatus === 'running' ? t('adsWizard.aiAnalyzing') : t('adsWizard.aiActive')}</span>
            </div>

            <div className="ads-intelligence-grid">
              <div className="ads-score-block">
                <div className="ads-score-label">{t('adsWizard.scoreLabel')} <span title={t('adsWizard.scoreTooltip')}>?</span></div>
                <div className="ads-score-row">
                  <strong>{strategy?.score || '—'}</strong>
                  <span>/100</span>
                  {strategy && <em className={strategy.score >= 80 ? 'high' : 'medium'}>{strategy.scoreLabel}</em>}
                </div>
                <div className="ads-score-bar"><span style={{ width: (strategy?.score || 0) + '%' }} /></div>
                <p>{strategy?.summary || t('adsWizard.scoreEmpty')}</p>
                <button className="ads-factors-button" type="button" onClick={() => setShowFactors(value => !value)}>
                  {showFactors ? t('adsWizard.hideFactors') : t('adsWizard.showFactors')}
                  <RiArrowDownSLine className={showFactors ? 'rotated' : ''} />
                </button>
                {showFactors && (
                  <div className="ads-factors-list">
                    <span><RiCheckLine /> {t('adsWizard.factorBrief')}</span>
                    <span><RiCheckLine /> {t('adsWizard.factorObjective')}</span>
                    <span><RiCheckLine /> {t('adsWizard.factorBudget')}</span>
                  </div>
                )}
                <div className="ads-orbit-frame">
                  <img src={campaignSignal} alt={t('adsWizard.orbitAlt')} />
                  <span className="ads-orbit-core">IA</span>
                </div>
              </div>

              <div className="ads-intelligence-side">
                <div className="ads-audience-card">
                  <div className="ads-card-heading">
                    <div><RiTeamLine /><span>{t('adsWizard.recommendedAudience')}</span></div>
                    {strategy?.provider && <strong>{strategy.provider === 'heuristic' || strategy.provider === 'fallback' ? t('adsWizard.sectorRules') : t('adsWizard.aiWritten')}</strong>}
                  </div>
                  <div className="ads-audience-body">
                    <img src={audienceConstellation} alt="" />
                    <div>
                      <strong>{strategy?.audience || t('adsWizard.waitingBrief')}</strong>
                      <span>{strategy?.audienceDetail || t('adsWizard.audienceIdle')}</span>
                    </div>
                  </div>
                </div>

                <div className="ads-forecast-card">
                  <div className="ads-card-heading">
                    <div><RiBarChartBoxLine /><span>{t('adsWizard.monthlyReference')}</span></div>
                    <small title={forecastLabel.note}>{forecastLabel.badge}</small>
                  </div>
                  <div className="ads-forecast-grid">
                    <div><span>{t('adsWizard.leads')}</span><strong>{strategy?.forecast.leads || '—'}</strong></div>
                    <div><span>{t('adsWizard.cpl')}</span><strong>{strategy?.forecast.cpl || '—'}</strong></div>
                    <div><span>{t('adsWizard.conversion')}</span><strong>{strategy?.forecast.conversion || '—'}</strong></div>
                    <div><span>{t('adsWizard.reach')}</span><strong>{strategy?.forecast.reach || '—'}</strong></div>
                  </div>
                  <small className="ads-confidence-note"><RiInformationLine /> {strategy ? forecastLabel.note : t('adsWizard.generateToSee')}</small>
                </div>

                <div className="ads-creative-card">
                  <div className="ads-card-heading">
                    <div><RiPulseLine /><span>{t('adsWizard.adPreview')}</span></div>
                    <small>{t('adsWizard.previewNote')}</small>
                    <button type="button" onClick={() => setCreativeIndex(index => (index + 1) % creativeVariants.length)}>
                      {t('adsWizard.varyCreative')} <RiRefreshLine />
                    </button>
                  </div>
                  <div className="ads-creative-preview">
                    <img src={adCreativeGrowth} alt={t('adsWizard.creativeAlt')} />
                    <div className="ads-creative-copy">
                      <small>{currentCreative.label}</small>
                      <strong>{currentCreative.title}</strong>
                      <span>{currentCreative.body}</span>
                      <b>{currentCreative.cta}</b>
                    </div>
                  </div>
                  <div className="ads-creative-dots" aria-label={t('adsWizard.variationsAria')}>
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
              <h2 id="ads-strategy-title"><RiSparkling2Line /> {t('adsWizard.strategyTitle')}</h2>
              <p>{strategy ? t('adsWizard.strategyTextReady') : t('adsWizard.strategyTextIdle')}</p>
            </div>
            {strategy && <span className="ads-strategy-ready"><RiCheckLine /> {t('adsWizard.readyToApply')}</span>}
          </div>
          <div className="ads-recommendations">
            {recommendations.length === 0 && <p className="ads-recommendations-empty">{t('adsWizard.noRecommendations')}</p>}
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
                    {applied ? <><RiCheckLine /> {t('adsWizard.applied')}</> : t('adsWizard.apply')}
                  </button>
                </article>
              )
            })}
          </div>
        </section>

        <section className="ads-info-note">
          <RiInformationLine />
          <div>
            <strong>{t('adsWizard.afterTitle')}</strong>
            <span>{t('adsWizard.afterText')}</span>
          </div>
          <Link to="/captacion/conectar">{t('adsWizard.viewSettings')} <RiArrowRightLine /></Link>
        </section>
      </div>
    </main>
  )
}
