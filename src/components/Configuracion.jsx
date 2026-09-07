import { useState, useEffect } from 'react'
import { RiCheckLine, RiDeleteBinLine, RiLockLine, RiUserLine } from 'react-icons/ri'
import { HiChevronDown } from 'react-icons/hi'
import '../dashboard.css'
import '../pages/more-center.css'
import '../pages/configuracion/configuracion.css'
import { apiFetch } from '../lib/api'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import DataStatusBanner from './ui/DataStatusBanner'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../i18n'

// Mi perfil: la sección personal de /configuracion. Todo lo que describe a la
// organización (empresa, plan, integraciones, administración) vive en las
// secciones hermanas de ConfiguracionPage.

const LOCALE_OPTIONS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
]

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
          width: '100%', boxSizing: 'border-box', background: 'var(--bg)',
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
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 32px 9px 12px', color: disabled ? 'var(--faint)' : 'var(--text)', fontSize: 13, appearance: 'none', outline: 'none', cursor: disabled ? 'not-allowed' : 'pointer' }}
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

// ── Main Component ────────────────────────────────────────────────────────────
export default function Configuracion() {
  const { user, logout } = useAuth()
  const { locale, setLocale, t } = useI18n()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  // ── Perfil / preferencias del usuario ──
  const [profile, setProfile] = useState({ name: '', email: '', role: '' })
  const [preference, setPreference] = useState({ locale: 'es', timezone: 'Europe/Madrid', theme: 'system' })

  // ── Password ──
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [pwdMessage, setPwdMessage] = useState(null)
  const [pwdSaving, setPwdSaving] = useState(false)

  // ── Save feedback ──
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)

  // ── Estado de la carga inicial ──
  // Sin esto, un fallo dejaba el formulario en blanco y "Guardar" machacaba
  // los datos reales con cadenas vacías.
  const [formLoaded, setFormLoaded] = useState(false)
  const [loadStatus, setLoadStatus] = useState('loading')
  const [loadMessage, setLoadMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoadStatus('loading')
    setLoadMessage('')

    async function loadForm() {
      let gate = null
      try {
        const res = await apiFetch('/api/settings/me')
        if (!res.ok) { gate = await readPlanGate(res); throw new Error('me') }
        const data = await res.json()
        if (!active) return
        setProfile({ name: data.user?.name ?? '', email: data.user?.email ?? '', role: data.user?.role ?? '' })
        setPreference({
          locale: data.preference?.locale === 'en' ? 'en' : locale,
          timezone: data.preference?.timezone ?? 'Europe/Madrid',
          theme: data.preference?.theme ?? 'system',
        })
        if (data.preference?.locale === 'en' || data.preference?.locale === 'es') setLocale(data.preference.locale)
        setFormLoaded(true)
        setLoadStatus('')
        setLoadMessage('')
      } catch {
        if (!active) return
        setLoadStatus(gate ? 'plan' : 'error')
        setLoadMessage(gate
          ? planGateMessage(gate, locale)
          : 'No se pudieron cargar tus datos de configuración. Para no sobrescribirlos con campos vacíos, el guardado queda bloqueado hasta que la carga funcione.')
      }
    }
    loadForm()
    return () => { active = false }
  }, [reloadKey])

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

  const initials = profile.name ? profile.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?'

  return (
    <section className="more-center-page dark-scroll">
      <div className="more-center-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loadStatus && <DataStatusBanner status={loadStatus} message={loadStatus === 'loading' ? 'Cargando tus datos de configuración…' : loadMessage} onRetry={loadStatus === 'error' ? () => setReloadKey(k => k + 1) : undefined} />}

        <div className="settings-toolbar">
          <div>
            <h2>{t('settings.myProfile')}</h2>
            <p>{t('settings.accountPreferences')}</p>
          </div>
          <div className="settings-toolbar-actions">
            <button
              type="button"
              className="settings-primary"
              onClick={handleSave}
              disabled={saving || !formLoaded}
              title={!formLoaded ? 'No se pueden guardar cambios hasta que se carguen tus datos actuales.' : undefined}
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
            {saveMessage && <span role="status" className="settings-status">{saveMessage}</span>}
          </div>
        </div>

        <article className="settings-card">
          <header>
            <span className="settings-card-icon"><RiUserLine /></span>
            <div><h2>Información personal</h2><p>Nombre, correo y rol con el que trabajas en la plataforma.</p></div>
          </header>
          <div className="settings-card-divider" />
          <div className="settings-profile-identity">
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div className="settings-avatar">{initials}</div>
              <p style={{ margin: '6px 0 0', fontSize: 9.5, color: 'var(--dim)' }}>Iniciales de tu nombre</p>
            </div>
            <div className="settings-field-grid">
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
        </article>

        <article className="settings-card">
          <header>
            <span className="settings-card-icon"><RiLockLine /></span>
            <div><h2>Seguridad</h2><p>Cambia tu contraseña. Necesitas la actual para confirmar.</p></div>
          </header>
          <div className="settings-card-divider" />
          <Input
            label="Contraseña actual" placeholder="••••••••" type="password"
            value={pwd.current} onChange={e => setPwd(p => ({ ...p, current: e.target.value }))}
          />
          <div className="settings-field-grid">
            <Input
              label="Nueva contraseña" placeholder="••••••••" type="password"
              value={pwd.next} onChange={e => setPwd(p => ({ ...p, next: e.target.value }))}
            />
            <Input
              label="Confirmar contraseña" placeholder="••••••••" type="password"
              value={pwd.confirm} onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="settings-secondary" onClick={handleChangePassword} disabled={pwdSaving}>
              <RiLockLine style={{ width: 13, height: 13 }} />
              {pwdSaving ? 'Actualizando…' : 'Actualizar contraseña'}
            </button>
            {pwdMessage && <span role="status" className="settings-status">{pwdMessage}</span>}
          </div>
        </article>

        <article className="settings-card">
          <div className="settings-row">
            <div className="settings-row-copy">
              <span className="settings-card-icon is-success"><RiCheckLine /></span>
              <div>
                <p>Sesión activa</p>
                <small>Conectado como <strong style={{ color: 'var(--accent-soft)' }}>{user?.email}</strong></small>
              </div>
            </div>
          </div>
        </article>

        <article className="settings-card">
          <div className="settings-row">
            <div className="settings-row-copy">
              <span className="settings-card-icon is-danger"><RiDeleteBinLine /></span>
              <div>
                <p>Eliminación de la cuenta</p>
                <small>Permanente e irreversible. Tu usuario quedará anonimizado y perderás el acceso.</small>
              </div>
            </div>
            <button type="button" className="settings-danger" onClick={() => { setShowDeleteModal(true); setDeletePassword(''); setDeleteError('') }}>
              Eliminar cuenta
            </button>
          </div>
        </article>
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
              <button type="button" className="settings-secondary" onClick={() => setShowDeleteModal(false)} disabled={deleting}>Cancelar</button>
              <button type="button" className="settings-danger" onClick={confirmDeleteAccount} disabled={!deletePassword || deleting}>{deleting ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
