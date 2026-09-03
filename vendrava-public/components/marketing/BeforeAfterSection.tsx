import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";

export function BeforeAfterSection({ beforeAfter }: { beforeAfter: HomeContent["beforeAfter"] }) {
  return (
    <Container size="md" className="py-16 md:py-24">
      <div className="mb-11 text-center">
        <Badge color="neutral">{beforeAfter.tag}</Badge>
        <h2 className="mx-auto mt-5 max-w-lg font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-tight tracking-tight text-white">
          {beforeAfter.title}
        </h2>
      </div>

      <div className="grid gap-[18px] sm:grid-cols-2">
        <div className="rounded-[20px] border border-danger/20 bg-gradient-to-b from-danger/5 to-panel-2/40 p-7">
          <div className="mb-[18px] flex items-center gap-2.5">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-danger/[0.12] text-[15px] text-danger">
              ✕
            </span>
            <span className="font-display text-lg font-semibold text-muted">{beforeAfter.beforeLabel}</span>
          </div>
          <div className="flex flex-col gap-3.5">
            {beforeAfter.before.map((item) => (
              <div key={item} className="flex items-center gap-2.5 text-sm text-muted">
                <span className="flex-none text-danger">✕</span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[20px] border border-cyan/40 bg-gradient-to-b from-cyan/10 to-panel-2/50 p-7 shadow-[0_0_40px_rgba(34,211,238,0.14)]">
          <div className="mb-[18px] flex items-center gap-2.5">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-gradient-to-br from-electric to-cyan">
              <span className="h-2 w-2 rounded-full bg-bg" />
            </span>
            <span className="font-display text-lg font-bold text-white">{beforeAfter.afterLabel}</span>
          </div>
          <div className="flex flex-col gap-3.5">
            {beforeAfter.after.map((item) => (
              <div key={item} className="flex items-center gap-2.5 text-sm font-medium text-white">
                <span className="flex-none text-cyan">✓</span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Container>
  );
}
