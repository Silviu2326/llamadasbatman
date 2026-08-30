import { lazy, Suspense, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RiFlowChart, RiListCheck2, RiSparkling2Line } from 'react-icons/ri'
import PageLoadingState from '../components/ui/PageLoadingState'
import { ProductSectionTabs } from '../components/ui/ProductPageHeader'

const OrchestrationPage = lazy(() => import('./OrchestrationPage'))
const JobsCenterPage = lazy(() => import('./JobsCenterPage'))
const AutomationsPage = lazy(() => import('../components/Automatizaciones'))

const SECTIONS = [
  { id: 'acciones', label: 'Centro de acciones', Icon: RiSparkling2Line },
  { id: 'trabajos', label: 'Trabajos', Icon: RiListCheck2 },
  { id: 'automatizaciones', label: 'Automatizaciones', Icon: RiFlowChart },
]

const VALID_TABS = new Set(SECTIONS.map(section => section.id))

export default function GrowthOperationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const activeId = VALID_TABS.has(requestedTab) ? requestedTab : 'acciones'
  const navigation = useMemo(() => <ProductSectionTabs
    items={SECTIONS}
    activeId={activeId}
    ariaLabel="Operaciones de Growth"
    onChange={nextId => {
      const next = new URLSearchParams(searchParams)
      if (nextId === 'acciones') next.delete('tab')
      else next.set('tab', nextId)
      setSearchParams(next)
    }}
  />, [activeId, searchParams, setSearchParams])

  return <Suspense fallback={<PageLoadingState label="Cargando operaciones de Growth" />}>
    {activeId === 'trabajos'
      ? <JobsCenterPage sectionNavigation={navigation} />
      : activeId === 'automatizaciones'
        ? <AutomationsPage sectionNavigation={navigation} />
        : <OrchestrationPage sectionNavigation={navigation} />}
  </Suspense>
}
