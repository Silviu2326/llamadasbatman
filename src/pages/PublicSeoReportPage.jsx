import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import SeoReportView from '../components/SeoReportView'

// Informe SEO compartido: vista pública de solo lectura, sin sesión.
export default function PublicSeoReportPage() {
  const { token } = useParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/public/seo/report/${encodeURIComponent(token ?? '')}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body?.error || 'Este informe ya no está disponible.')
        setReport(body.data)
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message)
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token])

  return (
    <div style={styles.page}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={styles.title}>Informe SEO</h1>
        <p style={styles.subtitle}>Compartido de solo lectura · generado con Vendrava</p>
      </header>
      {loading ? <p style={styles.subtitle}>Cargando informe…</p> : null}
      {error ? <p style={styles.error}>{error}</p> : null}
      <SeoReportView report={report} />
    </div>
  )
}

const styles = {
  page: { padding: '28px 32px', maxWidth: 960, margin: '0 auto', minHeight: '100dvh' },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: -0.5 },
  subtitle: { margin: '6px 0 0', fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 },
  error: { fontSize: 14, color: 'var(--danger)' },
}
