import { useEffect, useMemo, useState } from 'react'
import { RiArrowRightLine, RiCheckLine, RiCompass3Line, RiEyeLine, RiSearchEyeLine } from 'react-icons/ri'
import './organic-components.css'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../i18n'

// Onboarding adaptativo de organico.md §4.6: tres columnas — pasos, formulario
// dinámico y vista previa viva.
//
// Este componente **no conoce ningún sector**. Las preguntas, los
// acontecimientos y los canales llegan del backend como datos del módulo
// vertical. Añadir "clínicas" no debe tocar esta pantalla; si hubiera un
// `if (sector === 'padel')` aquí, el patrón estaría roto.

const STEP_KEYS = ['business', 'sector', 'sources', 'events', 'content', 'approval', 'activation']

// El valor guardado en `primaryGoal` es el texto en español (contrato con el
// backend); la etiqueta que se enseña se traduce por clave.
const GOALS = [
  ['ganar visibilidad', 'visibility'], ['conseguir leads', 'leads'], ['vender', 'sell'], ['informar a clientes', 'inform'],
  ['crear comunidad', 'community'], ['cubrir acontecimientos', 'events'], ['atraer tráfico a la web', 'traffic'],
]

const APPROVAL_KEYS = ['auto', 'approval', 'always_approval']
const TIMING_KEYS = ['7d_before', '24h_before', '1h_before', 'on_start', 'on_end', 'next_day', 'weekly']

export default function OrganicOnboarding({ onComplete }) {
  const { t, locale } = useI18n()
  const approvalLabel = value => (APPROVAL_KEYS.includes(value) ? t(`organic.onboarding.approval.${value}`) : value)
  const [state, setState] = useState(null)
  const [step, setStep] = useState('business')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [investigation, setInvestigation] = useState(null)
  const [form, setForm] = useState({ name: '', website: '', locations: '', audience: '', primaryGoal: '', businessDescription: '', socialProfiles: '' })
  const [sectors, setSectors] = useState([])
  const [moduleAnswers, setModuleAnswers] = useState({})
  const [chosenEvents, setChosenEvents] = useState([])
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    apiFetch('/api/organic/onboarding')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!data) return
        setState(data)
        setStep(data.step || 'business')
        if (data.project) {
          setForm(current => ({
            ...current,
            name: data.project.name || '',
            website: data.project.website || '',
            locations: (data.project.locations || []).join(', '),
            audience: data.project.audience || '',
            primaryGoal: data.project.primaryGoal || '',
            businessDescription: data.project.businessDescription || '',
            socialProfiles: (data.project.socialProfiles || []).join(', '),
          }))
          setSectors(data.project.sectors || [])
          setModuleAnswers(data.project.moduleAnswers || {})
        }
      })
      .catch(() => setError(t('organic.onboarding.loadFailed')))
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const modules = state?.modules ?? []
  const allEvents = useMemo(
    () => modules.flatMap(module => module.events.map(event => ({ ...event, moduleKey: module.key, moduleLabel: module.label }))),
    [modules],
  )

  async function save(patch, nextStep) {
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch('/api/organic/onboarding', {
        method: 'PUT',
        body: JSON.stringify({ ...patch, step: nextStep }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || t('organic.onboarding.saveFailed'))
      setState(data)
      if (nextStep) setStep(nextStep)
      return data
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function runInvestigation() {
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch('/api/organic/onboarding/investigate', {
        method: 'POST',
        body: JSON.stringify({ website: form.website }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || t('organic.onboarding.analyzeFailed'))
      setInvestigation(data)
      // Se preselecciona lo detectado, pero el usuario manda: la §4.2 exige
      // poder corregir el sector y añadir otro tipo de actividad.
      setSectors(data.sectors.filter(item => item.confidence >= 0.4).map(item => item.key))
      setStep('sector')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function activate() {
    setBusy(true)
    setError('')
    try {
      const choices = chosenEvents.map(key => {
        const event = allEvents.find(item => `${item.moduleKey}:${item.key}` === key)
        return { moduleKey: event.moduleKey, eventKey: event.key }
      })
      const res = await apiFetch('/api/organic/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({ choices }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || t('organic.onboarding.activateFailed'))
      setSummary(data.summary)
      setStep('activation')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!state) return <section className="organic-state"><div className="organic-state-box"><p>{t('organic.onboarding.loading')}</p></div></section>

  return (
    <section className="organic-onboarding">
      {/* Izquierda — pasos */}
      <nav className="organic-onboarding-steps" aria-label={t('organic.onboarding.stepsAria')}>
        {(state.steps || []).map((key, index) => (
          <button
            key={key}
            type="button"
            className={step === key ? 'active' : ''}
            onClick={() => setStep(key)}
            disabled={key !== 'business' && !state.project}
          >
            <span>{index + 1}</span>
            {STEP_KEYS.includes(key) ? t(`organic.onboarding.step.${key}`) : key}
          </button>
        ))}
      </nav>

      {/* Centro — formulario dinámico */}
      <div className="organic-onboarding-form">
        {error && <p className="organic-onboarding-error" role="alert">{error}</p>}

        {step === 'business' && (
          <>
            <h2>{t('organic.onboarding.businessTitle')}</h2>
            <p className="organic-onboarding-help">{t('organic.onboarding.businessHelp')}</p>
            <label>{t('organic.onboarding.businessName')}<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label>{t('organic.onboarding.website')}<input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder={t('organic.onboarding.websitePlaceholder')} /></label>
            <label>{t('organic.onboarding.locations')}<input value={form.locations} onChange={e => setForm({ ...form, locations: e.target.value })} placeholder={t('organic.onboarding.locationsPlaceholder')} /></label>
            <label>{t('organic.onboarding.audience')}<input value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })} /></label>
            <label>{t('organic.onboarding.social')}<input value={form.socialProfiles} onChange={e => setForm({ ...form, socialProfiles: e.target.value })} placeholder="instagram.com/…, linkedin.com/…" /></label>
            <label>{t('organic.onboarding.primaryGoal')}
              <select value={form.primaryGoal} onChange={e => setForm({ ...form, primaryGoal: e.target.value })}>
                <option value="">{t('organic.onboarding.chooseOne')}</option>
                {GOALS.map(([goal, key]) => <option key={goal} value={goal}>{t(`organic.onboarding.goal.${key}`)}</option>)}
              </select>
            </label>
            <label>{t('organic.onboarding.describe')}
              <textarea rows="4" value={form.businessDescription} onChange={e => setForm({ ...form, businessDescription: e.target.value })} />
            </label>
            <div className="organic-onboarding-actions">
              <button
                type="button"
                className="organic-button primary"
                disabled={busy || !form.name.trim()}
                onClick={async () => {
                  const saved = await save({
                    name: form.name.trim(),
                    website: form.website.trim() || undefined,
                    locations: form.locations.split(',').map(v => v.trim()).filter(Boolean),
                    audience: form.audience.trim() || undefined,
                    primaryGoal: form.primaryGoal || undefined,
                    businessDescription: form.businessDescription.trim() || undefined,
                    socialProfiles: form.socialProfiles.split(',').map(v => v.trim()).filter(Boolean),
                  }, 'sector')
                  if (saved && form.website.trim()) runInvestigation()
                }}
              >
                {busy ? t('organic.onboarding.saving') : <>{t('organic.onboarding.continue')} <RiArrowRightLine /></>}
              </button>
            </div>
          </>
        )}

        {step === 'sector' && (
          <>
            <h2>{t('organic.onboarding.sectorTitle')}</h2>
            {!investigation && (
              <button type="button" className="organic-button secondary" disabled={busy} onClick={runInvestigation}>
                <RiSearchEyeLine /> {busy ? t('organic.onboarding.analyzingSite') : t('organic.onboarding.analyzeSite')}
              </button>
            )}
            {investigation?.fetchError && (
              // No se calla el fallo: si la web no se pudo leer, la detección
              // salió solo de lo que contó el usuario y hay que decirlo.
              <p className="organic-onboarding-help">{investigation.fetchError} {t('organic.onboarding.fetchErrorNote')}</p>
            )}
            {investigation && (
              <>
                {investigation.sectors.length === 0
                  ? <p className="organic-onboarding-help">{t('organic.onboarding.noSector')}</p>
                  : <p className="organic-onboarding-help">{t('organic.onboarding.analyzedChars', { n: investigation.analyzedChars.toLocaleString(locale === 'en' ? 'en-US' : 'es-ES') })}</p>}
                <div className="organic-sector-list">
                  {(investigation.sectors.length ? investigation.sectors : state.availableModules.map(m => ({ ...m, confidence: null, matched: [] }))).map(sector => (
                    <label key={sector.key} className={sectors.includes(sector.key) ? 'is-picked' : ''}>
                      <input
                        type="checkbox"
                        checked={sectors.includes(sector.key)}
                        onChange={() => setSectors(current => current.includes(sector.key) ? current.filter(k => k !== sector.key) : [...current, sector.key])}
                      />
                      <div>
                        <strong>{sector.label}</strong>
                        {sector.confidence != null && <span>{t('organic.onboarding.confidence', { n: Math.round(sector.confidence * 100) })}</span>}
                        {/* Enseñar los términos hace la confianza defendible:
                            el usuario ve por qué y corrige con criterio. */}
                        {sector.matched?.length > 0 && <em>{t('organic.onboarding.found', { terms: sector.matched.join(', ') })}</em>}
                      </div>
                    </label>
                  ))}
                </div>
                <p className="organic-onboarding-help">{t('organic.onboarding.multiSector')}</p>
                <div className="organic-onboarding-actions">
                  <button type="button" className="organic-button primary" disabled={busy || !sectors.length} onClick={() => save({ sectors }, 'events')}>
                    {t('organic.onboarding.confirmSector')} <RiArrowRightLine />
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === 'events' && (
          <>
            <h2>{t('organic.onboarding.eventsTitle')}</h2>
            <p className="organic-onboarding-help">{t('organic.onboarding.eventsHelp')}</p>
            {modules.map(module => (
              <div key={module.key} className="organic-module-block">
                <h3>{module.label}</h3>
                {module.questionGroups.map(group => (
                  <div key={group.title}>
                    <h4>{group.title}</h4>
                    {group.questions.map(question => (
                      <label key={question.key}>
                        {question.label}{question.required && <i> *</i>}
                        {question.type === 'textarea'
                          ? <textarea rows="2" value={moduleAnswers[module.key]?.[question.key] ?? ''} onChange={e => setModuleAnswers(c => ({ ...c, [module.key]: { ...c[module.key], [question.key]: e.target.value } }))} />
                          : question.type === 'boolean'
                            ? <select value={String(moduleAnswers[module.key]?.[question.key] ?? '')} onChange={e => setModuleAnswers(c => ({ ...c, [module.key]: { ...c[module.key], [question.key]: e.target.value === 'true' } }))}>
                                <option value="">{t('organic.onboarding.unanswered')}</option><option value="true">{t('organic.onboarding.yes')}</option><option value="false">{t('organic.onboarding.no')}</option>
                              </select>
                            : question.type === 'select'
                              ? <select value={moduleAnswers[module.key]?.[question.key] ?? ''} onChange={e => setModuleAnswers(c => ({ ...c, [module.key]: { ...c[module.key], [question.key]: e.target.value } }))}>
                                  <option value="">{t('organic.onboarding.choose')}</option>{(question.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                              : <input value={moduleAnswers[module.key]?.[question.key] ?? ''} onChange={e => setModuleAnswers(c => ({ ...c, [module.key]: { ...c[module.key], [question.key]: e.target.value } }))} />}
                        {question.help && <small>{question.help}</small>}
                      </label>
                    ))}
                  </div>
                ))}
                <h4>{t('organic.onboarding.events')}</h4>
                <div className="organic-event-grid">
                  {module.events.map(event => {
                    const key = `${module.key}:${event.key}`
                    return (
                      <label key={key} className={chosenEvents.includes(key) ? 'is-picked' : ''}>
                        <input type="checkbox" checked={chosenEvents.includes(key)} onChange={() => setChosenEvents(c => c.includes(key) ? c.filter(k => k !== key) : [...c, key])} />
                        <span>{event.label}</span>
                        <em>{approvalLabel(event.defaultApproval)}</em>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="organic-onboarding-actions">
              <button type="button" className="organic-button secondary" disabled={busy} onClick={() => save({ moduleAnswers }, 'events')}>{t('organic.onboarding.saveAnswers')}</button>
              <button type="button" className="organic-button primary" disabled={busy || !chosenEvents.length} onClick={async () => { await save({ moduleAnswers }, 'events'); activate() }}>
                {t('organic.onboarding.activate')} <RiCheckLine />
              </button>
            </div>
          </>
        )}

        {step === 'activation' && (
          <div className="organic-onboarding-done">
            <RiCompass3Line />
            <h2>{t('organic.onboarding.doneTitle')}</h2>
            <p>{summary?.sentence ?? t('organic.onboarding.savedConfig')}</p>
            <button type="button" className="organic-button primary" onClick={onComplete}>{t('organic.onboarding.goToCommand')} <RiArrowRightLine /></button>
          </div>
        )}
      </div>

      {/* Derecha — vista previa viva */}
      <aside className="organic-onboarding-preview">
        <h3><RiEyeLine /> {t('organic.onboarding.previewTitle')}</h3>
        {chosenEvents.length === 0
          ? <p>{t('organic.onboarding.previewEmpty')}</p>
          : allEvents.filter(event => chosenEvents.includes(`${event.moduleKey}:${event.key}`)).map(event => (
              <div key={`${event.moduleKey}:${event.key}`} className="organic-preview-event">
                <strong>{event.label}</strong>
                <ul>
                  {event.suggestedTimings.map(timing => (
                    <li key={timing}>{TIMING_KEYS.includes(timing) ? t(`organic.onboarding.timing.${timing}`) : timing} → {event.suggestedFormats.join(' + ')}</li>
                  ))}
                </ul>
                <em>{approvalLabel(event.defaultApproval)}</em>
              </div>
            ))}
      </aside>
    </section>
  )
}
