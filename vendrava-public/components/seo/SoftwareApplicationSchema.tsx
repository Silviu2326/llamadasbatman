import { softwareApplicationSchema } from "@/lib/structured-data";
import type { Locale } from "@/types/locale";
import { StructuredData } from "./StructuredData";

export function SoftwareApplicationSchema({ locale }: { locale: Locale }) {
  return <StructuredData data={softwareApplicationSchema(locale)} />;
}
