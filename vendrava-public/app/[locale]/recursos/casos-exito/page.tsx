import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/types/locale";
import { caseStudiesEs } from "@/content/locales/es/resources";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "resources.case-studies",
    locale: "es",
    title: "Casos de éxito de Vendrava | AI Sales CRM",
    description: "Ejemplos de cómo distintos equipos usan Vendrava para contactar, calificar y convertir más leads.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "es") notFound();

  return (
    <Container size="lg" className="py-16 md:py-24">
      <Breadcrumbs
        locale="es"
        items={[{ name: "Inicio", path: "" }, { name: "Recursos", path: "recursos" }, { name: "Casos de éxito", path: "recursos/casos-exito" }]}
      />
      <h1 className="mt-5 max-w-xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
        Casos de éxito
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Estamos documentando cómo distintos equipos usan Vendrava en su día a día comercial. Estos casos se irán
        publicando progresivamente.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {caseStudiesEs.map((item) => (
          <div key={item.title} className="rounded-2xl border border-white/10 bg-gradient-to-br from-panel to-panel-2/40 p-6">
            <div className="font-display text-base font-semibold text-white">{item.title}</div>
            <div className="mt-2 text-sm leading-relaxed text-muted">{item.description}</div>
          </div>
        ))}
      </div>
    </Container>
  );
}
