import './home-accents.css'

export default function HomeAccentIcon({ icon: Icon, tone = 'violet', className = '' }) {
  return <span className={`home-accent-icon ${className}`} data-tone={tone} aria-hidden="true"><Icon /></span>
}
