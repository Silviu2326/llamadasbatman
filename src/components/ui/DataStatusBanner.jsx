import { RiAlertLine, RiDatabase2Line, RiLoader4Line, RiRefreshLine, RiSparkling2Line } from 'react-icons/ri'
import './data-status.css'
import { useI18n } from '../../i18n'

const STATUS_COPY = {
  live: { tone: 'live', icon: RiDatabase2Line },
  demo: { tone: 'demo', icon: RiSparkling2Line },
  empty: { tone: 'empty', icon: RiDatabase2Line },
  disconnected: { tone: 'disconnected', icon: RiAlertLine },
  error: { tone: 'error', icon: RiAlertLine },
  loading: { tone: 'loading', icon: RiLoader4Line },
}

export default function DataStatusBanner({
  status = 'live',
  message,
  onRetry,
  retryLabel = 'Reintentar',
  actionLabel,
  onAction,
  compact = false,
  className = '',
}) {
  const { t } = useI18n()
  const copy = STATUS_COPY[status] || STATUS_COPY.live
  const Icon = copy.icon
  const isLoading = status === 'loading'
  const isNotice = status !== 'live'

  if (!isNotice && !message) return null

  return (
    <div
      className={`data-status-banner data-status-${copy.tone}${compact ? ' data-status-compact' : ''} ${className}`.trim()}
      role={status === 'error' || status === 'disconnected' ? 'alert' : 'status'}
      aria-live="polite"
      aria-busy={isLoading}
    >
      <Icon aria-hidden="true" className={isLoading ? 'data-status-spin' : undefined} />
      <span className="data-status-copy">
        <strong>{t(`status.${status}`)}</strong>
        {message ? <span>{message}</span> : null}
      </span>
      {onRetry && !isLoading ? (
        <button type="button" className="data-status-retry" onClick={onRetry}>
          <RiRefreshLine aria-hidden="true" /> {retryLabel === 'Reintentar' ? t('status.retry') : retryLabel}
        </button>
      ) : null}
      {onAction && !isLoading ? (
        <button type="button" className="data-status-action" onClick={onAction}>
          {actionLabel || t('status.configure')}
        </button>
      ) : null}
    </div>
  )
}
