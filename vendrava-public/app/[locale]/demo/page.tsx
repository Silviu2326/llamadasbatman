import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, type Locale } from "@/types/locale";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { DemoRequestForm } from "@/components/forms/DemoRequestForm";
import { buildMetadata } from "@/lib/metadata";

const COPY = {
  es: {
    breadcrumb: "Demo",
    badge: "Demo gratis",
    title: "Solicita tu demo de Vendrava",
    sub: "Explora el CRM, prueba los agentes IA de voz y activa tus primeros flujos de automatización con 100.000 créditos de IA incluidos.",
    benefitsTitle: "Qué incluye tu demo",
    benefits: [
      "Sin compromiso inicial",
      "Configuración asistida disponible",
      "Ideal para validar con tu equipo",
      "Límites de uso según configuración",
    ],
    nextTitle: "Qué pasa después",
    next: [
      { n: "1", title: "Recibes acceso", text: "Te damos acceso a la demo de Vendrava con tus créditos de IA activados." },
      { n: "2", title: "Configuras tu primer flujo", text: "Conectas tus leads y activas llamadas IA, seguimiento y automatización." },
      { n: "3", title: "Ves resultados", text: "Mides respuesta, calificación y conversión desde el primer día." },
    ],
    formTitle: "Solicitar demo de Vendrava",
  },
  en: {
    breadcrumb: "Demo",
    badge: "Free demo",
    title: "Book a Vendrava demo",
    sub: "Explore the CRM, test AI voice agents and activate your first automation flows with 100,000 AI credits included.",
    benefitsTitle: "What your demo includes",
    benefits: [
      "No initial commitment",
      "Assisted setup available",
      "Ideal to validate with your team",
      "Usage limits per configuration",
    ],
    nextTitle: "What happens next",
    next: [
      { n: "1", title: "You get access", text: "We give you access to the Vendrava demo with your AI credits activated." },
      { n: "2", title: "You set up your first flow", text: "Connect your leads and activate AI calls, follow-up and automation." },
      { n: "3", title: "You see results", text: "Measure response, qualification and conversion from day one." },
    ],
    formTitle: "Book a Vendrava demo",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "en";
  const meta =
    locale === "es"
      ? {
          title: "Solicita una demo de Vendrava | AI Sales CRM",
          description: "Solicita una demo de Vendrava y prueba el CRM, los agentes IA de voz y la automatización comercial con créditos de IA incluidos.",
        }
      : {
          title: "Book a Vendrava demo | AI Sales CRM",
          description: "Book a Vendrava demo and try the CRM, AI voice agents and sales automation with AI credits included.",
        };
  return buildMetadata({ routeKey: "demo", locale, ...meta });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const copy = COPY[locale];

  return (
    <Container size="lg" className="pb-20 pt-10">
      <Breadcrumbs locale={locale} items={[{ name: locale === "es" ? "Inicio" : "Home", path: "" }, { name: copy.breadcrumb, path: "demo" }]} />

      <div className="mt-5 grid gap-11 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <Badge color="gold">✦ {copy.badge}</Badge>
          <h1 className="mt-5 font-display text-[clamp(30px,3.6vw,46px)] font-bold leading-[1.06] tracking-tight text-white">
            {copy.title}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">{copy.sub}</p>

          <div className="mt-8">
            <div className="mb-3.5 font-mono text-xs uppercase tracking-widest text-faint">{copy.benefitsTitle}</div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {copy.benefits.map((benefit) => (
                <div key={benefit} className="flex items-center gap-2 text-[13px] text-soft">
                  <span className="flex-none text-cyan">✓</span>
                  {benefit}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <div className="mb-3.5 font-mono text-xs uppercase tracking-widest text-faint">{copy.nextTitle}</div>
            <div className="flex flex-col gap-4">
              {copy.next.map((step) => (
                <div key={step.n} className="flex items-start gap-3.5">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-electric/35 bg-electric/[0.1] font-display font-bold text-cyan">
                    {step.n}
                  </span>
                  <div>
                    <div className="text-[15px] font-semibold text-white">{step.title}</div>
                    <div className="mt-0.5 text-sm leading-relaxed text-muted">{step.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="h-fit rounded-2xl border border-white/10 bg-gradient-to-b from-panel to-panel-2 p-7 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.8)] lg:sticky lg:top-24">
          <h2 className="mb-5 font-display text-xl font-bold text-white">{copy.formTitle}</h2>
          <DemoRequestForm locale={locale} />
        </div>
      </div>
    </Container>
  );
}
