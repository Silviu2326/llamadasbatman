import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";

export function AIFlowSection({ automation }: { automation: HomeContent["automation"] }) {
  return (
    <section className="bg-gradient-to-b from-transparent via-panel/40 to-transparent py-16 md:py-24">
      <Container size="md" className="text-center">
        <Badge color="violet">{automation.tag}</Badge>
        <h2 className="mx-auto mt-5 max-w-xl font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-tight tracking-tight text-white">
          {automation.title}
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted">{automation.text}</p>
      </Container>

      <Container size="lg" className="mt-11">
        <div className="relative mx-auto max-w-5xl">
          <div aria-hidden className="absolute -inset-5 rounded-[32px] bg-gradient-to-r from-violet/15 via-electric/10 to-cyan/15 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/visuals/lead-pipeline.png"
            alt=""
            width={1600}
            height={900}
            className="relative aspect-[16/9] w-full rounded-2xl border border-white/10 object-cover shadow-[0_34px_90px_-36px_rgba(0,0,0,0.9)]"
          />
        </div>
      </Container>

      <Container size="lg" className="mt-11">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto_1.4fr]">
          <div className="flex flex-col gap-2">
            <div className="mb-1 font-mono text-[11px] uppercase tracking-wide text-cyan">{automation.trigLabel}</div>
            {automation.triggers.map((trigger) => (
              <div
                key={trigger}
                className="flex items-center gap-2.5 rounded-xl border border-cyan/25 bg-cyan/[0.05] px-3.5 py-2.5"
              >
                <span className="h-1.5 w-1.5 flex-none rounded-sm bg-cyan" />
                <span className="text-xs text-soft">{trigger}</span>
              </div>
            ))}
          </div>

          <div className="hidden justify-self-center md:block">
            <div className="rounded-2xl bg-gradient-to-br from-electric to-cyan px-[18px] py-3.5 text-center text-bg shadow-[0_12px_34px_rgba(59,130,246,0.35)]">
              <span className="font-display text-sm font-bold">◆ Vendrava</span>
              <div className="mt-0.5 font-mono text-[9px]">{automation.nodeLabel}</div>
            </div>
          </div>

          <div>
            <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-violet">{automation.actLabel}</div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {automation.actions.map((action) => (
                <div
                  key={action.label}
                  className="flex items-center gap-2.5 rounded-xl border border-white/[0.14] bg-gradient-to-b from-panel to-panel-2/50 px-3.5 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-violet/40"
                >
                  <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-lg border border-violet/30 bg-violet/[0.12] text-[15px] text-violet">
                    {action.icon}
                  </span>
                  <span className="text-[13px] font-medium text-soft">{action.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
