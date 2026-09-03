import type { HomeContent } from "@/types/content";
import type { Locale } from "@/types/locale";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";

export function ComoFuncionaSection({ comoFunciona, locale }: { comoFunciona: HomeContent["comoFunciona"]; locale: Locale }) {
  const c = comoFunciona;
  return (
    <section className="py-16 md:py-24">
      <Container size="lg">
        <div className="mb-11 text-center">
          <Badge>{c.tag}</Badge>
          <h2 className="mx-auto mt-5 max-w-xl font-display text-[clamp(28px,3.6vw,46px)] font-bold leading-tight tracking-tight text-white">
            {c.title}
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {c.steps.map((step) => (
            <div
              key={step.n}
              className="rounded-2xl border border-white/10 bg-gradient-to-b from-panel to-panel-2/40 p-6"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan/30 bg-cyan/10 font-display text-lg font-bold text-cyan">
                {step.n}
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-white">{step.t}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{step.d}</p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-faint">{c.note}</p>

        <figure className="relative mt-10 overflow-hidden rounded-[24px] border border-white/[0.14] bg-panel shadow-[0_30px_80px_-32px_rgba(0,0,0,0.9)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/visuals/revenue-flow.png"
            alt=""
            width={1774}
            height={1182}
            className="aspect-[3/2] w-full object-cover object-center"
          />
          <figcaption className="absolute bottom-3 left-3 rounded-lg border border-white/10 bg-bg/70 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-soft backdrop-blur-md">
            {locale === "en" ? "Acquisition connected to sales" : "Captación conectada con ventas"}
          </figcaption>
        </figure>

        <figure className="relative mt-10">
          <div aria-hidden className="absolute -inset-4 rounded-[30px] bg-gradient-to-br from-electric/12 via-cyan/10 to-violet/12 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={c.screenshot.src}
            alt={c.screenshot.caption}
            width={1440}
            height={768}
            className="relative aspect-[1440/768] w-full rounded-2xl border border-white/15 object-cover shadow-[0_36px_90px_-34px_rgba(0,0,0,0.85)]"
          />
          <figcaption className="mx-auto mt-3 max-w-2xl text-center font-mono text-[11px] uppercase tracking-widest text-faint">
            {c.screenshot.caption}
          </figcaption>
        </figure>
      </Container>
    </section>
  );
}
