import Link from "next/link";
import type { Locale } from "@/types/locale";
import type { ProductEntry, ProductLocaleContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FeatureCard } from "@/components/ui/FeatureCard";
import { Icon } from "@/components/ui/Icon";
import { iconForText, PRODUCT_ICON } from "@/lib/icons";
import { photoSrc } from "@/lib/photos";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { FAQSection } from "@/components/marketing/FAQSection";
import { FinalCTASection } from "@/components/marketing/FinalCTASection";
import { FAQSchema } from "@/components/seo/FAQSchema";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { PRODUCTS } from "@/content/products";
import { pathFor } from "@/lib/routes";

const COPY = {
  es: {
    breadcrumbProduct: "Producto",
    benefits: "Beneficios",
    features: "Funcionalidades",
    useCases: "Casos de uso",
    related: "Módulos relacionados",
    ctaPrimary: "Solicitar demo",
    ctaSecondary: "Hablar con ventas",
    screenshotCaption: "Interfaz real de Vendrava",
  },
  en: {
    breadcrumbProduct: "Product",
    benefits: "Benefits",
    features: "Features",
    useCases: "Use cases",
    related: "Related modules",
    ctaPrimary: "Book a demo",
    ctaSecondary: "Talk to sales",
    screenshotCaption: "Real Vendrava interface",
  },
};

// Real product screenshots (rebranded frames from the CRM). Highest priority:
// a product listed here shows its real UI instead of photo/banner.
const PRODUCT_SCREEN: Record<string, string> = {
  "ai-calling": "/screens/call-intelligence.webp",
  "ai-voice-agents": "/screens/agents.webp",
  "prospect-finder": "/screens/prospect-finder.webp",
  "landing-pages": "/screens/funnels.webp",
  "ai-crm": "/screens/leads.webp",
  "lead-management": "/screens/leads.webp",
};

// The 3 product photos are thematic (not one per product). Map each product to the
// photo that fits; products not listed keep the branded banner.
const PRODUCT_PHOTO_THEME: Record<string, string> = {
  "ai-voice-agents": "voice",
  "ai-calling": "voice",
  "sales-analytics": "analytics",
  "ai-crm": "analytics",
  "sales-automation": "automation",
};

const PRODUCT_VISUALS: Record<string, string> = {
  "sales-automation": "/visuals/campaign-studio-v2.png",
  "growth-marketing-crm": "/visuals/revenue-flow.png",
  "lead-management": "/visuals/human-supervision.png",
  "ai-crm": "/visuals/hero-revenue-orchestration.png",
  "sales-proposals": "/visuals/funnel-builder.png",
  "sales-analytics": "/visuals/revenue-analytics.png",
  "prospect-finder": "/visuals/prospect-map.png",
};

export function ProductPageTemplate({
  locale,
  product,
  content,
}: {
  locale: Locale;
  product: ProductEntry;
  content: ProductLocaleContent;
}) {
  const copy = COPY[locale];
  const slug = locale === "es" ? product.slugEs : product.slugEn;
  const related = PRODUCTS.filter((p) => content.relatedModules.includes(p.id));
  const photoTheme = PRODUCT_PHOTO_THEME[product.id];
  const photo = photoTheme ? photoSrc("products", photoTheme) : null;
  const screen = PRODUCT_SCREEN[product.id];
  const visual = PRODUCT_VISUALS[product.id];

  return (
    <>
      <FAQSchema items={content.faq} />
      <BreadcrumbSchema
        locale={locale}
        items={[
          { name: copy.breadcrumbProduct, path: "" },
          { name: content.navLabel, path: slug },
        ]}
      />

      <Container size="md" className="pb-6 pt-10 text-center">
        <Breadcrumbs
          locale={locale}
          items={[
            { name: locale === "es" ? "Inicio" : "Home", path: "" },
            { name: content.navLabel, path: slug },
          ]}
        />
        <div className="mt-5">
          <Badge>{content.heroKicker}</Badge>
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
        {screen ? (
          <figure className="relative">
            <div aria-hidden className="absolute -inset-3 rounded-[28px] bg-gradient-to-br from-electric/12 via-cyan/10 to-violet/12 blur-2xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screen}
              alt={copy.screenshotCaption}
              width={1440}
              height={768}
              className="relative aspect-[1440/768] w-full rounded-2xl border border-white/15 object-cover shadow-[0_36px_90px_-34px_rgba(0,0,0,0.85)]"
            />
            <figcaption className="mt-3 text-center font-mono text-[11px] uppercase tracking-widest text-faint">
              {copy.screenshotCaption}
            </figcaption>
          </figure>
        ) : visual ? (
          <div className="relative mx-auto max-w-3xl">
            <div aria-hidden className="absolute -inset-3 rounded-[28px] bg-gradient-to-br from-electric/12 via-cyan/10 to-violet/12 blur-2xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={visual}
              alt=""
              width={1536}
              height={1024}
              className="relative aspect-[3/2] w-full rounded-2xl border border-white/10 object-cover object-center shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85)]"
            />
          </div>
        ) : photo ? (
          <div className="relative mx-auto max-w-3xl">
            <div aria-hidden className="absolute -inset-3 rounded-[28px] bg-gradient-to-br from-electric/12 via-cyan/10 to-violet/12 blur-2xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt=""
              width={1400}
              height={933}
              className="relative aspect-[3/2] w-full rounded-2xl border border-white/10 object-cover shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85)]"
            />
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/products/cover-${product.id}-${locale}.png`}
            alt=""
            width={1200}
            height={420}
            className="aspect-[1200/420] w-full rounded-2xl border border-white/10 object-cover"
          />
        )}
      </Container>

      <Container size="lg" className="py-14 md:py-20">
        <div className="grid gap-10 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-panel to-panel-2/40 p-7">
            <h2 className="font-display text-xl font-bold text-white">{content.problemTitle}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{content.problemText}</p>
          </div>
          <div className="rounded-2xl border border-electric/25 bg-gradient-to-b from-electric/[0.08] to-panel-2/40 p-7">
            <h2 className="font-display text-xl font-bold text-white">{content.solutionTitle}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{content.solutionText}</p>
          </div>
        </div>
      </Container>

      <Container size="xl" className="py-6 md:py-10">
        <h2 className="mb-7 text-center font-display text-2xl font-bold text-white md:text-3xl">{copy.benefits}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {content.benefits.map((benefit) => (
            <FeatureCard
              key={benefit.title}
              icon={<Icon name={iconForText(benefit.title)} />}
              accent="cyan"
              title={benefit.title}
              text={benefit.text}
            />
          ))}
        </div>
      </Container>

      <Container size="xl" className="py-14 md:py-20">
        <h2 className="mb-7 text-center font-display text-2xl font-bold text-white md:text-3xl">{copy.features}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {content.features.map((feature) => (
            <FeatureCard
              key={feature.title}
              icon={<Icon name={iconForText(feature.title)} />}
              accent="electric"
              title={feature.title}
              text={feature.text}
            />
          ))}
        </div>
      </Container>

      <Container size="md" className="py-6 md:py-10">
        <h2 className="mb-6 text-center font-display text-2xl font-bold text-white md:text-3xl">{copy.useCases}</h2>
        <div className="flex flex-col gap-3">
          {content.useCases.map((useCase) => (
            <div key={useCase} className="flex items-start gap-3.5 rounded-xl border border-white/10 bg-bg/40 p-4">
              <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-cyan/25 bg-cyan/10 text-cyan">
                <Icon name={iconForText(useCase)} className="h-[17px] w-[17px]" />
              </span>
              <span className="self-center text-sm leading-relaxed text-soft">{useCase}</span>
            </div>
          ))}
        </div>
      </Container>

      {related.length > 0 && (
        <Container size="xl" className="py-14 md:py-20">
          <h2 className="mb-7 text-center font-display text-2xl font-bold text-white md:text-3xl">{copy.related}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => {
              const itemContent = locale === "es" ? item.es : item.en;
              return (
                <Link
                  key={item.id}
                  href={pathFor(`product.${item.id}`, locale)}
                  className="group rounded-2xl border border-white/10 bg-gradient-to-b from-panel to-panel-2/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-electric/35"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-electric/30 bg-electric/10 text-electric transition-colors group-hover:bg-electric/15">
                      <Icon name={PRODUCT_ICON[item.id] ?? "sparkles"} />
                    </span>
                    <div className="font-display text-base font-semibold text-white">{itemContent.navLabel}</div>
                  </div>
                  <div className="text-sm leading-relaxed text-muted">{itemContent.heroSub}</div>
                </Link>
              );
            })}
          </div>
        </Container>
      )}

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
