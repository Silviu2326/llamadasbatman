import { lazy, Suspense, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RiBook2Line, RiBookReadLine } from 'react-icons/ri'
import PageLoadingState from '../components/ui/PageLoadingState'
import { ProductSectionTabs } from '../components/ui/ProductPageHeader'

const KnowledgeBase = lazy(() => import('../components/KnowledgeBaseRedesigned'))
const Playbooks = lazy(() => import('../components/Playbooks'))

const SECTIONS = [
  { id: 'knowledge', label: 'Base de conocimiento', Icon: RiBookReadLine },
  { id: 'playbooks', label: 'Playbooks', Icon: RiBook2Line },
]

export default function SalesResourcesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeId = searchParams.get('tab') === 'playbooks' ? 'playbooks' : 'knowledge'
  const navigation = useMemo(() => <ProductSectionTabs
    items={SECTIONS}
    activeId={activeId}
    ariaLabel="Recursos de los agentes IA"
    onChange={nextId => {
      const next = new URLSearchParams(searchParams)
      if (nextId === 'playbooks') next.set('tab', 'playbooks')
      else next.delete('tab')
      setSearchParams(next)
    }}
  />, [activeId, searchParams, setSearchParams])

  return <Suspense fallback={<PageLoadingState label="Cargando recursos IA" />}>
    {activeId === 'playbooks'
      ? <Playbooks embedded sectionNavigation={navigation} />
      : <KnowledgeBase embedded sectionNavigation={navigation} />}
  </Suspense>
}
