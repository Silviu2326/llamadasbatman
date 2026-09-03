import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";

export function LeadLifecycleSection({ dayInLife }: { dayInLife: HomeContent["dayInLife"] }) {
  return (
    <Container size="md" className="py-16 md:py-24">
      <div className="mb-12 text-center">
        <Badge color="gold">{dayInLife.tag}</Badge>
        <h2 className="mx-auto mt-5 max-w-lg font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-tight tracking-tight text-white">
          {dayInLife.title}
        </h2>
      </div>

      <div className="relative">
        <div
          aria-hidden
          className="absolute bottom-1.5 left-1/2 top-1.5 hidden w-0.5 -translate-x-1/2 bg-gradient-to-b from-electric via-cyan to-violet opacity-40 md:block"
        />
        <div className="flex flex-col gap-5">
          {dayInLife.items.map((item) => (
            <div key={`${item.t}-${item.title}`} className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
              <div className={item.side === "l" ? "md:text-right" : "md:invisible"}>
                {item.side === "l" && <LifecycleCard item={item} />}
              </div>
              <div className="hidden flex-col items-center gap-1 md:flex">
                <span className="rounded-lg border border-cyan/30 bg-bg px-2 py-1 font-mono text-xs font-semibold text-cyan">
                  {item.t}
                </span>
              </div>
              <div className={item.side === "r" ? "" : "md:invisible"}>
                {item.side === "r" && <LifecycleCard item={item} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}

function LifecycleCard({ item }: { item: HomeContent["dayInLife"]["items"][number] }) {
  return (
    <div className="inline-block max-w-[340px] rounded-2xl border border-white/[0.14] bg-gradient-to-b from-panel to-panel-2/50 p-[18px] text-left">
      <div className="mb-1.5 font-mono text-[11px] text-gold">{item.t}</div>
      <div className="text-[15px] font-semibold text-white">{item.title}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-muted">{item.text}</div>
    </div>
  );
}
