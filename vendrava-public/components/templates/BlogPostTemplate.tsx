import Link from "next/link";
import type { Locale } from "@/types/locale";
import type { BlogPost } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { FAQSection } from "@/components/marketing/FAQSection";
import { FinalCTASection } from "@/components/marketing/FinalCTASection";
import { StructuredData } from "@/components/seo/StructuredData";
import { articleSchema, faqPageSchema, breadcrumbListSchema } from "@/lib/structured-data";
import { pathFor } from "@/lib/routes";
import { BLOG_POSTS, CLUSTER_LABELS } from "@/content/blog";
import { RelatedLinks } from "@/components/marketing/RelatedLinks";

const MONTHS: Record<Locale, string[]> = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

function formatDate(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const month = MONTHS[locale][(m ?? 1) - 1];
  return locale === "es" ? `${d} de ${month} de ${y}` : `${month} ${d}, ${y}`;
}

export function BlogPostTemplate({ locale, post }: { locale: Locale; post: BlogPost }) {
  const isEs = locale === "es";
  const c = isEs ? post.es : post.en;
  const slug = isEs ? post.slugEs : post.slugEn;

  const related = BLOG_POSTS.filter((p) => p.cluster === post.cluster && p.id !== post.id)
    .slice(0, 3)
    .map((p) => {
      const pc = isEs ? p.es : p.en;
      return { label: pc.title, sub: pc.excerpt, href: pathFor(`blog.${p.id}`, locale) };
    });

  const crumbs = [
    { name: isEs ? "Inicio" : "Home", path: "" },
    { name: isEs ? "Recursos" : "Resources", path: isEs ? "recursos" : "resources" },
    { name: "Blog", path: isEs ? "recursos/blog" : "resources/blog" },
    { name: c.title, path: slug },
  ];

  return (
    <>
      <StructuredData
        data={[
          articleSchema({ locale, headline: c.title, description: c.metaDescription, path: slug, datePublished: post.date }),
          faqPageSchema(c.faq),
          breadcrumbListSchema(locale, crumbs),
        ]}
      />

      <Container size="md" className="py-12 md:py-16">
        <Breadcrumbs locale={locale} items={crumbs.slice(0, 3)} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/visuals/editorial-insights.png"
          alt=""
          width={1600}
          height={900}
          className="mt-5 aspect-[16/9] w-full rounded-2xl border border-white/10 object-cover"
        />
        <div className="mt-6">
          <Badge>{CLUSTER_LABELS[post.cluster]?.[locale] ?? post.cluster}</Badge>
        </div>
        <h1 className="mt-4 font-display text-[clamp(28px,3.6vw,44px)] font-bold leading-[1.1] tracking-tight text-white">
          {c.title}
        </h1>
        <div className="mt-4 flex items-center gap-3 font-mono text-[12px] text-faint">
          <span>{formatDate(post.date, locale)}</span>
          <span>·</span>
          <span>{c.readingTime}</span>
        </div>
        <p className="mt-5 text-lg leading-relaxed text-soft">{c.excerpt}</p>

        {c.keyTakeaways.length > 0 && (
          <div className="mt-8 rounded-2xl border border-cyan/25 bg-cyan/[0.05] p-5">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-widest text-cyan">
              {isEs ? "Puntos clave" : "Key takeaways"}
            </div>
            <ul className="flex flex-col gap-2">
              {c.keyTakeaways.map((takeaway) => (
                <li key={takeaway} className="flex items-start gap-2 text-[14px] leading-relaxed text-soft">
                  <span className="mt-0.5 flex-none text-cyan">→</span>
                  {takeaway}
                </li>
              ))}
            </ul>
          </div>
        )}

        <article className="mt-10 flex flex-col gap-9">
          {c.sections.map((section) => (
            <section key={section.h}>
              <h2 className="mb-3 font-display text-[22px] font-bold leading-snug text-white">{section.h}</h2>
              <div className="flex flex-col gap-3.5">
                {section.body.map((paragraph, index) => (
                  <p key={index} className="text-[15.5px] leading-[1.75] text-muted">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </article>

        <div className="mt-12 border-t border-white/10 pt-6">
          <Link href={pathFor("resources.blog", locale)} className="font-mono text-[13px] text-cyan transition-colors hover:text-white">
            ← {isEs ? "Volver al blog" : "Back to the blog"}
          </Link>
        </div>
      </Container>

      <RelatedLinks title={isEs ? "Artículos relacionados" : "Related articles"} items={related} />

      {c.faq.length > 0 && (
        <FAQSection tag="FAQ" title={isEs ? "Preguntas frecuentes" : "Frequently asked questions"} items={c.faq} />
      )}

      <FinalCTASection
        locale={locale}
        title={isEs ? "Que ninguna oportunidad se pierda por no responder a tiempo" : "Don't let an opportunity slip away because nobody replied in time"}
        sub={isEs ? "Prueba Vendrava con 100.000 créditos de IA incluidos." : "Try Vendrava with 100,000 AI credits included."}
        primary={isEs ? "Solicitar una demo" : "Book a demo"}
        secondary={isEs ? "Hablar con ventas" : "Talk to sales"}
      />
    </>
  );
}
