import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiBook2Line, RiAddLine, RiSearchLine,
  RiPhoneLine, RiBarChartLine, RiMoneyDollarBoxLine,
  RiCalendarLine, RiFlowChart, RiChatVoiceLine,
  RiShieldLine, RiRefreshLine, RiShoppingCart2Line,
  RiUserLine, RiLightbulbLine,
} from 'react-icons/ri'
import { HiArrowUp, HiChevronDown } from 'react-icons/hi'
import '../dashboard.css'
import { getLocale, localeCode, useI18n } from '../i18n'
import NewPlaybookModal from '../modals/NewPlaybookModal'

// ─── stat cards ───────────────────────────────────────────────────────────────
// Solo presentación: los valores llegan siempre de la API en statsCards.
const STATS = [
  { IconEl: RiBook2Line, iconBg: '#4f46e5', color: '#a78bfa', label: 'Total playbooks', value: '—', sub: '', subColor: '#4ade80', noArrow: true },
  { IconEl: RiFlowChart, iconBg: '#0891b2', color: '#22d3ee', label: 'Usados en campañas', value: '—', sub: 'vs. mes anterior' },
  { IconEl: RiBarChartLine, iconBg: '#059669', color: '#34d399', label: 'Tasa de éxito promedio', value: '—', sub: 'vs. mes anterior' },
  { IconEl: RiCalendarLine, iconBg: '#d97706', color: '#fbbf24', label: 'Reuniones generadas', value: '—', sub: 'vs. mes anterior' },
  { IconEl: RiMoneyDollarBoxLine, iconBg: '#16a34a', color: '#4ade80', label: 'Ingresos generados', value: '—', sub: 'vs. mes anterior' },
]


// ─── Backend mapping ───────────────────────────────────────────────────────────
const PB_ICONS   = [RiPhoneLine, RiRefreshLine, RiShoppingCart2Line, RiCalendarLine, RiUserLine, RiChatVoiceLine, RiLightbulbLine, RiShieldLine]
const PB_COLORS  = ['#c4b5fd','#67e8f9','#6ee7b7','#fcd34d','#c4b5fd','#7dd3fc','#6ee7b7','#fca5a5']
const PB_GRADS   = [
  'linear-gradient(135deg,#4f46e5,#7c3aed)',
  'linear-gradient(135deg,#0891b2,#0e7490)',
  'linear-gradient(135deg,#059669,#047857)',
  'linear-gradient(135deg,#d97706,#b45309)',
  'linear-gradient(135deg,#4f46e5,#7c3aed)',
  'linear-gradient(135deg,#0369a1,#0891b2)',
  'linear-gradient(135deg,#047857,#059669)',
  'linear-gradient(135deg,#b91c1c,#dc2626)',
]
const PB_BADGE_COLORS = ['#7c3aed','#0891b2','#059669','#d97706','#7c3aed','#0891b2','#059669','#dc2626']

function mapPlaybook(p, i) {
  return {
    id: p.id,
    name: p.name,
    badge: 'Personalizado',
    badgeColor: PB_BADGE_COLORS[i % PB_BADGE_COLORS.length],
    desc: p.description ?? '',
    tags: (p.tags ?? []).map(t => ({ label: t, bg: '#4f46e520', color: '#818cf8' })),
    iconBg: PB_GRADS[i % PB_GRADS.length],
    IconEl: PB_ICONS[i % PB_ICONS.length],
    iconColor: PB_COLORS[i % PB_COLORS.length],
    tasa: '—',
    reuniones: 0,
    campanas: 0,
  }
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ IconEl, iconBg, color, label, value, pct, sub, subColor, noArrow }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: '1 1 0', minWidth: 0,
        background: hov ? '#0f1520' : '#0d1117',
        border: `1px solid ${hov ? iconBg + '80' : '#1e2433'}`,
        borderRadius: 14, padding: '14px 16px',
        transition: 'all .25s',
        boxShadow: hov ? `0 0 24px ${iconBg}30` : 'none',
        cursor: 'default',
      }}
      className="fade-up"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: `linear-gradient(145deg, ${iconBg}55, ${iconBg}25)`,
          border: `1px solid ${iconBg}60`,
          boxShadow: `0 0 16px ${iconBg}45`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconEl style={{ width: 16, height: 16, color }} />
        </div>
        <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', fontWeight: 600, lineHeight: 1.3 }}>{label}</p>
      </div>
      <p style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>{value}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {noArrow
          ? <span style={{ fontSize: 11, color: subColor ?? '#94a3b8', fontWeight: 600 }}>{sub}</span>
          : <>
              <HiArrowUp style={{ width: 11, height: 11, color: '#4ade80', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 700 }}>{pct}</span>
              <span style={{ fontSize: 10, color: '#6b7280' }}>{sub}</span>
            </>
        }
      </div>
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ label, color }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
      background: color + '25', color, border: `1px solid ${color}50`,
    }}>{label}</span>
  )
}

// ─── PlaybookCard ─────────────────────────────────────────────────────────────
function PlaybookCard({ pb, selected, onClick, onUse }) {
  const [hov, setHov] = useState(false)
  const active = selected || hov
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: selected ? '#0f1520' : hov ? '#0e151e' : '#0d1117',
        border: `1px solid ${selected ? '#4f46e580' : hov ? '#1e2a40' : '#1e2433'}`,
        borderRadius: 14, padding: '16px', cursor: 'pointer',
        transition: 'all .2s',
        boxShadow: selected ? '0 0 24px #4f46e520' : 'none',
      }}
      className="fade-up"
    >
      {/* Top: icon + title + badge */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 13, flexShrink: 0,
          background: pb.iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 20px ${pb.badgeColor}40`,
        }}>
          <pb.IconEl style={{ width: 24, height: 24, color: pb.iconColor }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 5 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3 }}>{pb.name}</p>
            <Badge label={pb.badge} color={pb.badgeColor} />
          </div>
          <p style={{ margin: 0, fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>{pb.desc}</p>
        </div>
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {pb.tags.map(t => (
          <span key={t.label} style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
            background: t.bg, color: t.color,
          }}>{t.label}</span>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 0, borderTop: '1px solid #1a2235', paddingTop: 10, marginBottom: 12 }}>
        {[
          { label: 'Tasa de éxito', v: pb.tasa },
          { label: 'Reuniones', v: pb.reuniones.toLocaleString(localeCode(getLocale())) },
          { label: 'Usado en', v: `${pb.campanas} campañas` },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, paddingRight: i < 2 ? 10 : 0, borderRight: i < 2 ? '1px solid #1a2235' : 'none', paddingLeft: i > 0 ? 10 : 0 }}>
            <p style={{ margin: 0, fontSize: 9.5, color: '#4b5563', fontWeight: 500, marginBottom: 2 }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={e => { e.stopPropagation(); onUse?.() }} style={{
          flex: 1, padding: '7px 0', borderRadius: 9, border: '1px solid #1e2433',
          background: active ? '#1a2235' : '#0d1117', color: '#e2e8f0',
          fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .2s',
        }}>
          Usar playbook
        </button>
      </div>
    </div>
  )
}


// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Playbooks() {
  const { locale } = useI18n()
  const navigate = useNavigate()
  const [showNewPlaybook, setShowNewPlaybook] = useState(false)
  const [playbooks, setPlaybooks] = useState([])
  const [stats, setStats] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [search, setSearch] = useState('')

  useEffect(() => {
    apiFetch('/api/dashboard/stats').then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  useEffect(() => {
    apiFetch('/api/playbooks')
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : []
        setPlaybooks(arr.map(mapPlaybook))
      })
      .catch(() => {})
  }, [refreshKey])

  const statsCards = useMemo(() => {
    const total = playbooks.length
    return [
      { ...STATS[0], value: String(total), sub: `Activos: ${total}` },
      { ...STATS[1], value: '—', sub: 'Sin datos de campañas', noArrow: true },
      { ...STATS[2], value: '—', sub: 'Sin datos de tasa', noArrow: true },
      {
        ...STATS[3],
        value: stats ? (stats.meetingsScheduled ?? 0).toLocaleString(localeCode(getLocale())) : '—',
        pct: stats ? `${stats.kpiPcts?.meetings ?? 0}%` : null,
        sub: 'vs. mes anterior',
        noArrow: !stats,
      },
      {
        ...STATS[4],
        value: stats ? `€${Math.round(stats.closedWonValue ?? 0).toLocaleString(localeCode(getLocale()))}` : '—',
        pct: stats ? `${stats.kpiPcts?.pipeline ?? 0}%` : null,
        sub: 'vs. mes anterior',
        noArrow: !stats,
      },
    ]
  }, [playbooks, stats])

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
      {/* Left: scrollable content */}
      <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 40px', minWidth: 0 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#f1f5f9', letterSpacing: -0.5 }}>Playbooks</h1>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Biblioteca de estrategias conversacionales listas para usar o personalizar.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => setShowNewPlaybook(true)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 16px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 0 20px #7c3aed40',
            }}>
              <RiAddLine style={{ width: 16, height: 16 }} />
              {locale === 'en' ? 'Create playbook' : 'Crear playbook'}
              <HiChevronDown style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        {showNewPlaybook && <NewPlaybookModal onClose={() => setShowNewPlaybook(false)} onSuccess={() => { setShowNewPlaybook(false); setRefreshKey(k => k + 1) }} />}

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 20, gap: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 14px', borderRadius: 10,
            border: '1px solid #1e2433', background: '#0d1117',
          }}>
            <RiSearchLine style={{ width: 15, height: 15, color: '#4b5563' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={locale === 'en' ? 'Search playbooks...' : 'Buscar playbooks...'} style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: '#94a3b8', fontSize: 13, width: 160,
            }} />
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 28 }}>
          {statsCards.map((s, i) => (
            <StatCard key={i} {...s} />
          ))}
        </div>

        {/* Playbooks */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
            {playbooks.length > 0 ? (locale === 'en' ? 'Popular playbooks' : 'Playbooks populares') : 'Playbooks'}
          </h2>
          {playbooks.length === 0
            ? (
              <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 13, padding: '40px 0' }}>
                Sin playbooks. Crea el primero con el botón de arriba.
              </p>
            )
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
                {playbooks.filter(pb => !search.trim() || `${pb.name} ${pb.desc ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())).map(pb => (
                  <PlaybookCard
                    key={pb.id}
                    pb={pb}
                    selected={false}
                    onClick={() => navigate('/playbooks/' + pb.id)}
                    onUse={() => navigate('/playbooks/' + pb.id)}
                  />
                ))}
              </div>
            )
          }
        </div>

      </div>

      {/* Right: detail panel */}
    </div>
  )
}
