import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { RiLoader4Line, RiSearchEyeLine } from 'react-icons/ri'
import SeoReportView from '../components/SeoReportView'

// Imán de leads: el visitante audita su web gratis dejando su contacto.
// El lead entra en la campaña dueña del slug con el informe adjunto.
export default function PublicSeoAuditPage() {
  const { slug } = useParams()
  const [form, setForm] = useState({ url: '', name: '', email: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)

  function setField(field) {
    return (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  async function submit(event) {
    event.preventDefault()
    if (!form.url.trim() || !form.name.trim() || !(form.email.trim() || form.phone.trim())) {
      setError('Indica tu web, tu nombre y un email o teléfono para enviarte el análisis.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/public/seo/audit/${encodeURIComponent(slug ?? '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'No se pudo auditar la web. Inténtalo de nuevo.')
      setReport(body.data)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <header style={{ marginBottom: 20, textAlign: 'center' }}>
        <h1 style={styles.title}>Audita tu web gratis</h1>
        <p style={styles.subtitle}>
          Descubre en un minuto qué frena tu posicionamiento en Google: auditoría técnica,
          score SEO y un plan inicial para mejorarlo.
        </p>
      </header>

      {!report ? (
        <form onSubmit={submit} style={styles.card}>
          <div style={styles.formGrid}>
            <label style={{ ...styles.field, gridColumn: '1 / -1' }}>
              <span style={styles.label}>La web de tu negocio *</span>
              <input style={styles.input} type="text" value={form.url} onChange={setField('url')} placeholder="https://tunegocio.com" required />
            </label>
            <label style={styles.field}>
              <span style={styles.label}>Tu nombre *</span>
              <input style={styles.input} type="text" value={form.name} onChange={setField('name')} placeholder="Nombre y apellidos" required />
            </label>
            <label style={styles.field}>
              <span style={styles.label}>Email</span>
              <input style={styles.input} type="email" value={form.email} onChange={setField('email')} placeholder="tu@email.com" />
            </label>
            <label style={styles.field}>
              <span style={styles.label}>Teléfono</span>
              <input style={styles.input} type="tel" value={form.phone} onChange={setField('phone')} placeholder="600 000 000" />
            </label>
          </div>
          {error ? <p style={styles.error}>{error}</p> : null}
          <button type="submit" disabled={loading} style={{ ...styles.button, opacity: loading ? 0.7 : 1 }}>
            {loading
              ? <><RiLoader4Line className="spin" style={{ width: 16, height: 16 }} /> Auditando tu web…</>
              : <><RiSearchEyeLine style={{ width: 16, height: 16 }} /> Auditar mi web gratis</>}
          </button>
          <p style={{ ...styles.subtitle, fontSize: 12, marginTop: 10 }}>
            Tus datos solo se usan para enviarte el análisis y contactarte sobre él.
          </p>
        </form>
      ) : (
        <>
          <div style={styles.successBanner}>
            ✓ Auditoría completada. Te contactaremos para explicarte el plan de mejora en detalle.
          </div>
          <SeoReportView report={report} />
        </>
      )}
    </div>
  )
}

const styles = {
  page: { padding: '28px 32px', maxWidth: 760, margin: '0 auto', minHeight: '100dvh' },
  title: { margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: -0.5 },
  subtitle: { margin: '8px 0 0', fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 16,
    padding: 20,
  },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--muted)' },
  input: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--line)',
    background: 'var(--bg)',
    color: 'var(--text-strong)',
    fontSize: 14,
    fontFamily: 'inherit',
  },
  button: {
    marginTop: 16,
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '12px 22px',
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    fontSize: 15, fontWeight: 600,
    color: '#fff',
    background: 'linear-gradient(135deg, var(--accent-deep) 0%, var(--violet-deep) 100%)',
  },
  error: { margin: '10px 0 0', fontSize: 13, color: 'var(--danger)' },
  successBanner: {
    marginBottom: 16,
    padding: '12px 16px',
    borderRadius: 12,
    border: '1px solid color-mix(in srgb, var(--success) 40%, transparent)',
    background: 'color-mix(in srgb, var(--success) 10%, transparent)',
    color: 'var(--text-strong)',
    fontSize: 13.5,
  },
}
