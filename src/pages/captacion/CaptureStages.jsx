import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  RiArrowDownSLine,
  RiBarChartLine,
  RiCalendarLine,
  RiCompass3Line,
  RiFlowChart,
  RiGlobalLine,
  RiLeafLine,
  RiRocket2Line,
} from 'react-icons/ri'
import { useAuth } from '../../contexts/AuthContext'
import { canNavigateTo } from '../../lib/navigationPermissions'
import { useI18n } from '../../i18n'

/**
 * Barra de etapas de Captación: la navegación principal de la sección.
 *
 * Es una sola fila con todo a un clic: Planificar, las tres vías de Atraer
 * (Ads · Orgánico y social · Prospectos), Convertir y Cerrar. Se queda fija
 * arriba mientras la etapa de debajo hace su propio scroll, así cambiar de
 * etapa no obliga a volver arriba ni a "salir" de la página.
 *
 * Las etapas que el usuario no puede ver por permisos no se pintan: una
 * etapa que lleva a un 403 es peor que ninguna.
 */
export const CAPTURE_STAGES = [
  { id: 'plan', number: '01', label: 'Planificar', labelEn: 'Plan', detail: 'Campañas y objetivos', detailEn: 'Campaigns and objectives', to: '/captacion/planificar', Icon: RiCalendarLine },
  {
    id: 'attract', number: '02', label: 'Atraer', labelEn: 'Attract', detail: 'Ads · Orgánico y social · Prospectos', detailEn: 'Ads · Organic & social · Prospects', to: '/captacion/atraer', Icon: RiBarChartLine,
    children: [
      { id: 'ads', label: 'Ads', labelEn: 'Ads', to: '/captacion/atraer/ads', Icon: RiBarChartLine },
      { id: 'organic', label: 'Orgánico y social', labelEn: 'Organic & social', to: '/captacion/atraer/organico', Icon: RiLeafLine },
      { id: 'prospects', label: 'Prospectos', labelEn: 'Prospects', to: '/captacion/atraer/prospectos', Icon: RiCompass3Line },
    ],
  },
  { id: 'convert', number: '03', label: 'Convertir', labelEn: 'Convert', detail: 'Landings, webs y SEO', detailEn: 'Landing pages, sites and SEO', to: '/captacion/convertir', Icon: RiGlobalLine },
  { id: 'close', number: '04', label: 'Cerrar', labelEn: 'Close', detail: 'Funnels, llamadas y reuniones', detailEn: 'Funnels, calls and meetings', to: '/captacion/cerrar', Icon: RiFlowChart },
]

// Los textos visibles salen de captacion.stages.<id>.* (i18n); `label`/
// `labelEn` del array se conservan para otros consumidores (paleta, asistente).
export default function CaptureStages() {
  const { user } = useAuth()
  const { t } = useI18n()
  const pick = (item, key) => t(`captacion.stages.${item.id}.${key}`)
  const { pathname } = useLocation()
  const [expandedGroup, setExpandedGroup] = useState(pathname.startsWith('/captacion/atraer') ? 'attract' : null)

  useEffect(() => {
    if (pathname.startsWith('/captacion/atraer')) setExpandedGroup('attract')
  }, [pathname])

  const stages = CAPTURE_STAGES
    .map(stage => (stage.children
      ? { ...stage, children: stage.children.filter(child => canNavigateTo(user, child.to)) }
      : stage))
    .filter(stage => (stage.children ? stage.children.length > 0 : canNavigateTo(user, stage.to)))

  return (
    <nav className="captacion-stages" aria-label={t('captacion.stagesAria')}>
      <Link to="/captacion" className={`captacion-stages-home${pathname === '/captacion' ? ' active' : ''}`} aria-current={pathname === '/captacion' ? 'page' : undefined}>
        <RiRocket2Line aria-hidden="true" />
        <span>{t('captacion.title')}</span>
      </Link>
      <ol>
        {stages.map(stage => {
          const groupActive = pathname.startsWith(stage.to)
          const isExpanded = expandedGroup === stage.id
          const Icon = stage.Icon
          return (
            <li key={stage.id} className={`captacion-stage-slot${stage.children ? ' is-group' : ''}${groupActive ? ' active' : ''}${isExpanded ? ' expanded' : ''}`}>
              {stage.children ? (
                <>
                  <button
                    type="button"
                    className="captacion-stage-group"
                    aria-expanded={isExpanded}
                    aria-controls={`capture-stage-${stage.id}`}
                    onClick={() => setExpandedGroup(current => (current === stage.id ? null : stage.id))}
                  >
                    <span className="captacion-stage-number">{stage.number}</span>
                    <span className="captacion-stage-icon"><Icon aria-hidden="true" /></span>
                    <span className="captacion-stage-copy"><strong>{pick(stage, 'label')}</strong><small>{pick(stage, 'detail')}</small></span>
                    <RiArrowDownSLine className="captacion-stage-chevron" aria-hidden="true" />
                  </button>
                  {isExpanded ? (
                    <div id={`capture-stage-${stage.id}`} className="captacion-stage-children" role="menu" aria-label={pick(stage, 'label')}>
                      {stage.children.map(child => {
                        const ChildIcon = child.Icon
                        return <NavLink key={child.id} to={child.to} role="menuitem" className={({ isActive }) => (isActive ? 'active' : '')}><ChildIcon aria-hidden="true" /><span>{pick(child, 'label')}</span></NavLink>
                      })}
                    </div>
                  ) : null}
                </>
              ) : (
                <NavLink to={stage.to} className={({ isActive }) => `captacion-stage${isActive ? ' active' : ''}`}>
                  <span className="captacion-stage-number">{stage.number}</span>
                  <span className="captacion-stage-icon"><Icon aria-hidden="true" /></span>
                  <span className="captacion-stage-copy"><strong>{pick(stage, 'label')}</strong><small>{pick(stage, 'detail')}</small></span>
                </NavLink>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
