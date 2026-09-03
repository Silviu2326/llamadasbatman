import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { isLocale } from "@/types/locale";
import { BLOG_POSTS, CLUSTERS, CLUSTER_LABELS } from "@/content/blog";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { iconForText, CLUSTER_ICON } from "@/lib/icons";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { buildMetadata } from "@/lib/metadata";
import { pathFor } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    routeKey: "resources.blog",
    locale: "en",
    title: "Vendrava blog: AI CRM, sales and automation",
    description:
      "Articles on AI CRM, voice agents, AI calling, sales automation, speed-to-lead and growth marketing.",
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== "en") notFound();

  return (
    <Container size="lg" className="py-16 md:py-24">
      <Breadcrumbs
        locale="en"
        items={[{ name: "Home", path: "" }, { name: "Resources", path: "resources" }, { name: "Blog", path: "resources/blog" }]}
      />
      <h1 className="mt-5 max-w-xl font-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.08] tracking-tight text-white">
        Vendrava blog
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Practical guides on AI CRM, voice agents, sales automation and how to contact, qualify and book more leads
        without losing human control.
      </p>

      <div className="mt-11 flex flex-col gap-11">
        {CLUSTERS.map((cluster) => (
          <div key={cluster}>
            <h2 className="mb-4 flex items-center gap-2.5 font-display text-xl font-bold text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan/25 bg-cyan/10 text-cyan">
                <Icon name={CLUSTER_ICON[cluster] ?? "book"} className="h-[18px] w-[18px]" />
              </span>
              {CLUSTER_LABELS[cluster]?.en ?? cluster}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {BLOG_POSTS.filter((post) => post.cluster === cluster).map((post) => (
                <Link
                  key={post.id}
                  href={pathFor(`blog.${post.id}`, "en")}
                  className="flex flex-col rounded-2xl border border-white/10 bg-bg/40 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-electric/35"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-electric/25 bg-electric/10 text-electric">
                    <Icon name={iconForText(post.en.title)} />
                  </div>
                  <div className="text-[15px] font-semibold text-white">{post.en.title}</div>
                  <div className="mt-2 flex-1 text-sm leading-relaxed text-muted">{post.en.excerpt}</div>
                  <div className="mt-3 font-mono text-[11px] text-faint">{post.en.readingTime}</div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
