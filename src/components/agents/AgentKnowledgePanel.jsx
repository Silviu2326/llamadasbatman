import { useCallback, useEffect, useMemo, useState } from 'react'
import { RiBookOpenLine, RiExternalLinkLine, RiEyeLine, RiLoader4Line, RiRefreshLine } from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import '../knowledge-base.css'

/**
 * Panel «Documentos de entrenamiento» de la ficha del agente.
 *
 * Antes estaba vacío por diseño (`docs: [], extraDocs: 0`). Ahora lee los
 * documentos de la organización y cuáles usa este agente
 * (`Agent.settings.knowledgeIds`, «usar todos» por defecto), permite
 * cambiarlos y enseña el prompt real que recibiría el LLM ahora mismo con
 * las fuentes que entraron (`GET /api/knowledge/prompt-preview`).
 */

const SOURCE_LABEL = { upload: 'Archivo', url: 'Web', manual: 'Texto', generated: 'Generado' }
const KIND_LABEL = {
  base_prompt: 'Guion del agente',
  persona: 'Identidad por defecto',
  lead: 'Ficha del lead',
  company_profile: 'Perfil de empresa',
  knowledge: 'Base de conocimiento',
  phases: 'Fases de la llamada',
  strategy: 'Estrategia',
  operating_notes: 'Guion propio, mensajes clave y escalado',
  signals: 'Señales de conversación',
  style: 'Estilo al hablar',
  behavior: 'Comportamiento configurado',
}

function formatChars(value) {
  return `${Number(value || 0).toLocaleString('es-ES')} car.`
}

async function readError(response, fallback) {
  const body = await response.json().catch(() => null)
  return body?.error || fallback
}

export default function AgentKnowledgePanel({ agentId, onNavigate }) {
  const [links, setLinks] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [useAll, setUseAll] = useState(true)
  const [selected, setSelected] = useState([])
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)

  const load = useCallback(async () => {
    if (!agentId) return
    setLoading(true)
    setError('')
    try {
      const response = await apiFetch(`/api/knowledge/agent-links?agentId=${encodeURIComponent(agentId)}`)
      if (!response.ok) throw new Error(await readError(response, 'No se pudieron cargar los documentos del agente.'))
      const body = await response.json()
      setLinks(body)
      setUseAll(body.useAll !== false)
      setSelected(Array.isArray(body.knowledgeIds) ? body.knowledgeIds : [])
    } catch (loadError) {
      setError(loadError?.message || 'No se pudieron cargar los documentos del agente.')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => { load() }, [load])

  const documents = links?.documents ?? []
  const dirty = useMemo(() => {
    if (!links) return false
    if (useAll !== (links.useAll !== false)) return true
    if (useAll) return false
    const current = [...selected].sort().join('|')
    const stored = [...(links.knowledgeIds ?? [])].sort().join('|')
    return current !== stored
  }, [links, useAll, selected])

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setError('')
    try {
      const response = await apiFetch('/api/knowledge/agent-links', {
        method: 'PUT',
        body: JSON.stringify({ agentId, knowledgeIds: useAll ? null : selected }),
      })
      if (!response.ok) throw new Error(await readError(response, 'No se pudo guardar la selección.'))
      const body = await response.json()
      setLinks(body)
      setUseAll(body.useAll !== false)
      setSelected(Array.isArray(body.knowledgeIds) ? body.knowledgeIds : [])
      setSavedAt(Date.now())
      setPreview(null)
    } catch (saveError) {
      setError(saveError?.message || 'No se pudo guardar la selección.')
    } finally {
      setSaving(false)
    }
  }

  const loadPreview = async () => {
    setPreviewLoading(true)
    setPreviewError('')
    try {
      const response = await apiFetch(`/api/knowledge/prompt-preview?agentId=${encodeURIComponent(agentId)}`)
      if (!response.ok) throw new Error(await readError(response, 'No se pudo generar la vista previa del prompt.'))
      setPreview(await response.json())
    } catch (previewFailure) {
      setPreviewError(previewFailure?.message || 'No se pudo generar la vista previa del prompt.')
    } finally {
      setPreviewLoading(false)
    }
  }

  const toggle = id => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const activeCount = useAll ? documents.length : selected.length
  const knowledgeSource = preview?.sources?.find(source => source.kind === 'knowledge')

  return (
    <div className="agent-detail-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px' }}>
      <p style={{ margin: '0 0 10px', fontSize: 10.5, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Documentos de entrenamiento</p>

      {loading ? <p className="agent-detail-card-empty"><RiLoader4Line className="kb-upload-spinner" aria-hidden="true" /> Cargando documentos…</p> : null}
      {error ? <p role="alert" style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--danger)' }}>{error} <button type="button" onClick={load} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Reintentar</button></p> : null}

      {!loading && links ? (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text)', marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={useAll} onChange={event => setUseAll(event.target.checked)} />
            <span>Usar todos los documentos de la empresa <small style={{ color: 'var(--dim)' }}>({documents.length})</small></span>
          </label>

          {documents.length === 0 ? <p className="agent-detail-card-empty">Sin fuentes añadidas todavía. Sube un PDF, pega texto o añade una web en Documentos.</p> : null}

          {!useAll && documents.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto', paddingRight: 2 }}>
              {documents.map(document => (
                <label key={document.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 10px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.includes(document.id)} onChange={() => toggle(document.id)} style={{ marginTop: 2 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text)', overflowWrap: 'anywhere' }}>{document.name}</span>
                    <small style={{ fontSize: 11, color: 'var(--dim)' }}>{SOURCE_LABEL[document.sourceType] || document.type} · {formatChars(document.contentChars)}{document.contentChars === 0 ? ' · sin texto extraído' : ''}</small>
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          {useAll && documents.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {documents.slice(0, 4).map(document => (
                <div key={document.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{document.name}</span>
                  <small style={{ fontSize: 11, color: 'var(--dim)', flexShrink: 0 }}>{formatChars(document.contentChars)}</small>
                </div>
              ))}
              {documents.length > 4 ? <small style={{ fontSize: 11.5, color: 'var(--dim)', padding: '0 10px' }}>+{documents.length - 4} más</small> : null}
            </div>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={save} disabled={!dirty || saving} style={{ padding: '7px 12px', background: dirty ? 'var(--accent)' : 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, color: dirty ? 'var(--on-accent, #fff)' : 'var(--dim)', fontSize: 12, fontWeight: 600, cursor: dirty ? 'pointer' : 'default', fontFamily: 'inherit' }}>
              {saving ? 'Guardando…' : 'Guardar selección'}
            </button>
            <small style={{ fontSize: 11.5, color: 'var(--dim)' }}>
              {savedAt && !dirty ? 'Guardado. ' : ''}En la llamada entran hasta 8 fichas de {activeCount} elegidas, ordenadas por relevancia con el rol del agente y la conversación.
            </small>
          </div>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Qué sabe el agente ahora mismo</p>
              <button type="button" onClick={loadPreview} disabled={previewLoading} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--muted)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                {previewLoading ? <RiLoader4Line className="kb-upload-spinner" aria-hidden="true" /> : preview ? <RiRefreshLine aria-hidden="true" /> : <RiEyeLine aria-hidden="true" />}
                {preview ? 'Actualizar' : 'Ver prompt real'}
              </button>
            </div>
            {previewError ? <p role="alert" style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--danger)' }}>{previewError}</p> : null}
            {preview ? (
              <div style={{ marginTop: 8 }}>
                <small style={{ display: 'block', fontSize: 11.5, color: 'var(--dim)', marginBottom: 6 }}>
                  {formatChars(preview.totalChars)} de {formatChars(preview.budget)} de presupuesto{preview.trimmed ? ' · se recortó contexto para entrar en el presupuesto' : ''}.
                </small>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {preview.sources.map(source => (
                    <li key={source.kind} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: 'var(--muted)' }}>
                      <span>{KIND_LABEL[source.kind] || source.label}</span>
                      <span style={{ color: 'var(--dim)', flexShrink: 0 }}>{source.charsIncluded < source.chars ? `${formatChars(source.charsIncluded)} de ${formatChars(source.chars)}` : formatChars(source.chars)}</span>
                    </li>
                  ))}
                </ul>
                {knowledgeSource?.entries?.length ? (
                  <div style={{ marginTop: 8 }}>
                    <small style={{ display: 'block', fontSize: 11, color: 'var(--dim)', marginBottom: 4 }}>Fichas que entraron</small>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: 'var(--muted)' }}>
                      {knowledgeSource.entries.map(entry => <li key={entry.id}>{entry.name} <span style={{ color: 'var(--dim)' }}>· relevancia {entry.score} · {formatChars(entry.chars)}</span></li>)}
                    </ul>
                  </div>
                ) : <small style={{ display: 'block', marginTop: 8, fontSize: 11.5, color: 'var(--dim)' }}>Ninguna ficha de conocimiento entró en el prompt.</small>}
                <button type="button" onClick={() => setShowPrompt(open => !open)} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, padding: 0, fontFamily: 'inherit' }}>
                  {showPrompt ? 'Ocultar prompt completo' : 'Mostrar prompt completo'}
                </button>
                {showPrompt ? <pre style={{ marginTop: 8, maxHeight: 320, overflow: 'auto', fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, color: 'var(--muted)' }}>{preview.prompt}</pre> : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <button className="agent-detail-card-action" type="button" onClick={() => onNavigate?.('/knowledge-base')}><RiBookOpenLine /> Gestionar fuentes <RiExternalLinkLine /></button>
    </div>
  )
}
