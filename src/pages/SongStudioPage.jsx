import { useEffect, useMemo, useState } from 'react'
import {
  FiArrowUpRight,
  FiCheck,
  FiChevronRight,
  FiDisc,
  FiHeadphones,
  FiPause,
  FiPlay,
  FiPlus,
  FiShoppingBag,
  FiSliders,
  FiStar,
} from 'react-icons/fi'
import '../songStudio.css'

const styles = ['Pop alternativo', 'R&B íntimo', 'Indie luminoso', 'Electrónica']
const moods = ['Nostálgica', 'Eufórica', 'Sensual', 'Nocturna']
const tracks = [
  { title: 'Luz de madrugada', artist: 'Mara Sol', genre: 'Pop alternativo', duration: '3:24', accent: 'blue', price: '19,90 €' },
  { title: 'Cerca del mar', artist: 'Nilo', genre: 'Indie luminoso', duration: '2:58', accent: 'lime', price: '14,90 €' },
  { title: 'Sin hacer ruido', artist: 'Vera Nox', genre: 'R&B íntimo', duration: '3:41', accent: 'rose', price: '24,90 €' },
]

function Waveform({ compact = false, active = false }) {
  const bars = useMemo(() => Array.from({ length: compact ? 30 : 46 }, (_, index) => {
    const pattern = [18, 30, 46, 27, 62, 34, 22, 51, 72, 39, 28, 58, 44, 76, 33, 23]
    return pattern[index % pattern.length] + ((index * 7) % 11)
  }), [compact])

  return (
    <div className={`waveform ${active ? 'waveform--active' : ''}`} aria-label="Forma de onda de la canción">
      {bars.map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}
    </div>
  )
}

function Logo() {
  return <a className="sonora-logo" href="#inicio" aria-label="Sonora, inicio"><span className="sonora-logo__mark"><i /><i /><i /><i /></span>SONORA</a>
}

export default function SongStudioPage() {
  const [selectedStyle, setSelectedStyle] = useState(styles[0])
  const [selectedMood, setSelectedMood] = useState(moods[3])
  const [title, setTitle] = useState('Luz de madrugada')
  const [duration, setDuration] = useState(68)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(31)
  const [isGenerating, setIsGenerating] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    document.title = 'Sonora — Crea canciones que se venden'
  }, [])

  useEffect(() => {
    if (!isPlaying) return undefined
    const timer = window.setInterval(() => {
      setProgress((current) => current >= 100 ? 0 : current + 1)
    }, 420)
    return () => window.clearInterval(timer)
  }, [isPlaying])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 2600)
    return () => window.clearTimeout(timer)
  }, [notice])

  const createSong = () => {
    setIsGenerating(true)
    setIsPlaying(false)
    window.setTimeout(() => {
      setIsGenerating(false)
      setProgress(0)
      setNotice('Tu demo está lista para escuchar y vender.')
    }, 900)
  }

  const showNotice = (message) => setNotice(message)

  return (
    <div className="sonora-app" id="inicio">
      <header className="sonora-header">
        <Logo />
        <nav className="sonora-nav" aria-label="Navegación principal">
          <a href="#crear">Crear</a>
          <a href="#explorar">Explorar</a>
          <a href="#vender">Vender canciones</a>
        </nav>
        <div className="sonora-header__actions">
          <button className="text-button" onClick={() => showNotice('La biblioteca estará disponible muy pronto.')}>Mis canciones</button>
          <button className="profile-button" aria-label="Abrir perfil">MS</button>
        </div>
      </header>

      <main>
        <section className="sonora-hero" id="crear">
          <div className="sonora-hero__copy">
            <p className="eyebrow"><span className="eyebrow__line" /> ESTUDIO ABIERTO</p>
            <h1>Convierte una idea en una canción que <em>se vende.</em></h1>
            <p className="hero-lede">Crea canciones originales a tu medida, dale una identidad sonora y publícalas para que encuentren a su próxima voz.</p>
            <div className="hero-actions">
              <button className="button button--lime" onClick={createSong}>{isGenerating ? 'Creando demo…' : 'Crear mi canción'} <FiArrowUpRight /></button>
              <a className="text-link" href="#explorar">Escuchar el catálogo <FiChevronRight /></a>
            </div>
            <div className="hero-proof"><span className="proof-avatars"><i>AL</i><i>NS</i><i>VC</i></span><span>Más de 2.400 creadores ya están publicando en Sonora.</span></div>
          </div>

          <div className="studio-card" aria-label="Editor de canción">
            <div className="studio-card__topline"><span className="live-dot" /> DEMO EN CURSO <span className="studio-card__topline-right">04 / 12 <FiSliders /></span></div>
            <div className="studio-card__body">
              <div className="artwork-wrap">
                <img src="/assets/sonora-artist.png" alt="Artista cantando dentro de un estudio" />
                <span className="artwork-label">SONORA<br /><strong>ORIGINALS</strong></span>
              </div>
              <div className="track-info">
                <div className="track-info__meta"><span>Tu canción</span><span>03:24</span></div>
                <input className="track-title-input" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Título de la canción" />
                <p className="track-artist">Creada por ti · {selectedStyle}</p>
                <Waveform active={isPlaying} />
                <div className="scrub-line"><span style={{ width: `${progress}%` }} /><button style={{ left: `${progress}%` }} onClick={() => setProgress(72)} aria-label="Avanzar a la mitad de la canción" /></div>
                <div className="player-controls"><span>0{Math.floor(progress / 17)}:0{Math.floor(progress % 10)}</span><button className="play-button" onClick={() => setIsPlaying((value) => !value)} aria-label={isPlaying ? 'Pausar canción' : 'Reproducir canción'}>{isPlaying ? <FiPause /> : <FiPlay />}</button><span>03:24</span></div>
              </div>
            </div>
            <div className="studio-card__settings">
              <div><span className="setting-label">Estilo</span><strong>{selectedStyle}</strong></div>
              <div><span className="setting-label">Energía</span><strong>{selectedMood}</strong></div>
              <div><span className="setting-label">Duración</span><strong>{duration}s</strong></div>
            </div>
          </div>
        </section>

        <section className="creator-strip" aria-label="Configuración rápida">
          <div className="creator-strip__label"><FiDisc /> Dale dirección a tu idea</div>
          <div className="creator-control creator-control--wide"><span className="setting-label">Género</span><div className="control-options">{styles.map((style) => <button key={style} className={selectedStyle === style ? 'is-selected' : ''} onClick={() => setSelectedStyle(style)}>{style}</button>)}</div></div>
          <div className="creator-control"><span className="setting-label">Mood</span><select value={selectedMood} onChange={(event) => setSelectedMood(event.target.value)} aria-label="Mood de la canción">{moods.map((mood) => <option key={mood}>{mood}</option>)}</select></div>
          <label className="creator-control creator-control--range"><span className="setting-label">Duración <strong>{duration}s</strong></span><input type="range" min="30" max="120" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
          <button className="icon-button" aria-label="Añadir otra opción" onClick={() => showNotice('Puedes combinar hasta tres direcciones en una demo.')}><FiPlus /></button>
        </section>

        <section className="catalog-section" id="explorar">
          <div className="section-heading"><div><p className="eyebrow"><span className="eyebrow__line" /> PARA ESCUCHAR HOY</p><h2>Lo que está sonando.</h2></div><a className="text-link" href="#vender">Ver todo el catálogo <FiArrowUpRight /></a></div>
          <div className="track-list">{tracks.map((track, index) => <article className="track-row" key={track.title}><span className="track-row__number">0{index + 1}</span><div className={`track-row__cover track-row__cover--${track.accent}`}><Waveform compact /><span>{track.title.split(' ').map((word) => word[0]).join('')}</span></div><div className="track-row__name"><strong>{track.title}</strong><span>{track.artist} · {track.genre}</span></div><span className="track-row__duration">{track.duration}</span><button className="small-play" onClick={() => showNotice(`Reproduciendo ${track.title}.`)} aria-label={`Reproducir ${track.title}`}><FiPlay /></button><span className="track-row__price">{track.price}</span><button className="buy-button" onClick={() => showNotice(`${track.title} añadida a tu cesta.`)}><FiShoppingBag /> Comprar</button></article>)}</div>
        </section>

        <section className="steps-section">
          <div className="steps-intro"><p className="eyebrow"><span className="eyebrow__line" /> DEL BOCETO AL ESTRENO</p><h2>Tu canción empieza con una sensación.</h2><p>Cuéntanos qué quieres hacer sentir. Nosotros ponemos el estudio, el criterio y una mezcla lista para compartir.</p><button className="button button--outline" onClick={createSong}>Empezar desde cero <FiArrowUpRight /></button></div>
          <div className="steps-list"><div className="step"><span>01</span><div><h3>Define la vibra</h3><p>Elige estilo, energía y el universo emocional de tu canción.</p></div><FiCheck /></div><div className="step"><span>02</span><div><h3>Hazla tuya</h3><p>Itera letra, estructura e instrumentos hasta que suene a ti.</p></div><FiCheck /></div><div className="step"><span>03</span><div><h3>Publícala</h3><p>Vende licencias o comparte la pista con quien quieras.</p></div><FiCheck /></div></div>
        </section>

        <section className="sell-section" id="vender">
          <div className="sell-section__visual"><div className="sell-orbit sell-orbit--one" /><div className="sell-orbit sell-orbit--two" /><FiHeadphones /><span>Tu sonido<br /><strong>tu catálogo</strong></span></div>
          <div className="sell-section__copy"><p className="eyebrow"><span className="eyebrow__line" /> PARA CREADORES</p><h2>Tu música también puede ser un producto.</h2><p>Sube tus canciones, define el precio y deja que otras personas las conviertan en su próximo proyecto. Tú decides las condiciones.</p><div className="sell-points"><span><FiCheck /> Licencias claras</span><span><FiCheck /> Control de precios</span><span><FiCheck /> Pagos mensuales</span></div><button className="button button--lime" onClick={() => showNotice('Tu espacio de venta está listo para configurarse.')}>Abrir mi escaparate <FiArrowUpRight /></button></div>
        </section>
      </main>

      <footer className="sonora-footer"><Logo /><span>Creado para que las ideas no se queden en notas.</span><div><a href="#crear">Crear</a><a href="#explorar">Explorar</a><a href="#vender">Vender</a></div></footer>
      {notice && <div className="sonora-toast" role="status"><FiStar /> {notice}</div>}
    </div>
  )
}
