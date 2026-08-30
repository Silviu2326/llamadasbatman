import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  RiAddLine,
  RiArrowLeftLine,
  RiArrowRightSLine,
  RiBuilding2Line,
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiGlobalLine,
  RiGroupLine,
  RiLoader4Line,
  RiSearchLine,
  RiShoppingCart2Line,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import PageLoadingState from '../components/ui/PageLoadingState'
import { useAuth } from '../contexts/AuthContext'
import { getEffectiveNavigationPermissions } from '../lib/navigationPermissions'
import './accounts.css'
import './sales-detail-standard.css'
import { MicroappProjectionPanel, MicroappSurfaceActions } from '../components/MicroappSurfaceActions'
import ProductPageHeader from '../components/ui/ProductPageHeader'

async function request(path, options) {
  const response = await apiFetch(path, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Error ${response.status}`)
  return body
}

function AccountCreateDialog({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', domain: '', industry: '', sizeBand: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }))
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value.trim()))
      const created = await request('/api/accounts', { method: 'POST', body: JSON.stringify(payload) })
      onCreated(created)
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  return <div className="accounts-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><form className="accounts-modal" onSubmit={submit}><header><div><strong>Nueva cuenta</strong><span>Crea la empresa y conecta después leads y oportunidades.</span></div><button type="button" onClick={onClose}>×</button></header><label><span>Nombre</span><input required autoFocus value={form.name} onChange={set('name')} /></label><div className="accounts-form-row"><label><span>Dominio</span><input placeholder="empresa.com" value={form.domain} onChange={set('domain')} /></label><label><span>Sector</span><input value={form.industry} onChange={set('industry')} /></label></div><label><span>Tamaño</span><input placeholder="1-10, 11-50, 51-200…" value={form.sizeBand} onChange={set('sizeBand')} /></label>{error ? <p role="alert">{error}</p> : null}<footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta'}</button></footer></form></div>
}

function AccountDetail({ id }) {
  const navigate = useNavigate()
  const [account, setAccount] = useState(null)
  const [state, setState] = useState('loading')
  const load = useCallback(() => {
    setState('loading')
    request(`/api/accounts/${encodeURIComponent(id)}`).then(data => { setAccount(data); setState('ready') }).catch(() => setState('error'))
  }, [id])
  useEffect(() => { load() }, [load])
  if (state === 'loading') return <PageLoadingState label="Cargando cuenta" />
  if (state !== 'ready') return <main className="accounts-page"><button className="accounts-back" onClick={() => navigate('/cuentas')}><RiArrowLeftLine /> Cuentas</button><div className={`accounts-state ${state}`} ><RiErrorWarningLine /><strong>No se pudo cargar la cuenta.</strong><button onClick={load}>Reintentar</button></div></main>
  const opportunities = account.opportunities || []
  const leads = account.leads || []
  return <main className="accounts-page dark-scroll"><button className="accounts-back" onClick={() => navigate('/cuentas')}><RiArrowLeftLine /> Todas las cuentas</button><header className="accounts-detail-header"><div className="accounts-monogram">{account.name?.slice(0, 2).toUpperCase()}</div><div><h1>{account.name}</h1><p>{[account.industry, account.sizeBand, account.domain].filter(Boolean).join(' · ') || 'Sin datos adicionales'}</p></div>{account.website ? <a href={account.website.startsWith('http') ? account.website : `https://${account.website}`} target="_blank" rel="noreferrer"><RiExternalLinkLine /> Web</a> : null}</header><section className="accounts-detail-actions"><MicroappSurfaceActions surface="account" entityId={id} /></section><MicroappProjectionPanel surface="account" entityId={id} /><div className="accounts-detail-grid"><section><header><RiGroupLine /><div><h2>Contactos</h2><span>{leads.length} vinculados</span></div></header>{leads.length ? <div className="accounts-linked-list">{leads.map(lead => <button key={lead.id} onClick={() => navigate(`/leads/${lead.id}`)}><span><strong>{lead.name}</strong><small>{lead.email || lead.phone || 'Sin contacto'}</small></span><em>{lead.status}</em><RiArrowRightSLine /></button>)}</div> : <p className="accounts-empty-copy">Todavía no hay leads vinculados a esta cuenta.</p>}</section><section><header><RiShoppingCart2Line /><div><h2>Oportunidades</h2><span>{opportunities.length} vinculadas</span></div></header>{opportunities.length ? <div className="accounts-linked-list">{opportunities.map(opportunity => <button key={opportunity.id} onClick={() => navigate(`/pipeline/${opportunity.id}`)}><span><strong>{opportunity.name}</strong><small>{Number(opportunity.value || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</small></span><em>{opportunity.stage}</em><RiArrowRightSLine /></button>)}</div> : <p className="accounts-empty-copy">Todavía no hay oportunidades vinculadas a esta cuenta.</p>}</section></div></main>
}

export default function AccountsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const permissions = useMemo(() => getEffectiveNavigationPermissions(user), [user])
  const canWrite = permissions.has('accounts.write') || ['owner', 'admin', 'administrator'].includes(String(user?.role || '').toLowerCase())
  const [accounts, setAccounts] = useState([])
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [state, setState] = useState('loading')
  const [showCreate, setShowCreate] = useState(false)
  const load = useCallback(async () => {
    setState('loading')
    try {
      const query = deferredSearch.trim() ? `?limit=100&search=${encodeURIComponent(deferredSearch.trim())}` : '?limit=100'
      const body = await request(`/api/accounts${query}`)
      setAccounts(Array.isArray(body.data) ? body.data : [])
      setState('ready')
    } catch { setState('error') }
  }, [deferredSearch])
  useEffect(() => { const timer = setTimeout(load, deferredSearch ? 220 : 0); return () => clearTimeout(timer) }, [deferredSearch, load])
  if (id) return <AccountDetail id={id} />
  if (state === 'loading') return <PageLoadingState label="Cargando cuentas" />
  return <main className="accounts-page dark-scroll"><ProductPageHeader Icon={RiBuilding2Line} title="Cuentas" description="Empresas, personas, oportunidades y trabajo comercial en un mismo contexto." actions={canWrite ? <button className="accounts-primary" onClick={() => setShowCreate(true)}><RiAddLine /> Nueva cuenta</button> : null} /><section className="accounts-toolbar"><label><RiSearchLine /><input type="search" placeholder="Buscar por nombre o dominio…" value={search} onChange={event => setSearch(event.target.value)} /></label><span>{state === 'ready' ? `${accounts.length} cuentas` : '—'}</span></section>{state === 'loading' ? <div className="accounts-state"><RiLoader4Line className="accounts-spin" /><strong>Cargando cuentas…</strong></div> : null}{state === 'error' ? <div className="accounts-state error"><RiErrorWarningLine /><strong>No se pudieron cargar las cuentas.</strong><button onClick={load}>Reintentar</button></div> : null}{state === 'ready' && !accounts.length ? <div className="accounts-state"><RiBuilding2Line /><strong>{search ? 'No hay coincidencias' : 'Todavía no hay cuentas'}</strong><span>{search ? 'Prueba con otro nombre o dominio.' : 'Crea una cuenta o vincúlala desde la ficha de un lead.'}</span></div> : null}{state === 'ready' && accounts.length ? <section className="accounts-list" aria-label="Cuentas">{accounts.map(account => <button type="button" key={account.id} onClick={() => navigate(`/cuentas/${account.id}`)}><span className="accounts-list-icon">{account.name?.slice(0, 2).toUpperCase()}</span><span className="accounts-list-main"><strong>{account.name}</strong><small>{account.domain || account.website || 'Sin dominio'}</small></span><span>{account.industry || 'Sin sector'}</span><span>{account.lifecycleStatus || 'active'}</span><RiArrowRightSLine /></button>)}</section> : null}{showCreate ? <AccountCreateDialog onClose={() => setShowCreate(false)} onCreated={account => { setShowCreate(false); navigate(`/cuentas/${account.id}`) }} /> : null}</main>
}
