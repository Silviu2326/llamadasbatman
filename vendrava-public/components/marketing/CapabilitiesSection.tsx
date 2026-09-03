import type { HomeContent } from "@/types/content";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";

export function CapabilitiesSection({ capabilities }: { capabilities: HomeContent["capabilities"] }) {
  return (
    <Container size="xl" className="py-16 md:py-24">
      <div className="mb-11 text-center">
        <Badge>{capabilities.tag}</Badge>
        <h2 className="mx-auto mt-5 max-w-lg font-display text-[clamp(28px,3.4vw,44px)] font-bold leading-tight tracking-tight text-white">
          {capabilities.title}
        </h2>
      </div>

      <div className="relative mx-auto mb-10 max-w-2xl">
        <div aria-hidden className="absolute -inset-3 rounded-[28px] bg-gradient-to-br from-cyan/12 via-electric/10 to-violet/12 blur-2xl" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/visuals/advisor-oversight.png"
          alt=""
          width={1600}
          height={900}
          className="relative aspect-[16/9] w-full rounded-2xl border border-white/10 object-cover shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85)]"
        />
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        {capabilities.groups.map((group) => (
          <div key={group.name} className="rounded-2xl border border-white/10 bg-gradient-to-b from-panel to-panel-2/40 p-5">
            <div className="mb-3 border-b border-white/10 pb-3 font-mono text-[11px] uppercase tracking-wide text-cyan">
              {group.name}
            </div>
            <div className="flex flex-col gap-2.5">
              {group.items.map((capability) => (
                <div key={capability} className="flex items-start gap-2 text-[13px] leading-tight text-soft">
                  <span className="mt-0.5 flex-none text-cyan">✓</span>
                  {capability}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
