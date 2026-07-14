import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RiAlertLine, RiArrowRightSLine, RiCheckLine, RiCloseLine, RiCursorLine, RiGroupLine,
  RiMailLine, RiMailOpenLine, RiPauseLine, RiRefreshLine, RiRocketLine, RiSendPlaneLine,
  RiSparkling2Line, RiTimeLine, RiUserAddLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { BACKEND_STATUS } from '../lib/leadMapping'
import emailHeroImage from '../assets/email-hero.png'
import '../dashboard.css'
import './email.css'

const SEGMENT_COLOR = { new: '#94a3b8', contacted: '#22d3ee', qualified: '#f59e0b', unqualified: '#fb7185', converted: '#34d399' }
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted']

// EM-105/EM-107: estado real de la campaña en el CRM — nunca optimista, se
// reconcilia contra Mautic al abrir el detalle (ver reconcileCampaignStatus).
const STATUS_META = {
  draft: { label: 'Borrador', color: '#94a3b8' },
  validating: { label: 'Validando', color: '#f59e0b' },
  ready: { label: 'Lista para publicar', color: '#38bdf8' },
  scheduled: { label: 'Programada', color: '#818cf8' },
  running: { label: 'Activa', color: '#34d399' },
  paused: { label: 'Pausada', color: '#fb923c' },
  completed: { label: 'Completada', color: '#22c55e' },
  error: { label: 'Error', color: '#f87171' },
}

const MISSING_FIELD_LABEL = {
  name: 'Nombre de la campaña',
  audienceDefinition: 'Audiencia (al menos un filtro)',
  templateBindingId: 'Plantilla de email',
  sender: 'Remitente',
}

function timeAgo(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.round(hours / 24)} d`
}

async function apiJson(path, options) {
  const res = await apiFetch(path, options)
  const payload = await res.json().catch(() => null)
  if (!res.ok) throw new Error(payload?.error || 'No se pudo completar la operación.')
  return payload
}

function Metric({ Icon, label, value, detail, color }) {
  return <article className="email-metric"><div className="email-metric-icon" style={{ color, background: `${color}18`, borderColor: `${color}38` }}><Icon /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>
}

function EmptyState({ icon: Icon = RiMailLine, title, copy, action }) {
  return <div className="email-empty"><div className="email-empty-icon"><Icon /></div><div><strong>{title}</strong><p>{copy}</p></div>{action && <button className="email-button secondary" onClick={action}><RiArrowRightSLine /> {action.label || 'Ver más'}</button>}</div>
}

function templateLabel(template) {
  return template?.name || template?.subject || template?.title || `Plantilla #${template?.id ?? '—'}`
}

function dateTimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function splitList(value) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function NewCampaignModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [objective, setObjective] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (!name.trim()) { setError('Ponle un nombre a la campaña.'); return }
    setSaving(true)
    setError('')
    try {
      await onCreate({ name: name.trim(), objective: objective.trim() || undefined })
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo crear la campaña. Probá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="email-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <form className="email-modal" onSubmit={submit}>
      <div className="email-modal-head"><div><span className="email-eyebrow">Nueva campaña</span><h2>Crear borrador de campaña</h2></div><button type="button" className="email-icon-button" onClick={onClose}><RiCloseLine /></button></div>
      <label className="email-field"><span>Nombre</span><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Bienvenida a leads nuevos" /></label>
      <label className="email-field"><span>Objetivo (opcional)</span><textarea value={objective} onChange={e => setObjective(e.target.value)} rows={3} placeholder="¿Qué objetivo tiene esta campaña?" /></label>
      <p className="email-modal-hint">Después de crear el borrador podrás configurar audiencia, plantilla, remitente y calendario.</p>
      {error && <p className="email-modal-error">{error}</p>}
      <div className="email-modal-actions"><button type="button" className="email-button ghost" onClick={onClose}>Cancelar</button><button className="email-button primary" type="submit" disabled={saving}>{saving ? 'Creando…' : 'Crear borrador'}</button></div>
    </form>
  </div>
}

// EM-104/EM-105/EM-106/EM-107: formulario único (sin wizard multi-paso) con
// las secciones en orden — objetivo, audiencia, plantilla, remitente,
// calendario — y las acciones de validar/publicar/pausar sobre el mismo
// borrador. El estado que se muestra es el confirmado por reconciliación,
// no el optimista de lo último que se guardó.
function CampaignEditorModal({ campaignId, onClose, onChanged }) {
  const [campaign, setCampaign] = useState(null)
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState([])
  const [form, setForm] = useState({
    objective: '', status: [], source: '', tags: '', templateBindingId: '',
    sender: '', replyTo: '', timezone: 'Europe/Madrid', scheduledStartAt: '', scheduledEndAt: '',
  })
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [validation, setValidation] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')

  function syncFormFromCampaign(data) {
    const audience = data.audienceDefinition || {}
    setForm({
      objective: data.objective || '',
      status: Array.isArray(audience.status) ? audience.status : [],
      source: Array.isArray(audience.source) ? audience.source.join(', ') : '',
      tags: Array.isArray(audience.tags) ? audience.tags.join(', ') : '',
      templateBindingId: data.templateBindingId || '',
      sender: data.sender || '',
      replyTo: data.replyTo || '',
      timezone: data.timezone || 'Europe/Madrid',
      scheduledStartAt: dateTimeLocal(data.scheduledStartAt),
      scheduledEndAt: dateTimeLocal(data.scheduledEndAt),
    })
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [reconciled, templateList] = await Promise.all([
          apiJson(`/api/marketing-campaigns/${campaignId}/reconcile`),
          apiFetch('/api/mautic/templates').then(res => res.ok ? res.json() : []).catch(() => []),
        ])
        if (cancelled) return
        setCampaign(reconciled)
        syncFormFromCampaign(reconciled)
        setTemplates(templateList || [])
      } catch (err) {
        if (!cancelled) setError(err.message || 'No se pudo cargar la campaña.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [campaignId])

  function buildAudienceDefinition() {
    const def = {}
    if (form.status.length) def.status = form.status
    const source = splitList(form.source)
    if (source.length) def.source = source
    const tags = splitList(form.tags)
    if (tags.length) def.tags = tags
    return def
  }

  function toggleStatus(value) {
    setForm(prev => ({ ...prev, status: prev.status.includes(value) ? prev.status.filter(s => s !== value) : [...prev.status, value] }))
  }

  async function handlePreview() {
    setPreviewLoading(true)
    setError('')
    try {
      const result = await apiJson(`/api/marketing-campaigns/${campaignId}/audience-preview`, {
        method: 'POST',
        body: JSON.stringify({ audienceDefinition: buildAudienceDefinition() }),
      })
      setPreview(result)
    } catch (err) {
      setError(err.message || 'No se pudo calcular la audiencia.')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const updated = await apiJson(`/api/marketing-campaigns/${campaignId}`, {
        method: 'PUT',
        body: JSON.stringify({
          objective: form.objective.trim() || undefined,
          audienceDefinition: buildAudienceDefinition(),
          templateBindingId: form.templateBindingId || undefined,
          sender: form.sender.trim() || undefined,
          replyTo: form.replyTo.trim() || undefined,
          timezone: form.timezone.trim() || undefined,
          scheduledStartAt: form.scheduledStartAt || null,
          scheduledEndAt: form.scheduledEndAt || null,
        }),
      })
      setCampaign(updated)
      syncFormFromCampaign(updated)
      setValidation(null)
      onChanged?.()
    } catch (err) {
      setError(err.message || 'No se pudo guardar la campaña.')
    } finally {
      setSaving(false)
    }
  }

  async function handleValidate() {
    setBusyAction('validate')
    setError('')
    try {
      await handleSave()
      const result = await apiJson(`/api/marketing-campaigns/${campaignId}/validate`, { method: 'POST' })
      setValidation(result)
      const refreshed = await apiJson(`/api/marketing-campaigns/${campaignId}`)
      setCampaign(refreshed)
      onChanged?.()
    } catch (err) {
      setError(err.message || 'No se pudo validar la campaña.')
    } finally {
      setBusyAction('')
    }
  }

  async function handlePublish() {
    setBusyAction('publish')
    setError('')
    try {
      const updated = await apiJson(`/api/marketing-campaigns/${campaignId}/publish`, { method: 'POST' })
      setCampaign(updated)
      onChanged?.()
    } catch (err) {
      setError(err.message || 'No se pudo publicar la campaña.')
    } finally {
      setBusyAction('')
    }
  }

  async function handlePause() {
    setBusyAction('pause')
    setError('')
    try {
      const updated = await apiJson(`/api/marketing-campaigns/${campaignId}/pause`, { method: 'POST' })
      setCampaign(updated)
      onChanged?.()
    } catch (err) {
      setError(err.message || 'No se pudo pausar la campaña.')
    } finally {
      setBusyAction('')
    }
  }

  const meta = campaign ? (STATUS_META[campaign.status] || { label: campaign.status, color: '#94a3b8' }) : null

  return <div className="email-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div className="email-modal email-tools-modal" role="dialog" aria-modal="true" aria-labelledby="email-editor-title">
      <div className="email-modal-head">
        <div><span className="email-eyebrow">Campaña de email</span><h2 id="email-editor-title">{campaign?.name || 'Cargando…'}</h2></div>
        <button type="button" className="email-icon-button" onClick={onClose} aria-label="Cerrar"><RiCloseLine /></button>
      </div>

      {loading ? <p className="email-campaigns-loading">Cargando configuración de la campaña…</p> : <>
        {meta && <span className="email-campaign-status" style={{ background: `${meta.color}22`, color: meta.color, borderColor: `${meta.color}55` }}>{meta.label}</span>}

        <div className="email-tools-section" style={{ marginTop: 14 }}>
          <div><span className="email-eyebrow">1. Objetivo</span></div>
          <label className="email-field"><span>Objetivo de la campaña</span><textarea rows={2} value={form.objective} onChange={e => setForm(prev => ({ ...prev, objective: e.target.value }))} placeholder="¿Qué queremos lograr con esta campaña?" /></label>
        </div>

        <div className="email-tools-section">
          <div><span className="email-eyebrow">2. Audiencia (EM-106)</span><p>Filtros básicos sobre tus leads con email.</p></div>
          <div className="email-field"><span>Estado del lead</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {LEAD_STATUSES.map(status => <label key={status} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={form.status.includes(status)} onChange={() => toggleStatus(status)} />
                {BACKEND_STATUS[status] ?? status}
              </label>)}
            </div>
          </div>
          <label className="email-field"><span>Fuente (separadas por coma)</span><input value={form.source} onChange={e => setForm(prev => ({ ...prev, source: e.target.value }))} placeholder="landing, referido, meta-ads" /></label>
          <label className="email-field"><span>Tags (separadas por coma)</span><input value={form.tags} onChange={e => setForm(prev => ({ ...prev, tags: e.target.value }))} placeholder="vip, newsletter" /></label>
          <button type="button" className="email-button secondary" onClick={handlePreview} disabled={previewLoading}><RiGroupLine /> {previewLoading ? 'Calculando…' : 'Previsualizar audiencia'}</button>
          {preview && <div className="email-tools-status"><RiCheckLine /><span>{preview.count} lead{preview.count === 1 ? '' : 's'} con email coinciden con este filtro{preview.sample?.length ? ` — ej: ${preview.sample.slice(0, 3).map(l => l.name).join(', ')}` : ''}.</span></div>}
        </div>

        <div className="email-tools-section">
          <div><span className="email-eyebrow">3. Plantilla (EM-104)</span><p>Solo se listan plantillas de Mautic ya autorizadas para tu organización.</p></div>
          {!templates.length ? <EmptyState icon={RiMailOpenLine} title="No hay plantillas disponibles" copy="Creá una plantilla en Mautic para poder seleccionarla aquí." /> : <label className="email-field"><span>Plantilla</span><select value={form.templateBindingId} onChange={e => setForm(prev => ({ ...prev, templateBindingId: e.target.value }))}><option value="">Selecciona una plantilla…</option>{templates.map(template => <option key={template.id} value={String(template.id)}>{templateLabel(template)}</option>)}</select></label>}
        </div>

        <div className="email-tools-section">
          <div><span className="email-eyebrow">4. Remitente</span></div>
          <label className="email-field"><span>Remitente</span><input value={form.sender} onChange={e => setForm(prev => ({ ...prev, sender: e.target.value }))} placeholder="Equipo VozIA <hola@tuempresa.com>" /></label>
          <label className="email-field"><span>Responder a (opcional)</span><input value={form.replyTo} onChange={e => setForm(prev => ({ ...prev, replyTo: e.target.value }))} placeholder="soporte@tuempresa.com" /></label>
        </div>

        <div className="email-tools-section">
          <div><span className="email-eyebrow">5. Calendario</span></div>
          <label className="email-field"><span>Zona horaria</span><input value={form.timezone} onChange={e => setForm(prev => ({ ...prev, timezone: e.target.value }))} placeholder="Europe/Madrid" /></label>
          <label className="email-field"><span>Inicio programado (opcional)</span><input type="datetime-local" value={form.scheduledStartAt} onChange={e => setForm(prev => ({ ...prev, scheduledStartAt: e.target.value }))} /></label>
          <label className="email-field"><span>Fin programado (opcional)</span><input type="datetime-local" value={form.scheduledEndAt} onChange={e => setForm(prev => ({ ...prev, scheduledEndAt: e.target.value }))} /></label>
        </div>

        {validation && <div className={`email-tools-status ${validation.valid ? '' : 'is-warning'}`}>
          {validation.valid ? <RiCheckLine /> : <RiAlertLine />}
          <span>{validation.valid ? 'La campaña está completa y lista para publicarse.' : `Falta completar: ${validation.missing.map(field => MISSING_FIELD_LABEL[field] || field).join(', ')}.`}</span>
        </div>}

        {error && <p className="email-modal-error">{error}</p>}

        <div className="email-modal-actions" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="email-button ghost" onClick={onClose}>Cerrar</button>
          <button type="button" className="email-button secondary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
          <button type="button" className="email-button secondary" onClick={handleValidate} disabled={busyAction === 'validate'}><RiCheckLine /> {busyAction === 'validate' ? 'Validando…' : 'Validar'}</button>
          {campaign?.status === 'ready' && <button type="button" className="email-button primary" onClick={handlePublish} disabled={busyAction === 'publish'}><RiRocketLine /> {busyAction === 'publish' ? 'Publicando…' : 'Publicar'}</button>}
          {(campaign?.status === 'running' || campaign?.status === 'scheduled') && <button type="button" className="email-button primary" onClick={handlePause} disabled={busyAction === 'pause'}><RiPauseLine /> {busyAction === 'pause' ? 'Pausando…' : 'Pausar'}</button>}
        </div>
      </>}
    </div>
  </div>
}

export default function EmailMarketingPage() {
  const [loading, setLoading] = useState(true)
  const [gated, setGated] = useState(false)
  const [overview, setOverview] = useState(null)
  const [activityFilter, setActivityFilter] = useState('all')
  const [notice, setNotice] = useState('')
  const [campaigns, setCampaigns] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [editingCampaignId, setEditingCampaignId] = useState(null)

  async function loadOverview() {
    setLoading(true)
    try {
      const res = await apiFetch('/api/mautic')
      if (res.status === 403) { setGated(true); return }
      if (!res.ok) throw new Error()
      setOverview(await res.json())
    } catch { setOverview(null) } finally { setLoading(false) }
  }

  async function loadCampaigns() {
    setCampaignsLoading(true)
    try {
      const res = await apiFetch('/api/marketing-campaigns')
      if (res.status === 403) return
      if (!res.ok) throw new Error()
      setCampaigns(await res.json())
    } catch { setCampaigns([]) } finally { setCampaignsLoading(false) }
  }

  useEffect(() => { loadOverview(); loadCampaigns() }, [])

  function showNotice(message) { setNotice(message); window.setTimeout(() => setNotice(''), 3200) }

  async function handleCreateDraft({ name, objective }) {
    const campaign = await apiJson('/api/marketing-campaigns', { method: 'POST', body: JSON.stringify({ name, objective }) })
    showNotice('Borrador de campaña creado.')
    await loadCampaigns()
    setEditingCampaignId(campaign.id)
  }

  if (loading) return <div className="email-page email-loading"><div className="email-loader"><RiMailLine /><span>Cargando tu centro de email…</span></div></div>
  if (gated) return <div className="email-page email-gated"><div className="email-gated-card"><RiAlertLine /><h1>Email marketing</h1><p>Email marketing es una función del Plan Completo. Habla con tu administrador para activarla.</p></div></div>

  const bySegment = overview?.bySegment ?? []
  const totalForSegments = bySegment.reduce((sum, item) => sum + item.count, 0)
  const activity = overview?.recentActivity ?? []
  const filteredActivity = activityFilter === 'all' ? activity : activity.filter(item => item.type === activityFilter)
  const openRate = overview?.syncable ? `${Math.round(((overview.opens ?? 0) / overview.syncable) * 100)}%` : '—'
  const clickRate = overview?.opens ? `${Math.round(((overview.clicks ?? 0) / overview.opens) * 100)}%` : '—'

  return <div className="dark-scroll email-page">
    <header className="email-header"><div className="email-heading"><div className="email-brand-icon"><RiMailLine /></div><div><h1>Email marketing</h1><p>Convierte cada contacto en una conversación que avanza.</p></div></div><div className="email-header-actions"><button className="email-button ghost" onClick={loadOverview}><RiRefreshLine /> Actualizar</button><button className="email-button secondary" onClick={() => document.querySelector('#email-activity')?.scrollIntoView({ behavior: 'smooth' })}><RiTimeLine /> Ver actividad</button><button className="email-button primary" onClick={() => setShowNewCampaign(true)}><RiRocketLine /> Nueva campaña</button></div></header>

    <section className="email-hero" aria-labelledby="email-hero-title"><div className="email-hero-copy"><div className="email-hero-status"><i /> Mautic conectado · datos en tiempo real</div><h2 id="email-hero-title">El mensaje correcto, en el momento que importa.</h2><p>Centraliza tus contactos, entiende qué despierta interés y prepara el siguiente paso con una vista clara de todo tu ciclo de nutrición.</p><div className="email-hero-actions"><button className="email-button primary" onClick={() => document.querySelector('#email-segments')?.scrollIntoView({ behavior: 'smooth' })}><RiGroupLine /> Explorar segmentos</button><button className="email-button secondary" onClick={() => document.querySelector('#email-activity')?.scrollIntoView({ behavior: 'smooth' })}>Revisar señales <RiArrowRightSLine /></button></div><div className="email-hero-meta"><span><RiCheckLine /> Seguimiento automático</span><span><RiSparkling2Line /> Señales listas para actuar</span></div></div><div className="email-hero-media"><img src={emailHeroImage} alt="Flujo visual de automatización de email marketing" /><div className="email-hero-caption"><span>Lifecycle intelligence</span><strong>Conectar · nutrir · convertir</strong></div></div></section>

    <section className="email-metrics" aria-label="Resumen de email marketing"><Metric Icon={RiGroupLine} color="#818cf8" label="Leads totales" value={overview?.totalLeads ?? 0} detail="en tu CRM" /><Metric Icon={RiSendPlaneLine} color="#22d3ee" label="Con email" value={overview?.syncable ?? 0} detail="listos para nutrir" /><Metric Icon={RiMailOpenLine} color="#34d399" label="Aperturas" value={overview?.opens ?? 0} detail={`${openRate} sobre la base`} /><Metric Icon={RiCursorLine} color="#fb7185" label="Clics" value={overview?.clicks ?? 0} detail={`${clickRate} sobre aperturas`} /></section>

    <section className="email-flow" aria-label="Flujo de nutrición"><div className="email-flow-intro"><span>El ciclo de cada lead</span><h2>De la primera señal al siguiente paso.</h2><p>Entiende dónde está tu audiencia y actúa con contexto, no con intuición.</p></div><div className="email-flow-steps"><div><span className="is-blue"><RiUserAddLine /></span><strong>Captar</strong><small>Nuevo contacto</small></div><i /><div><span className="is-cyan"><RiMailLine /></span><strong>Nutrir</strong><small>Contenido relevante</small></div><i /><div><span className="is-coral"><RiCursorLine /></span><strong>Activar</strong><small>Señal de interés</small></div><i /><div><span className="is-green"><RiRocketLine /></span><strong>Convertir</strong><small>Oportunidad lista</small></div></div></section>

    <section className="email-panel email-campaigns-panel" id="email-campaigns"><div className="email-panel-heading"><div><span className="email-eyebrow">CRM</span><h2>Campañas</h2><p>Campañas de email operadas desde el CRM (EM-105) — audiencia, plantilla y calendario con ownership propio.</p></div><button className="email-button secondary" onClick={() => setShowNewCampaign(true)}><RiRocketLine /> Nueva campaña</button></div>
      {campaignsLoading ? <p className="email-campaigns-loading">Cargando campañas…</p> : !campaigns.length ? <EmptyState icon={RiRocketLine} title="Todavía no hay campañas" copy="Creá tu primera campaña para empezar a nutrir a tus leads." /> : <div className="email-campaigns-list">{campaigns.map(campaign => { const meta = STATUS_META[campaign.status] || { label: campaign.status, color: '#94a3b8' }; return <div className="email-campaign-row" key={campaign.id}><div className="email-campaign-info"><strong>{campaign.name}</strong>{campaign.objective && <span>{campaign.objective}</span>}</div><span className="email-campaign-status" style={{ background: `${meta.color}22`, color: meta.color, borderColor: `${meta.color}55` }}>{meta.label}</span><div className="email-campaign-actions"><button className="email-button ghost email-campaign-manage" onClick={() => setEditingCampaignId(campaign.id)}><RiSparkling2Line /> Gestionar</button></div></div> })}</div>}
    </section>

    <div className="email-main-grid"><section className="email-panel" id="email-segments"><div className="email-panel-heading"><div><span className="email-eyebrow">Audiencia</span><h2>Mapa de segmentos</h2><p>Una lectura rápida de cómo está avanzando tu base.</p></div><span className="email-panel-count">{totalForSegments || overview?.totalLeads || 0} leads</span></div>{!bySegment.length ? <EmptyState icon={RiGroupLine} title="Aún no hay segmentos con datos" copy="Cuando Mautic reciba actividad, aquí verás el recorrido de tus leads." /> : <div className="email-segment-list">{bySegment.map(group => { const pct = totalForSegments ? Math.round((group.count / totalForSegments) * 100) : 0; const color = SEGMENT_COLOR[group.status] ?? '#818cf8'; return <div className="email-segment" key={group.status}><div className="email-segment-label"><span><i style={{ background: color }} />{BACKEND_STATUS[group.status] ?? group.status}</span><strong>{group.count}<small>{pct}%</small></strong></div><div className="email-progress"><span style={{ width: `${pct}%`, background: color }} /></div></div> })}</div>}</section>

      <aside className="email-panel email-signal-panel"><div className="email-panel-heading"><div><span className="email-eyebrow">Lectura rápida</span><h2>Señales de engagement</h2></div><RiSparkling2Line /></div><div className="email-signal-list"><div><span>Ratio de apertura</span><strong>{openRate}</strong><small>Interés inicial</small></div><div><span>Ratio de clic</span><strong>{clickRate}</strong><small>Intención activa</small></div></div><div className="email-signal-note"><RiCheckLine /><p>Los datos de Mautic se actualizan automáticamente en cada contacto.</p></div></aside>
    </div>

    <section className="email-panel email-activity-panel" id="email-activity"><div className="email-panel-heading"><div><span className="email-eyebrow">Últimas señales</span><h2>Actividad reciente</h2><p>Detecta quién está prestando atención y vuelve a abrir la conversación.</p></div><div className="email-filter"><button className={activityFilter === 'all' ? 'active' : ''} onClick={() => setActivityFilter('all')}>Todo</button><button className={activityFilter === 'open' ? 'active' : ''} onClick={() => setActivityFilter('open')}><RiMailOpenLine /> Aperturas</button><button className={activityFilter === 'click' ? 'active' : ''} onClick={() => setActivityFilter('click')}><RiCursorLine /> Clics</button></div></div>{!filteredActivity.length ? <EmptyState icon={RiTimeLine} title="Todavía no hay actividad" copy="Las aperturas y los clics aparecerán aquí cuando tus leads interactúen con un email." /> : <div className="email-activity-list">{filteredActivity.map((item, index) => <Link className="email-activity-row" key={`${item.leadId}-${index}`} to={`/leads/${item.leadId}`}><div className={`email-activity-icon ${item.type === 'open' ? 'open' : 'click'}`}>{item.type === 'open' ? <RiMailOpenLine /> : <RiCursorLine />}</div><div className="email-activity-copy"><strong>{item.name}</strong><span>{item.type === 'open' ? 'abrió un email' : 'hizo clic'}{item.detail ? ` · ${item.detail}` : ''}</span></div><time>{timeAgo(item.at)}</time><RiArrowRightSLine /></Link>)}</div>}</section>
    {notice && <div className="email-toast" role="status"><RiCheckLine /> {notice}</div>}
    {showNewCampaign && <NewCampaignModal onClose={() => setShowNewCampaign(false)} onCreate={handleCreateDraft} />}
    {editingCampaignId && <CampaignEditorModal campaignId={editingCampaignId} onClose={() => { setEditingCampaignId(null); loadCampaigns() }} onChanged={loadCampaigns} />}
  </div>
}
