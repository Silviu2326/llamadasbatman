import { useEffect, useMemo, useState } from 'react'
import { RiArrowRightLine, RiCheckLine, RiCompass3Line, RiEyeLine, RiSearchEyeLine } from 'react-icons/ri'
import './organic-components.css'
import { apiFetch } from '../../lib/api'

// Onboarding adaptativo de organico.md §4.6: tres columnas — pasos, formulario
// dinámico y vista previa viva.
//
// Este componente **no conoce ningún sector**. Las preguntas, los
// acontecimientos y los canales llegan del backend como datos del módulo
// vertical. Añadir "clínicas" no debe tocar esta pantalla; si hubiera un
// `if (sector === 'padel')` aquí, el patrón estaría roto.

const STEP_LABEL = {
  business: 'Negocio',
  sector: 'Sector detectado',
  sources: 'Fuentes',
  events: 'Acontecimientos',
  content: 'Contenido',
  approval: 'Aprobación',
  activation: 'Activación',
}

const GOALS = [
  'ganar visibilidad', 'conseguir leads', 'vender', 'informar a clientes',
  'crear comunidad', 'cubrir acontecimientos', 'atraer tráfico a la web',
]

const APPROVAL_LABEL = {
  auto: 'Automático',
  approval: 'Con aprobación',
  always_approval: 'Aprobación obligatoria',
}

export default function OrganicOnboarding({ onComplete }) {
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
      .catch(() => setError('No se pudo cargar el onboarding.'))
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
      if (!res.ok) throw new Error(data?.error || 'No se pudo guardar.')
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
      if (!res.ok) throw new Error(data?.error || 'No se pudo analizar la web.')
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
      if (!res.ok) throw new Error(data?.error || 'No se pudo activar.')
      setSummary(data.summary)
      setStep('activation')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!state) return <section className="organic-state"><div className="organic-state-box"><p>Cargando onboarding…</p></div></section>

  return (
    <section className="organic-onboarding">
      {/* Izquierda — pasos */}
      <nav className="organic-onboarding-steps" aria-label="Pasos del onboarding">
        {(state.steps || []).map((key, index) => (
          <button
            key={key}
            type="button"
            className={step === key ? 'active' : ''}
            onClick={() => setStep(key)}
            disabled={key !== 'business' && !state.project}
          >
            <span>{index + 1}</span>
            {STEP_LABEL[key] ?? key}
          </button>
        ))}
      </nav>

      {/* Centro — formulario dinámico */}
      <div className="organic-onboarding-form">
        {error && <p className="organic-onboarding-error" role="alert">{error}</p>}

        {step === 'business' && (
          <>
            <h2>Cuéntame sobre tu negocio</h2>
            <p className="organic-onboarding-help">Con esto Vendrava ya puede empezar a investigar. Lo específico de tu sector viene después.</p>
            <label>Nombre del negocio<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label>Página web<input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="tunegocio.com" /></label>
            <label>Ciudades donde operas<input value={form.locations} onChange={e => setForm({ ...form, locations: e.target.value })} placeholder="Valencia, Castellón" /></label>
            <label>¿Quiénes son tus clientes?<input value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })} /></label>
            <label>Redes sociales<input value={form.socialProfiles} onChange={e => setForm({ ...form, socialProfiles: e.target.value })} placeholder="instagram.com/…, linkedin.com/…" /></label>
            <label>Objetivo principal
              <select value={form.primaryGoal} onChange={e => setForm({ ...form, primaryGoal: e.target.value })}>
                <option value="">Elige uno</option>
                {GOALS.map(goal => <option key={goal} value={goal}>{goal}</option>)}
              </select>
            </label>
            <label>Descríbelo como se lo explicarías a un empleado nuevo
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
                {busy ? 'Guardando…' : <>Continuar <RiArrowRightLine /></>}
              </button>
            </div>
          </>
        )}

        {step === 'sector' && (
          <>
            <h2>Qué ha entendido Vendrava</h2>
            {!investigation && (
              <button type="button" className="organic-button secondary" disabled={busy} onClick={runInvestigation}>
                <RiSearchEyeLine /> {busy ? 'Analizando tu web…' : 'Analizar mi web'}
              </button>
            )}
            {investigation?.fetchError && (
              // No se calla el fallo: si la web no se pudo leer, la detección
              // salió solo de lo que contó el usuario y hay que decirlo.
              <p className="organic-onboarding-help">{investigation.fetchError} La detección usa solo lo que has escrito tú.</p>
            )}
            {investigation && (
              <>
                {investigation.sectors.length === 0
                  ? <p className="organic-onboarding-help">No se ha reconocido el sector automáticamente. Elígelo tú.</p>
                  : <p className="organic-onboarding-help">Analizados {investigation.analyzedChars.toLocaleString('es-ES')} caracteres de tu web.</p>}
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
                        {sector.confidence != null && <span>Confianza {Math.round(sector.confidence * 100)} %</span>}
                        {/* Enseñar los términos hace la confianza defendible:
                            el usuario ve por qué y corrige con criterio. */}
                        {sector.matched?.length > 0 && <em>Encontrado: {sector.matched.join(', ')}</em>}
                      </div>
                    </label>
                  ))}
                </div>
                <p className="organic-onboarding-help">Una empresa puede pertenecer a varios sectores. Marca todos los que apliquen.</p>
                <div className="organic-onboarding-actions">
                  <button type="button" className="organic-button primary" disabled={busy || !sectors.length} onClick={() => save({ sectors }, 'events')}>
                    Confirmar sector <RiArrowRightLine />
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === 'events' && (
          <>
            <h2>Qué acontecimientos quieres cubrir</h2>
            <p className="organic-onboarding-help">Estas preguntas salen del módulo de tu sector. Cambian según lo que hayas confirmado.</p>
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
                                <option value="">Sin responder</option><option value="true">Sí</option><option value="false">No</option>
                              </select>
                            : question.type === 'select'
                              ? <select value={moduleAnswers[module.key]?.[question.key] ?? ''} onChange={e => setModuleAnswers(c => ({ ...c, [module.key]: { ...c[module.key], [question.key]: e.target.value } }))}>
                                  <option value="">Elige</option>{(question.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                              : <input value={moduleAnswers[module.key]?.[question.key] ?? ''} onChange={e => setModuleAnswers(c => ({ ...c, [module.key]: { ...c[module.key], [question.key]: e.target.value } }))} />}
                        {question.help && <small>{question.help}</small>}
                      </label>
                    ))}
                  </div>
                ))}
                <h4>Acontecimientos</h4>
                <div className="organic-event-grid">
                  {module.events.map(event => {
                    const key = `${module.key}:${event.key}`
                    return (
                      <label key={key} className={chosenEvents.includes(key) ? 'is-picked' : ''}>
                        <input type="checkbox" checked={chosenEvents.includes(key)} onChange={() => setChosenEvents(c => c.includes(key) ? c.filter(k => k !== key) : [...c, key])} />
                        <span>{event.label}</span>
                        <em>{APPROVAL_LABEL[event.defaultApproval]}</em>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="organic-onboarding-actions">
              <button type="button" className="organic-button secondary" disabled={busy} onClick={() => save({ moduleAnswers }, 'events')}>Guardar respuestas</button>
              <button type="button" className="organic-button primary" disabled={busy || !chosenEvents.length} onClick={async () => { await save({ moduleAnswers }, 'events'); activate() }}>
                Activar mi sistema <RiCheckLine />
              </button>
            </div>
          </>
        )}

        {step === 'activation' && (
          <div className="organic-onboarding-done">
            <RiCompass3Line />
            <h2>Tu sistema de contenido está preparado</h2>
            <p>{summary?.sentence ?? 'Configuración guardada.'}</p>
            <button type="button" className="organic-button primary" onClick={onComplete}>Ir al centro de mando <RiArrowRightLine /></button>
          </div>
        )}
      </div>

      {/* Derecha — vista previa viva */}
      <aside className="organic-onboarding-preview">
        <h3><RiEyeLine /> Lo que hará Vendrava</h3>
        {chosenEvents.length === 0
          ? <p>Según vayas marcando acontecimientos, aquí verás qué publicará Vendrava y cuándo.</p>
          : allEvents.filter(event => chosenEvents.includes(`${event.moduleKey}:${event.key}`)).map(event => (
              <div key={`${event.moduleKey}:${event.key}`} className="organic-preview-event">
                <strong>{event.label}</strong>
                <ul>
                  {event.suggestedTimings.map(timing => (
                    <li key={timing}>{timing.replace('7d_before', '7 días antes').replace('24h_before', '24 h antes').replace('1h_before', '1 h antes').replace('on_start', 'al empezar').replace('on_end', 'al terminar').replace('next_day', 'al día siguiente').replace('weekly', 'resumen semanal')} → {event.suggestedFormats.join(' + ')}</li>
                  ))}
                </ul>
                <em>{APPROVAL_LABEL[event.defaultApproval]}</em>
              </div>
            ))}
      </aside>
    </section>
  )
}
