import { useEffect, useMemo, useRef, useState } from 'react'
import { RiArrowLeftLine, RiArrowRightLine, RiCheckLine, RiCloseLine, RiSparkling2Line } from 'react-icons/ri'
import { useExperience } from '../contexts/ExperienceContext'
import {
  BUSINESS_TYPE_OPTIONS,
  EXPERIENCE_MODES,
  EXPERIENCE_MODE_OPTIONS,
  getRecommendedModules,
  MODULE_BY_ID,
  OBJECTIVE_OPTIONS,
  PLAN_OPTIONS,
  PROFILE_OPTIONS,
} from '../lib/experienceConfig'
import { useI18n } from '../i18n'

const STEPS = [
  { id: 'businessType', eyebrow: 'Tu contexto', title: '¿Qué tipo de negocio quieres hacer crecer?', options: BUSINESS_TYPE_OPTIONS },
  { id: 'objective', eyebrow: 'Tu objetivo', title: '¿Qué resultado quieres priorizar?', options: OBJECTIVE_OPTIONS },
  { id: 'profile', eyebrow: 'Tu papel', title: '¿Cómo vas a usar Vendrava?', options: PROFILE_OPTIONS },
  { id: 'plan', eyebrow: 'Tu espacio', title: '¿Qué nivel de experiencia necesitas?', options: PLAN_OPTIONS },
]

const STEP_COPY_KEYS = {
  businessType: ['experience.context', 'onboarding.businessTypeTitle'],
  objective: ['experience.objective', 'onboarding.objectiveTitle'],
  profile: ['experience.role', 'onboarding.profileTitle'],
  plan: ['experience.workspace', 'onboarding.planTitle'],
}

const MODULE_LABEL_KEYS = {
  dashboard: 'nav.dashboard', campaigns: 'nav.campaigns', ads: 'nav.ads', social: 'nav.social', 'prospect-finder': 'nav.prospectFinder', landings: 'nav.landings', funnels: 'nav.funnels', organic: 'nav.organicLeads', inbox: 'nav.inbox', calls: 'nav.calls', agents: 'nav.agents', playbooks: 'nav.playbooks', 'voice-test': 'nav.voiceTest', email: 'nav.emailMarketing', automations: 'nav.automations', growth: 'nav.growthHub', leads: 'nav.leads', pipeline: 'nav.pipeline', meetings: 'nav.meetings', 'revenue-intelligence': 'nav.revenueIntelligence', insights: 'nav.insights', knowledge: 'nav.knowledgeBase', settings: 'nav.settings', governance: 'nav.governance', 'access-control': 'nav.accessControl', 'ad-playbooks': 'nav.adRecipes',
}

function OptionCard({ option, selected, onSelect, t }) {
  const copy = t(`options.${option.id}`)
  const label = Array.isArray(copy) ? copy[0] : option.label
  const description = Array.isArray(copy) ? copy[1] : option.description
  return (
    <button
      type="button"
      className={`experience-option${selected ? ' selected' : ''}`}
      aria-pressed={selected}
      onClick={() => onSelect(option.id)}
    >
      <span className="experience-option-check" aria-hidden="true">
        {selected ? <RiCheckLine /> : null}
      </span>
      <span className="experience-option-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </button>
  )
}

export default function OnboardingModal({ open, onComplete, onClose }) {
  const experience = useExperience()
  const { t } = useI18n()
  const isOpen = open ?? (experience.providerAvailable && !experience.onboardingCompleted)
  const modalRef = useRef(null)
  const previousFocusRef = useRef(null)
  const skipRef = useRef(null)
  const steps = useMemo(() => (
    experience.planSource === 'account'
      ? STEPS.filter(step => step.id !== 'plan')
      : STEPS
  ), [experience.planSource])
  const [stepIndex, setStepIndex] = useState(0)
  const [selectedMode, setSelectedMode] = useState(experience.experienceMode || EXPERIENCE_MODES.RECOMMENDED)
  const [form, setForm] = useState(() => ({
    businessType: experience.businessType,
    objective: experience.objective,
    profile: experience.profile,
    plan: experience.plan,
  }))

  useEffect(() => {
    if (!isOpen) return
    setStepIndex(0)
    setSelectedMode(experience.experienceMode || EXPERIENCE_MODES.RECOMMENDED)
    setForm({
      businessType: experience.businessType,
      objective: experience.objective,
      profile: experience.profile,
      plan: experience.plan,
    })
  }, [
    experience.businessType,
    experience.experienceMode,
    experience.objective,
    experience.plan,
    experience.planSource,
    experience.profile,
    isOpen,
  ])

  useEffect(() => {
    if (!isOpen) return undefined

    previousFocusRef.current = document.activeElement
    const frame = requestAnimationFrame(() => modalRef.current?.focus())
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        skipRef.current?.()
        return
      }
      if (event.key !== 'Tab' || !modalRef.current) return

      const focusable = [...modalRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      if (previousFocusRef.current instanceof HTMLElement) previousFocusRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    setStepIndex(previous => Math.min(previous, steps.length))
  }, [steps.length])

  const currentStep = steps[stepIndex]
  const recommendations = useMemo(() => getRecommendedModules(form), [form])
  const recommendationModules = recommendations
    .map(moduleId => MODULE_BY_ID[moduleId])
    .filter(Boolean)
    .slice(0, 10)

  if (!isOpen) return null

  function updateSelection(id) {
    if (!currentStep) return
    setForm(previous => ({ ...previous, [currentStep.id]: id }))
  }

  function complete(mode = selectedMode) {
    const next = experience.completeOnboarding({
      ...form,
      experienceMode: mode,
      recommendedModules: recommendations,
    })
    onComplete?.(next)
    onClose?.()
  }

  function skip() {
    complete(EXPERIENCE_MODES.BASIC)
  }

  skipRef.current = skip

  function nextStep() {
    if (stepIndex < steps.length) {
      setStepIndex(previous => previous + 1)
      return
    }
    complete()
  }

  function previousStep() {
    setStepIndex(previous => Math.max(0, previous - 1))
  }

  return (
    <div className="experience-modal-backdrop" role="presentation">
      <section ref={modalRef} className="experience-modal" role="dialog" aria-modal="true" aria-labelledby="experience-onboarding-title" aria-describedby="experience-onboarding-intro" tabIndex={-1}>
        <button type="button" className="experience-modal-close" onClick={skip} aria-label={t('experience.skipSetup')}>
          <RiCloseLine aria-hidden="true" />
        </button>

        <div className="experience-modal-header">
          <span className="experience-modal-mark" aria-hidden="true"><RiSparkling2Line /></span>
          <div>
            <p className="experience-modal-kicker">{t('experience.guidedSetup')}</p>
            <h2 id="experience-onboarding-title">{t('onboarding.buildActionCenter')}</h2>
            <p id="experience-onboarding-intro" className="experience-modal-intro">{t('onboarding.intro')}</p>
          </div>
        </div>

        <div className="experience-progress" aria-label={t('onboarding.step', { current: Math.min(stepIndex + 1, steps.length), total: steps.length })}>
          <div className="experience-progress-track"><span style={{ width: `${((Math.min(stepIndex + 1, steps.length)) / steps.length) * 100}%` }} /></div>
          <span>{t('onboarding.step', { current: Math.min(stepIndex + 1, steps.length), total: steps.length })}</span>
        </div>

        {stepIndex < steps.length ? (
          <div className="experience-modal-body">
            <p className="experience-modal-eyebrow">{t(STEP_COPY_KEYS[currentStep.id]?.[0] || currentStep.eyebrow)}</p>
            <h3>{t(STEP_COPY_KEYS[currentStep.id]?.[1] || currentStep.title)}</h3>
            <div className="experience-options" role="list">
              {currentStep.options.map(option => (
                <OptionCard
                  key={option.id}
                  option={option}
                  selected={form[currentStep.id] === option.id}
                  onSelect={updateSelection}
                  t={t}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="experience-modal-body experience-result">
            <p className="experience-modal-eyebrow">{t('onboarding.recommendedWorkspace')}</p>
            <h3>{t('onboarding.clearPlan')}</h3>
            <p className="experience-result-copy">{t('onboarding.recommendationIntro')}</p>
            <div className="experience-recommendations" aria-label={t('onboarding.recommendedModules')}>
              {recommendationModules.length ? recommendationModules.map(module => <span key={module.id}>{MODULE_LABEL_KEYS[module.id] ? t(MODULE_LABEL_KEYS[module.id]) : module.label}</span>) : <span>{t('onboarding.noAdditionalModules')}</span>}
            </div>
            <div className="experience-mode-choice" aria-label={t('onboarding.initialMode')}>
              {EXPERIENCE_MODE_OPTIONS.map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  className={selectedMode === mode.id ? 'selected' : ''}
                  aria-pressed={selectedMode === mode.id}
                  onClick={() => setSelectedMode(mode.id)}
                >
                  <strong>{t(`experience.${mode.id === EXPERIENCE_MODES.BASIC ? 'basic' : mode.id === EXPERIENCE_MODES.RECOMMENDED ? 'recommended' : 'advanced'}`)}</strong><small>{t(`experience.${mode.id === EXPERIENCE_MODES.BASIC ? 'basicDescription' : mode.id === EXPERIENCE_MODES.RECOMMENDED ? 'recommendedDescription' : 'advancedDescription'}`)}</small>
                </button>
              ))}
            </div>
            {experience.planSource !== 'account' && <p className="experience-plan-note">{t('onboarding.planNote')}</p>}
          </div>
        )}

        <footer className="experience-modal-footer">
          <button type="button" className="experience-skip" onClick={skip}>{t('onboarding.skipForNow')}</button>
          <div className="experience-modal-actions">
            {stepIndex > 0 && <button type="button" className="experience-button secondary" onClick={previousStep}><RiArrowLeftLine aria-hidden="true" /> {t('onboarding.back')}</button>}
            <button type="button" className="experience-button primary" onClick={nextStep}>
              {stepIndex < steps.length ? <>{t('onboarding.continue')} <RiArrowRightLine aria-hidden="true" /></> : <>{t('onboarding.enterWorkspace')} <RiArrowRightLine aria-hidden="true" /></>}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
