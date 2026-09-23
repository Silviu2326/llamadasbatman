import React, { useEffect, useRef, useState } from 'react'
import { RiCheckLine, RiLoader4Line, RiMicLine, RiUploadCloud2Line } from 'react-icons/ri'
import { apiFetch } from '../../lib/api'

const MAX_BYTES = 10 * 1024 * 1024
const readAudio = file => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1])
  reader.onerror = () => reject(new Error('No se pudo leer el audio. Selecciónalo de nuevo.'))
  reader.readAsDataURL(file)
})

export default function VoiceUploadForm({ agentId, value, onCreated }) {
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const [duration, setDuration] = useState(null)
  const [name, setName] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('')
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [uploads, setUploads] = useState([])
  const [success, setSuccess] = useState('')
  const [reload, setReload] = useState(0)
  const active = useRef(null)
  const inputRef = useRef(null)
  const busyRef = useRef(false)
  const onCreatedRef = useRef(onCreated)
  onCreatedRef.current = onCreated

  useEffect(() => {
    if (!file) { setUrl(''); return }
    const local = URL.createObjectURL(file)
    setUrl(local)
    return () => URL.revokeObjectURL(local)
  }, [file])
  useEffect(() => () => active.current?.abort(), [])
  useEffect(() => {
    if (!agentId) return
    const controller = new AbortController()
    setListError('')
    apiFetch(`/api/agents/${agentId}/voices`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('No se pudieron cargar tus voces.')
      const body = await response.json()
      if (!controller.signal.aborted) setUploads(body)
    }).catch(err => { if (!controller.signal.aborted) setListError(err.message) })
    return () => controller.abort()
  }, [agentId, reload])

  const chooseFile = candidate => {
    if (busyRef.current) return
    setError(''); setSuccess(''); setDuration(null); setConfirmed(false); setFile(null)
    if (!candidate) return
    if (!/\.(mp3|wav)$/i.test(candidate.name) || candidate.size === 0 || candidate.size > MAX_BYTES) {
      setError('Elige un MP3 o WAV de hasta 10 MB.'); if (inputRef.current) inputRef.current.value = ''; return
    }
    setFile(candidate)
    if (!name.trim()) setName(candidate.name.replace(/\.[^.]+$/, '').slice(0, 80))
  }
  const request = async (path, options, signal) => {
    const response = await apiFetch(path, { ...options, signal })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'No se pudo completar la subida. Vuelve a comprobar tus voces.')
    return body
  }
  const complete = result => {
    onCreatedRef.current(result.voice)
    setUploads(current => [result, ...current.filter(item => item.requestId !== result.requestId)])
    setSuccess(`${result.voice.name} está creada y seleccionada. Guarda los cambios para usarla en el agente.`)
    setFile(null); setDuration(null); setConfirmed(false)
    if (inputRef.current) inputRef.current.value = ''
  }
  const run = async requestId => {
    if (busyRef.current || !agentId) return
    if (!requestId && (!file || !duration || !name.trim() || !subjectName.trim() || !confirmed)) return
    busyRef.current = true; setBusy(true); setError(''); setSuccess('')
    const controller = new AbortController(); active.current = controller
    try {
      setPhase(requestId ? 'Comprobando tu voz…' : 'Subiendo y creando tu voz…')
      let result = requestId
        ? await request(`/api/agents/${agentId}/voices/${requestId}`, {}, controller.signal)
        : await request(`/api/agents/${agentId}/voices`, { method: 'POST', body: JSON.stringify({ name: name.trim(), subjectName: subjectName.trim(), confirmed, audioBase64: await readAudio(file) }) }, controller.signal)
      if (controller.signal.aborted) return
      if (result.status === 'processing') setUploads(current => [result, ...current.filter(item => item.requestId !== result.requestId)])
      for (let attempt = 0; result.status === 'processing' && attempt < 20; attempt++) {
        setPhase('Preparando tu voz. Puedes dejar esta pantalla; la creación quedará guardada.')
        await new Promise(resolve => { const timer = setTimeout(done, 3000); function done() { clearTimeout(timer); controller.signal.removeEventListener('abort', done); resolve() } controller.signal.addEventListener('abort', done, { once: true }) })
        if (controller.signal.aborted) return
        result = await request(`/api/agents/${agentId}/voices/${result.requestId}`, {}, controller.signal)
      }
      if (result.status === 'ready') complete(result)
      else setError('Tu voz sigue en preparación. Pulsa «Comprobar» en tus voces dentro de unos momentos.')
    } catch (err) {
      if (!controller.signal.aborted) { setError(err.message || 'No se pudo conectar. Revisa tus voces antes de volver a subir.'); setReload(current => current + 1) }
    } finally {
      busyRef.current = false
      if (!controller.signal.aborted) { setBusy(false); setPhase('') }
    }
  }

  return <div className="voice-upload">
    <div className="voice-picker-custom-heading"><RiMicLine /><h4>Tu voz, desde aquí</h4><p>Sube una grabación y crea la voz de tu agente sin salir de Vendrava.</p></div>
    {uploads.length ? <div className="voice-upload-library"><strong>Tus voces</strong>{uploads.map(item => <div key={item.requestId}><span>{item.voice?.name || item.name}<small>{item.status === 'ready' ? 'Privada · Lista para usar' : 'En preparación'}</small></span><button type="button" disabled={busy} onClick={() => item.status === 'ready' ? onCreatedRef.current(item.voice) : run(item.requestId)}>{item.status !== 'ready' ? 'Comprobar' : value === item.voice.id ? 'Seleccionada' : 'Usar voz'}</button></div>)}</div> : null}
    {listError ? <div className="voice-upload-list-error" role="status">{listError} <button type="button" onClick={() => setReload(current => current + 1)}>Reintentar</button></div> : null}
    <label className={`voice-upload-drop ${file ? 'has-file' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]) }}>
      <RiUploadCloud2Line /><strong>{file ? file.name : 'Arrastra tu grabación aquí'}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB${duration ? ` · ${Math.round(duration)} s` : ''}` : 'O elige un archivo · MP3 o WAV · Hasta 10 MB'}</span>
      <input ref={inputRef} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" aria-label="Grabación de voz" disabled={busy} onChange={event => chooseFile(event.target.files[0])} />
    </label>
    {url ? <div className="voice-upload-preview"><span>Escucha tu grabación antes de enviarla</span><audio key={url} src={url} controls preload="metadata" aria-label="Tu grabación" onLoadedMetadata={event => { const seconds = event.currentTarget.duration; if (Number.isFinite(seconds) && seconds > 0) setDuration(seconds); else { setDuration(null); setError('No se pudo leer la duración del audio. Prueba otro archivo.') } }} onError={() => { setDuration(null); setError('Este archivo no se puede reproducir. Prueba otro MP3 o WAV.') }} /></div> : null}
    <p className="voice-upload-tip">Para un mejor resultado: 20–60 segundos, una sola persona y sin música ni ruido de fondo.</p>
    <label><span>Nombre de la voz</span><input value={name} maxLength={80} disabled={busy} onChange={event => setName(event.target.value)} placeholder="Ej. Laura · Atención al cliente" /></label>
    <label><span>Persona a la que pertenece la voz</span><input value={subjectName} maxLength={160} disabled={busy} onChange={event => { setSubjectName(event.target.value); setConfirmed(false) }} placeholder="Nombre completo" /></label>
    <label className="voice-upload-consent"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /><span>Soy esta persona o tengo su permiso para crear una copia de su voz y utilizarla en las llamadas del agente. Autorizo el envío del audio a Fish Audio para crear una voz privada.</span></label>
    {error ? <p className="voice-upload-error" role="alert">{error}</p> : null}
    {success ? <p className="voice-upload-success" role="status"><RiCheckLine />{success}</p> : null}
    <button type="button" className="voice-picker-connect" disabled={busy || !agentId || !file || !duration || !name.trim() || !subjectName.trim() || !confirmed} onClick={() => run()}>{busy ? <RiLoader4Line className="voice-upload-spinner" /> : <RiUploadCloud2Line />}{busy ? 'Creando voz…' : 'Crear y seleccionar voz'}</button>
    {busy ? <p role="status">{phase}</p> : <small>El audio solo se envía al pulsar «Crear y seleccionar voz».</small>}
  </div>
}
