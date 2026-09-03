import { faqPageSchema } from "@/lib/structured-data";
import type { FaqItem } from "@/types/content";
import { StructuredData } from "./StructuredData";

export function FAQSchema({ items }: { items: FaqItem[] }) {
  if (!items.length) return null;
  return <StructuredData data={faqPageSchema(items)} />;
}
