import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { MonthlyGoals } from '../components/MonthlyGoals'
import { simulate, reversePlan } from '../lib/growthSimulation'
import {
  RiAddCircleLine, RiArrowRightLine, RiCheckboxCircleLine, RiCoinsLine,
  RiFlashlightLine, RiFocus3Line, RiHandCoinLine, RiInformationLine,
  RiLineChartLine, RiLoader4Line, RiRefreshLine, RiResetLeftLine,
  RiSignalTowerLine, RiTaskLine, RiTimeLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { classifyFetchError } from '../lib/dataStatus'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import { getLocale, localeCode } from '../i18n'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import PageLoadingState from '../components/ui/PageLoadingState'
import './growth/growth-surface.css'
import './growth-plan.css'
import './plan-focused.css'

const WINDOWS = [
  { value: 30, label: '30 días' },
  { value: 90, label: '90 días' },
  { value: 180, label: '6 meses' },
  { value: 365, label: '1 año' },
]

const TABS = [
  { key: 'objetivos', label: 'Objetivos', icon: RiFocus3Line },
  { key: 'hacer', label: 'Plan de acción', icon: RiTaskLine },
  { key: 'simular', label: 'Simulador', icon: RiLineChartLine },
]

const HORIZON_CARD = { hoy: 'tone-danger', 'esta-semana': 'tone-warn', 'este-mes': 'tone-info' }
const HORIZON_LABEL = { hoy: 'Hoy', 'esta-semana': 'Esta semana', 'este-mes': 'Este mes' }
const HORIZON_ORDER = ['hoy', 'esta-semana', 'este-mes']
const KIND_LABEL = { ingreso: 'Ventas estimadas', ahorro: 'Ahorro estimado', rescate: 'Recuperación estimada' }
const KIND_CARD = { ingreso: 'tone-success', ahorro: 'tone-info', rescate: 'tone-violet' }
const CONFIDENCE_TONE = { alta: 'tone-ok', media: 'tone-warn', baja: 'tone-bad' }

function money(value, currency, compact = false) {
  return new Intl.NumberFormat(localeCode(getLocale()), {
    style: 'currency',
    currency: currency || 'EUR',
    maximumFractionDigits: 0,
    ...(compact ? { notation: 'compact' } : {}),
  }).format(value ?? 0)
}

function num(value) {
  return new Intl.NumberFormat(localeCode(getLocale())).format(Math.round(value ?? 0))
}

function decimal(value) {
  return new Intl.NumberFormat(localeCode(getLocale()), { maximumFractionDigits: 1 }).format(value ?? 0)
}

function percent(value) {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

function Panel({ title, subtitle, icon: Icon, actions, children }) {
  return (
    <section className="gs-panel">
      <header className="gs-panel-head">
        <div>
          <h2>
            {Icon ? <span className="gs-panel-icon"><Icon aria-hidden="true" /></span> : null}
            {title}
          </h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="gs-panel-actions">{actions}</div> : null}
      </header>
      <div className="gs-panel-body">{children}</div>
    </section>
  )
}

/** Cifra suelta. `missing` es «no se ha medido», que no es lo mismo que cero. */
function Stat({ label, value, hint, missing }) {
  return (
    <div className={`gs-mini${missing ? ' is-missing' : ''}`}>
      <span>{label}</span>
      <strong>{missing ? 'Sin medir' : value}</strong>
      {hint ? <em>{hint}</em> : null}
    </div>
  )
}

/** Detalle plegado: la explicación larga no puede robarle sitio a la cifra. */
function Detail({ label, children }) {
  return (
    <details className="gs-details pl-detail">
      <summary>{label}</summary>
      <p className="gs-note">{children}</p>
    </details>
  )
}

function InvestmentCurve({ params, budget, max, currency, onPick }) {
  const width = 320
  const height = 150
  const pad = { top: 12, right: 8, bottom: 20, left: 8 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const points = useMemo(() => {
    const list = []
    for (let index = 0; index <= 40; index++) {
      const value = (max / 40) * index
      const result = simulate({ ...params, budget: value })
      list.push({ budget: value, revenue: result.revenue, profit: result.profit })
    }
    return list
  }, [params, max])

  const peak = Math.max(1, ...points.map(point => point.revenue))
  const floor = Math.min(0, ...points.map(point => point.profit))
  const span = peak - floor
  const x = value => pad.left + (value / max) * innerW
  const y = value => pad.top + innerH - ((value - floor) / span) * innerH
  const path = key => points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.budget).toFixed(1)} ${y(point[key]).toFixed(1)}`).join(' ')

  const here = simulate({ ...params, budget })
  // Donde el beneficio cruza el cero: el dato que todo el mundo busca a ojo.
  const breakEven = points.find(point => point.profit >= 0 && point.budget > 0)

  const pick = event => {
    if (!onPick) return
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - box.left) / box.width
    onPick(Math.max(0, Math.round(((ratio * width - pad.left) / innerW) * max)))
  }

  return (
    <div className="pl-curve">
      <svg
        viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" onClick={pick}
        role="img" aria-label="Ingresos y beneficio según la inversión mensual"
      >
        <line className="pl-curve-zero" x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} />
        <path className="pl-curve-revenue" d={path('revenue')} />
        <path className="pl-curve-profit" d={path('profit')} />
        <line className="pl-curve-cursor" x1={x(budget)} x2={x(budget)} y1={pad.top} y2={pad.top + innerH} />
        <circle className="pl-curve-dot" cx={x(budget)} cy={y(here.revenue)} r="3.5" />
        {breakEven ? <circle className="pl-curve-break" cx={x(breakEven.budget)} cy={y(0)} r="3" /> : null}
      </svg>
      <div className="pl-curve-legend">
        <span className="is-revenue">Ingresos</span>
        <span className="is-profit">Beneficio</span>
        {breakEven ? <span className="is-break">Empiezas a ganar en {money(breakEven.budget, currency)}</span> : <span className="is-break">Con estas tasas no llegas a ganar</span>}
      </div>
    </div>
  )
}

/** Trayectoria a doce meses, con el plan y sin él. */
function Trajectory({ trajectory, currency }) {
  if (!trajectory?.length) return null
  const width = 320
  const height = 120
  const pad = { top: 10, right: 6, bottom: 14, left: 6 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const max = Math.max(...trajectory.map(point => point.plan), 1)
  const x = index => pad.left + (index / Math.max(1, trajectory.length - 1)) * innerW
  const y = value => pad.top + innerH - (value / max) * innerH
  const line = key => trajectory.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(point[key]).toFixed(1)}`).join(' ')
  const area = `${line('plan')} ${[...trajectory].reverse().map((point, index) => `L ${x(trajectory.length - 1 - index).toFixed(1)} ${y(point.base).toFixed(1)}`).join(' ')} Z`
  const last = trajectory[trajectory.length - 1]

  return (
    <div className="pl-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Facturación mensual a doce meses, con el plan y sin cambios">
        <path className="pl-chart-area" d={area} />
        <path className="pl-chart-base" d={line('base')} />
        <path className="pl-chart-plan" d={line('plan')} />
      </svg>
      <div className="pl-chart-legend">
        <span className="is-plan">Con el plan · {money(last.plan, currency)}</span>
        <span className="is-base">Sin cambios · {money(last.base, currency)}</span>
      </div>
    </div>
  )
}

/** Una barra apilada al 100 %: de dónde vienen los leads y de dónde el dinero. */
/** Escenario de referencia y mejoras estimadas. */
function Waterfall({ upside, currency }) {
  const levers = upside.levers.filter(lever => lever.kind === 'ingreso')
  const ceiling = Math.max(1, upside.ceiling)
  let running = upside.current
  return (
    <div className="pl-waterfall">
      <div className="pl-step is-base">
        <span>Hoy</span>
        <div className="pl-step-bar"><i style={{ width: `${(upside.current / ceiling) * 100}%` }} /></div>
        <b>{money(upside.current, currency)}</b>
      </div>
      {levers.map(lever => {
        const from = running
        running += lever.amount
        return (
          <div key={lever.id} className="pl-step">
            <span>{lever.title}</span>
            <div className="pl-step-bar">
              <i className="is-add" style={{ marginLeft: `${(from / ceiling) * 100}%`, width: `${(lever.amount / ceiling) * 100}%` }} />
            </div>
            <b className="pl-gain">+{money(lever.amount, currency)}</b>
          </div>
        )
      })}
      <div className="pl-step is-ceiling">
        <span>Escenario estimado</span>
        <div className="pl-step-bar"><i style={{ width: '100%' }} /></div>
        <b>{money(upside.ceiling, currency)}</b>
      </div>
    </div>
  )
}

/** Control del simulador. Marca dónde está tu dato real para que se vea cuánto te alejas. */
function Slider({ label, value, min, max, step, onChange, format, real, realLabel }) {
  const moved = real != null && Math.abs(value - real) > (step ?? 1) / 2
  return (
    <label className="pl-control">
      <span className="pl-control-head">
        {label}
        <b className={moved ? 'is-moved' : undefined}>{format(value)}</b>
      </span>
      <input
        className="pl-range" type="range"
        min={min} max={max} step={step} value={value}
        onChange={event => onChange(Number(event.target.value))}
      />
      {real != null ? (
        <span className="pl-control-real">
          {moved ? <b>{value > real ? '▲' : '▼'} {format(Math.abs(value - real))}</b> : null}
          {realLabel ?? `tuyo: ${format(real)}`}
        </span>
      ) : null}
    </label>
  )
}

function GrowthPlan() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [board, setBoard] = useState(null)
  const [status, setStatus] = useState('loading')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState('objetivos')
  const [savedGoal, setSavedGoal] = useState(null)
  const [windowDays, setWindowDays] = useState(90)
  const [budget, setBudget] = useState(500)
  // La escala del slider es fija a propósito. Cuando el máximo se derivaba del
  // propio presupuesto, arrastrar hacia la derecha ensanchaba el rango y el
  // pulgar se caía hacia atrás: se movía y parecía que no pasaba nada.
  const [scale, setScale] = useState(5000)
  const [sim, setSim] = useState(null)
  const [tasks, setTasks] = useState({})
  const [taskError, setTaskError] = useState('')
  const pending = useRef(null)
  const budgetRef = useRef(budget)
  budgetRef.current = budget
  const needsBoard = tab !== 'objetivos'

  const load = useCallback(async () => {
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setStatus('loading')
    setNotice('')
    const query = new URLSearchParams({ windowDays: String(windowDays), budget: String(Number(budgetRef.current) || 500) })
    try {
      const response = await apiFetch(`/api/growth-plan/board?${query.toString()}`, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (!response.ok) {
        // Un 403 de plan no es una caída: la pantalla existe, no está contratada.
        const gate = await readPlanGate(response)
        if (gate) {
          setStatus('plan')
          setNotice(planGateMessage(gate, getLocale()))
          return
        }
        setStatus('error')
        setNotice('No pudimos calcular el informe. Reintenta en un momento.')
        return
      }
      const data = await response.json()
      if (controller.signal.aborted) return
      if (!data?.snapshot?.rates || !Array.isArray(data.actions) || !data.upside || !data.totals) throw new Error('Informe incompleto')
      setBoard(data)
      setStatus('live')
    } catch (error) {
      if (controller.signal.aborted) return
      setStatus(classifyFetchError(error))
      setNotice('No pudimos hablar con el servidor. Comprueba tu conexión.')
    }
  }, [windowDays])

  useEffect(() => {
    if (needsBoard) load()
    return () => pending.current?.abort()
  }, [load, needsBoard])

  const real = useMemo(() => {
    if (!board) return null
    const { rates, dealValue, costPerMinute, minutesPerCall } = board.snapshot
    return {
      contact: rates.contact.value,
      qualify: rates.qualify.value,
      opportunity: rates.opportunity.value,
      win: rates.win.value,
      dealValue: dealValue.value,
      costPerMinute,
      minutesPerCall,
    }
  }, [board])

  const params = sim ?? real
  const result = useMemo(() => (params ? simulate({ ...params, budget }) : null), [params, budget])
  const baseline = useMemo(() => (real ? simulate({ ...real, budget }) : null), [real, budget])
  const touched = useMemo(() => {
    if (!params || !real) return false
    return ['contact', 'qualify', 'opportunity', 'win', 'dealValue'].some(key => Math.abs(params[key] - real[key]) > 0.0001)
  }, [params, real])

  const presets = useMemo(() => {
    if (!board || !real) return []
    const list = []
    const best = board.calls.bestHour
    if (best && board.calls.contactRate != null && best.contactRate > board.calls.contactRate) {
      list.push({ id: 'hour', label: `Llamo a las ${best.hour}:00`, patch: { contact: Math.min(0.95, best.contactRate) } })
    }
    const agents = board.calls.byAgent.filter(agent => agent.reliable)
    if (agents.length >= 2) {
      const top = agents.reduce((winner, agent) => (agent.qualifyRate > winner.qualifyRate ? agent : winner))
      if (top.qualifyRate > (board.calls.qualifyRate ?? 0)) {
        list.push({ id: 'agent', label: `Todos como ${top.name}`, patch: { qualify: Math.min(0.95, top.qualifyRate) } })
      }
    }
    list.push({ id: 'win', label: '+5 puntos de cierre', patch: { win: Math.min(0.95, real.win + 0.05) } })
    list.push({ id: 'ticket', label: 'Ticket +20%', patch: { dealValue: Math.round(real.dealValue * 1.2) } })
    return list
  }, [board, real])

  const currency = board?.currency ?? 'EUR'
  const activeTab = tab
  const hasReferences = board && (Object.values(board.snapshot.rates).some(rate => rate.source !== 'own') || board.snapshot.dealValue.source !== 'own')

  const actionsByHorizon = useMemo(() => {
    const groups = { hoy: [], 'esta-semana': [], 'este-mes': [] }
    for (const action of board?.actions ?? []) (groups[action.horizon] ?? groups['este-mes']).push(action)
    return groups
  }, [board])

  const createTask = useCallback(async action => {
    setTaskError('')
    setTasks(current => ({ ...current, [action.id]: 'saving' }))
    const dueDays = action.horizon === 'hoy' ? 0 : action.horizon === 'esta-semana' ? 7 : 30
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + dueDays)
    dueDate.setHours(23, 59, 0, 0)
    try {
      const response = await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: action.title,
          ownerId: user?.id,
          description: `${action.evidence}\n\n${action.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
          priority: action.impact === 'alto' ? 'high' : action.impact === 'medio' ? 'normal' : 'low',
          dueAt: dueDate.toISOString(),
          source: 'growth_plan',
          sourceId: action.id,
        }),
      })
      if (!response.ok) throw new Error(response.status === 403 ? 'No tienes permiso para crear tareas.' : 'No se pudo crear la tarea. Puedes volver a intentarlo.')
      setTasks(current => ({ ...current, [action.id]: 'done' }))
    } catch (error) {
      setTasks(current => ({ ...current, [action.id]: 'error' }))
      setTaskError(error.message)
    }
  }, [user?.id])

  const patch = next => setSim(current => ({ ...(current ?? real), ...next }))
  const nextScale = () => {
    const steps = [5000, 25_000, 100_000]
    const next = steps[(steps.indexOf(scale) + 1) % steps.length]
    setScale(next)
    // Al bajar de escala el presupuesto se recorta: dejarlo fuera de rango
    // haría que el control enseñara una cifra y la cuenta usara otra.
    setBudget(current => Math.min(current, next))
  }
  // Una tasa de referencia no puede presentarse como «tuyo»: es la misma regla
  // que sigue el backend cuando marca el origen de cada número.
  const origin = (key, formatted) => `${board?.snapshot.rates[key]?.source === 'own' ? 'tuyo' : 'referencia'}: ${formatted}`

  return (
    <main className="gs-page pl-page plan-focused">
      <div className="gs-shell">
        <header className="gs-header pl-header">
          <div className="gs-heading">
            <div>
              <h1>Plan y objetivos</h1>
              <p>Define tus metas, organiza el trabajo y consulta las previsiones cuando las necesites.</p>
            </div>
          </div>
          {needsBoard ? <div className="gs-header-actions">
            <select className="gs-select pl-window" aria-label="Periodo de referencia del plan" value={windowDays} onChange={event => { setWindowDays(Number(event.target.value)); setBoard(null); setSim(null) }}>
              {WINDOWS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button type="button" className="gs-button" onClick={load} disabled={status === 'loading'}>
              {status === 'loading' ? <RiLoader4Line className="gs-spin" /> : <RiRefreshLine />} Recalcular
            </button>
          </div> : null}
        </header>

        <nav className="gs-tabs pl-tabs" aria-label="Secciones del plan">
          {TABS.map(item => <button key={item.key} type="button" className={activeTab === item.key ? 'active' : ''} onClick={() => setTab(item.key)} aria-pressed={activeTab === item.key}>{item.label}</button>)}
        </nav>
        <div hidden={activeTab !== 'objetivos'} className="plan-goals">
          <MonthlyGoals showLinks={false} title="Objetivos del mes" onGoalLoaded={setSavedGoal} />
          <p className="gs-note">Son los mismos objetivos que ves en Resumen. Se guardan para toda la organización y sirven como meta mensual hasta que los cambies.</p>
          <div className="plan-next">
            <div><h2>Organiza cómo alcanzarlos</h2><p>Revisa las acciones sugeridas y convierte las que elijas en tareas con fecha.</p></div>
            <button className="gs-button" onClick={() => setTab('hacer')}>Ver plan de acción</button>
          </div>
          <p className="gs-note">Para comparar resultados por campaña o agente, entra en <Link to="/insights">Análisis del negocio</Link>.</p>
        </div>
        {needsBoard ? <DataStatusBanner status={status} message={notice || undefined} onRetry={load} /> : null}
        {needsBoard && status === 'loading' && !board ? <PageLoadingState label="Cargando datos del plan" /> : null}
        {needsBoard && board ? (<>
          {status !== 'live' ? <p className="gs-note" role="status">El informe anterior puede estar desactualizado. Actualízalo antes de tomar decisiones.</p> : null}
            {/* ── Simular ─────────────────────────────────────────────── */}
            {activeTab === 'simular' && params && result ? (
              <div className="gs-stack">
                <section className="gs-panel pl-sim">
                  <div className="pl-sim-controls">
                    <div className="pl-sim-title">
                      <h2>¿Y si…?</h2>
                      <p>Prueba un presupuesto y unas tasas. Este cálculo no modifica tus objetivos ni pone campañas en marcha.</p>
                    </div>

                    <div className="pl-budget">
                      <Slider
                        label="Presupuesto mensual de llamadas" value={budget} min={0} max={scale} step={scale / 200}
                        onChange={setBudget} format={value => money(value, currency)}
                      />
                      <button type="button" className="gs-button small" onClick={nextScale} title="Cambiar la escala del control">
                        hasta {money(scale, currency, true)}
                      </button>
                    </div>
                    <Slider
                      label="Contacto" value={params.contact} min={0} max={1} step={0.01}
                      onChange={value => patch({ contact: value })} format={percent}
                      real={real.contact} realLabel={origin('contact', percent(real.contact))}
                    />
                    <Slider
                      label="Cualifico" value={params.qualify} min={0} max={1} step={0.01}
                      onChange={value => patch({ qualify: value })} format={percent}
                      real={real.qualify} realLabel={origin('qualify', percent(real.qualify))}
                    />
                    <Slider
                      label="Abro oportunidad" value={params.opportunity} min={0} max={1} step={0.01}
                      onChange={value => patch({ opportunity: value })} format={percent}
                      real={real.opportunity} realLabel={origin('opportunity', percent(real.opportunity))}
                    />
                    <Slider
                      label="Cierro" value={params.win} min={0} max={1} step={0.01}
                      onChange={value => patch({ win: value })} format={percent}
                      real={real.win} realLabel={origin('win', percent(real.win))}
                    />
                    <Slider
                      label="Importe medio por venta" value={params.dealValue} min={0} max={Math.max(6000, Math.round(real.dealValue * 3))} step={1}
                      onChange={value => patch({ dealValue: value })} format={value => money(value, currency)}
                      real={real.dealValue}
                      realLabel={`${board.snapshot.dealValue.source === 'own' ? 'tuyo' : 'referencia'}: ${money(real.dealValue, currency)}`}
                    />

                    <div className="pl-presets">
                      {presets.map(preset => (
                        <button key={preset.id} type="button" className="gs-button small" onClick={() => patch(preset.patch)}>
                          {preset.label}
                        </button>
                      ))}
                      <button type="button" className="gs-button small" onClick={() => { setSim(null); setBudget(500) }} disabled={!touched && budget === 500}>
                        <RiResetLeftLine /> Restablecer datos de partida
                      </button>
                    </div>
                  </div>

                  <div className="pl-sim-out">
                    <div className="pl-sim-hero">
                      <span>Ventas mensuales estimadas</span>
                      <strong>{money(result.revenue, currency)}</strong>
                      {baseline && Math.abs(result.revenue - baseline.revenue) >= 1 ? (
                        <em className={result.revenue >= baseline.revenue ? 'is-up' : 'is-down'}>
                          {result.revenue >= baseline.revenue ? '+' : ''}{money(result.revenue - baseline.revenue, currency)} respecto a los datos de partida
                        </em>
                      ) : (
                        <em>con los datos de partida del periodo</em>
                      )}
                    </div>

                    <InvestmentCurve params={params} budget={budget} max={scale} currency={currency} onPick={setBudget} />

                    <div className="pl-sim-grid">
                      <div><span>Ventas</span><strong>{decimal(result.sales)}</strong></div>
                      <div><span>Llamadas</span><strong>{num(result.calls)}</strong></div>
                      <div><span>Ventas menos llamadas*</span><strong className={result.profit >= 0 ? 'is-up' : 'is-down'}>{money(result.profit, currency)}</strong></div>
                      <div><span>Ventas / gasto en llamadas</span><strong>{decimal(result.roi)}×</strong></div>
                      <div><span>Coste de llamadas por venta</span><strong>{result.costPerSale ? money(result.costPerSale, currency) : '—'}</strong></div>
                      <div><span>Minutos</span><strong>{num(result.minutes)}</strong></div>
                    </div>

                    {result.minutes > board.totals.minutesAllowed ? (
                      <p className="gs-note pl-warn">
                        <RiSignalTowerLine /> Tu plan da {num(board.totals.minutesAllowed)} minutos al mes y esto necesita {num(result.minutes)}.
                      </p>
                    ) : null}
                    <p className="gs-note">*Solo resta el presupuesto de llamadas. No es beneficio neto: faltan producto, personal, impuestos y otros gastos. Coste de voz de referencia: {new Intl.NumberFormat(localeCode(getLocale()), { maximumFractionDigits: 3 }).format(params.costPerMinute)} €/min · {decimal(params.minutesPerCall)} min/llamada.</p>
                    <p className="gs-note" role="status">{hasReferences ? 'Faltan datos propios: parte del cálculo utiliza tasas de referencia, indicadas junto a cada control.' : 'Los datos de partida proceden de tu actividad registrada; las previsiones no garantizan el resultado.'}</p>
                    {touched ? (
                      <p className="gs-note">
                        Has modificado las tasas del cálculo. Puedes consultar el <button type="button" className="gs-link" onClick={() => setTab('hacer')}>plan de acción</button>.
                      </p>
                    ) : null}
                  </div>
                </section>

                <Panel
                  title="Calcular a partir de un importe"
                  subtitle="Estima la actividad necesaria. Este cálculo no guarda ni cambia tus objetivos."
                  icon={RiFocus3Line}
                >
                  <GoalBox params={params} currency={currency} minutesAllowed={board.totals.minutesAllowed} savedGoal={savedGoal} />
                </Panel>
              </div>
            ) : null}

            {activeTab === 'simular' ? (
              <details className="plan-advanced"><summary>Más previsiones y reparto del presupuesto</summary><p className="gs-note">Escenarios estimados con el informe de referencia. No son ingresos asegurados y no cambian al mover las tasas del simulador. Pulsa Recalcular para actualizar el reparto con el presupuesto elegido.</p><div className="gs-stack">
                <div className="gs-cols">
                  <Panel
                    title="Escenario de mejora estimado"
                    subtitle="Estimaciones basadas en los supuestos del informe."
                    icon={RiHandCoinLine}
                    actions={<span className={`gs-pill ${CONFIDENCE_TONE[board.upside.confidence]}`}>Confianza {board.upside.confidence}</span>}
                  >
                    {board.upside.levers.length === 0 ? (
                      <p className="gs-empty-inline">Todavía no hay datos suficientes para estimar mejoras.</p>
                    ) : (
                      <Waterfall upside={board.upside} currency={currency} />
                    )}
                    <Detail label="Cómo se calcula">{board.upside.confidenceNote}</Detail>
                  </Panel>

                  <Panel title="Doce meses" subtitle="Dos escenarios estimados con una aplicación gradual de las mejoras." icon={RiLineChartLine}>
                    <Trajectory trajectory={board.upside.trajectory} currency={currency} />
                    <div className="gs-minis" style={{ marginTop: 12 }}>
                      <Stat label="Diferencia en 12 meses" value={money(board.upside.twelveMonthGap, currency)} />
                      <Stat label="Diferencia semanal estimada" value={money(board.upside.weeklyCostOfInaction, currency)} />
                      <Stat label="Venta media por llamada" value={money(board.upside.unit.perCall, currency)} hint={`cuesta ${money(board.upside.unit.costPerCall, currency)}`} />
                      <Stat label="Llamadas por venta" value={board.upside.unit.callsPerSale == null ? '—' : num(board.upside.unit.callsPerSale)} missing={board.upside.unit.callsPerSale == null} />
                    </div>
                  </Panel>
                </div>

                {board.upside.levers.length > 0 ? (
                  <Panel title="Supuestos de mejora" subtitle="Revisa cómo se calcula cada estimación antes de usarla." icon={RiCoinsLine}>
                    <div className="gs-queue">
                      {board.upside.levers.map(lever => (
                        <article key={lever.id} className={`gs-queue-card ${KIND_CARD[lever.kind] ?? 'tone-info'}`}>
                          <header>
                            <span className="gs-queue-kind">{KIND_LABEL[lever.kind]}</span>
                            <span className="gs-queue-meta">esfuerzo {lever.effort}</span>
                          </header>
                          <strong>{lever.title}</strong>
                          <div className="gs-queue-impact">
                            <span>{lever.kind === 'rescate' ? 'De una vez' : 'Cada mes'}</span>
                            <strong>{lever.kind === 'ahorro' ? '' : '+'}{money(lever.amount, currency)}</strong>
                          </div>
                          <Detail label="La cuenta">{lever.basis}</Detail>
                          <footer>
                            <span className={`gs-pill ${CONFIDENCE_TONE[lever.confidence]}`}>{lever.confidence}</span>
                            <div>
                              <button type="button" className="gs-button small" onClick={() => navigate(lever.href)}>Hacerlo <RiArrowRightLine /></button>
                            </div>
                          </footer>
                        </article>
                      ))}
                    </div>
                  </Panel>
                ) : null}

                {board.allocation.items.length > 0 ? (
                  <Panel title={`Dónde poner ${money(board.allocation.total, currency)}`} subtitle="Propuesta orientativa basada en el rendimiento registrado." icon={RiCoinsLine}>
                    <div className="pl-alloc">
                      {board.allocation.items.map(item => (
                        <div key={item.channel} className="pl-alloc-row">
                          <strong>{item.label}</strong>
                          <b>{money(item.amount, currency)} · {item.share}%</b>
                          <div className="pl-alloc-bar"><i style={{ width: `${item.share}%` }} /></div>
                          <p>{item.reason}</p>
                        </div>
                      ))}
                    </div>
                    <p className="gs-note">{board.allocation.note}</p>
                  </Panel>
                ) : null}
              </div></details>
            ) : null}

            {/* ── Hacer ───────────────────────────────────────────────── */}
            {activeTab === 'hacer' ? (
              <div className="gs-stack">
                <p className="gs-note">Elige una acción y crea una tarea asignada a ti, con vencimiento al final de hoy, en 7 días o en 30 días según el grupo. Puedes consultarla en el <Link to="/calendario">Calendario</Link>. Las sugerencias se calculan con los últimos {board.windowDays} días.</p>
                {taskError ? <p className="gs-note" role="alert">{taskError}</p> : null}
                {Object.values(tasks).includes('done') ? <p className="gs-note" role="status">Tarea guardada. Ya aparece en el calendario.</p> : null}
                {board.actions.length === 0 ? (
                  <Panel title="Sin acciones sugeridas" icon={RiCheckboxCircleLine}>
                    <p className="gs-empty-inline is-ok">
                      Con los datos disponibles no se han identificado acciones concretas. Puedes revisar tus resultados en Análisis o explorar supuestos en el{' '}
                      <button type="button" className="gs-link" onClick={() => setTab('simular')}>simulador</button>.
                    </p>
                  </Panel>
                ) : null}

                {HORIZON_ORDER.map(horizon => {
                  const list = actionsByHorizon[horizon]
                  if (!list?.length) return null
                  return (
                    <Panel key={horizon} title={HORIZON_LABEL[horizon]} icon={horizon === 'hoy' ? RiFlashlightLine : horizon === 'esta-semana' ? RiTimeLine : RiTaskLine}>
                      <div className="gs-queue">
                        {list.map(action => (
                          <article key={action.id} className={`gs-queue-card ${HORIZON_CARD[action.horizon] ?? 'tone-info'}`}>
                            <header>
                              <span className="gs-queue-kind">impacto {action.impact}</span>
                              <span className="gs-queue-meta">esfuerzo {action.effort}</span>
                            </header>
                            <strong>{action.title}</strong>
                            <p>{action.evidence}</p>
                            <ol className="pl-steps">{action.steps.map(step => <li key={step}>{step}</li>)}</ol>
                            {action.expectedGain ? (
                              <div className="gs-queue-impact">
                                <span>{action.gainKind === 'rescate' ? 'De una vez' : action.gainKind === 'ahorro' ? 'Ahorro estimado' : 'Cada mes'}</span>
                                <strong>{action.gainKind === 'ahorro' ? '' : '+'}{money(action.expectedGain, currency)}</strong>
                              </div>
                            ) : null}
                            {action.gainBasis ? <Detail label="La cuenta">{action.gainBasis}</Detail> : null}
                            <footer>
                              {action.confidence ? <span className={`gs-pill ${CONFIDENCE_TONE[action.confidence]}`}>{action.confidence}</span> : null}
                              <div>
                                <button type="button" className="gs-button small" onClick={() => navigate(action.href)}>{action.ctaLabel} <RiArrowRightLine /></button>
                                <button
                                  type="button" className="gs-button small"
                                  onClick={() => createTask(action)}
                                  disabled={tasks[action.id] === 'saving' || tasks[action.id] === 'done'}
                                >
                                  {tasks[action.id] === 'saving' ? <RiLoader4Line className="gs-spin" />
                                    : tasks[action.id] === 'done' ? <RiCheckboxCircleLine /> : <RiAddCircleLine />}
                                  {tasks[action.id] === 'done' ? 'En tareas' : tasks[action.id] === 'error' ? 'No se pudo' : 'Crear tarea'}
                                </button>
                              </div>
                            </footer>
                          </article>
                        ))}
                      </div>
                    </Panel>
                  )
                })}

                {board.recommendations?.length ? (
                  <Panel title="Otras acciones sugeridas" icon={RiInformationLine}>
                    <ul className="gs-list">
                      {board.recommendations.map(item => (
                        <li key={item.id} className="gs-check is-plain">
                          <span className="gs-check-mark"><RiInformationLine aria-hidden="true" /></span>
                          <div>
                            <strong>{item.title}</strong>
                            <p>{item.detail}</p>
                            {item.href ? (
                              <p style={{ marginTop: 7 }}>
                                <button type="button" className="gs-button small" onClick={() => navigate(item.href)}>Ir <RiArrowRightLine /></button>
                              </p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                ) : null}
              </div>
            ) : null}

            <p className="gs-note pl-foot">
              Últimos {board.windowDays} días: {num(board.snapshot.history.calls)} llamadas, {num(board.snapshot.history.opportunities)} oportunidades
              y {num(board.snapshot.history.won)} ventas. Ticket medio {money(board.snapshot.dealValue.value, currency)}
              {board.snapshot.dealValue.source === 'baseline' ? ' (referencia del sector)' : ''}.
              {' '}Informe del {new Date(board.generatedAt).toLocaleString(localeCode(getLocale()))}.
            </p>
          </>
        ) : null}
      </div>
    </main>
  )
}

/** La cuenta al revés, en local: pones la cifra y sale lo que hace falta. */
export function GoalBox({ params, currency, minutesAllowed, savedGoal }) {
  const [goal, setGoal] = useState(null)
  const target = Number(goal ?? savedGoal) || 0

  const plan = useMemo(() => reversePlan(target, params, minutesAllowed), [target, params, minutesAllowed])

  return (
    <div className="pl-goal">
      <label className="pl-control">
        <span className="pl-control-head">Importe mensual a simular</span>
        <input
          className="gs-input" type="number" min="0" step="500" placeholder="20000"
          value={goal ?? savedGoal ?? ''} onChange={event => setGoal(event.target.value)}
        />
      </label>
      {savedGoal ? <button className="gs-button small" onClick={() => setGoal(null)}>Usar objetivo guardado: {money(savedGoal, currency)}</button> : null}
      {plan ? (
        <>
          <div className="pl-sim-grid">
            <div><span>Ventas</span><strong>{decimal(plan.sales)}</strong></div>
            <div><span>Oportunidades</span><strong>{num(plan.opportunities)}</strong></div>
            <div><span>Conversaciones</span><strong>{num(plan.conversations)}</strong></div>
            <div><span>Llamadas</span><strong>{num(plan.calls)}</strong></div>
            <div><span>Minutos</span><strong>{num(plan.minutes)}</strong></div>
            <div><span>Presupuesto</span><strong>{money(plan.budget, currency)}</strong></div>
          </div>
          {!plan.fits ? (
            <p className="gs-note pl-warn">
              <RiSignalTowerLine /> Necesita {num(plan.minutes)} minutos y tu plan da {num(minutesAllowed)}: no cabe.
            </p>
          ) : null}
        </>
      ) : (
        <p className="gs-empty-inline">Introduce un importe positivo. Para calcularlo, todas las tasas y costes deben ser mayores que cero.</p>
      )}
    </div>
  )
}

export default function GrowthPlanPage() {
  const { user } = useAuth()
  return <GrowthPlan key={user?.orgId || user?.id || 'workspace'} />
}
