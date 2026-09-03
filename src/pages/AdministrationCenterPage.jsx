import { lazy, Suspense } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { RiBuilding2Line, RiGovernmentLine, RiShieldUserLine } from 'react-icons/ri'
import { useAuth } from '../contexts/AuthContext'
import { hasNavigationPermission } from '../lib/navigationPermissions'
import PageLoadingState from '../components/ui/PageLoadingState'
import ProductPageHeader, { ProductSectionTabs } from '../components/ui/ProductPageHeader'
import './more-center.css'

const AccessControlPage = lazy(() => import('./AccessControlPage'))
const EnterpriseGovernancePage = lazy(() => import('./EnterpriseGovernancePage'))
const AgencyWhiteLabelPage = lazy(() => import('./AgencyWhiteLabelPage'))

const SECTION_DEFINITIONS = [
  { id: 'accesos', label: 'Accesos', Icon: RiShieldUserLine, requirement: ['access_control.read'] },
  { id: 'gobierno', label: 'Gobierno', Icon: RiGovernmentLine, requirement: ['governance.read'] },
  { id: 'clientes', label: 'Clientes white-label', Icon: RiBuilding2Line, requirement: ['organization.manage'] },
]

export default function AdministrationCenterPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const sections = SECTION_DEFINITIONS.filter(section => hasNavigationPermission(user, section.requirement))

  if (!sections.length) return <Navigate to="/configuracion" replace />

  const requested = searchParams.get('tab')
  const activeId = sections.some(section => section.id === requested) ? requested : sections[0].id

  function selectSection(nextId) {
    const next = new URLSearchParams(searchParams)
    if (nextId === sections[0].id) next.delete('tab')
    else next.set('tab', nextId)
    setSearchParams(next)
  }

  const navigation = <ProductSectionTabs
    items={sections}
    activeId={activeId}
    ariaLabel="Secciones de administración"
    onChange={selectSection}
  />

  return <main className="more-center-page more-admin-page dark-scroll">
    <ProductPageHeader
      Icon={RiShieldUserLine}
      title="Administración"
      description="Gestiona miembros, permisos, políticas y espacios de clientes desde un único lugar."
      navigation={navigation}
    />
    <div className="more-center-body">
      <Suspense fallback={<PageLoadingState label="Cargando administración" />}>
        {activeId === 'accesos' ? <AccessControlPage embedded /> : null}
        {activeId === 'gobierno' ? <EnterpriseGovernancePage embedded /> : null}
        {activeId === 'clientes' ? <AgencyWhiteLabelPage embedded /> : null}
      </Suspense>
    </div>
  </main>
}
