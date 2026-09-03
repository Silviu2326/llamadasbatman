import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiSettings4Line, RiUserLine, RiGroupLine, RiShieldLine,
  RiRobot2Line, RiPhoneLine, RiFlowChart, RiFileTextLine,
  RiMailLine, RiBellLine, RiCalendarLine, RiBarChartLine,
  RiDeleteBinLine, RiEditLine, RiSearchLine, RiVipCrownLine,
  RiArrowRightSLine, RiBuilding2Line,
  RiCodeBoxLine, RiDatabase2Line, RiBankCardLine,
  RiKeyLine, RiClipboardLine, RiReceiptLine, RiCheckLine,
  RiLockLine,
} from 'react-icons/ri'
import { HiChevronDown } from 'react-icons/hi'
import '../dashboard.css'
import { apiFetch } from '../lib/api'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import DataStatusBanner from './ui/DataStatusBanner'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../i18n'

// ── Nav structure ─────────────────────────────────────────────────────────────
// ponytail: solo apartados con pantalla real; el resto navega a su página o no existe aún
const NAV = [
  { section: 'GENERAL', items: [
    { id: 'miperfil',   Icon: RiUserLine,       label: 'Mi perfil' },
  ]},
]

const TIMEZONE_OPTIONS = [
  'Europe/Madrid', 'UTC', 'Europe/Paris', 'America/New_York', 'America/Mexico_City',
]
const CURRENCY_OPTIONS = ['EUR', 'USD', 'GBP', 'MXN']
const LOCALE_OPTIONS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
]

const SETTINGS_SECTION_KEYS = {
  GENERAL: 'settings.general', PLATAFORMA: 'settings.platform', 'COMUNICACIÓN': 'settings.communication', SEGURIDAD: 'settings.security', 'FACTURACIÓN': 'settings.billing',
}

const SETTINGS_ITEM_KEYS = {
  perfil: 'settings.companyProfile', miperfil: 'settings.myProfile', usuarios: 'settings.usersTeams', roles: 'settings.rolesPermissions', agentes: 'nav.agents', telefonos: 'settings.phoneNumbers', integ: 'settings.integrations', api: 'settings.apiWebhooks', autos: 'nav.automations', vars: 'settings.variablesFields', objetivos: 'nav.objectives', plantillas: 'settings.messageTemplates', email: 'settings.emailNotifications', recordat: 'settings.reminders', calendarios: 'settings.calendars', seguridad: 'settings.securityAccess', sso: 'settings.ssoAuth', auditoria: 'settings.audit', plan: 'settings.planUsage', factura: 'settings.billingDetails', pagos: 'settings.paymentMethods',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Input({ label, value, placeholder, onChange, disabled, type = 'text' }) {
  return (
    <div>
      {label && <label style={{ display: 'block', fontSize: 11, color: 'var(--dim)', marginBottom: 5, fontWeight: 500 }}>{label}</label>}
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        disabled={disabled}
        onChange={onChange}
        style={{
          width: '100%', boxSizing: 'border-box', background: disabled ? 'var(--bg)' : 'var(--bg)',
          border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px',
          color: disabled ? 'var(--faint)' : 'var(--text)', fontSize: 13, outline: 'none', transition: 'border-color .15s',
          cursor: disabled ? 'not-allowed' : 'text',
        }}
        onFocus={e => !disabled && (e.target.style.borderColor = '#8b5cf660')}
        onBlur={e => (e.target.style.borderColor = 'var(--line)')}
      />
    </div>
  )
}

function Select({ label, value, options = [], onChange, disabled }) {
  return (
    <div>
      {label && <label style={{ display: 'block', fontSize: 11, color: 'var(--dim)', marginBottom: 5, fontWeight: 500 }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <select
          value={value}
          disabled={disabled}
          onChange={onChange}
          style={{ width: '100%', boxSizing: 'border-box', background: disabled ? 'var(--bg)' : 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 32px 9px 12px', color: disabled ? 'var(--faint)' : 'var(--text)', fontSize: 13, appearance: 'none', outline: 'none', cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          {options.map(o => (
            typeof o === 'string'
              ? <option key={o} value={o}>{o}</option>
              : <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <HiChevronDown style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--dim)', width: 14, height: 14, pointerEvents: 'none' }} />
      </div>
    </div>
  )
}

function SectionTitle({ title, divider = true }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</h3>
      {divider && <div style={{ height: 1, background: 'var(--line)', marginTop: 10 }} />}
    </div>
  )
}

function Toggle({ active, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{ width: 44, height: 24, borderRadius: 12, background: active ? 'var(--violet)' : 'var(--line-2)', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}
    >
      <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', position: 'absolute', top: 2, left: active ? 22 : 2, transition: 'left .2s', boxShadow: '0 1px 4px #0006' }} />
    </div>
  )
}

// ponytail: sin cuotas — no hay modelo de límites por plan, así que se muestra
// el consumo real en vez de un denominador inventado.
function UsageBar({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function formatCents(value) {
  const cents = Number(value ?? 0)
  return (Number.isFinite(cents) ? cents / 100 : 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Configuracion() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [billingConfig, setBillingConfig] = useState(null)
  const [platformMetrics, setPlatformMetrics] = useState(null)
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingError, setBillingError] = useState('')

  useEffect(() => {
    apiFetch('/api/billing/config').then(r => r.ok ? r.json() : null).then(setBillingConfig).catch(() => {})
    // 403 es normal para roles sin acceso financiero: no se enseña una caja
    // vacía ni se degrada el resto de Configuración.
    apiFetch('/api/outcomes/open-platform?days=30').then(r => r.ok ? r.json() : null).then(setPlatformMetrics).catch(() => {})
  }, [])

  async function startCheckout(plan) {
    setBillingBusy(true)
    setBillingError('')
    try {
      const response = await apiFetch('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.url) throw new Error(body.error || 'No se pudo iniciar el pago')
      window.location.href = body.url
    } catch (error) {
      setBillingError(error.message)
      setBillingBusy(false)
    }
  }

  async function openBillingPortal() {
    setBillingBusy(true)
    setBillingError('')
    try {
      const response = await apiFetch('/api/billing/portal', { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.url) throw new Error(body.error || 'No se pudo abrir el portal')
      window.location.href = body.url
    } catch (error) {
      setBillingError(error.message)
      setBillingBusy(false)
    }
  }

  async function confirmDeleteAccount() {
    setDeleting(true)
    setDeleteError('')
    try {
      const response = await apiFetch('/api/settings/me', { method: 'DELETE', body: JSON.stringify({ password: deletePassword }) })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || 'No se pudo eliminar la cuenta')
      }
      await logout()
      window.location.href = '/login'
    } catch (error) {
      setDeleteError(error.message)
      setDeleting(false)
    }
  }
  const { locale, setLocale, t } = useI18n()
  const isViewer = user?.role === 'viewer'
  const [activeNav, setActiveNav] = useState('miperfil')
  const [stats, setStats] = useState(null)
  const [agentCount, setAgentCount] = useState(null)

  // ── Perfil / preferencias del usuario ──
  const [profile, setProfile] = useState({ name: '', email: '', role: '' })
  const [preference, setPreference] = useState({ locale: 'es', timezone: 'Europe/Madrid', theme: 'system' })

  // ── Organización ──
  const [org, setOrg] = useState({
    name: '', email: '', website: '', phone: '', industry: '', timezone: 'Europe/Madrid', address: '', currency: 'EUR',
  })

  // ── Integraciones ──
  const [integrations, setIntegrations] = useState(null)

  // ── Password ──
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [pwdMessage, setPwdMessage] = useState(null)
  const [pwdSaving, setPwdSaving] = useState(false)

  // ── Save feedback ──
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)

  // ── Estado de la carga inicial ──
  // Sin esto, un fallo dejaba el formulario en blanco y "Guardar" machacaba
  // los datos reales de la organización con cadenas vacías.
  const [meLoaded, setMeLoaded] = useState(false)
  const [orgLoaded, setOrgLoaded] = useState(false)
  const [loadStatus, setLoadStatus] = useState('loading')
  const [loadMessage, setLoadMessage] = useState('')
  const [integrationsFailed, setIntegrationsFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoadStatus('loading')
    setLoadMessage('')
    apiFetch('/api/dashboard/stats').then(r => (r.ok ? r.json() : null)).then(data => { if (data) setStats(data) }).catch(() => {})
    apiFetch('/api/agents').then(r => (r.ok ? r.json() : null)).then(d => {
      setAgentCount(Array.isArray(d) ? d.length : null)
    }).catch(() => {})

    async function loadForm() {
      let gate = null
      let failed = false

      try {
        const res = await apiFetch('/api/settings/me')
        if (!res.ok) { gate = gate || await readPlanGate(res); throw new Error('me') }
        const data = await res.json()
        if (!active) return
        setProfile({ name: data.user?.name ?? '', email: data.user?.email ?? '', role: data.user?.role ?? '' })
        setPreference({
          locale: data.preference?.locale === 'en' ? 'en' : locale,
          timezone: data.preference?.timezone ?? 'Europe/Madrid',
          theme: data.preference?.theme ?? 'system',
        })
        if (data.preference?.locale === 'en' || data.preference?.locale === 'es') setLocale(data.preference.locale)
        setMeLoaded(true)
      } catch { failed = true }

      if (!active) return
      if (!failed) { setLoadStatus(''); setLoadMessage(''); return }
      setLoadStatus(gate ? 'plan' : 'error')
      setLoadMessage(gate
        ? planGateMessage(gate, locale)
        : 'No se pudieron cargar tus datos de configuración. Para no sobrescribirlos con campos vacíos, el guardado queda bloqueado hasta que la carga funcione.')
    }
    loadForm()

    apiFetch('/api/settings/integrations').then(r => (r.ok ? r.json() : null)).then(data => {
      if (!active) return
      if (data) setIntegrations(data)
      else setIntegrationsFailed(true)
    }).catch(() => { if (active) setIntegrationsFailed(true) })
    return () => { active = false }
  }, [reloadKey])

  // El formulario de empresa toca organización + preferencia del usuario, así
  // que necesita que ambas cargas hayan ido bien.
  const formLoaded = meLoaded

  async function handleSave() {
    if (!formLoaded) {
      setSaveMessage('No se guardó nada: los datos actuales no se pudieron cargar y guardar ahora los borraría.')
      return
    }
    setSaving(true)
    setSaveMessage(null)
    try {
      const res = await apiFetch('/api/settings/me', {
        method: 'PUT',
        body: JSON.stringify({ name: profile.name, locale: preference.locale }),
      })
      if (!res.ok) throw new Error('save failed')
      setSaveMessage('Cambios guardados.')
    } catch {
      setSaveMessage('No se pudieron guardar los cambios.')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    setPwdMessage(null)
    if (!pwd.current || !pwd.next || !pwd.confirm) {
      setPwdMessage('Completa todos los campos de contraseña.')
      return
    }
    if (pwd.next !== pwd.confirm) {
      setPwdMessage('La nueva contraseña y su confirmación no coinciden.')
      return
    }
    setPwdSaving(true)
    try {
      const res = await apiFetch('/api/settings/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: pwd.current, newPassword: pwd.next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setPwdMessage(body.error ?? 'No se pudo actualizar la contraseña.')
        return
      }
      setPwdMessage('Contraseña actualizada correctamente.')
      setPwd({ current: '', next: '', confirm: '' })
    } catch {
      setPwdMessage('No se pudo actualizar la contraseña.')
    } finally {
      setPwdSaving(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Page Header ── */}
      <div style={{ padding: '24px 28px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            {t('settings.title')}
            <RiSettings4Line style={{ width: 22, height: 22, color: 'var(--dim)' }} />
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--dim)' }}>{locale === 'en' ? 'Manage your account, security, preferences and plan.' : 'Administra tu cuenta, seguridad, preferencias y plan.'}</p>
        </div>
      </div>

      {/* ── Nav de secciones en móvil ──
          El nav lateral de abajo lleva .panel-desktop y vive dentro del
          .split-pane, así que se oculta por debajo de 900px (style.css). Sin
          este reemplazo la página quedaba sin forma de cambiar de sección. */}
      <div className="section-tabs-mobile" role="tablist" aria-label={t('settings.title')} style={{ display: 'none' }}>
        {NAV.flatMap(section => section.items).map(item => {
          const active = activeNav === item.id
          const Icon = item.Icon
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={active}
              onClick={() => item.to ? navigate(item.to) : setActiveNav(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 12px', border: 'none', background: 'transparent',
                borderBottom: active ? '2px solid var(--violet)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              <Icon style={{ width: 14, height: 14, color: active ? 'var(--violet)' : 'var(--faint)', flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: active ? 'var(--violet-soft)' : 'var(--dim)', fontWeight: active ? 600 : 400 }}>{SETTINGS_ITEM_KEYS[item.id] ? t(SETTINGS_ITEM_KEYS[item.id]) : item.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── 3-column layout ── */}
      <div className="split-pane split-pane--fill">

        {/* ── Config Nav ── */}
        <div className="dark-scroll panel-desktop" style={{ display: 'none' }}>
          {NAV.map(section => (
            <div key={section.section} style={{ marginBottom: 4 }}>
              <p style={{ margin: '16px 16px 6px', fontSize: 10, color: 'var(--dim)', fontWeight: 700, letterSpacing: 0.8 }}>{SETTINGS_SECTION_KEYS[section.section] ? t(SETTINGS_SECTION_KEYS[section.section]) : section.section}</p>
              {section.items.map(item => {
                const active = activeNav === item.id
                const Icon = item.Icon
                return (
                  <button
                    key={item.id}
                    onClick={() => item.to ? navigate(item.to) : setActiveNav(item.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 14px', border: 'none', cursor: 'pointer',
                      background: active ? 'linear-gradient(90deg,#8b5cf622,#8b5cf610)' : 'transparent',
                      borderLeft: active ? '3px solid var(--violet)' : '3px solid transparent',
                      transition: 'all .15s',
                    }}
                    onMouseEnter={e => !active && (e.currentTarget.style.background = 'var(--surface-hover)')}
                    onMouseLeave={e => !active && (e.currentTarget.style.background = 'transparent')}
                  >
                    <Icon style={{ width: 14, height: 14, color: active ? 'var(--violet)' : 'var(--faint)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: active ? 'var(--violet-soft)' : 'var(--dim)', fontWeight: active ? 600 : 400 }}>{SETTINGS_ITEM_KEYS[item.id] ? t(SETTINGS_ITEM_KEYS[item.id]) : item.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* ── Main Form ── */}
        <div className="dark-scroll split-main" style={{ padding: '20px 24px 32px' }}>
          {loadStatus && <DataStatusBanner status={loadStatus} message={loadStatus === 'loading' ? 'Cargando tus datos de configuración…' : loadMessage} onRetry={loadStatus === 'error' ? () => setReloadKey(k => k + 1) : undefined} />}
          {/* Form header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>
                {activeNav === 'miperfil' ? t('settings.myProfile') : t('settings.companyProfile')}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--dim)' }}>
                {activeNav === 'miperfil' ? t('settings.accountPreferences') : t('settings.companyPreferences')}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              <button
                onClick={handleSave}
                disabled={saving || !formLoaded}
                title={!formLoaded ? 'No se pueden guardar cambios hasta que se carguen tus datos actuales.' : undefined}
                style={{
                  background: 'linear-gradient(135deg,var(--accent-deep),var(--violet-deep))', border: 'none', borderRadius: 10, padding: '10px 20px',
                  color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving || !formLoaded ? 'not-allowed' : 'pointer',
                  boxShadow: '0 0 20px #6366f145', opacity: saving || !formLoaded ? 0.6 : 1,
                }}
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
              {saveMessage && <span role="status" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--success)', background: '#10b98115', border: '1px solid #10b98135', borderRadius: 8, padding: '5px 10px' }}>{saveMessage}</span>}
            </div>
          </div>

          {/* ── Mi perfil ── */}
          {activeNav === 'miperfil' && (
            <>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '20px', marginBottom: 16 }}>
                <SectionTitle title="Información personal" />
                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {/* Avatar */}
                  <div style={{ flexShrink: 0, textAlign: 'center' }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent-deep),var(--violet-deep))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#fff', boxShadow: '0 0 24px #6366f145', marginBottom: 6 }}>
                      {profile.name ? profile.name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() : '?'}
                    </div>
                    <p style={{ margin: 0, fontSize: 9.5, color: 'var(--dim)' }}>Iniciales de tu nombre</p>
                  </div>
                  {/* Fields */}
                  <div style={{ flex: '1 1 220px', minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(200px,100%),1fr))', gap: 14 }}>
                    <Input label="Nombre completo" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
                    <Input label="Email" value={profile.email} disabled />
                    <Input label="Rol" value={profile.role} disabled />
                    <Select
                      label={t('common.language')}
                      value={locale}
                      options={LOCALE_OPTIONS}
                      onChange={e => { setLocale(e.target.value); setPreference(p => ({ ...p, locale: e.target.value })) }}
                    />
                  </div>
                </div>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '20px', marginBottom: 16 }}>
                <SectionTitle title="Seguridad" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Input
                    label="Contraseña actual" placeholder="••••••••" type="password"
                    value={pwd.current} onChange={e => setPwd(p => ({ ...p, current: e.target.value }))}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(200px,100%),1fr))', gap: 14 }}>
                    <Input
                      label="Nueva contraseña" placeholder="••••••••" type="password"
                      value={pwd.next} onChange={e => setPwd(p => ({ ...p, next: e.target.value }))}
                    />
                    <Input
                      label="Confirmar contraseña" placeholder="••••••••" type="password"
                      value={pwd.confirm} onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      onClick={handleChangePassword}
                      disabled={pwdSaving}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--line)',
                        borderRadius: 9, padding: '8px 14px', color: 'var(--violet-soft)', fontSize: 12.5, fontWeight: 600,
                        cursor: pwdSaving ? 'not-allowed' : 'pointer', opacity: pwdSaving ? 0.6 : 1,
                      }}
                    >
                      <RiLockLine style={{ width: 13, height: 13 }} />
                      {pwdSaving ? 'Actualizando…' : 'Actualizar contraseña'}
                    </button>
                    {pwdMessage && <span role="status" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--success)', background: '#10b98115', border: '1px solid #10b98135', borderRadius: 8, padding: '5px 10px' }}>{pwdMessage}</span>}
                  </div>
                </div>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '20px' }}>
                <SectionTitle title="Sesión activa" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: '#10b98120', border: '1px solid #10b98130', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RiCheckLine style={{ width: 16, height: 16, color: 'var(--success)' }} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Sesión activa</p>
                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--dim)' }}>Conectado como <strong style={{ color: 'var(--accent-soft)' }}>{user?.email}</strong></p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Perfil empresa (solo si no es mi perfil) ── */}
          {activeNav !== 'miperfil' && <>
          {isViewer && (
            <div style={{ background: '#f59e0b15', border: '1px solid #f59e0b40', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <RiShieldLine style={{ width: 16, height: 16, color: 'var(--warn-soft)', flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--warn-soft)' }}>Tu rol (viewer) es de solo lectura: no puedes modificar la organización ni las integraciones.</p>
            </div>
          )}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '20px', marginBottom: 16 }}>
            <SectionTitle title="Información de la empresa" />
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {/* Logo upload */}
              <div style={{ flexShrink: 0, textAlign: 'center' }}>
                <div style={{ width: 80, height: 80, borderRadius: 14, background: 'linear-gradient(135deg,var(--accent-deep),var(--violet-deep))', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 24px #6366f145', marginBottom: 6 }}>
                  <svg width="54" height="36" viewBox="0 0 54 36" fill="none">
                    <polyline points="0,18 7,4 14,32 21,8 28,26 35,12 42,22 49,18" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                </div>
                <p style={{ margin: 0, fontSize: 9.5, color: 'var(--dim)', maxWidth: 82, lineHeight: 1.4 }}>Logo de Vendrava</p>
              </div>
              {/* Fields */}
              <div style={{ flex: '1 1 220px', minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(200px,100%),1fr))', gap: 14 }}>
                <Input label="Nombre de la empresa" value={org.name} disabled={isViewer} onChange={e => setOrg(o => ({ ...o, name: e.target.value }))} />
                <Input label="Email de la empresa" value={org.email} disabled={isViewer} onChange={e => setOrg(o => ({ ...o, email: e.target.value }))} />
                <Input label="Sitio web" value={org.website} disabled={isViewer} onChange={e => setOrg(o => ({ ...o, website: e.target.value }))} />
                <Input label="Teléfono" value={org.phone} disabled={isViewer} onChange={e => setOrg(o => ({ ...o, phone: e.target.value }))} />
                <Input label="Industria" value={org.industry} disabled={isViewer} onChange={e => setOrg(o => ({ ...o, industry: e.target.value }))} />
                <Select
                  label="Zona horaria" value={org.timezone} options={TIMEZONE_OPTIONS} disabled={isViewer}
                  onChange={e => setOrg(o => ({ ...o, timezone: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* ── Dirección ── */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '20px', marginBottom: 16 }}>
            <SectionTitle title="Dirección" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input label="Dirección" value={org.address} disabled={isViewer} onChange={e => setOrg(o => ({ ...o, address: e.target.value }))} />
            </div>
          </div>

          {/* ── Preferencias + Moneda ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(200px,100%),1fr))', gap: 16, marginBottom: 16 }}>
            {/* Preferencias regionales */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '20px' }}>
              <SectionTitle title="Preferencias regionales" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Select
                  label={t('common.language')} value={locale} options={LOCALE_OPTIONS}
                  onChange={e => { setLocale(e.target.value); setPreference(p => ({ ...p, locale: e.target.value })) }}
                />
              </div>
            </div>

            {/* Moneda y números */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '20px' }}>
              <SectionTitle title="Moneda y números" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Select
                  label="Moneda" value={org.currency} options={CURRENCY_OPTIONS} disabled={isViewer}
                  onChange={e => setOrg(o => ({ ...o, currency: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* ── Ajustes adicionales ── */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '20px' }}>
            <SectionTitle title="Ajustes adicionales" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

              {/* Nombre corto */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: '#6366f125', border: '1px solid #6366f135', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <RiBuilding2Line style={{ width: 16, height: 16, color: 'var(--accent-soft)' }} />
                  </div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>Nombre corto de la empresa</p>
                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--dim)' }}>Se mostrará en la plataforma y comunicaciones.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{org.name || '—'}</span>
                </div>
              </div>

              {/* Eliminación de la cuenta */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 0' }}>
                <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: '#ef444420', border: '1px solid #ef444435', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <RiDeleteBinLine style={{ width: 16, height: 16, color: 'var(--danger-soft)' }} />
                  </div>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>Eliminación de la cuenta</p>
                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--dim)' }}>Permanente e irreversible. Todos los datos serán eliminados.</p>
                  </div>
                </div>
                <button onClick={() => { setShowDeleteModal(true); setDeletePassword(''); setDeleteError('') }} style={{ background: '#ef444420', border: '1px solid #ef444445', borderRadius: 9, padding: '8px 16px', color: 'var(--danger-soft)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                  Eliminar cuenta
                </button>
              </div>

            </div>
          </div></>}
        </div>

        {/* ── Right Panel ── */}
        <div className="dark-scroll split-rail" style={{ '--rail-width': '290px', padding: '20px 18px' }}>

          {/* Tu plan actual */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Tu plan actual</p>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#7c3aed55,#7c3aed25)', border: '1px solid #7c3aed50', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <RiVipCrownLine style={{ width: 18, height: 18, color: 'var(--violet)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)', textTransform: 'capitalize' }}>{stats?.orgPlan ?? integrations?.plan ?? 'free'}</span>
                    <span style={{ fontSize: 10.5, background: '#10b98120', color: 'var(--success)', border: '1px solid #10b98140', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>Activo</span>
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => setShowPlanModal(true)} style={{ width: '100%', background: 'linear-gradient(135deg,var(--accent-deep),var(--violet-deep))', border: 'none', borderRadius: 10, padding: '10px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 0 20px #6366f145' }}>
              Gestionar plan
            </button>
          </div>

          {/* Uso del plan */}
          <div style={{ marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Uso del plan</p>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 10.5, color: 'var(--dim)' }}>Acumulado total</p>
            {[
              { label: 'Llamadas realizadas', value: stats ? String(stats.totalCalls ?? 0) : '—' },
              { label: 'Agentes IA', value: agentCount !== null ? String(agentCount) : '—' },
              { label: 'Usuarios', value: stats?.userCount != null ? String(stats.userCount) : '—' },
            ].map(u => <UsageBar key={u.label} {...u} />)}
          </div>

          {/* Integraciones activas — GET /api/settings/integrations */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Integraciones</p>
              <button type="button" onClick={() => navigate('/integraciones')} style={{ border: 0, padding: 0, background: 'transparent', color: 'var(--accent-soft)', fontSize: 11.5, fontWeight: 650, cursor: 'pointer' }}>Gestionar todas</button>
            </div>
            {!integrations && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 12.5, color: integrationsFailed ? 'var(--warn-soft)' : 'var(--faint)' }}>{integrationsFailed ? 'No se pudo comprobar el estado de tus integraciones.' : 'Sin integraciones conectadas todavía.'}</p>
              </div>
            )}
            {integrations && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '4px 16px' }}>
                {[
                  { key: 'mautic', label: 'Mautic' },
                  { key: 'metricool', label: 'Metricool' },
                ].map(({ key, label }, i, arr) => {
                  const info = integrations[key] ?? { enabled: false, connected: false }
                  const status = !info.enabled ? 'Desactivado' : info.connected ? 'Conectado' : 'Sin conectar'
                  const color = !info.enabled ? 'var(--faint)' : info.connected ? 'var(--success)' : 'var(--warn)'
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none' }}>
                      <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
                      <span style={{ fontSize: 11, color, background: `color-mix(in srgb, ${color} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`, borderRadius: 5, padding: '2px 8px', fontWeight: 600 }}>{status}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Centro de ayuda */}
          <div>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Centro de ayuda</p>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
              {[
                { Icon: RiGroupLine, iconBg: 'var(--success)', title: 'Soporte', sub: 'soporte@vendrava.app' },
              ].map((h, i, arr) => (
                <button
                  key={i}
                  onClick={() => { window.location.href = 'mailto:soporte@vendrava.app' }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: 'none', borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none', background: 'transparent', cursor: 'pointer', transition: 'background .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: `color-mix(in srgb, ${h.iconBg} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${h.iconBg} 25%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <h.Icon style={{ width: 14, height: 14, color: h.iconBg }} />
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <p style={{ margin: '0 0 1px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{h.title}</p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--dim)' }}>{h.sub}</p>
                  </div>
                  <RiArrowRightSLine style={{ width: 15, height: 15, color: 'var(--dim)' }} />
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {showDeleteModal && (
        <div className="app-modal-backdrop" onClick={() => !deleting && setShowDeleteModal(false)} style={{ zIndex: 100, background: 'var(--scrim)' }}>
          <div className="app-modal-card dark-scroll" onClick={e => e.stopPropagation()} style={{ '--modal-width': '400px', background: 'var(--surface)', border: '1px solid #ef444440', borderRadius: 14, padding: '24px', boxShadow: 'var(--shadow-2)' }}>
            <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--danger-soft)' }}>Eliminar cuenta</p>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              Esta acción es permanente: tu usuario quedará anonimizado y perderás el acceso inmediatamente.
              Confirma con tu contraseña.
            </p>
            <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} placeholder="Tu contraseña" autoFocus style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', marginBottom: 12 }} />
            {deleteError && <p style={{ margin: '0 0 12px', color: 'var(--danger-soft)', fontSize: 12 }} role="alert">{deleteError}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={() => setShowDeleteModal(false)} disabled={deleting} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmDeleteAccount} disabled={!deletePassword || deleting} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid #ef444445', background: '#ef444420', color: 'var(--danger-soft)', fontSize: 13, fontWeight: 700, cursor: !deletePassword || deleting ? 'not-allowed' : 'pointer', opacity: !deletePassword || deleting ? 0.6 : 1 }}>{deleting ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
            </div>
          </div>
        </div>
      )}

      {showPlanModal && (
        <div className="app-modal-backdrop" onClick={() => setShowPlanModal(false)} style={{ zIndex: 100, background: 'var(--scrim)' }}>
          <div className="app-modal-card dark-scroll" onClick={e => e.stopPropagation()} style={{ '--modal-width': '400px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '24px', boxShadow: 'var(--shadow-2)' }}>
            <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>Tu plan</p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>
              Plan actual: <b style={{ color: 'var(--text-strong)', textTransform: 'capitalize' }}>{stats?.orgPlan ?? integrations?.plan ?? 'free'}</b>
            </p>
            {platformMetrics && <section style={{ margin: '0 0 18px', padding: 14, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)' }}>
              <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)' }}>Plataforma abierta · últimos 30 días</p>
              <UsageBar label="Facturado por consumo" value={formatCents(platformMetrics.margin?.totals?.priceCents)} />
              <UsageBar label="Coste de proveedores" value={formatCents(platformMetrics.margin?.totals?.costCents)} />
              <UsageBar label="Margen de consumo" value={formatCents(platformMetrics.margin?.totals?.marginCents)} />
              <UsageBar label="Ahorro estimado por routing" value={formatCents(platformMetrics.routing?.savingsCents)} />
              <UsageBar label="Microapps esta semana" value={String(platformMetrics.microapps?.weeklyRuns ?? 0)} />
              <UsageBar label="Flows con ≥2 capacidades" value={`${Number(platformMetrics.flows?.percentage ?? 0).toFixed(1)} %`} />
              {platformMetrics.margin?.byProvider?.length > 0 && <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--dim)' }}>
                Por proveedor: {platformMetrics.margin.byProvider.map(row => `${row.provider} ${formatCents(row.marginCents)}`).join(' · ')}
              </p>}
            </section>}
            {billingConfig?.enabled ? (
              <>
                <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.5 }}>
                  El pago se gestiona con Stripe. Puedes cambiar de plan o administrar tu suscripción, método de pago y facturas.
                </p>
                {billingError && <p style={{ margin: '0 0 12px', color: 'var(--danger-soft)', fontSize: 12 }} role="alert">{billingError}</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {(billingConfig.plans || []).map(plan => (
                    <button key={plan} onClick={() => startCheckout(plan)} disabled={billingBusy || (stats?.orgPlan ?? 'free') === plan} style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid #4f46e550', background: '#4f46e520', color: 'var(--violet)', fontSize: 13, fontWeight: 700, cursor: billingBusy || (stats?.orgPlan ?? 'free') === plan ? 'not-allowed' : 'pointer', textTransform: 'capitalize', opacity: billingBusy ? 0.6 : 1 }}>
                      {(stats?.orgPlan ?? 'free') === plan ? `Plan ${plan} (actual)` : `Cambiar a ${plan}`}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowPlanModal(false)} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>Cerrar</button>
                  <button onClick={openBillingPortal} disabled={billingBusy} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,var(--accent-deep),var(--violet-deep))', color: '#fff', fontSize: 13, fontWeight: 700, cursor: billingBusy ? 'not-allowed' : 'pointer', opacity: billingBusy ? 0.6 : 1 }}>{billingBusy ? 'Abriendo…' : 'Gestionar suscripción'}</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--dim)', lineHeight: 1.5 }}>
                  El pago autogestionado se activa al configurar Stripe en el servidor. Mientras tanto, escribe al equipo para cambiar de plan o ampliar límites.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowPlanModal(false)} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>Cerrar</button>
                  <button onClick={() => { window.location.href = 'mailto:soporte@vendrava.app?subject=Cambio%20de%20plan' }} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,var(--accent-deep),var(--violet-deep))', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Contactar para cambiar de plan</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
