import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { GrowthIcon } from "@/components/ui/GrowthIcon";

export function ProductModulesSection({ growthHub }: { growthHub: HomeContent["growthHub"] }) {
  return (
    <section className="bg-light">
      <Container size="xl" className="py-16 md:py-24">
        <div className="mb-11 text-center">
          <span className="inline-flex items-center rounded-full border border-electric/25 bg-electric/[0.08] px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-electric-ink">
            {growthHub.tag}
          </span>
          <h2 className="mx-auto mt-5 max-w-xl font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-tight tracking-tight text-ink">
            {growthHub.title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-soft">{growthHub.text}</p>
        </div>

        <div className="grid auto-rows-[minmax(96px,auto)] grid-cols-2 gap-3.5 md:grid-cols-4">
          {growthHub.modules.map((module) => (
            <div
              key={module.name}
              style={{ gridColumn: `span ${module.span}` }}
              className="flex flex-col rounded-2xl border border-light-border bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-electric/40 hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-cyan-600/25 bg-cyan-600/10 text-cyan-700">
                  <GrowthIcon name={module.iconKey} className="h-[18px] w-[18px]" />
                </span>
                <span className="font-display text-[17px] font-semibold text-ink">{module.name}</span>
                {module.val && (
                  <span className="ml-auto rounded-md border border-cyan-600/20 bg-cyan-600/10 px-2 py-1 font-mono text-[10px] text-cyan-700">
                    {module.val}
                  </span>
                )}
              </div>
              <div className="text-[13px] leading-relaxed text-ink-soft">{module.desc}</div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
