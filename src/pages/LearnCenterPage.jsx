import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RiBook2Line, RiBookReadLine } from 'react-icons/ri'
import PageLoadingState from '../components/ui/PageLoadingState'
import { ProductSectionTabs } from '../components/ui/ProductPageHeader'

const TutorialsPage = lazy(() => import('./TutorialsPage'))
const DocumentationPage = lazy(() => import('./DocumentationPage'))

const SECTIONS = [
  { id: 'tutoriales', label: 'Tutoriales', Icon: RiBookReadLine },
  { id: 'documentacion', label: 'Documentación', Icon: RiBook2Line },
]

export default function LearnCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeId = searchParams.get('tab') === 'documentacion' ? 'documentacion' : 'tutoriales'
  const navigation = <ProductSectionTabs
    items={SECTIONS}
    activeId={activeId}
    ariaLabel="Centro de aprendizaje"
    onChange={nextId => {
      const next = new URLSearchParams(searchParams)
      if (nextId === 'tutoriales') next.delete('tab')
      else next.set('tab', nextId)
      setSearchParams(next)
    }}
  />

  return <Suspense fallback={<PageLoadingState label="Cargando centro de aprendizaje" />}>
    {activeId === 'documentacion'
      ? <DocumentationPage sectionNavigation={navigation} />
      : <TutorialsPage sectionNavigation={navigation} />}
  </Suspense>
}
