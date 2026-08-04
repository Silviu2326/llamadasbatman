import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'

const containerStyle = {
  minHeight: '100vh',
  padding: '48px 24px',
  color: 'var(--text-2)',
  background: 'var(--bg)',
  fontFamily: 'inherit',
}

const cardStyle = {
  width: 'min(760px, 100%)',
  margin: '0 auto',
  padding: '32px',
  border: '1px solid var(--line)',
  borderRadius: 16,
  background: 'var(--surface)',
  boxSizing: 'border-box',
  lineHeight: 1.6,
}

export default function PrivacyPage() {
  const { t } = useI18n()
  return (
    <main style={containerStyle}>
      <article style={cardStyle}>
        <Link to="/login" style={{ color: 'var(--accent-faint)' }}>{t('legal.backToLogin')}</Link>
        <h1 style={{ margin: '24px 0 8px', color: 'var(--text-strong)' }}>{t('legal.privacyTitle')}</h1>
        <p style={{ marginTop: 0, color: 'var(--muted)' }}>{t('legal.lastUpdated')}</p>
        <p>{t('legal.privacy1')}</p><p>{t('legal.privacy2')}</p>
        <p>{t('legal.privacy3')}</p>
        <p><Link to="/terminos" style={{ color: 'var(--accent-faint)' }}>{t('legal.viewTerms')}</Link></p>
      </article>
    </main>
  )
}
