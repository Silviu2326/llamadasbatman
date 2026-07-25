import React from 'react'
import {
  WIDGET_TYPES,
  KPI_INDEX_MAP,
} from '../../dashboardConfig'
import KPICard from '../KPICard'
import RendimientoChart from './RendimientoChart'
import EmbudoChart from './EmbudoChart'
import DonutChart from './DonutChart'
import IngresosChart from './IngresosChart'
import AgentesTable from './AgentesTable'
import AlertasIA from './AlertasIA'

export default function WidgetRenderer({ widgetId, kpiData, stats }) {
  if (widgetId.startsWith('kpi_')) {
    const index = KPI_INDEX_MAP[widgetId]
    if (index == null || !kpiData[index]) return null
    const kpi = kpiData[index]
    return <KPICard {...kpi} label={kpi.label} delay="0ms" large />
  }

  switch (widgetId) {
    case WIDGET_TYPES.RENDIMIENTO_CHART:
      return <RendimientoChart dayData={stats?.timeSeries} />
    case WIDGET_TYPES.EMBUDO_CHART:
      return <EmbudoChart funnel={stats?.funnel} />
    case WIDGET_TYPES.DONUT_CHART:
      return <DonutChart callsByCampaign={stats?.callsByCampaign} totalCalls={stats?.totalCalls} />
    case WIDGET_TYPES.INGRESOS_CHART:
      return <IngresosChart pipelineByDay={stats?.pipelineByDay} pipelinePct={stats?.kpiPcts?.pipeline} />
    case WIDGET_TYPES.AGENTES_TABLE:
      return <AgentesTable agents={stats?.agentLeaderboard} />
    case WIDGET_TYPES.ALERTAS_IA:
      return <AlertasIA />
    default:
      return null
  }
}
