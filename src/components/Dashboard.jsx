import React, { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { GridLayout } from 'react-grid-layout'
import {
  RiPhoneLine, RiGroupLine, RiCalendarLine, RiPercentLine,
  RiMoneyDollarBoxLine, RiBriefcaseLine, RiLineChartLine,
  RiCloseLine,
} from 'react-icons/ri'
import { HiChevronDown } from 'react-icons/hi'
import '../dashboard.css'
import { apiFetch } from '../lib/api'
import { DEMO_MODE, getApiErrorMessage, isNonEmptyPayload } from '../lib/dataMode'
import DateRangePicker from './ui/DateRangePicker'
import ExportDropdown from './ui/ExportDropdown'
import DataStatusBanner from './ui/DataStatusBanner'
import useClickOutside from '../hooks/useClickOutside'
import { formatDisplayDate } from '../utils/dateHelpers'
import { useDashboardLayout } from '../hooks/useDashboardLayout'
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
  { Icon: RiPhoneLine,          iconBg:'#4338ca', label:'Llamadas\nrealizadas',    color:'#818cf8' },
  { Icon: RiGroupLine,          iconBg:'#047857', label:'Leads\ncontactados',       color:'#34d399' },
  { Icon: RiCalendarLine,       iconBg:'#6d28d9', label:'Reuniones\nagendadas',     color:'#a78bfa' },
  { Icon: RiPercentLine,        iconBg:'#b45309', label:'Tasa de\nconversión',      color:'#fbbf24' },
  { Icon: RiMoneyDollarBoxLine, iconBg:'#0e7490', label:'Pipeline\ngenerado',       color:'#22d3ee' },
  { Icon: RiBriefcaseLine,      iconBg:'#0f766e', label:'Ingresos\natribuidos',     color:'#2dd4bf' },
  { Icon: RiLineChartLine,      iconBg:'#15803d', label:'ROI del\nsistema',         color:'#4ade80' },
]

const KPI_IMAGES = [callsIcon, leadsIcon, meetingsIcon, conversionIcon, pipelineIcon, revenueIcon]
const KPI_LABEL_KEYS = ['callsMade', 'contactedLeads', 'meetingsBooked', 'conversionRate', 'pipelineGenerated', 'attributedRevenue', 'systemRoi']

const COMPARE_OPTIONS = [
  { key:'none',        label:'Sin comparación' },
  { key:'prev_week',   label:'Semana anterior' },
  { key:'prev_month',  label:'Mes anterior' },
  { key:'prev_year',   label:'Año anterior' },
]
const COMPARE_LABEL_KEYS = { none: 'noComparison', prev_week: 'previousWeek', prev_month: 'previousMonth', prev_year: 'previousYear' }

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
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')
  const [compare, setCompare]     = useState('prev_week')
  const [openCompare, setOpenCompare] = useState(false)
  const compareRef = useRef(null)
  useClickOutside([compareRef], () => setOpenCompare(false))

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
          { value: `€${Math.round(s.pipelineValue ?? 0).toLocaleString(localeCode(locale))}`, pct: p.pipeline ?? null, data: pipe.map(d => d.value ?? 0) },
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

  const compareLabel = t(`dashboard.${COMPARE_LABEL_KEYS[compare] || 'noComparison'}`)
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

  const dropdownStyle = {
    position:'absolute', top:'calc(100% + 6px)', right:0,
    background:'#0d1117', border:'1px solid #1e2433', borderRadius:10,
    padding:6, minWidth:180, boxShadow:'0 10px 30px rgba(0,0,0,0.5)',
    zIndex:20, display:'flex', flexDirection:'column', gap:2,
  }
  const dropdownItemStyle = {
    background:'transparent', border:'none', borderRadius:6,
    padding:'7px 10px', color:'#cbd5e1', fontSize:12,
    textAlign:'left', cursor:'pointer',
  }
  const activeItemStyle = { ...dropdownItemStyle, background:'#1e2433', color:'#ffffff', fontWeight:600 }

  const displayRange = startDate && endDate
    ? `${formatDisplayDate(new Date(startDate+'T00:00:00'), locale)} - ${formatDisplayDate(new Date(endDate+'T00:00:00'), locale)}`
    : ''

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
    <div className="dark-scroll db-pad" style={{ flex:1, overflowY:'auto', background:'#080c14', display:'flex', flexDirection:'column', gap:16, minWidth:0, paddingRight: isEditMode ? 324 : undefined }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div className="dashboard-welcome-copy">
          <span className="dashboard-overline">{t('dashboard.operationsCenter')}</span>
          <h1 style={{ margin:0, fontSize:21, fontWeight:800, color:'#f1f5f9' }}>{locale === 'en' ? 'Hello, Sales Team 👋' : 'Hola, Equipo Comercial 👋'}</h1>
          <p style={{ margin:'3px 0 0', fontSize:12.5, color:'#4b5563' }}>{t('dashboard.todaySummary')}</p>
        </div>
        <div className="dashboard-welcome-art"><img src={dashboardOrbit} alt="" /><span className={`dashboard-data-status dashboard-data-status-${dataSource}`}><i /> {dataStatusLabel}</span></div><div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>

          <DateRangePicker onChange={({ start, end }) => { setStartDate(start); setEndDate(end) }} />

          <div ref={compareRef} style={{ position:'relative' }}>
            <button
              onClick={() => setOpenCompare(v => !v)}
              style={{ display:'flex', alignItems:'center', gap:6, background:'#0d1117', border:'1px solid #1e2433', borderRadius:9, padding:'7px 13px', color:'#94a3b8', fontSize:12, cursor:'pointer' }}
            >
              {compareLabel} <HiChevronDown style={{ width:12, height:12, transform: openCompare ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }} />
            </button>
            {openCompare && (
              <div style={dropdownStyle}>
                {COMPARE_OPTIONS.map(o => (
                  <button
                    key={o.key}
                    style={compare === o.key ? activeItemStyle : dropdownItemStyle}
                    onClick={() => { setCompare(o.key); setOpenCompare(false) }}
                  >
                    {t(`dashboard.${COMPARE_LABEL_KEYS[o.key] || 'noComparison'}`)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ExportDropdown
            filename={`dashboard_${startDate || 'hoy'}_${endDate || 'hoy'}.csv`}
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

      {false && (dataError || dataSource === 'empty') && (
        <div className={`dashboard-data-notice dashboard-data-notice-${dataSource}`} role="status">
          <strong>{dataSource === 'empty' ? 'Todavía no hay actividad registrada' : 'No se pudo sincronizar el dashboard'}</strong>
          <span>{dataError || 'Cuando existan llamadas, leads o pipeline aparecerán aquí. No mostramos cifras de ejemplo.'}</span>
        </div>
      )}

      <DataStatusBanner
        status={dataSource}
        message={dataSource === 'empty'
          ? 'Cuando existan llamadas, leads o pipeline aparecerán aquí. No mostramos cifras de ejemplo.'
          : dataSource === 'demo'
            ? 'El modo demo está habilitado explícitamente; estas cifras no proceden de tu organización.'
            : dataError}
        onRetry={dataSource === 'disconnected' || dataSource === 'error' ? () => setReloadKey(key => key + 1) : undefined}
      />

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
        {gridWidth > 0 && (gridWidth < 600 ? (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {[...layout]
              .filter(l => activeGridIds.includes(l.i))
              .sort((a, b) => a.y - b.y || a.x - b.x)
              .map(l => (
                <div key={l.i} style={{ height: l.h * 85 + (l.h - 1) * 12 }}>
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
