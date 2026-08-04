import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RiAlertLine, RiArrowRightSLine, RiCheckLine, RiCursorLine, RiErrorWarningLine,
  RiInboxLine, RiMailForbidLine, RiMailOpenLine, RiMailSendLine, RiRefreshLine,
  RiSearchLine, RiSendPlaneLine, RiShieldCheckLine, RiSpam2Line, RiUserFollowLine,
  RiUserUnfollowLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import './email-audience.css'

// EM-111: estas vistas leen exclusivamente de endpoints reales. Ninguna
// inventa datos de ejemplo — si no hay filas, se dice que no hay filas.

async function getJson(path) {
  const res = await apiFetch(path)
  if (res.status === 403) throw new Error('forbidden')
  if (!res.ok) throw new Error(`http_${res.status}`)
  return res.json()
}

function pct(value) {
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`
}

function shortDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
}

function dateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function PanelState({ icon: Icon = RiAlertLine, title, copy, onRetry }) {
  return (
    <div className="email-empty">
      <div className="email-empty-icon"><Icon /></div>
      <div>
        <strong>{title}</strong>
        {copy && <p>{copy}</p>}
      </div>
      {onRetry && <button type="button" className="email-button secondary" onClick={onRetry}><RiRefreshLine /> Reintentar</button>}
    </div>
  )
}

// ── Entregabilidad ────────────────────────────────────────────────────────────
// Cablea /api/email/overview, que ya existía en el backend y ninguna vista
// consumía. openRate se calcula sobre entregados y clickRate es CTOR
// (clics/aperturas); el backend lo documenta en emailMetrics.service.ts.

const DELIVERABILITY_TILES = [
  { key: 'sent', label: 'Enviados', hint: 'Registros de envío creados', color: '#818cf8', Icon: RiMailSendLine },
  { key: 'delivered', label: 'Entregados', hint: 'Confirmados por el proveedor', color: '#34d399', Icon: RiShieldCheckLine },
  { key: 'failed', label: 'Fallidos y rebotes', hint: 'No llegaron a bandeja', color: '#fb7185', Icon: RiErrorWarningLine },
  { key: 'unsubscribes', label: 'Bajas', hint: 'Se dieron de baja', color: '#fbbf24', Icon: RiMailForbidLine },
  { key: 'complaints', label: 'Quejas de spam', hint: 'Marcaron como spam', color: '#f87171', Icon: RiSpam2Line },
]

export function DeliverabilityPanel() {
  const [metrics, setMetrics] = useState(null)
  const [state, setState] = useState('loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      setMetrics(await getJson('/api/email/overview'))
      setState('ready')
    } catch (error) {
      setState(error.message === 'forbidden' ? 'forbidden' : 'error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (state === 'loading') return <section className="email-panel"><p className="email-campaigns-loading">Cargando entregabilidad…</p></section>
  if (state !== 'ready') {
    return (
      <section className="email-panel">
        <PanelState
          title={state === 'forbidden' ? 'Sin permiso para ver métricas' : 'No se pudo cargar la entregabilidad'}
          copy={state === 'forbidden' ? 'Necesitas permiso de lectura de campañas.' : 'El servicio de métricas no respondió.'}
          onRetry={state === 'error' ? load : undefined}
        />
      </section>
    )
  }

  const failed = (metrics.failed ?? 0)
  const deliveryRate = metrics.sent ? metrics.delivered / metrics.sent : null

  return (
    <section className="email-panel" id="email-deliverability">
      <div className="email-panel-heading">
        <div>
          <span className="email-eyebrow">Salud del remitente</span>
          <h2>Entregabilidad</h2>
          <p>Si tus emails no llegan a bandeja de entrada, ninguna otra métrica importa.</p>
        </div>
        <button className="email-button ghost" onClick={load}><RiRefreshLine /> Actualizar</button>
      </div>

      <div className="email-deliver-grid">
        {DELIVERABILITY_TILES.map(tile => (
          <article className="email-deliver-tile" key={tile.key} style={{ '--tile': tile.color }}>
            <span className="email-deliver-icon"><tile.Icon /></span>
            <strong>{metrics[tile.key] ?? 0}</strong>
            <span className="email-deliver-label">{tile.label}</span>
            <small>{tile.hint}</small>
          </article>
        ))}
      </div>

      <div className="email-rate-row">
        <div><span>Tasa de entrega</span><strong>{pct(deliveryRate)}</strong><small>entregados / enviados</small></div>
        <div><span>Apertura</span><strong>{pct(metrics.openRate)}</strong><small>sobre entregados</small></div>
        <div><span>CTOR</span><strong>{pct(metrics.clickRate)}</strong><small>clics / aperturas</small></div>
        <div><span>CTR</span><strong>{pct(metrics.clickToDeliveredRate)}</strong><small>clics / entregados</small></div>
      </div>

      {(failed > 0 || metrics.complaints > 0) && (
        <p className="email-warn-note">
          <RiAlertLine /> {failed} envío{failed === 1 ? '' : 's'} sin entregar y {metrics.complaints} queja{metrics.complaints === 1 ? '' : 's'} de spam.
          Revisa la pestaña de Seguimiento antes de lanzar la siguiente campaña.
        </p>
      )}
    </section>
  )
}

// ── Suscriptores ──────────────────────────────────────────────────────────────
// La suscripción vive en ContactConsent (channel=email, purpose=categoría).
// Es la MISMA fila que consulta la barrera de envío en lib/emailCompliance.ts,
// así que lo que se ve aquí es exactamente lo que decide si se puede escribir.

const SUBSCRIBER_STATUS_META = {
  granted: { label: 'Suscrito', color: 'var(--success)' },
  revoked: { label: 'Baja', color: 'var(--warn)' },
  bounced: { label: 'Rebotado', color: 'var(--danger-soft)' },
  complaint: { label: 'Marcó spam', color: 'var(--danger-soft)' },
  unknown: { label: 'Sin confirmar', color: 'var(--muted)' },
}

export const PURPOSE_LABEL = {
  newsletter: 'Newsletter',
  contact: 'Contacto general',
  promotions: 'Promociones',
  marketing: 'Marketing',
}

function purposeLabel(purpose) {
  return PURPOSE_LABEL[purpose] || purpose
}

export function SubscribersPanel({ onNotice }) {
  const [summary, setSummary] = useState(null)
  const [purpose, setPurpose] = useState('newsletter')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState({ total: 0, rows: [] })
  const [state, setState] = useState('loading')
  const [busyLead, setBusyLead] = useState(null)
  const [actionError, setActionError] = useState('')

  const loadSummary = useCallback(async () => {
    try { setSummary(await getJson('/api/email/subscribers/summary')) } catch { setSummary(null) }
  }, [])

  const loadRows = useCallback(async () => {
    setState('loading')
    const params = new URLSearchParams()
    if (purpose) params.set('purpose', purpose)
    if (status) params.set('status', status)
    if (search.trim()) params.set('search', search.trim())
    params.set('limit', '100')
    try {
      setData(await getJson(`/api/email/subscribers?${params}`))
      setState('ready')
    } catch (error) {
      setData({ total: 0, rows: [] })
      setState(error.message === 'forbidden' ? 'forbidden' : 'error')
    }
  }, [purpose, status, search])

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => {
    const timer = window.setTimeout(loadRows, search ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [loadRows, search])

  const purposes = summary?.purposes ?? []
  const current = useMemo(
    () => purposes.find(item => item.purpose === purpose) ?? null,
    [purposes, purpose]
  )

  async function toggleSubscription(row) {
    const next = row.status === 'granted' ? 'revoked' : 'granted'
    setBusyLead(row.leadId)
    setActionError('')
    try {
      const res = await apiFetch(`/api/email/subscribers/${row.leadId}`, {
        method: 'PUT',
        body: JSON.stringify({ purpose: row.purpose, status: next }),
      })
      if (res.status === 403) { setActionError('Cambiar una suscripción requiere permiso de gobierno (governance.write).'); return }
      if (!res.ok) { setActionError('No se pudo actualizar la suscripción.'); return }
      onNotice?.(next === 'granted' ? `${row.name} suscrito de nuevo.` : `${row.name} dado de baja.`)
      await Promise.all([loadRows(), loadSummary()])
    } catch {
      setActionError('No se pudo conectar con el servidor.')
    } finally {
      setBusyLead(null)
    }
  }

  return (
    <section className="email-panel" id="email-subscribers">
      <div className="email-panel-heading">
        <div>
          <span className="email-eyebrow">Audiencia</span>
          <h2>Suscriptores</h2>
          <p>Quién ha dado permiso para recibir cada categoría. Es la misma lista que consulta la barrera de envío.</p>
        </div>
        <button className="email-button ghost" onClick={() => { loadRows(); loadSummary() }}><RiRefreshLine /> Actualizar</button>
      </div>

      {purposes.length > 0 && (
        <div className="email-purpose-tabs" role="tablist" aria-label="Categorías de suscripción">
          {purposes.map(item => (
            <button
              key={item.purpose}
              role="tab"
              aria-selected={item.purpose === purpose}
              className={item.purpose === purpose ? 'active' : ''}
              onClick={() => setPurpose(item.purpose)}
            >
              <strong>{purposeLabel(item.purpose)}</strong>
              <span>{item.granted} suscritos</span>
            </button>
          ))}
        </div>
      )}

      {current && (
        <div className="email-rate-row">
          <div><span>Suscritos</span><strong>{current.granted}</strong><small>reciben esta categoría</small></div>
          <div><span>Bajas</span><strong>{current.revoked}</strong><small>se dieron de baja</small></div>
          <div><span>Rebotados</span><strong>{current.bounced}</strong><small>dirección no válida</small></div>
          <div><span>Quejas</span><strong>{current.complaint}</strong><small>marcaron spam</small></div>
        </div>
      )}

      <div className="email-toolbar">
        <label className="email-search">
          <RiSearchLine />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar por nombre o email…"
            aria-label="Buscar suscriptores"
          />
        </label>
        <div className="email-filter">
          <button className={status === '' ? 'active' : ''} onClick={() => setStatus('')}>Todos</button>
          <button className={status === 'granted' ? 'active' : ''} onClick={() => setStatus('granted')}>Suscritos</button>
          <button className={status === 'revoked' ? 'active' : ''} onClick={() => setStatus('revoked')}>Bajas</button>
          <button className={status === 'bounced' ? 'active' : ''} onClick={() => setStatus('bounced')}>Rebotes</button>
        </div>
      </div>

      {actionError && <p className="email-modal-error">{actionError}</p>}

      {state === 'loading' ? <p className="email-campaigns-loading">Cargando suscriptores…</p>
        : state === 'forbidden' ? <PanelState title="Sin permiso para ver la audiencia" copy="Necesitas lectura de leads y de campañas." />
        : state === 'error' ? <PanelState title="No se pudo cargar la lista" copy="El servidor no respondió." onRetry={loadRows} />
        : !data.rows.length ? (
          <PanelState
            icon={RiUserFollowLine}
            title={`Todavía no hay nadie en "${purposeLabel(purpose)}"`}
            copy={
              summary?.withoutConsent
                ? `Tienes ${summary.withoutConsent} lead${summary.withoutConsent === 1 ? '' : 's'} con email pero sin ninguna preferencia registrada. La suscripción se crea cuando el lead da su permiso — desde una landing, el centro de preferencias o manualmente en su ficha.`
                : 'Cuando un lead acepte recibir esta categoría aparecerá aquí.'
            }
          />
        ) : (
          <>
            <div className="email-table" role="table">
              <div className="email-table-head" role="row">
                <span role="columnheader">Contacto</span>
                <span role="columnheader">Estado</span>
                <span role="columnheader">Origen</span>
                <span role="columnheader">Último envío</span>
                <span role="columnheader" className="email-col-action">Acción</span>
              </div>
              {data.rows.map(row => {
                const meta = SUBSCRIBER_STATUS_META[row.status] ?? SUBSCRIBER_STATUS_META.unknown
                const blocked = row.status === 'bounced' || row.status === 'complaint'
                return (
                  <div className="email-table-row" role="row" key={row.id}>
                    <div role="cell" className="email-cell-contact">
                      <Link to={`/leads/${row.leadId}`}>{row.name}</Link>
                      <small>{row.email || 'Sin email'}</small>
                    </div>
                    <div role="cell">
                      <span
                        className="email-campaign-status"
                        style={{
                          background: `color-mix(in srgb, ${meta.color} 13%, transparent)`,
                          color: meta.color,
                          borderColor: `color-mix(in srgb, ${meta.color} 33%, transparent)`,
                        }}
                      >{meta.label}</span>
                    </div>
                    <div role="cell"><small>{row.source}</small></div>
                    <div role="cell"><small>{shortDate(row.lastDeliveryAt)}</small></div>
                    <div role="cell" className="email-col-action">
                      <button
                        type="button"
                        className="email-button ghost"
                        disabled={busyLead === row.leadId || blocked}
                        title={blocked ? 'Un rebote o una queja de spam no se revierte a mano: la dirección dejó de ser válida.' : undefined}
                        onClick={() => toggleSubscription(row)}
                      >
                        {row.status === 'granted' ? <><RiUserUnfollowLine /> Dar de baja</> : <><RiUserFollowLine /> Suscribir</>}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="email-table-footer">{data.rows.length} de {data.total} contactos</p>
          </>
        )}
    </section>
  )
}

// ── Bandeja de entrada ────────────────────────────────────────────────────────
// Vista filtrada de las conversaciones reales (canal email). No duplica el
// inbox general de /conversacion/inbox: consume el mismo endpoint con
// ?channel=email para que una respuesta no viva en dos sitios distintos.

export function InboxPanel() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [state, setState] = useState('loading')
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailState, setDetailState] = useState('idle')
  const [templates, setTemplates] = useState([])
  const [draft, setDraft] = useState({ templateId: '', body: '' })
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const load = useCallback(async () => {
    setState('loading')
    try {
      const payload = await getJson('/api/conversations?channel=email&limit=50')
      setItems(payload.items ?? [])
      setTotal(payload.total ?? 0)
      setState('ready')
    } catch (error) {
      setItems([])
      setState(error.message === 'forbidden' ? 'forbidden' : 'error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let cancelled = false
    setDetailState('loading')
    setSendError('')
    setDraft({ templateId: '', body: '' })
    getJson(`/api/conversations/${selectedId}`)
      .then(payload => { if (!cancelled) { setDetail(payload); setDetailState('ready') } })
      .catch(() => { if (!cancelled) setDetailState('error') })
    return () => { cancelled = true }
  }, [selectedId])

  // Las plantillas aprobadas son obligatorias para enviar email: el backend
  // rechaza el envío de texto libre (conversations.service.ts). Se cargan una
  // sola vez porque no cambian entre hilos.
  useEffect(() => {
    getJson('/api/conversations/templates?channel=email')
      .then(payload => setTemplates(Array.isArray(payload) ? payload : []))
      .catch(() => setTemplates([]))
  }, [])

  async function handleSend() {
    if (!selectedId) return
    setSending(true)
    setSendError('')
    try {
      const res = await apiFetch(`/api/conversations/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          channel: 'email',
          templateId: draft.templateId || undefined,
          body: draft.body || undefined,
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        // El backend devuelve el motivo exacto ("Selecciona una plantilla de
        // email aprobada", "Mautic no confirmó el envío"…). Se muestra tal cual
        // y se añade la causa de fondo cuando la sabemos, para no dejar al
        // usuario adivinando por qué no hay plantillas que elegir.
        const reason = res.status === 403
          ? 'Tu rol no puede enviar mensajes de pago: hace falta el permiso costs.request.'
          : payload?.error || `El envío no se completó (HTTP ${res.status}).`
        const rootCause = !templates.length
          ? ' No hay ninguna plantilla porque Mautic no está conectado: las plantillas se crean y se aprueban allí. Hasta que Mautic esté levantado y configurado en el .env del backend, no se puede enviar email desde aquí.'
          : ''
        setSendError(reason + rootCause)
        return
      }
      setDraft({ templateId: '', body: '' })
      setDetail(await getJson(`/api/conversations/${selectedId}`))
      load()
    } catch {
      setSendError('No se pudo conectar con el servidor.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="email-panel" id="email-inbox">
      <div className="email-panel-heading">
        <div>
          <span className="email-eyebrow">Conversación</span>
          <h2>Bandeja de entrada</h2>
          <p>Respuestas de email de tus contactos, con el hilo completo y el lead asociado.</p>
        </div>
        <button className="email-button ghost" onClick={load}><RiRefreshLine /> Actualizar</button>
      </div>

      {state === 'loading' ? <p className="email-campaigns-loading">Cargando bandeja…</p>
        : state === 'forbidden' ? <PanelState title="Sin permiso para ver conversaciones" copy="Necesitas lectura de conversaciones." />
        : state === 'error' ? <PanelState title="No se pudo cargar la bandeja" onRetry={load} />
        : !items.length ? (
          <PanelState
            icon={RiInboxLine}
            title="No hay conversaciones de email todavía"
            copy="Cuando un contacto responda a uno de tus emails, el hilo aparecerá aquí junto a su ficha de lead."
          />
        ) : (
          <div className="email-inbox-layout">
            <div className="email-inbox-list">
              {items.map(conversation => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`email-inbox-row${conversation.id === selectedId ? ' active' : ''}`}
                  onClick={() => setSelectedId(conversation.id)}
                >
                  <div className="email-inbox-row-head">
                    <strong>{conversation.lead?.name || conversation.address || 'Sin contacto'}</strong>
                    <time>{dateTime(conversation.lastMessageAt)}</time>
                  </div>
                  <span className="email-inbox-subject">{conversation.subject || 'Sin asunto'}</span>
                  <small>{conversation.lastMessage?.body?.slice(0, 90) || 'Sin mensajes'}</small>
                </button>
              ))}
              <p className="email-table-footer">{items.length} de {total} conversaciones</p>
            </div>

            <div className="email-inbox-detail">
              {!selectedId ? <PanelState icon={RiInboxLine} title="Elige una conversación" copy="Selecciona un hilo de la izquierda para leerlo." />
                : detailState === 'loading' ? <p className="email-campaigns-loading">Cargando hilo…</p>
                : detailState === 'error' ? <PanelState title="No se pudo abrir el hilo" />
                : (
                  <>
                    <div className="email-thread-head">
                      <div>
                        <strong>{detail?.lead?.name || 'Sin contacto'}</strong>
                        <small>{detail?.lead?.email || detail?.address || ''}</small>
                      </div>
                      {detail?.lead?.id && (
                        <Link className="email-button ghost" to={`/leads/${detail.lead.id}`}>
                          Ver ficha <RiArrowRightSLine />
                        </Link>
                      )}
                    </div>
                    <div className="email-thread">
                      {(detail?.messages ?? []).length === 0
                        ? <p className="email-campaigns-loading">Este hilo no tiene mensajes.</p>
                        : detail.messages.map(message => (
                          <article
                            key={message.id}
                            className={`email-bubble ${message.direction === 'inbound' ? 'inbound' : 'outbound'}`}
                          >
                            <header>
                              <span>{message.direction === 'inbound' ? 'Recibido' : 'Enviado'}</span>
                              <time>{dateTime(message.createdAt)}</time>
                            </header>
                            <p>{message.body || <em>Sin cuerpo de texto</em>}</p>
                          </article>
                        ))}
                    </div>

                    <div className="email-composer">
                      <div className="email-composer-row">
                        <label className="email-field">
                          <span>Plantilla aprobada</span>
                          <select
                            value={draft.templateId}
                            onChange={event => setDraft(prev => ({ ...prev, templateId: event.target.value }))}
                          >
                            <option value="">
                              {templates.length ? 'Selecciona una plantilla…' : 'No hay plantillas disponibles'}
                            </option>
                            {templates.map(template => (
                              <option key={template.id} value={template.id}>{template.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <textarea
                        rows={3}
                        value={draft.body}
                        onChange={event => setDraft(prev => ({ ...prev, body: event.target.value }))}
                        placeholder="Escribe tu respuesta…"
                        aria-label="Cuerpo de la respuesta"
                      />
                      <div className="email-composer-actions">
                        <small>
                          El envío sale por Mautic, que registra la entrega y las aperturas.
                          El texto libre acompaña a la plantilla; no la sustituye.
                        </small>
                        <button
                          type="button"
                          className="email-button primary"
                          onClick={handleSend}
                          disabled={sending || !draft.body.trim()}
                        >
                          <RiSendPlaneLine /> {sending ? 'Enviando…' : 'Enviar'}
                        </button>
                      </div>
                      {sendError && (
                        <p className="email-send-error" role="alert">
                          <RiErrorWarningLine /> {sendError}
                        </p>
                      )}
                    </div>
                  </>
                )}
            </div>
          </div>
        )}
    </section>
  )
}

// ── Seguimiento ───────────────────────────────────────────────────────────────

const DELIVERY_STATUS_META = {
  queued: { label: 'En cola', color: 'var(--muted)' },
  processing: { label: 'Procesando', color: 'var(--cyan)' },
  accepted: { label: 'Aceptado', color: 'var(--cyan-soft)' },
  delivered: { label: 'Entregado', color: 'var(--success)' },
  failed: { label: 'Fallido', color: 'var(--danger-soft)' },
  uncertain: { label: 'Incierto', color: 'var(--warn)' },
  bounced: { label: 'Rebotado', color: 'var(--danger-soft)' },
  unsubscribed: { label: 'Baja', color: 'var(--warn)' },
}

const DELIVERY_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'delivered', label: 'Entregados' },
  { value: 'queued', label: 'En cola' },
  { value: 'failed', label: 'Fallidos' },
  { value: 'bounced', label: 'Rebotes' },
]

export function TrackingPanel() {
  const [data, setData] = useState({ total: 0, rows: [] })
  const [state, setState] = useState('loading')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setState('loading')
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (search.trim()) params.set('search', search.trim())
    params.set('limit', '100')
    try {
      setData(await getJson(`/api/email/deliveries?${params}`))
      setState('ready')
    } catch (error) {
      setData({ total: 0, rows: [] })
      setState(error.message === 'forbidden' ? 'forbidden' : 'error')
    }
  }, [status, search])

  useEffect(() => {
    const timer = window.setTimeout(load, search ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [load, search])

  return (
    <section className="email-panel" id="email-tracking">
      <div className="email-panel-heading">
        <div>
          <span className="email-eyebrow">Trazabilidad</span>
          <h2>Seguimiento de envíos</h2>
          <p>Un registro por destinatario: qué le llegó, cuándo, si lo abrió y por qué falló.</p>
        </div>
        <button className="email-button ghost" onClick={load}><RiRefreshLine /> Actualizar</button>
      </div>

      <div className="email-toolbar">
        <label className="email-search">
          <RiSearchLine />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar por destinatario o dirección…"
            aria-label="Buscar envíos"
          />
        </label>
        <div className="email-filter">
          {DELIVERY_FILTERS.map(filter => (
            <button
              key={filter.value || 'all'}
              className={status === filter.value ? 'active' : ''}
              onClick={() => setStatus(filter.value)}
            >{filter.label}</button>
          ))}
        </div>
      </div>

      {state === 'loading' ? <p className="email-campaigns-loading">Cargando envíos…</p>
        : state === 'forbidden' ? <PanelState title="Sin permiso para ver los envíos" />
        : state === 'error' ? <PanelState title="No se pudo cargar el seguimiento" onRetry={load} />
        : !data.rows.length ? (
          <PanelState
            icon={RiMailSendLine}
            title="Todavía no se ha enviado ningún email"
            copy="Cada envío deja aquí una fila con su estado real, sus aperturas y sus clics. Publica una campaña para empezar a ver trazas."
          />
        ) : (
          <>
            <div className="email-table email-table--tracking" role="table">
              <div className="email-table-head" role="row">
                <span role="columnheader">Destinatario</span>
                <span role="columnheader">Campaña</span>
                <span role="columnheader">Estado</span>
                <span role="columnheader">Aperturas</span>
                <span role="columnheader">Clics</span>
                <span role="columnheader">Fecha</span>
              </div>
              {data.rows.map(row => {
                const meta = DELIVERY_STATUS_META[row.status] ?? { label: row.status, color: 'var(--muted)' }
                return (
                  <div className="email-table-row" role="row" key={row.id}>
                    <div role="cell" className="email-cell-contact">
                      <Link to={`/leads/${row.leadId}`}>{row.leadName}</Link>
                      <small>{row.toAddress}</small>
                    </div>
                    <div role="cell"><small>{row.campaignName || 'Envío suelto'}</small></div>
                    <div role="cell">
                      <span
                        className="email-campaign-status"
                        style={{
                          background: `color-mix(in srgb, ${meta.color} 13%, transparent)`,
                          color: meta.color,
                          borderColor: `color-mix(in srgb, ${meta.color} 33%, transparent)`,
                        }}
                      >{meta.label}</span>
                      {row.failureCode && <small className="email-fail-code" title={row.failureDetail || ''}>{row.failureCode}</small>}
                    </div>
                    <div role="cell"><span className="email-count"><RiMailOpenLine /> {row.opens}</span></div>
                    <div role="cell"><span className="email-count"><RiCursorLine /> {row.clicks}</span></div>
                    <div role="cell"><small>{dateTime(row.queuedAt)}</small></div>
                  </div>
                )
              })}
            </div>
            <p className="email-table-footer">
              <RiCheckLine /> {data.rows.length} de {data.total} envíos
            </p>
          </>
        )}
    </section>
  )
}
