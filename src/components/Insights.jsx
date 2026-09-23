import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RiCoinsLine, RiCalendarCheckLine, RiPhoneLine, RiFocus3Line, RiLineChartLine, RiMegaphoneLine, RiRobot2Line } from 'react-icons/ri'
import HomeAccentIcon from './ui/HomeAccentIcon'
import HomePageFrame from './ui/HomePageFrame'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { apiFetch } from '../lib/api'
import { groupSeries, validAnalysis } from '../lib/businessAnalysis'
import { outcomeLabel } from '../lib/callOutcome'
import { localeCode, useI18n } from '../i18n'
import { useAuth } from '../contexts/AuthContext'
import { useThemeColors } from '../hooks/useTheme'
import HomeLoadingState, { HomeLoadingIndicator } from './ui/HomeLoadingState'
import './business-analysis.css'

const stages = { lead: 'Inicial', qualified: 'Cualificada', proposal: 'Propuesta', negotiation: 'Negociación', closed_won: 'Ganada', closed_lost: 'Perdida' }
const sentiments = { positive: 'Positivo', neutral: 'Neutral', negative: 'Negativo' }
const statuses = { scheduled: 'Programada', completed: 'Completada', no_show: 'No asistió' }
const initial = () => ({ data: null, loading: true, error: '' })

export function AnalysisState({ resource, retry, variant = 'list' }) {
  if (resource.error) return <div className="analysis-message is-error" role="alert"><p>{resource.error} {resource.data ? 'Se mantienen los últimos datos cargados; pueden estar desactualizados.' : ''}</p><button type="button" onClick={retry} disabled={resource.loading}>Reintentar</button></div>
  if (resource.loading) return resource.data ? <HomeLoadingIndicator label="Actualizando resultados…" /> : <HomeLoadingState variant={variant} label="Cargando resultados…" />
  return null
}

export function ComparisonTable({ rows, dimension, onInspect, number }) {
  if (!rows.length) return <p className="analysis-message">No hay llamadas registradas en este periodo.</p>
  return <div className="analysis-table-wrap" role="region" aria-label={`Resultados por ${dimension === 'campaignId' ? 'campaña' : 'agente'}`} tabIndex={0}>
    <table className="analysis-table"><thead><tr><th>{dimension === 'campaignId' ? 'Campaña' : 'Agente'}</th><th>Llamadas</th><th>Conversaciones</th><th>Con reunión</th><th>% con reunión</th><th>Muestra</th></tr></thead>
      <tbody>{rows.map(row => {
        const filter = { kind: 'calls', [dimension]: row.id ?? 'unassigned' }
        return <tr key={row.id ?? 'unassigned'}><th scope="row">{row.id ? <Link to={`/${dimension === 'campaignId' ? 'campanas' : 'agentes'}/${encodeURIComponent(row.id)}`}>{row.name}</Link> : row.name}</th>
          <td><button onClick={() => onInspect({ ...filter, title: `Llamadas · ${row.name}` })}>{number(row.calls)}</button></td><td>{number(row.conversations)}</td>
          <td><button onClick={() => onInspect({ ...filter, withMeeting: true, title: `Llamadas con reunión · ${row.name}` })}>{number(row.withMeeting)}</button></td>
          <td>{number(row.meetingRate)}%</td><td>{row.smallSample ? 'Menos de 20 llamadas' : `${number(row.calls)} llamadas`}</td></tr>
      })}</tbody>
    </table>
  </div>
}

function Records({ selection, period, onClose, number, money, date }) {
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const [resource, setResource] = useState(initial)
  const panel = useRef(null)
  useEffect(() => { panel.current?.focus(); panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [])
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setResource(initial())
    const { title, ...filters } = selection
    const query = new URLSearchParams({ ...filters, start: period.start, end: period.end, page })
    apiFetch(`/api/dashboard/analysis/records?${query}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(response.status === 403 ? 'No tienes permiso para consultar estos registros.' : 'No se pudo cargar el detalle.')
      const data = await response.json()
      if (!Array.isArray(data?.rows) || !Number.isFinite(data.total)) throw new Error('El detalle no está disponible.')
      if (active) setResource({ data, loading: false, error: '' })
    }).catch(error => { if (active) setResource({ data: null, loading: false, error: error.message }) })
    return () => { active = false; controller.abort() }
  }, [selection, period, page, version])
  const data = resource.data
  return <section className="analysis-records" ref={panel} tabIndex={-1} aria-label={selection.title}>
    <div className="analysis-section-heading"><h2>{selection.title}</h2><button onClick={onClose}>Cerrar detalle</button></div>
    <AnalysisState resource={resource} retry={() => setVersion(value => value + 1)} />
    {data ? <><p>{number(data.total)} registros en los últimos {period.days} días.</p>
      {data.rows.length ? <ul>{data.rows.map(row => <li key={row.id}><time dateTime={row.date}>{date(row.date)}</time><Link to={row.href}>{row.title}</Link>
        <span>{selection.kind === 'calls' ? outcomeLabel(row.detail) : stages[row.detail] || statuses[row.detail] || row.detail}</span>{row.value !== undefined ? <strong>{row.value == null ? 'Sin importe' : money(row.value, row.currency)}</strong> : null}</li>)}</ul> : <p>No hay registros que coincidan con este filtro.</p>}
      <div className="analysis-pagination"><button disabled={page === 1 || resource.loading} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page} de {Math.max(1, Math.ceil(data.total / 25))}</span><button disabled={page * 25 >= data.total || resource.loading} onClick={() => setPage(value => value + 1)}>Siguiente</button></div>
    </> : null}
  </section>
}

function Distribution({ rows, labels, empty, onInspect }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  return total ? <ul className="analysis-distribution">{rows.map(row => <li key={row.key}>
    <span>{labels(row.key)}</span><meter min={0} max={total} value={row.count} aria-label={labels(row.key)} />
    {onInspect ? <button onClick={() => onInspect(row.key)}>{row.count}</button> : <strong>{row.count}</strong>}
  </li>)}</ul> : <p className="analysis-message">{empty}</p>
}

function BusinessAnalysis() {
  const { locale } = useI18n()
  const colors = useThemeColors()
  const [days, setDays] = useState(30)
  const [interval, setInterval] = useState('day')
  const [chartMetric, setChartMetric] = useState('activity')
  const [version, setVersion] = useState(0)
  const [resource, setResource] = useState(initial)
  const [selection, setSelection] = useState(null)
  const trigger = useRef(null)
  const retry = () => setVersion(value => value + 1)
  const number = value => new Intl.NumberFormat(localeCode(locale), { maximumFractionDigits: 1 }).format(value)
  const money = (value, currency = 'EUR') => new Intl.NumberFormat(localeCode(locale), { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  const date = value => new Intl.DateTimeFormat(localeCode(locale), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setSelection(null)
    setResource(current => ({ data: current.data?.period.days === days ? current.data : null, loading: true, error: '' }))
    apiFetch(`/api/dashboard/analysis?days=${days}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(response.status === 403 ? 'No tienes permiso para consultar el análisis.' : 'No se pudieron cargar los resultados.')
      const data = await response.json()
      if (!validAnalysis(data) || data.period.days !== days) throw new Error('El informe recibido está incompleto. Vuelve a intentarlo.')
      if (active) setResource({ data, loading: false, error: '' })
    }).catch(error => { if (active) setResource(current => ({ ...current, loading: false, error: error.message })) })
    return () => { active = false; controller.abort() }
  }, [days, version])
  const data = resource.data
  const series = useMemo(() => groupSeries(data?.series || [], interval), [data?.series, interval])
  const inspect = value => { trigger.current = document.activeElement; setSelection(value) }
  const close = () => { setSelection(null); trigger.current?.focus() }
  const difference = metric => metric.change == null ? null : `${metric.change > 0 ? '+' : ''}${number(metric.change)}% frente al periodo anterior`
  return <HomePageFrame page="insights" className="business-analysis" contentClassName="analysis-content">
    <div className="analysis-results-heading">
      <h2>Tus resultados</h2>
      <div className="analysis-range" role="group" aria-label="Mostrar resultados de los últimos">
        {[7, 30, 90].map(value => <button key={value} type="button" aria-label={`Últimos ${value} días`} aria-pressed={days === value} onClick={() => {
          if (value === days) return
          setDays(value); setResource(initial()); setSelection(null)
        }}>{value} días</button>)}
      </div>
    </div>
    <AnalysisState resource={resource} retry={retry} variant="analysis" />
    {data ? <>
      {data.warnings.missingCloseDates > 0 || data.warnings.otherCurrencies > 0 || data.warnings.missingValues > 0 ? <div className="analysis-message is-error" role="status">
        {data.warnings.missingCloseDates > 0 ? <p>{data.warnings.missingCloseDates} oportunidades cerradas no tienen fecha de cierre. Añádela para incluirlas en los resultados.</p> : null}
        {data.warnings.otherCurrencies > 0 ? <p>{data.warnings.otherCurrencies} ventas en otras monedas quedan fuera del total en euros.</p> : null}
        {data.warnings.missingValues > 0 ? <p>{data.warnings.missingValues} ventas no tienen importe. El total está incompleto.</p> : null}
      </div> : null}
      {selection ? <Records key={JSON.stringify(selection)} selection={selection} period={data.period} onClose={close} number={number} money={money} date={date} /> : null}
      <section className="analysis-metrics" aria-label="Resultados del periodo">
        {[
          { key: 'revenue', icon: RiCoinsLine, tone: 'green', title: 'Ventas cerradas', value: money(data.metrics.revenue.value), note: `${number(data.sample.won)} ventas`, kind: 'won' },
          { key: 'meetings', icon: RiCalendarCheckLine, tone: 'violet', title: 'Reuniones creadas', value: number(data.metrics.meetings.value), note: 'Sin canceladas', kind: 'meetings' },
          { key: 'calls', icon: RiPhoneLine, tone: 'blue', title: 'Llamadas realizadas', value: number(data.metrics.calls.value), note: 'Incluye intentos sin respuesta', kind: 'calls' },
          { key: 'winRate', icon: RiFocus3Line, tone: 'amber', title: 'Cierre de oportunidades', value: data.metrics.winRate.value == null ? '—' : `${number(data.metrics.winRate.value)}%`, note: `${data.sample.won} ganadas de ${data.sample.closed} cerradas`, kind: 'closed' },
        ].map(item => {
          const comparison = item.key === 'winRate' ? data.metrics.winRate.points == null ? null : `${number(data.metrics.winRate.points)} puntos frente al periodo anterior` : difference(data.metrics[item.key])
          return <article className="home-metric-tone" data-tone={item.tone} key={item.key}><HomeAccentIcon icon={item.icon} tone={item.tone} /><h2>{item.title}</h2><button className="analysis-value" onClick={() => inspect({ kind: item.kind, title: item.title })} aria-label={`${item.title}: ${item.value}. Ver registros`}>{item.value}</button><p>{item.note}</p>{comparison ? <small>{comparison}</small> : null}</article>
        })}
      </section>
      {data.metrics.calls.value === 0 && data.metrics.meetings.value === 0 && data.sample.closed === 0 && data.sample.opportunities === 0 ? <p className="analysis-message">No hay actividad registrada en este periodo. Prueba con un periodo más amplio o empieza añadiendo <Link to="/ventas?vista=leads">contactos</Link>.</p> : null}
      <section className="analysis-section"><div className="analysis-section-heading"><h2><HomeAccentIcon icon={RiLineChartLine} tone="blue" />Evolución del periodo</h2><div className="analysis-controls">
        <label>Mostrar<select value={chartMetric} onChange={event => setChartMetric(event.target.value)}><option value="activity">Llamadas y reuniones</option><option value="revenue">Ventas en euros</option></select></label>
        <label>Agrupar por<select value={interval} onChange={event => setInterval(event.target.value)}><option value="day">Día</option><option value="week">Semana</option><option value="month">Mes</option></select></label>
      </div></div>
        <div className="analysis-chart"><ResponsiveContainer width="100%" height={260}><BarChart data={series} accessibilityLayer><CartesianGrid vertical={false} stroke={colors.line} /><XAxis dataKey="date" tickFormatter={value => date(value).replace(/ \d{4}$/, '')} tick={{ fill: colors.dim, fontSize: 11 }} /><YAxis tick={{ fill: colors.dim, fontSize: 11 }} width={65} /><Tooltip labelFormatter={date} contentStyle={{ background: 'var(--surface)', borderColor: 'var(--line)' }} />
          {chartMetric === 'activity' ? <><Bar dataKey="calls" name="Llamadas" fill={colors.cyan} /><Bar dataKey="meetings" name="Reuniones creadas" fill={colors.success} /></> : <Bar dataKey="revenue" name="Ventas (€)" fill={colors.success} />}
        </BarChart></ResponsiveContainer></div>
        <p className="analysis-note">{chartMetric === 'activity' ? 'Llamadas en azul · Reuniones en verde' : 'Ventas cerradas en euros'}</p>
        <details><summary>Ver cifras del gráfico</summary><div className="analysis-table-wrap"><table className="analysis-table"><thead><tr><th>Inicio del grupo</th><th>Llamadas</th><th>Reuniones</th><th>Ventas (€)</th></tr></thead><tbody>{series.map(row => <tr key={row.date}><td>{date(row.date)}</td><td>{number(row.calls)}</td><td>{number(row.meetings)}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div></details>
      </section>
      {[['campaignId', 'Resultados por campaña', data.campaigns], ['agentId', 'Resultados por agente', data.agents]].map(([dimension, title, rows]) => <section className="analysis-section" key={dimension}><h2><HomeAccentIcon icon={dimension === 'campaignId' ? RiMegaphoneLine : RiRobot2Line} />{title}</h2>{rows.length ? <p>Primero, quienes consiguen más llamadas con reunión.</p> : null}<ComparisonTable rows={rows} dimension={dimension} onInspect={inspect} number={number} /></section>)}
      <div className="analysis-columns">
        <section className="analysis-section"><div className="analysis-section-heading"><h2>Oportunidades del periodo</h2><button onClick={() => inspect({ kind: 'opportunities', title: 'Oportunidades creadas' })}>Ver registros</button></div><p>Estado actual de las {data.sample.opportunities} oportunidades creadas en este periodo. Cada una aparece en una sola etapa.</p><Distribution rows={data.stages} labels={key => stages[key] || key} empty="No se crearon oportunidades en este periodo." /></section>
        <section className="analysis-section"><div className="analysis-section-heading"><h2>Motivos de pérdida</h2><button onClick={() => inspect({ kind: 'lost', title: 'Oportunidades perdidas' })}>Ver registros</button></div><p>Motivos registrados en las oportunidades perdidas por fecha de cierre.</p><Distribution rows={data.losses} labels={key => key} empty="No hay oportunidades perdidas con fecha de cierre en este periodo." /></section>
      </div>
      <details className="analysis-section"><summary>Resultados y sentimiento de las llamadas</summary><div className="analysis-columns"><section><h2>Resultado registrado</h2><Distribution rows={data.outcomes} labels={outcomeLabel} empty="No hay llamadas en este periodo." onInspect={outcome => inspect({ kind: 'calls', outcome, title: outcomeLabel(outcome) })} /></section><section><h2>Sentimiento</h2><p>Hay sentimiento identificado en {data.sample.sentiments} de {data.metrics.calls.value} llamadas. No equivale a satisfacción ni a una venta.</p><Distribution rows={data.sentiment} labels={key => sentiments[key]} empty="Todavía no hay sentimiento identificado." /></section></div></details>
      <details className="home-data-details"><summary>Cómo se calcula</summary>
        <p>Las ventas suman importes en euros según su fecha de cierre. Las reuniones se cuentan cuando se crean, aunque se celebren más adelante, y se excluyen las canceladas. Las llamadas incluyen todos los intentos.</p>
        <p>Las variaciones comparan con el periodo anterior de igual duración. Si faltan datos para comparar, no se muestra una variación. Los días se calculan en UTC; las semanas empiezan el lunes y los grupos de los extremos pueden tener menos días.</p>
        <p>En campañas y agentes, cada llamada con reunión cuenta una vez. Las conversaciones se identifican por su resultado registrado. Una reunión puede haberse creado después de la llamada. Con pocas llamadas, los porcentajes pueden cambiar mucho: consulta el tamaño de la muestra.</p>
      </details>
      <p className="analysis-note"><Link to="/plan">Fijar objetivos y planificar acciones</Link></p>
    </> : null}
  </HomePageFrame>
}

export default function Insights() {
  const { user } = useAuth()
  return <BusinessAnalysis key={user?.orgId || user?.id || 'workspace'} />
}
