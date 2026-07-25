import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { getLocale, localeCode, useI18n } from '../i18n'
import {
  RiArrowLeftLine, RiStarFill, RiStarLine, RiEditLine,
  RiDownloadLine, RiEyeLine, RiThumbUpLine, RiThumbUpFill, RiShareLine,
  RiBook2Line, RiCloseLine,
} from 'react-icons/ri'
import '../dashboard.css'

const CONTENT_SECTIONS = [
  {
    heading: 'Introducción',
    text: 'Esta guía cubre los conceptos fundamentales que todo representante de ventas necesita conocer para maximizar el valor de la plataforma en sus conversaciones con clientes potenciales.',
  },
  {
    heading: 'Puntos clave',
    text: 'La plataforma VozIA permite automatizar llamadas salientes con agentes de inteligencia artificial que se comportan de forma natural. Cada agente puede ser personalizado con playbooks específicos según el tipo de campaña y el perfil del cliente objetivo.',
  },
  {
    heading: 'Ejemplos de uso',
    text: 'Casos como TechSolutions S.L. han demostrado un incremento del 45% en reuniones calificadas en los primeros 60 días de implementación. La clave está en la correcta configuración del playbook inicial y el seguimiento de métricas de sentimiento.',
  },
  {
    heading: 'Preguntas frecuentes',
    text: '¿Cuánto tarda el onboarding? Típicamente entre 2 y 5 días laborables. ¿Se puede integrar con nuestro CRM? Sí, tenemos conectores nativos para HubSpot, Salesforce y Pipedrive.',
  },
]

const TYPE_OPTIONS = [
  'Producto', 'Servicios', 'Precios y planes', 'Objeciones comunes',
  'Procesos internos', 'Casos de éxito', 'Integraciones', 'Recursos de ventas',
  'document', 'faq', 'url',
]

function toArticle(data) {
  return {
    ...data,
    title: data.name,
    category: data.type,
    author: '—',
    views: 0, readTime: '—',
    desc: typeof data.content === 'string' ? data.content.slice(0, 160) : '',
    catLabel: data.type ?? 'document',
    catColor: '#7c3aed',
    iconBg: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
    iconColor: '#c4b5fd',
    IconEl: RiBook2Line,
    date: data.createdAt ? new Date(data.createdAt).toLocaleDateString(localeCode(getLocale())) : '—',
    visits: 0,
    sections: data.content ? [{ heading: 'Contenido', text: data.content }] : CONTENT_SECTIONS,
  }
}

export default function ArticleDetailPage() {
  const { locale } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const [art, setArt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [starred, setStarred] = useState(false)
  const [liked, setLiked] = useState(false)
  const [helpfulCount, setHelpfulCount] = useState(0)
  const [related, setRelated] = useState([])
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', type: '', content: '' })
  const [saving, setSaving] = useState(false)
  const [shareNotice, setShareNotice] = useState('')

  async function shareArticle() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable')
      await navigator.clipboard.writeText(window.location.href)
      setShareNotice('Enlace copiado al portapapeles')
    } catch {
      setShareNotice('No se pudo copiar el enlace')
    }
  }

  useEffect(() => {
    apiFetch(`/api/knowledge/${id}`).then(r => r.ok ? r.json() : null).then(data => {
      if (data) {
        setArt(toArticle(data))
        setStarred(!!data.isFavoritedByMe)
        setLiked(!!data.isHelpfulByMe)
        setHelpfulCount(data.helpfulCount ?? 0)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!art) return
    apiFetch('/api/knowledge').then(r => r.ok ? r.json() : []).then(list => {
      if (!Array.isArray(list)) return
      setRelated(list.filter(a => a.id !== id && a.type === art.category).slice(0, 3))
    }).catch(() => {})
  }, [art, id])

  async function toggleFavorite() {
    const next = !starred
    setStarred(next) // optimistic
    const res = await apiFetch(`/api/knowledge/${id}/favorite`, { method: 'POST' }).catch(() => null)
    if (res?.ok) {
      const body = await res.json().catch(() => null)
      if (body) setStarred(!!body.favorited)
    } else {
      setStarred(!next)
    }
  }

  async function toggleHelpful() {
    const next = !liked
    setLiked(next) // optimistic
    setHelpfulCount(c => c + (next ? 1 : -1))
    const res = await apiFetch(`/api/knowledge/${id}/reaction`, { method: 'POST' }).catch(() => null)
    if (res?.ok) {
      const body = await res.json().catch(() => null)
      if (body) setLiked(!!body.helpful)
    } else {
      setLiked(!next)
      setHelpfulCount(c => c + (next ? -1 : 1))
    }
  }

  function openEdit() {
    setEditForm({ name: art.title ?? '', type: art.category ?? 'document', content: art.content ?? '' })
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true)
    const res = await apiFetch(`/api/knowledge/${id}`, {
      method: 'PUT',
      body: JSON.stringify(editForm),
    }).catch(() => null)
    setSaving(false)
    if (res?.ok) {
      setArt(prev => toArticle({ ...prev, ...editForm }))
      setEditing(false)
    }
  }

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:16 }}>
      {locale === 'en' ? 'Loading…' : 'Cargando…'}
    </div>
  )

  if (!art) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:16 }}>
      Artículo no encontrado
    </div>
  )

  return (
    <div className="dark-scroll" style={{ flex:1, overflowY:'auto', background:'#080c14', display:'flex', flexDirection:'column' }}>

      {/* Back */}
      <div style={{ padding:'20px 28px 0', flexShrink:0 }}>
        <button onClick={() => navigate('/knowledge-base')} style={{
          display:'flex', alignItems:'center', gap:6,
          background:'none', border:'none', color:'#6b7280', fontSize:13, cursor:'pointer', padding:0,
        }}>
          <RiArrowLeftLine style={{ width:15, height:15 }} />
          Volver a Base de Conocimiento
        </button>
      </div>

      {/* Header */}
      <div style={{ padding:'20px 28px', flexShrink:0 }}>
        <div style={{
          background:'linear-gradient(135deg, #0d1117, #111827)',
          border:'1px solid #1e2433', borderRadius:16, padding:'22px 24px',
          display:'flex', gap:16, alignItems:'flex-start',
        }}>
          <div style={{
            width:52, height:52, borderRadius:14, flexShrink:0,
            background:art.iconBg,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:`0 0 20px ${art.catColor}30`,
          }}>
            <art.IconEl style={{ width:22, height:22, color:art.iconColor }} />
          </div>

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
              <h1 style={{ margin:0, fontSize:21, fontWeight:800, color:'#f1f5f9', lineHeight:1.3 }}>{art.title}</h1>
              <button onClick={toggleFavorite} style={{ background:'none', border:'none', cursor:'pointer', padding:2, flexShrink:0 }}>
                {starred
                  ? <RiStarFill style={{ width:18, height:18, color:'#fbbf24' }} />
                  : <RiStarLine style={{ width:18, height:18, color:'#4b5563' }} />
                }
              </button>
            </div>
            <p style={{ margin:'0 0 10px', fontSize:13, color:'#6b7280', lineHeight:1.5 }}>{art.desc}</p>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
              <span style={{ fontSize:12, fontWeight:600, padding:'2px 10px', borderRadius:20, background:`${art.catColor}20`, color:art.catColor, border:`1px solid ${art.catColor}40` }}>{art.catLabel}</span>
              <span style={{ fontSize:12, color:'#4b5563' }}>{art.author}</span>
              <span style={{ fontSize:12, color:'#4b5563' }}>{art.date}</span>
              <span style={{ fontSize:12, color:'#4b5563', display:'flex', alignItems:'center', gap:4 }}>
                <RiEyeLine style={{ width:12, height:12 }} /> {art.visits} visitas
              </span>
            </div>
          </div>

          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            <button onClick={openEdit} style={{ display:'flex', alignItems:'center', gap:5, background:'#111827', border:'1px solid #1e2433', borderRadius:9, padding:'7px 12px', color:'#94a3b8', fontSize:12, cursor:'pointer' }}>
              <RiEditLine style={{ width:13, height:13 }} /> Editar
            </button>
            <button onClick={() => {
              const content = `${art.title}\n\n${(art.sections ?? CONTENT_SECTIONS).map(s => `## ${s.heading}\n${s.text}`).join('\n\n')}`
              const blob = new Blob([content], { type:'text/plain' })
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${art.title.replace(/ /g,'_')}.txt`; a.click()
            }} style={{ display:'flex', alignItems:'center', gap:5, background:'#111827', border:'1px solid #1e2433', borderRadius:9, padding:'7px 12px', color:'#94a3b8', fontSize:12, cursor:'pointer' }}>
              <RiDownloadLine style={{ width:13, height:13 }} /> Descargar
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', gap:20, padding:'0 28px 28px', minHeight:0 }}>

        {/* Article content */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'24px' }}>
            {(art.sections ?? CONTENT_SECTIONS).map((sec, i) => (
              <div key={i} style={{ marginBottom: i < (art.sections ?? CONTENT_SECTIONS).length - 1 ? 22 : 0 }}>
                <h2 style={{ margin:'0 0 10px', fontSize:15, fontWeight:700, color:'#f1f5f9' }}>{sec.heading}</h2>
                <p style={{ margin:0, fontSize:13.5, color:'#94a3b8', lineHeight:1.7 }}>{sec.text}</p>
                {i < (art.sections ?? CONTENT_SECTIONS).length - 1 && <div style={{ height:1, background:'#1a2235', margin:'20px 0 0' }} />}
              </div>
            ))}
          </div>

          {/* Feedback */}
          <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <p style={{ margin:0, fontSize:13, color:'#6b7280' }}>¿Este artículo fue útil? {helpfulCount > 0 && <span style={{ color:'#4b5563' }}>· {helpfulCount}</span>}</p>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={toggleHelpful} style={{
                display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600,
                background: liked ? '#10b98120' : '#111827',
                border: `1px solid ${liked ? '#10b98140' : '#1e2433'}`,
                color: liked ? '#10b981' : '#6b7280',
              }}>
                {liked ? <RiThumbUpFill style={{ width:14, height:14 }} /> : <RiThumbUpLine style={{ width:14, height:14 }} />} Útil
              </button>
              <button onClick={shareArticle} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, background:'#111827', border:'1px solid #1e2433', color:'#6b7280', cursor:'pointer', fontSize:13 }}>
                <RiShareLine style={{ width:14, height:14 }} /> Compartir
              </button>
            </div>
            <span role="status" aria-live="polite" style={{ position:'absolute', width:1, height:1, overflow:'hidden', clipPath:'inset(50%)' }}>{shareNotice}</span>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ width:220, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px' }}>
            <p style={{ margin:'0 0 12px', fontSize:12, fontWeight:700, color:'#e2e8f0' }}>Artículos relacionados</p>
            {related.length === 0 && <p style={{ margin:0, fontSize:11.5, color:'#4b5563' }}>Sin artículos relacionados</p>}
            {related.map(rel => (
              <div key={rel.id} onClick={() => navigate('/knowledge-base/articulos/' + rel.id)}
                style={{ display:'flex', gap:8, marginBottom:10, cursor:'pointer', padding:'8px', borderRadius:8, transition:'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#111827'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <p style={{ margin:0, fontSize:11.5, color:'#94a3b8', lineHeight:1.4 }}>{rel.name}</p>
              </div>
            ))}
          </div>

          <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px' }}>
            <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'#e2e8f0' }}>Información</p>
            {[
              { label:'Autor', value:art.author },
              { label:'Creado', value:art.date },
              { label:'Categoría', value:art.catLabel },
              { label:'Visitas', value:String(art.visits) },
            ].map(m => (
              <div key={m.label} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #111827' }}>
                <span style={{ fontSize:11.5, color:'#4b5563' }}>{m.label}</span>
                <span style={{ fontSize:11.5, fontWeight:600, color:'#e2e8f0' }}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div onClick={() => !saving && setEditing(false)} style={{ position:'fixed', inset:0, zIndex:100, background:'#000a', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:14, padding:24, width:420, boxShadow:'0 40px 80px #0009' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <p style={{ margin:0, fontSize:16, fontWeight:700, color:'#f1f5f9' }}>Editar artículo</p>
              <button onClick={() => setEditing(false)} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer' }}><RiCloseLine style={{ width:18, height:18 }} /></button>
            </div>
            <label style={{ display:'block', fontSize:12, color:'#6b7280', marginBottom:6 }}>Título</label>
            <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ width:'100%', boxSizing:'border-box', background:'#111827', border:'1px solid #1e2433', borderRadius:9, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none', marginBottom:12 }} />
            <label style={{ display:'block', fontSize:12, color:'#6b7280', marginBottom:6 }}>Categoría</label>
            <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))} style={{ width:'100%', boxSizing:'border-box', background:'#111827', border:'1px solid #1e2433', borderRadius:9, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none', marginBottom:12 }}>
              {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <label style={{ display:'block', fontSize:12, color:'#6b7280', marginBottom:6 }}>Contenido</label>
            <textarea value={editForm.content} onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))} style={{ width:'100%', boxSizing:'border-box', minHeight:120, background:'#111827', border:'1px solid #1e2433', borderRadius:9, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit', marginBottom:16 }} />
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setEditing(false)} disabled={saving} style={{ padding:'8px 18px', borderRadius:9, border:'1px solid #1e2433', background:'transparent', color:'#94a3b8', fontSize:13, cursor:'pointer' }}>Cancelar</button>
              <button onClick={saveEdit} disabled={saving} style={{ padding:'8px 18px', borderRadius:9, border:'none', background:'#7c3aed', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
