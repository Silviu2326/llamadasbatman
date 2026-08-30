import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiArrowRightLine, RiCheckLine, RiClipboardLine, RiCodeLine, RiErrorWarningLine,
  RiExternalLinkLine, RiGitBranchLine, RiGlobalLine, RiLoader4Line, RiPlugLine,
  RiRefreshLine, RiServerLine, RiShieldCheckLine, RiToolsLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { hasNavigationPermission } from '../lib/navigationPermissions'
import PageLoadingState from '../components/ui/PageLoadingState'
import './website-connections.css'

const MODE_META = {
  script: { label: 'Script universal', detail: 'Instalar una línea y activar captación, tracking y widgets.', Icon: RiCodeLine },
  plugin: { label: 'Plugin', detail: 'Conector profundo para WordPress.', Icon: RiPlugLine },
  api: { label: 'API del constructor', detail: 'Conectar la cuenta del CMS para editar y publicar.', Icon: RiToolsLine },
  git: { label: 'Git / despliegue', detail: 'Cambios revisables mediante repositorio y deploy.', Icon: RiGitBranchLine },
  sftp: { label: 'Hosting / SFTP', detail: 'Canal para webs en hosting tradicional.', Icon: RiServerLine },
  edge: { label: 'Capa edge', detail: 'Personalización y control desde el borde.', Icon: RiGlobalLine },
}

const MODE_STEPS = {
  script: ['Copia el snippet universal.', 'Pégalo antes de </head> o en el gestor de scripts.', 'Publica y vuelve aquí para verificar la instalación.'],
  plugin: ['Instala el plugin de Vendrava en WordPress.', 'Autoriza solo este dominio y revisa los permisos.', 'Vendrava hará una comprobación antes de editar.'],
  api: ['Conecta la cuenta del constructor.', 'Selecciona el sitio y el espacio de trabajo.', 'Los cambios se preparan en borrador y requieren aprobación.'],
  git: ['Conecta el repositorio del proyecto.', 'Vendrava propone un cambio revisable.', 'El deploy solo ocurre después de aprobarlo.'],
  sftp: ['Introduce las credenciales en el canal seguro.', 'Vendrava crea una copia antes de tocar archivos.', 'Cada publicación conserva una versión para deshacer.'],
  edge: ['Apunta el dominio a la capa edge compatible.', 'Mantén el origen intacto y activa las reglas elegidas.', 'Empieza en modo observación antes de personalizar.'],
}

const STATUS_META = {
  setup_required: { label: 'Configuración pendiente', tone: 'warn' },
  verification_pending: { label: 'Pendiente de verificación', tone: 'info' },
  connected: { label: 'Conectada', tone: 'success' },
  degraded: { label: 'Con limitaciones', tone: 'warn' },
  disconnected: { label: 'Desconectada', tone: 'muted' },
}

function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.setup_required
}

function formatCheckedAt(value) {
  if (!value) return 'Aún no comprobada'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Comprobada recientemente' : `Comprobada ${date.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
}

function ModePill({ mode, active, recommended, onClick, disabled }) {
  const meta = MODE_META[mode] || MODE_META.script
  const Icon = meta.Icon
  return <button type="button" className={`web-mode-pill${active ? ' is-active' : ''}`} onClick={() => onClick(mode)} disabled={disabled}>
    <Icon />
    <span><strong>{meta.label}</strong><small>{meta.detail}</small></span>
    {recommended ? <em>Recomendado</em> : null}
  </button>
}

function CapabilityList({ capabilities }) {
  return <div className="web-capabilities">
    {capabilities.map(capability => <div key={capability.id} className={`web-capability${capability.available ? ' is-available' : ''}`}>
      {capability.available ? <RiCheckLine /> : <RiShieldCheckLine />}
      <span><strong>{capability.label}</strong><small>{capability.available ? capability.via : 'requiere una conexión profunda'}</small></span>
    </div>)}
  </div>
}

function InstallationGuide({ connection, canManage }) {
  const [copied, setCopied] = useState(false)
  const mode = connection.connectionMode || 'script'
  const steps = MODE_STEPS[mode] || MODE_STEPS.script

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(connection.install.snippet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return <section className="web-install-guide">
    <div className="web-install-heading">
      <div><span className="web-eyebrow">Siguiente paso</span><h4>{MODE_META[mode]?.label || 'Conexión'} · guía de instalación</h4></div>
      <span className="web-step-count">{steps.length} pasos</span>
    </div>
    <ol>{steps.map((step, index) => <li key={step}><b>{index + 1}</b><span>{step}</span></li>)}</ol>
    {mode === 'script' ? <div className="web-snippet-wrap">
      <div className="web-snippet-label"><span>Snippet de {connection.domain}</span><button type="button" onClick={copySnippet} disabled={!canManage}><RiClipboardLine /> {copied ? 'Copiado' : 'Copiar'}</button></div>
      <code>{connection.install.snippet}</code>
      <small>El identificador es público y está limitado a este dominio. No contiene credenciales.</small>
    </div> : null}
    <a href={connection.websiteUrl} target="_blank" rel="noreferrer noopener" className="web-open-link">Abrir web <RiExternalLinkLine /></a>
  </section>
}

function WebsiteConnectionCard({ connection, canManage, onModeChange }) {
  const status = statusMeta(connection.status)
  const modes = Array.isArray(connection.availableModes) ? connection.availableModes : ['script']
  return <article className="web-connection-card">
    <header className="web-card-header">
      <div className="web-domain-mark"><RiGlobalLine /></div>
      <div className="web-card-title"><div><h3>{connection.domain}</h3><a href={connection.websiteUrl} target="_blank" rel="noreferrer noopener">{connection.websiteUrl} <RiExternalLinkLine /></a></div><span className={`web-status is-${status.tone}`}><i />{status.label}</span></div>
    </header>
    <div className="web-detection"><span>Detectada</span><strong>{connection.technologyLabel}</strong><small>{formatCheckedAt(connection.lastCheckedAt)}</small></div>
    <div className="web-card-section"><div className="web-section-label"><span>Qué podemos hacer ahora</span><small>{connection.capabilities.filter(item => item.available).length}/{connection.capabilities.length} capacidades</small></div><CapabilityList capabilities={connection.capabilities} /></div>
    <div className="web-card-section"><div className="web-section-label"><span>Canal de acceso</span><small>Selecciona cómo quieres conectarla</small></div><div className="web-mode-list">{modes.map(mode => <ModePill key={mode} mode={mode} active={connection.connectionMode === mode} recommended={connection.recommendedMode === mode} onClick={onModeChange} disabled={!canManage} />)}</div></div>
    <InstallationGuide connection={connection} canManage={canManage} />
  </article>
}

export default function WebsiteConnectionsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [connections, setConnections] = useState([])
  const [website, setWebsite] = useState('')
  const [state, setState] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canManage = hasNavigationPermission(user, ['integrations.manage'])

  const loadConnections = useCallback(async () => {
    setState('loading')
    try {
      const response = await apiFetch('/api/web-connections')
      if (!response.ok) throw new Error('No se pudieron cargar las conexiones web.')
      const data = await response.json()
      setConnections(Array.isArray(data) ? data : [])
      setState('ready')
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las conexiones web.')
      setState('error')
    }
  }, [])

  useEffect(() => { loadConnections() }, [loadConnections])

  async function discover(event) {
    event.preventDefault()
    if (busy || !website.trim() || !canManage) return
    setBusy(true); setError('')
    try {
      const response = await apiFetch('/api/web-connections/discover', { method: 'POST', body: JSON.stringify({ website: website.trim() }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'No se pudo analizar esa web.')
      setWebsite('')
      await loadConnections()
    } catch (err) {
      setError(err.message || 'No se pudo analizar esa web.')
    } finally { setBusy(false) }
  }

  async function chooseMode(connection, mode) {
    if (!canManage || connection.connectionMode === mode) return
    setError('')
    try {
      const response = await apiFetch(`/api/web-connections/${connection.id}`, { method: 'PATCH', body: JSON.stringify({ mode }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'No se pudo cambiar el canal.')
      setConnections(current => current.map(item => item.id === connection.id ? body : item))
    } catch (err) { setError(err.message || 'No se pudo cambiar el canal.') }
  }

  const stats = useMemo(() => ({ sites: connections.length, deep: connections.filter(item => item.capabilities?.some(capability => capability.id === 'publish' && capability.available)).length, pending: connections.filter(item => item.status !== 'connected').length }), [connections])

  if (state === 'loading') return <PageLoadingState label="Cargando conexiones web" />

  return <main className="conn-page web-connections-page dark-scroll">
    <header className="web-connections-header">
      <div className="web-title-block"><div className="web-title-icon"><RiGlobalLine /></div><div><span className="web-eyebrow">Web universal</span><h1>Conecta la web del cliente</h1><p>Una entrada para cualquier tecnología: empezamos con una capa universal y profundizamos cuando el sitio lo permite.</p></div></div>
      <button type="button" className="conn-button ghost" onClick={() => navigate('/conexiones')}><RiPlugLine /> Proveedores <RiArrowRightLine /></button>
    </header>

    <section className="web-hero-grid">
      <div className="web-discovery-card"><div className="web-section-label"><span>1 · Añadir una web</span><small>Solo analizamos contenido público</small></div><form onSubmit={discover}><label htmlFor="website-url">Dominio del cliente</label><div className="web-url-input"><RiGlobalLine /><input id="website-url" type="url" value={website} onChange={event => setWebsite(event.target.value)} placeholder="https://cliente.com" disabled={!canManage || busy} /><button type="submit" className="conn-button primary" disabled={!canManage || busy || !website.trim()}>{busy ? <><RiLoader4Line className="web-spin" /> Analizando…</> : <><RiRefreshLine /> Analizar y conectar</>}</button></div><small className="web-helper">Detectaremos la plataforma, las capacidades disponibles y el canal más sencillo para instalar Vendrava.</small></form></div>
      <div className="web-trust-card"><div className="web-trust-icon"><RiShieldCheckLine /></div><div><strong>Controlado y reversible</strong><p>La detección no modifica la web. Las ediciones profundas se preparan como borrador y cada publicación conserva rollback.</p></div></div>
    </section>

    {!canManage ? <div className="web-banner is-info"><RiShieldCheckLine /> Tienes acceso de lectura. Un administrador debe añadir o cambiar conexiones web.</div> : null}
    {error ? <div className="web-banner is-error" role="alert"><RiErrorWarningLine /> {error}<button type="button" onClick={() => setError('')} aria-label="Cerrar">×</button></div> : null}

    {state === 'error' ? <div className="conn-state error"><RiErrorWarningLine /><strong>No se pudieron cargar las conexiones web.</strong><button type="button" className="conn-button secondary" onClick={loadConnections}>Reintentar</button></div> : null}
    {state === 'ready' && connections.length === 0 ? <div className="web-empty-state"><RiGlobalLine /><strong>Aún no hay webs conectadas</strong><span>Añade el primer dominio y Vendrava te dirá si conviene usar script, plugin, API, Git, SFTP o edge.</span></div> : null}
    {connections.length > 0 ? <>
      <section className="web-stat-row" aria-label="Resumen de conexiones"><div><strong>{stats.sites}</strong><span>{stats.sites === 1 ? 'web conectada' : 'webs conectadas'}</span></div><div><strong>{stats.deep}</strong><span>con edición profunda</span></div><div><strong>{stats.pending}</strong><span>pendientes de instalación</span></div></section>
      <section className="web-connections-list" aria-label="Webs conectadas">{connections.map(connection => <WebsiteConnectionCard key={connection.id} connection={connection} canManage={canManage} onModeChange={mode => chooseMode(connection, mode)} />)}</section>
    </> : null}
  </main>
}
