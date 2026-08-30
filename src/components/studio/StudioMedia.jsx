import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RiArrowLeftSLine, RiArrowRightSLine, RiCloseLine, RiDownload2Line,
  RiFilmLine, RiImageLine, RiLoader4Line, RiMusic2Line, RiZoomInLine,
} from 'react-icons/ri'
import { useAssetUrl } from '../../lib/assetUrls'

/**
 * Superficie multimedia del Studio: miniatura perezosa, reproductor en línea y
 * caja de luz con teclado. El Studio produce imagen y vídeo pero la pantalla
 * solo enseñaba identificadores; aquí se ve la pieza.
 */

const KIND_ICON = { image: RiImageLine, video: RiFilmLine, audio: RiMusic2Line }

/** Carga la URL solo cuando el elemento entra en el viewport. */
function useInView(enabled) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(!enabled)
  useEffect(() => {
    if (seen) return undefined
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); setSeen(true) }
    }, { rootMargin: '200px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [seen])
  return [ref, seen]
}

export function AssetMedia({ assetId, kind = 'image', alt = '', controls = false, className = '', lazy = true, onClick }) {
  const [ref, seen] = useInView(lazy)
  const { url, state } = useAssetUrl(assetId, seen)
  const Icon = KIND_ICON[kind] || RiImageLine
  const interactive = typeof onClick === 'function'

  let body
  if (!assetId) {
    body = <span className="studio-media-fallback"><Icon /><small>Sin activo</small></span>
  } else if (!url) {
    // `idle` es el instante previo a entrar en el viewport: se muestra como
    // carga, no como error, para que la rejilla no parpadee en rojo al hacer
    // scroll.
    body = state === 'error'
      ? <span className="studio-media-fallback"><Icon /><small>Vista previa no disponible</small></span>
      : <span className="studio-media-fallback"><RiLoader4Line className="studio-spin" /></span>
  } else if (kind === 'video') {
    body = <video src={url} controls={controls} preload="metadata" playsInline />
  } else if (kind === 'audio') {
    body = <audio src={url} controls preload="metadata" />
  } else {
    body = <img src={url} alt={alt} loading="lazy" />
  }

  return (
    <div ref={ref} className={`studio-media ${className}`.trim()} data-kind={kind}>
      {body}
      {interactive && url ? (
        <button type="button" className="studio-media-open" onClick={onClick} aria-label={`Ampliar: ${alt || 'vista previa'}`}>
          <RiZoomInLine />
        </button>
      ) : null}
    </div>
  )
}

/**
 * Caja de luz. Cierra con Escape, navega con las flechas y devuelve el foco al
 * disparador; el fondo queda inerte mientras está abierta.
 */
export function MediaLightbox({ items, index, onIndex, onClose }) {
  const dialogRef = useRef(null)
  const returnTo = useRef(null)
  const item = items[index]
  const { url } = useAssetUrl(item?.assetId, Boolean(item?.assetId))

  const move = useCallback(step => {
    if (!items.length) return
    onIndex((index + step + items.length) % items.length)
  }, [index, items.length, onIndex])

  useEffect(() => {
    returnTo.current = document.activeElement
    dialogRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(event) {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      else if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      const node = returnTo.current
      if (node && typeof node.focus === 'function') node.focus()
    }
  }, [move, onClose])

  if (!item) return null

  return (
    <div className="studio-lightbox" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div
        ref={dialogRef}
        className="studio-lightbox-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={item.title || 'Vista previa'}
        tabIndex={-1}
      >
        <header>
          <div>
            <strong>{item.title}</strong>
            {item.subtitle ? <small>{item.subtitle}</small> : null}
          </div>
          <div className="studio-lightbox-tools">
            <span className="studio-lightbox-count">{index + 1} / {items.length}</span>
            {url ? (
              <a className="studio-icon-button" href={url} download target="_blank" rel="noreferrer" aria-label="Abrir original">
                <RiDownload2Line />
              </a>
            ) : null}
            <button type="button" className="studio-icon-button" onClick={onClose} aria-label="Cerrar (Esc)"><RiCloseLine /></button>
          </div>
        </header>
        <div className="studio-lightbox-stage">
          {items.length > 1 ? (
            <button type="button" className="studio-lightbox-nav prev" onClick={() => move(-1)} aria-label="Anterior (flecha izquierda)"><RiArrowLeftSLine /></button>
          ) : null}
          <AssetMedia
            key={item.assetId}
            assetId={item.assetId}
            kind={item.kind || 'image'}
            alt={item.title}
            controls
            lazy={false}
            className="contain"
          />
          {items.length > 1 ? (
            <button type="button" className="studio-lightbox-nav next" onClick={() => move(1)} aria-label="Siguiente (flecha derecha)"><RiArrowRightSLine /></button>
          ) : null}
        </div>
        {item.meta?.length ? (
          <dl className="studio-lightbox-meta">
            {item.meta.map(entry => (
              <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.value || '—'}</dd></div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  )
}
