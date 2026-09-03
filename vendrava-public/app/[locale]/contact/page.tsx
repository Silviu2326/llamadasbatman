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
    locale: "en",
    title: "Contact | Vendrava",
    description: "Get in touch with the Vendrava team for sales, technical or partnership questions.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "en") notFound();

  return (
    <Container size="sm" className="py-16 md:py-24">
      <Breadcrumbs locale="en" items={[{ name: "Home", path: "" }, { name: "Contact", path: "contact" }]} />
      <h1 className="mt-5 font-display text-[clamp(30px,3.6vw,44px)] font-bold leading-[1.08] tracking-tight text-white">
        Let&apos;s talk
      </h1>
      <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted">
        Reach out if you have questions about Vendrava, want a tailored proposal, or are exploring a commercial
        partnership.
      </p>
      <p className="mt-3 font-mono text-xs text-faint">
        Vendrava is a SprintMarkt project · Valencia, Spain.
      </p>
      <div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-b from-panel to-panel-2 p-7">
        <ContactForm locale="en" />
      </div>
    </Container>
  );
}
