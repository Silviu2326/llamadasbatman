import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { IconCard } from "@/components/ui/IconCard";

export function SolutionSection({ solution }: { solution: HomeContent["solution"] }) {
  return (
    <section className="bg-gradient-to-b from-transparent via-panel/40 to-transparent py-16 md:py-24">
      <Container size="md" className="text-center">
        <Badge>{solution.tag}</Badge>
        <h2 className="mx-auto mt-5 max-w-xl font-display text-[clamp(28px,3.6vw,46px)] font-bold leading-tight tracking-tight text-white">
          {solution.title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">{solution.text}</p>
      </Container>

      <Container size="md" className="mt-10">
        <div className="relative mx-auto max-w-xl">
          <div aria-hidden className="absolute -inset-3 rounded-[28px] bg-gradient-to-br from-emerald-400/12 via-cyan/10 to-electric/12 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/visuals/human-supervision.png"
            alt=""
            width={1536}
            height={1024}
            className="relative aspect-[3/2] w-full rounded-2xl border border-white/10 object-cover object-[72%_center] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85)]"
          />
        </div>
      </Container>

      <Container size="lg" className="mt-12">
        <div className="grid items-center gap-7 md:grid-cols-[1fr_auto_1fr]">
          <div className="flex flex-col gap-2.5">
            <div className="mb-1 font-mono text-[11px] uppercase tracking-widest text-cyan">Input</div>
            {solution.inputs.map((input) => (
              <IconCard key={input.label} icon={input.icon} label={input.label} />
            ))}
          </div>

          <div className="flex flex-col items-center gap-2.5 py-4 md:py-0">
            <div className="relative flex h-[150px] w-[150px] flex-col items-center justify-center rounded-[28px] border border-electric/50 bg-gradient-to-b from-electric/[0.16] to-bg/70 shadow-[0_0_50px_rgba(59,130,246,0.28)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.png" alt="Vendrava" width={315} height={256} className="mb-2 h-[58px] w-auto" />
              <span className="font-display text-base font-bold text-white">Vendrava</span>
              <span className="mt-0.5 font-mono text-[9px] tracking-wide text-cyan">AI SALES CRM</span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="mb-1 text-right font-mono text-[11px] uppercase tracking-widest text-violet">Output</div>
            {solution.outputs.map((output) => (
              <IconCard key={output.label} icon={output.icon} label={output.label} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
