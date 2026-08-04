import { useEffect, useState } from 'react'
import {
  RiAlertLine, RiArrowRightSLine, RiBarChartLine, RiCheckLine, RiCloseLine,
  RiExternalLinkLine, RiFacebookBoxFill, RiGlobalLine, RiImageAddLine,
  RiInstagramLine, RiLinkedinBoxFill, RiRefreshLine, RiShareForwardLine,
  RiSparkling2Line, RiTiktokFill, RiTimeLine, RiTwitterXFill, RiYoutubeFill,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { getLocale, localeCode, useI18n } from '../i18n'
import { DEMO_MODE } from '../lib/dataMode'
import { classifyFetchError, statusMessage } from '../lib/dataStatus'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import CaptureJourney from '../components/capture/CaptureJourney'
import '../dashboard.css'
import './social.css'

// Metricool gestiona la planificación y publicación de los posts orgánicos:
// esta página es una capa fina de conexión (workspace por Organization) + copiloto de
// contenido y enlace al planificador de Metricool.
// no se reconstruyen aquí, se embeben.

const PLATFORM_META = {
  instagram: { name: 'Instagram', color: '#e1306c', Icon: RiInstagramLine },
  linkedin: { name: 'LinkedIn', color: '#0a66c2', Icon: RiLinkedinBoxFill },
  facebook: { name: 'Facebook', color: '#1877f2', Icon: RiFacebookBoxFill },
  tiktok: { name: 'TikTok', color: '#25f4ee', Icon: RiTiktokFill },
  youtube: { name: 'YouTube', color: '#ff4d67', Icon: RiYoutubeFill },
  x: { name: 'X', color: 'var(--text)', Icon: RiTwitterXFill },
}

function platformMeta(name) {
  return PLATFORM_META[String(name ?? '').toLowerCase()] ?? { name: name ?? 'Canal', color: 'var(--accent-soft)', Icon: RiGlobalLine }
}

function formatShortDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(localeCode(getLocale()), { day: '2-digit', month: 'short' })
}

function renderAnalyticsValue(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return value.toLocaleString(localeCode(getLocale()))
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `${value.length} elemento${value.length === 1 ? '' : 's'}`
  if (typeof value === 'object') return `${Object.keys(value).length} campo${Object.keys(value).length === 1 ? '' : 's'}`
  return String(value)
}

function AnalyticsPanel({ data, status, onRetry }) {
  if (status === 'loading') return <div className="social-side-empty"><RiBarChartLine aria-hidden="true" /><p>Cargando métricas…</p></div>
  if (status === 'error' || status === 'disconnected') return <div className="social-side-empty"><RiAlertLine aria-hidden="true" /><p>No se pudieron cargar las métricas.</p>{onRetry && <button type="button" className="social-text-button" onClick={onRetry}>Reintentar <RiRefreshLine /></button>}</div>
  const entries = data && typeof data === 'object' ? Object.entries(data) : []
  if (!entries.length) {
    return <div className="social-side-empty"><RiBarChartLine aria-hidden="true" /><p>Todavía no hay métricas disponibles. Aparecerán cuando Metricool reporte actividad de tus redes.</p></div>
  }
  return (
    <div className="social-analytics-list">
      {entries.map(([key, value]) => (
        <div className="social-analytics-row" key={key}><span><i style={{ background: 'var(--accent-soft)' }} />{key}</span><strong>{renderAnalyticsValue(value)}</strong></div>
      ))}
    </div>
  )
}

export default function ConectarRedesPage() {
  const { locale } = useI18n()
  const [loading, setLoading] = useState(true)
  const [gated, setGated] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('loading')
  const [connectionError, setConnectionError] = useState('')
  const [connected, setConnected] = useState(false)
  const [providerUrl, setProviderUrl] = useState(null)
  const [integrations, setIntegrations] = useState([])
  const [connecting, setConnecting] = useState(false)
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsStatus, setAnalyticsStatus] = useState('loading')
  const [analyticsError, setAnalyticsError] = useState('')
  const [notice, setNotice] = useState('')
  const [campaigns, setCampaigns] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [campaignStatus, setCampaignStatus] = useState('loading')
  const [campaignError, setCampaignError] = useState('')
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [socialCta, setSocialCta] = useState('Descubre cómo podemos ayudarte')

  const [aiPrompt, setAiPrompt] = useState('')
  const [aiTone, setAiTone] = useState('cercano')
  const [aiStartDate, setAiStartDate] = useState('')
  const [aiChannels, setAiChannels] = useState(['instagram', 'linkedin'])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPlan, setAiPlan] = useState(null)
  const [draftStatus, setDraftStatus] = useState({})
  const [postImages, setPostImages] = useState({})
  const [imageStatus, setImageStatus] = useState({})
  const selectedCampaign = campaigns.find(campaign => campaign.id === selectedCampaignId)

  function showNotice(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3200)
  }

  async function loadAnalytics() {
    setAnalyticsLoading(true)
    setAnalyticsStatus('loading')
    setAnalyticsError('')
    try {
      const res = await apiFetch('/api/metricool/analytics')
      if (!res.ok) throw new Error(`metricool_analytics_${res.status}`)
      const data = await res.json()
      setAnalytics(data)
      setAnalyticsStatus(DEMO_MODE ? 'demo' : data && Object.keys(data).length ? 'live' : 'empty')
    } catch (error) {
      setAnalytics(null)
      const status = classifyFetchError(error)
      setAnalyticsStatus(status)
      setAnalyticsError(statusMessage(status, { error: 'Metricool no devolvió métricas.' }))
    } finally {
      setAnalyticsLoading(false)
    }
  }

  async function loadStatus() {
    setLoading(true)
    setConnectionStatus('loading')
    setConnectionError('')
    try {
      const res = await apiFetch('/api/metricool')
      if (res.status === 403) { setGated(true); setConnectionStatus('disconnected'); return }
      if (!res.ok) throw new Error('status failed')
      const data = await res.json()
      setConnected(Boolean(data.connected))
      setProviderUrl(data.appUrl ?? null)
      setIntegrations(Array.isArray(data.integrations) ? data.integrations : [])
      setConnectionStatus(DEMO_MODE ? 'demo' : data.connected ? 'live' : 'disconnected')
      if (data.connected) loadAnalytics()
      else { setAnalytics(null); setAnalyticsStatus('empty') }
    } catch (error) {
      setConnected(false)
      const status = classifyFetchError(error)
      setConnectionStatus(status)
      setConnectionError(statusMessage(status, { error: 'No se pudo consultar la conexión con Metricool.' }))
    } finally {
      setLoading(false)
    }
  }

  async function loadCampaigns() {
    setCampaignsLoading(true)
    setCampaignStatus('loading')
    setCampaignError('')
    try {
      const res = await apiFetch('/api/campaigns?page=1&limit=100')
      if (!res.ok) throw new Error(`campaigns_${res.status}`)
      const data = await res.json()
      const next = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
      setCampaigns(next)
      setCampaignStatus(DEMO_MODE ? 'demo' : next.length ? 'live' : 'empty')
    } catch (error) {
      setCampaigns([])
      const status = classifyFetchError(error)
      setCampaignStatus(status)
      setCampaignError(statusMessage(status, { error: 'No se pudieron cargar las campañas para enlazar el contenido.' }))
    } finally {
      setCampaignsLoading(false)
    }
  }

  useEffect(() => { void Promise.all([loadStatus(), loadCampaigns()]) }, [])

  async function connect() {
    setConnecting(true)
    try {
      const res = await apiFetch('/api/metricool/connect', { method: 'POST' })
      if (!res.ok) throw new Error('connect failed')
      const data = await res.json()
      setConnected(true)
      setConnectionStatus(DEMO_MODE ? 'demo' : 'live')
      setConnectionError('')
      setProviderUrl(data.appUrl ?? null)
      loadAnalytics()
    } catch {
      setConnectionStatus('error')
      setConnectionError('No se pudo conectar con Metricool. Intenta de nuevo.')
      showNotice('No se pudo conectar con Metricool. Intenta de nuevo.')
    } finally {
      setConnecting(false)
    }
  }

  function toggleChannel(id) {
    setAiChannels(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])
  }

  async function generatePlan(event) {
    event.preventDefault()
    if (!aiPrompt.trim() || !aiChannels.length) return
    setAiLoading(true)
    try {
      const res = await apiFetch('/api/metricool/ai/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt: aiPrompt.trim(), channels: aiChannels, tone: aiTone, startDate: aiStartDate || undefined }),
      })
      if (!res.ok) throw new Error('generate failed')
      setAiPlan(await res.json())
      setDraftStatus({})
      setPostImages({})
      setImageStatus({})
    } catch {
      showNotice('No se pudo generar el plan de contenido. Intenta de nuevo.')
    } finally {
      setAiLoading(false)
    }
  }

  async function uploadImage(file, index) {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) {
      showNotice('La imagen no puede superar los 8 MB.')
      return
    }
    setImageStatus(previous => ({ ...previous, [index]: 'uploading' }))
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
        reader.readAsDataURL(file)
      })
      const res = await apiFetch('/api/metricool/media', { method: 'POST', body: JSON.stringify({ data }) })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.imageUrl) throw new Error(payload?.error || 'No se pudo subir la imagen.')
      setPostImages(previous => ({ ...previous, [index]: payload.imageUrl }))
      setImageStatus(previous => ({ ...previous, [index]: 'done' }))
    } catch (error) {
      setImageStatus(previous => ({ ...previous, [index]: 'error' }))
      showNotice(error instanceof Error ? error.message : 'No se pudo subir la imagen.')
    }
  }

  async function generateImage(post, index) {
    setImageStatus(previous => ({ ...previous, [index]: 'generating' }))
    try {
      const res = await apiFetch('/api/metricool/ai/image', {
        method: 'POST',
        body: JSON.stringify({ prompt: post.text }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.imageUrl) throw new Error(data?.error || 'No se pudo generar la imagen.')
      setPostImages(previous => ({ ...previous, [index]: data.imageUrl }))
      setImageStatus(previous => ({ ...previous, [index]: 'done' }))
    } catch (error) {
      setImageStatus(previous => ({ ...previous, [index]: 'error' }))
      showNotice(error instanceof Error ? error.message : 'No se pudo generar la imagen.')
    }
  }

  async function createDraft(post, index) {
    if (!selectedCampaignId) {
      showNotice('Selecciona una campaña antes de crear el borrador.')
      return
    }
    if (!selectedCampaign?.landingSlug) {
      showNotice('La campaña necesita una landing publicada.')
      return
    }
    setDraftStatus(previous => ({ ...previous, [index]: 'creating' }))
    try {
      const res = await apiFetch('/api/metricool/posts', {
        method: 'POST',
        body: JSON.stringify({
          text: post.text,
          imageUrl: (postImages[index] ?? '').trim() || undefined,
          platforms: [post.platform],
          campaignId: selectedCampaignId,
          cta: socialCta.trim() || undefined,
          scheduledAt: post.suggestedDate || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'No se pudo crear el borrador en Metricool.')
      }
      setDraftStatus(previous => ({ ...previous, [index]: 'done' }))
      showNotice('Borrador conectado a la campaña y creado en Metricool.')
    } catch (error) {
      setDraftStatus(previous => ({ ...previous, [index]: 'error' }))
      showNotice(error instanceof Error ? error.message : 'No se pudo crear el borrador en Metricool.')
    }
  }

  if (loading) {
    return (
      <div className="dark-scroll social-page social-loading">
        <div className="social-loader"><RiRefreshLine aria-hidden="true" /><span>{locale === 'en' ? 'Loading social networks…' : 'Cargando redes sociales…'}</span></div>
        <DataStatusBanner status="loading" message={locale === 'en' ? 'Checking connection and real campaigns.' : 'Consultando conexión y campañas reales.'} />
      </div>
    )
  }

  if (gated) {
    return (
      <div className="dark-scroll social-page social-gated">
        <div className="social-gated-card">
          <RiAlertLine aria-hidden="true" />
          <h1>{locale === 'en' ? 'Social networks' : 'Redes sociales'}</h1>
          <p>{locale === 'en' ? 'Social networks are a Complete Plan feature. Talk to your administrator to enable them.' : 'Redes sociales es una función del Plan Completo. Habla con tu administrador para activarla.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dark-scroll social-page">
      <header className="social-header">
        <div className="social-heading">
          <div className="social-brand-icon"><RiShareForwardLine aria-hidden="true" /></div>
          <div><h1>{locale === 'en' ? 'Social networks' : 'Redes sociales'}</h1><p>{locale === 'en' ? 'Connect Metricool and prepare organic content with AI.' : 'Conecta Metricool y prepara contenido orgánico con IA.'}</p></div>
        </div>
        <div className="social-header-actions">
          <button className="social-button ghost" onClick={loadStatus}><RiRefreshLine /> {locale === 'en' ? 'Refresh' : 'Actualizar'}</button>
        </div>
      </header>

      <DataStatusBanner
        status={connectionStatus}
        message={connectionError || statusMessage(connectionStatus, { live: 'Metricool conectado: tus redes están listas para operar.', disconnected: 'Metricool está desconectado; conecta una cuenta para publicar.', demo: 'Modo demo explícito: no se publicará contenido real.', empty: 'Metricool está disponible, pero todavía no hay canales conectados.' })}
        onRetry={connectionStatus === 'error' ? loadStatus : undefined}
        onAction={connectionStatus === 'disconnected' ? connect : undefined}
        actionLabel="Conectar Metricool"
      />

      <CaptureJourney active="attract" />

      <section className="social-section" aria-labelledby="connect-title">
        <div className="social-section-heading">
          <div><h2 id="connect-title">Conexión con Metricool</h2><p>Metricool gestiona tus canales, calendario y publicaciones orgánicas.</p></div>
          {connected && <span className="social-status success"><span className="social-status-dot" /> Conectado</span>}
        </div>

        {!connected ? (
          <div className="social-panel">
            <div className="social-empty-accounts">
              <div className="social-empty-icon"><RiShareForwardLine aria-hidden="true" /></div>
              <div>
                <strong>Aún no conectaste tus redes</strong>
                <p>Configura Metricool para publicar y programar contenido en Instagram, LinkedIn, Facebook, TikTok, YouTube y X.</p>
              </div>
              <button className="social-button primary" onClick={connect} disabled={connecting}>
                <RiShareForwardLine /> {connecting ? 'Conectando…' : 'Conectar redes sociales'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {integrations.length > 0 && (
              <div className="social-integration-list">
                {integrations.map((item, index) => {
                  const meta = platformMeta(item?.platform ?? item?.type ?? item?.provider)
                  return (
                    <span className="social-integration-chip" key={item?.id ?? index}>
                      <meta.Icon aria-hidden="true" /> {item?.name ?? item?.username ?? meta.name}
                    </span>
                  )
                })}
              </div>
            )}
            {/* El iframe embebido se elimino: ni GET /api/metricool ni POST /api/metricool/connect
                devuelven `embedUrl`, asi que esta rama nunca se renderizaba. */}
            <div className="social-panel"><div className="social-side-empty"><RiGlobalLine aria-hidden="true" /><p>Metricool está conectado. Abre su planificador para revisar y ajustar tus borradores.</p>{providerUrl && <a className="social-text-button" href={providerUrl} target="_blank" rel="noreferrer">Abrir Metricool <RiExternalLinkLine /></a>}</div></div>
          </>
        )}
      </section>

      {connected && (
        <section className="social-section" aria-labelledby="analytics-title">
          <div className="social-section-heading"><div><h2 id="analytics-title">Métricas</h2><p>Datos de rendimiento reportados por Metricool.</p></div></div>
          <DataStatusBanner compact status={analyticsStatus} message={analyticsError || statusMessage(analyticsStatus, { live: 'Métricas reales disponibles.', empty: 'Metricool todavía no ha reportado actividad.', demo: 'Las métricas demo están identificadas y no representan actividad real.' })} onRetry={analyticsStatus === 'error' || analyticsStatus === 'disconnected' ? loadAnalytics : undefined} />
          <div className="social-panel" style={{ padding: '16px 17px' }}>
            <AnalyticsPanel data={analytics} status={analyticsLoading ? 'loading' : analyticsStatus} onRetry={loadAnalytics} />
          </div>
        </section>
      )}

      <section className="social-ai-section" id="ai-studio" aria-labelledby="ai-studio-title">
        <div className="social-section-heading">
          <div><h2 id="ai-studio-title">Copiloto de contenido</h2><p>Describe qué quieres comunicar y genera un borrador por canal.</p></div>
          <span className="social-ai-status"><RiSparkling2Line aria-hidden="true" /> IA preparada</span>
        </div>

        <div className="social-panel" style={{ padding: '20px' }}>
          <form className="social-ai-form" onSubmit={generatePlan}>
            <div className="social-campaign-linker">
              <div className="social-campaign-linker-head">
                <span><RiGlobalLine aria-hidden="true" /> Campaña y destino</span>
                <small>Obligatorio para crear borradores</small>
              </div>
              <DataStatusBanner compact status={campaignStatus} message={campaignError || statusMessage(campaignStatus, { live: 'Campañas reales disponibles para enlazar.', empty: 'Crea una campaña con landing para poder crear borradores.', demo: 'Modo demo explícito: las campañas no publicarán contenido real.' })} onRetry={campaignStatus === 'error' || campaignStatus === 'disconnected' ? loadCampaigns : undefined} onAction={campaignStatus === 'empty' ? () => window.location.assign('/campanas') : undefined} actionLabel="Crear campaña" />
              <div className="social-campaign-fields">
                <label htmlFor="social-campaign">
                  Campaña
                  <select
                    id="social-campaign"
                    value={selectedCampaignId}
                    onChange={event => { setSelectedCampaignId(event.target.value); setDraftStatus({}) }}
                    disabled={campaignsLoading}
                  >
                    <option value="">{campaignsLoading ? 'Cargando campañas…' : 'Selecciona una campaña'}</option>
                    {campaigns.map(campaign => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}{campaign.landingSlug ? '' : ' · sin landing'}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="social-cta">
                  Llamada a la acción
                  <input id="social-cta" type="text" maxLength="160" value={socialCta} onChange={event => setSocialCta(event.target.value)} placeholder="Ej. Reserva una demo" />
                </label>
              </div>
              {selectedCampaignId && (
                selectedCampaign?.landingSlug ? (
                  <div className="social-campaign-destination success">
                    <RiCheckLine aria-hidden="true" />
                    <span>Destino: <a href={`/l/${selectedCampaign.landingSlug}`} target="_blank" rel="noreferrer">/l/{selectedCampaign.landingSlug}</a></span>
                    <small>Se añadirán UTMs únicas para cada canal.</small>
                  </div>
                ) : (
                  <div className="social-campaign-destination warning">
                    <RiAlertLine aria-hidden="true" />
                    <span>Esta campaña aún no tiene landing.</span>
                    <a href="/landings">Crear landing <RiArrowRightSLine /></a>
                  </div>
                )
              )}
            </div>
            <label htmlFor="ai-prompt">Brief de contenido</label>
            <textarea id="ai-prompt" value={aiPrompt} onChange={event => setAiPrompt(event.target.value)} rows="3" placeholder="Cuéntale a la IA qué quieres conseguir…" />
            <div className="social-ai-form-row">
              <label htmlFor="ai-tone">Tono</label>
              <select id="ai-tone" value={aiTone} onChange={event => setAiTone(event.target.value)}>
                <option value="cercano">Cercano</option>
                <option value="experto">Experto</option>
                <option value="inspirador">Inspirador</option>
                <option value="directo">Directo</option>
              </select>
            </div>
            <div className="social-ai-form-row">
              <label htmlFor="ai-start-date">Fecha de inicio</label>
              <input id="ai-start-date" type="date" value={aiStartDate} onChange={event => setAiStartDate(event.target.value)} />
            </div>
            <fieldset>
              <legend>Canales de salida</legend>
              <div className="social-channel-picker">
                {Object.entries(PLATFORM_META).map(([id, item]) => {
                  const Icon = item.Icon
                  return (
                    <button type="button" key={id} className={`social-channel-option${aiChannels.includes(id) ? ' selected' : ''}`} onClick={() => toggleChannel(id)}>
                      <Icon aria-hidden="true" /><span>{item.name}</span>{aiChannels.includes(id) && <RiCheckLine aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            </fieldset>
            <button className="social-button primary social-ai-submit" type="submit" disabled={aiLoading || !aiPrompt.trim() || !aiChannels.length}>
              <RiSparkling2Line /> {aiLoading ? 'Generando…' : 'Generar plan de contenido'}
            </button>
          </form>
        </div>

        {aiPlan && (
          <div className="social-ai-result" style={{ position: 'static', width: '100%', margin: '14px 0 0' }}>
            <div className="social-ai-result-head">
              <div><span className="social-result-label">{aiPlan.generatedBy === 'fallback' ? 'Borrador automático · IA no disponible' : 'Plan generado con IA'}</span><h3>{aiPlan.title}</h3><p>{aiPlan.summary}</p></div>
              <button className="social-icon-button" type="button" aria-label="Descartar plan generado" onClick={() => setAiPlan(null)}><RiCloseLine /></button>
            </div>
            <div className="social-ai-post-list">
              {(aiPlan.posts ?? []).map((post, index) => {
                const meta = platformMeta(post.platform)
                const status = draftStatus[index]
                const creationBlocked = !selectedCampaignId || !selectedCampaign?.landingSlug
                return (
                  <article className="social-ai-post" key={`${post.platform}-${index}`}>
                    <div className="social-ai-post-date"><strong>{formatShortDate(post.suggestedDate)}</strong><span>{meta.name}</span></div>
                    <div className="social-ai-post-copy">
                      <div><span className="social-ai-post-type" style={{ color: meta.color }}>{meta.name}</span></div>
                      <p>{post.text}</p>
                      <div className="social-ai-post-image">
                        {postImages[index] && <img src={postImages[index]} alt="Imagen del post" />}
                        <label className={`social-text-button${imageStatus[index] === 'uploading' || status === 'creating' || status === 'done' ? ' disabled' : ''}`}>
                          <RiImageAddLine /> {imageStatus[index] === 'uploading' ? 'Subiendo…' : 'Subir imagen'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            hidden
                            disabled={imageStatus[index] === 'uploading' || status === 'creating' || status === 'done'}
                            onChange={event => { void uploadImage(event.target.files?.[0], index); event.target.value = '' }}
                          />
                        </label>
                        <button
                          type="button"
                          className="social-text-button"
                          disabled={imageStatus[index] === 'generating' || imageStatus[index] === 'uploading' || status === 'creating' || status === 'done'}
                          onClick={() => generateImage(post, index)}
                        >
                          <RiSparkling2Line /> {imageStatus[index] === 'generating' ? 'Generando imagen…' : 'Generar imagen con IA'}
                        </button>
                        {postImages[index] && status !== 'creating' && status !== 'done' && (
                          <button
                            type="button"
                            className="social-text-button"
                            aria-label="Quitar imagen"
                            onClick={() => setPostImages(previous => ({ ...previous, [index]: undefined }))}
                          >
                            <RiCloseLine /> Quitar
                          </button>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="social-button secondary"
                      disabled={status === 'creating' || status === 'done' || creationBlocked}
                      title={creationBlocked ? 'Selecciona una campaña con landing para crear el borrador' : undefined}
                      onClick={() => createDraft(post, index)}
                    >
                      {status === 'done' ? <><RiCheckLine /> Creado</> : status === 'creating' ? 'Creando…' : 'Crear borrador'}
                    </button>
                  </article>
                )
              })}
            </div>
          </div>
        )}

        <div className="social-ai-footer"><span><RiGlobalLine /> Cada borrador incluye la landing y UTMs de su campaña.</span><span><RiTimeLine /> Las fechas son sugerencias, ajústalas desde el calendario de Metricool.</span></div>
      </section>

      {notice && <div className="social-ai-toast" role="status"><RiCheckLine /> {notice}<button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><RiCloseLine /></button></div>}
    </div>
  )
}
