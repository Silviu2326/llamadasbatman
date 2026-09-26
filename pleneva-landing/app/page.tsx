import { AgendaFill } from "./components/AgendaFill";
import { DemoCallForm } from "./components/DemoCallForm";
import { Logo } from "./components/Logo";

const STEPS = [
  {
    n: "01",
    title: "Encuentra",
    text: "Saca a quién venderle. Negocios de tu zona y tu sector, o anuncios que traen gente interesada. Tú no buscas nada.",
  },
  {
    n: "02",
    title: "Engancha",
    text: "A cada uno le dice por qué te necesita, con sus propios datos. No un folleto. Su caso.",
  },
  {
    n: "03",
    title: "Llama",
    text: "En el primer minuto. Con una voz que no parece un contestador. Y si no contesta, lo vuelve a intentar, sin agobiar.",
  },
  {
    n: "04",
    title: "Convence",
    text: "Escucha qué necesita y responde como tu mejor comercial. Porque ha aprendido cómo se vende en tu sector.",
  },
  {
    n: "05",
    title: "Te deja la cita",
    text: "La pone en tu agenda. Y si el cliente quiere hablar con una persona, te pasa la llamada en caliente.",
  },
  {
    n: "06",
    title: "No suelta a nadie",
    text: "WhatsApp, email y seguimiento hasta que compra o dice que no. Todo grabado y apuntado.",
  },
];

const LOOSE_PIECES = [
  { what: "La agencia de anuncios", problem: "Te trae clics. Qué hagas con ellos es cosa tuya." },
  { what: "El CRM", problem: "Perfecto. Si alguien lo rellenara." },
  { what: "El chatbot", problem: "Contesta. A las 3 de la mañana. A quien ya se había ido." },
  { what: "La centralita", problem: "Suena. Nadie la coge porque estáis atendiendo." },
];

const SECTORS = [
  "Clínicas",
  "Veterinarias",
  "Estética",
  "Gimnasios",
  "Concesionarios",
  "Talleres",
  "Seguros",
  "Asesorías",
  "Reformas",
  "Academias",
];

const PLANS = [
  {
    name: "Arranque",
    price: "99",
    for: "Para dejar de perder a los que ya te escriben.",
    features: ["Seguimiento por WhatsApp y email", "1 número de teléfono", "~500 min de voz incluidos", "Agenda y recordatorios"],
  },
  {
    name: "Crecimiento",
    price: "299",
    for: "Para que salgamos a buscarte clientes y los llamemos.",
    features: [
      "Todo lo de Arranque",
      "Agente de voz que llama y contesta",
      "~2.000 min de voz incluidos",
      "Búsqueda de clientes por zona y sector",
      "Propuestas comerciales",
    ],
    featured: true,
  },
  {
    name: "Varias sedes",
    price: "599",
    for: "Para cadenas y grupos con más de un local.",
    features: ["Todo lo de Crecimiento", "Varias sedes y equipos", "~6.000 min de voz incluidos", "Campañas de anuncios avanzadas"],
  },
];

const FAQS = [
  {
    q: "¿Esto es otro agente de llamadas con IA?",
    a: "No. El agente es una pieza. Pleneva hace el trabajo entero: encuentra a quién venderle, lo contacta, lo convence y te deja la cita. Si solo quieres un robot que llame, hay cosas más baratas.",
  },
  {
    q: "¿Mis clientes van a notar que es una IA?",
    a: "Se lo decimos. Al principio de cada llamada. Porque es la ley y porque engañar a tu cliente es mala forma de empezar. Si el agente suena bien y le resuelve algo, la conversación sigue. Eso es lo que cuidamos.",
  },
  {
    q: "¿Y si el cliente quiere hablar con una persona?",
    a: "Te pasa la llamada al momento, sin colgar. Y si nadie puede cogerla, apunta el motivo y te deja la tarea.",
  },
  {
    q: "¿Se graban las llamadas?",
    a: "Todas, enteras, con aviso. Tienes la grabación, la transcripción y el resultado de cada una en el CRM.",
  },
  {
    q: "¿Tengo que cambiar cómo trabaja mi equipo?",
    a: "No. Tú decides qué se dice, a quién se llama y cuándo. Nosotros hacemos el trabajo pesado y tú lo ves todo en el CRM.",
  },
];

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="wrap header-inner">
          <a href="#" className="logo-link">
            <Logo />
          </a>
          <nav className="nav" aria-label="Principal">
            <a href="#como">Cómo funciona</a>
            <a href="#precios">Precios</a>
            <a href="#preguntas">Preguntas</a>
          </nav>
          <a href="#demo" className="btn btn-dark btn-sm">
            Quiero la agenda llena
          </a>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="hero">
          <div className="wrap hero-inner">
            <div className="hero-copy">
              <p className="eyebrow">El sistema que te trae clientes</p>
              <h1>
                Te traemos clientes.
                <br />
                <span className="accent">Tú solo tienes que atenderlos.</span>
              </h1>
              <p className="lead">
                Pleneva encuentra a quién venderle, le llama en el primer minuto con una voz que no parece un robot, le
                convence y te deja la cita en la agenda. Anuncios, llamadas, WhatsApp y seguimiento en un solo sitio.
              </p>
              <div className="hero-ctas">
                <a href="#demo" className="btn btn-primary">
                  Quiero la agenda llena
                </a>
                <a href="#demo" className="btn btn-ghost">
                  Oye cómo suena →
                </a>
              </div>
              <ul className="hero-facts">
                <li>Llama en el primer minuto</li>
                <li>Todo grabado y apuntado</li>
                <li>Tú sigues mandando</li>
              </ul>
            </div>
            <AgendaFill />
          </div>
        </section>

        {/* HISTORIA */}
        <section className="story">
          <div className="wrap narrow letter">
            <p className="letter-open">Mira...</p>
            <p>Hay un momento que todo dueño de negocio conoce.</p>
            <p>
              <strong>Lunes, 9:00.</strong> Abres la agenda. Hay dos citas. Una la cancelarán.
            </p>
            <p>
              Y piensas: «tengo que hacer algo». Anuncios. Una agencia. Llamar a los que preguntaron el mes pasado. Pero
              son las 9:05 y ya tienes a alguien en el mostrador.
            </p>
            <p>Así que no haces nada. Y el lunes siguiente, igual.</p>
            <p>
              No es falta de ganas. Es que <em>no puedes atender tu negocio y a la vez salir a buscar clientes</em>.
            </p>
            <p className="letter-punch">Nosotros sí.</p>
          </div>
        </section>

        {/* PIEZAS SUELTAS */}
        <section className="pieces">
          <div className="wrap">
            <p className="eyebrow">El problema</p>
            <h2>Te han vendido piezas sueltas. Ninguna responde del resultado.</h2>
            <div className="pieces-grid">
              {LOOSE_PIECES.map((p) => (
                <div key={p.what} className="piece">
                  <h3>{p.what}</h3>
                  <p>{p.problem}</p>
                </div>
              ))}
              <div className="piece piece-answer">
                <h3>Pleneva</h3>
                <p>Hace el trabajo entero. Y lo medimos en lo único que importa: citas en tu agenda.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CÓMO FUNCIONA */}
        <section className="how" id="como">
          <div className="wrap">
            <p className="eyebrow eyebrow-light">Cómo funciona</p>
            <h2>De nadie sabe que existes a cita en tu agenda. Seis pasos. Todos nuestros.</h2>
            <ol className="steps">
              {STEPS.map((s) => (
                <li key={s.n} className="step">
                  <span className="step-n">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* PARA QUIÉN NO ES */}
        <section className="honest">
          <div className="wrap honest-inner">
            <div>
              <p className="eyebrow">Para quién no es</p>
              <h2>No es para todo el mundo. Mejor decirlo ahora.</h2>
            </div>
            <ul className="honest-list">
              <li>
                <strong>Si ya tienes la agenda llena,</strong> no nos necesitas. Enhorabuena.
              </li>
              <li>
                <strong>Si no puedes atender a más clientes,</strong> traerte más es crearte un problema.
              </li>
              <li>
                <strong>Si quieres llamar a lo loco a listas compradas,</strong> tampoco. Respetamos consentimiento,
                horarios y a quien dice que no.
              </li>
              <li>
                <strong>Si buscas el robot más barato del mercado,</strong> lo encontrarás. No somos nosotros.
              </li>
            </ul>
          </div>
        </section>

        {/* SECTORES */}
        <section className="sectors">
          <div className="wrap">
            <p className="eyebrow">Sectores</p>
            <h2>Cada sector se vende distinto. El agente lo sabe.</h2>
            <p className="sectors-sub">
              Una veterinaria no habla como un concesionario. Antes de llamar a nadie, estudiamos cómo se vende en el
              tuyo.
            </p>
            <ul className="chips">
              {SECTORS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* PRECIOS */}
        <section className="pricing" id="precios">
          <div className="wrap">
            <p className="eyebrow">Precios</p>
            <h2>Precios claros. No se regatean.</h2>
            <p className="pricing-sub">Por cuenta, no por usuario. Cada plan trae minutos de voz; el que se pase paga el minuto extra, sin recargos escondidos.</p>
            <div className="plans">
              {PLANS.map((p) => (
                <div key={p.name} className={`plan${p.featured ? " plan-featured" : ""}`}>
                  {p.featured && <span className="plan-tag">El que elige casi todo el mundo</span>}
                  <h3>{p.name}</h3>
                  <p className="plan-price">
                    <span className="plan-from">desde</span> {p.price} €<span className="plan-per">/mes</span>
                  </p>
                  <p className="plan-for">{p.for}</p>
                  <ul>
                    {p.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <a href="#demo" className={`btn ${p.featured ? "btn-primary" : "btn-dark"}`}>
                    Empezar
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* DEMO */}
        <section className="demo" id="demo">
          <div className="wrap demo-inner">
            <div className="demo-copy">
              <p className="eyebrow eyebrow-light">La demo</p>
              <h2>No te vamos a enseñar una presentación. Te vamos a llamar.</h2>
              <p>
                Deja tu móvil y nuestro agente te llama. Así oyes exactamente lo que oirán tus clientes. Dura un par de
                minutos y puedes colgar cuando quieras.
              </p>
              <p className="demo-note">
                Que es justo lo que hará tu cliente si el agente suena mal. Por eso no suena mal.
              </p>
            </div>
            <DemoCallForm />
          </div>
        </section>

        {/* FAQ */}
        <section className="faq" id="preguntas">
          <div className="wrap narrow">
            <p className="eyebrow">Preguntas</p>
            <h2>Lo que nos pregunta todo el mundo</h2>
            {FAQS.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CIERRE */}
        <section className="closing">
          <div className="wrap narrow">
            <h2>Si tu negocio tuviera cola en la puerta, ¿qué cambiaría?</h2>
            <a href="#demo" className="btn btn-primary">
              Quiero la agenda llena
            </a>
            <p className="ps">
              <strong>P. D.</strong> Si has llegado hasta aquí sin pulsar el botón, probablemente lo estás pensando. Bien.
              Piénsalo el lunes a las 9:00, cuando abras la agenda.
            </p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap footer-inner">
          <Logo inverted />
          <p>Encontramos, llamamos y no soltamos. Tú atiendes.</p>
          <p className="footer-legal">© {new Date().getFullYear()} Pleneva. Llamadas con aviso de IA y grabación.</p>
        </div>
      </footer>
    </>
  );
}
