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
import DateRangePicker from './ui/DateRangePicker'
import ExportDropdown from './ui/ExportDropdown'
import useClickOutside from '../hooks/useClickOutside'
import { formatDisplayDate } from '../utils/dateHelpers'
import { useDashboardLayout } from '../hooks/useDashboardLayout'
import { ALL_WIDGET_IDS, DEFAULT_COLS, GRID_WIDGET_IDS, KPI_WIDGET_IDS, KPI_INDEX_MAP } from '../dashboardConfig'
import KPICard from './KPICard'
import EditModeButton from './dashboard/EditModeButton'
import EditPanel from './dashboard/EditPanel'
import WidgetRenderer from './dashboard/WidgetRenderer'
import SortableKPIRow from './dashboard/SortableKPIRow'

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

const COMPARE_OPTIONS = [
  { key:'none',        label:'Sin comparación' },
  { key:'prev_week',   label:'Semana anterior' },
  { key:'prev_month',  label:'Mes anterior' },
  { key:'prev_year',   label:'Año anterior' },
]

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')
  const [compare, setCompare]     = useState('prev_week')
  const [openCompare, setOpenCompare] = useState(false)
  const compareRef = useRef(null)
  useClickOutside([compareRef], () => setOpenCompare(false))

  const [kpi, setKpi] = useState(KPI_BASE.map(k => ({ ...k, value: '0', pct: null, data: [] })))
  const [stats, setStats] = useState({
    totalCalls: 0, totalLeads: 0, meetingsScheduled: 0, conversionRate: 0,
    pipelineValue: 0, closedWonValue: 0, kpiPcts: {},
    timeSeries: [], funnel: [], agentLeaderboard: [],
    callsByCampaign: [], pipelineByDay: [], sentiment: { positive:0, neutral:0, negative:0 },
  })
  const [loading, setLoading] = useState(true)
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
    apiFetch('/api/dashboard/stats')
      .then(r => {
        if (!r.ok) throw new Error(`Error ${r.status}`)
        return r.json()
      })
      .then(s => {
        setStats(s)
        const fmt = n => `€${Math.round(n ?? 0).toLocaleString('es-ES')}`
        const p = s.kpiPcts ?? {}
        const ts = s.timeSeries ?? []
        const pipe = s.pipelineByDay ?? []
        const spark = key => ts.map(d => d[key] ?? 0)
        const overrides = [
          { value: String(s.totalCalls ?? 0),            pct: p.calls    ?? null, data: spark('llamadas') },
          { value: String(s.totalLeads ?? 0),            pct: p.leads    ?? null, data: spark('contactados') },
          { value: String(s.meetingsScheduled ?? 0),     pct: p.meetings ?? null, data: spark('reuniones') },
          { value: `${s.conversionRate ?? 0}%`,          pct: null,                 data: spark('conversion') },
          { value: `€${Math.round(s.pipelineValue ?? 0).toLocaleString('es-ES')}`, pct: p.pipeline ?? null, data: pipe.map(d => d.value ?? 0) },
          { value: fmt(s.closedWonValue),                pct: null,                 data: null },
          { value: 'N/D',                                pct: null,                 data: null },
        ]
        setKpi(prev => prev.map((k, i) => {
          const o = overrides[i]
          return { ...k, value: o.value, pct: o.pct, data: o.data }
        }))
      })
      .catch(err => {
        // eslint-disable-next-line no-console
        console.error('Dashboard stats fetch failed:', err)
        setStats({
          totalCalls: 0, totalLeads: 0, meetingsScheduled: 0, conversionRate: 0,
          pipelineValue: 0, closedWonValue: 0, kpiPcts: {},
          timeSeries: [], funnel: [], agentLeaderboard: [],
          callsByCampaign: [], pipelineByDay: [], sentiment: { positive:0, neutral:0, negative:0 },
        })
        setKpi(KPI_BASE.map(k => ({ ...k, value: '0', pct: null, data: [] })))
      })
      .finally(() => setLoading(false))
  }, [])

  const compareLabel = COMPARE_OPTIONS.find(o => o.key === compare)?.label

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
    ? `${formatDisplayDate(new Date(startDate+'T00:00:00'))} - ${formatDisplayDate(new Date(endDate+'T00:00:00'))}`
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
    <div className="dark-scroll db-pad" style={{ flex:1, overflowY:'auto', background:'#080c14', display:'flex', flexDirection:'column', gap:16, minWidth:0, paddingRight: isEditMode ? 324 : 24 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ margin:0, fontSize:21, fontWeight:800, color:'#f1f5f9' }}>Hola, Equipo Comercial 👋</h1>
          <p style={{ margin:'3px 0 0', fontSize:12.5, color:'#4b5563' }}>Aquí tienes el resumen de tu actividad de hoy.</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>

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
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ExportDropdown
            filename={`dashboard_${startDate || 'hoy'}_${endDate || 'hoy'}.csv`}
            data={kpi}
            columns={[
              { header:'Métrica', getValue:k => k.label.replace('\n',' ') },
              { header:'Valor',   getValue:k => k.value },
              { header:'Cambio %', getValue:k => k.pct },
            ]}
          />

          <EditModeButton isEditMode={isEditMode} onClick={() => setIsEditMode(v => !v)} />

        </div>
      </div>

      {/* KPI row */}
      <SortableKPIRow
        kpiData={kpi}
        kpiOrder={kpiOrder}
        activeWidgets={activeWidgets}
        isEditMode={isEditMode}
        onRemove={removeWidget}
        onReorder={updateKpiOrder}
      />

      {/* Editable grid */}
      <div ref={gridRef} style={{ flex:1, minHeight:0, width:'100%' }}>
        {gridWidth > 0 && (
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
                  <WidgetRenderer widgetId={id} kpiData={kpi} stats={stats} />
                </div>
              </div>
            ))}
          </GridLayout>
        )}
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
