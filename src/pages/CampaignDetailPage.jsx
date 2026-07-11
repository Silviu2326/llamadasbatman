import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  RiArrowLeftLine, RiPauseCircleLine, RiPlayCircleLine, RiEditLine, RiMore2Line,
  RiSendPlaneLine, RiGroupLine, RiCalendarLine, RiCalendar2Line, RiBarChartLine,
  RiExternalLinkLine, RiMoneyDollarCircleLine,
} from 'react-icons/ri'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip } from 'recharts'
import { apiFetch } from '../lib/api'
import '../dashboard.css'

const OBJECTIVE_STYLE = {
  'RecuperaciÃ³n de leads':   { grad: ['#3b82f6','#2563eb'], Icon: RiGroupLine      },
  'Agendado de demos':       { grad: ['#10b981','#059669'], Icon: RiCalendarLine   },
  'ReconfirmaciÃ³n de citas': { grad: ['#8b5cf6','#7c3aed'], Icon: RiCalendar2Line  },
  'Renovaciones':            { grad: ['#f59e0b','#d97706'], Icon: RiBarChartLine   },
  'ReactivaciÃ³n':            { grad: ['#06b6d4','#0891b2'], Icon: RiSendPlaneLine  },
}

const STATUS_STYLE = {
  activa:     { text: '#10b981', dot: '#10b981', bg: '#10b98115', border: '#10b98130', label: 'Activa'     },
  pausada:    { text: '#f59e0b', dot: '#f59e0b', bg: '#f59e0b15', border: '#f59e0b30', label: 'Pausada'    },
  borrador:   { text: '#60a5fa', dot: '#60a5fa', bg: '#60a5fa15', border: '#60a5fa30', label: 'Borrador'   },
  completada: { text: '#a78bfa', dot: '#a78bfa', bg: '#a78bfa15', border: '#a78bfa30', label: 'Completada' },
}

const KPI_LABELS = {
  llamadas:   { label: 'Llamadas',           color: '#818cf8' },
  leads:      { label: 'Leads generados',    color: '#34d399' },
  reuniones:  { label: 'Reuniones',          color: '#a78bfa' },
  conversion: { label: 'ConversiÃ³n',         color: '#fbbf24' },
  ingresos:   { label: 'Ingresos',           color: '#22d3ee' },
}

const DETAIL_TABS = ['Resumen', 'Audiencia', 'Conversaciones', 'Anuncio', 'ConfiguraciÃ³n']

const AD_STATUS_LABEL = {
  draft: { label: 'Borrador', color: '#60a5fa' },
  pending_review: { label: 'En revisiÃ³n', color: '#f59e0b' },
  active: { label: 'Activo', color: '#10b981' },
  rejected: { label: 'Rechazado', color: '#ef4444' },
  paused: { label: 'Pausado', color: '#f59e0b' },
}

function Spark({ data, color }) {
  const w = 80, h = 32
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  if (data.every(v => v === 0)) return <div style={{ height: h }} />
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={4} strokeOpacity={0.12} strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export default function CampaignDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [campaign, setCampaign] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(searchParams.get('tab') === 'anuncio' ? 'Anuncio' : 'Resumen')
  const [status, setStatus] = useState('borrador')
  const [savedCamp, setSavedCamp] = useState(false)
  const [adInfo, setAdInfo] = useState(null)
  const [insights, setInsights] = useState([])
  const [maxCpl, setMaxCpl] = useState('')
  const [savingCpl, setSavingCpl] = useState(false)
  const [auditingBulk, setAuditingBulk] = useState(false)
  const [auditBulkResult, setAuditBulkResult] = useState(null)

  async function runAuditBulk() {
    setAuditingBulk(true)
    try {
      const res = await apiFetch(`/api/campaigns/${id}/audit-bulk`, { method: 'POST', body: JSON.stringify({}) })
      if (res.ok) setAuditBulkResult(await res.json())
    } catch {
      /* ignore */
    } finally {
      setAuditingBulk(false)
    }
  }

  useEffect(() => {
    apiFetch(`/api/campaigns/${id}`).then(r => r.ok ? r.json() : null).then(data => {
      if (data) {
        const statusMap = { draft: 'borrador', active: 'activa', paused: 'pausada', done: 'completada' }
        const style = OBJECTIVE_STYLE[data.objective] ?? { grad: ['#4f46e5','#7c3aed'], Icon: RiSendPlaneLine }
        const conv = data.totalLeads > 0 ? +((data.meetingsScheduled / data.totalLeads) * 100).toFixed(1) : 0
        const zeroKpi = (fmt) => ({ fmt, delta: 'â€”', up: true, spark: [0,0,0,0,0,0,0] })
        setCampaign({
          ...data,
          nombre: data.name,
          sub: data.objective || '',
          grad: style.grad,
          Icon: style.Icon,
          kpis: {
            llamadas:   zeroKpi(String(data.contacted ?? 0)),
            leads:      zeroKpi(String(data.totalLeads ?? 0)),
            reuniones:  zeroKpi(String(data.meetingsScheduled ?? 0)),
            conversion: { fmt: `${conv}%`, delta: 'â€”', up: conv > 0, spark: [0,0,0,0,0,0,0] },
            ingresos:   zeroKpi('â‚¬0'),
          },
        })
        setStatus(statusMap[data.status] ?? 'borrador')
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (tab !== 'Anuncio') return
    apiFetch(`/api/ads/campaigns/${id}/status`).then(r => r.ok ? r.json() : null).then(data => {
      if (data) {
        setAdInfo(data)
        setMaxCpl(data.maxCostPerLeadCents != null ? String(data.maxCostPerLeadCents / 100) : '')
      }
    }).catch(() => {})
    apiFetch(`/api/ads/campaigns/${id}/insights`).then(r => r.ok ? r.json() : []).then(data => {
      const rows = Array.isArray(data) ? data : []
      setInsights(rows.map(r => ({
        ...r,
        spendEUR: r.spendCents / 100,
        cplEUR: r.costPerLeadCents != null ? r.costPerLeadCents / 100 : null,
        capturedAtLabel: new Date(r.capturedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      })))
    }).catch(() => {})
  }, [tab, id])

  async function saveMaxCpl() {
    const cents = Math.round(parseFloat(maxCpl) * 100)
    if (Number.isNaN(cents) || cents < 0) return
    setSavingCpl(true)
    try {
      const res = await apiFetch(`/api/ads/campaigns/${id}/max-cpl`, {
        method: 'PUT',
        body: JSON.stringify({ maxCostPerLeadCents: cents }),
      })
      if (!res.ok) throw new Error()
      setAdInfo(prev => prev ? { ...prev, maxCostPerLeadCents: cents } : prev)
    } catch {
      /* ignore */
    } finally {
      setSavingCpl(false)
    }
  }

  // "Programar también como post orgánico" (Fase 3 punto 3 del plan): reusa
  // el copy/imagen que ya generó el wizard de anuncios, no crea contenido
  // nuevo. Requiere que la org ya haya conectado al menos una red en Postiz.
  const [postingOrganic, setPostingOrganic] = useState(false)
  const [organicMsg, setOrganicMsg] = useState('')

  async function scheduleOrganicPost() {
    const assets = adInfo?.adAssets
    if (!assets?.adCopy) return
    setPostingOrganic(true)
    setOrganicMsg('')
    try {
      const statusRes = await apiFetch('/api/postiz')
      if (statusRes.status === 403) {
        setOrganicMsg('Redes sociales no está incluido en tu plan.')
        return
      }
      const statusData = statusRes.ok ? await statusRes.json() : null
      const platforms = (statusData?.integrations ?? []).map(i => i.id)
      if (!platforms.length) {
        setOrganicMsg('Conectá al menos una red social primero (menú "Redes sociales").')
        return
      }
      const res = await apiFetch('/api/postiz/posts', {
        method: 'POST',
        body: JSON.stringify({ text: assets.adCopy, imageUrl: assets.imageUrl, platforms }),
      })
      setOrganicMsg(res.ok ? 'Post orgánico programado.' : 'No se pudo programar el post.')
    } finally {
      setPostingOrganic(false)
    }
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14, background: '#080c14' }}>
      Cargandoâ€¦
    </div>
  )

  if (!campaign) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14, background: '#080c14' }}>
      CampaÃ±a no encontrada
    </div>
  )

  const st = STATUS_STYLE[status] ?? STATUS_STYLE.borrador
  const Icon = campaign.Icon

  return (
    <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', background: '#080c14', padding: '26px 32px 40px' }}>

      {/* Back */}
      <button onClick={() => navigate('/campanas')} style={{
        display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
        color: '#6b7280', cursor: 'pointer', fontSize: 12.5, padding: 0, marginBottom: 22, fontFamily: 'inherit',
      }}>
        <RiArrowLeftLine style={{ width: 14, height: 14 }} /> CampaÃ±as
      </button>

      {/* Hero */}
      <div style={{
        borderRadius: 16, marginBottom: 22, padding: '24px 28px', overflow: 'hidden', position: 'relative',
        background: `linear-gradient(135deg, ${campaign.grad[0]}, ${campaign.grad[1]})`,
        boxShadow: `0 0 60px ${campaign.grad[0]}30`,
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #00000040, #00000060)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }}>
            <Icon style={{ width: 28, height: 28, color: '#fff' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#fff' }}>{campaign.nombre}</h1>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: st.bg, border: `1px solid ${st.border}`, color: st.text, flexShrink: 0 }}>
                <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: st.dot, marginRight: 5, verticalAlign: 'middle', boxShadow: `0 0 4px ${st.dot}` }} />
                {st.label}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>{campaign.sub}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {status === 'activa' ? (
              <button onClick={() => setStatus('pausada')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 9, color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                <RiPauseCircleLine style={{ width: 15, height: 15 }} /> Pausar
              </button>
            ) : status === 'pausada' ? (
              <button onClick={() => setStatus('activa')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 9, color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                <RiPlayCircleLine style={{ width: 15, height: 15 }} /> Reanudar
              </button>
            ) : null}
            <button onClick={() => setTab('ConfiguraciÃ³n')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 9, color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              <RiEditLine style={{ width: 14, height: 14 }} /> Editar
            </button>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 22 }}>
        {Object.entries(campaign.kpis).map(([key, kpi]) => {
          const cfg = KPI_LABELS[key]
          const isZero = kpi.fmt === '0' || kpi.fmt === '0%' || kpi.fmt === 'â‚¬0'
          const isDash = kpi.delta === 'â€”'
          return (
            <div key={key} style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px 16px 12px' }}>
              <p style={{ margin: '0 0 8px', fontSize: 10.5, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{cfg.label}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: isZero ? '#374151' : '#f1f5f9' }}>{kpi.fmt}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: isDash ? '#374151' : kpi.up ? '#4ade80' : '#f87171' }}>{kpi.delta}</span>
              </div>
              <Spark data={kpi.spark} color={cfg.color} />
            </div>
          )
        })}
      </div>

      {/* Tabs + content */}
      <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #1e2433', padding: '0 20px' }}>
          {DETAIL_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none', padding: '13px 14px',
              fontSize: 12.5, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? campaign.grad[1] : '#4b5563',
              borderBottom: `2px solid ${tab === t ? campaign.grad[1] : 'transparent'}`,
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}>{t}</button>
          ))}
        </div>

        <div style={{ padding: '24px 24px' }}>
          {tab === 'Resumen' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Performance trend */}
              <div>
                <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Rendimiento Â· Ãºltimas 4 semanas</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
                  {[
                    { key: 'llamadas', weeks: campaign.kpis.llamadas.spark },
                    { key: 'leads',    weeks: campaign.kpis.leads.spark    },
                    { key: 'ingresos', weeks: campaign.kpis.ingresos.spark },
                  ].map(({ key, weeks }) => {
                    const cfg = KPI_LABELS[key]
                    const max = Math.max(...weeks)
                    return (
                      <div key={key} style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '16px' }}>
                        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>{cfg.label}</p>
                        <div style={{ height: 64, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                          {weeks.map((v, i) => (
                            <div key={i} style={{ flex: 1, borderRadius: '3px 3px 0 0', background: `linear-gradient(180deg, ${cfg.color}cc, ${cfg.color}44)`, height: max ? `${(v / max) * 100}%` : '2px', minHeight: 2, filter: `drop-shadow(0 0 3px ${cfg.color}50)` }} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 2-col: top metrics + canal */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                {/* Top days */}
                <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                  <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Mejores dÃ­as</p>
                  {['Lunes', 'Martes', 'MiÃ©rcoles', 'Jueves', 'Viernes'].map((day, i) => {
                    const pct = [88, 72, 95, 84, 68][i]
                    return (
                      <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <span style={{ fontSize: 12, color: '#6b7280', width: 72, flexShrink: 0 }}>{day}</span>
                        <div style={{ flex: 1, height: 5, background: '#1e2433', borderRadius: 99 }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${campaign.grad[0]}, ${campaign.grad[1]})`, borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 11.5, color: '#4b5563', fontWeight: 600, width: 32, textAlign: 'right', flexShrink: 0 }}>{pct}%</span>
                      </div>
                    )
                  })}
                </div>

                {/* Result summary */}
                <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                  <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Resultado de llamadas</p>
                  {[
                    { label: 'Interesados',    pct: 32, color: '#10b981' },
                    { label: 'Sin respuesta',  pct: 28, color: '#6b7280' },
                    { label: 'No interesados', pct: 24, color: '#ef4444' },
                    { label: 'Callback',       pct: 10, color: '#3b82f6' },
                    { label: 'Otros',          pct: 6,  color: '#8b5cf6' },
                  ].map(({ label, pct, color }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 4px ${color}80`, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>{pct}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent activity */}
              <div>
                <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Actividad reciente</p>
                <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, overflow: 'hidden' }}>
                  {[
                    { name: 'Carlos MÃ©ndez',    result: 'Interesado',  time: 'Hace 2h',   dur: '4:32' },
                    { name: 'Laura FernÃ¡ndez',  result: 'Agendada',    time: 'Hace 3h',   dur: '6:15' },
                    { name: 'Ana BeltrÃ¡n',      result: 'Sin resp.',   time: 'Hace 4h',   dur: '0:45' },
                    { name: 'Miguel Soto',      result: 'Interesado',  time: 'Hace 5h',   dur: '5:20' },
                    { name: 'RamÃ³n Torres',     result: 'No interÃ©s',  time: 'Hace 6h',   dur: '1:50' },
                  ].map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: i < 4 ? '1px solid #1e2433' : 'none' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: '#1e2433', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>{r.name[0]}</div>
                      <span style={{ flex: 1, fontSize: 12.5, color: '#e2e8f0', fontWeight: 500 }}>{r.name}</span>
                      <span style={{ fontSize: 11.5, color: '#4b5563' }}>{r.dur} min</span>
                      <span style={{ fontSize: 11, color: '#4b5563' }}>{r.time}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: r.result === 'Interesado' || r.result === 'Agendada' ? '#10b98115' : '#1e2433', color: r.result === 'Interesado' || r.result === 'Agendada' ? '#10b981' : '#6b7280', border: `1px solid ${r.result === 'Interesado' || r.result === 'Agendada' ? '#10b98130' : '#1e2433'}`, flexShrink: 0 }}>{r.result}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'Audiencia' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Auditoría digital en bloque</p>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#6b7280' }}>
                    {auditBulkResult
                      ? `${auditBulkResult.audited} auditados, ${auditBulkResult.skipped} sin web/ya auditados${auditBulkResult.remaining > 0 ? `, ${auditBulkResult.remaining} pendientes (volvé a apretar el botón)` : ''}.`
                      : 'Audita los leads de esta campaña que tienen web y todavía no fueron auditados.'}
                  </p>
                </div>
                <button onClick={runAuditBulk} disabled={auditingBulk} style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: auditingBulk ? '#374151' : '#6366f1', color: '#fff', fontSize: 12.5, fontWeight: 700,
                  cursor: auditingBulk ? 'default' : 'pointer', whiteSpace: 'nowrap',
                }}>
                  {auditingBulk ? 'Auditando…' : 'Auditar toda la campaña'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                  <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Segmento activo</p>
                  {[
                    { label: 'Industria', value: 'SaaS / Software' },
                    { label: 'TamaÃ±o empresa', value: '10â€“200 empleados' },
                    { label: 'Cargo objetivo', value: 'CEO, CTO, Director TI' },
                    { label: 'PaÃ­s', value: 'EspaÃ±a, MÃ©xico, Colombia' },
                    { label: 'Score mÃ­nimo', value: '60 / 100' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1e2433' }}>
                      <span style={{ fontSize: 12, color: '#4b5563' }}>{label}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#94a3b8' }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                  <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>EstadÃ­sticas de audiencia</p>
                  {[
                    { label: 'Total leads en segmento', value: campaign.kpis.llamadas.fmt },
                    { label: 'Leads cualificados', value: campaign.kpis.leads.fmt },
                    { label: 'Tasa de contactaciÃ³n', value: campaign.kpis.tasa ? campaign.kpis.tasa.fmt : '34.2%' },
                    { label: 'Pendientes de contactar', value: '1.240' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1e2433' }}>
                      <span style={{ fontSize: 12, color: '#4b5563' }}>{label}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#f1f5f9' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Top leads de la audiencia</p>
                {['Carlos MÃ©ndez â€” TechSolutions', 'Laura FernÃ¡ndez â€” DataPro Iberia', 'Miguel Soto â€” MedCare Systems', 'SofÃ­a Vargas â€” NextGen Tech', 'Javier Ruiz â€” Retail Group'].map((lead, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 4 ? '1px solid #1e2433' : 'none' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: campaign.grad[0] + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: campaign.grad[1], flexShrink: 0 }}>{lead[0]}</div>
                    <span style={{ flex: 1, fontSize: 12.5, color: '#94a3b8' }}>{lead}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#10b981', background: '#10b98115', border: '1px solid #10b98130', borderRadius: 5, padding: '2px 7px' }}>Activo</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'Conversaciones' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Todas las conversaciones</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['Todas', 'Interesado', 'Sin resp.', 'No interÃ©s'].map((f, fi) => (
                    <button key={f} style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid ' + (fi === 0 ? campaign.grad[1] : '#1e2433'), background: fi === 0 ? campaign.grad[1] + '20' : 'transparent', color: fi === 0 ? campaign.grad[1] : '#6b7280', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>{f}</button>
                  ))}
                </div>
              </div>
              <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, overflow: 'hidden' }}>
                {[
                  { name: 'Carlos MÃ©ndez',   result: 'Interesado',  time: 'Hoy 11:32',  dur: '4:32' },
                  { name: 'Laura FernÃ¡ndez', result: 'Agendada',     time: 'Hoy 10:15',  dur: '6:15' },
                  { name: 'Ana BeltrÃ¡n',     result: 'Sin resp.',     time: 'Hoy 09:44',  dur: '0:45' },
                  { name: 'Miguel Soto',     result: 'Interesado',  time: 'Ayer 17:21', dur: '5:20' },
                  { name: 'RamÃ³n Torres',    result: 'No interÃ©s',   time: 'Ayer 16:05', dur: '1:50' },
                  { name: 'SofÃ­a Vargas',    result: 'Agendada',     time: 'Ayer 14:55', dur: '7:08' },
                  { name: 'Javier Ruiz',     result: 'Sin resp.',     time: '23 may',     dur: '0:32' },
                  { name: 'Elena GÃ³mez',     result: 'Interesado',  time: '22 may',     dur: '3:55' },
                ].map((r, i) => {
                  const ok = r.result === 'Interesado' || r.result === 'Agendada'
                  const bad = r.result === 'No interÃ©s'
                  const clr = ok ? '#10b981' : bad ? '#ef4444' : '#6b7280'
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: i < 7 ? '1px solid #1e2433' : 'none' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: '#1e2433', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>{r.name[0]}</div>
                      <span style={{ flex: 1, fontSize: 12.5, color: '#e2e8f0', fontWeight: 500 }}>{r.name}</span>
                      <span style={{ fontSize: 11.5, color: '#4b5563' }}>{r.dur} min</span>
                      <span style={{ fontSize: 11, color: '#4b5563' }}>{r.time}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: clr + '15', color: clr, border: `1px solid ${clr}30`, flexShrink: 0 }}>{r.result}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'Anuncio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {!adInfo ? (
                <p style={{ color: '#6b7280', fontSize: 13 }}>Cargando datos del anuncio…</p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                    {[
                      { label: 'Estado del anuncio', value: AD_STATUS_LABEL[adInfo.adStatus]?.label || adInfo.adStatus || 'Borrador', color: AD_STATUS_LABEL[adInfo.adStatus]?.color || '#6b7280' },
                      { label: 'Leads del anuncio', value: String(adInfo.totalLeads ?? 0) },
                      { label: 'Reuniones agendadas', value: String(adInfo.meetingsScheduled ?? 0) },
                    ].map((k, i) => (
                      <div key={i} style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '16px' }}>
                        <p style={{ margin: '0 0 6px', fontSize: 11, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase' }}>{k.label}</p>
                        <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: k.color || '#f1f5f9' }}>{k.value}</p>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Gasto y costo por lead (hoy)</p>
                      {adInfo.landingSlug && (
                        <a
                          href={`/l/${adInfo.landingSlug}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#818cf8', fontSize: 12, textDecoration: 'none' }}
                        >
                          Ver landing <RiExternalLinkLine style={{ width: 13, height: 13 }} />
                        </a>
                      )}
                    </div>
                    {insights.length === 0 ? (
                      <p style={{ color: '#4b5563', fontSize: 13 }}>Todavía no hay datos de Meta para esta campaña.</p>
                    ) : (
                      <div style={{ width: '100%', height: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={insights} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                            <XAxis dataKey="capturedAtLabel" tick={{ fontSize: 10, fill: '#4b5563' }} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="left" tick={{ fontSize: 9, fill: '#4b5563' }} axisLine={false} tickLine={false} width={34} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: '#4b5563' }} axisLine={false} tickLine={false} width={34} />
                            <Tooltip
                              contentStyle={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 9, fontSize: 11 }}
                              labelStyle={{ color: '#94a3b8' }}
                              itemStyle={{ color: '#e2e8f0' }}
                            />
                            <Bar yAxisId="left" dataKey="spendEUR" name="Gasto (€)" fill="#6366f1" fillOpacity={0.7} radius={[3,3,0,0]} />
                            <Line yAxisId="right" type="monotone" dataKey="cplEUR" name="CPL (€)" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <RiMoneyDollarCircleLine style={{ width: 18, height: 18, color: '#ef4444' }} />
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Máximo costo por lead (€)</p>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={maxCpl}
                        onChange={e => setMaxCpl(e.target.value)}
                        placeholder="Sin tope"
                        style={{ flex: 1, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                      />
                      <button
                        onClick={saveMaxCpl}
                        disabled={savingCpl}
                        style={{
                          padding: '10px 16px', borderRadius: 8, border: 'none',
                          background: savingCpl ? '#374151' : '#ef4444', color: '#fff',
                          fontSize: 13, fontWeight: 600, cursor: savingCpl ? 'default' : 'pointer',
                        }}
                      >
                        {savingCpl ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#4b5563' }}>Si el costo por lead supera este valor, la campaña se pausa automáticamente.</p>
                  </div>

                  {adInfo.adAssets?.adCopy && (
                    <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                      <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Redes sociales</p>
                      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#6b7280' }}>Programá el mismo copy e imagen del anuncio como post orgánico.</p>
                      <button
                        onClick={scheduleOrganicPost}
                        disabled={postingOrganic}
                        style={{
                          padding: '10px 16px', borderRadius: 8, border: 'none',
                          background: postingOrganic ? '#374151' : 'linear-gradient(90deg, #ec4899, #7c3aed)', color: '#fff',
                          fontSize: 13, fontWeight: 600, cursor: postingOrganic ? 'default' : 'pointer',
                        }}
                      >
                        {postingOrganic ? 'Programando…' : 'Programar también como post orgánico'}
                      </button>
                      {organicMsg && <p style={{ margin: '8px 0 0', fontSize: 12, color: organicMsg.includes('No se pudo') || organicMsg.includes('no está') ? '#ef4444' : '#10b981' }}>{organicMsg}</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'ConfiguraciÃ³n' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { section: 'General', items: [
                  { label: 'Nombre de campaÃ±a', value: campaign.name },
                  { label: 'Estado', value: STATUS_STYLE[campaign.status]?.label || campaign.status },
                  { label: 'Agente asignado', value: 'VozIA Pro' },
                ]},
                { section: 'ProgramaciÃ³n', items: [
                  { label: 'DÃ­as activos', value: 'Lunes â€” Viernes' },
                  { label: 'Horario de llamadas', value: '09:00 â€” 19:00' },
                  { label: 'Zona horaria', value: 'Europe/Madrid (CET)' },
                  { label: 'MÃ¡x. llamadas/dÃ­a', value: '300' },
                ]},
                { section: 'Playbook', items: [
                  { label: 'Playbook activo', value: 'Agendar demos B2B' },
                  { label: 'Idioma', value: 'EspaÃ±ol (EspaÃ±a)' },
                  { label: 'Reintentos', value: '2 intentos (24h entre cada uno)' },
                ]},
              ].map(({ section, items }) => (
                <div key={section} style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 12, padding: '18px' }}>
                  <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{section}</p>
                  {items.map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #1e2433' }}>
                      <span style={{ fontSize: 12, color: '#4b5563' }}>{label}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#94a3b8' }}>{value}</span>
                    </div>
                  ))}
                </div>
              ))}
              <button onClick={() => { setSavedCamp(true); setTimeout(() => setSavedCamp(false), 2000) }} style={{ alignSelf: 'flex-start', background: savedCamp ? '#10b981' : `linear-gradient(90deg, ${campaign.grad[0]}, ${campaign.grad[1]})`, border: 'none', borderRadius: 9, padding: '10px 20px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background .3s' }}>
                {savedCamp ? 'âœ“ Guardado' : 'Guardar cambios'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

