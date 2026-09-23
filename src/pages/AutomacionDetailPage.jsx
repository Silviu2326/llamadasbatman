import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiArrowLeftLine, RiPlayLine, RiPauseLine,
  RiArrowRightLine, RiFlowChart, RiCloseLine, RiGitBranchLine,
  RiAddLine, RiDeleteBinLine, RiArrowUpLine, RiArrowDownLine,
} from 'react-icons/ri'
import {
  AUTOMATION_ACTION_DEFINITIONS, AUTOMATION_TRIGGER_OPTIONS,
  automationActionLabel, mapAutomation, serializeAutomationActions, stableIndex, validateAutomationConfig,
} from '../lib/automationMapping'
import { getLocale, localeCode, useI18n } from '../i18n'
import '../dashboard.css'
import PageLoadingState from '../components/ui/PageLoadingState'

const TABS = ['Resumen', 'Historial', 'Configuración']

const RUN_STATUS_STYLE = {
  queued: { label: 'En cola', bg: '#6b728015', color: 'var(--muted)', border: 'var(--line-2)' },
  running: { label: 'Ejecutando', bg: '#3b82f620', color: 'var(--info)', border: '#3b82f640' },
  succeeded: { label: 'Completado', bg: '#10b98120', color: 'var(--success)', border: '#10b98140' },
  failed: { label: 'Fallido', bg: '#ef444420', color: 'var(--danger)', border: '#ef444440' },
}
const STEP_STATUS_STYLE = {
  pending: { label: 'Pendiente', bg: '#6b728015', color: 'var(--muted)', border: 'var(--line-2)' },
  succeeded: { label: 'Éxito', bg: '#10b98120', color: 'var(--success)', border: '#10b98140' },
  skipped: { label: 'Omitido', bg: '#6b728020', color: 'var(--muted)', border: '#2a324550' },
  blocked: { label: 'Bloqueado', bg: '#f9731620', color: 'var(--warn)', border: '#f9731640' },
  failed: { label: 'Fallido', bg: '#ef444420', color: 'var(--danger)', border: '#ef444440' },
}
const RUN_STATUS_FILTERS = ['', 'queued', 'running', 'succeeded', 'failed']

function StatusBadge({ status, map }) {
  const s = map[status] ?? { label: status ?? '—', bg: '#6b728015', color: 'var(--muted)', border: 'var(--line-2)' }
  return (
    <span style={{ fontSize:10.5, fontWeight:600, borderRadius:99, padding:'2px 9px', background:s.bg, color:s.color, border:`1px solid ${s.border}`, whiteSpace:'nowrap' }}>
      {s.label}
    </span>
  )
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(localeCode(getLocale()), { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

function truncate(value, max = 220) {
  if (value == null) return ''
  const str = typeof value === 'string' ? value : JSON.stringify(value)
  return str.length > max ? `${str.slice(0, max)}…` : str
}

const fieldStyle = { width:'100%', boxSizing:'border-box', background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:8, padding:'8px 10px', color:'var(--text)', fontSize:12.5 }
const labelStyle = { display:'flex', flexDirection:'column', gap:5, fontSize:11.5, fontWeight:600, color:'var(--dim)' }
const smallButtonStyle = { display:'inline-flex', alignItems:'center', gap:5, background:'transparent', border:'1px solid var(--line)', borderRadius:7, padding:'5px 9px', color:'var(--dim)', fontSize:11.5, cursor:'pointer' }

function configFromAutomation(auto) {
  return {
    name: auto.name ?? '',
    description: auto.description ?? '',
    trigger: auto.triggerEvent ?? '',
    actions: (auto.actions ?? []).map(action => ({ type: action.type, params: { ...(action.params ?? {}) } })),
  }
}

// Formulario de la pestaña Configuración: sustituye el JSON crudo por campos
// editables. Guarda con PUT /api/automations/:id; si ya hay una versión
// publicada, el cambio queda pendiente de publicar (los runs siguen usando la
// versión publicada hasta entonces).
export function AutomationConfigEditor({ auto, latestVersion, onSaved }) {
  const initial = useMemo(() => configFromAutomation(auto), [auto])
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { setDraft(initial) }, [initial])
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const triggerOptions = draft.trigger && !AUTOMATION_TRIGGER_OPTIONS.some(option => option.value === draft.trigger)
    ? [{ value: draft.trigger, label: draft.trigger }, ...AUTOMATION_TRIGGER_OPTIONS]
    : AUTOMATION_TRIGGER_OPTIONS

  const updateAction = (index, changes) => setDraft(current => ({ ...current, actions: current.actions.map((action, i) => i === index ? { ...action, ...changes } : action) }))
  const updateParam = (index, key, value) => setDraft(current => ({ ...current, actions: current.actions.map((action, i) => i === index ? { ...action, params: { ...action.params, [key]: value } } : action) }))
  const moveAction = (index, delta) => setDraft(current => {
    const next = [...current.actions]
    const target = index + delta
    if (target < 0 || target >= next.length) return current
    ;[next[index], next[target]] = [next[target], next[index]]
    return { ...current, actions: next }
  })

  async function save(event) {
    event.preventDefault()
    const validation = validateAutomationConfig(draft)
    if (validation) { setError(validation); return }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await apiFetch(`/api/automations/${auto.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          trigger: { event: draft.trigger },
          actions: serializeAutomationActions(draft.actions),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'No se pudieron guardar los cambios.')
      onSaved(payload)
      setNotice(payload?.hasUnpublishedChanges
        ? `Cambios guardados como borrador. Los runs siguen usando v${payload.latestVersion ?? latestVersion} hasta que publiques una nueva versión.`
        : 'Cambios guardados.')
    } catch (err) {
      setError(err?.message || 'No se pudieron guardar los cambios.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {latestVersion ? (
        <p style={{ margin:0, fontSize:12, color:'var(--dim)', background:'#8b5cf610', border:'1px solid #8b5cf630', borderRadius:9, padding:'9px 12px' }}>
          Editas la copia de trabajo. La versión publicada v{latestVersion} sigue ejecutándose hasta que publiques los cambios.
        </p>
      ) : null}
      <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>
        <p style={{ margin:0, fontSize:13, fontWeight:700, color:'var(--text-strong)' }}>General</p>
        <label style={labelStyle}>Nombre<input style={fieldStyle} value={draft.name} maxLength={120} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} required /></label>
        <label style={labelStyle}>Descripción<textarea style={{ ...fieldStyle, minHeight:60, resize:'vertical' }} value={draft.description} maxLength={500} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} /></label>
        <label style={labelStyle}>Disparador
          <select style={fieldStyle} value={draft.trigger} onChange={event => setDraft(current => ({ ...current, trigger: event.target.value }))} required>
            {!draft.trigger ? <option value="">Selecciona un evento…</option> : null}
            {triggerOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px', display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <p style={{ margin:0, fontSize:13, fontWeight:700, color:'var(--text-strong)' }}>Acciones ({draft.actions.length})</p>
          <button type="button" style={smallButtonStyle} disabled={draft.actions.length >= 20} onClick={() => setDraft(current => ({ ...current, actions: [...current.actions, { type: 'create_task', params: {} }] }))}><RiAddLine /> Añadir acción</button>
        </div>
        {draft.actions.length === 0 ? <p style={{ margin:0, color:'var(--dim)', fontSize:12.5 }}>Sin acciones. Una automatización sin acciones queda como borrador y no se puede activar.</p> : null}
        {draft.actions.map((action, index) => {
          const definition = AUTOMATION_ACTION_DEFINITIONS[action.type]
          const knownKeys = new Set((definition?.params ?? []).map(param => param.key))
          const extraKeys = Object.keys(action.params ?? {}).filter(key => !knownKeys.has(key))
          return (
            <div key={index} style={{ background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:9, padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
                <span style={{ width:22, height:22, borderRadius:6, background:'#8b5cf620', border:'1px solid #8b5cf640', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10.5, fontWeight:700, color:'var(--violet)', flexShrink:0 }}>{index + 1}</span>
                <label style={{ ...labelStyle, flex:'1 1 200px' }}>Tipo
                  <select style={fieldStyle} value={action.type} onChange={event => updateAction(index, { type: event.target.value, params: {} })}>
                    {!definition ? <option value={action.type}>{action.type}</option> : null}
                    {Object.entries(AUTOMATION_ACTION_DEFINITIONS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                  </select>
                </label>
                <button type="button" style={smallButtonStyle} aria-label={`Subir acción ${index + 1}`} disabled={index === 0} onClick={() => moveAction(index, -1)}><RiArrowUpLine /></button>
                <button type="button" style={smallButtonStyle} aria-label={`Bajar acción ${index + 1}`} disabled={index === draft.actions.length - 1} onClick={() => moveAction(index, 1)}><RiArrowDownLine /></button>
                <button type="button" style={{ ...smallButtonStyle, color:'var(--danger)' }} aria-label={`Eliminar acción ${index + 1}`} onClick={() => setDraft(current => ({ ...current, actions: current.actions.filter((_, i) => i !== index) }))}><RiDeleteBinLine /></button>
              </div>
              {(definition?.params ?? []).map(param => (
                <label key={param.key} style={labelStyle}>{param.label}{param.required ? ' *' : ''}
                  {param.type === 'select' ? (
                    <select style={fieldStyle} value={action.params?.[param.key] ?? ''} onChange={event => updateParam(index, param.key, event.target.value)}>
                      <option value="">{param.required ? 'Selecciona…' : 'Por defecto'}</option>
                      {param.options.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input style={fieldStyle} type={param.type === 'number' ? 'number' : 'text'} min={param.type === 'number' ? 0 : undefined} placeholder={param.placeholder} value={action.params?.[param.key] ?? ''} onChange={event => updateParam(index, param.key, event.target.value)} />
                  )}
                </label>
              ))}
              {extraKeys.length ? <p style={{ margin:0, fontSize:11, color:'var(--faint)' }}>Se conservan parámetros avanzados: {extraKeys.join(', ')}</p> : null}
            </div>
          )
        })}
      </div>
      {error ? <p role="alert" style={{ margin:0, fontSize:12, color:'var(--danger)' }}>{error}</p> : null}
      {notice ? <p role="status" style={{ margin:0, fontSize:12, color:'var(--success)' }}>{notice}</p> : null}
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap' }}>
        <button type="button" style={smallButtonStyle} disabled={!dirty || saving} onClick={() => { setDraft(initial); setError(''); setNotice('') }}>Descartar cambios</button>
        <button type="submit" disabled={!dirty || saving} style={{ border:'none', borderRadius:9, padding:'8px 16px', fontSize:13, fontWeight:600, color:'#fff', background:'linear-gradient(90deg,var(--accent-deep),var(--violet-deep))', cursor: !dirty || saving ? 'default' : 'pointer', opacity: !dirty || saving ? 0.6 : 1 }}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}

export default function AutomacionDetailPage() {
  const { locale } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const [auto, setAuto] = useState(null)
  const [loading, setLoading] = useState(true)
  // 'not_found' (404) y 'error' (red/servidor) no son lo mismo: el segundo ofrece reintento.
  const [loadState, setLoadState] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState('')
  const [tab, setTab] = useState('Resumen')

  // AU-104: historial de runs de la automatización
  const [runs, setRuns] = useState([])
  const [runsPage, setRunsPage] = useState(1)
  const [runsTotalPages, setRunsTotalPages] = useState(1)
  const [runsStatus, setRunsStatus] = useState('')
  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState(null)
  const [runDetail, setRunDetail] = useState(null)
  const [runDetailLoading, setRunDetailLoading] = useState(false)

  // AU-102: versionado inmutable — última versión publicada (si hay alguna)
  const [versions, setVersions] = useState([])
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')

  const loadVersions = useCallback(() => {
    apiFetch(`/api/automations/${id}/versions`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setVersions(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [id])

  const applyAutomation = useCallback(data => {
    setAuto(data ? mapAutomation(data, stableIndex(data.id)) : null)
  }, [])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setLoadState('loading')
    setLoadError('')
    apiFetch(`/api/automations/${id}`)
      .then(async response => {
        if (response.status === 404) return { notFound: true }
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error || `El servidor respondió ${response.status}.`)
        return { data: payload }
      })
      .then(result => {
        if (!mounted) return
        if (result.notFound || !result.data) { setAuto(null); setLoadState('not_found'); return }
        applyAutomation(result.data)
        setLoadState('ready')
      })
      .catch(error => {
        if (!mounted) return
        setAuto(null)
        setLoadState('error')
        setLoadError(error?.message || 'No se pudo conectar con el servicio.')
      })
      .finally(() => { if (mounted) setLoading(false) })
    loadVersions()
    return () => { mounted = false }
  }, [id, loadVersions, reloadKey, applyAutomation])

  const latestVersion = versions.length > 0 ? versions[0].version : null

  const publishVersion = () => {
    setPublishing(true)
    setPublishError('')
    apiFetch(`/api/automations/${id}/publish`, { method: 'POST' })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => null)
          throw new Error(body?.error ?? 'No se pudo publicar la versión')
        }
        return r.json()
      })
      .then(() => {
        loadVersions()
        setAuto(prev => prev ? { ...prev, rawStatus: 'active', hasUnpublishedChanges: false } : prev)
      })
      .catch(err => setPublishError(err.message))
      .finally(() => setPublishing(false))
  }

  const loadRuns = useCallback((page, status, append) => {
    setRunsLoading(true)
    setRunsError(false)
    const params = new URLSearchParams({ page: String(page), limit: '15' })
    if (status) params.set('status', status)
    apiFetch(`/api/automations/${id}/runs?${params.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        // Sin datos = el historial no se pudo leer; no es lo mismo que "no hay ejecuciones".
        if (!data || !Array.isArray(data.items)) { setRunsError(true); return }
        setRuns(prev => append ? [...prev, ...data.items] : data.items)
        setRunsPage(data.page)
        setRunsTotalPages(data.totalPages)
      })
      .catch(() => setRunsError(true))
      .finally(() => setRunsLoading(false))
  }, [id])

  useEffect(() => {
    if (tab !== 'Historial') return
    setRuns([])
    setSelectedRunId(null)
    setRunDetail(null)
    loadRuns(1, runsStatus, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, runsStatus, id])

  useEffect(() => {
    if (!selectedRunId) { setRunDetail(null); return }
    setRunDetailLoading(true)
    apiFetch(`/api/automations/${id}/runs/${selectedRunId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setRunDetail(data))
      .catch(() => setRunDetail(null))
      .finally(() => setRunDetailLoading(false))
  }, [selectedRunId, id])

  if (loading) return <PageLoadingState label={locale === 'en' ? 'Loading automation' : 'Cargando automatización'} />

  if (loadState === 'error') return (
    <div role="alert" style={{ flex:1, display:'flex', flexDirection:'column', gap:10, alignItems:'center', justifyContent:'center', color:'var(--dim)', fontSize:14, padding:24, textAlign:'center' }}>
      <strong style={{ color:'var(--text-strong)', fontSize:16 }}>No se pudo cargar la automatización</strong>
      <span>{loadError}</span>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={() => setReloadKey(value => value + 1)} style={{ fontSize:12.5, fontWeight:600, color:'var(--violet)', background:'#8b5cf615', border:'1px solid #8b5cf640', borderRadius:8, padding:'7px 14px', cursor:'pointer' }}>Reintentar</button>
        <button onClick={() => navigate('/automatizaciones')} style={{ fontSize:12.5, color:'var(--dim)', background:'none', border:'1px solid var(--line)', borderRadius:8, padding:'7px 14px', cursor:'pointer' }}>Volver</button>
      </div>
    </div>
  )

  if (!auto) return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:10, alignItems:'center', justifyContent:'center', color:'var(--dim)', fontSize:16 }}>
      Automatización no encontrada
      <button onClick={() => navigate('/automatizaciones')} style={{ fontSize:12.5, color:'var(--dim)', background:'none', border:'1px solid var(--line)', borderRadius:8, padding:'7px 14px', cursor:'pointer' }}>Volver a Automatizaciones</button>
    </div>
  )

  const isActive = auto.status === 'activa'
  // Sin actualización optimista: el backend puede rechazar activar un borrador sin acciones.
  const toggle = async () => {
    if (toggling) return
    setToggling(true)
    setToggleError('')
    try {
      const response = await apiFetch(`/api/automations/${id}/toggle`, { method: 'PUT' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'No se pudo cambiar el estado.')
      setAuto(prev => ({ ...prev, status: payload?.isActive ? 'activa' : 'pausada', rawStatus: payload?.status ?? prev.rawStatus }))
    } catch (error) {
      setToggleError(error?.message || 'No se pudo cambiar el estado.')
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="dark-scroll" style={{ flex:1, overflowY:'auto', background:'var(--bg)', display:'flex', flexDirection:'column' }}>

      {/* Back */}
      <div style={{ padding:'20px clamp(12px,4vw,28px) 0', flexShrink:0 }}>
        <button onClick={() => navigate('/automatizaciones')} style={{
          display:'flex', alignItems:'center', gap:6,
          background:'none', border:'none', color:'var(--dim)', fontSize:13, cursor:'pointer', padding:0,
        }}>
          <RiArrowLeftLine style={{ width:15, height:15 }} />
          Volver a Automatizaciones
        </button>
      </div>

      {/* Hero */}
      <div style={{ padding:'20px clamp(12px,4vw,28px)', flexShrink:0 }}>
        <div style={{
          background:'linear-gradient(135deg, var(--surface), var(--surface-2))',
          border:'1px solid var(--line)', borderRadius:16, padding:'22px clamp(14px,3vw,24px)',
          display:'flex', gap:18, alignItems:'flex-start', flexWrap:'wrap',
        }}>
          <div style={{
            width:52, height:52, borderRadius:14, flexShrink:0,
            background:`linear-gradient(145deg, color-mix(in srgb, ${auto.iconBg} 33%, transparent), color-mix(in srgb, ${auto.iconBg} 15%, transparent))`,
            border:`1px solid color-mix(in srgb, ${auto.iconBg} 31%, transparent)`,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:`0 0 20px color-mix(in srgb, ${auto.iconBg} 21%, transparent)`,
          }}>
            <auto.Icon style={{ width:22, height:22, color:auto.iconColor }} />
          </div>

          <div style={{ flex:'1 1 220px', minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5, flexWrap:'wrap' }}>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:'var(--text-strong)', minWidth:0, overflowWrap:'anywhere' }}>{auto.name}</h1>
              <span style={{ fontSize:12, fontWeight:600, borderRadius:99, padding:'2px 10px', background: isActive ? '#10b98120' : '#6b728015', color: isActive ? 'var(--success)' : 'var(--muted)', border: `1px solid ${isActive ? '#10b98140' : 'var(--line-2)'}` }}>
                {isActive ? 'Activa' : 'Pausada'}
              </span>
            </div>
            {auto.desc && <p style={{ margin:'0 0 10px', fontSize:13, color:'var(--dim)', lineHeight:1.5 }}>{auto.desc}</p>}
            {auto.tags.length > 0 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {auto.tags.map(t => (
                  <span key={t} style={{ fontSize:11, color:'var(--dim)', background:'var(--line)', border:'1px solid var(--line-2)', borderRadius:5, padding:'2px 8px', fontWeight:500 }}>{t}</span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0, minWidth:0, maxWidth:'100%' }}>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
              {auto.actions.length > 0 && (
                <button onClick={publishVersion} disabled={publishing} style={{
                  display:'flex', alignItems:'center', gap:6,
                  background:'#10b98115', border:'1px solid #10b98140',
                  borderRadius:9, padding:'8px 14px',
                  color:'var(--success)', fontSize:13, fontWeight:600,
                  cursor: publishing ? 'default' : 'pointer', opacity: publishing ? 0.6 : 1,
                }}>
                  <RiGitBranchLine style={{ width:14, height:14 }} />
                  {publishing ? 'Publicando…' : latestVersion ? `Publicar nueva versión (v${latestVersion} actual)` : 'Publicar versión'}
                </button>
              )}
              <button onClick={toggle} disabled={toggling} aria-busy={toggling} style={{
                display:'flex', alignItems:'center', gap:6,
                background: isActive ? '#ef444410' : 'linear-gradient(90deg,var(--accent-deep),var(--violet-deep))',
                border: isActive ? '1px solid #ef444430' : 'none',
                borderRadius:9, padding:'8px 14px',
                color: isActive ? 'var(--danger)' : '#fff', fontSize:13, fontWeight:600, cursor: toggling ? 'default' : 'pointer', opacity: toggling ? 0.6 : 1,
              }}>
                {isActive ? <RiPauseLine style={{ width:14, height:14 }} /> : <RiPlayLine style={{ width:14, height:14 }} />}
                {toggling ? 'Guardando…' : isActive ? 'Pausar' : auto.rawStatus === 'draft' ? 'Activar' : 'Reanudar'}
              </button>
            </div>
            {auto.hasUnpublishedChanges && latestVersion && <p style={{ margin:0, fontSize:11, color:'var(--warn)', maxWidth:260, textAlign:'right' }}>Hay cambios sin publicar: los runs siguen usando v{latestVersion}.</p>}
            {publishError && <p role="alert" style={{ margin:0, fontSize:11, color:'var(--danger)', maxWidth:220, textAlign:'right' }}>{publishError}</p>}
            {toggleError && <p role="alert" style={{ margin:0, fontSize:11, color:'var(--danger)', maxWidth:260, textAlign:'right' }}>{toggleError}</p>}
          </div>
        </div>
      </div>

      {/* KPI row — solo lo que existe de verdad en el modelo (runsCount, lastRunAt) */}
      <div style={{ padding:'0 clamp(12px,4vw,24px) 20px', flexShrink:0, display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(min(160px,100%),1fr))', gap:12 }}>
        {[
          { label:'Ejecuciones totales', value:auto.execs },
          { label:'Última ejecución', value:auto.last },
          { label:'Estado', value: isActive ? 'Activa' : 'Pausada' },
          { label:'Acciones configuradas', value: String(auto.actions.length) },
        ].map((k, i) => (
          <div key={i} style={{ flex:1, background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'14px 16px' }}>
            <p style={{ margin:'0 0 6px', fontSize:11, color: 'var(--dim)', fontWeight:600 }}>{k.label}</p>
            <p style={{ margin:0, fontSize:20, fontWeight:800, color:'var(--text-strong)', letterSpacing:-0.5 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="split-pane" style={{ flex:1, display:'flex', gap:14, padding:'0 clamp(12px,4vw,28px) 28px', minHeight:0 }}>

        {/* Left */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:12 }}>

          {/* Tabs */}
          <div className="tabs-scroll" style={{ display:'flex', gap:0, borderBottom:'1px solid var(--line)' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background:'none', border:'none', padding:'8px 16px', fontSize:13,
                color: tab===t ? 'var(--text-strong)' : 'var(--faint)',
                borderBottom:`2px solid ${tab===t ? 'var(--violet)' : 'transparent'}`,
                cursor:'pointer', fontWeight: tab===t ? 700 : 400, transition:'all .15s', marginBottom:-1,
              }}>{t}</button>
            ))}
          </div>

          {tab === 'Resumen' && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
              <p style={{ margin:'0 0 12px', fontSize:12.5, fontWeight:700, color:'var(--text)' }}>Qué hace esta automatización</p>
              {auto.actions.length === 0 ? (
                <p style={{ color: 'var(--dim)', fontSize:13 }}>Sin acciones configuradas.</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {auto.actions.map((a, i) => (
                    <div key={i} style={{ display:'flex', gap:10, alignItems:'center', padding:'10px 12px', background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:9 }}>
                      <span style={{ width:22, height:22, borderRadius:6, background:'#8b5cf620', border:'1px solid #8b5cf640', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10.5, fontWeight:700, color:'var(--violet)', flexShrink:0 }}>{i + 1}</span>
                      <div style={{ minWidth:0 }}>
                        <p style={{ margin:0, fontSize:12.5, fontWeight:600, color:'var(--text)' }}>{automationActionLabel(a.type)}</p>
                        {a.params && <p style={{ margin:0, fontSize:11, color: 'var(--dim)', overflowWrap:'anywhere' }}>{JSON.stringify(a.params)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'Historial' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
                  <p style={{ margin:0, fontSize:12.5, fontWeight:700, color:'var(--text)' }}>Historial de ejecuciones</p>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {RUN_STATUS_FILTERS.map(s => (
                      <button key={s || 'all'} onClick={() => setRunsStatus(s)} style={{
                        fontSize:11, fontWeight:600, borderRadius:99, padding:'4px 11px', cursor:'pointer',
                        background: runsStatus === s ? '#8b5cf620' : 'transparent',
                        color: runsStatus === s ? 'var(--violet)' : 'var(--dim)',
                        border: `1px solid ${runsStatus === s ? '#8b5cf650' : 'var(--line)'}`,
                      }}>
                        {s ? (RUN_STATUS_STYLE[s]?.label ?? s) : 'Todos'}
                      </button>
                    ))}
                  </div>
                </div>

                {runsError && runs.length === 0 && !runsLoading ? (
                  <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                    <p style={{ margin:0, fontSize:13, color:'var(--danger-faint)' }}>
                      No se pudo cargar el historial de ejecuciones.
                    </p>
                    <button onClick={() => loadRuns(1, runsStatus, false)} style={{
                      fontSize:12, fontWeight:600, color:'var(--violet)', background:'#8b5cf615',
                      border:'1px solid #8b5cf640', borderRadius:8, padding:'5px 12px', cursor:'pointer',
                    }}>
                      Reintentar
                    </button>
                  </div>
                ) : runs.length === 0 && !runsLoading ? (
                  <p style={{ margin:0, fontSize:13, color: 'var(--dim)' }}>
                    Todavía no hay ejecuciones registradas{runsStatus ? ' con este estado' : ''}.
                  </p>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {runs.map(run => (
                      <button key={run.id} onClick={() => setSelectedRunId(run.id)} style={{
                        display:'flex', alignItems:'center', gap:10, padding:'10px 12px', textAlign:'left', flexWrap:'wrap',
                        background: selectedRunId === run.id ? '#8b5cf615' : 'var(--surface-2)',
                        border: `1px solid ${selectedRunId === run.id ? '#8b5cf650' : 'var(--surface-hover)'}`,
                        borderRadius:9, cursor:'pointer', width:'100%',
                      }}>
                        <StatusBadge status={run.status} map={RUN_STATUS_STYLE} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ margin:0, fontSize:12, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {run.triggerEventId}
                          </p>
                          <p style={{ margin:0, fontSize:11, color: 'var(--dim)' }}>
                            {formatDateTime(run.startedAt ?? run.createdAt)}
                            {run.finishedAt ? ` → ${formatDateTime(run.finishedAt)}` : ''}
                          </p>
                        </div>
                        <span style={{ fontSize:10.5, fontWeight:600, color: run.automationVersionNumber ? 'var(--violet)' : 'var(--faint)', flexShrink:0, whiteSpace:'nowrap' }}>
                          {run.automationVersionNumber ? `v${run.automationVersionNumber}` : 'sin versión publicada'}
                        </span>
                        <div style={{ display:'flex', gap:5, flexShrink:0, fontSize:10.5, color: 'var(--dim)' }}>
                          {run.stepCounts.succeeded > 0 && <span style={{ color:'var(--success)' }}>{run.stepCounts.succeeded} ok</span>}
                          {run.stepCounts.skipped > 0 && <span>{run.stepCounts.skipped} omit.</span>}
                          {run.stepCounts.blocked > 0 && <span style={{ color:'var(--warn)' }}>{run.stepCounts.blocked} bloq.</span>}
                          {run.stepCounts.failed > 0 && <span style={{ color:'var(--danger)' }}>{run.stepCounts.failed} error</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {runsPage < runsTotalPages && (
                  <div style={{ display:'flex', justifyContent:'center', marginTop:12 }}>
                    <button
                      disabled={runsLoading}
                      onClick={() => loadRuns(runsPage + 1, runsStatus, true)}
                      style={{
                        fontSize:12, fontWeight:600, color:'var(--violet)', background:'#8b5cf615',
                        border:'1px solid #8b5cf640', borderRadius:8, padding:'7px 16px',
                        cursor: runsLoading ? 'default' : 'pointer', opacity: runsLoading ? 0.6 : 1,
                      }}
                    >
                      {runsLoading ? 'Cargando…' : 'Cargar más'}
                    </button>
                  </div>
                )}
              </div>

              {selectedRunId && (
                <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'16px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                    <p style={{ margin:0, fontSize:12.5, fontWeight:700, color:'var(--text)' }}>Detalle de ejecución</p>
                    <button onClick={() => setSelectedRunId(null)} style={{ background:'none', border:'none', color: 'var(--dim)', cursor:'pointer', padding:2, display:'flex' }}>
                      <RiCloseLine style={{ width:16, height:16 }} />
                    </button>
                  </div>

                  {runDetailLoading ? (
                    <p style={{ margin:0, fontSize:13, color: 'var(--dim)' }}>Cargando…</p>
                  ) : !runDetail ? (
                    <p style={{ margin:0, fontSize:13, color: 'var(--dim)' }}>No se pudo cargar el detalle.</p>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:11.5, color:'var(--dim)' }}>
                        <span>Estado: <StatusBadge status={runDetail.status} map={RUN_STATUS_STYLE} /></span>
                        <span>Intento: <strong style={{ color:'var(--muted)' }}>{runDetail.attempt}</strong></span>
                        <span>Inicio: <strong style={{ color:'var(--muted)' }}>{formatDateTime(runDetail.startedAt)}</strong></span>
                        <span>Fin: <strong style={{ color:'var(--muted)' }}>{formatDateTime(runDetail.finishedAt)}</strong></span>
                      </div>
                      {runDetail.error && (
                        <div style={{ background:'#ef444410', border:'1px solid #ef444440', borderRadius:8, padding:'8px 10px' }}>
                          <p style={{ margin:0, fontSize:11.5, color:'var(--danger-faint)' }}>{truncate(runDetail.error)}</p>
                        </div>
                      )}

                      <p style={{ margin:'4px 0 0', fontSize:11.5, fontWeight:700, color:'var(--muted)' }}>Pasos ({(runDetail.stepRuns ?? []).length})</p>
                      {(runDetail.stepRuns ?? []).length === 0 ? (
                        <p style={{ margin:0, fontSize:12, color: 'var(--dim)' }}>Este run todavía no ejecutó pasos.</p>
                      ) : (
                        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                          {runDetail.stepRuns.map(step => (
                            <div key={step.id} style={{ background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:9, padding:'10px 12px' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: (step.errorDetail || step.output || step.input) ? 6 : 0 }}>
                                <span style={{ fontSize:10.5, fontWeight:700, color: 'var(--dim)' }}>#{step.stepKey}</span>
                                <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{step.type}</span>
                                <StatusBadge status={step.status} map={STEP_STATUS_STYLE} />
                              </div>
                              {step.errorCode && (
                                <p style={{ margin:'4px 0', fontSize:11, color:'var(--warn)' }}>
                                  <strong>{step.errorCode}</strong>{step.errorDetail ? ` — ${truncate(step.errorDetail, 160)}` : ''}
                                </p>
                              )}
                              {step.input != null && (
                                <p style={{ margin:'2px 0', fontSize:10.5, color: 'var(--dim)', wordBreak:'break-all' }}>
                                  input: {truncate(step.input, 160)}
                                </p>
                              )}
                              {step.output != null && (
                                <p style={{ margin:'2px 0', fontSize:10.5, color: 'var(--dim)', wordBreak:'break-all' }}>
                                  output: {truncate(step.output, 160)}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'Configuración' && (
            <AutomationConfigEditor auto={auto} latestVersion={latestVersion} onSaved={applyAutomation} />
          )}
        </div>

        {/* Right */}
        <div className="split-rail" style={{ '--rail-width':'240px', display:'flex', flexDirection:'column', gap:12 }}>
          {/* Trigger */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'14px' }}>
            <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'var(--text)' }}>Disparador</p>
            <div style={{ display:'flex', gap:10, alignItems:'center', background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:9, padding:'10px 12px' }}>
              <auto.TriggerIcon style={{ width:18, height:18, color:auto.iconColor, flexShrink:0 }} />
              <p style={{ margin:0, fontSize:11.5, color:'var(--muted)', lineHeight:1.4 }}>{auto.trigger}</p>
            </div>
          </div>

          {/* Flow — pasos reales de la automatización */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:12, padding:'14px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12 }}>
              <RiFlowChart style={{ width:13, height:13, color:'var(--dim)' }} />
              <p style={{ margin:0, fontSize:12, fontWeight:700, color:'var(--text)' }}>Flujo</p>
            </div>
            {auto.actions.length === 0 ? (
              <p style={{ margin:0, fontSize:11, color: 'var(--dim)' }}>Sin acciones configuradas.</p>
            ) : (
              auto.actions.map((a, i) => (
                <div key={i}>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:auto.iconColor, flexShrink:0, boxShadow:`0 0 5px color-mix(in srgb, ${auto.iconColor} 50%, transparent)` }} />
                    <div style={{ flex:1 }}>
                      <p style={{ margin:0, fontSize:12, fontWeight:600, color:'var(--text)' }}>{automationActionLabel(a.type)}</p>
                    </div>
                    {i < auto.actions.length - 1 && <RiArrowRightLine style={{ width:12, height:12, color: 'var(--dim)', flexShrink:0 }} />}
                  </div>
                  {i < auto.actions.length - 1 && <div style={{ width:1, height:14, background:'var(--line)', margin:'4px 0 4px 3.5px' }} />}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
