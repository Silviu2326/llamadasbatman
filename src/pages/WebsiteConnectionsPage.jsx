import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiArrowRightLine, RiCheckLine, RiClipboardLine, RiCodeLine, RiEditLine, RiErrorWarningLine,
  RiExternalLinkLine, RiGitBranchLine, RiGlobalLine, RiLoader4Line, RiLockPasswordLine, RiPlugLine,
  RiPulseLine, RiRefreshLine, RiServerLine, RiShieldCheckLine, RiToolsLine, RiWordpressLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { hasNavigationPermission } from '../lib/navigationPermissions'
import PageLoadingState from '../components/ui/PageLoadingState'
import './website-connections.css'

const MODE_META = {
  script: { label: 'Script universal', detail: 'Instalar una línea y activar captación, tracking y widgets.', Icon: RiCodeLine },
  plugin: { label: 'Plugin', detail: 'Vendrava Connect para WordPress: script y SEO sin tocar el tema.', Icon: RiPlugLine },
  api: { label: 'API del constructor', detail: 'Conectar la cuenta del CMS para editar y publicar.', Icon: RiToolsLine },
  git: { label: 'Git / despliegue', detail: 'Cambios revisables mediante repositorio y deploy.', Icon: RiGitBranchLine },
  sftp: { label: 'Hosting / SFTP', detail: 'Canal para webs en hosting tradicional.', Icon: RiServerLine },
  edge: { label: 'Capa edge', detail: 'Personalización y control desde el borde.', Icon: RiGlobalLine },
}

const MODE_STEPS = {
  script: ['Copia el snippet universal.', 'Pégalo antes de </head> o en el gestor de scripts.', 'Publica y visita la web: la primera señal verifica la instalación.'],
  plugin: ['Instala y activa el plugin Vendrava Connect en WordPress.', 'Crea una contraseña de aplicación en Usuarios → Perfil.', 'Conecta aquí abajo: Vendrava instala el script y verifica solo.'],
  api: ['Crea una contraseña de aplicación en WordPress (Usuarios → Perfil).', 'Conecta aquí abajo con tu usuario y esa contraseña.', 'Podrás editar páginas; para SEO y script automático instala el plugin.'],
  git: ['Crea en GitHub un token fine-grained con Contents y Pull requests en escritura.', 'Conecta el repositorio aquí abajo.', 'Describe un cambio: el agente abre un pull request y tú lo apruebas.'],
  sftp: ['Introduce las credenciales en el canal seguro.', 'Vendrava crea una copia antes de tocar archivos.', 'Cada publicación conserva una versión para deshacer.'],
  edge: ['Apunta el dominio a la capa edge compatible.', 'Mantén el origen intacto y activa las reglas elegidas.', 'Empieza en modo observación antes de personalizar.'],
}

// Canales sin conector real todavía: la UI lo dice en vez de prometer pasos.
const MODES_WITHOUT_CONNECTOR = new Set(['sftp', 'edge'])

const PROPOSAL_STATUS = {
  queued: { label: 'En cola', tone: 'info' },
  running: { label: 'El agente trabaja…', tone: 'info' },
  proposed: { label: 'Pull request abierto', tone: 'success' },
  no_changes: { label: 'Sin cambios', tone: 'muted' },
  failed: { label: 'Falló', tone: 'warn' },
  merged: { label: 'Fusionado', tone: 'success' },
  closed: { label: 'Cerrado sin fusionar', tone: 'muted' },
}
const CHECKS_LABEL = { pending: 'CI en marcha', success: 'CI en verde', failure: 'CI en rojo', none: 'Sin CI' }

const STATUS_META = {
  setup_required: { label: 'Configuración pendiente', tone: 'warn' },
  verification_pending: { label: 'Pendiente de verificación', tone: 'info' },
  connected: { label: 'Conectada', tone: 'success' },
  degraded: { label: 'Con limitaciones', tone: 'warn' },
  disconnected: { label: 'Desconectada', tone: 'muted' },
}

const EVENT_LABELS = { page_view: 'vistas', form_submit: 'formularios', click_phone: 'clics a teléfono', click_email: 'clics a email', click_outbound: 'salidas' }

function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.setup_required
}

function formatCheckedAt(value) {
  if (!value) return 'Aún no comprobada'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Comprobada recientemente' : `Comprobada ${date.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
}

function relativeTime(value) {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(diff)) return ''
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'hace un momento'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `hace ${hours} h`
  return `hace ${Math.round(hours / 24)} días`
}

async function readBody(response, fallback) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || fallback)
  return body
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
      <span><strong>{capability.label}</strong><small>{capability.via}</small></span>
    </div>)}
  </div>
}

/** Verificación real: lo que el script ha enviado, no lo que se marcó a mano. */
function SignalsBlock({ connection }) {
  const signals = connection.signals || { last7d: {}, total7d: 0, verified: false, lastEventAt: null }
  const entries = Object.entries(signals.last7d || {}).sort((a, b) => b[1] - a[1]).slice(0, 4)
  return <div className={`web-signals${signals.verified ? ' is-live' : ''}`}>
    <RiPulseLine />
    {signals.verified
      ? <span><strong>Recibiendo señales</strong><small>{signals.total7d} eventos en 7 días{signals.lastEventAt ? ` · última ${relativeTime(signals.lastEventAt)}` : ''}{entries.length ? ` · ${entries.map(([name, count]) => `${count} ${EVENT_LABELS[name] || name}`).join(', ')}` : ''}</small></span>
      : <span><strong>Sin señales todavía</strong><small>Instala el script (o conéctalo por el plugin) y visita la web: la primera vista verifica la instalación.</small></span>}
  </div>
}

function InstallationGuide({ connection, canManage }) {
  const [copied, setCopied] = useState(false)
  const mode = connection.connectionMode || 'script'
  const steps = MODE_STEPS[mode] || MODE_STEPS.script
  const showSnippet = mode === 'script' || !connection.connector?.scriptInstalled

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
    {MODES_WITHOUT_CONNECTOR.has(mode) ? <p className="web-helper">Este canal todavía no tiene conector automático en Vendrava. Mientras tanto, el script universal funciona en cualquier web.</p> : null}
    <ol>{steps.map((step, index) => <li key={step}><b>{index + 1}</b><span>{step}</span></li>)}</ol>
    {showSnippet ? <div className="web-snippet-wrap">
      <div className="web-snippet-label"><span>Snippet de {connection.domain}</span><button type="button" onClick={copySnippet} disabled={!canManage}><RiClipboardLine /> {copied ? 'Copiado' : 'Copiar'}</button></div>
      <code>{connection.install.snippet}</code>
      <small>El identificador es público y está limitado a este dominio. No contiene credenciales.</small>
    </div> : null}
    <a href={connection.websiteUrl} target="_blank" rel="noreferrer noopener" className="web-open-link">Abrir web <RiExternalLinkLine /></a>
  </section>
}

/* ── WordPress ────────────────────────────────────────────────────────── */

function WordPressConnectForm({ connection, canManage, onConnected, onError }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (busy || !canManage || !username.trim() || !password.trim()) return
    setBusy(true); onError('')
    try {
      const response = await apiFetch(`/api/web-connections/${connection.id}/wordpress/connect`, { method: 'POST', body: JSON.stringify({ username: username.trim(), applicationPassword: password.trim() }) })
      const body = await readBody(response, 'No se pudo conectar WordPress.')
      setPassword('')
      onConnected(body)
    } catch (err) { onError(err.message) } finally { setBusy(false) }
  }

  return <form className="web-wp-form" onSubmit={submit}>
    <p className="web-helper">Crea una <strong>contraseña de aplicación</strong> en WordPress (Usuarios → Perfil → Contraseñas de aplicación) para un usuario Editor o Administrador. Se guarda cifrada y solo se usa para esta web.</p>
    <div className="web-wp-fields">
      <label><span>Usuario de WordPress</span><input type="text" autoComplete="off" value={username} onChange={event => setUsername(event.target.value)} placeholder="admin" disabled={!canManage || busy} /></label>
      <label><span>Contraseña de aplicación</span><input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" disabled={!canManage || busy} /></label>
    </div>
    <button type="submit" className="conn-button primary" disabled={!canManage || busy || !username.trim() || !password.trim()}>{busy ? <><RiLoader4Line className="web-spin" /> Comprobando…</> : <><RiLockPasswordLine /> Conectar WordPress</>}</button>
  </form>
}

function WordPressPageEditor({ connection, page, canManage, onSaved, onCancel, onError }) {
  const plugin = Boolean(connection.connector?.plugin)
  const [form, setForm] = useState({ title: page.title || '', seoTitle: page.seo?.title || '', metaDescription: page.seo?.description || '' })
  const [saving, setSaving] = useState(false)

  async function save(event) {
    event.preventDefault()
    if (saving || !canManage) return
    const changes = { type: page.type }
    if (form.title.trim() && form.title.trim() !== page.title) changes.title = form.title.trim()
    if (plugin) {
      if (form.seoTitle !== (page.seo?.title || '')) changes.seoTitle = form.seoTitle.trim()
      if (form.metaDescription !== (page.seo?.description || '')) changes.metaDescription = form.metaDescription.trim()
    }
    if (Object.keys(changes).length === 1) return onCancel()
    setSaving(true); onError('')
    try {
      const response = await apiFetch(`/api/web-connections/${connection.id}/wordpress/pages/${page.id}`, { method: 'PUT', body: JSON.stringify(changes) })
      onSaved(await readBody(response, 'WordPress no aceptó el cambio.'))
    } catch (err) { onError(err.message) } finally { setSaving(false) }
  }

  return <form className="web-wp-editor" onSubmit={save}>
    <label><span>Título de la página</span><input type="text" value={form.title} onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))} maxLength={300} disabled={!canManage || saving} /></label>
    <label><span>Título SEO {plugin ? <em>{form.seoTitle.length}/70</em> : <em>requiere plugin</em>}</span><input type="text" value={form.seoTitle} onChange={event => setForm(prev => ({ ...prev, seoTitle: event.target.value }))} maxLength={200} disabled={!canManage || saving || !plugin} placeholder={plugin ? 'Vacío = el que genera WordPress' : 'Instala Vendrava Connect para editarlo'} /></label>
    <label><span>Meta description {plugin ? <em>{form.metaDescription.length}/160</em> : <em>requiere plugin</em>}</span><textarea rows={3} value={form.metaDescription} onChange={event => setForm(prev => ({ ...prev, metaDescription: event.target.value }))} maxLength={400} disabled={!canManage || saving || !plugin} /></label>
    <div className="web-wp-editor-actions">
      <button type="button" className="conn-button ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
      <button type="submit" className="conn-button primary" disabled={!canManage || saving}>{saving ? <><RiLoader4Line className="web-spin" /> Guardando…</> : 'Guardar en WordPress'}</button>
    </div>
  </form>
}

function WordPressPages({ connection, canManage, onError }) {
  const [state, setState] = useState('idle')
  const [type, setType] = useState('pages')
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setState('loading'); onError('')
    try {
      const response = await apiFetch(`/api/web-connections/${connection.id}/wordpress/pages?type=${type}`)
      const body = await readBody(response, 'No se pudieron cargar las páginas.')
      setItems(Array.isArray(body.items) ? body.items : [])
      setState('ready')
    } catch (err) { onError(err.message); setState('error') }
  }, [connection.id, type, onError])

  useEffect(() => { load() }, [load])

  return <div className="web-wp-pages">
    <div className="web-section-label">
      <span>Páginas en WordPress</span>
      <span className="web-wp-pages-tools">
        <select value={type} onChange={event => setType(event.target.value)} aria-label="Tipo de contenido"><option value="pages">Páginas</option><option value="posts">Entradas</option></select>
        <button type="button" onClick={load} disabled={state === 'loading'} aria-label="Recargar"><RiRefreshLine className={state === 'loading' ? 'web-spin' : ''} /></button>
      </span>
    </div>
    {state === 'loading' && !items.length ? <p className="web-helper">Cargando desde WordPress…</p> : null}
    {state === 'ready' && !items.length ? <p className="web-helper">No hay {type === 'pages' ? 'páginas' : 'entradas'} que este usuario pueda editar.</p> : null}
    <ul>
      {items.map(page => <li key={page.id} className={editing === page.id ? 'is-editing' : ''}>
        <div className="web-wp-page-row">
          <div className="web-wp-page-main">
            <strong>{page.title || '(sin título)'}</strong>
            <small>{page.status !== 'publish' ? `${page.status} · ` : ''}{page.seo?.title ? `SEO: ${page.seo.title}` : 'Sin título SEO propio'}{page.seo?.description ? ' · con meta description' : ''}</small>
          </div>
          <a href={page.link} target="_blank" rel="noreferrer noopener" aria-label="Abrir página"><RiExternalLinkLine /></a>
          <button type="button" onClick={() => setEditing(editing === page.id ? null : page.id)} disabled={!canManage} aria-label="Editar"><RiEditLine /></button>
        </div>
        {editing === page.id ? <WordPressPageEditor connection={connection} page={page} canManage={canManage} onError={onError} onCancel={() => setEditing(null)} onSaved={updated => { setItems(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item)); setEditing(null) }} /> : null}
      </li>)}
    </ul>
  </div>
}

function WordPressPanel({ connection, canManage, onUpdate, onError }) {
  const connector = connection.connector
  const [busy, setBusy] = useState('')
  const [showPages, setShowPages] = useState(false)

  async function run(action, path, method = 'POST') {
    if (busy || !canManage) return
    setBusy(action); onError('')
    try {
      const response = await apiFetch(`/api/web-connections/${connection.id}${path}`, { method })
      onUpdate(await readBody(response, 'La operación con WordPress falló.'))
    } catch (err) { onError(err.message) } finally { setBusy('') }
  }

  return <section className="web-wp-panel">
    <div className="web-section-label"><span><RiWordpressLine /> Conector WordPress</span><small>{connector?.canEdit ? `Conectado como ${connector.username || 'usuario'}` : 'No conectado'}</small></div>
    {!connector ? <WordPressConnectForm connection={connection} canManage={canManage} onConnected={onUpdate} onError={onError} /> : <>
      <div className="web-wp-status">
        <div className={connector.canEdit ? 'is-ok' : 'is-bad'}><RiCheckLine /><span><strong>API REST</strong><small>{connector.canEdit ? 'Credencial válida con permiso de edición' : 'La credencial dejó de funcionar: vuelve a conectar'}</small></span></div>
        <div className={connector.plugin ? 'is-ok' : ''}><RiPlugLine /><span><strong>Plugin Vendrava Connect</strong><small>{connector.plugin ? `v${connector.pluginVersion || '?'}${connector.seoPlugin && connector.seoPlugin !== 'none' ? ` · SEO por ${connector.seoPlugin}` : ' · SEO propio'}` : 'No instalado: hace falta para SEO y script automático'}</small></span></div>
        <div className={connector.scriptInstalled ? 'is-ok' : ''}><RiCodeLine /><span><strong>Script universal</strong><small>{connector.scriptInstalled ? 'Instalado desde el plugin' : connector.plugin ? 'Listo para instalar con un clic' : 'Pega el snippet en el tema o instala el plugin'}</small></span></div>
      </div>
      <div className="web-wp-actions">
        {connector.plugin && !connector.scriptInstalled ? <button type="button" className="conn-button primary" onClick={() => run('script', '/wordpress/install-script')} disabled={!canManage || Boolean(busy)}>{busy === 'script' ? <><RiLoader4Line className="web-spin" /> Instalando…</> : <><RiCodeLine /> Instalar script vía plugin</>}</button> : null}
        <button type="button" className="conn-button secondary" onClick={() => setShowPages(value => !value)} disabled={!connector.canEdit}><RiEditLine /> {showPages ? 'Ocultar páginas' : 'Editar páginas'}</button>
        <button type="button" className="conn-button ghost" onClick={() => run('verify', '/wordpress/verify')} disabled={!canManage || Boolean(busy)}>{busy === 'verify' ? <RiLoader4Line className="web-spin" /> : <RiRefreshLine />} Comprobar</button>
        <button type="button" className="conn-button ghost" onClick={() => run('disconnect', '/wordpress', 'DELETE')} disabled={!canManage || Boolean(busy)}>Desconectar</button>
      </div>
      {!connector.canEdit ? <WordPressConnectForm connection={connection} canManage={canManage} onConnected={onUpdate} onError={onError} /> : null}
      {showPages && connector.canEdit ? <WordPressPages connection={connection} canManage={canManage} onError={onError} /> : null}
    </>}
  </section>
}

/* ── Git / GitHub ─────────────────────────────────────────────────────── */

function GitConnectForm({ connection, canManage, onConnected, onError }) {
  const [repository, setRepository] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (busy || !canManage || !repository.trim() || !token.trim()) return
    setBusy(true); onError('')
    try {
      const response = await apiFetch(`/api/web-connections/${connection.id}/git/connect`, { method: 'POST', body: JSON.stringify({ repository: repository.trim(), token: token.trim() }) })
      const body = await readBody(response, 'No se pudo conectar el repositorio.')
      setToken('')
      onConnected(body)
    } catch (err) { onError(err.message) } finally { setBusy(false) }
  }

  return <form className="web-wp-form" onSubmit={submit}>
    <p className="web-helper">Crea en GitHub un <strong>token fine-grained</strong> (Settings → Developer settings → Personal access tokens) limitado a este repositorio, con <strong>Contents</strong> y <strong>Pull requests</strong> en lectura y escritura. Se guarda cifrado y solo se usa para esta web.</p>
    <div className="web-wp-fields">
      <label><span>Repositorio</span><input type="text" autoComplete="off" value={repository} onChange={event => setRepository(event.target.value)} placeholder="https://github.com/empresa/web" disabled={!canManage || busy} /></label>
      <label><span>Token de GitHub</span><input type="password" autoComplete="new-password" value={token} onChange={event => setToken(event.target.value)} placeholder="github_pat_…" disabled={!canManage || busy} /></label>
    </div>
    <button type="submit" className="conn-button primary" disabled={!canManage || busy || !repository.trim() || !token.trim()}><RiGitBranchLine /> {busy ? 'Comprobando…' : 'Conectar repositorio'}</button>
  </form>
}

function GitProposalItem({ connection, proposal, canManage, onChange, onError }) {
  const meta = PROPOSAL_STATUS[proposal.status] || PROPOSAL_STATUS.queued
  const [busy, setBusy] = useState('')

  async function refresh() {
    if (busy) return
    setBusy('refresh'); onError('')
    try {
      const response = await apiFetch(`/api/web-connections/${connection.id}/git/proposals/${proposal.id}?refresh=1`)
      onChange(await readBody(response, 'No se pudo consultar el pull request.'))
    } catch (err) { onError(err.message) } finally { setBusy('') }
  }

  async function close() {
    if (busy || !canManage) return
    setBusy('close'); onError('')
    try {
      const response = await apiFetch(`/api/web-connections/${connection.id}/git/proposals/${proposal.id}/close`, { method: 'POST' })
      onChange(await readBody(response, 'No se pudo cerrar el pull request.'))
    } catch (err) { onError(err.message) } finally { setBusy('') }
  }

  return <li className={`web-proposal is-${meta.tone}`}>
    <div className="web-proposal-head">
      <div><strong>{proposal.title}</strong><small>{relativeTime(proposal.createdAt)}{proposal.source === 'seo' ? ' · desde SEO' : ''}{proposal.branch ? ` · ${proposal.branch}` : ''}</small></div>
      <span className={`web-status is-${meta.tone}`}><i />{meta.label}</span>
    </div>
    {proposal.summary ? <p className="web-proposal-summary">{proposal.summary}</p> : null}
    {proposal.error ? <p className="web-proposal-error"><RiErrorWarningLine /> {proposal.error}</p> : null}
    {proposal.files?.length ? <ul className="web-proposal-files">{proposal.files.map(file => <li key={file.path}><code>{file.path}</code><span>{file.action === 'created' ? 'nuevo' : 'modificado'} · +{file.additions} −{file.deletions}</span></li>)}</ul> : null}
    <div className="web-proposal-actions">
      {proposal.prUrl ? <a className="conn-button primary" href={proposal.prUrl} target="_blank" rel="noreferrer noopener"><RiExternalLinkLine /> Revisar en GitHub{proposal.checksStatus && proposal.status === 'proposed' ? ` · ${CHECKS_LABEL[proposal.checksStatus] || proposal.checksStatus}` : ''}</a> : null}
      {proposal.prNumber ? <button type="button" className="conn-button ghost" onClick={refresh} disabled={Boolean(busy)}>{busy === 'refresh' ? <RiLoader4Line className="web-spin" /> : <RiRefreshLine />} Actualizar</button> : null}
      {proposal.status === 'proposed' ? <button type="button" className="conn-button ghost" onClick={close} disabled={!canManage || Boolean(busy)}>{busy === 'close' ? 'Cerrando…' : 'Cerrar sin fusionar'}</button> : null}
    </div>
  </li>
}

function GitProposals({ connection, canManage, onError }) {
  const [items, setItems] = useState([])
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/web-connections/${connection.id}/git/proposals`)
      const body = await readBody(response, 'No se pudieron cargar las propuestas.')
      setItems(Array.isArray(body.items) ? body.items : [])
    } catch (err) { onError(err.message) }
  }, [connection.id, onError])

  useEffect(() => { load() }, [load])

  // Mientras el agente trabaja en el worker, la lista se refresca sola.
  const active = items.some(item => item.status === 'queued' || item.status === 'running')
  useEffect(() => {
    if (!active) return undefined
    const timer = window.setInterval(load, 5000)
    return () => window.clearInterval(timer)
  }, [active, load])

  async function propose(event) {
    event.preventDefault()
    if (busy || !canManage || instructions.trim().length < 10) return
    setBusy(true); onError('')
    try {
      const response = await apiFetch(`/api/web-connections/${connection.id}/git/proposals`, { method: 'POST', body: JSON.stringify({ instructions: instructions.trim() }) })
      const created = await readBody(response, 'No se pudo crear la propuesta.')
      setItems(current => [created, ...current])
      setInstructions('')
    } catch (err) { onError(err.message) } finally { setBusy(false) }
  }

  const replace = updated => setItems(current => current.map(item => item.id === updated.id ? updated : item))

  return <div className="web-git-proposals">
    <form className="web-git-propose" onSubmit={propose}>
      <label><span>Describe el cambio</span><textarea rows={3} value={instructions} onChange={event => setInstructions(event.target.value)} maxLength={8000} placeholder="Ej.: cambia el título de la portada a «Fontanería urgente en Madrid» y actualiza la meta description con el teléfono 600 000 000." disabled={!canManage || busy} /></label>
      <div className="web-wp-editor-actions">
        <small className="web-helper">El agente lee el código, prepara el cambio y abre un pull request. No toca la rama principal.</small>
        <button type="submit" className="conn-button primary" disabled={!canManage || busy || instructions.trim().length < 10}>{busy ? <><RiLoader4Line className="web-spin" /> Encolando…</> : <><RiGitBranchLine /> Proponer pull request</>}</button>
      </div>
    </form>
    {items.length ? <ul className="web-proposal-list">{items.map(item => <GitProposalItem key={item.id} connection={connection} proposal={item} canManage={canManage} onChange={replace} onError={onError} />)}</ul> : <p className="web-helper">Aún no hay propuestas para este repositorio.</p>}
  </div>
}

function GitPanel({ connection, canManage, onUpdate, onError }) {
  const connector = connection.connector?.kind === 'git' ? connection.connector : null
  const [busy, setBusy] = useState('')

  async function run(action, path, method = 'POST') {
    if (busy || !canManage) return
    setBusy(action); onError('')
    try {
      const response = await apiFetch(`/api/web-connections/${connection.id}${path}`, { method })
      onUpdate(await readBody(response, 'La operación con GitHub falló.'))
    } catch (err) { onError(err.message) } finally { setBusy('') }
  }

  return <section className="web-wp-panel">
    <div className="web-section-label"><span><RiGitBranchLine /> Repositorio y pull requests</span><small>{connector ? `${connector.owner}/${connector.repo} · rama ${connector.defaultBranch}` : 'No conectado'}</small></div>
    {!connector ? <GitConnectForm connection={connection} canManage={canManage} onConnected={onUpdate} onError={onError} /> : <>
      <div className="web-wp-status">
        <div className={connector.canPush ? 'is-ok' : 'is-bad'}><RiCheckLine /><span><strong>Acceso al repositorio</strong><small>{connector.canPush ? `Puede crear ramas y pull requests${connector.username ? ` como ${connector.username}` : ''}` : 'El token ya no puede escribir: vuelve a conectar'}</small></span></div>
        <div className="is-ok"><RiShieldCheckLine /><span><strong>Rama principal intacta</strong><small>Cada cambio va en una rama vendrava/… y un PR</small></span></div>
        <div className={connector.isPrivate ? 'is-ok' : ''}><RiGitBranchLine /><span><strong>{connector.isPrivate ? 'Repositorio privado' : 'Repositorio público'}</strong><small><a href={connector.htmlUrl || `https://github.com/${connector.owner}/${connector.repo}`} target="_blank" rel="noreferrer noopener">Abrir en GitHub</a></small></span></div>
      </div>
      <div className="web-wp-actions">
        <button type="button" className="conn-button ghost" onClick={() => run('verify', '/git/verify')} disabled={!canManage || Boolean(busy)}>{busy === 'verify' ? <RiLoader4Line className="web-spin" /> : <RiRefreshLine />} Comprobar</button>
        <button type="button" className="conn-button ghost" onClick={() => run('disconnect', '/git', 'DELETE')} disabled={!canManage || Boolean(busy)}>Desconectar</button>
      </div>
      {!connector.canPush ? <GitConnectForm connection={connection} canManage={canManage} onConnected={onUpdate} onError={onError} /> : <GitProposals connection={connection} canManage={canManage} onError={onError} />}
    </>}
  </section>
}

function WebsiteConnectionCard({ connection, canManage, onModeChange, onUpdate, onError }) {
  const status = statusMeta(connection.status)
  const modes = Array.isArray(connection.availableModes) ? connection.availableModes : ['script']
  const connectorKind = connection.connector?.kind || null
  const isGit = connectorKind === 'git' || (!connectorKind && connection.connectionMode === 'git')
  const isWordPress = connectorKind === 'wordpress' || (!connectorKind && connection.technology === 'wordpress')
  return <article className="web-connection-card">
    <header className="web-card-header">
      <div className="web-domain-mark"><RiGlobalLine /></div>
      <div className="web-card-title"><div><h3>{connection.domain}</h3><a href={connection.websiteUrl} target="_blank" rel="noreferrer noopener">{connection.websiteUrl} <RiExternalLinkLine /></a></div><span className={`web-status is-${status.tone}`}><i />{status.label}</span></div>
    </header>
    <div className="web-detection"><span>Detectada</span><strong>{connection.technologyLabel}</strong><small>{formatCheckedAt(connection.lastCheckedAt)}</small></div>
    <SignalsBlock connection={connection} />
    <div className="web-card-section"><div className="web-section-label"><span>Qué podemos hacer ahora</span><small>{connection.capabilities.filter(item => item.available).length}/{connection.capabilities.length} capacidades</small></div><CapabilityList capabilities={connection.capabilities} /></div>
    <div className="web-card-section"><div className="web-section-label"><span>Canal de acceso</span><small>Selecciona cómo quieres conectarla</small></div><div className="web-mode-list">{modes.map(mode => <ModePill key={mode} mode={mode} active={connection.connectionMode === mode} recommended={connection.recommendedMode === mode} onClick={onModeChange} disabled={!canManage} />)}</div></div>
    {isWordPress ? <WordPressPanel connection={connection} canManage={canManage} onUpdate={onUpdate} onError={onError} /> : null}
    {isGit ? <GitPanel connection={connection} canManage={canManage} onUpdate={onUpdate} onError={onError} /> : null}
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

  const replaceConnection = useCallback(updated => {
    if (!updated?.id) return
    setConnections(current => current.map(item => item.id === updated.id ? updated : item))
  }, [])
  const showError = useCallback(message => setError(message || ''), [])

  async function discover(event) {
    event.preventDefault()
    if (busy || !website.trim() || !canManage) return
    setBusy(true); setError('')
    try {
      const response = await apiFetch('/api/web-connections/discover', { method: 'POST', body: JSON.stringify({ website: website.trim() }) })
      await readBody(response, 'No se pudo analizar esa web.')
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
      replaceConnection(await readBody(response, 'No se pudo cambiar el canal.'))
    } catch (err) { setError(err.message || 'No se pudo cambiar el canal.') }
  }

  const stats = useMemo(() => ({
    sites: connections.length,
    deep: connections.filter(item => item.capabilities?.some(capability => capability.id === 'content' && capability.available)).length,
    verified: connections.filter(item => item.signals?.verified).length,
  }), [connections])

  if (state === 'loading') return <PageLoadingState label="Cargando conexiones web" />

  return <main className="conn-page web-connections-page dark-scroll">
    <header className="web-connections-header">
      <div className="web-title-block"><div className="web-title-icon"><RiGlobalLine /></div><div><span className="web-eyebrow">Web universal</span><h1>Conecta la web del cliente</h1><p>Una entrada para cualquier tecnología: empezamos con una capa universal y profundizamos cuando el sitio lo permite. Hoy la edición profunda está disponible para WordPress.</p></div></div>
      <button type="button" className="conn-button ghost" onClick={() => navigate('/conexiones')}><RiPlugLine /> Proveedores <RiArrowRightLine /></button>
    </header>

    <section className="web-hero-grid">
      <div className="web-discovery-card"><div className="web-section-label"><span>1 · Añadir una web</span><small>Solo analizamos contenido público</small></div><form onSubmit={discover}><label htmlFor="website-url">Dominio del cliente</label><div className="web-url-input"><RiGlobalLine /><input id="website-url" type="url" value={website} onChange={event => setWebsite(event.target.value)} placeholder="https://cliente.com" disabled={!canManage || busy} /><button type="submit" className="conn-button primary" disabled={!canManage || busy || !website.trim()}>{busy ? <><RiLoader4Line className="web-spin" /> Analizando…</> : <><RiRefreshLine /> Analizar y conectar</>}</button></div><small className="web-helper">Detectaremos la plataforma, las capacidades disponibles y el canal más sencillo para instalar Vendrava.</small></form></div>
      <div className="web-trust-card"><div className="web-trust-icon"><RiShieldCheckLine /></div><div><strong>Controlado y reversible</strong><p>La detección no modifica la web. Cada edición en WordPress registra el antes y el después en el historial de auditoría, y las credenciales se guardan cifradas.</p></div></div>
    </section>

    {!canManage ? <div className="web-banner is-info"><RiShieldCheckLine /> Tienes acceso de lectura. Un administrador debe añadir o cambiar conexiones web.</div> : null}
    {error ? <div className="web-banner is-error" role="alert"><RiErrorWarningLine /> {error}<button type="button" onClick={() => setError('')} aria-label="Cerrar">×</button></div> : null}

    {state === 'error' ? <div className="conn-state error"><RiErrorWarningLine /><strong>No se pudieron cargar las conexiones web.</strong><button type="button" className="conn-button secondary" onClick={loadConnections}>Reintentar</button></div> : null}
    {state === 'ready' && connections.length === 0 ? <div className="web-empty-state"><RiGlobalLine /><strong>Aún no hay webs conectadas</strong><span>Añade el primer dominio y Vendrava te dirá si conviene usar script, plugin, API, Git, SFTP o edge.</span></div> : null}
    {connections.length > 0 ? <>
      <section className="web-stat-row" aria-label="Resumen de conexiones"><div><strong>{stats.sites}</strong><span>{stats.sites === 1 ? 'web conectada' : 'webs conectadas'}</span></div><div><strong>{stats.deep}</strong><span>con edición profunda</span></div><div><strong>{stats.verified}</strong><span>enviando señales</span></div></section>
      <section className="web-connections-list" aria-label="Webs conectadas">{connections.map(connection => <WebsiteConnectionCard key={connection.id} connection={connection} canManage={canManage} onModeChange={mode => chooseMode(connection, mode)} onUpdate={replaceConnection} onError={showError} />)}</section>
    </> : null}
  </main>
}
