import type { HomeContent } from "@/types/content";

type Card = HomeContent["crmPipeline"]["cards"][number];
type Accent = Card["accent"];

// Light-zone accents — text colours chosen to pass contrast on white/tinted chips.
const ACCENT: Record<Accent, { avatar: string; score: string; tag: string }> = {
  cyan: { avatar: "from-electric to-cyan", score: "text-cyan-700", tag: "text-cyan-700 border-cyan-600/25 bg-cyan-600/[0.08]" },
  violet: { avatar: "from-violet to-electric", score: "text-violet-ink", tag: "text-violet-ink border-violet/25 bg-violet/[0.08]" },
  electric: { avatar: "from-electric to-violet", score: "text-electric-ink", tag: "text-electric-ink border-electric/25 bg-electric/[0.08]" },
  gold: { avatar: "from-gold to-[#f0d98a]", score: "text-[#8a6d1f]", tag: "text-[#8a6d1f] border-gold/30 bg-gold/[0.1]" },
  success: { avatar: "from-emerald-500 to-cyan", score: "text-emerald-700", tag: "text-emerald-700 border-emerald-600/25 bg-emerald-600/[0.08]" },
};

// Pipeline-stage badge colour, indexed by column position (light-zone variants).
const STAGE = [
  "text-slate-600 border-slate-300 bg-slate-100",
  "text-electric-ink border-electric/30 bg-electric/[0.08]",
  "text-cyan-700 border-cyan-600/30 bg-cyan-600/[0.08]",
  "text-violet-ink border-violet/30 bg-violet/[0.08]",
  "text-[#8a6d1f] border-gold/40 bg-gold/[0.1]",
  "text-emerald-700 border-emerald-600/30 bg-emerald-600/[0.08]",
];

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function CrmLeadList({ columns, cards }: { columns: string[]; cards: Card[] }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      {cards.map((card, i) => {
        const a = ACCENT[card.accent];
        const stageClass = STAGE[card.col] ?? STAGE[0];
        return (
          <div
            key={`${card.name}-${i}`}
            className="rounded-2xl border border-light-border bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-electric/40 hover:shadow-[0_8px_22px_rgba(15,23,42,0.07)]"
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br ${a.avatar} font-display text-[13px] font-semibold text-white`}
              >
                {initials(card.name)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold leading-tight text-ink">{card.name}</div>
                <div className="truncate font-mono text-[11px] text-ink-muted">{card.company}</div>
              </div>
              <span
                className={`ml-auto inline-flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold ${stageClass}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {columns[card.col]}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">{card.source}</span>
              <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${a.tag}`}>◆ {card.score}</span>
              <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${a.tag}`}>{card.ai}</span>
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-light-border pt-3">
              <span className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">Next</span>
              <span className="text-[13px] font-medium text-ink-soft">{card.next}</span>
              <span className="ml-auto font-mono text-[10px] text-ink-muted">{card.ago}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
