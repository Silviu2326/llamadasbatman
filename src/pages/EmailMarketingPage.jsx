import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RiAlertLine, RiArrowRightSLine, RiCheckLine, RiCloseLine, RiCursorLine, RiGroupLine,
  RiMailLine, RiMailOpenLine, RiPauseLine, RiRefreshLine, RiRocketLine, RiSendPlaneLine,
  RiSparkling2Line, RiTimeLine, RiUserAddLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { useI18n } from '../i18n'
import { BACKEND_STATUS } from '../lib/leadMapping'
import { DEMO_MODE } from '../lib/dataMode'
import { classifyFetchError, statusMessage } from '../lib/dataStatus'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import { DeliverabilityPanel, InboxPanel, PURPOSE_LABEL, SubscribersPanel, TrackingPanel } from './EmailAudienceSections'
import emailHeroImage from '../assets/email-hero.png'
import '../dashboard.css'
import './email.css'

// EM-111: la página dejó de ser un único informe para cubrir el ciclo
// completo. Cada pestaña lee de endpoints reales distintos, así que se
// mantienen separadas en vez de apilarlo todo en un scroll infinito.
const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'campanas', label: 'Campañas' },
  { id: 'suscriptores', label: 'Suscriptores' },
  { id: 'bandeja', label: 'Bandeja de entrada' },
  { id: 'seguimiento', label: 'Seguimiento' },
]

const SEGMENT_COLOR = { new: 'var(--muted)', contacted: 'var(--cyan)', qualified: 'var(--warn)', unqualified: 'var(--danger-soft)', converted: 'var(--success)' }
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted']

// EM-105/EM-107: estado real de la campaña en el CRM — nunca optimista, se
// reconcilia contra Mautic al abrir el detalle (ver reconcileCampaignStatus).
const STATUS_META = {
  draft: { label: 'Borrador', color: 'var(--muted)' },
  validating: { label: 'Validando', color: 'var(--warn)' },
  ready: { label: 'Lista para publicar', color: 'var(--cyan-soft)' },
  scheduled: { label: 'Programada', color: 'var(--accent-soft)' },
  running: { label: 'Activa', color: 'var(--success)' },
  paused: { label: 'Pausada', color: 'var(--warn)' },
  completed: { label: 'Completada', color: 'var(--success)' },
  error: { label: 'Error', color: 'var(--danger-soft)' },
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
  return <article className="email-metric"><div className="email-metric-icon" style={{ color, background: `color-mix(in srgb, ${color} 9%, transparent)`, borderColor: `color-mix(in srgb, ${color} 22%, transparent)` }}><Icon /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>
}

function EmptyState({ icon: Icon = RiMailLine, title, copy, action }) {
  const handler = typeof action === 'function' ? action : action?.onClick
  const label = typeof action === 'object' ? action.label : 'Ver más'
  return <div className="email-empty"><div className="email-empty-icon"><Icon /></div><div><strong>{title}</strong><p>{copy}</p></div>{handler && <button className="email-button secondary" onClick={handler}><RiArrowRightSLine /> {label}</button>}</div>
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
    objective: '', status: [], source: '', tags: '', subscribedPurpose: '', templateBindingId: '',
    sender: '', replyTo: '', timezone: 'Europe/Madrid', scheduledStartAt: '', scheduledEndAt: '',
  })
  // EM-112: categorías reales de la organización, para no ofrecer una lista
  // inventada que produzca audiencias siempre vacías.
  const [purposes, setPurposes] = useState([])
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [validation, setValidation] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')
  const [publishInfo, setPublishInfo] = useState('')

  function syncFormFromCampaign(data) {
    const audience = data.audienceDefinition || {}
    setForm({
      objective: data.objective || '',
      status: Array.isArray(audience.status) ? audience.status : [],
      source: Array.isArray(audience.source) ? audience.source.join(', ') : '',
      tags: Array.isArray(audience.tags) ? audience.tags.join(', ') : '',
      subscribedPurpose: audience.subscribedPurpose || '',
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
        const [reconciled, templateList, audienceSummary] = await Promise.all([
          apiJson(`/api/marketing-campaigns/${campaignId}/reconcile`),
          apiFetch('/api/mautic/templates').then(res => res.ok ? res.json() : []).catch(() => []),
          apiFetch('/api/email/subscribers/summary').then(res => res.ok ? res.json() : null).catch(() => null),
        ])
        if (cancelled) return
        setCampaign(reconciled)
        syncFormFromCampaign(reconciled)
        setTemplates(templateList || [])
        setPurposes(audienceSummary?.purposes ?? [])
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
    if (form.subscribedPurpose) def.subscribedPurpose = form.subscribedPurpose
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
    setPublishInfo('')
    try {
      const updated = await apiJson(`/api/marketing-campaigns/${campaignId}/publish`, { method: 'POST' })
      setCampaign(updated)
      const enrolled = updated.enrolledCount ?? 0
      const skipped = updated.skippedCount ?? 0
      setPublishInfo(
        `Campaña confirmada por Mautic: ${enrolled} lead${enrolled === 1 ? '' : 's'} incorporado${enrolled === 1 ? '' : 's'} a la audiencia`
        + (skipped ? `, ${skipped} omitido${skipped === 1 ? '' : 's'} por falta de email, consentimiento o sincronización.` : '.')
      )
      onChanged?.()
    } catch (err) {
      setError(err.message || 'No se pudo publicar la campaña.')
      // The server moves a failed publication to `error` deliberately. Fetch
      // it so the modal exposes that safe state instead of keeping `ready`.
      try {
        setCampaign(await apiJson(`/api/marketing-campaigns/${campaignId}`))
      } catch {
        // Preserve the original, more actionable publish error.
      }
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

  const meta = campaign ? (STATUS_META[campaign.status] || { label: campaign.status, color: 'var(--muted)' }) : null

  return <div className="email-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div className="email-modal email-tools-modal" role="dialog" aria-modal="true" aria-labelledby="email-editor-title">
      <div className="email-modal-head">
        <div><span className="email-eyebrow">Campaña de email</span><h2 id="email-editor-title">{campaign?.name || 'Cargando…'}</h2></div>
        <button type="button" className="email-icon-button" onClick={onClose} aria-label="Cerrar"><RiCloseLine /></button>
      </div>

      {loading ? <p className="email-campaigns-loading">Cargando configuración de la campaña…</p> : <>
        {meta && <span className="email-campaign-status" style={{ background: `color-mix(in srgb, ${meta.color} 13%, transparent)`, color: meta.color, borderColor: `color-mix(in srgb, ${meta.color} 33%, transparent)` }}>{meta.label}</span>}

        <div className="email-tools-section" style={{ marginTop: 14 }}>
          <div><span className="email-eyebrow">1. Objetivo</span></div>
          <label className="email-field"><span>Objetivo de la campaña</span><textarea rows={2} value={form.objective} onChange={e => setForm(prev => ({ ...prev, objective: e.target.value }))} placeholder="¿Qué queremos lograr con esta campaña?" /></label>
        </div>

        <div className="email-tools-section">
          <div><span className="email-eyebrow">2. Audiencia</span><p>Filtros básicos sobre tus leads con email.</p></div>
          <label className="email-field">
            <span>Categoría de suscripción</span>
            <select value={form.subscribedPurpose} onChange={e => setForm(prev => ({ ...prev, subscribedPurpose: e.target.value }))}>
              <option value="">Cualquiera (no filtrar por suscripción)</option>
              {purposes.map(item => (
                <option key={item.purpose} value={item.purpose}>
                  {PURPOSE_LABEL[item.purpose] || item.purpose} — {item.granted} suscrito{item.granted === 1 ? '' : 's'}
                </option>
              ))}
            </select>
            <small className="email-field-hint">
              {form.subscribedPurpose
                ? 'Solo se incluirán contactos que dieron permiso para esta categoría. Bajas, rebotes y quejas quedan fuera automáticamente.'
                : 'Elige una categoría para convertir esta campaña en una newsletter dirigida solo a quien se suscribió.'}
            </small>
          </label>
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
          <div><span className="email-eyebrow">3. Plantilla</span><p>Solo se listan plantillas de Mautic ya autorizadas para tu organización.</p></div>
          {!templates.length ? <EmptyState icon={RiMailOpenLine} title="No hay plantillas disponibles" copy="Creá una plantilla en Mautic para poder seleccionarla aquí." /> : <label className="email-field"><span>Plantilla</span><select value={form.templateBindingId} onChange={e => setForm(prev => ({ ...prev, templateBindingId: e.target.value }))}><option value="">Selecciona una plantilla…</option>{templates.map(template => <option key={template.id} value={String(template.id)}>{templateLabel(template)}</option>)}</select></label>}
        </div>

        <div className="email-tools-section">
          <div><span className="email-eyebrow">4. Remitente</span></div>
          <label className="email-field"><span>Remitente</span><input value={form.sender} onChange={e => setForm(prev => ({ ...prev, sender: e.target.value }))} placeholder="Equipo Vendrava <hola@tuempresa.com>" /></label>
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

        {publishInfo && <div className="email-tools-status"><RiSendPlaneLine /><span>{publishInfo}</span></div>}

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
  const { locale } = useI18n()
  const [loading, setLoading] = useState(true)
  const [gated, setGated] = useState(false)
  const [dataStatus, setDataStatus] = useState('loading')
  const [dataError, setDataError] = useState('')
  const [overview, setOverview] = useState(null)
  const [activityFilter, setActivityFilter] = useState('all')
  const [notice, setNotice] = useState('')
  const [campaigns, setCampaigns] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [campaignStatus, setCampaignStatus] = useState('loading')
  const [campaignError, setCampaignError] = useState('')
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [editingCampaignId, setEditingCampaignId] = useState(null)
  const [tab, setTab] = useState('resumen')

  async function loadOverview() {
    setLoading(true)
    setDataStatus('loading')
    setDataError('')
    try {
      const res = await apiFetch('/api/mautic')
      if (res.status === 403) { setGated(true); setDataStatus('disconnected'); return }
      if (!res.ok) throw new Error(`mautic_${res.status}`)
      const payload = await res.json()
      setOverview(payload)
      const hasData = Number(payload?.totalLeads) > 0
        || Number(payload?.syncable) > 0
        || (Array.isArray(payload?.bySegment) && payload.bySegment.length > 0)
        || (Array.isArray(payload?.recentActivity) && payload.recentActivity.length > 0)
      setDataStatus(DEMO_MODE ? 'demo' : hasData ? 'live' : 'empty')
    } catch (error) {
      setOverview(null)
      const status = classifyFetchError(error)
      setDataStatus(status)
      setDataError(statusMessage(status, { error: 'Mautic no devolvió el resumen de email.' }))
    } finally { setLoading(false) }
  }

  async function loadCampaigns() {
    setCampaignsLoading(true)
    setCampaignStatus('loading')
    setCampaignError('')
    try {
      const res = await apiFetch('/api/marketing-campaigns')
      if (res.status === 403) { setCampaignStatus('disconnected'); return }
      if (!res.ok) throw new Error(`campaigns_${res.status}`)
      const items = await res.json()
      const next = Array.isArray(items) ? items : []
      setCampaigns(next)
      setCampaignStatus(DEMO_MODE ? 'demo' : next.length ? 'live' : 'empty')
    } catch (error) {
      setCampaigns([])
      const status = classifyFetchError(error)
      setCampaignStatus(status)
      setCampaignError(statusMessage(status, { error: 'No se pudieron cargar las campañas de email.' }))
    } finally { setCampaignsLoading(false) }
  }

  useEffect(() => { loadOverview(); loadCampaigns() }, [])

  function showNotice(message) { setNotice(message); window.setTimeout(() => setNotice(''), 3200) }

  async function handleCreateDraft({ name, objective }) {
    const campaign = await apiJson('/api/marketing-campaigns', { method: 'POST', body: JSON.stringify({ name, objective }) })
    showNotice('Borrador de campaña creado.')
    await loadCampaigns()
    setEditingCampaignId(campaign.id)
  }

  if (loading) return <div className="email-page email-loading"><div className="email-loader"><RiMailLine /><span>{locale === 'en' ? 'Loading your email center…' : 'Cargando tu centro de email…'}</span></div><DataStatusBanner status="loading" message={locale === 'en' ? 'Querying Mautic and your real campaigns.' : 'Consultando Mautic y tus campañas reales.'} /></div>
  if (gated) return <div className="email-page email-gated"><div className="email-gated-card"><RiAlertLine /><h1>Email marketing</h1><p>{locale === 'en' ? 'Email marketing is a Complete Plan feature. Talk to your administrator to enable it.' : 'Email marketing es una función del Plan Completo. Habla con tu administrador para activarla.'}</p></div></div>

  const bySegment = overview?.bySegment ?? []
  const totalForSegments = bySegment.reduce((sum, item) => sum + item.count, 0)
  const activity = overview?.recentActivity ?? []
  const filteredActivity = activityFilter === 'all' ? activity : activity.filter(item => item.type === activityFilter)
  const openRate = overview?.syncable ? `${Math.round(((overview.opens ?? 0) / overview.syncable) * 100)}%` : '—'
  const clickRate = overview?.opens ? `${Math.round(((overview.clicks ?? 0) / overview.opens) * 100)}%` : '—'

  return <div className="dark-scroll email-page">
    <header className="email-header"><div className="email-heading"><div className="email-brand-icon"><RiMailLine /></div><div><h1>Email marketing</h1><p>{locale === 'en' ? 'Turn every contact into a conversation that moves forward.' : 'Convierte cada contacto en una conversación que avanza.'}</p></div></div><div className="email-header-actions"><button className="email-button ghost" onClick={loadOverview}><RiRefreshLine /> {locale === 'en' ? 'Refresh' : 'Actualizar'}</button><button className="email-button secondary" onClick={() => document.querySelector('#email-activity')?.scrollIntoView({ behavior: 'smooth' })}><RiTimeLine /> {locale === 'en' ? 'View activity' : 'Ver actividad'}</button><button className="email-button primary" onClick={() => { setTab('campanas'); setShowNewCampaign(true) }}><RiRocketLine /> {locale === 'en' ? 'New campaign' : 'Nueva campaña'}</button></div></header>

    <nav className="email-tabs" role="tablist" aria-label="Secciones de email marketing">
      {TABS.map(item => (
        <button
          key={item.id}
          role="tab"
          aria-selected={tab === item.id}
          className={tab === item.id ? 'active' : ''}
          onClick={() => setTab(item.id)}
        >{item.label}</button>
      ))}
    </nav>

    {tab === 'resumen' && <>
    <DataStatusBanner
      status={dataStatus}
      message={dataError || statusMessage(dataStatus, { live: 'Mautic conectado: datos reales sincronizados.', empty: 'Mautic está disponible, pero todavía no hay actividad de email para mostrar.', demo: 'Modo demo explícito: revisa la experiencia sin atribuir estos datos a actividad real.' })}
      onRetry={dataStatus === 'error' || dataStatus === 'disconnected' ? loadOverview : undefined}
      onAction={dataStatus === 'disconnected' ? () => window.location.assign('/configuracion') : undefined}
      actionLabel="Configurar Mautic"
    />

    <section className="email-hero" aria-labelledby="email-hero-title"><div className="email-hero-copy"><div className="email-hero-status"><i /> {dataStatus === 'live' ? 'Mautic conectado · datos en tiempo real' : dataStatus === 'demo' ? 'Modo demo explícito' : dataStatus === 'empty' ? 'Mautic conectado · sin actividad todavía' : 'Mautic necesita atención'}</div><h2 id="email-hero-title">El mensaje correcto, en el momento que importa.</h2><p>Centraliza tus contactos, entiende qué despierta interés y prepara el siguiente paso con una vista clara de todo tu ciclo de nutrición.</p><div className="email-hero-actions"><button className="email-button primary" onClick={() => document.querySelector('#email-segments')?.scrollIntoView({ behavior: 'smooth' })}><RiGroupLine /> Explorar segmentos</button><button className="email-button secondary" onClick={() => document.querySelector('#email-activity')?.scrollIntoView({ behavior: 'smooth' })}>Revisar señales <RiArrowRightSLine /></button></div><div className="email-hero-meta"><span><RiCheckLine /> Seguimiento automático</span><span><RiSparkling2Line /> Señales listas para actuar</span></div></div><div className="email-hero-media"><img src={emailHeroImage} alt="Flujo visual de automatización de email marketing" /><div className="email-hero-caption"><span>Lifecycle intelligence</span><strong>Conectar · nutrir · convertir</strong></div></div></section>

    <section className="email-metrics" aria-label="Resumen de email marketing"><Metric Icon={RiGroupLine} color="#818cf8" label="Leads totales" value={overview ? (overview.totalLeads ?? '—') : '—'} detail="en tu CRM" /><Metric Icon={RiSendPlaneLine} color="#22d3ee" label="Con email" value={overview ? (overview.syncable ?? '—') : '—'} detail="listos para nutrir" /><Metric Icon={RiMailOpenLine} color="#34d399" label="Aperturas" value={overview ? (overview.opens ?? '—') : '—'} detail={`${openRate} sobre la base`} /><Metric Icon={RiCursorLine} color="#fb7185" label="Clics" value={overview ? (overview.clicks ?? '—') : '—'} detail={`${clickRate} sobre aperturas`} /></section>

    <DeliverabilityPanel />

    <section className="email-flow" aria-label="Flujo de nutrición"><div className="email-flow-intro"><span>El ciclo de cada lead</span><h2>De la primera señal al siguiente paso.</h2><p>Entiende dónde está tu audiencia y actúa con contexto, no con intuición.</p></div><div className="email-flow-steps"><div><span className="is-blue"><RiUserAddLine /></span><strong>Captar</strong><small>Nuevo contacto</small></div><i /><div><span className="is-cyan"><RiMailLine /></span><strong>Nutrir</strong><small>Contenido relevante</small></div><i /><div><span className="is-coral"><RiCursorLine /></span><strong>Activar</strong><small>Señal de interés</small></div><i /><div><span className="is-green"><RiRocketLine /></span><strong>Convertir</strong><small>Oportunidad lista</small></div></div></section>

    <div className="email-main-grid"><section className="email-panel" id="email-segments"><div className="email-panel-heading"><div><span className="email-eyebrow">Audiencia</span><h2>Mapa de segmentos</h2><p>Una lectura rápida de cómo está avanzando tu base.</p></div><span className="email-panel-count">{totalForSegments || overview?.totalLeads || 0} leads</span></div>{!bySegment.length ? <EmptyState icon={RiGroupLine} title="Aún no hay segmentos con datos" copy="Cuando Mautic reciba actividad, aquí verás el recorrido de tus leads." /> : <div className="email-segment-list">{bySegment.map(group => { const pct = totalForSegments ? Math.round((group.count / totalForSegments) * 100) : 0; const color = SEGMENT_COLOR[group.status] ?? 'var(--accent-soft)'; return <div className="email-segment" key={group.status}><div className="email-segment-label"><span><i style={{ background: color }} />{BACKEND_STATUS[group.status] ?? group.status}</span><strong>{group.count}<small>{pct}%</small></strong></div><div className="email-progress"><span style={{ width: `${pct}%`, background: color }} /></div></div> })}</div>}</section>

      <aside className="email-panel email-signal-panel"><div className="email-panel-heading"><div><span className="email-eyebrow">Lectura rápida</span><h2>Señales de engagement</h2></div><RiSparkling2Line /></div><div className="email-signal-list"><div><span>Ratio de apertura</span><strong>{openRate}</strong><small>Interés inicial</small></div><div><span>Ratio de clic</span><strong>{clickRate}</strong><small>Intención activa</small></div></div><div className="email-signal-note"><RiCheckLine /><p>Los datos de Mautic se actualizan automáticamente en cada contacto.</p></div></aside>
    </div>

    <section className="email-panel email-activity-panel" id="email-activity"><div className="email-panel-heading"><div><span className="email-eyebrow">Últimas señales</span><h2>Actividad reciente</h2><p>Detecta quién está prestando atención y vuelve a abrir la conversación.</p></div><div className="email-filter"><button className={activityFilter === 'all' ? 'active' : ''} onClick={() => setActivityFilter('all')}>Todo</button><button className={activityFilter === 'open' ? 'active' : ''} onClick={() => setActivityFilter('open')}><RiMailOpenLine /> Aperturas</button><button className={activityFilter === 'click' ? 'active' : ''} onClick={() => setActivityFilter('click')}><RiCursorLine /> Clics</button></div></div>{!filteredActivity.length ? <EmptyState icon={RiTimeLine} title="Todavía no hay actividad" copy="Las aperturas y los clics aparecerán aquí cuando tus leads interactúen con un email." /> : <div className="email-activity-list">{filteredActivity.map((item, index) => <Link className="email-activity-row" key={`${item.leadId}-${index}`} to={`/leads/${item.leadId}`}><div className={`email-activity-icon ${item.type === 'open' ? 'open' : 'click'}`}>{item.type === 'open' ? <RiMailOpenLine /> : <RiCursorLine />}</div><div className="email-activity-copy"><strong>{item.name}</strong><span>{item.type === 'open' ? 'abrió un email' : 'hizo clic'}{item.detail ? ` · ${item.detail}` : ''}</span></div><time>{timeAgo(item.at)}</time><RiArrowRightSLine /></Link>)}</div>}</section>
    </>}

    {tab === 'campanas' && <>
    <section className="email-panel email-campaigns-panel" id="email-campaigns"><div className="email-panel-heading"><div><span className="email-eyebrow">CRM</span><h2>Campañas</h2><p>Campañas de email operadas desde el CRM — audiencia, plantilla y calendario con ownership propio.</p></div><button className="email-button secondary" onClick={() => setShowNewCampaign(true)}><RiRocketLine /> Nueva campaña</button></div>
      <DataStatusBanner compact status={campaignStatus} message={campaignError || statusMessage(campaignStatus, { live: 'Campañas reales disponibles.', empty: 'Todavía no hay campañas configuradas.', demo: 'Modo demo explícito: no se publicará nada con estos datos.' })} onRetry={campaignStatus === 'error' || campaignStatus === 'disconnected' ? loadCampaigns : undefined} />
      {campaignsLoading ? <p className="email-campaigns-loading">Cargando campañas…</p> : campaignStatus === 'error' || campaignStatus === 'disconnected' ? <EmptyState icon={RiAlertLine} title="No se pueden mostrar las campañas" copy={campaignError || 'Revisa la conexión con el servicio de email.'} action={{ label: 'Reintentar', onClick: loadCampaigns }} /> : !campaigns.length ? <EmptyState icon={RiRocketLine} title="Todavía no hay campañas" copy="Crea tu primera campaña para empezar a nutrir a tus leads." action={{ label: 'Crear campaña', onClick: () => setShowNewCampaign(true) }} /> : <div className="email-campaigns-list">{campaigns.map(campaign => { const meta = STATUS_META[campaign.status] || { label: campaign.status, color: 'var(--muted)' }; return <div className="email-campaign-row" key={campaign.id}><div className="email-campaign-info"><strong>{campaign.name}</strong>{campaign.objective && <span>{campaign.objective}</span>}</div><span className="email-campaign-status" style={{ background: `color-mix(in srgb, ${meta.color} 13%, transparent)`, color: meta.color, borderColor: `color-mix(in srgb, ${meta.color} 33%, transparent)` }}>{meta.label}</span><div className="email-campaign-actions"><button className="email-button ghost email-campaign-manage" onClick={() => setEditingCampaignId(campaign.id)}><RiSparkling2Line /> Gestionar</button></div></div> })}</div>}
    </section>
    </>}

    {tab === 'suscriptores' && <SubscribersPanel onNotice={showNotice} />}
    {tab === 'bandeja' && <InboxPanel />}
    {tab === 'seguimiento' && <TrackingPanel />}
    {notice && <div className="email-toast" role="status"><RiCheckLine /> {notice}</div>}
    {showNewCampaign && <NewCampaignModal onClose={() => setShowNewCampaign(false)} onCreate={handleCreateDraft} />}
    {editingCampaignId && <CampaignEditorModal campaignId={editingCampaignId} onClose={() => { setEditingCampaignId(null); loadCampaigns() }} onChanged={loadCampaigns} />}
  </div>
}
