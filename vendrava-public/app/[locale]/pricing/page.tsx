import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/types/locale";
import { pricingEn } from "@/content/locales/en/pricing";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PricingSection } from "@/components/marketing/PricingSection";
import { FAQSection } from "@/components/marketing/FAQSection";
import { FinalCTASection } from "@/components/marketing/FinalCTASection";
import { buildMetadata } from "@/lib/metadata";

const FAQ = [
  {
    q: "Does Vendrava have public pricing?",
    a: "Paid plans adapt to each team's lead volume, calls and automations, so we work out the proposal by talking directly with sales.",
  },
  {
    q: "Can I try Vendrava before choosing a plan?",
    a: "Yes. You can book a demo to explore the CRM, AI voice agents and automation workflows before deciding on a plan.",
  },
  {
    q: "Which plan do I need if I just want to start with the basics?",
    a: "Starter is designed for teams that want to centralize leads, pipeline and tasks before activating automation or AI voice.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes, plans are designed to scale as your lead volume and automation needs grow.",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "pricing",
    locale: "en",
    title: "Vendrava pricing | AI Sales CRM",
    description:
      "Vendrava plans adapted to your lead volume, calls and automations: Starter, Growth, Scale and Enterprise. Talk to sales for a tailored proposal.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "en") notFound();

  return (
    <>
      <Container size="md" className="pb-6 pt-10 text-center">
        <Breadcrumbs locale="en" items={[{ name: "Home", path: "" }, { name: "Pricing", path: "pricing" }]} />
        <h1 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
          {pricingEn.title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">{pricingEn.sub}</p>
      </Container>

      <PricingSection locale="en" plans={pricingEn.plans} />

      <Container size="md" className="pb-6 pt-4 text-center">
        <p className="text-sm text-faint">{pricingEn.note}</p>
      </Container>

      <FAQSection tag="FAQ" title="Frequently asked questions" items={FAQ} />

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
