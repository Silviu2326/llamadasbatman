import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { isLocale } from "@/types/locale";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { buildMetadata } from "@/lib/metadata";
import { pathFor } from "@/lib/routes";

const SECTIONS = [
  { routeKey: "resources.blog", title: "Blog", description: "Articles on AI CRM, voice agents, sales automation and growth marketing." },
  { routeKey: "resources.guides", title: "Guides", description: "Practical guides to launching AI and automation flows in Vendrava." },
  { routeKey: "resources.case-studies", title: "Case studies", description: "Examples of how different teams use Vendrava to convert more leads." },
  { routeKey: "resources.glossary", title: "Glossary", description: "Key definitions on AI CRM, voice agents and sales automation." },
];

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "resources.index",
    locale: "en",
    title: "Resources on AI CRM and sales | Vendrava",
    description: "Blog, guides, case studies and glossary on AI CRM, voice agents and sales automation.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "en") notFound();

  return (
    <Container size="lg" className="py-16 md:py-24">
      <Breadcrumbs locale="en" items={[{ name: "Home", path: "" }, { name: "Resources", path: "resources" }]} />
      <h1 className="mt-5 max-w-xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
        Resources to sell faster with AI
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Content on AI CRM, voice agents, sales automation and growth marketing.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.routeKey}
            href={pathFor(section.routeKey, "en")}
            className="rounded-2xl border border-white/10 bg-gradient-to-br from-panel to-panel-2/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-electric/35"
          >
            <div className="font-display text-lg font-semibold text-white">{section.title}</div>
            <div className="mt-2 text-sm leading-relaxed text-muted">{section.description}</div>
          </Link>
        ))}
      </div>
    </Container>
  );
}
