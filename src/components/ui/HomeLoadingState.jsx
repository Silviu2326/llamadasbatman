import './home-loading-state.css'
import HomePageFrame from './HomePageFrame'

export function HomeLoadingIndicator({ label = 'Actualizando…' }) {
  return <div className="home-loading-status" role="status">
    <span className="home-loading-orbit" aria-hidden="true"><i /></span>
    <span>{label}</span>
  </div>
}

/** Placeholders describe the layout, never fabricated figures or progress. */
export default function HomeLoadingState({ variant = 'list', label = 'Cargando…' }) {
  const metrics = variant === 'metrics' || variant === 'analysis'
  return <div className={`home-loading home-loading--${variant}`}>
    <HomeLoadingIndicator label={label} />
    <div className="home-loading-preview" aria-hidden="true">
      {metrics ? <div className="home-loading-metrics">
        {Array.from({ length: variant === 'analysis' ? 4 : 2 }, (_, index) => <div className="home-loading-metric" key={index}>
          <span className="home-loading-block is-label" /><span className="home-loading-block is-value" />
          <span className="home-loading-block is-detail" /><span className="home-loading-block is-track" />
        </div>)}
      </div> : <div className="home-loading-rows">
        {Array.from({ length: 3 }, (_, index) => <div className="home-loading-row" key={index}>
          <span className="home-loading-block is-badge" /><div><span className="home-loading-block is-title" /><span className="home-loading-block is-detail" /></div>
          {variant !== 'activity' ? <span className="home-loading-block is-button" /> : null}
        </div>)}
      </div>}
      {variant === 'analysis' ? <div className="home-loading-chart"><span className="home-loading-block is-title" /><div className="home-loading-chart-area" /></div> : null}
    </div>
  </div>
}

const pages = {
  dashboard: { variant: 'list', label: 'Preparando tu resumen…' },
  plan: { variant: 'metrics', label: 'Preparando tus objetivos…' },
  insights: { variant: 'analysis', label: 'Preparando tus resultados…' },
}

export function HomeRouteLoading({ page }) {
  const copy = pages[page]
  return <HomePageFrame page={page} className="home-route-loading">
    <HomeLoadingState variant={copy.variant} label={copy.label} />
  </HomePageFrame>
}
