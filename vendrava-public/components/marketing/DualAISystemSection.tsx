import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";

export function DualAISystemSection({ dualAI }: { dualAI: HomeContent["dualAI"] }) {
  return (
    <section
      className="py-20 md:py-24"
      style={{ background: "radial-gradient(1000px 500px at 50% 30%, rgba(59,130,246,0.08), transparent)" }}
    >
      <Container size="md" className="text-center">
        <Badge>{dualAI.tag}</Badge>
        <h2 className="mx-auto mt-5 max-w-2xl font-display text-[clamp(28px,3.8vw,50px)] font-bold leading-tight tracking-tight text-white">
          {dualAI.title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">{dualAI.sub}</p>
      </Container>

      <Container size="lg" className="mt-11">
        <div className="grid gap-[18px] sm:grid-cols-3">
          {dualAI.cards.map((card) => (
            <div
              key={card.name}
              className="rounded-2xl border border-white/[0.14] bg-gradient-to-br from-panel to-panel-2/50 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-electric/35"
            >
              <div className="mb-3.5 flex items-center gap-2.5">
                <span className="font-display text-[17px] font-semibold text-white">{card.name}</span>
                <span className="ml-auto rounded-md border border-white/20 px-2 py-1 font-mono text-[10px] text-muted">
                  {card.tag}
                </span>
              </div>
              <div className="text-sm leading-relaxed text-muted">{card.text}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-[18px] sm:grid-cols-3">
          {dualAI.mini.map((mini) => (
            <div key={mini.name} className="rounded-2xl border border-white/10 bg-bg/40 p-[18px]">
              <div className="mb-3 font-mono text-[11px] tracking-wide text-cyan">{mini.name}</div>
              <div className="flex flex-col gap-2">
                {mini.rows.map((row) => (
                  <div key={row} className="flex items-center gap-2 text-[13px] text-soft">
                    <span className="h-1 w-1 flex-none rounded-full bg-violet" />
                    {row}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
