import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiBookReadLine, RiAddLine, RiDownloadLine, RiSearchLine,
  RiFilterLine, RiMoreLine, RiStarFill,
  RiArrowLeftSLine, RiArrowRightSLine, RiArrowRightLine,
  RiBook2Line, RiEyeLine, RiThumbUpLine, RiEdit2Line,
  RiPriceTag3Line, RiShieldLine, RiGroupLine, RiFlowChart,
  RiTrophyLine, RiPlugLine, RiShoppingCart2Line, RiAddCircleLine,
  RiSparklingLine, RiPhoneLine, RiDeleteBin6Line,
} from 'react-icons/ri'
import { HiChevronDown } from 'react-icons/hi'
import '../dashboard.css'
import NewArticuloModal from '../modals/NewArticuloModal'

// ─── type → display config ────────────────────────────────────────────────────
const TYPE_CFG = {
  'Producto':          { IconEl: RiBook2Line,       color: '#7c3aed', iconBg: 'linear-gradient(135deg,#4f46e5,#7c3aed)', iconColor: '#c4b5fd' },
  'Servicios':         { IconEl: RiShieldLine,      color: '#0891b2', iconBg: 'linear-gradient(135deg,#0e7490,#0891b2)', iconColor: '#67e8f9' },
  'Precios y planes':  { IconEl: RiPriceTag3Line,   color: '#059669', iconBg: 'linear-gradient(135deg,#047857,#059669)', iconColor: '#6ee7b7' },
  'Objeciones comunes':{ IconEl: RiGroupLine,       color: '#d97706', iconBg: 'linear-gradient(135deg,#b45309,#d97706)', iconColor: '#fcd34d' },
  'Procesos internos': { IconEl: RiFlowChart,       color: '#dc2626', iconBg: 'linear-gradient(135deg,#991b1b,#dc2626)', iconColor: '#fca5a5' },
  'Casos de éxito':    { IconEl: RiTrophyLine,      color: '#0891b2', iconBg: 'linear-gradient(135deg,#065f46,#059669)', iconColor: '#6ee7b7' },
  'Integraciones':     { IconEl: RiPlugLine,        color: '#3b82f6', iconBg: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', iconColor: '#93c5fd' },
  'Recursos de ventas':{ IconEl: RiShoppingCart2Line,color: '#ea580c', iconBg: 'linear-gradient(135deg,#c2410c,#ea580c)', iconColor: '#fdba74' },
  'document':          { IconEl: RiBook2Line,       color: '#7c3aed', iconBg: 'linear-gradient(135deg,#4f46e5,#7c3aed)', iconColor: '#c4b5fd' },
  'faq':               { IconEl: RiGroupLine,       color: '#d97706', iconBg: 'linear-gradient(135deg,#b45309,#d97706)', iconColor: '#fcd34d' },
  'url':               { IconEl: RiPlugLine,        color: '#0891b2', iconBg: 'linear-gradient(135deg,#0e7490,#0891b2)', iconColor: '#67e8f9' },
}
const DEFAULT_CFG = TYPE_CFG['document']

function typeCfg(type) { return TYPE_CFG[type] ?? DEFAULT_CFG }

function mapArticle(a) {
  const cfg = typeCfg(a.type)
  return {
    id: a.id,
    title: a.name,
    starred: false,
    desc: typeof a.content === 'string' ? a.content.slice(0, 140) : '',
    catLabel: a.type ?? 'document',
    catColor: cfg.color,
    author: '—',
    date: new Date(a.createdAt).toLocaleDateString('es-ES'),
    visits: 0,
    iconBg: cfg.iconBg,
    IconEl: cfg.IconEl,
    iconColor: cfg.iconColor,
  }
}

// ─── category sidebar defs ─────────────────────────────────────────────────────
const CAT_DEFS = [
  { label: 'Todas las categorías', IconEl: RiBookReadLine,      color: '#7c3aed' },
  { label: 'Producto',             IconEl: RiBook2Line,         color: '#7c3aed' },
  { label: 'Servicios',            IconEl: RiShieldLine,        color: '#0891b2' },
  { label: 'Precios y planes',     IconEl: RiPriceTag3Line,     color: '#059669' },
  { label: 'Objeciones comunes',   IconEl: RiGroupLine,         color: '#d97706' },
  { label: 'Procesos internos',    IconEl: RiFlowChart,         color: '#dc2626' },
  { label: 'Casos de éxito',       IconEl: RiTrophyLine,        color: '#0891b2' },
  { label: 'Integraciones',        IconEl: RiPlugLine,          color: '#7c3aed' },
  { label: 'Recursos de ventas',   IconEl: RiShoppingCart2Line, color: '#ea580c' },
]

const TABS = ['Todos', 'Mis artículos', 'Favoritos']
const KB_PAGE_SIZE = 8

// ─── CatItem ───────────────────────────────────────────────────────────────────
function CatItem({ cat, active, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: '7px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
        background: active ? `${cat.color}18` : hov ? '#0f1520' : 'transparent',
        transition: 'all .18s', marginBottom: 2,
        boxShadow: active ? `inset 0 0 0 1px ${cat.color}35` : 'none',
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        background: active ? `${cat.color}30` : '#1a2235',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: active ? `1px solid ${cat.color}50` : '1px solid #1e2433',
      }}>
        <cat.IconEl style={{ width: 13, height: 13, color: active ? cat.color : '#6b7280' }} />
      </div>
      <span style={{
        flex: 1, textAlign: 'left', fontSize: 13, fontWeight: active ? 700 : 500,
        color: active ? '#f1f5f9' : '#9ca3af',
      }}>{cat.label}</span>
      <span style={{
        fontSize: 11, fontWeight: 600, color: active ? cat.color : '#4b5563',
        background: active ? `${cat.color}20` : '#1a2235',
        padding: '1px 7px', borderRadius: 20,
      }}>{cat.count}</span>
    </button>
  )
}

// ─── ArticleRow ────────────────────────────────────────────────────────────────
function ArticleRow({ art, onClick, onDelete }) {
  const [hov, setHov] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: '1fr 160px 170px 80px 36px',
        alignItems: 'center', gap: 12,
        padding: '12px 16px',
        background: hov ? '#0d1420' : 'transparent',
        borderBottom: '1px solid #131929',
        transition: 'background .15s', cursor: 'pointer',
      }}
    >
      {/* Article */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: art.iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 12px ${art.catColor}30`,
        }}>
          <art.IconEl style={{ width: 18, height: 18, color: art.iconColor }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {art.title}
            </p>
            {art.starred && <RiStarFill style={{ width: 13, height: 13, color: '#fbbf24', flexShrink: 0 }} />}
          </div>
          <p style={{ margin: 0, fontSize: 11.5, color: '#4b5563', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {art.desc}
          </p>
        </div>
      </div>

      {/* Category badge */}
      <div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
          background: `${art.catColor}20`, color: art.catColor,
          border: `1px solid ${art.catColor}40`, whiteSpace: 'nowrap',
        }}>{art.catLabel}</span>
      </div>

      {/* Author + date */}
      <div>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#94a3b8' }}>{art.author}</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#374151' }}>{art.date}</p>
      </div>

      {/* Visits */}
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#6b7280', textAlign: 'right' }}>{art.visits}</p>

      {/* More menu */}
      <div ref={menuRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          style={{
            width: 28, height: 28, borderRadius: 7, border: '1px solid #1e2433',
            background: menuOpen ? '#1e2433' : 'transparent', color: '#4b5563', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <RiMoreLine style={{ width: 14, height: 14 }} />
        </button>
        {menuOpen && (
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10, padding: 4, minWidth: 140, boxShadow: '0 8px 32px #00000060' }}>
            <button
              onClick={() => { setMenuOpen(false); onDelete(art.id) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'none', border: 'none', borderRadius: 7, color: '#ef4444', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = '#ef444412'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <RiDeleteBin6Line style={{ width: 13, height: 13 }} /> Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function KnowledgeBase() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(0)
  const [activeCategory, setActiveCategory] = useState(0)
  const [activePage, setActivePage] = useState(1)
  const [showNewArticle, setShowNewArticle] = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [raw, setRaw] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    apiFetch('/api/knowledge')
      .then(r => r.ok ? r.json() : [])
      .then(data => setRaw(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [refreshKey])

  const articles = useMemo(() => raw.map(mapArticle), [raw])

  // category counts
  const categories = useMemo(() => {
    const counts = {}
    raw.forEach(a => { counts[a.type] = (counts[a.type] ?? 0) + 1 })
    return CAT_DEFS.map(c => ({
      ...c,
      count: c.label === 'Todas las categorías' ? raw.length : (counts[c.label] ?? 0),
    }))
  }, [raw])

  // filter by category then tab
  const filtered = useMemo(() => {
    let list = activeCategory === 0 ? articles : articles.filter(a => a.catLabel === CAT_DEFS[activeCategory]?.label)
    // "Mis artículos" and "Favoritos" have no backend field — show all for now
    return list
  }, [articles, activeCategory])

  const totalPages = Math.ceil(filtered.length / KB_PAGE_SIZE)
  const paginated = filtered.slice((activePage - 1) * KB_PAGE_SIZE, activePage * KB_PAGE_SIZE)

  // sidebar stats
  const thisMonth = useMemo(() => {
    const now = new Date()
    return raw.filter(a => {
      const d = new Date(a.createdAt)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
  }, [raw])

  const uniqueTypes = useMemo(() => new Set(raw.map(a => a.type)).size, [raw])

  // popular = first 5 by insertion order (most recent)
  const popular = useMemo(() => articles.slice(0, 5).map((a, i) => ({
    rank: i + 1,
    title: a.title,
    views: '—',
    rankColor: ['#7c3aed','#059669','#3b82f6','#d97706','#0d9488'][i],
  })), [articles])

  async function handleDelete(id) {
    await apiFetch(`/api/knowledge/${id}`, { method: 'DELETE' }).catch(() => {})
    setRaw(prev => prev.filter(a => a.id !== id))
    setActivePage(1)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

      {/* Top header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 28px 0', gap: 16, flexShrink: 0,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#f1f5f9', letterSpacing: -0.5 }}>Knowledge Base</h1>
            <span style={{ fontSize: 22 }}>📖</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Centraliza y organiza la información clave para tus agentes IA y tu equipo.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 10,
            border: '1px solid #1e2433', background: '#0d1117',
            flex: 1,
          }}>
            <RiSearchLine style={{ width: 15, height: 15, color: '#4b5563', flexShrink: 0 }} />
            <input placeholder="Buscar en la knowledge base..." style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#94a3b8', fontSize: 13,
            }} />
            <kbd style={{
              fontSize: 10, color: '#374151', background: '#131929',
              border: '1px solid #1e2433', borderRadius: 5, padding: '2px 6px', fontFamily: 'inherit',
            }}>⌘ K</kbd>
          </div>
          {/* New article */}
          <button onClick={() => setShowNewArticle(true)} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 16px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
            color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 0 20px #7c3aed40',
          }}>
            <RiAddLine style={{ width: 16, height: 16 }} />
            Nuevo artículo
            <HiChevronDown style={{ width: 14, height: 14 }} />
          </button>
          {/* Import */}
          <button style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 16px', borderRadius: 10,
            border: '1px solid #1e2433', background: 'transparent',
            color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }} onClick={() => { const i = document.createElement('input'); i.type='file'; i.accept='.pdf,.docx,.txt,.md'; i.click() }}>
            <RiDownloadLine style={{ width: 15, height: 15 }} />
            Importar
          </button>
        </div>
      </div>

      {showNewArticle && <NewArticuloModal onClose={() => setShowNewArticle(false)} onSuccess={() => { setShowNewArticle(false); setRefreshKey(k => k + 1) }} />}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div onClick={() => setDeleteTarget(null)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: 24, width: 340, boxShadow: '0 40px 80px #0009' }}>
            <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>¿Eliminar artículo?</p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280' }}>El artículo se desactivará y no aparecerá en la base de conocimiento.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid #1e2433', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => { handleDelete(deleteTarget); setDeleteTarget(null) }} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Body: 3 columns */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '16px 28px 24px', gap: 16 }}>

        {/* ── Left: categories ── */}
        <div className="panel-desktop" style={{
          width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Category list */}
          <div style={{
            background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14,
            padding: '14px 10px', flex: '0 0 auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: 0.5, textTransform: 'uppercase' }}>Categorías</span>
              <button style={{
                width: 24, height: 24, borderRadius: 6, border: '1px solid #1e2433',
                background: 'transparent', color: '#4b5563', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <RiAddLine style={{ width: 13, height: 13 }} />
              </button>
            </div>
            {categories.map((cat, i) => (
              <CatItem key={i} cat={cat} active={activeCategory === i} onClick={() => { setActiveCategory(i); setActivePage(1) }} />
            ))}
          </div>

          {/* Promo card */}
          <div style={{
            background: 'linear-gradient(135deg, #1e1060 0%, #0f172a 100%)',
            border: '1px solid #4f46e530',
            borderRadius: 14, padding: '16px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, right: 0,
              width: 80, height: 80,
              background: 'radial-gradient(circle, #7c3aed30 0%, transparent 70%)',
            }} />
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 10,
              boxShadow: '0 0 16px #7c3aed50',
            }}>
              <RiSparklingLine style={{ width: 17, height: 17, color: '#c4b5fd' }} />
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
              Potencia a tus agentes IA
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
              Una base de conocimiento actualizada mejora las respuestas y aumenta la conversión.
            </p>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 8,
              border: '1px solid #4f46e550', background: '#4f46e520',
              color: '#a78bfa', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              Ver mejores prácticas
              <RiArrowRightLine style={{ width: 13, height: 13 }} />
            </button>
          </div>
        </div>

        {/* ── Center: article list ── */}
        <div style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
          background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14,
          overflow: 'hidden',
        }}>
          {/* Tabs + filters */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid #131929', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', gap: 0 }}>
              {TABS.map((t, i) => (
                <button key={i} onClick={() => setActiveTab(i)} style={{
                  padding: '7px 16px', border: 'none', cursor: 'pointer',
                  background: 'transparent',
                  color: activeTab === i ? '#f1f5f9' : '#6b7280',
                  fontSize: 13, fontWeight: activeTab === i ? 700 : 500,
                  borderBottom: `2px solid ${activeTab === i ? '#7c3aed' : 'transparent'}`,
                  transition: 'all .18s',
                }}>{t}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 9,
                border: '1px solid #1e2433', background: 'transparent',
                color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                <RiFilterLine style={{ width: 13, height: 13 }} />
                Filtros
              </button>
              <button style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 9,
                border: '1px solid #1e2433', background: 'transparent',
                color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                Más recientes
                <HiChevronDown style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>

          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 160px 170px 80px 36px',
            gap: 12, padding: '8px 16px',
            borderBottom: '1px solid #131929', flexShrink: 0,
          }}>
            {['Artículo', 'Categoría', 'Creado', 'Visitas', ''].map((h, i) => (
              <p key={i} style={{
                margin: 0, fontSize: 11, fontWeight: 600, color: '#374151',
                textTransform: 'uppercase', letterSpacing: 0.4,
                textAlign: i === 3 ? 'right' : 'left',
              }}>{h}</p>
            ))}
          </div>

          {/* Article rows */}
          <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            {paginated.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#4b5563', fontSize: 13 }}>
                {raw.length === 0 ? 'Cargando…' : 'Sin artículos en esta categoría'}
              </div>
            ) : (
              paginated.map(art => (
                <ArticleRow
                  key={art.id}
                  art={art}
                  onClick={() => navigate('/knowledge-base/articulos/' + art.id)}
                  onDelete={id => setDeleteTarget(id)}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', borderTop: '1px solid #131929', flexShrink: 0,
          }}>
            <span style={{ fontSize: 12, color: '#4b5563' }}>
              Mostrando {Math.min((activePage - 1) * KB_PAGE_SIZE + 1, filtered.length)} a {Math.min(activePage * KB_PAGE_SIZE, filtered.length)} de {filtered.length} artículos
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <PageBtn icon={<RiArrowLeftSLine style={{ width: 14, height: 14 }} />} onClick={() => setActivePage(p => Math.max(1, p - 1))} />
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p, i) => (
                <PageBtn key={i} label={p} active={p === activePage} onClick={() => setActivePage(p)} />
              ))}
              <PageBtn icon={<RiArrowRightSLine style={{ width: 14, height: 14 }} />} onClick={() => setActivePage(p => Math.min(totalPages, p + 1))} />
            </div>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 8,
              border: '1px solid #1e2433', background: 'transparent',
              color: '#6b7280', fontSize: 12, cursor: 'pointer',
            }}>
              {KB_PAGE_SIZE} por página
              <HiChevronDown style={{ width: 12, height: 12 }} />
            </button>
          </div>
        </div>

        {/* ── Right: summary panel ── */}
        <div className="dark-scroll panel-desktop" style={{
          width: 268, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14,
          overflowY: 'auto',
        }}>
          {/* Resumen */}
          <div style={{
            background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '16px',
          }}>
            <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Resumen de la base</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { IconEl: RiBook2Line,   color: '#7c3aed', bg: '#7c3aed', val: String(raw.length),   lbl: 'Artículos' },
                { IconEl: RiEyeLine,     color: '#22d3ee', bg: '#0891b2', val: String(uniqueTypes),   lbl: 'Categorías' },
                { IconEl: RiThumbUpLine, color: '#4ade80', bg: '#059669', val: '—',                   lbl: 'Útiles' },
                { IconEl: RiEdit2Line,   color: '#fbbf24', bg: '#d97706', val: String(thisMonth),     lbl: 'Nuevos este\nmes' },
              ].map((s, i) => (
                <div key={i} style={{
                  background: '#0a0e1a', border: '1px solid #1a2235', borderRadius: 10, padding: '10px 12px',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: `${s.bg}25`, border: `1px solid ${s.bg}50`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 7,
                  }}>
                    <s.IconEl style={{ width: 14, height: 14, color: s.color }} />
                  </div>
                  <p style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>{s.val}</p>
                  <p style={{ margin: 0, fontSize: 10.5, color: '#4b5563', whiteSpace: 'pre-line', lineHeight: 1.3 }}>{s.lbl}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Popular articles */}
          <div style={{
            background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '16px',
          }}>
            <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Artículos recientes</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {popular.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: '#4b5563' }}>Sin artículos aún</p>
              ) : popular.map((p, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 6px', borderRadius: 8,
                  cursor: 'pointer',
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    background: `${p.rankColor}20`, border: `1px solid ${p.rankColor}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: p.rankColor, marginTop: 1,
                  }}>{p.rank}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 600, color: '#e2e8f0', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>{p.views}</p>
                  </div>
                </div>
              ))}
            </div>
            <button style={{
              width: '100%', marginTop: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 0', borderRadius: 9,
              border: '1px solid #1e2433', background: 'transparent',
              color: '#7c3aed', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}>
              Ver todos los artículos
              <RiArrowRightLine style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* No encuentras */}
          <div style={{
            background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '16px',
          }}>
            <p style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 700, color: '#f1f5f9' }}>¿No encuentras lo que buscas?</p>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
              Solicita un nuevo artículo para que el equipo lo cree para ti.
            </p>
            <button onClick={() => setShowRequestModal(true)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 12px', borderRadius: 8,
              border: '1px solid #1e2433', background: 'transparent',
              color: '#94a3b8', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}>
              <RiAddCircleLine style={{ width: 15, height: 15, color: '#7c3aed' }} />
              Solicitar artículo
            </button>
            {showRequestModal && (
              <div onClick={() => setShowRequestModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '24px', width: 380, boxShadow: '0 40px 80px #0009' }}>
                  <p style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Solicitar artículo</p>
                  <input placeholder="Título del artículo..." style={{ width: '100%', boxSizing: 'border-box', background: '#111827', border: '1px solid #1e2433', borderRadius: 9, padding: '9px 12px', color: '#94a3b8', fontSize: 13, outline: 'none', marginBottom: 10 }} />
                  <textarea placeholder="Descripción breve de lo que necesitas..." style={{ width: '100%', boxSizing: 'border-box', minHeight: 68, background: '#111827', border: '1px solid #1e2433', borderRadius: 9, padding: '9px 12px', color: '#94a3b8', fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit', marginBottom: 16 }} />
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowRequestModal(false)} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid #1e2433', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={() => setShowRequestModal(false)} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Enviar solicitud</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ponytail: inline to avoid extra file
function PageBtn({ label, active, onClick, icon }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        minWidth: 30, height: 30, borderRadius: 7,
        border: `1px solid ${active ? '#7c3aed' : '#1e2433'}`,
        background: active ? '#7c3aed20' : hov ? '#0f1520' : 'transparent',
        color: active ? '#a78bfa' : '#6b7280',
        fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 6px', transition: 'all .15s',
      }}
    >{icon ?? label}</button>
  )
}
