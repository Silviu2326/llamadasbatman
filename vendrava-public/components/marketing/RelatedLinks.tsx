import Link from "next/link";
import { Container } from "@/components/ui/Container";

export interface RelatedItem {
  label: string;
  sub?: string;
  href: string;
}

export function RelatedLinks({ title, items }: { title: string; items: RelatedItem[] }) {
  if (items.length === 0) return null;

  return (
    <Container size="xl" className="border-t border-white/[0.06] py-12 md:py-16">
      <h2 className="mb-6 text-center font-display text-2xl font-bold text-white md:text-3xl">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl border border-white/10 bg-gradient-to-b from-panel to-panel-2/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-electric/35"
          >
            <div className="font-display text-base font-semibold text-white">{item.label}</div>
            {item.sub && <div className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{item.sub}</div>}
          </Link>
        ))}
      </div>
    </Container>
  );
}
