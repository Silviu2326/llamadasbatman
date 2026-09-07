import { Suspense } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  RiBankCardLine,
  RiBuilding2Line,
  RiPlugLine,
  RiSettings4Line,
  RiShieldUserLine,
  RiUserLine,
} from 'react-icons/ri'
import { useAuth } from '../../contexts/AuthContext'
import { useExperience } from '../../contexts/ExperienceContext'
import { useI18n } from '../../i18n'
import { canNavigateTo } from '../../lib/navigationPermissions'
import PageLoadingState from '../../components/ui/PageLoadingState'
import ProductPageHeader, { ProductSectionTabs } from '../../components/ui/ProductPageHeader'
import './configuracion.css'

/**
 * Configuración — una sola sección para todo lo que describe y gobierna la
 * organización.
 *
 * Antes eran cuatro entradas hermanas en «Más» (Empresa, Integraciones,
 * Configuración y Administración) con cabeceras y patrones distintos. Ahora,
 * como en Captación, la barra de secciones es la navegación y va fija
 * arriba; cada sección es una ruta anidada que carga su módulo de forma
 * perezosa, hace su propio scroll y conserva sus permisos, su `moduleId`
 * para el gating por plan y, en Integraciones y Administración, sus pestañas
 * internas por `?tab=`.
 */
export const SETTINGS_SECTIONS = [
  { id: 'cuenta', to: '/configuracion', moduleId: 'settings', label: 'Mi perfil', labelEn: 'My profile', Icon: RiUserLine },
  { id: 'empresa', to: '/configuracion/empresa', moduleId: 'business-info', label: 'Empresa', labelEn: 'Company', Icon: RiBuilding2Line },
  { id: 'plan', to: '/configuracion/plan', moduleId: 'settings', label: 'Plan y facturación', labelEn: 'Plan & billing', Icon: RiBankCardLine },
  { id: 'integraciones', to: '/configuracion/integraciones', moduleId: 'connections', label: 'Integraciones', labelEn: 'Integrations', Icon: RiPlugLine },
  { id: 'administracion', to: '/configuracion/administracion', moduleId: 'administration', label: 'Administración', labelEn: 'Administration', Icon: RiShieldUserLine },
]

export function settingsSectionForPath(pathname) {
  return [...SETTINGS_SECTIONS]
    .sort((a, b) => b.to.length - a.to.length)
    .find(section => pathname === section.to || pathname.startsWith(`${section.to}/`)) || SETTINGS_SECTIONS[0]
}

export default function ConfiguracionPage() {
  const { user } = useAuth()
  const experience = useExperience()
  const { locale } = useI18n()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const active = settingsSectionForPath(pathname)

  // Una sección que lleva a un 403 o a un módulo fuera de plan es peor que
  // ninguna: solo se pintan las que el usuario puede abrir. La activa se
  // mantiene siempre para que la barra no pierda el contexto de dónde está.
  const sections = SETTINGS_SECTIONS.filter(section => (
    section.id === active.id
    || (canNavigateTo(user, section.to) && experience.isModuleVisible(section.moduleId, { isActive: false }))
  ))

  const navigation = (
    <ProductSectionTabs
      items={sections.map(section => ({ id: section.id, label: locale === 'en' ? section.labelEn : section.label, Icon: section.Icon }))}
      activeId={active.id}
      ariaLabel={locale === 'en' ? 'Settings sections' : 'Secciones de configuración'}
      onChange={id => {
        const target = SETTINGS_SECTIONS.find(section => section.id === id)
        if (target && target.id !== active.id) navigate(target.to)
      }}
    />
  )

  return (
    <div className="settings-shell">
      <div className="settings-shell-header">
        <ProductPageHeader
          Icon={RiSettings4Line}
          title={locale === 'en' ? 'Settings' : 'Configuración'}
          description={locale === 'en'
            ? 'Your account, your company, the plan, integrations and administration in one place.'
            : 'Tu cuenta, tu empresa, el plan, las integraciones y la administración en un solo sitio.'}
          navigation={navigation}
        />
      </div>
      <div className="settings-shell-view">
        {/* Suspense propio: el del router desmontaría la barra mientras carga
            el chunk de la sección, y la página parpadearía entera. */}
        <Suspense fallback={<PageLoadingState inline label={locale === 'en' ? 'Loading section' : 'Cargando sección'} />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  )
}
