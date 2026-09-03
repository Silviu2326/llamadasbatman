import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";

export function DifferentiatorSection({ differentiator }: { differentiator: HomeContent["differentiator"] }) {
  const d = differentiator;
  return (
    <section className="py-16 md:py-24">
      <Container size="lg">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <Badge>{d.tag}</Badge>
          <h2 className="mx-auto mt-5 max-w-xl font-display text-[clamp(28px,3.6vw,46px)] font-bold leading-tight tracking-tight text-white">
            {d.title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted">{d.text}</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Chat / WhatsApp bots — the category the buyer already knows */}
          <div className="rounded-2xl border border-white/10 bg-bg/40 p-6">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-faint">
                <Icon name="message" />
              </span>
              <span className="font-display text-base font-semibold text-muted">{d.chatLabel}</span>
            </div>
            <ul className="flex flex-col gap-3">
              {d.chatPoints.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted">
                  <span className="mt-0.5 flex-none font-mono text-slate-500">✕</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Vendrava — the AI voice sales agent */}
          <div className="rounded-2xl border border-electric/30 bg-gradient-to-b from-electric/[0.09] to-panel-2/40 p-6">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-electric/30 bg-electric/10 text-electric">
                <Icon name="phone-outbound" />
              </span>
              <span className="font-display text-base font-semibold text-white">{d.vendLabel}</span>
            </div>
            <ul className="flex flex-col gap-3">
              {d.vendPoints.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm leading-relaxed text-soft">
                  <Icon name="check-circle" className="mt-0.5 h-[18px] w-[18px] flex-none text-cyan" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
