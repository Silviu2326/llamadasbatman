import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { isLocale } from "@/types/locale";
import { COMPARISONS } from "@/content/comparisons";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { FinalCTASection } from "@/components/marketing/FinalCTASection";
import { buildMetadata } from "@/lib/metadata";
import { pathFor } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "comparisons.index",
    locale: "es",
    title: "Comparativas de Vendrava | Vendrava",
    description:
      "Compara Vendrava con HubSpot, Salesforce, Pipedrive y Zoho y descubre cuándo un CRM con IA de voz y automatización encaja mejor con tu equipo.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "es") notFound();

  return (
    <>
      <Container size="md" className="pb-6 pt-10 text-center">
        <Breadcrumbs locale="es" items={[{ name: "Inicio", path: "" }, { name: "Comparativas", path: "comparativas" }]} />
        <h1 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
          Vendrava frente a otros CRM
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">
          Vendrava está pensado para equipos que no solo quieren organizar oportunidades, sino activar llamadas IA,
          seguimientos y automatizaciones comerciales desde el mismo CRM.
        </p>
      </Container>

      <Container size="lg" className="py-10 md:py-16">
        <div className="grid gap-4 sm:grid-cols-2">
          {COMPARISONS.map((item) => (
            <Link
              key={item.id}
              href={pathFor(`comparison.${item.id}`, "es")}
              className="rounded-2xl border border-white/10 bg-gradient-to-br from-panel to-panel-2/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-electric/35"
            >
              <div className="font-display text-lg font-semibold text-white">{item.es.h1}</div>
              <div className="mt-2 text-sm leading-relaxed text-muted">{item.es.heroSub}</div>
            </Link>
          ))}
        </div>
      </Container>

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
