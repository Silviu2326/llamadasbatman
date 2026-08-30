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
import PageLoadingState from '../components/ui/PageLoadingState'
import '../components/knowledge-base.css'
import './sales-detail-standard.css'

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
    catColor: 'var(--violet-deep)',
    iconBg: 'linear-gradient(135deg,var(--accent-deep),var(--violet-deep))',
    iconColor: 'var(--violet-soft)',
    IconEl: RiBook2Line,
    date: data.createdAt ? new Date(data.createdAt).toLocaleDateString(localeCode(getLocale())) : '—',
    visits: 0,
    sections: data.content
      ? [{ heading: 'Contenido', text: data.content }]
      : [{ heading: 'Sin contenido', text: 'Este artículo todavía no tiene contenido. Usa el botón Editar para añadirlo.' }],
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
  const [editError, setEditError] = useState('')
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
    setEditError('')
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true)
    setEditError('')
    const res = await apiFetch(`/api/knowledge/${id}`, {
      method: 'PUT',
      body: JSON.stringify(editForm),
    }).catch(() => null)
    setSaving(false)
    if (res?.ok) {
      setArt(prev => toArticle({ ...prev, ...editForm }))
      setEditing(false)
    } else if (!res) {
      setEditError('No se pudo guardar el artículo. Revisa tu conexión.')
    } else {
      setEditError('No se pudo guardar el artículo. Inténtalo de nuevo.')
    }
  }

  if (loading) return <PageLoadingState label={locale === 'en' ? 'Loading article' : 'Cargando artículo'} />

  if (!art) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--dim)', fontSize:16 }}>
      Artículo no encontrado
    </div>
  )

  return (
    <div className="ui-page-shell kb-article-page dark-scroll" style={{ flex:1, overflowY:'auto', background:'var(--bg)', display:'flex', flexDirection:'column' }}>

      {/* Back */}
      <div style={{ padding:'20px clamp(12px,4vw,28px) 0', flexShrink:0 }}>
        <button onClick={() => navigate('/knowledge-base')} style={{
          display:'flex', alignItems:'center', gap:6,
          background:'none', border:'none', color:'var(--dim)', fontSize:13, cursor:'pointer', padding:0,
        }}>
          <RiArrowLeftLine style={{ width:15, height:15 }} />
          Volver a Base de Conocimiento
        </button>
      </div>

      {/* Header */}
      <div style={{ padding:'20px clamp(12px,4vw,28px)', flexShrink:0 }}>
        <div style={{
          background:'linear-gradient(135deg, var(--surface), var(--surface-2))',
          border:'1px solid var(--line)', borderRadius:16, padding:'22px clamp(14px,3vw,24px)',
          display:'flex', gap:16, alignItems:'flex-start', flexWrap:'wrap',
        }}>
          <div style={{ flex:'1 1 220px', minWidth:0 }}>
            <div className="kb-detail-title-row">
              <span className="kb-title-icon kb-detail-title-icon" aria-hidden="true"><art.IconEl /></span>
              <h1 className="ui-page-title kb-detail-title">{art.title}</h1>
              <button onClick={toggleFavorite} style={{ background:'none', border:'none', cursor:'pointer', padding:2, flexShrink:0 }}>
                {starred
                  ? <RiStarFill style={{ width:18, height:18, color:'var(--warn-soft)' }} />
                  : <RiStarLine style={{ width:18, height:18, color: 'var(--dim)' }} />
                }
              </button>
            </div>
            <p style={{ margin:'0 0 10px', fontSize:13, color:'var(--dim)', lineHeight:1.5 }}>{art.desc}</p>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
              <span style={{ fontSize:12, fontWeight:600, padding:'2px 10px', borderRadius:20, background:`color-mix(in srgb, ${art.catColor} 13%, transparent)`, color:art.catColor, border:`1px solid color-mix(in srgb, ${art.catColor} 25%, transparent)` }}>{art.catLabel}</span>
              <span style={{ fontSize:12, color: 'var(--dim)' }}>{art.author}</span>
              <span style={{ fontSize:12, color: 'var(--dim)' }}>{art.date}</span>
              <span style={{ fontSize:12, color: 'var(--dim)', display:'flex', alignItems:'center', gap:4 }}>
                <RiEyeLine style={{ width:12, height:12 }} /> {art.visits} visitas
              </span>
            </div>
          </div>

          <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>
            <button onClick={openEdit} style={{ display:'flex', alignItems:'center', gap:5, background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:9, padding:'7px 12px', color:'var(--muted)', fontSize:12, cursor:'pointer' }}>
              <RiEditLine style={{ width:13, height:13 }} /> Editar
            </button>
            <button onClick={() => {
              const content = `${art.title}\n\n${(art.sections ?? []).map(s => `## ${s.heading}\n${s.text}`).join('\n\n')}`
              const blob = new Blob([content], { type:'text/plain' })
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${art.title.replace(/ /g,'_')}.txt`; a.click()
            }} style={{ display:'flex', alignItems:'center', gap:5, background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:9, padding:'7px 12px', color:'var(--muted)', fontSize:12, cursor:'pointer' }}>
              <RiDownloadLine style={{ width:13, height:13 }} /> Descargar
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="split-pane" style={{ flex:1, display:'flex', gap:20, padding:'0 clamp(12px,4vw,28px) 28px', minHeight:0 }}>

        {/* Article content */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'clamp(16px,4vw,24px)' }}>
            {(art.sections ?? []).map((sec, i) => (
              <div key={i} style={{ marginBottom: i < (art.sections ?? []).length - 1 ? 22 : 0 }}>
                <h2 style={{ margin:'0 0 10px', fontSize:15, fontWeight:700, color:'var(--text-strong)' }}>{sec.heading}</h2>
                <p style={{ margin:0, fontSize:13.5, color:'var(--muted)', lineHeight:1.7, overflowWrap:'break-word' }}>{sec.text}</p>
                {i < (art.sections ?? []).length - 1 && <div style={{ height:1, background:'var(--surface-hover)', margin:'20px 0 0' }} />}
              </div>
            ))}
          </div>

          {/* Feedback */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
            <p style={{ margin:0, fontSize:13, color:'var(--dim)' }}>¿Este artículo fue útil? {helpfulCount > 0 && <span style={{ color: 'var(--dim)' }}>· {helpfulCount}</span>}</p>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={toggleHelpful} style={{
                display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600,
                background: liked ? '#10b98120' : 'var(--surface-2)',
                border: `1px solid ${liked ? '#10b98140' : 'var(--line)'}`,
                color: liked ? 'var(--success)' : 'var(--dim)',
              }}>
                {liked ? <RiThumbUpFill style={{ width:14, height:14 }} /> : <RiThumbUpLine style={{ width:14, height:14 }} />} Útil
              </button>
              <button onClick={shareArticle} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, background:'var(--surface-2)', border:'1px solid var(--line)', color:'var(--dim)', cursor:'pointer', fontSize:13 }}>
                <RiShareLine style={{ width:14, height:14 }} /> Compartir
              </button>
            </div>
            <span role="status" aria-live="polite" style={{ position:'absolute', width:1, height:1, overflow:'hidden', clipPath:'inset(50%)' }}>{shareNotice}</span>
          </div>
        </div>

        {/* Sidebar */}
        <div className="split-rail" style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'14px' }}>
            <p style={{ margin:'0 0 12px', fontSize:12, fontWeight:700, color:'var(--text)' }}>Artículos relacionados</p>
            {related.length === 0 && <p style={{ margin:0, fontSize:11.5, color: 'var(--dim)' }}>Sin artículos relacionados</p>}
            {related.map(rel => (
              <div key={rel.id} onClick={() => navigate('/knowledge-base/articulos/' + rel.id)}
                style={{ display:'flex', gap:8, marginBottom:10, cursor:'pointer', padding:'8px', borderRadius:8, transition:'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <p style={{ margin:0, fontSize:11.5, color:'var(--muted)', lineHeight:1.4 }}>{rel.name}</p>
              </div>
            ))}
          </div>

          <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'14px' }}>
            <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'var(--text)' }}>Información</p>
            {[
              { label:'Autor', value:art.author },
              { label:'Creado', value:art.date },
              { label:'Categoría', value:art.catLabel },
              { label:'Visitas', value:String(art.visits) },
            ].map(m => (
              <div key={m.label} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--surface-2)' }}>
                <span style={{ fontSize:11.5, color: 'var(--dim)' }}>{m.label}</span>
                <span style={{ fontSize:11.5, fontWeight:600, color:'var(--text)' }}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div onClick={() => !saving && setEditing(false)} style={{ position:'fixed', inset:0, zIndex:100, background:'var(--scrim)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:14, padding:'clamp(16px,4vw,24px)', width:'min(420px, 100%)', maxHeight:'86vh', overflowY:'auto', boxShadow:'var(--shadow-2)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <p style={{ margin:0, fontSize:16, fontWeight:700, color:'var(--text-strong)' }}>Editar artículo</p>
              <button onClick={() => setEditing(false)} style={{ background:'none', border:'none', color:'var(--dim)', cursor:'pointer' }}><RiCloseLine style={{ width:18, height:18 }} /></button>
            </div>
            <label style={{ display:'block', fontSize:12, color:'var(--dim)', marginBottom:6 }}>Título</label>
            <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ width:'100%', boxSizing:'border-box', background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:9, padding:'9px 12px', color:'var(--text)', fontSize:13, outline:'none', marginBottom:12 }} />
            <label style={{ display:'block', fontSize:12, color:'var(--dim)', marginBottom:6 }}>Categoría</label>
            <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))} style={{ width:'100%', boxSizing:'border-box', background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:9, padding:'9px 12px', color:'var(--text)', fontSize:13, outline:'none', marginBottom:12 }}>
              {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <label style={{ display:'block', fontSize:12, color:'var(--dim)', marginBottom:6 }}>Contenido</label>
            <textarea value={editForm.content} onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))} style={{ width:'100%', boxSizing:'border-box', minHeight:120, background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:9, padding:'9px 12px', color:'var(--text)', fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit', marginBottom:16 }} />
            {editError && <p role="alert" style={{ margin:'0 0 12px', fontSize:12.5, color:'var(--danger-soft)' }}>{editError}</p>}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setEditing(false)} disabled={saving} style={{ padding:'8px 18px', borderRadius:9, border:'1px solid var(--line)', background:'transparent', color:'var(--muted)', fontSize:13, cursor:'pointer' }}>Cancelar</button>
              <button onClick={saveEdit} disabled={saving} style={{ padding:'8px 18px', borderRadius:9, border:'none', background:'var(--violet-deep)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
