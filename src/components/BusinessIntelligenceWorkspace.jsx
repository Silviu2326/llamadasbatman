import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiArrowRightLine,
  RiBrainLine,
  RiBuilding2Line,
  RiCheckboxCircleLine,
  RiExternalLinkLine,
  RiFlashlightLine,
  RiGlobalLine,
  RiLoader4Line,
  RiPriceTag3Line,
  RiRadarLine,
  RiSearchEyeLine,
  RiShieldCheckLine,
  RiSparkling2Line,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import PageLoadingState from './ui/PageLoadingState'
import './business-intelligence-workspace.css'

const POLL_MS = 1800

async function jsonRequest(path, options) {
  const response = await apiFetch(path, options)
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || payload?.message || 'No se pudo completar la operación.')
  return payload
}

function confidenceLabel(value) {
  return value === 'high' ? 'Alta' : value === 'low' ? 'Baja' : 'Media'
}

function levelLabel(value) {
  return value === 'high' ? 'Alto' : value === 'low' ? 'Bajo' : 'Medio'
}

function formatDate(value) {
  if (!value) return 'Ahora'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Ahora' : new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
}

function SourceLink({ href, children = 'Abrir fuente' }) {
  if (!href) return null
  return <a href={href} target="_blank" rel="noreferrer">{children}<RiExternalLinkLine aria-hidden="true" /></a>
}

function ContextCard({ label, value, empty = 'Pendiente de completar' }) {
  return <div className="bix-context-card"><span>{label}</span><strong>{value || empty}</strong></div>
}

function OpportunityCard({ item, index }) {
  return <article className="bix-opportunity-card">
    <header><span>0{index + 1}</span><div><small>{item.category}</small><h4>{item.title}</h4></div><i className={`confidence-${item.confidence}`}>{confidenceLabel(item.confidence)}</i></header>
    <p>{item.rationale}</p>
    <dl><div><dt>Impacto</dt><dd className={`level-${item.impact}`}>{levelLabel(item.impact)}</dd></div><div><dt>Esfuerzo</dt><dd>{levelLabel(item.effort)}</dd></div><div><dt>Evidencias</dt><dd>{item.evidenceUrls?.length || 0}</dd></div></dl>
    <footer><div><span>Primer movimiento</span><strong>{item.firstAction}</strong><small>Éxito: {item.successMetric}</small></div>{item.evidenceUrls?.[0] ? <SourceLink href={item.evidenceUrls[0]}>Ver evidencia</SourceLink> : null}</footer>
  </article>
}

function InvestigationResult({ investigation }) {
  const envelope = investigation?.result || {}
  const data = envelope.data || {}
  const council = envelope.agentic
  const opportunities = Array.isArray(data.opportunities) ? data.opportunities : []
  const suppliers = Array.isArray(data.suppliers) ? data.suppliers : []
  const facts = Array.isArray(data.facts) ? data.facts : []
  const inferences = Array.isArray(data.inferences) ? data.inferences : []
  const gaps = Array.isArray(data.gaps) ? data.gaps : []
  const sources = Array.isArray(data.sources) ? data.sources : []

  return <div className="bix-result">
    <div className="bix-result-heading">
      <div><span>Último informe · {formatDate(investigation.createdAt)}</span><h3>{data.researchQuestion || 'Radar de oportunidades'}</h3><p>{data.executiveBrief}</p></div>
      <div className="bix-result-proof"><strong>{sources.length}</strong><span>fuentes públicas</span><i /><strong>{council?.final?.score ?? '—'}</strong><span>score del consejo</span></div>
    </div>

    <section className="bix-opportunities" aria-label="Oportunidades priorizadas">
      <div className="bix-block-title"><div><span>Prioridad ejecutiva</span><h3>Oportunidades que merecen una decisión</h3></div><small>Ordenadas por impacto, esfuerzo y fuerza de evidencia</small></div>
      {opportunities.length ? <div className="bix-opportunity-grid">{opportunities.slice(0, 6).map((item, index) => <OpportunityCard key={`${item.title}-${index}`} item={item} index={index} />)}</div> : <div className="bix-inline-empty"><RiSearchEyeLine /><div><strong>No hay una oportunidad defendible todavía</strong><span>El sistema no rellena el espacio con recomendaciones inventadas. Revisa las lagunas o concreta la pregunta.</span></div></div>}
    </section>

    <div className="bix-evidence-layout">
      <section className="bix-suppliers">
        <div className="bix-block-title"><div><span>Compras inteligentes</span><h3>Proveedores y señales de ahorro</h3></div><RiPriceTag3Line /></div>
        {suppliers.length ? <div className="bix-supplier-list">{suppliers.map((supplier, index) => <article key={`${supplier.name}-${index}`}><div className="bix-supplier-mark">{supplier.name.slice(0, 2).toUpperCase()}</div><div><strong>{supplier.name}</strong><span>{supplier.category}</span><p>{supplier.whyRelevant}</p></div><div className="bix-supplier-proof"><em className={supplier.validationStatus}>{supplier.validationStatus === 'price_evidenced' ? 'Precio evidenciado' : 'Precio por validar'}</em>{supplier.priceSignal ? <small>{supplier.priceSignal}</small> : null}<SourceLink href={supplier.evidenceUrl} /></div></article>)}</div> : <div className="bix-inline-empty compact"><RiShieldCheckLine /><div><strong>Sin proveedores comparables con evidencia</strong><span>Solo aparecerán candidatos identificables en fuentes públicas; el precio se marca como pendiente hasta encontrar una cifra verificable.</span></div></div>}
      </section>

      <aside className="bix-reasoning">
        <div className="bix-block-title"><div><span>Trazabilidad</span><h3>Qué sabemos y qué deducimos</h3></div><RiBrainLine /></div>
        <div className="bix-reasoning-group"><h4>Hechos con fuente <b>{facts.length}</b></h4>{facts.slice(0, 4).map((item, index) => <div className="bix-finding fact" key={`${item.claim}-${index}`}><RiCheckboxCircleLine /><p>{item.claim}<SourceLink href={item.sourceUrl}>Fuente</SourceLink></p></div>)}</div>
        <div className="bix-reasoning-group"><h4>Inferencias a validar <b>{inferences.length}</b></h4>{inferences.slice(0, 3).map((item, index) => <div className="bix-finding inference" key={`${item.claim}-${index}`}><RiSparkling2Line /><p>{item.claim}<small>Verificar: {item.whatToVerify}</small></p></div>)}</div>
        {gaps.length ? <div className="bix-gaps"><span>Lagunas detectadas</span>{gaps.slice(0, 3).map((gap, index) => <p key={`${gap}-${index}`}>{gap}</p>)}</div> : null}
      </aside>
    </div>

    {council ? <section className="bix-council"><div><span className="bix-council-icon"><RiBrainLine /></span><div><small>{council.profile?.modelDiversity?.mode === 'multi_model' ? 'Consejo multi-modelo verificado' : 'Consejo de agentes'}</small><h3>{council.final?.status === 'ready' ? 'Análisis listo para decidir' : 'Requiere revisión humana'}</h3><p>{council.final?.consensus}</p>{council.profile?.modelDiversity?.note ? <em className="bix-diversity-note">{council.profile.modelDiversity.note}</em> : null}</div></div><dl>{council.profile?.roles?.map(role => <div key={role.id}><dt>{role.name}</dt><dd>{role.providerId ? `${role.providerId}${role.model ? ` · ${role.model}` : ' · modelo configurado'}` : 'Revisión independiente'}</dd></div>)}</dl><span className={`bix-council-score ${council.final?.status || ''}`}><strong>{council.final?.score ?? '—'}</strong><small>calidad</small></span></section> : null}
  </div>
}

export default function BusinessIntelligenceWorkspace() {
  const navigate = useNavigate()
  const [context, setContext] = useState(null)
  const [investigations, setInvestigations] = useState([])
  const [activeJob, setActiveJob] = useState(null)
  const [selectedLens, setSelectedLens] = useState('costs_suppliers')
  const [focus, setFocus] = useState('')
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef(null)

  const loadIntelligence = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const [contextPayload, runPayload] = await Promise.all([
        jsonRequest('/api/revenue-intelligence/business-context'),
        jsonRequest('/api/revenue-intelligence/investigations?limit=6'),
      ])
      setContext(contextPayload)
      setInvestigations(Array.isArray(runPayload?.investigations) ? runPayload.investigations : [])
      const running = Array.isArray(runPayload?.activeJobs) ? runPayload.activeJobs[0] : null
      setActiveJob(running || null)
    } catch (requestError) {
      setError(requestError.message || 'No se pudo cargar el contexto empresarial.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { loadIntelligence() }, [loadIntelligence])

  useEffect(() => {
    if (!activeJob?.id) return undefined
    let cancelled = false
    const poll = async () => {
      try {
        const job = await jsonRequest(`/api/jobs/${activeJob.id}`)
        if (cancelled) return
        setActiveJob(job)
        if (['succeeded', 'failed', 'canceled'].includes(job.status)) {
          if (job.status === 'succeeded') await loadIntelligence({ silent: true })
          else setError(job?.error?.message || 'La investigación no pudo completarse.')
          if (!cancelled) setActiveJob(null)
          return
        }
        pollRef.current = window.setTimeout(poll, POLL_MS)
      } catch (pollError) {
        if (!cancelled) setError(pollError.message || 'Se perdió el seguimiento del trabajo.')
      }
    }
    pollRef.current = window.setTimeout(poll, 500)
    return () => { cancelled = true; if (pollRef.current) window.clearTimeout(pollRef.current) }
  }, [activeJob?.id, loadIntelligence])

  const activeLens = useMemo(() => context?.lenses?.find(item => item.key === selectedLens) || context?.lenses?.[0], [context, selectedLens])
  const latest = investigations[0] || null

  async function startResearch(event) {
    event.preventDefault()
    if (!consent || !activeLens || starting) return
    setStarting(true)
    setError('')
    try {
      const payload = await jsonRequest('/api/revenue-intelligence/investigations', {
        method: 'POST',
        body: JSON.stringify({ lens: activeLens.key, focus: focus.trim(), allowExternalReview: true }),
      })
      setActiveJob({ id: payload.jobId, status: 'pending', progress: 0 })
    } catch (requestError) {
      setError(requestError.message || 'No se pudo iniciar la investigación.')
    } finally {
      setStarting(false)
    }
  }

  if (loading) return <PageLoadingState inline label="Construyendo el contexto del negocio" description="Conectando perfil, ofertas y líneas de investigación…" />
  if (!context) return <section className="bix-error"><RiBrainLine /><div><strong>La inteligencia no puede leer todavía tu contexto empresarial</strong><span>{error || 'Completa la información de empresa o revisa tus permisos.'}</span></div><button type="button" onClick={() => loadIntelligence()}>Reintentar</button></section>

  const readiness = context.intelligenceReadiness || { score: 0, missing: [], canResearch: false }
  return <section className="bix-workspace">
    <header className="bix-hero">
      <div className="bix-hero-copy"><span className="bix-eyebrow"><i />Business intelligence OS</span><h2>Entiendo cómo funciona <em>{context.company.name}</em>.<br />Ahora puedo buscar dónde mejorar.</h2><p>El radar convierte tu perfil de empresa en preguntas sectoriales, investiga fuentes públicas y somete cada conclusión a un consejo de agentes antes de recomendar una acción.</p><div className="bix-hero-tags"><span><RiBuilding2Line />{context.vertical.label}</span><span><RiGlobalLine />{context.company.address || 'Mercado por definir'}</span><span><RiShieldCheckLine />Hechos e inferencias separados</span></div></div>
      <aside className="bix-readiness"><div className="bix-score" style={{ '--score': `${readiness.score}%` }}><strong>{readiness.score}</strong><span>contexto</span></div><div><small>Preparación del cerebro</small><strong>{readiness.score >= 80 ? 'Listo para investigar' : 'Puede mejorar con más contexto'}</strong><p>{readiness.missing?.length ? `Falta: ${readiness.missing.slice(0, 2).join(' y ')}.` : 'Perfil, propuesta y mercado disponibles.'}</p><button type="button" onClick={() => navigate('/informacion-empresa')}>Revisar perfil <RiArrowRightLine /></button></div></aside>
    </header>

    <div className="bix-context-strip">
      <ContextCard label="Qué vende" value={context.profile.valueProposition} />
      <ContextCard label="A quién" value={context.profile.idealCustomer} />
      <ContextCard label="Oferta activa" value={context.profile.offers?.find(offer => offer.active)?.name} />
      <ContextCard label="Señal sectorial" value={`${context.vertical.label} · ${context.vertical.confidence === 'high' ? 'alta confianza' : 'por validar'}`} />
    </div>

    <form className="bix-command" onSubmit={startResearch}>
      <div className="bix-command-head"><div><span><RiRadarLine />Nueva misión de investigación</span><h3>¿Qué debería descubrir Vendrava ahora?</h3><p>Selecciona un ángulo o escribe una pregunta. El sistema generará búsquedas adaptadas al sector, no una respuesta genérica.</p></div>{activeJob ? <div className="bix-running"><RiLoader4Line /><span><strong>Consejo trabajando</strong>Buscando, contrastando y revisando…</span></div> : null}</div>
      <div className="bix-lens-grid">{context.lenses?.map(lens => <button type="button" key={lens.key} className={selectedLens === lens.key ? 'active' : ''} onClick={() => setSelectedLens(lens.key)}><span>{lens.title}</span><small>{lens.description}</small><i><RiArrowRightLine /></i></button>)}</div>
      <div className="bix-query"><RiSearchEyeLine /><textarea value={focus} maxLength="1200" rows="2" onChange={event => setFocus(event.target.value)} placeholder={activeLens ? `Ej. ${activeLens.queryAngles?.[0]} en ${context.company.address || 'mi mercado'}…` : 'Escribe una pregunta de negocio…'} /><button type="submit" disabled={!readiness.canResearch || !consent || starting || Boolean(activeJob)}>{starting || activeJob ? <RiLoader4Line /> : <RiFlashlightLine />}{activeJob ? 'Investigando' : 'Investigar y pensar'}</button></div>
      <label className="bix-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span><strong>Autorizar consejo externo de IA</strong><small>El perfil se redacta y se comparte con los proveedores configurados para que tres revisores independientes auditen el resultado. No ejecuta compras ni contactos.</small></span></label>
      {error ? <p className="bix-form-error" role="alert">{error}</p> : null}
    </form>

    {latest ? <InvestigationResult investigation={latest} /> : <section className="bix-agenda"><div className="bix-block-title"><div><span>Agenda inteligente</span><h3>Ya sé qué buscar según tu negocio</h3></div><small>Sin datos ficticios: estas son líneas de investigación, no resultados.</small></div><div>{context.lenses?.slice(0, 4).map((lens, index) => <article key={lens.key}><span>0{index + 1}</span><div><h4>{lens.title}</h4><p>{lens.outcome}</p><small>{lens.queryAngles?.join(' · ')}</small></div><button type="button" onClick={() => { setSelectedLens(lens.key); document.querySelector('.bix-command')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}>Investigar <RiArrowRightLine /></button></article>)}</div></section>}
  </section>
}
