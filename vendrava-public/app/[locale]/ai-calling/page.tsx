import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, type Locale } from "@/types/locale";
import { PRODUCTS } from "@/content/products";
import { ProductPageTemplate } from "@/components/templates/ProductPageTemplate";
import { buildMetadata } from "@/lib/metadata";

const PRODUCT_ID = "ai-calling";
const ROUTE_KEY = "product.ai-calling";

function getData(locale: Locale) {
  const product = PRODUCTS.find((p) => p.id === PRODUCT_ID);
  if (!product) return null;
  return { product, content: locale === "es" ? product.es : product.en };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "en";
  const data = getData(locale);
  if (!data) return {};
  return buildMetadata({
    routeKey: ROUTE_KEY,
    locale,
    title: data.content.metaTitle,
    description: data.content.metaDescription,
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  if (locale !== "en") notFound();
  const data = getData(locale);
  if (!data) notFound();
  return <ProductPageTemplate locale={locale} product={data.product} content={data.content} />;
}
