import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import {
  ALL_MODULE_IDS,
  DEFAULT_EXPERIENCE_PREFERENCES,
  EXPERIENCE_MODES,
  EXPERIENCE_STORAGE_KEY,
  getAccountPlan,
  getExperienceStorageKey,
  getRecommendedModules,
  isModuleAvailableForPlan,
  MODULE_BY_ID,
  normalizeExperiencePreferences,
  readExperiencePreferences,
  writeExperiencePreferences,
} from '../lib/experienceConfig'

const ExperienceContext = createContext(null)

const FALLBACK_CONTEXT = {
  providerAvailable: false,
  profile: 'comercial',
  businessType: 'servicios',
  objective: 'ventas',
  plan: 'pro',
  planSource: 'local',
  experienceMode: EXPERIENCE_MODES.RECOMMENDED,
  onboardingCompleted: true,
  recommendedModules: ALL_MODULE_IDS,
  setExperienceMode: () => {},
  completeOnboarding: () => {},
  resetOnboarding: () => {},
  isModuleVisible: () => true,
  isModuleAvailable: () => true,
}

function getInitialPreferences(initialPreferences) {
  const stored = readExperiencePreferences()
  return normalizeExperiencePreferences({
    ...DEFAULT_EXPERIENCE_PREFERENCES,
    ...(stored || {}),
    ...(initialPreferences || {}),
  })
}

export function ExperienceProvider({ children, initialPreferences }) {
  const auth = useAuth()
  const [preferences, setPreferences] = useState(() => getInitialPreferences(initialPreferences))
  const userStorageKey = useMemo(() => getExperienceStorageKey(auth?.user), [
    auth?.user?.orgId,
    auth?.user?.organizationId,
    auth?.user?.tenantId,
    auth?.user?.userId,
    auth?.user?.id,
  ])
  const accountPlan = getAccountPlan(auth?.user)

  useEffect(() => {
    if (!auth?.user) return

    const scopedPreferences = readExperiencePreferences(userStorageKey)
    const legacyPreferences = userStorageKey === EXPERIENCE_STORAGE_KEY
      ? null
      : readExperiencePreferences(EXPERIENCE_STORAGE_KEY)
    const accountPreferences = scopedPreferences || legacyPreferences || initialPreferences || DEFAULT_EXPERIENCE_PREFERENCES
    const next = normalizeExperiencePreferences({
      ...accountPreferences,
      ...(accountPlan ? { plan: accountPlan, planSource: 'account' } : {}),
    })

    setPreferences(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
  }, [accountPlan, auth?.user, initialPreferences, userStorageKey])

  useEffect(() => {
    writeExperiencePreferences(preferences, userStorageKey)
  }, [preferences, userStorageKey])

  const setExperienceMode = useCallback(mode => {
    const nextMode = [EXPERIENCE_MODES.BASIC, EXPERIENCE_MODES.RECOMMENDED, EXPERIENCE_MODES.ADVANCED].includes(mode)
      ? mode
      : EXPERIENCE_MODES.RECOMMENDED
    setPreferences(previous => ({ ...previous, experienceMode: nextMode }))
  }, [])

  const completeOnboarding = useCallback(values => {
    const candidate = normalizeExperiencePreferences({ ...preferences, ...(values || {}) })
    const next = normalizeExperiencePreferences({
      ...candidate,
      onboardingCompleted: true,
      recommendedModules: candidate.recommendedModules.length
        ? candidate.recommendedModules
        : getRecommendedModules(candidate),
    })
    setPreferences(next)
    return next
  }, [preferences])

  const resetOnboarding = useCallback(() => {
    setPreferences(previous => normalizeExperiencePreferences({
      ...previous,
      onboardingCompleted: false,
      recommendedModules: [],
    }))
  }, [])

  const isModuleAvailable = useCallback(moduleId => (
    isModuleAvailableForPlan(moduleId, preferences.plan)
  ), [preferences.plan])

  const isModuleVisible = useCallback((moduleId, options = {}) => {
    const { isActive = false } = options
    const module = moduleId && moduleId !== 'unknown'
      ? moduleId
      : null
    if (!module || !isModuleAvailableForPlan(module, preferences.plan)) return false
    if (isActive) return true
    if (preferences.experienceMode === EXPERIENCE_MODES.ADVANCED) return true

    if (preferences.experienceMode === EXPERIENCE_MODES.BASIC) {
      return module === 'dashboard' || Boolean(MODULE_BY_ID[module]?.basicVisible)
    }

    return module === 'dashboard' || preferences.recommendedModules.includes(module)
  }, [preferences.experienceMode, preferences.plan, preferences.recommendedModules])

  const value = useMemo(() => ({
    providerAvailable: true,
    ...preferences,
    user: auth?.user || null,
    setExperienceMode,
    completeOnboarding,
    resetOnboarding,
    isModuleVisible,
    isModuleAvailable,
  }), [auth?.user, completeOnboarding, isModuleAvailable, isModuleVisible, preferences, resetOnboarding, setExperienceMode])

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>
}

export function useExperience() {
  return useContext(ExperienceContext) || FALLBACK_CONTEXT
}
