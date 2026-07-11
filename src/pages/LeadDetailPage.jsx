import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  RiArrowLeftLine, RiPhoneLine, RiMailLine, RiCalendar2Line,
  RiFileTextLine, RiMoreLine, RiLightbulbLine, RiCalendarLine,
  RiRobot2Line, RiSearchEyeLine, RiRefreshLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { mapLead } from '../lib/leadMapping'
import NewReunionModal from '../modals/NewReunionModal'
import '../dashboard.css'

const STATUS_MAP = {
  'Interesado':       { color: '#f59e0b', bg: '#f59e0b15' },
  'En seguimiento':   { color: '#3b82f6', bg: '#3b82f615' },
  'ReuniÃ³n agendada': { color: '#10b981', bg: '#10b98115' },
  'Nuevo':            { color: '#94a3b8', bg: '#94a3b815' },
  'NegociaciÃ³n':      { color: '#8b5cf6', bg: '#8b5cf615' },
  'Contactado':       { color: '#06b6d4', bg: '#06b6d415' },
  'Perdido':          { color: '#ef4444', bg: '#ef444415' },
  'Ganado':           { color: '#10b981', bg: '#10b98115' },
}
const SCORE_COLOR = { 'Muy alto': '#10b981', 'Alto': '#3b82f6', 'Medio': '#f59e0b', 'Bajo': '#ef4444' }
const TIER_COLOR = { HOT: '#ef4444', WARM: '#f59e0b', COLD: '#3b82f6' }
const SEVERITY_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#6b7280' }
const IMPACT_COLOR = { ALTO: '#ef4444', MEDIO: '#f59e0b', BAJO: '#6b7280' }

function pctLabel(diff) {
  if (diff == null) return null
  return `${diff > 0 ? '+' : ''}${diff}%`
}
const DETAIL_TABS = ['Resumen', 'Actividad', 'InformaciÃ³n', 'Notas', 'Archivos']
const AI_TIP_BY_LEVEL = {
  'Muy alto': 'Alta probabilidad de cierre. Enfócate en demostrar el ROI y agendar una demo con el decisor.',
  'Alto':     'Buena probabilidad de cierre. Reforzá el seguimiento y resolvé objeciones pendientes.',
  'Medio':    'Probabilidad de cierre media. Priorizá entender el timing y el presupuesto real.',
  'Bajo':     'Probabilidad de cierre baja por ahora. Conviene recalificar antes de invertir más tiempo comercial.',
}
const CALL_ACT_LABEL = { completed: 'Llamada realizada', no_answer: 'Llamada sin respuesta', failed: 'Llamada fallida', busy: 'Línea ocupada' }

function formatDateEs(d) {
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function buildActivityTimeline(calls, meetings) {
  const items = [
    ...(calls || []).map(c => ({
      label: CALL_ACT_LABEL[c.status] ?? 'Llamada',
      sub: c.summary || (c.durationSeconds ? `Duración: ${Math.floor(c.durationSeconds / 60)}:${String(c.durationSeconds % 60).padStart(2, '0')} min` : (c.outcome ?? '')),
      time: formatDateEs(c.createdAt),
      color: '#3b82f6',
      ts: new Date(c.createdAt).getTime(),
    })),
    ...(meetings || []).map(m => ({
      label: 'Reunión agendada',
      sub: m.title ?? '',
      time: formatDateEs(m.scheduledAt),
      color: '#10b981',
      ts: new Date(m.scheduledAt).getTime(),
    })),
  ]
  return items.sort((a, b) => b.ts - a.ts)
}

function Ring({ pct, color = '#10b981', size = 96 }) {
  const cx = size / 2, r = size * 0.37, sw = size * 0.11
  const C = 2 * Math.PI * r, dash = (pct / 100) * C
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#1e2433" strokeWidth={sw} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${dash.toFixed(1)} ${(C - dash).toFixed(1)}`}
          style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cx}px`, filter: `drop-shadow(0 0 5px ${color}70)` }}
        />
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: size * 0.2, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{pct}%</p>
      </div>
    </div>
  )
}

function DigitalAuditCard({ leadId, initialAudit, initialSector, initialCity }) {
  const [audit, setAudit] = useState(initialAudit)
  const [website, setWebsite] = useState(initialAudit?.website ?? '')
  const [sector, setSector] = useState(initialAudit?.benchmark?.sector ?? initialSector ?? '')
  const [city, setCity] = useState(initialAudit?.benchmark?.city ?? initialCity ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])

  useEffect(() => {
    if (initialAudit) { setAudit(initialAudit); setWebsite(initialAudit.website ?? '') }
  }, [initialAudit])

  useEffect(() => {
    apiFetch(`/api/leads/${leadId}/audit-history`).then(r => r.ok ? r.json() : []).then(data => {
      setHistory(Array.isArray(data) ? data : [])
    }).catch(() => {})
  }, [leadId])

  async function runAudit() {
    if (!website.trim()) { setError('Indica una web para auditar'); return }
    setLoading(true); setError('')
    try {
      const res = await apiFetch(`/api/leads/${leadId}/audit`, {
        method: 'POST',
        body: JSON.stringify({ website: website.trim(), sector: sector.trim() || undefined, city: city.trim() || undefined }),
      })
      if (!res.ok) throw new Error()
      const result = await res.json()
      setAudit(result)
      setHistory(h => [{ id: `local-${Date.now()}`, result, createdAt: new Date().toISOString() }, ...h])
    } catch {
      setError('No se pudo auditar la web')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <RiSearchEyeLine style={{ width: 15, height: 15, color: '#818cf8' }} />
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: '#e2e8f0', flex: 1 }}>Auditoría digital / SEO</p>
        {audit && (
          <span style={{ fontSize: 10, fontWeight: 700, color: TIER_COLOR[audit.tier], background: `${TIER_COLOR[audit.tier]}18`, border: `1px solid ${TIER_COLOR[audit.tier]}40`, borderRadius: 99, padding: '2px 8px' }}>
            {audit.tier}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          value={website}
          onChange={e => setWebsite(e.target.value)}
          placeholder="www.empresa.com"
          style={{ flex: 1, background: '#111827', border: '1px solid #1e2433', borderRadius: 8, padding: '7px 10px', color: '#e2e8f0', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
        />
        <button onClick={runAudit} disabled={loading} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none',
          background: loading ? '#374151' : 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontSize: 12,
          fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}>
          <RiRefreshLine style={{ width: 13, height: 13 }} />
          {loading ? 'Auditando…' : audit ? 'Re-auditar' : 'Auditar ahora'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          value={sector}
          onChange={e => setSector(e.target.value)}
          placeholder="Sector (para benchmark)"
          style={{ flex: 1, background: '#111827', border: '1px solid #1e2433', borderRadius: 8, padding: '6px 10px', color: '#94a3b8', fontSize: 11.5, outline: 'none', fontFamily: 'inherit' }}
        />
        <input
          value={city}
          onChange={e => setCity(e.target.value)}
          placeholder="Ciudad (para benchmark)"
          style={{ flex: 1, background: '#111827', border: '1px solid #1e2433', borderRadius: 8, padding: '6px 10px', color: '#94a3b8', fontSize: 11.5, outline: 'none', fontFamily: 'inherit' }}
        />
      </div>

      {error && <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#ef4444' }}>{error}</p>}

      {audit && (
        <>
          <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
            <div style={{ flex: 1, background: '#111827', borderRadius: 9, padding: '10px 12px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 2px', fontSize: 10, color: '#4b5563' }}>Presencia pública</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>{audit.publicScore}</p>
            </div>
            <div style={{ flex: 1, background: '#111827', borderRadius: 9, padding: '10px 12px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 2px', fontSize: 10, color: '#4b5563' }}>Madurez operativa</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>{audit.opsScore ?? '—'}</p>
            </div>
            <div style={{ flex: 1, background: '#111827', borderRadius: 9, padding: '10px 12px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 2px', fontSize: 10, color: '#4b5563' }}>Oportunidad global</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>{audit.leadOpportunityScore}</p>
            </div>
          </div>

          <div style={{ background: '#6366f112', border: '1px solid #6366f130', borderRadius: 9, padding: '10px 12px', marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 11.5, color: '#c7d2fe', lineHeight: 1.5 }}>{audit.commercialPitch}</p>
          </div>

          <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#94a3b8', lineHeight: 1.5 }}>{audit.summary}</p>

          {audit.benchmark && (
            <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 9, padding: '10px 12px', marginBottom: 12 }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>
                Benchmark: {audit.benchmark.sector} en {audit.benchmark.city} ({audit.benchmark.sampleSize} negocios)
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: '#94a3b8' }}>
                {audit.benchmark.avgRating != null && (
                  <span>Rating medio: {audit.benchmark.avgRating.toFixed(1)}★{audit.benchmark.ratingDiffPct != null && (
                    <span style={{ color: audit.benchmark.ratingDiffPct >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}> ({pctLabel(audit.benchmark.ratingDiffPct)})</span>
                  )}</span>
                )}
                {audit.benchmark.avgReviews != null && (
                  <span>Reseñas medias: {Math.round(audit.benchmark.avgReviews)}{audit.benchmark.reviewsDiffPct != null && (
                    <span style={{ color: audit.benchmark.reviewsDiffPct >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}> ({pctLabel(audit.benchmark.reviewsDiffPct)})</span>
                  )}</span>
                )}
                {audit.benchmark.pctWithWebsite != null && (
                  <span>{audit.benchmark.pctWithWebsite}% del sector tiene web</span>
                )}
              </div>
            </div>
          )}

          {audit.opportunities?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {audit.opportunities.slice(0, 5).map((o, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px', background: '#111827', border: '1px solid #1a2235', borderRadius: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: SEVERITY_COLOR[o.severity], marginTop: 5, flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: '#94a3b8', lineHeight: 1.4, flex: 1 }}>{o.title}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: IMPACT_COLOR[o.impact], background: `${IMPACT_COLOR[o.impact]}18`, border: `1px solid ${IMPACT_COLOR[o.impact]}40`, borderRadius: 99, padding: '1px 7px', flexShrink: 0 }}>
                    {o.impact}
                  </span>
                </div>
              ))}
            </div>
          )}

          {history.length > 1 && (
            <p style={{ margin: '10px 0 0', fontSize: 10.5, color: '#4b5563' }}>
              Auditado {history.length} veces · primera vez hace {Math.round((Date.now() - new Date(history[history.length - 1].createdAt).getTime()) / 86400000)} días
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default function LeadDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lead, setLead] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Resumen')
  const [initialAudit, setInitialAudit] = useState(null)

  useEffect(() => {
    apiFetch(`/api/leads/${id}/timeline`).then(r => r.ok ? r.json() : null).then(data => {
      if (data?.lead) {
        setLead({
          ...mapLead(data.lead, 0),
          calls: data.calls || [],
          meetings: data.meetings || [],
          opportunities: data.opportunities || [],
          opportunity: (data.opportunities || [])[0] ?? null,
        })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
    apiFetch(`/api/leads/${id}/audit`).then(r => r.ok ? r.json() : null).then(data => {
      if (data?.audit) setInitialAudit(data.audit)
    }).catch(() => {})
    apiFetch(`/api/leads/${id}/notes`).then(r => r.ok ? r.json() : []).then(data => {
      setTabNotes(Array.isArray(data) ? data : [])
    }).catch(() => {})
  }, [id])
  const [showNote, setShowNote] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [showAllPains, setShowAllPains] = useState(false)
  const [quickNoteText, setQuickNoteText] = useState('')
  const [tabNoteText, setTabNoteText] = useState('')
  const [tabSaved, setTabSaved] = useState(false)
  const [tabNotes, setTabNotes] = useState([])

  async function addNote(text) {
    if (!text.trim()) return
    const res = await apiFetch(`/api/leads/${id}/notes`, { method: 'POST', body: JSON.stringify({ text: text.trim() }) })
    if (!res.ok) return
    const note = await res.json()
    setTabNotes(n => [note, ...n])
  }
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  // Pestaña Email (Mautic) — solo aparece si la org tiene Plan Completo con
  // el módulo activado, ver PLAN_IMPLEMENTACION_POSTIZ_MAUTIC.md sección 4.
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailMsg, setEmailMsg] = useState('')

  useEffect(() => {
    apiFetch('/api/dashboard/stats').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.orgPlan === 'completo' && data?.mauticEnabled) setEmailEnabled(true)
    }).catch(() => {})
  }, [])

  async function sendTemplate() {
    if (!templateId.trim()) return
    setSendingEmail(true)
    setEmailMsg('')
    try {
      const res = await apiFetch(`/api/leads/${id}/send-email`, {
        method: 'POST',
        body: JSON.stringify({ mauticEmailId: templateId.trim() }),
      })
      setEmailMsg(res.ok ? 'Email enviado.' : 'No se pudo enviar el email.')
    } finally {
      setSendingEmail(false)
    }
  }

  useEffect(() => {
    apiFetch(`/api/leads/${id}/files`).then(r => r.ok ? r.json() : []).then(data => {
      setFiles(Array.isArray(data) ? data : [])
    }).catch(() => {})
  }, [id])

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1] ?? '')
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function uploadFile(file) {
    setUploading(true)
    try {
      const contentBase64 = await fileToBase64(file)
      const res = await apiFetch(`/api/leads/${id}/files`, {
        method: 'POST',
        body: JSON.stringify({ name: file.name, contentBase64, mimeType: file.type || undefined }),
      })
      if (!res.ok) return
      const saved = await res.json()
      setFiles(prev => [saved, ...prev])
    } finally {
      setUploading(false)
    }
  }

  function formatFileSize(bytes) {
    return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14, background: '#080c14' }}>
      Cargandoâ€¦
    </div>
  )

  if (!lead) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14, background: '#080c14' }}>
      Lead no encontrado
    </div>
  )

  const st = STATUS_MAP[lead.status] || { color: '#6b7280', bg: '#6b728015' }
  const closeColor = SCORE_COLOR[lead.sl] || '#10b981'
  const tabs = emailEnabled ? [...DETAIL_TABS, 'Email'] : DETAIL_TABS

  return (
    <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', background: '#080c14', padding: '26px 32px 40px' }}>

      {/* Back */}
      <button onClick={() => navigate('/leads')} style={{
        display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
        color: '#6b7280', cursor: 'pointer', fontSize: 12.5, padding: 0, marginBottom: 22, fontFamily: 'inherit',
      }}>
        <RiArrowLeftLine style={{ width: 14, height: 14 }} /> Leads
      </button>

      {/* Header card */}
      <div style={{ padding: '20px 24px', background: '#0d1117', border: '1px solid #1e2433', borderRadius: 16, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* Avatar */}
          <div style={{
            width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(135deg,${lead.bg},${lead.bg}bb)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 700, color: '#fff', boxShadow: `0 0 18px ${lead.bg}55`,
          }}>{lead.initials}</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>{lead.name}</h1>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', background: '#374151', borderRadius: 6, padding: '2px 9px', flexShrink: 0 }}>{lead.score}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, background: st.bg, color: st.color, border: `1px solid ${st.color}40`, borderRadius: 99, padding: '2px 9px', flexShrink: 0 }}>{lead.status}</span>
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: '#6b7280' }}>{lead.role} Â· {lead.company}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {lead.tags.map(t => (
                <span key={t} style={{ fontSize: 11, padding: '2px 9px', borderRadius: 99, background: '#111827', border: '1px solid #1e2433', color: '#94a3b8' }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            {[
              { Icon: RiPhoneLine,    label: 'Llamar',  action: () => lead.phone && window.open(`tel:${lead.phone}`) },
              { Icon: RiMailLine,     label: 'Email',   action: () => lead.email && window.open(`mailto:${lead.email}?subject=Seguimiento - ${lead.name}`) },
              { Icon: RiCalendar2Line,label: 'Agendar', action: () => setShowSchedule(true) },
              { Icon: RiFileTextLine, label: 'Nota',    action: () => setShowNote(v => !v) },
              { Icon: RiMoreLine,     label: 'MÃ¡s',     action: () => {} },
            ].map(({ Icon, label, action }) => (
              <button key={label} onClick={action} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '10px 13px', background: '#111827', border: '1px solid #1e2433',
                borderRadius: 10, cursor: 'pointer', color: '#94a3b8', fontFamily: 'inherit',
                minWidth: 54,
              }}>
                <Icon style={{ width: 16, height: 16 }} />
                <span style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {showNote && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #1e2433' }}>
            <textarea placeholder="Escribe una nota sobre este lead..." rows={3} value={quickNoteText} onChange={e => setQuickNoteText(e.target.value)} style={{
              width: '100%', background: '#111827', border: '1px solid #1e2433', borderRadius: 9,
              padding: '10px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', resize: 'vertical',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowNote(false); setQuickNoteText('') }} style={{ padding: '6px 14px', background: 'none', border: '1px solid #1e2433', borderRadius: 8, color: '#6b7280', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={() => { addNote(quickNoteText); setQuickNoteText(''); setShowNote(false) }} style={{ padding: '6px 14px', background: '#4f46e5', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Guardar nota</button>
            </div>
          </div>
        )}
      </div>

      {/* Body 2-col */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 16, alignItems: 'start' }}>

        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Close probability */}
          <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, alignSelf: 'flex-start' }}>Probabilidad de cierre</p>
            <Ring pct={lead.closePct} color={closeColor} size={96} />
            <span style={{ fontSize: 13, fontWeight: 700, color: closeColor }}>{lead.closeLevel}</span>
            <div style={{ width: '100%', padding: '10px 12px', background: '#111827', borderRadius: 9, textAlign: 'center' }}>
              <p style={{ margin: '0 0 2px', fontSize: 11, color: '#4b5563' }}>Valor potencial</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>{lead.opportunity?.value != null ? `${lead.opportunity.currency === 'EUR' ? '€' : (lead.opportunity.currency ?? '')}${Number(lead.opportunity.value).toLocaleString('es-ES')}` : '-'}</p>
            </div>
          </div>

          {/* AI recommendation */}
          <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: 'linear-gradient(135deg,#4f46e5,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RiRobot2Line style={{ width: 13, height: 13, color: '#fff' }} />
              </div>
              <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: '#818cf8' }}>RecomendaciÃ³n IA</p>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
              {AI_TIP_BY_LEVEL[lead.closeLevel] ?? AI_TIP_BY_LEVEL.Medio}
            </p>
            <button onClick={() => setShowSchedule(true)} style={{
              width: '100%', padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontSize: 12,
              fontWeight: 600, boxShadow: '0 0 12px #6366f155', fontFamily: 'inherit',
            }}>
              Agendar demo
            </button>
          </div>

          {/* Pain points */}
          {lead.painPoints.length > 0 && (
            <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Pain Points</p>
                <button onClick={() => setShowAllPains(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 11, fontWeight: 600, padding: 0, fontFamily: 'inherit' }}>
                  {showAllPains ? 'Ver menos' : 'Ver todos'}
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(showAllPains ? lead.painPoints : lead.painPoints.slice(0, 3)).map(p => (
                  <span key={p} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#111827', border: '1px solid #1e2433', color: '#94a3b8' }}>{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Source & agent */}
          <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px' }}>
            {[
              { label: 'Fuente', value: lead.source },
              { label: 'Valor estimado', value: lead.opportunity?.value != null ? `${lead.opportunity.currency === 'EUR' ? '€' : (lead.opportunity.currency ?? '')}${Number(lead.opportunity.value).toLocaleString('es-ES')}` : '-' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #111827' }}>
                <span style={{ fontSize: 11.5, color: '#4b5563' }}>{label}</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#94a3b8' }}>{value}</span>
              </div>
            ))}
          </div>

          <DigitalAuditCard
            leadId={id}
            initialAudit={initialAudit}
            initialSector={lead.customFields?.sector}
            initialCity={lead.customFields?.city}
          />
        </div>

        {/* Right: tabs */}
        <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #1e2433', padding: '0 16px' }}>
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: 'none', border: 'none', padding: '13px 13px',
                fontSize: 12.5, fontWeight: tab === t ? 700 : 400,
                color: tab === t ? '#818cf8' : '#4b5563',
                borderBottom: `2px solid ${tab === t ? '#6366f1' : 'transparent'}`,
                cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}>{t}</button>
            ))}
          </div>

          <div style={{ padding: '22px 22px' }}>
            {tab === 'Resumen' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

                {/* Last activity card */}
                <div style={{ padding: '16px', background: '#111827', border: '1px solid #1a2235', borderRadius: 12 }}>
                  <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Última actividad</p>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: '#3b82f615', border: '1px solid #3b82f630', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <RiPhoneLine style={{ width: 16, height: 16, color: '#3b82f6' }} />
                    </div>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{(buildActivityTimeline(lead.calls, lead.meetings)[0]?.label) ?? lead.act.action}</p>
                      <p style={{ margin: 0, fontSize: 11.5, color: '#6b7280' }}>{(buildActivityTimeline(lead.calls, lead.meetings)[0]?.time) ?? lead.act.date}</p>
                    </div>
                  </div>
                </div>

                {/* Next steps */}
                <div>
                  <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Próximos pasos sugeridos</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { icon: RiCalendarLine, text: 'Agendar llamada de seguimiento', color: '#10b981' },
                      { icon: RiMailLine,     text: 'Enviar propuesta económica',      color: '#8b5cf6' },
                      { icon: RiLightbulbLine,text: 'Preparar caso de uso específico', color: '#f59e0b' },
                    ].map(({ icon: Icon, text, color }, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: '#111827', border: '1px solid #1a2235', borderRadius: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon style={{ width: 13, height: 13, color }} />
                        </div>
                        <span style={{ fontSize: 12.5, color: '#94a3b8' }}>{text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Score breakdown */}
                <div>
                  <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Desglose del score</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: 'Fit de producto',    val: Math.min(100, lead.score + 5) },
                      { label: 'Engagement',         val: Math.max(0, lead.score - 10) },
                      { label: 'Timing',             val: Math.min(100, lead.score + 12) },
                      { label: 'Presupuesto',        val: Math.max(0, lead.score - 8) },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{val}</span>
                        </div>
                        <div style={{ height: 5, background: '#1e2433', borderRadius: 99 }}>
                          <div style={{ width: `${val}%`, height: '100%', background: `linear-gradient(90deg, #6366f1, #818cf8)`, borderRadius: 99 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'Actividad' && (
              <div>
                <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Timeline de actividad</p>
                {(() => {
                  const timeline = buildActivityTimeline(lead.calls, lead.meetings)
                  if (!timeline.length) return <p style={{ color: '#4b5563', fontSize: 13 }}>Sin actividad todavía.</p>
                  return (
                    <div style={{ position: 'relative', paddingLeft: 20 }}>
                      <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 1, background: '#1e2433' }} />
                      {timeline.map((a, i) => (
                        <div key={i} style={{ position: 'relative', marginBottom: 20 }}>
                          <div style={{ position: 'absolute', left: -20, top: 4, width: 9, height: 9, borderRadius: '50%', background: a.color, boxShadow: `0 0 6px ${a.color}80` }} />
                          <div style={{ padding: '11px 14px', background: '#111827', border: '1px solid #1a2235', borderRadius: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#e2e8f0' }}>{a.label}</span>
                              <span style={{ fontSize: 11, color: '#4b5563' }}>{a.time}</span>
                            </div>
                            {a.sub && <p style={{ margin: 0, fontSize: 11.5, color: '#6b7280' }}>{a.sub}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}

            {tab === 'InformaciÃ³n' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                  <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Datos de contacto</p>
                  {[
                    { label: 'Email', value: lead.email || '-' },
                    { label: 'Teléfono', value: lead.phone || '-' },
                    { label: 'Empresa', value: lead.company || '-' },
                    { label: 'Cargo', value: lead.role || '-' },
                    { label: 'Ciudad', value: lead.city || '-' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #1e2433' }}>
                      <span style={{ fontSize: 12, color: '#4b5563' }}>{label}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#94a3b8' }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                  <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Origen y etiquetas</p>
                  {[
                    { label: 'Fuente', value: lead.source || '-' },
                    { label: 'Estado', value: lead.status || '-' },
                    { label: 'Valor estimado', value: lead.opportunity?.value != null ? `${lead.opportunity.currency === 'EUR' ? '€' : (lead.opportunity.currency ?? '')}${Number(lead.opportunity.value).toLocaleString('es-ES')}` : '-' },
                    { label: 'Creado', value: lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('es-ES') : '-' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #1e2433' }}>
                      <span style={{ fontSize: 12, color: '#4b5563' }}>{label}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#94a3b8' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'Notas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '14px' }}>
                  <textarea placeholder="Añade una nota..." value={tabNoteText} onChange={e => setTabNoteText(e.target.value)} style={{ width: '100%', minHeight: 90, background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 13, outline: 'none', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button onClick={async () => {
                      if (!tabNoteText.trim()) return
                      await addNote(tabNoteText)
                      setTabNoteText('')
                      setTabSaved(true)
                      setTimeout(() => setTabSaved(false), 1500)
                    }} style={{ background: tabSaved ? '#10b981' : '#6366f115', border: '1px solid ' + (tabSaved ? '#10b98130' : '#6366f130'), borderRadius: 8, padding: '6px 14px', color: tabSaved ? '#10b981' : '#818cf8', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s' }}>
                      {tabSaved ? '✓ Guardada' : 'Guardar nota'}
                    </button>
                  </div>
                </div>
                {tabNotes.length === 0 && <p style={{ color: '#4b5563', fontSize: 13 }}>Sin notas todavía.</p>}
                {tabNotes.map(n => (
                  <div key={n.id} style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 11, padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1' }}>{n.authorName}</span>
                      <span style={{ fontSize: 11, color: '#374151' }}>{new Date(n.createdAt).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{n.text}</p>
                  </div>
                ))}
              </div>
            )}

            {tab === 'Archivos' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={e => {
                  const f = e.target.files[0]
                  if (f) uploadFile(f)
                  e.target.value = ''
                }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ background: '#6366f115', border: '1px solid #6366f130', borderRadius: 8, padding: '7px 14px', color: '#818cf8', fontSize: 12, fontWeight: 700, cursor: uploading ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                    {uploading ? 'Subiendo...' : '+ Subir archivo'}
                  </button>
                </div>
                {files.length === 0 && <p style={{ color: '#4b5563', fontSize: 13 }}>Sin archivos todavia.</p>}
                {files.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#111827', border: '1px solid #1a2235', borderRadius: 11, padding: '13px 16px' }}>
                    <RiFileTextLine style={{ width: 18, height: 18, color: '#6b7280', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>{formatFileSize(f.sizeBytes)} - {new Date(f.createdAt).toLocaleDateString('es-ES')}</p>
                    </div>
                    <a href={f.url} target="_blank" rel="noreferrer" style={{ color: '#818cf8', fontSize: 11.5, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>Descargar</a>
                  </div>
                ))}
              </div>
            )}

            {tab === 'Email' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '14px' }}>
                  <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Enviar plantilla</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input
                      value={templateId}
                      onChange={e => setTemplateId(e.target.value)}
                      placeholder="ID de email en Mautic"
                      style={{ flex: 1, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                    />
                    <button onClick={sendTemplate} disabled={sendingEmail} style={{ background: sendingEmail ? '#374151' : '#6366f1', border: 'none', borderRadius: 8, padding: '9px 16px', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: sendingEmail ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                      {sendingEmail ? 'Enviando…' : 'Enviar'}
                    </button>
                  </div>
                  {emailMsg && <p style={{ margin: '8px 0 0', fontSize: 12, color: emailMsg.includes('No se pudo') ? '#ef4444' : '#10b981' }}>{emailMsg}</p>}
                </div>

                <div>
                  <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Actividad de email</p>
                  {(lead.customFields?.mauticActivity ?? []).length === 0 && (
                    <p style={{ color: '#4b5563', fontSize: 13 }}>Sin aperturas ni clics todavía.</p>
                  )}
                  {(lead.customFields?.mauticActivity ?? []).map((a, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#111827', border: '1px solid #1a2235', borderRadius: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 12.5, color: '#94a3b8' }}>{a.type === 'open' ? 'Abrió' : 'Clic en'} {a.detail ? `— ${a.detail}` : ''}</span>
                      <span style={{ fontSize: 11, color: '#4b5563' }}>{new Date(a.at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showSchedule && <NewReunionModal onClose={() => setShowSchedule(false)} />}
    </div>
  )
}

