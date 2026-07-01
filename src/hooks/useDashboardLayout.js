import { useCallback, useState } from 'react'
import { ALL_WIDGET_IDS, DEFAULT_LAYOUT, GRID_WIDGET_IDS, KPI_WIDGET_IDS, STORAGE_KEY, STORAGE_VERSION } from '../dashboardConfig'

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== STORAGE_VERSION) return null
    return parsed
  } catch (e) {
    console.error('Failed to load dashboard layout', e)
    return null
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.error('Failed to save dashboard layout', e)
  }
}

function normalizeLayout(savedLayout, activeIds) {
  if (!Array.isArray(savedLayout) || savedLayout.length === 0) return DEFAULT_LAYOUT
  const filtered = savedLayout.filter(item => activeIds.has(item.i) && GRID_WIDGET_IDS.includes(item.i))
  const existingIds = new Set(filtered.map(item => item.i))

  for (const id of activeIds) {
    if (GRID_WIDGET_IDS.includes(id) && !existingIds.has(id)) {
      const fallback = DEFAULT_LAYOUT.find(item => item.i === id)
      if (fallback) filtered.push(fallback)
    }
  }
  return filtered
}

function normalizeKpiOrder(savedOrder, activeIds) {
  if (!Array.isArray(savedOrder) || savedOrder.length === 0) return [...KPI_WIDGET_IDS]
  const filtered = savedOrder.filter(id => activeIds.has(id) && KPI_WIDGET_IDS.includes(id))
  const existingIds = new Set(filtered)
  for (const id of activeIds) {
    if (KPI_WIDGET_IDS.includes(id) && !existingIds.has(id)) {
      filtered.push(id)
    }
  }
  return filtered
}

export function useDashboardLayout() {
  const [layout, setLayout] = useState(() => {
    const saved = loadState()
    const active = new Set(saved?.activeWidgets ?? ALL_WIDGET_IDS)
    return normalizeLayout(saved?.layout, active)
  })

  const [activeWidgets, setActiveWidgets] = useState(() => {
    const saved = loadState()
    return new Set(saved?.activeWidgets ?? ALL_WIDGET_IDS)
  })

  const [kpiOrder, setKpiOrder] = useState(() => {
    const saved = loadState()
    const active = new Set(saved?.activeWidgets ?? ALL_WIDGET_IDS)
    return normalizeKpiOrder(saved?.kpiOrder, active)
  })

  const persist = useCallback((newLayout, newActive, newKpiOrder) => {
    saveState({
      layout: newLayout,
      activeWidgets: Array.from(newActive),
      kpiOrder: newKpiOrder,
      version: STORAGE_VERSION,
    })
  }, [])

  const updateLayout = useCallback((newLayout) => {
    const gridLayout = newLayout.filter(item => GRID_WIDGET_IDS.includes(item.i))
    setLayout(gridLayout)
    persist(gridLayout, activeWidgets, kpiOrder)
  }, [activeWidgets, kpiOrder, persist])

  const updateKpiOrder = useCallback((newOrder) => {
    setKpiOrder(newOrder)
    persist(layout, activeWidgets, newOrder)
  }, [activeWidgets, layout, persist])

  const addWidget = useCallback((id) => {
    const nextActive = new Set(activeWidgets)
    nextActive.add(id)
    const nextLayout = normalizeLayout(layout, nextActive)
    const nextKpiOrder = normalizeKpiOrder(kpiOrder, nextActive)
    setActiveWidgets(nextActive)
    setLayout(nextLayout)
    setKpiOrder(nextKpiOrder)
    persist(nextLayout, nextActive, nextKpiOrder)
  }, [activeWidgets, kpiOrder, layout, persist])

  const removeWidget = useCallback((id) => {
    const nextActive = new Set(activeWidgets)
    nextActive.delete(id)
    const nextLayout = layout.filter(item => item.i !== id)
    const nextKpiOrder = kpiOrder.filter(kid => kid !== id)
    setActiveWidgets(nextActive)
    setLayout(nextLayout)
    setKpiOrder(nextKpiOrder)
    persist(nextLayout, nextActive, nextKpiOrder)
  }, [activeWidgets, kpiOrder, layout, persist])

  const resetLayout = useCallback(() => {
    setActiveWidgets(new Set(ALL_WIDGET_IDS))
    setLayout(DEFAULT_LAYOUT)
    setKpiOrder([...KPI_WIDGET_IDS])
    persist(DEFAULT_LAYOUT, new Set(ALL_WIDGET_IDS), [...KPI_WIDGET_IDS])
  }, [persist])

  return {
    layout,
    activeWidgets,
    kpiOrder,
    updateLayout,
    updateKpiOrder,
    addWidget,
    removeWidget,
    resetLayout,
  }
}
