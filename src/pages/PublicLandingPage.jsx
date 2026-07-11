import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import '../dashboard.css'

export default function PublicLandingPage() {
  const { slug } = useParams()
  const [landing, setLanding] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '' })

  useEffect(() => {
    fetch(`/api/public/landing/${slug}`)
      .then(r => {
        if (r.status === 404) throw new Error('Landing no encontrada')
        if (!r.ok) throw new Error('No se pudo cargar la landing')
        return r.json()
      })
      .then(setLanding)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [slug])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.phone.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/landing/${slug}/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      setSubmitted(true)
    } catch {
      setError('No se pudo enviar. Intentá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#080c14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14 }}>
        Cargando…
      </div>
    )
  }

  if (error && !landing) {
    return (
      <div style={{ minHeight: '100vh', background: '#080c14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 14, padding: 24, textAlign: 'center' }}>
        {error}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080c14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo.png" alt="VozIA" style={{ width: 64, height: 64, borderRadius: 14, marginBottom: 16 }} />
          <h1 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 800, color: '#f1f5f9' }}>{landing?.name}</h1>
          {landing?.adCopy && <p style={{ margin: 0, fontSize: 15, color: '#94a3b8', lineHeight: 1.5 }}>{landing.adCopy}</p>}
        </div>

        {submitted ? (
          <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 16, padding: '28px', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#10b98120', border: '1px solid #10b98140', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <span style={{ color: '#10b981', fontSize: 24 }}>✓</span>
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>¡Gracias, {form.name.trim()}!</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Te llamamos en menos de 30 segundos.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 16, padding: '28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {landing?.offer && (
              <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 10, padding: '14px' }}>
                <p style={{ margin: '0 0 4px', fontSize: 12, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Oferta</p>
                <p style={{ margin: 0, fontSize: 15, color: '#f1f5f9', fontWeight: 600 }}>{landing.offer}</p>
              </div>
            )}
            {landing?.leadMagnet && (
              <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>{landing.leadMagnet}</p>
            )}

            <input
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nombre completo"
              required
              style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 10, padding: '12px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
            />
            <input
              value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="Teléfono"
              type="tel"
              required
              style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 10, padding: '12px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
            />
            <input
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="Email (opcional)"
              type="email"
              style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 10, padding: '12px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
            />

            {error && <p style={{ margin: 0, fontSize: 12, color: '#ef4444' }}>{error}</p>}

            <button
              type="submit"
              disabled={submitting || !form.name.trim() || !form.phone.trim()}
              style={{
                padding: '13px', borderRadius: 10, border: 'none',
                background: submitting || !form.name.trim() || !form.phone.trim() ? '#374151' : 'linear-gradient(90deg, #4f46e5, #7c3aed)',
                color: '#fff', fontSize: 14, fontWeight: 700, cursor: submitting ? 'default' : 'pointer',
              }}
            >
              {submitting ? 'Enviando…' : 'Quiero que me llamen'}
            </button>

            <p style={{ margin: 0, fontSize: 11, color: '#4b5563', textAlign: 'center' }}>
              Al enviar, aceptás que un asesor de VozIA te contacte por teléfono.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
