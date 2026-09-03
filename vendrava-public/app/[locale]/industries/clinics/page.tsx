import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, type Locale } from "@/types/locale";
import { INDUSTRIES } from "@/content/industries";
import { IndustryPageTemplate } from "@/components/templates/IndustryPageTemplate";
import { buildMetadata } from "@/lib/metadata";

const INDUSTRY_ID = "clinics";
const ROUTE_KEY = "industry.clinics";
const EXPECTED_LOCALE: Locale = "en";

function getData() {
  const industry = INDUSTRIES.find((i) => i.id === INDUSTRY_ID);
  if (!industry) return null;
  return { industry, content: EXPECTED_LOCALE === "es" ? industry.es : industry.en };
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
  return <IndustryPageTemplate locale={EXPECTED_LOCALE} industry={data.industry} content={data.content} />;
}
