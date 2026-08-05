import { RiAlertLine, RiCheckboxCircleLine, RiErrorWarningLine, RiPlugLine, RiShieldCheckLine, RiTimeLine } from 'react-icons/ri'

// Banda de integridad de organico.md §5.1. Va antes que cualquier número, por
// el mismo motivo que en Ads: la página no puede pedir confianza en una cifra
// sin decir primero de qué fuentes sale y cuáles no están midiendo.
//
// La distinción que hace útil este componente es "conectada, sin ingesta": una
// integración autorizada cuyo dato todavía no se lee no es un panel vacío ni
// un cero. Callarlo hace creer que el negocio no tiene tráfico cuando lo que
// falta es la lectura.

const STATUS_COPY = {
  ready: { label: 'Midiendo', tone: 'ok', Icon: RiCheckboxCircleLine },
  connected_no_ingest: { label: 'Conectada, sin ingesta', tone: 'warn', Icon: RiTimeLine },
  not_connected: { label: 'Sin conectar', tone: 'idle', Icon: RiPlugLine },
  not_configured: { label: 'Sin configurar', tone: 'idle', Icon: RiPlugLine },
  error: { label: 'Con errores', tone: 'bad', Icon: RiErrorWarningLine },
}

const OVERALL = {
  ready: {
    label: 'Fuentes listas',
    detail: 'Todas las fuentes conectadas están entregando datos.',
    tone: 'ok',
    Icon: RiShieldCheckLine,
  },
  partial: {
    label: 'Medición parcial',
    detail: 'Parte del circuito orgánico se mide; el resto todavía no entrega datos.',
    tone: 'warn',
    Icon: RiAlertLine,
  },
  stale: {
    label: 'Datos desfasados',
    detail: 'Las fuentes conectadas llevan tiempo sin sincronizar.',
    tone: 'warn',
    Icon: RiTimeLine,
  },
  unreliable: {
    label: 'Sin medición fiable',
    detail: 'No hay ninguna fuente entregando datos: los canales no se pueden comparar.',
    tone: 'bad',
    Icon: RiErrorWarningLine,
  },
}

export default function OrganicDataIntegrity({ dataQuality, onConnect }) {
  if (!dataQuality) return null
  const overall = OVERALL[dataQuality.status] ?? OVERALL.partial
  const { Icon } = overall

  return (
    <section className={`organic-integrity is-${overall.tone}`} aria-label="Integridad de las fuentes orgánicas">
      <header>
        <span className="organic-integrity-icon"><Icon /></span>
        <div>
          <h2>{overall.label}</h2>
          <p>{overall.detail}</p>
        </div>
      </header>

      <ul className="organic-integrity-sources">
        {dataQuality.sources.map(source => {
          const status = STATUS_COPY[source.status] ?? STATUS_COPY.not_connected
          const SourceIcon = status.Icon
          return (
            <li key={source.key} className={`is-${status.tone}`}>
              <div className="organic-integrity-source-head">
                <SourceIcon />
                <strong>{source.label}</strong>
                <span>{status.label}</span>
              </div>
              <p>{source.detail}</p>
              {/* Decir qué desbloquea cada fuente es lo que convierte la banda
                  en una razón para conectarla, no en una lista de reproches. */}
              {source.unlocks && source.status !== 'ready' && (
                <em>Desbloquea: {source.unlocks}</em>
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
