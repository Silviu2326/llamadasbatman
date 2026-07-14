import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  RiBarChartBoxLine, RiCheckLine, RiFocus3Line, RiGroupLine,
  RiLoader4Line, RiLock2Line, RiRocketLine,
} from 'react-icons/ri'
import './campaign-share.css'

const STATUS = {
  draft: { label: 'En preparación', tone: 'is-draft' },
  active: { label: 'Activa', tone: 'is-active' },
  paused: { label: 'Pausada', tone: 'is-paused' },
  done: { label: 'Finalizada', tone: 'is-done' },
}

function Metric({ Icon, label, value, caption }) {
  return <article className="campaign-share-metric">
    <span><Icon /></span>
    <div><small>{label}</small><strong>{value}</strong><p>{caption}</p></div>
  </article>
}

export default function PublicCampaignSharePage() {
  const { token } = useParams()
  const [campaign, setCampaign] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let cancelled = false
    if (!token) { setState('not-found'); return undefined }

    fetch(`/api/public/campaigns/${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' } })
      .then(async response => ({ ok: response.ok, data: await response.json().catch(() => null) }))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (!ok || !data) { setState('not-found'); return }
        setCampaign(data)
        setState('ready')
      })
      .catch(() => { if (!cancelled) setState('error') })

    return () => { cancelled = true }
  }, [token])

  const summary = useMemo(() => {
    const total = Number(campaign?.totalLeads ?? 0)
    const contacted = Number(campaign?.contacted ?? 0)
    const meetings = Number(campaign?.meetingsScheduled ?? 0)
    return {
      total,
      contacted,
      meetings,
      contactRate: total ? Math.round((contacted / total) * 100) : 0,
      conversionRate: total ? Math.round((meetings / total) * 100) : 0,
    }
  }, [campaign])

  if (state === 'loading') return <main className="campaign-share-page campaign-share-center"><RiLoader4Line className="campaign-share-spin" /><span>Cargando resumen de campaña…</span></main>

  if (state !== 'ready') return <main className="campaign-share-page campaign-share-center"><section className="campaign-share-empty"><RiLock2Line /><h1>{state === 'not-found' ? 'Este enlace ya no está disponible' : 'No pudimos cargar la campaña'}</h1><p>{state === 'not-found' ? 'Pide a la persona que te lo compartió un enlace actualizado.' : 'Vuelve a intentarlo en unos minutos.'}</p></section></main>

  const status = STATUS[campaign.status] ?? STATUS.draft

  return <main className="campaign-share-page">
    <header className="campaign-share-header">
      <div className="campaign-share-brand"><span><RiRocketLine /></span><strong>Robin</strong><small>Campaign brief</small></div>
      <div className="campaign-share-secure"><RiLock2Line /> Vista compartida de solo lectura</div>
    </header>

    <section className="campaign-share-hero">
      <div className="campaign-share-grid" aria-hidden="true" />
      <div className="campaign-share-hero-copy">
        <div className={`campaign-share-status ${status.tone}`}><i /> {status.label}</div>
        <p className="campaign-share-eyebrow">Resumen de campaña</p>
        <h1>{campaign.name}</h1>
        <p className="campaign-share-objective">{campaign.objective || 'Un resumen claro del progreso comercial y las señales que está generando esta campaña.'}</p>
      </div>
      <div className="campaign-share-orb"><div><RiBarChartBoxLine /><span>{summary.conversionRate}%<small>conversión</small></span></div></div>
    </section>

    <section className="campaign-share-metrics" aria-label="Métricas de campaña">
      <Metric Icon={RiGroupLine} label="Leads" value={summary.total.toLocaleString('es-ES')} caption="contactos incorporados" />
      <Metric Icon={RiFocus3Line} label="Contactados" value={summary.contacted.toLocaleString('es-ES')} caption={`${summary.contactRate}% de cobertura`} />
      <Metric Icon={RiCheckLine} label="Reuniones" value={summary.meetings.toLocaleString('es-ES')} caption="oportunidades activadas" />
    </section>

    <section className="campaign-share-progress">
      <div className="campaign-share-section-copy"><p>Progreso comercial</p><h2>Del interés a la conversación.</h2><span>Las métricas se actualizan con la actividad real de la campaña.</span></div>
      <div className="campaign-share-progress-list">
        <div><span><i className="is-indigo" /> Leads recibidos</span><strong>{summary.total}</strong><b style={{ width: '100%' }} /></div>
        <div><span><i className="is-cyan" /> Contactos trabajados</span><strong>{summary.contacted}</strong><b className="is-cyan" style={{ width: `${summary.contactRate}%` }} /></div>
        <div><span><i className="is-green" /> Reuniones generadas</span><strong>{summary.meetings}</strong><b className="is-green" style={{ width: `${summary.conversionRate}%` }} /></div>
      </div>
    </section>

    <footer className="campaign-share-footer"><span>Datos compartidos de forma segura por Robin.</span><strong>Actualizado en tiempo real</strong></footer>
  </main>
}
