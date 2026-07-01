import {
  RiPhoneLine,
  RiGroupLine,
  RiCalendarLine,
  RiPercentLine,
  RiMoneyDollarBoxLine,
  RiBriefcaseLine,
  RiLineChartLine,
  RiBarChartLine,
  RiPieChartLine,
  RiFilterLine,
  RiUserLine,
  RiNotificationLine,
} from 'react-icons/ri'

export const WIDGET_TYPES = {
  KPI_LLAMADAS: 'kpi_llamadas',
  KPI_LEADS: 'kpi_leads',
  KPI_REUNIONES: 'kpi_reuniones',
  KPI_CONVERSION: 'kpi_conversion',
  KPI_PIPELINE: 'kpi_pipeline',
  KPI_INGRESOS: 'kpi_ingresos',
  RENDIMIENTO_CHART: 'rendimiento_chart',
  EMBUDO_CHART: 'embudo_chart',
  DONUT_CHART: 'donut_chart',
  INGRESOS_CHART: 'ingresos_chart',
  AGENTES_TABLE: 'agentes_table',
  ALERTAS_IA: 'alertas_ia',
}

export const KPI_WIDGET_IDS = [
  WIDGET_TYPES.KPI_LLAMADAS,
  WIDGET_TYPES.KPI_LEADS,
  WIDGET_TYPES.KPI_REUNIONES,
  WIDGET_TYPES.KPI_CONVERSION,
  WIDGET_TYPES.KPI_PIPELINE,
  WIDGET_TYPES.KPI_INGRESOS,
]

export const GRID_WIDGET_IDS = [
  WIDGET_TYPES.RENDIMIENTO_CHART,
  WIDGET_TYPES.EMBUDO_CHART,
  WIDGET_TYPES.DONUT_CHART,
  WIDGET_TYPES.INGRESOS_CHART,
  WIDGET_TYPES.AGENTES_TABLE,
  WIDGET_TYPES.ALERTAS_IA,
]

export const ALL_WIDGET_IDS = [...KPI_WIDGET_IDS, ...GRID_WIDGET_IDS]

export const DEFAULT_COLS = 12

export const DEFAULT_LAYOUT = [
  { i: WIDGET_TYPES.RENDIMIENTO_CHART, x: 0, y: 0, w: 5, h: 3, minW: 2, minH: 2 },
  { i: WIDGET_TYPES.EMBUDO_CHART, x: 5, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  { i: WIDGET_TYPES.DONUT_CHART, x: 8, y: 0, w: 4, h: 3, minW: 2, minH: 2 },

  { i: WIDGET_TYPES.INGRESOS_CHART, x: 0, y: 3, w: 4, h: 3, minW: 2, minH: 2 },
  { i: WIDGET_TYPES.AGENTES_TABLE, x: 4, y: 3, w: 4, h: 3, minW: 2, minH: 2 },
  { i: WIDGET_TYPES.ALERTAS_IA, x: 8, y: 3, w: 4, h: 3, minW: 2, minH: 2 },
]

export const KPI_INDEX_MAP = {
  [WIDGET_TYPES.KPI_LLAMADAS]: 0,
  [WIDGET_TYPES.KPI_LEADS]: 1,
  [WIDGET_TYPES.KPI_REUNIONES]: 2,
  [WIDGET_TYPES.KPI_CONVERSION]: 3,
  [WIDGET_TYPES.KPI_PIPELINE]: 4,
  [WIDGET_TYPES.KPI_INGRESOS]: 5,
}

export const WIDGET_META = {
  [WIDGET_TYPES.KPI_LLAMADAS]: { label: 'Llamadas realizadas', category: 'kpi', Icon: RiPhoneLine },
  [WIDGET_TYPES.KPI_LEADS]: { label: 'Leads contactados', category: 'kpi', Icon: RiGroupLine },
  [WIDGET_TYPES.KPI_REUNIONES]: { label: 'Reuniones agendadas', category: 'kpi', Icon: RiCalendarLine },
  [WIDGET_TYPES.KPI_CONVERSION]: { label: 'Tasa de conversión', category: 'kpi', Icon: RiPercentLine },
  [WIDGET_TYPES.KPI_PIPELINE]: { label: 'Pipeline generado', category: 'kpi', Icon: RiMoneyDollarBoxLine },
  [WIDGET_TYPES.KPI_INGRESOS]: { label: 'Ingresos atribuidos', category: 'kpi', Icon: RiBriefcaseLine },
  [WIDGET_TYPES.RENDIMIENTO_CHART]: { label: 'Rendimiento general', category: 'chart', Icon: RiLineChartLine },
  [WIDGET_TYPES.EMBUDO_CHART]: { label: 'Embudo de conversiones', category: 'chart', Icon: RiFilterLine },
  [WIDGET_TYPES.DONUT_CHART]: { label: 'Llamadas por campaña', category: 'chart', Icon: RiPieChartLine },
  [WIDGET_TYPES.INGRESOS_CHART]: { label: 'Pipeline esta semana', category: 'chart', Icon: RiBarChartLine },
  [WIDGET_TYPES.AGENTES_TABLE]: { label: 'Top agentes', category: 'table', Icon: RiUserLine },
  [WIDGET_TYPES.ALERTAS_IA]: { label: 'Actividad reciente', category: 'alert', Icon: RiNotificationLine },
}

export const STORAGE_KEY = 'dashboard_layout_v4'
export const STORAGE_VERSION = 1
