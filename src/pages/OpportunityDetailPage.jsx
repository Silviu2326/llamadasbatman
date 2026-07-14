import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiArrowLeftLine, RiMapPinLine, RiMoneyDollarBoxLine,
  RiCalendarLine, RiEditLine, RiAddLine, RiPhoneLine,
  RiCheckLine, RiCloseLine,
} from 'react-icons/ri'
import '../dashboard.css'

const ALL_STAGES = [
  { id:'lead',        label:'Lead' },
  { id:'contactado',  label:'Contactado' },
  { id:'interesado',  label:'Interesado' },
  { id:'reunion',     label:'ReuniÃ³n' },
  { id:'propuesta',   label:'Propuesta' },
  { id:'negociacion', label:'NegociaciÃ³n' },
  { id:'ganado',      label:'Ganado' },
]

const STAGE_COLOR = { lead:'#6366f1', contactado:'#0891b2', interesado:'#f59e0b', reunion:'#059669', propuesta:'#8b5cf6', negociacion:'#ea580c', ganado:'#10b981' }

// Opciones del formulario de ediciÃ³n: usan directamente el valor del enum
// OpportunityStage del backend (no el stageMap de arriba, que es solo para
// mostrar la barra de progreso y pierde informaciÃ³n â€” "closed_lost" colapsa
// en "lead" ahÃ­, asÃ­ que invertirlo perderÃ­a la opciÃ³n "Perdido").
const STAGE_OPTIONS = [
  { value:'lead',        label:'Lead' },
  { value:'qualified',   label:'Calificado' },
  { value:'proposal',    label:'Propuesta' },
  { value:'negotiation', label:'NegociaciÃ³n' },
  { value:'closed_won',  label:'Ganado' },
  { value:'closed_lost', label:'Perdido' },
]

const CURRENCY_OPTIONS = ['EUR', 'USD', 'GBP', 'MXN']

const TABS = ['Resumen', 'Contactos', 'Productos', 'Actividad', 'Notas']

// OP-108: roles de compra de OpportunityContact.role.
const CONTACT_ROLE_OPTIONS = [
  { value: 'champion',        label: 'Champion' },
  { value: 'decision_maker',  label: 'Decisor' },
  { value: 'economic_buyer',  label: 'Comprador económico' },
  { value: 'influencer',      label: 'Influenciador' },
  { value: 'blocker',         label: 'Bloqueador' },
]
const CONTACT_ROLE_LABEL = Object.fromEntries(CONTACT_ROLE_OPTIONS.map(o => [o.value, o.label]))

// OP-107: categorías de forecast de Opportunity.forecastCategory.
const FORECAST_CATEGORY_OPTIONS = [
  { value: 'pipeline',  label: 'Pipeline' },
  { value: 'best_case', label: 'Best case' },
  { value: 'commit',    label: 'Commit' },
  { value: 'omitted',   label: 'Omitida del forecast' },
]

function fmtDateInput(d) {
  if (!d) return ''
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function fmtDateLabel(d) {
  if (!d) return null
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function Avatar({ text, bg, size = 48 }) {
  const letters = text.split(' ').map(w => w[0]).slice(0,2).join('')
  return (
    <div style={{
      width:size, height:size, borderRadius:Math.round(size*0.28), flexShrink:0,
      background:`linear-gradient(135deg, ${bg}, ${bg}bb)`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size*0.3, fontWeight:700, color:'#fff', boxShadow:`0 0 18px ${bg}55`,
    }}>{letters}</div>
  )
}

export default function OpportunityDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [opp, setOpp] = useState(null)
  const [raw, setRaw] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Resumen')

  // OP-105: siguiente paso (Task) obligatorio en etapas activas del pipeline.
  const [nextTask, setNextTask] = useState(null)

  const [showEdit, setShowEdit] = useState(false)
  const [form, setForm] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState(null)

  const [notesText, setNotesText] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesMessage, setNotesMessage] = useState(null)

  // OP-104: ganar/perder/reabrir
  const [actioning, setActioning] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [showLostForm, setShowLostForm] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [lostNotes, setLostNotes] = useState('')

  // OP-107: categoría de forecast (pipeline/best_case/commit/omitted).
  const [savingForecastCategory, setSavingForecastCategory] = useState(false)

  // OP-108: contactos / roles de compra.
  const [contacts, setContacts] = useState([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState([])
  const [contactRole, setContactRole] = useState('champion')
  const [contactPrimary, setContactPrimary] = useState(false)
  const [selectedContactLead, setSelectedContactLead] = useState(null)
  const [savingContact, setSavingContact] = useState(false)
  const [contactError, setContactError] = useState(null)

  // OP-109: líneas de producto.
  const [lineItems, setLineItems] = useState([])
  const [lineItemsLoading, setLineItemsLoading] = useState(false)
  const [lineForm, setLineForm] = useState({ name: '', quantity: '1', unitPrice: '', currency: 'EUR' })
  const [savingLineItem, setSavingLineItem] = useState(false)
  const [lineItemError, setLineItemError] = useState(null)

  const load = useCallback(() => {
    return Promise.all([
      apiFetch(`/api/pipeline/${id}`).then(r => r.ok ? r.json() : null),
      // OP-105: tarea de "siguiente paso" abierta/en curso de la oportunidad, si existe.
      apiFetch(`/api/tasks?opportunityId=${id}&limit=5`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([data, tasksData]) => {
      if (data) {
        const stageMap = { lead: 'lead', qualified: 'interesado', proposal: 'propuesta', negotiation: 'negociacion', closed_won: 'ganado', closed_lost: 'lead' }
        setRaw(data)
        setNotesText(data.notes ?? '')
        setOpp({
          ...data,
          company: data.lead?.name ?? data.name,
          city: 'â€”',
          stage: stageMap[data.stage] ?? 'lead',
          value: data.value ? `â‚¬${Number(data.value).toLocaleString('es-ES')}` : 'â€”',
          score: data.probability ?? 0,
          bg: '#6366f1',
          activities: [],
        })
      }
      const active = tasksData?.data?.find(t => t.status === 'open' || t.status === 'in_progress')
      setNextTask(active ?? null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  // OP-108: contactos de la oportunidad.
  const loadContacts = useCallback(() => {
    setContactsLoading(true)
    return apiFetch(`/api/pipeline/${id}/contacts`)
      .then(r => r.ok ? r.json() : [])
      .then(rows => setContacts(Array.isArray(rows) ? rows : []))
      .catch(() => {})
      .finally(() => setContactsLoading(false))
  }, [id])

  useEffect(() => { loadContacts() }, [loadContacts])

  // OP-108: búsqueda de leads existentes para añadir como contacto (mismo
  // patrón que NewOportunidadModal / NewReunionModal: debounce + /api/leads?search=).
  useEffect(() => {
    const term = contactSearch.trim()
    if (!term || selectedContactLead) { setContactResults([]); return }
    const t = setTimeout(() => {
      apiFetch(`/api/leads?search=${encodeURIComponent(term)}&limit=10`)
        .then(r => r.ok ? r.json() : null)
        .then(data => setContactResults(data?.data ?? []))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [contactSearch, selectedContactLead])

  function pickContactLead(lead) {
    setSelectedContactLead(lead)
    setContactSearch(lead.name || lead.email || lead.phone || '')
    setContactResults([])
  }

  async function handleAddContact() {
    if (!selectedContactLead) {
      setContactError('Busca y selecciona un lead de la lista.')
      return
    }
    setSavingContact(true)
    setContactError(null)
    try {
      const res = await apiFetch(`/api/pipeline/${id}/contacts`, {
        method: 'POST',
        body: JSON.stringify({ leadId: selectedContactLead.id, role: contactRole, isPrimary: contactPrimary }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'No se pudo añadir el contacto.')
      }
      setSelectedContactLead(null)
      setContactSearch('')
      setContactRole('champion')
      setContactPrimary(false)
      await loadContacts()
    } catch (e) {
      setContactError(e.message || 'No se pudo añadir el contacto.')
    } finally {
      setSavingContact(false)
    }
  }

  async function handleRemoveContact(leadId) {
    try {
      await apiFetch(`/api/pipeline/${id}/contacts/${leadId}`, { method: 'DELETE' })
      setContacts(prev => prev.filter(c => c.leadId !== leadId))
    } catch { /* el usuario puede reintentar */ }
  }

  // OP-109: líneas de producto de la oportunidad.
  const loadLineItems = useCallback(() => {
    setLineItemsLoading(true)
    return apiFetch(`/api/pipeline/${id}/line-items`)
      .then(r => r.ok ? r.json() : [])
      .then(rows => setLineItems(Array.isArray(rows) ? rows : []))
      .catch(() => {})
      .finally(() => setLineItemsLoading(false))
  }, [id])

  useEffect(() => { loadLineItems() }, [loadLineItems])

  async function handleAddLineItem() {
    const quantity = parseInt(lineForm.quantity, 10)
    const unitPrice = parseFloat(lineForm.unitPrice)
    if (!lineForm.name.trim()) { setLineItemError('El nombre es obligatorio.'); return }
    if (!Number.isFinite(quantity) || quantity < 1) { setLineItemError('La cantidad debe ser un entero mayor o igual a 1.'); return }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) { setLineItemError('El precio unitario no es válido.'); return }

    setSavingLineItem(true)
    setLineItemError(null)
    try {
      const res = await apiFetch(`/api/pipeline/${id}/line-items`, {
        method: 'POST',
        body: JSON.stringify({ name: lineForm.name.trim(), quantity, unitPrice, currency: lineForm.currency }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'No se pudo añadir la línea.')
      }
      setLineForm({ name: '', quantity: '1', unitPrice: '', currency: lineForm.currency })
      await loadLineItems()
    } catch (e) {
      setLineItemError(e.message || 'No se pudo añadir la línea.')
    } finally {
      setSavingLineItem(false)
    }
  }

  async function handleRemoveLineItem(lineItemId) {
    try {
      await apiFetch(`/api/pipeline/${id}/line-items/${lineItemId}`, { method: 'DELETE' })
      setLineItems(prev => prev.filter(li => li.id !== lineItemId))
    } catch { /* el usuario puede reintentar */ }
  }

  // OP-107: fija manualmente la categoría de forecast desde el detalle.
  async function handleForecastCategoryChange(value) {
    setSavingForecastCategory(true)
    try {
      const res = await apiFetch(`/api/pipeline/${id}/forecast-category`, {
        method: 'PUT',
        body: JSON.stringify({ forecastCategory: value }),
      })
      if (res.ok) setRaw(r => r ? { ...r, forecastCategory: value } : r)
    } catch { /* el usuario puede reintentar */ }
    finally { setSavingForecastCategory(false) }
  }

  function openEdit() {
    if (!raw) return
    setEditError(null)
    setForm({
      name: raw.name ?? '',
      stage: raw.stage ?? 'lead',
      value: raw.value != null ? String(raw.value) : '',
      currency: raw.currency ?? 'EUR',
      probability: raw.probability != null ? String(raw.probability) : '0',
      expectedCloseDate: fmtDateInput(raw.expectedCloseDate),
      notes: raw.notes ?? '',
      assignedTo: raw.assignedTo ?? '',
    })
    setShowEdit(true)
  }

  async function handleSaveEdit() {
    if (!form) return
    setSavingEdit(true)
    setEditError(null)
    try {
      const res = await apiFetch(`/api/pipeline/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name,
          stage: form.stage,
          value: form.value === '' ? undefined : Number(form.value),
          currency: form.currency,
          probability: Math.max(0, Math.min(100, Number(form.probability) || 0)),
          expectedCloseDate: form.expectedCloseDate || undefined,
          notes: form.notes,
          assignedTo: form.assignedTo || undefined,
        }),
      })
      if (!res.ok) throw new Error('save failed')
      await load()
      setShowEdit(false)
    } catch {
      setEditError('No se pudieron guardar los cambios.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true)
    setNotesMessage(null)
    try {
      const res = await apiFetch(`/api/pipeline/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ notes: notesText }),
      })
      if (!res.ok) throw new Error('save failed')
      setNotesMessage('Notas guardadas.')
      setRaw(r => r ? { ...r, notes: notesText } : r)
    } catch {
      setNotesMessage('No se pudieron guardar las notas.')
    } finally {
      setSavingNotes(false)
    }
  }

  async function handleMarkWon() {
    setActioning(true)
    setActionError(null)
    try {
      const res = await apiFetch(`/api/pipeline/${id}/mark-won`, { method: 'POST', body: JSON.stringify({}) })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'No se pudo marcar como ganada.')
      }
      await load()
    } catch (e) {
      setActionError(e.message || 'No se pudo marcar como ganada.')
    } finally {
      setActioning(false)
    }
  }

  async function handleMarkLost() {
    if (!lostReason.trim()) {
      setActionError('El motivo es obligatorio.')
      return
    }
    setActioning(true)
    setActionError(null)
    try {
      const res = await apiFetch(`/api/pipeline/${id}/mark-lost`, {
        method: 'POST',
        body: JSON.stringify({ reason: lostReason.trim(), lossNotes: lostNotes.trim() || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'No se pudo marcar como perdida.')
      }
      setShowLostForm(false)
      setLostReason('')
      setLostNotes('')
      await load()
    } catch (e) {
      setActionError(e.message || 'No se pudo marcar como perdida.')
    } finally {
      setActioning(false)
    }
  }

  async function handleReopen() {
    setActioning(true)
    setActionError(null)
    try {
      const res = await apiFetch(`/api/pipeline/${id}/reopen`, { method: 'POST', body: JSON.stringify({}) })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'No se pudo reabrir la oportunidad.')
      }
      await load()
    } catch (e) {
      setActionError(e.message || 'No se pudo reabrir la oportunidad.')
    } finally {
      setActioning(false)
    }
  }

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:16 }}>
      Cargandoâ€¦
    </div>
  )

  if (!opp) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:16 }}>
      Oportunidad no encontrada
    </div>
  )

  const stageIdx = ALL_STAGES.findIndex(s => s.id === opp.stage)
  const stageColor = STAGE_COLOR[opp.stage] || '#6366f1'
  const isClosed = raw?.stage === 'closed_won' || raw?.stage === 'closed_lost'

  // OP-109: total de líneas agrupado por moneda (sin convertir divisas, igual
  // que el forecast) — es solo informativo, no reemplaza Opportunity.value.
  const lineItemTotals = lineItems.reduce((acc, li) => {
    const cur = li.currency || 'EUR'
    acc[cur] = (acc[cur] || 0) + Number(li.quantity) * Number(li.unitPrice)
    return acc
  }, {})

  return (
    <div className="dark-scroll" style={{ flex:1, overflowY:'auto', background:'#080c14', display:'flex', flexDirection:'column' }}>

      {/* Back */}
      <div style={{ padding:'20px 28px 0', flexShrink:0 }}>
        <button onClick={() => navigate('/pipeline')} style={{
          display:'flex', alignItems:'center', gap:6,
          background:'none', border:'none', color:'#6b7280', fontSize:13, cursor:'pointer', padding:0,
        }}>
          <RiArrowLeftLine style={{ width:15, height:15 }} />
          Volver a Pipeline
        </button>
      </div>

      {/* Hero */}
      <div style={{ padding:'20px 28px', flexShrink:0 }}>
        <div style={{
          background:'linear-gradient(135deg, #0d1117, #111827)',
          border:'1px solid #1e2433', borderRadius:16, padding:'22px 24px',
          display:'flex', gap:18, alignItems:'flex-start',
        }}>
          <Avatar text={opp.company} bg={opp.bg} size={52} />

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5 }}>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:'#f1f5f9' }}>{opp.company}</h1>
              <span style={{ fontSize:12, fontWeight:700, background:`${stageColor}20`, color:stageColor, border:`1px solid ${stageColor}40`, borderRadius:99, padding:'2px 10px' }}>{opp.badge}</span>
            </div>
            <div style={{ display:'flex', gap:16, marginBottom:12 }}>
              <span style={{ fontSize:12, color:'#4b5563', display:'flex', alignItems:'center', gap:5 }}>
                <RiMapPinLine style={{ width:12, height:12 }} /> {opp.city}
              </span>
              <span style={{ fontSize:12, color:'#4b5563', display:'flex', alignItems:'center', gap:5 }}>
                <RiCalendarLine style={{ width:12, height:12 }} /> {opp.date}
              </span>
              <span style={{ fontSize:13, fontWeight:800, color:'#f1f5f9', display:'flex', alignItems:'center', gap:5 }}>
                <RiMoneyDollarBoxLine style={{ width:13, height:13, color:stageColor }} /> {opp.value}
              </span>
              {opp.score !== null && (
                <span style={{ fontSize:12, color:opp.score >= 70 ? '#10b981' : '#f59e0b', fontWeight:600 }}>
                  Lead Score: {opp.score}/100
                </span>
              )}
            </div>

            {/* Stage progress */}
            <div style={{ display:'flex', gap:0, alignItems:'center' }}>
              {ALL_STAGES.map((s, i) => {
                const done = i <= stageIdx
                const active = i === stageIdx
                const c = STAGE_COLOR[s.id]
                return (
                  <div key={s.id} style={{ display:'flex', alignItems:'center', flex:1, minWidth:0 }}>
                    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                      <div style={{
                        width:20, height:20, borderRadius:'50%', flexShrink:0,
                        background: done ? c : '#1e2433',
                        border:`2px solid ${done ? c : '#2a3245'}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        boxShadow: active ? `0 0 10px ${c}80` : 'none',
                      }}>
                        {done && <RiCheckLine style={{ width:10, height:10, color:'#fff' }} />}
                      </div>
                      <span style={{ fontSize:9, color: done ? c : '#374151', fontWeight: active ? 700 : 400, whiteSpace:'nowrap' }}>{s.label}</span>
                    </div>
                    {i < ALL_STAGES.length - 1 && (
                      <div style={{ height:2, flex:1, background: i < stageIdx ? stageColor : '#1e2433', marginBottom:14 }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            <button onClick={() => navigate('/llamadas')} style={{
              display:'flex', alignItems:'center', gap:6, background:'linear-gradient(90deg,#4f46e5,#7c3aed)', border:'none',
              borderRadius:9, padding:'8px 14px', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer',
            }}>
              <RiPhoneLine style={{ width:13, height:13 }} /> Llamar
            </button>
            <button onClick={openEdit} style={{
              display:'flex', alignItems:'center', gap:6, background:'#111827', border:'1px solid #1e2433',
              borderRadius:9, padding:'8px 12px', color:'#94a3b8', fontSize:13, cursor:'pointer',
            }}>
              <RiEditLine style={{ width:13, height:13 }} /> Editar
            </button>
            {!isClosed && (
              <>
                <button onClick={handleMarkWon} disabled={actioning} style={{
                  display:'flex', alignItems:'center', gap:6, background:'#065f4620', border:'1px solid #10b98150',
                  borderRadius:9, padding:'8px 12px', color:'#10b981', fontSize:13, fontWeight:600,
                  cursor: actioning ? 'not-allowed' : 'pointer', opacity: actioning ? 0.6 : 1,
                }}>
                  <RiCheckLine style={{ width:13, height:13 }} /> Marcar como ganada
                </button>
                <button onClick={() => { setActionError(null); setShowLostForm(true) }} disabled={actioning} style={{
                  display:'flex', alignItems:'center', gap:6, background:'#7f1d1d20', border:'1px solid #ef444450',
                  borderRadius:9, padding:'8px 12px', color:'#f87171', fontSize:13, fontWeight:600,
                  cursor: actioning ? 'not-allowed' : 'pointer', opacity: actioning ? 0.6 : 1,
                }}>
                  <RiCloseLine style={{ width:13, height:13 }} /> Marcar como perdida
                </button>
              </>
            )}
            {isClosed && (
              <button onClick={handleReopen} disabled={actioning} style={{
                display:'flex', alignItems:'center', gap:6, background:'#111827', border:'1px solid #1e2433',
                borderRadius:9, padding:'8px 12px', color:'#94a3b8', fontSize:13,
                cursor: actioning ? 'not-allowed' : 'pointer', opacity: actioning ? 0.6 : 1,
              }}>
                Reabrir
              </button>
            )}
          </div>
        </div>
        {actionError && (
          <p style={{ margin:'10px 0 0', fontSize:12.5, color:'#f87171' }}>{actionError}</p>
        )}
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', gap:14, padding:'0 28px 28px', minHeight:0 }}>

        {/* Main */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:12 }}>

          {/* Tabs */}
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid #1e2433' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background:'none', border:'none', padding:'8px 16px', fontSize:13,
                color: tab===t ? '#f1f5f9' : '#4b5563',
                borderBottom:`2px solid ${tab===t ? stageColor : 'transparent'}`,
                cursor:'pointer', fontWeight: tab===t ? 700 : 400, transition:'all .15s', marginBottom:-1,
              }}>{t}</button>
            ))}
          </div>

          {tab === 'Resumen' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#e2e8f0' }}>InformaciÃ³n de la oportunidad</p>
                {[
                  { label:'Empresa', value:opp.company },
                  { label:'Ciudad', value:opp.city },
                  { label:'Valor estimado', value:opp.value },
                  { label:'Etapa', value:opp.badge },
                  { label:'Ãšltima actividad', value:opp.date },
                  { label:'Lead Score', value: opp.score !== null ? `${opp.score}/100` : 'â€”' },
                ].map(m => (
                  <div key={m.label} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid #111827' }}>
                    <span style={{ fontSize:12.5, color:'#4b5563' }}>{m.label}</span>
                    <span style={{ fontSize:12.5, fontWeight:600, color:'#e2e8f0' }}>{m.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#e2e8f0' }}>PrÃ³ximas acciones recomendadas</p>
                {['Enviar propuesta actualizada', 'Agendar reuniÃ³n de seguimiento', 'Consultar decision-maker'].map((a, i) => (
                  <div key={i} style={{ display:'flex', gap:9, marginBottom:9 }}>
                    <div style={{ width:16, height:16, borderRadius:5, background:`${stageColor}15`, border:`1px solid ${stageColor}30`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                      <RiCheckLine style={{ width:10, height:10, color:stageColor }} />
                    </div>
                    <p style={{ margin:0, fontSize:12.5, color:'#94a3b8' }}>{a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'Contactos' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#e2e8f0' }}>Contactos y roles de compra</p>

                {contactsLoading && contacts.length === 0 ? (
                  <p style={{ margin:0, fontSize:12.5, color:'#4b5563' }}>Cargando…</p>
                ) : contacts.length === 0 ? (
                  <p style={{ margin:0, fontSize:12.5, color:'#4b5563' }}>Todavía no hay contactos asociados a esta oportunidad.</p>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {contacts.map(c => (
                      <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid #111827' }}>
                        <Avatar text={c.lead?.name || '?'} bg="#4f46e5" size={30} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ margin:0, fontSize:12.5, fontWeight:600, color:'#e2e8f0', display:'flex', alignItems:'center', gap:6 }}>
                            {c.lead?.name || 'Sin nombre'}
                            {c.isPrimary && <span style={{ fontSize:9.5, fontWeight:700, color:'#f59e0b', background:'#f59e0b18', border:'1px solid #f59e0b40', borderRadius:99, padding:'1px 7px' }}>Principal</span>}
                          </p>
                          <p style={{ margin:0, fontSize:11, color:'#6b7280' }}>{[c.lead?.phone, c.lead?.email].filter(Boolean).join(' · ') || '—'}</p>
                        </div>
                        <span style={{ fontSize:10.5, fontWeight:700, color:'#818cf8', background:'#6366f118', border:'1px solid #6366f140', borderRadius:99, padding:'2px 9px', whiteSpace:'nowrap' }}>
                          {CONTACT_ROLE_LABEL[c.role] || c.role}
                        </span>
                        <button onClick={() => handleRemoveContact(c.leadId)} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', padding:4, display:'flex' }} title="Quitar contacto">
                          <RiCloseLine style={{ width:14, height:14 }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#e2e8f0' }}>Añadir contacto</p>
                <div style={{ position:'relative', marginBottom:10 }}>
                  <input
                    value={contactSearch}
                    onChange={e => { setContactSearch(e.target.value); setSelectedContactLead(null) }}
                    placeholder="Buscar lead por nombre, teléfono o email…"
                    style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}
                  />
                  {!selectedContactLead && contactResults.length > 0 && (
                    <div style={{ marginTop:6, border:'1px solid #1e2433', borderRadius:8, overflow:'hidden', maxHeight:160, overflowY:'auto' }}>
                      {contactResults.map(lead => (
                        <button
                          type="button"
                          key={lead.id}
                          onClick={() => pickContactLead(lead)}
                          style={{ display:'block', width:'100%', textAlign:'left', background:'#0d1117', border:'none', borderBottom:'1px solid #1e2433', padding:'8px 10px', cursor:'pointer', color:'#e2e8f0', fontSize:12.5 }}
                        >
                          <div style={{ fontWeight:600 }}>{lead.name || 'Sin nombre'}</div>
                          <div style={{ color:'#6b7280', fontSize:11 }}>{[lead.phone, lead.email].filter(Boolean).join(' · ') || '—'}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedContactLead && (
                    <p style={{ margin:'6px 0 0', fontSize:11.5, color:'#10b981' }}>Lead seleccionado: {selectedContactLead.name || selectedContactLead.id}</p>
                  )}
                </div>

                <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:160 }}>
                    <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Rol</label>
                    <select
                      value={contactRole}
                      onChange={e => setContactRole(e.target.value)}
                      style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none', cursor:'pointer' }}
                    >
                      {CONTACT_ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#94a3b8', paddingBottom:9 }}>
                    <input type="checkbox" checked={contactPrimary} onChange={e => setContactPrimary(e.target.checked)} />
                    Contacto principal
                  </label>
                  <button
                    onClick={handleAddContact}
                    disabled={savingContact}
                    style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)', border:'none', borderRadius:9, padding:'9px 16px', color:'#fff', fontSize:12.5, fontWeight:700, cursor: savingContact ? 'not-allowed' : 'pointer', opacity: savingContact ? 0.6 : 1 }}
                  >
                    {savingContact ? 'Añadiendo…' : 'Añadir'}
                  </button>
                </div>
                {contactError && <p style={{ margin:'10px 0 0', fontSize:12, color:'#f87171' }}>{contactError}</p>}
              </div>
            </div>
          )}

          {tab === 'Productos' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#e2e8f0' }}>Líneas de producto</p>

                {lineItemsLoading && lineItems.length === 0 ? (
                  <p style={{ margin:0, fontSize:12.5, color:'#4b5563' }}>Cargando…</p>
                ) : lineItems.length === 0 ? (
                  <p style={{ margin:0, fontSize:12.5, color:'#4b5563' }}>Todavía no hay líneas de producto en esta oportunidad.</p>
                ) : (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'1.6fr 0.7fr 0.9fr 0.9fr 32px', gap:8, padding:'0 0 8px', borderBottom:'1px solid #1e2433', marginBottom:4 }}>
                      {['Producto','Cantidad','Precio unitario','Subtotal',''].map(h => (
                        <span key={h} style={{ fontSize:10, fontWeight:700, color:'#4b5563', textTransform:'uppercase', letterSpacing:0.3 }}>{h}</span>
                      ))}
                    </div>
                    {lineItems.map(li => (
                      <div key={li.id} style={{ display:'grid', gridTemplateColumns:'1.6fr 0.7fr 0.9fr 0.9fr 32px', gap:8, alignItems:'center', padding:'8px 0', borderBottom:'1px solid #111827' }}>
                        <span style={{ fontSize:12.5, color:'#e2e8f0', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{li.name}</span>
                        <span style={{ fontSize:12, color:'#94a3b8' }}>{li.quantity}</span>
                        <span style={{ fontSize:12, color:'#94a3b8' }}>{li.currency} {Number(li.unitPrice).toLocaleString('es-ES')}</span>
                        <span style={{ fontSize:12.5, color:'#f1f5f9', fontWeight:700 }}>{li.currency} {(Number(li.quantity) * Number(li.unitPrice)).toLocaleString('es-ES')}</span>
                        <button onClick={() => handleRemoveLineItem(li.id)} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', padding:4, display:'flex' }} title="Quitar línea">
                          <RiCloseLine style={{ width:14, height:14 }} />
                        </button>
                      </div>
                    ))}
                    <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #1e2433' }}>
                      {Object.entries(lineItemTotals).map(([cur, total]) => (
                        <p key={cur} style={{ margin:'0 0 2px', fontSize:12.5, fontWeight:700, color:'#f1f5f9' }}>Suma de líneas ({cur}): {cur} {total.toLocaleString('es-ES')}</p>
                      ))}
                      <p style={{ margin:0, fontSize:11, color:'#6b7280' }}>Puede diferir del valor de la oportunidad ({opp.value}) — no se recalcula automáticamente.</p>
                    </div>
                  </>
                )}
              </div>

              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#e2e8f0' }}>Añadir línea</p>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
                  <div style={{ flex:'2 1 160px' }}>
                    <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Nombre</label>
                    <input
                      value={lineForm.name}
                      onChange={e => setLineForm(f => ({ ...f, name:e.target.value }))}
                      placeholder="Ej. Licencia anual"
                      style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}
                    />
                  </div>
                  <div style={{ flex:'0 1 80px' }}>
                    <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Cantidad</label>
                    <input
                      type="number" min="1"
                      value={lineForm.quantity}
                      onChange={e => setLineForm(f => ({ ...f, quantity:e.target.value }))}
                      style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}
                    />
                  </div>
                  <div style={{ flex:'0 1 120px' }}>
                    <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Precio unitario</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={lineForm.unitPrice}
                      onChange={e => setLineForm(f => ({ ...f, unitPrice:e.target.value }))}
                      style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}
                    />
                  </div>
                  <div style={{ flex:'0 1 90px' }}>
                    <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Moneda</label>
                    <select
                      value={lineForm.currency}
                      onChange={e => setLineForm(f => ({ ...f, currency:e.target.value }))}
                      style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none', cursor:'pointer' }}
                    >
                      {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={handleAddLineItem}
                    disabled={savingLineItem}
                    style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)', border:'none', borderRadius:9, padding:'9px 16px', color:'#fff', fontSize:12.5, fontWeight:700, cursor: savingLineItem ? 'not-allowed' : 'pointer', opacity: savingLineItem ? 0.6 : 1 }}
                  >
                    {savingLineItem ? 'Añadiendo…' : 'Añadir'}
                  </button>
                </div>
                {lineItemError && <p style={{ margin:'10px 0 0', fontSize:12, color:'#f87171' }}>{lineItemError}</p>}
              </div>
            </div>
          )}

          {tab === 'Actividad' && (
            <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
              <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#e2e8f0' }}>Historial de actividad</p>
              {[
                { type:'Llamada', desc:'Llamada de presentaciÃ³n realizada', date:opp.date, color:'#6366f1' },
                { type:'Email', desc:'Email de seguimiento enviado', date:'Hace 2 dÃ­as', color:'#0891b2' },
                { type:'Lead', desc:'Lead creado en el sistema', date:'Hace 5 dÃ­as', color:'#10b981' },
              ].map((a, i) => (
                <div key={i} style={{ display:'flex', gap:12, marginBottom:14 }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:0 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:a.color, boxShadow:`0 0 5px ${a.color}80`, flexShrink:0 }} />
                    {i < 2 && <div style={{ width:1, height:30, background:'#1e2433', margin:'4px 0' }} />}
                  </div>
                  <div style={{ flex:1, paddingTop:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:a.color }}>{a.type}</span>
                      <span style={{ fontSize:11, color:'#374151' }}>{a.date}</span>
                    </div>
                    <p style={{ margin:0, fontSize:12.5, color:'#94a3b8' }}>{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'Notas' && (
            <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
              <textarea
                placeholder="Escribe tus notas aquÃ­..."
                value={notesText}
                onChange={e => setNotesText(e.target.value)}
                style={{
                  width:'100%', minHeight:180, background:'transparent', border:'none',
                  color:'#94a3b8', fontSize:13, outline:'none', resize:'vertical', lineHeight:1.6,
                  fontFamily:'inherit',
                }}
              />
              <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:8, paddingTop:8, borderTop:'1px solid #1e2433' }}>
                <button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  style={{
                    background:'linear-gradient(135deg,#4f46e5,#7c3aed)', border:'none', borderRadius:8,
                    padding:'7px 14px', color:'#fff', fontSize:12.5, fontWeight:600,
                    cursor: savingNotes ? 'not-allowed' : 'pointer', opacity: savingNotes ? 0.6 : 1,
                  }}
                >
                  {savingNotes ? 'Guardandoâ€¦' : 'Guardar notas'}
                </button>
                {notesMessage && <span style={{ fontSize:11.5, color:'#94a3b8' }}>{notesMessage}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Right */}
        <div style={{ width:220, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>
          {!isClosed && (
            <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px' }}>
              <p style={{ margin:'0 0 8px', fontSize:12, fontWeight:700, color:'#e2e8f0' }}>Categoría de forecast</p>
              <select
                value={raw?.forecastCategory ?? 'pipeline'}
                onChange={e => handleForecastCategoryChange(e.target.value)}
                disabled={savingForecastCategory}
                style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'8px 10px', color:'#e2e8f0', fontSize:12.5, outline:'none', cursor: savingForecastCategory ? 'not-allowed' : 'pointer' }}
              >
                {FORECAST_CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {nextTask && (
            <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px' }}>
              <p style={{ margin:'0 0 8px', fontSize:12, fontWeight:700, color:'#e2e8f0' }}>Siguiente paso</p>
              <p style={{ margin:'0 0 6px', fontSize:12.5, color:'#e2e8f0', fontWeight:600, lineHeight:1.4 }}>{nextTask.title}</p>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                <span style={{
                  fontSize:10.5, fontWeight:700, borderRadius:99, padding:'2px 8px',
                  background: nextTask.status === 'in_progress' ? '#f59e0b20' : '#6366f120',
                  color: nextTask.status === 'in_progress' ? '#f59e0b' : '#818cf8',
                  border: `1px solid ${nextTask.status === 'in_progress' ? '#f59e0b40' : '#6366f140'}`,
                }}>
                  {nextTask.status === 'in_progress' ? 'En curso' : 'Pendiente'}
                </span>
                {fmtDateLabel(nextTask.dueAt) && (
                  <span style={{ fontSize:11, color:'#6b7280', display:'flex', alignItems:'center', gap:4 }}>
                    <RiCalendarLine style={{ width:11, height:11 }} /> {fmtDateLabel(nextTask.dueAt)}
                  </span>
                )}
              </div>
            </div>
          )}
          <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px' }}>
            <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'#e2e8f0' }}>Acciones rÃ¡pidas</p>
            {[
              { Icon:RiPhoneLine, label:'Nueva llamada', color:'#6366f1', action:() => navigate('/llamadas') },
              { Icon:RiCalendarLine, label:'Agendar reuniÃ³n', color:'#8b5cf6', action:() => navigate('/reuniones') },
              { Icon:RiAddLine, label:'AÃ±adir nota', color:'#10b981', action:() => setTab('Notas') },
              { Icon:RiEditLine, label:'Editar oportunidad', color:'#0891b2', action:openEdit },
            ].map(({ Icon, label, color, action }) => (
              <button key={label} onClick={action} style={{
                display:'flex', alignItems:'center', gap:9, width:'100%', background:'transparent',
                border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', cursor:'pointer',
                color:'#94a3b8', fontSize:12.5, marginBottom:6, transition:'all .15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#111827'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Icon style={{ width:14, height:14, color, flexShrink:0 }} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {showEdit && form && (
        <div style={{
          position:'fixed', inset:0, background:'#000000a0', zIndex:100,
          display:'flex', alignItems:'center', justifyContent:'center', padding:20,
        }} onClick={() => !savingEdit && setShowEdit(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width:'100%', maxWidth:480, maxHeight:'86vh', overflowY:'auto',
              background:'#0d1117', border:'1px solid #1e2433', borderRadius:16, padding:'20px 22px',
            }}
          >
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <p style={{ margin:0, fontSize:15, fontWeight:700, color:'#f1f5f9' }}>Editar oportunidad</p>
              <button onClick={() => setShowEdit(false)} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', padding:4 }}>
                <RiCloseLine style={{ width:18, height:18 }} />
              </button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Nombre</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name:e.target.value }))}
                  style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}
                />
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Etapa</label>
                  <select
                    value={form.stage}
                    onChange={e => setForm(f => ({ ...f, stage:e.target.value }))}
                    style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none', cursor:'pointer' }}
                  >
                    {STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Probabilidad (%)</label>
                  <input
                    type="number" min={0} max={100}
                    value={form.probability}
                    onChange={e => setForm(f => ({ ...f, probability:e.target.value }))}
                    style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}
                  />
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Valor</label>
                  <input
                    type="number" min={0}
                    value={form.value}
                    onChange={e => setForm(f => ({ ...f, value:e.target.value }))}
                    style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}
                  />
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Moneda</label>
                  <select
                    value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency:e.target.value }))}
                    style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none', cursor:'pointer' }}
                  >
                    {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Fecha de cierre estimada</label>
                  <input
                    type="date"
                    value={form.expectedCloseDate}
                    onChange={e => setForm(f => ({ ...f, expectedCloseDate:e.target.value }))}
                    style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}
                  />
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Asignado a (ID usuario)</label>
                  <input
                    value={form.assignedTo}
                    onChange={e => setForm(f => ({ ...f, assignedTo:e.target.value }))}
                    style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Notas</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes:e.target.value }))}
                  style={{ width:'100%', minHeight:90, boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit' }}
                />
              </div>

              {editError && <p style={{ margin:0, fontSize:12, color:'#f87171' }}>{editError}</p>}

              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:4 }}>
                <button
                  onClick={() => setShowEdit(false)}
                  disabled={savingEdit}
                  style={{ background:'transparent', border:'1px solid #1e2433', borderRadius:9, padding:'8px 16px', color:'#94a3b8', fontSize:13, cursor:'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  style={{
                    background:'linear-gradient(135deg,#4f46e5,#7c3aed)', border:'none', borderRadius:9,
                    padding:'8px 18px', color:'#fff', fontSize:13, fontWeight:700,
                    cursor: savingEdit ? 'not-allowed' : 'pointer', opacity: savingEdit ? 0.6 : 1,
                  }}
                >
                  {savingEdit ? 'Guardandoâ€¦' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mark as lost modal */}
      {showLostForm && (
        <div style={{
          position:'fixed', inset:0, background:'#000000a0', zIndex:100,
          display:'flex', alignItems:'center', justifyContent:'center', padding:20,
        }} onClick={() => !actioning && setShowLostForm(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width:'100%', maxWidth:420, background:'#0d1117', border:'1px solid #1e2433',
              borderRadius:16, padding:'20px 22px',
            }}
          >
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <p style={{ margin:0, fontSize:15, fontWeight:700, color:'#f1f5f9' }}>Marcar oportunidad como perdida</p>
              <button onClick={() => setShowLostForm(false)} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', padding:4 }}>
                <RiCloseLine style={{ width:18, height:18 }} />
              </button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Motivo *</label>
                <input
                  value={lostReason}
                  onChange={e => setLostReason(e.target.value)}
                  placeholder="Ej. Presupuesto insuficiente"
                  style={{ width:'100%', boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}
                />
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, color:'#6b7280', marginBottom:5 }}>Notas adicionales</label>
                <textarea
                  value={lostNotes}
                  onChange={e => setLostNotes(e.target.value)}
                  style={{ width:'100%', minHeight:70, boxSizing:'border-box', background:'#080c14', border:'1px solid #1e2433', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit' }}
                />
              </div>

              {actionError && <p style={{ margin:0, fontSize:12, color:'#f87171' }}>{actionError}</p>}

              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:4 }}>
                <button
                  onClick={() => setShowLostForm(false)}
                  disabled={actioning}
                  style={{ background:'transparent', border:'1px solid #1e2433', borderRadius:9, padding:'8px 16px', color:'#94a3b8', fontSize:13, cursor:'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleMarkLost}
                  disabled={actioning}
                  style={{
                    background:'#dc2626', border:'none', borderRadius:9,
                    padding:'8px 18px', color:'#fff', fontSize:13, fontWeight:700,
                    cursor: actioning ? 'not-allowed' : 'pointer', opacity: actioning ? 0.6 : 1,
                  }}
                >
                  {actioning ? 'Guardandoâ€¦' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

