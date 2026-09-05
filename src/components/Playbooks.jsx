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
import './ui/page-foundations.css'
import { getLocale, localeCode, useI18n } from '../i18n'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import DataStatusBanner from './ui/DataStatusBanner'
import ProductPageHeader from './ui/ProductPageHeader'
import NewPlaybookModal from '../modals/NewPlaybookModal'

// ─── stat cards ───────────────────────────────────────────────────────────────
// Solo presentación: los valores llegan siempre de la API en statsCards.
const STATS = [
  { IconEl: RiBook2Line, iconBg: 'var(--accent-deep)', color: 'var(--violet)', label: 'Total playbooks', value: '—', sub: '', subColor: 'var(--success-soft)', noArrow: true },
  { IconEl: RiFlowChart, iconBg: 'var(--cyan-deep)', color: 'var(--cyan)', label: 'Usados en campañas', value: '—', sub: '' },
  // La tasa de éxito por playbook necesita cruzar campañas con resultados de
  // llamada; hasta que exista esa agregación, no se enseña una tarjeta vacía.
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
      style={{ '--ui-metric-accent': iconBg, '--ui-metric-color': color, '--ui-metric-sub-color': subColor ?? 'var(--muted)' }}
      className={`ui-metric-card fade-up${hov ? ' is-hovered' : ''}`}
    >
      <div className="ui-metric-card__heading">
        <div className="ui-metric-card__icon"><IconEl /></div>
        <p className="ui-metric-card__label">{label}</p>
      </div>
      <p className="ui-metric-card__value">{value}</p>
      <div className={`ui-metric-card__delta${noArrow ? ' is-muted' : ''}`}>
        {noArrow
          ? <span>{sub}</span>
          : <>
              <HiArrowUp />
              <strong>{pct}</strong>
              <span>{sub}</span>
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
export default function Playbooks({ sectionNavigation = null }) {
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
      {
        ...STATS[1],
        value: loaded ? String(playbooks.filter(p => (p.campaignCount ?? 0) > 0).length) : '—',
        sub: loaded ? `De ${total} playbooks` : 'Sin dato disponible',
        noArrow: true,
      },
      {
        ...STATS[2],
        value: stats ? (stats.meetingsScheduled ?? 0).toLocaleString(localeCode(getLocale())) : '—',
        pct: stats ? `${stats.kpiPcts?.meetings ?? 0}%` : null,
        sub: 'vs. mes anterior',
        noArrow: !stats,
      },
      {
        ...STATS[3],
        value: stats ? `€${Math.round(stats.closedWonValue ?? 0).toLocaleString(localeCode(getLocale()))}` : '—',
        pct: stats ? `${stats.kpiPcts?.pipeline ?? 0}%` : null,
        sub: 'vs. mes anterior',
        noArrow: !stats,
      },
    ]
  }, [playbooks, stats, loaded])

  return (
    <div className="ui-page-shell playbooks-page">
      {/* Left: scrollable content */}
      <div className="dark-scroll ui-page-scroll">

        {/* Header */}
        <ProductPageHeader Icon={RiBook2Line} title="Guiones de conversación" description="Prepara lo que dirán tus agentes y cómo responderán a las dudas de los clientes." navigation={sectionNavigation} actions={<div className="ui-page-actions"><button className="ui-primary-action" onClick={() => setShowNewPlaybook(true)}><RiAddLine />{locale === 'en' ? 'Create playbook' : 'Crear guion'}<HiChevronDown /></button></div>} />

        {showNewPlaybook && <NewPlaybookModal onClose={() => setShowNewPlaybook(false)} onSuccess={() => { setShowNewPlaybook(false); setRefreshKey(k => k + 1) }} />}

        {loadStatus && <DataStatusBanner status={loadStatus} message={loadMessage} onRetry={loadStatus === 'error' ? () => setRefreshKey(k => k + 1) : undefined} />}

        {/* Search */}
        <div className="ui-toolbar-row">
          <label className="ui-search-field">
            <RiSearchLine />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={locale === 'en' ? 'Search playbooks...' : 'Buscar guiones...'} />
          </label>
        </div>

        {/* Stats row */}
        <div className="ui-metrics-grid">
          {statsCards.map((s, i) => (
            <StatCard key={i} {...s} />
          ))}
        </div>

        {/* Playbooks */}
        <section className="ui-page-section">
          <h2 className="ui-section-title">
            {playbooks.length > 0 ? (locale === 'en' ? 'Popular playbooks' : 'Tus guiones') : 'Playbooks'}
          </h2>
          {playbooks.length === 0
            ? (
              <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 13, padding: '40px 0' }}>
                {loadStatus
                  ? (locale === 'en' ? 'The list could not be loaded, so we cannot show your playbooks.' : 'No se pudo cargar la lista, así que no podemos mostrar tus playbooks.')
                  : 'Aún no tienes guiones. Crea el primero con el botón de arriba.'}
              </p>
            )
            : (
              <div className="ui-card-grid">
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
        </section>

      </div>

      {/* Right: detail panel */}
    </div>
  )
}
