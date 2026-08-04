import { Link, useLocation } from 'react-router-dom'
import { useI18n } from '../i18n'

export default function NotFoundPage() {
  const location = useLocation()
  const { t } = useI18n()

  return (
    <main
      style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <section style={{ width: 'min(100%, 520px)', padding: '40px 32px', border: '1px solid var(--line)', borderRadius: 20, background: 'var(--surface-2)', boxShadow: 'var(--shadow-2)', textAlign: 'center' }}>
        <p style={{ margin: 0, color: 'var(--accent-soft)', fontSize: 14, fontWeight: 800, letterSpacing: '.12em' }}>ERROR 404</p>
        <h1 style={{ margin: '14px 0 10px', fontSize: 'clamp(28px, 6vw, 42px)', lineHeight: 1.1 }}>{t('errors.notFoundTitle')}</h1>
        <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.6 }}>
          {t('errors.notFoundDescription', { path: location.pathname })}
        </p>
        <Link
          to="/dashboard"
          style={{ display: 'inline-flex', marginTop: 28, padding: '11px 16px', borderRadius: 10, background: 'var(--accent-deep)', color: 'var(--on-accent)', fontWeight: 700, textDecoration: 'none' }}
        >
          {t('errors.goHome')}
        </Link>
      </section>
    </main>
  )
}
