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
    locale: "en",
    title: "Vendrava comparisons | Vendrava",
    description:
      "Compare Vendrava with HubSpot, Salesforce, Pipedrive and Zoho and see when an AI voice calling and automation CRM fits your team best.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "en") notFound();

  return (
    <>
      <Container size="md" className="pb-6 pt-10 text-center">
        <Breadcrumbs locale="en" items={[{ name: "Home", path: "" }, { name: "Comparisons", path: "comparisons" }]} />
        <h1 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
          Vendrava vs. other CRMs
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">
          Vendrava is built for teams that do not just want to organize opportunities, but activate AI calls,
          follow-ups and sales automation from the same CRM.
        </p>
      </Container>

      <Container size="lg" className="py-10 md:py-16">
        <div className="grid gap-4 sm:grid-cols-2">
          {COMPARISONS.map((item) => (
            <Link
              key={item.id}
              href={pathFor(`comparison.${item.id}`, "en")}
              className="rounded-2xl border border-white/10 bg-gradient-to-br from-panel to-panel-2/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-electric/35"
            >
              <div className="font-display text-lg font-semibold text-white">{item.en.h1}</div>
              <div className="mt-2 text-sm leading-relaxed text-muted">{item.en.heroSub}</div>
            </Link>
          ))}
        </div>
      </Container>

      <FinalCTASection
        locale="en"
        title="Convert leads before they go cold"
        sub="Try Vendrava with 100,000 AI credits included."
        primary="Book a demo"
        secondary="Talk to sales"
      />
    </>
  );
}
