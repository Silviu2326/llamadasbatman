import { useEffect, useRef, useState } from 'react'
import { RiAlertLine, RiCloseLine, RiInboxLine, RiLoader4Line } from 'react-icons/ri'
import { formatNumber } from './backOfficeApi'

export function Badge({ tone = 'neutral', children }) {
  return <span className={`bo-badge bo-badge--${tone}`}>{children}</span>
}

export function Spinner({ label = 'Cargando' }) {
  return <p className="bo-loading" role="status"><RiLoader4Line aria-hidden="true" />{label}…</p>
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null
  return <p className="bo-error" role="alert">
    <RiAlertLine aria-hidden="true" />
    <span>{error}</span>
    {onRetry ? <button type="button" onClick={onRetry}>Reintentar</button> : null}
  </p>
}

export function EmptyState({ title, children }) {
  return <div className="bo-empty"><RiInboxLine aria-hidden="true" /><h3>{title}</h3>{children ? <p>{children}</p> : null}</div>
}

/**
 * Cifra sola, sin gráfico: un total no tiene forma que comparar, así que
 * dibujarlo como barra solo añadiría tinta. El número es el dato.
 */
export function StatTile({ label, value, hint, tone }) {
  return <article className={`bo-stat${tone ? ` bo-stat--${tone}` : ''}`}>
    <dt>{label}</dt>
    <dd>{typeof value === 'number' ? formatNumber(value) : value}</dd>
    {hint ? <small>{hint}</small> : null}
  </article>
}

/**
 * Reparto por categoría: una sola serie de magnitudes, así que un único tono y
 * la cifra escrita al lado de cada barra. Con una serie no hay identidad que
 * distinguir, de modo que una paleta categórica solo introduciría colores sin
 * significado; el orden y la longitud ya lo cuentan todo.
 */
export function DistributionBars({ rows, emptyLabel = 'Sin datos' }) {
  if (!rows?.length) return <p className="bo-muted">{emptyLabel}</p>
  const max = Math.max(...rows.map(row => row.count), 1)
  const total = rows.reduce((sum, row) => sum + row.count, 0)

  return <ul className="bo-bars">
    {rows.map(row => (
      <li key={row.key}>
        <span className="bo-bars__label" title={row.label}>{row.label}</span>
        <span className="bo-bars__track">
          <span className="bo-bars__fill" style={{ inlineSize: `${Math.max((row.count / max) * 100, 1.5)}%` }} />
        </span>
        <span className="bo-bars__value">
          {formatNumber(row.count)}
          <small>{total ? `${Math.round((row.count / total) * 100)}%` : '0%'}</small>
        </span>
      </li>
    ))}
  </ul>
}

export function Pager({ page, pages, total, onChange, busy }) {
  if (!total) return null
  return <div className="bo-pager">
    <span>{formatNumber(total)} resultado{total === 1 ? '' : 's'} · página {page} de {pages}</span>
    <div>
      <button type="button" disabled={busy || page <= 1} onClick={() => onChange(page - 1)}>Anterior</button>
      <button type="button" disabled={busy || page >= pages} onClick={() => onChange(page + 1)}>Siguiente</button>
    </div>
  </div>
}

export function Field({ label, hint, children }) {
  return <label className="bo-field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>
}

/**
 * Diálogo obligatorio para cualquier acción que muta datos de un cliente.
 *
 * El motivo no es un adorno: el backend lo exige (mínimo 8 caracteres) y lo
 * guarda en `PlatformAuditLog`. Obligar a escribirlo en el mismo gesto que
 * ejecuta la acción es la única forma de que la auditoría conserve el porqué,
 * que es justo lo que hace falta al revisarla meses después.
 */
export function ActionDialog({ title, description, confirmLabel = 'Confirmar', danger, busy, error, children, onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  const dialogRef = useRef(null)

  useEffect(() => {
    dialogRef.current?.querySelector('input, select, textarea')?.focus()
    function onKeyDown(event) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const valid = reason.trim().length >= 8

  function submit(event) {
    event.preventDefault()
    if (!valid || busy) return
    onSubmit(reason.trim())
  }

  return <div className="bo-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <form ref={dialogRef} className="bo-modal" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}>
      <header>
        <div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>
        <button type="button" className="bo-icon-button" disabled={busy} onClick={onClose} aria-label="Cerrar"><RiCloseLine aria-hidden="true" /></button>
      </header>
      <div className="bo-modal__body">
        {children}
        <Field label="Motivo" hint="Mínimo 8 caracteres. Queda registrado en la auditoría junto a tu nombre.">
          <textarea rows="3" maxLength="1000" value={reason} required onChange={event => setReason(event.target.value)} placeholder="Por qué haces este cambio" />
        </Field>
      </div>
      <ErrorNote error={error} />
      <footer>
        <button type="button" className="bo-button" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="submit" className={danger ? 'bo-button bo-button--danger' : 'bo-button bo-button--primary'} disabled={busy || !valid}>
          {busy ? 'Guardando…' : confirmLabel}
        </button>
      </footer>
    </form>
  </div>
}

/** Cierra un toast solo; los errores viven en `ErrorNote` junto a su sección. */
export function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(onClose, 6000)
    return () => clearTimeout(timer)
  }, [message, onClose])

  if (!message) return null
  return <div className="bo-toast" role="status">
    <span>{message}</span>
    <button type="button" onClick={onClose} aria-label="Cerrar aviso"><RiCloseLine aria-hidden="true" /></button>
  </div>
}
