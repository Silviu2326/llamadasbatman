export const loadDashboard = () => import('../components/Dashboard')
export const loadPlan = () => import('../pages/GrowthPlanPage')
export const loadInsights = () => import('../components/Insights')

const loaders = { '/dashboard': loadDashboard, '/plan': loadPlan, '/insights': loadInsights }
const prefetched = new Set()

// Fetch only page code on navigation intent. Account data still loads on entry.
export function preloadHomeLink(event) {
  if (typeof navigator !== 'undefined' && navigator.connection?.saveData) return
  const link = event.target.closest?.('a[href]')
  if (!link || link.origin !== window.location.origin) return
  const path = link.pathname
  if (!Object.hasOwn(loaders, path) || prefetched.has(path)) return
  prefetched.add(path)
  loaders[path]().catch(() => { prefetched.delete(path) })
}
