import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiArrowLeftLine, RiPlayLine, RiPauseLine,
  RiArrowRightLine, RiFlowChart, RiCloseLine, RiGitBranchLine,
} from 'react-icons/ri'
import { mapAutomation, stableIndex } from '../lib/automationMapping'
import { getLocale, localeCode, useI18n } from '../i18n'
import '../dashboard.css'

const TABS = ['Resumen', 'Historial', 'Configuración']

const RUN_STATUS_STYLE = {
  queued: { label: 'En cola', bg: '#6b728015', color: '#9ca3af', border: '#2a3245' },
  running: { label: 'Ejecutando', bg: '#3b82f620', color: '#60a5fa', border: '#3b82f640' },
  succeeded: { label: 'Completado', bg: '#10b98120', color: '#10b981', border: '#10b98140' },
  failed: { label: 'Fallido', bg: '#ef444420', color: '#ef4444', border: '#ef444440' },
}
const STEP_STATUS_STYLE = {
  pending: { label: 'Pendiente', bg: '#6b728015', color: '#9ca3af', border: '#2a3245' },
  succeeded: { label: 'Éxito', bg: '#10b98120', color: '#10b981', border: '#10b98140' },
  skipped: { label: 'Omitido', bg: '#6b728020', color: '#9ca3af', border: '#2a324550' },
  blocked: { label: 'Bloqueado', bg: '#f9731620', color: '#fb923c', border: '#f9731640' },
  failed: { label: 'Fallido', bg: '#ef444420', color: '#ef4444', border: '#ef444440' },
}
const RUN_STATUS_FILTERS = ['', 'queued', 'running', 'succeeded', 'failed']

function StatusBadge({ status, map }) {
  const s = map[status] ?? { label: status ?? '—', bg: '#6b728015', color: '#9ca3af', border: '#2a3245' }
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

export default function AutomacionDetailPage() {
  const { locale } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const [auto, setAuto] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Resumen')

  // AU-104: historial de runs de la automatización
  const [runs, setRuns] = useState([])
  const [runsPage, setRunsPage] = useState(1)
  const [runsTotalPages, setRunsTotalPages] = useState(1)
  const [runsStatus, setRunsStatus] = useState('')
  const [runsLoading, setRunsLoading] = useState(false)
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

  useEffect(() => {
    apiFetch(`/api/automations/${id}`).then(r => r.ok ? r.json() : null).then(data => {
      setAuto(data ? mapAutomation(data, stableIndex(data.id)) : null)
      setLoading(false)
    }).catch(() => setLoading(false))
    loadVersions()
  }, [id, loadVersions])

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
        setAuto(prev => prev ? { ...prev, rawStatus: 'active' } : prev)
      })
      .catch(err => setPublishError(err.message))
      .finally(() => setPublishing(false))
  }

  const loadRuns = useCallback((page, status, append) => {
    setRunsLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '15' })
    if (status) params.set('status', status)
    apiFetch(`/api/automations/${id}/runs?${params.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setRuns(prev => append ? [...prev, ...data.items] : data.items)
        setRunsPage(data.page)
        setRunsTotalPages(data.totalPages)
      })
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
      .finally(() => setRunDetailLoading(false))
  }, [selectedRunId, id])

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:16 }}>
      {locale === 'en' ? 'Loading…' : 'Cargando…'}
    </div>
  )

  if (!auto) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:16 }}>
      Automatización no encontrada
    </div>
  )

  const isActive = auto.status === 'activa'
  const toggle = () => {
    apiFetch(`/api/automations/${id}/toggle`, { method: 'PUT' }).catch(() => {})
    setAuto(prev => ({ ...prev, status: isActive ? 'pausada' : 'activa' }))
  }

  return (
    <div className="dark-scroll" style={{ flex:1, overflowY:'auto', background:'#080c14', display:'flex', flexDirection:'column' }}>

      {/* Back */}
      <div style={{ padding:'20px 28px 0', flexShrink:0 }}>
        <button onClick={() => navigate('/automatizaciones')} style={{
          display:'flex', alignItems:'center', gap:6,
          background:'none', border:'none', color:'#6b7280', fontSize:13, cursor:'pointer', padding:0,
        }}>
          <RiArrowLeftLine style={{ width:15, height:15 }} />
          Volver a Automatizaciones
        </button>
      </div>

      {/* Hero */}
      <div style={{ padding:'20px 28px', flexShrink:0 }}>
        <div style={{
          background:'linear-gradient(135deg, #0d1117, #111827)',
          border:'1px solid #1e2433', borderRadius:16, padding:'22px 24px',
          display:'flex', gap:18, alignItems:'flex-start',
        }}>
          <div style={{
            width:52, height:52, borderRadius:14, flexShrink:0,
            background:`linear-gradient(145deg, ${auto.iconBg}55, ${auto.iconBg}25)`,
            border:`1px solid ${auto.iconBg}50`,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:`0 0 20px ${auto.iconBg}35`,
          }}>
            <auto.Icon style={{ width:22, height:22, color:auto.iconColor }} />
          </div>

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5 }}>
              <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:'#f1f5f9' }}>{auto.name}</h1>
              <span style={{ fontSize:12, fontWeight:600, borderRadius:99, padding:'2px 10px', background: isActive ? '#10b98120' : '#6b728015', color: isActive ? '#10b981' : '#9ca3af', border: `1px solid ${isActive ? '#10b98140' : '#2a3245'}` }}>
                {isActive ? 'Activa' : 'Pausada'}
              </span>
            </div>
            {auto.desc && <p style={{ margin:'0 0 10px', fontSize:13, color:'#6b7280', lineHeight:1.5 }}>{auto.desc}</p>}
            {auto.tags.length > 0 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {auto.tags.map(t => (
                  <span key={t} style={{ fontSize:11, color:'#6b7280', background:'#1e2433', border:'1px solid #2a3245', borderRadius:5, padding:'2px 8px', fontWeight:500 }}>{t}</span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0 }}>
            <div style={{ display:'flex', gap:8 }}>
              {auto.actions.length > 0 && (
                <button onClick={publishVersion} disabled={publishing} style={{
                  display:'flex', alignItems:'center', gap:6,
                  background:'#10b98115', border:'1px solid #10b98140',
                  borderRadius:9, padding:'8px 14px',
                  color:'#10b981', fontSize:13, fontWeight:600,
                  cursor: publishing ? 'default' : 'pointer', opacity: publishing ? 0.6 : 1,
                }}>
                  <RiGitBranchLine style={{ width:14, height:14 }} />
                  {publishing ? 'Publicando…' : latestVersion ? `Publicar nueva versión (v${latestVersion} actual)` : 'Publicar versión'}
                </button>
              )}
              <button onClick={toggle} style={{
                display:'flex', alignItems:'center', gap:6,
                background: isActive ? '#ef444410' : 'linear-gradient(90deg,#4f46e5,#7c3aed)',
                border: isActive ? '1px solid #ef444430' : 'none',
                borderRadius:9, padding:'8px 14px',
                color: isActive ? '#ef4444' : '#fff', fontSize:13, fontWeight:600, cursor:'pointer',
              }}>
                {isActive ? <RiPauseLine style={{ width:14, height:14 }} /> : <RiPlayLine style={{ width:14, height:14 }} />}
                {isActive ? 'Pausar' : 'Reanudar'}
              </button>
            </div>
            {publishError && <p style={{ margin:0, fontSize:11, color:'#ef4444', maxWidth:220, textAlign:'right' }}>{publishError}</p>}
          </div>
        </div>
      </div>

      {/* KPI row — solo lo que existe de verdad en el modelo (runsCount, lastRunAt) */}
      <div style={{ padding:'0 24px 20px', flexShrink:0, display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12 }}>
        {[
          { label:'Ejecuciones totales', value:auto.execs },
          { label:'Última ejecución', value:auto.last },
          { label:'Estado', value: isActive ? 'Activa' : 'Pausada' },
          { label:'Acciones configuradas', value: String(auto.actions.length) },
        ].map((k, i) => (
          <div key={i} style={{ flex:1, background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px 16px' }}>
            <p style={{ margin:'0 0 6px', fontSize:11, color:'#4b5563', fontWeight:600 }}>{k.label}</p>
            <p style={{ margin:0, fontSize:20, fontWeight:800, color:'#f1f5f9', letterSpacing:-0.5 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', gap:14, padding:'0 28px 28px', minHeight:0 }}>

        {/* Left */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:12 }}>

          {/* Tabs */}
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid #1e2433' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background:'none', border:'none', padding:'8px 16px', fontSize:13,
                color: tab===t ? '#f1f5f9' : '#4b5563',
                borderBottom:`2px solid ${tab===t ? '#8b5cf6' : 'transparent'}`,
                cursor:'pointer', fontWeight: tab===t ? 700 : 400, transition:'all .15s', marginBottom:-1,
              }}>{t}</button>
            ))}
          </div>

          {tab === 'Resumen' && (
            <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
              <p style={{ margin:'0 0 12px', fontSize:12.5, fontWeight:700, color:'#e2e8f0' }}>Qué hace esta automatización</p>
              {auto.actions.length === 0 ? (
                <p style={{ color:'#4b5563', fontSize:13 }}>Sin acciones configuradas.</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {auto.actions.map((a, i) => (
                    <div key={i} style={{ display:'flex', gap:10, alignItems:'center', padding:'10px 12px', background:'#111827', border:'1px solid #1a2235', borderRadius:9 }}>
                      <span style={{ width:22, height:22, borderRadius:6, background:'#8b5cf620', border:'1px solid #8b5cf640', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10.5, fontWeight:700, color:'#a78bfa', flexShrink:0 }}>{i + 1}</span>
                      <div>
                        <p style={{ margin:0, fontSize:12.5, fontWeight:600, color:'#e2e8f0' }}>{a.type ?? 'acción'}</p>
                        {a.params && <p style={{ margin:0, fontSize:11, color:'#4b5563' }}>{JSON.stringify(a.params)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'Historial' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
                  <p style={{ margin:0, fontSize:12.5, fontWeight:700, color:'#e2e8f0' }}>Historial de ejecuciones</p>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {RUN_STATUS_FILTERS.map(s => (
                      <button key={s || 'all'} onClick={() => setRunsStatus(s)} style={{
                        fontSize:11, fontWeight:600, borderRadius:99, padding:'4px 11px', cursor:'pointer',
                        background: runsStatus === s ? '#8b5cf620' : 'transparent',
                        color: runsStatus === s ? '#a78bfa' : '#6b7280',
                        border: `1px solid ${runsStatus === s ? '#8b5cf650' : '#1e2433'}`,
                      }}>
                        {s ? (RUN_STATUS_STYLE[s]?.label ?? s) : 'Todos'}
                      </button>
                    ))}
                  </div>
                </div>

                {runs.length === 0 && !runsLoading ? (
                  <p style={{ margin:0, fontSize:13, color:'#4b5563' }}>
                    Todavía no hay ejecuciones registradas{runsStatus ? ' con este estado' : ''}.
                  </p>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {runs.map(run => (
                      <button key={run.id} onClick={() => setSelectedRunId(run.id)} style={{
                        display:'flex', alignItems:'center', gap:10, padding:'10px 12px', textAlign:'left',
                        background: selectedRunId === run.id ? '#8b5cf615' : '#111827',
                        border: `1px solid ${selectedRunId === run.id ? '#8b5cf650' : '#1a2235'}`,
                        borderRadius:9, cursor:'pointer', width:'100%',
                      }}>
                        <StatusBadge status={run.status} map={RUN_STATUS_STYLE} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ margin:0, fontSize:12, fontWeight:600, color:'#e2e8f0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {run.triggerEventId}
                          </p>
                          <p style={{ margin:0, fontSize:11, color:'#4b5563' }}>
                            {formatDateTime(run.startedAt ?? run.createdAt)}
                            {run.finishedAt ? ` → ${formatDateTime(run.finishedAt)}` : ''}
                          </p>
                        </div>
                        <span style={{ fontSize:10.5, fontWeight:600, color: run.automationVersionNumber ? '#a78bfa' : '#4b5563', flexShrink:0, whiteSpace:'nowrap' }}>
                          {run.automationVersionNumber ? `v${run.automationVersionNumber}` : 'sin versión publicada'}
                        </span>
                        <div style={{ display:'flex', gap:5, flexShrink:0, fontSize:10.5, color:'#4b5563' }}>
                          {run.stepCounts.succeeded > 0 && <span style={{ color:'#10b981' }}>{run.stepCounts.succeeded} ok</span>}
                          {run.stepCounts.skipped > 0 && <span>{run.stepCounts.skipped} omit.</span>}
                          {run.stepCounts.blocked > 0 && <span style={{ color:'#fb923c' }}>{run.stepCounts.blocked} bloq.</span>}
                          {run.stepCounts.failed > 0 && <span style={{ color:'#ef4444' }}>{run.stepCounts.failed} error</span>}
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
                        fontSize:12, fontWeight:600, color:'#a78bfa', background:'#8b5cf615',
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
                <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                    <p style={{ margin:0, fontSize:12.5, fontWeight:700, color:'#e2e8f0' }}>Detalle de ejecución</p>
                    <button onClick={() => setSelectedRunId(null)} style={{ background:'none', border:'none', color:'#4b5563', cursor:'pointer', padding:2, display:'flex' }}>
                      <RiCloseLine style={{ width:16, height:16 }} />
                    </button>
                  </div>

                  {runDetailLoading ? (
                    <p style={{ margin:0, fontSize:13, color:'#4b5563' }}>Cargando…</p>
                  ) : !runDetail ? (
                    <p style={{ margin:0, fontSize:13, color:'#4b5563' }}>No se pudo cargar el detalle.</p>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:11.5, color:'#6b7280' }}>
                        <span>Estado: <StatusBadge status={runDetail.status} map={RUN_STATUS_STYLE} /></span>
                        <span>Intento: <strong style={{ color:'#94a3b8' }}>{runDetail.attempt}</strong></span>
                        <span>Inicio: <strong style={{ color:'#94a3b8' }}>{formatDateTime(runDetail.startedAt)}</strong></span>
                        <span>Fin: <strong style={{ color:'#94a3b8' }}>{formatDateTime(runDetail.finishedAt)}</strong></span>
                      </div>
                      {runDetail.error && (
                        <div style={{ background:'#ef444410', border:'1px solid #ef444440', borderRadius:8, padding:'8px 10px' }}>
                          <p style={{ margin:0, fontSize:11.5, color:'#fca5a5' }}>{truncate(runDetail.error)}</p>
                        </div>
                      )}

                      <p style={{ margin:'4px 0 0', fontSize:11.5, fontWeight:700, color:'#94a3b8' }}>Pasos ({(runDetail.stepRuns ?? []).length})</p>
                      {(runDetail.stepRuns ?? []).length === 0 ? (
                        <p style={{ margin:0, fontSize:12, color:'#4b5563' }}>Este run todavía no ejecutó pasos.</p>
                      ) : (
                        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                          {runDetail.stepRuns.map(step => (
                            <div key={step.id} style={{ background:'#111827', border:'1px solid #1a2235', borderRadius:9, padding:'10px 12px' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: (step.errorDetail || step.output || step.input) ? 6 : 0 }}>
                                <span style={{ fontSize:10.5, fontWeight:700, color:'#4b5563' }}>#{step.stepKey}</span>
                                <span style={{ fontSize:12, fontWeight:600, color:'#e2e8f0' }}>{step.type}</span>
                                <StatusBadge status={step.status} map={STEP_STATUS_STYLE} />
                              </div>
                              {step.errorCode && (
                                <p style={{ margin:'4px 0', fontSize:11, color:'#fb923c' }}>
                                  <strong>{step.errorCode}</strong>{step.errorDetail ? ` — ${truncate(step.errorDetail, 160)}` : ''}
                                </p>
                              )}
                              {step.input != null && (
                                <p style={{ margin:'2px 0', fontSize:10.5, color:'#4b5563', wordBreak:'break-all' }}>
                                  input: {truncate(step.input, 160)}
                                </p>
                              )}
                              {step.output != null && (
                                <p style={{ margin:'2px 0', fontSize:10.5, color:'#4b5563', wordBreak:'break-all' }}>
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
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#f1f5f9' }}>Disparador</p>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0' }}>
                  <span style={{ fontSize:12, color:'#4b5563' }}>Evento</span>
                  <span style={{ fontSize:12.5, fontWeight:600, color:'#94a3b8' }}>{auto.trigger}</span>
                </div>
              </div>
              <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'16px' }}>
                <p style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'#f1f5f9' }}>Acciones ({auto.actions.length})</p>
                {auto.actions.length === 0 ? (
                  <p style={{ color:'#4b5563', fontSize:13 }}>Sin acciones configuradas.</p>
                ) : (
                  auto.actions.map((a, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom: i < auto.actions.length - 1 ? '1px solid #111827' : 'none' }}>
                      <span style={{ fontSize:12, color:'#4b5563' }}>Acción {i + 1}</span>
                      <span style={{ fontSize:12.5, fontWeight:600, color:'#94a3b8' }}>{a.type}{a.params ? ` — ${JSON.stringify(a.params)}` : ''}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right */}
        <div style={{ width:240, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>
          {/* Trigger */}
          <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px' }}>
            <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'#e2e8f0' }}>Disparador</p>
            <div style={{ display:'flex', gap:10, alignItems:'center', background:'#111827', border:'1px solid #1e2433', borderRadius:9, padding:'10px 12px' }}>
              <auto.TriggerIcon style={{ width:18, height:18, color:auto.iconColor, flexShrink:0 }} />
              <p style={{ margin:0, fontSize:11.5, color:'#94a3b8', lineHeight:1.4 }}>{auto.trigger}</p>
            </div>
          </div>

          {/* Flow — pasos reales de la automatización */}
          <div style={{ background:'#0d1117', border:'1px solid #1e2433', borderRadius:12, padding:'14px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12 }}>
              <RiFlowChart style={{ width:13, height:13, color:'#6b7280' }} />
              <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#e2e8f0' }}>Flujo</p>
            </div>
            {auto.actions.length === 0 ? (
              <p style={{ margin:0, fontSize:11, color:'#4b5563' }}>Sin acciones configuradas.</p>
            ) : (
              auto.actions.map((a, i) => (
                <div key={i}>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:auto.iconColor, flexShrink:0, boxShadow:`0 0 5px ${auto.iconColor}80` }} />
                    <div style={{ flex:1 }}>
                      <p style={{ margin:0, fontSize:12, fontWeight:600, color:'#e2e8f0' }}>{a.type ?? 'acción'}</p>
                    </div>
                    {i < auto.actions.length - 1 && <RiArrowRightLine style={{ width:12, height:12, color:'#374151', flexShrink:0 }} />}
                  </div>
                  {i < auto.actions.length - 1 && <div style={{ width:1, height:14, background:'#1e2433', margin:'4px 0 4px 3.5px' }} />}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
