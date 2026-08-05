import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  RiArrowDownSLine, RiArrowRightLine,
  RiCalendar2Line, RiCheckboxCircleLine, RiCheckLine, RiCloseLine, RiEditLine,
  RiExternalLinkLine, RiGroupLine, RiFileCopyLine,
  RiPauseCircleLine, RiPlayCircleLine, RiSendPlaneLine,
  RiShareForwardLine, RiSparkling2Line, RiUserLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { outcomeLabel } from '../lib/callOutcome'
import { formatLocaleNumber, getLocale, localeCode, useI18n } from '../i18n'
import '../components/campaigns.css'

const TYPE_META = {
  outbound: { label: 'Llamadas' },
  ads: { label: 'Publicidad' },
}

function campaignType(campaign) {
  const channels = Array.isArray(campaign.settings?.captureChannels) ? campaign.settings.captureChannels : []
  return campaign.adPlaybookId || campaign.metaCampaignId || campaign.adStatus || campaign.adAssets || channels.includes('paid_ads') ? 'ads' : 'outbound'
}

const STATUS_META = {
  active: { label: 'Activa', color: 'var(--success)' },
  paused: { label: 'En pausa', color: 'var(--warn)' },
  draft: { label: 'Borrador', color: 'var(--muted)' },
  done: { label: 'Finalizada', color: 'var(--violet)' },
}

const TABS = ['Resumen', 'Anuncio', 'Economía', 'Audiencia', 'Conversaciones', 'Contenido', 'Automatización', 'Configuración']

const DEFAULT_SETTINGS = { scoring: true, alerts: true, organic: false, frequency: true }

const ACTIVITY_META = {
  lead: { color: 'var(--violet)', Icon: RiGroupLine },
  call: { color: 'var(--cyan)', Icon: RiSendPlaneLine },
  meeting: { color: 'var(--pink)', Icon: RiCalendar2Line },
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.draft
  return <span className="campaign-status" style={{ '--status-color': meta.color }}><i />{meta.label}</span>
}

function Overview({ campaign }) {
  const totalLeads = campaign.totalLeads || 0
  const contacted = campaign.contacted || 0
  const meetingsScheduled = campaign.meetingsScheduled || 0
  const conversionRate = totalLeads > 0 ? Math.round((meetingsScheduled / totalLeads) * 1000) / 10 : 0
  const steps = [
    { label: 'Leads', value: totalLeads, width: '100%', color: 'var(--violet-deep)' },
    { label: 'Contactados', value: contacted, width: `${totalLeads > 0 ? Math.min(100, Math.round((contacted / totalLeads) * 100)) : 0}%`, color: 'var(--cyan)' },
    { label: 'Reuniones agendadas', value: meetingsScheduled, width: `${totalLeads > 0 ? Math.min(100, Math.round((meetingsScheduled / totalLeads) * 100)) : 0}%`, color: 'var(--pink)' },
  ]
  return <>
    <div className="campaign-summary-grid">
      <section className="campaign-detail-card campaign-funnel-large">
        <div className="campaign-detail-card-header"><div><h2>Embudo de conversión</h2><p>Cómo avanzan los leads de esta campaña.</p></div></div>
        <div className="campaign-funnel">
          <div className="campaign-funnel-shape">{steps.map(step => <div key={step.label} style={{ width: step.width, background: step.color }} />)}</div>
          <div className="campaign-funnel-list">{steps.map(step => <div key={step.label}><span><i style={{ background: step.color }} />{step.label}</span><strong>{step.value.toLocaleString(localeCode(getLocale()))}</strong></div>)}</div>
          <div className="campaign-funnel-total"><span>Tasa de conversión (reuniones / leads)</span><strong>{conversionRate}%</strong></div>
        </div>
      </section>
      <section className="campaign-detail-card campaign-chart-card">
        <div className="campaign-detail-card-header"><div><h2>Resultados</h2><p>Números acumulados de la campaña.</p></div></div>
        <div className="campaign-chart-kpis">
          <div><span>Leads</span><strong>{totalLeads.toLocaleString(localeCode(getLocale()))}</strong></div>
          <div><span>Contactados</span><strong>{contacted.toLocaleString(localeCode(getLocale()))}</strong></div>
          <div><span>Reuniones</span><strong>{meetingsScheduled.toLocaleString(localeCode(getLocale()))}</strong></div>
          <div><span>Conversión</span><strong>{conversionRate}%</strong></div>
        </div>
      </section>
    </div>
    <section className="campaign-detail-card campaign-action-composer"><div className="campaign-detail-card-header"><div><h2><RiSparkling2Line /> Contenido de campaña</h2><p>La asociación de contenido y esta campaña aún no está disponible.</p></div></div><div className="campaign-composer-empty"><span>Cuando se conecte esta fuente, aquí se mostrarán únicamente las piezas reales de la campaña.</span></div></section>
  </>
}

function CampaignAdsPanel({ campaign }) {
  const [status, setStatus] = useState(null)
  const [insights, setInsights] = useState([])
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [statusResponse, insightsResponse] = await Promise.all([
        apiFetch(`/api/ads/campaigns/${campaign.id}/status`),
        apiFetch(`/api/ads/campaigns/${campaign.id}/insights`),
      ])
      if (!statusResponse.ok || !insightsResponse.ok) throw new Error('ads-detail-failed')
      const [statusData, insightsData] = await Promise.all([statusResponse.json(), insightsResponse.json()])
      setStatus(statusData)
      setInsights(Array.isArray(insightsData) ? insightsData : [])
    } catch {
      setNotice('No se pudo cargar el estado de Meta.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [campaign.id])

  async function runAction(nextAction) {
    setAction(nextAction)
    try {
      const response = await apiFetch(`/api/ads/campaigns/${campaign.id}/${nextAction}`, { method: 'POST' })
      if (!response.ok) throw new Error('ads-action-failed')
      setNotice(nextAction === 'publish' ? 'Borrador enviado a Meta.' : nextAction === 'pause' ? 'Campaña pausada en Meta.' : 'Campaña activada en Meta.')
      await load()
    } catch {
      setNotice('Meta no pudo completar la operación. Revisa la conexión y los permisos.')
    } finally {
      setAction('')
    }
  }

  if (loading) return <section className="campaign-detail-card"><div className="campaign-composer-empty"><span>Cargando estado de Meta…</span></div></section>

  const latest = insights[insights.length - 1]
  const adStatus = status?.adStatus || campaign.adStatus || 'draft'
  const hasRemoteObjects = Boolean(status?.metaCampaignId || campaign.metaCampaignId)
  const isActive = adStatus === 'active'
  const formatEuro = value => value == null ? '—' : `${(value / 100).toLocaleString(localeCode(getLocale()), { maximumFractionDigits: 2 })} €`

  return <section className="campaign-detail-card">
    <div className="campaign-detail-card-header"><div><h2>Gestión de Meta Ads</h2><p>Estado remoto, rendimiento y acciones de publicación.</p></div><span className="campaign-status"><i />{adStatus}</span></div>
    {notice && <div className="campaign-composer-empty" style={{ marginBottom: 14 }}><span>{notice}</span></div>}
    <div className="campaign-chart-kpis">
      <div><span>Gasto</span><strong>{formatEuro(latest?.spendCents ?? 0)}</strong></div>
      <div><span>Leads</span><strong>{latest?.leadsCount ?? campaign.totalLeads ?? 0}</strong></div>
      <div><span>CPL</span><strong>{formatEuro(latest?.costPerLeadCents)}</strong></div>
      <div><span>Impresiones</span><strong>{latest?.impressions ?? 0}</strong></div>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
      {!hasRemoteObjects ? <button className="campaign-button primary" onClick={() => runAction('publish')} disabled={Boolean(action)}>{action === 'publish' ? 'Enviando…' : 'Publicar borrador'}</button> : isActive ? <button className="campaign-button ghost" onClick={() => runAction('pause')} disabled={Boolean(action)}>{action === 'pause' ? 'Pausando…' : 'Pausar en Meta'}</button> : <button className="campaign-button primary" onClick={() => runAction('activate')} disabled={Boolean(action)}>{action === 'activate' ? 'Activando…' : 'Activar en Meta'}</button>}
      <button className="campaign-button ghost" onClick={load} disabled={Boolean(action)}><RiExternalLinkLine /> Actualizar datos</button>
    </div>
    <div className="campaign-composer-empty" style={{ marginTop: 18 }}><span>Meta Campaign: {status?.metaCampaignId || campaign.metaCampaignId || 'pendiente'} · Ad set: {status?.metaAdSetId || campaign.metaAdSetId || 'pendiente'} · Anuncio: {status?.metaAdId || campaign.metaAdId || 'pendiente'}</span></div>
  </section>
}

function useCampaignList(url) {
  const [items, setItems] = useState(null)
  useEffect(() => {
    let cancelled = false
    apiFetch(url).then(r => r.ok ? r.json() : null).then(body => {
      if (!cancelled) setItems(Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [])
    }).catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [url])
  return items
}

const AUDIT_LABEL = {
  'ads.decision.approved': 'Recomendación aprobada',
  'ads.decision.rejected': 'Recomendación rechazada',
  'ads.action.executed': 'Acción ejecutada en Meta',
  'ads.action.failed': 'Acción fallida',
  'ads.action.compensated': 'Acción deshecha',
  'ads.policy.updated': 'Política de autonomía cambiada',
  'ads.autonomy.stopped': 'Autonomía parada',
  'ads.autonomy.resumed': 'Autonomía reanudada',
  'ads.rule.promoted': 'Regla promocionada',
  'ads.rule.degraded': 'Regla degradada a N1',
}

const COHORT_TEXT = { mature: 'cohorte madura', maturing: 'cohorte madurando', insufficient: 'sin cohorte suficiente' }
const SIGNAL_TEXT = { clic: 'Clic', lead: 'Lead', qualified_lead: 'Lead cualificado', opportunity: 'Oportunidad', sale: 'Venta' }

function money(cents) {
  return cents == null ? 'Sin medición' : `${(cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function EconomyTab({ campaignId }) {
  const [data, setData] = useState(undefined)
  const [decisions, setDecisions] = useState([])
  const [audit, setAudit] = useState([])

  useEffect(() => {
    let active = true
    apiFetch(`/api/ads/campaigns/${campaignId}/attribution`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (active) setData(d) })
      .catch(() => { if (active) setData(null) })
    apiFetch(`/api/ads/campaigns/${campaignId}/decisions`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (active) setDecisions(Array.isArray(d) ? d : []) })
      .catch(() => { if (active) setDecisions([]) })
    apiFetch('/api/ads/audit?limit=25')
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (active) setAudit(Array.isArray(d) ? d : []) })
      .catch(() => { if (active) setAudit([]) })
    return () => { active = false }
  }, [campaignId])

  if (data === undefined) return <section className="campaign-detail-card"><div className="campaign-composer-empty"><span>Cargando embudo económico…</span></div></section>
  if (data === null) return <section className="campaign-detail-card"><div className="campaign-composer-empty"><span>Esta campaña no tiene datos de Ads todavía.</span></div></section>

  const t = data.targets
  return <>
    <section className="campaign-detail-card">
      <div className="campaign-detail-card-header">
        <div><h2>Embudo económico</h2><p>Del clic al comprador, en los últimos {data.periodDays} días.</p></div>
        <span className="campaign-status"><i />{SIGNAL_TEXT[data.deepestEligibleSignal] ?? '—'}</span>
      </div>
      <div className="campaign-tasks">
        {data.funnel.map(step => (
          <div className="campaign-task" key={step.key}>
            <div><span>{step.label}</span><small>{step.conversionPct == null ? 'sin tasa medida' : `${step.conversionPct} % desde el paso anterior`}</small></div>
            <time>{step.value == null ? 'Sin medición' : step.value.toLocaleString('es-ES')}</time>
          </div>
        ))}
      </div>
      <div className="campaign-tasks" style={{ marginTop: 10 }}>
        <div className="campaign-task"><div><span>Coste por lead</span><small>{COHORT_TEXT[data.cohortStatus]}</small></div><time>{money(data.cplCents)}</time></div>
        <div className="campaign-task"><div><span>Coste por cualificado</span><small>{t?.maxCpqlCents ? `objetivo ≤ ${money(t.maxCpqlCents)}` : 'sin objetivo declarado'}</small></div><time>{money(data.cpqlCents)}</time></div>
        <div className="campaign-task"><div><span>Coste por comprador</span><small>{t?.maxCacCents ? `objetivo ≤ ${money(t.maxCacCents)}` : 'sin objetivo declarado'}</small></div><time>{money(data.cacCents)}</time></div>
        <div className="campaign-task"><div><span>ROAS real</span><small>{data.saleLatencyDays == null ? 'sin ventas cerradas' : `cierre medio en ${data.saleLatencyDays} días`}</small></div><time>{data.roas ?? 'Sin medición'}</time></div>
      </div>
      {t?.explanation && <p className="campaign-detail-empty-note" style={{ marginTop: 10 }}>{t.explanation}</p>}
    </section>

    {data.breakdown?.ads?.length > 0 && (
      <section className="campaign-detail-card">
        <div className="campaign-detail-card-header">
          <div><h2>Por anuncio</h2><p>Qué anuncio concreto trae los cualificados, no solo la campaña.</p></div>
        </div>
        <div className="campaign-tasks">
          {data.breakdown.ads.map(ad => (
            <div className="campaign-task" key={ad.metaAdId}>
              <div>
                <span>Anuncio {ad.metaAdId}</span>
                <small>{ad.leads} leads · {ad.qualified} cualificados{ad.qualificationPct != null ? ` · ${ad.qualificationPct} %` : ''}{ad.sales ? ` · ${ad.sales} venta(s)` : ''}</small>
              </div>
              <time>{ad.qualified}</time>
            </div>
          ))}
          {/* Los leads anteriores a que se guardara el identificador de anuncio
              no lo tendrán nunca. Se muestran aparte en vez de repartirlos. */}
          {data.breakdown.unattributed && (
            <div className="campaign-task">
              <div>
                <span style={{ color: 'var(--dim)' }}>Sin anuncio identificado</span>
                <small>{data.breakdown.unattributed.leads} leads llegaron antes de que se guardara el anuncio de origen; su gasto no se puede bajar a este nivel.</small>
              </div>
              <time>{data.breakdown.unattributed.qualified}</time>
            </div>
          )}
        </div>
      </section>
    )}

    <section className="campaign-detail-card">
      <div className="campaign-detail-card-header"><div><h2>Qué ha observado Xarly</h2><p>Historial completo, incluidas las decisiones ya resueltas.</p></div></div>
      {decisions.length === 0
        ? <div className="campaign-composer-empty"><span>Xarly no ha registrado ninguna observación sobre esta campaña.</span></div>
        : <div className="campaign-timeline campaign-decision-log">
            {decisions.map(d => (
              <div className="campaign-timeline-item" key={d.id} style={{ '--timeline-color': d.severity === 'critical' ? 'var(--danger-soft)' : d.severity === 'warning' ? 'var(--warn-soft)' : 'var(--info)' }}>
                <span className="campaign-timeline-dot" />
                <div>
                  <small>{new Date(d.createdAt).toLocaleString(localeCode(getLocale()))} · confianza {d.confidence} · {COHORT_TEXT[d.cohortStatus] ?? d.cohortStatus}</small>
                  <strong>{d.title}</strong>
                  <p>{d.explanation}</p>
                  <p><b>Recomendación:</b> {d.recommendation}</p>
                  {/* El estado y quién lo decidió es lo que convierte esto en
                      auditoría y no en una lista de avisos. */}
                  <p style={{ color: 'var(--dim)' }}>
                    Estado: {d.status}
                    {d.actor ? ` · decidido por ${d.actor.name || d.actor.email}` : ''}
                    {d.decisionNote ? ` · “${d.decisionNote}”` : ''}
                    {d.actions?.length ? ` · ${d.actions.length} acción(es): ${d.actions.map(a => `${a.kind} (${a.status})`).join(', ')}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>}
    </section>

    {audit.length > 0 && (
      <section className="campaign-detail-card">
        <div className="campaign-detail-card-header">
          <div><h2>Registro de auditoría</h2><p>Quién decidió qué y cuándo, en toda la operación de Ads.</p></div>
        </div>
        <div className="campaign-tasks">
          {audit.map(entry => (
            <div className="campaign-task" key={entry.id}>
              <div>
                <span>{AUDIT_LABEL[entry.action] ?? entry.action}</span>
                <small>
                  {entry.actorType === 'system'
                    ? 'decidido por el sistema'
                    : entry.actor ? `por ${entry.actor.name || entry.actor.email}` : 'sin actor registrado'}
                  {` · ${entry.entityType}`}
                </small>
              </div>
              <time>{new Date(entry.createdAt).toLocaleString(localeCode(getLocale()))}</time>
            </div>
          ))}
        </div>
      </section>
    )}
  </>
}

function AudienceTab({ campaignId, onNavigate }) {
  const leads = useCampaignList(`/api/leads?campaignId=${campaignId}&limit=50`)
  return <section className="campaign-detail-card"><div className="campaign-detail-card-header"><div><h2>Audiencia de la campaña</h2><p>Leads reales asociados a esta campaña.</p></div></div>
    {leads === null ? <div className="campaign-composer-empty"><span>Cargando leads…</span></div>
      : leads.length === 0 ? <div className="campaign-composer-empty"><span>Esta campaña todavía no tiene leads asociados.</span></div>
      : <div className="campaign-tasks">{leads.map(lead => <div className="campaign-task" key={lead.id} role="button" tabIndex="0" style={{ cursor: 'pointer' }} onClick={() => onNavigate(`/leads/${lead.id}`)} onKeyDown={e => e.key === 'Enter' && onNavigate(`/leads/${lead.id}`)}><div><span>{lead.name || 'Sin nombre'}</span><small>{[lead.company, lead.status].filter(Boolean).join(' · ') || 'Sin datos'}</small></div><time>{lead.score != null ? `Score ${lead.score}` : ''}</time></div>)}</div>}
  </section>
}

function ConversationsTab({ campaignId, onNavigate }) {
  const calls = useCampaignList(`/api/calls?campaignId=${campaignId}&limit=50`)
  return <section className="campaign-detail-card"><div className="campaign-detail-card-header"><div><h2>Conversaciones de la campaña</h2><p>Llamadas reales registradas para esta campaña.</p></div></div>
    {calls === null ? <div className="campaign-composer-empty"><span>Cargando llamadas…</span></div>
      : calls.length === 0 ? <div className="campaign-composer-empty"><span>Esta campaña todavía no tiene llamadas registradas.</span></div>
      : <div className="campaign-tasks">{calls.map(call => <div className="campaign-task" key={call.id} role="button" tabIndex="0" style={{ cursor: 'pointer' }} onClick={() => onNavigate(`/llamadas/${call.id}`)} onKeyDown={e => e.key === 'Enter' && onNavigate(`/llamadas/${call.id}`)}><div><span>{call.lead?.name || 'Sin contacto'}</span><small>{[call.agent?.name, outcomeLabel(call.outcome)].filter(Boolean).join(' · ')}</small></div><time>{call.startedAt ? new Date(call.startedAt).toLocaleString(localeCode(getLocale()), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</time></div>)}</div>}
  </section>
}

function ContentTab({ campaign }) {
  const rows = [
    ['Objetivo', campaign.objective || 'Sin definir'],
    ['Meta principal', campaign.goal || 'Sin definir'],
    ['Landing pública', campaign.landingSlug ? `${window.location.origin}/l/${campaign.landingSlug}` : 'Sin landing publicada'],
    ['Enlace compartible', campaign.shareToken ? `${window.location.origin}/campanas/compartir/${campaign.shareToken}` : 'Sin enlace generado'],
    ['Creatividades de anuncio', campaign.adAssets ? 'Configuradas (ver pestaña Anuncio)' : 'Sin creatividades'],
  ]
  return <section className="campaign-detail-card"><div className="campaign-detail-card-header"><div><h2>Contenido de la campaña</h2><p>Piezas y destinos registrados en la campaña.</p></div></div><div className="campaign-tasks">{rows.map(([label, value]) => <div className="campaign-task" key={label}><div><span>{label}</span><small style={{ wordBreak: 'break-all' }}>{value}</small></div>{typeof value === 'string' && value.startsWith('http') && <button className="campaign-button ghost compact" onClick={() => window.open(value, '_blank', 'noopener')}><RiExternalLinkLine /> Abrir</button>}</div>)}</div></section>
}

function AutomationTab({ onNavigate }) {
  const automations = useCampaignList('/api/automations')
  return <section className="campaign-detail-card"><div className="campaign-detail-card-header"><div><h2>Automatizaciones</h2><p>Automatizaciones de tu organización (aplican a todas las campañas).</p></div><button className="campaign-button ghost compact" onClick={() => onNavigate('/automatizaciones')}><RiExternalLinkLine /> Gestionar</button></div>
    {automations === null ? <div className="campaign-composer-empty"><span>Cargando automatizaciones…</span></div>
      : automations.length === 0 ? <div className="campaign-composer-empty"><span>Todavía no hay automatizaciones configuradas.</span></div>
      : <div className="campaign-tasks">{automations.map(auto => <div className="campaign-task" key={auto.id} role="button" tabIndex="0" style={{ cursor: 'pointer' }} onClick={() => onNavigate(`/automatizaciones/${auto.id}`)} onKeyDown={e => e.key === 'Enter' && onNavigate(`/automatizaciones/${auto.id}`)}><div><span>{auto.name}</span><small>{auto.isActive ? 'Activa' : 'Pausada'} · {auto.runsCount ?? 0} ejecuciones</small></div></div>)}</div>}
  </section>
}

function SettingsTab({ settings, onToggle, onSave, saving }) {
  const items = [
    ['scoring', 'Lead scoring automático', 'Actualiza la prioridad con cada interacción.'],
    ['alerts', 'Alertas de rendimiento', 'Avisa cuando una métrica se desvía del objetivo.'],
    ['organic', 'Publicar contenido orgánico', 'Reutiliza las piezas aprobadas en redes sociales.'],
    ['frequency', 'Control de frecuencia', 'Evita sobreimpactar a un mismo contacto.'],
  ]
  return <section className="campaign-detail-card"><div className="campaign-detail-card-header"><div><h2>Configuración de campaña</h2><p>Controla los límites, alertas y reglas de operación.</p></div><button className="campaign-button primary compact" onClick={onSave} disabled={saving}><RiCheckLine /> {saving ? 'Guardando…' : 'Guardar cambios'}</button></div><div className="campaign-settings">{items.map(([id, title, detail]) => <div className="campaign-setting" key={id}><div><strong>{title}</strong><small>{detail}</small></div><button className={`campaign-toggle${settings[id] ? ' on' : ''}`} aria-label={`Cambiar ${title}`} onClick={() => onToggle(id)} /></div>)}</div></section>
}

function EditModal({ campaign, onClose, onSave, saving }) {
  const [name, setName] = useState(campaign.name || '')
  const [objective, setObjective] = useState(campaign.objective || '')
  const [goal, setGoal] = useState(campaign.goal || '')
  const [budget, setBudget] = useState(campaign.budgetCents != null ? String(campaign.budgetCents / 100) : '')

  function submit(event) {
    event.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      objective: objective.trim(),
      goal: goal.trim(),
      budgetCents: budget ? Math.round(Number(budget) * 100) : null,
    })
  }

  return <div className="campaign-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><form className="campaign-create-modal" onSubmit={submit}><div className="campaign-modal-head"><div><span>Editar workspace</span><h2>Información de campaña</h2><p>Ajusta el contexto que verá el equipo en todas las vistas.</p></div><button type="button" className="campaign-icon-button" onClick={onClose}><RiCloseLine /></button></div><div className="campaign-form-grid"><label>Nombre de campaña<input autoFocus value={name} onChange={event => setName(event.target.value)} /></label><label>Objetivo<textarea value={objective} onChange={event => setObjective(event.target.value)} rows="4" /></label><label>Objetivo principal (goal)<input value={goal} onChange={event => setGoal(event.target.value)} placeholder="Ej. 120 registros activados" /></label><label>Presupuesto (€)<input type="number" min="0" value={budget} onChange={event => setBudget(event.target.value)} /></label></div><div className="campaign-modal-actions"><button type="button" className="campaign-button ghost" onClick={onClose}>Cancelar</button><button className="campaign-button primary" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'} <RiCheckLine /></button></div></form></div>
}

function ShareModal({ url, onClose, onCopy }) {
  return <div className="campaign-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="campaign-create-modal"><div className="campaign-modal-head"><div><span>Enlace público</span><h2>Compartir campaña</h2><p>Cualquiera con este enlace puede ver el estado general de la campaña.</p></div><button type="button" className="campaign-icon-button" onClick={onClose}><RiCloseLine /></button></div><div className="campaign-form-grid"><label>URL<input readOnly value={url} onFocus={event => event.target.select()} /></label></div><div className="campaign-modal-actions"><button type="button" className="campaign-button ghost" onClick={onClose}>Cerrar</button><button className="campaign-button primary" type="button" onClick={onCopy}><RiFileCopyLine /> Copiar enlace</button></div></div></div>
}

export default function CampaignDetailPage() {
  const { locale } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [campaign, setCampaign] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState(searchParams.get('tab') ? TABS.find(item => item.toLowerCase() === searchParams.get('tab')) || 'Resumen' : 'Resumen')
  const [showEdit, setShowEdit] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [notice, setNotice] = useState('')
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [savingSettings, setSavingSettings] = useState(false)
  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState(false)
  const [shareUrl, setShareUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setNotFound(false)
      setLoadError(false)
      try {
        const response = await apiFetch(`/api/campaigns/${id}`)
        if (response.status === 404) {
          if (!cancelled) { setCampaign(null); setNotFound(true) }
          return
        }
        if (!response.ok) throw new Error('load failed')
        const data = await response.json()
        if (cancelled) return
        setCampaign(data)
        setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) })
      } catch {
        if (!cancelled) { setCampaign(null); setLoadError(true) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    let cancelled = false
    async function loadActivity() {
      setActivityLoading(true)
      setActivityError(false)
      try {
        const response = await apiFetch(`/api/campaigns/${id}/activity`)
        if (!response.ok) throw new Error('activity failed')
        const data = await response.json()
        if (!cancelled) setActivity(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) { setActivity([]); setActivityError(true) }
      } finally {
        if (!cancelled) setActivityLoading(false)
      }
    }
    loadActivity()
    return () => { cancelled = true }
  }, [id])

  const typeMeta = useMemo(() => TYPE_META[campaign ? campaignType(campaign) : 'outbound'] || TYPE_META.outbound, [campaign])

  function selectTab(nextTab) { setTab(nextTab); setSearchParams(nextTab === 'Resumen' ? {} : { tab: nextTab.toLowerCase() }) }
  function notify(message) { setNotice(message); window.setTimeout(() => setNotice(''), 2600) }
  async function toggleStatus() {
    const isActive = campaign.status === 'active'
    const action = isActive ? 'pause' : 'start'
    try {
      const response = await apiFetch(`/api/campaigns/${id}/${action}`, { method: 'POST' })
      if (!response.ok) throw new Error()
      setCampaign(previous => ({ ...previous, status: isActive ? 'paused' : 'active' }))
      notify(isActive ? 'Campaña pausada' : 'Campaña activada')
    } catch {
      notify('No se pudo actualizar el estado de la campaña')
    }
  }

  async function saveEdit(data) {
    setSavingEdit(true)
    try {
      const response = await apiFetch(`/api/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) })
      if (!response.ok) throw new Error()
      setCampaign(previous => ({ ...previous, ...data }))
      setShowEdit(false)
      notify('Cambios guardados correctamente')
    } catch {
      notify('No se pudieron guardar los cambios')
    } finally {
      setSavingEdit(false)
    }
  }

  function toggleSetting(key) {
    setSettings(previous => ({ ...previous, [key]: !previous[key] }))
  }

  async function saveSettings() {
    setSavingSettings(true)
    try {
      const response = await apiFetch(`/api/campaigns/${id}`, { method: 'PUT', body: JSON.stringify({ settings }) })
      if (!response.ok) throw new Error()
      setCampaign(previous => ({ ...previous, settings }))
      notify('Configuración guardada correctamente')
    } catch {
      notify('No se pudo guardar la configuración')
    } finally {
      setSavingSettings(false)
    }
  }

  async function duplicateCampaign() {
    setShowMore(false)
    try {
      const response = await apiFetch(`/api/campaigns/${id}/duplicate`, { method: 'POST' })
      if (!response.ok) throw new Error()
      const copy = await response.json()
      notify('Campaña duplicada como borrador')
      navigate(`/campanas/${copy.id}`)
    } catch {
      notify('No se pudo duplicar la campaña')
    }
  }

  async function shareCampaign() {
    setShowMore(false)
    try {
      const response = await apiFetch(`/api/campaigns/${id}/share-link`, { method: 'POST' })
      if (!response.ok) throw new Error()
      const data = await response.json()
      setShareUrl(data.url)
    } catch {
      notify('No se pudo generar el enlace')
    }
  }

  function copyShareUrl() {
    navigator.clipboard?.writeText(shareUrl).then(
      () => notify('Enlace copiado al portapapeles'),
      () => notify('No se pudo copiar el enlace'),
    )
  }

  function exportReport() {
    setShowMore(false)
    const lines = [
      `Informe de campaña: ${campaign.name}`,
      `Estado: ${STATUS_META[campaign.status]?.label || campaign.status}`,
      `Objetivo: ${campaign.objective || '—'}`,
      `Meta: ${campaign.goal || '—'}`,
      `Presupuesto: ${campaign.budgetCents != null ? `${(campaign.budgetCents / 100).toLocaleString(localeCode(getLocale()))} €` : '—'}`,
      `Leads totales: ${campaign.totalLeads || 0}`,
      `Contactados: ${campaign.contacted || 0}`,
      `Reuniones agendadas: ${campaign.meetingsScheduled || 0}`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `informe-${campaign.id}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
    notify('Informe descargado')
  }

  if (loading) return <div className="campaign-detail-loading">{locale === 'en' ? 'Loading campaign' : 'Cargando campaña'}<span /></div>
  if (notFound) return <div className="campaign-detail-loading"><strong>{locale === 'en' ? 'Campaign not found' : 'Campaña no encontrada'}</strong><button className="campaign-button ghost" onClick={() => navigate('/campanas')}>{locale === 'en' ? 'Back to campaigns' : 'Volver a campañas'}</button></div>
  if (loadError || !campaign) return <div className="campaign-detail-loading"><strong>{locale === 'en' ? 'The campaign could not be loaded' : 'No se pudo cargar la campaña'}</strong><p>{locale === 'en' ? 'Check the connection and try again.' : 'Comprueba la conexión e inténtalo de nuevo.'}</p><button className="campaign-button ghost" onClick={() => window.location.reload()}>{locale === 'en' ? 'Retry' : 'Reintentar'}</button></div>

  const totalLeads = campaign.totalLeads || 0
  const contacted = campaign.contacted || 0
  const meetingsScheduled = campaign.meetingsScheduled || 0
  const progressPct = totalLeads > 0 ? Math.min(100, Math.round((contacted / totalLeads) * 100)) : 0
  const conversionPct = totalLeads > 0 ? Math.min(100, Math.round((meetingsScheduled / totalLeads) * 100)) : 0
  const budgetLabel = campaign.budgetCents != null ? `${formatLocaleNumber(campaign.budgetCents / 100, locale)} €` : (locale === 'en' ? 'Not defined' : 'Sin definir')
  const datesLabel = campaign.startDate
    ? `${new Date(campaign.startDate).toLocaleDateString(localeCode(locale))}${campaign.endDate ? ` – ${new Date(campaign.endDate).toLocaleDateString(localeCode(locale))}` : ''}`
    : (locale === 'en' ? 'No dates defined' : 'Sin fechas definidas')

  const StatusIcon = campaign.status === 'active' ? RiPauseCircleLine : RiPlayCircleLine

  return <main className="dark-scroll campaign-detail-page">
    <div className="campaign-detail-breadcrumb"><button onClick={() => navigate('/campanas')}>Campañas</button><RiArrowRightLine /><strong>{campaign.name}</strong></div>
    <header className="campaign-detail-header"><div className="campaign-detail-title"><div><h1>{campaign.name} <StatusBadge status={campaign.status} /></h1><p>{campaign.objective || 'Sin objetivo definido'}</p><div className="campaign-detail-meta"><span><RiCalendar2Line />{datesLabel}</span><span><RiUserLine />{campaign.agent?.name || 'Sin agente asignado'}</span><span>{typeMeta.label}</span></div></div></div><div className="campaign-detail-actions"><button className={`campaign-button ${campaign.status === 'active' ? 'danger' : 'primary'}`} onClick={toggleStatus}><StatusIcon />{campaign.status === 'active' ? 'Pausar' : 'Activar'}</button><button className="campaign-button primary" onClick={() => setShowEdit(true)}><RiEditLine /> Editar</button><div className="campaign-more-wrap"><button className="campaign-button ghost" onClick={() => setShowMore(value => !value)}>Más <RiArrowDownSLine /></button>{showMore && <div className="campaign-more-menu"><button onClick={duplicateCampaign}><RiFileCopyLine /> Duplicar campaña</button><button onClick={exportReport}><RiExternalLinkLine /> Exportar informe</button><button onClick={shareCampaign}><RiShareForwardLine /> Compartir enlace</button></div>}</div></div></header>

    <section className="campaign-health-strip">
      <div className="campaign-health-item health"><div className="campaign-health-ring" style={{ background: `conic-gradient(var(--success) 0 ${conversionPct}%, var(--line) ${conversionPct}% 100%)` }}><strong>{conversionPct}%</strong></div><div><span>Tasa de conversión</span><strong>{meetingsScheduled} reuniones</strong><small>de {totalLeads} leads</small></div></div>
      <div className="campaign-health-item progress"><span>Progreso de contacto</span><strong>{progressPct}%</strong><div className="campaign-health-bar"><i style={{ width: `${progressPct}%` }} /></div><small>{contacted} de {totalLeads} leads contactados</small></div>
      <div className="campaign-health-item budget"><span>Presupuesto</span><strong>{budgetLabel}</strong></div>
      <div className="campaign-health-item goal"><span>Objetivo principal</span><strong>{campaign.goal || 'Sin definir'}</strong><small>{meetingsScheduled} reuniones agendadas</small></div>
      <div className="campaign-health-item roi"><span>Leads totales</span><strong>{totalLeads.toLocaleString(localeCode(getLocale()))}</strong></div>
    </section>

    <nav className="campaign-detail-tabs" role="tablist" aria-label="Secciones de campaña">{TABS.map(item => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => selectTab(item)}>{item}</button>)}</nav>
    <div className="campaign-detail-content">
      <div className="campaign-detail-main">
        {tab === 'Resumen' && <Overview campaign={campaign} />}
        {tab === 'Anuncio' && <CampaignAdsPanel campaign={campaign} />}
        {tab === 'Economía' && <EconomyTab campaignId={campaign.id} />}
        {tab === 'Audiencia' && <AudienceTab campaignId={campaign.id} onNavigate={navigate} />}
        {tab === 'Conversaciones' && <ConversationsTab campaignId={campaign.id} onNavigate={navigate} />}
        {tab === 'Contenido' && <ContentTab campaign={campaign} />}
        {tab === 'Automatización' && <AutomationTab onNavigate={navigate} />}
        {tab === 'Configuración' && <SettingsTab settings={settings} onToggle={toggleSetting} onSave={saveSettings} saving={savingSettings} />}
      </div>
      <aside className="campaign-detail-side">
        <section className="campaign-detail-card"><div className="campaign-detail-card-header"><div><h2>Datos disponibles</h2><p>Información registrada para esta campaña.</p></div></div><div className="campaign-tasks"><div className="campaign-task"><div><span>Leads registrados</span><small>Dato acumulado de la campaña</small></div><time>{totalLeads.toLocaleString(localeCode(getLocale()))}</time></div><div className="campaign-task"><div><span>Reuniones agendadas</span><small>Dato acumulado de la campaña</small></div><time>{meetingsScheduled.toLocaleString(localeCode(getLocale()))}</time></div></div></section>
        <section className="campaign-detail-card"><div className="campaign-detail-card-header"><div><h2>Actividad reciente</h2></div></div><div className="campaign-timeline">{activityLoading ? <span className="campaign-detail-empty-note">Cargando actividad…</span> : activityError ? <span className="campaign-detail-empty-note">No se pudo cargar la actividad registrada.</span> : activity.length ? activity.map((event, index) => { const meta = ACTIVITY_META[event.type] || ACTIVITY_META.lead; const Icon = meta.Icon; return <div className="campaign-timeline-item" key={`${event.type}-${index}`} style={{ '--timeline-color': meta.color }}><span className="campaign-timeline-dot" /><div><small>{new Date(event.at).toLocaleString(localeCode(getLocale()))}</small><strong>{event.title}</strong><p><Icon /> {event.type === 'lead' ? 'Lead de la campaña' : event.type === 'call' ? 'Llamada de la campaña' : 'Reunión agendada'}</p></div></div> }) : <span className="campaign-detail-empty-note">Sin actividad registrada todavía.</span>}</div></section>
      </aside>
    </div>
    {notice && <div className="campaign-toast" role="status"><RiCheckboxCircleLine />{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso"><RiCloseLine /></button></div>}
    {showEdit && <EditModal campaign={campaign} onClose={() => setShowEdit(false)} onSave={saveEdit} saving={savingEdit} />}
    {shareUrl && <ShareModal url={shareUrl} onClose={() => setShareUrl('')} onCopy={copyShareUrl} />}
  </main>
}
