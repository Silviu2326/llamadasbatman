import type { Locale } from "@/types/locale";
import type { IndustryEntry, IndustryLocaleContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { FAQSection } from "@/components/marketing/FAQSection";
import { FinalCTASection } from "@/components/marketing/FinalCTASection";
import { FAQSchema } from "@/components/seo/FAQSchema";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { RelatedLinks } from "@/components/marketing/RelatedLinks";
import { Icon } from "@/components/ui/Icon";
import { iconForText, INDUSTRY_ICON } from "@/lib/icons";
import { pathFor } from "@/lib/routes";

const COPY = {
  es: {
    breadcrumbIndustries: "Sectores",
    breadcrumbHome: "Inicio",
    flow: "Flujo recomendado",
    useCases: "Casos de uso",
    automations: "Automatizaciones posibles",
    impact: "Impacto típico",
    ctaPrimary: "Solicitar demo",
    ctaSecondary: "Hablar con ventas",
  },
  en: {
    breadcrumbIndustries: "Industries",
    breadcrumbHome: "Home",
    flow: "Recommended flow",
    useCases: "Use cases",
    automations: "Possible automations",
    impact: "Typical impact",
    ctaPrimary: "Book a demo",
    ctaSecondary: "Talk to sales",
  },
};

export function IndustryPageTemplate({
  locale,
  industry,
  content,
}: {
  locale: Locale;
  industry: IndustryEntry;
  content: IndustryLocaleContent;
}) {
  const copy = COPY[locale];
  const es = locale === "es";
  const slug = es ? industry.slugEs : industry.slugEn;
  const relatedItems = [
    { label: es ? "Agentes IA de voz" : "AI voice agents", href: pathFor("product.ai-voice-agents", locale) },
    { label: es ? "Llamadas IA" : "AI calling", href: pathFor("product.ai-calling", locale) },
    { label: "WhatsApp CRM", href: pathFor("product.whatsapp-crm", locale) },
    { label: es ? "Automatización de ventas" : "Sales automation", href: pathFor("product.sales-automation", locale) },
    { label: es ? "Todos los sectores" : "All industries", href: pathFor("industries.index", locale) },
    { label: "Blog", href: pathFor("resources.blog", locale) },
  ];

  return (
    <>
      <FAQSchema items={content.faq} />
      <BreadcrumbSchema
        locale={locale}
        items={[
          { name: copy.breadcrumbIndustries, path: locale === "es" ? "sectores" : "industries" },
          { name: content.navLabel, path: slug },
        ]}
      />

      <Container size="md" className="pb-6 pt-10 text-center">
        <Breadcrumbs
          locale={locale}
          items={[
            { name: copy.breadcrumbHome, path: "" },
            { name: copy.breadcrumbIndustries, path: locale === "es" ? "sectores" : "industries" },
            { name: content.navLabel, path: slug },
          ]}
        />
        <div className="mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold">
          <Icon name={INDUSTRY_ICON[industry.id] ?? "briefcase"} className="h-7 w-7" />
        </div>
        <div className="mt-5">
          <Badge color="gold">{content.heroKicker}</Badge>
        </div>
        <h1 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
          {content.h1}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">{content.heroSub}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3.5">
          <Button href={pathFor("demo", locale)} size="lg">
            {copy.ctaPrimary}
          </Button>
          <Button href={pathFor("contact", locale)} variant="secondary" size="lg">
            {copy.ctaSecondary}
          </Button>
        </div>
      </Container>

      <Container size="lg" className="pb-4">
        <div className="relative mx-auto max-w-3xl">
          <div aria-hidden className="absolute -inset-3 rounded-[28px] bg-gradient-to-br from-electric/12 via-cyan/10 to-violet/12 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/visuals/industry-team.png"
            alt=""
            width={1600}
            height={900}
            className="relative aspect-[16/9] w-full rounded-2xl border border-white/10 object-cover shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85)]"
          />
        </div>
      </Container>

      <Container size="lg" className="py-10 md:py-16">
        <h2 className="mb-6 font-display text-2xl font-bold text-white md:text-3xl">{content.painTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {content.pains.map((pain) => (
            <div key={pain.title} className="rounded-2xl border border-white/10 bg-bg/40 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-gold/25 bg-gold/10 text-gold">
                <Icon name={iconForText(pain.title)} />
              </div>
              <div className="mb-2 text-base font-semibold text-white">{pain.title}</div>
              <div className="text-sm leading-relaxed text-muted">{pain.text}</div>
            </div>
          ))}
        </div>
      </Container>

      <Container size="lg" className="py-6 md:py-10">
        <div className="rounded-2xl border border-electric/25 bg-gradient-to-b from-electric/[0.08] to-panel-2/40 p-7">
          <h2 className="font-display text-xl font-bold text-white">{content.howTitle}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">{content.howText}</p>
        </div>
      </Container>

      <Container size="lg" className="py-10 md:py-16">
        <h2 className="mb-6 text-center font-display text-xl font-bold text-white md:text-2xl">{copy.flow}</h2>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {content.flow.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan/30 bg-cyan/[0.08] px-4 py-2 text-sm font-semibold text-cyan">
                <Icon name={iconForText(step)} className="h-4 w-4" />
                {step}
              </span>
              {i < content.flow.length - 1 && <span className="text-muted">→</span>}
            </div>
          ))}
        </div>
      </Container>

      <Container size="lg" className="py-6 md:py-10">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="mb-4 font-display text-xl font-bold text-white">{copy.useCases}</h2>
            <div className="flex flex-col gap-3">
              {content.useCases.map((useCase) => (
                <div key={useCase} className="flex items-start gap-3.5 rounded-xl border border-white/10 bg-bg/40 p-4">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-cyan/25 bg-cyan/10 text-cyan">
                    <Icon name={iconForText(useCase)} className="h-[17px] w-[17px]" />
                  </span>
                  <span className="self-center text-sm leading-relaxed text-soft">{useCase}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-4 font-display text-xl font-bold text-white">{copy.automations}</h2>
            <div className="flex flex-col gap-3">
              {content.automations.map((item) => (
                <div key={item} className="flex items-start gap-3.5 rounded-xl border border-white/10 bg-bg/40 p-4">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-violet/25 bg-violet/10 text-violet">
                    <Icon name={iconForText(item)} className="h-[17px] w-[17px]" />
                  </span>
                  <span className="self-center text-sm leading-relaxed text-soft">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>

      <Container size="md" className="py-10 md:py-16">
        <h2 className="mb-6 text-center font-display text-xl font-bold text-white md:text-2xl">{copy.impact}</h2>
        <div className="grid grid-cols-3 gap-4">
          {content.kpis.map((kpi) => (
            <StatCard key={kpi.label} value={kpi.value} label={kpi.label} />
          ))}
        </div>
      </Container>

      <RelatedLinks title={es ? "Explora más" : "Explore more"} items={relatedItems} />

      <FAQSection tag="FAQ" title={locale === "es" ? "Preguntas frecuentes" : "Frequently asked questions"} items={content.faq} />

      <FinalCTASection
        locale={locale}
        title={content.ctaTitle}
        sub={content.ctaSub}
        primary={copy.ctaPrimary}
        secondary={copy.ctaSecondary}
      />
    </>
  );
}
