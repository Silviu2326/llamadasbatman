import './page-loading-state.css'

export default function PageLoadingState({ label = 'Cargando', description = 'Preparando la información…', className = '', inline = false }) {
  const Root = inline ? 'div' : 'main'

  return (
    <Root className={`page-loading-shell${inline ? ' page-loading-inline' : ''} ${className}`.trim()} aria-busy="true">
      <section className="page-loading-state" role="status" aria-live="polite">
        <span className="page-loading-spinner" aria-hidden="true" />
        <strong>{label}</strong>
        {description ? <p>{description}</p> : null}
      </section>
    </Root>
  )
}
