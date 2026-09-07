import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RiArrowRightSLine } from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { localeCode, useI18n } from '../i18n'
import { goalProgress, validGoals } from '../lib/homeOverview'
import './home-command-center.css'

export function Notice({ resource, retry, children }) {
  if (resource.loading && resource.data === null) return <p className="home-message" role="status">Cargando…</p>
  if (resource.error) return <div className="home-message is-error" role="alert">
    <p>{resource.error} {resource.data !== null ? 'Se muestran los últimos datos cargados; pueden estar desactualizados.' : ''}</p>
    <button type="button" onClick={retry} disabled={resource.loading}>Reintentar</button>
  </div>
  return children || null
}

function GoalMetric({ title, value, target, format }) {
  const progress = goalProgress(value, target)
  return <div className="home-month-metric">
    <h3>{title}</h3><strong>{Number.isFinite(value) ? format(value) : '—'}</strong>
    <p>{progress !== null ? `Objetivo: ${format(target)} · ${progress}% alcanzado` : 'Define tu meta para seguir tu avance'}</p>
    {progress !== null ? <progress max="100" value={Math.min(progress, 100)} aria-label={`${title}: ${progress}% del objetivo`} /> : null}
  </div>
}

export function MonthResults({ resource, retry, onSaved, locale, showLinks = true, title = 'Tu mes, en cifras' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ monthlyRevenue: '', monthlyMeetings: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const stats = resource.data
  const formatMoney = value => new Intl.NumberFormat(localeCode(locale), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
  const number = value => new Intl.NumberFormat(localeCode(locale)).format(value)
  const startEditing = () => {
    setDraft({ monthlyRevenue: stats?.goals?.monthlyRevenue ?? '', monthlyMeetings: stats?.goals?.monthlyMeetings ?? '' })
    setSaveError(''); setMessage(''); setEditing(true)
  }
  const save = async event => {
    event.preventDefault()
    if (!validGoals(draft)) { setSaveError('Introduce dos números enteros mayores que cero.'); return }
    setSaving(true); setSaveError('')
    try {
      const response = await apiFetch('/api/dashboard/goals', { method: 'PUT', body: JSON.stringify({
        monthlyRevenue: Number(draft.monthlyRevenue), monthlyMeetings: Number(draft.monthlyMeetings),
      }) })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(response.status === 403 ? 'No tienes permiso para modificar los objetivos de la organización.' : 'No se han podido guardar los objetivos.')
      if (!body || !validGoals(body)) throw new Error('No se pudo confirmar el guardado. Actualiza para comprobar los objetivos.')
      onSaved(body); setEditing(false); setMessage('Objetivos guardados. Ya puedes seguir tu avance hacia la meta.')
    } catch (error) { setSaveError(error.message) }
    finally { setSaving(false) }
  }
  return <section className="home-section" aria-labelledby="home-month-title" aria-busy={resource.loading}>
    <div className="home-section-title"><h2 id="home-month-title">{title}</h2>
      {stats && !editing ? <button className="home-link" type="button" disabled={resource.loading || !!resource.error} onClick={startEditing}>{stats.goals ? 'Editar objetivos' : 'Definir objetivos'}</button> : null}
    </div>
    <p className="home-description">Decide a dónde quieres llegar. Sigue tus ventas y reuniones frente a tus objetivos del mes.</p>
    <Notice resource={resource} retry={retry} />
    {stats ? <>
      <div className="home-month-grid">
        <GoalMetric title="Ventas cerradas" value={stats.monthlyClosedWonValue} target={stats.goals?.monthlyRevenue} format={formatMoney} />
        <GoalMetric title="Reuniones del mes" value={stats.monthlyMeetings} target={stats.goals?.monthlyMeetings} format={number} />
      </div>
      {editing ? <form className="home-goal-form" onSubmit={save}>
        <fieldset disabled={saving}><legend>¿Qué quiere conseguir tu equipo este mes?</legend>
          <label>Ventas cerradas (€)<input type="number" required min="1" step="1" value={draft.monthlyRevenue} onChange={event => setDraft(current => ({ ...current, monthlyRevenue: event.target.value }))} /></label>
          <label>Reuniones<input type="number" required min="1" step="1" value={draft.monthlyMeetings} onChange={event => setDraft(current => ({ ...current, monthlyMeetings: event.target.value }))} /></label>
          <div className="home-form-actions"><button className="home-button" type="submit">{saving ? 'Guardando…' : 'Guardar objetivos'}</button><button className="home-link" type="button" onClick={() => { setEditing(false); setSaveError('') }}>Cancelar</button></div>
        </fieldset>
        {saveError ? <p className="home-message is-error" role="alert">{saveError}</p> : null}
      </form> : null}
      {message ? <p className="home-message" role="status">{message}</p> : null}
      <p className="home-description home-metric-note">Ventas en euros con fecha de cierre registrada. Reuniones previstas este mes, sin canceladas. Mes calculado en UTC.</p>
    </> : null}
    {showLinks ? <div className="home-section-links"><Link className="home-link" to="/plan">Ver mi plan y objetivos<RiArrowRightSLine aria-hidden="true" /></Link><Link className="home-link" to="/insights">Explorar mis resultados<RiArrowRightSLine aria-hidden="true" /></Link></div> : null}
  </section>
}


export function MonthlyGoals({ showLinks = true, title, onGoalLoaded, refreshKey = 0 }) {
  const { locale } = useI18n()
  const [resource, setResource] = useState({ data: null, loading: true, error: '' })
  const [version, setVersion] = useState(0)
  const pending = useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    pending.current = controller
    let active = true
    setResource(current => ({ ...current, loading: true, error: '' }))
    apiFetch('/api/dashboard/goals', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(response.status === 403 ? 'No tienes permiso para consultar los objetivos.' : 'No se pudieron cargar los objetivos.')
      const data = await response.json()
      if (!Number.isFinite(data?.monthlyClosedWonValue) || !Number.isFinite(data?.monthlyMeetings)) throw new Error('Los resultados mensuales no están disponibles.')
      if (active && !controller.signal.aborted) setResource({ data, loading: false, error: '' })
    }).catch(error => { if (active && !controller.signal.aborted) setResource(current => ({ ...current, loading: false, error: error.message })) })
    return () => { active = false; controller.abort() }
  }, [version, refreshKey])
  useEffect(() => { onGoalLoaded?.(resource.data?.goals?.monthlyRevenue ?? null) }, [resource.data?.goals?.monthlyRevenue, onGoalLoaded])
  useEffect(() => {
    const refresh = () => setVersion(value => value + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  return <MonthResults resource={resource} locale={locale} title={title} showLinks={showLinks}
    retry={() => setVersion(value => value + 1)}
    onSaved={goals => {
      pending.current?.abort()
      setResource(current => ({ ...current, loading: false, data: { ...current.data, goals } }))
    }} />
}
