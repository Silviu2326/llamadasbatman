import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";

export function AdvisorSection({ advisor }: { advisor: HomeContent["advisor"] }) {
  return (
    <Container size="xl" className="py-16 md:py-24">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <Badge>{advisor.tag}</Badge>
        <h2 className="mx-auto mt-5 max-w-xl font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-tight tracking-tight text-white">
          {advisor.title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">{advisor.sub}</p>
      </div>

      <div className="relative mx-auto mb-10 max-w-2xl">
        <div aria-hidden className="absolute -inset-3 rounded-[28px] bg-gradient-to-br from-electric/15 via-cyan/10 to-violet/15 blur-2xl" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/home/photo-advisor.webp"
          alt=""
          width={1600}
          height={1067}
          className="relative aspect-[3/2] w-full rounded-2xl border border-white/10 object-cover shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85)]"
        />
      </div>

      <div className="mx-auto mb-10 flex max-w-3xl flex-wrap items-center justify-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-faint">{advisor.nicheLabel}</span>
        {advisor.niches.map((niche) => (
          <span
            key={niche}
            className="rounded-full border border-cyan/25 bg-cyan/[0.06] px-3 py-1 text-[13px] font-medium text-soft"
          >
            {niche}
          </span>
        ))}
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {advisor.cards.map((card, index) => (
          <div
            key={card.title}
            className="rounded-2xl border border-white/10 bg-gradient-to-b from-panel to-panel-2/40 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-cyan/35"
          >
            <div className="mb-3 font-mono text-[11px] text-faint">0{index + 1}</div>
            <div className="mb-1.5 font-display text-base font-semibold text-white">{card.title}</div>
            <div className="text-[13px] leading-relaxed text-muted">{card.text}</div>
          </div>
        ))}
      </div>
    </Container>
  );
}
