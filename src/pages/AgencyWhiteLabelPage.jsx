import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api'
import PageLoadingState from '../components/ui/PageLoadingState'
import { setBrand as applyPanelBrand } from '../lib/brand'
import { RiAddLine, RiArrowRightLine, RiBuilding2Line, RiCheckLine, RiCodeLine, RiFlashlightLine, RiGlobalLine, RiLoader4Line, RiMessage3Line, RiPaintBrushLine, RiRobot2Line, RiUploadCloud2Line } from 'react-icons/ri'
import './agency-white-label.css'
import './agency-white-label-docs.css'
import './agency-white-label-limits.css'
import './agency-white-label-channels.css'

const EMPTY_FORM = { displayName: '', clientEmail: '', website: '', monthlyPriceCents: 30000, wholesaleCostCents: 9900, monthlyVoiceMinutes: 500, monthlyMessages: 1000 }

function money(cents) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format((cents || 0) / 100)
}

function usageOf(client) {
  return client?.client?.whiteLabelUsage?.[0] || client?.whiteLabelUsage?.[0] || { messages: 0, voiceMinutes: 0, trainingRuns: 0 }
}

function configOf(client) {
  return client?.client?.whiteLabelConfig || client?.whiteLabelConfig || null
}

function latestJob(client) {
  return client?.client?.trainingJobs?.[0] || client?.trainingJobs?.[0] || null
}

export default function AgencyWhiteLabelPage() {
  const [clients, setClients] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [brand, setBrand] = useState(null)
  const [trainingUrl, setTrainingUrl] = useState('')
  const [documentName, setDocumentName] = useState('')
  const [documentContent, setDocumentContent] = useState('')
  const [limits, setLimits] = useState({ voiceMinutes: 500, messages: 1000 })
  const [widgetKey, setWidgetKey] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [telegramToken, setTelegramToken] = useState('')
  const [telegramWebhookBaseUrl, setTelegramWebhookBaseUrl] = useState('')
  const [telegramStatus, setTelegramStatus] = useState({ connected: false, configuredWebhook: false })
  const [ownBrand, setOwnBrand] = useState(null)
  const [billing, setBilling] = useState(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const selected = useMemo(() => clients.find(client => client.id === selectedId) || clients[0] || null, [clients, selectedId])
  const config = configOf(selected)
  const usage = usageOf(selected)
  const job = latestJob(selected)

  async function load() {
    setLoading(true)
    const response = await apiFetch('/api/white-label/clients')
    const data = response.ok ? await response.json() : []
    setClients(Array.isArray(data) ? data : [])
    setSelectedId(current => current || data?.[0]?.id || null)
    setLoading(false)
  }

  useEffect(() => { load().catch(() => { setError('No se pudieron cargar los clientes white-label'); setLoading(false) }) }, [])

  useEffect(() => {
    apiFetch('/api/white-label/brand').then(response => response.ok ? response.json() : null)
      .then(data => setOwnBrand(data || { brandName: '', logoUrl: '', primaryColor: '#4F46E5', accentColor: '#22D3EE', textColor: '#FFFFFF', appDomain: '' }))
      .catch(() => {})
    apiFetch('/api/white-label/billing').then(response => response.ok ? response.json() : null)
      .then(data => { if (data) setBilling(data) }).catch(() => {})
  }, [])

  async function saveOwnBrand() {
    if (!ownBrand?.brandName?.trim()) { setError('La marca del panel necesita un nombre'); return }
    setSaving(true); setError('')
    const response = await apiFetch('/api/white-label/brand', {
      method: 'PUT',
      body: JSON.stringify({
        brandName: ownBrand.brandName.trim(),
        logoUrl: ownBrand.logoUrl?.trim() || null,
        primaryColor: ownBrand.primaryColor,
        accentColor: ownBrand.accentColor,
        textColor: ownBrand.textColor,
        appDomain: ownBrand.appDomain?.trim() || null,
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setError(data.error || 'No se pudo guardar la marca del panel'); setSaving(false); return }
    setOwnBrand(current => ({ ...current, ...data }))
    applyPanelBrand(data)
    setNotice('Marca del panel actualizada')
    setSaving(false)
  }

  useEffect(() => {
    if (!selected) return
    const current = configOf(selected)
    setBrand(current ? { ...current } : null)
    setTrainingUrl(selected.client?.website || '')
    setLimits({ voiceMinutes: selected.monthlyVoiceMinutes || 0, messages: selected.monthlyMessages || 0 })
    apiFetch(`/api/white-label/clients/${selected.id}/channels/telegram`).then(response => response.ok ? response.json() : null).then(data => { if (data) setTelegramStatus(data) }).catch(() => {})
  }, [selectedId, selected?.id])

  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return undefined
    const timer = window.setInterval(() => { load().catch(() => {}) }, 4000)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status])

  async function createClient(event) {
    event.preventDefault()
    setCreating(true); setError(''); setNotice('')
    const response = await apiFetch('/api/white-label/clients', { method: 'POST', body: JSON.stringify(form) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setError(data.error || 'No se pudo crear el cliente'); setCreating(false); return }
    setWidgetKey(data.widgetKey || '')
    setInviteLink(data.inviteLink || '')
    setForm(EMPTY_FORM)
    setNotice(`Cliente creado${data.trainingJob ? ' y entrenamiento inicial iniciado' : ''}. Guarda la clave del widget: solo se muestra al crearla o rotarla.`)
    await load(); setSelectedId(data.client?.id); setCreating(false)
  }

  async function saveBrand() {
    if (!selected || !brand) return
    setSaving(true); setError('')
    const response = await apiFetch(`/api/white-label/clients/${selected.id}/brand`, { method: 'PUT', body: JSON.stringify(brand) })
    if (!response.ok) { const data = await response.json().catch(() => ({})); setError(data.error || 'No se pudo guardar la marca'); setSaving(false); return }
    setNotice('Marca y widget actualizados'); await load(); setSaving(false)
  }

  async function train() {
    if (!selected || !trainingUrl) return
    setSaving(true); setError('')
    const response = await apiFetch(`/api/white-label/clients/${selected.id}/training`, { method: 'POST', body: JSON.stringify({ sourceUrl: trainingUrl }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) setError(data.error || 'No se pudo iniciar el entrenamiento')
    else { setNotice('Entrenamiento iniciado. La web se rastreará y aparecerá en Knowledge Base al terminar'); await load() }
    setSaving(false)
  }

  async function addDocument() {
    if (!selected || !documentName || documentContent.length < 20) return
    setSaving(true); setError('')
    const response = await apiFetch(`/api/white-label/clients/${selected.id}/documents`, { method: 'POST', body: JSON.stringify({ name: documentName, content: documentContent }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) setError(data.error || 'No se pudo añadir el documento')
    else { setDocumentName(''); setDocumentContent(''); setNotice('Documento añadido a la base de conocimiento del cliente'); await load() }
    setSaving(false)
  }

  function readDocument(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setDocumentName(file.name.replace(/\.[^.]+$/, ''))
    const reader = new FileReader()
    reader.onload = () => setDocumentContent(String(reader.result || ''))
    reader.readAsText(file)
  }

  async function activate() {
    if (!selected) return
    setSaving(true)
    const response = await apiFetch(`/api/white-label/clients/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ status: selected.status === 'active' ? 'paused' : 'active' }) })
    if (response.ok) { setNotice(selected.status === 'active' ? 'Cliente pausado' : 'Cliente activado'); await load() }
    else setError('No se pudo cambiar el estado')
    setSaving(false)
  }

  async function saveLimits() {
    if (!selected) return
    setSaving(true); setError('')
    const response = await apiFetch(`/api/white-label/clients/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ monthlyVoiceMinutes: Number(limits.voiceMinutes) || 0, monthlyMessages: Number(limits.messages) || 0 }) })
    if (response.ok) { setNotice('Cuotas mensuales actualizadas'); await load() }
    else { const data = await response.json().catch(() => ({})); setError(data.error || 'No se pudieron actualizar las cuotas') }
    setSaving(false)
  }

  async function connectTelegram() {
    if (!selected || !telegramToken.trim()) return
    setSaving(true); setError('')
    const response = await apiFetch(`/api/white-label/clients/${selected.id}/channels/telegram`, { method: 'PUT', body: JSON.stringify({ botToken: telegramToken.trim(), webhookBaseUrl: telegramWebhookBaseUrl.trim() || undefined }) })
    const data = await response.json().catch(() => ({}))
    if (response.ok) { setTelegramStatus({ connected: true, configuredWebhook: Boolean(data.configuredWebhook), metadata: data }); setTelegramToken(''); setNotice('Telegram conectado al workspace del cliente') }
    else setError(data.error || 'No se pudo conectar Telegram')
    setSaving(false)
  }

  async function disconnectTelegram() {
    if (!selected) return
    setSaving(true); setError('')
    const response = await apiFetch(`/api/white-label/clients/${selected.id}/channels/telegram`, { method: 'DELETE' })
    if (response.ok) { setTelegramStatus({ connected: false, configuredWebhook: false }); setNotice('Telegram desconectado') }
    else setError('No se pudo desconectar Telegram')
    setSaving(false)
  }

  async function rotateKey() {
    if (!selected) return
    setSaving(true)
    const response = await apiFetch(`/api/white-label/clients/${selected.id}/widget-key/rotate`, { method: 'POST' })
    const data = await response.json().catch(() => ({}))
    if (response.ok) { setWidgetKey(data.widgetKey || ''); setNotice('Clave rotada. El snippet anterior deja de funcionar') }
    else setError('No se pudo rotar la clave')
    setSaving(false)
  }

  if (loading && !clients.length) return <PageLoadingState label="Cargando clientes white-label" />

  const snippet = widgetKey ? `<script src="${window.location.origin}/api/white-label/public/widget.js?key=${widgetKey}" async></script>` : ''
  const cardUrl = widgetKey ? `${window.location.origin}/api/white-label/public/card?key=${widgetKey}` : ''

  return <main className="agency-page">
    {inviteLink && <div className="agency-notice invite"><span>Enlace de acceso del cliente</span><code>{inviteLink}</code><button onClick={() => navigator.clipboard?.writeText(inviteLink)}>Copiar</button></div>}
    <header className="agency-header"><div className="agency-title"><span className="agency-icon"><RiRobot2Line /></span><div><span className="agency-kicker">Agency operating system</span><h1>Clientes white-label</h1><p>Crea agentes para tus clientes, entrénalos desde su web y entrega un widget con tu marca.</p></div></div></header>

    {(notice || error) && <div className={`agency-notice ${error ? 'error' : ''}`}><span>{error || notice}</span><button onClick={() => { setError(''); setNotice('') }}>×</button></div>}

    <section className="agency-command"><div><span className="agency-kicker">Distribución y margen</span><h2>Una cuenta matriz. Muchos clientes. Tu marca.</h2><p>Cada workspace mantiene su propio agente, conocimiento, canales y consumo. La agencia controla la activación y el precio.</p></div><div className="agency-stats"><div><strong>{clients.length}</strong><small>clientes</small></div><div><strong>{money(clients.reduce((sum, c) => sum + ((c.monthlyPriceCents || 0) - (c.wholesaleCostCents || 0)), 0))}</strong><small>margen mensual potencial</small></div><div><strong>{clients.filter(c => c.status === 'active').length}</strong><small>activos</small></div></div></section>

    <div className="agency-layout">
      <aside className="agency-list"><div className="agency-section-head"><div><span className="agency-kicker">Workspaces</span><h2>Clientes</h2></div><span>{clients.length}</span></div>{loading ? <div className="agency-empty"><RiLoader4Line className="spin" /> Cargando…</div> : clients.length ? clients.map(client => <button key={client.id} className={`agency-client-row ${selected?.id === client.id ? 'active' : ''}`} onClick={() => setSelectedId(client.id)}><span className="client-avatar">{client.displayName.slice(0, 2).toUpperCase()}</span><span><strong>{client.displayName}</strong><small>{client.status} · {money(client.monthlyPriceCents)}/mes</small></span><RiArrowRightLine /></button>) : <div className="agency-empty"><RiBuilding2Line /><p>Aún no hay clientes. Crea el primer workspace.</p></div>}
        <form className="agency-create" onSubmit={createClient}><span className="agency-kicker">Nuevo cliente</span><input required value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} placeholder="Nombre de la empresa" /><input type="email" value={form.clientEmail} onChange={e => setForm({ ...form, clientEmail: e.target.value })} placeholder="Email del administrador (opcional)" /><input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://cliente.com" /><div className="agency-form-grid"><label>Precio<input type="number" min="0" value={form.monthlyPriceCents / 100} onChange={e => setForm({ ...form, monthlyPriceCents: Number(e.target.value || 0) * 100 })} /></label><label>Coste<input type="number" min="0" value={form.wholesaleCostCents / 100} onChange={e => setForm({ ...form, wholesaleCostCents: Number(e.target.value || 0) * 100 })} /></label></div><button className="agency-button primary" disabled={creating}>{creating ? <RiLoader4Line className="spin" /> : <RiAddLine />}{creating ? 'Creando…' : 'Crear workspace'}</button></form>
      </aside>

      {selected ? <section className="agency-detail"><div className="agency-detail-head"><div><span className="agency-kicker">Workspace cliente</span><h2>{selected.displayName}</h2><p>{selected.client?.website || 'Sin web de origen configurada'}</p></div><div className="agency-detail-actions"><span className={`agency-status ${selected.status}`}>{selected.status}</span><button className="agency-button primary" onClick={activate} disabled={saving}>{selected.status === 'active' ? 'Pausar' : 'Activar cliente'}</button></div></div>
        <div className="agency-cards"><article><span className="card-label"><RiFlashlightLine /> Consumo del mes</span><strong>{usage.messages || 0} <small>/ {selected.monthlyMessages} mensajes</small></strong><div className="meter"><i style={{ width: `${Math.min(100, ((usage.messages || 0) / Math.max(1, selected.monthlyMessages)) * 100)}%` }} /></div><p>{usage.voiceMinutes || 0} / {selected.monthlyVoiceMinutes} minutos de voz</p></article><article><span className="card-label"><RiPaintBrushLine /> Marca del cliente</span><strong>{config?.enabled ? 'Publicada' : 'En preparación'}</strong><p>{config?.brandName || selected.displayName} · {config?.primaryColor || '#4F46E5'}</p><button className="text-action" onClick={() => setBrand({ ...config, enabled: !config?.enabled })}>Editar identidad <RiArrowRightLine /></button></article><article><span className="card-label"><RiGlobalLine /> Margen mensual</span><strong>{money((selected.monthlyPriceCents || 0) - (selected.wholesaleCostCents || 0))}</strong><p>Venta {money(selected.monthlyPriceCents)} · coste {money(selected.wholesaleCostCents)}</p><span className="margin-positive"><RiCheckLine /> Controlado por la agencia</span></article></div>

        <div className="agency-work-grid"><article className="agency-panel"><div className="agency-panel-head"><div><span className="agency-kicker">01 · Entrenamiento</span><h3>Aprende de la web y documentos</h3><p>Rastrea la web, añade información interna y deja todo disponible para el agente.</p></div><RiUploadCloud2Line /></div><div className="agency-inline-form"><input value={trainingUrl} onChange={e => setTrainingUrl(e.target.value)} placeholder="https://cliente.com" /><button className="agency-button primary" onClick={train} disabled={saving || !trainingUrl}>Entrenar web</button></div><div className="document-form"><div className="document-file-row"><input type="file" accept=".txt,.md,.csv,.json" onChange={readDocument} /><button className="agency-button secondary" onClick={addDocument} disabled={saving || !documentName || documentContent.length < 20}>Añadir documento</button></div><input value={documentName} onChange={e => setDocumentName(e.target.value)} placeholder="Nombre del documento" /><textarea value={documentContent} onChange={e => setDocumentContent(e.target.value)} placeholder="Pega aquí tarifas, FAQs, promociones o procesos internos…" /></div>{job && <div className={`training-state ${job.status}`}><span>{job.status === 'completed' ? '✓' : job.status === 'failed' ? '!' : '•'}</span><div><strong>{job.status === 'completed' ? `Listo: ${job.documentsCreated} páginas aprendidas` : job.status === 'failed' ? 'El entrenamiento falló' : 'Entrenamiento en curso'}</strong><small>{job.status === 'completed' ? `Última ejecución · ${job.pagesDiscovered} URLs rastreadas` : job.error || 'Puedes seguir trabajando mientras termina.'}</small></div></div>}</article>
          <article className="agency-panel"><div className="agency-panel-head"><div><span className="agency-kicker">02 · White-label</span><h3>Entrega el agente con tu identidad</h3><p>Configura la marca, activa el widget y copia un único snippet en la web del cliente.</p></div><RiCodeLine /></div>{brand && <div className="brand-form"><label>Nombre visible<input value={brand.brandName || ''} onChange={e => setBrand({ ...brand, brandName: e.target.value })} /></label><label>Mensaje de bienvenida<textarea value={brand.welcomeMessage || ''} onChange={e => setBrand({ ...brand, welcomeMessage: e.target.value })} /></label><div className="color-row"><label>Primario<input type="color" value={brand.primaryColor || '#4F46E5'} onChange={e => setBrand({ ...brand, primaryColor: e.target.value })} /></label><label>Acento<input type="color" value={brand.accentColor || '#22D3EE'} onChange={e => setBrand({ ...brand, accentColor: e.target.value })} /></label><label className="toggle-label"><input type="checkbox" checked={Boolean(brand.enabled)} onChange={e => setBrand({ ...brand, enabled: e.target.checked })} /> Widget activo</label></div><div className="panel-actions"><button className="agency-button secondary" onClick={rotateKey} disabled={saving}>Rotar clave</button><button className="agency-button primary" onClick={saveBrand} disabled={saving}>{saving ? 'Guardando…' : 'Guardar marca'}</button></div></div>}{widgetKey && <div className="snippet-box"><div><strong>Snippet de instalación</strong><small>Muéstralo una sola vez al cliente o a su desarrollador.</small></div><code>{snippet}</code><button onClick={() => navigator.clipboard?.writeText(snippet)}><RiCodeLine /> Copiar</button></div>}</article></div>
      </section> : <section className="agency-detail agency-empty-detail"><RiBuilding2Line /><h2>Crea tu primer cliente white-label</h2><p>El workspace se crea con un agente preparado, una marca separada y control de consumo.</p></section>}
    </div>
  {selected && <section className="agency-panel agency-limit-panel"><div className="agency-panel-head"><div><span className="agency-kicker">Cuotas mensuales</span><h3>Control de consumo</h3><p>Define el límite incluido en el plan del cliente.</p></div><RiFlashlightLine /></div><div className="limit-editor"><label>Minutos de voz<input type="number" min="0" value={limits.voiceMinutes} onChange={e => setLimits({ ...limits, voiceMinutes: e.target.value })} /></label><label>Mensajes<input type="number" min="0" value={limits.messages} onChange={e => setLimits({ ...limits, messages: e.target.value })} /></label><button className="agency-button primary" onClick={saveLimits} disabled={saving}>Guardar cuotas</button></div></section>}
  {selected && <section className="agency-panel agency-channel-panel"><div className="agency-panel-head"><div><span className="agency-kicker">Canal adicional</span><h3>Telegram</h3><p>Conecta un bot por cliente. Los mensajes entran en Conversaciones y usan el agente entrenado.</p></div><RiMessage3Line /></div><div className="channel-connect-row"><span className={`channel-badge ${telegramStatus.connected ? 'connected' : ''}`}>{telegramStatus.connected ? 'Conectado' : 'Sin conectar'}</span>{telegramStatus.metadata?.username && <small>@{telegramStatus.metadata.username}</small>}<input type="password" value={telegramToken} onChange={e => setTelegramToken(e.target.value)} placeholder="Token de BotFather" autoComplete="off" /><input type="url" value={telegramWebhookBaseUrl} onChange={e => setTelegramWebhookBaseUrl(e.target.value)} placeholder="https://api.tudominio.com" aria-label="URL pública del webhook" /><button className="agency-button primary" onClick={connectTelegram} disabled={saving || !telegramToken.trim()}>Conectar</button>{telegramStatus.connected && <button className="agency-button secondary" onClick={disconnectTelegram} disabled={saving}>Desconectar</button>}</div><small className="channel-note">{telegramStatus.connected && telegramStatus.configuredWebhook ? 'Webhook firmado activo.' : 'Indica la URL pública de tu API o configura APP_URL/FRONTEND_URL para recibir mensajes automáticamente.'}</small></section>}
  {ownBrand && <section className="agency-panel agency-limit-panel"><div className="agency-panel-head"><div><span className="agency-kicker">Tu marca</span><h3>Marca del panel</h3><p>Es lo que ven tu equipo y tus clientes al entrar al CRM: nombre, logotipo y colores. El dominio propio es opcional; sin él la marca se aplica igual tras el login.</p></div><RiPaintBrushLine /></div>
    <div className="limit-editor">
      <label>Nombre<input value={ownBrand.brandName || ''} onChange={e => setOwnBrand({ ...ownBrand, brandName: e.target.value })} placeholder="Tu agencia" /></label>
      <label>Logotipo (URL)<input type="url" value={ownBrand.logoUrl || ''} onChange={e => setOwnBrand({ ...ownBrand, logoUrl: e.target.value })} placeholder="https://tuagencia.com/logo.png" /></label>
      <label>Dominio del panel<input value={ownBrand.appDomain || ''} onChange={e => setOwnBrand({ ...ownBrand, appDomain: e.target.value })} placeholder="app.tuagencia.com" /></label>
      <label>Primario<input type="color" value={ownBrand.primaryColor || '#4F46E5'} onChange={e => setOwnBrand({ ...ownBrand, primaryColor: e.target.value })} /></label>
      <label>Acento<input type="color" value={ownBrand.accentColor || '#22D3EE'} onChange={e => setOwnBrand({ ...ownBrand, accentColor: e.target.value })} /></label>
      <button className="agency-button primary" onClick={saveOwnBrand} disabled={saving}>Guardar marca del panel</button>
    </div></section>}

  {billing && <section className="agency-panel agency-limit-panel"><div className="agency-panel-head"><div><span className="agency-kicker">Facturación</span><h3>Lo que se te cobra este ciclo</h3><p>El coste mayorista de tus clientes activos se añade como una línea a tu próxima factura de suscripción. Los clientes en prueba todavía no cuentan.</p></div><RiGlobalLine /></div>
    <div className="agency-stats">
      <div><strong>{billing.activeClients}</strong><small>clientes activos</small></div>
      <div><strong>{money(billing.revenueCents)}</strong><small>cobras a tus clientes</small></div>
      <div><strong>{money(billing.wholesaleCents)}</strong><small>se te factura</small></div>
      <div><strong>{money(billing.marginCents)}</strong><small>tu margen</small></div>
    </div></section>}

  {selected && cardUrl && <a className="agency-card-link" href={cardUrl} target="_blank" rel="noreferrer">Abrir tarjeta web del cliente</a>}
  </main>
}
