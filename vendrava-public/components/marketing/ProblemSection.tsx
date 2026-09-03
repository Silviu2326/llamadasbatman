import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";

export function ProblemSection({ problem }: { problem: HomeContent["problem"] }) {
  return (
    <Container size="lg" className="py-16 md:py-24">
      <div className="grid items-end gap-10 md:grid-cols-[1fr_1.15fr]">
        <div>
          <Badge color="danger">{problem.tag}</Badge>
          <h2 className="mt-5 font-display text-[clamp(28px,3.6vw,46px)] font-bold leading-tight tracking-tight text-white">
            {problem.title}
          </h2>
        </div>
        <p className="text-lg leading-relaxed text-muted">{problem.text}</p>
      </div>

      <div className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {problem.items.map((item) => (
          <div
            key={item.n}
            className="rounded-2xl border border-white/10 bg-gradient-to-br from-danger/[0.06] to-panel-2/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-danger/30"
          >
            <div className="mb-3.5 flex items-center gap-2">
              <span className="font-display text-[15px] font-bold text-danger">{item.n}</span>
              <span className="h-px flex-1 bg-gradient-to-r from-danger/40 to-transparent" />
            </div>
            <div className="mb-2 text-base font-semibold text-white">{item.title}</div>
            <div className="text-sm leading-relaxed text-muted">{item.text}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-gold/25 bg-gradient-to-r from-gold/[0.06] to-transparent px-5 py-4">
        <span className="text-lg text-gold">◆</span>
        <span className="text-[15px] font-medium text-soft">{problem.kicker}</span>
      </div>
    </Container>
  );
}
