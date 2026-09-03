import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";

/**
 * Renders segment-based social proof ("who Vendrava is built for") rather
 * than fabricated customer quotes, since no real testimonials exist yet.
 */
export function TestimonialsSection({ socialProof }: { socialProof: HomeContent["socialProof"] }) {
  return (
    <Container size="xl" className="pb-16 pt-6 md:pb-24">
      <div className="mb-9 text-center">
        <Badge color="gold">{socialProof.tag}</Badge>
        <h2 className="mx-auto mt-5 max-w-xl font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-tight tracking-tight text-white">
          {socialProof.title}
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {socialProof.items.map((item) => (
          <div
            key={item}
            className="flex min-h-[110px] items-center rounded-2xl border border-white/10 bg-gradient-to-b from-panel to-panel-2/40 p-[22px]"
          >
            <p className="text-[15px] font-medium leading-snug text-soft">{item}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-bg/30 p-[18px] text-center font-mono text-[13px] tracking-wide text-faint">
        {socialProof.strip}
      </div>
    </Container>
  );
}
