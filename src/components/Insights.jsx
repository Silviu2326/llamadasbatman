import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { apiFetch } from '../lib/api'
import { groupSeries, validAnalysis } from '../lib/businessAnalysis'
import { outcomeLabel } from '../lib/callOutcome'
import { localeCode, useI18n } from '../i18n'
import { useAuth } from '../contexts/AuthContext'
import { useThemeColors } from '../hooks/useTheme'
import './business-analysis.css'

const stages = { lead: 'Inicial', qualified: 'Cualificada', proposal: 'Propuesta', negotiation: 'Negociación', closed_won: 'Ganada', closed_lost: 'Perdida' }
const sentiments = { positive: 'Positivo', neutral: 'Neutral', negative: 'Negativo' }
const statuses = { scheduled: 'Programada', completed: 'Completada', no_show: 'No asistió' }
const initial = () => ({ data: null, loading: true, error: '' })

export function AnalysisState({ resource, retry }) {
  if (resource.error) return <div className="analysis-message is-error" role="alert"><p>{resource.error} {resource.data ? 'Se mantienen los últimos datos cargados; pueden estar desactualizados.' : ''}</p><button type="button" onClick={retry} disabled={resource.loading}>Reintentar</button></div>
  if (resource.loading) return <p className="analysis-message" role="status">{resource.data ? 'Actualizando…' : 'Cargando resultados…'}</p>
  return null
}

export function ComparisonTable({ rows, dimension, onInspect, number }) {
  if (!rows.length) return <p className="analysis-message">No hay llamadas registradas en este periodo.</p>
  return <div className="analysis-table-wrap" role="region" aria-label={`Resultados por ${dimension === 'campaignId' ? 'campaña' : 'agente'}`} tabIndex={0}>
    <table className="analysis-table"><thead><tr><th>{dimension === 'campaignId' ? 'Campaña' : 'Agente'}</th><th>Llamadas</th><th>Conversaciones*</th><th>Con reunión</th><th>% con reunión</th><th>Muestra</th></tr></thead>
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
    {data ? <><p>{number(data.total)} registros · {date(period.start)} – {date(period.end)} (UTC).</p>
      {data.rows.length ? <ul>{data.rows.map(row => <li key={row.id}><time dateTime={row.date}>{date(row.date)}</time><Link to={row.href}>{row.title}</Link>
        <span>{selection.kind === 'calls' ? outcomeLabel(row.detail) : stages[row.detail] || statuses[row.detail] || row.detail}</span>{row.value !== undefined ? <strong>{row.value == null ? 'Sin importe' : money(row.value, row.currency)}</strong> : null}</li>)}</ul> : <p>No hay registros que coincidan con este filtro.</p>}
      <div className="analysis-pagination"><button disabled={page === 1 || resource.loading} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page} de {Math.max(1, Math.ceil(data.total / 25))}</span><button disabled={page * 25 >= data.total || resource.loading} onClick={() => setPage(value => value + 1)}>Siguiente</button></div>
      <p className="analysis-note">Los registros reflejan su estado actual. Si alguien los modifica después de cargar el análisis, actualiza para recalcular las cifras.</p>
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
  const difference = metric => metric.change == null ? 'Sin base anterior para calcular la variación' : `${metric.change > 0 ? '+' : ''}${number(metric.change)}% frente al periodo anterior`
  return <main className="business-analysis dark-scroll"><div className="analysis-content">
    <header className="analysis-header"><div><h1>Análisis del negocio</h1><p>Ventas, reuniones y resultados de las llamadas.</p></div>
      <div className="analysis-controls"><label>Periodo<select value={days} onChange={event => { setDays(Number(event.target.value)); setResource(initial()); setSelection(null) }}>{[7, 30, 90].map(value => <option key={value} value={value}>Últimos {value} días</option>)}</select></label><button disabled={resource.loading} onClick={retry}>Actualizar</button></div>
    </header>
    <AnalysisState resource={resource} retry={retry} />
    {data ? <>
      <p className="analysis-note">{date(data.period.start)} – {date(data.period.end)} · UTC · Actualizado a las {new Intl.DateTimeFormat(localeCode(locale), { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(data.generatedAt))}. Comparación: {date(data.period.previousStart)} – {date(data.period.previousEnd)}, hasta la misma hora.</p>
      {data.warnings.missingCloseDates > 0 || data.warnings.otherCurrencies > 0 || data.warnings.missingValues > 0 ? <div className="analysis-message is-error" role="status">
        {data.warnings.missingCloseDates > 0 ? <p>{data.warnings.missingCloseDates} oportunidades cerradas de la cuenta no tienen fecha de cierre y no se pueden asignar a un periodo.</p> : null}
        {data.warnings.otherCurrencies > 0 ? <p>{data.warnings.otherCurrencies} ventas del periodo están en otra moneda. El importe mostrado suma únicamente euros, sin convertir monedas.</p> : null}
        {data.warnings.missingValues > 0 ? <p>{data.warnings.missingValues} ventas no tienen importe registrado: la suma está incompleta.</p> : null}
      </div> : null}
      {selection ? <Records key={JSON.stringify(selection)} selection={selection} period={data.period} onClose={close} number={number} money={money} date={date} /> : null}
      <section className="analysis-metrics" aria-label="Resultados del periodo">
        {[
          { key: 'revenue', title: 'Ventas cerradas', value: money(data.metrics.revenue.value), note: `${data.sample.won} ventas · importe en euros`, kind: 'won' },
          { key: 'meetings', title: 'Reuniones creadas', value: number(data.metrics.meetings.value), note: 'Creadas en el periodo, sin canceladas', kind: 'meetings' },
          { key: 'calls', title: 'Llamadas realizadas', value: number(data.metrics.calls.value), note: 'Todos los intentos registrados', kind: 'calls' },
          { key: 'winRate', title: 'Cierre de oportunidades', value: data.metrics.winRate.value == null ? '—' : `${number(data.metrics.winRate.value)}%`, note: `${data.sample.won} ganadas de ${data.sample.closed} cerradas`, kind: 'closed' },
        ].map(item => <article key={item.key}><h2>{item.title}</h2><button className="analysis-value" onClick={() => inspect({ kind: item.kind, title: item.title })} aria-label={`${item.title}: ${item.value}. Ver registros`}>{item.value}</button><p>{item.note}</p><small>{item.key === 'winRate' ? data.metrics.winRate.points == null ? 'Sin cierres comparables en ambos periodos' : `${number(data.metrics.winRate.points)} puntos frente al periodo anterior` : difference(data.metrics[item.key])}</small></article>)}
      </section>
      {data.metrics.calls.value === 0 && data.metrics.meetings.value === 0 && data.sample.closed === 0 && data.sample.opportunities === 0 ? <p className="analysis-message">No hay actividad registrada en este periodo. Prueba con un periodo más amplio o empieza añadiendo <Link to="/ventas?vista=leads">contactos</Link>.</p> : null}
      <section className="analysis-section"><div className="analysis-section-heading"><h2>Evolución del periodo</h2><div className="analysis-controls">
        <label>Mostrar<select value={chartMetric} onChange={event => setChartMetric(event.target.value)}><option value="activity">Llamadas y reuniones</option><option value="revenue">Ventas en euros</option></select></label>
        <label>Agrupar por<select value={interval} onChange={event => setInterval(event.target.value)}><option value="day">Día</option><option value="week">Semana</option><option value="month">Mes</option></select></label>
      </div></div><p>Solo se suman los días del periodo seleccionado. Las semanas empiezan el lunes; los extremos pueden estar incompletos.</p>
        <div className="analysis-chart"><ResponsiveContainer width="100%" height={260}><BarChart data={series} accessibilityLayer><CartesianGrid vertical={false} stroke={colors.line} /><XAxis dataKey="date" tickFormatter={value => date(value).replace(/ \d{4}$/, '')} tick={{ fill: colors.dim, fontSize: 11 }} /><YAxis tick={{ fill: colors.dim, fontSize: 11 }} width={65} /><Tooltip labelFormatter={date} contentStyle={{ background: 'var(--surface)', borderColor: 'var(--line)' }} />
          {chartMetric === 'activity' ? <><Bar dataKey="calls" name="Llamadas" fill={colors.cyan} /><Bar dataKey="meetings" name="Reuniones creadas" fill={colors.success} /></> : <Bar dataKey="revenue" name="Ventas (€)" fill={colors.success} />}
        </BarChart></ResponsiveContainer></div>
        <p className="analysis-note">{chartMetric === 'activity' ? 'Llamadas en azul · Reuniones en verde. Las reuniones se cuentan por su fecha de creación, aunque se celebren más adelante.' : 'Ventas ganadas en euros, agrupadas por fecha de cierre. No incluye oportunidades abiertas.'}</p>
        <details><summary>Ver cifras del gráfico</summary><div className="analysis-table-wrap"><table className="analysis-table"><thead><tr><th>Inicio del grupo</th><th>Llamadas</th><th>Reuniones</th><th>Ventas (€)</th></tr></thead><tbody>{series.map(row => <tr key={row.date}><td>{date(row.date)}</td><td>{number(row.calls)}</td><td>{number(row.meetings)}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div></details>
      </section>
      {[['campaignId', 'Resultados por campaña', data.campaigns], ['agentId', 'Resultados por agente', data.agents]].map(([dimension, title, rows]) => <section className="analysis-section" key={dimension}><h2>{title}</h2><p>Ordenados por llamadas con alguna reunión vinculada y no cancelada. Cada llamada cuenta una vez, aunque genere varias reuniones.</p><ComparisonTable rows={rows} dimension={dimension} onInspect={inspect} number={number} /><p className="analysis-note">*Conversaciones identificadas por el resultado registrado. Las reuniones pueden haberse creado después de la llamada. Con pocas llamadas, el porcentaje puede variar mucho; no indica por sí solo quién vende mejor.</p></section>)}
      <div className="analysis-columns">
        <section className="analysis-section"><div className="analysis-section-heading"><h2>Oportunidades del periodo</h2><button onClick={() => inspect({ kind: 'opportunities', title: 'Oportunidades creadas' })}>Ver registros</button></div><p>Estado actual de las {data.sample.opportunities} oportunidades creadas en este periodo. Cada una aparece en una sola etapa.</p><Distribution rows={data.stages} labels={key => stages[key] || key} empty="No se crearon oportunidades en este periodo." /></section>
        <section className="analysis-section"><div className="analysis-section-heading"><h2>Motivos de pérdida</h2><button onClick={() => inspect({ kind: 'lost', title: 'Oportunidades perdidas' })}>Ver registros</button></div><p>Motivos registrados en las oportunidades perdidas por fecha de cierre.</p><Distribution rows={data.losses} labels={key => key} empty="No hay oportunidades perdidas con fecha de cierre en este periodo." /></section>
      </div>
      <details className="analysis-section"><summary>Resultados y sentimiento de las llamadas</summary><div className="analysis-columns"><section><h2>Resultado registrado</h2><Distribution rows={data.outcomes} labels={outcomeLabel} empty="No hay llamadas en este periodo." onInspect={outcome => inspect({ kind: 'calls', outcome, title: outcomeLabel(outcome) })} /></section><section><h2>Sentimiento</h2><p>Hay sentimiento identificado en {data.sample.sentiments} de {data.metrics.calls.value} llamadas. No equivale a satisfacción ni a una venta.</p><Distribution rows={data.sentiment} labels={key => sentiments[key]} empty="Todavía no hay sentimiento identificado." /></section></div></details>
      <p className="analysis-note">Los resultados reflejan lo registrado en la cuenta. Puedes <Link to="/plan">fijar objetivos y organizar acciones</Link> a partir de ellos.</p>
    </> : null}
  </div></main>
}

export default function Insights() {
  const { user } = useAuth()
  return <BusinessAnalysis key={user?.orgId || user?.id || 'workspace'} />
}
