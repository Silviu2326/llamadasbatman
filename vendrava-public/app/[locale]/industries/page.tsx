import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { isLocale } from "@/types/locale";
import { INDUSTRIES } from "@/content/industries";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { INDUSTRY_ICON } from "@/lib/icons";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { FinalCTASection } from "@/components/marketing/FinalCTASection";
import { buildMetadata } from "@/lib/metadata";
import { pathFor } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "industries.index",
    locale: "en",
    title: "AI CRM by industry | Vendrava",
    description:
      "See how Vendrava helps real estate, clinics, car dealerships, agencies, SaaS, education and professional services teams contact and convert more leads.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "en") notFound();

  return (
    <>
      <Container size="md" className="pb-6 pt-10 text-center">
        <Breadcrumbs locale="en" items={[{ name: "Home", path: "" }, { name: "Industries", path: "industries" }]} />
        <h1 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
          AI CRM built for every commercial sector
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">
          Vendrava adapts to how each industry actually works: how the lead arrives, what needs qualifying, and which
          action is worth automating first.
        </p>
      </Container>

      <Container size="xl" className="py-10 md:py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRIES.map((industry) => (
            <Link
              key={industry.id}
              href={pathFor(`industry.${industry.id}`, "en")}
              className="group rounded-2xl border border-white/10 bg-gradient-to-br from-panel to-panel-2/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-electric/35"
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-gold/25 bg-gold/10 text-gold transition-colors group-hover:bg-gold/15">
                  <Icon name={INDUSTRY_ICON[industry.id] ?? "briefcase"} className="h-5 w-5" />
                </span>
                <div className="font-display text-lg font-semibold text-white">{industry.en.navLabel}</div>
              </div>
              <div className="text-sm leading-relaxed text-muted">{industry.en.heroSub}</div>
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
