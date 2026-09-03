import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/types/locale";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ContactForm } from "@/components/forms/ContactForm";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "contact",
    locale: "es",
    title: "Contacto | Vendrava",
    description: "Ponte en contacto con el equipo de Vendrava para resolver dudas comerciales, técnicas o de partnership.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "es") notFound();

  return (
    <Container size="sm" className="py-16 md:py-24">
      <Breadcrumbs locale="es" items={[{ name: "Inicio", path: "" }, { name: "Contacto", path: "contacto" }]} />
      <h1 className="mt-5 font-display text-[clamp(30px,3.6vw,44px)] font-bold leading-[1.08] tracking-tight text-white">
        Hablemos
      </h1>
      <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted">
        Escríbenos si tienes dudas sobre Vendrava, quieres una propuesta a medida o buscas explorar una alianza
        comercial.
      </p>
      <p className="mt-3 font-mono text-xs text-faint">
        Vendrava es un proyecto de SprintMarkt · Valencia, España.
      </p>
      <div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-b from-panel to-panel-2 p-7">
        <ContactForm locale="es" />
      </div>
    </Container>
  );
}
