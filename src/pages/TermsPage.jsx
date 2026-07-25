import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'

const containerStyle = {
  minHeight: '100vh',
  padding: '48px 24px',
  color: '#dbe4f0',
  background: '#080c14',
  fontFamily: 'inherit',
}

const cardStyle = {
  width: 'min(760px, 100%)',
  margin: '0 auto',
  padding: '32px',
  border: '1px solid #1e293b',
  borderRadius: 16,
  background: '#0d1117',
  boxSizing: 'border-box',
  lineHeight: 1.6,
}

export default function TermsPage() {
  const { t } = useI18n()
  return (
    <main style={containerStyle}>
      <article style={cardStyle}>
        <Link to="/login" style={{ color: '#a5b4fc' }}>{t('legal.backToLogin')}</Link>
        <h1 style={{ margin: '24px 0 8px', color: '#f8fafc' }}>{t('legal.termsTitle')}</h1>
        <p style={{ marginTop: 0, color: '#94a3b8' }}>{t('legal.lastUpdated')}</p>
        <p>{t('legal.terms1')}</p><p>{t('legal.terms2')}</p>
        <p>{t('legal.terms3')}</p>
        <p><Link to="/privacidad" style={{ color: '#a5b4fc' }}>{t('legal.viewPrivacy')}</Link></p>
      </article>
    </main>
  )
}
