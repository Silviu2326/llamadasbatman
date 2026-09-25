import { RiAlertLine, RiCheckboxCircleLine, RiErrorWarningLine, RiPlugLine, RiShieldCheckLine, RiTimeLine } from 'react-icons/ri'
import './organic-components.css'
import { useI18n } from '../../i18n'

// Banda de integridad de organico.md §5.1. Va antes que cualquier número, por
// el mismo motivo que en Ads: la página no puede pedir confianza en una cifra
// sin decir primero de qué fuentes sale y cuáles no están midiendo.
//
// La distinción que hace útil este componente es "conectada, sin ingesta": una
// integración autorizada cuyo dato todavía no se lee no es un panel vacío ni
// un cero. Callarlo hace creer que el negocio no tiene tráfico cuando lo que
// falta es la lectura.

const STATUS_META = {
  ready: { tone: 'ok', Icon: RiCheckboxCircleLine },
  connected_no_ingest: { tone: 'warn', Icon: RiTimeLine },
  not_connected: { tone: 'idle', Icon: RiPlugLine },
  not_configured: { tone: 'idle', Icon: RiPlugLine },
  error: { tone: 'bad', Icon: RiErrorWarningLine },
}

const OVERALL_META = {
  ready: { tone: 'ok', Icon: RiShieldCheckLine },
  partial: { tone: 'warn', Icon: RiAlertLine },
  stale: { tone: 'warn', Icon: RiTimeLine },
  unreliable: { tone: 'bad', Icon: RiErrorWarningLine },
}

export default function OrganicDataIntegrity({ dataQuality, onConnect }) {
  const { t } = useI18n()
  if (!dataQuality) return null
  const overallKey = OVERALL_META[dataQuality.status] ? dataQuality.status : 'partial'
  const overall = OVERALL_META[overallKey]
  const { Icon } = overall

  return (
    <section className={`organic-integrity is-${overall.tone}`} aria-label={t('organic.integrity.aria')}>
      <header>
        <span className="organic-integrity-icon"><Icon /></span>
        <div>
          <h2>{t(`organic.integrity.overall.${overallKey}`)}</h2>
          <p>{t(`organic.integrity.overall.${overallKey}Detail`)}</p>
        </div>
      </header>

      <ul className="organic-integrity-sources">
        {dataQuality.sources.map(source => {
          const statusKey = STATUS_META[source.status] ? source.status : 'not_connected'
          const status = STATUS_META[statusKey]
          const SourceIcon = status.Icon
          return (
            <li key={source.key} className={`is-${status.tone}`}>
              <div className="organic-integrity-source-head">
                <SourceIcon />
                <strong>{source.label}</strong>
                <span>{t(`organic.integrity.status.${statusKey}`)}</span>
              </div>
              <p>{source.detail}</p>
              {/* Decir qué desbloquea cada fuente es lo que convierte la banda
                  en una razón para conectarla, no en una lista de reproches. */}
              {source.unlocks && source.status !== 'ready' && (
                <em>{t('organic.integrity.unlocks', { what: source.unlocks })}</em>
              )}
              {source.action && onConnect && (
                <button type="button" className="organic-link" onClick={() => onConnect(source.key)}>
                  {source.action}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {dataQuality.issues?.length > 0 && (
        <ul className="organic-integrity-issues">
          {dataQuality.issues.map(issue => <li key={issue}><RiAlertLine /> {issue}</li>)}
        </ul>
      )}
    </section>
  )
}
