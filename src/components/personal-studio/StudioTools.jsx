import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { RiDownload2Line, RiUpload2Line, RiCloseLine } from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import { createStudioZip, downloadStudioBlob } from '../../lib/studioZip'
import PageLoadingState from '../ui/PageLoadingState'

const Connections = lazy(() => import('../../pages/ConnectionsCenterPage'))
export function StudioProviders({ query }) {
  return <section className="ps-tool"><h2>Proveedores</h2><p>Conecta el servicio que necesitas. Las claves se introducen en su formulario.</p>
    <Suspense fallback={<PageLoadingState inline label="Cargando proveedores" />}><Connections embedded initialSearch={query} /></Suspense>
  </section>
}

export function StudioZip({ assets, documents = [] }) {
  const [files, setFiles] = useState([]), [selected, setSelected] = useState([])
  const [includeDocuments, setIncludeDocuments] = useState(true)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const input = useRef(null)
  async function download() {
    setBusy(true); setError(''); setNotice('')
    try {
      const chosen = assets.filter(asset => selected.includes(asset.id))
      const all = [...files, ...(includeDocuments ? documents.map(doc => new File([doc.content], doc.name, { type: 'text/plain;charset=utf-8' })) : [])]
      if (all.length + chosen.length > 25) throw new Error('Selecciona como máximo 25 archivos.')
      let total = all.reduce((sum, file) => sum + file.size, 0)
      for (const asset of chosen) {
        if (total + Number(asset.bytes || 0) > 100 * 1024 * 1024) throw new Error('La exportación admite un máximo de 100 MB.')
        const response = await apiFetch(`/api/assets/${encodeURIComponent(asset.id)}/content`)
        if (!response.ok) throw new Error('No se pudo descargar uno de los activos. Prueba de nuevo.')
        const blob = await response.blob(); total += blob.size
        if (total > 100 * 1024 * 1024) throw new Error('La exportación admite un máximo de 100 MB.')
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'application/pdf': 'pdf', 'text/plain': 'txt' }[blob.type] || 'bin'
        all.push(new File([blob], `${asset.kind}-${asset.id}.${extension}`, { type: blob.type }))
      }
      const zip = await createStudioZip(all)
      downloadStudioBlob(zip, 'mi-estudio.zip'); setNotice(`ZIP preparado con ${all.length} ${all.length === 1 ? 'archivo' : 'archivos'}. Descarga iniciada.`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <section className="ps-tool"><h2>Exportar a ZIP</h2><p>Reúne archivos de tu equipo y de esta vista de la biblioteca. Hasta 25 archivos y 100 MB.</p>
    <input ref={input} hidden type="file" multiple onChange={event => { const added = Array.from(event.target.files || []); setFiles(current => [...current, ...added]); event.target.value = ''; setNotice('') }} />
    {documents.length ? <label className="ps-include-docs"><input type="checkbox" checked={includeDocuments} disabled={busy} onChange={event => setIncludeDocuments(event.target.checked)} /> Incluir los {documents.length} documentos de este estudio</label> : null}
    <div className="ps-actions"><button className="ps-button" onClick={() => input.current.click()} disabled={busy}><RiUpload2Line /> Añadir archivos</button><button className="ps-button primary" disabled={busy || !files.length && !selected.length && !(includeDocuments && documents.length)} onClick={download}><RiDownload2Line /> {busy ? 'Preparando ZIP…' : 'Descargar ZIP'}</button></div>
    {files.length ? <ul className="ps-file-list">{files.map((file, index) => <li key={`${file.name}-${index}`}><span>{file.name}<small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></span><button className="ps-icon-button" aria-label={`Quitar ${file.name}`} disabled={busy} onClick={() => setFiles(current => current.filter((_, i) => i !== index))}><RiCloseLine /></button></li>)}</ul> : null}
    {assets.length ? <fieldset className="ps-asset-picks" disabled={busy}><legend>Activos de la biblioteca</legend>{assets.map(asset => <label key={asset.id}><input type="checkbox" checked={selected.includes(asset.id)} onChange={event => setSelected(current => event.target.checked ? [...current, asset.id] : current.filter(id => id !== asset.id))} /><span>{asset.kind} · {asset.model || asset.provider || asset.id}<small>{new Date(asset.createdAt).toLocaleDateString()}</small></span></label>)}</fieldset> : <p className="ps-note">Tu biblioteca está vacía. Puedes empezar añadiendo archivos de tu equipo.</p>}
    {error ? <p className="ps-error" role="alert">{error}</p> : null}{notice ? <p className="ps-success" role="status">{notice}</p> : null}
  </section>
}

export function StudioVideoEditor() {
  const [file, setFile] = useState(null), [url, setUrl] = useState('')
  const [duration, setDuration] = useState(0), [start, setStart] = useState(0), [end, setEnd] = useState(0)
  const [mute, setMute] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const player = useRef(null), input = useRef(null)
  useEffect(() => {
    if (!file) return
    const objectUrl = URL.createObjectURL(file); setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  function choose(event) {
    const chosen = event.target.files?.[0]; event.target.value = ''
    if (!chosen) return
    if (chosen.size > 100 * 1024 * 1024) { setError('El vídeo debe ocupar menos de 100 MB.'); return }
    setFile(chosen); setDuration(0); setStart(0); setEnd(0); setError(''); setNotice('')
  }
  async function exportVideo() {
    setBusy(true); setError(''); setNotice('')
    try {
      const query = new URLSearchParams({ start, end, mute })
      const response = await apiFetch(`/api/assets/studio/video/export?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file })
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || body.error || 'No se pudo exportar el vídeo.') }
      downloadStudioBlob(await response.blob(), `${file.name.replace(/\.[^.]+$/, '')}-editado.mp4`)
      setNotice('Vídeo exportado. Descarga iniciada.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const valid = file && duration > 0 && start >= 0 && end - start >= 0.1 && end <= duration && end - start <= 600
  return <section className="ps-tool"><h2>Editor de vídeo</h2><p>Carga un clip, elige el fragmento y descarga tu edición en MP4. Hasta 100 MB y 10 minutos por recorte.</p>
    <input hidden ref={input} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska" onChange={choose} />
    <div className="ps-video-preview">{url ? <video key={url} ref={player} src={url} controls muted={mute} playsInline onLoadedMetadata={event => { const length = event.currentTarget.duration; if (!Number.isFinite(length) || length <= 0) { setError('No se puede leer la duración de este vídeo.'); return } setDuration(length); setEnd(Math.min(length, 600)) }} onError={() => setError('No se puede previsualizar este formato. Prueba con MP4 o WebM.')} onTimeUpdate={event => { if (end > start && event.currentTarget.currentTime >= end) event.currentTarget.pause() }} /> : <button className="ps-video-upload" onClick={() => input.current.click()}><RiUpload2Line /><strong>Añade tu primer clip</strong><span>MP4, WebM o MOV</span></button>}</div>
    {file ? <><div className="ps-video-name"><strong>{file.name}</strong><button className="ps-button" disabled={busy} onClick={() => input.current.click()}>Cambiar clip</button></div><fieldset className="ps-edit-controls" disabled={busy || !duration}><legend>Recorte</legend><label>Inicio (segundos)<input type="number" min="0" max={duration} step="0.1" value={start} onChange={event => { const value = Math.max(0, Number(event.target.value)); setStart(value); if (player.current) player.current.currentTime = value }} /></label><label>Final (segundos)<input type="number" min="0.1" max={duration} step="0.1" value={end} onChange={event => setEnd(Number(event.target.value))} /></label><label className="ps-check"><input type="checkbox" checked={mute} onChange={event => setMute(event.target.checked)} /> Quitar audio</label></fieldset><div className="ps-actions"><button className="ps-button" disabled={!valid} onClick={() => { player.current.currentTime = start; player.current.play().catch(() => {}) }}>Previsualizar recorte</button><button className="ps-button primary" disabled={!valid || busy} onClick={exportVideo}><RiDownload2Line /> {busy ? 'Exportando vídeo…' : 'Exportar MP4'}</button><span className="ps-note">{valid ? `${(end - start).toFixed(1)} s` : 'Ajusta el inicio y el final'}</span></div></> : null}
    {error ? <p className="ps-error" role="alert">{error}</p> : null}{notice ? <p className="ps-success" role="status">{notice}</p> : null}
  </section>
}
