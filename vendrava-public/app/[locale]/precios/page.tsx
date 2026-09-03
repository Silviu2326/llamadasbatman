import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/types/locale";
import { pricingEs } from "@/content/locales/es/pricing";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PricingSection } from "@/components/marketing/PricingSection";
import { FAQSection } from "@/components/marketing/FAQSection";
import { FinalCTASection } from "@/components/marketing/FinalCTASection";
import { buildMetadata } from "@/lib/metadata";

const FAQ = [
  {
    q: "¿Vendrava tiene precios públicos?",
    a: "Los planes de pago se adaptan al volumen de leads, llamadas y automatizaciones de cada equipo, por lo que trabajamos la propuesta hablando directamente con ventas.",
  },
  {
    q: "¿Puedo probar Vendrava antes de elegir un plan?",
    a: "Sí. Puedes solicitar una demo para explorar el CRM, los agentes IA de voz y los flujos de automatización antes de decidir un plan.",
  },
  {
    q: "¿Qué plan necesito si solo quiero empezar con lo básico?",
    a: "Starter está pensado para equipos que quieren centralizar leads, pipeline y tareas antes de activar automatización o IA de voz.",
  },
  {
    q: "¿Puedo cambiar de plan más adelante?",
    a: "Sí, los planes están pensados para escalar a medida que crece tu volumen de leads y tus necesidades de automatización.",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "pricing",
    locale: "es",
    title: "Precios de Vendrava | AI Sales CRM",
    description:
      "Planes de Vendrava adaptados al volumen de leads, llamadas y automatizaciones: Starter, Growth, Scale y Enterprise. Habla con ventas para una propuesta a medida.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "es") notFound();

  return (
    <>
      <Container size="md" className="pb-6 pt-10 text-center">
        <Breadcrumbs locale="es" items={[{ name: "Inicio", path: "" }, { name: "Precios", path: "precios" }]} />
        <h1 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
          {pricingEs.title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">{pricingEs.sub}</p>
      </Container>

      <PricingSection locale="es" plans={pricingEs.plans} />

      <Container size="md" className="pb-6 pt-4 text-center">
        <p className="text-sm text-faint">{pricingEs.note}</p>
      </Container>

      <FAQSection tag="FAQ" title="Preguntas frecuentes" items={FAQ} />

      <FinalCTASection
        locale="es"
        title="Convierte tus leads antes de que se enfríen"
        sub="Prueba Vendrava con 100.000 créditos de IA incluidos."
        primary="Solicitar una demo"
        secondary="Hablar con ventas"
      />
    </>
  );
}
