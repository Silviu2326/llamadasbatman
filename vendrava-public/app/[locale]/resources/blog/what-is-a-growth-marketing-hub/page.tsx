import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, type Locale } from "@/types/locale";
import { BLOG_POSTS } from "@/content/blog";
import { BlogPostTemplate } from "@/components/templates/BlogPostTemplate";
import { buildMetadata } from "@/lib/metadata";

const POST_ID = "what-is-growth-marketing-hub";
const ROUTE_KEY = "blog.what-is-growth-marketing-hub";
const EXPECTED_LOCALE: Locale = "en";

function getPost() {
  return BLOG_POSTS.find((p) => p.id === POST_ID) ?? null;
}

export async function generateMetadata(): Promise<Metadata> {
  const post = getPost();
  if (!post) return {};
  const c = EXPECTED_LOCALE === "es" ? post.es : post.en;
  return buildMetadata({ routeKey: ROUTE_KEY, locale: EXPECTED_LOCALE, title: c.metaTitle, description: c.metaDescription, ogType: "article" });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== EXPECTED_LOCALE) notFound();
  const post = getPost();
  if (!post) notFound();
  return <BlogPostTemplate locale={EXPECTED_LOCALE} post={post} />;
}
