import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { RiArrowRightLine, RiBuilding2Line, RiLock2Line, RiMailLine, RiUser3Line } from 'react-icons/ri'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../i18n'
import { useBrand } from '../lib/brand'

/**
 * Alta self-service. El plan llega por query (`/registro?plan=agency`), que es
 * como enlaza la landing de revendedores: si es de pago y Stripe está
 * configurado, el backend devuelve la URL de checkout y aterrizamos ahí.
 */
const FIELDS = [
  { id: 'name', icon: RiUser3Line, type: 'text', autoComplete: 'name', es: 'Tu nombre', en: 'Your name' },
  { id: 'orgName', icon: RiBuilding2Line, type: 'text', autoComplete: 'organization', es: 'Nombre de tu agencia', en: 'Your agency name' },
  { id: 'email', icon: RiMailLine, type: 'email', autoComplete: 'email', es: 'Email de trabajo', en: 'Work email' },
  { id: 'password', icon: RiLock2Line, type: 'password', autoComplete: 'new-password', es: 'Contraseña (mínimo 10 caracteres)', en: 'Password (10 characters minimum)' },
]

export default function RegisterPage() {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const { login } = useAuth()
  const { locale } = useI18n()
  const brand = useBrand()
  const [values, setValues] = useState({ name: '', orgName: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const english = locale === 'en'
  const plan = search.get('plan') || undefined

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (values.password.length < 10) {
      setError(english ? 'The password needs at least 10 characters.' : 'La contraseña necesita al menos 10 caracteres.')
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...values, email: values.email.trim(), ...(plan ? { plan } : {}) }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || (english ? 'We could not create the account.' : 'No se pudo crear la cuenta.'))
      login(data.token, data.user, data.brand)
      // Con checkout la suscripción manda: el plan sube cuando Stripe confirma.
      if (data.checkoutUrl) window.location.assign(data.checkoutUrl)
      else navigate('/dashboard', { replace: true })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-form-panel" style={{ margin: '0 auto' }}>
        <div className="login-form-shell">
          <div className="login-form-header">
            <h2>{english ? `Create your ${brand.brandName} account` : `Crea tu cuenta de ${brand.brandName}`}</h2>
            <p>{english ? 'Free to start. No card required.' : 'Empiezas gratis y sin tarjeta.'}</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {FIELDS.map(({ id, icon: Icon, type, autoComplete, es, en }) => (
              <div className="login-field" key={id}>
                <label htmlFor={id}>{english ? en : es}</label>
                <div className="login-field__control">
                  <Icon className="login-field__icon" aria-hidden="true" />
                  <input
                    id={id}
                    name={id}
                    type={type}
                    value={values[id]}
                    onChange={event => { setValues(previous => ({ ...previous, [id]: event.target.value })); if (error) setError('') }}
                    autoComplete={autoComplete}
                    minLength={id === 'password' ? 10 : 2}
                    required
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'register-error' : undefined}
                  />
                </div>
              </div>
            ))}

            {error && <div id="register-error" className="login-message login-message--error" role="alert">{error}</div>}

            <button className="login-submit" type="submit" disabled={loading}>
              {loading
                ? (english ? 'Creating…' : 'Creando…')
                : <>{english ? 'Create account' : 'Crear cuenta'} <RiArrowRightLine /></>}
            </button>
          </form>

          <p className="login-legal">
            {english ? 'Already have an account? ' : '¿Ya tienes cuenta? '}
            <Link to="/login" style={{ color: '#6777a7', textDecoration: 'underline', textUnderlineOffset: 2 }}>{english ? 'Sign in' : 'Entrar'}</Link>
            {english ? '. By signing up you accept the ' : '. Al registrarte aceptas los '}
            <Link to="/terminos" style={{ color: '#6777a7', textDecoration: 'underline', textUnderlineOffset: 2 }}>{english ? 'Terms' : 'Términos'}</Link>
            {english ? ' and ' : ' y la '}
            <Link to="/privacidad" style={{ color: '#6777a7', textDecoration: 'underline', textUnderlineOffset: 2 }}>{english ? 'Privacy Policy' : 'Privacidad'}</Link>.
          </p>
        </div>
      </section>
    </main>
  )
}
