import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/types/locale";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { FAQSection } from "@/components/marketing/FAQSection";
import { FinalCTASection } from "@/components/marketing/FinalCTASection";
import { buildMetadata } from "@/lib/metadata";

const ITEMS = [
  { icon: "◎", title: "Aviso de IA en la llamada", text: "El agente puede identificarse como asistente de IA al inicio de la conversación, según la normativa de cada mercado, incluido el Reglamento de IA de la UE." },
  { icon: "✓", title: "Consentimiento y horarios", text: "Configura el consentimiento, los horarios permitidos y las exclusiones por mercado antes de contactar a un lead." },
  { icon: "⇄", title: "Control humano", text: "La IA propone y acelera; tu equipo aprueba, edita o toma la conversación en cualquier momento." },
  { icon: "▤", title: "Trazabilidad", text: "Cada llamada, resumen y acción de la IA puede quedar registrada y conectada al lead correspondiente." },
  { icon: "⬢", title: "Permisos por usuario", text: "Define qué puede ver y hacer cada miembro del equipo según su rol dentro de la organización." },
  { icon: "◉", title: "Gestión de datos (RGPD)", text: "Los datos comerciales se gestionan dentro de una arquitectura orientada al control y la trazabilidad, pensada para el RGPD." },
  { icon: "⬡", title: "Configuración por equipo", text: "Cada equipo ajusta permisos, flujos y niveles de automatización según sus políticas internas." },
  { icon: "◇", title: "Seguridad en integraciones", text: "Las conexiones con canales como email y WhatsApp se plantean dentro de buenas prácticas de seguridad B2B." },
];

const FAQ = [
  {
    q: "¿El cliente sabe que está hablando con una IA?",
    a: "Sí. El agente de Vendrava puede indicar al inicio de la conversación que se trata de un asistente de IA, en línea con los requisitos de transparencia de cada mercado, como el Reglamento de IA de la UE.",
  },
  {
    q: "¿Quién controla lo que hace la IA?",
    a: "Tu equipo. La IA está diseñada para proponer acciones y acelerar procesos comerciales, pero el control humano sigue siendo parte central del sistema: tu equipo aprueba, edita o toma la conversación cuando lo necesita.",
  },
  {
    q: "¿Vendrava cumple con el RGPD?",
    a: "Vendrava está diseñado con una arquitectura orientada al control, la trazabilidad y la gestión responsable de datos comerciales. Cada organización debe revisar los requisitos legales específicos de su mercado con su equipo legal.",
  },
  {
    q: "¿Vendrava graba las llamadas?",
    a: "Las llamadas y conversaciones gestionadas por Vendrava pueden registrarse y conectarse al CRM para mantener trazabilidad, según la configuración y la normativa aplicable a cada equipo.",
  },
  {
    q: "¿Puedo configurar permisos distintos por equipo?",
    a: "Sí, los permisos y niveles de acceso se pueden definir por rol y por equipo dentro de la organización.",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "security",
    locale: "es",
    title: "Seguridad, cumplimiento y control humano | Vendrava",
    description:
      "Vendrava contacta con transparencia: aviso de IA en la llamada, consentimiento, control humano y trazabilidad conectada al CRM, con un enfoque orientado al RGPD.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "es") notFound();

  return (
    <>
      <Container size="md" className="pb-6 pt-10 text-center">
        <Breadcrumbs locale="es" items={[{ name: "Inicio", path: "" }, { name: "Seguridad", path: "seguridad" }]} />
        <div className="mt-5">
          <Badge>Seguridad y cumplimiento</Badge>
        </div>
        <h1 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
          IA comercial con transparencia, consentimiento y control humano
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">
          Vendrava está diseñado para que la IA contacte y atienda con transparencia: aviso de que se habla con una IA,
          consentimiento, control humano y trazabilidad conectada al CRM.
        </p>
      </Container>

      <Container size="xl" className="py-10 md:py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/10 bg-gradient-to-b from-panel to-panel-2/40 p-5">
              <span className="text-xl text-cyan">{item.icon}</span>
              <div className="mb-1.5 mt-3 text-base font-semibold text-white">{item.title}</div>
              <div className="text-[13px] leading-relaxed text-muted">{item.text}</div>
            </div>
          ))}
        </div>
      </Container>

      <Container size="md" className="pb-10">
        <div className="rounded-2xl border border-gold/25 bg-gold/[0.05] p-6 text-sm leading-relaxed text-soft">
          Las llamadas automatizadas deben configurarse respetando la normativa aplicable, el consentimiento, los
          horarios permitidos, los requisitos de transparencia (como el aviso de IA del Reglamento de IA de la UE) y las
          políticas de privacidad de cada mercado.
        </div>
      </Container>

      <FAQSection tag="FAQ" title="Preguntas frecuentes" items={FAQ} />

      <FinalCTASection
        locale="es"
        title="Que ninguna oportunidad se pierda por no responder a tiempo"
        sub="Prueba Vendrava con 100.000 créditos de IA incluidos."
        primary="Solicitar una demo"
        secondary="Hablar con ventas"
      />
    </>
  );
}
