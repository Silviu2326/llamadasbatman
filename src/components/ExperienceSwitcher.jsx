import { RiLayoutGridLine, RiStackLine } from 'react-icons/ri'
import { useExperience } from '../contexts/ExperienceContext'
import { RiSparkling2Line } from 'react-icons/ri'
import { EXPERIENCE_MODE_OPTIONS, EXPERIENCE_MODES, getPlanLabel, getProfileLabel } from '../lib/experienceConfig'
import { useI18n } from '../i18n'

const MODE_ICONS = {
  [EXPERIENCE_MODES.BASIC]: RiLayoutGridLine,
  [EXPERIENCE_MODES.RECOMMENDED]: RiSparkling2Line,
  [EXPERIENCE_MODES.ADVANCED]: RiStackLine,
}

export default function ExperienceSwitcher({ compact = false, className = '' }) {
  const { providerAvailable, profile, plan, experienceMode, setExperienceMode } = useExperience()
  const { t } = useI18n()
  if (!providerAvailable) return null

  const modeLabel = mode => ({
    [EXPERIENCE_MODES.BASIC]: t('experience.basic'),
    [EXPERIENCE_MODES.RECOMMENDED]: t('experience.recommended'),
    [EXPERIENCE_MODES.ADVANCED]: t('experience.advanced'),
  }[mode])

  const modeDescription = mode => ({
    [EXPERIENCE_MODES.BASIC]: t('experience.basicDescription'),
    [EXPERIENCE_MODES.RECOMMENDED]: t('experience.recommendedDescription'),
    [EXPERIENCE_MODES.ADVANCED]: t('experience.advancedDescription'),
  }[mode])

  const profileCopy = t(`options.${profile}`)
  const planCopy = t(`options.${plan}`)

  return (
    <div className={`experience-switcher${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`}>
      <div className="experience-switcher-heading">
        <span>{t('experience.workView')}</span>
        <span className="experience-switcher-profile">{Array.isArray(profileCopy) ? profileCopy[0] : getProfileLabel(profile)} · {Array.isArray(planCopy) ? planCopy[0] : getPlanLabel(plan)}</span>
      </div>
      <div className="experience-switcher-options" role="group" aria-label="Modo de navegación">
        {EXPERIENCE_MODE_OPTIONS.map(mode => {
          const Icon = MODE_ICONS[mode.id]
          const selected = experienceMode === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              className={selected ? 'active' : ''}
              aria-pressed={selected}
              title={modeDescription(mode.id)}
              onClick={() => setExperienceMode(mode.id)}
            >
              <Icon aria-hidden="true" />
              <span>{compact && mode.id === EXPERIENCE_MODES.RECOMMENDED ? t('experience.recommendedShort') : modeLabel(mode.id)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
