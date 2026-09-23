import { useEffect, useMemo, useRef, useState } from 'react'
import { RiCheckLine, RiClipboardLine, RiDownloadLine, RiMailLine, RiAddLine, RiDeleteBinLine, RiRefreshLine } from 'react-icons/ri'
import { apiFetch } from '../lib/api'

const API = '/api/email/newsletter-drafts'
const DEFAULT_DRAFT = {
  name: 'Newsletter sin título', brand: 'Preclases', logoUrl: '', accent: '#4f46e5',
  subject: '', preheader: '', heading: 'Una idea para aprender mejor', intro: 'Hola,',
  body: 'Escribe aquí el contenido de tu newsletter. Mantén cada mensaje claro, útil y relevante para las personas que eligieron recibirlo.',
  cta: 'Descubrir más', ctaUrl: '',
  footer: 'Recibes este correo porque te suscribiste a las comunicaciones de Preclases.',
}
const { name: DEFAULT_NAME, ...DEFAULT_CONTENT } = DEFAULT_DRAFT

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function safeUrl(value = '') {
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : ''
}

function toContent(draft) {
  const { id, name, createdAt, updatedAt, orgId, ...content } = draft
  return content
}

function fromServerDraft(draft) {
  return { id: draft.id, name: draft.name, ...(draft.content || {}), createdAt: draft.createdAt, updatedAt: draft.updatedAt }
}

async function requestJson(path, options) {
  const response = await apiFetch(path, options)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || `No se pudo guardar el borrador (${response.status}).`)
  return body
}

function buildNewsletterHtml(draft) {
  const accent = /^#[\da-f]{6}$/i.test(draft.accent) ? draft.accent : '#4f46e5'
  const logo = safeUrl(draft.logoUrl)
    ? `<img src="${escapeHtml(safeUrl(draft.logoUrl))}" alt="${escapeHtml(draft.brand)}" width="132" style="display:block;max-width:132px;height:auto;margin:0 auto 18px">` : ''
  const button = safeUrl(draft.ctaUrl)
    ? `<tr><td align="center" style="padding:8px 32px 28px"><a href="${escapeHtml(safeUrl(draft.ctaUrl))}" style="display:inline-block;padding:13px 22px;border-radius:7px;background:${accent};color:#fff;text-decoration:none;font-weight:700">${escapeHtml(draft.cta || 'Descubrir más')}</a></td></tr>` : ''
  const paragraphs = String(draft.body || '').split(/\n{2,}/).map(part => `<p style="margin:0 0 16px;line-height:1.7;color:#344054">${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('')
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(draft.subject || draft.name)}</title><meta name="description" content="${escapeHtml(draft.preheader)}"></head>
<body style="margin:0;padding:24px 12px;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#172033">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(draft.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e4e8f0;border-radius:12px;overflow:hidden"><tr><td style="height:6px;background:${accent}"></td></tr>
<tr><td align="center" style="padding:32px 32px 12px">${logo}<div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${accent}">${escapeHtml(draft.brand)}</div></td></tr>
<tr><td style="padding:12px 32px 4px"><h1 style="margin:0 0 18px;font-size:28px;line-height:1.2;color:#172033">${escapeHtml(draft.heading)}</h1><p style="margin:0 0 16px;line-height:1.7;color:#344054">${escapeHtml(draft.intro)}</p>${paragraphs}</td></tr>${button}
<tr><td style="padding:20px 32px;border-top:1px solid #e4e8f0;text-align:center;font-size:12px;line-height:1.6;color:#667085"><p style="margin:0 0 8px">${escapeHtml(draft.footer)}</p><a href="{{UNSUBSCRIBE_URL}}" style="color:#667085;text-decoration:underline">Darse de baja</a></td></tr></table>
</body></html>`
}

export default function EmailNewsletterStudio() {
  const [drafts, setDrafts] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveStatus, setSaveStatus] = useState('saved')
  const [notice, setNotice] = useState('')
  const [previewMode, setPreviewMode] = useState('desktop')
  const timers = useRef(new Map())
  const lastSaved = useRef(new Map())
  const current = drafts.find(draft => draft.id === activeId)
  const html = useMemo(() => current ? buildNewsletterHtml(current) : '', [current])

  async function loadDrafts() {
    setLoading(true)
    setLoadError('')
    try {
      const result = await requestJson(API)
      const rows = Array.isArray(result) ? result.map(fromServerDraft) : []
      lastSaved.current = new Map(rows.map(row => [row.id, JSON.stringify({ name: row.name, content: toContent(row) })]))
      setDrafts(rows)
      setActiveId(selected => rows.some(row => row.id === selected) ? selected : rows[0]?.id || null)
    } catch (error) {
      setLoadError(error.message || 'No se pudieron cargar los borradores del equipo.')
    } finally { setLoading(false) }
  }

  useEffect(() => { loadDrafts() }, [])

  useEffect(() => {
    if (!current || loading || loadError) return undefined
    const value = JSON.stringify({ name: current.name, content: toContent(current) })
    if (lastSaved.current.get(current.id) === value) { setSaveStatus('saved'); return undefined }
    setSaveStatus('saving')
    window.clearTimeout(timers.current.get(current.id))
    timers.current.set(current.id, window.setTimeout(async () => {
      try {
        const saved = await requestJson(`${API}/${encodeURIComponent(current.id)}`, {
          method: 'PUT', body: JSON.stringify({ name: current.name, content: toContent(current) }),
        })
        lastSaved.current.set(current.id, JSON.stringify({ name: saved.name, content: saved.content }))
        setSaveStatus('saved')
        setDrafts(existing => existing.map(draft => draft.id === saved.id ? fromServerDraft(saved) : draft))
      } catch (error) { setSaveStatus('error'); setNotice(error.message || 'No se pudo guardar el borrador.') }
    }, 700))

  }, [current, loading, loadError])

  function update(field, value) {
    setDrafts(existing => existing.map(draft => draft.id === activeId ? { ...draft, [field]: value } : draft))
  }

  async function createDraft() {
    setNotice('')
    try {
      const saved = await requestJson(API, { method: 'POST', body: JSON.stringify({ name: DEFAULT_NAME, content: DEFAULT_CONTENT }) })
      const row = fromServerDraft(saved)
      lastSaved.current.set(row.id, JSON.stringify({ name: row.name, content: toContent(row) }))
      setDrafts(existing => [row, ...existing])
      setActiveId(row.id)
      setSaveStatus('saved')
    } catch (error) { setNotice(error.message || 'No se pudo crear el borrador.') }
  }

  async function deleteDraft() {
    if (!current || !window.confirm(`¿Eliminar el borrador «${current.name}» del espacio de trabajo?`)) return
    try {
      const response = await apiFetch(`${API}/${encodeURIComponent(current.id)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('No se pudo eliminar el borrador.')
      lastSaved.current.delete(current.id)
      setDrafts(existing => existing.filter(draft => draft.id !== current.id))
      setActiveId(drafts.find(draft => draft.id !== current.id)?.id || null)
      setNotice('Borrador eliminado del espacio de trabajo.')
    } catch (error) { setNotice(error.message || 'No se pudo eliminar el borrador.') }
  }

  async function retrySave() {
    if (!current) return
    setSaveStatus('saving')
    try {
      const saved = await requestJson(`${API}/${encodeURIComponent(current.id)}`, {
        method: 'PUT', body: JSON.stringify({ name: current.name, content: toContent(current) }),
      })
      lastSaved.current.set(current.id, JSON.stringify({ name: saved.name, content: saved.content }))
      setDrafts(existing => existing.map(draft => draft.id === saved.id ? fromServerDraft(saved) : draft))
      setSaveStatus('saved')
      setNotice('Cambios guardados en el espacio de trabajo.')
    } catch (error) { setSaveStatus('error'); setNotice(error.message || 'No se pudo guardar el borrador.') }
  }

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(html)
      setNotice('HTML copiado. El enlace {{UNSUBSCRIBE_URL}} se reemplaza al enviar cada campaña por la baja personal del destinatario.')
    } catch { setNotice('No se pudo copiar automáticamente. Descarga el HTML y ábrelo para copiar su contenido.') }
  }

  function downloadHtml() {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${(current.name || 'newsletter').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'newsletter'}.html`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('HTML descargado. Al enviar una campaña, el enlace {{UNSUBSCRIBE_URL}} se sustituye por la baja personal del destinatario.')
  }

  if (loading) return <section className="email-panel"><p className="email-campaigns-loading">Cargando borradores del espacio de trabajo…</p></section>
  if (loadError) return <section className="email-panel"><div className="email-panel-heading"><div><span className="email-eyebrow">Contenido de marca</span><h2>Preparar newsletter</h2><p>{loadError}</p></div><button className="email-button secondary" onClick={loadDrafts}><RiRefreshLine /> Reintentar</button></div></section>

  return <section className="email-panel email-newsletter-studio" aria-labelledby="newsletter-studio-title">
    <div className="email-panel-heading">
      <div><span className="email-eyebrow">Contenido de marca</span><h2 id="newsletter-studio-title">Preparar newsletter</h2><p>Crea y edita newsletters aquí. Guárdalas en Vendrava y selecciónalas directamente al preparar una campaña.</p></div>
      <div className="email-newsletter-top-actions"><span className={`email-newsletter-save-state ${saveStatus}`}>{saveStatus === 'saving' ? 'Guardando…' : saveStatus === 'error' ? 'Error al guardar' : 'Guardado en el espacio de trabajo'}</span><button type="button" className="email-button secondary" onClick={createDraft}><RiAddLine /> Nuevo borrador</button></div>
    </div>
    <div className="email-newsletter-notice" role="note"><RiMailLine /><p><strong>Los borradores se comparten con tu organización.</strong> Edita y previsualiza el contenido en Vendrava; después selecciónalo al preparar una campaña. El HTML y el asunto se guardan en una instantánea al publicarla. El envío se hace con Resend y añade el enlace personal de baja. Elige siempre una categoría cuyos suscriptores hayan dado su consentimiento.</p></div>
    {!current ? <div className="email-empty"><div className="email-empty-icon"><RiMailLine /></div><div><strong>Aún no hay borradores</strong><p>Crea una newsletter para empezar. El borrador será visible para tu organización.</p></div><button type="button" className="email-button primary" onClick={createDraft}><RiAddLine /> Crear newsletter</button></div> : <div className="email-newsletter-layout">
      <div className="email-newsletter-editor">
        <div className="email-newsletter-drafts">
          <label className="email-field"><span>Borrador</span><select value={current.id} onChange={event => setActiveId(event.target.value)}>{drafts.map(draft => <option key={draft.id} value={draft.id}>{draft.name || 'Sin título'}</option>)}</select></label>
          <label className="email-field"><span>Nombre interno</span><input value={current.name} onChange={event => update('name', event.target.value)} /></label>
        </div>
        <fieldset className="email-newsletter-fieldset"><div className="email-newsletter-fields">
          <label className="email-field"><span>Marca</span><input value={current.brand} onChange={event => update('brand', event.target.value)} placeholder="Preclases" /></label>
          <label className="email-field"><span>Color principal</span><div className="email-color-field"><input type="color" value={current.accent} onChange={event => update('accent', event.target.value)} /><input value={current.accent} onChange={event => update('accent', event.target.value)} aria-label="Código de color de marca" /></div></label>
          <label className="email-field email-field-wide"><span>URL del logo (opcional)</span><input type="url" value={current.logoUrl} onChange={event => update('logoUrl', event.target.value)} placeholder="https://preclases.com/logo.png" /></label>
          <label className="email-field email-field-wide"><span>Asunto del correo</span><input value={current.subject} onChange={event => update('subject', event.target.value)} placeholder="Una idea nueva para esta semana" /></label>
          <label className="email-field email-field-wide"><span>Texto de vista previa</span><input value={current.preheader} onChange={event => update('preheader', event.target.value)} placeholder="La frase que aparece junto al asunto en la bandeja" /></label>
          <label className="email-field email-field-wide"><span>Título</span><input value={current.heading} onChange={event => update('heading', event.target.value)} /></label>
          <label className="email-field email-field-wide"><span>Saludo</span><input value={current.intro} onChange={event => update('intro', event.target.value)} /></label>
          <label className="email-field email-field-wide"><span>Contenido</span><textarea rows={8} value={current.body} onChange={event => update('body', event.target.value)} /></label>
          <label className="email-field"><span>Texto del botón</span><input value={current.cta} onChange={event => update('cta', event.target.value)} /></label>
          <label className="email-field"><span>Enlace del botón</span><input type="url" value={current.ctaUrl} onChange={event => update('ctaUrl', event.target.value)} placeholder="https://preclases.com/" /></label>
          <label className="email-field email-field-wide"><span>Pie de marca</span><textarea rows={2} value={current.footer} onChange={event => update('footer', event.target.value)} /></label>
        </div></fieldset>
        <div className="email-newsletter-actions"><button type="button" className="email-button secondary" onClick={deleteDraft}><RiDeleteBinLine /> Eliminar borrador</button><button type="button" className="email-button secondary" onClick={copyHtml}><RiClipboardLine /> Copiar HTML</button><button type="button" className="email-button primary" onClick={downloadHtml}><RiDownloadLine /> Descargar HTML</button></div>
        {saveStatus === 'error' && <button type="button" className="email-button ghost" onClick={retrySave}><RiRefreshLine /> Reintentar guardado</button>}
      </div>
      <aside className="email-newsletter-preview-panel">
        <div className="email-newsletter-preview-head"><div><span className="email-eyebrow">Vista previa</span><strong>{current.subject || 'Asunto de la newsletter'}</strong><small>{current.preheader || 'El texto de vista previa aparecerá aquí.'}</small></div><div className="email-filter"><button className={previewMode === 'desktop' ? 'active' : ''} onClick={() => setPreviewMode('desktop')}>Escritorio</button><button className={previewMode === 'mobile' ? 'active' : ''} onClick={() => setPreviewMode('mobile')}>Móvil</button></div></div>
        <div className={`email-newsletter-preview ${previewMode}`}><iframe title="Vista previa de newsletter" sandbox="" srcDoc={html} /></div>
        <p className="email-newsletter-compliance"><RiCheckLine /> Vista previa: el enlace de baja se personaliza para cada destinatario cuando la campaña se envía.</p>
      </aside>
    </div>}
    {notice && <p className="email-newsletter-toast" role="status">{notice}</p>}
  </section>
}









