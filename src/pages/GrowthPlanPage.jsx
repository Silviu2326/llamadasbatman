import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAddCircleLine, RiAlertLine, RiArrowRightLine, RiCheckboxCircleLine, RiCoinsLine,
  RiCompass3Line, RiFlashlightLine, RiFocus3Line, RiHandCoinLine, RiInformationLine,
  RiLineChartLine, RiLoader4Line, RiPhoneLine, RiPulseLine, RiRefreshLine, RiResetLeftLine,
  RiSignalTowerLine, RiSparkling2Line, RiStackLine, RiTaskLine, RiTimeLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { classifyFetchError } from '../lib/dataStatus'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import { getLocale, localeCode } from '../i18n'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import PageLoadingState from '../components/ui/PageLoadingState'
import './growth/growth-surface.css'
import './growth-plan.css'

/**
 * Plan de crecimiento: la pantalla desde la que se dirige el departamento de
 * ventas. Mira llamadas, anuncios, redes, búsqueda, email y pipeline a la vez,
 * dice qué está roto, cuánto vale arreglarlo y deja probarlo.
 *
 * El diagnóstico viene hecho de `/api/growth-plan/board`: la página no calcula
 * veredictos por su cuenta, porque la misma cifra no puede decir dos cosas
 * según quién la mire.
 *
 * El simulador es la excepción deliberada y repite la cadena del backend
 * (`project()` en growthPredictor.service.ts): mover un control tiene que
 * responder en el mismo fotograma, y una petición por cada píxel del slider no
 * responde. Las dos cuentas tienen que dar lo mismo con las mismas tasas; si
 * una cambia, la otra cambia.
 */

const WINDOWS = [
  { value: 30, label: '30 días' },
  { value: 90, label: '90 días' },
  { value: 180, label: '6 meses' },
  { value: 365, label: '1 año' },
]

const TABS = [
  { key: 'simular', label: 'Simular', icon: RiSparkling2Line },
  { key: 'ahora', label: 'Ahora', icon: RiCompass3Line },
  { key: 'dinero', label: 'Dinero', icon: RiHandCoinLine },
  { key: 'ventas', label: 'Ventas', icon: RiPhoneLine },
  { key: 'hacer', label: 'Hacer', icon: RiTaskLine },
]

const AREA_COLOR = { bien: 'var(--success)', regular: 'var(--warn)', mal: 'var(--danger)', 'sin-datos': 'var(--dim)' }
const STAGE_COLOR = {
  escalando: 'var(--success)', funcionando: 'var(--accent)', aprendiendo: 'var(--warn)',
  'en-riesgo': 'var(--danger)', arranque: 'var(--dim)',
}
const STAGE_LABEL = {
  escalando: 'Listo para escalar', funcionando: 'Funcionando', aprendiendo: 'Aprendiendo',
  'en-riesgo': 'En riesgo', arranque: 'Arranque',
}
const VERDICT_TONE = { escalar: 'tone-ok', mantener: 'tone-info', arreglar: 'tone-warn', parar: 'tone-bad', medir: '' }
const HORIZON_CARD = { hoy: 'tone-danger', 'esta-semana': 'tone-warn', 'este-mes': 'tone-info' }
const HORIZON_LABEL = { hoy: 'Hoy', 'esta-semana': 'Esta semana', 'este-mes': 'Este mes' }
const HORIZON_ORDER = ['hoy', 'esta-semana', 'este-mes']
const KIND_LABEL = { ingreso: 'Factura más', ahorro: 'Deja de quemar', rescate: 'Dinero parado' }
const KIND_CARD = { ingreso: 'tone-success', ahorro: 'tone-info', rescate: 'tone-violet' }
const CONFIDENCE_TONE = { alta: 'tone-ok', media: 'tone-warn', baja: 'tone-bad' }
const CHANNEL_COLOR = ['var(--success)', 'var(--accent)', 'var(--violet)', 'var(--cyan)', 'var(--warn)', 'var(--pink)', 'var(--dim)']

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

function duration(minutes) {
  if (minutes == null) return '—'
  if (minutes < 60) return `${Math.round(minutes)} min`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h`
  return `${Math.round(minutes / (60 * 24))} días`
}

/** La cadena del embudo, idéntica a `project()` del backend. */
function simulate(input) {
  const costPerCall = input.costPerMinute * input.minutesPerCall
  const calls = costPerCall > 0 ? Math.floor(input.budget / costPerCall) : 0
  const conversations = calls * input.contact
  const qualified = conversations * input.qualify
  const opportunities = qualified * input.opportunity
  const sales = opportunities * input.win
  const revenue = sales * input.dealValue
  return {
    calls,
    conversations,
    qualified,
    opportunities,
    sales,
    revenue,
    profit: revenue - input.budget,
    roi: input.budget > 0 ? revenue / input.budget : 0,
    costPerSale: sales >= 0.1 ? input.budget / sales : null,
    minutes: Math.round(calls * input.minutesPerCall),
  }
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

function Gauge({ score, color }) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const offset = score == null ? circumference : circumference * (1 - Math.min(100, Math.max(0, score)) / 100)
  return (
    <div className="pl-gauge">
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <circle className="pl-gauge-track" cx="42" cy="42" r={radius} />
        <circle
          className="pl-gauge-value" cx="42" cy="42" r={radius}
          strokeDasharray={circumference} strokeDashoffset={offset} style={{ stroke: color }}
        />
      </svg>
      <b>{score == null ? '—' : score}</b>
    </div>
  )
}

// ── Gráficos ────────────────────────────────────────────────────────────────

/**
 * Embudo de verdad, no cinco barras. La forma es SVG estirado y las etiquetas
 * son HTML encima: meter el texto dentro del SVG lo deformaría con el ancho.
 */
function FunnelChart({ steps, bottleneckKey }) {
  const top = Math.max(1, steps[0]?.value ?? 1)
  const widths = steps.map(step => Math.max(5, (step.value / top) * 100))
  const rows = steps.length
  const rowHeight = 100 / rows

  return (
    <div className="pl-funnel" style={{ '--pl-funnel-rows': rows }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {steps.map((step, index) => {
          const wTop = widths[index]
          const wBottom = widths[index + 1] ?? wTop * 0.88
          const y = index * rowHeight
          const bottom = y + rowHeight - 1.4
          const points = [
            `${50 - wTop / 2},${y}`, `${50 + wTop / 2},${y}`,
            `${50 + wBottom / 2},${bottom}`, `${50 - wBottom / 2},${bottom}`,
          ].join(' ')
          // El degradado se calcula aquí y no en CSS: una `color-mix` con
          // porcentajes derivados de una variable no la resuelven todos los
          // navegadores, y fallar ahí deja el embudo invisible.
          const mix = Math.round(100 - (index / Math.max(1, rows - 1)) * 65)
          return (
            <polygon
              key={step.key}
              points={points}
              className={`pl-funnel-slice${bottleneckKey === step.key ? ' is-bottleneck' : ''}`}
              style={bottleneckKey === step.key ? undefined : { fill: `color-mix(in srgb, var(--success) ${mix}%, var(--accent))` }}
            />
          )
        })}
      </svg>
      <div className="pl-funnel-rows">
        {steps.map(step => (
          <div key={step.key} className={`pl-funnel-row${bottleneckKey === step.key ? ' is-bottleneck' : ''}`}>
            <span>{step.label}</span>
            <b>{num(step.value)}</b>
            <em>{step.rate ? `${percent(step.rate.value)}${step.rate.source === 'own' ? '' : ' ref.'}` : ''}</em>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Curva de inversión. Es el gráfico que invita a tocar: se puede pinchar para
 * mover el presupuesto y ver dónde el beneficio cruza el cero.
 */
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
function StackedBar({ label, items, currency, asMoney }) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0) return null
  return (
    <div className="pl-stack">
      <span className="pl-stack-label">{label}</span>
      <div className="pl-stack-bar">
        {items.map((item, index) => (
          <i
            key={item.key}
            style={{ width: `${(item.value / total) * 100}%`, background: CHANNEL_COLOR[index % CHANNEL_COLOR.length] }}
            title={`${item.label}: ${asMoney ? money(item.value, currency) : num(item.value)}`}
          />
        ))}
      </div>
      <div className="pl-stack-legend">
        {items.filter(item => item.value > 0).map((item, index) => (
          <span key={item.key}>
            <i style={{ background: CHANNEL_COLOR[index % CHANNEL_COLOR.length] }} />
            {item.label} · {asMoney ? money(item.value, currency) : num(item.value)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Cascada de hoy al techo: solo palancas de ingreso, que son las que facturan. */
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
        <span>Techo con el plan</span>
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

export default function GrowthPlanPage() {
  const navigate = useNavigate()
  const [board, setBoard] = useState(null)
  const [status, setStatus] = useState('loading')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState(null)
  const [windowDays, setWindowDays] = useState(90)
  const [budget, setBudget] = useState(500)
  // La escala del slider es fija a propósito. Cuando el máximo se derivaba del
  // propio presupuesto, arrastrar hacia la derecha ensanchaba el rango y el
  // pulgar se caía hacia atrás: se movía y parecía que no pasaba nada.
  const [scale, setScale] = useState(5000)
  const [sim, setSim] = useState(null)
  const [tasks, setTasks] = useState({})
  const firstLoad = useRef(true)

  const load = useCallback(async () => {
    setStatus('loading')
    setNotice('')
    const query = new URLSearchParams({ windowDays: String(windowDays), budget: String(Number(budget) || 500) })
    try {
      const response = await apiFetch(`/api/growth-plan/board?${query.toString()}`)
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
      setBoard(await response.json())
      setStatus('live')
    } catch (error) {
      setStatus(classifyFetchError(error))
      setNotice('No pudimos hablar con el servidor. Comprueba tu conexión.')
    }
  }, [windowDays, budget])

  // El presupuesto se mueve con un slider: sin espera, cada píxel sería una
  // consulta que agrega media base de datos. Lo que se ve al instante lo
  // calcula el simulador en local; esto solo refresca el reparto por canal.
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false
      load()
      return undefined
    }
    const timer = setTimeout(load, 600)
    return () => clearTimeout(timer)
  }, [load])

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

  // El simulador arranca en los números reales y solo se reinicia cuando llega
  // un informe nuevo: reiniciarlo en cada render tiraría lo que estás probando.
  useEffect(() => { if (real) setSim(real) }, [real])

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
  const noSample = board && board.snapshot.history.calls < 20
  const activeTab = tab ?? (noSample ? 'simular' : 'ahora')
  const hasScores = board?.scores?.some(area => area.score != null)

  const funnelSteps = useMemo(() => {
    if (!board) return []
    const { history, rates } = board.snapshot
    return [
      { key: 'calls', label: 'Llamadas', value: history.calls, rate: null, reference: null },
      { key: 'conversations', label: 'Conversaciones', value: history.conversations, rate: rates.contact, reference: 0.35, copy: 'contactas' },
      { key: 'qualified', label: 'Cualificados', value: history.qualified, rate: rates.qualify, reference: 0.25, copy: 'cualificas' },
      { key: 'opportunities', label: 'Oportunidades', value: history.opportunities, rate: rates.opportunity, reference: 0.5, copy: 'abres oportunidad en' },
      { key: 'won', label: 'Ventas', value: history.won, rate: rates.win, reference: 0.2, copy: 'cierras' },
    ]
  }, [board])

  const bottleneck = useMemo(() => {
    const measured = funnelSteps.filter(step => step.rate?.source === 'own')
    if (!measured.length) return null
    return measured.reduce((worst, step) => (step.rate.value / step.reference < worst.rate.value / worst.reference ? step : worst))
  }, [funnelSteps])

  const actionsByHorizon = useMemo(() => {
    const groups = { hoy: [], 'esta-semana': [], 'este-mes': [] }
    for (const action of board?.actions ?? []) (groups[action.horizon] ?? groups['este-mes']).push(action)
    return groups
  }, [board])

  const createTask = useCallback(async action => {
    setTasks(current => ({ ...current, [action.id]: 'saving' }))
    const dueDays = action.horizon === 'hoy' ? 1 : action.horizon === 'esta-semana' ? 7 : 30
    try {
      const response = await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: action.title,
          description: `${action.evidence}\n\n${action.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
          priority: action.impact === 'alto' ? 'high' : action.impact === 'medio' ? 'normal' : 'low',
          dueAt: new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000).toISOString(),
          source: 'growth_plan',
          sourceId: action.id,
        }),
      })
      setTasks(current => ({ ...current, [action.id]: response.ok ? 'done' : 'error' }))
    } catch {
      setTasks(current => ({ ...current, [action.id]: 'error' }))
    }
  }, [])

  const verdictColor = STAGE_COLOR[board?.verdict?.stage] ?? 'var(--dim)'
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

  if (status === 'loading' && !board) return <PageLoadingState label="Cargando plan de crecimiento" />

  return (
    <main className="gs-page pl-page">
      <div className="gs-shell">
        <header className="gs-header pl-header">
          <div className="gs-heading">
            <span className="gs-brand"><RiLineChartLine aria-hidden="true" /></span>
            <div>
              <h1>Plan de crecimiento</h1>
              <p>Qué frena tus ventas, cuánto vale arreglarlo y qué pasa si lo cambias.</p>
            </div>
          </div>
          <div className="gs-header-actions">
            <select className="gs-select pl-window" aria-label="Periodo analizado" value={windowDays} onChange={event => setWindowDays(Number(event.target.value))}>
              {WINDOWS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button type="button" className="gs-button" onClick={load} disabled={status === 'loading'}>
              {status === 'loading' ? <RiLoader4Line className="gs-spin" /> : <RiRefreshLine />} Recalcular
            </button>
          </div>
        </header>

        <DataStatusBanner
          status={status === 'live' ? 'live' : status}
          message={notice || undefined}
          onRetry={status === 'error' || status === 'disconnected' ? load : undefined}
        />

        {board ? (
          <>
            <section className="pl-verdict gs-rise" style={{ '--verdict-color': verdictColor }}>
              <Gauge score={board.verdict.score} color={verdictColor} />
              <div className="pl-verdict-copy">
                <span className="pl-verdict-stage"><RiPulseLine aria-hidden="true" /> {STAGE_LABEL[board.verdict.stage] ?? 'Diagnóstico'}</span>
                <h2>{board.verdict.headline}</h2>
                <p>{board.verdict.money || board.verdict.summary}</p>
              </div>
              <div className="pl-facts">
                <div className="pl-fact"><span>Facturas</span><strong>{money(board.upside.current, currency)}<u>/mes</u></strong></div>
                <div className="pl-fact"><span>Techo</span><strong>{money(board.upside.ceiling, currency)}<u>/mes</u></strong></div>
                <div className="pl-fact"><span>Parado</span><strong>{money(board.upside.recoverable, currency)}</strong></div>
                <div className="pl-fact"><span>Oportunidades</span><strong>{num(board.pipeline.open)}</strong></div>
              </div>
            </section>

            {hasScores ? (
              <div className="pl-areas gs-rise">
                {board.scores.map(area => (
                  <button
                    key={area.key} type="button"
                    className={`pl-area${area.score == null ? ' is-missing' : ''}`}
                    style={{ '--area-color': AREA_COLOR[area.state] }}
                    onClick={() => (area.href === '/plan' ? setTab('dinero') : navigate(area.href))}
                    title={area.evidence}
                  >
                    <span>{area.label}</span>
                    <strong>{area.score == null ? '—' : area.headline}</strong>
                    <div className="pl-area-bar"><i style={{ width: `${area.score ?? 0}%` }} /></div>
                  </button>
                ))}
              </div>
            ) : null}

            <nav className="gs-tabs pl-tabs" aria-label="Secciones del plan">
              {TABS.map(item => {
                const Icon = item.icon
                const badge = item.key === 'hacer' ? board.actions.length : item.key === 'ahora' ? board.risks.length : 0
                return (
                  <button
                    key={item.key} type="button"
                    className={`${activeTab === item.key ? 'active' : ''}${item.key === 'ahora' && board.risks.length > 0 ? ' has-issue' : ''}`.trim()}
                    onClick={() => setTab(item.key)}
                    aria-pressed={activeTab === item.key}
                  >
                    <Icon aria-hidden="true" /> {item.label}
                    {badge > 0 ? <b>{badge}</b> : null}
                  </button>
                )
              })}
            </nav>

            {/* ── Simular ─────────────────────────────────────────────── */}
            {activeTab === 'simular' && params && result ? (
              <div className="gs-stack">
                <section className="gs-panel pl-sim">
                  <div className="pl-sim-controls">
                    <div className="pl-sim-title">
                      <h2>¿Y si…?</h2>
                      <p>Mueve cualquier cosa y mira qué pasa. Se calcula al instante con tu embudo.</p>
                    </div>

                    <div className="pl-budget">
                      <Slider
                        label="Invierto al mes" value={budget} min={0} max={scale} step={scale / 200}
                        onChange={setBudget} format={value => money(value, currency)}
                      />
                      <button type="button" className="gs-button small" onClick={nextScale} title="Cambiar la escala del control">
                        hasta {money(scale, currency, true)}
                      </button>
                    </div>
                    <Slider
                      label="Contacto" value={params.contact} min={0.05} max={0.95} step={0.01}
                      onChange={value => patch({ contact: value })} format={percent}
                      real={real.contact} realLabel={origin('contact', percent(real.contact))}
                    />
                    <Slider
                      label="Cualifico" value={params.qualify} min={0.02} max={0.9} step={0.01}
                      onChange={value => patch({ qualify: value })} format={percent}
                      real={real.qualify} realLabel={origin('qualify', percent(real.qualify))}
                    />
                    <Slider
                      label="Abro oportunidad" value={params.opportunity} min={0.05} max={1} step={0.01}
                      onChange={value => patch({ opportunity: value })} format={percent}
                      real={real.opportunity} realLabel={origin('opportunity', percent(real.opportunity))}
                    />
                    <Slider
                      label="Cierro" value={params.win} min={0.02} max={0.9} step={0.01}
                      onChange={value => patch({ win: value })} format={percent}
                      real={real.win} realLabel={origin('win', percent(real.win))}
                    />
                    <Slider
                      label="Ticket medio" value={params.dealValue} min={100} max={Math.max(6000, Math.round(real.dealValue * 3))} step={50}
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
                      <button type="button" className="gs-button small" onClick={() => { setSim(real); setBudget(500) }} disabled={!touched && budget === 500}>
                        <RiResetLeftLine /> Mis números
                      </button>
                    </div>
                  </div>

                  <div className="pl-sim-out">
                    <div className="pl-sim-hero">
                      <span>Facturarías al mes</span>
                      <strong>{money(result.revenue, currency)}</strong>
                      {baseline && Math.abs(result.revenue - baseline.revenue) >= 1 ? (
                        <em className={result.revenue >= baseline.revenue ? 'is-up' : 'is-down'}>
                          {result.revenue >= baseline.revenue ? '+' : ''}{money(result.revenue - baseline.revenue, currency)} respecto a tus tasas reales
                        </em>
                      ) : (
                        <em>con tus tasas reales, sin tocar nada</em>
                      )}
                    </div>

                    <InvestmentCurve params={params} budget={budget} max={scale} currency={currency} onPick={setBudget} />

                    <div className="pl-sim-grid">
                      <div><span>Ventas</span><strong>{decimal(result.sales)}</strong></div>
                      <div><span>Llamadas</span><strong>{num(result.calls)}</strong></div>
                      <div><span>Beneficio</span><strong className={result.profit >= 0 ? 'is-up' : 'is-down'}>{money(result.profit, currency)}</strong></div>
                      <div><span>Retorno</span><strong>{decimal(result.roi)}×</strong></div>
                      <div><span>Coste por venta</span><strong>{result.costPerSale ? money(result.costPerSale, currency) : '—'}</strong></div>
                      <div><span>Minutos</span><strong>{num(result.minutes)}</strong></div>
                    </div>

                    {result.minutes > board.totals.minutesAllowed ? (
                      <p className="gs-note pl-warn">
                        <RiSignalTowerLine /> Tu plan da {num(board.totals.minutesAllowed)} minutos al mes y esto necesita {num(result.minutes)}.
                      </p>
                    ) : null}
                    {touched ? (
                      <p className="gs-note">
                        Estás simulando con tasas que aún no son tuyas. Para que lo sean, mira <button type="button" className="gs-link" onClick={() => setTab('hacer')}>qué hacer</button>.
                      </p>
                    ) : null}
                  </div>
                </section>

                <Panel
                  title="Quiero facturar…"
                  subtitle="La cuenta al revés: pon la cifra y sale lo que hace falta."
                  icon={RiFocus3Line}
                >
                  <GoalBox params={params} currency={currency} minutesAllowed={board.totals.minutesAllowed} />
                </Panel>
              </div>
            ) : null}

            {/* ── Ahora ───────────────────────────────────────────────── */}
            {activeTab === 'ahora' ? (
              <div className="gs-stack">
                <div className="gs-cols">
                  <Panel title="Tu embudo" subtitle={`Lo que pasó en ${board.windowDays} días. Nada de esto es estimación.`} icon={RiFlashlightLine}>
                    <FunnelChart steps={funnelSteps} bottleneckKey={bottleneck?.key} />
                    {bottleneck ? (
                      <p className="gs-note">
                        <RiAlertLine style={{ verticalAlign: -2, marginRight: 4, color: 'var(--warn)' }} />
                        El freno está en «{bottleneck.label.toLowerCase()}»: {bottleneck.copy} el {percent(bottleneck.rate.value)} y la
                        referencia del sector es el {percent(bottleneck.reference)}.
                      </p>
                    ) : (
                      <p className="gs-note">Sin tasas propias suficientes: lo que ves son referencias del sector.</p>
                    )}
                  </Panel>

                  <Panel title="Lo que puede romperse" subtitle="No sale en las tasas, pero corta las ventas de golpe." icon={RiAlertLine}>
                    {board.risks.length === 0 ? (
                      <p className="gs-empty-inline is-ok">Nada crítico: agentes activos, plan con margen y canales conectados.</p>
                    ) : (
                      <ul className="gs-list">
                        {board.risks.map(risk => (
                          <li key={risk.id} className={`gs-check ${risk.severity === 'alta' ? 'is-bad' : 'is-plain'}`}>
                            <span className="gs-check-mark"><RiAlertLine aria-hidden="true" /></span>
                            <div>
                              <strong>{risk.title}</strong>
                              <p>{risk.detail}</p>
                              <p style={{ marginTop: 7 }}>
                                <button type="button" className="gs-button small" onClick={() => navigate(risk.href)}>Arreglar <RiArrowRightLine /></button>
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                </div>

                <Panel title="Lo que alimenta el embudo" subtitle="Anuncios, contenido, búsqueda y correo, en el mismo periodo." icon={RiCoinsLine}>
                  <div className="gs-minis">
                    <Stat label="Gasto en anuncios" value={money(board.totals.adSpend, currency)} hint={board.totals.adLeads > 0 ? `${num(board.totals.adLeads)} leads` : 'Sin leads atribuidos'} missing={board.totals.adSpend === 0} />
                    <Stat label="Clics" value={num(board.totals.adClicks)} hint={`${num(board.totals.adImpressions)} impresiones`} missing={board.totals.adClicks === 0} />
                    <Stat label="Correos" value={num(board.marketing.emailsSent)} hint={`${num(board.marketing.emailOpens)} aperturas`} missing={board.marketing.emailsSent === 0} />
                    <Stat label="Piezas publicadas" value={num(board.marketing.contentPublished)} hint={board.marketing.contentPending > 0 ? `${num(board.marketing.contentPending)} por aprobar` : 'Nada pendiente'} missing={board.marketing.contentPublished === 0 && board.marketing.contentPending === 0} />
                    <Stat label="Nota SEO" value={board.marketing.seoScore} hint={board.marketing.seoUrl || 'Sin web analizada'} missing={board.marketing.seoScore == null} />
                    <Stat label="Visitas orgánicas" value={num(board.marketing.organicVisits)} hint={board.marketing.organicHours > 0 ? `${Math.round(board.marketing.organicHours)} h invertidas` : 'Horas sin registrar'} missing={board.marketing.organicVisits === 0} />
                    <Stat label="Minutos de voz" value={num(board.totals.minutesUsed)} hint={`de ${num(board.totals.minutesAllowed)} del plan`} />
                    <Stat label="Leads" value={num(board.totals.leads)} hint={board.totals.leadsPrevious > 0 ? `antes ${num(board.totals.leadsPrevious)}` : 'Sin periodo anterior'} />
                  </div>
                </Panel>
              </div>
            ) : null}

            {/* ── Dinero ──────────────────────────────────────────────── */}
            {activeTab === 'dinero' ? (
              <div className="gs-stack">
                <div className="gs-cols">
                  <Panel
                    title="De dónde a dónde puedes llegar"
                    subtitle="Cada palanca compara contra algo que ya has medido."
                    icon={RiHandCoinLine}
                    actions={<span className={`gs-pill ${CONFIDENCE_TONE[board.upside.confidence]}`}>Confianza {board.upside.confidence}</span>}
                  >
                    {board.upside.levers.length === 0 ? (
                      <p className="gs-empty-inline">Sin palancas con dinero medible todavía. Lo primero es volumen.</p>
                    ) : (
                      <Waterfall upside={board.upside} currency={currency} />
                    )}
                    <Detail label="Cómo se calcula">{board.upside.confidenceNote}</Detail>
                  </Panel>

                  <Panel title="Doce meses" subtitle="Con el plan y sin él, entrando por rampa." icon={RiLineChartLine}>
                    <Trajectory trajectory={board.upside.trajectory} currency={currency} />
                    <div className="gs-minis" style={{ marginTop: 12 }}>
                      <Stat label="Diferencia en 12 meses" value={money(board.upside.twelveMonthGap, currency)} />
                      <Stat label="Cada semana sin actuar" value={money(board.upside.weeklyCostOfInaction, currency)} />
                      <Stat label="Vale una llamada" value={money(board.upside.unit.perCall, currency)} hint={`cuesta ${money(board.upside.unit.costPerCall, currency)}`} />
                      <Stat label="Llamadas por venta" value={board.upside.unit.callsPerSale == null ? '—' : num(board.upside.unit.callsPerSale)} missing={board.upside.unit.callsPerSale == null} />
                    </div>
                  </Panel>
                </div>

                {board.upside.levers.length > 0 ? (
                  <Panel title="Palanca por palanca" subtitle="Ordenado por lo que vale, no por lo que suena bien." icon={RiCoinsLine}>
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

                <Panel title="De dónde sale el dinero" subtitle="Coste incluye anuncios y las llamadas hechas a sus leads." icon={RiStackLine}>
                  {board.channels.length === 0 ? (
                    <p className="gs-empty-inline">Todavía no hay leads que repartir por canal.</p>
                  ) : (
                    <>
                      <div className="pl-stacks">
                        <StackedBar label="De dónde vienen tus leads" items={board.channels.map(item => ({ key: item.channel, label: item.label, value: item.leads }))} />
                        <StackedBar label="De dónde viene tu dinero" items={board.channels.map(item => ({ key: item.channel, label: item.label, value: item.revenue }))} currency={currency} asMoney />
                      </div>
                      <div className="gs-table-scroll" style={{ marginTop: 14 }}>
                        <table className="gs-table">
                          <thead>
                            <tr>
                              <th>Canal</th>
                              <th className="num">Leads</th>
                              <th className="num">Ventas</th>
                              <th className="num">Coste</th>
                              <th className="num">Ingresos</th>
                              <th className="num">Retorno</th>
                              <th>Veredicto</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {board.channels.map(item => (
                              <tr key={item.channel}>
                                <td><strong>{item.label}</strong><small>{item.reason}</small></td>
                                <td className="num">{num(item.leads)}</td>
                                <td className="num">{num(item.sales)}</td>
                                <td className="num">{item.cost > 0 ? money(item.cost, currency) : item.hours ? `${Math.round(item.hours)} h` : '—'}</td>
                                <td className="num">{money(item.revenue, currency)}</td>
                                <td className={`num${item.roi != null && item.roi < 1 ? ' is-bad' : ''}${item.roi == null ? ' is-missing' : ''}`}>{item.roi == null ? '—' : `${item.roi}×`}</td>
                                <td><span className={`gs-pill ${VERDICT_TONE[item.verdict] ?? ''}`}>{item.verdict}</span></td>
                                <td className="num"><button type="button" className="gs-button small" onClick={() => navigate(item.href)}>Abrir <RiArrowRightLine /></button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  <Detail label="Cuándo me puedo fiar de esto">
                    Un canal necesita 10 leads para juzgarlo y 30 para fiarse del veredicto; por debajo pone «medir». Los canales
                    cuyo coste es tiempo muestran horas y no euros: convertirlas con una tarifa inventada haría que el retorno
                    pareciera medido cuando no lo está.
                  </Detail>
                </Panel>

                {board.allocation.items.length > 0 ? (
                  <Panel title={`Dónde poner ${money(board.allocation.total, currency)}`} subtitle="El grueso a lo que devuelve, cero a lo que ya se demostró que no." icon={RiCoinsLine}>
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
              </div>
            ) : null}

            {/* ── Ventas ──────────────────────────────────────────────── */}
            {activeTab === 'ventas' ? (
              <div className="gs-stack">
                <Panel
                  title="Llamadas"
                  subtitle={`${num(board.calls.total)} en la ventana. Esto es lo que hace tu equipo comercial.`}
                  icon={RiPhoneLine}
                  actions={<button type="button" className="gs-button small" onClick={() => navigate('/llamadas')}>Ver llamadas <RiArrowRightLine /></button>}
                >
                  <div className="gs-minis">
                    <Stat label="Contacto" value={percent(board.calls.contactRate)} hint={`${num(board.calls.contacted)} conversaciones`} missing={board.calls.contactRate == null} />
                    <Stat label="Cualificas" value={percent(board.calls.qualifyRate)} missing={board.calls.qualifyRate == null} />
                    <Stat label="Reuniones" value={percent(board.calls.meetingRate)} hint={`${num(board.calls.meetings)} agendadas`} missing={board.calls.meetingRate == null} />
                    <Stat label="Duración" value={board.calls.averageMinutes == null ? '—' : `${board.calls.averageMinutes} min`} missing={board.calls.averageMinutes == null} />
                    <Stat label="Buzón" value={percent(board.calls.machineRate)} hint="Si pasa del 40%, es la lista" missing={board.calls.machineRate == null} />
                    <Stat label="Te dicen que no" value={percent(board.calls.rejectionRate)} missing={board.calls.rejectionRate == null} />
                  </div>

                  {board.calls.byHour.length > 0 ? (
                    <>
                      <h3 className="gs-subhead">Contacto por hora <small>{board.timezone} · gris = sin muestra</small></h3>
                      <div className="pl-hours">
                        {board.calls.byHour.map(hour => {
                          const isBest = board.calls.bestHour?.hour === hour.hour
                          const isWorst = board.calls.worstHour?.hour === hour.hour
                          return (
                            <div
                              key={hour.hour}
                              className={`pl-hour${!hour.reliable ? ' is-thin' : isBest ? ' is-best' : isWorst ? ' is-worst' : ''}`}
                              title={`${hour.hour}:00 · ${hour.calls} llamadas · ${percent(hour.contactRate)}`}
                            >
                              <i style={{ height: `${Math.max(4, hour.contactRate * 100)}%` }} />
                              <span>{hour.hour}</span>
                            </div>
                          )
                        })}
                      </div>
                      {board.calls.bestHour ? (
                        <p className="gs-note">
                          <RiTimeLine style={{ verticalAlign: -2, marginRight: 4, color: 'var(--success)' }} />
                          A las {board.calls.bestHour.hour}:00 contactas el {percent(board.calls.bestHour.contactRate)}
                          {board.calls.worstHour ? `, a las ${board.calls.worstHour.hour}:00 el ${percent(board.calls.worstHour.contactRate)}` : ''}.
                          {' '}<button type="button" className="gs-link" onClick={() => { patch({ contact: board.calls.bestHour.contactRate }); setTab('simular') }}>Ver qué pasa si llamo solo ahí</button>
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </Panel>

                <div className="gs-cols-even">
                  <Panel title="Agentes" subtitle="Comparables a partir de 15 llamadas." icon={RiFlashlightLine}>
                    {board.calls.byAgent.length === 0 ? (
                      <p className="gs-empty-inline">Ninguna llamada tiene agente asignado.</p>
                    ) : (
                      <div className="gs-table-scroll">
                        <table className="gs-table">
                          <thead>
                            <tr><th>Agente</th><th className="num">Llamadas</th><th className="num">Contacto</th><th className="num">Cualifica</th></tr>
                          </thead>
                          <tbody>
                            {board.calls.byAgent.map(agent => (
                              <tr key={agent.agentId}>
                                <td><strong>{agent.name}</strong>{!agent.reliable ? <small>Muestra corta</small> : null}</td>
                                <td className="num">{num(agent.calls)}</td>
                                <td className="num">{percent(agent.contactRate)}</td>
                                <td className="num">{percent(agent.qualifyRate)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>

                  <Panel title="Cómo acaban" subtitle="Sin agrupar lo que no se parece." icon={RiCompass3Line}>
                    {board.calls.outcomes.length === 0 ? (
                      <p className="gs-empty-inline">Sin llamadas registradas.</p>
                    ) : (
                      <div className="gs-bars">
                        {board.calls.outcomes.map(outcome => (
                          <div key={outcome.outcome} className="gs-bar-row">
                            <span>{outcome.label}</span>
                            <div className="gs-bar-track"><i style={{ width: `${outcome.share}%` }} /></div>
                            <strong>{num(outcome.count)}</strong>
                            <small>{outcome.share}%</small>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>
                </div>

                <Panel
                  title="Pipeline"
                  subtitle="Parada según lo que aguanta su etapa, no según su antigüedad."
                  icon={RiStackLine}
                  actions={<button type="button" className="gs-button small" onClick={() => navigate('/ventas?vista=pipeline')}>Abrir <RiArrowRightLine /></button>}
                >
                  <div className="gs-minis">
                    <Stat label="Abiertas" value={num(board.pipeline.open)} hint={money(board.pipeline.openValue, currency)} />
                    <Stat label="Previsión" value={money(board.pipeline.weightedValue, currency)} hint="Importe por probabilidad" />
                    <Stat label="Comprometido" value={money(board.pipeline.commitValue, currency)} hint={board.pipeline.uncategorized > 0 ? `${num(board.pipeline.uncategorized)} sin categoría` : 'Todas categorizadas'} />
                    <Stat label="Cierras" value={percent(board.pipeline.winRate)} hint={`${num(board.pipeline.won)} ganadas · ${num(board.pipeline.lost)} perdidas`} missing={board.pipeline.winRate == null} />
                    <Stat label="Ciclo" value={board.pipeline.averageCycleDays == null ? '—' : `${board.pipeline.averageCycleDays} días`} missing={board.pipeline.averageCycleDays == null} />
                    <Stat label="Primera respuesta" value={duration(board.speed.medianMinutes)} hint={`${num(board.speed.untouched)} sin tocar`} missing={board.speed.medianMinutes == null} />
                  </div>

                  {board.pipeline.byStage.some(stage => stage.count > 0) ? (
                    <div className="gs-bars" style={{ marginTop: 14 }}>
                      {board.pipeline.byStage.map(stage => {
                        const top = Math.max(1, ...board.pipeline.byStage.map(item => item.value))
                        return (
                          <div key={stage.stage} className="gs-bar-row">
                            <span>{stage.label}</span>
                            <div className="gs-bar-track"><i style={{ width: `${(stage.value / top) * 100}%` }} /></div>
                            <strong>{money(stage.value, currency, true)}</strong>
                            <small className={stage.stalled > 0 ? 'pl-warn-text' : undefined}>{stage.stalled > 0 ? `${stage.stalled} paradas` : `${stage.count}`}</small>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}

                  {board.pipeline.stalled.length > 0 ? (
                    <>
                      <h3 className="gs-subhead">Paradas, por importe</h3>
                      <div className="gs-queue">
                        {board.pipeline.stalled.slice(0, 4).map(item => (
                          <article key={item.id} className="gs-queue-card tone-warn">
                            <header>
                              <span className="gs-queue-kind">{item.label}</span>
                              <span className="gs-queue-meta">{item.days} días quieta</span>
                            </header>
                            <strong>{item.name}</strong>
                            <p><b>{money(item.value, currency)}</b> en juego.</p>
                            <footer>
                              <div><button type="button" className="gs-button small" onClick={() => navigate(`/pipeline/${item.id}`)}>Abrir <RiArrowRightLine /></button></div>
                            </footer>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : null}

                  {board.pipeline.lossReasons.length > 0 ? (
                    <p className="gs-note">Por qué pierdes: {board.pipeline.lossReasons.map(reason => `${reason.reason} (${reason.share}%)`).join(' · ')}.</p>
                  ) : null}
                </Panel>
              </div>
            ) : null}

            {/* ── Hacer ───────────────────────────────────────────────── */}
            {activeTab === 'hacer' ? (
              <div className="gs-stack">
                {board.actions.length === 0 ? (
                  <Panel title="Nada urgente" icon={RiCheckboxCircleLine}>
                    <p className="gs-empty-inline is-ok">
                      No hay cuellos de botella claros. Lo que más mueve la aguja es volumen:{' '}
                      <button type="button" className="gs-link" onClick={() => setTab('simular')}>pruébalo en el simulador</button>.
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
                                <span>{action.gainKind === 'rescate' ? 'De una vez' : action.gainKind === 'ahorro' ? 'Dejas de quemar' : 'Cada mes'}</span>
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
                  <Panel title="Otras cosas que hemos visto" icon={RiInformationLine}>
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
function GoalBox({ params, currency, minutesAllowed }) {
  const [goal, setGoal] = useState('')
  const target = Number(goal) || 0

  const plan = useMemo(() => {
    if (target <= 0 || !params) return null
    const sales = params.dealValue > 0 ? target / params.dealValue : 0
    const opportunities = params.win > 0 ? sales / params.win : 0
    const qualified = params.opportunity > 0 ? opportunities / params.opportunity : 0
    const conversations = params.qualify > 0 ? qualified / params.qualify : 0
    const calls = params.contact > 0 ? conversations / params.contact : 0
    const minutes = Math.round(calls * params.minutesPerCall)
    return {
      sales, opportunities, qualified, conversations, calls, minutes,
      leads: Math.ceil(calls / 2.2),
      budget: Math.ceil(calls * params.minutesPerCall * params.costPerMinute),
      fits: minutes <= minutesAllowed,
    }
  }, [target, params, minutesAllowed])

  return (
    <div className="pl-goal">
      <label className="pl-control">
        <span className="pl-control-head">Quiero facturar al mes</span>
        <input
          className="gs-input" type="number" min="0" step="500" placeholder="20000"
          value={goal} onChange={event => setGoal(event.target.value)}
        />
      </label>
      {plan ? (
        <>
          <div className="pl-sim-grid">
            <div><span>Ventas</span><strong>{decimal(plan.sales)}</strong></div>
            <div><span>Oportunidades</span><strong>{num(plan.opportunities)}</strong></div>
            <div><span>Conversaciones</span><strong>{num(plan.conversations)}</strong></div>
            <div><span>Llamadas</span><strong>{num(plan.calls)}</strong></div>
            <div><span>Leads</span><strong>{num(plan.leads)}</strong></div>
            <div><span>Presupuesto</span><strong>{money(plan.budget, currency)}</strong></div>
          </div>
          {!plan.fits ? (
            <p className="gs-note pl-warn">
              <RiSignalTowerLine /> Necesita {num(plan.minutes)} minutos y tu plan da {num(minutesAllowed)}: no cabe.
            </p>
          ) : null}
        </>
      ) : (
        <p className="gs-empty-inline">Pon una cifra y sale la cadena entera con tus tasas.</p>
      )}
    </div>
  )
}
