import type { Locale } from "@/types/locale";
import type { ComparisonEntry, ComparisonLocaleContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { FAQSection } from "@/components/marketing/FAQSection";
import { FinalCTASection } from "@/components/marketing/FinalCTASection";
import { FAQSchema } from "@/components/seo/FAQSchema";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { RelatedLinks } from "@/components/marketing/RelatedLinks";
import { Icon } from "@/components/ui/Icon";
import { iconForText } from "@/lib/icons";
import { COMPARISONS } from "@/content/comparisons";
import { pathFor } from "@/lib/routes";

const COPY = {
  es: {
    breadcrumbComparisons: "Comparativas",
    breadcrumbHome: "Inicio",
    feature: "Funcionalidad",
    fitLabel: "Cuándo Vendrava puede encajar mejor",
    ctaPrimary: "Solicitar demo",
    ctaSecondary: "Hablar con ventas",
  },
  en: {
    breadcrumbComparisons: "Comparisons",
    breadcrumbHome: "Home",
    feature: "Feature",
    fitLabel: "When Vendrava can be a better fit",
    ctaPrimary: "Book a demo",
    ctaSecondary: "Talk to sales",
  },
};

export function ComparisonPageTemplate({
  locale,
  comparison,
  content,
}: {
  locale: Locale;
  comparison: ComparisonEntry;
  content: ComparisonLocaleContent;
}) {
  const copy = COPY[locale];
  const slug = locale === "es" ? comparison.slugEs : comparison.slugEn;

  const relatedItems = [
    ...COMPARISONS.filter((c) => c.id !== comparison.id)
      .slice(0, 4)
      .map((c) => ({ label: (locale === "es" ? c.es : c.en).navLabel, href: pathFor(`comparison.${c.id}`, locale) })),
    { label: locale === "es" ? "CRM con IA" : "AI CRM", href: pathFor("product.ai-crm", locale) },
    { label: locale === "es" ? "Ver todas las comparativas" : "All comparisons", href: pathFor("comparisons.index", locale) },
  ];

  return (
    <>
      <FAQSchema items={content.faq} />
      <BreadcrumbSchema
        locale={locale}
        items={[
          { name: copy.breadcrumbComparisons, path: locale === "es" ? "comparativas" : "comparisons" },
          { name: content.navLabel, path: slug },
        ]}
      />

      <Container size="md" className="pb-6 pt-10 text-center">
        <Breadcrumbs
          locale={locale}
          items={[
            { name: copy.breadcrumbHome, path: "" },
            { name: copy.breadcrumbComparisons, path: locale === "es" ? "comparativas" : "comparisons" },
            { name: content.navLabel, path: slug },
          ]}
        />
        <div className="mt-5">
          <Badge>{content.heroKicker}</Badge>
        </div>
        <h1 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-[1.1] tracking-tight text-white">
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/visuals/comparison-benchmark.png"
          alt=""
          width={1600}
          height={900}
          className="aspect-[16/9] w-full rounded-2xl border border-white/10 object-cover"
        />
      </Container>

      <Container size="md" className="py-10 md:py-14">
        <div className="rounded-2xl border border-white/10 bg-bg/40 p-7 text-center">
          <h2 className="font-display text-xl font-bold text-white">{content.positioningTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted">{content.positioningText}</p>
        </div>
      </Container>

      <Container size="lg" className="py-6 md:py-10">
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                <th scope="col" className="px-5 py-4 font-mono text-xs uppercase tracking-wide text-faint">
                  {copy.feature}
                </th>
                <th scope="col" className="px-5 py-4 font-mono text-xs uppercase tracking-wide text-faint">
                  {content.competitorName}
                </th>
                <th scope="col" className="px-5 py-4 font-mono text-xs uppercase tracking-wide text-cyan">
                  Vendrava
                </th>
              </tr>
            </thead>
            <tbody>
              {content.rows.map((row) => (
                <tr key={row.feature} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-4 font-medium text-white">
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-faint">
                        <Icon name={iconForText(row.feature)} className="h-4 w-4" />
                      </span>
                      {row.feature}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-muted">{row.competitor}</td>
                  <td className="px-5 py-4 font-medium text-soft">
                    <span className="flex items-start gap-2">
                      <Icon name="check-circle" className="mt-0.5 h-4 w-4 flex-none text-cyan" />
                      {row.vendrava}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>

      <Container size="md" className="py-10 md:py-16">
        <h2 className="mb-6 text-center font-display text-xl font-bold text-white md:text-2xl">{copy.fitLabel}</h2>
        <div className="flex flex-col gap-3">
          {content.fitPoints.map((point) => (
            <div key={point} className="flex items-start gap-3.5 rounded-xl border border-electric/20 bg-electric/[0.05] p-4">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-cyan/25 bg-cyan/10 text-cyan">
                <Icon name={iconForText(point)} className="h-[17px] w-[17px]" />
              </span>
              <span className="self-center text-sm leading-relaxed text-soft">{point}</span>
            </div>
          ))}
        </div>
      </Container>

      <RelatedLinks title={locale === "es" ? "Más comparativas" : "More comparisons"} items={relatedItems} />

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
