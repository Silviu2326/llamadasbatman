import type { HomeContent } from "@/types/content";
import type { Locale } from "@/types/locale";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { pathFor } from "@/lib/routes";

export function DemoCreditsSection({ locale, demo }: { locale: Locale; demo: HomeContent["demo"] }) {
  const es = locale === "es";
  const credits = es ? "100.000" : "100,000";
  const startLabel = es ? "Empezar demo gratis" : "Start free demo";
  const guidedLabel = es ? "Solicitar demo guiada" : "Book a guided demo";

  return (
    <section className="relative overflow-hidden py-16 md:py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_320px_at_50%_0%,rgba(201,168,76,0.12),transparent_60%),radial-gradient(600px_320px_at_80%_100%,rgba(34,211,238,0.1),transparent_60%)]" />
      <Container size="lg" className="relative">
        <div className="grid items-center gap-8 rounded-[24px] border border-gold/30 bg-gradient-to-b from-panel to-panel-2 p-8 shadow-[0_0_60px_-20px_rgba(201,168,76,0.4)] md:grid-cols-[1.1fr_1fr] md:p-11">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/[0.1] px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
              {demo.badge}
            </span>
            <h2 className="mt-5 font-display text-[clamp(26px,3vw,40px)] font-bold leading-tight tracking-tight text-white">
              {demo.title}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-soft">{demo.sub}</p>
            <div className="mt-6 flex flex-wrap gap-3.5">
              <Button href={pathFor("demo", locale)} size="lg">
                {startLabel}
              </Button>
              <Button href={pathFor("demo", locale)} variant="secondary" size="lg">
                {guidedLabel}
              </Button>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              {demo.benefits.map((benefit) => (
                <div key={benefit} className="flex items-start gap-2 text-[13px] leading-snug text-muted">
                  <span className="mt-0.5 flex-none text-cyan">✓</span>
                  {benefit}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg/50 p-7 text-center">
            <div className="font-display text-[clamp(52px,7vw,84px)] font-bold leading-none tracking-tight text-transparent [background:linear-gradient(120deg,#C9A84C,#22D3EE)] [-webkit-background-clip:text] [background-clip:text]">
              {credits}
            </div>
            <div className="mt-2 font-mono text-xs uppercase tracking-[0.1em] text-gold">{demo.unit}</div>
            <p className="mx-auto mt-4 max-w-xs text-[13px] leading-relaxed text-muted">{demo.use}</p>
            <div className="mt-6 flex flex-col gap-2.5">
              {demo.meters.map((meter) => (
                <div key={meter.k} className="text-left">
                  <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
                    <span className="text-soft">{meter.k}</span>
                    <span className="text-cyan">{meter.v}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-electric to-cyan"
                      style={{ width: `${meter.v}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mx-auto mt-4 max-w-2xl text-center text-xs leading-relaxed text-faint">{demo.note}</p>
      </Container>
    </section>
  );
}
