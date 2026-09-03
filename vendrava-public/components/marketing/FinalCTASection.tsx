import Link from "next/link";
import type { Locale } from "@/types/locale";
import { Container } from "@/components/ui/Container";
import { pathFor } from "@/lib/routes";

export function FinalCTASection({
  locale,
  title,
  sub,
  primary,
  secondary,
  microcopy,
}: {
  locale: Locale;
  title: string;
  sub: string;
  primary: string;
  secondary: string;
  microcopy?: string;
}) {
  return (
    <Container size="lg" className="py-10 pb-20 md:pb-24">
      <div
        className="relative overflow-hidden rounded-[28px] border border-electric/30 px-8 py-16 text-center"
        style={{ background: "linear-gradient(150deg, rgba(59,130,246,0.16), rgba(139,92,246,0.12))" }}
      >
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: "radial-gradient(600px 300px at 50% 0%, rgba(34,211,238,0.18), transparent)" }}
        />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl font-display text-[clamp(30px,4vw,52px)] font-bold leading-[1.05] tracking-tight text-white">
            {title}
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-soft">{sub}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3.5">
            <Link
              href={pathFor("demo", locale)}
              className="rounded-xl bg-gradient-to-br from-electric to-cyan px-7 py-4 text-base font-bold text-bg shadow-[0_14px_40px_rgba(59,130,246,0.45)] transition-transform hover:-translate-y-0.5"
            >
              {primary}
            </Link>
            <Link
              href={pathFor("contact", locale)}
              className="rounded-xl border border-white/25 px-7 py-4 text-base font-semibold text-white transition-colors hover:bg-white/[0.08]"
            >
              {secondary}
            </Link>
          </div>
          {microcopy && <div className="mt-5 text-sm text-muted">◆ {microcopy}</div>}
        </div>
      </div>
    </Container>
  );
}
