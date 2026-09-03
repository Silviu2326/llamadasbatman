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
    locale: "en",
    title: "Vendrava guides: AI voice, follow-up and WhatsApp",
    description: "Practical step-by-step guides: launch an AI voice agent, automate follow-up, WhatsApp templates and compliance for automated calls.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "en") notFound();

  const guides = BLOG_POSTS.filter((post) => post.cluster === "guides");

  return (
    <Container size="lg" className="py-16 md:py-24">
      <Breadcrumbs
        locale="en"
        items={[{ name: "Home", path: "" }, { name: "Resources", path: "resources" }, { name: "Guides", path: "resources/guides" }]}
      />
      <h1 className="mt-5 max-w-xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
        Vendrava practical guides
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Step-by-step guides to launch AI voice, automate follow-up, use WhatsApp the right way and keep automated calls
        compliant.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((post) => (
          <Link
            key={post.id}
            href={pathFor(`blog.${post.id}`, "en")}
            className="flex flex-col rounded-2xl border border-white/10 bg-gradient-to-br from-panel to-panel-2/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-electric/35"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-violet/25 bg-violet/10 text-violet">
              <Icon name={iconForText(post.en.title)} />
            </div>
            <div className="font-display text-base font-semibold text-white">{post.en.title}</div>
            <div className="mt-2 flex-1 text-sm leading-relaxed text-muted">{post.en.excerpt}</div>
            <div className="mt-3 font-mono text-[11px] text-faint">{post.en.readingTime}</div>
          </Link>
        ))}
      </div>
    </Container>
  );
}
