"use client";

import { useState } from "react";
import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function VoiceAgentsSection({ voice }: { voice: HomeContent["voiceAgents"] }) {
  const [active, setActive] = useState(0);
  const scenario = voice.scenarios[active] ?? voice.scenarios[0];

  return (
    <Container size="lg" className="py-16 md:py-24">
      <div className="grid items-center gap-11 md:grid-cols-[1fr_1.1fr]">
        <div>
          <Badge>{voice.tag}</Badge>
          <h2 className="mt-5 font-display text-[clamp(28px,3.2vw,42px)] font-bold leading-tight tracking-tight text-white">
            {voice.title}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">{voice.text}</p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            {voice.signals.map((signal) => (
              <div key={signal.k} className="rounded-xl border border-white/[0.14] bg-bg/50 px-3.5 py-2.5">
                <div className="font-mono text-[10px] uppercase tracking-wide text-faint">{signal.k}</div>
                <div className="mt-0.5 text-sm font-semibold text-cyan">{signal.v}</div>
              </div>
            ))}
          </div>
        </div>

        {scenario && (
          <div className="flex flex-col gap-4">
            <div className="relative overflow-hidden rounded-[20px] border border-white/[0.14] bg-panel shadow-[0_30px_70px_-30px_rgba(0,0,0,0.8)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/visuals/voice-agent.png"
                alt=""
                width={1536}
                height={1024}
                className="aspect-[3/2] w-full object-cover object-[72%_center]"
              />
              <div className="absolute bottom-3 left-3 rounded-lg border border-coral/30 bg-bg/70 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-coral backdrop-blur-md">
                IA con control humano
              </div>
            </div>

            <div className="overflow-hidden rounded-[20px] border border-white/[0.14] bg-gradient-to-b from-panel to-panel-2 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.8)]">
            <div className="flex flex-wrap gap-1 border-b border-white/10 p-2">
              {voice.scenarios.map((s, index) => (
                <button
                  key={s.tab}
                  type="button"
                  onClick={() => setActive(index)}
                  aria-pressed={index === active}
                  className={
                    index === active
                      ? "rounded-lg bg-white/[0.08] px-3 py-1.5 text-[12px] font-semibold text-white transition"
                      : "rounded-lg px-3 py-1.5 text-[12px] font-medium text-muted transition hover:text-white"
                  }
                >
                  {s.tab}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 border-b border-white/10 p-4">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-electric to-violet font-display text-[13px] font-semibold text-white">
                {initials(scenario.name)}
              </span>
              <div className="min-w-0">
                <div className="truncate font-semibold text-white">{scenario.name}</div>
                <div className="truncate font-mono text-[10px] text-muted">{scenario.meta}</div>
              </div>
              <span className="ml-auto inline-flex flex-none items-center gap-1.5 rounded-lg bg-gradient-to-br from-electric to-cyan px-3 py-2 text-xs font-semibold text-bg">
                <span className="h-1.5 w-1.5 animate-[pulse-soft_1.2s_infinite] rounded-full bg-bg" />
                {scenario.badge}
              </span>
            </div>

            {scenario.transcript.length > 0 && (
              <>
                <div className="flex h-11 items-center justify-center gap-[3px] border-b border-white/10 p-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <span
                      key={i}
                      className="w-[3px] animate-vw rounded-sm bg-gradient-to-b from-electric to-cyan"
                      style={{ height: 26, animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </div>
                <div className="flex flex-col gap-2.5 p-4">
                  {scenario.transcript.map((line, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 flex-none rounded-md bg-cyan/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan">
                        {line.who}
                      </span>
                      <span className="text-[13px] leading-relaxed text-soft">{line.text}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex flex-wrap gap-2 px-4 pb-4 pt-1">
              {scenario.facts.map((fact) => (
                <div key={fact.k} className="rounded-lg border border-white/10 bg-bg/50 px-2.5 py-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-wide text-faint">{fact.k}</span>
                  <span className="ml-1.5 text-[12px] font-semibold text-soft">{fact.v}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2.5 border-t border-white/10 bg-electric/[0.06] px-4 py-3">
              <span className="flex-none font-mono text-[10px] uppercase text-muted">Action</span>
              <span className="text-xs font-semibold text-white">{scenario.action}</span>
            </div>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
