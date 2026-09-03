import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { isLocale } from "@/types/locale";
import { BLOG_POSTS } from "@/content/blog";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { iconForText } from "@/lib/icons";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { buildMetadata } from "@/lib/metadata";
import { pathFor } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "resources.guides",
    locale: "es",
    title: "Guías de Vendrava: IA de voz, seguimiento y WhatsApp",
    description: "Guías prácticas paso a paso: poner en marcha un agente de voz IA, automatizar el seguimiento, plantillas de WhatsApp y cumplimiento en llamadas.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "es") notFound();

  const guides = BLOG_POSTS.filter((post) => post.cluster === "guides");

  return (
    <Container size="lg" className="py-16 md:py-24">
      <Breadcrumbs
        locale="es"
        items={[{ name: "Inicio", path: "" }, { name: "Recursos", path: "recursos" }, { name: "Guías", path: "recursos/guias" }]}
      />
      <h1 className="mt-5 max-w-xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
        Guías prácticas de Vendrava
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Guías paso a paso para poner en marcha IA de voz, automatizar el seguimiento, usar WhatsApp con criterio y
        mantener el cumplimiento en llamadas automatizadas.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((post) => (
          <Link
            key={post.id}
            href={pathFor(`blog.${post.id}`, "es")}
            className="flex flex-col rounded-2xl border border-white/10 bg-gradient-to-br from-panel to-panel-2/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-electric/35"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-violet/25 bg-violet/10 text-violet">
              <Icon name={iconForText(post.es.title)} />
            </div>
            <div className="font-display text-base font-semibold text-white">{post.es.title}</div>
            <div className="mt-2 flex-1 text-sm leading-relaxed text-muted">{post.es.excerpt}</div>
            <div className="mt-3 font-mono text-[11px] text-faint">{post.es.readingTime}</div>
          </Link>
        ))}
      </div>
    </Container>
  );
}
