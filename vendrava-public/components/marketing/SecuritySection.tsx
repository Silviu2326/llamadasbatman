import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";

export function SecuritySection({ security }: { security: HomeContent["security"] }) {
  return (
    <section className="bg-light">
      <Container size="lg" className="grid items-center gap-11 py-16 md:grid-cols-[1fr_1.1fr] md:py-24">
        <div className="hidden items-center justify-center md:flex">
          <div className="flex h-[220px] w-[220px] items-center justify-center rounded-[32px] border border-light-border bg-white shadow-[0_12px_40px_rgba(15,23,42,0.07)]">
            <svg viewBox="0 0 24 24" width="104" height="104" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="shield" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#2563eb" />
                  <stop offset="1" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
              <path
                d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3z"
                fill="url(#shield)"
                fillOpacity="0.1"
                stroke="url(#shield)"
                strokeWidth="1.1"
              />
              <path d="M8.4 12l2.6 2.6 4.6-5.2" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <div>
          <span className="inline-flex items-center rounded-full border border-electric/25 bg-electric/[0.08] px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-electric-ink">
            {security.tag}
          </span>
          <h2 className="mt-5 font-display text-[clamp(28px,3.2vw,42px)] font-bold leading-tight tracking-tight text-ink">
            {security.title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-soft">{security.text}</p>
          <div className="mt-6 grid gap-3.5 sm:grid-cols-2">
            {security.items.map((item) => (
              <div key={item.title} className="rounded-xl border border-light-border bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                <span className="text-xl text-electric-ink">{item.icon}</span>
                <div className="mb-1 mt-2.5 text-sm font-semibold text-ink">{item.title}</div>
                <div className="text-xs leading-relaxed text-ink-muted">{item.text}</div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
