import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, type Locale } from "@/types/locale";
import { COMPARISONS } from "@/content/comparisons";
import { ComparisonPageTemplate } from "@/components/templates/ComparisonPageTemplate";
import { buildMetadata } from "@/lib/metadata";

const COMPARISON_ID = "salesforce";
const ROUTE_KEY = "comparison.salesforce";
const EXPECTED_LOCALE: Locale = "en";

function getData() {
  const comparison = COMPARISONS.find((c) => c.id === COMPARISON_ID);
  if (!comparison) return null;
  return { comparison, content: EXPECTED_LOCALE === "es" ? comparison.es : comparison.en };
}

export async function generateMetadata(): Promise<Metadata> {
  const data = getData();
  if (!data) return {};
  return buildMetadata({
    routeKey: ROUTE_KEY,
    locale: EXPECTED_LOCALE,
    title: data.content.metaTitle,
    description: data.content.metaDescription,
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw) || raw !== EXPECTED_LOCALE) notFound();
  const data = getData();
  if (!data) notFound();
  return <ComparisonPageTemplate locale={EXPECTED_LOCALE} comparison={data.comparison} content={data.content} />;
}
