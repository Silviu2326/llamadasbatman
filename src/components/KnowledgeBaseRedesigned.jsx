import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RiAddLine, RiBookReadLine, RiCheckLine, RiCloseLine, RiDeleteBin6Line,
  RiErrorWarningLine, RiFileTextLine, RiLink, RiLoader4Line, RiMoreLine,
  RiShieldCheckLine, RiUploadCloud2Line,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { classifyFetchError, isRetryableDataError, retryDelayMs, statusMessage } from '../lib/dataStatus'
import { localeCode, getLocale } from '../i18n'
import DataStatusBanner from './ui/DataStatusBanner'
import PageLoadingState from './ui/PageLoadingState'
import ProductPageHeader from './ui/ProductPageHeader'
import NewArticuloModal from '../modals/NewArticuloModal'
import './knowledge-base.css'

const MAX_DATA_RETRIES = 3

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function UploadKnowledgeDialog({ onClose, onComplete }) {
  const inputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const addFiles = fileList => {
    const incoming = Array.from(fileList ?? [])
    const accepted = incoming.filter(file => /\.(pdf|docx?|txt|md|csv|json)$/i.test(file.name) && file.size <= 10 * 1024 * 1024)
    setError(accepted.length === incoming.length ? '' : 'Solo se admiten PDF, DOC, DOCX, TXT, MD, CSV o JSON de hasta 10 MB.')
    setFiles(current => [...current, ...accepted
      .filter(file => !current.some(item => item.file.name === file.name && item.file.size === file.size))
      .map(file => ({ file, status: 'ready' }))])
  }

  const uploadFiles = async () => {
    if (!files.length || uploading) return
    setUploading(true)
    let completed = 0
    for (const item of files) {
      if (item.status === 'done') continue
      setFiles(current => current.map(entry => entry.file === item.file ? { ...entry, status: 'uploading' } : entry))
      try {
        const isText = /\.(txt|md|csv|json)$/i.test(item.file.name) || item.file.type.startsWith('text/')
        const content = isText ? await item.file.text() : `Archivo importado: ${item.file.name} (${formatBytes(item.file.size)}).`
        const fileUrl = isText ? undefined : await fileToDataUrl(item.file)
        const response = await apiFetch('/api/knowledge', {
          method: 'POST',
          body: JSON.stringify({ name: item.file.name.replace(/\.[^.]+$/, ''), type: 'document', content, fileUrl }),
        })
        if (!response.ok) throw new Error('upload_failed')
        completed += 1
        setFiles(current => current.map(entry => entry.file === item.file ? { ...entry, status: 'done' } : entry))
      } catch {
        setFiles(current => current.map(entry => entry.file === item.file ? { ...entry, status: 'error' } : entry))
      }
    }
    setUploading(false)
    if (completed > 0) onComplete?.()
  }

  return <div className="kb-upload-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !uploading) onClose() }}>
    <section className="kb-upload-panel" role="dialog" aria-modal="true" aria-labelledby="kb-upload-title">
      <div className="kb-upload-header"><div><h2 id="kb-upload-title">Subir conocimiento</h2><p>Añade documentos que tus agentes puedan consultar durante las llamadas.</p></div><button className="kb-upload-close" onClick={onClose} disabled={uploading} aria-label="Cerrar"><RiCloseLine /></button></div>
      <div className={`kb-dropzone ${dragging ? 'is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }} onClick={() => inputRef.current?.click()}>
        <input ref={inputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt,.md,.csv,.json" onChange={event => addFiles(event.target.files)} />
        <span className="kb-dropzone-icon"><RiUploadCloud2Line /></span><strong>Arrastra archivos aquí</strong><small>o haz clic para elegirlos</small><em>PDF · DOCX · TXT · MD · CSV · JSON · máximo 10 MB</em>
      </div>
      {error ? <p className="kb-upload-error"><RiErrorWarningLine /> {error}</p> : null}
      {files.length ? <div className="kb-upload-files" aria-live="polite">{files.map(item => <div className="kb-upload-file" key={`${item.file.name}-${item.file.size}`}><span className="kb-upload-file-icon"><RiFileTextLine /></span><span className="kb-upload-file-copy"><b>{item.file.name}</b><small>{formatBytes(item.file.size)} · {item.status === 'done' ? 'Listo' : item.status === 'uploading' ? 'Procesando…' : item.status === 'error' ? 'No se pudo importar' : 'Preparado'}</small></span>{item.status === 'uploading' ? <RiLoader4Line className="kb-upload-spinner" /> : item.status === 'done' ? <RiCheckLine className="kb-upload-success" /> : item.status === 'error' ? <RiErrorWarningLine className="kb-upload-fail" /> : <button onClick={() => setFiles(current => current.filter(entry => entry.file !== item.file))} aria-label={`Quitar ${item.file.name}`}><RiCloseLine /></button>}</div>)}</div> : null}
      <div className="kb-upload-footer"><span>{files.length ? `${files.length} archivo${files.length === 1 ? '' : 's'}` : 'Selecciona uno o varios archivos'}</span><div><button className="kb-upload-cancel" onClick={onClose} disabled={uploading}>Cancelar</button><button className="kb-upload-submit" onClick={uploadFiles} disabled={!files.length || uploading}>{uploading ? <><RiLoader4Line className="kb-upload-spinner" /> Procesando</> : <><RiUploadCloud2Line /> Subir archivos</>}</button></div></div>
    </section>
  </div>
}

function KnowledgeArticle({ article, onOpen, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return undefined
    const close = event => { if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  return <article className="knowledge-article-row" onClick={onOpen}>
    <span className="knowledge-article-icon"><RiFileTextLine /></span>
    <div className="knowledge-article-copy"><strong>{article.name}</strong><p>{article.content?.slice(0, 170) || 'Contenido disponible para tus agentes.'}</p><small>{article.type || 'Documento'} · {new Date(article.createdAt).toLocaleDateString(localeCode(getLocale()))}</small></div>
    <div className="knowledge-article-menu" ref={menuRef} onClick={event => event.stopPropagation()}><button aria-label={`Acciones para ${article.name}`} onClick={() => setMenuOpen(open => !open)}><RiMoreLine /></button>{menuOpen ? <div className="knowledge-article-popover"><button onClick={() => onDelete(article.id)}><RiDeleteBin6Line /> Eliminar</button></div> : null}</div>
  </article>
}

export default function KnowledgeBaseRedesigned({ sectionNavigation = null }) {
  const navigate = useNavigate()
  const [articles, setArticles] = useState([])
  const [dataStatus, setDataStatus] = useState('loading')
  const [dataError, setDataError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [sourceMode, setSourceMode] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    let active = true
    let timer
    const attempt = async retry => {
      try {
        const response = await apiFetch('/api/knowledge')
        const body = await response.json().catch(() => ([]))
        if (!response.ok) {
          const error = new Error(`knowledge_${response.status}`)
          error.status = response.status
          error.code = body?.code
          error.serverMessage = body?.error
          throw error
        }
        if (!active) return
        const next = Array.isArray(body) ? body : []
        setArticles(next)
        setDataStatus(next.length ? 'live' : 'empty')
        setDataError('')
      } catch (error) {
        if (!active) return
        if (retry < MAX_DATA_RETRIES && isRetryableDataError(error)) {
          timer = setTimeout(() => attempt(retry + 1), retryDelayMs(retry))
          return
        }
        const status = error?.status === 403 && error?.code === 'PLAN_CAPABILITY_REQUIRED' ? 'plan' : classifyFetchError(error)
        setDataStatus(status)
        setDataError(error?.serverMessage || statusMessage(status, { error: 'No se pudo cargar la base de conocimiento.' }))
      }
    }
    setDataStatus('loading')
    attempt(0)
    return () => { active = false; if (timer) clearTimeout(timer) }
  }, [refreshKey])

  const sortedArticles = useMemo(() => [...articles].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [articles])
  const refresh = () => setRefreshKey(key => key + 1)

  const deleteArticle = async id => {
    const response = await apiFetch(`/api/knowledge/${id}`, { method: 'DELETE' })
    if (response.ok) {
      setArticles(current => current.filter(article => article.id !== id))
      setDeleteTarget(null)
    }
  }

  if (dataStatus === 'loading') {
    return <PageLoadingState label="Cargando base de conocimiento" description="Preparando la información de tus agentes…" className="knowledge-base-page kb-page-loading dark-scroll" />
  }

  return <main className="knowledge-base-page dark-scroll">
    <ProductPageHeader Icon={RiBookReadLine} title="Documentos" description="Añade y organiza información fiable para que tus agentes IA puedan ofrecer respuestas precisas en cada llamada." navigation={sectionNavigation} actions={<button className="kb-primary-action" onClick={() => setSourceMode('text')}><RiAddLine /> Añadir conocimiento</button>} />

    {['error', 'disconnected', 'plan'].includes(dataStatus) ? <DataStatusBanner status={dataStatus} message={dataError} onRetry={() => refresh()} /> : null}

    {dataStatus === 'empty' ? <section className="kb-empty-workspace" aria-labelledby="kb-empty-title">
      <div className="kb-empty-symbol" aria-hidden="true"><span><RiBookReadLine /></span><i /><b /></div>
      <h2 id="kb-empty-title">Prepara a tus agentes para responder mejor</h2>
      <p>Añade documentos, enlaces o texto para dar a tus agentes IA el conocimiento que necesitan durante las llamadas.</p>
      <div className="kb-source-actions">
        <button onClick={() => setShowUpload(true)}><RiUploadCloud2Line /><span><strong>Subir archivo</strong><small>PDF, DOCX, TXT y más</small></span></button>
        <button onClick={() => setSourceMode('url')}><RiLink /><span><strong>Añadir enlace</strong><small>Importa una página web</small></span></button>
        <button onClick={() => setSourceMode('text')}><RiFileTextLine /><span><strong>Pegar texto</strong><small>Escribe o pega contenido</small></span></button>
      </div>
      <div className="kb-processing-note"><RiShieldCheckLine /> El contenido se procesa y queda disponible para tus agentes.</div>
    </section> : null}

    {dataStatus === 'live' ? <section className="kb-library" aria-labelledby="kb-library-title"><div className="kb-library-heading"><div><h2 id="kb-library-title">Contenido disponible</h2><p>{articles.length} {articles.length === 1 ? 'fuente preparada' : 'fuentes preparadas'} para tus agentes.</p></div><button onClick={() => setShowUpload(true)}><RiUploadCloud2Line /> Subir archivo</button></div><div className="kb-article-list">{sortedArticles.map(article => <KnowledgeArticle key={article.id} article={article} onOpen={() => navigate(`/knowledge-base/articulos/${article.id}`)} onDelete={id => setDeleteTarget(id)} />)}</div></section> : null}

    {sourceMode ? <NewArticuloModal mode={sourceMode} onClose={() => setSourceMode(null)} onSuccess={() => { setSourceMode(null); refresh() }} /> : null}
    {showUpload ? <UploadKnowledgeDialog onClose={() => setShowUpload(false)} onComplete={() => { setShowUpload(false); refresh() }} /> : null}
    {deleteTarget ? <div className="app-modal-backdrop" onClick={() => setDeleteTarget(null)}><div className="app-modal-card kb-delete-dialog" onClick={event => event.stopPropagation()}><h2>¿Eliminar este contenido?</h2><p>Dejará de estar disponible para los agentes.</p><div><button onClick={() => setDeleteTarget(null)}>Cancelar</button><button className="is-danger" onClick={() => deleteArticle(deleteTarget)}>Eliminar</button></div></div></div> : null}
  </main>
}
