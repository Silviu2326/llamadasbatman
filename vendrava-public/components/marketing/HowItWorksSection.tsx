import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";

export function HowItWorksSection({ howItWorks }: { howItWorks: HomeContent["howItWorks"] }) {
  return (
    <section className="bg-light">
      <Container size="lg" id="como-funciona" className="py-16 md:py-24">
        <div className="mb-12 text-center">
          <span className="inline-flex items-center rounded-full border border-violet/30 bg-violet/[0.08] px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-ink">
            {howItWorks.tag}
          </span>
          <h2 className="mx-auto mt-5 max-w-xl font-display text-[clamp(28px,3.6vw,46px)] font-bold leading-tight tracking-tight text-ink">
            {howItWorks.title}
          </h2>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {howItWorks.steps.map((step) => (
            <div
              key={step.n}
              className="rounded-2xl border border-light-border bg-white p-[22px] shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-electric/40 hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
            >
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-gradient-to-br from-electric to-cyan font-display font-bold text-bg">
                  {step.n}
                </span>
                <span className="ml-auto rounded-md border border-electric/15 bg-electric/[0.06] px-2.5 py-1 font-mono text-[10px] text-electric-ink">
                  {step.tag}
                </span>
              </div>
              <div className="mb-2 text-base font-semibold text-ink">{step.title}</div>
              <div className="text-[13px] leading-relaxed text-ink-soft">{step.text}</div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
