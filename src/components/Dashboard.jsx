import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GridLayout } from 'react-grid-layout'
import {
  RiPhoneLine, RiGroupLine, RiCalendarLine, RiPercentLine,
  RiMoneyDollarBoxLine, RiBriefcaseLine, RiLineChartLine,
  RiCloseLine,
} from 'react-icons/ri'
import '../dashboard.css'
import { apiFetch } from '../lib/api'
import { DEMO_MODE, getApiErrorMessage, isNonEmptyPayload } from '../lib/dataMode'
import ExportDropdown from './ui/ExportDropdown'
import DataStatusBanner from './ui/DataStatusBanner'
import { useDashboardLayout } from '../hooks/useDashboardLayout'
import { useAuth } from '../contexts/AuthContext'
import { ALL_WIDGET_IDS, DEFAULT_COLS, GRID_WIDGET_IDS, KPI_WIDGET_IDS, KPI_INDEX_MAP } from '../dashboardConfig'
import KPICard from './KPICard'
import EditModeButton from './dashboard/EditModeButton'
import EditPanel from './dashboard/EditPanel'
import ActionCenter from './dashboard/ActionCenter'
import WidgetRenderer from './dashboard/WidgetRenderer'
import SortableKPIRow from './dashboard/SortableKPIRow'
import dashboardOrbit from '../assets/dashboard-orbit.png'
import callsIcon from '../assets/kpi-icons/calls.png'
import leadsIcon from '../assets/kpi-icons/leads.png'
import meetingsIcon from '../assets/kpi-icons/meetings.png'
import conversionIcon from '../assets/kpi-icons/conversion.png'
import pipelineIcon from '../assets/kpi-icons/pipeline.png'
import revenueIcon from '../assets/kpi-icons/revenue.png'
import { localeCode, useI18n } from '../i18n'

// ─── data ────────────────────────────────────────────────────────────────────
const KPI_BASE = [
  { Icon: RiPhoneLine,          iconBg:'var(--accent-deep)', label:'Llamadas\nrealizadas',    color:'var(--accent-soft)' },
  { Icon: RiGroupLine,          iconBg:'var(--success-deep)', label:'Leads\ncontactados',       color:'var(--success)' },
  { Icon: RiCalendarLine,       iconBg:'var(--violet-deep)', label:'Reuniones\nagendadas',     color:'var(--violet)' },
  { Icon: RiPercentLine,        iconBg:'var(--warn-deep)', label:'Tasa de\nconversión',      color:'var(--warn-soft)' },
  { Icon: RiMoneyDollarBoxLine, iconBg:'var(--cyan-deep)', label:'Pipeline\ngenerado',       color:'var(--cyan)' },
  { Icon: RiBriefcaseLine,      iconBg:'var(--success-deep)', label:'Ingresos\natribuidos',     color:'var(--success)' },
  { Icon: RiLineChartLine,      iconBg:'var(--success-deep)', label:'ROI del\nsistema',         color:'var(--success-soft)' },
]

const KPI_IMAGES = [callsIcon, leadsIcon, meetingsIcon, conversionIcon, pipelineIcon, revenueIcon]
const KPI_LABEL_KEYS = ['callsMade', 'contactedLeads', 'meetingsBooked', 'conversionRate', 'pipelineGenerated', 'attributedRevenue', 'systemRoi']

const MOCK_STATS = {
  totalCalls: 1248, totalLeads: 386, meetingsScheduled: 74, conversionRate: 18.6,
  pipelineValue: 184600, closedWonValue: 62800,
  kpiPcts: { calls: 18, leads: 12, meetings: 24, pipeline: 31 },
  timeSeries: [
    { date: 'Lun', llamadas: 142, contactados: 48, reuniones: 8, conversion: 14.2 },
    { date: 'Mar', llamadas: 168, contactados: 57, reuniones: 10, conversion: 15.8 },
    { date: 'Mié', llamadas: 156, contactados: 52, reuniones: 9, conversion: 16.4 },
    { date: 'Jue', llamadas: 193, contactados: 64, reuniones: 13, conversion: 18.1 },
    { date: 'Vie', llamadas: 224, contactados: 77, reuniones: 17, conversion: 20.4 },
    { date: 'Sáb', llamadas: 181, contactados: 51, reuniones: 11, conversion: 17.7 },
    { date: 'Dom', llamadas: 184, contactados: 37, reuniones: 6, conversion: 18.6 },
  ],
  funnel: [{ label: 'Contactos', value: 386 }, { label: 'Interesados', value: 174 }, { label: 'Calificados', value: 112 }, { label: 'Reuniones', value: 74 }, { label: 'Ganados', value: 28 }],
  callsByCampaign: [{ name: 'Outbound Q3', value: 462, pct: 37 }, { name: 'Reactivación', value: 318, pct: 25 }, { name: 'SaaS España', value: 246, pct: 20 }, { name: 'Enterprise', value: 132, pct: 11 }, { name: 'Otros', value: 90, pct: 7 }],
  pipelineByDay: [{ date: 'Lun', value: 18200 }, { date: 'Mar', value: 24100 }, { date: 'Mié', value: 19800 }, { date: 'Jue', value: 31200 }, { date: 'Vie', value: 42800 }, { date: 'Sáb', value: 26600 }, { date: 'Dom', value: 21900 }],
  agentLeaderboard: [{ name: 'Lucía Pérez', calls: 284 }, { name: 'Álvaro Ruiz', calls: 247 }, { name: 'Marta Soler', calls: 219 }, { name: 'Jorge Ríos', calls: 176 }],
  sentiment: { positive: 71, neutral: 22, negative: 7 },
}

const EMPTY_STATS = {
  totalCalls: 0, totalLeads: 0, meetingsScheduled: 0, conversionRate: 0,
  pipelineValue: 0, closedWonValue: 0, kpiPcts: {}, timeSeries: [],
  funnel: [], callsByCampaign: [], pipelineByDay: [], agentLeaderboard: [],
  sentiment: { positive: 0, neutral: 0, negative: 0 },
}

const EMPTY_KPI = () => KPI_BASE.map(k => ({ ...k, value: '—', pct: null, data: [], image: undefined }))

const MOCK_KPI = [
  { value: '1.248', pct: 18, data: [820, 910, 876, 1040, 1172, 1103, 1248] },
  { value: '386', pct: 12, data: [242, 261, 278, 302, 331, 359, 386] },
  { value: '74', pct: 24, data: [39, 45, 48, 55, 61, 68, 74] },
  { value: '18,6%', pct: null, data: [12, 13, 14, 15, 16, 17, 18.6] },
  { value: '€184.600', pct: 31, data: [92000, 113000, 128000, 141000, 159000, 174000, 184600] },
  { value: '€62.800', pct: null, data: [28000, 31000, 37800, 42100, 48600, 55400, 62800] },
  { value: '4,8x', pct: 16, data: [3.1, 3.4, 3.8, 4.1, 4.3, 4.6, 4.8] },
]

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [agentCount, setAgentCount] = useState(null)

  useEffect(() => {
    apiFetch('/api/agents').then(r => r.ok ? r.json() : null).then(data => {
      setAgentCount(Array.isArray(data) ? data.length : null)
    }).catch(() => {})
  }, [])
  const [kpi, setKpi] = useState(
    DEMO_MODE
      ? KPI_BASE.map((k, i) => ({ ...k, ...MOCK_KPI[i], image: KPI_IMAGES[i] }))
      : EMPTY_KPI(),
  )
  const [stats, setStats] = useState(DEMO_MODE ? MOCK_STATS : EMPTY_STATS)
  const [dataSource, setDataSource] = useState(DEMO_MODE ? 'demo' : 'loading')
  const [dataError, setDataError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [isEditMode, setIsEditMode] = useState(false)
  const [gridWidth, setGridWidth] = useState(0)
  const gridRef = useRef(null)

  const {
    layout,
    activeWidgets,
    kpiOrder,
    updateLayout,
    updateKpiOrder,
    addWidget,
    removeWidget,
    resetLayout,
  } = useDashboardLayout()

  useEffect(() => {
    setLoading(true)
    setDataSource('loading')
    setDataError('')
    apiFetch('/api/dashboard/stats')
      .then(r => {
        if (!r.ok) throw new Error(`Error ${r.status}`)
        return r.json()
      })
      .then(s => {
        const source = s && typeof s === 'object' ? { ...EMPTY_STATS, ...s } : EMPTY_STATS
        const hasData = isNonEmptyPayload(source)
        setDataError('')
        setDataSource(hasData ? 'live' : 'empty')
        setStats(source)
        const fmt = n => `€${Math.round(n ?? 0).toLocaleString(localeCode(locale))}`
        const p = source.kpiPcts ?? {}
        const ts = source.timeSeries ?? []
        const pipe = source.pipelineByDay ?? []
        const spark = key => ts.map(d => d[key] ?? 0)
        const overrides = [
          { value: String(source.totalCalls ?? 0),            pct: p.calls    ?? null, data: spark('llamadas') },
          { value: String(source.totalLeads ?? 0),            pct: p.leads    ?? null, data: spark('contactados') },
          { value: String(source.meetingsScheduled ?? 0),     pct: p.meetings ?? null, data: spark('reuniones') },
          { value: `${source.conversionRate ?? 0}%`,          pct: null,                 data: spark('conversion') },
          { pct: p.pipeline ?? null, data: pipe.map(d => d.value ?? 0) }, // `value` se asigna justo debajo desde `source`
          { value: fmt(source.closedWonValue),                pct: null,                 data: null },
          { value: source.roi != null ? `${source.roi.toFixed(1)}x` : '—', pct: null,     data: null },
        ]
        overrides[4].value = `€${Math.round(source.pipelineValue ?? 0).toLocaleString(localeCode(locale))}`
        setKpi(prev => prev.map((k, i) => {
          const o = overrides[i]
          return { ...k, value: hasData ? o.value : '—', pct: hasData ? o.pct : null, data: hasData ? o.data : [] }
        }))
      })
      .catch(err => {
        // La demo local funciona aunque el backend todavía no esté disponible.
        setDataError(getApiErrorMessage(null, err?.message || 'No se pudo cargar el resumen del dashboard.'))
        if (DEMO_MODE) {
          setDataSource('demo')
          setStats(MOCK_STATS)
          setKpi(KPI_BASE.map((k, i) => ({ ...k, ...MOCK_KPI[i], image: KPI_IMAGES[i] })))
        } else {
          setDataSource('disconnected')
          setStats(EMPTY_STATS)
          setKpi(KPI_BASE.map(k => ({ ...k, value: '—', pct: null, data: [], image: undefined })))
        }
      })
      .finally(() => setLoading(false))
  }, [reloadKey, locale])

  const dataStatusLabel = dataSource === 'live'
    ? t('dashboard.liveData')
    : dataSource === 'empty'
      ? t('dashboard.noDataYet')
    : dataSource === 'disconnected'
      ? t('dashboard.disconnectedApi')
      : dataSource === 'loading'
        ? t('dashboard.syncing')
        : t('dashboard.demoActive')

  const localizedKpi = kpi.map((item, index) => ({ ...item, label: t(`dashboard.${KPI_LABEL_KEYS[index] || 'callsMade'}`) }))

  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) return
    const updateWidth = () => setGridWidth(el.offsetWidth)
    updateWidth()

    let ro
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateWidth)
      ro.observe(el)
    } else {
      window.addEventListener('resize', updateWidth)
    }
    return () => {
      if (ro) ro.disconnect()
      else window.removeEventListener('resize', updateWidth)
    }
  }, [])

      const removedWidgets = ALL_WIDGET_IDS.filter(id => !activeWidgets.has(id))
  const activeGridIds = GRID_WIDGET_IDS.filter(id => activeWidgets.has(id))

  return (
    <div className={`dark-scroll db-pad${isEditMode ? ' fixed-side-panel-offset' : ''}`} style={{ flex:1, overflowY:'auto', background:'var(--bg)', display:'flex', flexDirection:'column', gap:16, minWidth:0 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div className="dashboard-welcome-copy">
          <span className="dashboard-overline">{t('dashboard.operationsCenter')}</span>
          <h1 style={{ margin:0, fontSize:21, fontWeight:800, color:'var(--text-strong)' }}>{locale === 'en' ? `Hello, ${user?.name || 'Sales Team'} 👋` : `Hola, ${user?.name || 'Equipo Comercial'} 👋`}</h1>
          <p style={{ margin:'3px 0 0', fontSize:12.5, color: 'var(--dim)' }}>{t('dashboard.todaySummary')}</p>
        </div>
        <div className="dashboard-welcome-art"><img src={dashboardOrbit} alt="" /><span className={`dashboard-data-status dashboard-data-status-${dataSource}`}><i /> {dataStatusLabel}</span></div><div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>

          <ExportDropdown
            filename="dashboard.csv"
            data={kpi}
            columns={[
              { header:t('dashboard.metric'), getValue:k => k.label.replace('\n',' ') },
              { header:t('dashboard.value'), getValue:k => k.value },
              { header:t('dashboard.change'), getValue:k => k.pct },
            ]}
          />

          <EditModeButton isEditMode={isEditMode} onClick={() => setIsEditMode(v => !v)} />

        </div>
      </div>

      <DataStatusBanner
        status={dataSource}
        message={dataSource === 'empty'
          ? 'Cuando existan llamadas, leads o pipeline aparecerán aquí. No mostramos cifras de ejemplo.'
          : dataSource === 'demo'
            ? 'El modo demo está habilitado explícitamente; estas cifras no proceden de tu organización.'
            : dataError}
        onRetry={dataSource === 'disconnected' || dataSource === 'error' ? () => setReloadKey(key => key + 1) : undefined}
      />

      {(() => {
        if (agentCount === null || (dataSource !== 'live' && dataSource !== 'empty')) return null
        const steps = [
          { label: 'Crea tu primer agente', hint: 'Configura la voz que llamará por ti', to: '/agentes', done: agentCount > 0 },
          { label: 'Importa tus leads', hint: 'Sube tu CSV o añade contactos a mano', to: '/leads', done: (stats.totalLeads ?? 0) > 0 },
          { label: 'Lanza tu primera campaña', hint: 'Agrupa tus leads y actívala', to: '/campanas', done: (stats.activeCampaigns ?? 0) > 0 },
        ]
        if (steps.every(step => step.done)) return null
        return (
          <section aria-label="Primeros pasos" style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:14, padding:'18px 20px' }}>
            <p style={{ margin:'0 0 3px', fontSize:14.5, fontWeight:800, color:'var(--text-strong)' }}>Empieza aquí</p>
            <p style={{ margin:'0 0 14px', fontSize:12, color:'var(--dim)' }}>Tres pasos y tu agente de IA hará la primera llamada.</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10 }}>
              {steps.map((step, index) => (
                <button key={step.label} onClick={() => navigate(step.to)} style={{ display:'flex', alignItems:'center', gap:12, textAlign:'left', padding:'13px 14px', borderRadius:11, cursor:'pointer', background: step.done ? 'var(--bg)' : 'var(--surface-2)', border: `1px solid ${step.done ? '#10b98135' : 'var(--line)'}`, fontFamily:'inherit' }}>
                  <span style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, background: step.done ? '#10b98120' : '#4f46e520', color: step.done ? 'var(--success)' : 'var(--violet)', border: `1px solid ${step.done ? '#10b98140' : '#4f46e540'}` }}>{step.done ? '✓' : index + 1}</span>
                  <span><strong style={{ display:'block', fontSize:13, color: step.done ? 'var(--dim)' : 'var(--text)', textDecoration: step.done ? 'line-through' : 'none' }}>{step.label}</strong><small style={{ fontSize:11.5, color: 'var(--dim)' }}>{step.done ? 'Completado' : step.hint}</small></span>
                </button>
              ))}
            </div>
          </section>
        )
      })()}

      {/* Action center: turns cross-module signals into the next commercial action. */}
      <ActionCenter />

      {/* KPI row */}
      <SortableKPIRow
        kpiData={localizedKpi}
        kpiOrder={kpiOrder}
        activeWidgets={activeWidgets}
        isEditMode={isEditMode}
        onRemove={removeWidget}
        onReorder={updateKpiOrder}
      />

      {/* Editable grid */}
      <div ref={gridRef} style={{ flex:1, minHeight:0, width:'100%' }}>
        {gridWidth > 0 && (gridWidth < 900 ? (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {[...layout]
              .filter(l => activeGridIds.includes(l.i))
              .sort((a, b) => a.y - b.y || a.x - b.x)
              .map(l => (
                <div key={l.i} style={{ position:'relative' }}>
                  {isEditMode && (
                    <button
                      className="widget-remove-btn"
                      onClick={() => removeWidget(l.i)}
                      title="Quitar widget"
                    >×</button>
                  )}
                  <WidgetRenderer widgetId={l.i} kpiData={localizedKpi} stats={stats} />
                </div>
              ))
            }
          </div>
        ) : (
          <GridLayout
            className="dashboard-grid"
            layout={layout}
            cols={DEFAULT_COLS}
            rowHeight={85}
            width={gridWidth}
            margin={[12, 12]}
            containerPadding={[0, 0]}
            isDraggable={isEditMode}
            isResizable={isEditMode}
            isBounded={false}
            compactType={null}
            onLayoutChange={(newLayout) => updateLayout(newLayout)}
          >
            {activeGridIds.map(id => (
              <div key={id} className={isEditMode ? 'widget-edit-mode' : 'widget-normal'} style={{ height:'100%' }}>
                {isEditMode && (
                  <button
                    className="widget-remove-btn"
                    onClick={() => removeWidget(id)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    title="Quitar widget"
                  >
                    <RiCloseLine style={{ width:12, height:12 }} />
                  </button>
                )}
                <div className="widget-content" style={{ height:'100%', display:'flex', flexDirection:'column' }}>
                  <WidgetRenderer widgetId={id} kpiData={localizedKpi} stats={stats} />
                </div>
              </div>
            ))}
          </GridLayout>
        ))}
      </div>

      {isEditMode && (
        <EditPanel
          removedWidgets={removedWidgets}
          onAddWidget={addWidget}
          onClose={() => setIsEditMode(false)}
          onReset={resetLayout}
        />
      )}
    </div>
  )
}
