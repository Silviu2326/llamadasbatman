import { organizationSchema, websiteSchema } from "@/lib/structured-data";
import type { Locale } from "@/types/locale";
import { StructuredData } from "./StructuredData";

export function OrganizationSchema({ locale }: { locale: Locale }) {
  return <StructuredData data={[organizationSchema(), websiteSchema(locale)]} />;
}
