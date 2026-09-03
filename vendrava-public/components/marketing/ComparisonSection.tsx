import Link from "next/link";
import type { HomeContent } from "@/types/content";
import type { Locale } from "@/types/locale";
import { Container } from "@/components/ui/Container";
import { pathFor } from "@/lib/routes";

export function ComparisonSection({
  locale,
  comparison,
}: {
  locale: Locale;
  comparison: HomeContent["comparison"];
}) {
  return (
    <section className="bg-light">
      <Container size="md" className="py-16 md:py-24">
        <div className="mb-11 text-center">
          <span className="inline-flex items-center rounded-full border border-electric/25 bg-electric/[0.08] px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-electric-ink">
            {comparison.tag}
          </span>
          <h2 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-tight tracking-tight text-ink">
            {comparison.title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-soft">{comparison.sub}</p>
        </div>

        <div className="grid gap-[18px] sm:grid-cols-2">
          {/* Traditional CRM — plain, passive, light */}
          <div className="rounded-[18px] border border-light-border bg-white p-[26px] shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
            <div className="mb-[18px] font-display text-lg font-semibold text-ink-muted">{comparison.tradLabel}</div>
            <div className="flex flex-col gap-3.5">
              {comparison.rows.map((row) => (
                <div key={row.trad} className="flex items-center gap-2.5 text-sm text-ink-soft">
                  <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-red-500/10 text-xs font-bold text-red-500">
                    ✕
                  </span>
                  {row.trad}
                </div>
              ))}
            </div>
          </div>

          {/* Vendrava — alive, premium, dark card that pops against the light band */}
          <div className="rounded-[18px] border border-electric/60 bg-gradient-to-b from-navy to-panel-2 p-[26px] shadow-[0_24px_60px_-18px_rgba(37,99,235,0.55)]">
            <div className="mb-[18px] flex items-center gap-2.5">
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-lg bg-gradient-to-br from-electric to-cyan">
                <span className="h-1.5 w-1.5 rounded-full bg-bg" />
              </span>
              <span className="font-display text-lg font-bold text-white">{comparison.vendLabel}</span>
            </div>
            <div className="flex flex-col gap-3.5">
              {comparison.rows.map((row) => (
                <div key={row.vend} className="flex items-center gap-2.5 text-sm font-medium text-white">
                  <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-cyan/[0.16] text-xs font-bold text-cyan">
                    ✓
                  </span>
                  {row.vend}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-7 text-center">
          <Link
            href={pathFor("comparisons.index", locale)}
            className="border-b border-electric/40 pb-0.5 text-sm font-semibold text-electric-ink transition-colors hover:border-electric"
          >
            {comparison.tag} →
          </Link>
        </div>
      </Container>
    </section>
  );
}
