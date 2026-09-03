import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { isLocale } from "@/types/locale";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { buildMetadata } from "@/lib/metadata";
import { pathFor } from "@/lib/routes";

const SECTIONS = [
  { routeKey: "resources.blog", title: "Blog", description: "Artículos sobre CRM con IA, agentes de voz, automatización comercial y growth marketing." },
  { routeKey: "resources.guides", title: "Guías", description: "Guías prácticas para poner en marcha flujos de IA y automatización en Vendrava." },
  { routeKey: "resources.case-studies", title: "Casos de éxito", description: "Ejemplos de cómo distintos equipos usan Vendrava para convertir más leads." },
  { routeKey: "resources.glossary", title: "Glosario", description: "Definiciones clave sobre CRM con IA, agentes de voz y automatización comercial." },
];

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "resources.index",
    locale: "es",
    title: "Recursos sobre CRM con IA y ventas | Vendrava",
    description: "Blog, guías, casos de éxito y glosario sobre CRM con IA, agentes de voz y automatización comercial.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "es") notFound();

  return (
    <Container size="lg" className="py-16 md:py-24">
      <Breadcrumbs locale="es" items={[{ name: "Inicio", path: "" }, { name: "Recursos", path: "recursos" }]} />
      <h1 className="mt-5 max-w-xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
        Recursos para vender más rápido con IA
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Contenido sobre CRM con IA, agentes de voz, automatización comercial y growth marketing.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.routeKey}
            href={pathFor(section.routeKey, "es")}
            className="rounded-2xl border border-white/10 bg-gradient-to-br from-panel to-panel-2/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-electric/35"
          >
            <div className="font-display text-lg font-semibold text-white">{section.title}</div>
            <div className="mt-2 text-sm leading-relaxed text-muted">{section.description}</div>
          </Link>
        ))}
      </div>
    </Container>
  );
}
