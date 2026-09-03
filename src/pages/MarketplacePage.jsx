import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RiAddLine, RiArrowLeftLine, RiCheckboxCircleLine, RiErrorWarningLine, RiLoader4Line, RiPlayLine, RiStore2Line } from 'react-icons/ri'
import { useAuth } from '../contexts/AuthContext'
import { apiFetch } from '../lib/api'
import PageLoadingState from '../components/ui/PageLoadingState'
import { getEffectiveNavigationPermissions } from '../lib/navigationPermissions'
import { getLocale, localeCode } from '../i18n'
import { MARKETPLACE_HERO } from '../lib/microappArt'
import './marketplace.css'

const asArray = value => Array.isArray(value) ? value : []
const money = cents => (Number(cents || 0) / 100).toLocaleString(localeCode(getLocale()), { style: 'currency', currency: 'EUR' })

async function jsonRequest(path, options) {
  const response = await apiFetch(path, options)
  const body = response.status === 204 ? {} : await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || `La operación falló (${response.status}).`)
    error.details = body.details
    throw error
  }
  return body
}

function DependencyList({ title, values, empty }) {
  return <div className="market-deps"><strong>{title}</strong>{asArray(values).length ? <div>{values.map(value => <span key={value}>{value}</span>)}</div> : <small>{empty}</small>}</div>
}

function SellerPanel({ canManage, onPublished }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState({ slug: '', name: '', description: '', category: 'productividad', kind: 'microapp', version: '1.0.0', priceEur: '0', manifest: '{\n  "schemaVersion": 1,\n  "kind": "microapp",\n  "entrypoint": "output",\n  "permissions": [],\n  "capabilities": [],\n  "inputSchema": { "type": "object" },\n  "outputSchema": {},\n  "recipe": {\n    "nodes": [{ "id": "output", "type": "output", "input": {} }],\n    "edges": []\n  }\n}' })
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage(null)
    try {
      const manifest = JSON.parse(form.manifest)
      const priceCents = Math.round(Number(form.priceEur.replace(',', '.')) * 100)
      if (!Number.isFinite(priceCents) || priceCents < 0) throw new Error('El precio no es válido.')
      const listing = await jsonRequest('/api/marketplace/listings', { method: 'POST', body: JSON.stringify({ slug: form.slug, kind: form.kind, name: form.name, description: form.description, category: form.category }) })
      await jsonRequest(`/api/marketplace/listings/${listing.id}/versions`, { method: 'POST', body: JSON.stringify({ version: form.version, manifest, priceCents }) })
      await jsonRequest(`/api/marketplace/listings/${listing.id}/submit`, { method: 'POST' })
      setMessage({ tone: 'ok', text: 'Publicación enviada a revisión editorial.' }); onPublished()
    } catch (error) { setMessage({ tone: 'error', text: error.message }) } finally { setBusy(false) }
  }
  if (!canManage) return null
  return <section className="market-seller"><header><div><h2>Seller Studio</h2><p>Publica recetas declarativas firmadas. El equipo editorial revisa y publica.</p></div><button className="market-button secondary" type="button" onClick={() => setOpen(value => !value)}><RiAddLine /> Nueva publicación</button></header>{message && <p className={`market-message ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}{open && <form onSubmit={submit} className="market-seller-form"><label><span>Slug</span><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={set('slug')} /></label><label><span>Nombre</span><input required minLength={3} value={form.name} onChange={set('name')} /></label><label className="wide"><span>Descripción</span><textarea required minLength={10} rows={3} value={form.description} onChange={set('description')} /></label><label><span>Categoría</span><input required value={form.category} onChange={set('category')} /></label><label><span>Tipo</span><select value={form.kind} onChange={set('kind')}><option value="microapp">Microapp</option><option value="flow">Flow</option></select></label><label><span>Versión</span><input required value={form.version} onChange={set('version')} /></label><label><span>Precio (€)</span><input inputMode="decimal" value={form.priceEur} onChange={set('priceEur')} /></label><label className="wide"><span>Manifest JSON</span><textarea className="market-code" required rows={14} value={form.manifest} onChange={set('manifest')} spellCheck="false" /></label><footer className="wide"><button className="market-button primary" disabled={busy}>{busy ? 'Enviando…' : 'Crear versión y enviar a revisión'}</button></footer></form>}</section>
}

function EditorialPanel({ canManage }) {
  const [form, setForm] = useState({ listingId: '', approve: true, publish: true, notes: '' })
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  if (!canManage) return null
  async function review(event) {
    event.preventDefault(); setBusy(true); setMessage(null)
    try { await jsonRequest(`/api/marketplace/listings/${form.listingId.trim()}/review`, { method: 'POST', body: JSON.stringify({ approve: form.approve, publish: form.approve ? form.publish : false, ...(form.notes.trim() ? { notes: form.notes.trim() } : {}) }) }); setMessage({ tone: 'ok', text: 'Revisión guardada.' }) }
    catch (error) { setMessage({ tone: 'error', text: error.message }) } finally { setBusy(false) }
  }
  return <details className="market-seller market-editor"><summary>Herramientas editoriales</summary><p>Solo funcionan para correos configurados como editores en el servidor. El backend verifica firma e integridad antes de publicar.</p>{message && <p className={`market-message ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}<form className="market-seller-form" onSubmit={review}><label><span>ID de publicación en revisión</span><input required value={form.listingId} onChange={event => setForm(current => ({ ...current, listingId: event.target.value }))} /></label><label><span>Decisión</span><select value={form.approve ? 'approve' : 'reject'} onChange={event => setForm(current => ({ ...current, approve: event.target.value === 'approve' }))}><option value="approve">Aprobar</option><option value="reject">Rechazar</option></select></label>{form.approve && <label className="studio-check"><input type="checkbox" checked={form.publish} onChange={event => setForm(current => ({ ...current, publish: event.target.checked }))} /> Publicar inmediatamente</label>}<label className="wide"><span>Notas</span><textarea rows={3} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /></label><footer className="wide"><button className="market-button primary" disabled={busy}>{busy ? 'Revisando…' : 'Guardar revisión'}</button></footer></form></details>
}

function MarketplaceDetail({ id, permissions }) {
  const navigate = useNavigate()
  const [listing, setListing] = useState(null)
  const [installs, setInstalls] = useState([])
  const [state, setState] = useState('loading')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState(null)
  const [input, setInput] = useState('{}')
  const canManage = permissions.has('integrations.manage')
  const canRun = permissions.has('costs.request')
  const load = useCallback(async () => {
    setState('loading')
    try {
      const [detail, installData] = await Promise.all([jsonRequest(`/api/marketplace/${encodeURIComponent(id)}`), jsonRequest('/api/marketplace/installs')])
      setListing(detail); setInstalls(asArray(installData.installs)); setState('ready')
    } catch { setState('error') }
  }, [id])
  useEffect(() => { load() }, [load])
  const install = installs.find(item => item.listingId === listing?.id)
  const version = listing?.versions?.[0]
  async function mutate(key, path, options, success) {
    setBusy(key); setMessage(null)
    try { const result = await jsonRequest(path, options); setMessage({ tone: 'ok', text: success(result) }); await load() } catch (error) { setMessage({ tone: 'error', text: error.message }) } finally { setBusy('') }
  }
  if (state === 'loading') return <PageLoadingState label="Cargando publicación" />
  if (state !== 'ready') return <main className="market-page"><button type="button" className="market-back" onClick={() => navigate('/marketplace')}><RiArrowLeftLine /> Marketplace</button><div className="market-state error"><RiErrorWarningLine /><strong>No se pudo cargar la publicación.</strong><button className="market-button secondary" onClick={load}>Reintentar</button></div></main>
  return <main className="market-page dark-scroll"><button type="button" className="market-back" onClick={() => navigate('/marketplace')}><RiArrowLeftLine /> Marketplace</button><header className="market-detail-head"><div><span>{listing.kind} · {listing.category}</span><h1>{listing.name}</h1><p>{listing.description}</p></div><strong>{version ? money(version.priceCents) : 'Sin versión'}</strong></header>{message && <p className={`market-message ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.tone === 'ok' ? <RiCheckboxCircleLine /> : <RiErrorWarningLine />}{message.text}</p>}<section className="market-panel"><h2>Versiones publicadas</h2>{version ? <><div className="market-versions">{listing.versions.map(item => <article key={item.id}><strong>v{item.version}</strong><span>{money(item.priceCents)}</span><small className="market-mono">{item.checksum}</small></article>)}</div><dl className="market-meta"><div><dt>Versión activa</dt><dd>{version.version}</dd></div><div><dt>Checksum</dt><dd className="market-mono">{version.checksum}</dd></div><div><dt>Estado local</dt><dd>{install?.status || 'No instalada'}</dd></div></dl><DependencyList title="Capabilities" values={version.capabilityDependencies} empty="No usa proveedores externos." /><DependencyList title="Permisos" values={version.permissions} empty="No solicita permisos adicionales." /></> : <p>Esta publicación no tiene una versión instalable.</p>}<div className="market-actions">{!install || install.status === 'uninstalled' || install.status === 'disabled' ? <button className="market-button primary" disabled={!canManage || busy} onClick={() => mutate('install', `/api/marketplace/listings/${listing.id}/install`, { method: 'POST', body: JSON.stringify({ versionId: version?.id }) }, () => install?.status === 'disabled' ? 'Instalación reactivada.' : 'Instalada correctamente.')}>{install?.status === 'disabled' ? 'Reactivar' : 'Instalar'}</button> : <><button className="market-button secondary" disabled={!canManage || busy} onClick={() => mutate('disable', `/api/marketplace/listings/${listing.id}/disable`, { method: 'POST' }, () => 'Instalación desactivada.')}>Desactivar</button><button className="market-button danger" disabled={!canManage || busy} onClick={() => mutate('remove', `/api/marketplace/listings/${listing.id}/install`, { method: 'DELETE' }, () => 'Instalación eliminada.')}>Desinstalar</button></>}</div></section><section className="market-panel"><h2>Ejecutar</h2><p>La entrada se valida contra el esquema firmado de la versión instalada.</p><textarea className="market-code" rows={8} value={input} onChange={event => setInput(event.target.value)} spellCheck="false" /><div className="market-actions"><button className="market-button primary" disabled={!canRun || install?.status !== 'installed' || busy} onClick={() => { let payload; try { payload = JSON.parse(input) } catch { setMessage({ tone: 'error', text: 'La entrada no es JSON válido.' }); return } mutate('run', `/api/marketplace/listings/${listing.id}/run`, { method: 'POST', body: JSON.stringify({ input: payload }) }, result => `Ejecución lanzada: ${result.jobId}`) }}><RiPlayLine /> Ejecutar</button>{!canRun && <small>Tu rol no puede solicitar gasto.</small>}</div></section></main>
}

export default function MarketplacePage({ embedded = false }) {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const permissions = useMemo(() => getEffectiveNavigationPermissions(user), [user])
  const [listings, setListings] = useState([])
  const [installs, setInstalls] = useState([])
  const [state, setState] = useState('loading')
  const [kind, setKind] = useState('')
  const load = useCallback(async () => {
    setState('loading')
    try { const query = kind ? `?kind=${kind}` : ''; const [catalog, installed] = await Promise.all([jsonRequest(`/api/marketplace${query}`), jsonRequest('/api/marketplace/installs')]); setListings(asArray(catalog.listings)); setInstalls(asArray(installed.installs)); setState(asArray(catalog.listings).length ? 'ready' : 'empty') } catch { setState('error') }
  }, [kind])
  useEffect(() => { if (!id) load() }, [id, load])
  if (id) return <MarketplaceDetail id={id} permissions={permissions} />
  if (state === 'loading') return <PageLoadingState label="Cargando marketplace" />
  const installedIds = new Set(installs.filter(item => item.status === 'installed').map(item => item.listingId))
  const Root = embedded ? 'section' : 'main'
  return <Root className={`market-page dark-scroll${embedded ? ' is-embedded' : ''}`}>{!embedded ? <header className="market-header" style={{ backgroundImage: `url(${MARKETPLACE_HERO})` }}><div><RiStore2Line /><span><h1>Marketplace</h1><p>Recetas declarativas, versionadas y firmadas para ampliar la plataforma sin entregar código arbitrario.</p></span></div></header> : null}<div className="market-filters"><button className={!kind ? 'active' : ''} onClick={() => setKind('')}>Todo</button><button className={kind === 'microapp' ? 'active' : ''} onClick={() => setKind('microapp')}>Microapps</button><button className={kind === 'flow' ? 'active' : ''} onClick={() => setKind('flow')}>Flows</button></div>{state === 'loading' && <div className="market-state"><RiLoader4Line className="market-spin" /><strong>Cargando catálogo…</strong></div>}{state === 'error' && <div className="market-state error"><RiErrorWarningLine /><strong>Marketplace no disponible.</strong><button className="market-button secondary" onClick={load}>Reintentar</button></div>}{state === 'empty' && <div className="market-state"><RiStore2Line /><strong>No hay publicaciones con este filtro.</strong></div>}{state === 'ready' && <section className="market-grid">{listings.map(listing => { const version = listing.versions?.[0]; return <button key={listing.id} className="market-card" onClick={() => navigate(`/marketplace/${listing.slug || listing.id}`)}><div><span>{listing.kind} · {listing.category}</span>{installedIds.has(listing.id) && <em>Instalada</em>}</div><h2>{listing.name}</h2><p>{listing.description}</p><footer><small>{version ? `v${version.version}` : 'Sin versión'}</small><strong>{version ? money(version.priceCents) : '—'}</strong></footer></button>})}</section>}<SellerPanel canManage={permissions.has('integrations.manage')} onPublished={load} /><EditorialPanel canManage={permissions.has('integrations.manage')} /></Root>
}
