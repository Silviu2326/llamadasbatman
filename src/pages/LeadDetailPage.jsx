import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  RiArrowLeftLine, RiPhoneLine, RiMailLine, RiCalendar2Line,
  RiFileTextLine, RiMoreLine, RiLightbulbLine, RiCalendarLine,
  RiRobot2Line,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import NewReunionModal from '../modals/NewReunionModal'
import '../dashboard.css'

const STATUS_MAP = {
  'Interesado':       { color: '#f59e0b', bg: '#f59e0b15' },
  'En seguimiento':   { color: '#3b82f6', bg: '#3b82f615' },
  'Reunión agendada': { color: '#10b981', bg: '#10b98115' },
  'Nuevo':            { color: '#94a3b8', bg: '#94a3b815' },
  'Negociación':      { color: '#8b5cf6', bg: '#8b5cf615' },
  'Contactado':       { color: '#06b6d4', bg: '#06b6d415' },
  'Perdido':          { color: '#ef4444', bg: '#ef444415' },
  'Ganado':           { color: '#10b981', bg: '#10b98115' },
}
const SCORE_COLOR = { 'Muy alto': '#10b981', 'Alto': '#3b82f6', 'Medio': '#f59e0b', 'Bajo': '#ef4444' }
const DETAIL_TABS = ['Resumen', 'Actividad', 'Información', 'Notas', 'Archivos']
const ACT_TIMELINE = [
  { label: 'Llamada realizada', sub: 'Duración: 4:32 min', time: 'Hoy 11:32', color: '#3b82f6' },
  { label: 'Email abierto', sub: 'Asunto: Seguimiento propuesta', time: 'Ayer 16:45', color: '#8b5cf6' },
  { label: 'Reunión agendada', sub: 'Demo producto — 30 min', time: '23 may 09:15', color: '#10b981' },
  { label: 'Lead creado', sub: 'Fuente: Importación CRM', time: '20 may 14:22', color: '#6b7280' },
]

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

export default function LeadDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lead, setLead] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Resumen')

  useEffect(() => {
    apiFetch(`/api/leads/${id}/timeline`).then(r => r.ok ? r.json() : null).then(data => {
      if (data?.lead) {
        const l = data.lead
        setLead({
          ...l,
          estado: l.status === 'new' ? 'Nuevo' : l.status === 'contacted' ? 'Contactado' : l.status === 'qualified' ? 'Interesado' : l.status === 'converted' ? 'Ganado' : 'Perdido',
          score: 0, pains: [], emails: [],
          calls: data.calls || [], meetings: data.meetings || [], opportunities: data.opportunities || [],
        })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])
  const [showNote, setShowNote] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [showAllPains, setShowAllPains] = useState(false)
  const [quickNoteText, setQuickNoteText] = useState('')
  const [tabNoteText, setTabNoteText] = useState('')
  const [tabSaved, setTabSaved] = useState(false)
  const [tabNotes, setTabNotes] = useState([
    { date: 'Hoy 10:22', author: 'Carlos R.', text: 'Lead muy interesado en el plan Enterprise. Quiere demo la semana que viene.' },
    { date: 'Ayer 16:45', author: 'Sistema', text: 'Llamada completada: 4:32 min. Resultado: Interesado. Agente: VozIA Pro.' },
    { date: '20 may', author: 'Ana M.', text: 'Primer contacto. Mencionó presupuesto de ~€2k/mes.' },
  ])
  const [files, setFiles] = useState([
    { name: 'Propuesta comercial v2.pdf', size: '1.2 MB', date: 'Hoy', icon: '📄' },
    { name: 'Presentación ejecutiva.pptx', size: '3.8 MB', date: 'Ayer', icon: '📊' },
    { name: 'Contrato borrador.docx', size: '240 KB', date: '19 may', icon: '📝' },
  ])
  const fileInputRef = useRef(null)

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14, background: '#080c14' }}>
      Cargando…
    </div>
  )

  if (!lead) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14, background: '#080c14' }}>
      Lead no encontrado
    </div>
  )

  const st = STATUS_MAP[lead.estado] || STATUS_MAP[lead.status] || { color: '#6b7280', bg: '#6b728015' }
  const closeColor = SCORE_COLOR[lead.sl] || '#10b981'

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
            <p style={{ margin: '0 0 6px', fontSize: 13, color: '#6b7280' }}>{lead.role} · {lead.company}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {lead.tags.map(t => (
                <span key={t} style={{ fontSize: 11, padding: '2px 9px', borderRadius: 99, background: '#111827', border: '1px solid #1e2433', color: '#94a3b8' }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            {[
              { Icon: RiPhoneLine,    label: 'Llamar',  action: () => window.open('tel:+34600000000') },
              { Icon: RiMailLine,     label: 'Email',   action: () => window.open(`mailto:?subject=Seguimiento - ${lead.name}`) },
              { Icon: RiCalendar2Line,label: 'Agendar', action: () => setShowSchedule(true) },
              { Icon: RiFileTextLine, label: 'Nota',    action: () => setShowNote(v => !v) },
              { Icon: RiMoreLine,     label: 'Más',     action: () => {} },
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
              <button onClick={() => { if (quickNoteText.trim()) { setTabNotes(n => [{ date: 'Ahora', author: 'Tú', text: quickNoteText.trim() }, ...n]); setQuickNoteText(''); setShowNote(false) } }} style={{ padding: '6px 14px', background: '#4f46e5', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Guardar nota</button>
            </div>
          </div>
        )}
      </div>

      {/* Body 2-col */}
      <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: 16, alignItems: 'start' }}>

        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Close probability */}
          <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, alignSelf: 'flex-start' }}>Probabilidad de cierre</p>
            <Ring pct={lead.closePct} color={closeColor} size={96} />
            <span style={{ fontSize: 13, fontWeight: 700, color: closeColor }}>{lead.closeLevel}</span>
            <div style={{ width: '100%', padding: '10px 12px', background: '#111827', borderRadius: 9, textAlign: 'center' }}>
              <p style={{ margin: '0 0 2px', fontSize: 11, color: '#4b5563' }}>Valor potencial</p>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>{lead.potValue}</p>
            </div>
          </div>

          {/* AI recommendation */}
          <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: 'linear-gradient(135deg,#4f46e5,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RiRobot2Line style={{ width: 13, height: 13, color: '#fff' }} />
              </div>
              <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: '#818cf8' }}>Recomendación IA</p>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
              Alta probabilidad de cierre. Enfócate en demostrar el ROI y agendar una demo con el decisor.
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
              { label: 'Agente asignado', value: 'Sofia M.' },
              { label: 'Valor estimado', value: lead.value },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #111827' }}>
                <span style={{ fontSize: 11.5, color: '#4b5563' }}>{label}</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#94a3b8' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: tabs */}
        <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #1e2433', padding: '0 16px' }}>
            {DETAIL_TABS.map(t => (
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
                      <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{lead.act.action}</p>
                      <p style={{ margin: 0, fontSize: 11.5, color: '#6b7280' }}>{lead.act.date}</p>
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
                <div style={{ position: 'relative', paddingLeft: 20 }}>
                  <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 1, background: '#1e2433' }} />
                  {ACT_TIMELINE.map((a, i) => (
                    <div key={i} style={{ position: 'relative', marginBottom: 20 }}>
                      <div style={{ position: 'absolute', left: -20, top: 4, width: 9, height: 9, borderRadius: '50%', background: a.color, boxShadow: `0 0 6px ${a.color}80` }} />
                      <div style={{ padding: '11px 14px', background: '#111827', border: '1px solid #1a2235', borderRadius: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#e2e8f0' }}>{a.label}</span>
                          <span style={{ fontSize: 11, color: '#4b5563' }}>{a.time}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 11.5, color: '#6b7280' }}>{a.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'Información' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                  <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Datos de contacto</p>
                  {[
                    { label: 'Email', value: `${lead.name.toLowerCase().replace(/ /g,'.')}@${(lead.company||'empresa').toLowerCase().replace(/ /g,'')}.com` },
                    { label: 'Teléfono', value: '+34 6' + String(Math.floor(Math.random() * 90000000 + 10000000)) },
                    { label: 'Empresa', value: lead.company || '—' },
                    { label: 'Cargo', value: lead.role || '—' },
                    { label: 'Ciudad', value: lead.city || '—' },
                    { label: 'LinkedIn', value: `linkedin.com/in/${lead.name.toLowerCase().replace(/ /g,'-')}` },
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
                    { label: 'Fuente', value: 'Llamada outbound' },
                    { label: 'Estado', value: lead.status || '—' },
                    { label: 'Valor estimado', value: lead.value || '—' },
                    { label: 'Creado', value: lead.lastCall || '—' },
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
                    <button onClick={() => {
                      if (!tabNoteText.trim()) return
                      setTabNotes(n => [{ date: 'Ahora', author: 'Tú', text: tabNoteText.trim() }, ...n])
                      setTabNoteText('')
                      setTabSaved(true)
                      setTimeout(() => setTabSaved(false), 1500)
                    }} style={{ background: tabSaved ? '#10b981' : '#6366f115', border: '1px solid ' + (tabSaved ? '#10b98130' : '#6366f130'), borderRadius: 8, padding: '6px 14px', color: tabSaved ? '#10b981' : '#818cf8', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s' }}>
                      {tabSaved ? '✓ Guardada' : 'Guardar nota'}
                    </button>
                  </div>
                </div>
                {tabNotes.map((n, i) => (
                  <div key={i} style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 11, padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1' }}>{n.author}</span>
                      <span style={{ fontSize: 11, color: '#374151' }}>{n.date}</span>
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
                  if (f) setFiles(prev => [{ name: f.name, size: (f.size / 1024 > 1024 ? (f.size/1048576).toFixed(1)+' MB' : (f.size/1024).toFixed(0)+' KB'), date: 'Ahora', icon: '📄' }, ...prev])
                }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                  <button onClick={() => fileInputRef.current?.click()} style={{ background: '#6366f115', border: '1px solid #6366f130', borderRadius: 8, padding: '7px 14px', color: '#818cf8', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ Subir archivo</button>
                </div>
                {files.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#111827', border: '1px solid #1a2235', borderRadius: 11, padding: '13px 16px' }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{f.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>{f.size} · {f.date}</p>
                    </div>
                    <RiFileTextLine style={{ width: 16, height: 16, color: '#374151', cursor: 'pointer', flexShrink: 0 }} onClick={() => { const a = document.createElement('a'); a.href = '#'; a.download = f.name; a.click() }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showSchedule && <NewReunionModal onClose={() => setShowSchedule(false)} />}
    </div>
  )
}
