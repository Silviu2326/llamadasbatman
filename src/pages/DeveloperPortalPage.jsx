import { useEffect, useState } from 'react'
import { RiCheckLine, RiCodeLine, RiDeleteBinLine, RiFlashlightLine, RiKey2Line, RiLoader4Line, RiPlugLine } from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import PageLoadingState from '../components/ui/PageLoadingState'
import './developer-portal.css'

/**
 * Portal de API. La clave autentica contra la misma API que usa la interfaz, así
 * que la referencia de endpoints no es una lista aparte que mantener: son las
 * rutas del producto. Aquí sólo se documentan las de entrada más habituales.
 */
const ENDPOINTS = [
  { method: 'GET', path: '/api/developer/whoami', description: 'Comprueba la clave y devuelve organización y rol.' },
  { method: 'GET', path: '/api/leads', description: 'Lista de leads, con filtros y paginación.' },
  { method: 'POST', path: '/api/leads', description: 'Crea un lead. Dispara el evento lead.created.' },
  { method: 'GET', path: '/api/pipeline', description: 'Oportunidades y etapas del pipeline.' },
  { method: 'GET', path: '/api/calls', description: 'Llamadas con su resultado y transcripción.' },
  { method: 'GET', path: '/api/meetings', description: 'Reuniones programadas y su estado.' },
  { method: 'GET', path: '/api/agents', description: 'Agentes de IA configurados.' },
]

function formatDate(value) {
  return value ? new Date(value).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function Copyable({ value, label }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="dev-copy"
      onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }}
    >
      {copied ? <><RiCheckLine /> Copiado</> : <><RiCodeLine /> {label || 'Copiar'}</>}
    </button>
  )
}

export default function DeveloperPortalPage() {
  const [keys, setKeys] = useState([])
  const [hooks, setHooks] = useState([])
  const [topics, setTopics] = useState([])
  const [keyName, setKeyName] = useState('')
  const [freshKey, setFreshKey] = useState(null)
  const [freshSecret, setFreshSecret] = useState(null)
  const [hookTopic, setHookTopic] = useState('')
  const [hookUrl, setHookUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    const [keysResponse, hooksResponse, topicsResponse] = await Promise.all([
      apiFetch('/api/developer/keys'),
      apiFetch('/api/developer/webhooks'),
      apiFetch('/api/developer/topics'),
    ])
    setKeys(keysResponse.ok ? await keysResponse.json() : [])
    setHooks(hooksResponse.ok ? await hooksResponse.json() : [])
    const topicData = topicsResponse.ok ? await topicsResponse.json() : { topics: [] }
    setTopics(topicData.topics || [])
    setHookTopic(current => current || topicData.topics?.[0] || '')
    setLoading(false)
  }

  useEffect(() => { load().catch(() => { setError('No se pudo cargar el portal de API'); setLoading(false) }) }, [])

  async function createKey(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    const response = await apiFetch('/api/developer/keys', { method: 'POST', body: JSON.stringify({ name: keyName.trim() }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setError(data.error || 'No se pudo crear la clave'); setBusy(false); return }
    setFreshKey(data.key)
    setKeyName('')
    setNotice('Clave creada. Cópiala ahora: no vuelve a mostrarse.')
    await load(); setBusy(false)
  }

  async function revokeKey(id) {
    setBusy(true); setError('')
    const response = await apiFetch(`/api/developer/keys/${id}`, { method: 'DELETE' })
    if (response.ok) { setNotice('Clave revocada. Deja de funcionar de inmediato.'); await load() }
    else setError('No se pudo revocar la clave')
    setBusy(false)
  }

  async function createWebhook(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    const response = await apiFetch('/api/developer/webhooks', { method: 'POST', body: JSON.stringify({ topic: hookTopic, targetUrl: hookUrl.trim() }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setError(data.error || 'No se pudo crear la suscripción'); setBusy(false); return }
    setFreshSecret(data.secret)
    setHookUrl('')
    setNotice('Suscripción activa. Guarda el secreto para verificar la firma.')
    await load(); setBusy(false)
  }

  async function deleteWebhook(id) {
    setBusy(true); setError('')
    const response = await apiFetch(`/api/developer/webhooks/${id}`, { method: 'DELETE' })
    if (response.ok || response.status === 204) { setNotice('Suscripción eliminada'); await load() }
    else setError('No se pudo eliminar la suscripción')
    setBusy(false)
  }

  if (loading) return <PageLoadingState label="Cargando portal de API" />

  const origin = window.location.origin
  const curlExample = `curl ${origin}/api/developer/whoami \\\n  -H "X-API-Key: vk_tu_clave"`

  return <main className="dev-page">
    <header className="dev-header">
      <div className="dev-title">
        <span className="dev-icon"><RiPlugLine /></span>
        <div>
          <span className="dev-kicker">API pública</span>
          <h1>Conecta tu sistema con cualquier otro</h1>
          <p>Una clave de API te da acceso a la misma API que usa esta interfaz. Los webhooks avisan a Zapier, Make o a tu propio código en cuanto pasa algo.</p>
        </div>
      </div>
    </header>

    {(notice || error) && <div className={`dev-notice ${error ? 'error' : ''}`}><span>{error || notice}</span><button onClick={() => { setError(''); setNotice('') }}>×</button></div>}

    {freshKey && <div className="dev-secret">
      <div><strong>Tu clave nueva</strong><small>Solo se muestra ahora. Si la pierdes, revócala y crea otra.</small></div>
      <code>{freshKey}</code>
      <Copyable value={freshKey} label="Copiar clave" />
      <button className="dev-button ghost" onClick={() => setFreshKey(null)}>Ya la he guardado</button>
    </div>}

    <section className="dev-panel">
      <div className="dev-panel-head"><div><span className="dev-kicker">01 · Autenticación</span><h2>Claves de API</h2><p>Cada clave actúa con el rol de quien la crea: sus permisos son exactamente los tuyos.</p></div><RiKey2Line /></div>

      <form className="dev-inline-form" onSubmit={createKey}>
        <input required minLength={2} value={keyName} onChange={event => setKeyName(event.target.value)} placeholder="Nombre de la clave (p. ej. Zapier producción)" />
        <button className="dev-button primary" disabled={busy || keyName.trim().length < 2}>Crear clave</button>
      </form>

      {keys.length ? <table className="dev-table">
        <thead><tr><th>Nombre</th><th>Clave</th><th>Actúa como</th><th>Último uso</th><th>Estado</th><th /></tr></thead>
        <tbody>{keys.map(key => <tr key={key.id} className={key.revokedAt ? 'revoked' : ''}>
          <td>{key.name}</td>
          <td><code>{key.prefix}</code></td>
          <td>{key.user?.email} · {key.user?.role}</td>
          <td>{formatDate(key.lastUsedAt)}</td>
          <td>{key.revokedAt ? 'Revocada' : key.expiresAt && new Date(key.expiresAt) < new Date() ? 'Caducada' : 'Activa'}</td>
          <td>{!key.revokedAt && <button className="dev-button ghost" onClick={() => revokeKey(key.id)} disabled={busy}><RiDeleteBinLine /> Revocar</button>}</td>
        </tr>)}</tbody>
      </table> : <div className="dev-empty"><RiKey2Line /><p>Aún no hay claves. Crea la primera para empezar a integrar.</p></div>}

      <div className="dev-code-block">
        <div><strong>Prueba que funciona</strong><small>La cabecera <code>X-API-Key</code> vale en cualquier endpoint. También sirve <code>Authorization: Bearer vk_…</code>.</small></div>
        <pre>{curlExample}</pre>
        <Copyable value={curlExample} />
      </div>
    </section>

    <section className="dev-panel">
      <div className="dev-panel-head"><div><span className="dev-kicker">02 · Eventos</span><h2>Webhooks</h2><p>Te avisamos con un POST en cuanto ocurre el evento. Es lo que consume un disparador instantáneo de Zapier.</p></div><RiFlashlightLine /></div>

      {freshSecret && <div className="dev-secret">
        <div><strong>Secreto de firma</strong><small>Verifica con él la cabecera <code>X-Vendrava-Signature</code>. Solo se muestra ahora.</small></div>
        <code>{freshSecret}</code>
        <Copyable value={freshSecret} label="Copiar secreto" />
        <button className="dev-button ghost" onClick={() => setFreshSecret(null)}>Guardado</button>
      </div>}

      <form className="dev-inline-form" onSubmit={createWebhook}>
        <select value={hookTopic} onChange={event => setHookTopic(event.target.value)}>
          {topics.map(topic => <option key={topic} value={topic}>{topic}</option>)}
        </select>
        <input required type="url" value={hookUrl} onChange={event => setHookUrl(event.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/…" />
        <button className="dev-button primary" disabled={busy || !hookUrl.trim() || !hookTopic}>Suscribir</button>
      </form>

      {hooks.length ? <table className="dev-table">
        <thead><tr><th>Evento</th><th>Destino</th><th>Última entrega</th><th>Estado</th><th /></tr></thead>
        <tbody>{hooks.map(hook => <tr key={hook.id} className={hook.disabledAt ? 'revoked' : ''}>
          <td><code>{hook.topic}</code></td>
          <td className="dev-url">{hook.targetUrl}</td>
          <td>{formatDate(hook.lastDeliveredAt)}</td>
          <td>{hook.disabledAt ? `Desactivada (${hook.lastError || 'demasiados fallos'})` : hook.lastError ? `${hook.failureCount} fallos · ${hook.lastError}` : 'Activa'}</td>
          <td><button className="dev-button ghost" onClick={() => deleteWebhook(hook.id)} disabled={busy}><RiDeleteBinLine /> Borrar</button></td>
        </tr>)}</tbody>
      </table> : <div className="dev-empty"><RiFlashlightLine /><p>Sin suscripciones. Elige un evento y pega la URL que te dé Zapier.</p></div>}

      <div className="dev-code-block">
        <div><strong>Cómo verificar la firma</strong><small>La cabecera llega como <code>t=&lt;segundos&gt;,v1=&lt;hmac&gt;</code>. El HMAC es SHA-256 de <code>{'`${t}.${cuerpoCrudo}`'}</code> con tu secreto.</small></div>
        <pre>{`const [t, v1] = signature.split(',').map(part => part.split('=')[1])
const expected = crypto.createHmac('sha256', secret)
  .update(\`\${t}.\${rawBody}\`).digest('hex')
// compara expected con v1 y rechaza si t tiene más de 5 minutos`}</pre>
      </div>
    </section>

    <section className="dev-panel">
      <div className="dev-panel-head"><div><span className="dev-kicker">03 · Referencia</span><h2>Endpoints de entrada</h2><p>Los más usados para integrar. Cualquier ruta de la API acepta la misma clave y respeta los permisos del rol.</p></div><RiCodeLine /></div>
      <table className="dev-table">
        <thead><tr><th>Método</th><th>Ruta</th><th>Qué hace</th></tr></thead>
        <tbody>{ENDPOINTS.map(endpoint => <tr key={`${endpoint.method}-${endpoint.path}`}>
          <td><span className={`dev-method ${endpoint.method.toLowerCase()}`}>{endpoint.method}</span></td>
          <td><code>{endpoint.path}</code></td>
          <td>{endpoint.description}</td>
        </tr>)}</tbody>
      </table>
    </section>

    <section className="dev-panel">
      <div className="dev-panel-head"><div><span className="dev-kicker">04 · Zapier y Make</span><h2>Conectar en tres pasos</h2></div><RiPlugLine /></div>
      <ol className="dev-steps">
        <li><strong>Autenticación: API Key.</strong> En el constructor de Zapier elige «API Key», cabecera <code>X-API-Key</code>, y como prueba de credenciales <code>{origin}/api/developer/whoami</code>.</li>
        <li><strong>Disparador instantáneo.</strong> Zapier te da una URL al activar el Zap: pégala arriba con el evento que quieras. Al desactivarlo responde 410 y la damos de baja sola.</li>
        <li><strong>Acciones.</strong> Apunta a los endpoints de la tabla. Un <code>POST /api/leads</code> desde Zapier entra en el CRM como cualquier otro lead y dispara sus automatizaciones.</li>
      </ol>
      <p className="dev-note">Si prefieres consultar en vez de recibir, cualquier listado sirve como disparador por sondeo: Zapier deduplica por <code>id</code>.</p>
    </section>
  </main>
}
