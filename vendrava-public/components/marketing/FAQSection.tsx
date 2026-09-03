import type { FaqItem } from "@/types/content";
import { Container } from "@/components/ui/Container";

export function FAQSection({
  tag,
  title,
  items,
}: {
  tag: string;
  title: string;
  items: FaqItem[];
}) {
  return (
    <section className="bg-light">
      <Container size="sm" className="py-16 md:py-24">
        <div className="mb-10 text-center">
          <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {tag}
          </span>
          <h2 className="mt-5 font-display text-[clamp(28px,3.4vw,42px)] font-bold leading-tight tracking-tight text-ink">
            {title}
          </h2>
        </div>

        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-light-border bg-white px-5 py-[18px] shadow-[0_1px_3px_rgba(15,23,42,0.04)] open:shadow-[0_6px_20px_rgba(15,23,42,0.06)]"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 text-base font-semibold text-ink marker:content-none">
                <span className="flex-1">{item.q}</span>
                <span className="flex-none text-lg text-electric-ink transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{item.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
