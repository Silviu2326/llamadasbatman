import { lazy, Suspense } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import PageLoadingState from '../components/ui/PageLoadingState'

const SalesCRMPage = lazy(() => import('./SalesCRMPage'))

export default function SalesHubPage() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  // Bookmarked links to the former CRM tab keep their filters and anchor.
  if (params.get('vista') === 'inteligencia') {
    params.delete('vista')
    return <Navigate to={{ pathname: '/inteligencia', search: params.toString(), hash: location.hash }} replace />
  }

  return <Suspense fallback={<PageLoadingState label="Cargando CRM" />}>
    <SalesCRMPage />
  </Suspense>
}
