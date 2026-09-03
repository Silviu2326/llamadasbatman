import type { Locale } from "@/types/locale";
import type { PricingPlan } from "@/content/locales/es/pricing";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { pathFor } from "@/lib/routes";

export function PricingSection({ locale, plans }: { locale: Locale; plans: PricingPlan[] }) {
  return (
    <Container size="xl" className="py-6 md:py-10">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-2xl border p-6 ${
              plan.recommended
                ? "border-electric/50 bg-gradient-to-b from-electric/[0.12] to-panel-2/60 shadow-[0_0_40px_rgba(59,130,246,0.18)]"
                : "border-white/10 bg-gradient-to-b from-panel to-panel-2/40"
            }`}
          >
            {plan.recommended && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-br from-electric to-cyan px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-bg">
                {locale === "es" ? "Recomendado" : "Recommended"}
              </span>
            )}
            <div className="font-display text-xl font-bold text-white">{plan.name}</div>
            <div className="mt-3 font-display text-lg font-semibold text-cyan">{plan.price}</div>
            <p className="mt-2 min-h-[52px] text-sm leading-relaxed text-muted">{plan.description}</p>
            <Button href={pathFor("contact", locale)} variant={plan.recommended ? "primary" : "secondary"} className="mt-4 w-full">
              {plan.cta}
            </Button>
            <div className="mt-5 flex flex-col gap-2.5 border-t border-white/10 pt-5">
              {plan.features.map((feature) => (
                <div key={feature} className="flex items-start gap-2 text-[13px] text-soft">
                  <span className="mt-0.5 flex-none text-cyan">✓</span>
                  {feature}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
