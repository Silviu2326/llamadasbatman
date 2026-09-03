"use client";

import { useState } from "react";
import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";

export function NichePlaygroundSection({ playground }: { playground: HomeContent["nichePlayground"] }) {
  const [active, setActive] = useState(0);
  const sector = playground.sectors[active] ?? playground.sectors[0];
  if (!sector) return null;

  return (
    <section className="relative overflow-hidden py-16 md:py-24">
      <Container size="xl">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <Badge>{playground.tag}</Badge>
          <h2 className="mx-auto mt-5 max-w-xl font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-tight tracking-tight text-white">
            {playground.title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">{playground.sub}</p>
        </div>

        <div className="mx-auto mb-6 flex max-w-4xl flex-wrap justify-center gap-2">
          {playground.sectors.map((s, index) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(index)}
              aria-pressed={index === active}
              className={
                index === active
                  ? "rounded-full bg-gradient-to-r from-electric to-cyan px-4 py-2 text-sm font-semibold text-bg shadow-[0_6px_20px_rgba(59,130,246,0.35)] transition"
                  : "rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-muted transition hover:border-white/40 hover:text-white"
              }
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/[0.12] bg-gradient-to-b from-panel to-panel-2/50 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
            <span className="h-2 w-2 flex-none rounded-full bg-cyan" />
            <span className="font-mono text-[12px] text-soft">
              {playground.agentLabel} · {sector.name}
            </span>
            <span className="ml-auto font-mono text-[10px] text-faint">{playground.langNote}</span>
          </div>

          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="rounded-xl border border-cyan/25 bg-cyan/[0.06] p-4 text-[14px] leading-relaxed text-soft">
                {sector.greeting}
              </div>
            </div>

            <div>
              <div className="mb-2.5 font-mono text-[11px] uppercase tracking-wide text-cyan">{playground.askLabel}</div>
              <div className="flex flex-col gap-2">
                {sector.questions.map((question) => (
                  <div key={question} className="flex items-start gap-2 text-[13px] leading-snug text-soft">
                    <span className="mt-0.5 flex-none font-mono text-cyan">?</span>
                    {question}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2.5 font-mono text-[11px] uppercase tracking-wide text-violet">
                {playground.objectionLabel}
              </div>
              <div className="flex flex-wrap gap-2">
                {sector.objections.map((objection) => (
                  <span
                    key={objection}
                    className="rounded-lg border border-violet/25 bg-violet/[0.06] px-2.5 py-1 text-[12px] text-soft"
                  >
                    {objection}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-white/10 bg-bg/40 px-5 py-3.5">
            <span className="flex-none font-mono text-[10px] uppercase tracking-widest text-faint">
              {playground.nextLabel}
            </span>
            <span className="text-[13px] font-medium text-white">{sector.next}</span>
          </div>
        </div>
      </Container>
    </section>
  );
}
