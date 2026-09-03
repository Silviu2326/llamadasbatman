import Link from "next/link";
import type { Locale } from "@/types/locale";
import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { pathFor } from "@/lib/routes";

export function HeroSection({
  locale,
  hero,
  ctaPrimary,
}: {
  locale: Locale;
  hero: HomeContent["hero"];
  ctaPrimary: string;
}) {
  return (
    <section className="pb-10 pt-16 md:pt-20">
      <Container size="xl" className="grid items-center gap-12 lg:grid-cols-[1.05fr_1.2fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan/30 bg-cyan/[0.06] px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-cyan">
            <span className="h-1.5 w-1.5 animate-blink rounded-full bg-cyan" />
            {hero.badge}
          </span>
          <h1 className="mt-6 font-display text-[clamp(34px,4.4vw,60px)] font-bold leading-[1.05] tracking-tight text-white">
            {hero.h1a}{" "}
            <span className="bg-gradient-to-r from-electric via-cyan to-violet bg-clip-text text-transparent">
              {hero.h1b}
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{hero.sub}</p>
          <div className="mt-7 flex flex-wrap gap-3.5">
            <Link
              href={pathFor("demo", locale)}
              className="rounded-xl bg-gradient-to-br from-electric to-cyan px-6 py-3.5 text-sm font-semibold text-bg shadow-[0_10px_34px_rgba(59,130,246,0.42)] transition-transform hover:-translate-y-0.5"
            >
              {ctaPrimary}
            </Link>
            <a
              href="#como-funciona"
              className="rounded-xl border border-white/25 px-6 py-3.5 text-sm font-semibold text-soft transition-colors hover:border-white/50 hover:bg-white/5 hover:text-white"
            >
              {hero.secondary}
            </a>
          </div>
          <div className="mt-5 flex items-center gap-2.5 text-sm text-muted">
            <span className="text-base text-gold">◆</span>
            {hero.micro}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {hero.badges.map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-bg/50 px-3 py-1.5 text-xs font-medium text-soft"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
                {badge}
              </span>
            ))}
          </div>
        </div>

        <HeroVisual />
      </Container>

      <Container size="xl" className="mt-8">
        <div className="mb-4 text-center font-mono text-[11px] uppercase tracking-widest text-faint">
          {hero.trust}
        </div>
        <div className="flex flex-wrap justify-center gap-3.5 opacity-70">
          {hero.channels.map((channel) => (
            <span
              key={channel}
              className="rounded-lg border border-white/[0.12] px-3.5 py-1.5 font-mono text-sm font-medium text-faint"
            >
              {channel}
            </span>
          ))}
        </div>
      </Container>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="relative min-w-0">
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-electric/20 via-cyan/10 to-violet/20 blur-3xl"
      />
      <div className="relative overflow-hidden rounded-[24px] border border-white/[0.16] bg-panel shadow-[0_40px_100px_-34px_rgba(0,0,0,0.9)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/visuals/hero-revenue-orchestration.png"
          alt=""
          width={1536}
          height={1024}
          className="aspect-[4/3] h-full w-full object-cover object-[78%_center] transition-transform duration-700 hover:scale-[1.015]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-panel/20 via-transparent to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-xl border border-white/10 bg-bg/70 px-3.5 py-3 backdrop-blur-md sm:left-auto sm:w-[220px]">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-faint">Vendrava OS</div>
            <div className="mt-1 text-xs font-semibold text-white">{locale === "en" ? "From lead to meeting" : "Del lead a la reunión"}</div>
          </div>
          <span className="h-2 w-2 animate-[pulse-soft_1.4s_infinite] rounded-full bg-cyan shadow-[0_0_14px_rgba(34,211,238,0.8)]" />
        </div>
      </div>
    </div>
  );
}

// Kept as a reference variant for future product demos.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function HeroDashboardMock() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-5 z-0 blur-2xl"
        style={{ background: "radial-gradient(circle at 60% 40%, rgba(59,130,246,0.22), transparent 60%)" }}
      />
      <div className="relative z-[1] overflow-hidden rounded-[20px] border border-white/[0.14] bg-gradient-to-b from-panel to-panel-2 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
          <span className="ml-2 font-mono text-[11px] text-faint">vendrava.app / pipeline</span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-cyan/25 bg-cyan/10 px-2 py-1 font-mono text-[10px] font-semibold text-cyan">
            <span className="h-1.5 w-1.5 animate-[pulse-soft_1.4s_infinite] rounded-full bg-cyan" />
            LIVE AI AGENT
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3.5 p-4">
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-cyan/30 bg-gradient-to-b from-cyan/10 to-transparent p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-[pulse-soft_1.2s_infinite] rounded-full bg-cyan" />
                <span className="text-[11px] font-semibold text-white">Inbound call</span>
                <span className="ml-auto font-mono text-[9px] text-cyan">21:18</span>
              </div>
              <div className="text-[11px] leading-tight text-soft">New inbound call</div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-muted">Google Ads</span>
                <span className="rounded-md bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[9px] text-emerald-400">Answering</span>
              </div>
            </div>

            <div className="rounded-2xl border border-electric/30 bg-gradient-to-b from-electric/10 to-electric/[0.02] p-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-electric to-violet font-display text-[13px] font-semibold text-white">
                  MG
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">María González</div>
                  <div className="font-mono text-[11px] text-muted">Grupo Habitat</div>
                </div>
                <span className="ml-auto rounded-md border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                  QUALIFIED
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <div className="flex-1 rounded-lg bg-bg/50 py-2 text-center">
                  <div className="font-display text-base font-bold text-cyan">92</div>
                  <div className="text-[9px] uppercase tracking-wide text-faint">Score</div>
                </div>
                <div className="flex-1 rounded-lg bg-bg/50 py-2 text-center">
                  <div className="font-display text-base font-bold text-white">High</div>
                  <div className="text-[9px] uppercase tracking-wide text-faint">Intent</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.12] bg-bg/40 p-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-faint">AI Inbox</div>
              <div className="flex flex-col gap-1.5 text-[11px] text-soft">
                <div className="flex items-center gap-1.5">
                  <span className="text-cyan">✆</span>Recovered calls
                  <span className="ml-auto font-mono text-emerald-400">3</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-400">◇</span>WhatsApp pending
                  <span className="ml-auto font-mono text-muted">5</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-violet">▦</span>New forms
                  <span className="ml-auto font-mono text-muted">8</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-white/[0.12] bg-gradient-to-b from-panel to-panel-2 p-3.5">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2 w-2 animate-[pulse-soft_1.2s_infinite] rounded-full bg-cyan" />
                <span className="text-xs font-semibold text-white">AI Call · 00:42</span>
                <span className="ml-auto font-mono text-[10px] text-muted">↗ following up</span>
              </div>
              <div className="flex h-12 items-center justify-center gap-[3px]">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-1 animate-vw rounded-sm bg-gradient-to-b from-electric to-cyan"
                    style={{ height: 34, animationDelay: `${i * 0.08}s` }}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gold/25 bg-gradient-to-b from-gold/[0.08] to-transparent p-3">
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-gold">✦ AI Summary</div>
              <div className="text-xs leading-relaxed text-soft">
                Interested in 3 units. Budget confirmed. Requesting a visit this week.
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-electric/30 bg-electric/[0.08] px-3 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">Next</span>
              <span className="text-[13px] font-semibold text-white">Schedule demo</span>
              <span className="ml-auto rounded-md bg-gradient-to-br from-electric to-cyan px-2.5 py-1 text-[11px] font-semibold text-bg">
                AI follow-up →
              </span>
            </div>
          </div>
        </div>

        <div className="flex border-t border-white/10 text-center">
          <div className="flex-1 border-r border-white/10 px-2 py-2.5">
            <div className="font-mono text-xs font-semibold text-cyan">Instant</div>
            <div className="text-[9px] text-faint">lead response</div>
          </div>
          <div className="flex-1 border-r border-white/10 px-2 py-2.5">
            <div className="font-mono text-xs font-semibold text-white">In + Out</div>
            <div className="text-[9px] text-faint">calls</div>
          </div>
          <div className="flex-1 border-r border-white/10 px-2 py-2.5">
            <div className="font-mono text-xs font-semibold text-violet">AI</div>
            <div className="text-[9px] text-faint">qualification</div>
          </div>
          <div className="flex-1 px-2 py-2.5">
            <div className="font-mono text-xs font-semibold text-emerald-400">24/7</div>
            <div className="text-[9px] text-faint">coverage</div>
          </div>
        </div>
      </div>
    </div>
  );
}
