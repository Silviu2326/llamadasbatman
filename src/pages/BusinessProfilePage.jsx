import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAddLine, RiArrowRightLine, RiBookOpenLine, RiBuilding2Line, RiCheckLine,
  RiCloseLine, RiDeleteBinLine, RiErrorWarningLine, RiExternalLinkLine,
  RiInformationLine, RiLoader4Line, RiMagicLine, RiRobot2Line, RiSave3Line, RiShieldCheckLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import './business-profile.css'

const EMPTY_GUARDRAILS = { discountPolicy: '', paymentTerms: '', guarantees: '', forbiddenClaims: '' }
const PERIODS = [
  { value: 'one_time', label: 'Pago único' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
  { value: 'custom', label: 'Periodo personalizado' },
]
const CURRENCIES = ['EUR', 'USD', 'GBP', 'MXN']

function emptyOffer(currency = 'EUR') {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `offer-${Date.now()}`,
    name: '', description: '', priceCents: null, currency, billingPeriod: 'monthly',
    includes: [], conditions: '', active: true,
  }
}

function normalizeResponse(data) {
  return {
    company: {
      name: data?.company?.name ?? '', email: data?.company?.email ?? '', website: data?.company?.website ?? '',
      phone: data?.company?.phone ?? '', industry: data?.company?.industry ?? '', address: data?.company?.address ?? '',
      currency: data?.company?.currency ?? 'EUR',
    },
    description: data?.profile?.description ?? '',
    idealCustomer: data?.profile?.idealCustomer ?? '',
    valueProposition: data?.profile?.valueProposition ?? '',
    differentiators: data?.profile?.differentiators ?? [],
    offers: data?.profile?.offers ?? [],
    commercialGuardrails: { ...EMPTY_GUARDRAILS, ...(data?.profile?.commercialGuardrails ?? {}) },
  }
}

function Field({ label, required, children, hint }) {
  return <label className="business-field"><span>{label}{required ? <b> *</b> : null}</span>{children}{hint ? <small>{hint}</small> : null}</label>
}

function TextInput({ value, onChange, ...props }) {
  return <input value={value ?? ''} onChange={event => onChange(event.target.value)} {...props} />
}

function TextArea({ value, onChange, ...props }) {
  return <textarea value={value ?? ''} onChange={event => onChange(event.target.value)} {...props} />
}

function SourceCard({ Icon, title, detail, ready, action, onClick }) {
  return <article className={`business-source-card${ready ? ' is-ready' : ''}`}>
    <span className="business-source-icon"><Icon /></span>
    <div><strong>{title}</strong><small>{detail}</small></div>
    <span className="business-source-state">{ready ? <><RiCheckLine /> Listo</> : 'Pendiente'}</span>
    {onClick ? <button type="button" onClick={onClick}>{action} <RiExternalLinkLine /></button> : null}
  </article>
}

export default function BusinessProfilePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const readOnly = user?.role === 'viewer'
  const [form, setForm] = useState(null)
  const [readiness, setReadiness] = useState(null)
  const [initialSnapshot, setInitialSnapshot] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadProfile = async () => {
    setLoading(true); setError('')
    try {
      const response = await apiFetch('/api/settings/business-profile')
      if (!response.ok) throw new Error(`profile_${response.status}`)
      const data = await response.json()
      const next = normalizeResponse(data)
      setForm(next); setReadiness(data.readiness); setInitialSnapshot(JSON.stringify(next))
    } catch {
      setError('No se pudo cargar la información de empresa. Comprueba la conexión y vuelve a intentarlo.')
    } finally { setLoading(false) }
  }

  useEffect(() => { loadProfile() }, [])

  const dirty = form ? JSON.stringify(form) !== initialSnapshot : false
  const completedRequired = useMemo(() => form ? [form.company.name, form.description, form.idealCustomer, form.valueProposition].filter(value => value.trim()).length : 0, [form])
  const activeOffers = useMemo(() => form?.offers.filter(offer => offer.active && offer.name.trim()).length ?? 0, [form])

  const updateCompany = (key, value) => setForm(current => ({ ...current, company: { ...current.company, [key]: value } }))
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const updateGuardrail = (key, value) => setForm(current => ({ ...current, commercialGuardrails: { ...current.commercialGuardrails, [key]: value } }))
  const updateOffer = (id, changes) => setForm(current => ({ ...current, offers: current.offers.map(offer => offer.id === id ? { ...offer, ...changes } : offer) }))
  const removeOffer = id => setForm(current => ({ ...current, offers: current.offers.filter(offer => offer.id !== id) }))

  async function save() {
    if (!form || readOnly || saving) return
    if (!form.company.name.trim()) { setError('El nombre de la empresa es obligatorio.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      const response = await apiFetch('/api/settings/business-profile', { method: 'PUT', body: JSON.stringify(form) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'save_failed')
      const next = normalizeResponse(body)
      setForm(next); setReadiness(body.readiness); setInitialSnapshot(JSON.stringify(next))
      setNotice('Información guardada. Todos los agentes la usarán en su próxima llamada.')
      window.setTimeout(() => setNotice(''), 4200)
    } catch {
      setError('No se pudieron guardar los cambios. Revisa los campos de contacto y precios.')
    } finally { setSaving(false) }
  }

  if (loading) return <main className="business-page"><div className="business-loading" role="status"><RiLoader4Line /> Cargando información de empresa…</div></main>
  if (!form) return <main className="business-page"><div className="business-error" role="alert"><RiErrorWarningLine /><strong>{error}</strong><button onClick={loadProfile}>Reintentar</button></div></main>

  return <main className="business-page dark-scroll">
    <header className="business-header">
      <div><span className="business-title-icon"><RiBuilding2Line /></span><div><h1>Información de empresa</h1><p>La fuente comercial compartida que usan todos tus agentes.</p></div></div>
      <div className="business-header-actions">
        <button className="business-secondary" type="button" onClick={() => navigate('/rellenar-desde-web')}><RiMagicLine /> Rellenar desde la web</button>
        <button className="business-save" type="button" onClick={save} disabled={readOnly || saving || !dirty}><RiSave3Line /> {saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Todo guardado'}</button>
      </div>
    </header>

    {readOnly ? <div className="business-banner"><RiInformationLine /> Tienes acceso de solo lectura. Un administrador puede actualizar esta fuente.</div> : null}
    {error ? <div className="business-banner is-error" role="alert"><RiErrorWarningLine /> {error}<button onClick={() => setError('')} aria-label="Cerrar"><RiCloseLine /></button></div> : null}

    <div className="business-layout">
      <div className="business-main">
        <section className="business-section">
          <div className="business-section-heading"><div><h2>Perfil de empresa</h2><p>Identidad, posicionamiento y contacto que el agente puede comunicar.</p></div><span>{completedRequired}/4 campos esenciales</span></div>
          <div className="business-profile-grid">
            <div className="business-field-column">
              <Field label="Nombre de la empresa" required><TextInput value={form.company.name} onChange={value => updateCompany('name', value)} /></Field>
              <Field label="A qué se dedica la empresa" required><TextArea rows="3" value={form.description} onChange={value => update('description', value)} /></Field>
              <Field label="Cliente ideal" required><TextArea rows="3" value={form.idealCustomer} onChange={value => update('idealCustomer', value)} /></Field>
              <Field label="Propuesta de valor" required><TextArea rows="3" value={form.valueProposition} onChange={value => update('valueProposition', value)} /></Field>
              <Field label="Diferenciadores clave" hint="Uno por línea"><TextArea rows="4" value={form.differentiators.join('\n')} onChange={value => update('differentiators', value.split('\n').map(item => item.trim()).filter(Boolean))} /></Field>
            </div>
            <div className="business-field-column">
              <div className="business-subheading"><h3>Datos de contacto</h3><p>Solo se compartirán cuando resulte útil en la conversación.</p></div>
              <Field label="Sitio web"><TextInput type="url" value={form.company.website} onChange={value => updateCompany('website', value)} placeholder="https://empresa.com" /></Field>
              <Field label="Correo de contacto"><TextInput type="email" value={form.company.email} onChange={value => updateCompany('email', value)} /></Field>
              <Field label="Teléfono"><TextInput value={form.company.phone} onChange={value => updateCompany('phone', value)} /></Field>
              <Field label="Sector"><TextInput value={form.company.industry} onChange={value => updateCompany('industry', value)} /></Field>
              <Field label="Dirección"><TextArea rows="3" value={form.company.address} onChange={value => updateCompany('address', value)} /></Field>
              <Field label="Moneda principal"><select value={form.company.currency} onChange={event => updateCompany('currency', event.target.value)}>{CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></Field>
            </div>
          </div>
        </section>

        <section className="business-section business-catalogue">
          <div className="business-section-heading"><div><h2>Catálogo y precios</h2><p>Define exactamente qué obtiene el cliente por cada precio.</p></div><button type="button" className="business-secondary" onClick={() => update('offers', [...form.offers, emptyOffer(form.company.currency)])}><RiAddLine /> Añadir oferta</button></div>
          <div className="business-offer-head" aria-hidden="true"><span>Oferta</span><span>Descripción</span><span>Precio exacto</span><span>Facturación</span><span>Qué incluye</span><span /></div>
          <div className="business-offers">
            {form.offers.length ? form.offers.map((offer, index) => <article className="business-offer-row" key={offer.id}>
              <span className="business-offer-index">{index + 1}</span>
              <TextInput aria-label={`Nombre de la oferta ${index + 1}`} value={offer.name} onChange={value => updateOffer(offer.id, { name: value })} placeholder="Nombre de la oferta" />
              <TextArea aria-label={`Descripción de la oferta ${index + 1}`} rows="3" value={offer.description} onChange={value => updateOffer(offer.id, { description: value })} placeholder="Para quién es y qué resuelve" />
              <div className="business-price-input"><input aria-label={`Precio de la oferta ${index + 1}`} type="number" min="0" step="0.01" value={offer.priceCents === null ? '' : offer.priceCents / 100} onChange={event => updateOffer(offer.id, { priceCents: event.target.value === '' ? null : Math.round(Number(event.target.value) * 100) })} placeholder="A consultar" /><select aria-label={`Moneda de la oferta ${index + 1}`} value={offer.currency} onChange={event => updateOffer(offer.id, { currency: event.target.value })}>{CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></div>
              <select aria-label={`Periodo de facturación ${index + 1}`} value={offer.billingPeriod} onChange={event => updateOffer(offer.id, { billingPeriod: event.target.value })}>{PERIODS.map(period => <option key={period.value} value={period.value}>{period.label}</option>)}</select>
              <TextArea aria-label={`Qué incluye la oferta ${index + 1}`} rows="4" value={offer.includes.join('\n')} onChange={value => updateOffer(offer.id, { includes: value.split('\n').map(item => item.trim()).filter(Boolean) })} placeholder={'Una prestación por línea'} />
              <div className="business-offer-actions"><label><input type="checkbox" checked={offer.active} onChange={event => updateOffer(offer.id, { active: event.target.checked })} /> Activa</label><button type="button" onClick={() => removeOffer(offer.id)} aria-label={`Eliminar ${offer.name || `oferta ${index + 1}`}`}><RiDeleteBinLine /></button></div>
              <Field label="Condiciones de esta oferta"><TextArea rows="2" value={offer.conditions} onChange={value => updateOffer(offer.id, { conditions: value })} placeholder="Permanencia, límites, requisitos o excepciones" /></Field>
            </article>) : <div className="business-empty-offers"><RiInformationLine /><div><strong>Aún no hay ofertas configuradas</strong><span>Hasta que añadas una, los agentes nunca citarán un precio.</span></div><button type="button" onClick={() => update('offers', [emptyOffer(form.company.currency)])}><RiAddLine /> Crear primera oferta</button></div>}
          </div>
        </section>

        <section className="business-section">
          <div className="business-section-heading"><div><h2>Guardarraíles comerciales</h2><p>Límites que todos los agentes deben respetar, incluso si el cliente insiste.</p></div><RiShieldCheckLine /></div>
          <div className="business-guardrail-grid">
            <Field label="Descuentos permitidos"><TextArea rows="5" value={form.commercialGuardrails.discountPolicy} onChange={value => updateGuardrail('discountPolicy', value)} /></Field>
            <Field label="Términos de pago"><TextArea rows="5" value={form.commercialGuardrails.paymentTerms} onChange={value => updateGuardrail('paymentTerms', value)} /></Field>
            <Field label="Garantías"><TextArea rows="5" value={form.commercialGuardrails.guarantees} onChange={value => updateGuardrail('guarantees', value)} /></Field>
            <Field label="Afirmaciones que NUNCA deben hacer"><TextArea rows="5" value={form.commercialGuardrails.forbiddenClaims} onChange={value => updateGuardrail('forbiddenClaims', value)} /></Field>
          </div>
        </section>
      </div>

      <aside className="business-sources">
        <div className="business-sources-heading"><h2>Fuentes conectadas</h2><p>El motor compone estas fuentes en cada llamada, en este orden.</p></div>
        <SourceCard Icon={RiBuilding2Line} title="Información de empresa" detail={`${completedRequired}/4 esenciales · ${activeOffers} ofertas activas`} ready={completedRequired === 4} action="Estás aquí" />
        <i className="business-source-arrow"><RiArrowRightLine /></i>
        <SourceCard Icon={RiBookOpenLine} title="Knowledge Base" detail={`${readiness?.knowledgeCount ?? 0} artículos disponibles`} ready={(readiness?.knowledgeCount ?? 0) > 0} action="Gestionar" onClick={() => navigate('/knowledge-base')} />
        <i className="business-source-arrow"><RiArrowRightLine /></i>
        <SourceCard Icon={RiRobot2Line} title="Instrucciones del agente" detail={`${readiness?.activeAgentCount ?? 0} agentes activos`} ready={(readiness?.activeAgentCount ?? 0) > 0} action="Gestionar" onClick={() => navigate('/agentes')} />
        <div className="business-all-agents"><RiCheckLine /><div><strong>Todos los agentes</strong><span>Los cambios se aplican automáticamente a la siguiente llamada.</span></div></div>
        <div className="business-priority-note"><RiInformationLine /><p><strong>Prioridad de respuesta</strong>Los precios y condiciones de esta página mandan sobre cualquier documento de Knowledge.</p></div>
      </aside>
    </div>
    {notice ? <div className="business-toast" role="status"><RiCheckLine /> {notice}</div> : null}
  </main>
}
