import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

// Destino de los enlaces que manda passwordReset.service.ts. Pública a
// propósito: la autorización es el token firmado que viaja en la URL.
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (password.length < 10) return setError('La contraseña debe tener al menos 10 caracteres.')
    if (password !== repeat) return setError('Las dos contraseñas no coinciden.')

    setSaving(true)
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) return setError(payload?.error || 'No se pudo restablecer la contraseña.')
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-form-panel">
        <div className="login-form-shell">
          <div className="login-form-header">
            <h1>Restablecer contraseña</h1>
            <p>Elige una contraseña nueva para tu cuenta.</p>
          </div>

          {!token ? (
            <div className="login-message login-message--error" role="alert">
              Falta el token del enlace. Vuelve a pedir el correo de recuperación desde <Link to="/login">la pantalla de acceso</Link>.
            </div>
          ) : done ? (
            <div className="login-message login-message--notice" role="status">
              Contraseña actualizada. Se han cerrado las sesiones abiertas; te llevamos al acceso…
            </div>
          ) : (
            <form className="login-form" onSubmit={submit} noValidate>
              <label htmlFor="new-password" style={{ display: 'block', marginBottom: 5, fontWeight: 700 }}>Contraseña nueva</label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={10}
                required
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12, padding: '8px 10px', border: '1px solid #b6c4ee', borderRadius: 8, font: 'inherit' }}
              />
              <label htmlFor="repeat-password" style={{ display: 'block', marginBottom: 5, fontWeight: 700 }}>Repite la contraseña</label>
              <input
                id="repeat-password"
                type="password"
                value={repeat}
                onChange={event => setRepeat(event.target.value)}
                autoComplete="new-password"
                required
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12, padding: '8px 10px', border: '1px solid #b6c4ee', borderRadius: 8, font: 'inherit' }}
              />
              {error && <div className="login-message login-message--error" role="alert">{error}</div>}
              <button className="login-submit" type="submit" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          )}

          <p className="login-legal"><Link to="/login">Volver al acceso</Link></p>
        </div>
      </section>
    </main>
  )
}
