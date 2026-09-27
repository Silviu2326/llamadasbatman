import Image from "next/image";
import { DemoCallForm } from "./components/DemoCallForm";
import { Logo } from "./components/Logo";
import { LandingMotion } from "./components/LandingMotion";

const STEPS = [
  {
    n: "01",
    title: "Encuentra",
    text: "Buscamos personas y negocios que encajan contigo. También recogemos a quienes llegan por tus anuncios o tu web.",
  },
  {
    n: "02",
    title: "Prepara",
    text: "Antes de hablar, el agente conoce tu oferta y el contexto de cada contacto. No empieza leyendo un guion a ciegas.",
  },
  {
    n: "03",
    title: "Llama",
    text: "Contacta cuando corresponde, escucha la respuesta y sabe cuándo intentarlo de nuevo y cuándo parar.",
  },
  {
    n: "04",
    title: "Conversa",
    text: "Pregunta, responde y deja que la otra persona termine. Si surge algo que no sabe resolver, te lo pasa.",
  },
  {
    n: "05",
    title: "Deja el siguiente paso",
    text: "Una cita, una devolución de llamada o un no. Queda registrado para que sepas qué pasó y qué toca hacer.",
  },
  {
    n: "06",
    title: "Hace seguimiento",
    text: "Si tiene sentido continuar, sigue el hilo por los canales que hayas configurado. Sin perseguir a quien dijo que no.",
  },
];

const LOOSE_PIECES = [
  { what: "Los anuncios", problem: "Traen una consulta. Después alguien tiene que contestarla." },
  { what: "El CRM", problem: "Guarda el contacto. Alguien tiene que moverlo." },
  { what: "El formulario", problem: "Recoge el teléfono. La conversación sigue pendiente." },
  { what: "La centralita", problem: "Suena justo cuando todos estáis ocupados." },
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
    q: "¿Es solo un agente que hace llamadas?",
    a: "El agente de voz es una parte. Pleneva reúne captación, conversaciones, seguimiento y agenda para que puedas ver qué pasó con cada oportunidad.",
  },
  {
    q: "¿Mis clientes van a notar que es una IA?",
    a: "El agente se presenta como IA al comenzar. Puedes escucharlo tú mismo antes de decidir si lo usarías con tus clientes.",
  },
  {
    q: "¿Y si el cliente quiere hablar con una persona?",
    a: "Puede transferirte la conversación o dejarte el motivo y una tarea para que la retomes, según cómo lo configures.",
  },
  {
    q: "¿Se graban las llamadas?",
    a: "La grabación y la transcripción se configuran con el aviso correspondiente. Así puedes revisar lo que ocurrió en cada conversación.",
  },
  {
    q: "¿Tengo que cambiar cómo trabaja mi equipo?",
    a: "Tú decides a quién contactar, en qué horario y cuándo debe intervenir una persona. El equipo puede consultar el resultado en el CRM.",
  },
];

export default function Home() {
  return (
    <>
      <LandingMotion />
      <header className="site-header">
        <span className="reading-progress" aria-hidden="true" />
        <div className="wrap header-inner">
          <a href="#" className="logo-link" aria-label="Pleneva, volver al inicio">
            <Logo />
          </a>
          <nav className="nav" aria-label="Principal">
            <a href="#como">Cómo funciona</a>
            <a href="#precios">Precios</a>
            <a href="#preguntas">Preguntas</a>
          </nav>
          <a href="#demo" className="btn btn-primary btn-sm">
            Pide tu demo
          </a>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap hero-inner">
            <div className="hero-copy">
              <p className="hero-kicker">Para negocios que no pueden estar en dos sitios a la vez</p>
              <h1>
                Un cliente pregunta.
                <br />
                Tú estás trabajando.
                <br />
                <span className="accent">Otro responde.</span>
              </h1>
              <p className="lead">
                Pleneva busca oportunidades, atiende conversaciones y te deja claro quién quiere hablar contigo.
                Desde el primer contacto hasta la siguiente cita, todo queda en un mismo lugar.
              </p>
              <div className="hero-ctas">
                <a href="#demo" className="btn btn-primary">
                  Escucha al agente en tu móvil <span aria-hidden="true">↗</span>
                </a>
                <a href="#como" className="btn btn-ghost">
                  Mira qué hace Pleneva <span aria-hidden="true">↓</span>
                </a>
              </div>
            </div>
            <figure className="hero-photo">
              <Image
                src="/images/reception.png"
                alt="Una profesional recibe a una clienta en su negocio"
                width={1664}
                height={936}
                priority
                sizes="(max-width: 900px) 100vw, 54vw"
              />
            </figure>
          </div>
        </section>

        <section className="story">
          <div className="wrap story-inner">
            <div className="story-heading" data-reveal>
              <p className="story-intro">Pasa todos los días.</p>
              <h2>La consulta que llegó mientras atendías.</h2>
            </div>
            <div className="letter" data-reveal>
              <p>Estás con un cliente. Te entra una consulta en la web.</p>
              <p>«¿Tenéis hueco esta semana?»</p>
              <p>
                No la ves hasta que termina la cita. Para entonces ya hay otra llamada, dos mensajes y alguien esperando
                en la puerta.
              </p>
              <p>La persona que preguntó no sabe que estabas ocupado. Solo sabe que nadie respondió.</p>
              <p>Tu negocio no necesita otra bandeja de entrada. <em>Necesita que alguien se ocupe de lo que entra.</em></p>
              <p className="letter-punch">Ahí entra Pleneva.</p>
            </div>
          </div>
        </section>

        <section className="pieces">
          <div className="wrap">
            <h2 data-reveal>El problema está en el espacio entre una herramienta y la siguiente.</h2>
            <div className="pieces-grid">
              {LOOSE_PIECES.map((p) => (
                <div key={p.what} className="piece" data-reveal>
                  <h3>{p.what}</h3>
                  <p>{p.problem}</p>
                </div>
              ))}
              <div className="piece piece-answer" data-reveal>
                <h3>Pleneva</h3>
                <p>Une los pasos para que una consulta no termine olvidada entre aplicaciones.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="how" id="como">
          <div className="wrap how-inner">
            <div className="section-heading" data-reveal>
              <h2>De «ha preguntado alguien» a «sé qué hacer ahora».</h2>
              <p>Seis pasos visibles. La conversación avanza y tú mantienes el control.</p>
            </div>
            <ol className="steps">
              {STEPS.map((s) => (
                <li key={s.n} className="step" data-reveal>
                  <span className="step-n">{s.n}</span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="honest">
          <div className="wrap honest-inner">
            <h2 data-reveal>No todo negocio necesita Pleneva.</h2>
            <ul className="honest-list" data-reveal>
              <li><strong>Si ya tienes la agenda llena,</strong> este no es tu problema.</li>
              <li><strong>Si no puedes atender a más clientes,</strong> primero resuelve eso.</li>
              <li>
                <strong>Si quieres llamar a lo loco a listas compradas,</strong> tampoco. Respetamos consentimiento,
                horarios y a quien dice que no.
              </li>
              <li><strong>Si quieres dejar a una IA hablar sin supervisión,</strong> tampoco encajamos.</li>
            </ul>
          </div>
        </section>

        <section className="sectors">
          <div className="wrap sectors-inner">
            <div className="sectors-copy" data-reveal>
              <h2>Una clínica no habla como un taller.</h2>
              <p>
                Antes de atender a nadie, configuramos el agente con tu oferta, tus preguntas frecuentes y los límites
                de tu negocio. Una conversación útil empieza por conocer el contexto.
              </p>
            </div>
            <ul className="sectors-list" data-reveal>
              {SECTORS.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </div>
        </section>

        <section className="pricing" id="precios">
          <div className="wrap">
            <div className="pricing-heading" data-reveal>
              <h2>Saber cuánto cuesta también ayuda a decidir.</h2>
              <p>
                Estos son los planes de partida. Cada uno incluye minutos de voz; antes de empezar te explicamos el
                coste de cualquier uso adicional.
              </p>
            </div>
            <div className="plans">
              {PLANS.map((p) => (
                <div key={p.name} className={`plan${p.featured ? " plan-featured" : ""}`} data-reveal>
                  <h3>{p.name}</h3>
                  <p className="plan-price"><span className="plan-from">desde</span> {p.price} €<span className="plan-per">/mes</span></p>
                  <p className="plan-for">{p.for}</p>
                  <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
                  <a href="#demo" className={`btn ${p.featured ? "btn-primary" : "btn-ghost"}`}>Empezar</a>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="demo" id="demo">
          <div className="wrap demo-inner">
            <div className="demo-copy" data-reveal>
              <h2>Hay una forma más rápida de juzgar al agente: hablar con él.</h2>
              <p>
                Deja tu móvil y recibe una llamada de prueba. Interrúmpelo. Hazle una pregunta difícil. Escucha si
                entiende, cómo responde y cuánto tarda.
              </p>
              <p className="demo-note">
                No tienes que creernos. Esa llamada te dará una impresión mucho más útil que cualquier promesa aquí.
              </p>
              <figure className="demo-photo">
                <Image
                  src="/images/owner-on-call.png"
                  alt="Un dueño de negocio habla por teléfono mientras consulta su agenda"
                  width={1536}
                  height={1024}
                  sizes="(max-width: 900px) 100vw, 38vw"
                />
              </figure>
            </div>
            <div data-reveal><DemoCallForm /></div>
          </div>
        </section>

        <section className="faq" id="preguntas">
          <div className="wrap faq-inner">
            <h2 data-reveal>Antes de dejar tu número</h2>
            <div className="faq-list" data-reveal>
              {FAQS.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="closing">
          <div className="wrap closing-inner">
            <h2 data-reveal>La siguiente consulta va a llegar. ¿Quién responderá?</h2>
            <div className="closing-action" data-reveal>
              <a href="#demo" className="btn btn-primary">Haz la prueba en tu móvil <span aria-hidden="true">↗</span></a>
              <p className="ps">
                <strong>P. D.</strong> La prueba es una llamada. La decisión, tuya. Si no te gustaría que ese agente
                atendiera a tus clientes, no tienes que seguir.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap footer-inner">
          <Logo inverted large />
          <p>De la primera consulta al siguiente paso.</p>
          <p className="footer-legal">© {new Date().getFullYear()} Pleneva. Llamadas con aviso de IA y grabación.</p>
        </div>
      </footer>
    </>
  );
}
