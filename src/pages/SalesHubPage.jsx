import { lazy, Suspense, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RiGroupLine, RiSparkling2Line } from 'react-icons/ri'
import PageLoadingState from '../components/ui/PageLoadingState'
import { ProductSectionTabs } from '../components/ui/ProductPageHeader'

const SalesCRMPage = lazy(() => import('./SalesCRMPage'))
const RevenueIntelligencePage = lazy(() => import('./RevenueIntelligencePage'))

const SECTIONS = [
  { id: 'crm', label: 'CRM', Icon: RiGroupLine },
  { id: 'inteligencia', label: 'Inteligencia', Icon: RiSparkling2Line },
]

export default function SalesHubPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeId = searchParams.get('vista') === 'inteligencia' ? 'inteligencia' : 'crm'
  const navigation = useMemo(() => <ProductSectionTabs
    items={SECTIONS}
    activeId={activeId}
    ariaLabel="Áreas del CRM"
    onChange={nextId => {
      const next = new URLSearchParams(searchParams)
      if (nextId === 'inteligencia') next.set('vista', 'inteligencia')
      else if (next.get('vista') === 'inteligencia') next.delete('vista')
      setSearchParams(next)
    }}
  />, [activeId, searchParams, setSearchParams])

  return <Suspense fallback={<PageLoadingState label="Cargando espacio de ventas" />}>
    {activeId === 'inteligencia'
      ? <RevenueIntelligencePage embedded sectionNavigation={navigation} />
      : <SalesCRMPage embedded sectionNavigation={navigation} />}
  </Suspense>
}
