import React from 'react'
import { createTranslator, getLocale } from '../i18n'

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Keep the failure visible during development without breaking the rest of the shell.
    if (import.meta.env?.DEV) console.error('Vendrava render error', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children
    const locale = getLocale()
    const t = createTranslator(locale)

    return (
      <main className="app-error-boundary" role="alert">
        <div className="app-error-boundary-card">
          <span className="app-error-boundary-eyebrow">{locale === 'en' ? 'Control center' : 'Centro de control'}</span>
          <h1>{t('errors.viewReload')}</h1>
          <p>{t('errors.accountProtected')}</p>
          <div className="app-error-boundary-actions">
            <button type="button" onClick={this.handleRetry}>{t('common.retry')}</button>
            <button type="button" className="secondary" onClick={this.handleReload}>{t('common.reload')}</button>
          </div>
          {import.meta.env?.DEV && this.state.error?.message ? (
            <details>
              <summary>{t('errors.technicalDetail')}</summary>
              <code>{this.state.error.message}</code>
            </details>
          ) : null}
        </div>
      </main>
    )
  }
}
