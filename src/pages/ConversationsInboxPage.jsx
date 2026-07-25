import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RiArrowDownSLine, RiCalendarLine, RiCheckDoubleLine, RiCheckLine, RiErrorWarningLine,
  RiInformationLine, RiMailLine, RiMessage3Line,
  RiPhoneLine, RiSearchLine, RiSendPlane2Line, RiSparkling2Line, RiTimeLine,
  RiUser3Line, RiWhatsappLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { getLocale, localeCode, useI18n } from '../i18n'
import './conversations-inbox.css'

const CHANNELS = [
  { key: '', label: 'Todos', icon: RiMessage3Line },
  { key: 'whatsapp', label: 'WhatsApp', icon: RiWhatsappLine },
  { key: 'voice', label: 'Llamadas', icon: RiPhoneLine },
  { key: 'email', label: 'Email', icon: RiMailLine },
]

const STATUS_LABELS = { open: 'Abierto', assigned: 'Asignado', pending: 'Pendiente', snoozed: 'Pospuesto', closed: 'Cerrado' }

function displayName(conversation) {
  return conversation?.lead?.name || conversation?.contact?.name || conversation?.name || 'Sin nombre'
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

function dateLabel(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString(localeCode(getLocale()), { hour: '2-digit', minute: '2-digit' })
}

function channelIcon(channel) {
  if (channel === 'whatsapp') return RiWhatsappLine
  if (channel === 'email') return RiMailLine
  if (channel === 'call' || channel === 'voice') return RiPhoneLine
  return RiMessage3Line
}

function extractItems(data) {
  return Array.isArray(data?.items) ? data.items : []
}

function ConversationRow({ conversation, selected, onSelect }) {
  const name = displayName(conversation)
  const ChannelIcon = channelIcon(conversation.lastMessage?.channel || conversation.channel)
  return (
    <button className={`inbox-row${selected ? ' is-selected' : ''}`} onClick={() => onSelect(conversation)}>
      <span className="inbox-avatar">{conversation.lead?.avatarUrl ? <img src={conversation.lead.avatarUrl} alt="" /> : initials(name)}</span>
      <span className="inbox-row-copy">
        <span className="inbox-row-top"><strong>{name}</strong><time>{dateLabel(conversation.updatedAt || conversation.lastMessageAt)}</time></span>
        <span className="inbox-row-meta"><ChannelIcon /><span>{conversation.lead?.company || conversation.lead?.email || 'Conversación'}</span></span>
        <span className="inbox-row-preview">{conversation.lastMessage?.body || conversation.lastMessage?.text || 'Sin mensajes todavía'}</span>
      </span>
      <span className="inbox-row-signal"><i className={`signal-dot signal-${conversation.status || 'open'}`} /><i className="signal-bars" /></span>
    </button>
  )
}

function DeliveryState({ message }) {
  if (message.status === 'failed' || message.deliveryStatus === 'failed') return <span className="delivery failed"><RiErrorWarningLine /> No entregado</span>
  if (message.status === 'read' || message.deliveryStatus === 'read') return <span className="delivery read"><RiCheckDoubleLine /> Leído</span>
  if (message.status === 'delivered' || message.deliveryStatus === 'delivered') return <span className="delivery"><RiCheckDoubleLine /> Entregado</span>
  if (message.status === 'queued' || message.status === 'accepted') return <span className="delivery"><RiTimeLine /> En cola</span>
  return <span className="delivery"><RiCheckLine /> Enviado</span>
}

function MessageBubble({ message }) {
  const outgoing = message.direction === 'outbound' || message.senderType === 'user' || message.from === 'agent'
  const type = message.contentType || message.type || message.kind || message.channel
  const EventIcon = message.channel === 'voice' || type === 'call' ? RiPhoneLine : message.channel === 'email' ? RiMailLine : message.channel === 'internal' || type === 'note' || type === 'status_change' ? RiInformationLine : RiWhatsappLine
  return (
    <div className={`message-event ${outgoing ? 'outgoing' : 'incoming'}`}>
      <span className="message-channel"><EventIcon /></span>
      <div className={`message-bubble ${type === 'note' ? 'note-bubble' : ''}`}>
        {type === 'note' && <strong>Nota interna</strong>}
        <p>{message.body || message.text || 'Mensaje sin contenido'}</p>
        <div className="message-meta"><time>{dateLabel(message.createdAt || message.sentAt)}</time>{outgoing && <DeliveryState message={message} />}</div>
      </div>
    </div>
  )
}

function ConversationTimeline({ messages }) {
  if (!messages?.length) return <div className="inbox-empty-thread"><RiMessage3Line /><strong>Aún no hay mensajes</strong><span>Esta conversación todavía no tiene actividad registrada.</span></div>
  return <div className="conversation-timeline">{messages.map((message, index) => <MessageBubble key={message.id || index} message={message} />)}</div>
}

function ThreadHeader({ conversation, onTakeover, takingOver }) {
  const name = displayName(conversation)
  return (
    <header className="thread-header">
      <span className="inbox-avatar large">{conversation.lead?.avatarUrl ? <img src={conversation.lead.avatarUrl} alt="" /> : initials(name)}</span>
      <div className="thread-person"><h2>{name} <span className="presence-dot" /></h2><p>{conversation.lead?.company || 'Lead'} · {conversation.lead?.email || 'Sin email'}</p></div>
      <select className="status-select" value={conversation.status || 'open'} onChange={event => conversation.onStatus?.(event.target.value)} aria-label="Estado de conversación">
        {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <button className="takeover-button" disabled={takingOver} onClick={onTakeover}><RiUser3Line /> {takingOver ? 'Tomando...' : 'Pasar a humano'}</button>
    </header>
  )
}

function Composer({ channel, setChannel, body, setBody, onSend, sending, templates, templateId, setTemplateId, onSuggest, suggesting }) {
  return (
    <form className="composer" onSubmit={onSend}>
      <div className="composer-tabs">{CHANNELS.slice(1).map(({ key, label, icon: Icon }) => <button type="button" key={key} className={channel === key ? 'active' : ''} onClick={() => { setChannel(key); setTemplateId('') }}><Icon /> {label}</button>)}<label className="template-button"><span>Plantillas</span><select value={templateId} onChange={event => setTemplateId(event.target.value)} aria-label="Plantilla"><option value="">Sin plantilla</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select><RiArrowDownSLine /></label></div>
      <textarea value={body} onChange={event => setBody(event.target.value)} placeholder="Escribe tu mensaje..." rows={3} disabled={sending} />
      <div className="composer-actions"><button type="button" className="ai-button" onClick={onSuggest} disabled={suggesting}><RiSparkling2Line /> {suggesting ? 'Pensando...' : 'Sugerir con IA'}</button><button className="send-button" disabled={sending || (!body.trim() && !templateId)}>{sending ? 'Enviando...' : 'Enviar'} <RiSendPlane2Line /></button></div>
    </form>
  )
}

function InfoRow({ label, value, accent }) { return <div className="info-row"><span>{label}</span><strong className={accent ? 'accent' : ''}>{value || '—'}</strong></div> }

function Inspector({ conversation }) {
  const lead = conversation.lead || {}
  const acquisition = conversation.acquisitionContext || {}
  const consents = new Map((lead.contactConsents || []).map(item => [item.channel, item.status]))
  const opportunity = lead.opportunities?.[0]
  const nextAction = conversation.nextBestActions?.[0]
  const consentLabel = channel => consents.get(channel) === 'granted' ? 'Autorizado' : consents.get(channel) === 'revoked' ? 'Revocado' : 'Sin registrar'
  return (
    <aside className="conversation-inspector">
      <div className="inspector-heading"><h2>Contexto comercial</h2><RiArrowDownSLine /></div>
      <section className="inspector-section"><h3>Origen</h3><InfoRow label="Campaña" value={acquisition.campaign?.name} /><InfoRow label="Canal" value={acquisition.source} /><InfoRow label="UTM Source / Medium" value={[acquisition.source, acquisition.medium].filter(Boolean).join(' / ')} /><InfoRow label="Landing" value={acquisition.campaign?.landingSlug} /><InfoRow label="Captado" value={dateLabel(acquisition.capturedAt)} /></section>
      <section className="inspector-section"><h3>Contacto</h3><InfoRow label="Teléfono" value={lead.phone} /><InfoRow label="Email" value={lead.email} /><InfoRow label="Empresa" value={lead.company} /><InfoRow label="Cargo" value={lead.role || lead.position} /></section>
      <section className="inspector-section"><h3>Consentimientos</h3><InfoRow label="WhatsApp" value={consentLabel('whatsapp')} accent={consents.get('whatsapp') === 'granted'} /><InfoRow label="Voz" value={consentLabel('voice')} accent={consents.get('voice') === 'granted'} /><InfoRow label="Email" value={consentLabel('email')} accent={consents.get('email') === 'granted'} /></section>
      <section className="inspector-section"><h3>Oportunidad actual</h3><InfoRow label="Etapa" value={opportunity?.stage} /><InfoRow label="Valor" value={opportunity?.value} /><InfoRow label="Prioridad" value={conversation.priority} accent /></section>
      {nextAction ? <section className="inspector-next"><h3>Siguiente mejor acción</h3><div className="inspector-action"><span><RiCalendarLine /><strong>{nextAction.type === 'reply' ? 'Responder al lead' : nextAction.type === 'email' ? 'Enviar email' : 'Crear seguimiento'}</strong><small>{nextAction.reason}</small></span></div></section> : null}
    </aside>
  )
}

export default function ConversationsInboxPage() {
  const { locale } = useI18n()
  const [filters, setFilters] = useState({ channel: '', status: '', search: '' })
  const [conversations, setConversations] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [listState, setListState] = useState('loading')
  const [listError, setListError] = useState('')
  const [detailState, setDetailState] = useState('idle')
  const [channel, setChannel] = useState('whatsapp')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [takingOver, setTakingOver] = useState(false)
  const [total, setTotal] = useState(0)
  const [templates, setTemplates] = useState([])
  const [templateId, setTemplateId] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const searchInputRef = useRef(null)

  const loadConversations = useCallback(async () => {
    setListState('loading'); setListError('')
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
    try {
      const response = await apiFetch(`/api/conversations?${query}`)
      if (!response.ok) throw new Error('No se pudo cargar la cola de conversaciones.')
      const data = await response.json(); const items = extractItems(data)
      setConversations(items); setTotal(Number(data.total) || items.length); setListState(items.length ? 'ready' : 'empty')
      if (items.length) setSelected(current => current && items.some(item => item.id === current.id) ? current : items[0])
      if (!items.length) { setSelected(null); setDetail(null) }
    } catch (error) { setListState('error'); setListError(error.message || 'No se pudo cargar la cola.') }
  }, [filters])

  useEffect(() => { const timer = setTimeout(loadConversations, filters.search ? 280 : 0); return () => clearTimeout(timer) }, [loadConversations, filters.search])

  useEffect(() => {
    if (!selected?.id) return
    let active = true
    setDetailState('loading')
    apiFetch(`/api/conversations/${selected.id}`).then(response => { if (!response.ok) throw new Error('No se pudo cargar el hilo.') ; return response.json() }).then(data => { if (active) { setDetail(data); setDetailState('ready') } }).catch(() => { if (active) setDetailState('error') })
    return () => { active = false }
  }, [selected])

  useEffect(() => {
    let active = true
    apiFetch(`/api/conversations/templates?channel=${encodeURIComponent(channel)}`)
      .then(response => response.ok ? response.json() : [])
      .then(items => { if (active) setTemplates(Array.isArray(items) ? items : []) })
      .catch(() => { if (active) setTemplates([]) })
    return () => { active = false }
  }, [channel])

  const conversation = detail || selected
  const messages = useMemo(() => detail?.messages || [], [detail])

  async function updateConversation(patch) {
    if (!conversation?.id) return
    const response = await apiFetch(`/api/conversations/${conversation.id}`, { method: 'PUT', body: JSON.stringify(patch) })
    if (!response.ok) throw new Error('No se pudo actualizar la conversación.')
    const updated = await response.json().catch(() => null)
    if (updated) { setDetail(current => ({ ...(current || conversation), ...updated })); setSelected(current => ({ ...current, ...updated })) }
  }

  async function handleSend(event) {
    event.preventDefault(); if ((!body.trim() && !templateId) || !conversation?.id) return
    setSending(true)
    try { const response = await apiFetch(`/api/conversations/${conversation.id}/messages`, { method: 'POST', body: JSON.stringify({ channel, body: body.trim() || undefined, templateId: templateId || undefined }) }); if (!response.ok) throw new Error(); const sent = await response.json(); setDetail(current => ({ ...current, messages: [...(current?.messages || []), sent] })); setBody(''); setTemplateId('') } catch { setDetailState('error') } finally { setSending(false) }
  }

  async function handleTakeover() { setTakingOver(true); try { const response = await apiFetch(`/api/conversations/${conversation.id}/takeover`, { method: 'POST' }); if (!response.ok) throw new Error(); const updated = await response.json(); setDetail(current => ({ ...current, ...updated })); setSelected(current => ({ ...current, ...updated })) } catch { setDetailState('error') } finally { setTakingOver(false) } }

  async function handleSuggest() {
    if (!conversation?.id) return
    setSuggesting(true)
    try {
      const response = await apiFetch(`/api/conversations/${conversation.id}/suggest`, { method: 'POST', body: JSON.stringify({ tone: 'consultivo' }) })
      if (!response.ok) throw new Error()
      const suggestion = await response.json()
      setBody(suggestion.text || '')
    } catch { setDetailState('error') } finally { setSuggesting(false) }
  }

  return <main className="conversations-inbox-page">
    <div className="inbox-topbar"><select value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}><option value="">Todas las conversaciones</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="topbar-actions"><button type="button" title="Buscar conversaciones" onClick={() => searchInputRef.current?.focus()}><RiSearchLine /></button></div></div>
    <div className="inbox-heading"><div><h1>{locale === 'en' ? 'Conversations' : 'Conversaciones'}</h1><p>{locale === 'en' ? 'Reply at the right moment, through the right channel.' : 'Responde en el momento correcto, por el canal correcto.'}</p></div></div>
    <div className="inbox-workspace">
      <section className="conversation-queue"><div className="queue-toolbar"><label><RiSearchLine /><input ref={searchInputRef} value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} placeholder="Buscar conversaciones..." /></label></div><div className="channel-filters">{CHANNELS.map(({ key, label, icon: Icon }) => <button key={key} className={filters.channel === key ? 'active' : ''} onClick={() => setFilters(current => ({ ...current, channel: key }))}><Icon /> {label}</button>)}</div><div className="queue-list-head"><strong>{listState === 'ready' ? `${total} conversaciones` : 'Conversaciones'}</strong><span>Más recientes</span></div><div className="queue-list">{listState === 'loading' && <div className="queue-state"><span className="spinner" />Cargando conversaciones...</div>}{listState === 'error' && <div className="queue-state error"><RiErrorWarningLine /><strong>{listError}</strong><button onClick={loadConversations}>Reintentar</button></div>}{listState === 'empty' && <div className="queue-state"><RiMessage3Line /><strong>No hay conversaciones</strong><span>Prueba con otro canal, estado o búsqueda.</span></div>}{listState === 'ready' && conversations.map(item => <ConversationRow key={item.id} conversation={item} selected={selected?.id === item.id} onSelect={setSelected} />)}</div>{listState === 'ready' && <footer className="queue-footer">Mostrando {conversations.length} de {total} conversaciones</footer>}</section>
      <section className="conversation-thread">{!conversation && <div className="thread-placeholder"><RiMessage3Line /><h2>Selecciona una conversación</h2><p>Elige un elemento de la cola para ver el hilo y responder.</p></div>}{conversation && <><ThreadHeader conversation={{ ...conversation, onStatus: value => updateConversation({ status: value }) }} onTakeover={handleTakeover} takingOver={takingOver} />{detailState === 'loading' && <div className="thread-loading"><span className="spinner" />Cargando hilo...</div>}{detailState === 'error' && <div className="thread-error"><RiErrorWarningLine /> No se pudo completar la última acción. <button onClick={() => setSelected({ ...selected })}>Reintentar</button></div>}{detailState === 'ready' && <ConversationTimeline messages={messages} />}<Composer channel={channel} setChannel={setChannel} body={body} setBody={setBody} onSend={handleSend} sending={sending} templates={templates} templateId={templateId} setTemplateId={setTemplateId} onSuggest={handleSuggest} suggesting={suggesting} /></>}</section>
      {conversation && detailState === 'ready' && <Inspector conversation={conversation} />}
    </div>
  </main>
}
