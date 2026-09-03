import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";

export function AfterHoursSection({ afterHours }: { afterHours: HomeContent["afterHours"] }) {
  return (
    <section
      className="py-16 md:py-24"
      style={{ background: "radial-gradient(900px 400px at 50% 20%, rgba(139,92,246,0.08), transparent)" }}
    >
      <Container size="md" className="text-center">
        <Badge color="violet">{afterHours.tag}</Badge>
        <h2 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(26px,3.4vw,44px)] font-bold leading-tight tracking-tight text-white">
          {afterHours.title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted">{afterHours.text}</p>
      </Container>

      <Container size="lg" className="mt-11">
        <div className="relative mx-auto max-w-3xl">
          <div aria-hidden className="absolute -inset-4 rounded-[30px] bg-gradient-to-br from-violet/15 via-electric/10 to-cyan/12 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/visuals/omnichannel-inbox.png"
            alt=""
            width={1920}
            height={1080}
            className="relative aspect-[16/9] w-full rounded-2xl border border-white/10 object-cover shadow-[0_36px_90px_-34px_rgba(0,0,0,0.85)]"
          />
        </div>
      </Container>

      <Container size="lg" className="relative mt-12">
        <div
          aria-hidden
          className="absolute left-[11%] right-[11%] top-[22px] hidden h-0.5 bg-gradient-to-r from-violet via-electric to-emerald-400 opacity-40 md:block"
        />
        <div className="relative flex flex-col gap-5 md:flex-row md:justify-between">
          {afterHours.steps.map((step) => (
            <div key={`${step.t}-${step.title}`} className="flex-1">
              <div className="mb-4 flex justify-center">
                <span className="rounded-full bg-gradient-to-br from-violet to-cyan px-3 py-1.5 font-mono text-xs font-semibold text-bg">
                  {step.t}
                </span>
              </div>
              <div className="h-full rounded-2xl border border-white/10 bg-gradient-to-b from-panel to-panel-2/40 p-[18px] text-center">
                <div className="mb-1.5 text-[15px] font-semibold text-white">{step.title}</div>
                <div className="text-[13px] leading-relaxed text-muted">{step.text}</div>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
