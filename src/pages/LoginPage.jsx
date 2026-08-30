import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  RiArrowRightLine,
  RiCalendarCheckLine,
  RiCheckLine,
  RiEyeLine,
  RiEyeOffLine,
  RiLock2Line,
  RiMailLine,
  RiPulseLine,
  RiShieldCheckLine,
} from 'react-icons/ri'
import { useI18n } from '../i18n'
import { useBrand } from '../lib/brand'

const TRUST_ITEMS = [
  { icon: RiShieldCheckLine, key: 'protectedAccess' },
  { icon: RiCheckLine, key: 'encryptedData' },
  { icon: RiPulseLine, key: 'available247' },
]

function Brand({ compact = false }) {
  const brand = useBrand()
  return (
    <div className={`login-brand${compact ? ' login-brand--compact' : ''}`}>
      {brand.logoUrl
        ? <img src={brand.logoUrl} alt="" style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'cover' }} />
        : (
          <span className="login-brand__mark" aria-hidden="true">
            {[18, 28, 38, 30, 22].map((height, index) => <i key={index} style={{ '--brand-bar-height': `${height}px` }} />)}
          </span>
        )}
      <span>{brand.brandName}</span>
    </div>
  )
}

function Waveform() {
  const bars = [8, 14, 22, 12, 27, 18, 31, 17, 25, 34, 21, 29, 16, 24, 12, 20, 9, 15, 7, 12]
  return (
    <span className="login-waveform" aria-hidden="true">
      {bars.map((height, index) => <i key={index} style={{ '--bar-height': `${height}px`, '--bar-delay': `${index * 45}ms` }} />)}
    </span>
  )
}

function SceneCard({ type, icon: Icon, title, detail, children }) {
  return (
    <div className={`login-scene-card login-scene-card--${type}`}>
      <div className="login-scene-card__icon"><Icon /></div>
      <div className="login-scene-card__body">
        <strong>{title}</strong>
        <span>{detail}</span>
        {children}
      </div>
      {type === 'calendar' && <RiCheckLine className="login-scene-card__check" />}
      {type === 'voice' && <span className="login-scene-card__live" />}
    </div>
  )
}

function Showcase() {
  const { t } = useI18n()
  const brand = useBrand()
  return (
    <section className="login-showcase" aria-label={`${brand.brandName}, ${t('auth.conversationalIntelligence').toLowerCase()}`}>
      <div className="login-showcase__grid" aria-hidden="true" />
      <div className="login-showcase__glow login-showcase__glow--one" aria-hidden="true" />
      <div className="login-showcase__glow login-showcase__glow--two" aria-hidden="true" />

      <div className="login-showcase__top">
        <Brand />
        <span className="login-showcase__version">{t('auth.conversationalIntelligence')}</span>
      </div>

      <div className="login-showcase__content">
        <div className="login-orb-wrap">
          <img src="/assets/login/voice-orb-premium.png" alt="" className="login-orb" />
          <div className="login-orb__core-mark" aria-hidden="true"><RiPulseLine /></div>
          <SceneCard type="voice" icon={RiPulseLine} title={t('auth.activeConversation')} detail={t('auth.listening')}>
            <Waveform />
          </SceneCard>
          <SceneCard type="calendar" icon={RiCalendarCheckLine} title={t('auth.confirmedMeeting')} detail={t('auth.meetingToday')} />
          <div className="login-orb__status">
            <span className="login-orb__dot" />
            <span>{t('auth.active')}</span>
          </div>
        </div>

        <div className="login-showcase__copy">
          <p className="login-kicker">{t('auth.commercialTeam')}</p>
          <h1>{t('auth.autopilot')}</h1>
          <p>{t('auth.agentsDescription')}</p>
        </div>
      </div>

      <div className="login-showcase__bottom">
        <span>{t('auth.designedForTeams')}</span>
        <span className="login-showcase__line" />
        <span>{t('auth.simpleHumanScalable')}</span>
      </div>
    </section>
  )
}

function Field({ id, label, icon: Icon, type = 'text', value, onChange, onFocus, onBlur, placeholder, autoComplete, focused, describedBy, invalid = false, children }) {
  return (
    <div className={`login-field${focused ? ' is-focused' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="login-field__control">
        <Icon className="login-field__icon" aria-hidden="true" />
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
        {children}
      </div>
    </div>
  )
}

function Spinner() {
  return <span className="login-spinner" aria-hidden="true" />
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { t, locale, setLocale } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [focused, setFocused] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoverySending, setRecoverySending] = useState(false)
  const [recoverySent, setRecoverySent] = useState(false)
  const recoveryInputRef = useRef(null)
  const errorId = 'login-form-error'
  const recoveryDescriptionId = 'login-recovery-description'
  const supportMailto = locale === 'en'
    ? `mailto:soporte@vendrava.app?subject=${encodeURIComponent('Vendrava access recovery request')}&body=${encodeURIComponent(`Hello, I need to recover access to Vendrava.\n\nAccount email: ${recoveryEmail.trim() || '[enter your email]'}\n\nThank you.`)}`
    : `mailto:soporte@vendrava.app?subject=${encodeURIComponent('Solicitud de recuperación de acceso a Vendrava')}&body=${encodeURIComponent(`Hola, necesito recuperar el acceso a Vendrava.\n\nCorreo de la cuenta: ${recoveryEmail.trim() || '[indica aquí tu correo]'}\n\nGracias.`)}`

  useEffect(() => {
    if (!showRecovery) return
    const frame = requestAnimationFrame(() => recoveryInputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [showRecovery])

  async function sendRecovery() {
    setRecoverySending(true)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail.trim() }),
      })
    } catch {
      // La respuesta es siempre la misma: no hay nada que contarle al usuario
      // que no sea "revisa tu correo".
    } finally {
      setRecoverySending(false)
      setRecoverySent(true)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError(t('auth.missingCredentials'))
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || data.message || t('auth.invalidCredentials'))
      login(data.token, data.user, data.brand)
      navigate('/dashboard', { replace: true })
    } catch (submitError) {
      setError(submitError.message || t('auth.signInError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <Showcase />

      <section className="login-form-panel">
        <div className="login-form-shell">
          <div className="login-form-header">
            <div className="login-form-mobile-brand"><Brand compact /></div>
            <h2>{t('auth.welcomeBack')}</h2>
            <p>{t('auth.accessPlatform')}</p>
          </div>

          <div className="login-trust login-trust--mobile">
            <span className="login-trust__dot" />
            <span>{t('auth.workspaceProtected')}</span>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <Field
              id="email"
              label={t('auth.email')}
              icon={RiMailLine}
              type="email"
              value={email}
              onChange={event => { setEmail(event.target.value); if (error) setError('') }}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              placeholder={t('auth.emailPlaceholder')}
              autoComplete="email"
              focused={focused === 'email'}
              describedBy={error ? errorId : undefined}
              invalid={Boolean(error)}
            />

            <div className="login-password-field">
              <Field
                id="password"
                label={t('auth.password')}
                icon={RiLock2Line}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => { setPassword(event.target.value); if (error) setError('') }}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                placeholder={t('auth.passwordPlaceholder')}
                autoComplete="current-password"
                focused={focused === 'password'}
                describedBy={error ? errorId : undefined}
                invalid={Boolean(error)}
              >
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(visible => !visible)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <RiEyeOffLine /> : <RiEyeLine />}
                </button>
              </Field>
              <button type="button" className="login-forgot" onClick={() => setShowRecovery(value => !value)} aria-expanded={showRecovery} aria-controls="login-recovery-panel">
                {t('auth.forgotPassword')}
              </button>
            </div>

            {showRecovery && (
              <section id="login-recovery-panel" className="login-message login-message--notice" aria-labelledby="login-recovery-title">
                <strong id="login-recovery-title">{t('auth.recoveryTitle')}</strong>
                <p id={recoveryDescriptionId} style={{ margin: '6px 0 10px' }}>{t('auth.recoveryDescription')}</p>
                <label htmlFor="login-recovery-email" style={{ display: 'block', marginBottom: 5, fontWeight: 700 }}>{t('auth.accountEmail')}</label>
                <input
                  id="login-recovery-email"
                  ref={recoveryInputRef}
                  type="email"
                  value={recoveryEmail}
                  onChange={event => setRecoveryEmail(event.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  autoComplete="email"
                  aria-describedby={recoveryDescriptionId}
                  style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, padding: '8px 10px', border: '1px solid #b6c4ee', borderRadius: 8, color: '#14233d', background: '#fff', font: 'inherit' }}
                />
                {/* Antes esto solo abría un mailto a soporte: ahora hay reseteo
                    real (POST /api/auth/forgot-password), que responde igual
                    exista o no la cuenta para no filtrar quién está registrado. */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    disabled={recoverySending || !recoveryEmail.trim()}
                    onClick={sendRecovery}
                    style={{ display: 'inline-flex', alignItems: 'center', minHeight: 36, padding: '0 12px', borderRadius: 8, color: '#fff', background: '#4858d9', fontWeight: 700, border: 'none', cursor: recoverySending ? 'progress' : 'pointer' }}
                  >
                    {recoverySending ? 'Enviando…' : locale === 'en' ? 'Email me a reset link' : 'Enviarme un enlace'}
                  </button>
                  <a href={supportMailto} style={{ color: '#4858d9', fontWeight: 600, fontSize: 12.5 }}>{t('auth.openSupportEmail')}</a>
                </div>
                {recoverySent && (
                  <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#14233d' }}>
                    {locale === 'en'
                      ? 'If that email has an account, a reset link is on its way. It expires in one hour.'
                      : 'Si ese email tiene cuenta, recibirás un enlace para restablecerla. Caduca en una hora.'}
                  </p>
                )}
              </section>
            )}

            {error && <div id={errorId} className="login-message login-message--error" role="alert">{error}</div>}

            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? <><Spinner /> {t('auth.signingIn')}</> : <>{t('auth.signIn')} <RiArrowRightLine /></>}
            </button>
          </form>

          <div className="login-trust" aria-label={t('auth.protectedAccess')}>
            {TRUST_ITEMS.map(({ icon: Icon, key }) => (
              <span key={key}><Icon aria-hidden="true" />{t(`auth.${key}`)}</span>
            ))}
          </div>

          <p className="login-legal">
            {locale === 'en' ? "Don't have an account? " : '¿Aún no tienes cuenta? '}
            <Link to="/registro" style={{ color: '#6777a7', textDecoration: 'underline', textUnderlineOffset: 2 }}>{locale === 'en' ? 'Create one' : 'Créala aquí'}</Link>
          </p>
          <p className="login-legal">
            {locale === 'en' ? 'By signing in you accept the ' : 'Al acceder aceptas los '}<Link to="/terminos" style={{ color: '#6777a7', textDecoration: 'underline', textUnderlineOffset: 2 }}>{locale === 'en' ? 'Terms' : 'Términos'}</Link>{locale === 'en' ? ' and ' : ' y la '}<Link to="/privacidad" style={{ color: '#6777a7', textDecoration: 'underline', textUnderlineOffset: 2 }}>{locale === 'en' ? 'Privacy Policy' : 'Privacidad'}</Link>.
          </p>
          <div className="login-locale-switcher" role="group" aria-label={t('common.language')}>
            <button type="button" className={locale === 'es' ? 'active' : ''} onClick={() => setLocale('es')}>ES</button>
            <button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>EN</button>
          </div>
        </div>
      </section>
    </main>
  )
}
