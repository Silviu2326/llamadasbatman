import { Link, useLocation } from 'react-router-dom'
import { RiArrowRightLine } from 'react-icons/ri'
import './capture-journey.css'
import { useI18n } from '../../i18n'

const CAPTURE_STEPS = [
  { id: 'plan', number: '01', label: 'Planificar', detail: 'Campañas y objetivos', to: '/campanas' },
  { id: 'attract', number: '02', label: 'Atraer', detail: 'Ads · Social · Prospect Finder', to: '/ads' },
  { id: 'convert', number: '03', label: 'Convertir', detail: 'Landings y formularios', to: '/landings' },
  { id: 'close', number: '04', label: 'Cerrar', detail: 'Funnels, llamadas y reuniones', to: '/funnels' },
]

export default function CaptureJourney({ active = 'plan' }) {
  const { locale } = useI18n()
  const { pathname } = useLocation()
  const localizedSteps = locale === 'en'
    ? CAPTURE_STEPS.map((step, index) => ({ ...step, label: ['Plan', 'Attract', 'Convert', 'Close'][index], detail: ['Campaigns and objectives', 'Ads · Social · Prospect Finder', 'Landing pages and forms', 'Funnels, calls and meetings'][index] }))
    : CAPTURE_STEPS
  const channels = [
    { label: 'Ads', to: '/ads' },
    { label: locale === 'en' ? 'Social media' : 'Redes sociales', to: '/redes-sociales' },
    { label: 'Prospect Finder', to: '/prospectos' },
  ]
  return <div className="capture-journey-wrap">
    <nav className="capture-journey" aria-label="Recorrido de captación">
      {localizedSteps.map((step, index) => <div className="capture-journey-slot" key={step.id}>
        <Link className={`capture-journey-step${active === step.id ? ' active' : ''}`} to={step.to} aria-current={active === step.id ? 'step' : undefined}>
          <span className="capture-journey-number">{step.number}</span>
          <span className="capture-journey-copy"><strong>{step.label}</strong><small>{step.detail}</small></span>
          <RiArrowRightLine />
        </Link>
        {index < localizedSteps.length - 1 ? <span className="capture-journey-line" aria-hidden="true" /> : null}
      </div>)}
    </nav>
    <nav className="capture-channel-nav" aria-label="Canales de atracción">
      <span>Canales de atracción</span>
      {channels.map(channel => <Link key={channel.to} to={channel.to} className={pathname === channel.to ? 'active' : ''} aria-current={pathname === channel.to ? 'page' : undefined}>{channel.label}</Link>)}
    </nav>
  </div>
}
