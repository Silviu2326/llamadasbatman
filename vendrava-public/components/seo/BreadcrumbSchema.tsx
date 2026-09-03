import { breadcrumbListSchema, type BreadcrumbLink } from "@/lib/structured-data";
import type { Locale } from "@/types/locale";
import { StructuredData } from "./StructuredData";

export function BreadcrumbSchema({ locale, items }: { locale: Locale; items: BreadcrumbLink[] }) {
  return <StructuredData data={breadcrumbListSchema(locale, items)} />;
}
