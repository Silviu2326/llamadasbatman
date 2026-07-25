import { useState, useEffect } from 'react'
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
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../i18n'

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

// "Créditos de voz" no tiene modelo de billing detrás (no hay tabla de
// créditos ni de plan con límites) — se sacó en vez de inventar un número.
const USAGE = [
  { label: 'Llamadas realizadas', value: '0',  max: '2.000', pct: 0, color: 'linear-gradient(90deg,#06b6d4,#0ea5e9)' },
  { label: 'Agentes IA',          value: '0',  max: '20',    pct: 0, color: 'linear-gradient(90deg,#10b981,#34d399)' },
  { label: 'Usuarios',            value: '0',  max: '25',    pct: 0, color: 'linear-gradient(90deg,#f59e0b,#fbbf24)' },
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
      {label && <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 5, fontWeight: 500 }}>{label}</label>}
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        disabled={disabled}
        onChange={onChange}
        style={{
          width: '100%', boxSizing: 'border-box', background: disabled ? '#05070c' : '#080c14',
          border: '1px solid #1e2433', borderRadius: 8, padding: '9px 12px',
          color: disabled ? '#4b5563' : '#e2e8f0', fontSize: 13, outline: 'none', transition: 'border-color .15s',
          cursor: disabled ? 'not-allowed' : 'text',
        }}
        onFocus={e => !disabled && (e.target.style.borderColor = '#8b5cf660')}
        onBlur={e => (e.target.style.borderColor = '#1e2433')}
      />
    </div>
  )
}

function Select({ label, value, options = [], onChange, disabled }) {
  return (
    <div>
      {label && <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 5, fontWeight: 500 }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <select
          value={value}
          disabled={disabled}
          onChange={onChange}
          style={{ width: '100%', boxSizing: 'border-box', background: disabled ? '#05070c' : '#080c14', border: '1px solid #1e2433', borderRadius: 8, padding: '9px 32px 9px 12px', color: disabled ? '#4b5563' : '#e2e8f0', fontSize: 13, appearance: 'none', outline: 'none', cursor: disabled ? 'not-allowed' : 'pointer' }}
        >
          {options.map(o => (
            typeof o === 'string'
              ? <option key={o} value={o}>{o}</option>
              : <option key={o.value} value={o.value}>{o.label}</option>
          ))}
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
  const { user, logout } = useAuth()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showPlanModal, setShowPlanModal] = useState(false)

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
  const [activeNav, setActiveNav] = useState('perfil')
  const [showDecimals, setShowDecimals] = useState(true)
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

  useEffect(() => {
    apiFetch('/api/dashboard/stats').then(r => r.json()).then(setStats).catch(() => {})
    apiFetch('/api/agents').then(r => r.json()).then(d => {
      setAgentCount(Array.isArray(d) ? d.length : null)
    }).catch(() => {})

    apiFetch('/api/settings/me').then(r => r.ok ? r.json() : null).then(data => {
      if (!data) return
      setProfile({ name: data.user?.name ?? '', email: data.user?.email ?? '', role: data.user?.role ?? '' })
      setPreference({
        locale: data.preference?.locale === 'en' ? 'en' : locale,
        timezone: data.preference?.timezone ?? 'Europe/Madrid',
        theme: data.preference?.theme ?? 'system',
      })
      if (data.preference?.locale === 'en' || data.preference?.locale === 'es') setLocale(data.preference.locale)
    }).catch(() => {})

    apiFetch('/api/settings/organization').then(r => r.ok ? r.json() : null).then(data => {
      if (!data) return
      setOrg({
        name: data.name ?? '',
        email: data.email ?? '',
        website: data.website ?? '',
        phone: data.phone ?? '',
        industry: data.industry ?? '',
        timezone: data.timezone ?? 'Europe/Madrid',
        address: data.address ?? '',
        currency: data.currency ?? 'EUR',
      })
    }).catch(() => {})

    apiFetch('/api/settings/integrations').then(r => r.ok ? r.json() : null).then(data => {
      if (data) setIntegrations(data)
    }).catch(() => {})
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaveMessage(null)
    try {
      if (activeNav === 'miperfil') {
        const res = await apiFetch('/api/settings/me', {
          method: 'PUT',
          body: JSON.stringify({ name: profile.name, locale: preference.locale }),
        })
        if (!res.ok) throw new Error('save failed')
        setSaveMessage('Cambios guardados.')
      } else {
        if (isViewer) {
          setSaveMessage('Tu rol de solo lectura no permite modificar la organización.')
          return
        }
        const [orgRes, meRes] = await Promise.all([
          apiFetch('/api/settings/organization', { method: 'PUT', body: JSON.stringify(org) }),
          apiFetch('/api/settings/me', { method: 'PUT', body: JSON.stringify({ locale: preference.locale }) }),
        ])
        if (!orgRes.ok || !meRes.ok) throw new Error('save failed')
        setSaveMessage('Cambios guardados.')
      }
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
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#f1f5f9', letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            {t('settings.title')}
            <RiSettings4Line style={{ width: 22, height: 22, color: '#6b7280' }} />
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#6b7280' }}>{locale === 'en' ? 'Manage your account, personalize the platform and configure team preferences.' : 'Administra tu cuenta, personaliza la plataforma y configura las preferencias de tu equipo.'}</p>
        </div>
        {/* Search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <RiSearchLine style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#4b5563', width: 14, height: 14 }} />
          <input
            placeholder={locale === 'en' ? 'Search settings…' : 'Buscar en configuración...'}
            style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10, padding: '9px 48px 9px 34px', color: '#9ca3af', fontSize: 13, outline: 'none', width: 250 }}
          />
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, color: '#4b5563', background: '#1e2433', borderRadius: 4, padding: '2px 5px', fontFamily: 'monospace' }}>⌘K</span>
        </div>
      </div>

      {/* ── 3-column layout ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Config Nav ── */}
        <div className="dark-scroll panel-desktop" style={{ width: 195, flexShrink: 0, borderRight: '1px solid #1e2433', overflowY: 'auto', padding: '8px 0 20px' }}>
          {NAV.map(section => (
            <div key={section.section} style={{ marginBottom: 4 }}>
              <p style={{ margin: '16px 16px 6px', fontSize: 10, color: '#374151', fontWeight: 700, letterSpacing: 0.8 }}>{SETTINGS_SECTION_KEYS[section.section] ? t(SETTINGS_SECTION_KEYS[section.section]) : section.section}</p>
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
                    <span style={{ fontSize: 12.5, color: active ? '#c4b5fd' : '#6b7280', fontWeight: active ? 600 : 400 }}>{SETTINGS_ITEM_KEYS[item.id] ? t(SETTINGS_ITEM_KEYS[item.id]) : item.label}</span>
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
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>
                {activeNav === 'miperfil' ? t('settings.myProfile') : t('settings.companyProfile')}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#6b7280' }}>
                {activeNav === 'miperfil' ? t('settings.accountPreferences') : t('settings.companyPreferences')}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              <button
                onClick={handleSave}
                disabled={saving || (activeNav !== 'miperfil' && isViewer)}
                style={{
                  background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, padding: '10px 20px',
                  color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving || (activeNav !== 'miperfil' && isViewer) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 0 20px #6366f145', opacity: saving || (activeNav !== 'miperfil' && isViewer) ? 0.6 : 1,
                }}
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
              {saveMessage && <span style={{ fontSize: 11, color: '#94a3b8' }}>{saveMessage}</span>}
            </div>
          </div>

          {/* ── Mi perfil ── */}
          {activeNav === 'miperfil' && (
            <>
              <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '20px', marginBottom: 16 }}>
                <SectionTitle title="Información personal" />
                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                  {/* Avatar */}
                  <div style={{ flexShrink: 0, textAlign: 'center' }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#fff', boxShadow: '0 0 24px #6366f145', marginBottom: 6 }}>
                      {profile.name ? profile.name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() : '?'}
                    </div>
                    <p style={{ margin: 0, fontSize: 9.5, color: '#374151' }}>Cambiar foto</p>
                  </div>
                  {/* Fields */}
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
                    <Input label="Nombre completo" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
                    <Input label="Email" value={profile.email} disabled />
                    <Input label="Rol" value={profile.role} disabled />
                    <Input label="ID de organización" value={user?.orgId ?? ''} disabled />
                    <Select
                      label={t('common.language')}
                      value={locale}
                      options={LOCALE_OPTIONS}
                      onChange={e => { setLocale(e.target.value); setPreference(p => ({ ...p, locale: e.target.value })) }}
                    />
                  </div>
                </div>
              </div>
              <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '20px', marginBottom: 16 }}>
                <SectionTitle title="Seguridad" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Input
                    label="Contraseña actual" placeholder="••••••••" type="password"
                    value={pwd.current} onChange={e => setPwd(p => ({ ...p, current: e.target.value }))}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
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
                        display: 'flex', alignItems: 'center', gap: 6, background: '#111827', border: '1px solid #1e2433',
                        borderRadius: 9, padding: '8px 14px', color: '#c4b5fd', fontSize: 12.5, fontWeight: 600,
                        cursor: pwdSaving ? 'not-allowed' : 'pointer', opacity: pwdSaving ? 0.6 : 1,
                      }}
                    >
                      <RiLockLine style={{ width: 13, height: 13 }} />
                      {pwdSaving ? 'Actualizando…' : 'Actualizar contraseña'}
                    </button>
                    {pwdMessage && <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{pwdMessage}</span>}
                  </div>
                </div>
              </div>
              <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '20px' }}>
                <SectionTitle title="Sesión activa" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: '#10b98120', border: '1px solid #10b98130', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RiCheckLine style={{ width: 16, height: 16, color: '#34d399' }} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Sesión activa</p>
                    <p style={{ margin: 0, fontSize: 11.5, color: '#4b5563' }}>Conectado como <strong style={{ color: '#818cf8' }}>{user?.email}</strong></p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Perfil empresa (solo si no es mi perfil) ── */}
          {activeNav !== 'miperfil' && <>
          {isViewer && (
            <div style={{ background: '#f59e0b15', border: '1px solid #f59e0b40', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <RiShieldLine style={{ width: 16, height: 16, color: '#fbbf24', flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 12.5, color: '#fbbf24' }}>Tu rol (viewer) es de solo lectura: no puedes modificar la organización ni las integraciones.</p>
            </div>
          )}
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
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
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
          <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '20px', marginBottom: 16 }}>
            <SectionTitle title="Dirección" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input label="Dirección" value={org.address} disabled={isViewer} onChange={e => setOrg(o => ({ ...o, address: e.target.value }))} />
            </div>
          </div>

          {/* ── Preferencias + Moneda ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16, marginBottom: 16 }}>
            {/* Preferencias regionales */}
            <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '20px' }}>
              <SectionTitle title="Preferencias regionales" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Select
                  label={t('common.language')} value={locale} options={LOCALE_OPTIONS}
                  onChange={e => { setLocale(e.target.value); setPreference(p => ({ ...p, locale: e.target.value })) }}
                />
              </div>
            </div>

            {/* Moneda y números */}
            <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '20px' }}>
              <SectionTitle title="Moneda y números" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Select
                  label="Moneda" value={org.currency} options={CURRENCY_OPTIONS} disabled={isViewer}
                  onChange={e => setOrg(o => ({ ...o, currency: e.target.value }))}
                />
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
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>{org.name || '—'}</span>
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
                <button onClick={() => { setShowDeleteModal(true); setDeletePassword(''); setDeleteError('') }} style={{ background: '#ef444420', border: '1px solid #ef444445', borderRadius: 9, padding: '8px 16px', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                  Eliminar cuenta
                </button>
              </div>

            </div>
          </div></>}
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
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9', textTransform: 'capitalize' }}>{stats?.orgPlan ?? integrations?.plan ?? 'free'}</span>
                    <span style={{ fontSize: 10.5, background: '#10b98120', color: '#10b981', border: '1px solid #10b98140', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>Activo</span>
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => setShowPlanModal(true)} style={{ width: '100%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: 'none', borderRadius: 10, padding: '10px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 0 20px #6366f145' }}>
              Gestionar plan
            </button>
          </div>

          {/* Uso del plan */}
          <div style={{ marginBottom: 20, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Uso del plan</p>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 10.5, color: '#4b5563' }}>Acumulado total</p>
            {[
              {
                ...USAGE[0],
                value: stats ? String(stats.totalCalls ?? 0) : USAGE[0].value,
                pct: stats ? Math.min(100, Math.round((stats.totalCalls ?? 0) / 2000 * 100)) : USAGE[0].pct,
              },
              {
                ...USAGE[1],
                value: agentCount !== null ? String(agentCount) : USAGE[1].value,
                pct: agentCount !== null ? Math.min(100, Math.round(agentCount / 20 * 100)) : USAGE[1].pct,
              },
              {
                ...USAGE[2],
                value: stats?.userCount != null ? String(stats.userCount) : USAGE[2].value,
                pct: stats?.userCount != null ? Math.min(100, Math.round(stats.userCount / 25 * 100)) : USAGE[2].pct,
              },
            ].map((u, i) => <UsageBar key={i} {...u} />)}
          </div>

          {/* Integraciones activas — GET /api/settings/integrations */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Integraciones</p>
            </div>
            {!integrations && (
              <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 12.5, color: '#4b5563' }}>Sin integraciones conectadas todavía.</p>
              </div>
            )}
            {integrations && (
              <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '4px 16px' }}>
                {[
                  { key: 'mautic', label: 'Mautic' },
                  { key: 'metricool', label: 'Metricool' },
                ].map(({ key, label }, i, arr) => {
                  const info = integrations[key] ?? { enabled: false, connected: false }
                  const status = !info.enabled ? 'Desactivado' : info.connected ? 'Conectado' : 'Sin conectar'
                  const color = !info.enabled ? '#4b5563' : info.connected ? '#10b981' : '#f59e0b'
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid #1e2433' : 'none' }}>
                      <span style={{ fontSize: 12.5, color: '#94a3b8', fontWeight: 600 }}>{label}</span>
                      <span style={{ fontSize: 11, color, background: `${color}15`, border: `1px solid ${color}40`, borderRadius: 5, padding: '2px 8px', fontWeight: 600 }}>{status}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Centro de ayuda */}
          <div>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Centro de ayuda</p>
            <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, overflow: 'hidden' }}>
              {[
                { Icon: RiGroupLine, iconBg: '#10b981', title: 'Soporte', sub: 'soporte@vozia.app' },
              ].map((h, i, arr) => (
                <button
                  key={i}
                  onClick={() => { window.location.href = 'mailto:soporte@vozia.app' }}
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

      {showDeleteModal && (
        <div onClick={() => !deleting && setShowDeleteModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: '1px solid #ef444440', borderRadius: 14, padding: '24px', width: 400, boxShadow: '0 40px 80px #0009' }}>
            <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#f87171' }}>Eliminar cuenta</p>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#94a3b8', lineHeight: 1.5 }}>
              Esta acción es permanente: tu usuario quedará anonimizado y perderás el acceso inmediatamente.
              Confirma con tu contraseña.
            </p>
            <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} placeholder="Tu contraseña" autoFocus style={{ width: '100%', boxSizing: 'border-box', background: '#111827', border: '1px solid #1e2433', borderRadius: 9, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', marginBottom: 12 }} />
            {deleteError && <p style={{ margin: '0 0 12px', color: '#f87171', fontSize: 12 }} role="alert">{deleteError}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteModal(false)} disabled={deleting} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid #1e2433', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmDeleteAccount} disabled={!deletePassword || deleting} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid #ef444445', background: '#ef444420', color: '#f87171', fontSize: 13, fontWeight: 700, cursor: !deletePassword || deleting ? 'not-allowed' : 'pointer', opacity: !deletePassword || deleting ? 0.6 : 1 }}>{deleting ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
            </div>
          </div>
        </div>
      )}

      {showPlanModal && (
        <div onClick={() => setShowPlanModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '24px', width: 400, boxShadow: '0 40px 80px #0009' }}>
            <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Tu plan</p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94a3b8' }}>
              Plan actual: <b style={{ color: '#f1f5f9', textTransform: 'capitalize' }}>{stats?.orgPlan ?? integrations?.plan ?? 'free'}</b>
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>
              El pago autogestionado todavía no está habilitado. Para cambiar de plan, ampliar límites o resolver dudas de facturación, escribe al equipo y te responderá el mismo día.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPlanModal(false)} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid #1e2433', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Cerrar</button>
              <button onClick={() => { window.location.href = 'mailto:soporte@vozia.app?subject=Cambio%20de%20plan' }} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Contactar para cambiar de plan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
