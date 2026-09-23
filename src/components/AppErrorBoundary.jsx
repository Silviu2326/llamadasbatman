import React from 'react'
import { createTranslator, getLocale } from '../i18n'

const ASSET_RELOAD_KEY = 'vendrava:asset-reload:'
const ASSET_ERROR_PATTERN = /Failed to fetch dynamically imported module|Loading chunk [\w-]+ failed|Importing a module script failed|Unable to preload CSS/i

function isAssetLoadError(error) {
  return ASSET_ERROR_PATTERN.test(String(error?.message || error || ''))
}

function recoveryKey() {
  return `${ASSET_RELOAD_KEY}${window.location.pathname}`
}

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
    this.recoveryTimer = null
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidMount() {
    // Keep the one-reload guard around long enough for lazy route imports to
    // settle, then clear it so a later deployment can recover independently.
    this.recoveryTimer = window.setTimeout(() => {
      try { window.sessionStorage.removeItem(recoveryKey()) } catch { /* Storage can be unavailable. */ }
    }, 5000)
  }

  componentDidCatch(error, errorInfo) {
    // Keep the failure visible during development without breaking the rest of the shell.
    if (import.meta.env?.DEV) console.error('Vendrava render error', error, errorInfo)

    // React caches a rejected lazy import, so simply rendering it again cannot
    // recover. Reload once to request the current asset graph, with a session
    // guard that prevents a broken deployment from entering a reload loop.
    if (isAssetLoadError(error)) {
      try {
        const key = recoveryKey()
        if (window.sessionStorage.getItem(key) !== '1') {
          window.sessionStorage.setItem(key, '1')
          window.location.reload()
        }
      } catch {
        // If storage is blocked, keep the normal recovery screen available.
      }
    }
  }

  componentWillUnmount() {
    if (this.recoveryTimer) window.clearTimeout(this.recoveryTimer)
  }

  handleRetry = () => {
    if (isAssetLoadError(this.state.error)) {
      this.handleReload()
      return
    }
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
