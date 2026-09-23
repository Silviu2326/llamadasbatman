import { RiCompass3Line, RiFocus3Line, RiBarChartBoxLine } from 'react-icons/ri'
import './home-page-frame.css'

const pages = {
  dashboard: { label: 'Resumen', eyebrow: 'Tu punto de partida', title: 'Dale impulso a tus ventas', description: 'Contacta, retoma conversaciones y sigue tus objetivos. Elige tu siguiente paso.', Icon: RiCompass3Line },
  plan: { label: 'Plan y objetivos', eyebrow: 'Plan y objetivos', title: 'Tus metas merecen un plan.', description: 'Ponle una cifra a tu ambición. Decide qué hacer hoy y descubre qué necesitarías para llegar más lejos.', Icon: RiFocus3Line },
  insights: { label: 'Análisis del negocio', eyebrow: 'La perspectiva de tu negocio', title: 'Análisis del negocio', description: 'Ventas, reuniones y resultados de las llamadas.', Icon: RiBarChartBoxLine },
}

/** One viewport, scroll owner and header for every page in Inicio. */
export default function HomePageFrame({ page, className = '', contentClassName = '', actions, children }) {
  const { label, eyebrow, title, description, Icon } = pages[page]
  const artwork = page === 'dashboard' ? 'conversations' : page
  return <section className={`home-page ${className}`} aria-label={label}>
    <div className={`home-page-content ${contentClassName}`}>
      <header className="home-page-header">
        <div className="home-page-heading">
          <span className="home-page-eyebrow"><Icon aria-hidden="true" />{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <picture className="home-page-art" aria-hidden="true">
          <img
            src={`/assets/home/${artwork}-768.webp`}
            srcSet={`/assets/home/${artwork}-384.webp 384w, /assets/home/${artwork}-768.webp 768w`}
            sizes="(max-width: 650px) 140px, (max-width: 1100px) 240px, 420px"
            width="768"
            height="512"
            alt=""
            decoding="async"
            draggable="false"
          />
        </picture>
      </header>
      {actions ? <div className="home-page-toolbar">{actions}</div> : null}
      {children}
    </div>
  </section>
}
