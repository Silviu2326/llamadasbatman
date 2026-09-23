import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiCheckboxCircleLine, RiErrorWarningLine, RiExternalLinkLine, RiKey2Line,
  RiGlobalLine, RiLoader4Line, RiPlugLine, RiShieldFlashLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { hasNavigationPermission } from '../lib/navigationPermissions'
import { getLocale, localeCode } from '../i18n'
import PageLoadingState from '../components/ui/PageLoadingState'
import './connections-center.css'

// Estados que puede reportar credentialMetadata(); se tolera cualquier otro valor.
const STATUS_META = {
  connected: { label: 'Conectado', color: 'var(--success)' },
  active: { label: 'Conectado', color: 'var(--success)' },
  ok: { label: 'Conectado', color: 'var(--success)' },
  configured: { label: 'Conectado', color: 'var(--success)' },
  error: { label: 'Con errores', color: 'var(--danger-soft)' },
  failed: { label: 'Con errores', color: 'var(--danger-soft)' },
  expired: { label: 'Caducado', color: 'var(--warn)' },
  expiring: { label: 'Caduca pronto', color: 'var(--warn)' },
  disconnected: { label: 'Sin conectar', color: 'var(--muted)' },
  not_configured: { label: 'Sin conectar', color: 'var(--muted)' },
  none: { label: 'Sin conectar', color: 'var(--muted)' },
}

const TIER_LABELS = { draft: 'borrador', standard: 'estándar', premium: 'premium' }
const MODE_LABELS = { managed: 'Gestionado', byok: 'Tu propia clave (BYOK)' }

function statusMeta(connection) {
  const status = String(connection?.status || '').toLowerCase()
  if (!status) return { label: 'Sin conectar', color: 'var(--muted)' }
  return STATUS_META[status] || { label: connection.status, color: 'var(--info,var(--accent))' }
}

function formatCents(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return null
  return (Number(cents) / 100).toLocaleString(localeCode(getLocale()), { style: 'currency', currency: 'EUR' })
}

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(localeCode(getLocale()), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Slots de credencial del proveedor: shape tolerante (array de strings u objetos). */
function slotIds(connection) {
  const slots = connection?.slots
  if (Array.isArray(slots)) {
    const ids = slots
      .map(slot => (typeof slot === 'string' ? slot : slot?.slot || slot?.id || slot?.name || null))
      .filter(Boolean)
    if (ids.length) return ids
  }
  return ['default']
}

function primarySlot(connection) {
  const slots = Array.isArray(connection?.slots) ? connection.slots : []
  return slots.find(slot => slot?.slot === 'default') || slots[0] || null
}

function StatusBadge({ connection }) {
  const meta = statusMeta(connection)
  return <span className="conn-status" style={{ '--status': meta.color }}><i />{meta.label}</span>
}

function ProviderCard({ provider, onChanged, canManage }) {
  const byokFields = Array.isArray(provider.byokFields) ? provider.byokFields : []
  const modes = Array.isArray(provider.modes) ? provider.modes : []
  const capabilities = Array.isArray(provider.capabilities) ? provider.capabilities : []
  const connection = provider.connection || null
  const slot = primarySlot(connection)
  const usage = provider.usage || null
  const connected = ['connected', 'active', 'ok', 'configured', 'error', 'failed', 'expired', 'expiring'].includes(String(connection?.status || '').toLowerCase())

  const [formOpen, setFormOpen] = useState(false)
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState('') // '' | saving | testing | disconnecting
  const [message, setMessage] = useState(null) // { tone: 'ok'|'error'|'info', text }
  const [inboundWebhook, setInboundWebhook] = useState(null)
  const [inboundFeedback, setInboundFeedback] = useState('')

  useEffect(() => {
    if (provider.id !== 'resend' || !connected) { setInboundWebhook(null); return undefined }
    let active = true
    apiFetch('/api/integration-credentials/resend/inbound-webhook')
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar la URL de recepción.')
        if (active) setInboundWebhook(payload)
      })
      .catch(error => { if (active) setInboundWebhook({ error: error.message }) })
    return () => { active = false }
  }, [provider.id, connected])

  async function copyInboundWebhook() {
    if (!inboundWebhook?.endpoint) return
    try {
      await navigator.clipboard.writeText(inboundWebhook.endpoint)
      setInboundFeedback('URL copiada')
    } catch {
      setInboundFeedback('No se pudo copiar; selecciona y copia la URL.')
    }
  }

  const cost = formatCents(usage?.costCents)
  const quantity = usage?.quantity != null && !Number.isNaN(Number(usage.quantity))
    ? Number(usage.quantity).toLocaleString(localeCode(getLocale()))
    : null

  async function save(event) {
    event.preventDefault()
    const payload = {}
    byokFields.forEach(field => {
      const value = values[field.key]
      if (value != null && String(value).trim() !== '') payload[field.key] = String(value).trim()
    })
    const missing = byokFields.filter(field => field.required && !payload[field.key])
    if (missing.length) {
      setMessage({ tone: 'error', text: `Faltan campos obligatorios: ${missing.map(field => field.label || field.key).join(', ')}.` })
      return
    }
    setBusy('saving')
    setMessage(null)
    try {
      const response = await apiFetch(`/api/integration-credentials/${provider.id}`, { method: 'PUT', body: JSON.stringify({ secrets: payload }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage({ tone: 'error', text: body.error || body.message || `No se pudo guardar la credencial (${response.status}).` })
      } else {
        setMessage({ tone: 'ok', text: 'Credencial guardada. Desde ahora este proveedor usa tu clave (BYOK).' })
        setValues({})
        setFormOpen(false)
        onChanged()
      }
    } catch {
      setMessage({ tone: 'error', text: 'No hay conexión con el servidor. Inténtalo de nuevo.' })
    } finally {
      setBusy('')
    }
  }

  async function test() {
    setBusy('testing')
    setMessage(null)
    try {
      const response = await apiFetch(`/api/integration-credentials/${provider.id}/test`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (response.status === 501) {
        setMessage({ tone: 'info', text: 'Este proveedor no tiene prueba automática disponible.' })
      } else if (!response.ok) {
        setMessage({ tone: 'error', text: body.message || body.error || `La prueba falló (${response.status}).` })
      } else {
        setMessage(body.ok
          ? { tone: 'ok', text: body.message || 'Conexión verificada correctamente.' }
          : { tone: 'error', text: body.message || 'La prueba de conexión falló.' })
        onChanged()
      }
    } catch {
      setMessage({ tone: 'error', text: 'No hay conexión con el servidor. Inténtalo de nuevo.' })
    } finally {
      setBusy('')
    }
  }

  async function disconnect() {
    setBusy('disconnecting')
    setMessage(null)
    try {
      const [slot] = slotIds(connection)
      const response = await apiFetch(`/api/integration-credentials/${provider.id}/${encodeURIComponent(slot)}`, { method: 'DELETE' })
      if (!response.ok && response.status !== 204) {
        const body = await response.json().catch(() => ({}))
        setMessage({ tone: 'error', text: body.error || body.message || `No se pudo desconectar (${response.status}).` })
      } else {
        setMessage({ tone: 'ok', text: 'Credencial eliminada. Lo que dependa de este proveedor volverá al modo gestionado si existe, o dejará de funcionar.' })
        onChanged()
      }
    } catch {
      setMessage({ tone: 'error', text: 'No hay conexión con el servidor. Inténtalo de nuevo.' })
    } finally {
      setBusy('')
    }
  }

  return (
    <article className={`conn-card${provider.legacy ? ' legacy' : ''}`}>
      <header className="conn-card-header">
        <div>
          <h3>{provider.displayName || provider.id}</h3>
          <div className="conn-modes">
            {modes.map(mode => <span key={mode} className={`conn-mode ${mode}`}>{MODE_LABELS[mode] || mode}</span>)}
          </div>
        </div>
        <StatusBadge connection={connection} />
      </header>

      {capabilities.length > 0 && (
        <div className="conn-capabilities">
          {capabilities.map((item, index) => {
            const capability = typeof item === 'string' ? item : item?.capability
            const tier = typeof item === 'object' ? item?.qualityTier : null
            if (!capability) return null
            return (
              <span key={`${capability}-${index}`} className="conn-capability" data-i18n-skip>
                {capability}{tier ? <em>{TIER_LABELS[tier] || tier}</em> : null}
              </span>
            )
          })}
        </div>
      )}

      {provider.id === 'resend' && connected && (
        <section className="conn-inbound-setup" aria-label="Recepción de email">
          <strong>Recibir respuestas en Vendrava</strong>
          <p>Crea en Resend un webhook para <code>email.received</code> con esta dirección. Guarda su secreto de firma en la credencial de esta organización. Al actualizarla, vuelve a introducir la API key y el remitente guardados.</p>
          {inboundWebhook?.endpoint
            ? <div className="conn-inbound-endpoint"><code>{inboundWebhook.endpoint}</code><button type="button" className="conn-button ghost" onClick={copyInboundWebhook}>Copiar URL</button></div>
            : <p className="conn-inbound-pending">{inboundWebhook?.error || 'Configura la URL pública HTTPS del servidor para mostrar el endpoint.'}</p>}
          {inboundWebhook?.endpoint && <small>{inboundWebhook.ready ? 'URL, clave y secreto guardados. Falta comprobar el dominio receptor y el webhook en Resend.' : 'La clave o el secreto de firma aún no están guardados.'}{inboundFeedback && <span> · {inboundFeedback}</span>}</small>}
        </section>
      )}

      <dl className="conn-meta">
        {(cost || quantity) && (
          <div>
            <dt>Consumo este mes</dt>
            <dd>{cost || '—'}{quantity ? ` · ${quantity} usos` : ''}</dd>
          </div>
        )}
        {slot?.lastUsedAt && <div><dt>Último uso</dt><dd>{formatDate(slot.lastUsedAt)}</dd></div>}
        {(slot?.accessTokenExpiresAt || slot?.refreshTokenExpiresAt) && <div><dt>Caduca</dt><dd>{formatDate(slot.accessTokenExpiresAt || slot.refreshTokenExpiresAt)}</dd></div>}
      </dl>

      {slot?.lastError && (
        <p className="conn-message error" role="alert"><RiErrorWarningLine /> Último error: {slot.lastError}</p>
      )}

      {message && (
        <p className={`conn-message ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
          {message.tone === 'ok' ? <RiCheckboxCircleLine /> : <RiErrorWarningLine />} {message.text}
        </p>
      )}

      {formOpen && byokFields.length > 0 && (
        <form className="conn-form" onSubmit={save}>
          {byokFields.map(field => (
            <label key={field.key} className="conn-field">
              <span>{field.label || field.key}{field.required ? ' *' : ''}</span>
              <input
                type={field.kind === 'secret' ? 'password' : 'text'}
                autoComplete="off"
                placeholder={field.kind === 'secret' && connected ? 'Guardada — escribe para sustituirla' : ''}
                value={values[field.key] ?? ''}
                onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}
              />
              {field.help && <small>{field.help}</small>}
            </label>
          ))}
          <div className="conn-actions">
            <button type="submit" className="conn-button primary" disabled={busy !== ''}>
              {busy === 'saving' ? 'Guardando…' : 'Guardar credencial'}
            </button>
            <button type="button" className="conn-button ghost" disabled={busy !== ''} onClick={() => { setFormOpen(false); setValues({}) }}>Cancelar</button>
          </div>
        </form>
      )}

      <footer className="conn-actions">
        {canManage && !formOpen && byokFields.length > 0 && (
          <button type="button" className="conn-button secondary" disabled={busy !== ''} onClick={() => { setFormOpen(true); setMessage(null) }}>
            <RiKey2Line /> {connected ? 'Actualizar clave' : 'Conectar con tu clave'}
          </button>
        )}
        {canManage && connected && (
          <button type="button" className="conn-button secondary" disabled={busy !== ''} onClick={test}>
            <RiShieldFlashLine /> {busy === 'testing' ? 'Probando…' : 'Probar'}
          </button>
        )}
        {canManage && connected && (
          <button type="button" className="conn-button danger" disabled={busy !== ''} onClick={disconnect}>
            {busy === 'disconnecting' ? 'Desconectando…' : 'Desconectar'}
          </button>
        )}
        {provider.docsUrl && (
          <a className="conn-docs" href={provider.docsUrl} target="_blank" rel="noreferrer noopener">
            Documentación <RiExternalLinkLine />
          </a>
        )}
      </footer>
    </article>
  )
}

export default function ConnectionsCenterPage({ embedded = false, initialSearch = '' }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [providers, setProviders] = useState([])
  const [search, setSearch] = useState(initialSearch)
  useEffect(() => setSearch(initialSearch), [initialSearch])
  const [listState, setListState] = useState('loading') // loading | ready | empty | error
  const requestRef = useRef(0)

  const fetchCatalog = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++requestRef.current
    if (!silent) setListState('loading')
    try {
      const response = await apiFetch('/api/integration-credentials/catalog')
      if (!response.ok) throw new Error(`catalog_${response.status}`)
      const data = await response.json()
      if (requestRef.current !== requestId) return
      const items = Array.isArray(data) ? data : Array.isArray(data?.providers) ? data.providers : Array.isArray(data?.catalog) ? data.catalog : []
      setProviders(items)
      setListState(items.length ? 'ready' : 'empty')
    } catch {
      if (requestRef.current === requestId && !silent) setListState('error')
    }
  }, [])

  useEffect(() => { fetchCatalog() }, [fetchCatalog])

  const matching = providers.filter(provider => `${provider.id} ${provider.displayName}`.toLowerCase().includes(search.trim().toLowerCase()))
  const current = matching.filter(provider => !provider.legacy)
  const legacy = matching.filter(provider => provider.legacy)
  const canManage = hasNavigationPermission(user, ['integrations.manage'])

  if (listState === 'loading') return <PageLoadingState label="Cargando conexiones" />

  const Root = embedded ? 'section' : 'main'

  return (
    <Root className={`conn-page dark-scroll${embedded ? ' is-embedded' : ''}`}>
      {embedded ? <label className="conn-provider-search">Buscar proveedor<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre del proveedor…" /></label> : null}
      {listState === 'ready' && !matching.length ? <p role="status">No hay proveedores que coincidan con «{search}». Prueba otro nombre para ver los servicios disponibles.</p> : null}
      {!embedded ? <header className="conn-header">
        <div className="conn-title">
          <div className="conn-title-icon"><RiPlugLine /></div>
          <div>
            <h1>Centro de conexiones</h1>
            <p>Cada proveedor externo de la plataforma: su estado, lo que sabe hacer, lo que consume este mes y tus propias claves (BYOK).</p>
          </div>
        </div>
        <button type="button" className="conn-button primary" onClick={() => navigate('/conexiones/web')}><RiGlobalLine /> Conectar una web</button>
      </header> : null}

      {listState === 'loading' && <div className="conn-state" role="status"><RiLoader4Line className="conn-spin" /><strong>Cargando proveedores…</strong></div>}

      {listState === 'error' && (
        <div className="conn-state error" role="alert">
          <RiErrorWarningLine />
          <strong>No se pudo cargar el catálogo de proveedores.</strong>
          <span>Comprueba tu conexión o inténtalo de nuevo en unos segundos.</span>
          <button type="button" className="conn-button secondary" onClick={() => fetchCatalog()}>Reintentar</button>
        </div>
      )}

      {listState === 'empty' && (
        <div className="conn-state" role="status">
          <RiPlugLine />
          <strong>No hay proveedores en el catálogo</strong>
          <span>Cuando el backend publique el registro de proveedores, aquí podrás conectar tus propias claves, probar cada conexión y ver su consumo.</span>
        </div>
      )}

      {listState === 'ready' && (
        <>
          <section className="conn-grid" aria-label="Proveedores">
            {current.map(provider => (
              <ProviderCard key={provider.id} provider={provider} canManage={canManage} onChanged={() => fetchCatalog({ silent: true })} />
            ))}
          </section>

          {legacy.length > 0 && (
            <section aria-label="Proveedores legacy">
              <h2 className="conn-section-title">Proveedores legacy</h2>
              <p className="conn-section-note">Integraciones anteriores al registro de capacidades. Siguen funcionando con su configuración actual, pero no pasan por el router de proveedores.</p>
              <div className="conn-grid">
                {legacy.map(provider => (
                  <ProviderCard key={provider.id} provider={provider} canManage={canManage} onChanged={() => fetchCatalog({ silent: true })} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </Root>
  )
}
