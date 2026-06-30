import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import '../sidebar.css'
import {
  RiDashboard3Fill, RiSendPlaneLine, RiPhoneLine, RiGroupLine,
  RiRobot2Line, RiShoppingCart2Line, RiCalendarLine, RiBook2Line,
  RiBarChartLine, RiFlowChart, RiBookReadLine, RiSettings4Line,
  RiLogoutBoxLine, RiMicLine,
} from 'react-icons/ri'
import { HiChevronDown, HiArrowRight } from 'react-icons/hi'
import { useAuth } from '../contexts/AuthContext'

const MENU_ITEMS = [
  { icon: RiDashboard3Fill,    label: 'Dashboard',       color: '#6366f1', to: '/dashboard' },
  { icon: RiSendPlaneLine,     label: 'Campañas',        color: '#ec4899', to: '/campanas' },
  { icon: RiPhoneLine,         label: 'Llamadas',        color: '#10b981', to: '/llamadas' },
  { icon: RiGroupLine,         label: 'Leads',           color: '#f59e0b', to: '/leads' },
  { icon: RiRobot2Line,        label: 'Agentes IA',      color: '#8b5cf6', to: '/agentes' },
  { icon: RiShoppingCart2Line, label: 'Pipeline',        color: '#06b6d4', to: '/pipeline' },
  { icon: RiCalendarLine,      label: 'Reuniones',       color: '#f97316', to: '/reuniones' },
  { icon: RiBook2Line,         label: 'Playbooks',       color: '#14b8a6', to: '/playbooks' },
  { icon: RiBarChartLine,      label: 'Insights',        color: '#a78bfa', to: '/insights' },
  { icon: RiFlowChart,         label: 'Automatizaciones',color: '#fb7185', to: '/automatizaciones' },
  { icon: RiBookReadLine,      label: 'Knowledge Base',  color: '#34d399', to: '/knowledge-base' },
  { icon: RiSettings4Line,     label: 'Configuración',   color: '#94a3b8', to: '/configuracion' },
  { icon: RiMicLine,           label: 'Test de Voz',     color: '#f43f5e', to: '/voz/test' },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [hovered, setHovered] = useState(null)
  const [progress, setProgress] = useState(0)
  const [ripple, setRipple] = useState(null)

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    const t = setTimeout(() => setProgress(62.4), 300)
    return () => clearTimeout(t)
  }, [])

  function handleClick(idx, e) {
    const rect = e.currentTarget.getBoundingClientRect()
    setRipple({ idx, x: e.clientX - rect.left, y: e.clientY - rect.top })
    setTimeout(() => setRipple(null), 600)
  }

  return (
    <aside style={styles.aside}>
      {/* Animated top glow border */}
      <div style={styles.topGlow} />

      {/* Logo */}
      <div style={{ padding: '24px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={styles.logoIcon} className="logo-spin-hover">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="2" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.95"/>
              <rect x="11" y="2" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.6"/>
              <rect x="2" y="11" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.6"/>
              <rect x="11" y="11" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.95"/>
            </svg>
          </div>
          <div>
            <p style={styles.logoText}>VozIA</p>
            <p style={styles.logoSub}>AI Voice Revenue Platform</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={styles.divider} />

      {/* Nav */}
      <nav className="sidebar-nav" style={{ flex: 1, padding: '8px 12px', overflowY: 'auto' }}>
        {MENU_ITEMS.map((item, idx) => {
          const Icon = item.icon
          const isHovered = hovered === idx

          return (
            <NavLink
              key={idx}
              to={item.to}
              onClick={e => handleClick(idx, e)}
              onMouseEnter={() => setHovered(idx)}
              onMouseLeave={() => setHovered(null)}
              style={({ isActive }) => ({
                ...styles.navBtn,
                textDecoration: 'none',
                ...(isActive ? styles.navBtnActive(item.color) : {}),
                ...(!isActive && isHovered ? styles.navBtnHover(item.color) : {}),
                animationDelay: `${idx * 40}ms`,
              })}
              className="nav-item-enter"
            >
              {({ isActive }) => (<>
              {/* Ripple */}
              {ripple?.idx === idx && (
                <span
                  style={{
                    ...styles.ripple,
                    left: ripple.x,
                    top: ripple.y,
                    background: item.color + '55',
                  }}
                  className="ripple-anim"
                />
              )}

              {/* Icon glow wrapper */}
              <span
                style={{
                  ...styles.iconWrap,
                  background: isActive
                    ? item.color + '25'
                    : isHovered
                    ? item.color + '18'
                    : 'transparent',
                  boxShadow: isActive ? `0 0 12px ${item.color}55` : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <Icon
                  style={{
                    width: 18, height: 18,
                    color: isActive ? item.color : isHovered ? item.color : '#6b7280',
                    transition: 'color 0.2s ease',
                  }}
                />
              </span>

              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#ffffff' : isHovered ? '#e2e8f0' : '#9ca3af',
                  transition: 'color 0.2s ease',
                  letterSpacing: 0.1,
                }}
              >
                {item.label}
              </span>

              {/* Active dot */}
              {isActive && (
                <span
                  style={{
                    ...styles.activeDot,
                    background: item.color,
                    boxShadow: `0 0 8px ${item.color}`,
                  }}
                  className="pulse-dot"
                />
              )}
              </>)}
            </NavLink>
          )
        })}
      </nav>

      {/* Status */}
      <div style={{ ...styles.divider, margin: '4px 0' }} />
      <div style={{ padding: '12px 20px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={styles.greenDot} className="pulse-green" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Estado del sistema</span>
        </div>
        <p style={{ fontSize: 11.5, color: '#4b5563', marginTop: 2, paddingLeft: 16 }}>
          Todos los sistemas operativos
        </p>
      </div>

      {/* Progress */}
      <div style={styles.divider} />
      <div style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#cbd5e1' }}>Llamadas IA hoy</span>
          <HiArrowRight style={{ width: 14, height: 14, color: '#4b5563' }} />
        </div>
        <p style={{ margin: '2px 0 10px', color: '#f1f5f9', fontWeight: 700, fontSize: 20 }}>
          1.248{' '}
          <span style={{ fontSize: 13, fontWeight: 400, color: '#4b5563' }}>/ 2.000</span>
        </p>
        {/* Progress track */}
        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressBar,
              width: `${progress}%`,
            }}
            className="progress-glow"
          />
          {/* Shine */}
          <div style={{ ...styles.progressShine, left: `calc(${progress}% - 6px)` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 10.5, color: '#374151' }}>0</span>
          <span style={{ fontSize: 10.5, color: '#6366f1', fontWeight: 600 }}>62.4%</span>
          <span style={{ fontSize: 10.5, color: '#374151' }}>2.000</span>
        </div>
      </div>

      {/* User */}
      <div style={styles.divider} />
      <div style={{ padding: '10px 12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => navigate('/configuracion')}
            style={{ ...styles.userBtn, flex: 1 }}
            onMouseEnter={e => (e.currentTarget.style.background = '#1a2235')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={styles.avatar}>{initials}</div>
            <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name ?? '—'}
              </p>
              <p style={{ fontSize: 11, color: '#4b5563', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email ?? ''}
              </p>
            </div>
          </button>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            style={styles.logoutBtn}
            onMouseEnter={e => { e.currentTarget.style.background = '#f8717115'; e.currentTarget.style.color = '#f87171' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4b5563' }}
          >
            <RiLogoutBoxLine style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>
    </aside>
  )
}

const styles = {
  aside: {
    display: 'flex',
    flexDirection: 'column',
    width: 224,
    minHeight: '100vh',
    flexShrink: 0,
    background: 'linear-gradient(180deg, #0d1117 0%, #0a0e1a 100%)',
    borderRight: '1px solid #1e2433',
    position: 'relative',
    overflow: 'hidden',
  },
  topGlow: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 2,
    background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899, #6366f1)',
    backgroundSize: '200% 100%',
    animation: 'gradientMove 3s linear infinite',
  },
  logoIcon: {
    width: 40, height: 40,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    boxShadow: '0 0 20px #6366f155, 0 4px 12px #0000004d',
    flexShrink: 0,
    cursor: 'pointer',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
  },
  logoText: {
    color: '#f1f5f9',
    fontWeight: 800,
    fontSize: 20,
    margin: 0,
    letterSpacing: -0.5,
  },
  logoSub: {
    color: '#374151',
    fontSize: 10.5,
    margin: '2px 0 0',
    letterSpacing: 0.2,
  },
  divider: {
    height: 1,
    background: 'linear-gradient(90deg, transparent, #1e2433 30%, #1e2433 70%, transparent)',
    margin: '0',
  },
  navBtn: {
    position: 'relative',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 12,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    marginBottom: 2,
    overflow: 'hidden',
    transition: 'transform 0.15s ease',
  },
  navBtnActive: color => ({
    background: `linear-gradient(90deg, ${color}22 0%, ${color}10 100%)`,
    border: `1px solid ${color}35`,
    boxShadow: `inset 0 0 20px ${color}10, 0 2px 8px ${color}20`,
  }),
  navBtnHover: color => ({
    background: `${color}0d`,
    transform: 'translateX(3px)',
  }),
  iconWrap: {
    width: 32, height: 32,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  activeDot: {
    width: 6, height: 6,
    borderRadius: '50%',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  ripple: {
    position: 'absolute',
    width: 6, height: 6,
    borderRadius: '50%',
    transform: 'translate(-50%, -50%) scale(0)',
    pointerEvents: 'none',
  },
  greenDot: {
    width: 8, height: 8,
    borderRadius: '50%',
    background: '#10b981',
    boxShadow: '0 0 8px #10b981',
    flexShrink: 0,
    display: 'inline-block',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 99,
    background: '#1e2433',
    position: 'relative',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 99,
    background: 'linear-gradient(90deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)',
    transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
  },
  progressShine: {
    position: 'absolute',
    top: 0,
    width: 12, height: '100%',
    background: 'rgba(255,255,255,0.4)',
    borderRadius: 99,
    filter: 'blur(2px)',
    transition: 'left 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  userBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 12,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'background 0.2s ease',
  },
  avatar: {
    width: 34, height: 34,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    color: 'white',
    flexShrink: 0,
    boxShadow: '0 0 12px #06b6d455',
  },
  logoutBtn: {
    width: 32, height: 32,
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: '#4b5563',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.2s, color 0.2s',
  },
}
