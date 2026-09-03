import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/types/locale";
import { caseStudiesEn } from "@/content/locales/en/resources";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "resources.case-studies",
    locale: "en",
    title: "Vendrava case studies | AI Sales CRM",
    description: "Examples of how different teams use Vendrava to contact, qualify and convert more leads.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "en") notFound();

  return (
    <Container size="lg" className="py-16 md:py-24">
      <Breadcrumbs
        locale="en"
        items={[{ name: "Home", path: "" }, { name: "Resources", path: "resources" }, { name: "Case studies", path: "resources/case-studies" }]}
      />
      <h1 className="mt-5 max-w-xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
        Case studies
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        We are documenting how different teams use Vendrava in their day-to-day sales work. These case studies will be
        published progressively.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {caseStudiesEn.map((item) => (
          <div key={item.title} className="rounded-2xl border border-white/10 bg-gradient-to-br from-panel to-panel-2/40 p-6">
            <div className="font-display text-base font-semibold text-white">{item.title}</div>
            <div className="mt-2 text-sm leading-relaxed text-muted">{item.description}</div>
          </div>
        ))}
      </div>
    </Container>
  );
}
