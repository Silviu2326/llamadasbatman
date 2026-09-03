import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { CrmLeadList } from "./CrmLeadList";

export function CrmPipelineSection({ crm }: { crm: HomeContent["crmPipeline"] }) {
  return (
    <section className="bg-light">
      <Container size="xl" className="py-16 md:py-24">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <span className="inline-flex items-center rounded-full border border-violet/30 bg-violet/[0.08] px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-ink">
              {crm.tag}
            </span>
            <h2 className="mt-4 font-display text-[clamp(28px,3.2vw,42px)] font-bold leading-tight tracking-tight text-ink">
              {crm.title}
            </h2>
            <p className="mt-3 max-w-lg text-base leading-relaxed text-ink-soft">{crm.text}</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-dashed border-gold/50 bg-gold/[0.06] px-3.5 py-2 font-mono text-xs text-[#8a6d1f]">
            ✥ {crm.hint}
          </div>
        </div>

        <div className="relative mx-auto mb-10 max-w-5xl">
          <div aria-hidden className="absolute -inset-4 rounded-[30px] bg-gradient-to-r from-violet/10 via-cyan/10 to-lime-300/10 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/visuals/revenue-analytics.png"
            alt=""
            width={1600}
            height={900}
            className="relative aspect-[16/9] w-full rounded-2xl border border-ink/10 object-cover shadow-[0_28px_70px_-34px_rgba(15,23,42,0.45)]"
          />
        </div>

        <CrmLeadList columns={crm.columns} cards={crm.cards} />

        <div className="mx-auto mt-4 flex max-w-2xl items-start gap-3 rounded-2xl border border-gold/30 bg-gold/[0.07] px-5 py-4">
          <span className="flex-none rounded-md border border-gold/40 bg-gold/[0.14] px-2 py-1 font-mono text-[10px] font-semibold text-[#8a6d1f]">
            AI note
          </span>
          <span className="text-sm leading-relaxed text-ink-soft">{crm.aiNote}</span>
        </div>
      </Container>
    </section>
  );
}
