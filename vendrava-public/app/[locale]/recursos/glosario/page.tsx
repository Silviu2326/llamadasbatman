import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/types/locale";
import { glossaryEs } from "@/content/locales/es/glossary";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "resources.glossary",
    locale: "es",
    title: "Glosario de CRM con IA y ventas | Vendrava",
    description: "Definiciones clave sobre CRM con IA, agentes de voz, lead scoring, pipeline y automatización comercial.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "es") notFound();

  return (
    <Container size="md" className="py-16 md:py-24">
      <Breadcrumbs
        locale="es"
        items={[{ name: "Inicio", path: "" }, { name: "Recursos", path: "recursos" }, { name: "Glosario", path: "recursos/glosario" }]}
      />
      <h1 className="mt-5 max-w-xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
        Glosario de CRM con IA
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Términos clave para entender cómo funciona un CRM con IA, agentes de voz y automatización comercial.
      </p>

      <dl className="mt-10 flex flex-col gap-5">
        {glossaryEs.map((item) => (
          <div key={item.term} className="rounded-2xl border border-white/10 bg-bg/40 p-5">
            <dt className="font-display text-base font-semibold text-white">{item.term}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted">{item.definition}</dd>
          </div>
        ))}
      </dl>
    </Container>
  );
}
