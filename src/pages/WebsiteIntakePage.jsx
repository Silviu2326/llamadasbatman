import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAlertLine, RiArrowRightLine, RiBuilding2Line, RiCheckLine, RiCloseLine,
  RiDoubleQuotesL, RiErrorWarningLine, RiExternalLinkLine, RiGlobalLine,
  RiLoader4Line, RiMagicLine, RiRefreshLine, RiShieldCheckLine, RiTeamLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import './website-intake.css'

const SCOPES = [
  { id: 'profile', label: 'Perfil y catálogo', detail: 'Ficha de empresa, cliente ideal, propuesta de valor, ofertas y guardarraíles.' },
  { id: 'team', label: 'Equipo', detail: 'Personas con email publicado en la web, para darles acceso.' },
  { id: 'knowledge', label: 'Base de conocimiento', detail: 'Fichas de consulta que el agente usa en llamada.' },
  { id: 'crm', label: 'Cuenta y contactos', detail: 'Ficha de empresa y contactos en el CRM.' },
]

const ROLES = [
  { value: 'viewer', label: 'Solo lectura' },
  { value: 'agent', label: 'Agente' },
  { value: 'sales_rep', label: 'Comercial' },
  { value: 'marketing_growth', label: 'Marketing' },
  { value: 'admin', label: 'Administrador' },
]

const PROFILE_FIELDS = [
  { path: 'company.name', label: 'Nombre de la empresa', long: false },
  { path: 'company.industry', label: 'Sector', long: false },
  { path: 'company.email', label: 'Email de contacto', long: false },
  { path: 'company.phone', label: 'Teléfono', long: false },
  { path: 'company.address', label: 'Dirección', long: false },
  { path: 'profile.description', label: 'Descripción del negocio', long: true },
  { path: 'profile.idealCustomer', label: 'Cliente ideal', long: true },
  { path: 'profile.valueProposition', label: 'Propuesta de valor', long: true },
  { path: 'profile.differentiators', label: 'Diferenciales (uno por línea)', long: true, list: true },
  { path: 'profile.commercialGuardrails.discountPolicy', label: 'Política de descuentos', long: true },
  { path: 'profile.commercialGuardrails.paymentTerms', label: 'Condiciones de pago', long: true },
  { path: 'profile.commercialGuardrails.guarantees', label: 'Garantías', long: true },
  { path: 'profile.commercialGuardrails.forbiddenClaims', label: 'Afirmaciones prohibidas', long: true },
]

function readPath(proposal, path) {
  return path.split('.').reduce((node, key) => (node ? node[key] : undefined), proposal)
}

function money(cents, currency) {
  if (cents === null || cents === undefined) return 'Sin precio'
  return `${(cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

function Evidence({ source, verified }) {
  if (!source) return <span className="intake-badge is-inferred">Redactado por el modelo · sin cita</span>
  return <div className="intake-evidence">
    <span className={`intake-badge${verified ? ' is-verified' : ' is-inferred'}`}>
      {verified ? <><RiShieldCheckLine /> Cita verificada en la web</> : 'Cita no encontrada en la web'}
    </span>
    <blockquote><RiDoubleQuotesL /> {source.quote}</blockquote>
    <a href={source.url} target="_blank" rel="noreferrer">{source.url} <RiExternalLinkLine /></a>
  </div>
}

export default function WebsiteIntakePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const readOnly = user?.role === 'viewer'

  const [website, setWebsite] = useState('')
  const [scopes, setScopes] = useState(SCOPES.map(scope => scope.id))
  const [current, setCurrent] = useState(null)
  const [run, setRun] = useState(null)
  const [draft, setDraft] = useState(null)
  const [picked, setPicked] = useState(null)
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef(null)

  useEffect(() => {
    apiFetch('/api/settings/business-profile')
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (!data) return
        setCurrent(data)
        if (data.company?.website) setWebsite(data.company.website)
      })
      .catch(() => {})
    return () => window.clearTimeout(pollRef.current)
  }, [])

  const proposal = run?.proposal ?? null

  // La propuesta llega como valores + respaldo; el borrador es lo que la
  // persona edita antes de aplicar. Todo lo que trae contenido entra marcado:
  // revisar es quitar, no volver a escribir.
  useEffect(() => {
    if (!proposal) { setDraft(null); setPicked(null); return }
    const fields = {}
    const fieldPicks = {}
    for (const field of PROFILE_FIELDS) {
      const node = readPath(proposal, field.path)
      const value = field.list ? (node?.value ?? []).join('\n') : (node?.value ?? '')
      fields[field.path] = value
      fieldPicks[field.path] = Boolean(value)
    }
    setDraft({
      fields,
      offers: proposal.profile.offers.map(offer => ({ ...offer })),
      team: proposal.team.map(member => ({ ...member, role: member.suggestedRole })),
      knowledge: proposal.knowledge.map(entry => ({ ...entry })),
      account: proposal.crm.account ? { ...proposal.crm.account } : null,
      contacts: proposal.crm.contacts.map(contact => ({ ...contact })),
    })
    setPicked({
      fields: fieldPicks,
      offers: proposal.profile.offers.map(() => true),
      team: proposal.team.map(() => true),
      knowledge: proposal.knowledge.map(() => true),
      account: Boolean(proposal.crm.account),
      contacts: proposal.crm.contacts.map(() => true),
    })
  }, [proposal])

  function pollRun(jobId) {
    pollRef.current = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/intake/website/${jobId}`)
        if (!response.ok) throw new Error('poll_failed')
        const data = await response.json()
        setRun(data)
        if (data.status === 'succeeded' || data.status === 'failed' || data.status === 'canceled') {
          setBusy(false)
          if (data.status !== 'succeeded') setError(data.error?.message || 'El análisis no pudo completarse.')
          return
        }
        pollRun(jobId)
      } catch {
        setBusy(false)
        setError('Se perdió el seguimiento del análisis. Ábrelo desde el Centro de trabajos.')
      }
    }, 3_000)
  }

  async function analyze() {
    if (busy || !website.trim()) return
    setBusy(true); setError(''); setReport(null); setRun(null)
    try {
      const response = await apiFetch('/api/intake/website', {
        method: 'POST',
        body: JSON.stringify({ website: website.trim(), scopes }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'No se pudo lanzar el análisis.')
      setRun({ jobId: body.jobId, status: 'pending', website: website.trim(), proposal: null })
      pollRun(body.jobId)
    } catch (err) {
      setBusy(false)
      setError(err.message || 'No se pudo lanzar el análisis.')
    }
  }

  const selectedCount = useMemo(() => {
    if (!picked) return 0
    return Object.values(picked.fields).filter(Boolean).length
      + picked.offers.filter(Boolean).length
      + picked.team.filter(Boolean).length
      + picked.knowledge.filter(Boolean).length
      + (picked.account ? 1 : 0)
      + picked.contacts.filter(Boolean).length
  }, [picked])

  /**
   * El perfil se manda entero porque el backend lo sobrescribe entero: se
   * parte de lo que ya hay guardado y encima se ponen solo los campos que la
   * persona ha aceptado. Lo que no acepta, no se toca.
   */
  function buildPayload() {
    const payload = {}
    const fieldPicked = path => picked.fields[path] && draft.fields[path]?.trim()
    const anyProfile = PROFILE_FIELDS.some(field => fieldPicked(field.path)) || picked.offers.some(Boolean)

    if (anyProfile && current) {
      const company = {
        name: fieldPicked('company.name') ? draft.fields['company.name'].trim() : (current.company?.name ?? ''),
        email: fieldPicked('company.email') ? draft.fields['company.email'].trim() : (current.company?.email || null),
        website: current.company?.website || proposal.finalUrl || null,
        phone: fieldPicked('company.phone') ? draft.fields['company.phone'].trim() : (current.company?.phone || null),
        industry: fieldPicked('company.industry') ? draft.fields['company.industry'].trim() : (current.company?.industry || null),
        address: fieldPicked('company.address') ? draft.fields['company.address'].trim() : (current.company?.address || null),
        currency: current.company?.currency || 'EUR',
      }
      const prose = key => fieldPicked(`profile.${key}`)
        ? draft.fields[`profile.${key}`].trim()
        : (current.profile?.[key] ?? '')
      const guardrail = key => fieldPicked(`profile.commercialGuardrails.${key}`)
        ? draft.fields[`profile.commercialGuardrails.${key}`].trim()
        : (current.profile?.commercialGuardrails?.[key] ?? '')

      const stamp = Date.now()
      const newOffers = draft.offers
        .filter((_, index) => picked.offers[index])
        .map((offer, index) => ({
          id: `web-${stamp}-${index + 1}`,
          name: offer.name,
          description: offer.description,
          priceCents: offer.priceCents,
          currency: offer.currency,
          billingPeriod: offer.billingPeriod,
          includes: offer.includes,
          conditions: offer.conditions,
          active: offer.active,
        }))

      payload.profile = {
        company,
        description: prose('description'),
        idealCustomer: prose('idealCustomer'),
        valueProposition: prose('valueProposition'),
        differentiators: fieldPicked('profile.differentiators')
          ? draft.fields['profile.differentiators'].split('\n').map(line => line.trim()).filter(Boolean)
          : (current.profile?.differentiators ?? []),
        offers: [...(current.profile?.offers ?? []), ...newOffers].slice(0, 50),
        commercialGuardrails: {
          discountPolicy: guardrail('discountPolicy'),
          paymentTerms: guardrail('paymentTerms'),
          guarantees: guardrail('guarantees'),
          forbiddenClaims: guardrail('forbiddenClaims'),
        },
      }
    }

    const team = draft.team.filter((_, index) => picked.team[index]).map(member => ({ email: member.email, role: member.role }))
    if (team.length) payload.team = team

    const knowledge = draft.knowledge
      .filter((_, index) => picked.knowledge[index])
      .map(entry => ({ name: entry.name, content: entry.content }))
    if (knowledge.length) payload.knowledge = knowledge

    const contacts = draft.contacts
      .filter((_, index) => picked.contacts[index])
      .map(contact => ({ name: contact.name, email: contact.email, phone: contact.phone, title: contact.title }))
    if ((picked.account && draft.account) || contacts.length) {
      payload.crm = {
        ...(picked.account && draft.account ? { account: draft.account } : {}),
        ...(contacts.length ? { contacts } : {}),
      }
    }
    return payload
  }

  async function applySelection() {
    if (applying || readOnly || !draft || !picked) return
    const payload = buildPayload()
    if (!Object.keys(payload).length) { setError('No has seleccionado nada que aplicar.'); return }
    setApplying(true); setError('')
    try {
      const response = await apiFetch(`/api/intake/website/${run.jobId}/apply`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'No se pudo aplicar la propuesta.')
      setReport(body.report)
      // La ficha guardada acaba de cambiar: sin recargarla, aplicar por
      // segunda vez volvería a añadir las mismas ofertas.
      const refreshed = await apiFetch('/api/settings/business-profile')
      if (refreshed.ok) setCurrent(await refreshed.json())
    } catch (err) {
      setError(err.message || 'No se pudo aplicar la propuesta.')
    } finally { setApplying(false) }
  }

  const running = busy || (run && ['pending', 'running'].includes(run.status))

  return <main className="intake-page dark-scroll">
    <header className="intake-header">
      <div>
        <span className="intake-title-icon"><RiMagicLine /></span>
        <div>
          <h1>Rellenar desde la web</h1>
          <p>El modelo lee la web del cliente y propone su ficha. Tú revisas y decides qué se guarda.</p>
        </div>
      </div>
      <button type="button" className="intake-ghost" onClick={() => navigate('/configuracion/empresa')}>
        <RiBuilding2Line /> Ver ficha actual <RiArrowRightLine />
      </button>
    </header>

    {error ? <div className="intake-banner is-error" role="alert"><RiErrorWarningLine /> {error}<button onClick={() => setError('')} aria-label="Cerrar"><RiCloseLine /></button></div> : null}
    {readOnly ? <div className="intake-banner"><RiAlertLine /> Tienes acceso de solo lectura: puedes analizar la web, pero no aplicar la propuesta.</div> : null}

    <section className="intake-launcher">
      <label className="intake-url">
        <span>Web del cliente</span>
        <div>
          <RiGlobalLine />
          <input
            value={website}
            onChange={event => setWebsite(event.target.value)}
            placeholder="https://www.cliente.com"
            onKeyDown={event => { if (event.key === 'Enter') analyze() }}
          />
          <button type="button" onClick={analyze} disabled={running || !website.trim()}>
            {running ? <><RiLoader4Line className="intake-spin" /> Analizando…</> : <><RiMagicLine /> Analizar</>}
          </button>
        </div>
        <small>Se leen hasta 8 páginas públicas (home, servicios, precios, equipo, contacto…). No se guarda nada hasta que lo apruebes.</small>
      </label>
      <div className="intake-scopes">
        {SCOPES.map(scope => <label key={scope.id} className={scopes.includes(scope.id) ? 'is-on' : ''}>
          <input
            type="checkbox"
            checked={scopes.includes(scope.id)}
            onChange={event => setScopes(current => event.target.checked ? [...current, scope.id] : current.filter(id => id !== scope.id))}
          />
          <strong>{scope.label}</strong>
          <small>{scope.detail}</small>
        </label>)}
      </div>
    </section>

    {running ? <div className="intake-progress" role="status">
      <RiLoader4Line className="intake-spin" />
      <div>
        <strong>Leyendo {run?.website || website}…</strong>
        <span>Descarga, lectura y redacción de la propuesta. Suele tardar entre 30 y 90 segundos.</span>
      </div>
      <button type="button" className="intake-ghost" onClick={() => navigate('/trabajos')}>Ver en trabajos</button>
    </div> : null}

    {proposal && draft && picked ? <>
      <div className="intake-summary">
        <div>
          <strong>{selectedCount} elementos seleccionados</strong>
          <span>{proposal.sources.length} páginas leídas · modelo vía {proposal.providerId}</span>
        </div>
        <div className="intake-summary-actions">
          <button type="button" className="intake-ghost" onClick={analyze} disabled={running}><RiRefreshLine /> Repetir análisis</button>
          <button type="button" className="intake-apply" onClick={applySelection} disabled={readOnly || applying || !selectedCount}>
            {applying ? <><RiLoader4Line className="intake-spin" /> Aplicando…</> : <><RiCheckLine /> Aplicar seleccionado</>}
          </button>
        </div>
      </div>

      {report ? <section className="intake-card intake-report">
        <h2>Resultado</h2>
        <ul>
          <li>Ficha de empresa: <b>{report.profile.status === 'applied' ? 'guardada' : report.profile.status === 'forbidden' ? 'sin permiso' : report.profile.status === 'failed' ? `error (${report.profile.detail})` : 'sin cambios'}</b></li>
          <li>Base de conocimiento: <b>{report.knowledge.status === 'forbidden' ? 'sin permiso' : `${report.knowledge.created} fichas creadas`}</b></li>
          <li>CRM: <b>{report.crm.status === 'forbidden' ? 'sin permiso' : `${report.crm.accountId ? (report.crm.accountDeduped ? 'cuenta ya existente reutilizada' : 'cuenta creada') : 'sin cuenta'} · ${report.crm.contactsCreated} contactos`}</b></li>
          <li>Equipo: <b>{report.team.status === 'forbidden' ? 'sin permiso' : `${report.team.members.filter(member => member.status === 'added' || member.status === 'updated').length} accesos dados`}</b></li>
        </ul>
        {report.team.members.some(member => member.status === 'needs_account') ? <p className="intake-report-note">
          <RiAlertLine /> Estas personas todavía no tienen cuenta en Vendrava, así que no se les pudo dar acceso: <b>{report.team.members.filter(member => member.status === 'needs_account').map(member => member.email).join(', ')}</b>. Pídeles que se registren con ese email y vuelve a aplicar.
        </p> : null}
        {report.crm.accountId ? <button type="button" className="intake-ghost" onClick={() => navigate(`/cuentas`)}>Ver cuentas <RiArrowRightLine /></button> : null}
      </section> : null}

      {proposal.warnings.length ? <section className="intake-card intake-warnings">
        <h2><RiShieldCheckLine /> Descartado por el verificador ({proposal.warnings.length})</h2>
        <p>El código comprueba cada dato duro contra el texto de la web. Esto es lo que el modelo propuso y no pasó el filtro.</p>
        <ul>{proposal.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
      </section> : null}

      {scopes.includes('profile') ? <section className="intake-card">
        <h2>Ficha de empresa y posicionamiento</h2>
        <div className="intake-fields">
          {PROFILE_FIELDS.map(field => {
            const node = readPath(proposal, field.path)
            const value = draft.fields[field.path]
            if (!value) return null
            return <article key={field.path} className={picked.fields[field.path] ? 'intake-field is-on' : 'intake-field'}>
              <label className="intake-field-head">
                <input
                  type="checkbox"
                  checked={picked.fields[field.path]}
                  onChange={event => setPicked(state => ({ ...state, fields: { ...state.fields, [field.path]: event.target.checked } }))}
                />
                <strong>{field.label}</strong>
              </label>
              {field.long
                ? <textarea rows={field.list ? 4 : 3} value={value} onChange={event => setDraft(state => ({ ...state, fields: { ...state.fields, [field.path]: event.target.value } }))} />
                : <input value={value} onChange={event => setDraft(state => ({ ...state, fields: { ...state.fields, [field.path]: event.target.value } }))} />}
              <Evidence source={node?.source} verified={node?.verified} />
            </article>
          })}
        </div>
      </section> : null}

      {draft.offers.length ? <section className="intake-card">
        <h2>Catálogo detectado ({draft.offers.length})</h2>
        <p className="intake-card-note">Se añaden a las ofertas que ya tengas. Un precio sin cita literal en la web llega vacío a propósito.</p>
        <div className="intake-rows">
          {draft.offers.map((offer, index) => <article key={offer.id} className={picked.offers[index] ? 'intake-row is-on' : 'intake-row'}>
            <label>
              <input type="checkbox" checked={picked.offers[index]} onChange={event => setPicked(state => ({ ...state, offers: state.offers.map((value, i) => i === index ? event.target.checked : value) }))} />
              <div>
                <strong>{offer.name}</strong>
                <span>{money(offer.priceCents, offer.currency)} · {offer.description || 'Sin descripción'}</span>
              </div>
            </label>
            <Evidence source={offer.source} verified={Boolean(offer.source && offer.priceCents !== null)} />
          </article>)}
        </div>
      </section> : null}

      {draft.team.length ? <section className="intake-card">
        <h2><RiTeamLine /> Equipo detectado ({draft.team.length})</h2>
        <p className="intake-card-note">Solo personas con email publicado en la web. El acceso se da al usuario que ya tenga cuenta con ese email; el resto quedan pendientes de registrarse.</p>
        <div className="intake-rows">
          {draft.team.map((member, index) => <article key={member.email} className={picked.team[index] ? 'intake-row is-on' : 'intake-row'}>
            <label>
              <input type="checkbox" checked={picked.team[index]} onChange={event => setPicked(state => ({ ...state, team: state.team.map((value, i) => i === index ? event.target.checked : value) }))} />
              <div>
                <strong>{member.name}</strong>
                <span>{member.email}{member.title ? ` · ${member.title}` : ''}</span>
              </div>
            </label>
            <select
              value={member.role}
              onChange={event => setDraft(state => ({ ...state, team: state.team.map((item, i) => i === index ? { ...item, role: event.target.value } : item) }))}
            >
              {ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
            </select>
            <Evidence source={member.source} verified={Boolean(member.source)} />
          </article>)}
        </div>
      </section> : null}

      {draft.knowledge.length ? <section className="intake-card">
        <h2>Base de conocimiento ({draft.knowledge.length})</h2>
        <p className="intake-card-note">Cada ficha llega con la frase de la web que la sostiene. Es lo que el agente contestará por teléfono: léelas antes de aceptarlas.</p>
        <div className="intake-fields">
          {draft.knowledge.map((entry, index) => <article key={index} className={picked.knowledge[index] ? 'intake-field is-on' : 'intake-field'}>
            <label className="intake-field-head">
              <input type="checkbox" checked={picked.knowledge[index]} onChange={event => setPicked(state => ({ ...state, knowledge: state.knowledge.map((value, i) => i === index ? event.target.checked : value) }))} />
              <input
                className="intake-inline-input"
                value={entry.name}
                onChange={event => setDraft(state => ({ ...state, knowledge: state.knowledge.map((item, i) => i === index ? { ...item, name: event.target.value } : item) }))}
              />
            </label>
            <textarea
              rows={4}
              value={entry.content}
              onChange={event => setDraft(state => ({ ...state, knowledge: state.knowledge.map((item, i) => i === index ? { ...item, content: event.target.value } : item) }))}
            />
            <Evidence source={entry.source} verified />
          </article>)}
        </div>
      </section> : null}

      {draft.account || draft.contacts.length ? <section className="intake-card">
        <h2>Cuenta y contactos en el CRM</h2>
        <div className="intake-rows">
          {draft.account ? <article className={picked.account ? 'intake-row is-on' : 'intake-row'}>
            <label>
              <input type="checkbox" checked={picked.account} onChange={event => setPicked(state => ({ ...state, account: event.target.checked }))} />
              <div>
                <strong>{draft.account.name}</strong>
                <span>{[draft.account.domain, draft.account.industry, draft.account.phone].filter(Boolean).join(' · ') || 'Sin datos adicionales'}</span>
              </div>
            </label>
            <span className="intake-badge">Si ya existe una cuenta con ese dominio, se reutiliza</span>
          </article> : null}
          {draft.contacts.map((contact, index) => <article key={index} className={picked.contacts[index] ? 'intake-row is-on' : 'intake-row'}>
            <label>
              <input type="checkbox" checked={picked.contacts[index]} onChange={event => setPicked(state => ({ ...state, contacts: state.contacts.map((value, i) => i === index ? event.target.checked : value) }))} />
              <div>
                <strong>{contact.name}</strong>
                <span>{[contact.email, contact.phone, contact.title].filter(Boolean).join(' · ')}</span>
              </div>
            </label>
            <Evidence source={contact.source} verified={Boolean(contact.source)} />
          </article>)}
        </div>
        <p className="intake-card-note">Los contactos entran como ficha, sin consentimiento de canal: no se les llama ni escribe por crearlos.</p>
      </section> : null}

      <section className="intake-card intake-sources">
        <h2>Páginas leídas</h2>
        <ul>{proposal.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}<RiExternalLinkLine /></a></li>)}</ul>
      </section>
    </> : null}
  </main>
}
