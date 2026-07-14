import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiArrowLeftLine, RiCalendarLine, RiVideoLine, RiUserLine,
  RiEditLine, RiCloseLine, RiCheckLine, RiTimeLine,
  RiMoneyDollarBoxLine, RiRobotLine,
} from 'react-icons/ri'
import '../dashboard.css'
import NewReunionModal from '../modals/NewReunionModal'

const BG_POOL = ['#2563eb','#0891b2','#7c3aed','#b45309','#be185d','#059669','#d97706','#0d9488']
const STATUS_LABEL = { scheduled:'Confirmada', completed:'Completada', cancelled:'Cancelada', no_show:'No asistiÃ³' }
const STATUS_COLOR = { scheduled:'#10b981', completed:'#6b7280', cancelled:'#ef4444', no_show:'#f59e0b' }
const PLATFORM_COLORS = { google:'#34a853', zoom:'#2D8CFF', teams:'#5b5ea6' }
const TABS = ['PreparaciÃ³n', 'Notas', 'Historial']

// RE-108: mapeos de labels para los datos reales de preparaciÃ³n (nada de
// constantes decorativas â€” solo texto para presentar valores del backend).
const LEAD_STATUS_LABEL = { new:'Nuevo', contacted:'Contactado', qualified:'Interesado', unqualified:'Perdido', converted:'Ganado' }
const OPP_STAGE_LABEL = { lead:'Lead', qualified:'Calificada', proposal:'Propuesta', negotiation:'NegociaciÃ³n', closed_won:'Ganada', closed_lost:'Perdida' }
const MEETING_STATUS_LABEL = { scheduled:'Confirmada', completed:'Completada', cancelled:'Cancelada', no_show:'No asistiÃ³' }
const CALL_STATUS_LABEL = { completed:'Completada', failed:'Fallida', no_answer:'Sin respuesta', busy:'OcupÃ³' }
const SALES_ACTIVITY_TYPE_LABEL = {
  call:'Llamada', message:'Mensaje', email:'Email', note:'Nota', file:'Archivo',
  meeting:'ReuniÃ³n', status_change:'Cambio de estado', stage_change:'Cambio de etapa', task:'Tarea',
}

function fmtDate(iso) {
  if (!iso) return 'â€”'
  return new Date(iso).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' })
}

function fmtMoney(value, currency) {
  if (value === null || value === undefined) return 'â€”'
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(n)) return 'â€”'
  return new Intl.NumberFormat('es-ES', { style:'currency', currency: currency || 'EUR', maximumFractionDigits:0 }).format(n)
}

function Avatar({ name, bg, size = 40 }) {
  const initials = name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('')
  return (
    <div style={{
      width:size, height:size, borderRadius:Math.round(size*0.28), flexShrink:0,
      background:`linear-gradient(135deg, ${bg}, ${bg}bb)`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size*0.34, fontWeight:700, color:'#fff',
      boxShadow:`0 0 14px ${bg}55`,
    }}>{initials.toUpperCase()}</div>
  )
}

function mapRaw(data, id) {
  const d = new Date(data.scheduledAt)
  const dur = data.durationMinutes ?? 30
  const end = new Date(d.getTime() + dur * 60000)
  const now = new Date()
  const time = d.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })
  const endTime = end.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })
  // derive a stable color from the id
  const idx = id ? id.charCodeAt(0) % BG_POOL.length : 0
  return {
    id: data.id,
    status: data.status,
    lead: {
      name: data.lead?.name ?? 'â€”',
      company: data.lead?.company ?? 'â€”',
      role: '',
      bg: BG_POOL[idx],
    },
    agent: {
      name: data.assignee?.name ?? 'â€”',
      role: data.assignee?.role ?? '',
      bg: '#4f46e5',
    },
    date: d.toLocaleDateString('es-ES'),
    range: `${time} - ${endTime}`,
    dur: `${dur} min`,
    platform: data.meetingUrl?.includes('zoom') ? 'zoom' : 'google',
    estado: STATUS_LABEL[data.status] ?? data.status,
    estadoColor: STATUS_COLOR[data.status] ?? '#10b981',
    hasJoin: !!data.meetingUrl && data.status === 'scheduled',
    isLive: data.status === 'scheduled' && d <= now && now <= end,
    objetivo: data.title ?? '',
    title: data.title ?? '',
    summary: '',
    notes: data.notes ?? '',
    value: 'â€”', leadStatus: 'â€”', leadStatusColor: '#94a3b8',
    priority: 'Media', prioColor: '#60a5fa',
    resources: [],
    meetingUrl: data.meetingUrl,
    // RE-102: crudos, necesarios para precargar el modal de reprogramación.
    scheduledAt: data.scheduledAt,
    durationMinutes: dur,
  }
}

export default function MeetingDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [mtg, setMtg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('PreparaciÃ³n')
  const [showCancel, setShowCancel] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  // RE-107: resultado de la reunión (outcome/acuerdos) y no-show.
  const [outcome, setOutcome] = useState('')
  const [agreements, setAgreements] = useState('')
  const [createFollowUpTask, setCreateFollowUpTask] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [markingNoShow, setMarkingNoShow] = useState(false)
  const [resultError, setResultError] = useState('')
  // RE-108: contexto real de preparaciÃ³n (lead, notas, llamadas, oportunidad
  // abierta, actividad y reuniones previas) â€” nunca datos inventados.
  const [prep, setPrep] = useState(null)
  const [prepLoading, setPrepLoading] = useState(true)
  const [prepError, setPrepError] = useState(false)

  function loadPrep() {
    setPrepLoading(true)
    setPrepError(false)
    return apiFetch(`/api/meetings/${id}/prep`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setPrep(data))
      .catch(() => setPrepError(true))
      .finally(() => setPrepLoading(false))
  }

  function reload() {
    return apiFetch(`/api/meetings/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const mapped = mapRaw(data, id)
          setMtg(mapped)
          setNotes(mapped.notes)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { reload(); loadPrep() }, [id])

  async function saveNotes() {
    if (!mtg) return
    setNotesSaving(true)
    await apiFetch(`/api/meetings/${mtg.id}`, {
      method: 'PUT',
      body: JSON.stringify({ notes }),
    }).catch(() => {})
    setNotesSaving(false)
  }

  async function cancelMeeting() {
    await apiFetch(`/api/meetings/${mtg.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'cancelled' }),
    }).catch(() => {})
    setShowCancel(false)
    navigate('/reuniones')
  }

  // RE-107: cierra la reunión con su resultado real (outcome requerido).
  async function completeMeeting() {
    if (!mtg || !outcome.trim()) { setResultError('El resultado es obligatorio'); return }
    setResultError('')
    setCompleting(true)
    try {
      const res = await apiFetch(`/api/meetings/${mtg.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          outcome: outcome.trim(),
          agreements: agreements.trim() || undefined,
          createFollowUpTask,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setResultError(body?.error || 'No se pudo completar la reunión')
        return
      }
      await reload()
      await loadPrep()
    } catch {
      setResultError('No se pudo completar la reunión')
    } finally {
      setCompleting(false)
    }
  }

  // RE-107: registra que el lead no se presentó.
  async function markNoShow() {
    if (!mtg) return
    setResultError('')
    setMarkingNoShow(true)
    try {
      const res = await apiFetch(`/api/meetings/${mtg.id}/no-show`, {
        method: 'POST',
        body: JSON.stringify({ notes: outcome.trim() || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setResultError(body?.error || 'No se pudo marcar como no-show')
        return
      }
      await reload()
      await loadPrep()
    } catch {
      setResultError('No se pudo marcar como no-show')
    } finally {
      setMarkingNoShow(false)
    }
  }

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:16 }}>
      Cargandoâ€¦
    </div>
  )

  if (!mtg) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:16 }}>
      ReuniÃ³n no encontrada
    </div>
  )

  const platColor = PLATFORM_COLORS[mtg.platform] || '#6366f1'

  return (
    <div className="dark-scroll" style={{ flex:1, overflowY:'auto', background:'#080c14', display:'flex', flexDirection:'column' }}>

      {/* Back */}
      <div style={{ padding:'20px 28px 0', flexShrink:0 }}>
        <button onClick={() => navigate('/reuniones')} style={{
          display:'flex', alignItems:'center', gap:6,
          background:'none', border:'none', color:'#6b7280', fontSize:13, cursor:'pointer', padding:0,
        }}>
          <RiArrowLeftLine style={{ width:15, height:15 }} />
          Volver a Reuniones
        </button>
      </div>

      {/* Header */}
      <div style={{ padding:'20px 28px', flexShrink:0 }}>
        <div style={{
          background:'linear-gradient(135deg, #0d1117, #111827)',
          border:'1px solid #1e2433', borderRadius:16, padding:'22px 24px',
        }}>
          {/* Top row */}
          <div style={{ display:'flex', gap:16, alignItems:'flex-start', marginBottom:18 }}>
            <Avatar name={mtg.lead.name} bg={mtg.lead.bg} size={52} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5 }}>
                <h1 style={{ margin:0, fontSize:21, fontWeight:800, color:'#f1f5f9' }}>{mtg.lead.name}</h1>
                <span style={{ fontSize:12, background:`${mtg.estadoColor}20`, color:mtg.estadoColor, border:`1px solid ${mtg.estadoColor}40`, borderRadius:99, padding:'2px 10px', fontWeight:600 }}>{mtg.estado}</span>
              </div>
              <p style={{ margin:'0 0 8px', fontSize:13, color:'#6b7280' }}>{mtg.lead.company}</p>
              <div style={{ display:'flex', gap:16 }}>
                <span style={{ fontSize:12, color:'#4b5563', display:'flex', alignItems:'center', gap:5 }}>
                  <RiCalendarLine style={{ width:12, height:12 }} /> {mtg.date}
                </span>
                <span style={{ fontSize:12, color:'#4b5563', display:'flex', alignItems:'center', gap:5 }}>
                  <RiTimeLine style={{ width:12, height:12 }} /> {mtg.range} Â· {mtg.dur}
                </span>
                <span style={{ fontSize:12, fontWeight:700, color:platColor, textTransform:'capitalize', display:'flex', alignItems:'center', gap:5 }}>
                  <RiVideoLine style={{ width:12, height:12 }} /> {mtg.platform}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              {mtg.hasJoin && (
                <button onClick={() => window.open(mtg.meetingUrl, '_blank')} style={{
                  display:'flex', alignItems:'center', gap:6,
                  background:'linear-gradient(90deg,#4f46e5,#7c3aed)', border:'none',
                  borderRadius:9, padding:'8px 16px', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer',
                  boxShadow:'0 0 18px #7c3aed40',
                }}>
                  <RiVideoLine style={{ width:14, height:14 }} /> Unirse
                </button>
              )}
              <button onClick={() => setShowReschedule(true)} style={{
                display:'flex', alignItems:'center', gap:6, background:'#111827',
                border:'1px solid #1e2433', borderRadius:9, padding:'8px 12px',
                color:'#94a3b8', fontSize:13, cursor:'pointer',
              }}>
                <RiEditLine style={{ width:13, height:13 }} /> Reprogramar
              </button>
              <button onClick={() => setShowCancel(true)} style={{
                background:'#ef444410', border:'1px solid #ef444430', borderRadius:9,
                padding:'8px 12px', color:'#ef4444', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:5,
              }}>
                <RiCloseLine style={{ width:13, height:13 }} /> Cancelar
              </button>
            </div>
          </div>

          {/* Agent row */}
          <div style={{ display:'flex', gap:20, padding:'14px 0 0', borderTop:'1px solid #1a2235' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Avatar name={mtg.agent.name} bg={mtg.agent.bg} size={30} />
              <div>
                <p style={{ margin:0, fontSize:11.5, fontWeight:600, color:'#e2e8f0' }}>{mtg.agent.name}</p>
                <p style={{ margin:0, fontSize:10.5, color:'#4b5563' }}>{mtg.agent.role}</p>
              </div>
            </div>
            {[
              { Icon:RiMoneyDollarBoxLine, label:'Valor pipeline', value:mtg.value },
              { Icon:RiUserLine, label:'Estado lead', value:mtg.leadStatus, color:mtg.leadStatusColor },
              { Icon:RiCheckLine, label:'Prioridad', value:mtg.priority, color:mtg.prioColor },
            ].map(({ Icon, label, value, color }) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:7 }}>
                <Icon style={{ width:13, height:13, color:'#4b5563' }} />
                <div>
                  <p style={{ margin:0, fontSize:10.5, color:'#4b5563' }}>{label}</p>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, color: color || '#e2e8f0' }}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', gap:14, padding:'0 28px 28px', minHeight:0 }}>

        {/* Left */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:12 }}>

          {/* Objetivo card */}
          {mtg.objetivo && (
            <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10 }}>
                <RiRobotLine style={{ width:14, height:14, color:'#a78bfa' }} />
                <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#a78bfa' }}>Objetivo</p>
              </div>
              <p style={{ margin:0, fontSize:13, color:'#94a3b8', lineHeight:1.5 }}>{mtg.objetivo}</p>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid #1e2433' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background:'none', border:'none', padding:'8px 16px', fontSize:13,
                color: tab===t ? '#f1f5f9' : '#4b5563',
                borderBottom:`2px solid ${tab===t ? '#8b5cf6' : 'transparent'}`,
                cursor:'pointer', fontWeight: tab===t ? 700 : 400, transition:'all .15s', marginBottom:-1,
              }}>{t}</button>
            ))}
          </div>

          {tab === 'PreparaciÃ³n' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {prepLoading && (
                <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                  <p style={{ margin:0, fontSize:12.5, color:'#4b5563', textAlign:'center' }}>Cargando contexto del leadâ€¦</p>
                </div>
              )}

              {!prepLoading && prepError && (
                <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                  <p style={{ margin:0, fontSize:12.5, color:'#ef4444', textAlign:'center' }}>No se pudo cargar el contexto de preparaciÃ³n</p>
                </div>
              )}

              {!prepLoading && !prepError && prep && (
                <>
                  {/* Estado del lead */}
                  <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                    <p style={{ margin:'0 0 10px', fontSize:12.5, fontWeight:700, color:'#e2e8f0' }}>Lead</p>
                    {prep.lead ? (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:16 }}>
                        <div>
                          <p style={{ margin:0, fontSize:10.5, color:'#4b5563' }}>Estado</p>
                          <p style={{ margin:0, fontSize:12.5, color:'#e2e8f0', fontWeight:600 }}>{LEAD_STATUS_LABEL[prep.lead.status] ?? prep.lead.status}</p>
                        </div>
                        <div>
                          <p style={{ margin:0, fontSize:10.5, color:'#4b5563' }}>Empresa</p>
                          <p style={{ margin:0, fontSize:12.5, color:'#e2e8f0', fontWeight:600 }}>{prep.lead.company || 'â€”'}</p>
                        </div>
                        <div>
                          <p style={{ margin:0, fontSize:10.5, color:'#4b5563' }}>Contacto</p>
                          <p style={{ margin:0, fontSize:12.5, color:'#e2e8f0', fontWeight:600 }}>{prep.lead.email || prep.lead.phone || 'â€”'}</p>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin:0, fontSize:12.5, color:'#4b5563', fontStyle:'italic' }}>Lead no disponible</p>
                    )}
                  </div>

                  {/* Notas recientes */}
                  <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                    <p style={{ margin:'0 0 10px', fontSize:12.5, fontWeight:700, color:'#e2e8f0' }}>Notas recientes del lead</p>
                    {prep.recentNotes?.length ? prep.recentNotes.map(n => (
                      <div key={n.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:'1px solid #1a2235' }}>
                        <p style={{ margin:'0 0 3px', fontSize:12.5, color:'#94a3b8', lineHeight:1.5 }}>{n.text}</p>
                        <p style={{ margin:0, fontSize:10.5, color:'#4b5563' }}>{n.authorName} Â· {fmtDate(n.createdAt)}</p>
                      </div>
                    )) : (
                      <p style={{ margin:0, fontSize:12.5, color:'#4b5563', fontStyle:'italic' }}>Sin notas previas</p>
                    )}
                  </div>

                  {/* Ãšltimas llamadas */}
                  <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                    <p style={{ margin:'0 0 10px', fontSize:12.5, fontWeight:700, color:'#e2e8f0' }}>Ãšltimas llamadas</p>
                    {prep.recentCalls?.length ? prep.recentCalls.map(c => (
                      <div key={c.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:'1px solid #1a2235' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                          <span style={{ fontSize:11, fontWeight:700, color:'#e2e8f0' }}>{CALL_STATUS_LABEL[c.status] ?? c.status}</span>
                          {c.sentiment && <span style={{ fontSize:10.5, color:'#4b5563' }}>Â· {c.sentiment}</span>}
                          <span style={{ fontSize:10.5, color:'#4b5563', marginLeft:'auto' }}>{fmtDate(c.startedAt || c.createdAt)}</span>
                        </div>
                        <p style={{ margin:0, fontSize:12.5, color:'#94a3b8', lineHeight:1.5 }}>{c.summary || 'Sin resumen disponible'}</p>
                      </div>
                    )) : (
                      <p style={{ margin:0, fontSize:12.5, color:'#4b5563', fontStyle:'italic' }}>Sin llamadas previas</p>
                    )}
                  </div>

                  {/* Oportunidad abierta */}
                  <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                    <p style={{ margin:'0 0 10px', fontSize:12.5, fontWeight:700, color:'#e2e8f0' }}>Oportunidad abierta</p>
                    {prep.openOpportunity ? (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:16 }}>
                        <div>
                          <p style={{ margin:0, fontSize:10.5, color:'#4b5563' }}>Nombre</p>
                          <p style={{ margin:0, fontSize:12.5, color:'#e2e8f0', fontWeight:600 }}>{prep.openOpportunity.name}</p>
                        </div>
                        <div>
                          <p style={{ margin:0, fontSize:10.5, color:'#4b5563' }}>Etapa</p>
                          <p style={{ margin:0, fontSize:12.5, color:'#e2e8f0', fontWeight:600 }}>{OPP_STAGE_LABEL[prep.openOpportunity.stage] ?? prep.openOpportunity.stage}</p>
                        </div>
                        <div>
                          <p style={{ margin:0, fontSize:10.5, color:'#4b5563' }}>Valor</p>
                          <p style={{ margin:0, fontSize:12.5, color:'#e2e8f0', fontWeight:600 }}>{fmtMoney(prep.openOpportunity.value, prep.openOpportunity.currency)}</p>
                        </div>
                        <div>
                          <p style={{ margin:0, fontSize:10.5, color:'#4b5563' }}>Probabilidad</p>
                          <p style={{ margin:0, fontSize:12.5, color:'#e2e8f0', fontWeight:600 }}>{prep.openOpportunity.probability}%</p>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin:0, fontSize:12.5, color:'#4b5563', fontStyle:'italic' }}>Sin oportunidad abierta</p>
                    )}
                  </div>

                  {/* Actividad reciente */}
                  <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                    <p style={{ margin:'0 0 10px', fontSize:12.5, fontWeight:700, color:'#e2e8f0' }}>Actividad reciente</p>
                    {prep.recentActivity?.length ? prep.recentActivity.map(a => (
                      <div key={a.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:'1px solid #1a2235' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                          <span style={{ fontSize:11, fontWeight:700, color:'#818cf8' }}>{SALES_ACTIVITY_TYPE_LABEL[a.type] ?? a.type}</span>
                          <span style={{ fontSize:10.5, color:'#4b5563', marginLeft:'auto' }}>{fmtDate(a.occurredAt)}</span>
                        </div>
                        <p style={{ margin:0, fontSize:12.5, color:'#94a3b8', lineHeight:1.5 }}>{a.subject || a.body || 'â€”'}</p>
                      </div>
                    )) : (
                      <p style={{ margin:0, fontSize:12.5, color:'#4b5563', fontStyle:'italic' }}>Sin actividad reciente</p>
                    )}
                  </div>

                  {/* Reuniones anteriores */}
                  <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                    <p style={{ margin:'0 0 10px', fontSize:12.5, fontWeight:700, color:'#e2e8f0' }}>Reuniones anteriores con este lead</p>
                    {prep.previousMeetings?.length ? prep.previousMeetings.map(m => (
                      <div key={m.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:'1px solid #1a2235' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                          <span style={{ fontSize:11, fontWeight:700, color:'#e2e8f0' }}>{m.title}</span>
                          <span style={{ fontSize:10.5, color:'#4b5563', marginLeft:'auto' }}>{fmtDate(m.scheduledAt)} Â· {MEETING_STATUS_LABEL[m.status] ?? m.status}</span>
                        </div>
                        {m.status === 'completed' ? (
                          <p style={{ margin:0, fontSize:12.5, color:'#94a3b8', lineHeight:1.5 }}>
                            {m.outcome}{m.agreements ? ` â€” Acuerdos: ${m.agreements}` : ''}
                          </p>
                        ) : (
                          <p style={{ margin:0, fontSize:12.5, color:'#4b5563', fontStyle:'italic' }}>Sin resultado registrado</p>
                        )}
                      </div>
                    )) : (
                      <p style={{ margin:0, fontSize:12.5, color:'#4b5563', fontStyle:'italic' }}>Sin reuniones previas con este lead</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'Notas' && (
            <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={saveNotes}
                placeholder="Escribe tus notas aquÃ­..."
                style={{
                  width:'100%', minHeight:180, background:'transparent', border:'none',
                  color:'#94a3b8', fontSize:13, outline:'none', resize:'vertical', lineHeight:1.6,
                  fontFamily:'inherit', boxSizing:'border-box',
                }}
              />
              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
                <button onClick={saveNotes} style={{ background:'#4f46e5', border:'none', borderRadius:7, padding:'6px 14px', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  {notesSaving ? 'Guardandoâ€¦' : 'Guardar notas'}
                </button>
              </div>
            </div>
          )}

          {tab === 'Historial' && (
            <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
              <p style={{ margin:0, fontSize:13, color:'#4b5563', textAlign:'center', padding:'20px 0' }}>Historial disponible tras completar la reuniÃ³n</p>
            </div>
          )}
        </div>

        {/* Right */}
        <div style={{ width:240, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>
          {/* Resultado de la reunión (RE-107): solo mientras no esté cerrada
              (completada) ni cancelada — no-show sigue admitiendo cerrarla
              con outcome después. */}
          {mtg.status !== 'completed' && mtg.status !== 'cancelled' && (
            <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px' }}>
              <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'#e2e8f0' }}>Resultado de la reunión</p>
              <textarea
                value={outcome}
                onChange={e => setOutcome(e.target.value)}
                placeholder="¿Qué pasó en la reunión?"
                style={{
                  width:'100%', minHeight:60, background:'#080c14', border:'1px solid #1e2433', borderRadius:7,
                  color:'#94a3b8', fontSize:11.5, outline:'none', resize:'vertical', lineHeight:1.5,
                  fontFamily:'inherit', boxSizing:'border-box', padding:8, marginBottom:8,
                }}
              />
              <textarea
                value={agreements}
                onChange={e => setAgreements(e.target.value)}
                placeholder="Acuerdos alcanzados (opcional)"
                style={{
                  width:'100%', minHeight:44, background:'#080c14', border:'1px solid #1e2433', borderRadius:7,
                  color:'#94a3b8', fontSize:11.5, outline:'none', resize:'vertical', lineHeight:1.5,
                  fontFamily:'inherit', boxSizing:'border-box', padding:8, marginBottom:8,
                }}
              />
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#94a3b8', marginBottom:10, cursor:'pointer' }}>
                <input
                  type="checkbox"
                  checked={createFollowUpTask}
                  onChange={e => setCreateFollowUpTask(e.target.checked)}
                />
                Crear tarea de seguimiento
              </label>
              {resultError && (
                <p style={{ margin:'0 0 8px', fontSize:11, color:'#ef4444' }}>{resultError}</p>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <button onClick={completeMeeting} disabled={completing || markingNoShow} style={{
                  background:'#10b98115', border:'1px solid #10b98130', borderRadius:7,
                  padding:'8px 0', color:'#10b981', fontSize:12, fontWeight:700,
                  cursor: (completing || markingNoShow) ? 'not-allowed' : 'pointer', opacity: (completing || markingNoShow) ? 0.6 : 1,
                }}>
                  {completing ? 'Completando…' : 'Completar reunión'}
                </button>
                <button onClick={markNoShow} disabled={completing || markingNoShow} style={{
                  background:'#f59e0b15', border:'1px solid #f59e0b30', borderRadius:7,
                  padding:'8px 0', color:'#f59e0b', fontSize:12, fontWeight:700,
                  cursor: (completing || markingNoShow) ? 'not-allowed' : 'pointer', opacity: (completing || markingNoShow) ? 0.6 : 1,
                }}>
                  {markingNoShow ? 'Marcando…' : 'Marcar no-show'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reschedule modal (RE-102): precargado con la reunión actual, nunca
          crea una reunión nueva ni pierde la referencia a esta. */}
      {showReschedule && mtg && (
        <NewReunionModal
          meeting={mtg}
          onClose={() => setShowReschedule(false)}
          onSuccess={() => { setShowReschedule(false); reload() }}
        />
      )}

      {/* Cancel modal */}
      {showCancel && (
        <div onClick={() => setShowCancel(false)} style={{ position:'fixed', inset:0, zIndex:100, background:'#000a', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:14, padding:'24px', width:340, boxShadow:'0 40px 80px #0009' }}>
            <p style={{ margin:'0 0 6px', fontSize:16, fontWeight:700, color:'#f1f5f9' }}>Â¿Cancelar esta reuniÃ³n?</p>
            <p style={{ margin:'0 0 18px', fontSize:13, color:'#6b7280', lineHeight:1.5 }}>Se marcarÃ¡ como cancelada.</p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowCancel(false)} style={{ flex:1, padding:'9px 0', background:'none', border:'1px solid #1e2433', borderRadius:9, color:'#94a3b8', fontSize:13, cursor:'pointer' }}>No cancelar</button>
              <button onClick={cancelMeeting} style={{ flex:1, padding:'9px 0', background:'#ef444415', border:'1px solid #ef444430', borderRadius:9, color:'#ef4444', fontSize:13, fontWeight:700, cursor:'pointer' }}>Cancelar reuniÃ³n</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

