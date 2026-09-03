import Link from "next/link";
import type { HomeContent } from "@/types/content";
import type { Locale } from "@/types/locale";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { iconForIndustry } from "@/lib/icons";
import { pathFor } from "@/lib/routes";

export function IndustriesSection({
  locale,
  industries,
}: {
  locale: Locale;
  industries: HomeContent["industries"];
}) {
  return (
    <section className="bg-light">
      <Container size="xl" className="py-16 md:py-24">
        <div className="mb-11 text-center">
          <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a6d1f]">
            {industries.tag}
          </span>
          <h2 className="mx-auto mt-5 max-w-xl font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-tight tracking-tight text-ink">
            {industries.title}
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {industries.items.map((item) => (
            <div
              key={item.name}
              className="rounded-2xl border border-light-border bg-white p-[22px] shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-electric/40 hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-electric/20 bg-electric/[0.07] text-electric-ink">
                  <Icon name={iconForIndustry(item.name)} />
                </span>
                <span className="font-display text-[17px] font-semibold text-ink">{item.name}</span>
                {item.hot && (
                  <span className="ml-auto rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-amber-700">
                    POPULAR
                  </span>
                )}
              </div>
              <div className="mb-3.5 text-sm leading-relaxed text-ink-soft">{item.pain}</div>
              <div className="rounded-lg border border-electric/15 bg-electric/[0.06] px-2.5 py-2 font-mono text-[11px] text-electric-ink">
                {item.flow}
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm font-medium text-ink">
                <span className="text-emerald-600">↗</span>
                {item.result}
              </div>
            </div>
          ))}
          <Link
            href={pathFor("industries.index", locale)}
            className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 text-center transition-colors hover:border-electric/50 hover:bg-white"
          >
            <span className="text-2xl text-electric-ink">→</span>
            <span className="text-sm font-semibold text-ink-soft">{industries.tag}</span>
          </Link>
        </div>
      </Container>
    </section>
  );
}
