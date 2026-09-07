import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RiCodeBoxLine, RiPlugLine, RiStore2Line } from 'react-icons/ri'
import PageLoadingState from '../components/ui/PageLoadingState'
import ProductPageHeader, { ProductSectionTabs } from '../components/ui/ProductPageHeader'
import './more-center.css'

const ConnectionsCenterPage = lazy(() => import('./ConnectionsCenterPage'))
const MarketplacePage = lazy(() => import('./MarketplacePage'))
const DeveloperPortalPage = lazy(() => import('./DeveloperPortalPage'))

const SECTIONS = [
  { id: 'proveedores', label: 'Proveedores', Icon: RiPlugLine },
  { id: 'extensiones', label: 'Extensiones', Icon: RiStore2Line },
  { id: 'api', label: 'API y webhooks', Icon: RiCodeBoxLine },
]

/**
 * `embedded`: la página vive como sección de /configuracion, que ya pinta la
 * cabecera. Aquí queda solo la barra de pestañas internas (`?tab=`).
 */
export default function MoreIntegrationsPage({ embedded = false }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const activeId = SECTIONS.some(section => section.id === requested) ? requested : 'proveedores'

  function selectSection(nextId) {
    const next = new URLSearchParams(searchParams)
    if (nextId === 'proveedores') next.delete('tab')
    else next.set('tab', nextId)
    setSearchParams(next)
  }

  const navigation = <ProductSectionTabs
    items={SECTIONS}
    activeId={activeId}
    ariaLabel="Secciones de integraciones"
    onChange={selectSection}
  />

  const Root = embedded ? 'section' : 'main'

  return <Root className="more-center-page dark-scroll">
    {embedded
      ? <div className="more-center-subnav">{navigation}</div>
      : <ProductPageHeader
          Icon={RiPlugLine}
          title="Integraciones"
          description="Conecta proveedores, instala extensiones y enlaza Vendrava con tus sistemas."
          navigation={navigation}
        />}
    <div className="more-center-body">
      <Suspense fallback={<PageLoadingState label="Cargando integraciones" />}>
        {activeId === 'extensiones' ? <MarketplacePage embedded /> : null}
        {activeId === 'api' ? <DeveloperPortalPage embedded /> : null}
        {activeId === 'proveedores' ? <ConnectionsCenterPage embedded /> : null}
      </Suspense>
    </div>
  </Root>
}
