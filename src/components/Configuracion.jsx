import { useState } from 'react'
import {
  RiSettings4Line, RiUserLine, RiGroupLine, RiShieldLine,
  RiRobot2Line, RiPhoneLine, RiFlowChart, RiFileTextLine,
  RiMailLine, RiBellLine, RiCalendarLine, RiBarChartLine,
  RiDeleteBinLine, RiEditLine, RiSearchLine, RiVipCrownLine,
  RiArrowRightSLine, RiGlobalLine, RiBuilding2Line,
  RiCodeBoxLine, RiDatabase2Line, RiBankCardLine,
  RiKeyLine, RiClipboardLine, RiReceiptLine,
} from 'react-icons/ri'
import { HiChevronDown, HiArrowRight } from 'react-icons/hi'
import '../dashboard.css'

// ── Nav structure ─────────────────────────────────────────────────────────────
const NAV = [
  { section: 'GENERAL', items: [
    { id: 'perfil',     Icon: RiBuilding2Line,  label: 'Perfil de la empresa' },
    { id: 'miperfil',   Icon: RiUserLine,       label: 'Mi perfil' },
    { id: 'usuarios',   Icon: RiGroupLine,      label: 'Usuarios y equipos' },
    { id: 'roles',      Icon: RiShieldLine,     label: 'Roles y permisos' },
  ]},
  { section: 'PLATAFORMA', items: [
    { id: 'agentes',    Icon: RiRobot2Line,     label: 'Agentes IA' },
    { id: 'telefonos',  Icon: RiPhoneLine,      label: 'Números de teléfono' },
    { id: 'integ',      Icon: RiDatabase2Line,  label: 'Integraciones' },
    { id: 'api',        Icon: RiCodeBoxLine,    label: 'API y webhooks' },
    { id: 'autos',      Icon: RiFlowChart,      label: 'Automatizaciones' },
    { id: 'vars',       Icon: RiFileTextLine,   label: 'Variables y campos' },
    { id: 'objetivos',  Icon: RiBarChartLine,   label: 'Objetivos' },
  ]},
  { section: 'COMUNICACIÓN', items: [
    { id: 'plantillas', Icon: RiFileTextLine,   label: 'Plantillas de mensaje' },
    { id: 'email',      Icon: RiMailLine,       label: 'Email y notificaciones' },
    { id: 'recordat',   Icon: RiBellLine,       label: 'Recordatorios' },
    { id: 'calendarios',Icon: RiCalendarLine,   label: 'Calendarios' },
  ]},
  { section: 'SEGURIDAD', items: [
    { id: 'seguridad',  Icon: RiShieldLine,     label: 'Seguridad y acceso' },
    { id: 'sso',        Icon: RiKeyLine,        label: 'SSO y autenticación' },
    { id: 'auditoria',  Icon: RiClipboardLine,  label: 'Auditoría' },
  ]},
  { section: 'FACTURACIÓN', items: [
    { id: 'plan',       Icon: RiBankCardLine, label: 'Plan y uso' },
    { id: 'factura',    Icon: RiReceiptLine,    label: 'Facturación' },
    { id: 'pagos',      Icon: RiBankCardLine, label: 'Métodos de pago' },
  ]},
]

const INTEGRATIONS = [
  { name: 'HubSpot',         bg: '#ff7a59', initials: 'Hs', status: 'Conectado',   statusColor: '#10b981', statusBg: '#10b98115' },
  { name: 'Salesforce',      bg: '#00a1e0', initials: 'Sf', status: 'Conectado',   statusColor: '#10b981', statusBg: '#10b98115' },
  { name: 'Google Calendar', bg: '#4285f4', initials: 'GC', status: 'Conectado',   statusColor: '#10b981', statusBg: '#10b98115' },
  { name: 'Slack',           bg: '#4a154b', initials: 'Sk', status: 'Conectado',   statusColor: '#10b981', statusBg: '#10b98115' },
  { name: 'Make',            bg: '#6b1fff', initials: 'Mk', status: 'Advertencia', statusColor: '#f59e0b', statusBg: '#f59e0b15' },
]

const USAGE = [
  { label: 'Créditos de voz',     value: '82.500', max: '100.000', pct: 82.5, color: 'linear-gradient(90deg,#4f46e5,#7c3aed)' },
  { label: 'Minutos de llamadas', value: '1.250',  max: '2.000',   pct: 62.5, color: 'linear-gradient(90deg,#06b6d4,#0ea5e9)' },
  { label: 'Agentes IA',          value: '12',     max: '20',      pct: 60,   color: 'linear-gradient(90deg,#10b981,#34d399)' },
  { label: 'Usuarios',            value: '18',     max: '25',      pct: 72,   color: 'linear-gradient(90deg,#f59e0b,#fbbf24)' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function Input({ label, value, placeholder }) {
  return (
    <div>
      {label && <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 5, fontWeight: 500 }}>{label}</label>}
      <input
        defaultValue={value}
        placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', background: '#080c14', border: '1px solid #1e2433', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', transition: 'border-color .15s' }}
        onFocus={e => (e.target.style.borderColor = '#8b5cf660')}
        onBlur={e => (e.target.style.borderColor = '#1e2433')}
      />
    </div>
  )
}

function Select({ label, value, options = [] }) {
  return (
    <div>
      {label && <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 5, fontWeight: 500 }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <select
          defaultValue={value}
          style={{ width: '100%', boxSizing: 'border-box', background: '#080c14', border: '1px solid #1e2433', borderRadius: 8, padding: '9px 32px 9px 12px', color: '#e2e8f0', fontSize: 13, appearance: 'none', outline: 'none', cursor: 'pointer' }}
        >
          <option>{value}</option>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
        <HiChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', width: 14, height: 14, pointerEvents: 'none' }} />
      </div>
    </div>
  )
}

function SectionTitle({ title, divider = true }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{title}</h3>
      {divider && <div style={{ height: 1, background: '#1e2433', marginTop: 10 }} />}
    </div>
  )
}

function Toggle({ active, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{ width: 44, height: 24, borderRadius: 12, background: active ? '#8b5cf6' : '#374151', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}
    >
      <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', position: 'absolute', top: 2, left: active ? 22 : 2, transition: 'left .2s', boxShadow: '0 1px 4px #0006' }} />
    </div>
  )
}

function UsageBar({ label, value, max, pct, color }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{label}</span>
        <span style={{ fontSize: 11.5, color: '#e2e8f0', fontWeight: 600 }}>{value} / {max}</span>
      </div>
      <div style={{ height: 5, background: '#1e2433', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 1s ease' }} />
      </div>
      <div style={{ textAlign: 'right', marginTop: 3 }}>
        <span style={{ fontSize: 10, color: '#4b5563' }}>{pct}%</span>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Configuracion() {
  const [activeNav, setActiveNav] = useState('perfil')
  const [showDecimals, setShowDecimals] = useState(true)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Page Header ── */}
      <div style={{ padding: '24px 28px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#f1f5f9', letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            Configuración
            <RiSettings4Line style={{ width: 22, height: 22, color: '#6b7280' }} />
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#6b7280' }}>Administra tu cuenta, personaliza la plataforma y configura las preferencias de tu equipo.</p>
        </div>
        {/* Search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <RiSearchLine style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#4b5563', width: 14, height: 14 }} />
          <input
            placeholder="Buscar en configuración..."
            style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10, padding: '9px 48px 9px 34px', color: '#9ca3af', fontSize: 13, outline: 'none', width: 250 }}
          />
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, color: '#4b5563', background: '#1e2433', borderRadius: 4, padding: '2px 5px', fontFamily: 'monospace' }}>⌘K</span>
        </div>
      </div>

      {/* ── 3-column layout ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Config Nav ── */}
        <div className="dark-scroll" style={{ width: 195, flexShrink: 0, borderRight: '1px solid #1e2433', overflowY: 'auto', padding: '8px 0 20px' }}>
          {NAV.map(section => (
            <div key={section.section} style={{ marginBottom: 4 }}>
              <p style={{ margin: '16px 16px 6px', fontSize: 10, color: '#374151', fontWeight: 700, letterSpacing: 0.8 }}>{section.section}</p>
              {section.items.map(item => {
                const active = activeNav === item.id
                const Icon = item.Icon
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveNav(item.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 14px', border: 'none', cursor: 'pointer',
                      background: active ? 'linear-gradient(90deg,#8b5cf622,#8b5cf610)' : 'transparent',
                      borderLeft: active ? '3px solid #8b5cf6' : '3px solid transparent',
                      transition: 'all .15s',
                    }}
                    onMouseEnter={e => !active && (e.currentTarget.style.background = '#ffffff08')}
                    onMouseLeave={e => !active && (e.currentTarget.style.background = 'transparent')}
                  >
                    <Icon style={{ width: 14, height: 14, color: active ? '#a78bfa' : '#4b5563', flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: active ? '#c4b5fd' : '#6b7280', fontWeight: active ? 600 : 400 }}>{item.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* ── Main Form ── */}
        <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 32px' }}>
          {/* Form header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Perfil de la empresa</h2>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#6b7280' }}>Actualiza la información general de tu empresa y preferencias regionales.</p>
            </div>
            <button style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 0 20px #6366f145', flexShrink: 0 }}>
              Guardar cambios
            </button>
          </div>

          {/* ── Información de la empresa ── */}
          <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '20px', marginBottom: 16 }}>
            <SectionTitle title="Información de la empresa" />
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              {/* Logo upload */}
              <div style={{ flexShrink: 0, textAlign: 'center' }}>
                <div style={{ width: 80, height: 80, borderRadius: 14, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 24px #6366f145', marginBottom: 6 }}>
                  <svg width="54" height="36" viewBox="0 0 54 36" fill="none">
                    <polyline points="0,18 7,4 14,32 21,8 28,26 35,12 42,22 49,18" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                  <div style={{ position: 'absolute', bottom: -6, right: -6, width: 22, height: 22, borderRadius: 6, background: '#1e2433', border: '1px solid #2a3245', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <RiEditLine style={{ width: 11, height: 11, color: '#9ca3af' }} />
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 9.5, color: '#374151', maxWidth: 82, lineHeight: 1.4 }}>JPG, PNG o SVG. Máx. 2MB</p>
              </div>
              {/* Fields */}
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Input label="Nombre de la empresa" value="Acme Solutions" />
                <Input label="Email de la empresa" value="info@acmesolutions.com" />
                <Input label="Sitio web" value="https://acmesolutions.com" />
                <Input label="Teléfono" value="+34 600 123 456" />
                <Select label="Industria" value="Tecnología" options={['Salud','Finanzas','Retail','Educación','Otro']} />
                <Select label="Zona horaria" value="(GMT+02:00) Madrid, España" options={['(GMT+00:00) UTC','(GMT+01:00) París','(GMT-05:00) Nueva York']} />
              </div>
            </div>
          </div>

          {/* ── Dirección ── */}
          <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '20px', marginBottom: 16 }}>
            <SectionTitle title="Dirección" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input label="Dirección" value="Calle de Velázquez 10, 1ºD" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <Input label="Ciudad" value="Madrid" />
                <Input label="Código postal" value="28001" />
                <Select label="País" value="España" options={['Francia','Alemania','Italia','Portugal','México']} />
              </div>
            </div>
          </div>

          {/* ── Preferencias + Moneda ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Preferencias regionales */}
            <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '20px' }}>
              <SectionTitle title="Preferencias regionales" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Select label="Idioma" value="Español" options={['English','Français','Deutsch','Português']} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Select label="Formato de fecha" value="DD/MM/YYYY" options={['MM/DD/YYYY','YYYY-MM-DD']} />
                  <Select label="Formato de hora" value="24 horas" options={['12 horas']} />
                </div>
              </div>
            </div>

            {/* Moneda y números */}
            <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '20px' }}>
              <SectionTitle title="Moneda y números" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Select label="Moneda" value="EUR (€)" options={['USD ($)','GBP (£)','MXN ($)']} />
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 5, fontWeight: 500 }}>Formato de número</label>
                  <div style={{ position: 'relative' }}>
                    <select defaultValue="1.234,56" style={{ width: '100%', boxSizing: 'border-box', background: '#080c14', border: '1px solid #1e2433', borderRadius: 8, padding: '9px 70px 9px 12px', color: '#e2e8f0', fontSize: 13, appearance: 'none', outline: 'none', cursor: 'pointer' }}>
                      <option>1.234,56</option>
                      <option>1,234.56</option>
                    </select>
                    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', gap: 0, paddingRight: 4 }}>
                      <button style={{ background: 'transparent', border: 'none', color: '#4b5563', cursor: 'pointer', padding: '0 4px', fontSize: 14 }}>‹</button>
                      <button style={{ background: 'transparent', border: 'none', color: '#4b5563', cursor: 'pointer', padding: '0 4px', fontSize: 14 }}>›</button>
                    </div>
                  </div>
                </div>
                {/* Mostrar decimales toggle */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Mostrar decimales</p>
                      <p style={{ margin: 0, fontSize: 11.5, color: '#4b5563' }}>Mostrar decimales en reportes y métricas</p>
                    </div>
                    <Toggle active={showDecimals} onToggle={() => setShowDecimals(!showDecimals)} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Ajustes adicionales ── */}
          <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '20px' }}>
            <SectionTitle title="Ajustes adicionales" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

              {/* Nombre corto */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #1e2433' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: '#6366f125', border: '1px solid #6366f135', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <RiBuilding2Line style={{ width: 16, height: 16, color: '#818cf8' }} />
                  </div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 13.5, fontWeight: 600, color: '#e2e8f0' }}>Nombre corto de la empresa</p>
                    <p style={{ margin: 0, fontSize: 11.5, color: '#4b5563' }}>Se mostrará en la plataforma y comunicaciones.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>Acme Solutions</span>
                  <button style={{ background: 'transparent', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 4 }}>
                    <RiEditLine style={{ width: 15, height: 15 }} />
                  </button>
                </div>
              </div>

              {/* Dominio personalizado */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #1e2433' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: '#06b6d425', border: '1px solid #06b6d435', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <RiGlobalLine style={{ width: 16, height: 16, color: '#22d3ee' }} />
                  </div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 13.5, fontWeight: 600, color: '#e2e8f0' }}>Dominio personalizado</p>
                    <p style={{ margin: 0, fontSize: 11.5, color: '#4b5563' }}>Usa tu propio dominio en los enlaces y páginas públicas.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>acmesolutions.vozia.ai</span>
                  <span style={{ fontSize: 11, color: '#10b981', background: '#10b98115', border: '1px solid #10b98140', borderRadius: 5, padding: '2px 8px', fontWeight: 600 }}>Conectado</span>
                  <button style={{ background: 'transparent', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 4 }}>
                    <RiArrowRightSLine style={{ width: 15, height: 15 }} />
                  </button>
                </div>
              </div>

              {/* Eliminación de la cuenta */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: '#ef444420', border: '1px solid #ef444435', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <RiDeleteBinLine style={{ width: 16, height: 16, color: '#f87171' }} />
                  </div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 13.5, fontWeight: 600, color: '#e2e8f0' }}>Eliminación de la cuenta</p>
                    <p style={{ margin: 0, fontSize: 11.5, color: '#4b5563' }}>Permanente e irreversible. Todos los datos serán eliminados.</p>
                  </div>
                </div>
                <button style={{ background: '#ef444420', border: '1px solid #ef444445', borderRadius: 9, padding: '8px 16px', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                  Eliminar cuenta
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="dark-scroll" style={{ width: 290, flexShrink: 0, borderLeft: '1px solid #1e2433', overflowY: 'auto', padding: '20px 18px' }}>

          {/* Tu plan actual */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13.5, fontWeight: 700, color: '#e2e8f0' }}>Tu plan actual</p>
            <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#7c3aed55,#7c3aed25)', border: '1px solid #7c3aed50', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <RiVipCrownLine style={{ width: 18, height: 18, color: '#a78bfa' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9' }}>Enterprise</span>
                    <span style={{ fontSize: 10.5, background: '#10b98120', color: '#10b981', border: '1px solid #10b98140', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>Activo</span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#4b5563' }}>Renovación: 18 jun 2024</p>
                </div>
              </div>
            </div>
            <button style={{ width: '100%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: 'none', borderRadius: 10, padding: '10px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 0 20px #6366f145' }}>
              Gestionar plan
            </button>
          </div>

          {/* Uso del plan */}
          <div style={{ marginBottom: 20, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Uso del plan</p>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 10.5, color: '#4b5563' }}>Este mes (12 may - 18 may)</p>
            {USAGE.map((u, i) => <UsageBar key={i} {...u} />)}
          </div>

          {/* Integraciones activas */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Integraciones activas</p>
              <button style={{ background: 'transparent', border: 'none', color: '#8b5cf6', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Ver todas</button>
            </div>
            <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, overflow: 'hidden' }}>
              {INTEGRATIONS.map((integ, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < INTEGRATIONS.length - 1 ? '1px solid #1e2433' : 'none' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: integ.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {integ.initials}
                  </div>
                  <span style={{ flex: 1, fontSize: 12.5, color: '#e2e8f0', fontWeight: 500 }}>{integ.name}</span>
                  <span style={{ fontSize: 11, color: integ.statusColor, background: integ.statusBg, border: `1px solid ${integ.statusColor}40`, borderRadius: 5, padding: '2px 7px', fontWeight: 600 }}>
                    {integ.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Centro de ayuda */}
          <div>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Centro de ayuda</p>
            <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, overflow: 'hidden' }}>
              {[
                { Icon: RiFileTextLine, iconBg: '#6366f1', title: 'Documentación', sub: 'Guías y tutoriales' },
                { Icon: RiGroupLine,    iconBg: '#10b981', title: 'Soporte',        sub: 'Contacta a nuestro equipo' },
                { Icon: RiBellLine,     iconBg: '#f59e0b', title: 'Novedades',      sub: 'Ver últimas actualizaciones' },
              ].map((h, i, arr) => (
                <button
                  key={i}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: 'none', borderBottom: i < arr.length - 1 ? '1px solid #1e2433' : 'none', background: 'transparent', cursor: 'pointer', transition: 'background .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#ffffff06')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: `${h.iconBg}25`, border: `1px solid ${h.iconBg}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <h.Icon style={{ width: 14, height: 14, color: h.iconBg }} />
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <p style={{ margin: '0 0 1px', fontSize: 12.5, fontWeight: 600, color: '#e2e8f0' }}>{h.title}</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>{h.sub}</p>
                  </div>
                  <RiArrowRightSLine style={{ width: 15, height: 15, color: '#4b5563' }} />
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
