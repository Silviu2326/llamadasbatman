import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";

export function InboundOutboundSection({ inout }: { inout: HomeContent["inboundOutbound"] }) {
  return (
    <Container size="lg" className="py-16 md:py-24">
      <div className="mb-11 text-center">
        <Badge>{inout.tag}</Badge>
        <h2 className="mx-auto mt-5 max-w-xl font-display text-[clamp(28px,3.8vw,50px)] font-bold leading-tight tracking-tight text-white">
          {inout.title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">{inout.sub}</p>
      </div>

      <div className="grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-[20px] border border-violet/35 bg-gradient-to-b from-violet/10 to-panel-2/50 p-7">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-violet/40 bg-violet/[0.16] text-lg text-violet">
              ↗
            </span>
            <span className="font-display text-xl font-bold text-white">{inout.outLabel}</span>
          </div>
          <div className="flex flex-col gap-3">
            {inout.outItems.map((item) => (
              <div key={item} className="flex items-center gap-2.5 text-sm text-soft">
                <span className="flex-none text-violet">→</span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="hidden flex-col items-center gap-2 md:flex">
          <div className="flex h-24 w-24 flex-col items-center justify-center rounded-[22px] border border-electric/50 bg-gradient-to-b from-electric/[0.16] to-bg/70 shadow-[0_0_40px_rgba(59,130,246,0.25)]">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-gradient-to-br from-electric to-cyan">
              <span className="h-2 w-2 rounded-full bg-bg" />
            </span>
            <span className="mt-1.5 font-mono text-[9px] text-cyan">CRM</span>
          </div>
        </div>

        <div className="rounded-[20px] border border-cyan/35 bg-gradient-to-b from-cyan/10 to-panel-2/50 p-7">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-cyan/40 bg-cyan/[0.14] text-lg text-cyan">
              ↙
            </span>
            <span className="font-display text-xl font-bold text-white">{inout.inLabel}</span>
          </div>
          <div className="flex flex-col gap-3">
            {inout.inItems.map((item) => (
              <div key={item} className="flex items-center gap-2.5 text-sm text-soft">
                <span className="flex-none text-cyan">←</span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative mx-auto mt-10 max-w-3xl">
        <div aria-hidden className="absolute -inset-4 rounded-[30px] bg-gradient-to-br from-violet/12 via-electric/10 to-cyan/12 blur-2xl" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/home/photo-callcenter.webp"
          alt=""
          width={1920}
          height={1080}
          className="relative aspect-[16/9] w-full rounded-2xl border border-white/10 object-cover shadow-[0_36px_90px_-34px_rgba(0,0,0,0.85)]"
        />
      </div>

      <div className="relative mx-auto mt-10 max-w-md md:ml-auto md:mr-0">
        <div aria-hidden className="absolute -inset-4 rounded-[30px] bg-gradient-to-br from-electric/12 via-violet/10 to-cyan/12 blur-2xl" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/visuals/follow-up-planner.png"
          alt=""
          width={1200}
          height={1500}
          className="relative aspect-[4/5] w-full rounded-2xl border border-white/10 object-cover shadow-[0_36px_90px_-34px_rgba(0,0,0,0.85)]"
        />
      </div>
    </Container>
  );
}
