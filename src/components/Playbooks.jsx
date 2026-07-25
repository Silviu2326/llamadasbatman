import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiBook2Line, RiDownloadLine, RiAddLine, RiSearchLine,
  RiFilterLine, RiMoreLine, RiCheckLine, RiCloseLine,
  RiPhoneLine, RiBarChartLine, RiGroupLine, RiMoneyDollarBoxLine,
  RiCalendarLine, RiFlowChart, RiAlarmLine, RiChatVoiceLine,
  RiArrowRightUpLine, RiShieldLine, RiRefreshLine, RiShoppingCart2Line,
  RiUserLine, RiLightbulbLine, RiArrowUpLine, RiArrowDownLine, RiExternalLinkLine,
} from 'react-icons/ri'
import { HiArrowUp, HiArrowDown, HiChevronDown } from 'react-icons/hi'
import '../dashboard.css'
import { getLocale, localeCode, useI18n } from '../i18n'
import NewPlaybookModal from '../modals/NewPlaybookModal'

// ─── stat cards ───────────────────────────────────────────────────────────────
const STATS = [
  {
    IconEl: RiBook2Line, iconBg: '#4f46e5', color: '#a78bfa',
    label: 'Total playbooks', value: '18', sub: 'Activos: 14', subColor: '#4ade80', noArrow: true,
  },
  {
    IconEl: RiFlowChart, iconBg: '#0891b2', color: '#22d3ee',
    label: 'Usados en campañas', value: '12', pct: '20%', sub: 'vs. mes anterior',
  },
  {
    IconEl: RiBarChartLine, iconBg: '#059669', color: '#34d399',
    label: 'Tasa de éxito promedio', value: '24,7%', pct: '3,4pp', sub: 'vs. mes anterior',
  },
  {
    IconEl: RiCalendarLine, iconBg: '#d97706', color: '#fbbf24',
    label: 'Reuniones generadas', value: '1.248', pct: '18,7%', sub: 'vs. mes anterior',
  },
  {
    IconEl: RiMoneyDollarBoxLine, iconBg: '#16a34a', color: '#4ade80',
    label: 'Ingresos generados', value: '€245.800', pct: '26,1%', sub: 'vs. mes anterior',
  },
]

// ─── playbooks data ────────────────────────────────────────────────────────────
export const PLAYBOOKS = [
  {
    id: 1,
    name: 'Agendar demos B2B',
    badge: 'Oficial',
    badgeColor: '#7c3aed',
    desc: 'Convierte leads interesados en reuniones calificadas con tu equipo comercial.',
    tags: [{ label: 'Ventas', bg: '#4f46e520', color: '#a78bfa' }, { label: 'B2B', bg: '#0891b220', color: '#22d3ee' }],
    iconBg: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    IconEl: RiPhoneLine, iconColor: '#c4b5fd',
    tasa: '28,4%', reuniones: 624, campanas: 23,
  },
  {
    id: 2,
    name: 'Recuperar leads fríos',
    badge: 'Oficial',
    badgeColor: '#0891b2',
    desc: 'Reactiva leads que no respondieron y reaviva el interés tu solución.',
    tags: [{ label: 'Recuperación', bg: '#0891b220', color: '#22d3ee' }, { label: 'Outreach', bg: '#059669 20', color: '#34d399' }],
    iconBg: 'linear-gradient(135deg, #0e7490 0%, #0891b2 100%)',
    IconEl: RiRefreshLine, iconColor: '#67e8f9',
    tasa: '17,8%', reuniones: 312, campanas: 18,
  },
  {
    id: 3,
    name: 'Cerrar ventas calientes',
    badge: 'Oficial',
    badgeColor: '#059669',
    desc: 'Lleva leads calificados al cierre superando objeciones y acelerando la decisión.',
    tags: [{ label: 'Cierre', bg: '#05966920', color: '#34d399' }, { label: 'Ventas', bg: '#4f46e520', color: '#a78bfa' }],
    iconBg: 'linear-gradient(135deg, #065f46 0%, #059669 100%)',
    IconEl: RiShoppingCart2Line, iconColor: '#6ee7b7',
    tasa: '36,2%', reuniones: 489, campanas: 15,
  },
  {
    id: 4,
    name: 'Reconfirmar citas',
    badge: 'Oficial',
    badgeColor: '#d97706',
    desc: 'Reduce el no-show reconfirmando citas de forma cercana y efectiva.',
    tags: [{ label: 'Atención al cliente', bg: '#d9770620', color: '#fbbf24' }, { label: 'Recordatorios', bg: '#dc262620', color: '#f87171' }],
    iconBg: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)',
    IconEl: RiCalendarLine, iconColor: '#fcd34d',
    tasa: '31,6%', reuniones: 763, campanas: 31,
  },
  {
    id: 5,
    name: 'Renovaciones y upsell',
    badge: 'Oficial',
    badgeColor: '#7c3aed',
    desc: 'Identifica oportunidades de upsell y renueva con propuestas de valor.',
    tags: [{ label: 'Fidelización', bg: '#7c3aed20', color: '#c4b5fd' }, { label: 'Upsell', bg: '#0891b220', color: '#22d3ee' }],
    iconBg: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    IconEl: RiUserLine, iconColor: '#c4b5fd',
    tasa: '22,1%', reuniones: 298, campanas: 11,
  },
  {
    id: 6,
    name: 'Seguimiento post demo',
    badge: 'Personalizado',
    badgeColor: '#0891b2',
    desc: 'Da seguimiento a demos realizadas y empuja al siguiente paso.',
    tags: [{ label: 'Seguimiento', bg: '#0891b220', color: '#22d3ee' }, { label: 'Ventas', bg: '#4f46e520', color: '#a78bfa' }],
    iconBg: 'linear-gradient(135deg, #0369a1 0%, #0891b2 100%)',
    IconEl: RiChatVoiceLine, iconColor: '#7dd3fc',
    tasa: '26,5%', reuniones: 343, campanas: 9,
  },
  {
    id: 7,
    name: 'Cross-selling inteligente',
    badge: 'Personalizado',
    badgeColor: '#059669',
    desc: 'Detecta necesidades adicionales y ofrece complementarias.',
    tags: [{ label: 'Cross-sell', bg: '#05966920', color: '#34d399' }, { label: 'Ventas', bg: '#4f46e520', color: '#a78bfa' }],
    iconBg: 'linear-gradient(135deg, #047857 0%, #059669 100%)',
    IconEl: RiLightbulbLine, iconColor: '#6ee7b7',
    tasa: '19,3%', reuniones: 215, campanas: 7,
  },
  {
    id: 8,
    name: 'Reactivación inactivos',
    badge: 'Personalizado',
    badgeColor: '#dc2626',
    desc: 'Recupera clientes inactivos con mensajes personalizados.',
    tags: [{ label: 'Recuperación', bg: '#dc262620', color: '#f87171' }, { label: 'Fidelización', bg: '#7c3aed20', color: '#c4b5fd' }],
    iconBg: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)',
    IconEl: RiShieldLine, iconColor: '#fca5a5',
    tasa: '15,2%', reuniones: 174, campanas: 6,
  },
]

// ─── detail panel ─────────────────────────────────────────────────────────────
const DETAIL = {
  id: 1,
  name: 'Agendar demos B2B',
  badge: 'Oficial',
  desc: 'Playbook diseñado para agendar reuniones calificadas con leads interesados en tu solución. Enfocado en entender necesidades, generar valor y confirmar la reunión.',
  idealPara: ['Leads inbound interesados', 'Empresas SaaS / Tecnología', 'Ciclos de venta de 7-30 días'],
  incluye: [
    { icon: RiFlowChart, label: 'Flujo conversacional', value: '15 pasos' },
    { icon: RiAlarmLine, label: 'Manejo de objeciones', value: '8 objeciones' },
    { icon: RiSearchLine, label: 'Preguntas de calificación', value: '12 preguntas' },
    { icon: RiChatVoiceLine, label: 'Mensajes y momentos clave', value: '9 mensajes' },
    { icon: RiExternalLinkLine, label: 'Integraciones sugeridas', value: null },
  ],
  integraciones: ['HB', 'SF', '⚡'],
  stats: [
    { label: 'Tasa de éxito', value: '28,4%', trend: '+3,2pp', up: true },
    { label: 'Duración prom.', value: '6m 42s', trend: '-12s', up: false },
    { label: 'Reuniones', value: '624', trend: '+18,1%', up: true },
  ],
}

const TABS = ['Todos', 'Mis playbooks', 'Oficiales', 'Compartidos conmigo']

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
        <button style={{
          width: 34, height: 34, borderRadius: 9, border: '1px solid #1e2433',
          background: 'transparent', color: '#6b7280',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <RiMoreLine style={{ width: 16, height: 16 }} />
        </button>
      </div>
    </div>
  )
}

// ─── DetailPanel ──────────────────────────────────────────────────────────────
function DetailPanel({ onClose }) {
  const d = DETAIL
  return (
    <div className="dark-scroll" style={{
      width: 300, flexShrink: 0,
      background: '#0a0e1a',
      borderLeft: '1px solid #1e2433',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #1e2433' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{d.name}</p>
            <Badge label={d.badge} color="#7c3aed" />
          </div>
          <button
            onClick={onClose}
            style={{
              width: 26, height: 26, borderRadius: 7, border: '1px solid #1e2433',
              background: 'transparent', color: '#6b7280', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <RiCloseLine style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>

      {/* Hero image */}
      <div style={{
        margin: '12px 16px',
        height: 110, borderRadius: 12,
        background: 'linear-gradient(135deg, #1e1060 0%, #2e1065 50%, #0f172a 100%)',
        border: '1px solid #4f46e530',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 30% 50%, #4f46e530 0%, transparent 60%)',
        }} />
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 30px #7c3aed60',
        }}>
          <RiCalendarLine style={{ width: 28, height: 28, color: '#c4b5fd' }} />
        </div>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'linear-gradient(135deg, #1e3a5f, #0891b2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 20px #0891b240',
        }}>
          <RiPhoneLine style={{ width: 22, height: 22, color: '#67e8f9' }} />
        </div>
      </div>

      {/* Description */}
      <div style={{ padding: '0 16px 14px', borderBottom: '1px solid #1a2235' }}>
        <p style={{ margin: 0, fontSize: 12.5, color: '#94a3b8', lineHeight: 1.6 }}>{d.desc}</p>
      </div>

      {/* Ideal para */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1a2235' }}>
        <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Ideal para</p>
        {d.idealPara.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <RiCheckLine style={{ width: 14, height: 14, color: '#4ade80', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{item}</span>
          </div>
        ))}
      </div>

      {/* Incluye */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1a2235' }}>
        <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Incluye</p>
        {d.incluye.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <item.icon style={{ width: 14, height: 14, color: '#6b7280', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{item.label}</span>
            </div>
            {item.value
              ? <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>{item.value}</span>
              : (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[
                    { label: 'HS', bg: '#ff7a59' },
                    { label: 'SF', bg: '#00a1e0' },
                    { label: '⚡', bg: '#ff4f00' },
                  ].map(b => (
                    <div key={b.label} style={{
                      width: 20, height: 20, borderRadius: 5,
                      background: b.bg, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff',
                    }}>{b.label}</div>
                  ))}
                  <span style={{ fontSize: 11, color: '#6b7280' }}>+2</span>
                </div>
              )
            }
          </div>
        ))}
      </div>

      {/* Estadísticas promedio */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #1a2235' }}>
        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Estadísticas promedio</p>
        <div style={{ display: 'flex', gap: 0 }}>
          {d.stats.map((s, i) => (
            <div key={i} style={{
              flex: 1,
              paddingRight: i < 2 ? 10 : 0,
              borderRight: i < 2 ? '1px solid #1a2235' : 'none',
              paddingLeft: i > 0 ? 10 : 0,
            }}>
              <p style={{ margin: '0 0 3px', fontSize: 10, color: '#6b7280', fontWeight: 500 }}>{s.label}</p>
              <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 800, color: '#f1f5f9' }}>{s.value}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {s.up
                  ? <HiArrowUp style={{ width: 9, height: 9, color: '#4ade80' }} />
                  : <HiArrowDown style={{ width: 9, height: 9, color: '#f87171' }} />
                }
                <span style={{ fontSize: 10, color: s.up ? '#4ade80' : '#f87171', fontWeight: 700 }}>{s.trend}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA buttons */}
      <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button style={{
          width: '100%', padding: '11px 0', borderRadius: 10, border: 'none',
          background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
          color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 0 24px #7c3aed50',
        }}>
          Usar este playbook
        </button>
        <button style={{
          width: '100%', padding: '9px 0', borderRadius: 10,
          border: '1px solid #1e2433', background: 'transparent',
          color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          Ver detalle completo
          <RiArrowRightUpLine style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Playbooks() {
  const { locale } = useI18n()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(0)
  const [showNewPlaybook, setShowNewPlaybook] = useState(false)
  const [playbooks, setPlaybooks] = useState([])
  const [stats, setStats] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const localizedTabs = locale === 'en' ? ['All', 'My playbooks', 'Official', 'Shared with me'] : TABS

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
              <span style={{ fontSize: 22 }}>📖</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Biblioteca de estrategias conversacionales listas para usar o personalizar.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => { const i = document.createElement('input'); i.type='file'; i.accept='.json,.yaml,.txt'; i.click() }} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 16px', borderRadius: 10,
              border: '1px solid #1e2433', background: 'transparent',
              color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              <RiDownloadLine style={{ width: 15, height: 15 }} />
              {locale === 'en' ? 'Import playbook' : 'Importar playbook'}
              <span style={{ color: '#6b7280', fontSize: 12 }}>›</span>
            </button>
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

        {/* Tabs + search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
          <div style={{ display: 'flex', gap: 2, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: 4 }}>
            {localizedTabs.map((t, i) => (
              <button key={i} onClick={() => setActiveTab(i)} style={{
                padding: '6px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: activeTab === i ? '#1a2235' : 'transparent',
                color: activeTab === i ? '#f1f5f9' : '#6b7280',
                fontSize: 13, fontWeight: activeTab === i ? 700 : 500,
                transition: 'all .2s',
                boxShadow: activeTab === i ? 'inset 0 0 0 1px #2a3448' : 'none',
              }}>{t}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 14px', borderRadius: 10,
              border: '1px solid #1e2433', background: '#0d1117',
            }}>
              <RiSearchLine style={{ width: 15, height: 15, color: '#4b5563' }} />
              <input placeholder={locale === 'en' ? 'Search playbooks...' : 'Buscar playbooks...'} style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: '#94a3b8', fontSize: 13, width: 160,
              }} />
            </div>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 14px', borderRadius: 10,
              border: '1px solid #1e2433', background: '#0d1117',
              color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              <RiFilterLine style={{ width: 15, height: 15 }} />
              {locale === 'en' ? 'Filters' : 'Filtros'}
            </button>
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
                {playbooks.map(pb => (
                  <PlaybookCard
                    key={pb.id}
                    pb={pb}
                    selected={false}
                    onClick={() => navigate('/playbooks/' + pb.id)}
                    onUse={() => setShowNewPlaybook(true)}
                  />
                ))}
              </div>
            )
          }
        </div>

        {/* Ver todos */}
        {playbooks.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 24px', borderRadius: 10,
              border: '1px solid #1e2433', background: '#0d1117',
              color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              {locale === 'en' ? 'View all playbooks' : 'Ver todos los playbooks'} ({playbooks.length})
              <HiChevronDown style={{ width: 15, height: 15 }} />
            </button>
          </div>
        )}
      </div>

      {/* Right: detail panel */}
    </div>
  )
}
