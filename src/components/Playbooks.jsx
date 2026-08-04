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
import { planGateMessage, readPlanGate } from '../lib/planGate'
import DataStatusBanner from './ui/DataStatusBanner'
import NewPlaybookModal from '../modals/NewPlaybookModal'

// ─── stat cards ───────────────────────────────────────────────────────────────
// Solo presentación: los valores llegan siempre de la API en statsCards.
const STATS = [
  { IconEl: RiBook2Line, iconBg: 'var(--accent-deep)', color: 'var(--violet)', label: 'Total playbooks', value: '—', sub: '', subColor: 'var(--success-soft)', noArrow: true },
  { IconEl: RiFlowChart, iconBg: 'var(--cyan-deep)', color: 'var(--cyan)', label: 'Usados en campañas', value: '—', sub: 'vs. mes anterior' },
  { IconEl: RiBarChartLine, iconBg: 'var(--success-deep)', color: 'var(--success)', label: 'Tasa de éxito promedio', value: '—', sub: 'vs. mes anterior' },
  { IconEl: RiCalendarLine, iconBg: 'var(--warn-deep)', color: 'var(--warn-soft)', label: 'Reuniones generadas', value: '—', sub: 'vs. mes anterior' },
  { IconEl: RiMoneyDollarBoxLine, iconBg: 'var(--success-deep)', color: 'var(--success-soft)', label: 'Ingresos generados', value: '—', sub: 'vs. mes anterior' },
]


// ─── Backend mapping ───────────────────────────────────────────────────────────
const PB_ICONS   = [RiPhoneLine, RiRefreshLine, RiShoppingCart2Line, RiCalendarLine, RiUserLine, RiChatVoiceLine, RiLightbulbLine, RiShieldLine]
const PB_COLORS  = ['var(--violet-soft)','var(--cyan-soft)','var(--success-soft)','var(--warn-soft)','var(--violet-soft)','var(--cyan-soft)','var(--success-soft)','var(--danger-faint)']
const PB_GRADS   = [
  'linear-gradient(135deg,var(--accent-deep),var(--violet-deep))',
  'linear-gradient(135deg,var(--cyan-deep),var(--cyan-deep))',
  'linear-gradient(135deg,var(--success-deep),var(--success-deep))',
  'linear-gradient(135deg,var(--warn-deep),var(--warn-deep))',
  'linear-gradient(135deg,var(--accent-deep),var(--violet-deep))',
  'linear-gradient(135deg,var(--info-deep),var(--cyan-deep))',
  'linear-gradient(135deg,var(--success-deep),var(--success-deep))',
  'linear-gradient(135deg,var(--danger-deep),var(--danger-deep))',
]
const PB_BADGE_COLORS = ['var(--violet-deep)','var(--cyan-deep)','var(--success-deep)','var(--warn-deep)','var(--violet-deep)','var(--cyan-deep)','var(--success-deep)','var(--danger-deep)']

function mapPlaybook(p, i) {
  return {
    id: p.id,
    name: p.name,
    badge: 'Personalizado',
    badgeColor: PB_BADGE_COLORS[i % PB_BADGE_COLORS.length],
    desc: p.description ?? '',
    tags: (p.tags ?? []).map(t => ({ label: t, bg: '#4f46e520', color: 'var(--accent-soft)' })),
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
        background: hov ? 'var(--surface)' : 'var(--surface)',
        border: `1px solid ${hov ? iconBg + '80' : 'var(--line)'}`,
        borderRadius: 14, padding: '14px 16px',
        transition: 'all .25s',
        boxShadow: hov ? `0 0 24px color-mix(in srgb, ${iconBg} 19%, transparent)` : 'none',
        cursor: 'default',
      }}
      className="fade-up"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: `linear-gradient(145deg, color-mix(in srgb, ${iconBg} 33%, transparent), color-mix(in srgb, ${iconBg} 15%, transparent))`,
          border: `1px solid color-mix(in srgb, ${iconBg} 38%, transparent)`,
          boxShadow: `0 0 16px color-mix(in srgb, ${iconBg} 27%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconEl style={{ width: 16, height: 16, color }} />
        </div>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', fontWeight: 600, lineHeight: 1.3 }}>{label}</p>
      </div>
      <p style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: -0.5 }}>{value}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {noArrow
          ? <span style={{ fontSize: 11, color: subColor ?? 'var(--muted)', fontWeight: 600 }}>{sub}</span>
          : <>
              <HiArrowUp style={{ width: 11, height: 11, color: 'var(--success-soft)', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--success-soft)', fontWeight: 700 }}>{pct}</span>
              <span style={{ fontSize: 10, color: 'var(--dim)' }}>{sub}</span>
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
      background: color + '25', color, border: `1px solid color-mix(in srgb, ${color} 31%, transparent)`,
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
        background: selected ? 'var(--surface)' : hov ? 'var(--surface)' : 'var(--surface)',
        border: `1px solid ${selected ? '#4f46e580' : hov ? 'var(--line)' : 'var(--line)'}`,
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
          boxShadow: `0 0 20px color-mix(in srgb, ${pb.badgeColor} 25%, transparent)`,
        }}>
          <pb.IconEl style={{ width: 24, height: 24, color: pb.iconColor }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 5 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.3 }}>{pb.name}</p>
            <Badge label={pb.badge} color={pb.badgeColor} />
          </div>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--dim)', lineHeight: 1.5 }}>{pb.desc}</p>
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
      <div style={{ display: 'flex', gap: 0, borderTop: '1px solid var(--line)', paddingTop: 10, marginBottom: 12 }}>
        {[
          { label: 'Tasa de éxito', v: pb.tasa },
          { label: 'Reuniones', v: pb.reuniones.toLocaleString(localeCode(getLocale())) },
          { label: 'Usado en', v: `${pb.campanas} campañas` },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0, paddingRight: i < 2 ? 10 : 0, borderRight: i < 2 ? '1px solid var(--surface-hover)' : 'none', paddingLeft: i > 0 ? 10 : 0 }}>
            <p style={{ margin: 0, fontSize: 9.5, color: 'var(--dim)', fontWeight: 500, marginBottom: 2 }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={e => { e.stopPropagation(); onUse?.() }} style={{
          flex: 1, padding: '7px 0', borderRadius: 9, border: '1px solid var(--line)',
          background: active ? 'var(--surface-hover)' : 'var(--surface)', color: 'var(--text)',
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
  // '' = todo bien; 'plan' = bloqueo de plan; 'error' = fallo real.
  const [loadStatus, setLoadStatus] = useState('')
  const [loadMessage, setLoadMessage] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Sin comprobar `ok`, un 403 con cuerpo JSON se colaba como si fueran stats
    // reales y las tarjetas pintaban ceros.
    apiFetch('/api/dashboard/stats').then(r => (r.ok ? r.json() : null)).then(data => { if (data) setStats(data) }).catch(() => {})
  }, [])

  useEffect(() => {
    let active = true
    setLoaded(false)
    apiFetch('/api/playbooks')
      .then(async r => {
        if (!r.ok) {
          const gate = await readPlanGate(r)
          const error = new Error('playbooks')
          error.gate = gate
          throw error
        }
        return r.json()
      })
      .then(data => {
        if (!active) return
        const arr = Array.isArray(data) ? data : []
        setPlaybooks(arr.map(mapPlaybook))
        setLoadStatus('')
        setLoadMessage('')
        setLoaded(true)
      })
      .catch(error => {
        if (!active) return
        setPlaybooks([])
        setLoadStatus(error?.gate ? 'plan' : 'error')
        setLoadMessage(error?.gate
          ? planGateMessage(error.gate, locale)
          : (locale === 'en'
            ? 'The playbook list could not be loaded. This is not an empty library: retry in a moment.'
            : 'No se pudo cargar la lista de playbooks. No es que no tengas ninguno: vuelve a intentarlo en unos segundos.'))
      })
    return () => { active = false }
  }, [refreshKey, locale])

  const statsCards = useMemo(() => {
    const total = playbooks.length
    return [
      // Si la carga falló, `0` sería un dato inventado.
      { ...STATS[0], value: loaded ? String(total) : '—', sub: loaded ? `Activos: ${total}` : 'Sin dato disponible' },
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
  }, [playbooks, stats, loaded])

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
      {/* Left: scrollable content */}
      <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', padding: '26px clamp(12px,4vw,28px) 40px', minWidth: 0 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: -0.5 }}>Playbooks</h1>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--dim)' }}>
              Biblioteca de estrategias conversacionales listas para usar o personalizar.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => setShowNewPlaybook(true)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 16px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(90deg, var(--accent-deep), var(--violet-deep))',
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

        {loadStatus && <DataStatusBanner status={loadStatus} message={loadMessage} onRetry={loadStatus === 'error' ? () => setRefreshKey(k => k + 1) : undefined} />}

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 20, gap: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 14px', borderRadius: 10,
            border: '1px solid var(--line)', background: 'var(--surface)',
          }}>
            <RiSearchLine style={{ width: 15, height: 15, color: 'var(--dim)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={locale === 'en' ? 'Search playbooks...' : 'Buscar playbooks...'} style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--muted)', fontSize: 13, width: 160,
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
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>
            {playbooks.length > 0 ? (locale === 'en' ? 'Popular playbooks' : 'Playbooks populares') : 'Playbooks'}
          </h2>
          {playbooks.length === 0
            ? (
              <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 13, padding: '40px 0' }}>
                {loadStatus
                  ? (locale === 'en' ? 'The list could not be loaded, so we cannot show your playbooks.' : 'No se pudo cargar la lista, así que no podemos mostrar tus playbooks.')
                  : 'Sin playbooks. Crea el primero con el botón de arriba.'}
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
