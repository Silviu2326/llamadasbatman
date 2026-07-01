import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  RiEyeLine, RiEyeOffLine, RiArrowRightLine,
  RiMailLine, RiLockPasswordLine, RiShieldCheckLine,
  RiCheckLine, RiPhoneLine, RiStarFill, RiFlashlightLine,
} from 'react-icons/ri'

// ── Seed data ─────────────────────────────────────────────────────────────────
const PARTICLES = [
  {x:8,  y:12, size:1.4, speed:0.012, phase:0.4, opacity:0.10, color:'indigo'},
  {x:23, y:67, size:2.1, speed:0.009, phase:1.2, opacity:0.14, color:'violet'},
  {x:41, y:34, size:1.1, speed:0.016, phase:2.1, opacity:0.08, color:'indigo'},
  {x:56, y:81, size:1.8, speed:0.011, phase:0.7, opacity:0.12, color:'teal'},
  {x:72, y:22, size:2.4, speed:0.014, phase:3.3, opacity:0.09, color:'indigo'},
  {x:87, y:55, size:1.2, speed:0.018, phase:1.9, opacity:0.15, color:'violet'},
  {x:15, y:45, size:2.0, speed:0.010, phase:4.1, opacity:0.11, color:'teal'},
  {x:33, y:90, size:1.5, speed:0.013, phase:2.8, opacity:0.13, color:'indigo'},
  {x:62, y:11, size:1.9, speed:0.017, phase:0.2, opacity:0.09, color:'violet'},
  {x:78, y:73, size:1.3, speed:0.008, phase:5.0, opacity:0.16, color:'teal'},
  {x:5,  y:80, size:2.2, speed:0.015, phase:3.7, opacity:0.10, color:'indigo'},
  {x:48, y:58, size:1.6, speed:0.012, phase:1.5, opacity:0.12, color:'violet'},
  {x:91, y:36, size:1.0, speed:0.019, phase:2.4, opacity:0.08, color:'teal'},
  {x:26, y:18, size:2.3, speed:0.009, phase:4.6, opacity:0.14, color:'indigo'},
  {x:66, y:92, size:1.7, speed:0.016, phase:0.9, opacity:0.11, color:'violet'},
  {x:82, y:48, size:1.1, speed:0.011, phase:3.1, opacity:0.15, color:'indigo'},
  {x:37, y:74, size:2.0, speed:0.014, phase:1.1, opacity:0.09, color:'teal'},
  {x:53, y:29, size:1.4, speed:0.017, phase:5.5, opacity:0.13, color:'indigo'},
  {x:11, y:61, size:1.8, speed:0.010, phase:2.6, opacity:0.10, color:'violet'},
  {x:44, y:6,  size:1.2, speed:0.013, phase:4.3, opacity:0.12, color:'teal'},
  {x:70, y:84, size:2.1, speed:0.018, phase:0.6, opacity:0.08, color:'indigo'},
  {x:95, y:15, size:1.6, speed:0.008, phase:3.9, opacity:0.14, color:'violet'},
  {x:29, y:52, size:1.3, speed:0.015, phase:1.7, opacity:0.11, color:'teal'},
  {x:60, y:40, size:2.4, speed:0.012, phase:5.2, opacity:0.16, color:'indigo'},
  {x:18, y:96, size:1.0, speed:0.016, phase:2.0, opacity:0.09, color:'violet'},
  {x:85, y:63, size:1.9, speed:0.009, phase:4.8, opacity:0.13, color:'teal'},
  {x:50, y:77, size:1.5, speed:0.014, phase:1.3, opacity:0.10, color:'indigo'},
  {x:38, y:43, size:2.2, speed:0.011, phase:3.5, opacity:0.12, color:'violet'},
]

const PARTICLE_COLORS = {
  indigo: '99,102,241',
  violet: '167,139,250',
  teal:   '34,211,238',
}

// Constellation pairs (indices into PARTICLES)
const CONSTELLATION = [[0,12],[1,6],[3,9],[4,14],[7,10],[13,23],[15,22],[2,17],[5,21]]

const FLOAT_CARDS = [
  { id:0, delay:0,   icon:RiCheckLine, iconBg:'rgba(16,185,129,0.12)',  iconColor:'#34d399', title:'Reunión agendada',    sub:'Lucía P. · mañana 10:00', top:'10%', right:'-22px' },
  { id:1, delay:1.8, icon:RiPhoneLine, iconBg:'rgba(99,102,241,0.12)',  iconColor:'#818cf8', title:'Llamada completada',  sub:'4m 23s · Score 96/100',   top:'50%', right:'-26px' },
  { id:2, delay:3.4, icon:RiStarFill,  iconBg:'rgba(245,158,11,0.12)',  iconColor:'#fbbf24', title:'Lead calificado',     sub:'Alta intención · A+',      top:'73%', left:'-22px'  },
]

const AVATARS = [
  { initials:'MG', bg:'linear-gradient(135deg,#4f46e5,#6d28d9)' },
  { initials:'AR', bg:'linear-gradient(135deg,#0891b2,#0e7490)' },
  { initials:'LP', bg:'linear-gradient(135deg,#7c3aed,#a855f7)' },
  { initials:'JR', bg:'linear-gradient(135deg,#059669,#047857)' },
]

const TICKER_ITEMS = [
  '✦ 1.248 llamadas activas',
  '✦ 96% tasa de respuesta',
  '✦ 340 reuniones agendadas hoy',
  '✦ Score promedio 94/100',
  '✦ 0 downtime este mes',
  '✦ 1.200+ equipos confían en VozIA',
]

const METRICS = [
  { target:340, suffix:'%', prefix:'+', label:'Más conversiones', color:'#818cf8' },
  { target:24,  suffix:'/7', prefix:'',  label:'Sin interrupciones', color:'#22d3ee' },
  { target:2,   suffix:'s',  prefix:'<', label:'Primera respuesta', color:'#fb923c' },
]

const HEADLINE_WORD = 'piloto automático.'
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$'

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useCounter(target, dur = 1400, started = false) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!started) return
    const t0 = performance.now()
    let id
    const run = (now) => {
      const p = Math.min((now - t0) / dur, 1)
      setV(Math.round((1 - Math.pow(1 - p, 3)) * target))
      if (p < 1) id = requestAnimationFrame(run)
    }
    id = requestAnimationFrame(run)
    return () => cancelAnimationFrame(id)
  }, [started, target, dur])
  return v
}

function useTypewriter(text, delay = 700, speed = 46) {
  const [out, setOut] = useState('')
  useEffect(() => {
    let i = 0, timerId
    const start = setTimeout(() => {
      timerId = setInterval(() => { i++; setOut(text.slice(0, i)); if (i >= text.length) clearInterval(timerId) }, speed)
    }, delay)
    return () => { clearTimeout(start); clearInterval(timerId) }
  }, [text, delay, speed])
  return out
}

function useScramble(text, delay = 150) {
  const [out, setOut] = useState(text)
  useEffect(() => {
    let frame = 0, id
    const total = 24
    const run = () => {
      frame++
      const revealed = Math.floor((frame / total) * text.length)
      setOut(text.split('').map((ch, i) => {
        if (i < revealed || ch === ' ') return ch
        return SCRAMBLE_CHARS[Math.floor((frame * 7 + i * 13) % SCRAMBLE_CHARS.length)]
      }).join(''))
      if (frame < total) id = requestAnimationFrame(run); else setOut(text)
    }
    const t = setTimeout(() => { id = requestAnimationFrame(run) }, delay)
    return () => { clearTimeout(t); cancelAnimationFrame(id) }
  }, [text, delay])
  return out
}

// ── Stagger text ──────────────────────────────────────────────────────────────
function StaggerText({ text, style = {}, letterStyle = {}, delay = 0 }) {
  const [show, setShow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setShow(true), delay); return () => clearTimeout(t) }, [delay])
  return (
    <span style={style} aria-label={text}>
      {text.split('').map((ch, i) => (
        <span key={i} style={{
          display: 'inline-block',
          opacity: show ? 1 : 0,
          transform: show ? 'translateY(0) rotateX(0deg)' : 'translateY(28px) rotateX(-40deg)',
          transition: `opacity 0.5s ease ${i * 26}ms, transform 0.55s cubic-bezier(0.22,1,0.36,1) ${i * 26}ms`,
          transformOrigin: 'bottom',
          ...letterStyle,
        }}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  )
}

// ── Constellation particles ───────────────────────────────────────────────────
function Constellation({ tick, width, height }) {
  const pts = PARTICLES.map(p => ({
    x: (p.x / 100) * width,
    y: ((p.y + tick * p.speed * 0.38) % 110 - 5) / 100 * height + Math.sin(tick * 0.011 + p.phase) * (width * 0.028),
    opacity: p.opacity,
    size: p.size,
    color: PARTICLE_COLORS[p.color],
  }))

  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} width={width} height={height}>
      {/* Constellation lines */}
      {CONSTELLATION.map(([a, b], i) => {
        const p1 = pts[a], p2 = pts[b]
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
        const maxDist = Math.min(width, height) * 0.45
        if (dist > maxDist) return null
        const alpha = (1 - dist / maxDist) * 0.08 * (0.5 + Math.sin(tick * 0.02 + i) * 0.5)
        return (
          <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke={`rgba(129,140,248,${alpha})`} strokeWidth="0.7"/>
        )
      })}
      {/* Dots */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.size}
          fill={`rgba(${p.color},${p.opacity})`}/>
      ))}
    </svg>
  )
}

// ── Aurora background ─────────────────────────────────────────────────────────
function Aurora({ tick }) {
  const blobs = [
    { cx: 25, cy: 30, rx: 55, ry: 38, color: '79,70,229', driftX: 8, driftY: 6, phase: 0,    opacity: 0.055 },
    { cx: 65, cy: 55, rx: 48, ry: 42, color: '124,58,237',driftX: 6, driftY: 10, phase: 2.1, opacity: 0.040 },
    { cx: 40, cy: 80, rx: 42, ry: 32, color: '34,211,238',driftX: 10, driftY: 5, phase: 4.3, opacity: 0.025 },
    { cx: 80, cy: 20, rx: 36, ry: 44, color: '99,102,241',driftX: 7, driftY: 8,  phase: 1.4, opacity: 0.035 },
  ]
  return (
    <>
      {blobs.map((b, i) => {
        const dx = Math.sin(tick * 0.006 + b.phase) * b.driftX
        const dy = Math.cos(tick * 0.008 + b.phase) * b.driftY
        return (
          <div key={i} style={{
            position: 'absolute', pointerEvents: 'none',
            left: `${b.cx + dx}%`, top: `${b.cy + dy}%`,
            transform: 'translate(-50%,-50%)',
            width: `${b.rx * 2}%`, height: `${b.ry * 2}%`,
            borderRadius: '50%',
            background: `radial-gradient(ellipse, rgba(${b.color},${b.opacity}) 0%, transparent 70%)`,
            filter: 'blur(2px)',
          }} />
        )
      })}
    </>
  )
}

// ── Voice orb ─────────────────────────────────────────────────────────────────
function VoiceOrb({ tick }) {
  const s = 220, cx = 110, cy = 110
  const RINGS = [
    { r: 34, sw: 1.6, base: 'rgba(99,102,241,',  max: 0.7, dash: '0',    rot:  0      },
    { r: 53, sw: 1.1, base: 'rgba(99,102,241,',  max: 0.35, dash: '5 7', rot:  0.007  },
    { r: 72, sw: 0.9, base: 'rgba(124,58,237,',  max: 0.25, dash: '2 9', rot: -0.005  },
    { r: 92, sw: 0.6, base: 'rgba(34,211,238,',  max: 0.15, dash: '1 14',rot:  0.003  },
    { r:112, sw: 0.4, base: 'rgba(99,102,241,',  max: 0.07, dash: '1 20',rot: -0.002  },
  ]
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id="og" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#4f46e5" stopOpacity="0.40"/>
          <stop offset="45%"  stopColor="#7c3aed" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="cg" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#c4b5fd"/>
          <stop offset="100%" stopColor="#6366f1"/>
        </radialGradient>
        <filter id="cf" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5"/>
        </filter>
        <filter id="rf" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2"/>
        </filter>
      </defs>

      {/* Ambient glow */}
      <circle cx={cx} cy={cy} r="110" fill="url(#og)"/>

      {/* Teal accent glow */}
      <circle cx={cx} cy={cy} r="60"
        fill={`rgba(34,211,238,${0.02 + Math.sin(tick * 0.03) * 0.015})`}
        filter="url(#rf)"/>

      {/* Rings */}
      {RINGS.map((r, i) => {
        const pulse = r.max * (0.55 + Math.sin(tick * 0.04 + i * 0.8) * 0.45)
        return (
          <circle key={i} cx={cx} cy={cy} r={r.r} fill="none"
            stroke={`${r.base}${pulse})`}
            strokeWidth={r.sw} strokeDasharray={r.dash}
            transform={`rotate(${tick * r.rot * 57.3 + i * 50} ${cx} ${cy})`}/>
        )
      })}

      {/* Primary orbital dots */}
      {[0,1,2,3,4,5].map(i => {
        const a = (i / 6) * Math.PI * 2 + tick * 0.009
        const pulse = 0.3 + Math.sin(tick * 0.14 + i * 1.04) * 0.5
        const isTeal = i % 3 === 2
        return <circle key={i}
          cx={cx + Math.cos(a) * 72} cy={cy + Math.sin(a) * 72} r="2.8"
          fill={isTeal ? `rgba(34,211,238,${pulse * 0.8})` : `rgba(129,140,248,${pulse})`}/>
      })}

      {/* Secondary orbital */}
      {[0,1,2,3].map(i => {
        const a = (i / 4) * Math.PI * 2 - tick * 0.006
        const pulse = 0.2 + Math.sin(tick * 0.11 + i * 1.5) * 0.3
        return <circle key={i}
          cx={cx + Math.cos(a) * 53} cy={cy + Math.sin(a) * 53} r="1.5"
          fill={`rgba(196,181,253,${pulse})`}/>
      })}

      {/* Spoke lines */}
      {[0, 60, 120, 180, 240, 300].map((deg, i) => {
        const rad = (deg + tick * 0.25) * Math.PI / 180
        const alpha = 0.08 + Math.sin(tick * 0.07 + i) * 0.06
        return (
          <line key={i}
            x1={cx + Math.cos(rad) * 14} y1={cy + Math.sin(rad) * 14}
            x2={cx + Math.cos(rad) * 52} y2={cy + Math.sin(rad) * 52}
            stroke={`rgba(99,102,241,${alpha})`} strokeWidth="0.8"/>
        )
      })}

      {/* Frequency bars */}
      {Array.from({ length: 36 }, (_, i) => {
        const angle = (i / 36) * Math.PI * 2 - Math.PI / 2
        const amp = Math.abs(Math.sin(tick * 0.09 + i * 0.46))
        const h = 3 + amp * 18
        const r0 = 34, r1 = r0 + h
        const isTeal = i % 9 === 4
        const alpha = 0.1 + amp * 0.55
        return (
          <line key={i}
            x1={cx + Math.cos(angle) * r0} y1={cy + Math.sin(angle) * r0}
            x2={cx + Math.cos(angle) * r1} y2={cy + Math.sin(angle) * r1}
            stroke={isTeal ? `rgba(34,211,238,${alpha})` : `rgba(129,140,248,${alpha * (amp > 0.5 ? 1 : 0.3)})`}
            strokeWidth="1.4" strokeLinecap="round"/>
        )
      })}

      {/* Core layers */}
      <circle cx={cx} cy={cy} r="22" fill="rgba(79,70,229,0.18)"  stroke="rgba(99,102,241,0.35)"  strokeWidth="1"/>
      <circle cx={cx} cy={cy} r="12" fill="rgba(99,102,241,0.28)" stroke="rgba(129,140,248,0.60)" strokeWidth="1.5"/>
      {/* Breathing pulse */}
      <circle cx={cx} cy={cy} r={6 + Math.sin(tick * 0.05) * 1.5} fill="url(#cg)" filter="url(#cf)"/>
    </svg>
  )
}

// ── Waveform ──────────────────────────────────────────────────────────────────
function Waveform({ tick }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2.5, height: 54 }}>
      {Array.from({ length: 54 }, (_, i) => {
        const base = 3 + Math.abs(Math.sin(i * 0.29)) * 25
        const h    = base * (0.38 + Math.abs(Math.sin(tick * 0.1 + i * 0.33)) * 0.62)
        const hot  = i >= 18 && i <= 34
        const teal = i >= 22 && i <= 26
        const a    = 0.25 + Math.abs(Math.sin(tick * 0.1 + i * 0.33)) * 0.75
        return (
          <div key={i} style={{
            width: 3, borderRadius: 99,
            height: Math.max(2, Math.round(h)), flexShrink: 0,
            background: teal
              ? `rgba(34,211,238,${a * 0.9})`
              : hot
                ? `rgba(129,140,248,${a})`
                : `rgba(255,255,255,${0.04 + Math.abs(Math.sin(tick * 0.07 + i * 0.3)) * 0.06})`,
            transition: 'height 0.08s ease',
            boxShadow: teal
              ? `0 0 8px rgba(34,211,238,${a * 0.5})`
              : hot
                ? `0 0 7px rgba(99,102,241,${a * 0.45})`
                : 'none',
          }}/>
        )
      })}
    </div>
  )
}

// ── Float card ────────────────────────────────────────────────────────────────
function FloatCard({ card, tick }) {
  const bob = Math.sin(tick * 0.022 + card.delay) * 5
  const pos = { top: card.top }
  if (card.right) pos.right = card.right
  if (card.left)  pos.left  = card.left
  const Icon = card.icon
  return (
    <div style={{
      position: 'absolute', ...pos, zIndex: 6,
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'rgba(6,8,18,0.82)', backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 13, padding: '10px 14px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.05) inset',
      transform: `translateY(${bob}px)`,
      transition: 'transform 0.12s ease',
      whiteSpace: 'nowrap', minWidth: 178,
    }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: card.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon style={{ width: 13, height: 13, color: card.iconColor }}/>
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: '#e2e8f0' }}>{card.title}</p>
        <p style={{ margin: '1px 0 0', fontSize: 10.5, color: '#374151' }}>{card.sub}</p>
      </div>
    </div>
  )
}

// ── Metric counter ────────────────────────────────────────────────────────────
function MetricCounter({ target, suffix, prefix, label, color, started }) {
  const val = useCounter(target, 1500, started)
  return (
    <div>
      <p style={{ margin: 0, fontSize: 25, fontWeight: 900, color, letterSpacing: -0.9, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 20px ${color}50` }}>
        {prefix}{val}{suffix}
      </p>
      <p style={{ margin: '3px 0 0', fontSize: 10.5, color: '#374151', lineHeight: 1.3 }}>{label}</p>
    </div>
  )
}

// ── Input with animated border ────────────────────────────────────────────────
function AnimatedInput({ type, value, onChange, onFocus, onBlur, placeholder, autoComplete, autoFocus, id, focused, right }) {
  return (
    <div style={{ position: 'relative' }} className={focused ? 'input-focused' : ''}>
      {/* Spinning gradient border when focused */}
      {focused && (
        <div style={{
          position: 'absolute', inset: -1, borderRadius: 12, zIndex: 0,
          background: 'conic-gradient(from var(--border-angle), #4f46e5, #7c3aed, #22d3ee, #4f46e5)',
          animation: 'border-spin 3s linear infinite',
          padding: 1.5,
        }}>
          <div style={{ background: '#06091a', borderRadius: 11, height: '100%' }}/>
        </div>
      )}
      <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', zIndex: 2, pointerEvents: 'none' }}>
        {id === 'email' ? <RiMailLine style={{ width: 15, height: 15, color: focused ? '#6366f1' : '#1a2235', transition: 'color 0.2s' }}/> : <RiLockPasswordLine style={{ width: 15, height: 15, color: focused ? '#6366f1' : '#1a2235', transition: 'color 0.2s' }}/>}
      </div>
      <input
        type={type} value={value} onChange={onChange}
        onFocus={onFocus} onBlur={onBlur}
        placeholder={placeholder} autoComplete={autoComplete} autoFocus={autoFocus}
        style={{
          width: '100%', boxSizing: 'border-box', position: 'relative', zIndex: 1,
          background: focused ? 'rgba(79,70,229,0.04)' : 'rgba(255,255,255,0.018)',
          border: focused ? '1.5px solid transparent' : '1.5px solid rgba(255,255,255,0.05)',
          borderRadius: 11,
          padding: `11.5px ${right || 14}px 11.5px 42px`,
          color: '#f1f5f9', fontSize: 14, outline: 'none', fontFamily: 'inherit',
          transition: 'background 0.2s',
        }}
      />
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const navigate  = useNavigate()
  const { login } = useAuth()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [focused,  setFocused]  = useState(null)
  const [tick,     setTick]     = useState(0)
  const [entered,  setEntered]  = useState(false)
  const [counters, setCounters] = useState(false)
  const [panelW,   setPanelW]   = useState(800)

  const typed    = useTypewriter(HEADLINE_WORD, 800, 46)
  const logoText = useScramble('VozIA', 100)

  useEffect(() => {
    let id
    const loop = () => { setTick(t => t + 1); id = requestAnimationFrame(loop) }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const t1 = setTimeout(() => setEntered(true), 60)
    const t2 = setTimeout(() => setCounters(true), 1000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  useEffect(() => {
    const measure = () => setPanelW(window.innerWidth * 0.55)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Introduce email y contraseña.'); return }
    setLoading(true)
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Credenciales incorrectas.'); return }
      login(data.token, data.user)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  const slide = (delay = 0) => ({
    opacity: entered ? 1 : 0,
    transform: entered ? 'translateY(0)' : 'translateY(18px)',
    transition: `opacity 0.6s ease ${delay}ms, transform 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
  })

  return (
    <div className="login-root" style={{ display: 'flex', minHeight: '100vh', background: '#03050c', fontFamily: "'Inter',system-ui,-apple-system,sans-serif", overflow: 'hidden' }}>

      {/* ══ LEFT PANEL ════════════════════════════════════════════════════════ */}
      <div className="login-left" style={{ flex: '0 0 55%', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '44px 54px' }}>

        {/* Base BG */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(155deg,#06081a 0%,#090c20 35%,#05080f 100%)' }}/>

        {/* Aurora blobs */}
        <Aurora tick={tick}/>

        {/* Dot grid */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(99,102,241,0.19) 1px,transparent 1px)', backgroundSize: '30px 30px', opacity: 0.42, pointerEvents: 'none' }}/>

        {/* Scanlines */}
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.022) 2px,rgba(0,0,0,0.022) 3px)', pointerEvents: 'none' }}/>

        {/* Constellation + particles */}
        <Constellation tick={tick} width={panelW} height={window.innerHeight}/>

        {/* Top light line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(99,102,241,0.5) 28%,rgba(34,211,238,0.35) 55%,rgba(168,85,247,0.5) 72%,transparent)' }}/>

        {/* Page-load sweep */}
        <div className="sweep-line"/>

        {/* ─ Logo ─ */}
        <div style={{ position: 'relative', zIndex: 5, ...slide(0) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.png" alt="VozIA" style={{ width: 54, height: 54, borderRadius: 13, objectFit: 'cover', boxShadow: '0 0 26px rgba(99,102,241,0.45)' }} />
            <span style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9', letterSpacing: -0.3 }}>{logoText}</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#22d3ee', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: 99, padding: '2px 8px', letterSpacing: 0.4 }}>v2.1</span>
          </div>
        </div>

        {/* ─ Orb ─ */}
        <div style={{ position: 'relative', zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, ...slide(80) }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <VoiceOrb tick={tick}/>
            {FLOAT_CARDS.map(c => <FloatCard key={c.id} card={c} tick={tick}/>)}
          </div>
          <Waveform tick={tick}/>
          {/* Live badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.15)', borderRadius: 99, padding: '5px 16px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22d3ee', boxShadow: '0 0 9px #22d3ee', animation: 'blink 1.5s ease-in-out infinite' }}/>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#67e8f9', letterSpacing: 0.2 }}>1.248 llamadas activas</span>
            <span style={{ fontSize: 11, color: '#0e2428' }}>·</span>
            <span style={{ fontSize: 11.5, color: '#374151' }}>99.9% uptime</span>
          </div>
        </div>

        {/* ─ Bottom ─ */}
        <div style={{ position: 'relative', zIndex: 5 }}>
          {/* Headline */}
          <div style={{ marginBottom: 10, perspective: '400px', overflow: 'hidden' }}>
            <h1 style={{ margin: 0, fontSize: 36, fontWeight: 900, letterSpacing: -1.4, lineHeight: 1.15, color: '#f1f5f9' }}>
              <StaggerText text="Ventas en" delay={150}/><br/>
              <span style={{ background: 'linear-gradient(95deg,#818cf8 0%,#a78bfa 35%,#22d3ee 65%,#818cf8 100%)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'gradientFlow 4s linear infinite', display: 'inline-block' }}>
                {typed}
                {typed.length < HEADLINE_WORD.length && (
                  <span style={{ animation: 'cur 0.9s step-end infinite', WebkitTextFillColor: 'rgba(129,140,248,0.65)' }}>|</span>
                )}
              </span>
            </h1>
          </div>

          <p style={{ margin: '0 0 22px', fontSize: 13.5, color: '#374151', lineHeight: 1.65, maxWidth: 360, ...slide(300) }}>
            Agentes de voz con IA que llaman, califican y agendan — 24/7, sin pausas.
          </p>

          {/* Metrics */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 18, ...slide(360) }}>
            {METRICS.map(({ target, suffix, prefix, label, color }, i) => (
              <div key={label} style={{ flex: 1, borderLeft: i > 0 ? '1px solid #101826' : 'none', paddingLeft: i > 0 ? 18 : 0, marginLeft: i > 0 ? 2 : 0 }}>
                <MetricCounter target={target} suffix={suffix} prefix={prefix} label={label} color={color} started={counters}/>
              </div>
            ))}
          </div>

          {/* Ticker */}
          <div style={{ overflow: 'hidden', borderTop: '1px solid #0d1525', borderBottom: '1px solid #0d1525', padding: '7px 0', marginBottom: 18, ...slide(400) }}>
            <div style={{ display: 'flex', animation: 'ticker 22s linear infinite', whiteSpace: 'nowrap' }}>
              {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
                <span key={i} style={{ fontSize: 11.5, color: i % 6 === 2 ? '#22d3ee80' : '#374151', paddingRight: 40, flexShrink: 0 }}>{item}</span>
              ))}
            </div>
          </div>

          {/* Testimonial */}
          <div style={{ padding: '15px 17px', background: 'rgba(255,255,255,0.013)', border: '1px solid rgba(255,255,255,0.045)', borderRadius: 14, backdropFilter: 'blur(8px)', ...slide(450) }}>
            <div style={{ display: 'flex', gap: 1, marginBottom: 7 }}>
              {[0,1,2,3,4].map(i => <RiStarFill key={i} style={{ width: 10.5, height: 10.5, color: '#fbbf24' }}/>)}
            </div>
            <p style={{ margin: '0 0 11px', fontSize: 12.5, color: '#4b5563', lineHeight: 1.65, fontStyle: 'italic' }}>
              "De 40 a 340 reuniones al mes el primer trimestre — sin contratar a nadie más."
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>MG</div>
              <div>
                <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: '#cbd5e1' }}>Marcos García</p>
                <p style={{ margin: 0, fontSize: 10.5, color: '#374151' }}>Head of Sales · TechFlow</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ RIGHT PANEL ═══════════════════════════════════════════════════════ */}
      <div className="login-right" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 44px', background: '#040710', borderLeft: '1px solid rgba(255,255,255,0.03)', position: 'relative', overflow: 'hidden' }}>

        {/* Right panel ambient */}
        <div style={{ position: 'absolute', top: '12%', left: '50%', transform: 'translateX(-50%)', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle,rgba(79,70,229,0.04) 0%,transparent 65%)', pointerEvents: 'none' }}/>
        <div style={{ position: 'absolute', bottom: '8%', right: '-5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle,rgba(34,211,238,0.025) 0%,transparent 65%)', pointerEvents: 'none' }}/>

        {/* Right top line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(34,211,238,0.2) 50%,transparent)' }}/>

        <div style={{ width: '100%', maxWidth: 372, position: 'relative', zIndex: 2 }}>

          {/* Heading */}
          <div style={{ marginBottom: 28, ...slide(60) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <img src="/logo.png" alt="VozIA" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover', boxShadow: '0 0 18px rgba(99,102,241,0.3)' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#374151', letterSpacing: -0.2 }}>VozIA</span>
            </div>
            <div style={{ overflow: 'hidden' }}>
              <StaggerText text="Bienvenido" delay={200}
                style={{ display: 'block', fontSize: 28, fontWeight: 900, color: '#f1f5f9', letterSpacing: -0.9 }}/>
            </div>
            <div style={{ overflow: 'hidden' }}>
              <StaggerText text="de nuevo." delay={300}
                style={{ display: 'block', fontSize: 28, fontWeight: 900, letterSpacing: -0.9 }}
                letterStyle={{ background: 'linear-gradient(90deg,#818cf8,#22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}/>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#374151', ...slide(420) }}>
              Accede a tu plataforma de IA conversacional
            </p>
          </div>

          {/* Social proof */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, padding: '11px 15px', background: 'rgba(255,255,255,0.016)', border: '1px solid rgba(255,255,255,0.042)', borderRadius: 12, ...slide(140) }}>
            <div style={{ display: 'flex' }}>
              {AVATARS.map(({ initials, bg }, i) => (
                <div key={i} style={{ width: 26, height: 26, borderRadius: 7, background: bg, border: '2px solid #040710', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white', marginLeft: i === 0 ? 0 : -8, zIndex: 4 - i, position: 'relative' }}>{initials}</div>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#374151', lineHeight: 1.4 }}>
              Más de <span style={{ color: '#cbd5e1', fontWeight: 700 }}>1.200 equipos</span> confían en VozIA
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>

            <div style={slide(180)}>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 7, color: focused === 'email' ? '#818cf8' : '#1e2a40', transition: 'color 0.2s' }}>Correo electrónico</label>
              <AnimatedInput
                id="email" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                placeholder="tu@empresa.com" autoComplete="email" autoFocus
                focused={focused === 'email'}/>
            </div>

            <div style={slide(220)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: focused === 'pass' ? '#818cf8' : '#1e2a40', transition: 'color 0.2s' }}>Contraseña</label>
                <span style={{ fontSize: 12, color: '#1a2235', cursor: 'pointer', transition: 'color 0.2s' }}
                  onMouseEnter={e => e.target.style.color = '#22d3ee'} onMouseLeave={e => e.target.style.color = '#1a2235'}>¿La olvidaste?</span>
              </div>
              <div style={{ position: 'relative' }}>
                <AnimatedInput
                  id="pass" type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused('pass')} onBlur={() => setFocused(null)}
                  placeholder="••••••••" autoComplete="current-password"
                  focused={focused === 'pass'} right={42}/>
                <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 3, cursor: 'pointer', color: '#1a2235', display: 'flex', transition: 'color 0.2s', zIndex: 3 }}
                  onMouseEnter={e => e.currentTarget.style.color = '#818cf8'} onMouseLeave={e => e.currentTarget.style.color = '#1a2235'}>
                  {showPass ? <RiEyeOffLine size={15}/> : <RiEyeLine size={15}/>}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10, padding: '10px 14px' }}>
                <span style={{ color: '#f87171', fontSize: 13, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>✕</span>
                <p style={{ margin: 0, fontSize: 12.5, color: '#fca5a5', lineHeight: 1.45 }}>{error}</p>
              </div>
            )}

            <div style={slide(260)}>
              <button type="submit" disabled={loading} className="login-btn"
                style={{ width: '100%', padding: '13px 0', borderRadius: 11, border: 'none', background: loading ? 'rgba(79,70,229,0.22)' : 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)', color: '#fff', fontSize: 14.5, fontWeight: 700, cursor: loading ? 'default' : 'pointer', boxShadow: loading ? 'none' : '0 4px 24px rgba(79,70,229,0.3),0 1px 0 rgba(255,255,255,0.12) inset', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.22s', position: 'relative', overflow: 'hidden' }}>
                {!loading && <div className="btn-shimmer"/>}
                {loading ? <><Spinner/>Verificando...</> : <><span>Entrar a VozIA</span><RiArrowRightLine size={16}/></>}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0', ...slide(300) }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.032)' }}/>
              <span style={{ fontSize: 11, color: '#0e1522' }}>acceso seguro</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.032)' }}/>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, ...slide(340) }}>
              {[{ I: RiShieldCheckLine, l: 'SSL 256-bit' }, { I: RiCheckLine, l: 'SOC 2' }, { I: RiFlashlightLine, l: 'GDPR' }].map(({ I, l }) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#111a28' }}>
                  <I style={{ width: 11, height: 11, color: '#1a2438' }}/>{l}
                </span>
              ))}
            </div>
          </form>

          <p style={{ marginTop: 28, fontSize: 11.5, color: '#0c1220', textAlign: 'center', lineHeight: 1.6, ...slide(380) }}>
            Al acceder aceptas los{' '}
            <span style={{ color: '#1a2438', cursor: 'pointer', transition: 'color 0.2s' }}
              onMouseEnter={e => e.target.style.color = '#4b5563'} onMouseLeave={e => e.target.style.color = '#1a2438'}>Términos</span>
            {' '}y la{' '}
            <span style={{ color: '#1a2438', cursor: 'pointer', transition: 'color 0.2s' }}
              onMouseEnter={e => e.target.style.color = '#4b5563'} onMouseLeave={e => e.target.style.color = '#1a2438'}>Privacidad</span>
          </p>
        </div>
      </div>

      {/* Global styles */}
      <style>{`
        @property --border-angle {
          syntax: '<angle>';
          initial-value: 0turn;
          inherits: false;
        }
        @keyframes blink        { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes spin         { to{transform:rotate(360deg)} }
        @keyframes cur          { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes gradientFlow { 0%{background-position:0% center} 100%{background-position:200% center} }
        @keyframes ticker       { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes shimmer      { 0%{transform:translateX(-130%) skewX(-18deg)} 100%{transform:translateX(330%) skewX(-18deg)} }
        @keyframes border-spin  { to{--border-angle:1turn} }
        @keyframes sweep        { 0%{left:-20%;opacity:0.6} 100%{left:120%;opacity:0} }

        .sweep-line {
          position: absolute; top: 0; bottom: 0; width: 18%;
          background: linear-gradient(90deg,transparent,rgba(99,102,241,0.04) 50%,transparent);
          animation: sweep 1.6s cubic-bezier(0.4,0,0.2,1) 0.1s forwards;
          pointer-events: none; z-index: 10;
        }
        .btn-shimmer {
          position:absolute; inset:0;
          background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.1) 50%,transparent 100%);
          animation:shimmer 2.8s ease-in-out infinite;
          pointer-events:none;
        }
        .login-btn:hover:not(:disabled) {
          transform:translateY(-1px)!important;
          box-shadow:0 7px 28px rgba(79,70,229,0.45),0 0 0 1px rgba(34,211,238,0.15),0 1px 0 rgba(255,255,255,0.14) inset!important;
        }
        .login-btn:active:not(:disabled) { transform:translateY(0)!important; }
        input::placeholder { color:#0f1828; }
        input:-webkit-autofill {
          -webkit-box-shadow:0 0 0 100px #05070f inset!important;
          -webkit-text-fill-color:#f1f5f9!important;
          caret-color:#f1f5f9;
        }

        @media (max-width: 900px) {
          .login-left { display: none !important; }
          .login-right { flex: 1 1 auto !important; padding: 32px 20px !important; }
        }
        @media (max-width: 420px) {
          .login-right { padding: 24px 14px !important; }
        }
      `}</style>
    </div>
  )
}

function Spinner() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ animation: 'spin 0.65s linear infinite', flexShrink: 0 }}>
      <circle cx="7.5" cy="7.5" r="5.5" stroke="rgba(255,255,255,0.2)" strokeWidth="2"/>
      <path d="M13 7.5a5.5 5.5 0 00-5.5-5.5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}
