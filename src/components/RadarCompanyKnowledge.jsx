import { useEffect, useRef, useState } from 'react'
import { RiAddLine, RiCheckLine, RiDeleteBinLine, RiFileTextLine, RiGlobalLine, RiLoader4Line, RiSparklingLine, RiUploadCloud2Line } from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { radarObjectives, withRadarObjectives } from '../lib/opportunityRadar'

const EMPTY = { website: '', notes: '', services: [], sourceIds: [] }
const BILLING = [['service', 'Por servicio'], ['hour', 'Por hora'], ['month', 'Al mes'], ['year', 'Al año'], ['project', 'Por proyecto'], ['unit', 'Por unidad']]
async function api(path, options = {}) {
  const response = await apiFetch(`/api/revenue-intelligence/radar-knowledge${path}`, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'No se pudo procesar la información.')
  return body
}
const base64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('No se pudo leer el archivo.')); reader.readAsDataURL(file) })

export default function RadarCompanyKnowledge({ context, draft, setDraft, onWorking }) {
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState([])
  const mounted = useRef(false)
  const uploadInput = useRef(null)
  const knowledge = draft.companyKnowledge || EMPTY
  const latest = useRef(knowledge); latest.current = knowledge
  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    api('', { signal: controller.signal }).then(data => {
      if (!mounted.current) return
      setSources(data.sources || [])
      setDraft(current => current.companyKnowledge ? current : { ...current, companyKnowledge: data.profile || { ...EMPTY, website: context.company.website || '', services: (context.profile.offers || []).filter(offer => offer.active && offer.name).slice(0, 30).map(offer => ({ name: offer.name, description: offer.description || '', priceCents: offer.priceCents, currency: ['EUR', 'USD', 'GBP'].includes(offer.currency) ? offer.currency : 'EUR', billing: offer.billingPeriod === 'monthly' ? 'month' : offer.billingPeriod === 'yearly' ? 'year' : 'service' })) } })
    }).catch(failure => { if (mounted.current && !controller.signal.aborted) setError(failure.message) }).finally(() => { if (mounted.current) setLoading(false) })
    return () => { mounted.current = false; controller.abort() }
  }, [])
  function change(update) { setAnalysis(null); setMessage(''); setDraft(current => ({ ...current, companyKnowledge: { ...(current.companyKnowledge || EMPTY), ...update } })) }
  function updateService(index, update) { change({ services: knowledge.services.map((service, i) => i === index ? { ...service, ...update } : service) }) }
  async function action(label, run) {
    if (working) return
    setWorking(label); onWorking(true); setError(''); setMessage('')
    try { await run() } catch (failure) { if (mounted.current) setError(failure.message) }
    finally { if (mounted.current) setWorking(''); onWorking(false) }
  }
  function addSource(source) {
    setSources(current => [source, ...current.filter(item => item.id !== source.id)])
    setDraft(current => ({ ...current, companyKnowledge: { ...(current.companyKnowledge || EMPTY), sourceIds: [...new Set([...(current.companyKnowledge?.sourceIds || []), source.id])].slice(0, 20) } }))
    setAnalysis(null)
  }
  async function upload(files) {
    const entries = Array.from(files || [])
    if (!entries.length) return
    if (entries.length > 10 || entries.some(file => file.size > 10 * 1024 * 1024 || !/\.(pdf|xlsx|docx|csv|txt|md|json)$/i.test(file.name))) { setError('Sube hasta 10 archivos a la vez, de 10 MB como máximo. Formatos: PDF, XLSX, DOCX, CSV, TXT, MD y JSON.'); return }
    await action('Leyendo documentos…', async () => {
      setProgress(entries.map(file => ({ name: file.name, state: 'En cola' })))
      for (let index = 0; index < entries.length; index++) {
        const file = entries[index]
        setProgress(current => current.map((item, i) => i === index ? { ...item, state: 'Extrayendo contenido…' } : item))
        try {
          const source = await api('/file', { method: 'POST', body: JSON.stringify({ name: file.name, data: await base64(file) }) })
          if (!mounted.current) return
          addSource(source)
          setProgress(current => current.map((item, i) => i === index ? { ...item, state: 'Contenido leído', done: true } : item))
        } catch (failure) { if (mounted.current) setProgress(current => current.map((item, i) => i === index ? { ...item, state: failure.message, failed: true } : item)) }
      }
    })
  }
  function applyDetection() {
    setDraft(current => {
      const goal = analysis.goals[0]
      const supported = analysis.goals.map(item => item.kind)
      const existing = radarObjectives(current).filter(item => supported.includes(item.kind))
      return withRadarObjectives({ ...current, businessType: analysis.suggestedType }, existing.length ? existing : [{ kind: goal.kind, target: goal.target, criteria: '' }])
    })
    setMessage('Actividad propuesta aplicada. Tus criterios compatibles se han conservado.')
  }
  return <div className="radar-knowledge">
    <div className="radar-knowledge-heading"><div><h4>Todo lo que hace único a tu negocio</h4><p>Cuanto mejor conozca tu oferta, más precisas serán las búsquedas.</p></div><span>{knowledge.services.length} servicios · {knowledge.sourceIds.length} fuentes</span></div>
    {loading ? <p role="status" className="radar-reading"><RiLoader4Line />Cargando información guardada…</p> : null}
    <details className="radar-knowledge-section" open><summary><RiFileTextLine />Servicios y tarifas<span>{knowledge.services.length}</span></summary><div className="radar-knowledge-section-body">
      <p className="radar-muted">Añade servicios, productos o planes. Deja el precio vacío si se prepara un presupuesto a medida.</p>
      {knowledge.services.map((service, index) => <div className="radar-service" key={index} role="group" aria-label={`Servicio ${index + 1}`}><div className="radar-service-top"><label>Servicio o producto<input aria-label={`Nombre del servicio ${index + 1}`} required maxLength={200} value={service.name} onChange={event => updateService(index, { name: event.target.value })} placeholder="Ej. Implantación de software" /></label><button type="button" aria-label={`Quitar servicio ${index + 1}`} onClick={() => change({ services: knowledge.services.filter((_, i) => i !== index) })}><RiDeleteBinLine /></button></div><div className="radar-service-pricing"><label>Precio<input aria-label={`Precio del servicio ${index + 1}`} type="number" min={0} max={1000000000} step="0.01" value={service.priceCents == null ? '' : service.priceCents / 100} placeholder="A consultar" onChange={event => updateService(index, { priceCents: event.target.value === '' ? null : Math.round(Number(event.target.value) * 100) })} /></label><label>Moneda<select aria-label={`Moneda del servicio ${index + 1}`} value={service.currency} onChange={event => updateService(index, { currency: event.target.value })}><option>EUR</option><option>USD</option><option>GBP</option></select></label><label>Modalidad<select aria-label={`Modalidad del servicio ${index + 1}`} value={service.billing} onChange={event => updateService(index, { billing: event.target.value })}>{BILLING.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div><label>Qué incluye y condiciones<input maxLength={1000} value={service.description} placeholder="Alcance, permanencia, impuestos, instalación…" onChange={event => updateService(index, { description: event.target.value })} /></label></div>)}
      <button type="button" disabled={working || knowledge.services.length >= 30} onClick={() => change({ services: [...knowledge.services, { name: '', description: '', priceCents: null, currency: 'EUR', billing: 'service' }] })}><RiAddLine />Añadir servicio</button>
    </div></details>
    <details className="radar-knowledge-section" open><summary><RiUploadCloud2Line />Catálogos y documentos<span>{sources.length}</span></summary><div className="radar-knowledge-section-body">
      <div className={`radar-dropzone ${dragging ? 'is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!working) setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!working) void upload(event.dataTransfer.files) }}><RiUploadCloud2Line /><strong>Arrastra tu catálogo, tarifas o presentación</strong><p>PDF, Excel (.xlsx), Word (.docx), CSV, TXT, MD o JSON · 10 MB por archivo</p><button type="button" disabled={!!working} onClick={() => uploadInput.current?.click()}>Seleccionar archivos</button><input ref={uploadInput} type="file" multiple hidden accept=".pdf,.xlsx,.docx,.csv,.txt,.md,.json" onChange={event => { void upload(event.target.files); event.target.value = '' }} /></div>
      {progress.length ? <div className="radar-import-progress" aria-live="polite">{progress.map((item, index) => <p key={index} className={item.failed ? 'is-error' : ''}>{item.done ? <RiCheckLine /> : <RiFileTextLine />}<span>{item.name}<small>{item.state}</small></span></p>)}</div> : null}
      {sources.map(source => <div className="radar-source" key={source.id}><label className="radar-source-select"><input type="checkbox" checked={knowledge.sourceIds.includes(source.id)} onChange={event => change({ sourceIds: event.target.checked ? [...knowledge.sourceIds, source.id].slice(0, 20) : knowledge.sourceIds.filter(id => id !== source.id) })} /><span><strong>{source.name}</strong><small>{source.kind.toUpperCase()} · {source.characters.toLocaleString('es-ES')} caracteres leídos</small></span></label><details><summary>Ver contenido leído</summary><pre>{source.preview}</pre>{source.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details><button type="button" disabled={!!working} aria-label={`Quitar fuente ${source.name}`} onClick={() => action('Quitando fuente…', async () => { await api(`/sources/${encodeURIComponent(source.id)}`, { method: 'DELETE' }); setSources(current => current.filter(item => item.id !== source.id)); change({ sourceIds: latest.current.sourceIds.filter(id => id !== source.id) }) })}><RiDeleteBinLine />Quitar del radar</button></div>)}
    </div></details>
    <details className="radar-knowledge-section" open><summary><RiGlobalLine />Web de la empresa</summary><div className="radar-knowledge-section-body"><label>Dirección de la web<input aria-label="Web de la empresa" value={knowledge.website} maxLength={500} placeholder="https://tuempresa.com" onChange={event => change({ website: event.target.value })} /></label><button type="button" disabled={!!working || !knowledge.website.trim()} onClick={() => action('Leyendo la web pública…', async () => { const source = await api('/website', { method: 'POST', body: JSON.stringify({ website: latest.current.website }) }); addSource(source); setMessage('Web leída. Revisa el contenido en tus fuentes antes de detectar opciones.') })}><RiGlobalLine />Leer web</button><p className="radar-muted">Revisa hasta 8 páginas públicas para encontrar servicios, productos y tarifas. No necesita la conexión del buscador de oportunidades.</p></div></details>
    <label className="radar-notes-label">Información adicional<textarea rows={3} maxLength={5000} value={knowledge.notes} placeholder="Ventajas, capacidad, presupuesto, zona de cobertura, condiciones comerciales…" onChange={event => change({ notes: event.target.value })} /></label>
    <div className="radar-knowledge-actions"><button type="button" disabled={!!working || loading} onClick={() => action('Guardando información…', async () => { await api('', { method: 'PUT', body: JSON.stringify(latest.current) }); setMessage('Información guardada para los próximos radares de tu empresa.') })}>Guardar información</button><button type="button" className="radar-primary" disabled={!!working || (!knowledge.sourceIds.length && !knowledge.notes.trim() && !knowledge.services.length)} onClick={() => action('Detectando opciones en el contenido…', async () => { setAnalysis(await api('/analyze', { method: 'POST', body: JSON.stringify(latest.current) })) })}><RiSparklingLine />Detectar opciones</button></div>
    {working ? <p role="status" className="radar-reading"><RiLoader4Line />{working}</p> : null}
    {error ? <p role="alert" className="radar-notice is-error">{error}</p> : null}{message ? <p role="status" className="radar-notice">{message}</p> : null}
    {analysis ? <div className="radar-detected"><h4>Lo que podemos preparar con tu información</h4><p>{analysis.message}</p><strong>Actividad sugerida: {analysis.businessLabel}</strong><div className="radar-detected-goals">{analysis.goals.map(goal => <span key={goal.kind}>{goal.label}</span>)}</div>{analysis.evidence.map((item, index) => <blockquote key={index}>{item.quote}<cite>{item.sourceName}</cite></blockquote>)}<button type="button" onClick={applyDetection}>Aplicar actividad sugerida</button>{analysis.services.length ? <div><h4>Tarifas encontradas para revisar</h4>{analysis.services.map((service, index) => <div className="radar-detected-price" key={index}><div><strong>{service.name} · {(service.priceCents / 100).toLocaleString('es-ES')} {service.currency}</strong><small>{service.sourceName}: {service.quote}</small></div><button type="button" disabled={knowledge.services.length >= 30 || knowledge.services.some(item => item.name === service.name && item.priceCents === service.priceCents)} onClick={() => { const { sourceName, quote, ...entry } = service; change({ services: [...knowledge.services, entry] }); setAnalysis(analysis) }}>Añadir tarifa</button></div>)}</div> : <p>No se han identificado precios con moneda explícita. Puedes introducirlos manualmente.</p>}</div> : null}
  </div>
}
