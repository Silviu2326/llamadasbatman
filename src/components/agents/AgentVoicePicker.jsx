import React, { useEffect, useState } from 'react'
import { RiCheckLine, RiMicLine, RiPlayFill, RiSearchLine, RiSoundModuleLine, RiStopFill } from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import VoiceUploadForm from './VoiceUploadForm'
import './agent-voice-picker.css'

const LANGUAGES = [['es', 'Español'], ['en', 'Inglés'], ['fr', 'Francés'], ['pt', 'Portugués'], ['de', 'Alemán'], ['it', 'Italiano'], ['ja', 'Japonés'], ['', 'Todos los idiomas']]
const TRAITS = { female: 'Femenina', male: 'Masculina', warm: 'Cálida', calm: 'Tranquila', professional: 'Profesional', friendly: 'Cercana', conversational: 'Conversacional', clear: 'Clara', expressive: 'Expresiva', energetic: 'Enérgica', narration: 'Narración', deep: 'Grave', soft: 'Suave', confident: 'Segura' }

export default function AgentVoicePicker({ agentId, onVoiceCreated, value = '', selection, language: agentLanguage = 'es', onChange }) {
  const [mode, setMode] = useState('catalog')
  const [language, setLanguage] = useState(() => LANGUAGES.some(([code]) => code === agentLanguage?.split('-')[0]) ? agentLanguage.split('-')[0] : 'es')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [voices, setVoices] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [audioError, setAudioError] = useState('')
  const [customId, setCustomId] = useState(value)
  const [customName, setCustomName] = useState('')
  const [customError, setCustomError] = useState('')
  const chosen = voices.find(voice => voice.id === value)
  const chosenName = chosen?.name || (selection?.id === value && selection?.name) || 'Tu voz guardada'

  useEffect(() => { setCustomId(value) }, [value])
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => {
    if (mode !== 'catalog') return
    const controller = new AbortController()
    setLoading(true); setError(''); setVoices([]); setPreview(null)
    const params = new URLSearchParams({ page: String(page) })
    if (language) params.set('language', language)
    if (query) params.set('search', query)
    const load = async () => {
      try {
        const response = await apiFetch(`/api/agents/voices?${params}`, { signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'No se pudieron cargar las voces.')
        if (!controller.signal.aborted) { setVoices(body.voices || []); setHasMore(body.hasMore === true) }
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message || 'No se pudieron cargar las voces.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    load()
    return () => controller.abort()
  }, [language, query, page, retry, mode])

  const connectCustom = () => {
    const id = customId.trim()
    if (!/^[a-f0-9]{32}$/i.test(id)) { setCustomError('Pega el identificador de 32 caracteres de la voz en Fish Audio.'); return }
    setCustomError(''); onChange(id, customName.trim() || 'Voz propia')
  }

  return <section className="voice-picker" aria-label="Selector de voces">
    <div className="voice-picker-intro"><span className="voice-picker-mark"><RiSoundModuleLine /></span><div><h4>Dale una voz que encaje contigo</h4><p>Escucha, compara y elige cómo sonará tu agente.</p></div></div>
    {value ? <div className="voice-picker-selected" role="status"><RiCheckLine /><span><small>Voz seleccionada</small><strong>{chosenName}</strong></span><span className="voice-picker-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span></div> : null}
    <div className="voice-picker-modes" aria-label="Origen de la voz">
      <button type="button" aria-pressed={mode === 'catalog'} onClick={() => { setMode('catalog'); setPreview(null) }}><RiSoundModuleLine />Explorar voces</button>
      {/* Subir una voz propia necesita un agente ya creado (POST /agents/:id/voices). */}
      {agentId ? <button type="button" aria-pressed={mode === 'custom'} onClick={() => { setMode('custom'); setPreview(null) }}><RiMicLine />Mi propia voz</button> : null}
    </div>
    {!agentId ? <p className="voice-picker-footnote">Podrás subir una voz propia desde la ficha del agente una vez creado.</p> : null}
    {mode === 'catalog' ? <>
      <div className="voice-picker-filters">
        <label className="voice-picker-search"><span>Buscar voz</span><div><RiSearchLine /><input type="search" value={search} maxLength={80} onChange={event => setSearch(event.target.value)} placeholder="Nombre de la voz…" /></div></label>
        <label><span>Idioma de la muestra</span><select value={language} onChange={event => { setLanguage(event.target.value); setPage(1) }}>{LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
      </div>
      {preview ? <div className="voice-picker-player"><span>Muestra de <strong>{preview.name}</strong></span><audio key={preview.id} src={preview.previewUrl} controls autoPlay preload="none" onEnded={() => setPreview(null)} onError={() => setAudioError('No se pudo reproducir esta muestra. Prueba otra voz.')} aria-label={`Muestra de ${preview.name}`} />{audioError ? <p role="alert">{audioError}</p> : null}</div> : null}
      {loading ? <div className="voice-picker-grid" aria-busy="true" aria-label="Cargando voces">{[0, 1, 2, 3].map(item => <div key={item} className="voice-picker-skeleton"><i /><span /><span /></div>)}</div>
        : error ? <div className="voice-picker-empty" role="alert"><RiMicLine /><p>{error}</p><button type="button" onClick={() => setRetry(current => current + 1)}>Volver a intentar</button></div>
          : voices.length === 0 ? <div className="voice-picker-empty" role="status"><RiSearchLine /><strong>No hemos encontrado voces</strong><p>Prueba otro nombre o elige otro idioma.</p><button type="button" onClick={() => { setSearch(''); setQuery(''); setLanguage(''); setPage(1) }}>Ver todas las voces</button></div>
            : <div className="voice-picker-grid">{voices.map((voice, index) => <article className={`voice-picker-card tone-${index % 3} ${value === voice.id ? 'is-selected' : ''}`} key={voice.id}>
              <div className="voice-picker-card-top"><span className="voice-picker-avatar" aria-hidden="true">{voice.name.slice(0, 1).toUpperCase()}</span><div><h5 title={voice.name}>{voice.name}</h5><small>Por {voice.author}</small></div></div>
              <div className="voice-picker-traits">{voice.tags.filter(tag => TRAITS[tag]).slice(0, 3).map(tag => <span key={tag}>{TRAITS[tag]}</span>)}</div>
              <div className="voice-picker-card-actions"><button type="button" className="voice-picker-listen" disabled={!voice.previewUrl} aria-label={`${preview?.id === voice.id ? 'Detener' : 'Escuchar'} ${voice.name}`} onClick={() => { setAudioError(''); setPreview(current => current?.id === voice.id ? null : voice) }}>{preview?.id === voice.id ? <RiStopFill /> : <RiPlayFill />}{preview?.id === voice.id ? 'Detener' : voice.previewUrl ? 'Escuchar' : 'Sin muestra'}</button><button type="button" className="voice-picker-choose" aria-pressed={value === voice.id} aria-label={`Elegir ${voice.name}`} onClick={() => onChange(voice.id, voice.name)}>{value === voice.id ? <><RiCheckLine />Elegida</> : 'Elegir'}</button></div>
            </article>)}</div>}
      {!loading && !error && (page > 1 || hasMore) ? <nav className="voice-picker-pagination" aria-label="Páginas de voces"><button type="button" disabled={page === 1} onClick={() => setPage(current => current - 1)}>Anterior</button><span>Página {page}</span><button type="button" disabled={!hasMore} onClick={() => setPage(current => current + 1)}>Más voces</button></nav> : null}
      <p className="voice-picker-footnote">Voces públicas de Fish Audio. La autorización de uso se registra debajo. La muestra conserva su idioma original.</p>
    </> : <div className="voice-picker-custom">
      <VoiceUploadForm agentId={agentId} value={value} onCreated={voice => { onChange(voice.id, voice.name); onVoiceCreated?.(voice.consentRegistered ? voice.id : null) }} />
      <details className="voice-upload-manual"><summary>Ya tengo un identificador de voz</summary><div>
      <label><span>Nombre para reconocerla (opcional)</span><input value={customName} maxLength={80} onChange={event => setCustomName(event.target.value)} placeholder="Ej. Mi voz de atención al cliente" /></label>
      <label><span>Identificador de la voz</span><input value={customId} maxLength={200} onChange={event => { setCustomId(event.target.value); setCustomError('') }} placeholder="Pega el ID de Fish Audio" spellCheck={false} aria-invalid={Boolean(customError)} /></label>
      {customError ? <p role="alert">{customError}</p> : null}
      <button type="button" className="voice-picker-connect" disabled={!customId.trim()} onClick={connectCustom}><RiCheckLine />Usar esta voz</button>
      </div></details>
    </div>}
  </section>
}
