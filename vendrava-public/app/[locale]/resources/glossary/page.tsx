import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "@/types/locale";
import { glossaryEn } from "@/content/locales/en/glossary";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "resources.glossary",
    locale: "en",
    title: "AI CRM and sales glossary | Vendrava",
    description: "Key definitions on AI CRM, voice agents, lead scoring, pipeline and sales automation.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "en") notFound();

  return (
    <Container size="md" className="py-16 md:py-24">
      <Breadcrumbs
        locale="en"
        items={[{ name: "Home", path: "" }, { name: "Resources", path: "resources" }, { name: "Glossary", path: "resources/glossary" }]}
      />
      <h1 className="mt-5 max-w-xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
        AI CRM glossary
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Key terms to understand how an AI CRM, voice agents and sales automation actually work.
      </p>

      <dl className="mt-10 flex flex-col gap-5">
        {glossaryEn.map((item) => (
          <div key={item.term} className="rounded-2xl border border-white/10 bg-bg/40 p-5">
            <dt className="font-display text-base font-semibold text-white">{item.term}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted">{item.definition}</dd>
          </div>
        ))}
      </dl>
    </Container>
  );
}
