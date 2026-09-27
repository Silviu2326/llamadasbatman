import type { Metadata } from "next";
import { isLocale, type Locale } from "@/types/locale";
import { buildMetadata } from "@/lib/metadata";
import { homeEs } from "@/content/locales/es/home";
import { homeEn } from "@/content/locales/en/home";
import { commonEs } from "@/content/locales/es/common";
import { commonEn } from "@/content/locales/en/common";
import { FAQSchema } from "@/components/seo/FAQSchema";
import { HeroSection } from "@/components/marketing/HeroSection";
import { ProblemSection } from "@/components/marketing/ProblemSection";
import { DifferentiatorSection } from "@/components/marketing/DifferentiatorSection";
import { ComoFuncionaSection } from "@/components/marketing/ComoFuncionaSection";
import { VoiceAgentsSection } from "@/components/marketing/VoiceAgentsSection";
import { AdvisorSection } from "@/components/marketing/AdvisorSection";
import { NichePlaygroundSection } from "@/components/marketing/NichePlaygroundSection";
import { InboundOutboundSection } from "@/components/marketing/InboundOutboundSection";
import { AfterHoursSection } from "@/components/marketing/AfterHoursSection";
import { SolutionSection } from "@/components/marketing/SolutionSection";
import { IndustriesSection } from "@/components/marketing/IndustriesSection";
import { DemoCreditsSection } from "@/components/marketing/DemoCreditsSection";
import { CapabilitiesSection } from "@/components/marketing/CapabilitiesSection";
import { SecuritySection } from "@/components/marketing/SecuritySection";
import { FAQSection } from "@/components/marketing/FAQSection";
import { FinalCTASection } from "@/components/marketing/FinalCTASection";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";

  const meta =
    locale === "es"
      ? {
          title: "Pleneva | Te traemos clientes. Tú los atiendes.",
          description:
            "Encuentra clientes, contacta oportunidades y da seguimiento desde Pleneva, una plataforma de crecimiento conectada a tu CRM.",
        }
      : {
          title: "Pleneva | We bring you customers",
          description:
            "Find customers, reach opportunities and follow up with Pleneva, a growth platform connected to your CRM.",
        };

  return buildMetadata({ routeKey: "home", locale, ...meta });
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const home = locale === "es" ? homeEs : homeEn;
  const common = locale === "es" ? commonEs : commonEn;

  return (
    <>
      <FAQSchema items={home.faq.items} />

      <HeroSection locale={locale} hero={home.hero} ctaPrimary={common.cta.primary} />
      <ProblemSection problem={home.problem} />
      <DifferentiatorSection differentiator={home.differentiator} />
      <ComoFuncionaSection comoFunciona={home.comoFunciona} locale={locale} />
      <VoiceAgentsSection voice={home.voiceAgents} />
      <AdvisorSection advisor={home.advisor} />
      <NichePlaygroundSection playground={home.nichePlayground} />
      <InboundOutboundSection inout={home.inboundOutbound} />
      <AfterHoursSection afterHours={home.afterHours} />
      <SolutionSection solution={home.solution} />
      <IndustriesSection locale={locale} industries={home.industries} />
      <DemoCreditsSection locale={locale} demo={home.demo} />
      <CapabilitiesSection capabilities={home.capabilities} />
      <SecuritySection security={home.security} />
      <FAQSection tag={home.faq.tag} title={home.faq.title} items={home.faq.items} />
      <FinalCTASection
        locale={locale}
        title={home.finalCta.title}
        sub={home.finalCta.sub}
        primary={home.finalCta.primary}
        secondary={home.finalCta.secondary}
        microcopy={home.hero.micro}
      />
    </>
  );
}
